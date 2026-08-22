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
// There are three families of terminal chart and this is deliberately the
// third:
//
//   asciichart  box-drawing segments (╭ ╰ ─ │ ╯) — genuinely smooth curves,
//               and single-series only
//   braille     2×4 dots per cell, the highest resolution there is (btop,
//               ratatui, plotile) — but colour is per CELL, so two lines
//               crossing in one cell cannot both keep their hue
//   markers     one glyph per point, drawn densely (gnuplot's dumb terminal,
//               plotext) — the only one of the three that carries several
//               series at once, which is what a per-project chart is
//
// So a series is identified by a MARKER and a hue, and the line is drawn with
// that marker repeated. Solid, not styled: the first attempt gave each series
// a dash-dot "line style" — `+···`, `o···`, `x-·-` — which is three quarters
// filler characters, and it read on screen as dotted leader lines rather than
// as data. gnuplot draws `##########`, and that is why its lines look like
// lines.
//
// btop's R2 discipline holds — the markers are a table, not a branch. They are
// deliberately ASCII: `●▲■◆` are East-Asian-ambiguous width, so a terminal
// that renders one double-wide pushes the box border off the right edge and
// corrupts the frame. A prettier marker is not worth that.
import { DIM, R, fade } from './theme.js'
import { fit } from './box.js'

// Shapes that stay distinct at one character: a solid block, a star, a cross,
// a diagonal cross, a ring, a rule.
export const MARKERS = ['#', '*', '+', 'x', 'o', '=']
export const MAX_SERIES = MARKERS.length

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
// Each entry is { values, marker, color, value }. `values` is one number per
// column; scaling is against `max`, shared across every series so
// the lines stay comparable rather than each being normalised to its own peak.
//
// `pad` reserves columns on the right for each line's current value, printed
// at the height that line ends on. That number is the thing you actually want
// off a chart, and hunting for it in the legend is a worse way to get it.
//
// Series are drawn in order and a later one wins a shared cell, so the caller
// puts the line it most wants readable last.
//
// `tier` picks how the line itself is drawn, and this is the whole difference
// between a chart that looks like a tool and one that looks like a wall of
// hashes. Braille packs 2×4 subpixels into a cell, so a line drawn in it is
// ONE DOT THICK instead of one character thick — which is why btop, ratatui
// and blessed-contrib all look the way they do.
//
// The reason skein did not start there: colour is per character CELL, so two
// series sharing a cell cannot both keep their hue. That was treated as the
// common case and it is not. These lines are running totals; they fan out and
// spend almost all of their length apart. Where they do share a cell one hue
// wins, which is a smaller price than every line being a fat bar.
//
// The marker is still each series' identity — it just lives in the legend now
// rather than being stamped across the data. Terminals without braille fall
// back to drawing the marker itself, which is R2: a table swap, not a branch.
export function plot(series, { width, rows, max = 1, pad = 0, tier = 'braille' }) {
  if (tier === 'braille') return plotBraille(series, { width, rows, max, pad })
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
    const glyph = s.marker ?? '#'
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
      // Fill back to the previous column's level. Without this a steep change
      // draws two dots with a hole between them and reads as noise; with it,
      // it reads as a line, which is what the eye follows.
      const from = prev === null ? y : Math.min(prev, y)
      const to = prev === null ? y : Math.max(prev, y)
      for (let g = from; g <= to; g++) { ch[g][c] = glyph; co[g][c] = colour }
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

// Labels under the ticks. A chart whose x axis is unlabelled is a shape, not a
// measurement — you cannot tell this morning from an hour ago.
//
// The FORMAT follows the span, and it has to. A seven-day window labelled in
// clock time reads `00:24  18:24  12:24  06:24  now`, which looks like time
// running backwards: the hours are real but they are from four different days,
// and nothing on the axis says so. A reader cannot place themselves at all.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function stampFor(span) {
  // Under a day the date is noise; over two days the clock is. Between them
  // neither alone is enough, so both, short.
  if (span <= 36 * 3600_000) return t => new Date(t).toTimeString().slice(0, 5)
  if (span <= 8 * 86_400_000) {
    return t => {
      const d = new Date(t)
      return `${d.getDate()} ${d.toTimeString().slice(0, 5)}`
    }
  }
  return t => {
    const d = new Date(t)
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  }
}

export function xaxis(since, now, { width, ticks = 4 }) {
  const w = Math.max(1, width)
  const buf = new Array(w).fill(' ')
  const put = (at, s) => { for (let i = 0; i < s.length; i++) if (at + i >= 0 && at + i < w) buf[at + i] = s[i] }
  const stamp = stampFor(now - since)
  tickCols(w, ticks).forEach((c, k) => {
    // The right edge is always `now`, whatever the span — the one label nobody
    // should have to work out — and it is pulled left so it stays on screen.
    const s = k === ticks ? 'now' : stamp(since + (k / ticks) * (now - since))
    put(k === ticks ? c - s.length + 1 : c, s)
  })
  return buf.join('')
}

// Which line is which. Without this the series are a cipher.
//
// The key changes with the tier, because the thing that identifies a line
// changes with it. Drawn in braille the line carries no marker — its identity
// is its hue — so the legend shows a swatch of the same glyphs the chart is
// made of. Drawn in markers it shows the marker.
//
// Entries that do not fit are counted rather than dropped, per AXI 5: a legend
// that silently ends at four says there were four.
export function legend(series, { width, tier = 'braille' }) {
  const SEP = ` ${DIM}│${R} `
  const key = s => (tier === 'braille' ? '⣿⣿' : `${s.marker}:`)
  const out = []
  let used = 0, i = 0
  for (; i < series.length; i++) {
    const s = series[i]
    const plain = `${key(s)} ${s.label}${s.value ? ` ${s.value}` : ''}`
    const cost = plain.length + (out.length ? 3 : 0)
    if (used + cost > width) break
    used += cost
    out.push(`${s.color ?? ''}${key(s)} ${s.label}${R}${s.value ? `${DIM} ${s.value}${R}` : ''}`)
  }
  // The counter itself must fit, or the legend silently ends at four again
  // with nothing to say it did. Give back entries until it does.
  let rest = series.length - i
  while (rest > 0 && out.length && used + `+${rest} more`.length + 3 > width) {
    const s = series[--i]
    used -= `${key(s)} ${s.label}${s.value ? ` ${s.value}` : ''}`.length + (out.length > 1 ? 3 : 0)
    out.pop()
    rest++
  }
  if (rest > 0) out.push(`${DIM}+${rest} more${R}`)
  return out.join(SEP)
}

// Graph, scale, axis, legend — the whole block, so the two callers that want
// it cannot drift on how a number is labelled.
//
// `focus` is the index of the row the cursor is on. Every other line fades
// into the background and the focused one is drawn last, so it wins any cell
// it shares.
//
// This replaces reordering the draw stack alone, which was a bad idea: with
// six running totals sharing a long baseline, changing which one was drawn
// last recoloured that whole baseline, and moving the cursor read as the chart
// jumping to another project. Fading is the same information without the
// geometry appearing to move — one line is bright, the rest are still exactly
// where they were.
export function chart(series, {
  width, rows, max, since, now, lead = 6, pad = 6, focus = -1, caption = '', tier = 'braille',
  // The axis is whatever the caller's values are. Both of skein's charts plot
  // milliseconds, so both pass humanMs.
  fmt = String,
}) {
  const lit = focus >= 0 && focus < series.length
  const shade = (s, i) => (!lit || i === focus ? s : { ...s, color: fade(s.color) })
  const order = series.map((_, i) => i).sort((a, b) => (a === focus ? 1 : 0) - (b === focus ? 1 : 0))
  const drawn = order.map(i => shade(series[i], i)).filter(s => s && s.values?.length)
  const body = plot(drawn, { width, rows, max, pad, tier })
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
  out.push(` ${' '.repeat(lead + 1)}${cap}${legend(series.map(shade), { width: Math.max(0, width - label.length - (label ? 4 : 0)), tier })}`)
  return out
}

// The braille renderer.
//
// A cell is 2 subpixels wide and 4 tall, so a rows×width grid of them is a
// bitmap of (width×2) × (rows×4). The dot bit for a subpixel is fixed by the
// standard's own layout: the left column is dots 1,2,3,7 and the right column
// is dots 4,5,6,8, which is bits 0,1,2,6 and 3,4,5,7.
const DOT = [
  [0x01, 0x02, 0x04, 0x40],   // left column, top to bottom
  [0x08, 0x10, 0x20, 0x80],   // right column
]

function plotBraille(series, { width, rows, max, pad }) {
  const w = Math.max(1, width), r = Math.max(1, rows), cap = max > 0 ? max : 1
  const span = Math.max(1, w - pad)
  const SW = span * 2, SH = r * 4
  const bits = Array.from({ length: r }, () => new Array(w).fill(0))
  const owner = Array.from({ length: r }, () => new Array(w).fill(-1))
  const text = Array.from({ length: r }, () => new Array(w).fill(null))
  const labelled = new Set()
  const ends = new Array(series.length).fill(null)
  const rowOf = v => SH - 1 - Math.round(clamp(v / cap, 0, 1) * (SH - 1))

  series.forEach((s, si) => {
    if (!s.values?.some(v => v > 0)) return
    const n = Math.min(SW, s.values.length * 2)
    let prev = null
    for (let x = 0; x < n; x++) {
      // Two subpixels per value, so a series with `span` values draws across
      // the full width rather than stopping half way.
      const v = s.values[Math.min(s.values.length - 1, x >> 1)] ?? 0
      const y = rowOf(v)
      const from = prev === null ? y : Math.min(prev, y)
      const to = prev === null ? y : Math.max(prev, y)
      for (let g = from; g <= to; g++) {
        const cy = g >> 2, cx = x >> 1
        bits[cy][cx] |= DOT[x & 1][g & 3]
        owner[cy][cx] = si
      }
      prev = y
      ends[si] = y >> 2
    }
  })

  // Values at the right margin, on the cell row each line ended on.
  if (pad > 1) {
    const priority = [series.length - 1, ...series.keys()]
    for (const si of priority) {
      const s = series[si], y = ends[si]
      if (!s?.value || y === null || y === undefined || labelled.has(y)) continue
      labelled.add(y)
      const txt = String(s.value).slice(0, pad - 1)
      for (let k = 0; k < txt.length; k++) {
        const c = span + 1 + k
        if (c < w) text[y][c] = { ch: txt[k], colour: s.color ?? '' }
      }
    }
  }

  return bits.map((row, y) => {
    let line = '', last = null
    for (let c = 0; c < w; c++) {
      const t = text[y][c]
      if (t) {
        if (t.colour !== last) { line += t.colour; last = t.colour }
        line += t.ch
        continue
      }
      if (!row[c]) {
        if (last !== null) { line += R; last = null }
        line += ' '
        continue
      }
      const colour = series[owner[y][c]]?.color ?? ''
      if (colour !== last) { line += colour; last = colour }
      // A space, not U+2800, for an empty cell — but this cell is never empty,
      // so the offset is unconditional here.
      line += String.fromCharCode(0x2800 | row[c])
    }
    return last === null ? line : line + R
  })
}
