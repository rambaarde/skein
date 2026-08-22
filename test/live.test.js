import test from 'node:test'
import assert from 'node:assert/strict'
import { rateSeries, ratePerMin, byAgent, activeSessions, WINDOW_MS } from '../src/live.js'

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

test('anything outside the window is not in it', () => {
  const old = ev(WINDOW_MS / 1000 + 60)
  assert.equal(rateSeries([old], 20, { now: T }).every(v => v === 0), true)
})

test('the axis is a rate, so it does not change meaning with the window', () => {
  // Two edits in a slot one minute wide is 2/min however many slots there are.
  const oneMinute = 60_000
  const events = [ev(5), ev(10)]
  const s = rateSeries(events, 1, { now: T, windowMs: oneMinute })
  assert.equal(Math.round(s[0]), 2)
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
