// btop's box geometry, measured rather than guessed.
//
// Captured from btop 1.4.6 in a 120x32 pty:
//
//   cpu   x=0   y=0   w=120  h=11    one full-width box: the headline
//   mem   x=0   y=11  w=51   h=13    left column, upper
//   net   x=0   y=24  w=51   h=8     left column, lower
//   proc  x=51  y=11  w=69   h=21    right column, the whole lower height
//
// The shape is: a headline across the top, a split left column, and a tall
// right column for the one view that is a long list. skein's long list is the
// activity feed, so the feed is our proc.
//
// Below ~100 columns btop drops to a single column, and so do we — two 40-wide
// panes are worse than one 80-wide one.
export const WIDE_AT = 100

export function layout(w, h) {
  const headH = Math.max(4, Math.min(Math.floor(h * 0.42), h - 8))

  if (w < WIDE_AT) {
    // Stacked: headline, detail, feed. What we had, kept for narrow terminals.
    const detailH = Math.max(3, Math.min(6, h - headH - 4))
    return {
      wide: false,
      head: { x: 0, y: 0, w, h: headH },
      detail: { x: 0, y: headH, w, h: detailH },
      feed: { x: 0, y: headH + detailH, w, h: h - headH - detailH },
    }
  }

  // btop's proportions: the right column takes the larger share, because the
  // list is the thing you actually read.
  const leftW = Math.max(38, Math.round(w * 0.42))
  const rightW = w - leftW
  const lowerH = h - headH
  return {
    wide: true,
    head: { x: 0, y: 0, w, h: headH },
    detail: { x: 0, y: headH, w: leftW, h: lowerH },
    feed: { x: leftW, y: headH, w: rightW, h: lowerH },
  }
}

// Compose rectangles into one screen.
//
// Boxes are kept as arrays of already-rendered strings rather than written into
// a character grid, because every line carries colour escapes and a naive grid
// would slice them apart. Side-by-side panes share a row index, so joining is
// just concatenation — provided each pane always yields exactly h lines of
// exactly w visible columns, which is what padTo guarantees.
export function compose(h, panes) {
  const rows = Array.from({ length: h }, () => [])
  for (const { rect, lines } of panes) {
    for (let i = 0; i < rect.h; i++) {
      const y = rect.y + i
      if (y >= 0 && y < h) rows[y].push({ x: rect.x, s: lines[i] ?? '' })
    }
  }
  return rows
    .map(parts => parts.sort((a, b) => a.x - b.x).map(p => p.s).join(''))
    .join('\n')
}
