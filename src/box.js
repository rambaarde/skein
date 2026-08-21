// btop's border grammar (design language R4): the border carries the metadata.
// Title inset into the TOP edge, secondary state inset into the BOTTOM edge,
// superscript keybind markers in the corner. Costs no interior row.
//
// aps already does this, arrived at independently -- so skein inherits a house
// style that agrees with btop.
import { DIM, R, BOLD } from './theme.js'

const ROUND = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
const SQUARE = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }

export const width = s => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length

export function box({ w, title = '', state = '', rounded = true, key = '' }) {
  const c = rounded ? ROUND : SQUARE
  const head = title ? `${DIM}${c.h}${R} ${BOLD}${title}${R}${key ? `${DIM}${key}${R}` : ''} ` : ''
  const foot = state ? `${DIM}${c.h} ${state} ${R}` : ''
  const pad = n => c.h.repeat(Math.max(0, n))
  return {
    top: `${DIM}${c.tl}${R}${head}${DIM}${pad(w - 2 - width(head))}${c.tr}${R}`,
    bottom: `${DIM}${c.bl}${R}${foot}${DIM}${pad(w - 2 - width(foot))}${c.br}${R}`,
    row: inner => `${DIM}${c.v}${R}${inner}${' '.repeat(Math.max(0, w - 2 - width(inner)))}${DIM}${c.v}${R}`,
  }
}

export const fit = (s, n) => {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, '')
  if ([...plain].length <= n) return s + ' '.repeat(n - [...plain].length)
  return `${[...plain].slice(0, Math.max(0, n - 1)).join('')}…`
}
