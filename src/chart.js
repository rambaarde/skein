// The chart the thesis asked for, finally drawn.
//
// Founder thesis §6.5: the timeline is "per project, stacked by agent, plotting
// active minutes or prompts". What shipped instead was one aggregate braille
// graph in the headline and a fourteen-character sparkline per row — a texture
// column, not a chart. You could see THAT something happened; you could not see
// which project it happened to, or when, or against what else.
//
// That is the core value of the tool (§2: "where did my week actually go — per
// project, over time") reduced to decoration. This module puts it back.
//
// A braille graph cannot do this. Braille packs two samples per cell for
// density, but colour is per character cell (§6.5's stated ceiling), so two
// series crossing anywhere in the same cell cannot both keep their hue — and
// the whole point of a multi-project chart is telling the lines apart. So a
// series is identified three ways at once, the way plotted charts have always
// done it: a hue, a MARKER glyph, and a LINE STYLE. Any one of the three
// surviving is enough to follow a line, which matters because in a shared cell
// only one of them can.
//
// btop's R2 discipline holds — the styles are a table, not a branch. They are
// deliberately ASCII: `●▲■◆` are East-Asian-ambiguous width, so a terminal
// that renders one double-wide pushes the box border off the right edge and
// corrupts the frame. A prettier marker is not worth that.
import { DIM, R } from './theme.js'
import { fit } from './box.js'

// Marker first, then the line style trailing it: solid, dashed, dotted,
// dash-dot. A space in a pattern is a real gap — the line breaks there, which
// is what keeps a dashed line dashed even where it runs vertically.
export const STYLES = ['####', '*--*', '+···', 'x-·-', 'o···', '=-=-']
export const MARKERS = STYLES.map(s => s[0])
export const MAX_SERIES = STYLES.length

// Rows the block costs below the graph itself: the rule, the times, the legend.
export const BELOW = 3

const CAP_SEP = `  \x1b[2m│\x1b[0m `

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// A ceiling a human recognises. Scaling straight to the observed peak gave an
// axis reading 187% 169% 150% 131% — ten true numbers, none of them round, and
// none of them any easier to read a value against than no scale at all.
const M = 60_000, H = 3_600_000
export const DURATIONS = [
  5 * M, 10 * M, 15 * M, 20 * M, 30 * M, 45 * M, H, 1.5 * H, 2 * H, 3 * H, 4 * H, 6 * H,
  8 * H, 12 * H, 18 * H, 24 * H, 36 * H, 48 * H, 72 * H, 120 * H, 240 * H,
]
export const niceMax = (v, ladder = DURATIONS) =>
  ladder.find(n => n >= v - 1e-9) ?? Math.ceil(v)

// Running total, which is what makes this a chart of lines rather than of
// humps on a floor.
//
// Attention landing IN each slice is zero for most of any day, so plotting it
// directly can only ever draw a flat line along the bottom with an occasional
// bump — two rounds of trying to make that read as lines proved it cannot,
// because the shape is in the data and not in the rendering.
//
// A running total is nonzero everywhere once work has started, every series
// sits at its own height, and the lines fan out and end at their own totals.
// It also answers the actual question better: thesis §2 asks where the week
// WENT, and a curve that climbs steeply while you were in a repo and runs flat
// while you were not says exactly that, with the day's total as its height.
export const cumulative = values => {
  let run = 0
  return values.map(v => (run += v))
}

// Where the axis ticks fall. Shared by the rule and its labels, so a time can
// never end up printed under the wrong tick.
const tickCols = (width, ticks) =>
  Array.from({ length: ticks + 1 }, (_, k) => Math.round((k / ticks) * (width - 1)))

// Draw `series` into a rows × width character grid.
//
// Each entry is { values, marker | pattern, color, value }. `values` is one
// number per column; scaling is against `max`, shared across every series so
// the lines stay comparable rather than each being normalised to its own peak.
//
// `pad` reserves columns on the right for each line's current value, printed
// at the height that line ends on. That number is the thing you actually want
// off a chart, and hunting for it in the legend is a worse way to get it.
//
// Series are drawn in order and a later one wins a shared cell, so the caller
// puts the line it most wants readable last.
export function plot(series, { width, rows, max = 1, pad = 0 }) {
  const w = Math.max(1, width), r = Math.max(1, rows), cap = max > 0 ? max : 1
  const span = Math.max(1, w - pad)
  const ch = Array.from({ length: r }, () => new Array(w).fill(' '))
  const co = Array.from({ length: r }, () => new Array(w).fill(null))
  const rowOf = v => r - 1 - Math.round(clamp(v / cap, 0, 1) * (r - 1))
  // Which rows already carry a value label, so two of them cannot land on top
  // of each other in the right margin, and where each line ended.
  const labelled = new Set()
  const ends = new Array(series.length).fill(null)

  series.forEach((s, si) => {
    const pat = s.pattern ?? `${s.marker ?? '#'}`
    const colour = s.color ?? ''
    let prev = null, end = null
    // A series with nothing in the window is not drawn at all. A series with
    // ANYTHING in it is drawn unbroken, including the hours it sat at zero.
    //
    // Treating a zero as a hole broke every line into scattered marks: the
    // chart came out as columns of dots rather than as lines you can follow
    // across the day, which is the entire look this imitates. A quiet stretch
    // is a line running along the floor, and that reads correctly — it is what
    // the flat runs in any real chart mean.
    if (!s.values?.some(v => v > 0)) { ends[si] = null; return }
    // Only as far as there is data. A caller with fewer values than columns
    // used to get a phantom dive to the floor across the remainder, which
    // reads as "it stopped" rather than as "nothing was said about this".
    const n = Math.min(span, s.values.length)
    for (let c = 0; c < n; c++) {
      const y = rowOf(s.values[c] ?? 0)
      // The first column gets the MARKER, and after that the pattern runs.
      const glyph = prev === null ? pat[0] : pat[c % pat.length]
      // Fill back to the previous column's level. Without this a steep change
      // draws two dots with a hole between them and reads as noise; with it,
      // it reads as a line, which is what the eye follows.
      const from = prev === null ? y : Math.min(prev, y)
      const to = prev === null ? y : Math.max(prev, y)
      if (glyph !== ' ') for (let g = from; g <= to; g++) { ch[g][c] = glyph; co[g][c] = colour }
      prev = y
      end = y
    }
    ends[si] = end
  })

  // One label per row, and the line that most needs reading claims it first.
  //
  // Two lines ending at the same level wrote their numbers into the same
  // cells: `2h09` under `16m` came out as `16m9`, which is not a duration
  // anyone has ever had. Nudging the loser to a free row was worse — six lines
  // all ending on the floor produced a column of numbers stacked beside
  // heights none of them were at. A number here means "this line, at this
  // height", so one that cannot be placed truthfully is not placed at all; the
  // legend already carries every total.
  //
  // Priority is the LAST series first, then the rest in order, because the
  // caller draws the line it most wants readable last — and the row it ends on
  // is exactly the row its own number belongs in.
  if (pad > 1) {
    const priority = [series.length - 1, ...series.keys()]
    for (const si of priority) {
      const s = series[si], y = ends[si]
      if (!s?.value || y === null || labelled.has(y)) continue
      labelled.add(y)
      const txt = String(s.value).slice(0, pad - 1)
      for (let k = 0; k < txt.length; k++) {
        const c = span + 1 + k
        if (c < w) { ch[y][c] = txt[k]; co[y][c] = s.color ?? '' }
      }
    }
  }

  return ch.map((row, y) => {
    let line = '', last = null
    for (let c = 0; c < row.length; c++) {
      const colour = co[y][c]
      if (colour === null) {
        // Reset before a gap: a colour left armed across empty cells paints
        // the terminal's own background where nothing was drawn.
        if (last !== null) { line += R; last = null }
        line += ' '
        continue
      }
      if (colour !== last) { line += colour; last = colour }
      line += row[c]
    }
    return last === null ? line : line + R
  })
}

// The rule under the graph, with a tick everywhere a time is printed.
export function axisLine(width, ticks = 4) {
  const at = new Set(tickCols(Math.max(2, width), ticks))
  return Array.from({ length: Math.max(1, width) }, (_, c) => (at.has(c) ? '┬' : '─')).join('')
}

// Clock times under the ticks. A chart whose x axis is unlabelled is a shape,
// not a measurement — you cannot tell this morning from an hour ago.
export function xaxis(since, now, { width, ticks = 4 }) {
  const w = Math.max(1, width)
  const buf = new Array(w).fill(' ')
  const put = (at, s) => { for (let i = 0; i < s.length; i++) if (at + i >= 0 && at + i < w) buf[at + i] = s[i] }
  const hhmm = t => new Date(t).toTimeString().slice(0, 5)
  tickCols(w, ticks).forEach((c, k) => {
    // The right edge is always `now`, whatever the span — the one label nobody
    // should have to work out — and it is pulled left so it stays on screen.
    const s = k === ticks ? 'now' : hhmm(since + (k / ticks) * (now - since))
    put(k === ticks ? c - s.length + 1 : c, s)
  })
  return buf.join('')
}

// Which line is which. Without this the markers are a cipher.
//
// Entries that do not fit are counted rather than dropped, per AXI 5: a legend
// that silently ends at four says there were four.
export function legend(series, { width }) {
  const SEP = ` ${DIM}│${R} `
  const out = []
  let used = 0, i = 0
  for (; i < series.length; i++) {
    const s = series[i]
    const plain = `${s.marker}: ${s.label}${s.value ? ` ${s.value}` : ''}`
    const cost = plain.length + (out.length ? 3 : 0)
    if (used + cost > width) break
    used += cost
    out.push(`${s.color ?? ''}${s.marker}: ${s.label}${R}${s.value ? `${DIM} ${s.value}${R}` : ''}`)
  }
  // The counter itself must fit, or the legend silently ends at four again
  // with nothing to say it did. Give back entries until it does.
  let rest = series.length - i
  while (rest > 0 && out.length && used + `+${rest} more`.length + 3 > width) {
    const s = series[--i]
    used -= `${s.marker}: ${s.label}${s.value ? ` ${s.value}` : ''}`.length + (out.length > 1 ? 3 : 0)
    out.pop()
    rest++
  }
  if (rest > 0) out.push(`${DIM}+${rest} more${R}`)
  return out.join(SEP)
}

// Graph, scale, axis, legend — the whole block, so the two callers that want
// it cannot drift on how a number is labelled.
//
// `top` is the index of the one series that must stay readable where lines
// overlap — the row the cursor is on. Only the DRAW order changes; marker,
// colour and legend position stay tied to rank, so moving the cursor does not
// repaint the chart in a different set of colours.
export function chart(series, {
  width, rows, max, since, now, lead = 6, pad = 6, top = -1, caption = '',
  // The axis is whatever the caller's values are. Both of skein's charts plot
  // milliseconds, so both pass humanMs.
  fmt = String,
}) {
  const order = series.map((_, i) => i).sort((a, b) => (a === top ? 1 : 0) - (b === top ? 1 : 0))
  const drawn = order.map(i => series[i]).filter(s => s && s.values?.length)
  const body = plot(drawn, { width, rows, max, pad })
  const out = []
  // A gradation that repeats the one above it is not a gradation: with a low
  // peak, ten rows all round to the same couple of values.
  let lastLabel = null
  body.forEach((line, i) => {
    const raw = i === body.length - 1 ? '0' : fmt((max * (body.length - i)) / body.length)
    const label = raw === lastLabel ? '' : raw
    if (label) lastLabel = raw
    out.push(` ${DIM}${fit(label, lead)}${R}${DIM}┤${R}${line}${R}`)
  })
  const span = Math.max(1, width - pad)
  out.push(` ${' '.repeat(lead)}${DIM}└${axisLine(span)}${R}`)
  out.push(` ${' '.repeat(lead + 1)}${DIM}${xaxis(since, now, { width: span })}${R}`)
  // The caption sits on the legend row rather than on the border, because what
  // a line MEANS and which line is which are one question, not two.
  // On a narrow chart the caption would eat the whole row and leave the
  // markers a cipher. Naming the lines outranks naming the axis.
  const label = width - caption.length - 4 >= 12 ? caption : ''
  const cap = label ? `${DIM}${label}${R}${CAP_SEP}` : ''
  out.push(` ${' '.repeat(lead + 1)}${cap}${legend(series, { width: Math.max(0, width - label.length - (label ? 4 : 0)) })}`)
  return out
}
