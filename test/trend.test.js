import test from 'node:test'
import assert from 'node:assert/strict'
import { direction, trend, FORTNIGHT, MIN_COVERAGE } from '../src/trend.js'

test('a direction knows which way is GOOD, not just which way it went', () => {
  // An arrow without that is a shape rather than a verdict: more landed is
  // good, more attention per change is not, and both point up.
  const up = [10, 12, 14, 30]
  assert.equal(direction(up, { good: 'up' }).better, true)
  assert.equal(direction(up, { good: 'down' }).better, false)

  const down = [30, 20, 14, 5]
  assert.equal(direction(down, { good: 'down' }).better, true)
  assert.equal(direction(down, { good: 'up' }).better, false)
})

test('a tenth either way is noise, not a trend', () => {
  const d = direction([100, 100, 100, 104], { good: 'up' })
  assert.equal(d.dir, 'flat')
  // Flat is not "better" and not "worse" -- claiming either from a 4% move at
  // these volumes is the confident lie this whole screen exists to avoid.
  assert.equal(d.better, null)
})

test('too little to say says nothing', () => {
  assert.equal(direction([], { good: 'up' }), null)
  assert.equal(direction([5], { good: 'up' }), null)
  // Nulls are holes, not zeroes: a bucket the transcripts do not cover must
  // not drag a direction downward.
  assert.equal(direction([null, null, 9], { good: 'up' }), null)
  assert.equal(direction([null, 5, 9], { good: 'up' }).dir, 'up')
})

test('a bucket outside the loaded window reports null, never zero', () => {
  // The screen collects events for whatever window you are viewing. Asking it
  // about eight weeks while it holds thirty days made the older buckets read
  // `1m per change` against a true 6m -- starved, and indistinguishable from
  // improvement.
  const now = Date.UTC(2026, 7, 23)
  const p = {
    root: null, // no git, so `landed` stays 0 and only the null rules are under test
    events: [{ at: now - 3 * 86_400_000, session: 'a', path: '/w/p/f.ts' }],
  }
  const { buckets } = trend([p], new Map(), { now, buckets: 4, since: now - FORTNIGHT })
  assert.equal(buckets.length, 4)
  for (const b of buckets.slice(0, 3)) {
    assert.equal(b.attention, null, 'outside the loaded window is unknown')
    assert.equal(b.perShip, null)
    assert.equal(b.compactShare, null)
  }
  // And nothing throws on a project with no repo behind it.
  assert.equal(buckets[3].landed, 0)
})

test('one stray old event does not vouch for a whole fortnight', () => {
  // Taking the horizon from the earliest event anywhere meant a bucket with 47
  // landings and almost no transcript reported "0m of attention per change",
  // which reads as a triumph rather than as the edge of the evidence.
  const now = Date.UTC(2026, 7, 23)
  const span = FORTNIGHT
  const busy = Array.from({ length: 100 }, (_, i) => ({ at: now - i * 60_000, session: 's', path: '/w/p/f.ts' }))
  const stray = [{ at: now - 3.5 * span, session: 's', path: '/w/p/g.ts' }]
  const { buckets } = trend([{ root: null, events: [...busy, ...stray] }], new Map(), { now, buckets: 4 })
  assert.equal(buckets[0].attention, null, 'one event is not coverage')
  assert.ok(buckets[3].attention > 0, 'and the busy bucket is real')
  assert.ok(MIN_COVERAGE > 0 && MIN_COVERAGE < 1)
})
