import test from 'node:test'
import assert from 'node:assert/strict'
import { activeMs, attentionOf, attentionSeries, humanMs, IDLE_MS } from '../src/attention.js'

const T = Date.parse('2026-08-22T09:00:00Z')
const at = m => T + m * 60_000
const ev = (m, session = 's') => ({ at: at(m), session })

test('attention is time worked, not edits counted', () => {
  // Thesis §2: "not what it cost — where the ATTENTION went". Ten edits in a
  // burst and ten spread over an hour are the same count and very different
  // amounts of a week.
  const burst = [0, 0.2, 0.4, 0.6, 0.8].map(m => ev(m))
  const spread = [0, 15, 30, 45, 60].map(m => ev(m))
  assert.equal(burst.length, spread.length)
  assert.ok(activeMs(spread) > activeMs(burst), 'the same edit count must not mean the same time')
})

test('a gap longer than idle splits a stretch', () => {
  const evs = [ev(0), ev(4), ev(60), ev(64)]          // two 4-minute stretches
  assert.equal(Math.round(activeMs(evs) / 60_000), 8)
})

test('a lone edit is not zero attention', () => {
  assert.ok(activeMs([ev(0)]) > 0, 'a single edit still took some time')
})

test('two agents in the same hour spent an hour each', () => {
  // The project really did consume two hours of somebody's attention.
  const a = [0, 10, 20, 30].map(m => ev(m, 'a'))
  const b = [0, 10, 20, 30].map(m => ev(m, 'b'))
  assert.equal(attentionOf([...a, ...b]), activeMs(a) + activeMs(b))
})

test('a stretch is spread across every bucket it covers', () => {
  // An hour of work should draw an hour wide, not a spike where it ended.
  const evs = Array.from({ length: 13 }, (_, i) => ev(i * 5))    // one hour, 5-min steps
  const s = attentionSeries(evs, 6, T, at(120))
  const filled = s.filter(v => v > 0).length
  assert.ok(filled >= 3, `an hour across two hours of buckets should fill several, filled ${filled}`)
  assert.equal(s.slice(3).every(v => v === 0), true, 'and nothing after it ended')
})

test('a single-edit stretch still draws', () => {
  // It has zero duration but is not zero attention; the timeline has to agree
  // with activeMs or a real burst renders as a blank column.
  const s = attentionSeries([ev(30)], 4, T, at(120))
  assert.ok(s.some(v => v > 0), 'a lone edit must appear on the timeline')
})

test('humanMs reads like a working day', () => {
  assert.equal(humanMs(45 * 60_000), '45m')
  assert.equal(humanMs(98 * 60_000), '1h38')
  assert.equal(humanMs(120 * 60_000), '2h00')
})
