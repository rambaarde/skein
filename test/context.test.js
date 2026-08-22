import test from 'node:test'
import assert from 'node:assert/strict'
import { contextOf, highWater, humanTokens } from '../src/context.js'

test('context is what the model had to read, cache included', () => {
  // Cached tokens still occupy the window; counting only fresh input would
  // report a nearly-full session as nearly empty.
  assert.equal(contextOf({ input_tokens: 2, cache_read_input_tokens: 620_000, cache_creation_input_tokens: 13_814 }), 633_816)
  assert.equal(contextOf(null), 0)
  assert.equal(contextOf({}), 0)
})

test('the scale is observed, never assumed', () => {
  // A hardcoded window size is a table that rots the day the model changes —
  // the same objection that keeps cost out of this file. Measure instead.
  assert.equal(highWater(new Map([['a', { context: 190_000 }]])), 200_000)
  assert.equal(highWater(new Map([['a', { context: 952_000 }]])), 1_000_000)
  assert.equal(highWater(new Map([['a', { context: 30_000 }]])), 64_000)
})

test('the scale does not twitch on every new record', () => {
  // Rounding to recognisable steps means one busy request does not rescale the
  // whole gauge and make yesterday look different.
  const a = highWater(new Map([['x', { context: 500_000 }]]))
  const b = highWater(new Map([['x', { context: 500_001 }]]))
  assert.equal(a, b)
})

test('an empty machine still has a scale', () => {
  assert.ok(highWater(new Map()) > 0, 'dividing by this must never be a divide by zero')
})

test('token counts read the way a person says them', () => {
  assert.equal(humanTokens(999), '999')
  assert.equal(humanTokens(45_000), '45k')
  assert.equal(humanTokens(633_814), '634k')
  assert.equal(humanTokens(1_200_000), '1.2M')
})

test('cost is deliberately absent', async () => {
  // Neither agent records a price. A cost column would mean shipping a rate
  // table and being silently wrong the day it drifts — and §8 rules it out.
  const src = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/context.js', import.meta.url), 'utf8'))
  // Strip comments first — the file explains at length why cost is absent, and
  // a guard that trips on its own rationale is a guard nobody keeps.
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(code, /USD|\bprice\b|\bcost\b|per[_ ]?million/i, 'no pricing may enter this file')
  assert.doesNotMatch(code, /\d+\s*\/\s*1_?000_?000\s*\*/, 'no rate arithmetic either')
})

test('a stated limit beats an inferred one', () => {
  // Codex reports model_context_window outright. Claude does not, so its
  // sessions fall back to observation — but when a real number is on offer,
  // guessing from a high-water mark is strictly worse.
  const stated = new Map([['a', { context: 30_000, limit: 258_400 }]])
  assert.equal(highWater(stated), 258_400)
  const observed = new Map([['a', { context: 952_000 }]])
  assert.equal(highWater(observed), 1_000_000)
})

test('a cumulative total is not window occupancy', () => {
  // The bug this guards: Codex's total_token_usage is the session's lifetime
  // spend, and reading it as context produced a 255M ceiling and a meter that
  // meant nothing. Only per-request usage describes the window.
  const lifetime = 255_000_000
  const perRequest = contextOf({ input_tokens: 30_263, cache_read_input_tokens: 4_480 })
  assert.ok(perRequest < lifetime / 1000, 'per-request context is orders below a lifetime total')
  assert.equal(perRequest, 34_743)
})
