// The human door (design language §3.1).
//
// btop tiles fixed boxes for fixed metrics on one machine. skein's primary
// object is a PROJECT, and projects are a variable-length list with sessions
// nested under them -- so we take btop's border grammar and its graph tables,
// and leave its box-grid layout behind.
import { collect } from './sources/index.js'
import { collisions, who, isNoise, WINDOW_MIN } from './collide.js'
import { byProject, gitRoot } from './project.js'
import { graph, tierFor } from './symbols.js'
import { LUT, hue, R, DIM, BOLD, REV, SUP } from './theme.js'
import { box, fit, width } from './box.js'
import { ago, short, trunc } from './format.js'

const ALT = '\x1b[?1049h', UNALT = '\x1b[?1049l'
const HIDE = '\x1b[?25l', SHOW = '\x1b[?25h'
const CLEAR = '\x1b[H\x1b[2J'

// Bucket events into `n` slots across the lookback, normalised 0..1.
function series(events, n, since, now) {
  const buckets = new Array(n).fill(0)
  const span = Math.max(1, now - since)
  for (const e of events) {
    if (e.at < since) continue
    const i = Math.min(n - 1, Math.floor(((e.at - since) / span) * n))
    buckets[i]++
  }
  const max = Math.max(1, ...buckets)
  // Square-root scaling, and a floor under every non-empty bucket.
  //
  // Linear normalisation against the peak is what made these graphs look like
  // scattered dust: one edit beside a burst of fifty is 0.02, which rounds to
  // level 0 and draws nothing. Every hour except the busiest rendered blank.
  // btop's graphs look full because CPU always has a value; ours are sparse
  // counts, so the scale has to do the work instead.
  return buckets.map(v => (v === 0 ? 0 : Math.max(FLOOR, Math.sqrt(v / max))))
}

// One quarter = one braille level at rows=1, so any activity at all is visible.
const FLOOR = 0.25

export function render(state, size) {
  const { projects, cols, sel, expanded, colls, tier, since, now, lookback } = state
  const w = Math.max(50, size.cols), h = Math.max(12, size.rows)
  const out = []

  const detailH = Math.min(10, Math.max(6, Math.floor(h * 0.35)))
  const listH = h - detailH - 1

  // Columns are chosen to fit, not assumed. btop tiles fixed boxes because it
  // knows its own metrics; a project list does not know how wide a name is or
  // how narrow a terminal will be. Drop the least valuable column first, and
  // give whatever is left to the name.
  const plan = (() => {
    const optional = [
      ['agents', 16], ['edits', 6], ['activity', 10], ['files', 6], ['sessions', 5],
    ]
    let budget = w - 2 - 1 - 6 - 12            // borders, lead, LAST, minimum name
    const on = new Set()
    for (const [key, need] of optional) {
      if (budget >= need + 1) { on.add(key); budget -= need + 1 }
    }
    const gw = on.has('activity') ? Math.max(8, Math.min(28, 10 + budget)) : 0
    if (on.has('activity')) budget -= gw - 10
    return { on, gw, name: 12 + Math.max(0, budget) }
  })()
  const gw = plan.gw

  // ---- projects (the primary object) -------------------------------------
  // A dashboard that never moves is indistinguishable from a frozen one. The
  // pulse advances every refresh, so an idle machine still shows a live tool.
  const pulse = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[(state.tick ?? 0) % 10]
  const b = box({
    w, title: 'skein', key: SUP[0],
    state: `${projects.length} project${projects.length === 1 ? '' : 's'} · ${colls.length} collision${colls.length === 1 ? '' : 's'} · ${lookback} ${DIM}${pulse}${R}`,
  })
  out.push(b.top)
  const cells = (name, agents, sessions, files, edits, activity, last) => {
    const s = [' ', fit(name, plan.name)]
    if (plan.on.has('agents')) s.push(' ', fit(agents, 16))
    if (plan.on.has('sessions')) s.push(' ', fit(sessions, 5))
    if (plan.on.has('files')) s.push(' ', fit(files, 6))
    if (plan.on.has('edits')) s.push(' ', fit(edits, 6))
    if (plan.on.has('activity')) s.push(' ', activity)
    s.push(' ', fit(last, 5))
    return s.join('')
  }
  out.push(b.row(`${DIM}${cells('PROJECT', 'AGENTS', ' SESS', ' FILES', ' EDITS', fit(`ACTIVITY (${lookback})`, gw), ' LAST')}${R}`))

  const view = projects.slice(Math.max(0, sel - (listH - 3)), Math.max(listH - 2, sel + 1))
  const offset = projects.indexOf(view[0] ?? projects[0])
  for (let i = 0; i < view.length && i < listH - 2; i++) {
    const p = view[i]
    const idx = offset + i
    const on = idx === sel
    const spark = graph(series(p.events, gw * 2, since, now), { width: gw, rows: 1, tier, lut: LUT.activity })[0]
    const agents = p.agents.map(a => `${hue(a)}${a}${R}`).join(`${DIM}+${R}`)
    const line = cells(p.name, agents, String(p.sessions).padStart(5), String(p.files).padStart(6),
      String(p.events.length).padStart(6), `${spark}${R}`, ago(p.last, now).padStart(5))
    // Selection reverses fg/bg on a plain line. Interleaving REV with 24-bit
    // colour leaves gaps wherever a reset lands, so the row drops its hues for
    // the one frame it is selected -- readable on any theme by definition.
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
    out.push(b.row(on ? `${REV}${plain}${' '.repeat(Math.max(0, w - 2 - width(plain)))}${R}` : line))
  }
  for (let i = view.length; i < listH - 2; i++) out.push(b.row(''))
  out.push(b.bottom)

  // ---- detail: sessions under the selected project ------------------------
  const p = projects[sel]
  const d = box({
    w,
    title: p ? p.name : 'no project',
    key: SUP[1],
    state: `${DIM}↑↓${R}${DIM} move · ${R}${DIM}a${R}${DIM} all · ${R}${DIM}w${R}${DIM} window ${state.windowMin}m · ${R}${DIM}q${R}${DIM} quit${R}`,
  })
  out.push(d.top)
  if (p) {
    const sessions = [...new Map(p.events.map(e => [e.session, e])).values()]
      .map(e => ({ ...e, meta: state.sessions.get(e.session), events: p.events.filter(x => x.session === e.session) }))
      .sort((a, b2) => b2.at - a.at)
      .slice(0, Math.max(1, detailH - 4 - (colls.some(c => c.project === p.root) ? 2 : 0)))

    // R7 -- mirrored pairs. The first agent's series hangs above the baseline,
    // the second below, so two series share a row without fighting for colour.
    sessions.forEach((s, i) => {
      const mirrored = i % 2 === 1
      const g = graph(series(s.events, gw * 2, since, now), { width: gw, rows: 1, tier, down: mirrored, lut: LUT.heat })[0]
      const title = trunc(s.meta?.title, 30) ?? `${DIM}—${R}`
      const branch = s.meta?.branch ?? `${DIM}—${R}`
      const tw = Math.max(0, w - 2 - 1 - 9 - 1 - 16 - 1 - gw - 1 - 5 - 1)
      out.push(d.row(` ${hue(s.agent)}${fit(s.agent, 9)}${R} ${fit(branch, 16)} ${fit(title, tw)} ${g}${R} ${ago(s.at, now).padStart(5)}`))
    })
    const mine = colls.filter(c => c.project === p.root)
    // Only claim a COLLISIONS section if a row will actually fit under it. A
    // bare header with nothing beneath reads as "none found", which is the
    // opposite of what it means.
    const roomForCollisions = Math.max(0, detailH - 4 - sessions.length)
    if (mine.length && roomForCollisions > 0) {
      out.push(d.row(` ${DIM}${fit('COLLISIONS', 12)}${R}`))
      for (const c of mine.slice(0, roomForCollisions)) {
        const fw = Math.max(10, w - 2 - 3 - 24 - 26)
        out.push(d.row(` ${DIM}·${R} ${fit(short(c.path, c.project), fw)} ${fit(`${hue(c.a.agent)}${c.a.agent}${R}${DIM}/${R}${hue(c.b.agent)}${c.b.agent}${R}`, 22)} ${DIM}${fit(`${c.gapMin}m apart, ${ago(c.at, now)} ago`, 24)}${R}`))
      }
    }
  }
  while (out.length < h - 1) out.push(d.row(''))
  out.push(d.bottom)
  return out.slice(0, h).join('\n')
}

function build(windowMin, lookbackMs, now) {
  const since = now - lookbackMs
  const { events, sessions } = collect({ sinceMs: since })
  const recent = events.filter(e => e.at >= since && !isNoise(e.path))
  const projects = [...byProject(recent).values()].sort((a, b) => b.last - a.last)
  const colls = collisions(recent, sessions, { windowMin, since })
  return { events: recent, sessions, projects, colls, since }
}

export function start({ now = () => Date.now(), stdout = process.stdout, stdin = process.stdin } = {}) {
  const LOOKBACKS = [[6 * 3_600_000, '6h'], [24 * 3_600_000, '24h'], [7 * 86_400_000, '7d'], [30 * 86_400_000, '30d']]
  let lb = 1, windowMin = WINDOW_MIN, sel = 0, tick = 0
  const tier = tierFor()
  let state = null

  const reload = () => {
    const t = now()
    const built = build(windowMin, LOOKBACKS[lb][0], t)
    state = { ...built, sel, expanded: new Set(), tier, now: t, lookback: LOOKBACKS[lb][1], windowMin, tick }
    if (sel >= state.projects.length) sel = Math.max(0, state.projects.length - 1)
    state.sel = sel
  }

  const draw = () => {
    state.sel = sel
    state.now = now()
    state.tick = tick
    stdout.write(CLEAR + render(state, { cols: stdout.columns || 100, rows: stdout.rows || 30 }))
  }

  const quit = () => {
    clearInterval(timer)
    stdout.write(SHOW + UNALT)
    if (stdin.isTTY) stdin.setRawMode(false)
    stdin.pause()
    process.exit(0)
  }

  stdout.write(ALT + HIDE)
  if (stdin.isTTY) stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  reload(); draw()

  // btop redraws on a timer; so does this. Without it the screen is a
  // photograph -- an agent starts working in another repo and nothing moves
  // until you happen to press a key. A warm re-read is ~20 ms, so the cost of
  // being live is negligible.
  const REFRESH_MS = 2000
  const timer = setInterval(() => { tick++; reload(); draw() }, REFRESH_MS)
  timer.unref?.()

  stdout.on('resize', draw)
  stdin.on('data', k => {
    if (k === 'q' || k === '\x1b' || k === '\x03') return quit()
    else if (k === '\x1b[B' || k === 'j') sel = Math.min(state.projects.length - 1, sel + 1)
    else if (k === '\x1b[A' || k === 'k') sel = Math.max(0, sel - 1)
    else if (k === 'a') { lb = (lb + 1) % LOOKBACKS.length; reload() }
    else if (k === 'w') { windowMin = windowMin === 30 ? 60 : windowMin === 60 ? 10 : 30; reload() }
    else if (k === 'r') reload()
    else if (k === 'g') sel = 0
    else if (k === 'G') sel = state.projects.length - 1
    draw()
  })
  process.on('SIGINT', quit)
}
