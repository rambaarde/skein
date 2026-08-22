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

// `shown` is a preset's box set. A preset DROPS boxes rather than resizing
// them — btop's three defaults are cpu+proc, cpu+mem+net, cpu+net — so the
// boxes that remain expand to fill what the missing ones left behind. That is
// the difference between a preset and a zoom level.
export function layout(w, h, shown = null) {
  const on = n => !shown || shown.has(n)

  // head alone: the table gets the whole screen, which is the point of that
  // preset. No split, no leftover panes.
  if (!on('detail') && !on('feed')) return { wide: w >= WIDE_AT, head: { x: 0, y: 0, w, h } }

  // The headline carries the chart, the live strip AND the project table, so
  // it takes appreciably more than btop's cpu box did.
  //
  // At an even half the screen the chart was squeezed between a table that
  // wanted its rows and a floor it could not go below, while the two panes
  // underneath sat half empty — the activity feed is a long list, but the
  // twentieth line of it is not worth a row of the graph. Nearly two thirds up
  // top, never so much that the panes below lose their own headers.
  const headH = Math.max(4, Math.min(Math.floor(h * 0.62), h - 8))

  // One pane below instead of two: it takes the full width rather than half of
  // it sitting beside a gap.
  if (on('feed') !== on('detail')) {
    const only = on('feed') ? 'feed' : 'detail'
    return {
      wide: w >= WIDE_AT,
      head: { x: 0, y: 0, w, h: headH },
      [only]: { x: 0, y: headH, w, h: h - headH },
    }
  }

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
