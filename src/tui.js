// The human door (design language §3.1).
//
// btop tiles fixed boxes for fixed metrics on one machine. skein's primary
// object is a PROJECT, and projects are a variable-length list with sessions
// nested under them -- so we take btop's border grammar and its graph tables,
// and leave its box-grid layout behind.
import { collect } from './sources/index.js'
import { collisions, who, isNoise, WINDOW_MIN } from './collide.js'
import { byProject, gitRoot, projectName } from './project.js'
import { graph, tierFor } from './symbols.js'
import { LUT, hue, R, DIM, BOLD, REV, SUP, THEME } from './theme.js'
import { box, tag, fit, width } from './box.js'
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

// btop cycles its sort with a key and names the current one in the border.
// Same here: the column you are sorted by is stated, not guessed at.
export const SORTS = [
  { key: 'last', label: 'recent', cmp: (a, b) => b.last - a.last },
  { key: 'edits', label: 'edits', cmp: (a, b) => b.events.length - a.events.length },
  { key: 'files', label: 'files', cmp: (a, b) => b.files - a.files },
  { key: 'sessions', label: 'sessions', cmp: (a, b) => b.sessions - a.sessions },
  { key: 'name', label: 'name', cmp: (a, b) => a.name.localeCompare(b.name) },
]

// btop draws proportions as a filled bar, not a bare number: ■■■■■■□□□□. It is
// the fastest way to see which project is eating the week without reading any
// digits at all.
const meter = (frac, width, lut) => {
  const filled = Math.round(Math.max(0, Math.min(1, frac)) * width)
  const colour = lut ? lut[Math.round(Math.max(0, Math.min(1, frac)) * 100)] : ''
  return `${colour}${'■'.repeat(filled)}${DIM}${'·'.repeat(Math.max(0, width - filled))}${R}`
}

const KEYS = [
  ['↑ ↓  j k', 'move between projects'],
  ['⏎  space', 'expand a project into its sessions'],
  ['s', 'cycle the sort: recent · edits · files · sessions · name'],
  ['/', 'filter projects by name — esc clears it'],
  ['a', 'cycle the window: 6h · 24h · 7d · 30d'],
  ['w', 'cycle the collision window: 30m · 60m · 10m'],
  ['c', 'show only projects that had a collision'],
  ['g  G', 'first project · last project'],
  ['r', 'refresh now'],
  ['?  h', 'this'],
  ['q  esc', 'quit'],
]

function helpOverlay(w, h) {
  const b = box({ w, title: 'keys', key: SUP[8], state: `${DIM}any key returns${R}` })
  const out = [b.top, b.row('')]
  for (const [k, what] of KEYS) out.push(b.row(`  ${BOLD}${fit(k, 10)}${R}  ${DIM}${what}${R}`))
  out.push(b.row(''))
  out.push(b.row(`  ${DIM}skein reports. It never starts, stops, routes or blocks anything.${R}`))
  while (out.length < h - 1) out.push(b.row(''))
  out.push(b.bottom)
  return out.slice(0, h).join('\n')
}

export function render(state, size) {
  const { cols, sel, expanded, colls, tier, since, now, lookback } = state
  const projects = state.projects
  const w = Math.max(50, size.cols), h = Math.max(12, size.rows)
  const out = []

  if (state.help) return helpOverlay(w, h)

  // Boxes are sized to what is in them. The old split gave the list a fixed
  // 65% of the screen whether it held three projects or thirty, so a normal
  // machine showed seven rows and thirteen blank ones — and a mostly-empty
  // screen reads as frozen no matter how fast the clock ticks.
  const expandedRows = projects.reduce(
    (a, p) => a + (expanded.has(p.root ?? 'loose') ? Math.min(4, p.sessions) : 0), 0)
  const listRows = Math.max(1, projects.length + expandedRows)
  const listH = Math.min(Math.max(4, listRows + 2), Math.floor(h * 0.6))

  const p0 = projects[sel]
  const collsHere = p0 ? colls.filter(c => c.project === p0.root) : []
  const detailRows = p0 ? Math.min(4, p0.sessions) + (collsHere.length ? Math.min(3, collsHere.length) + 1 : 0) : 1
  const detailH = Math.min(Math.max(3, detailRows + 2), h - listH - 5)

  // Whatever is left goes to a live feed of edits as they land. This is the
  // part that actually moves: the project table changes once a minute at best,
  // and a 24h sparkline shifts one cell every fifty-one minutes.
  const feedH = h - listH - detailH

  // Columns are chosen to fit, not assumed. btop tiles fixed boxes because it
  // knows its own metrics; a project list does not know how wide a name is or
  // how narrow a terminal will be. Drop the least valuable column first, and
  // give whatever is left to the name.
  const plan = (() => {
    // The name column is sized to the longest NAME, not to whatever is left
    // over. Giving it the slack put nine characters of nothing in every row and
    // starved the graph — btop never leaves a gap it could put data in.
    const longest = projects.reduce((m, p) => Math.max(m, p.name.length + 2), 8)
    const name = Math.max(10, Math.min(28, longest))
    const optional = [
      ['agents', 16], ['edits', 6], ['share', 8], ['collisions', 5], ['files', 6], ['sessions', 5],
    ]
    let budget = w - 2 - 1 - 6 - name          // borders, lead, LAST, name
    const on = new Set()
    for (const [key, need] of optional) {
      if (budget >= need + 1 + 10) { on.add(key); budget -= need + 1 }   // keep 10 for the graph
    }
    // Every character the columns did not need goes to the timeline, because
    // that is the one thing that gets better with width: more cells is a finer
    // bucket, and a finer bucket is one that visibly moves.
    const gw = Math.max(0, budget - 2)   // the leading space and LAST's own gap
    return { on, gw, name }
  })()
  const gw = plan.gw

  // ---- projects (the primary object) -------------------------------------
  // A dashboard that never moves is indistinguishable from a frozen one. The
  // pulse advances every refresh, so an idle machine still shows a live tool.
  const pulse = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[(state.tick ?? 0) % 10]
  const clock = new Date(now).toTimeString().slice(0, 8)
  const b = box({
    w, title: 'skein', key: SUP[0],
    right: `${clock} ${DIM}${pulse}${R}`,
    state: [
      `${projects.length} project${projects.length === 1 ? '' : 's'}`,
      `${colls.length} collision${colls.length === 1 ? '' : 's'}`,
      lookback,
      `by ${state.sort ?? 'recent'}`,
      state.filter ? `${BOLD}/${state.filter}${R}` : null,
      state.onlyColliding ? `${BOLD}collisions only${R}` : null,
    ].filter(Boolean).join(' · '),
  })
  out.push(b.top)
  const cells = (name, agents, sessions, files, edits, share, colls_, activity, last) => {
    const s = [' ', fit(name, plan.name)]
    if (plan.on.has('agents')) s.push(' ', fit(agents, 16))
    if (plan.on.has('sessions')) s.push(' ', fit(sessions, 5))
    if (plan.on.has('files')) s.push(' ', fit(files, 6))
    if (plan.on.has('edits')) s.push(' ', fit(edits, 6))
    if (plan.on.has('share')) s.push(' ', fit(share, 8))
    if (plan.on.has('collisions')) s.push(' ', fit(colls_, 5))
    if (gw > 0) s.push(' ', activity)
    s.push(' ', fit(last, 6))
    return s.join('')
  }
  out.push(b.row(`${DIM}${cells('PROJECT', 'AGENTS', ' SESS', ' FILES', ' EDITS', '   SHARE', ' COLL', fit(`ACTIVITY (${lookback})`, gw), '  LAST')}${R}`))
  const totalEdits = Math.max(1, projects.reduce((a, x) => a + x.events.length, 0))

  const view = projects.slice(Math.max(0, sel - (listH - 3)), Math.max(listH - 2, sel + 1))
  const offset = projects.indexOf(view[0] ?? projects[0])
  for (let i = 0; i < view.length && i < listH - 2; i++) {
    const p = view[i]
    const idx = offset + i
    const on = idx === sel
    const spark = graph(series(p.events, gw * 2, since, now), { width: gw, rows: 1, tier, lut: LUT.activity })[0]
    const agents = p.agents.map(a => `${hue(a)}${a}${R}`).join(`${DIM}+${R}`)
    const open = expanded.has(p.root ?? 'loose')
    const marker = open ? '▾' : '▸'
    const mine = colls.filter(c => c.project === p.root).length
    const line = cells(
      `${marker} ${p.name}`,
      agents,
      String(p.sessions).padStart(5),
      String(p.files).padStart(6),
      String(p.events.length).padStart(6),
      meter(p.events.length / totalEdits, 8, LUT.activity),
      mine ? `${LUT.heat[90]}${String(mine).padStart(5)}${R}` : `${DIM}${'·'.padStart(5)}${R}`,
      `${spark}${R}`,
      ago(p.last, now).padStart(6))
    // Selection reverses fg/bg on a plain line. Interleaving REV with 24-bit
    // colour leaves gaps wherever a reset lands, so the row drops its hues for
    // the one frame it is selected -- readable on any theme by definition.
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
    const sel_ = `${THEME.selBg}${THEME.selFg}`
    out.push(b.row(on ? `${sel_}${plain}${' '.repeat(Math.max(0, w - 2 - width(plain)))}${R}` : line))

    // Expanded projects list their sessions inline, which is design-language
    // D2 answered: expand-on-demand rather than a fixed-height sub-table.
    if (open) {
      const kids = [...new Map(p.events.map(e => [e.session, e])).values()]
        .sort((x, y) => y.at - x.at)
        .slice(0, 4)
      for (const s of kids) {
        const meta = state.sessions.get(s.session)
        const label = trunc(meta?.title, 34) ?? `${DIM}—${R}`
        out.push(b.row(`   ${DIM}└${R} ${hue(s.agent)}${fit(s.agent, 9)}${R} ${fit(meta?.branch ?? `${DIM}—${R}`, 16)} ${fit(label, Math.max(0, w - 39))}${ago(s.at, now).padStart(5)}`))
      }
    }
  }
  for (let i = view.length; i < listH - 2; i++) out.push(b.row(''))
  out.push(b.bottom)

  // ---- detail: sessions under the selected project ------------------------
  const p = projects[sel]
  const d = box({
    w,
    title: p ? p.name : 'no project',
    key: SUP[1],
    // Narrow terminals get the keys that matter; ? always survives, because it
    // is how you find the rest.
    // Controls hang off the border as labelled tags, btop-style, and each one
    // shows its CURRENT value rather than just its key — so the border states
    // what you are looking at instead of what you could press.
    state: (w >= 96
      ? [tag('⏎', 'expand'), tag('s', state.sort ?? 'recent'), tag('/', state.filter || 'filter'),
         tag('a', lookback), tag('c', state.onlyColliding ? 'colliding' : 'all'), tag('?', 'keys'), tag('q', 'quit')]
      : w >= 70
        ? [tag('s', state.sort ?? 'recent'), tag('a', lookback), tag('?', 'keys'), tag('q', 'quit')]
        : [tag('?', 'keys'), tag('q', 'quit')]).join(''),
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
  const detailEnd = listH + detailH - 1
  while (out.length < detailEnd) out.push(d.row(''))
  out.push(d.bottom)

  // ---- the live feed: edits as they land ----------------------------------
  //
  // The table above changes once a minute at best. This is the part that moves,
  // and it is why the screen now looks like something is happening: a wall
  // clock beside each edit, newest first, refreshed every second.
  // A partial state must render, not throw: the feed is the newest panel and
  // the most likely thing a caller forgets to supply.
  const stream = Array.isArray(state.events) ? state.events : []
  if (feedH >= 3) {
    const seen = new Set()
    const feed = []
    for (const e of [...stream].sort((a, b2) => b2.at - a.at)) {
      const k = `${e.session}:${e.path}`
      if (seen.has(k)) continue
      seen.add(k)
      feed.push(e)
      if (feed.length >= feedH - 2) break
    }
    const f = box({
      w, title: 'activity', key: SUP[2],
      right: feed.length ? `${DIM}newest first${R}` : '',
      state: `${DIM}${stream.length} edit${stream.length === 1 ? '' : 's'} in ${lookback}${R}`,
    })
    out.push(f.top)
    for (const e of feed) {
      const at = new Date(e.at).toTimeString().slice(0, 8)
      const root = e.project ?? gitRoot(e.path)
      const pw = Math.max(8, Math.min(20, Math.floor(w * 0.18)))
      out.push(f.row(` ${DIM}${at}${R} ${hue(e.agent)}${fit(e.agent, 9)}${R} ${fit(projectName(root), pw)} ${DIM}${fit(short(e.path, root), Math.max(0, w - 29 - pw))}${R}${ago(e.at, now).padStart(6)}`))
    }
    while (out.length < h - 1) out.push(f.row(''))
    out.push(f.bottom)
  }

  return out.slice(0, h).join('\n')
}

function build(windowMin, lookbackMs, now) {
  const since = now - lookbackMs
  const { events, sessions, dirty } = collect({ sinceMs: since })
  const recent = events.filter(e => e.at >= since && !isNoise(e.path))
  const projects = [...byProject(recent).values()].sort((a, b) => b.last - a.last)
  const colls = collisions(recent, sessions, { windowMin, since })
  return { events: recent, sessions, projects, colls, since, dirty }
}

export function start({ now = () => Date.now(), stdout = process.stdout, stdin = process.stdin } = {}) {
  const LOOKBACKS = [[6 * 3_600_000, '6h'], [24 * 3_600_000, '24h'], [7 * 86_400_000, '7d'], [30 * 86_400_000, '30d']]
  let lb = 1, windowMin = WINDOW_MIN, sel = 0, tick = 0
  let sortIdx = 0, filter = '', typing = false, help = false, onlyColliding = false
  const expanded = new Set()
  const tier = tierFor()
  let state = null

  const reload = () => {
    const t = now()
    const built = build(windowMin, LOOKBACKS[lb][0], t)
    const changed = built.dirty
    // Filter, then collisions-only, then sort. Order matters: sorting a list
    // you are about to shorten is wasted work, and "3 projects" in the border
    // must count what is actually on screen.
    let list = built.projects
    if (filter) list = list.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
    if (onlyColliding) list = list.filter(p => built.colls.some(c => c.project === p.root))
    list = [...list].sort(SORTS[sortIdx].cmp)
    state = {
      ...built, projects: list, sel, expanded, tier, now: t,
      lookback: LOOKBACKS[lb][1], windowMin, tick,
      sort: SORTS[sortIdx].label, filter, help, onlyColliding,
    }
    if (sel >= state.projects.length) sel = Math.max(0, state.projects.length - 1)
    state.sel = sel
    return changed
  }

  const draw = () => {
    state.sel = sel
    state.now = now()
    state.tick = tick
    state.help = help
    state.filter = filter
    stdout.write(CLEAR + render(state, { cols: stdout.columns || 100, rows: stdout.rows || 30 }))
  }

  const quit = () => {
    clearTimeout(pollTimer); clearInterval(paintTimer)
    stdout.write(SHOW + UNALT)
    if (stdin.isTTY) stdin.setRawMode(false)
    stdin.pause()
    process.exit(0)
  }

  // btop redraws on a timer; so does this, but the timer backs off.
  //
  // A tick costs ~16 ms of CPU and stats roughly 1300 files. Held at two
  // seconds forever that is ~0.8% of a core doing nothing useful on a quiet
  // machine, and it grows with your history. So: two seconds while work is
  // landing, doubling up to sixteen once nothing has changed for a few ticks,
  // and straight back to two the moment anything moves or you touch a key.
  //
  // The pulse slows down with it, which is honest — a lazy pulse means a quiet
  // machine, not a stalled program.
  // Painting and polling are separate clocks, which is the whole trick.
  //
  // btop's data interval is 2000 ms — the same as ours — yet it feels alive,
  // because it repaints every second and stamps the time into its border. A
  // screen that never changes is indistinguishable from a crashed one, and
  // backing off the REPAINT to save CPU is how you make a live tool look dead.
  //
  // So: paint every second, always. It costs a string build and one write, no
  // file I/O at all. Poll the disk on a separate timer that backs off from two
  // seconds to sixteen when nothing is changing — that is where the ~16 ms and
  // the 1300 stats live, and that is what is worth throttling.
  const PAINT_MS = 1000
  const POLL_FAST = 2000, POLL_SLOW = 16000
  let pollMs = POLL_FAST, idleTicks = 0, pollTimer = null, paintTimer = null

  const schedule = () => {
    clearTimeout(pollTimer)
    pollTimer = setTimeout(onPoll, pollMs)
    pollTimer.unref?.()
  }
  const onPoll = () => {
    const changed = reload()
    if (changed) { idleTicks = 0; pollMs = POLL_FAST }
    else if (++idleTicks >= 3) pollMs = Math.min(POLL_SLOW, pollMs * 2)
    schedule()
  }
  const onPaint = () => { tick++; draw() }
  const wake = () => { idleTicks = 0; pollMs = POLL_FAST; schedule() }

  stdout.write(ALT + HIDE)
  if (stdin.isTTY) stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  reload(); draw(); schedule()
  paintTimer = setInterval(onPaint, PAINT_MS)
  paintTimer.unref?.()

  stdout.on('resize', draw)
  const current = () => state.projects[sel]

  stdin.on('data', k => {
    wake()

    // While filtering, almost every key is text. Only escape and enter are not.
    if (typing) {
      if (k === '\x1b') { typing = false; filter = '' }
      else if (k === '\r' || k === '\n') typing = false
      else if (k === '\x7f' || k === '\b') filter = filter.slice(0, -1)
      else if (k === '\x03') return quit()
      else if (k >= ' ' && k.length === 1) filter += k
      sel = 0
      reload(); draw()
      return
    }

    if (help) { help = false; draw(); return }          // any key dismisses it

    if (k === 'q' || k === '\x1b' || k === '\x03') return quit()
    else if (k === '?' || k === 'h') help = true
    else if (k === '\x1b[B' || k === 'j') sel = Math.min(state.projects.length - 1, sel + 1)
    else if (k === '\x1b[A' || k === 'k') sel = Math.max(0, sel - 1)
    else if (k === '\r' || k === '\n' || k === ' ') {
      const p = current()
      if (p) {
        const id = p.root ?? 'loose'
        expanded.has(id) ? expanded.delete(id) : expanded.add(id)
      }
    }
    else if (k === 's') { sortIdx = (sortIdx + 1) % SORTS.length; reload() }
    else if (k === '/') { typing = true; filter = '' }
    else if (k === 'c') { onlyColliding = !onlyColliding; sel = 0; reload() }
    else if (k === 'a') { lb = (lb + 1) % LOOKBACKS.length; reload() }
    else if (k === 'w') { windowMin = windowMin === 30 ? 60 : windowMin === 60 ? 10 : 30; reload() }
    else if (k === 'r') reload()
    else if (k === 'g') sel = 0
    else if (k === 'G') sel = Math.max(0, state.projects.length - 1)
    draw()
  })
  process.on('SIGINT', quit)
}
