// btop's visual grammar (design language R1, R2, R3).
//
// R1  Every graph cell packs TWO samples, five levels each -- indexed
//     table[left * 5 + right]. Stacking H rows gives 4*H vertical levels at
//     2x horizontal density. This one decision is most of the visual gap
//     between btop and a one-sample-per-cell sparkline.
// R2  Fidelity tiers are a TABLE SWAP, never a code path. braille -> block ->
//     tty all share the 25-entry shape, so the renderer never branches.
// R7  Every table has an inverted twin, so a second series can hang from a
//     baseline instead of fighting for colour.

// Braille dot bits: left column = dots 1,2,3,7 (bits 0,1,2,6);
// right column = dots 4,5,6,8 (bits 3,4,5,7).
const L_UP = [0, 0b01000000, 0b01000100, 0b01000110, 0b01000111]
const R_UP = [0, 0b10000000, 0b10100000, 0b10110000, 0b10111000]
const L_DOWN = [0, 0b00000001, 0b00000011, 0b00000111, 0b01000111]
const R_DOWN = [0, 0b00001000, 0b00011000, 0b00111000, 0b10111000]

const braille = (l, r) => {
  const t = []
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) t.push(String.fromCharCode(0x2800 | l[a] | r[b]))
  // btop uses a real space for the empty cell, not U+2800. Deliberate: a space
  // lets the terminal's own background through (R5 -- never paint a surface).
  t[0] = ' '
  return t
}

const BLOCK_UP = [' ', '▗', '▗', '▐', '▐', '▖', '▄', '▄', '▟', '▟', '▖', '▄', '▄', '▟', '▟', '▌', '▙', '▙', '█', '█', '▌', '▙', '▙', '█', '█']
const BLOCK_DOWN = [' ', '▝', '▝', '▐', '▐', '▘', '▀', '▀', '▜', '▜', '▘', '▀', '▀', '▜', '▜', '▌', '▛', '▛', '█', '█', '▌', '▛', '▛', '█', '█']
const TTY_UP = [' ', '░', '░', '▒', '▒', '░', '░', '▒', '▒', '█', '░', '▒', '▒', '█', '█', '▒', '▒', '█', '█', '█', '▒', '█', '█', '█', '█']

export const TIERS = {
  braille: { up: braille(L_UP, R_UP), down: braille(L_DOWN, R_DOWN) },
  block: { up: BLOCK_UP, down: BLOCK_DOWN },
  tty: { up: TTY_UP, down: TTY_UP },
}

// Pick the tier the terminal can actually draw. A data lookup, not a branch.
export function tierFor(env = process.env) {
  if (env.SKEIN_TIER && TIERS[env.SKEIN_TIER]) return env.SKEIN_TIER
  const term = env.TERM ?? ''
  if (term === 'linux' || term === 'dumb' || !term) return 'tty'
  const utf8 = /UTF-?8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '')
  return utf8 ? 'braille' : 'block'
}

// R3 -- gradients are precomputed 0-100 lookup tables built from 2-3 stops.
// Colour encodes VALUE, not series. One array index per frame at render time,
// which is the cheapest way to look expensive.
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

export function gradient(start, mid, end) {
  const [s, m, e] = [hex(start), mid ? hex(mid) : null, hex(end)]
  const lut = []
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    const rgb = m
      ? (t < 0.5 ? mix(s, m, t * 2) : mix(m, e, (t - 0.5) * 2))
      : mix(s, e, t)
    lut.push(`\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`)
  }
  return lut
}

// Render one series as a braille/block graph.
// `values` are 0..1; two consumed per cell (R1). `rows` stacks for height.
export function graph(values, { width, rows = 1, tier = 'braille', down = false, lut = null }) {
  const table = TIERS[tier][down ? 'down' : 'up']
  const need = width * 2
  const src = values.length >= need
    ? values.slice(values.length - need)
    : [...Array(need - values.length).fill(0), ...values]
  const levels = rows * 4
  const out = []
  for (let row = 0; row < rows; row++) {
    // Row 0 is the top row when drawing up, so it holds the highest levels.
    const floor = down ? row * 4 : (rows - 1 - row) * 4
    let line = ''
    let last = null
    for (let c = 0; c < width; c++) {
      const a = src[c * 2], b = src[c * 2 + 1]
      const la = Math.max(0, Math.min(4, Math.round(a * levels) - floor))
      const lb = Math.max(0, Math.min(4, Math.round(b * levels) - floor))
      if (lut) {
        const v = Math.round(Math.max(a, b) * 100)
        const col = lut[Math.max(0, Math.min(100, v))]
        if (col !== last) { line += col; last = col }
      }
      line += table[la * 5 + lb]
    }
    out.push(line)
  }
  return out
}
