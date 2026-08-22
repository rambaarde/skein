// The human door (design language §3.1).
//
// btop tiles fixed boxes for fixed metrics on one machine. skein's primary
// object is a PROJECT, and projects are a variable-length list with sessions
// nested under them -- so we take btop's border grammar and its graph tables,
// and leave its box-grid layout behind.
import { collect } from './sources/index.js'
import { collisions, who, isNoise, WINDOW_MIN } from './collide.js'
import { byProject, gitRoot, projectName, NO_REPO } from './project.js'
import { graph, graphPair, tierFor } from './symbols.js'
import { LUT, hue, R, DIM, BOLD, REV, SUP, THEME } from './theme.js'
import { box, tag, TAG_SEP, fit, width } from './box.js'
import { layout, compose } from './layout.js'
import { PRESETS, NAMES } from './presets.js'
import { TABS, TAB_TITLES, sessionsTab, filesTab, collisionsTab } from './tabs.js'
import * as mouse from './mouse.js'
import { highWater, limitOf, humanTokens } from './context.js'
import { ago, short, trunc } from './format.js'
import { attentionSeries, attentionOf, humanMs } from './attention.js'
import { rateSeries, ratePerMin, byAgent, activeSessions, liveSessions, pickWindow, LADDER, WINDOW_MS } from './live.js'

const ALT = '\x1b[?1049h', UNALT = '\x1b[?1049l'
const HIDE = '\x1b[?25l', SHOW = '\x1b[?25h'
const CLEAR = '\x1b[H\x1b[2J'

// Bucket events into `n` slots across the lookback, normalised 0..1.
// Square-root scaling with a floor under every non-empty bucket. Linear
// normalisation against the peak rendered one quiet minute beside a busy hour
// as nothing at all.
export function normalise(values) {
  const max = Math.max(1, ...values)
  return values.map(v => (v === 0 ? 0 : Math.max(FLOOR, Math.sqrt(v / max))))
}

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
  { key: 'time', label: 'time', cmp: (a, b) => (b.attention ?? 0) - (a.attention ?? 0) },
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
  ['p / P', 'next / previous preset — a preset drops panes, it does not shrink them'],
  ['1-3', 'jump straight to a preset: all · watch · table'],
  ['⏎', "open the project's own page — graph, agents, sessions, files, collisions"],
  ['space', 'peek at a project inline without leaving the list'],
  ['esc', 'back one level: page, then detail, then quit'],
  ['tab', 'switch the detail pane: info · sessions · files · collisions'],
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

// A pane is exactly rect.h lines of exactly rect.w visible columns — that
// invariant is what lets two of them sit side by side without the right one
// drifting a character further out on every row.
function pane(rect, { title, key, right = '', state = '', rows, line = null }) {
  const b = box({ w: rect.w, title, key, right, state, line })
  const body = rows.slice(0, Math.max(0, rect.h - 2))
  const lines = [b.top, ...body.map(r => b.row(r))]
  while (lines.length < rect.h - 1) lines.push(b.row(''))
  lines.push(b.bottom)
  return lines.slice(0, rect.h)
}

export function render(state, size) {
  const { cols, sel, expanded, colls, tier, since, now, lookback } = state
  const projects = state.projects
  const w = Math.max(50, size.cols), h = Math.max(12, size.rows)
  const out = []

  if (state.help) return helpOverlay(w, h)

  // btop's geometry, measured from a real capture: a full-width headline, a
  // left column, and a tall right column for the one view that is a long list.
  // A preset drops boxes; the survivors expand into what is left. Guard every
  // read of a rect, because in preset 'table' there is no detail or feed at all.
  const preset = PRESETS[state.preset ?? 0] ?? PRESETS[0]
  const L = layout(w, h, preset.shown)
  const listH = L.head.h, detailH = L.detail?.h ?? 0, feedH = L.feed?.h ?? 0
  const listW = L.head.w, detailW = L.detail?.w ?? 0, feedW = L.feed?.w ?? 0

  // Columns are chosen to fit, not assumed. btop tiles fixed boxes because it
  // knows its own metrics; a project list does not know how wide a name is or
  // how narrow a terminal will be. Drop the least valuable column first, and
  // give whatever is left to the name.
  // Declared here, above the column plan, because the plan asks whether these
  // vary between rows before deciding whether to draw them.
  const att = x => x.attention ?? attentionOf(x.events ?? [])
  // The scale is whatever the busiest session on this machine has actually
  // reached, rounded to something recognisable. Observed, so it self-corrects
  // when the window changes — a hardcoded limit would quietly go wrong.
  const ceiling = highWater(state.sessions ?? new Map())   // fallback, per-session limits win
  // The fullest session, by FRACTION rather than by token count. Ceilings
  // differ per agent — Codex states 258k, Claude runs to 1M — so the largest
  // absolute number is not the one nearest to compacting.
  const ctxOf = x => {
    let best = { tokens: 0, frac: 0 }
    for (const id of new Set((x.events ?? []).map(e => e.session))) {
      const s = state.sessions?.get(id)
      const tokens = s?.context ?? 0
      if (!tokens) continue
      const frac = Math.min(1, tokens / limitOf(s, ceiling))
      if (frac > best.frac) best = { tokens, frac }
    }
    return best
  }

  const metaOf = x => {
    const seen = [...new Map((x.events ?? []).map(e => [e.session, e])).values()]
      .sort((a, b) => b.at - a.at)
      .map(e => state.sessions?.get(e.session))
      .filter(Boolean)
    return {
      branch: seen.map(s => s.branch).find(Boolean) ?? null,
      doing: seen.map(s => s.title).find(Boolean) ?? null,
    }
  }

  // ---- the project page --------------------------------------------------
  //
  // A drill-down, not an expansion. Two inline rows under a project could show
  // a session id and a timestamp; the question "what happened in this repo" needs
  // a screen. Enter or a click opens it, esc closes it, and it reuses the same
  // helpers as the list so the two cannot disagree about what a number means.
  function projectPage(p) {
    const m = metaOf(p)
    const A = layout.page ? null : null
    // Geometry: a tall headline with the graph, then three boxes across, then
    // collisions along the bottom if there are any.
    const collsHere = colls.filter(c => c.project === p.root)
    // The graph is capped rather than given whatever is left. Twenty-three
    // gradations is not more information than ten — it is the same shape with a
    // finer ruler, and it was eating the panes that carry the actual detail.
    const GRAPH_MAX = 10
    const collH = collsHere.length ? Math.min(Math.max(4, collsHere.length + 3), Math.floor(h * 0.3)) : 0
    const rowsP = Math.max(2, Math.min(GRAPH_MAX, h - collH - 14))
    const headHp = rowsP + 3
    const lowerH = h - headHp - collH
    const third = Math.floor(w / 3)
    const rects = {
      head: { x: 0, y: 0, w, h: headHp },
      agents: { x: 0, y: headHp, w: third, h: lowerH },
      sessions: { x: third, y: headHp, w: third, h: lowerH },
      files: { x: third * 2, y: headHp, w: w - third * 2, h: lowerH },
      colls: { x: 0, y: headHp + lowerH, w, h: collH },
    }

    // --- the headline: this project's own rate graph, full width
    const gwP = Math.max(20, w - 12)
    const span = pickWindow(p.events ?? [], { now })
    const series = rateSeries(p.events ?? [], gwP * 2, { now, windowMs: span.windowMs })
    const peakP = Math.max(0.01, ...series)
    const g = graph(series.map(v => v / peakP), { width: gwP, rows: rowsP, tier, lut: LUT.activity })
    const rows = []
    // A gradation that repeats the one above it is not a gradation. With a peak
    // below one, ten rows all round to the same couple of values — so a label
    // is drawn only where it differs from the last one printed.
    let lastLabel = null
    g.forEach((line, i) => {
      const value = (peakP * (g.length - i)) / g.length
      const raw = i === g.length - 1 ? '0' : value >= 10 ? String(Math.round(value)) : value.toFixed(peakP < 2 ? 2 : 1)
      const label = raw === lastLabel ? '' : raw
      if (label) lastLabel = raw
      rows.push(` ${DIM}${fit(label, 6)}${R}${DIM}┤${R}${line}${R}`)
    })
    const agentRates = byAgent(p.events ?? [], { now, windowMs: span.windowMs })
    rows.push(` ${DIM}${fit(`EDITS/MIN · ${span.label}`, 18)}${R}${BOLD}${fit(`peak ${peakP.toFixed(1)}`, 11)}${R}` +
      agentRates.slice(0, 3).map(a => `${hue(a.agent)}${a.agent}${R} ${meter(a.rate / peakP, 6, LUT.activity)} ${DIM}${a.rate.toFixed(1)}${R}`).join('  '))

    const totalAll = Math.max(1, projects.reduce((a, x) => a + att(x), 0))
    const stats = [
      `${humanMs(att(p))} attention`,
      `${Math.round((att(p) / totalAll) * 100)}% of all`,
      `${p.sessions} session${p.sessions === 1 ? '' : 's'}`,
      `${p.files} file${p.files === 1 ? '' : 's'}`,
      collsHere.length ? `${collsHere.length} collision${collsHere.length === 1 ? '' : 's'}` : 'no collisions',
    ].join(`${DIM} · ${R}`)

    // --- agents: btop's per-core list, but the cores are agents
    const perAgent = (p.agents ?? []).map(a => {
      const ev = (p.events ?? []).filter(e => e.agent === a)
      return { agent: a, n: ev.length, at: Math.max(0, ...ev.map(e => e.at)), files: new Set(ev.map(e => e.path)).size }
    }).sort((x, y) => y.n - x.n)
    const totalN = Math.max(1, perAgent.reduce((s, a) => s + a.n, 0))
    const aw = rects.agents.w - 2
    const agentRows = []
    for (const a of perAgent) {
      // Share of this project's edits, not of the busiest agent: on a page
      // about one repo the question is who did the work here.
      const frac = a.n / totalN
      agentRows.push(` ${hue(a.agent)}${fit(a.agent, 10)}${R}${meter(frac, 8, LUT.activity)} ${BOLD}${String(Math.round(frac * 100)).padStart(3)}%${R}`)
      agentRows.push(`   ${DIM}${fit(`${a.n} edit${a.n === 1 ? '' : 's'}`, 12)}${fit(`${a.files} file${a.files === 1 ? '' : 's'}`, 11)}last ${ago(a.at, now)}${R}`)
      agentRows.push('')
    }
    if (!agentRows.length) agentRows.push(` ${DIM}no agents in this window${R}`)
    else {
      agentRows.pop()
      // Collisions are a property of a PAIR of agents, so they belong here.
      if (collsHere.length && perAgent.length > 1) {
        agentRows.push('')
        agentRows.push(` ${LUT.heat[90]}${collsHere.length} collision${collsHere.length === 1 ? '' : 's'}${R}${DIM} between them${R}`)
      }
    }

    // --- sessions and files reuse the tab bodies, so a number cannot mean one
    // thing on the page and another in the pane.
    const F = { fit, hue, ago, trunc, short, humanTokens, meter, DIM, R, BOLD, LUT, limitOf, ceiling }
    const tctx = k => ({ state, now, detailW: rects[k].w - 2, detailH: rects[k].h, collsHere, lookback, F })
    const sessRows = sessionsTab(p, tctx('sessions'))
    const fileRows = filesTab(p, tctx('files'))

    const panes = [
      { rect: rects.head, lines: pane(rects.head, {
        title: `${p.name}${m.branch ? ` — ${m.branch}` : ''}`, key: SUP[0], line: THEME.boxHead,
        right: `${DIM}esc to go back${R}  ${clock}`,
        state: `${stats}  ${tag('esc', 'back')}${TAG_SEP}${tag('tab', 'panes')}${TAG_SEP}${tag('q', 'quit')}`,
        rows,
      }) },
      { rect: rects.agents, lines: pane(rects.agents, { title: 'agents', line: THEME.boxDetail, rows: agentRows,
        state: `${DIM}${perAgent.length} in ${lookback}${R}` }) },
      { rect: rects.sessions, lines: pane(rects.sessions, { title: 'sessions', line: THEME.boxDetail, rows: sessRows }) },
      { rect: rects.files, lines: pane(rects.files, { title: 'files', line: THEME.boxFeed, rows: fileRows,
        state: `${DIM}${p.files} touched${R}` }) },
    ]
    if (collH > 0) {
      panes.push({ rect: rects.colls, lines: pane(rects.colls, {
        title: 'collisions', line: LUT.heat[90],
        // A collision is between two SESSIONS, and they are frequently the same
        // agent — the record carries a and b, each with its own agent and
        // session. Calling every one of them "two agents" is wrong on a project
        // whose agent list has one entry, which is most of them.
        state: `${DIM}two sessions editing one file close enough together to overwrite each other${R}`,
        rows: collsHere.slice(0, Math.max(1, collH - 2)).map(c => {
          const pair = c.a?.agent === c.b?.agent
            ? `${hue(c.a?.agent)}2 × ${c.a?.agent}${R}`
            : `${hue(c.a?.agent)}${c.a?.agent}${R}${DIM} ↔ ${R}${hue(c.b?.agent)}${c.b?.agent}${R}`
          return ` ${LUT.heat[90]}·${R} ${fit(short(c.path, c.project), Math.max(10, w - 46))}${fit(pair, 22)}${DIM}${fit(`${c.gapMin}m apart`, 12)}${ago(c.at, now).padStart(5)}${R}`
        }),
      }) })
    }
    return compose(h, panes)
  }

  const plan = (() => {
    // The name column is sized to the longest NAME, not to whatever is left
    // over. Giving it the slack put nine characters of nothing in every row and
    // starved the graph — btop never leaves a gap it could put data in.
    const longest = projects.reduce((m, p) => Math.max(m, p.name.length + 2), 8)
    const name = Math.max(10, Math.min(28, longest))

    // A column earns its place by DIFFERING between rows. Measured on a
    // one-agent machine: AGENTS carried one distinct value across seven
    // projects and COLL carried one — two columns of screen width saying
    // nothing, while BRANCH and DOING were captured and never shown. btop
    // hides its swap gauge on a machine with no swap for the same reason.
    const varies = f => projects.length < 2 || new Set(projects.map(f)).size >= 2
    const optional = [
      ['branch', 18, varies(x => metaOf(x).branch ?? '')],
      ['doing', 30, projects.some(x => metaOf(x).doing)],
      ['agents', 16, varies(x => x.agents.join('+'))],
      ['time', 7, true],
      ['share', 8, true],
      ['collisions', 5, colls.length > 0],
      // The fuel gauge: how full the fullest session in this project is. Shown
      // only when the agents actually report it.
      ['ctx', 13, projects.some(x => ctxOf(x).tokens > 0)],
      ['files', 6, true],
      ['sessions', 5, varies(x => x.sessions)],
    ].filter(([, , keep]) => keep).map(([k, w]) => [k, w])
    let budget = listW - 2 - 1 - 6 - name      // borders, lead, LAST, name
    const on = new Set()
    for (const [key, need] of optional) {
      if (budget >= need + 1 + 10) { on.add(key); budget -= need + 1 }   // keep 10 for the graph
    }
    // Every character the columns did not need goes to the timeline, because
    // that is the one thing that gets better with width: more cells is a finer
    // bucket, and a finer bucket is one that visibly moves.
    // btop's per-core rows are ~12 characters of sparkline beside a
    // percentage: the number is what you read, the sparkline is texture. Forty
    // characters of scattered dots is the worst of both — too wide to scan, and
    // at four braille levels too short to show shape. Cap it, and give it a
    // number to stand next to.
    const gw = Math.max(0, Math.min(14, budget - 7))
    return { on, gw, name }
  })()
  const gw = plan.gw

  // ---- projects (the primary object) -------------------------------------
  // A dashboard that never moves is indistinguishable from a frozen one. The
  // pulse advances every refresh, so an idle machine still shows a live tool.
  const pulse = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[(state.tick ?? 0) % 10]
  const clock = new Date(now).toTimeString().slice(0, 8)

  // Dispatched here and not earlier: projectPage reads `clock`, and a function
  // declaration hoists while a const does not. Calling it above this line threw
  // "Cannot access 'clock' before initialization" — the same trap this file has
  // hit before by putting a helper where it reads best rather than after what
  // it depends on.
  if (state.page) {
    const target = projects.find(x => (x.root ?? x.name) === state.page)
    if (target) return projectPage(target)
  }

  // Fitted to the budget rather than switched at two breakpoints, and the two
  // escape hatches are PINNED. Adding one control used to push '? keys' off the
  // end, which is precisely backwards: the least discoverable thing on screen
  // is how to get help and how to get out, so those are the last to go.
  const bare = s => s.replace(/\x1b\[[0-9;]*m/g, '')
  const controls = w => {
    // The GLYPH shown and the KEY sent are not the same thing. Making the tags
    // clickable, I set expand's glyph to the key it dispatches — '\r' — so a
    // literal carriage return was printed into the border. The terminal obeyed
    // it, jumped to column 0 and overwrote the row, which is the gap; and since
    // width() counts it as one column while it renders as none, every hit
    // region after it was off by one too.
    const TAG_KEY = new Map()
    const mk = (glyph, label, key = glyph) => {
      const s = tag(glyph, label)
      TAG_KEY.set(s, key)
      return s
    }
    const pinned = [mk('?', 'keys'), mk('q', 'quit')]
    const optional = [
      mk('⏎', 'expand', '\r'),
      mk('s', state.sort ?? 'recent'),
      mk('p', NAMES[state.preset ?? 0] ?? 'preset'),
      mk('a', lookback),
      mk('/', state.filter || 'filter'),
      mk('c', state.onlyColliding ? 'colliding' : 'all'),
    ]
    const plain = bare
    const sepW = plain(TAG_SEP).length
    let used = pinned.reduce((n, s) => n + plain(s).length, 0) + sepW
    const keep = []
    for (const c of optional) {
      const cost = plain(c).length + sepW
      if (used + cost > w) break
      used += cost
      keep.push(c)
    }
    // Report where each tag ended up, so the same labels the border already
    // shows can be clicked. hit.tags has existed since the mouse landed and was
    // never populated — the controls were readable but not reachable, which is
    // most of "where are the presets?": they were on screen and inert.
    const all = [...keep, ...pinned]
    const spans = []
    let at = 0
    for (const c of all) {
      const len = plain(c).length
      spans.push({ x0: at, x1: at + len, key: TAG_KEY.get(c) ?? null })
      at += len + sepW
    }
    return { text: all.join(TAG_SEP), spans }
  }

  const headRows = []
  const headState = [
      `${projects.length} project${projects.length === 1 ? '' : 's'}`,
      // A bare zero reads as "this tool is broken". A zero beside a longer
      // window reads as "nothing today, and here is what normal looks like".
      colls.length
        ? `${colls.length} collision${colls.length === 1 ? '' : 's'}`
        : `${DIM}no collisions in ${lookback}${R}`,
      lookback,
      `by ${state.sort ?? 'recent'}`,
      state.filter ? `${BOLD}/${state.filter}${R}` : null,
      state.onlyColliding ? `${BOLD}collisions only${R}` : null,
    ].filter(Boolean).join(' · ')
  const b = box({ w: listW })
  // Keyed rather than positional: the column set is now decided at runtime, and
  // nine ordered arguments is how you silently shift every value one place left.
  const cells = c => {
    const s = [' ', fit(c.name, plan.name)]
    if (plan.on.has('branch')) s.push(' ', fit(c.branch, 18))
    if (plan.on.has('doing')) s.push(' ', fit(c.doing, 30))
    if (plan.on.has('agents')) s.push(' ', fit(c.agents, 16))
    if (plan.on.has('sessions')) s.push(' ', fit(c.sessions, 5))
    if (plan.on.has('files')) s.push(' ', fit(c.files, 6))
    if (plan.on.has('time')) s.push(' ', fit(c.time, 7))
    if (plan.on.has('share')) s.push(' ', fit(c.share, 8))
    if (plan.on.has('collisions')) s.push(' ', fit(c.colls, 5))
    if (plan.on.has('ctx')) s.push(' ', fit(c.ctx, 13))
    if (gw > 0) s.push(' ', c.activity, ' ', fit(c.busiest, 5))
    s.push(' ', fit(c.last, 6))
    return s.join('')
  }
  // ---- the live strip: btop's cpu graph, with agents for cores ------------
  //
  // The ATTENTION timeline answers "where did my week go" and is identical
  // between one fifty-one-minute bucket boundary and the next. This answers
  // "is anything happening right now", and because it is a rolling window it
  // slides left every few seconds whether or not anything changed.
  const stream0 = Array.isArray(state.events) ? state.events : []
  // The strip is the first thing to go when the pane is short. A live graph is
  // worth four rows on a full screen and worth nothing at all if it costs the
  // table its header.
  // btop's cpu graph is about ten rows tall, and that height is the whole
  // reason you can read a spike off it: ten rows of braille is forty vertical
  // levels. A one-row sparkline has four, which is texture, not shape.
  //
  // So the strip takes every row the table does not need, up to eight, and
  // draws the aggregate — exactly the division btop makes between its big cpu
  // graph and its one-line per-core sparklines.
  const expandedRows = projects.reduce(
    (a, x) => a + (expanded.has(x.root ?? 'loose') ? Math.min(4, x.sessions) : 0), 0)
  const tableRows = Math.max(1, projects.length + expandedRows) + 2

  // The strip gets a floor, and the table yields to it.
  //
  // Before this the strip took whatever the table left over, so with twelve
  // projects it got zero rows and the graph vanished outright — the same "where
  // is the spike?" as the fixed window, arrived at from the other direction.
  // The graph answers "is anything happening right now" and the table answers
  // "where has my time gone"; a long list of the second must not silently
  // delete the first. Four rows is enough to read a shape from.
  const STRIP_MIN = 4
  const stripH = listH - 2 <= STRIP_MIN + 3
    ? Math.max(0, Math.min(8, listH - tableRows - 2))      // genuinely no room
    : Math.max(STRIP_MIN, Math.min(8, listH - tableRows - 2))
  // What the table can actually show once the strip has its floor. Rows beyond
  // this are counted in the border rather than dropped in silence.
  const tableBudget = Math.max(1, listH - stripH - 4)
  const gwLive = Math.max(20, listW - 24)
  // The span is chosen, not fixed. A 15m window is blank most of the time you
  // would actually look at it, because editing is bursty — "where is the
  // spike?" was answered by "your last edit was sixteen minutes ago".
  const span = pickWindow(stream0, { now })
  const live = rateSeries(stream0, gwLive * 2, { now, windowMs: span.windowMs })
  const peak = Math.max(1, ...live)
  const graphRows = Math.max(1, stripH - 1)
  // Linear, and no floor. The sqrt-and-floor scaling exists for the per-project
  // sparklines, where buckets are sparse and a quiet one would otherwise vanish
  // beside a busy one. This series is a moving average, already continuous —
  // flooring it just pins the whole line to the top.
  const rowsN = graph(live.map(v => v / peak), { width: gwLive, rows: graphRows, tier, lut: LUT.activity })
  const rate = ratePerMin(stream0, { now })
  const agents = byAgent(stream0, { now })
  const nSess = activeSessions(stream0, { now })
  // Two different questions. nLive is "is anyone here" (transcript touched);
  // nSess is "is work landing" (a file written). Reporting only the second one
  // said "nothing is running" while an agent was plainly running.
  const nLive = liveSessions(state.sessions, { now }).length

  if (stripH > 0) {
    // The scale sits on the graph, so a spike can be read as a value rather
    // than admired as a shape. btop labels its axis the same way.
    // A gradation on every row, the way btop and agtop both label theirs. With
    // only the top and bottom marked, a spike is a shape; with the scale
    // running down the side it is a value you can read off.
    rowsN.forEach((line, i) => {
      const top = rowsN.length - i          // this row covers up to top/rows of peak
      const value = (peak * top) / rowsN.length
      const label = rowsN.length <= 2 && i > 0 ? '0' : value >= 10 ? String(Math.round(value)) : value.toFixed(1)
      headRows.push(` ${DIM}${fit(i === rowsN.length - 1 ? '0' : label, 6)}${R}${DIM}┤${R}${line}${R}`)
    })
    // Built from (plain, painted) pairs: fit() counts characters, and every
    // one of these segments carries colour, so padding them as raw strings
    // measures the escape sequences too and blows a hole in the row.
    const seg = []
    const push = (plain, painted, pad = 0) =>
      seg.push({ plain, painted, w: Math.max(plain.length, pad) })

    // The span is stated because it moves. A graph whose meaning changes
    // silently is worse than an empty one.
    push(`EDITS/MIN · ${span.label}`, `${DIM}EDITS/MIN · ${R}${BOLD}${span.label}${R}`, 18)
    push(`now ${rate.toFixed(1)}`, `${BOLD}now ${rate.toFixed(1)}${R}`, 10)

    // "0 sessions active" beside a running agent is the tool calling itself
    // broken. Who is HERE comes first, then whether they are writing anything.
    if (nLive) {
      const tail = nSess ? `, ${nSess} editing` : ', idle'
      push(`${nLive} live${tail}`, `${LUT.activity[80]}${nLive} live${R}${DIM}${tail}${R}`, 20)
    } else {
      push('nobody running', `${DIM}nobody running${R}`, 20)
    }

    if (span.widened) {
      const q = `quiet ${LADDER[0][1]}`
      push(q, `${DIM}${q}${R}`, q.length + 2)
    }

    if (agents.length) {
      for (const a of agents.slice(0, 3)) {
        const plain = `${a.agent} ------ ${a.rate.toFixed(1)}`
        push(plain, `${hue(a.agent)}${a.agent}${R} ${meter(a.rate / Math.max(1, peak), 6, LUT.activity)} ${DIM}${a.rate.toFixed(1)}${R}`, plain.length + 2)
      }
    } else {
      push('no file written just now', `${DIM}no file written just now${R}`)
    }

    let used = 1
    let strip = ' '
    for (const s of seg) {
      if (used + s.w > listW - 2) break
      strip += s.painted + ' '.repeat(Math.max(0, s.w - s.plain.length))
      used += s.w
    }
    headRows.push(strip)
    headRows.push(`${DIM}${'─'.repeat(Math.max(0, listW - 2))}${R}`)
  }

  headRows.push(`${THEME.header}${cells({ name: 'PROJECT', branch: 'BRANCH', doing: 'DOING', agents: 'AGENTS', sessions: ' SESS', files: ' FILES', time: '   TIME', share: '   SHARE', colls: ' COLL', ctx: '  CONTEXT', activity: fit('ATTN', gw), busiest: ' PEAK', last: '  LAST' })}${R}`)
  const totalTime = Math.max(1, projects.reduce((a, x) => a + att(x), 0))
  const topAtt = Math.max(1, ...projects.map(att))

  // Hit map: filled while drawing, because the layout decides row positions at
  // render time and recomputing them in the input handler is how the two drift.
  const hit = state.hit ?? (state.hit = mouse.hits())
  hit.rows.length = 0
  hit.tags.length = 0
  hit.feed.length = 0
  hit.tabs.length = 0
  // Scroll a window of exactly tableBudget rows, keeping the selection inside
  // it. The old slice was sized off listH and so ignored the strip entirely,
  // which is how the graph came to be squeezed out by a long project list.
  const start = Math.max(0, Math.min(sel - Math.floor(tableBudget / 2), projects.length - tableBudget))
  const view = projects.slice(Math.max(0, start), Math.max(0, start) + tableBudget)
  const hidden = projects.length - view.length
  const offset = projects.indexOf(view[0] ?? projects[0])
  for (let i = 0; i < view.length && i < listH - 2; i++) {
    const p = view[i]
    const idx = offset + i
    const on = idx === sel
    // Thesis §6.5: the timeline is "per project, stacked by agent". One
    // undifferentiated line cannot say whether a project was one agent or two,
    // which is most of what you want to know about a shared repo. R7's
    // mirrored tables carry the second series: busiest agent above the
    // baseline, next one below.
    const perAgent = p.agents.map(a => ({
      agent: a,
      series: attentionSeries(p.events.filter(e => e.agent === a), gw * 2, since, now),
    })).sort((x, y) => y.series.reduce((s, v) => s + v, 0) - x.series.reduce((s, v) => s + v, 0))
    const spark = perAgent.length > 1
      ? graphPair(normalise(perAgent[0].series), normalise(perAgent[1].series), { width: gw, tier, lut: LUT.activity })
      : graph(normalise(attentionSeries(p.events, gw * 2, since, now)), { width: gw, rows: 1, tier, lut: LUT.activity })[0]
    const agents = p.agents.map(a => `${hue(a)}${a}${R}`).join(`${DIM}+${R}`)
    const open = expanded.has(p.root ?? 'loose')
    const marker = open ? '▾' : '▸'
    const mine = colls.filter(c => c.project === p.root).length
    // The no-repo bucket is unrelated work sharing a row. Showing it one
    // branch and one task title — picked from whichever session happened to be
    // first — states something untrue about every other session in it.
    const m = p.root ? metaOf(p) : { branch: null, doing: null }
    const line = cells({
      // Colour by ROLE, so the eye can skip what it is not looking for: the
      // name is the thing you scan, the branch and task are context. All three
      // were plain text, which is most of why the table read as a wall.
      name: `${DIM}${marker}${R} ${THEME.fg}${p.name}${R}`,
      branch: `${THEME.dim}${m.branch ?? '—'}${R}`,
      doing: `${THEME.dim}${m.doing ? trunc(m.doing, 30) : '—'}${R}`,
      agents,
      sessions: String(p.sessions).padStart(5),
      files: String(p.files).padStart(6),
      // btop's rule: colour maps to VALUE. Attention as a share of the busiest
      // project, so the eye finds where the time went without reading numbers.
      time: `${LUT.activity[Math.round(Math.min(1, att(p) / Math.max(1, topAtt)) * 100)]}${humanMs(att(p)).padStart(7)}${R}`,
      share: meter(att(p) / totalTime, 8, LUT.activity),
      colls: mine ? `${LUT.heat[90]}${String(mine).padStart(5)}${R}` : `${DIM}${'·'.padStart(5)}${R}`,
      ctx: (() => {
        const { tokens, frac } = ctxOf(p)
        if (!tokens) return `${DIM}${'·'.padStart(13)}${R}`
        // Hot as it fills: a full window is about to compact and lose the thread.
        return `${meter(frac, 6, LUT.heat)} ${LUT.heat[Math.round(frac * 100)]}${humanTokens(tokens).padStart(6)}${R}`
      })(),
      activity: `${spark}${R}`,
      // The busiest bucket as a share of its own span — a real percentage, the
      // way btop's cores read, so a spike carries a value and not just a shape.
      busiest: `${Math.round(Math.max(0, ...attentionSeries(p.events, Math.max(2, gw * 2), since, now)) / ((now - since) / Math.max(2, gw * 2)) * 100)}%`.padStart(5),
      // Recency the same way: fresh is bright, stale recedes.
      last: `${LUT.activity[Math.round(Math.max(0, 1 - (now - p.last) / (6 * 3600_000)) * 100)]}${ago(p.last, now).padStart(6)}${R}`,
    })
    // Selection reverses fg/bg on a plain line. Interleaving REV with 24-bit
    // colour leaves gaps wherever a reset lands, so the row drops its hues for
    // the one frame it is selected -- readable on any theme by definition.
    // +1 for the box's own top border; headRows are drawn one row in.
    hit.rows.push({ y: L.head.y + 1 + headRows.length, index: idx })
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
    const sel_ = `${THEME.selBg}${THEME.selFg}`
    headRows.push(on ? `${sel_}${plain}${' '.repeat(Math.max(0, listW - 2 - width(plain)))}${R}` : line)

    // Expanded projects list their sessions inline, which is design-language
    // D2 answered: expand-on-demand rather than a fixed-height sub-table.
    if (open) {
      const kids = [...new Map(p.events.map(e => [e.session, e])).values()]
        .sort((x, y) => y.at - x.at)
        .slice(0, 4)
      for (const s of kids) {
        const meta = state.sessions.get(s.session)
        const label = trunc(meta?.title, 34) ?? `${DIM}—${R}`
        headRows.push(`   ${DIM}└${R} ${hue(s.agent)}${fit(s.agent, 9)}${R} ${fit(meta?.branch ?? `${DIM}—${R}`, 16)} ${fit(label, Math.max(0, listW - 39))}${ago(s.at, now).padStart(5)}`)
      }
    }
  }
  const headPane = pane(L.head, {
    title: 'skein', key: SUP[0], line: THEME.boxHead,
    // btop prints 'preset N' in the cpu box border. Same place, same reason:
    // the layout you are looking at is state, and state belongs in the border.
    right: (() => {
      const label = `preset ${(state.preset ?? 0) + 1} ${NAMES[state.preset ?? 0] ?? ''}`
      const painted = `${DIM}preset ${R}${BOLD}${(state.preset ?? 0) + 1} ${NAMES[state.preset ?? 0] ?? ''}${R}  ${clock} ${DIM}${pulse}${R}`
      // box() lays the top edge out as … pad ─ ' ' right ' ' ─ ╮, so the right
      // text starts at w - width(right) - 3 from the box's left edge. It said
      // 'preset 1 all' and did nothing when clicked, which is a label
      // pretending to be a control.
      const x0 = L.head.x + listW - bare(painted).length - 3
      hit.tags.push({ y: L.head.y, x0, x1: x0 + label.length, key: 'p' })
      return painted
    })(),
    // controls() gets what is LEFT after the state text, not the full width.
    // Handing it the whole width let the combined row overflow, and the pane
    // trims from the end — which is exactly where the pinned '? keys' and
    // 'q quit' sit, so pinning them meant nothing.
    // Rows the budget could not fit are COUNTED, never silently dropped: a list
    // that quietly ends at row nine reads as "you have nine projects".
    state: (() => {
      const s = hidden > 0 ? `${headState}${DIM} · ${hidden} more below${R}` : headState
      const c = controls(Math.max(18, listW - bare(s).length - 8))
      // box() lays the bottom border out as ╰ ─ ' ' state ' ' … so the state
      // text begins three columns in. Every tag's absolute position follows
      // from that plus its offset within the row.
      const originX = L.head.x + 3 + bare(s).length + 2
      const y = L.head.y + L.head.h - 1
      for (const sp of c.spans) {
        if (sp.key) hit.tags.push({ y, x0: originX + sp.x0, x1: originX + sp.x1, key: sp.key })
      }
      return `${s}  ${c.text}`
    })(),
    rows: headRows,
  })

  // ---- detail: sessions under the selected project ------------------------
  const p = projects[sel]
  const collsHere = p ? colls.filter(c => c.project === p.root) : []
  const detailRows_ = []
  // Controls hang off the border as labelled tags, btop-style, each showing its
  // CURRENT value — so the border states what you are looking at rather than
  // what you could press.

  // The detail box says what it is showing; the KEYS go on the headline's
  // border, which is the full width of the screen and the only one with room
  // for all of them.
  const detailState = p
    ? `${DIM}${p.sessions} session${p.sessions === 1 ? '' : 's'}${collsHere.length ? ` · ${collsHere.length} collision${collsHere.length === 1 ? '' : 's'}` : ''}${R}`
    : ''
  // Clicking a feed row opens the whole record, because the feed necessarily
  // truncates the path and hides the session behind it.
  const focus = state.focus

  // The tab bar is drawn whether or not a feed row is focused. It used to be
  // inside the else-branch, so clicking anything in the activity feed replaced
  // the whole pane and the tabs disappeared — with no way to tell they had ever
  // been there. A drill-down is a state OF the info tab, not a different pane.
  const tabI = Math.min(state.tab ?? 0, TABS.length - 1)
  if (L.detail) {
    let tx = 1
    const bar = TABS.map((name, i) => {
      hit.tabs.push({ y: L.detail.y + 1, x0: L.detail.x + tx, x1: L.detail.x + tx + name.length, index: i })
      tx += name.length + 2
      return i === tabI ? `${BOLD}${THEME.hi}${name}${R}` : `${DIM}${name}${R}`
    }).join('  ')
    detailRows_.push(` ${bar}`)
    detailRows_.push(` ${DIM}${TABS.map((n, i) => (i === tabI ? '─'.repeat(n.length) : ' '.repeat(n.length))).join('  ')}${R}`)
  }

  if (focus) {
    const root = focus.project ?? gitRoot(focus.path)
    const meta = state.sessions?.get(focus.session)
    const sc = meta?.context ?? 0
    const field = (k, v) => detailRows_.push(` ${DIM}${fit(k, 9)}${R}${fit(v, Math.max(8, detailW - 13))}`)
    field('agent', `${hue(focus.agent)}${focus.agent}${R}`)
    field('file', short(focus.path, root))
    field('project', `${projectName(root)}${meta?.branch ? `${DIM}  ${meta.branch}${R}` : ''}`)
    field('when', `${new Date(focus.at).toTimeString().slice(0, 8)}${DIM}   ${ago(focus.at, now)} ago${R}`)
    if (meta?.title) field('session', trunc(meta.title, Math.max(8, detailW - 14)))
    if (sc) {
      const cap = limitOf(meta, ceiling)
      field('context', `${humanTokens(sc)}${DIM} of ${humanTokens(cap)} ${meta?.limit ? 'stated' : 'observed'}${R}`)
    }
    detailRows_.push('')
    detailRows_.push(` ${DIM}esc or click a project row to go back${R}`)
  } else if (p && L.detail) {
    // agtop's shape: one pane, several questions, switched rather than tiled.
    const ctx = { state, now, detailW, detailH: detailH - 2, collsHere, lookback,
      F: { fit, hue, ago, trunc, short, humanTokens, meter, DIM, R, BOLD, LUT, limitOf, ceiling } }

    if (tabI === 1) detailRows_.push(...sessionsTab(p, ctx))
    else if (tabI === 2) detailRows_.push(...filesTab(p, ctx))
    else if (tabI === 3) detailRows_.push(...collisionsTab(p, ctx))
    else infoTab()

    function infoTab() {
    // Thesis §5: the defensible claim is not the chart, it is that an agent can
    // read this. So the pane shows the exact line an agent starting in this
    // repository would be handed — the product, rather than a description of it.
    const others = who(state.events ?? [], state.sessions ?? new Map(),
                       { root: p.root, activeMin: state.windowMin ?? 30, now })
    const iw = Math.max(12, detailW - 34)

    if (others.length) {
      detailRows_.push(` ${BOLD}${others.length} other agent${others.length === 1 ? '' : 's'} active in this repo${R}`)
      for (const o of others.slice(0, Math.max(1, detailH - 5 - Math.min(3, collsHere.length)))) {
        const verb = o.kind === 'add' ? 'added' : o.kind === 'delete' ? 'deleted' : 'editing'
        const os = state.sessions?.get(o.session)
        const sc = os?.context ?? 0
        const gauge = sc
          ? ` ${LUT.heat[Math.round(Math.min(1, sc / limitOf(os, ceiling)) * 100)]}${humanTokens(sc)}${R}`
          : ''
        detailRows_.push(`   ${hue(o.agent)}${fit(o.agent, 9)}${R}${DIM}${fit(verb, 8)}${R}${fit(short(o.path, p.root), Math.max(6, iw - 7))}${gauge}${DIM}${ago(o.at, now).padStart(5)}${R}`)
      }
    } else {
      // Silence is the correct answer when nobody else is here (PRD Q7), and
      // saying so is more useful than an empty pane that looks broken.
      detailRows_.push(` ${DIM}nobody else is in this repo — an agent starting${R}`)
      detailRows_.push(` ${DIM}here right now would be told nothing.${R}`)
    }

    if (collsHere.length) {
      // A blank, a header, and at least one row. Anything less prints a
      // COLLISIONS heading with nothing under it, which reads as "the list is
      // empty" — the opposite of what a collision means.
      const room = Math.max(0, detailH - 3 - detailRows_.length)
      if (room >= 3) {
        detailRows_.push('')
        detailRows_.push(` ${DIM}${fit('COLLISIONS', 12)}${R}`)
        for (const c of collsHere.slice(0, room - 2)) {
          detailRows_.push(` ${LUT.heat[90]}·${R} ${fit(short(c.path, c.project), Math.max(8, detailW - 30))}${DIM}${fit(`${c.gapMin}m apart`, 11)}${ago(c.at, now).padStart(5)}${R}`)
        }
      }
    }
    }
  }
  const detailPane = L.detail && pane(L.detail, {
    title: focus
      ? `${projectName(focus.project ?? gitRoot(focus.path))} — ${short(focus.path, focus.project ?? gitRoot(focus.path)).split('/').pop()}`
      : p
        // The title names the TAB, not just the project — "what an agent is
        // told here" describes the info tab only, and was still claiming that
        // while the files list was on screen.
        ? (p.root
            ? `${p.name} — ${TAB_TITLES[Math.min(state.tab ?? 0, TABS.length - 1)]}`
            : `${NO_REPO} — ${p.sessions} unrelated session${p.sessions === 1 ? '' : 's'}`)
        : 'no project',
    key: SUP[1], state: detailState, rows: detailRows_, line: THEME.boxDetail,
  })

  // ---- the live feed: edits as they land ----------------------------------
  //
  // The table above changes once a minute at best. This is the part that moves,
  // and it is why the screen now looks like something is happening: a wall
  // clock beside each edit, newest first, refreshed every second.
  // A partial state must render, not throw: the feed is the newest panel and
  // the most likely thing a caller forgets to supply.
  const stream = Array.isArray(state.events) ? state.events : []
  const feedRows = []
  let feedTotal = 0, feedFrom = 0
  if (feedH >= 3) {
    const seen = new Set()
    const all = []
    // Build the WHOLE deduped list, then window it. This used to stop at
    // feedH-2 entries, which is why the feed could not scroll: the rows below
    // the fold were never built, so there was nothing to scroll to. 232 edits
    // in the border and fourteen on screen is a promise the pane did not keep.
    for (const e of [...stream].sort((a, b2) => b2.at - a.at)) {
      const k = `${e.session}:${e.path}`
      if (seen.has(k)) continue
      seen.add(k)
      all.push(e)
    }
    feedTotal = all.length
    const rows = Math.max(1, feedH - 2)
    // Clamped here rather than in the handler, because the handler does not
    // know how many rows fit — that is decided at render time by the layout.
    feedFrom = Math.max(0, Math.min(state.feedTop ?? 0, Math.max(0, feedTotal - rows)))
    const feed = all.slice(feedFrom, feedFrom + rows)
    for (const e of feed) {
      const at = new Date(e.at).toTimeString().slice(0, 8)
      const root = e.project ?? gitRoot(e.path)
      const pw = Math.max(8, Math.min(20, Math.floor(feedW * 0.22)))
      hit.feed.push({ y: L.feed.y + 1 + feedRows.length, event: e })
      feedRows.push((` ${DIM}${at}${R} ${hue(e.agent)}${fit(e.agent, 9)}${R} ${fit(projectName(root), pw)} ${DIM}${fit(short(e.path, root), Math.max(0, feedW - 29 - pw))}${R}${ago(e.at, now).padStart(6)}`))
    }
  }

  // Where you are in the list, stated. Scrolling with no position indicator is
  // how you lose track of whether there is more below.
  const feedPos = feedFrom > 0
    ? `${DIM}${feedFrom + 1}–${feedFrom + feedRows.length} of ${feedTotal}${R}`
    : `${DIM}newest first${R}`
  const feedPane = L.feed && pane(L.feed, {
    title: 'activity', key: SUP[2], line: THEME.boxFeed,
    right: feedPos,
    state: `${DIM}${stream.length} edit${stream.length === 1 ? '' : 's'} in ${lookback}${feedFrom > 0 ? ` · ${BOLD}g${R}${DIM} for newest` : ''}${R}`,
    rows: feedRows,
  })
  // The handler needs to know how far it may scroll, and only the layout knows.
  state.feedMax = Math.max(0, feedTotal - Math.max(1, feedH - 2))
  state.feedRect = L.feed ?? null

  return compose(h, [
    { rect: L.head, lines: headPane },
    L.detail && { rect: L.detail, lines: detailPane },
    L.feed && { rect: L.feed, lines: feedPane },
  ].filter(Boolean))
}

export function build(windowMin, lookbackMs, now) {
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
  let sortIdx = 0, filter = '', typing = false, help = false, onlyColliding = false, focus = null
  let preset = 0, tab = 0, feedTop = 0, page = null
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
      sort: SORTS[sortIdx].label, filter, help, onlyColliding, focus, preset, tab, feedTop, page,
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
    state.focus = focus
    stdout.write(CLEAR + render(state, { cols: stdout.columns || 100, rows: stdout.rows || 30 }))
  }

  const quit = () => {
    clearTimeout(pollTimer); clearInterval(paintTimer)
    stdout.write(mouse.OFF + SHOW + UNALT)
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

  stdout.write(ALT + HIDE + mouse.ON)
  if (stdin.isTTY) stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  reload(); draw(); schedule()
  paintTimer = setInterval(onPaint, PAINT_MS)
  paintTimer.unref?.()

  stdout.on('resize', draw)
  const current = () => state.projects[sel]

  const onData = k => {
    wake()

    // Mouse first: a click arrives as an escape sequence and would otherwise
    // be read as a burst of keystrokes.
    const ev = mouse.parseMouse(k)
    if (ev) {
      if (ev.kind === 'wheel') {
        // The wheel scrolls whatever is UNDER the pointer. It used to move the
        // project selection wherever you pointed it, which is why the activity
        // feed read as unscrollable — the wheel was working, just not on the
        // thing you were looking at.
        const fr = state.feedRect
        const overFeed = fr && ev.x >= fr.x && ev.x < fr.x + fr.w && ev.y >= fr.y && ev.y < fr.y + fr.h
        if (overFeed) {
          feedTop = Math.max(0, Math.min(state.feedMax ?? 0, feedTop + ev.dir * 3))
        } else {
          sel = Math.max(0, Math.min(state.projects.length - 1, sel + ev.dir))
        }
      } else {
        const tabHit = mouse.hitTab(state.hit ?? {}, ev.x, ev.y)
        if (tabHit !== null) { tab = tabHit; draw(); return }
        // A clicked control runs the key it displays, through this very
        // function — so clicking 'p all' and pressing p cannot diverge.
        const tagKey = mouse.hitTag(state.hit ?? {}, ev.x, ev.y)
        if (tagKey) return onData(tagKey)
        const ftarget = mouse.hitFeed(state.hit ?? {}, ev.y)
        if (ftarget) { focus = ftarget; draw(); return }
        const row = mouse.hitRow(state.hit ?? { rows: [], tags: [] }, ev.y)
        if (row !== null) {
          focus = null
          // Clicking the row you are on opens it. It used to expand inline,
          // which is what the page replaces.
          if (row === sel) { page = current()?.root ?? current()?.name ?? null; draw(); return }
          sel = row
        }
      }
      draw()
      return
    }

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

    // esc unwinds one level at a time: page, then focus, then quit.
    if (k === '\x1b' && page) { page = null; draw(); return }
    if (k === '\x1b' && focus) { focus = null; draw(); return }
    if (k === 'q' || k === '\x1b' || k === '\x03') return quit()
    else if (k === '?' || k === 'h') help = true
    else if (k === '\x1b[B' || k === 'j') sel = Math.min(state.projects.length - 1, sel + 1)
    else if (k === '\x1b[A' || k === 'k') sel = Math.max(0, sel - 1)
    // Enter opens the project's own page; space keeps the inline peek. Two
    // rows under a row can show a session and a timestamp — "what happened in
    // this repo" needs a screen, not an expansion.
    else if (k === '\r' || k === '\n') {
      const p = current()
      if (p) { page = p.root ?? p.name; focus = null }
    }
    else if (k === ' ') {
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
    // btop: p and P step through presets, and each is numbered. A digit jumps
    // straight to one, which is how you actually use them once you know them.
    // Tab switches the detail pane's view, which is the key agtop uses for the
    // same job. Shift-Tab steps back.
    else if (k === '\t') tab = (tab + 1) % TABS.length
    else if (k === '\x1b[Z') tab = (tab - 1 + TABS.length) % TABS.length
    else if (k === 'p') preset = (preset + 1) % PRESETS.length
    else if (k === 'P') preset = (preset - 1 + PRESETS.length) % PRESETS.length
    else if (/^[1-9]$/.test(k) && Number(k) <= PRESETS.length) preset = Number(k) - 1
    else if (k === 'r') reload()
    // The feed is the one pane with more rows than fit, so it gets the paging
    // keys. g returns it to the newest, which is where it starts.
    else if (k === '\x1b[6~') feedTop = Math.min(state.feedMax ?? 0, feedTop + 10)
    else if (k === '\x1b[5~') feedTop = Math.max(0, feedTop - 10)
    else if (k === 'g') { sel = 0; feedTop = 0 }
    else if (k === 'G') sel = Math.max(0, state.projects.length - 1)
    draw()
  }
  stdin.on('data', onData)
  process.on('SIGINT', quit)
}
