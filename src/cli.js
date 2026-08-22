import { collect } from './sources/index.js'
import { collisions, who, isNoise, WINDOW_MIN } from './collide.js'
import { byProject, gitRoot, projectName } from './project.js'
import { toon, table, ago, short, trunc } from './format.js'
import { hookLine } from './hook.js'
import { isAbsolute, join } from 'node:path'
import { install } from './install.js'
import { listThemes, setTheme, setOpaque, setTransparent } from './theme.js'

const HELP = `skein — every agent running across every repository, grouped by project.

  skein                     projects with agents active now
  skein ls                  one line per project
  skein who [path]          who else is in this repo, or in one file
  skein collisions          recent same-file overlaps
  skein hook                print the ambient line and exit
  skein themes              list the btop themes it can find
  skein install             wire the hook into your agents

  --json                   machine-readable
  --toon                   token-efficient, for agents
  --since <30d|24h|90m>    lookback window            (default 30d)
  --window <minutes>       collision window           (default ${WINDOW_MIN})
  --theme <name|path>      any btop .theme file — skein themes lists them
  --opaque [#rrggbb]       background colour (default: black)
  --transparent            inherit the terminal background instead
  --all                    every project, not just the active ones
  --help                   this

skein reports. It never starts, stops, routes or blocks anything.`

const DURATION = /^(\d+)([mhd])$/
const parseSince = s => {
  const m = DURATION.exec(s ?? '')
  if (!m) return null
  const n = Number(m[1])
  return n * ({ m: 60_000, h: 3_600_000, d: 86_400_000 })[m[2]]
}

export function parseArgs(argv) {
  const opts = { json: false, toon: false, all: false, since: 30 * 86_400_000, window: WINDOW_MIN, _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--toon') opts.toon = true
    else if (a === '--all') opts.all = true
    else if (a === '--transparent') opts.transparent = true
    else if (a === '--opaque') {
      // Optional value: bare --opaque means black.
      const next = argv[i + 1]
      opts.opaque = next && !next.startsWith('-') ? argv[++i] : '#000000'
    }
    else if (a === '--theme') {
      opts.theme = argv[++i]
      if (!opts.theme) return { error: `--theme expects a theme name or a path to a .theme file` }
    }
    else if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--since') {
      const v = parseSince(argv[++i])
      if (v === null) return { error: `--since expects a duration like 24h, 30d or 90m` }
      opts.since = v
    } else if (a === '--window') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) return { error: `--window expects a number of minutes` }
      opts.window = n
    } else if (a.startsWith('-')) return { error: `unknown option ${a}` }
    else opts._.push(a)
  }
  return opts
}

const out = (opts, name, rows, fields, human, emptyMsg) => {
  if (opts.json) return JSON.stringify(rows, null, 2)
  if (opts.toon) return toon(name, rows, fields)
  return rows.length ? human() : emptyMsg
}

export function run(argv, { cwd = process.cwd(), now = Date.now(), tty = false } = {}) {
  const opts = parseArgs(argv)
  if (opts.error) return { code: 1, err: `skein: ${opts.error}\ntry: skein --help` }
  if (opts.help) return { code: 0, text: HELP }

  // A TUI when a human is looking, text when anything else is (PRD D9, AXI 6).
  // The CLI must never render escape codes into a pipe.
  const cmd = opts._[0] ?? (tty && !opts.json && !opts.toon ? 'tui' : 'rollup')
  const since = now - opts.since

  // A theme is a rendering choice, so it is applied before anything draws.
  const wanted = opts.theme ?? process.env.SKEIN_THEME
  if (wanted && !setTheme(wanted).name) {
    return { code: 1, err: `skein: no theme called "${wanted}"\ntry: skein themes` }
  }
  // After the theme, so it overrides a palette's own main_bg on request.
  if (opts.transparent || process.env.SKEIN_TRANSPARENT) setTransparent()
  const opaque = opts.opaque ?? process.env.SKEIN_OPAQUE
  if (opaque && !setOpaque(opaque === '1' || opaque === 'true' ? '#000000' : opaque)) {
    return { code: 1, err: `skein: --opaque expects a colour like #000000` }
  }

  if (cmd === 'themes') {
    const rows = listThemes().map(t => ({ theme: t.name, file: t.path.replace(process.env.HOME ?? '\u0000', '~') }))
    return {
      code: 0,
      text: out(opts, 'themes', rows, ['theme', 'file'],
        () => table(rows, [{ head: 'THEME', key: 'theme' }, { head: 'FILE', key: 'file' }]) +
              `\n\n${rows.length} themes · skein --theme <name> · btop's own files, read as-is`,
        `no btop themes found (0 themes) · install btop, or pass a path to a .theme file`),
    }
  }

  if (cmd === 'install') return install(opts._.slice(1))
  if (cmd === 'tui') return { code: 0, tui: true }
  if (cmd === 'hook') {
    const line = hookLine({ cwd, session: process.env.SKEIN_SESSION ?? null, now })
    return { code: 0, text: line ?? '' }          // silence when alone (Q7)
  }

  const { events, sessions } = collect({ sinceMs: since })
  // D13 — the same filter the TUI applies, or the two doors report different
  // numbers for the same question and one of them is lying.
  const recent = events.filter(e => e.at >= since && !isNoise(e.path))
  const root = gitRoot(`${cwd}/.`)

  if (cmd === 'rollup' || cmd === 'ls') {
    const projects = [...byProject(recent).values()]
      .filter(p => opts.all || cmd === 'ls' || p.last >= now - 6 * 3_600_000)
      .sort((a, b) => b.last - a.last)
    const cols = projects.map(p => ({
      project: p.name,
      agents: p.agents.join('+'),
      sessions: p.sessions,
      files: p.files,
      edits: p.events.length,
      last: ago(p.last, now),
    }))
    const cs = collisions(recent, sessions, { windowMin: opts.window, since })
    const text = out(opts, 'projects', cols, ['project', 'agents', 'sessions', 'files', 'edits', 'last'],
      () => table(cols, [
        { head: 'PROJECT', key: 'project' }, { head: 'AGENTS', key: 'agents' },
        { head: 'SESSIONS', key: 'sessions', right: true }, { head: 'FILES', key: 'files', right: true },
        { head: 'EDITS', key: 'edits', right: true }, { head: 'LAST', key: 'last', right: true },
      ]) + `\n\n${cs.length} collision${cs.length === 1 ? '' : 's'} in the window · skein collisions`,
      `no agent activity in the last ${argvSince(opts)} (0 projects)`)
    return { code: 0, text }
  }

  if (cmd === 'who') {
    const path = opts._[1] ? (isAbsolute(opts._[1]) ? opts._[1] : join(cwd, opts._[1])) : null
    const rows = who(recent, sessions, { root, path, activeMin: opts.window, self: process.env.SKEIN_SESSION ?? null, now })
      .map(o => ({ agent: o.agent, kind: o.kind, file: short(o.path, root), branch: o.branch ?? '', title: trunc(o.title, 40) ?? '', ago: ago(o.at, now) }))
    return {
      code: 0,
      text: out(opts, 'agents', rows, ['agent', 'kind', 'file', 'branch', 'title', 'ago'],
        () => table(rows, [
          { head: 'AGENT', key: 'agent' }, { head: 'DID', key: 'kind' }, { head: 'FILE', key: 'file' },
          { head: 'BRANCH', key: 'branch' }, { head: 'AGO', key: 'ago', right: true },
        ]),
        root
          ? `no other agents active in ${projectName(root)} in the last ${opts.window}m (0 agents)`
          : `no other agents active here in the last ${opts.window}m (0 agents)`),
    }
  }

  if (cmd === 'collisions') {
    const rows = collisions(recent, sessions, { windowMin: opts.window, since })
      .filter(c => opts.all || !root || c.project === root)
      .map(c => ({
        project: projectName(c.project), file: trunc(short(c.path, c.project), 56),
        agents: `${c.a.agent}/${c.b.agent}`, gap: `${c.gapMin}m`, ago: ago(c.at, now),
      }))
    return {
      code: 0,
      text: out(opts, 'collisions', rows, ['project', 'file', 'agents', 'gap', 'ago'],
        () => table(rows, [
          { head: 'PROJECT', key: 'project' }, { head: 'FILE', key: 'file' },
          { head: 'AGENTS', key: 'agents' }, { head: 'GAP', key: 'gap', right: true },
          { head: 'AGO', key: 'ago', right: true },
        ]),
        (() => {
          // A zero on its own reads as a broken tool. A zero beside a wider
          // window reads as good news, and tells you what normal looks like.
          const wide = collisions(events, sessions, { windowMin: opts.window, since: now - 30 * 86_400_000 })
          const here = root && !opts.all ? ` in ${projectName(root)}` : ''
          const context = wide.length
            ? ` · ${wide.length} across all projects in 30d`
            : ' · none anywhere in 30d either'
          return `no collisions${here} in the last ${argvSince(opts)} (0 collisions)${context}` +
                 (root && !opts.all ? ' · --all for every project' : '')
        })()),
    }
  }

  return { code: 1, err: `skein: unknown command "${cmd}"\ntry: skein --help` }
}

const argvSince = opts => {
  const d = opts.since
  if (d % 86_400_000 === 0) return `${d / 86_400_000}d`
  if (d % 3_600_000 === 0) return `${d / 3_600_000}h`
  return `${Math.round(d / 60_000)}m`
}
