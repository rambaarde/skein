// A braille canvas you can draw arbitrary lines on.
//
// chart.js already packs braille dots, but only ever vertically: a series is a
// column of runs, and a run is `for (g = from; g <= to; g++)`. A graph needs
// segments at any angle, so this is the general version -- same 2x4 subpixel
// grid, same dot-bit layout, plus Bresenham and a per-cell owner so a node's
// colour survives the line that passes near it.
//
// Kept separate from chart.js rather than bolted onto it. The chart's plotter
// carries the value-label placement, the fade rules and the series ordering,
// none of which a node-link diagram wants, and the two would have grown a flag
// each to tell them apart.
import { R } from './theme.js'

// The standard's own layout: left column is dots 1,2,3,7 and right is 4,5,6,8,
// which is bits 0,1,2,6 and 3,4,5,7.
const DOT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]

export function canvas(w, h) {
  const W = Math.max(1, w), H = Math.max(1, h)
  const bits = Array.from({ length: H }, () => new Array(W).fill(0))
  // Which colour owns each CELL. Braille colour is per cell, not per dot, so a
  // cell can only be one thing -- and what it should be is whatever was drawn
  // most deliberately. Edges claim a cell only if nothing has, nodes always.
  const own = Array.from({ length: H }, () => new Array(W).fill(null))
  const text = Array.from({ length: H }, () => new Array(W).fill(null))

  const dot = (x, y, colour, force = false) => {
    const cx = x >> 1, cy = y >> 2
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return
    bits[cy][cx] |= DOT[x & 1][y & 3]
    if (force || own[cy][cx] === null) own[cy][cx] = colour ?? ''
  }

  // Bresenham. Integer only, so a line never drifts a subpixel and never draws
  // the same dot twice.
  const line = (x0, y0, x1, y1, colour) => {
    let x = Math.round(x0), y = Math.round(y0)
    const ex = Math.round(x1), ey = Math.round(y1)
    const dx = Math.abs(ex - x), dy = -Math.abs(ey - y)
    const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1
    let err = dx + dy
    // A bound, because a NaN coordinate would otherwise spin here forever and
    // a hung dashboard is worse than a missing edge.
    for (let guard = 0; guard < (dx - dy) + 4; guard++) {
      dot(x, y, colour)
      if (x === ex && y === ey) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x += sx }
      if (e2 <= dx) { err += dx; y += sy }
    }
  }

  // Text sits ON TOP of the dots, in cell coordinates, because a label is read
  // and a dot is only seen.
  const label = (cx, cy, s, colour) => {
    for (let i = 0; i < s.length; i++) {
      const c = cx + i
      if (c < 0 || c >= W || cy < 0 || cy >= H) continue
      text[cy][c] = { ch: s[i], colour: colour ?? '' }
    }
  }

  const rows = () => bits.map((row, y) => {
    let out = '', last = null
    for (let c = 0; c < W; c++) {
      const t = text[y][c]
      if (t) {
        if (t.colour !== last) { out += t.colour; last = t.colour }
        out += t.ch
        continue
      }
      if (!row[c]) {
        if (last !== null) { out += R; last = null }
        out += ' '
        continue
      }
      const colour = own[y][c] ?? ''
      if (colour !== last) { out += colour; last = colour }
      out += String.fromCharCode(0x2800 + row[c])
    }
    return last === null ? out : out + R
  })

  return { dot, line, label, rows, w: W, h: H, sw: W * 2, sh: H * 4 }
}
