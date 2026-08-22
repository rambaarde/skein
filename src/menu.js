// btop's menu, and the reason it is a menu rather than another key.
//
// Everything skeins can do was already reachable and none of it was findable:
// the controls live on a border, the help lives behind '?', and a reader who
// does not already know that '?' is a key never presses it. btop solves this
// with one word on the box border -- `menu` -- which dims the whole dashboard
// and puts three large words in the middle of it. Nothing about that is
// decoration: a dimmed backdrop says the dashboard is still there and still
// live, and a word drawn five rows tall is the only thing on a terminal that
// cannot be mistaken for data.
//
// Five rows, five columns per letter, one column of air between them. Only the
// letters the three words need -- a full alphabet nobody draws is a table to
// keep correct for no one.
const F = {
  M: ['█   █', '██ ██', '█ █ █', '█   █', '█   █'],
  E: ['█████', '█    ', '████ ', '█    ', '█████'],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  R: ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
  I: ['█████', '  █  ', '  █  ', '  █  ', '█████'],
  C: [' ████', '█    ', '█    ', '█    ', ' ████'],
  S: [' ████', '█    ', ' ███ ', '    █', '████ '],
  K: ['█   █', '█  █ ', '███  ', '█  █ ', '█   █'],
  Y: ['█   █', ' █ █ ', '  █  ', '  █  ', '  █  '],
  Q: [' ███ ', '█   █', '█   █', '█  █ ', ' ██ █'],
  U: ['█   █', '█   █', '█   █', '█   █', ' ███ '],
  ' ': ['     ', '     ', '     ', '     ', '     '],
}

export const ROWS = 5

// A word, five rows tall. An unknown letter is a blank cell rather than a
// crash -- this draws a menu, and a menu that throws is worse than one with a
// gap in a word.
export function banner(word) {
  const letters = [...String(word).toUpperCase()].map(c => F[c] ?? F[' '])
  return Array.from({ length: ROWS }, (_, r) => letters.map(l => l[r]).join(' '))
}

export const bannerWidth = word => Math.max(0, String(word).length * 6 - 1)
