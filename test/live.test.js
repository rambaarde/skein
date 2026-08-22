import test from 'node:test'
import assert from 'node:assert/strict'
import { rateSeries, ratePerMin, byAgent, activeSessions, liveSessions, pickWindow, WINDOW_MS, SMOOTH_MS } from '../src/live.js'

const T = Date.parse('2026-08-22T13:00:00Z')
const ev = (secsAgo, agent = 'claude', session = 's') => ({ at: T - secsAgo * 1000, agent, session })

test('the window rolls — the same data draws differently a minute later', () => {
  // This is the whole point. btop's graphs feel alive because the newest sample
  // enters on the right and everything marches left every tick, whether or not
  // anything changed. A fixed 24h bucketing does not do that.
  const events = [ev(30), ev(90), ev(200)]
  const a = rateSeries(events, 60, { now: T })
  const b = rateSeries(events, 60, { now: T + 60_000 })
  assert.notDeepEqual(a, b, 'advancing now must shift the series')
})

test('the newest sample is on the right', () => {
  const s = rateSeries([ev(1)], 10, { now: T })
  assert.ok(s.at(-1) > 0, 'an edit a second ago belongs in the last slot')
  assert.equal(s.slice(0, -1).every(v => v === 0), true)
})

test('anything genuinely outside the window is not in it', () => {
  // Each sample averages over the preceding SMOOTH_MS, so an event a little
  // before the window edge legitimately feeds the earliest samples — that is
  // what a moving average is. Only something older than window + smoothing is
  // properly gone.
  const gone = ev((WINDOW_MS + SMOOTH_MS) / 1000 + 60)
  assert.equal(rateSeries([gone], 20, { now: T }).every(v => v === 0), true)
  const justInside = ev(WINDOW_MS / 1000 - 10)
  assert.ok(rateSeries([justInside], 20, { now: T }).some(v => v > 0))
})

test('the axis is a rate, so it does not change meaning with the window', () => {
  // Two edits inside a one-minute averaging window is 2/min, however many
  // samples the series is drawn with.
  const events = [ev(5), ev(10)]
  for (const samples of [1, 10, 100]) {
    const s = rateSeries(events, samples, { now: T, windowMs: 60_000, smoothMs: 60_000 })
    assert.equal(Math.round(s.at(-1)), 2, `${samples} samples should still read 2/min`)
  }
})

test('agents are the cores: who is working, and how hard', () => {
  const events = [ev(10, 'claude'), ev(20, 'claude'), ev(30, 'codex')]
  const rows = byAgent(events, { now: T })
  assert.deepEqual(rows.map(r => r.agent), ['claude', 'codex'], 'busiest first')
  assert.ok(rows[0].rate > rows[1].rate)
})

test('an idle machine reports zero rather than throwing', () => {
  assert.equal(ratePerMin([], { now: T }), 0)
  assert.deepEqual(byAgent([], { now: T }), [])
  assert.equal(activeSessions([], { now: T }), 0)
})

test('active sessions counts sessions, not edits', () => {
  const events = [ev(5, 'claude', 'a'), ev(6, 'claude', 'a'), ev(7, 'codex', 'b')]
  assert.equal(activeSessions(events, { now: T }), 2)
})

test('a moving average makes a line, not a scatter of spikes', () => {
  // The bug this replaces: a bucket count at seven-second resolution left 97%
  // of the graph empty, so it drew as isolated ticks rather than a curve.
  // Older than the averaging window, so the hump has had time to rise AND fall
  // inside the visible span. A burst inside the last three minutes is still
  // being averaged and correctly reads flat to the right edge.
  const burst = Array.from({ length: 12 }, (_, i) => ev(600 - i * 2))
  const s = rateSeries(burst, 100, { now: T })

  // The property that separates a line from a scatter is CONTIGUITY: the
  // non-zero samples must be consecutive, because neighbouring samples share
  // almost all of their averaging window. A bucket count gave isolated ticks
  // with gaps between them.
  const idx = s.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0)
  assert.ok(idx.length > 5, `expected a run of samples, got ${idx.length}`)
  const gaps = idx.slice(1).filter((v, i) => v !== idx[i] + 1)
  assert.equal(gaps.length, 0, 'the run must have no holes in it')

  // and it must decay rather than stop dead
  const peakAt = s.indexOf(Math.max(...s))
  assert.ok(s.slice(peakAt + 1).some(v => v > 0 && v < s[peakAt]), 'the hump should fall away')
})

test('running is not the same as writing', () => {
  // skeins said "0 sessions active - nothing is running" with an agent plainly
  // running: it counted sessions that had WRITTEN A FILE recently, and an agent
  // reading or thinking appends to its transcript without touching the repo.
  const now = 1_000_000_000
  const sessions = new Map([
    ['thinking', { agent: 'claude', seen: now - 30_000 }],   // here, not writing
    ['gone', { agent: 'codex', seen: now - 3 * 3600_000 }],  // long finished
    ['unknown', { agent: 'opencode' }],                       // no mtime at all
  ])
  const live = liveSessions(sessions, { now })
  assert.equal(live.length, 1)
  assert.equal(live[0].agent, 'claude')
  // And the two questions stay separate: nothing here wrote a file.
  assert.equal(activeSessions([], { now }), 0)
})

test('the graph window widens rather than showing an honest blank', () => {
  const now = 1_000_000_000
  // Busy right now: stays at the live window, because it is live.
  const busy = Array.from({ length: 40 }, (_, i) => ({ at: now - i * 10_000 }))
  assert.equal(pickWindow(busy, { now }).label, '15m')
  assert.equal(pickWindow(busy, { now }).widened, false)

  // The actual complaint: last edit 16 minutes ago, so a 15m window is empty
  // and correct and useless. Widen until there is a shape to draw.
  const justMissed = Array.from({ length: 40 }, (_, i) => ({ at: now - 16 * 60_000 - i * 10_000 }))
  const w = pickWindow(justMissed, { now })
  assert.equal(w.label, '1h')
  assert.equal(w.widened, true, 'and it must say so, or the axis changes meaning in silence')

  // Nothing at all anywhere: falls to the widest rather than throwing.
  assert.equal(pickWindow([], { now }).label, '24h')
})
