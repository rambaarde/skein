import test from 'node:test'
import assert from 'node:assert/strict'
import { plot, chart, legend, xaxis, axisLine, niceMax, STYLES, MARKERS, MAX_SERIES, BELOW } from '../src/chart.js'

const plain = s => s.replace(/\x1b\[[0-9;]*m/g, '')
const at = (lines, ch) => lines.findIndex(l => plain(l).includes(ch))

test('a series is identified by marker as well as by colour', () => {
  // Colour is per character CELL, so where two lines share a cell only one hue
  // survives. The marker is what still tells them apart there.
  assert.equal(MARKERS.length, MAX_SERIES)
  assert.equal(new Set(MARKERS).size, MARKERS.length, 'every marker is distinct')
  assert.ok(STYLES.every(s => s[0] === MARKERS[STYLES.indexOf(s)]), 'the marker leads its own line style')
  assert.ok(STYLES.every(s => [...s].every(c => c.codePointAt(0) < 0x2000)),
    'markers stay narrow — an ambiguous-width glyph would push the border off screen')
})

test('a higher value draws higher up the grid', () => {
  const rows = plot([{ marker: '#', values: [1, 0.5] }], { width: 2, rows: 5, max: 1 })
  assert.equal(rows.length, 5)
  assert.equal(plain(rows[0])[0], '#', 'a full value reaches the top row')
  assert.equal(plain(rows[4])[0], ' ', 'and does not smear down to the floor')
  assert.equal(plain(rows[2])[1], '#', 'half draws halfway')
})

test('a zero is a hole, not a point on the floor', () => {
  // Every idle project drawing a solid line along the baseline for every hour
  // it was untouched is the width of the chart in noise. A gap already means
  // "nothing happened here" to anyone reading a chart.
  const rows = plot([{ marker: '#', values: [1, 0, 1] }], { width: 3, rows: 4, max: 1 })
  assert.equal(plain(rows.at(-1)), '   ', 'the baseline row is empty')
  assert.equal(plain(rows[0]), '# #', 'and the line is broken where the value was zero')
})

test('the first column of a run always carries the marker', () => {
  // Editing is bursty: a four-minute burst is one column wide. A series whose
  // single column landed on the dash of its own pattern drew something
  // indistinguishable from three other series.
  const rows = plot([{ marker: '*', pattern: '*--*', values: [0, 0, 1, 0] }], { width: 4, rows: 3, max: 1 })
  assert.ok(plain(rows.join('')).includes('*'), 'a one-column burst still shows its marker')
})

test('series share one scale, so the lines are comparable', () => {
  const rows = plot([
    { marker: '#', values: [1, 1] },
    { marker: '*', values: [0.5, 0.5] },
  ], { width: 2, rows: 5, max: 1 })
  assert.equal(at(rows, '#'), 0)
  assert.equal(at(rows, '*'), 2, 'half the value sits half way up, not at its own peak')
})

test('a later series wins a shared cell', () => {
  const rows = plot([
    { marker: '#', values: [1] },
    { marker: '*', values: [1] },
  ], { width: 1, rows: 3, max: 1 })
  assert.equal(plain(rows[0]), '*', 'the last one drawn is the one you can read')
})

test('each line prints its own value at the height it ends on', () => {
  const rows = plot([{ marker: '#', values: [1, 1], value: '2h' }], { width: 6, rows: 4, max: 1, pad: 3 })
  assert.ok(plain(rows[0]).includes('2h'), 'the number sits on the line, not in a footnote')
  assert.ok(rows.every(r => plain(r).length === 6), 'and inside the width it was given')
})

test('a scale is rounded to something a human reads', () => {
  // Scaling straight to the peak produced an axis reading 187% 169% 150% — ten
  // true numbers, none of them round.
  assert.equal(niceMax(0.09), 0.1)
  assert.equal(niceMax(1.87), 2)
  assert.ok(niceMax(1.87) > 1, 'above 100% is real — two sessions in one slice — and must not be clamped')
  assert.ok(niceMax(0.01) >= 0.01, 'a very quiet day still gets a ceiling')
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
  const out = chart([{ marker: '#', pattern: '####', label: 'r', value: '2h', values: [1, 0.5, 1] }], {
    width: 60, rows: 6, max: 1, since: now - 3600_000, now, caption: 'attention · 24h',
  })
  assert.equal(out.length, 6 + BELOW, 'rule, times and legend — the caller budgets for exactly these')
  assert.ok(out.slice(0, 6).every(l => plain(l).includes('┤')), 'every graph row carries a gradation')
  assert.match(plain(out[5]), /^\s+0\s+┤/, 'and the last one reads 0')
  assert.ok(plain(out.at(-1)).includes('attention · 24h'), 'the caption says what the axis measures')
  assert.ok(plain(out.at(-1)).includes('#: r'), 'and the legend says which line is which')
})

test('a rendered chart carries no control characters', () => {
  // A stray control byte in a frame returns the terminal to column 0 and
  // overwrites the row — which reads as a gap, not as a bug.
  const now = Date.now()
  const out = chart(
    MARKERS.map((m, i) => ({ marker: m, pattern: STYLES[i], label: `p${i}`, value: '1h', values: [1, 0.2, 0.7, 0] })),
    { width: 30, rows: 8, max: 1, since: now - 3600_000, now, top: 2 },
  )
  for (const line of out) {
    for (const c of plain(line)) assert.ok(c === '\t' ? false : c.codePointAt(0) >= 32, `control character in ${JSON.stringify(line)}`)
  }
})
