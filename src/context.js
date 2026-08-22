// Context pressure — the fuel gauge, not the receipt.
//
// The thesis rules out cost and token panels (§8) and says the metric is
// attention, "not what it cost" (§2). This is neither: it is how full an
// agent's working memory is right now, which changes what you do in the next
// minute. A session at the top of its window is about to compact and lose the
// thread; a session at a fifth of it is fine. That is an operational state, the
// way memory pressure is in btop, and no other tool here reports it.
//
// Cost is deliberately absent. Neither agent records a price, so a cost column
// would mean shipping a rate table and maintaining it as models and prices
// change — and being silently wrong the day it drifts. Tokens are recorded, so
// the LEVEL below is measured; only a LIMIT would need a table, and there is
// no limit in this file.

// One request's context is everything the model had to read: fresh input, plus
// whatever was served from cache.
export const contextOf = usage => {
  if (!usage) return 0
  return (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
}

// The scale is observed, never assumed. If the busiest session this machine has
// ever run reached 999k, that is the ceiling worth drawing against — and it
// self-corrects the day you move to a bigger or smaller window, which a
// hardcoded table would not.
export function highWater(sessions) {
  let max = 0
  for (const s of sessions.values()) max = Math.max(max, s.context ?? 0)
  // Round up to something a person recognises, so the gauge does not rescale
  // every time a single request nudges the record.
  for (const step of [64_000, 128_000, 200_000, 400_000, 1_000_000, 2_000_000]) {
    if (max <= step) return step
  }
  return Math.ceil(max / 1_000_000) * 1_000_000
}

export const humanTokens = n =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${Math.round(n / 1_000)}k`
      : String(n)
