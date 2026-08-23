// The human door (design language §3.1).
//
// btop tiles fixed boxes for fixed metrics on one machine. skeins's primary
// object is a PROJECT, and projects are a variable-length list with sessions
// nested under them -- so we take btop's border grammar and its graph tables,
// and leave its box-grid layout behind.
import { collect, probe } from './sources/index.js'
import { collisions, who, isNoise, WINDOW_MIN } from './collide.js'
import { byProject, gitRoot, projectName, NO_REPO } from './project.js'
import { graph, graphPair, tierFor } from './symbols.js'
import { LUT, hue, lineHue, R, DIM, BOLD, SUP, THEME } from './theme.js'
import { box, tag, TAG_SEP, fit, width, clip } from './box.js'
import { layout, compose } from './layout.js'
import { PRESETS, NAMES } from './presets.js'
import { TABS, TAB_TITLES, sessionsTab, filesTab, toolsTab, collisionsTab } from './tabs.js'
import * as mouse from './mouse.js'
import { highWater, limitOf, humanTokens } from './context.js'
import { HOME } from './paths.js'
import { ago, short, trunc, clock12 } from './format.js'
import { attentionSeries, attentionOf, humanMs } from './attention.js'
import { rateSeries, ratePerMin, byAgent, activeSessions, liveSessions, pickWindow, LADDER } from './live.js'
import { chart, niceMax, cumulative, MARKERS, MAX_SERIES, BELOW as CHART_BELOW } from './chart.js'
import { velocity, landings, cfrSeries, bucket } from './delivery.js'
import { trend, direction, MIN_LANDED } from './trend.js'
import { GLOSSARY } from './glossary.js'
import { banner, bannerWidth, ROWS as MENU_ROWS } from './menu.js'
import { canvas } from './canvas.js'
import { coupled, layout as forceLayout } from './graph.js'
import { worktrees, versionOf, worktreeState } from './estate.js'
import { sample as sampleMachineDefault, byRoot, attributeToPaths } from './machine.js'

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
  ['1-7', 'jump straight to a preset: all · watch · table · velocity · graph · estate · worktrees'],
  ['', 'the selected project is lit on the chart; the rest fade back'],
  ['⏎', "open the project's own page — graph, agents, sessions, files, version control"],
  ['space', 'peek at a project inline without leaving the list'],
  ['esc', 'back one level: page, then detail, then preset 1, then quit'],
  ['tab', 'switch the detail pane: info · sessions · files · tools · collisions'],
  ['', 'info carries a LIVE graph for the selected project — it slides even at zero'],
  ['g  G', 'first project · last project'],
  ['r', 'refresh now'],
  ['?  h', 'this'],
  ['q  esc', 'quit'],
]


// Wrap on words, and hang the continuation under the definition rather than
// under the term -- a definition that restarts in the term column reads as a
// second term.
const wrap = (s, n) => {
  const out = []
  let line = ''
  for (const word of s.split(' ')) {
    if (line && line.length + 1 + word.length > n) { out.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

// btop's three: OPTIONS, HELP, QUIT. skeins has no options screen -- its
// settings are the border controls, and duplicating them here would be a
// second place to keep them correct. What it has instead is a vocabulary
// nobody defined, so METRICS takes that slot.
export const MENU = [
  ['METRICS', 'what every number on these screens counts'],
  ['KEYS', 'every key, and what the mouse can reach'],
  ['QUIT', 'leave. skeins never started anything, so nothing stops'],
]

// The dashboard, dimmed, with the menu standing on top of it.
//
// Dimmed rather than replaced, which is the whole point of btop's version: the
// numbers are still there and still moving behind it, so opening the menu
// never feels like leaving the tool. Composited by stripping the frame's own
// colour and repainting it in one inactive tone -- the surface stays, so the
// box keeps its background instead of showing the terminal's through it.
function menuOverlay(frame, sel, w, h, hit) {
  const lines = frame.split('\n')
  // Five rows tall where there is room, one row tall where there is not. A
  // banner that does not fit is not a smaller banner, it is a broken one --
  // and a 60-column terminal still deserves a menu.
  const wide = Math.max(...MENU.map(([word]) => bannerWidth(word)))
  const big = w >= wide + 10 && h >= MENU.length * (MENU_ROWS + 1) + 4
  const tall = big ? MENU_ROWS : 1
  // The ground has to hold the HINT as well as the words. Sized to the words
  // alone it clipped "leave. skeins never started anything" to "leave. sks",
  // which is not a shorter sentence, it is a different one.
  const words = big ? wide : Math.max(...MENU.map(([word]) => word.length))
  const bw = Math.min(Math.max(0, w - 8), Math.max(words, ...MENU.map(([, why]) => why.length)))

  const block = []
  const spans = []
  MENU.forEach(([word], i) => {
    if (i) block.push('')
    spans.push({ i, at: block.length })
    if (big) banner(word).forEach(r => block.push(r))
    else block.push(word)
  })
  const hint = (MENU[sel]?.[1] ?? '').slice(0, bw)
  block.push('')
  block.push(hint)

  const x = Math.max(0, Math.round((w - bw) / 2))
  const y = Math.max(0, Math.round((h - block.length) / 2))
  const back = `${THEME.surface}${THEME.inactive}`

  // Each word is clickable over its full height -- the same rule the project
  // table keeps, where the thing you can see is the thing you can hit.
  spans.forEach(({ i, at }) => {
    for (let r = 0; r < tall; r++) hit.rows.push({ y: y + at + r, index: i, menu: true })
  })

  // A ground PER WORD, not one slab across the block.
  //
  // Sized to the widest word it covered the whole column, so a menu of three
  // short words blanked a rectangle forty characters wide and the dashboard
  // it is supposed to be standing in front of disappeared behind it. btop
  // darkens only what each word actually needs; everything between the words
  // is still the live screen, which is the entire reason for dimming rather
  // than replacing.
  const pad = 2

  return lines.map((line, row) => {
    const plain = [...line.replace(/\x1b\[[0-9;]*m/g, '')]
    while (plain.length < w) plain.push(' ')
    const b = block[row - y]
    if (b === undefined) return `${back}${plain.slice(0, w).join('')}${R}`

    const on = spans.find(sp => row - y >= sp.at && row - y < sp.at + tall)
    const lit = on?.i === sel
    const glyphs = [...b]
    // The unselected words are drawn in a LIGHT shade, not the same solid
    // block. Three words at equal weight made the menu read as a wall and the
    // selection as a colour change nobody notices; one bright word among two
    // faint ones reads as a selection from across the room.
    const text = lit ? b : b.replace(/█/g, '▒')
    const colour = row - y === block.length - 1
      ? THEME.dim
      : lit ? `${BOLD}${THEME.hi}` : THEME.inactive

    // The patch is this WORD's own width, centred like the word is.
    const at = x + Math.max(0, Math.round((bw - glyphs.length) / 2))
    const trimmed = b.replace(/\s+$/, '')
    const first = b.length - b.replace(/^\s+/, '').length
    const x0 = Math.max(0, at + first - pad)
    const x1 = Math.min(w, at + trimmed.length + pad)
    if (x1 <= x0) return `${back}${plain.slice(0, w).join('')}${R}`

    const ground = new Array(x1 - x0).fill(' ')
    ;[...text].forEach((g, i) => {
      const c = at + i - x0
      if (g !== ' ' && c >= 0 && c < ground.length) ground[c] = g
    })
    const left = plain.slice(0, x0).join('')
    const right = plain.slice(x1, w).join('')
    return `${back}${left}${R}${THEME.surface}${colour}${ground.join('')}${R}${back}${right}${R}`
  }).slice(0, h).join('\n')
}

function helpOverlay(w, h, page = 1) {
  const metrics = page === 2
  const b = box({
    w, title: metrics ? 'metrics' : 'keys', key: SUP[8],
    state: `${DIM}${BOLD}tab${R}${DIM} ${metrics ? 'keys' : 'what the numbers mean'} · any other key returns${R}`,
  })
  const out = [b.top, b.row('')]
  if (metrics) {
    const col = 13
    const text = Math.max(24, w - col - 8)
    // The page ends where the terminal does, and SAYS SO. The glossary grew
    // past the screen and the last entry simply stopped appearing -- which is
    // exactly the silent truncation AXI 5 exists to forbid, and which this
    // codebase already refuses in the legend and the project table.
    const room = h - 4
    let dropped = 0
    for (const [term, what] of GLOSSARY) {
      const lines = wrap(what, text).map((l, i) =>
        `  ${BOLD}${fit(i === 0 ? term : '', col)}${R}  ${DIM}${l}${R}`)
      if (out.length + lines.length > room) { dropped++; continue }
      for (const l of lines) out.push(b.row(l))
    }
    if (dropped) {
      out.push(b.row(`  ${DIM}+${dropped} more — a taller terminal, or ${R}${BOLD}skeins glossary${R}${DIM} for all of them${R}`))
    }
  } else {
    for (const [k, what] of KEYS) out.push(b.row(`  ${BOLD}${fit(k, 10)}${R}  ${DIM}${what}${R}`))
    out.push(b.row(''))
    out.push(b.row(`  ${DIM}skeins reports. It never starts, stops, routes or blocks anything.${R}`))
  }
  while (out.length < h - 1) out.push(b.row(''))
  out.push(b.bottom)
  return out.slice(0, h).join('\n')
}

// A pane is exactly rect.h lines of exactly rect.w visible columns — that
// invariant is what lets two of them sit side by side without the right one
// drifting a character further out on every row.
// The selected row, with its own colours intact.
//
// It used to be stripped to plain text and reversed, so the one row you are
// looking at was the only row on screen with no colour in it -- the context
// gauge, the agent hue and the heat of a number all vanished exactly when you
// selected the thing you wanted to read.
//
// A background colour is cancelled by every reset the row contains, so it is
// re-armed after each one. That is the whole trick, and it is why REV could
// never work here: REV is a mode, and a mode cannot be re-armed selectively
// without also re-reversing the foreground.
const selected = (row, w) => {
  const bg = `${THEME.selBg}${THEME.selFg}`
  const painted = row.replace(/\x1b\[0m/g, `${R}${bg}`)
  return `${bg}${painted}${' '.repeat(Math.max(0, w - width(row)))}${R}`
}

function pane(rect, { title, key, right = '', state = '', rows, line = null, head = '' }) {
  const b = box({ w: rect.w, title, key, right, state, line, head })
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

  if (state.help) return helpOverlay(w, h, state.help)

  // btop's geometry, measured from a real capture: a full-width headline, a
  // left column, and a tall right column for the one view that is a long list.
  // A preset drops boxes; the survivors expand into what is left. Guard every
  // read of a rect, because in preset 'table' there is no detail or feed at all.
  const preset = PRESETS[state.preset ?? 0] ?? PRESETS[0]
  const L = layout(w, h, preset.shown)
  // Guard every read of a rect: in preset 'table' there is no detail or feed,
  // and in 'velocity' there is no head either — that screen replaces the list
  // rather than sitting beside it.
  const listH = L.head?.h ?? 0, detailH = L.detail?.h ?? 0, feedH = L.feed?.h ?? 0
  const listW = L.head?.w ?? w, detailW = L.detail?.w ?? 0, feedW = L.feed?.w ?? 0

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

  // The hit map is established at the top, before anything can draw.
  //
  // It, `clock` and the width helper were each declared next to their first
  // heavy use, and each one in turn threw "cannot access before initialization"
  // once a second screen started drawing earlier in the function. Four of these
  // in this file now. Things every drawing path needs are set up here, once,
  // above all of them.
  //
  // Filled while drawing rather than recomputed in the input handler, because
  // the layout decides row positions at render time and two computations of the
  // same geometry drift.
  const hit = state.hit ?? (state.hit = mouse.hits())
  hit.rows.length = 0
  hit.tags.length = 0
  hit.feed.length = 0
  hit.tabs.length = 0
  // Below the hit map, not beside the help check: this is the sixth time a
  // screen in this file has been dispatched above something it needs and
  // thrown "cannot access before initialization". Anything that draws goes
  // AFTER the shared setup, always.
  //
  // Drawn from the real frame rather than instead of it, so what stands behind
  // the menu is the dashboard as it actually is this second.
  if (state.menu != null) {
    const frame = render({ ...state, menu: null }, size)
    hit.rows.length = 0
    hit.tags.length = 0
    hit.feed.length = 0
    hit.tabs.length = 0
    return menuOverlay(frame, state.menu, w, h, hit)
  }
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


  const syncText = snap => snap?.ahead === null ? 'no upstream' : `↑${snap.ahead} ↓${snap.behind}`
  const versionState = p => {
    if (!p?.root) return `${DIM}no git history${R}`
    const wt = worktrees(p.root)
    const ver = versionOf(p.root)
    const other = wt ? Math.max(0, wt.length - 1) : null
    const bits = [
      ver?.declared ? `v${ver.declared}` : null,
      ver?.tag ? `tag ${ver.tag}` : null,
      other === null ? null : other ? `${other} other checkout${other === 1 ? '' : 's'}` : 'no other checkouts',
    ].filter(Boolean)
    return `${DIM}${bits.length ? bits.join(' · ') : 'no version metadata'}${R}`
  }

  const versionRows = (p, W, { expanded = false } = {}) => {
    if (!p?.root) return [` ${DIM}no git history${R}`]
    const rows = []
    const ver = versionOf(p.root)
    const gapped = ver && ver.declared && ver.tag && ver.declared !== ver.tag
    if (ver?.declared || ver?.tag) {
      rows.push(` ${DIM}version${R} ${gapped ? LUT.failure[70] : THEME.fg}${fit(ver?.declared ?? '—', 10)}${R}${DIM} tag ${R}${fit(ver?.tag ?? '—', 10)}`)
    }
    const list = worktrees(p.root) ?? []
    if (!list.length) return rows.length ? rows : [` ${DIM}no worktrees found${R}`]

    const cpu = attributeToPaths(state.machine?.rows ?? [], list.map(wt => wt.path))
    for (const [i, wt] of list.entries()) {
      const snap = worktreeState(wt.path)
      const live = cpu.get(wt.path)
      const branch = wt.branch ?? 'detached'
      const current = wt.path === p.root
      const agents = live?.agents.size ? [...live.agents].map(a => `${hue(a)}${a}${R}`).join('+') : `${DIM}—${R}`
      const cpuText = live?.cpu ? `${meter(Math.min(1, live.cpu / 100), 4, LUT.heat)} ${live.cpu.toFixed(1)}%` : `${DIM}idle${R}`
      const changes = snap ? (snap.changes.length ? `${snap.changes.length} file${snap.changes.length === 1 ? '' : 's'}` : 'clean') : '—'
      const sync = syncText(snap)
      const prefix = expanded ? (i === list.length - 1 ? '└─' : '├─') : (current ? '●' : '○')
      const path = current ? 'current' : short(wt.path, p.root)
      rows.push(` ${THEME.hi}${prefix}${R} ${fit(branch, expanded ? 18 : 12)} ${DIM}${fit(path, Math.max(8, W - 54))}${R}`)
      if (expanded) {
        const commit = snap?.commits?.[0] ? `${snap.commits[0].hash} ${snap.commits[0].subject}` : 'no commits'
        rows.push(`    ${fit(agents, 12)} ${fit(cpuText, 12)} ${fit(changes, 9)} ${fit(sync, 13)} ${DIM}${fit(commit, Math.max(10, W - 55))}${R}`)
      } else {
        rows.push(`    ${fit(agents, 12)} ${fit(cpuText, 12)} ${fit(changes, 9)} ${DIM}${sync}${R}`)
      }
    }
    return rows
  }
  // ---- the project page --------------------------------------------------
  //
  // A drill-down, not an expansion. Two inline rows under a project could show
  // a session id and a timestamp; the question "what happened in this repo" needs
  // a screen. Enter or a click opens it, esc closes it, and it reuses the same
  // helpers as the list so the two cannot disagree about what a number means.
  function projectPage(p) {
    // The no-repo bucket is unrelated work sharing a row, so a branch picked
    // from whichever session happened to be first states something untrue about
    // every other session in it. The list already knew this; the page did not,
    // and titled the bucket "not in a repo — develop".
    const m = p.root ? metaOf(p) : { branch: null, doing: null }
    const A = layout.page ? null : null
    // Geometry: a tall headline with the graph, then three boxes across, then
    // collisions along the bottom if there are any.
    const collsHere = colls.filter(c => c.project === p.root)
    // Read before the geometry, because the geometry asks whether this repo
    // has anything to say about failure before it reserves a row for it.
    //
    const vp = velocity(p.root, p.events ?? [], { since, now, attention: att(p) })
    // WHY it failed, not just how often. A percentage tells you to worry; a
    // list of what shipped broken and what repaired it tells you where.
    const broke = (vp?.cfrOf?.verdicts ?? []).filter(v => v.failed).reverse()
    const repeats = vp?.cfrOf?.offenders ?? []
    // The graph is capped rather than given whatever is left. Twenty-three
    // gradations is not more information than ten — it is the same shape with a
    // finer ruler, and it was eating the panes that carry the actual detail.
    const GRAPH_MAX = 10
    const collH = collsHere.length ? Math.min(Math.max(4, collsHere.length + 3), Math.floor(h * 0.3)) : 0
    // Only when there is something to say. A box reading "no failures" on
    // every repo that never shipped twice is a row of furniture.
    const failH = broke.length ? Math.min(Math.max(5, Math.min(6, Math.max(broke.length, repeats.length)) + 2), Math.floor(h * 0.28)) : 0
    const rowsP = Math.max(2, Math.min(GRAPH_MAX, h - collH - failH - 15))
    // rowsP graph rows, the chart's own rule/times/legend, and two borders.
    const headHp = rowsP + CHART_BELOW + 2
    const lowerH = h - headHp - collH - failH
    // Four across. The fourth pane is version-control state because that is the
    // first thing a client asks for once they click into one project: what is
    // checked out, what changed, and how far it is from upstream/release.
    const q = Math.floor(w / 4)
    const rects = {
      head: { x: 0, y: 0, w, h: headHp },
      agents: { x: 0, y: headHp, w: q, h: lowerH },
      sessions: { x: q, y: headHp, w: q, h: lowerH },
      files: { x: q * 2, y: headHp, w: q, h: lowerH },
      vcs: { x: q * 3, y: headHp, w: w - q * 3, h: lowerH },
      // Two halves of one question: which files keep breaking, and which
      // releases they broke. Split rather than stacked, because reading one
      // without the other is how a popularity contest gets mistaken for a
      // finding.
      breaks: { x: 0, y: headHp + lowerH, w: Math.floor(w / 2), h: failH },
      broke: { x: Math.floor(w / 2), y: headHp + lowerH, w: w - Math.floor(w / 2), h: failH },
      colls: { x: 0, y: headHp + lowerH + failH, w, h: collH },
    }
    // --- the headline: this project's attention, one line per AGENT
    //
    // Thesis §6.5 one level down — the timeline is "per project, stacked by
    // agent". A single undifferentiated line cannot say whether a repo was one
    // agent working steadily or two agents in it at the same time, which is
    // most of what you open a project page to find out.
    const VALWP = 7
    const gwP = Math.max(24, w - 11)
    const colsP = Math.max(1, gwP - VALWP)
    const perAgentLines = (p.agents ?? [])
      .map(a => {
        const ev = (p.events ?? []).filter(e => e.agent === a)
        return {
          label: a,
          values: cumulative(attentionSeries(ev, colsP, since, now)),
          total: attentionOf(ev),
          agent: a,
        }
      })
      .sort((x, y) => y.total - x.total)
      .slice(0, MAX_SERIES)
      .map((s, i) => ({
        ...s,
        marker: MARKERS[i],
        // An agent already has a hue everywhere else on screen; borrowing the
        // chart palette here would give it two identities in one frame.
        color: hue(s.agent) || lineHue(i),
        value: humanMs(s.total),
      }))
    const scaleP = niceMax(Math.max(60_000, ...perAgentLines.flatMap(s => s.values)))
    const rows = perAgentLines.length
      ? chart(perAgentLines, { width: gwP, rows: rowsP, max: scaleP, since, now, lead: 6, pad: VALWP, fmt: humanMs, tier, caption: `attention · ${lookback}` })
      : [` ${DIM}no activity in ${lookback}${R}`]

    const totalAll = Math.max(1, projects.reduce((a, x) => a + att(x), 0))
    // The page carries this project's delivery too. Velocity across every
    // project answers "is it improving"; the number that belongs to the repo
    // you opened belongs on the screen about that repo, or the preset is the
    // only place it exists and you have to hold it in your head to use it.
    // Time spent COMPACTING, beside the attention it is part of.
    //
    // A compaction is the session rebuilding a picture it already had, and the
    // transcript states how long it took. Measured over thirty days on one
    // machine: 83 minutes, none of it visible anywhere. It is not a new metric
    // so much as the attention number becoming honest -- so it sits next to
    // that number rather than on a screen of its own.
    const compacted = (() => {
      const ids = new Set([...(p.events ?? []).map(e => e.session), ...(p.open ?? []).map(o => o.session)])
      let ms = 0, n = 0, auto = 0
      for (const id of ids) {
        const s = state.sessions?.get(id)
        if (!s?.compactions) continue
        n += s.compactions
        ms += s.compactMs ?? 0
        auto += s.autoCompactions ?? 0
      }
      return { ms, n, auto }
    })()
    const stats = [
      `${humanMs(att(p))} attention`,
      // Only when it happened. "0m compacting" on every quiet project is a
      // column of zeroes pretending to be information.
      compacted.n ? `${humanMs(compacted.ms)} of it compacting${compacted.auto ? ` · ${compacted.auto} auto` : ''}` : null,
      `${Math.round((att(p) / totalAll) * 100)}% of all`,
      `${p.sessions} session${p.sessions === 1 ? '' : 's'}`,
      `${p.files} file${p.files === 1 ? '' : 's'}`,
      vp ? `${vp.landed} landed` : null,
      vp && vp.lead !== null ? `${humanMs(vp.lead)} lead` : null,
      vp && vp.cfr !== null ? `${Math.round(vp.cfr * 100)}% fail` : null,
      collsHere.length ? `${collsHere.length} collision${collsHere.length === 1 ? '' : 's'}` : 'no collisions',
    ].filter(Boolean).join(`${DIM} · ${R}`)

    // --- agents: btop's per-core list, but the cores are agents
    const perAgent = (p.agents ?? []).map(a => {
      const ev = (p.events ?? []).filter(e => e.agent === a)
      // An agent present only through an OPEN session has no event to take a
      // timestamp from. Math.max(0) then gave it the epoch, and the pane read
      // "last 20688d" -- a number so wrong it reads as a broken tool rather
      // than as a session that simply has not written anything yet.
      const open = (p.open ?? []).filter(o => o.agent === a)
      return {
        agent: a,
        n: ev.length,
        at: Math.max(0, ...ev.map(e => e.at), ...open.map(o => o.at)),
        files: new Set(ev.map(e => e.path)).size,
      }
    }).sort((x, y) => y.n - x.n || y.at - x.at)
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

    // sessions and files reuse the tab bodies, so a number cannot mean one
    // thing on the page and another in the pane. Version-control is separate:
    // it is git/worktree state, not transcript activity.
    const F = { fit, hue, ago, trunc, short, humanTokens, meter, DIM, R, BOLD, LUT, limitOf, ceiling }
    const tctx = k => ({ state, now, detailW: rects[k].w - 2, detailH: rects[k].h, collsHere, lookback, F })
    const sessRows = sessionsTab(p, tctx('sessions'))
    const fileRows = filesTab(p, tctx('files'))
    const vcsRows = versionRows(p, rects.vcs.w - 2).slice(0, Math.max(1, rects.vcs.h - 2))

    const panes = [
      { rect: rects.head, lines: pane(rects.head, {
        title: `${p.name}${m.branch ? ` — ${m.branch}` : ''}`, key: SUP[0], line: THEME.boxHead,
        right: (() => {
          const label = '← back'
          const painted = `${THEME.hi}${label}${R}  ${DIM}${clock}${R}`
          const x0 = rects.head.x + rects.head.w - width(painted) - 3
          hit.tags.push({ y: rects.head.y, x0, x1: x0 + label.length, key: '\x1b' })
          return painted
        })(),
        state: (() => {
          // The page said 'esc back' and did nothing when clicked — the same
          // inert-label problem as the preset. There is no keyboard-free way
          // out of a full screen otherwise.
          //
          // And the stats line grew: it carries landed, lead, rework and the
          // tool count now, and on a narrow page it pushed the controls clean
          // off the border. So the stats YIELD to the controls rather than the
          // other way round — a number you cannot read is a nuisance, a way
          // out you cannot see is a trap.
          //
          // 'tab panes' is gone. It was inherited from the detail pane, where
          // tab switches between tabs that share one box — this page shows
          // agents, sessions, files and version control all at once, so there
          // was nothing to switch and the key did nothing. A control that does
          // nothing is worse than an absent one: it makes the reader doubt the
          // keyboard rather than the label.
          const parts = [
            { key: '\x1b', label: 'back', glyph: 'esc' },
            { key: 'a', label: lookback, glyph: 'a' },
            { key: 'q', label: 'quit', glyph: 'q' },
          ]
          const need = parts.reduce((n, c) => n + width(tag(c.glyph, c.label)) + width(TAG_SEP), 0)
          const shown = width(stats) + need + 5 <= w ? stats : clip(stats, Math.max(0, w - need - 5))
          const y = rects.head.y + rects.head.h - 1
          let at = 3 + width(shown) + 2
          const out = []
          for (const c of parts) {
            const s = tag(c.glyph, c.label)
            const len = width(s)
            hit.tags.push({ y, x0: rects.head.x + at, x1: rects.head.x + at + len, key: c.key })
            at += len + width(TAG_SEP)
            out.push(s)
          }
          return `${shown}  ${out.join(TAG_SEP)}`
        })(),
        rows,
      }) },
      { rect: rects.agents, lines: pane(rects.agents, { title: 'agents', line: THEME.boxDetail, rows: agentRows,
        state: `${DIM}${perAgent.length} in ${lookback}${R}` }) },
      { rect: rects.sessions, lines: pane(rects.sessions, { title: 'sessions', line: THEME.boxDetail, rows: sessRows }) },
      { rect: rects.files, lines: pane(rects.files, { title: 'files', line: THEME.boxFeed, rows: fileRows,
        state: `${DIM}${p.files} touched${R}` }) },
      { rect: rects.vcs, lines: pane(rects.vcs, { title: 'version control', line: THEME.boxFeed, rows: vcsRows,
        state: versionState(p) }) },
    ]
    if (failH > 0) {
      const bw = rects.breaks.w - 2
      panes.push({ rect: rects.breaks, lines: pane(rects.breaks, {
        title: 'what keeps breaking', line: LUT.failure[60],
        // The denominator is the whole point. "7 times" reads as a fragile
        // file; "7 of 22" reads as what it is -- and without it a reader goes
        // and rewrites whichever file ships most often.
        state: `${DIM}repaired after shipping · of the releases it shipped in${R}`,
        rows: repeats.slice(0, Math.max(1, failH - 2)).map(o => {
          const pct = Math.round((o.hotfixed / Math.max(1, o.shipped)) * 100)
          return ` ${LUT.failure[pct]}${String(`${o.hotfixed}/${o.shipped}`).padStart(6)}${R} ${DIM}${String(pct).padStart(3)}%${R}  ${fit(short(o.file, p.root), Math.max(8, bw - 14))}`
        }),
      }) })
      panes.push({ rect: rects.broke, lines: pane(rects.broke, {
        title: 'and what repaired it', line: LUT.failure[60],
        state: `${DIM}${broke.length} of ${vp?.cfrOf?.judged ?? 0} deployments shipped something that came back${R}`,
        rows: broke.slice(0, Math.max(1, failH - 2)).map(v => {
          const tag = v.name ?? new Date(v.at).toISOString().slice(0, 10)
          // The subject of the commit that repaired it, not a count. A
          // developer recognises their own commit message instantly and a
          // number tells them nothing they can act on.
          return ` ${LUT.failure[70]}${fit(tag, 12)}${R}${DIM}${fit(trunc(v.by[0] ?? '', Math.max(10, rects.broke.w - 17)), Math.max(10, rects.broke.w - 16))}${R}`
        }),
      }) })
    }
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

  // ---- graph: who is in the same file as whom -----------------------------
  //
  // The picture the tool is actually about. Every other screen answers "what
  // happened"; this one answers "where are two of you standing on the same
  // floorboard", which is the thing no per-session dashboard can see at all.
  //
  // ONE project's contention, not the machine's. The whole-machine version is
  // 1573 nodes on this developer's laptop, which is a hairball by every
  // measure in the literature; one project is 1-13 sessions and up to 36
  // contested files, which is the size a node-link picture is FOR.
  function graphScreen(V) {
    const p = projects[sel] ?? projects[0]
    // Structure comes from git; danger comes from the transcripts. Two
    // sources, one picture, and each is the only one that knows its half.
    const hits = colls.filter(c => c.project === p?.root)
    // Keyed REPO-RELATIVE, because that is how git names a file.
    //
    // Collisions carry absolute paths and `git log --name-only` carries paths
    // relative to the repo root, so the two never matched: the contested file
    // was added as a SECOND node beside its own coupled one, and the same file
    // drew twice -- once in its cluster and once orphaned in red.
    const rel = f => (p?.root && f.startsWith(`${p.root}/`) ? f.slice(p.root.length + 1) : f)
    const contested = new Map()
    for (const c of hits) {
      const k = rel(c.path)
      const cur = contested.get(k)
      if (!cur || c.gapMin < cur.gapMin) contested.set(k, c)
    }
    const ships = p?.root ? landings(p.root, { since }) : null
    const g = coupled(ships, { root: p?.root, contested })
    const W = V.w - 2
    const H = Math.max(3, V.h - 4)
    const rows = []

    if (!g.nodes.length) {
      rows.push('')
      rows.push(` ${DIM}${p ? p.name : 'no project'} has no two files that change together${R}`)
      rows.push('')
      rows.push(` ${DIM}a node is a file and an edge is "these two are edited in the same${R}`)
      rows.push(` ${DIM}commit". It needs commits on the trunk inside ${lookback} to find any.${R}`)
    } else {
      const c = canvas(W, H)
      const mx = 2, my = 4
      const at = forceLayout(g.nodes, g.edges, { seed: p?.root ?? p?.name ?? 'skeins' })
      const px = i => mx + at[i].x * (c.sw - 2 * mx - 1)
      const py = i => my + at[i].y * (c.sh - 2 * my - 1)

      // The edge's brightness IS its coupling. A pair that always moves
      // together is the finding; a pair that sometimes does is context.
      for (const [a, b, ratio] of g.edges) {
        c.line(px(a), py(a), px(b), py(b), ratio >= 0.9 ? THEME.dim : THEME.inactive)
      }

      g.nodes.forEach((n, i) => {
        const x = Math.round(px(i)), y = Math.round(py(i))
        // Contested files are red whatever their coupling. That is the half
        // of this picture no other tool on the machine can draw.
        const colour = n.contested ? LUT.failure[95] : LUT.activity[Math.min(100, (n.weight ?? 1) * 12)]
        const r = n.contested ? 2 : Math.min(2, Math.max(1, Math.round((n.weight ?? 1) / 4)))
        for (let ox = -r; ox <= r; ox++) for (let oy = -r * 2; oy <= r * 2; oy++) c.dot(x + ox, y + oy, colour, true)
      })

      const taken = new Set()
      const free = (cx, cy, len) => {
        if (cy < 0 || cy >= c.h || cx < 0 || cx + len > c.w) return false
        for (let i = -1; i <= len; i++) if (taken.has(`${cy}:${cx + i}`)) return false
        return true
      }
      const claim = (cx, cy, len) => { for (let i = 0; i < len; i++) taken.add(`${cy}:${cx + i}`) }
      // Contested first, then the files that change most: when two labels
      // compete for a row, the one that matters more survives.
      const order = g.nodes.map((n, i) => i)
        .sort((a, b) => (g.nodes[b].contested ? 1 : 0) - (g.nodes[a].contested ? 1 : 0) || (g.nodes[b].weight ?? 0) - (g.nodes[a].weight ?? 0))
      for (const i of order) {
        const n = g.nodes[i]
        const cx = Math.round(px(i) / 2), cy = Math.round(py(i) / 4)
        // Paths truncate from the LEFT: the end tells two files apart, the
        // start is the part they share.
        const name = n.label.length <= 20 ? n.label : `…${n.label.slice(-19)}`
        const tail = n.contested ? ` ⚠ ${n.contested.gapMin}m apart` : ` ×${n.weight}`
        const txt = `${name}${tail}`
        const spots = [[cx + 2, cy], [cx - txt.length - 2, cy], [cx + 2, cy - 1], [cx + 2, cy + 1]]
        const spot = spots.find(([x, y]) => free(x, y, txt.length))
        if (!spot) continue
        claim(spot[0], spot[1], txt.length)
        c.label(spot[0], spot[1], txt, n.contested ? LUT.failure[95] : THEME.fg)
      }
      rows.push(...c.rows())
    }

    // Nodes with no edges are not a graph, and scattering them reads as one.
    //
    // Two projects showed this: one with no git at all, where coupling cannot
    // be computed and only the contested files are drawn, and one whose files
    // simply never move together. Both came out as red dots flung across an
    // empty screen with no line between any of them, which looks broken rather
    // than quiet. Say which it is.
    const why = !g.edges.length
      ? (!ships
          ? `${DIM}no git history here, so nothing can be paired — these are the files two sessions were both in${R}`
          : `${DIM}no two files in this repo change together often enough to pair${R}`)
      : null

    const capped = [
      g.morePairs ? `+${g.morePairs} weaker pair${g.morePairs === 1 ? '' : 's'}` : null,
      g.moreFiles ? `+${g.moreFiles} more file${g.moreFiles === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' · ')

    return compose(h, [{ rect: V, lines: pane(V, {
      title: 'graph', key: SUP[4], line: THEME.boxHead,
      head: (() => {
        const at = V.x + 6 + 'graph'.length + width(SUP[4])
        hit.tags.push({ y: V.y, x0: at, x1: at + 'm menu'.length, key: 'm' })
        return tag('m', 'menu')
      })(),
      right: (() => {
        const painted = `${DIM}preset ${R}${BOLD}${(state.preset ?? 0) + 1} ${NAMES[state.preset ?? 0] ?? ''}${R}  ${clock} ${DIM}${pulse}${R}`
        const x0 = V.x + V.w - width(painted) - 3
        hit.tags.push({ y: V.y, x0, x1: x0 + 12, key: 'p' })
        return painted
      })(),
      rows: [
        ` ${BOLD}${p?.name ?? '—'}${R}${DIM} · ${g.files} file${g.files === 1 ? '' : 's'} changed · ${g.pairs} coupled pair${g.pairs === 1 ? '' : 's'}${capped ? ` · ${capped}` : ''}${R}` +
          (contested.size ? `  ${LUT.failure[95]}${contested.size} collision${contested.size === 1 ? '' : 's'}${R}` : `  ${DIM}no collisions in ${lookback}${R}`),
        ...(why ? [` ${why}`] : []),
        ...rows,
      ],
      state: (() => {
        const note = `${DIM}an edge is "changed in the same commit" · ${R}${LUT.failure[95]}●${R}${DIM} two sessions were both in it · ×n = how often it changes${R}`
        const keys = [tag('↑↓', 'project'), tag('1', 'back'), tag('p', 'preset'), tag('a', lookback), tag('q', 'quit')]
        return `${note}  ${keys.join(TAG_SEP)}`
      })(),
    }) }])
  }

  // ---- estate: what is actually checked out, and what is running --------
  //
  // A different SOURCE from every other screen. Everything else reads agent
  // transcripts or git history -- records of what already happened. This
  // reads the OS, right now: which worktree a project is in, whether the
  // working copy matches what it claims to be, and which agent process is
  // spending CPU where. None of that exists in a transcript.
  function estateScreen(V) {
    return worktreesScreen(V, { title: 'estate', key: SUP[5] })
  }

  // One-project worktree view: linked checkouts are useful only with their owner.
  function worktreesScreen(V, { title = 'worktrees', key = SUP[6] } = {}) {
    const p = projects[sel]
    const W = V.w - 2
    const rows = p?.root
      ? versionRows(p, W, { expanded: true })
      : [` ${DIM}selected project has no git worktrees${R}`]
    const live = (state.machine?.rows ?? []).filter(r => p?.root && (r.cwd === p.root || r.cwd?.startsWith(`${p.root}/`))).length
    return compose(h, [{ rect: V, lines: pane(V, {
      title: `${p?.name ?? 'no project'} · ${title}`, key, line: THEME.boxHead,
      head: (() => {
        const label = `${p?.name ?? 'no project'} · ${title}`
        const at = V.x + 6 + label.length + width(key)
        hit.tags.push({ y: V.y, x0: at, x1: at + 'm menu'.length, key: 'm' })
        return tag('m', 'menu')
      })(),
      right: (() => {
        const painted = `${DIM}selected project ${sel + 1}/${projects.length}${R}  ${clock} ${DIM}${pulse}${R}`
        const x0 = V.x + V.w - width(painted) - 3
        hit.tags.push({ y: V.y, x0, x1: x0 + 12, key: 'p' })
        return painted
      })(),
      rows,
      state: `${DIM}${live} live process${live === 1 ? '' : 'es'} here · recent commits · uncommitted files · ahead/behind upstream${R}  ${tag('↑↓', 'project')} ${tag('1', 'back')} ${tag('r', 'refresh')} ${tag('q', 'quit')}`,
    }) }])
  }

  // ---- velocity: what landed, and how long it took to land ----------------
  //
  // DORA, translated for ONE developer. Three quarters of DORA does not
  // survive that translation and `src/delivery.js` says which parts and why;
  // the short version is that mean-time-to-restore needs incidents nobody
  // here has.
  //
  // The big chart plots the running total of landings, so a steeper line is a
  // faster week — which is the whole question: is it improving. Change failure
  // rate gets its own panel beside the table, because it is a verdict on the
  // row you are looking at rather than a comparison across all of them.
  function velocityScreen(V) {
    const cols = Math.max(24, V.w - 11) - 7
    // Same split as the headline: the chart takes a share rather than the
    // rows the table did not want.
    const W = V.w - 2
    // ---- are you improving ------------------------------------------------
    //
    // The only line on any screen that answers "is this getting better". It is
    // MACHINE-WIDE and stated as such: measured on real data, per-project
    // fortnights are mostly empty, and an arrow drawn from two landings is a
    // confident lie.
    const T = trend(projects, state.sessions, { now, since })
    const rows4 = [
      { label: 'landed', good: 'up', vals: T.buckets.map(b => b.landed), fmt: v => String(v) },
      { label: 'attention per change', good: 'down', vals: T.buckets.map(b => b.perShip), fmt: v => humanMs(v) },
      { label: 'change failure rate', good: 'down', vals: T.buckets.map(b => b.cfr), fmt: v => `${Math.round(v * 100)}%` },
      { label: 'spent compacting', good: 'down', vals: T.buckets.map(b => b.compactShare), fmt: v => `${(v * 100).toFixed(1)}%` },
    ]
    const CELL = 7
    // The verdict WORD is the first thing to go on a narrow terminal, not the
    // numbers: an arrow still points, and the numbers are the evidence.
    const words = W >= 118
    const VERD = words ? 12 : 2
    const bandRows = []
    if (T.buckets.length) {
      bandRows.push(` ${DIM}${'─'.repeat(Math.max(0, W - 2))}${R}`)
      const heads = T.buckets.map((b, i) => (i === T.buckets.length - 1 ? 'now' : `-${(T.buckets.length - i) * 2}w`))
      const lay = (left, cells, tail) => {
        const body = cells.map(s => String(s).padStart(CELL)).join('')
        const pad = Math.max(1, W - 2 - width(left) - body.length - width(tail) - 1)
        return `${left}${' '.repeat(pad)}${body} ${tail}`
      }
      // The heading's tail must be as wide as a row's -- arrow, space, verdict
      // -- or the column labels sit two cells left of their own numbers.
      bandRows.push(lay(` ${BOLD}ARE YOU IMPROVING${R}${DIM}  every project · 2 weeks each · ${lookback} loaded${R}`,
        heads, ' '.repeat(VERD)))
      // Rows that are ALL dots are collapsed into one sentence.
      //
      // At a 24h window only the newest fortnight is loaded, so three of the
      // four rows were a field of dots pretending to be a table -- four
      // columns of nothing, four times over. `landed` survives because it
      // comes from git, which reaches back regardless of the window.
      const dead = rows4.filter(r => r.vals.every(v => v === null || v === undefined))
      const alive = rows4.filter(r => !dead.includes(r))
      for (const r of alive) {
        // Enough landings, or no direction at all. Two landings moving to
        // three is not an improvement.
        const enough = T.buckets[T.buckets.length - 1].landed >= MIN_LANDED
        const d = enough ? direction(r.vals, { good: r.good }) : null
        const arrow = !d ? ' ' : d.dir === 'flat' ? '→' : d.dir === 'up' ? '↑' : '↓'
        const verdict = !d ? '' : d.better === null ? 'steady' : d.better ? 'better' : (r.good === 'down' ? 'worse' : 'slower')
        const colour = !d || d.better === null ? THEME.fg : d.better ? LUT.activity[70] : LUT.failure[85]
        // A bucket the transcripts do not cover prints a dot, never a zero.
        const cells = r.vals.map(v => (v === null || v === undefined ? `${DIM}·${R}` : `${colour}${r.fmt(v)}${R}`))
        const body = cells.map(s => {
          const pad = Math.max(0, CELL - width(s))
          return ' '.repeat(pad) + s
        }).join('')
        const left = `   ${DIM}${r.label}${R}`
        const tail = `${colour}${arrow}${R}${words ? ` ${DIM}${fit(verdict, VERD - 2)}${R}` : ''}`
        const pad = Math.max(1, W - 2 - width(left) - width(body) - width(tail) - 1)
        bandRows.push(`${left}${' '.repeat(pad)}${body} ${tail}`)
      }
      if (dead.length) {
        const names = dead.map(r => r.label).join(', ')
        bandRows.push(`   ${DIM}${trunc(`${names} — need a wider window`, Math.max(20, W - 22))}${R}  ${BOLD}${THEME.hi}a${R}${DIM} widens it${R}`)
      }
      if (alive.some(r => r.vals.some(v => v === null || v === undefined))) {
        const note = `${DIM}· = before your transcripts begin${R}`
        bandRows.push(`${' '.repeat(Math.max(1, W - 1 - width(note)))}${note}`)
      }
    }

    const bandH = bandRows.length
    // The CHART yields the band's rows, not the failure panel.
    //
    // The chart claimed 60% of the screen before the band existed, so the band
    // came out of what was left and the panel -- which needs eight rows --
    // silently disappeared. That panel is the thing this screen was built
    // around; a graph of the same numbers one row taller is not worth it.
    const rowsV = Math.max(5, Math.min(18, Math.round((V.h - 8 - bandH) * 0.6)))
    const stats = projects.map(p => ({
      p,
      v: velocity(p.root, p.events ?? [], { since, now, attention: att(p) }),
      ships: landings(p.root, { since }),
    }))
    // TOP CHART: cumulative landings. This screen is called velocity, and the
    // big graph has to be the thing the screen is named after. It was replaced
    // by change failure rate, and the result was a reader who knew one of the
    // two numbers was on top and could not tell which.
    //
    // A project with no git history is not a line with nothing in it — it is
    // a project this chart cannot speak about. It stays out of the legend
    // rather than appearing there with a blank marker.
    const ranked = [...stats].sort((a, b) => (b.v?.landed ?? -1) - (a.v?.landed ?? -1))
    const lines = ranked.filter(s => s.ships).slice(0, MAX_SERIES).map((s, i) => ({
      label: s.p.name,
      marker: MARKERS[i],
      color: lineHue(i),
      value: String(s.v.landed),
      values: cumulative(bucket(s.ships.filter(x => !x.release).map(x => x.at), cols, since, now)),
    }))
    const rowsOut = []
    if (lines.length) {
      rowsOut.push(...chart(lines, {
        width: Math.max(24, V.w - 11), rows: rowsV,
        max: Math.max(1, ...lines.flatMap(s => s.values)),
        since, now, lead: 6, pad: 7, tier,
        fmt: v => String(Math.round(v)),
        caption: `landed · ${lookback}`,
        focus: lines.findIndex(l => l.label === projects[sel]?.name),
      }))
    } else {
      rowsOut.push(` ${DIM}no git history in any of these projects${R}`)
    }
    rowsOut.push('')
    const nameW = Math.max(12, Math.min(26, projects.reduce((m, p) => Math.max(m, p.name.length + 2), 10)))
    // A rate over a window shorter than a week is a projection, not a
    // measurement, so the column says which one it is.
    const weekly = (now - since) >= 7 * 86_400_000
    // DEPLOYS sits beside CFR because it is what makes CFR mean anything.
    // "0%" over two deployments and "0%" over thirty are different statements
    // and were rendering identically — the number was in the CLI door only,
    // which is exactly the second-class door D13 exists to prevent.
    //
    // The failure panel outranks the ATTENTION column, and on a narrow
    // terminal it takes it: attention per project is the headline's entire
    // job and is one keystroke away, whereas the failure trend has nowhere
    // else on the screen to live. Same rule as the project list — drop the
    // least valuable column first rather than dropping the feature.
    const full = 1 + nameW + 9 + 8 + 8 + 12 + 9 + 10 + 12
    const fits = w => W - w - 2 >= 26
    const showAttn = fits(full) || !fits(full - 12)
    const tableW = showAttn ? full : full - 12
    const tableRows = []
    tableRows.push(`${THEME.header} ${fit('PROJECT', nameW)}${fit('  LANDED', 9)}${fit(weekly ? '  /WEEK' : '   /DAY', 8)}${fit('   LEAD', 8)}${fit('  ATTN/SHIP', 12)}${fit('     CFR', 9)}${fit('  DEPLOYS', 10)}${showAttn ? fit('  ATTENTION', 12) : ''}${R}`)
    const topLanded = Math.max(1, ...stats.map(s => s.v?.landed ?? 0))
    // The body is the height of the BOX, not the height of the list, because
    // the failure panel beside the table is as tall as the space there is: a
    // machine with three projects gets the same graph as one with thirty.
    const bodyH = Math.max(4, V.h - 2 - rowsOut.length - bandH)
    // `stats`, not `ranked`: the table is in the app's order so one press of
    // an arrow key moves exactly one row.
    //
    // Sorting the table by failure rate introduced a second, invisible
    // ordering: the cursor moved one step through `projects` and the highlight
    // appeared to jump two rows or skip one, because the two lists disagreed
    // about what "next" meant. A screen must not have an order of its own.
    for (const { p, v } of stats.slice(0, Math.max(1, bodyH - 1))) {
      const on = p === projects[sel]
      // A project with no git history says so. "0 landed" would be a claim
      // about your week rather than about what skeins can see.
      const cells = v
        ? `${LUT.activity[Math.round((v.landed / topLanded) * 100)]}${String(v.landed).padStart(7)}${R}  ` +
          `${fit((weekly ? v.perWeek : v.perDay).toFixed(1).padStart(6), 8)}` +
          `${fit((v.lead === null ? '—' : humanMs(v.lead)).padStart(6), 8)}` +
          `${fit((v.perShip === null ? '—' : humanMs(v.perShip)).padStart(9), 12)}` +
          `${v.cfr === null ? `${DIM}${'—'.padStart(7)}${R}` : `${LUT.failure[Math.round(v.cfr * 100)]}${`${Math.round(v.cfr * 100)}%`.padStart(7)}${R}`}  ` +
          // The count, and how many of them could actually be judged. The
          // newest one never can — nothing has shipped after it yet.
          `${fit((v.cfrOf ? `${v.cfrOf.judged}/${v.cfrOf.deployments}` : '—').padStart(8), 10)}` +
          `${showAttn ? fit(humanMs(att(p)).padStart(9), 12) : ''}`
        : `${DIM}${'no git history'.padStart(7)}${R}`
      const row = ` ${fit(`${THEME.fg}${p.name}${R}`, nameW)}${cells}`
      hit.rows.push({ y: V.y + 1 + rowsOut.length + tableRows.length, index: projects.indexOf(p) })
      tableRows.push(on
        ? selected(row, tableW)
        : row)
    }

    // SIDE PANEL: change failure rate for the row under the cursor, in the
    // space the table was leaving black — which is where a reader looking at a
    // row already expects the detail about that row to be.
    //
    // ONE line, not six. Six at once was a comparison nobody asked for, and it
    // forced the colours to encode WHICH project rather than how bad it is, so
    // a repo failing a third of its deployments drew in whatever hue its rank
    // happened to give it. A failure rate is a verdict, and the verdict
    // belongs in the colour.
    const here = stats.find(s => s.p === projects[sel]) ?? stats[0]
    // Red at every value; the TONE carries the severity. The legend row still
    // names DORA's band (0-15% elite and high, 16-30% medium, above that low)
    // so the number means something outside skeins — but the colour no longer
    // has to encode which band, only how bad.
    const band = LUT.failure[Math.round((here?.v?.cfr ?? 0) * 100)]
    const sideW = W - tableW - 2
    const side = []
    if (sideW >= 26 && bodyH >= 8) {
      const name = here?.p?.name ?? ''
      const rate = here?.v?.cfr == null ? '—' : `${Math.round(here.v.cfr * 100)}%`
      // DORA's own words when there is room for them, and the project name
      // over the jargon when there is not: `CHANGE FAILURE · fir…` names
      // neither the metric nor the row.
      const head = `CHANGE FAILURE · ${name}`
      side.push(`${DIM}${fit(head.length <= sideW - 6 ? head : `FAILURE · ${name}`, sideW - 6)}${R}${band}${rate.padStart(5)}${R}`)
      // The reasons exist on the project page and NOTHING on this screen said
      // so. A reader looking at 13% has exactly one next question -- at what --
      // and the answer was one keystroke away with no sign of it.
      // The count is STATED whenever there is one, and only the pointer is
      // conditional. A clean window rendered a blank line, which reads as a
      // missing feature rather than as the best possible result -- and left a
      // reader hunting for reasons that legitimately do not exist yet.
      //
      // The window is named because it is the whole story here: the same
      // project reads 0 of 2 over six hours and 7 of 48 over thirty days.
      const judged = here?.v?.cfrOf?.judged ?? 0
      const failed = here?.v?.cfrOf?.verdicts?.filter(v => v.failed).length ?? 0
      side.push(!judged
        ? ''
        : failed
          ? ` ${DIM}${failed} of ${judged} came back in ${lookback} · ${R}${BOLD}⏎${R}${DIM} which files, and what repaired them${R}`
          : ` ${DIM}none of ${judged} came back in ${lookback}${R}`)
      if (here?.v?.cfrOf?.verdicts?.length) {
        side.push(...chart([{
          // The legend row would otherwise repeat the title. Spend it on the
          // DORA band instead, so the colour has a name and the reader can
          // take the number somewhere other than skeins.
          label: here.v.cfr <= 0.15 ? 'elite/high' : here.v.cfr <= 0.30 ? 'medium' : 'low',
          marker: MARKERS[0], color: band,
          values: cfrSeries(here.v.cfrOf.verdicts, Math.max(8, sideW - 12), since, now),
        }], {
          width: Math.max(12, sideW - 6), rows: Math.max(3, bodyH - 2 - CHART_BELOW), tier,
          // Always the full scale. A failure rate read against its own peak
          // makes 4% look like a catastrophe and 90% look like a plateau; the
          // whole point of the number is where it sits between none and all.
          max: 1, since, now, lead: 4, pad: 1,
          fmt: v => `${Math.round(v * 100)}%`,
        }))
      } else {
        // One line, not five. The prose version replaced the panel with what
        // read as an error screen for the ordinary case of a young repo.
        side.push(` ${DIM}needs two deployments to compare${R}`)
      }
    }

    // Zip. The table keeps a fixed width so the panel starts in the same
    // column on every row, whatever the longest project name happens to be.
    // The rule runs the FULL height of the body, not just the rows the panel
    // happens to fill. Drawn only beside the chart it read as a stray glyph on
    // three rows rather than as the edge of a panel.
    for (let i = 0; i < bodyH; i++) {
      const left = tableRows[i] ?? ''
      if (!side.length) { if (i < tableRows.length) rowsOut.push(left); continue }
      rowsOut.push(`${left}${' '.repeat(Math.max(0, tableW - width(left)))}${DIM}│${R} ${side[i] ?? ''}`)
    }
    rowsOut.push(...bandRows)
    const anyGit = stats.filter(s => s.v).length
    return compose(h, [{ rect: V, lines: pane(V, {
      title: 'velocity', key: SUP[3], line: THEME.boxHead,
      right: (() => {
        // The preset label is a control everywhere else on screen, and it was
        // inert here — which on a full-screen preset means no visible way out.
        const label = `preset ${(state.preset ?? 0) + 1} ${NAMES[state.preset ?? 0] ?? ''}`
        const painted = `${DIM}preset ${R}${BOLD}${(state.preset ?? 0) + 1} ${NAMES[state.preset ?? 0] ?? ''}${R}  ${clock} ${DIM}${pulse}${R}`
        const x0 = V.x + V.w - width(painted) - 3
        hit.tags.push({ y: V.y, x0, x1: x0 + label.length, key: 'p' })
        return painted
      })(),
      // Naming what is NOT here is half the point: two of DORA's four cannot
      // be computed from a laptop, and a tool that quietly shows two and calls
      // it DORA is lying by omission.
      //
      // And the way OUT has to be on screen. This preset replaces the whole
      // dashboard, so a reader with no controls on the border has no way to
      // discover that p or 1 goes back — the screen reads as a dead end.
      state: (() => {
        const note = `${DIM}${anyGit}/${projects.length} in git · landed excludes releases · CFR = deployments hotfixed · no MTTR without incidents${R}`
        // The two escape hatches are PINNED and everything else yields to
        // them, the same rule the headline keeps: the least discoverable
        // things on screen are how to get help and how to get out, so they
        // are the last to go rather than the first to be trimmed off the end.
        const pinned = [{ key: '?', label: 'keys', glyph: '?' }, { key: 'q', label: 'quit', glyph: 'q' }]
        const optional = [
          { key: '1', label: 'back', glyph: '1' },
          { key: 'p', label: 'preset', glyph: 'p' },
          { key: '\r', label: 'open', glyph: '⏎' },
          { key: 'a', label: lookback, glyph: 'a' },
        ]
        const sep = width(TAG_SEP)
        const room = V.w - 2 - 3 - width(note) - 2
        let used = pinned.reduce((n, c) => n + width(tag(c.glyph, c.label)) + sep, 0)
        const keep = []
        for (const c of optional) {
          const cost = width(tag(c.glyph, c.label)) + sep
          if (used + cost > room) break
          used += cost
          keep.push(c)
        }
        const y = V.y + V.h - 1
        let at = 3 + width(note) + 2
        const painted = []
        for (const c of [...keep, ...pinned]) {
          const s = tag(c.glyph, c.label)
          hit.tags.push({ y, x0: V.x + at, x1: V.x + at + width(s), key: c.key })
          at += width(s) + sep
          painted.push(s)
        }
        return `${note}  ${painted.join(TAG_SEP)}`
      })(),
      rows: rowsOut,
    }) }])
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
    // LAST costs seven, not six: every column is written as a space plus its
    // width, and the separator in front of the last one was never budgeted.
    // One column over is enough for the row clipper to eat the end of it, so
    // the header read `LA…` and every row's age was truncated with it.
    let budget = listW - 2 - 1 - 7 - name      // borders, lead, LAST, name
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
  const clock = clock12(now, { seconds: true })

  // Dispatched here and not earlier: projectPage reads `clock`, and a function
  // declaration hoists while a const does not. Calling it above this line threw
  // "Cannot access 'clock' before initialization" — the same trap this file has
  // hit before by putting a helper where it reads best rather than after what
  // it depends on.
  if (state.page) {
    const target = projects.find(x => (x.root ?? x.name) === state.page)
    if (target) return projectPage(target)
  }
  // Same reason, same place: velocityScreen reads clock and pulse.
  if (L.velocity) return velocityScreen(L.velocity)
  if (L.graph) return graphScreen(L.graph)
  if (L.estate) return estateScreen(L.estate)
  if (L.worktrees) return worktreesScreen(L.worktrees)

  // Fitted to the budget rather than switched at two breakpoints, and the two
  // escape hatches are PINNED. Adding one control used to push '? keys' off the
  // end, which is precisely backwards: the least discoverable thing on screen
  // is how to get help and how to get out, so those are the last to go.
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
    // `menu` moved to the TITLE line, where btop keeps it, so the footer does
    // not print it twice and '? keys' gets its pinned slot back.
    const pinned = [mk('?', 'keys'), mk('q', 'quit')]
    const optional = [
      mk('⏎', 'expand', '\r'),
      mk('s', state.sort ?? 'recent'),
      mk('p', NAMES[state.preset ?? 0] ?? 'preset'),
      mk('a', lookback),
      mk('/', state.filter || 'filter'),
      mk('c', state.onlyColliding ? 'colliding' : 'all'),
    ]
    const plain = s => s.replace(/\x1b\[[0-9;]*m/g, '')
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
  // ---- the headline chart: attention, per project, over the window --------
  //
  // Founder thesis §6.5, restored. What stood here was ONE aggregate braille
  // graph of edits per minute across every project at once — it moved, which
  // proved the program was alive, and it answered nothing. Which project ate
  // the afternoon was left to a fourteen-character sparkline in a table column.
  // That is the core value of the tool (§2: "where did my week actually go —
  // per project, over time") demoted to texture.
  //
  // So the headline is now the chart the thesis specified: one line per
  // project, over the window the header already states. The y value is the
  // share of each slice the project was actually being WORKED — attention, not
  // an edit count (§2: two projects with a hundred edits each can be an
  // afternoon and ten minutes). It reads as a real 0-100%, comparable between
  // projects and between days.
  //
  // The liveness the old graph carried has not been dropped, it has been
  // condensed: the strip below still states the rate, who is here, and who is
  // writing, which is what anyone actually read off it.
  const stream0 = Array.isArray(state.events) ? state.events : []
  const expandedRows = projects.reduce(
    (a, x) => a + (expanded.has(x.root ?? 'loose') ? Math.min(4, x.sessions) : 0), 0)

  // How the headline splits between chart and table.
  //
  // Before this the chart took what the table left over, capped at eight rows,
  // while the table took a slice sized off the BOX rather than off its own
  // content. On a six-project machine that drew a squashed graph above six
  // rows of list and six rows of nothing — wrong twice, because the chart is
  // the thing that gets better with height and blank rows are not a layout.
  //
  // Now the table asks for exactly the rows it has and every row it does not
  // need goes to the chart, which is why btop's cpu box is a third of the
  // screen and its process list is not.
  const CHART_MIN = 5, CHART_MAX = 18
  // Three rows belong to the chart block itself (rule, times, legend) and
  // three more to what follows it (live strip, divider, column header).
  const FIXED = CHART_BELOW + 3
  const room = listH - 2 - FIXED
  const wantTable = Math.max(1, projects.length + expandedRows)
  // Below the minimum the chart is dropped outright rather than drawn two rows
  // tall. Six lines crossing in two rows is not a smaller chart, it is a
  // smudge, and the table is the thing worth keeping in a short terminal.
  //
  // The threshold is the floor itself, not the floor plus one: at exactly
  // CHART_MIN + 1 rows of room there IS a chart to draw and a row for the
  // table, and dropping it there left the headline padding out blank rows
  // instead — which is what the layout is meant never to do.
  //
  // The chart takes a guaranteed SHARE, not the table's leftovers. "Every row
  // the table does not need" sounded fair and is not: six projects on a
  // thirty-row terminal claim every row going, and the chart lands on its
  // floor — five rows, where cumulative lines are near-horizontal and unread-
  // able. The rows the table then loses are counted in the border, which is
  // how the list already handles being longer than its pane.
  //
  // And no chart at all when there is nothing to plot. An empty grid with an
  // axis on it is the same furniture-over-a-void the column headers were, and
  // it was eating the rows the explanation needs.
  const graphRows = room <= CHART_MIN || !projects.length
    ? 0
    : Math.max(CHART_MIN, Math.min(CHART_MAX, Math.max(room - wantTable, Math.round(room * 0.6))))
  // What the table can actually show. Rows beyond this are counted in the
  // border rather than dropped in silence.
  const tableBudget = graphRows > 0 ? Math.max(1, room - graphRows) : Math.max(1, listH - 5)

  // The span is chosen, not fixed, for the STRIP — a 15m rolling window is
  // blank most of the time you would look at it, because editing is bursty.
  // The chart above uses the header's own lookback, which is the question
  // "where did the day go" rather than "what is happening this minute".
  const span = pickWindow(stream0, { now })
  const rate = ratePerMin(stream0, { now })
  const agents = byAgent(stream0, { now })
  const nSess = activeSessions(stream0, { now })
  // Two different questions. nLive is "is anyone here" (transcript touched);
  // nSess is "is work landing" (a file written). Reporting only the second one
  // said "nothing is running" while an agent was plainly running.
  const nLive = liveSessions(state.sessions, { now }).length

  if (graphRows > 0) {
    // Six columns on the right hold each line's own total, printed at the
    // height the line ends on.
    const VALW = 7
    const gwChart = Math.max(24, listW - 11)
    const cols = Math.max(1, gwChart - VALW)
    // Ranked by attention, so the lines that get a marker are the ones that
    // took the time. The rest are counted in the legend, never silently cut.
    const ranked = [...projects].sort((a, b) => att(b) - att(a))
    const chartSeries = ranked.map((x, i) => (i < MAX_SERIES ? {
      label: x.name,
      marker: MARKERS[i],
      color: lineHue(i),
      value: humanMs(att(x)),
      // Attention ACCUMULATED, not attention per slice. The slice version is
      // zero for most of any day, so it can only draw a floor with bumps on
      // it; this climbs while you were in the repo, runs flat while you were
      // not, and ends the day at its own total.
      values: cumulative(attentionSeries(x.events ?? [], cols, since, now)),
    } : { label: x.name, marker: '', color: '', values: [] }))
    // A minute of headroom, so a machine with almost nothing on it still gets
    // a scale rather than a division by zero.
    const scale = niceMax(Math.max(60_000, ...chartSeries.flatMap(s => s.values)))
    headRows.push(...chart(chartSeries, {
      width: gwChart, rows: graphRows, max: scale, since, now, lead: 6, pad: VALW,
      fmt: humanMs, tier,
      caption: `attention · ${lookback}`,
      // The project under the cursor is lit and the rest fade back, so one
      // line can be read out of six without any of them appearing to move.
      focus: ranked.indexOf(projects[sel]),
    }))
  }

  if (graphRows > 0 || listH > 6) {
    // Built from (plain, painted) pairs: fit() counts characters, and every
    // one of these segments carries colour, so padding them as raw strings
    // measures the escape sequences too and blows a hole in the row.
    const seg = []
    const push = (plain, painted, pad = 0) =>
      seg.push({ plain, painted, w: Math.max(plain.length, pad) })

    // The span is stated because it moves. A number whose window changes
    // silently is worse than no number.
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
      const topRate = Math.max(0.1, ...agents.map(a => a.rate))
      for (const a of agents.slice(0, 3)) {
        const plain = `${a.agent} ------ ${a.rate.toFixed(1)}`
        push(plain, `${hue(a.agent)}${a.agent}${R} ${meter(a.rate / topRate, 6, LUT.activity)} ${DIM}${a.rate.toFixed(1)}${R}`, plain.length + 2)
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

  // Nothing to show is a statement, not a blank.
  //
  // A first run with no data drew the column headers over an empty grid and
  // said "0 projects" on the border, which reads as a broken program. It is
  // the one moment a user cannot tell a bug from an empty machine, and the
  // answer -- which stores exist, whether they hold anything, whether it is
  // merely older than the window -- is two stats away.
  if (!projects.length && !state.filter && !state.onlyColliding) {
    // Injectable, because probe() reads the real machine and a test that
    // does that is flaky by construction -- it passes or fails depending on
    // whether anything happened to be written while it ran. This project has
    // already shipped one test that read live history.
    const stores = state.stores ?? probe({ now })
    const any = stores.filter(s => s.found && s.files)
    // Three different situations, and telling them apart is the whole point.
    // "Sessions exist but they are old" and "sessions were written a minute
    // ago and none of them touched a project" are opposite problems, and a
    // single message for both would be wrong half the time.
    const fresh = any.filter(s => s.newest >= since)
    headRows.push('')
    headRows.push(!any.length
      ? ` ${BOLD}no agent sessions found${R}${DIM} — skeins reads these three places:${R}`
      : fresh.length
        ? (state.events?.length
          ? ` ${BOLD}edits were recorded, but none of them landed in a project${R}`
          : ` ${BOLD}sessions are being written, but none of them edited a file${R}`)
        : ` ${BOLD}nothing in the last ${lookback}${R}${DIM} — sessions exist, they are older than that${R}`)
    headRows.push('')
    for (const s of stores) {
      const where = s.dir.startsWith(HOME) ? `~${s.dir.slice(HOME.length)}` : s.dir
      const said = !s.found
        ? `${DIM}not found${R}`
        : !s.files
          ? `${DIM}empty${R}`
          : `${LUT.activity[60]}${s.files} file${s.files === 1 ? '' : 's'}${R}${DIM}, newest ${ago(s.newest, now)} ago${R}`
      headRows.push(`   ${hue(s.agent)}${fit(s.agent, 10)}${R}${fit(where, Math.max(20, listW - 42))} ${said}`)
    }
    headRows.push('')
    if (!any.length) {
      headRows.push(`   ${DIM}skeins reads Claude Code, Codex and opencode. Other agents write${R}`)
      headRows.push(`   ${DIM}elsewhere, and skeins cannot see what it cannot read.${R}`)
    } else if (fresh.length && state.events?.length) {
      // Edits exist and none grouped: scratch paths, or work outside a repo.
      headRows.push(`   ${DIM}every edit was in a scratch path, or outside any git repository.${R}`)
      headRows.push(`   ${DIM}skeins groups by git root; work with no repo lands in ${R}${BOLD}not in a repo${R}${DIM}.${R}`)
    } else if (fresh.length) {
      // No edits at all. Saying "every edit was in a scratch path" here is a
      // claim about edits that do not exist -- which is what a real user was
      // told while his agent was reading and running commands and had not yet
      // written anything.
      headRows.push(`   ${DIM}skeins counts files WRITTEN, not sessions opened. An agent that is${R}`)
      headRows.push(`   ${DIM}reading, searching or running commands has not edited anything yet.${R}`)
    } else {
      headRows.push(`   ${DIM}press ${R}${BOLD}a${R}${DIM} to widen the window — 6h · 24h · 7d · 30d${R}`)
    }
    headRows.push('')
    headRows.push(`   ${DIM}XDG_DATA_HOME is honoured; set it and opencode moves with it.${R}`)
    // Everything above is what skeins can say from two stats. The rest -- what
    // was IN those files, and what it could read out of them -- needs the
    // files opened, so it lives behind a command rather than costing every
    // frame. Several rounds were spent guessing at a user's empty screen.
    headRows.push(`   ${DIM}run ${R}${BOLD}skeins doctor${R}${DIM} to see what was in the files it read.${R}`)
  } else {
  headRows.push(`${THEME.header}${cells({ name: 'PROJECT', branch: 'BRANCH', doing: 'DOING', agents: 'AGENTS', sessions: ' SESS', files: ' FILES', time: '   TIME', share: '   SHARE', colls: ' COLL', ctx: '  CONTEXT', activity: fit('ATTN', gw), busiest: ' PEAK', last: '  LAST' })}${R}`)
  }
  const totalTime = Math.max(1, projects.reduce((a, x) => a + att(x), 0))
  const topAtt = Math.max(1, ...projects.map(att))

  // Hit map: filled while drawing, because the layout decides row positions at
  // render time and recomputing them in the input handler is how the two drift.
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
    // +1 for the box's own top border; headRows are drawn one row in.
    hit.rows.push({ y: L.head.y + 1 + headRows.length, index: idx })
    headRows.push(on ? selected(line, listW - 2) : line)

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
    title: 'skeins', key: SUP[0], line: THEME.boxHead,
    // btop's own placement: `¹cpu ┘menu┘preset 0`. The one control that opens
    // everything else sits beside the box name, not down in the footer row
    // where it was one tag among seven and read as another shortcut.
    //
    // box() lays the head out as ─ ' ' title key ' ' ─ ' ' head ' ', so the
    // tag starts at 1 + 1 + len(title) + len(key) + 1 + 1 + 1 from the left.
    head: (() => {
      const at = L.head.x + 6 + 'skeins'.length + width(SUP[0])
      hit.tags.push({ y: L.head.y, x0: at, x1: at + 'm menu'.length, key: 'm' })
      return tag('m', 'menu')
    })(),
    // btop prints 'preset N' in the cpu box border. Same place, same reason:
    // the layout you are looking at is state, and state belongs in the border.
    right: (() => {
      const label = `preset ${(state.preset ?? 0) + 1} ${NAMES[state.preset ?? 0] ?? ''}`
      const painted = `${DIM}preset ${R}${BOLD}${(state.preset ?? 0) + 1} ${NAMES[state.preset ?? 0] ?? ''}${R}  ${clock} ${DIM}${pulse}${R}`
      // box() lays the top edge out as … pad ─ ' ' right ' ' ─ ╮, so the right
      // text starts at w - width(right) - 3 from the box's left edge. It said
      // 'preset 1 all' and did nothing when clicked, which is a label
      // pretending to be a control.
      const x0 = L.head.x + listW - width(painted) - 3
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
      const c = controls(Math.max(18, listW - width(s) - 8))
      // box() lays the bottom border out as ╰ ─ ' ' state ' ' … so the state
      // text begins three columns in. Every tag's absolute position follows
      // from that plus its offset within the row.
      const originX = L.head.x + 3 + width(s) + 2
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
    field('when', `${clock12(focus.at, { seconds: true })}${DIM}   ${ago(focus.at, now)} ago${R}`)
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
    else if (tabI === 3) detailRows_.push(...toolsTab(p, ctx))
    else if (tabI === 4) detailRows_.push(...collisionsTab(p, ctx))
    else infoTab()

    function infoTab() {
    // btop's net box, for one project.
    //
    // The headline chart is a running total over the lookback: it answers
    // "where did the day go" and it is deliberately smooth and slow. Nothing
    // answered "is THIS repo moving right now", and the rolling series that
    // used to be in the headline was deleted when it became cumulative.
    //
    // btop keeps both for the same reason — a big historical cpu box and a
    // small live net box — and the live one reads as alive even at zero,
    // because a ROLLING window slides left every tick whether or not anything
    // happened. That is the whole trick, and it costs one recomputation from
    // `now` per frame.
    const mine = (p.events ?? []).filter(Boolean)
    const span = pickWindow(mine, { now })
    const gwLive = Math.max(16, detailW - 9)
    const live = rateSeries(mine, gwLive * 2, { now, windowMs: span.windowMs })
    // The floor is small on purpose. At 0.5 a project ticking over at a tenth
    // of an edit a minute drew a flat line along the bottom row whatever its
    // shape was -- the same defect the velocity scale had, in a different
    // widget. The axis labels follow the peak, so a low one is stated rather
    // than hidden.
    const peak = Math.max(0.05, ...live)
    // Room for the graph, the strip, a rule, and whatever the hook line needs
    // underneath. Below the floor it is dropped rather than drawn one row tall.
    const perAgent = byAgent(mine, { now, windowMs: span.windowMs }).slice(0, 3)
    const gRows = Math.min(7, detailH - 8 - perAgent.length)

    if (gRows >= 3) {
      // Colour encodes VALUE here, not identity — one series, so R3 applies
      // rather than §7.2's per-line hue. Same rule btop uses on this box.
      const rows = graph(live.map(v => v / peak), { width: gwLive, rows: gRows, tier, lut: LUT.activity })
      rows.forEach((line, i) => {
        const v = (peak * (rows.length - i)) / rows.length
        const label = i === rows.length - 1 ? '0' : v >= 10 ? String(Math.round(v)) : v.toFixed(peak < 1 ? 2 : 1)
        detailRows_.push(` ${DIM}${fit(label, 5)}${R}${DIM}┤${R}${line}${R}`)
      })
      const rate = ratePerMin(mine, { now })
      const nLive = liveSessions(state.sessions, { now }).filter(s => !p.root || s.cwd === p.root).length
      detailRows_.push(
        ` ${DIM}EDITS/MIN · ${R}${BOLD}${span.label}${R}` +
        `${DIM}   now ${R}${BOLD}${rate.toFixed(1)}${R}` +
        (nLive ? `${LUT.activity[80]}   ${nLive} live${R}` : `${DIM}   idle${R}`))
      // btop's per-core rows, and the cores are agents.
      for (const a of perAgent) {
        detailRows_.push(`  ${hue(a.agent)}${fit(a.agent, 10)}${R}${meter(a.rate / peak, 8, LUT.activity)} ${DIM}${a.rate.toFixed(1)}${R}`)
      }
      // detailW is the BOX width; a row sits inside its two borders.
      detailRows_.push(`${DIM}${'─'.repeat(Math.max(0, detailW - 2))}${R}`)
    }

    // Thesis §5: the defensible claim is not the chart, it is that an agent can
    // read this. So the pane shows the exact line an agent starting in this
    // repository would be handed — the product, rather than a description of it.
    const others = who(state.events ?? [], state.sessions ?? new Map(),
                       { root: p.root, activeMin: state.windowMin ?? 30, now })
    const iw = Math.max(12, detailW - 34)

    if (others.length) {
      detailRows_.push(` ${BOLD}${others.length} other agent${others.length === 1 ? '' : 's'} active in this repo${R}`)
      for (const o of others.slice(0, Math.max(1, detailH - 5 - Math.min(3, collsHere.length)))) {
        // A session open here that has written nothing yet has no path to
        // show, and skeins does not invent one -- it knows the session is in
        // this repo, not what it is looking at.
        const verb = !o.path ? 'open' : o.kind === 'add' ? 'added' : o.kind === 'delete' ? 'deleted' : 'editing'
        const where = o.path ? short(o.path, p.root) : `${DIM}nothing written here yet${R}`
        const os = state.sessions?.get(o.session)
        const sc = os?.context ?? 0
        const gauge = sc
          ? ` ${LUT.heat[Math.round(Math.min(1, sc / limitOf(os, ceiling)) * 100)]}${humanTokens(sc)}${R}`
          : ''
        detailRows_.push(`   ${hue(o.agent)}${fit(o.agent, 9)}${R}${DIM}${fit(verb, 8)}${R}${fit(where, Math.max(6, iw - 7))}${gauge}${DIM}${ago(o.at, now).padStart(5)}${R}`)
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
      const at = clock12(e.at, { seconds: true })
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
  // Sessions get the same window the events get, or a repo idle for days
  // reappears in a 24h view and the SESSIONS column counts all of history.
  const live = new Map([...sessions].filter(([, s]) => (s.last ?? 0) >= since))
  const projects = [...byProject(recent, live).values()].sort((a, b) => b.last - a.last)
  const colls = collisions(recent, sessions, { windowMin, since })
  return { events: recent, sessions, projects, colls, since, dirty }
}

export function start({ now = () => Date.now(), stdout = process.stdout, stdin = process.stdin, sampleMachine = sampleMachineDefault, buildState = build } = {}) {
  const LOOKBACKS = [[6 * 3_600_000, '6h'], [24 * 3_600_000, '24h'], [7 * 86_400_000, '7d'], [30 * 86_400_000, '30d']]
  let lb = 1, windowMin = WINDOW_MIN, sel = 0, tick = 0
  let sortIdx = 0, filter = '', typing = false, help = 0, menu = null, onlyColliding = false, focus = null
  let preset = 0, tab = 0, feedTop = 0, page = null
  // Sampled from the OS, not built from anything in `build()`. It costs a
  // process spawn -- measured at ~50ms each for `ps` and the batched cwd
  // lookup -- so it is taken on the SLOW poll cadence and only while the
  // estate preset is actually the one on screen, never on every paint tick
  // and never for a preset nobody is looking at.
  const ESTATE = NAMES.indexOf('estate')
  const WORKTREES = NAMES.indexOf('worktrees')
  let machine = { roots: new Map(), unrooted: 0, rows: [] }
  // Read OS sample only on screens that display live CPU attribution.
  const pollMachine = () => { if (preset === ESTATE || preset === WORKTREES) machine = byRoot(sampleMachine()) }
  const expanded = new Set()
  const tier = tierFor()
  let state = null

  const reload = () => {
    const t = now()
    const built = buildState(windowMin, LOOKBACKS[lb][0], t)
    const changed = built.dirty
    // Filter, then collisions-only, then sort. Order matters: sorting a list
    // you are about to shorten is wasted work, and "3 projects" in the border
    // must count what is actually on screen.
    let list = built.projects
    if (filter) list = list.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
    if (onlyColliding) list = list.filter(p => built.colls.some(c => c.project === p.root))
    list = [...list].sort(SORTS[sortIdx].cmp)
    state = {
      ...built, projects: list, expanded, tier, machine,
      lookback: LOOKBACKS[lb][1], windowMin,
      ...interactive(),
      now: t,
    }
    if (sel >= state.projects.length) sel = Math.max(0, state.projects.length - 1)
    state.sel = sel
    return changed
  }

  // Every interactive variable, in one place.
  //
  // draw() used to copy six of them and silently omit page, tab, preset and
  // feedTop. Those are set by a keypress or a click and then rendered from the
  // STALE state — so the new screen only appeared when reload() next rebuilt
  // state from scratch, up to a poll interval later. That is the whole of
  // "nothing happens when I click" and "it takes about two seconds": the work
  // was instant, the result just was not on screen yet.
  //
  // ONE function, used by both writers. Listing them in one place was already
  // the stated point, and it still was not enough: `menu` was added to the
  // reload() literal and not to this list, so pressing m set the variable, the
  // screen repainted, and the menu never appeared. Exactly the bug the comment
  // above describes, one new field later.
  //
  // A list you have to remember to extend is not one place, it is two that
  // happen to agree today. reload() spreads this, sync() assigns it, and a
  // field added here cannot be missed by either.
  const interactive = () => ({
    sel,
    now: now(),
    tick,
    help,
    menu,
    filter,
    focus,
    preset,
    tab,
    feedTop,
    page,
    onlyColliding,
    sort: SORTS[sortIdx].label,
  })
  // `machine` is not user input, so it does not belong in interactive() --
  // but it is the other thing draw() must reflect without waiting for a full
  // reload(), or pressing 6 to reach the estate preset paints the CPU sample
  // pollMachine() JUST took into the closure variable and never onto state.
  // Exactly the sync()/reload() split this file already hit once for `menu`.
  const sync = () => Object.assign(state, interactive(), { machine })

  const draw = () => {
    sync()
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
    pollMachine()
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
      // While the menu is up it owns the pointer, the same way it owns the
      // keyboard. A click on a word chooses it; a click anywhere else closes,
      // which is what clicking outside a menu means everywhere else.
      if (menu !== null && ev.kind !== 'wheel') {
        const row = mouse.hitRow(state.hit ?? { rows: [], tags: [] }, ev.y)
        if (row === null) { menu = null; draw(); return }
        menu = row
        return onData('\r')
      }
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
          // ONE click opens it. Requiring a click to select and a second to
          // open meant the first click did nothing you could see, which is
          // indistinguishable from the mouse not working at all.
          sel = row
          const target = state.projects[row]
          if (target) { page = target.root ?? target.name; focus = null }
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

    // tab pages between the two halves -- how to move, and what the numbers
    // mean. Anything else dismisses, as it always did.
    if (help) {
      help = (k === '\t' || k === '?' || k === 'h') ? (help === 1 ? 2 : 1) : 0
      // Opened from the menu, closing goes back to the menu rather than all
      // the way out -- one level at a time, the rule esc already keeps.
      if (!help && menu !== null) menu = 0
      draw(); return
    }

    // The menu is modal: arrows move, enter chooses, anything that means "out"
    // is out. Every other key is swallowed, or a menu would be a screen you
    // could accidentally type through.
    if (menu !== null) {
      if (k === '\x1b[B' || k === 'j') menu = (menu + 1) % MENU.length
      else if (k === '\x1b[A' || k === 'k') menu = (menu + MENU.length - 1) % MENU.length
      else if (k === '\r' || k === '\n') {
        const chosen = MENU[menu]?.[0]
        if (chosen === 'QUIT') return quit()
        help = chosen === 'METRICS' ? 2 : 1
      } else if (k === '\x03') return quit()
      else if (k === '\x1b' || k === 'm' || k === 'q') menu = null
      draw(); return
    }

    // esc unwinds one level at a time: page, then focus, then preset, then
    // quit. Without the preset step a full-screen preset was a dead end — esc
    // fell through to quit, so the only way back was knowing that p or 1 does
    // it, and neither was on screen.
    if (k === '\x1b' && page) { page = null; draw(); return }
    if (k === '\x1b' && focus) { focus = null; draw(); return }
    if (k === '\x1b' && preset !== 0) { preset = 0; draw(); return }
    if (k === 'q' || k === '\x1b' || k === '\x03') return quit()
    else if (k === 'm') menu = 0
    else if (k === '?' || k === 'h') help = 1
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
    else if (k === 'p') { preset = (preset + 1) % PRESETS.length; pollMachine() }
    else if (k === 'P') { preset = (preset - 1 + PRESETS.length) % PRESETS.length; pollMachine() }
    else if (/^[1-9]$/.test(k) && Number(k) <= PRESETS.length) { preset = Number(k) - 1; pollMachine() }
    else if (k === 'r') { pollMachine(); reload() }
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
