// Presets, in btop's format: "box:P:G,box:P:G", presets separated by spaces.
//
// Read out of btop_config.cpp (Apache-2.0). P is 0 or 1 and picks an alternate
// position; G is the graph symbol for that box. btop caps a config at 9 presets
// of at most 4 boxes each and rejects anything naming a box it does not have,
// which is worth copying verbatim — a preset string is the one piece of config
// a user hand-writes, so it is the one place a typo needs a real error.
//
// btop's own default is:
//   "cpu:1:default,proc:0:default cpu:0:default,mem:0:default,net:0:default
//    cpu:0:block,net:0:tty"
// — three layouts that drop boxes rather than resize them, which is the whole
// point. A preset is not a zoom level; it is a decision about what you are not
// looking at.
//
// skein's boxes are head (the strip and the project table), detail, and feed.
export const BOXES = ['head', 'detail', 'feed']
export const SYMBOLS = ['default', 'braille', 'block', 'tty']
export const MAX_PRESETS = 9
export const MAX_BOXES = 4

// 1: everything. 2: drop the detail pane, feed takes the full width — "what is
// happening". 3: the table alone, full height — the most projects on screen.
export const DEFAULT_PRESETS =
  'head:0:default,detail:0:default,feed:0:default head:0:default,feed:0:default head:0:default'

export const NAMES = ['all', 'watch', 'table']

// Returns { ok: true, presets } or { ok: false, error } — never throws and
// never silently drops an entry, because a preset that quietly vanishes reads
// as skein being broken rather than as the config being wrong.
export function parse(str) {
  const presets = []
  const chunks = String(str ?? '').trim().split(/\s+/).filter(Boolean)
  if (!chunks.length) return { ok: false, error: 'no presets given' }
  if (chunks.length > MAX_PRESETS) return { ok: false, error: `at most ${MAX_PRESETS} presets, got ${chunks.length}` }

  for (const chunk of chunks) {
    const boxes = []
    const entries = chunk.split(',').filter(Boolean)
    if (entries.length > MAX_BOXES) return { ok: false, error: `at most ${MAX_BOXES} boxes per preset, got ${entries.length}` }
    for (const entry of entries) {
      const [name, pos, sym] = entry.split(':')
      if (!BOXES.includes(name)) return { ok: false, error: `no box named '${name}' (have: ${BOXES.join(', ')})` }
      if (pos !== '0' && pos !== '1') return { ok: false, error: `position must be 0 or 1, got '${pos}' in '${entry}'` }
      if (!SYMBOLS.includes(sym)) return { ok: false, error: `no graph symbol '${sym}' (have: ${SYMBOLS.join(', ')})` }
      if (boxes.some(b => b.name === name)) return { ok: false, error: `box '${name}' twice in one preset` }
      boxes.push({ name, alt: pos === '1', symbol: sym })
    }
    if (!boxes.some(b => b.name === 'head')) return { ok: false, error: 'every preset must keep head — with no table there is nothing to look at' }
    presets.push(boxes)
  }
  return { ok: true, presets }
}

// What the renderer actually asks: is this box on, and which symbol table does
// it want. `alt` is btop's P — the flag that moves a box rather than hiding it.
export const apply = boxes => ({
  shown: new Set(boxes.map(b => b.name)),
  symbol: Object.fromEntries(boxes.map(b => [b.name, b.symbol])),
  alt: Object.fromEntries(boxes.map(b => [b.name, b.alt])),
})

export const PRESETS = parse(DEFAULT_PRESETS).presets.map(apply)
