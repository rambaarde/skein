// btop's border grammar (design language R4): the border carries the metadata.
// Title inset into the TOP edge, secondary state inset into the BOTTOM edge,
// superscript keybind markers in the corner. Costs no interior row.
//
// aps already does this, arrived at independently -- so skeins inherits a house
// style that agrees with btop.
import { DIM, R, BOLD, THEME, paint } from './theme.js'

const ROUND = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
const SQUARE = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }

export const width = s => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length

// Truncate to a VISIBLE width while keeping the colour.
//
// This used to be `fit(inner.replace(/escapes/g, ''), room)` — strip every
// escape, then cut. Table rows are built to fill the pane, so they overshoot by
// a character or two and every one of them came out grey. That is why skeins
// read as a colourless program next to btop while its borders were painted
// perfectly: the colour was being generated and then thrown away one layer
// before the screen.
export function clip(s, n) {
  let out = '', seen = 0, painted = false
  for (let i = 0; i < s.length;) {
    if (s[i] === '\x1b') {
      const m = /^\x1b\[[0-9;]*m/.exec(s.slice(i))
      // Only close what was actually opened. A plain string must come back
      // plain — appending a reset to uncoloured text is invisible noise that
      // still changes the string, and equality on rendered output is how this
      // module is tested.
      if (m) { out += m[0]; painted = true; i += m[0].length; continue }
    }
    if (seen >= n - 1) return painted ? `${out}…${R}` : `${out}…`
    out += s[i]; seen++; i++
  }
  return out
}

// btop hangs labelled controls off its border with ┘…└ brackets. Copied
// faithfully, those brackets rendered as detached vertical ticks in a terminal
// whose font does not join box-drawing to a horizontal rule — the row read as
// "U U U" rather than as a set of controls, and it was the single most
// complained-about thing on the screen.
//
// So: keep btop's idea, drop its glyphs. The key is highlighted and bold, the
// label is dim, and a middle dot separates them. That reads correctly in every
// font, which the brackets did not.
export const tag = (key, label) =>
  `${BOLD}${THEME.hi}${key}${R}${THEME.dim} ${label}${R}`
export const TAG_SEP = ` ${'·'} `

// `line` is btop's line_color argument to createBox: every box names its own
// outline colour, which is what stops three panes reading as one grey frame.
export function box({ w, title = '', state = '', right = '', rounded = true, key = '', line = null }) {
  const c = rounded ? ROUND : SQUARE
  const B = line ?? THEME.box
  // Border text is decoration; the frame is not. Anything that will not fit is
  // dropped rather than allowed to push the corner off the right edge.
  const room = Math.max(0, w - 6)
  const clamp = s => (width(s) <= room ? s : `${[...s.replace(/\x1b\[[0-9;]*m/g, '')].slice(0, room).join('')}`)
  title = clamp(title); state = clamp(state)
  const head = title ? `${B}${c.h}${R} ${BOLD}${title}${R}${key ? `${DIM}${key}${R}` : ''} ` : ''
  const foot = state ? `${B}${c.h} ${state} ${R}` : ''
  const pad = n => c.h.repeat(Math.max(0, n))
  // A right-hand tag on the top edge: btop puts the clock there, and a clock
  // that moves is the cheapest possible proof the program has not wedged.
  const tail = right ? `${B}${c.h} ${right} ${c.h}${R}` : ''
  return {
    top: paint(`${B}${c.tl}${R}${head}${B}${pad(w - 2 - width(head) - width(tail))}${R}${tail}${DIM}${c.tr}${R}`),
    bottom: paint(`${B}${c.bl}${R}${foot}${B}${pad(w - 2 - width(foot))}${c.br}${R}`),
    // A row that is too long is a bug in the caller, but it must not be
    // allowed to push the right border off the screen and corrupt the frame.
    // Pad short, truncate long, never overflow.
    row: inner => {
      const room = w - 2
      const body = width(inner) > room ? clip(inner, room) : inner
      return paint(`${B}${c.v}${R}${body}${' '.repeat(Math.max(0, room - width(body)))}${B}${c.v}${R}`)
    },
  }
}

// Pad to n, or truncate to n WITH its colour intact. The truncating branch used
// to strip every escape first, so a value that happened to be too long for its
// column lost its colour while its shorter neighbours kept theirs — the same
// defect as the row clipper, one layer further in, and between them they took
// most of the colour off the table.
export const fit = (s, n) => {
  const len = width(s)
  if (len <= n) return s + ' '.repeat(Math.max(0, n - len))
  return clip(s, n)
}
