// One theme, and it is mostly the terminal's own (design language R5).
//
// btop ships 41 theme files and 42 keys each. skein ships none: `main_bg` empty
// means transparent, and that is the only surface decision worth inheriting
// until somebody asks for more (PRD Q5, and the aps non-goal about anything
// requiring ongoing maintenance).
import { gradient } from './symbols.js'

export const R = '\x1b[0m'
export const DIM = '\x1b[2m'
export const BOLD = '\x1b[1m'
export const REV = '\x1b[7m'
export const ITAL = '\x1b[3m'

// Value gradients: cool when quiet, hot when busy. Colour encodes VALUE (R3).
export const LUT = {
  activity: gradient('#4a5a8a', '#49b7a0', '#e8d17a'),
  heat: gradient('#3b6ea5', '#d99a3a', '#d1495b'),
}

// Per-agent hue, used ONLY in the roster (design language §3.1 -- never a
// value-gradient and a series-hue inside one widget).
export const AGENT_HUE = {
  claude: '\x1b[38;2;217;138;90m',
  codex: '\x1b[38;2;110;170;220m',
  opencode: '\x1b[38;2;150;190;120m',
}
export const hue = a => AGENT_HUE[a] ?? ''

// Superscript keybind markers, exactly btop's convention (R4).
export const SUP = ['¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
