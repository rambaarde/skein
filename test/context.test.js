import test from 'node:test'
import assert from 'node:assert/strict'
import { contextOf, highWater, limitOf, humanTokens } from '../src/context.js'

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

test('a ceiling belongs to a session, not to the machine', () => {
  // Codex states model_context_window (258k); Claude states nothing and runs
  // to 1M. Sharing one ceiling between them made a 995k Claude session read as
  // 385% of a Codex window — so each session is scaled against its own.
  const mixed = new Map([
    ['codex', { context: 30_000, limit: 258_400 }],
    ['claude', { context: 952_000 }],
  ])
  const fallback = highWater(mixed)
  assert.equal(fallback, 1_000_000, 'a bounded Codex session must not cap Claude')
  assert.equal(limitOf(mixed.get('codex'), fallback), 258_400, 'stated wins for the session that states it')
  assert.equal(limitOf(mixed.get('claude'), fallback), 1_000_000, 'observed for the one that does not')
  for (const s of mixed.values()) {
    assert.ok(s.context / limitOf(s, fallback) <= 1, 'no session ever exceeds its own ceiling')
  }
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
