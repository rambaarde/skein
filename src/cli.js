import { collect, probe, diagnose } from './sources/index.js'
import { collisions, who, isNoise, WINDOW_MIN } from './collide.js'
import { byProject, gitRoot, projectName } from './project.js'
import { toon, table, ago, short, trunc } from './format.js'
import { hookLine } from './hook.js'
import { isAbsolute, join } from 'node:path'
import { envVar } from './paths.js'
import { install } from './install.js'
import { listThemes, setTheme, setOpaque, setTransparent } from './theme.js'
import { velocity } from './delivery.js'
import { toolsOf, totalOf, classify } from './tools.js'
import { attentionOf, humanMs } from './attention.js'
import { GLOSSARY } from './glossary.js'

const HELP = `skeins — every agent running across every repository, grouped by project.

  skeins                     projects with agents active now
  skeins ls                  one line per project
  skeins who [path]          who else is in this repo, or in one file
  skeins collisions          recent same-file overlaps
  skeins velocity            what landed, how long it took, what failed
  skeins tools               which tools the agents actually called
  skeins glossary            what every number on these screens counts
  skeins doctor              why is my screen empty
  skeins hook                print the ambient line and exit
  skeins themes              list the btop themes it can find
  skeins install             wire the hook into your agents

  --json                   machine-readable
  --toon                   token-efficient, for agents
  --since <30d|24h|90m>    lookback window            (default 30d)
  --window <minutes>       collision window           (default ${WINDOW_MIN})
  --theme <name|path>      any btop .theme file — skeins themes lists them
  --opaque [#rrggbb]       background colour (default: black)
  --transparent            inherit the terminal background instead
  --all                    every project, not just the active ones
  --help                   this

skeins reports. It never starts, stops, routes or blocks anything.`

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
  if (opts.error) return { code: 1, err: `skeins: ${opts.error}\ntry: skeins --help` }
  if (opts.help) return { code: 0, text: HELP }

  // A TUI when a human is looking, text when anything else is (PRD D9, AXI 6).
  // The CLI must never render escape codes into a pipe.
  const cmd = opts._[0] ?? (tty && !opts.json && !opts.toon ? 'tui' : 'rollup')
  const since = now - opts.since

  // A theme is a rendering choice, so it is applied before anything draws.
  const wanted = opts.theme ?? envVar('THEME')
  if (wanted && !setTheme(wanted).name) {
    return { code: 1, err: `skeins: no theme called "${wanted}"\ntry: skeins themes` }
  }
  // After the theme, so it overrides a palette's own main_bg on request.
  if (opts.transparent || envVar('TRANSPARENT')) setTransparent()
  const opaque = opts.opaque ?? envVar('OPAQUE')
  if (opaque && !setOpaque(opaque === '1' || opaque === 'true' ? '#000000' : opaque)) {
    return { code: 1, err: `skeins: --opaque expects a colour like #000000` }
  }

  if (cmd === 'themes') {
    const rows = listThemes().map(t => ({ theme: t.name, file: t.path.replace(process.env.HOME ?? '\u0000', '~') }))
    return {
      code: 0,
      text: out(opts, 'themes', rows, ['theme', 'file'],
        () => table(rows, [{ head: 'THEME', key: 'theme' }, { head: 'FILE', key: 'file' }]) +
              `\n\n${rows.length} themes · skeins --theme <name> · btop's own files, read as-is`,
        `no btop themes found (0 themes) · install btop, or pass a path to a .theme file`),
    }
  }

  // D13: a definition that lives only in the TUI is a definition the person
  // piping skeins never sees, and the agent reading it never sees at all. One
  // array, three doors -- so they cannot drift into disagreeing.
  if (cmd === 'glossary') {
    const rows = GLOSSARY.filter(([term]) => term).map(([term, means]) => ({ term, means }))
    return {
      code: 0,
      text: out(opts, 'glossary', rows, ['term', 'means'],
        () => GLOSSARY.map(([term, means]) => `${term.padEnd(13)}  ${means}`).join('\n\n'),
        'no glossary'),
    }
  }

  if (cmd === 'install') return install(opts._.slice(1))
  if (cmd === 'tui') return { code: 0, tui: true }
  if (cmd === 'hook') {
    const line = hookLine({ cwd, session: envVar('SESSION') ?? null, now })
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
      ]) + `\n\n${cs.length} collision${cs.length === 1 ? '' : 's'} in the window · skeins collisions`,
      // The same three answers the TUI gives. D13 again: an empty state is a
      // metric too, and "nothing here" without saying where it looked is the
      // ambiguous blank AXI 5 exists to forbid.
      (() => {
        const stores = probe({ now })
        const any = stores.filter(s => s.found && s.files)
        const where = stores.map(s => `  ${s.agent.padEnd(9)} ${s.dir}  ${
          !s.found ? 'not found' : !s.files ? 'empty' : `${s.files} files, newest ${ago(s.newest, now)} ago`}`).join('\n')
        const head = !any.length
          ? 'no agent sessions found (0 projects)'
          : any.some(s => s.newest >= since)
            ? 'sessions were written in this window, but none touched a project (0 projects)'
            : `no agent activity in the last ${argvSince(opts)} (0 projects)`
        return `${head}\n\nskeins reads:\n${where}\n\nXDG_DATA_HOME is honoured; set it and opencode moves with it.`
      })())
    return { code: 0, text }
  }

  if (cmd === 'who') {
    const path = opts._[1] ? (isAbsolute(opts._[1]) ? opts._[1] : join(cwd, opts._[1])) : null
    const rows = who(recent, sessions, { root, path, activeMin: opts.window, self: envVar('SESSION') ?? null, now })
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

  // Why is my screen empty.
  //
  // The empty state answers that for the common cases. This answers it for the
  // rest: it opens the newest sessions each store holds and reports what was
  // in them -- how many records, what KINDS, whether a cwd resolved, and how
  // many edits came out. Several rounds were spent guessing at a user's empty
  // screen from photographs; one command should have settled it.
  if (cmd === 'doctor') {
    const rows = diagnose({ now, sinceMs: since, sample: opts.all ? 20 : 4 }).map(d => ({
      agent: d.agent,
      store: d.dir,
      found: d.found,
      files: d.found ? d.files : null,
      in_window: d.found ? d.inWindow : null,
      records: d.found ? d.records : null,
      edits: d.found ? d.events : null,
      cwd_resolved: d.found && d.inWindow ? d.cwd !== null : null,
      // The histogram is what catches an agent renaming the record skeins
      // reads: it turns an empty dashboard into a type nobody recognises.
      records_seen: d.types.map(t => `${t.type}×${t.n}`).join(' '),
    }))
    const FIELDS = ['agent', 'store', 'found', 'files', 'in_window', 'records', 'edits', 'cwd_resolved', 'records_seen']
    const total = rows.reduce((n, r) => n + (r.edits ?? 0), 0)
    return {
      code: 0,
      text: out(opts, 'stores', rows, FIELDS,
        () => rows.map(r => {
          const head = `${r.agent.padEnd(9)} ${r.store}`
          if (!r.found) return `${head}\n  not found`
          const line = `  ${r.files} files · ${r.in_window} in the last ${argvSince(opts)} · ${r.records} records read · ` +
            `${r.edits} edit${r.edits === 1 ? '' : 's'}${r.in_window ? ` · cwd ${r.cwd_resolved ? 'resolved' : 'NOT resolved'}` : ''}`
          return `${head}\n${line}${r.records_seen ? `\n  saw: ${r.records_seen}` : ''}`
        }).join('\n\n') +
        `\n\n${total} edit${total === 1 ? '' : 's'} in the last ${argvSince(opts)}` +
        (total ? '' : '\n\nskeins counts files WRITTEN. Reading, searching and running commands are not edits.') +
        '\nA record type skeins does not recognise means the agent changed its format — please report it.',
        'no agent stores found at all'),
    }
  }

  // What the agents called, not only what they wrote. Same door rule.
  if (cmd === 'tools') {
    const projects = [...byProject(recent).values()]
      .filter(p => opts.all || !root || p.root === root)
      .sort((a, b) => b.last - a.last)
    const rows = []
    for (const p of projects) {
      const t = toolsOf(p, sessions)
      const n = totalOf(t)
      for (const { tool, n: calls } of t.slice(0, opts.all ? t.length : 12)) {
        rows.push({
          project: p.name, tool, calls,
          share: `${Math.round((calls / Math.max(1, n)) * 100)}%`,
          kind: classify(tool),
        })
      }
      // A project that recorded none says so, rather than vanishing from a
      // list it belongs on (AXI 5).
      if (!t.length) rows.push({ project: p.name, tool: null, calls: null, share: null, kind: null })
    }
    return {
      code: 0,
      text: out(opts, 'tools', rows, ['project', 'tool', 'calls', 'share', 'kind'],
        () => table(rows.map(r => ({ ...r, tool: r.tool ?? '—', calls: r.calls ?? '—', share: r.share ?? '—', kind: r.kind ?? '—' })), [
          { head: 'PROJECT', key: 'project' }, { head: 'TOOL', key: 'tool' },
          { head: 'CALLS', key: 'calls', right: true }, { head: 'SHARE', key: 'share', right: true },
          { head: 'KIND', key: 'kind' },
        ]) + '\n\ncounted from the agents\' own transcripts · a null tool means the project recorded none',
        `no tool calls recorded in the last ${argvSince(opts)} (0 projects)`),
    }
  }

  // Thesis §7 D13: no metric may exist in only one door. Anything the chart
  // shows, the CLI answers, and the reverse — otherwise one door becomes
  // second-class, which is the failure that makes most TUIs unscriptable.
  if (cmd === 'velocity') {
    const projects = [...byProject(recent).values()]
      .filter(p => opts.all || !root || p.root === root)
      .sort((a, b) => b.last - a.last)
    const rows = projects.map(p => {
      const v = velocity(p.root, p.events, { since, now, attention: attentionOf(p.events) })
      return {
        project: p.name,
        // An absent number is an explicit null, never an omitted key or a
        // zero standing in for one (AXI 5, thesis R2). "No git history here"
        // and "you landed nothing" are different statements.
        landed: v ? v.landed : null,
        per_day: v ? Number(v.perDay.toFixed(2)) : null,
        per_week: v ? Number(v.perWeek.toFixed(1)) : null,
        lead: v && v.lead !== null ? humanMs(v.lead) : null,
        per_ship: v && v.perShip !== null ? humanMs(v.perShip) : null,
        cfr: v && v.cfr !== null ? `${Math.round(v.cfr * 100)}%` : null,
        deployments: v?.cfrOf ? v.cfrOf.deployments : null,
        judged: v?.cfrOf ? v.cfrOf.judged : null,
        attention: humanMs(attentionOf(p.events)),
      }
    })
    const FIELDS = ['project', 'landed', 'per_day', 'per_week', 'lead', 'per_ship', 'cfr', 'judged', 'deployments', 'attention']
    return {
      code: 0,
      text: out(opts, 'velocity', rows, FIELDS,
        () => table(rows.map(r => Object.fromEntries(FIELDS.map(k => [k, r[k] ?? '—']))), [
          { head: 'PROJECT', key: 'project' }, { head: 'LANDED', key: 'landed', right: true },
          { head: '/DAY', key: 'per_day', right: true }, { head: '/WEEK', key: 'per_week', right: true }, { head: 'LEAD', key: 'lead', right: true },
          { head: 'ATTN/SHIP', key: 'per_ship', right: true }, { head: 'CFR', key: 'cfr', right: true },
          { head: 'JUDGED', key: 'judged', right: true }, { head: 'DEPLOYS', key: 'deployments', right: true },
          { head: 'ATTENTION', key: 'attention', right: true },
        ]) + '\n\nlanded = trunk commits, releases excluded · lead = first edit after the previous landing' +
             '\ncfr = deployments followed by a hotfix to what they shipped; needs two deployments to mean anything' +
             '\nmean-time-to-restore needs incident data and is not shown',
        `no projects with git history in the last ${argvSince(opts)} (0 projects)`),
    }
  }
  return { code: 1, err: `skeins: unknown command "${cmd}"\ntry: skeins --help` }
}

const argvSince = opts => {
  const d = opts.since
  if (d % 86_400_000 === 0) return `${d / 86_400_000}d`
  if (d % 3_600_000 === 0) return `${d / 3_600_000}h`
  return `${Math.round(d / 60_000)}m`
}
