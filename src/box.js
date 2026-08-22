// btop's border grammar (design language R4): the border carries the metadata.
// Title inset into the TOP edge, secondary state inset into the BOTTOM edge,
// superscript keybind markers in the corner. Costs no interior row.
//
// aps already does this, arrived at independently -- so skein inherits a house
// style that agrees with btop.
import { DIM, R, BOLD, THEME } from './theme.js'

const ROUND = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
const SQUARE = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }

export const width = s => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length

// btop hangs labelled controls off the border rather than listing keys in a
// footer: ┘filter└ ┘tree└ ┘- 2000ms +└. The bracket says "this is a thing you
// press", which a comma-separated key list never does.
export const tag = (key, label) => `${THEME.box}┘${R}${BOLD}${key}${R}${THEME.box} ${label}└${R}`

export function box({ w, title = '', state = '', right = '', rounded = true, key = '' }) {
  const c = rounded ? ROUND : SQUARE
  // Border text is decoration; the frame is not. Anything that will not fit is
  // dropped rather than allowed to push the corner off the right edge.
  const room = Math.max(0, w - 6)
  const clamp = s => (width(s) <= room ? s : `${[...s.replace(/\x1b\[[0-9;]*m/g, '')].slice(0, room).join('')}`)
  title = clamp(title); state = clamp(state)
  const head = title ? `${THEME.box}${c.h}${R} ${BOLD}${title}${R}${key ? `${DIM}${key}${R}` : ''} ` : ''
  const foot = state ? `${THEME.box}${c.h} ${state} ${R}` : ''
  const pad = n => c.h.repeat(Math.max(0, n))
  // A right-hand tag on the top edge: btop puts the clock there, and a clock
  // that moves is the cheapest possible proof the program has not wedged.
  const tail = right ? `${THEME.box}${c.h} ${right} ${c.h}${R}` : ''
  return {
    top: `${THEME.box}${c.tl}${R}${head}${THEME.box}${pad(w - 2 - width(head) - width(tail))}${R}${tail}${DIM}${c.tr}${R}`,
    bottom: `${THEME.box}${c.bl}${R}${foot}${THEME.box}${pad(w - 2 - width(foot))}${c.br}${R}`,
    // A row that is too long is a bug in the caller, but it must not be
    // allowed to push the right border off the screen and corrupt the frame.
    // Pad short, truncate long, never overflow.
    row: inner => {
      const room = w - 2
      const over = width(inner) - room
      const body = over > 0 ? fit(inner.replace(/\x1b\[[0-9;]*m/g, ''), room) : inner
      return `${THEME.box}${c.v}${R}${body}${' '.repeat(Math.max(0, room - width(body)))}${THEME.box}${c.v}${R}`
    },
  }
}

export const fit = (s, n) => {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, '')
  if ([...plain].length <= n) return s + ' '.repeat(n - [...plain].length)
  return `${[...plain].slice(0, Math.max(0, n - 1)).join('')}…`
}
