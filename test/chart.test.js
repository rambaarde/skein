import test from 'node:test'
import assert from 'node:assert/strict'
import { plot, chart, legend, xaxis, axisLine, niceMax, cumulative, DURATIONS, MARKERS, MAX_SERIES, BELOW } from '../src/chart.js'

const plain = s => s.replace(/\x1b\[[0-9;]*m/g, '')
const at = (lines, ch) => lines.findIndex(l => plain(l).includes(ch))

test('a series is identified by marker as well as by colour', () => {
  // Colour is per character CELL, so where two lines share a cell only one hue
  // survives. The marker is what still tells them apart there.
  assert.equal(MARKERS.length, MAX_SERIES)
  assert.equal(new Set(MARKERS).size, MARKERS.length, 'every marker is distinct')
  assert.ok(MARKERS.every(m => m.codePointAt(0) < 0x2000),
    'markers stay narrow — an ambiguous-width glyph would push the border off screen')
  // Solid, not styled. Dash-dot "line styles" were three quarters filler and
  // read on screen as dotted leader lines rather than as data.
  assert.ok(MARKERS.every(m => m.length === 1), 'a line is its marker, repeated')
})

test('a higher value draws higher up the grid', () => {
  const rows = plot([{ marker: '#', values: [1, 0.5] }], { width: 2, rows: 5, max: 1, tier: 'tty' })
  assert.equal(rows.length, 5)
  assert.equal(plain(rows[0])[0], '#', 'a full value reaches the top row')
  assert.equal(plain(rows[4])[0], ' ', 'and does not smear down to the floor')
  assert.equal(plain(rows[2])[1], '#', 'half draws halfway')
})

test('a quiet stretch is a line along the floor, not a gap', () => {
  // Breaking the line at every zero turned the chart into scattered marks:
  // columns of dots rather than lines you can follow across a day, which is
  // the entire look this imitates. A flat run along the bottom is what a quiet
  // stretch means in any real chart, and it reads correctly.
  const rows = plot([{ marker: '#', values: [1, 0, 1] }], { width: 3, rows: 4, max: 1, tier: 'tty' })
  assert.equal(plain(rows.at(-1))[1], '#', 'the quiet middle sits on the floor rather than vanishing')
  assert.equal(plain(rows.at(-1))[0], ' ', 'while the peak beside it stays at the top')
  // The drop and the climb are drawn as runs, so the eye follows one line down
  // and back up rather than reading three unrelated marks.
  assert.ok(rows.every(l => plain(l)[1] === '#'), 'the fall to it is continuous')
  assert.ok(rows.every(l => plain(l)[2] === '#'), 'as is the climb back out')
})

test('a series with nothing in the window is not drawn at all', () => {
  // Drawing it would lay a flat line along the bottom row saying nothing, and
  // six of those on top of each other is the width of the chart in noise.
  const rows = plot([{ marker: '#', values: [0, 0, 0] }], { width: 3, rows: 3, max: 1, tier: 'tty' })
  assert.deepEqual(rows.map(plain), ['   ', '   ', '   '])
})

test('a running total climbs where the work was and runs flat where it was not', () => {
  // Attention landing IN each slice is zero for most of any day, so plotting
  // it directly can only draw a floor with occasional bumps — two rounds of
  // trying to make that read as lines proved the shape was in the data, not in
  // the rendering. A running total is nonzero everywhere once work has
  // started, every series sits at its own height, and the lines fan out.
  assert.deepEqual(cumulative([0, 2, 0, 3, 0]), [0, 2, 2, 5, 5])
  assert.deepEqual(cumulative([]), [])
  const c = cumulative([1, 1, 1])
  assert.ok(c.every((v, i) => i === 0 || v >= c[i - 1]), 'it never goes down')
  assert.equal(c.at(-1), 3, 'and it ends at the total')
})

test('the scale is a duration a human recognises', () => {
  const M = 60_000, H = 3_600_000
  assert.equal(niceMax(12 * M), 15 * M, 'twelve minutes of work gets a quarter-hour axis')
  assert.equal(niceMax(20 * M), 20 * M, 'and a round one is left alone')
  assert.equal(niceMax(70 * M), 1.5 * H)
  assert.ok(DURATIONS.every((d, i) => i === 0 || d > DURATIONS[i - 1]), 'the ladder ascends')
})

test('a line is drawn solid, in its own marker', () => {
  // Each series used to get a dash-dot "line style" — `+···`, `o···`, `x-·-`.
  // Three quarters of that is filler, and on screen it read as dotted leader
  // lines rather than as data. gnuplot draws `##########`, which is why its
  // lines look like lines.
  const rows = plot([{ marker: '*', values: [1, 1, 1, 1] }], { width: 4, rows: 2, max: 1, tier: 'tty' })
  assert.equal(plain(rows[0]), '****', 'every column of the line carries the marker')
})

test('series share one scale, so the lines are comparable', () => {
  const rows = plot([
    { marker: '#', values: [1, 1] },
    { marker: '*', values: [0.5, 0.5] },
  ], { width: 2, rows: 5, max: 1, tier: 'tty' })
  assert.equal(at(rows, '#'), 0)
  assert.equal(at(rows, '*'), 2, 'half the value sits half way up, not at its own peak')
})

test('a later series wins a shared cell', () => {
  const rows = plot([
    { marker: '#', values: [1] },
    { marker: '*', values: [1] },
  ], { width: 1, rows: 3, max: 1, tier: 'tty' })
  assert.equal(plain(rows[0]), '*', 'the last one drawn is the one you can read')
})

test('each line prints its own value at the height it ends on', () => {
  const rows = plot([{ marker: '#', values: [1, 1], value: '2h' }], { width: 6, rows: 4, max: 1, pad: 3, tier: 'tty' })
  assert.ok(plain(rows[0]).includes('2h'), 'the number sits on the line, not in a footnote')
  assert.ok(rows.every(r => plain(r).length === 6), 'and inside the width it was given')
})

test('a ladder can be given, for values that are not durations', () => {
  // Scaling straight to the peak produced an axis reading 187% 169% 150% — ten
  // true numbers, none of them round.
  const tenths = [0.25, 0.5, 1, 2]
  assert.equal(niceMax(0.3, tenths), 0.5)
  assert.equal(niceMax(1.87, tenths), 2)
  assert.equal(niceMax(99, tenths), 99, 'a value off the end of the ladder still gets a ceiling')
})

test('the x axis is ruled and labelled, ending at now', () => {
  const now = new Date('2026-08-22T18:00:00').getTime()
  const since = now - 24 * 3600_000
  const rule = axisLine(41)
  const times = xaxis(since, now, { width: 41 })
  assert.equal(rule.length, 41)
  assert.equal(times.length, 41)
  assert.ok(times.trimEnd().endsWith('now'), 'the right edge is the one label nobody should have to work out')
  // A time printed under the wrong tick is worse than no tick at all.
  for (let i = 0; i < rule.length; i++) {
    if (rule[i] === '┬' && i < rule.length - 4) assert.match(times.slice(i, i + 5), /^\d\d:\d\d$/)
  }
})

test('a legend counts what it could not fit', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ marker: MARKERS[i], label: `project-${i}`, value: '1h' }))
  const wide = plain(legend(many, { width: 200 }))
  const tight = plain(legend(many, { width: 40 }))
  assert.ok(wide.includes('project-5'), 'everything fits when there is room')
  assert.match(tight, /\+\d more/, 'and what does not is counted, never silently dropped')
  assert.ok(tight.length <= 40)
})

test('the block is graph rows plus a fixed three', () => {
  const now = Date.now()
  const out = chart([{ marker: '#', label: 'r', value: '2h', values: [1, 0.5, 1] }], {
    width: 60, rows: 6, max: 1, since: now - 3600_000, now, caption: 'attention · 24h', tier: 'tty',
  })
  assert.equal(out.length, 6 + BELOW, 'rule, times and legend — the caller budgets for exactly these')
  assert.ok(out.slice(0, 6).every(l => plain(l).includes('┤')), 'every graph row carries a gradation')
  assert.match(plain(out[5]), /^\s+0\s+┤/, 'and the last one reads 0')
  assert.ok(plain(out.at(-1)).includes('attention · 24h'), 'the caption says what the axis measures')
  assert.ok(plain(out.at(-1)).includes('#: r'), 'and the legend says which line is which')
})

test('the braille tier draws a line one dot thick', () => {
  // This is the whole difference between a chart that looks like a tool and a
  // wall of hashes, and it is why btop, ratatui and blessed-contrib all look
  // the way they do. A cell is 2x4 subpixels, so eight rows of braille is
  // thirty-two levels of vertical resolution rather than eight.
  const rows = plot([{ marker: '#', color: '', values: [0, 0.25, 0.5, 0.75, 1] }], { width: 5, rows: 4, max: 1 })
  const body = rows.map(plain).join('')
  assert.ok([...body].every(c => c === ' ' || (c >= '\u2800' && c <= '\u28ff')), 'every drawn cell is a braille glyph')
  assert.ok(!body.includes('#'), 'the marker does not appear in the plot — its identity is the hue')
  // The rise reaches the top row and starts at the bottom one.
  assert.ok(plain(rows[0]).trim().length, 'the peak reaches the top')
  assert.ok(plain(rows.at(-1)).trim().length, 'and the floor is drawn')
})

test('the legend key follows the tier, because identity does', () => {
  const s = [{ marker: '#', label: 'r', value: '2h', color: '' }]
  assert.ok(plain(legend(s, { width: 40, tier: 'tty' })).startsWith('#:'), 'markers draw the line, so markers key it')
  assert.ok(plain(legend(s, { width: 40, tier: 'braille' })).startsWith('⣿⣿'), 'braille draws it, so a swatch keys it')
})

test('a rendered chart carries no control characters', () => {
  // A stray control byte in a frame returns the terminal to column 0 and
  // overwrites the row — which reads as a gap, not as a bug.
  const now = Date.now()
  const out = chart(
    MARKERS.map((m, i) => ({ marker: m, label: `p${i}`, value: '1h', values: [1, 0.2, 0.7, 0] })),
    { width: 30, rows: 8, max: 1, since: now - 3600_000, now, top: 2 },
  )
  for (const line of out) {
    for (const c of plain(line)) assert.ok(c === '\t' ? false : c.codePointAt(0) >= 32, `control character in ${JSON.stringify(line)}`)
  }
})

test('the selected line is lit and the rest fade back', () => {
  // Reordering the draw stack alone was a bad idea: with six running totals
  // sharing a long baseline, changing which one was drawn last recoloured that
  // whole baseline, and moving the cursor read as the chart jumping to another
  // project. Fading is the same information without the geometry appearing to
  // move — one line is bright, the rest are still exactly where they were.
  const now = Date.now()
  const S = i => ({ marker: MARKERS[i], label: `p${i}`, color: '\x1b[38;2;200;100;50m', values: [0, 1, 2] })
  const opts = { width: 30, rows: 4, max: 2, since: now - 3600_000, now, pad: 0 }
  const none = chart([S(0), S(1)], opts).join('')
  const lit = chart([S(0), S(1)], { ...opts, focus: 0 }).join('')
  assert.ok(none.includes('38;2;200;100;50m'), 'with no selection every line keeps its own colour')
  assert.ok(lit.includes('38;2;200;100;50m'), 'the selected line keeps its colour')
  assert.ok(/38;2;84;42;21m/.test(lit), 'and the others are the same hue, quieter')
  // Geometry is untouched: the same cells are drawn either way.
  const cells = s => s.replace(/\x1b\[[0-9;]*m/g, '')
  assert.equal(cells(lit), cells(none), 'nothing moves when the selection changes')
})

test('a focus outside the list changes nothing', () => {
  const now = Date.now()
  const s = [{ marker: '#', label: 'r', color: '\x1b[38;2;200;100;50m', values: [0, 1] }]
  const opts = { width: 10, rows: 3, max: 1, since: now - 3600_000, now }
  assert.deepEqual(chart(s, { ...opts, focus: -1 }), chart(s, { ...opts, focus: 9 }))
})
