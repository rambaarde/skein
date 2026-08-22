// btop's theme format, read directly.
//
// btop ships 36 themes as plain `theme[key]="#rrggbb"` files and the community
// has written many more. Inventing a second format would mean asking people to
// port palettes that already exist and already look good, so skein reads
// btop's files unchanged: point it at any .theme and it works.
//
// btop is Apache-2.0; see NOTICE. Only the key vocabulary is adopted here —
// no btop code is used, per the licence discipline in the founder thesis.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, basename, isAbsolute } from 'node:path'
import { HOME } from './paths.js'
import { gradient } from './symbols.js'

export const R = '\x1b[0m'
export const DIM = '\x1b[2m'
export const BOLD = '\x1b[1m'
export const REV = '\x1b[7m'
export const ITAL = '\x1b[3m'

const fg = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`
}
const bg = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `\x1b[48;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`
}

// Where a theme might live: btop's own install, the user's btop themes, or a
// path given outright. Sharing btop's directories is the point — a theme you
// already use in btop should just work here.
export const THEME_DIRS = [
  join(HOME, '.config', 'btop', 'themes'),
  join(HOME, '.local', 'share', 'btop', 'themes'),
  '/opt/homebrew/share/btop/themes',
  '/usr/share/btop/themes',
  '/usr/local/share/btop/themes',
]

export function listThemes() {
  const seen = new Map()
  for (const d of THEME_DIRS) {
    try {
      for (const f of readdirSync(d)) {
        if (f.endsWith('.theme') && !seen.has(f)) seen.set(f, join(d, f))
      }
    } catch {}
  }
  return [...seen.entries()].map(([f, p]) => ({ name: basename(f, '.theme'), path: p })).sort((a, b) => a.name.localeCompare(b.name))
}

export function findTheme(nameOrPath) {
  if (!nameOrPath) return null
  if (isAbsolute(nameOrPath) || nameOrPath.includes('/')) return existsSync(nameOrPath) ? nameOrPath : null
  return listThemes().find(t => t.name === nameOrPath)?.path ?? null
}

export function parseTheme(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const m = /^\s*theme\[([a-z_]+)\]\s*=\s*"([^"]*)"/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}

// The terminal's own colours, which is the default and the fallback for any key
// a theme leaves out. main_bg empty means transparent — btop's convention, and
// the reason skein never paints a surface it was not asked to paint.
// btop paints a background out of the box — every theme it ships sets main_bg,
// and that solid field is most of why it reads as one program rather than text
// over a wallpaper. skein inherited the terminal by default and looked like the
// latter through a translucent one, so the default is now opaque and
// --transparent is the way back.
const DEFAULT_BG = '\x1b[48;2;0;0;0m'

// The chrome had no colour at all: fg, hi and title were empty strings and
// every border was DIM, so the whole frame fell back to whatever grey the
// terminal paints. The two gradients were the only colour on screen, which is
// why it read as plain beside btop — btop ships a real palette, and it gives
// EVERY box its own outline colour (cpu_box, mem_box, net_box, proc_box are
// four separate theme keys, design-language R6). One grey for three panes
// throws that away.
const fgOf = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `\x1b[38;2;${r};${g};${b}m`
}

const INHERIT = {
  fg: fgOf('#c8d3e0'),          // main text: light, not terminal-default white
  dim: fgOf('#6b7688'),         // labels and units — readable, not invisible
  title: `${BOLD}${fgOf('#e6edf5')}`,
  hi: fgOf('#e5b567'),          // keybind letters, so a control reads as pressable
  inactive: fgOf('#4d5666'),
  selBg: REV, selFg: '', surface: DEFAULT_BG,
  // Per-pane outlines, btop's four box colours mapped onto skein's three.
  box: fgOf('#3f4b5e'),
  boxHead: fgOf('#4fb3c8'),     // cpu: the headline
  boxDetail: fgOf('#7cb87c'),   // mem: the pane you inspect with
  boxFeed: fgOf('#b48ead'),     // proc: the long list
  header: fgOf('#8fa6c4'),      // column headers, so the table has a top edge
  activity: gradient('#4a5a8a', '#49b7a0', '#e8d17a'),
  heat: gradient('#3b6ea5', '#d99a3a', '#d1495b'),
  agent: {
    claude: '\x1b[38;2;217;138;90m',
    codex: '\x1b[38;2;110;170;220m',
    opencode: '\x1b[38;2;150;190;120m',
  },
}

export function buildTheme(nameOrPath) {
  const path = findTheme(nameOrPath)
  if (!path) return { ...INHERIT, name: null }
  let t
  try { t = parseTheme(readFileSync(path, 'utf8')) } catch { return { ...INHERIT, name: null } }

  const grad = (a, b, c, fallback) =>
    t[a] && t[c] ? gradient(t[a], t[b] || null, t[c]) : fallback

  return {
    name: basename(path, '.theme'),
    path,
    fg: fg(t.main_fg) ?? INHERIT.fg,
    dim: fg(t.inactive_fg) ?? INHERIT.dim,
    title: (fg(t.title) ?? '') + BOLD,
    hi: fg(t.hi_fg) ?? INHERIT.hi,
    inactive: fg(t.inactive_fg) ?? INHERIT.inactive,
    // An empty main_bg is btop saying "inherit the terminal". Honour it — an
    // explicit choice in a theme file outranks our default.
    surface: t.main_bg ? (bg(t.main_bg) ?? DEFAULT_BG) : '',
    selBg: bg(t.selected_bg) ?? REV,
    selFg: fg(t.selected_fg) ?? '',
    box: fg(t.proc_box ?? t.cpu_box ?? t.div_line) ?? INHERIT.box,
    // cpu_* is btop's busy-ness ramp, which is what an activity timeline is.
    activity: grad('cpu_start', 'cpu_mid', 'cpu_end', INHERIT.activity),
    // temp_* runs cool→hot, which is what a collision heat line wants.
    heat: grad('temp_start', 'temp_mid', 'temp_end', INHERIT.heat),
    // btop names one theme key per box; skein reads the same four and maps
    // proc onto its long list, which is what proc is.
    boxHead: fg(t.cpu_box) ?? INHERIT.boxHead,
    boxDetail: fg(t.mem_box) ?? INHERIT.boxDetail,
    boxFeed: fg(t.proc_box) ?? INHERIT.boxFeed,
    header: fg(t.title) ?? INHERIT.header,
    agent: {
      claude: fg(t.cpu_end) ?? INHERIT.agent.claude,
      codex: fg(t.hi_fg) ?? INHERIT.agent.codex,
      opencode: fg(t.cpu_start) ?? INHERIT.agent.opencode,
    },
  }
}

// The live theme. Swapped at startup; everything else reads through it.
export let THEME = { ...INHERIT, name: null }
export const setTheme = nameOrPath => { THEME = buildTheme(nameOrPath); return THEME }

export const hue = a => THEME.agent[a] ?? ''

// Paint the theme's background through a line.
//
// btop looks solid because its themes set main_bg — "#1a1b26" for tokyo-night,
// "#282a36" for dracula — and it fills with it. skein parsed that key from the
// first day and never used it, so a translucent terminal showed straight
// through the panes.
//
// A background cannot simply be prefixed: every reset inside the line clears it
// again, and there are resets after every coloured span. So re-arm the colour
// after each one. Erase-to-end-of-line would be cheaper but is wrong the moment
// two panes sit side by side.
export const paint = line => {
  const s = THEME.surface
  if (!s) return line
  return s + line.replaceAll(R, R + s) + R
}

// An explicit solid background, for when you want btop's look without adopting
// one of its palettes.
export const setTransparent = () => { THEME.surface = '' }

export const setOpaque = (hex = '#000000') => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  THEME.surface = `\x1b[48;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`
  return true
}
export const LUT = { get activity() { return THEME.activity }, get heat() { return THEME.heat } }
export const SUP = ['¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
