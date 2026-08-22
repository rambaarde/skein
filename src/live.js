// The part that moves.
//
// btop feels alive because every quantity it draws is continuous and its
// graphs are a ROLLING window: the newest sample enters on the right and the
// whole series shifts left every tick, whether or not anything changed.
//
// skein's timeline is not that. It buckets a fixed 24h span, so a cell covers
// fifty-one minutes and the picture is identical between one boundary and the
// next. Correct for "where did my week go", useless for "is anything happening
// right now".
//
// So this is the other graph: edits per minute over a short rolling window,
// one cell every few seconds. At fifteen minutes across a hundred cells a cell
// is nine seconds wide, which means the series visibly slides even on a quiet
// machine — the same reason btop's network graph reads as live while sitting
// at zero.
export const WINDOW_MS = 15 * 60_000

// How long each sample averages over. This is the difference between a graph
// and a scatter of spikes.
//
// A bucket count at seven-second resolution is almost all zeros — measured on
// real history, 3% of samples had any value at all. CPU% is not a count of
// anything that happened in the last seven seconds; it is an AVERAGE over an
// interval, which is why btop's line is continuous. Do the same: each sample
// is the rate over the preceding SMOOTH_MS, so neighbouring samples share
// almost all of their window and a burst decays into a hump instead of a
// single-cell spike.
export const SMOOTH_MS = 3 * 60_000

// Samples oldest → newest, so the newest is on the right and everything
// marches left as `now` advances.
export function rateSeries(events, samples, { now = Date.now(), windowMs = WINDOW_MS, smoothMs = SMOOTH_MS } = {}) {
  const since = now - windowMs
  const per = windowMs / samples
  const at = events.map(e => e.at).filter(t => t && t <= now && t >= since - smoothMs).sort((a, b) => a - b)
  const out = new Array(samples).fill(0)
  // Two pointers over a sorted list: each sample's window is [t-smooth, t], and
  // both edges only ever move forward, so this stays linear.
  let lo = 0, hi = 0
  for (let i = 0; i < samples; i++) {
    const t = since + (i + 1) * per
    const from = t - smoothMs
    while (hi < at.length && at[hi] <= t) hi++
    while (lo < hi && at[lo] < from) lo++
    out[i] = (hi - lo) / (smoothMs / 60_000)
  }
  return out
}

export const ratePerMin = (events, { now = Date.now(), windowMs = 5 * 60_000 } = {}) => {
  const since = now - windowMs
  const n = events.filter(e => e.at >= since && e.at <= now).length
  return n / (windowMs / 60_000)
}

// Who is working right now, and how hard — btop's per-core list, but the cores
// are agents.
export function byAgent(events, { now = Date.now(), windowMs = 5 * 60_000 } = {}) {
  const since = now - windowMs
  const per = new Map()
  for (const e of events) {
    if (!e.at || e.at < since) continue
    per.set(e.agent, (per.get(e.agent) ?? 0) + 1)
  }
  return [...per.entries()]
    .map(([agent, n]) => ({ agent, rate: n / (windowMs / 60_000) }))
    .sort((a, b) => b.rate - a.rate)
}

export const activeSessions = (events, { now = Date.now(), windowMs = 5 * 60_000 } = {}) =>
  new Set(events.filter(e => e.at >= now - windowMs).map(e => e.session)).size
