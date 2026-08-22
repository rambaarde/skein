// Mouse support, the way btop does it.
//
// Captured from a real btop session: it enables 1002 (button-event tracking),
// 1015 and 1006 (SGR extended coordinates). SGR is the one that matters —
// without it coordinates are a single byte and break past column 223, which is
// an ordinary width on a wide terminal.
export const ON = '\x1b[?1000h\x1b[?1002h\x1b[?1006h'
export const OFF = '\x1b[?1006l\x1b[?1002l\x1b[?1000l'

// SGR: ESC [ < button ; col ; row (M press | m release), 1-based.
const SGR = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/

export function parseMouse(seq) {
  const m = SGR.exec(seq)
  if (!m) return null
  const button = Number(m[1])
  const x = Number(m[2]) - 1
  const y = Number(m[3]) - 1
  const press = m[4] === 'M'
  // 64 and 65 are wheel up/down; the low two bits carry the button otherwise.
  if (button === 64) return { kind: 'wheel', dir: -1, x, y }
  if (button === 65) return { kind: 'wheel', dir: 1, x, y }
  if (!press) return null                       // releases are not clicks
  if (button >= 32) return null                 // drag/move, not a click
  return { kind: 'click', button: button & 3, x, y }
}

// Where the clickable things are. render() fills this in as it draws, because
// the layout decides row positions at render time and guessing them again in
// the input handler is how the two drift apart.
export function hits() {
  return { rows: [], tags: [] }
}

export function hitRow(map, y) {
  return map.rows.find(r => r.y === y)?.index ?? null
}

export function hitTag(map, x, y) {
  return map.tags.find(t => t.y === y && x >= t.x && x < t.x + t.w)?.key ?? null
}
