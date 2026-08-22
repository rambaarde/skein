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
// Smoothing is measured in SAMPLES, not minutes.
//
// A fixed three minutes sounded reasonable and was not: at 260 samples across
// fifteen minutes a sample is 3.5s wide, so three minutes averages 52
// neighbours and every point inside a burst comes out identical. The result is
// a rectangle at one level — which is what "the graph looks ugly" meant.
//
// btop samples instantaneously and gets spikes; a raw count at 3.5s resolution
// gets scatter. Averaging four or five samples sits between the two: local
// enough to keep the peaks, wide enough to join the dots.
export const SMOOTH_SAMPLES = 5
export const SMOOTH_MS = 3 * 60_000   // only used when a caller asks for it

// Samples oldest → newest, so the newest is on the right and everything
// marches left as `now` advances.
export function rateSeries(events, samples, { now = Date.now(), windowMs = WINDOW_MS, smoothMs = null } = {}) {
  const since = now - windowMs
  const per = windowMs / samples
  // Scale with the sample width unless a caller pins it explicitly.
  smoothMs = smoothMs ?? Math.max(10_000, per * SMOOTH_SAMPLES)
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

// A fixed live window is blank most of the time you would actually look at it.
//
// btop's CPU graph always has data because CPU always samples. Editing is
// bursty: you type for ten minutes, then read for twenty, then think. Open
// skein during the reading part and a 15m window is honestly, uselessly empty —
// "where is the spike?" is answered by "your last edit was 16 minutes ago".
//
// So the window is chosen, not fixed: the narrowest span that actually holds
// enough activity to draw. When you are working it stays at 15m and stays live;
// when you are not it widens far enough back to show what you just did. The
// header always states which span is on screen, because a graph whose meaning
// silently changes is worse than an empty one.
export const LADDER = [
  [15 * 60_000, '15m'],
  [60 * 60_000, '1h'],
  [6 * 3600_000, '6h'],
  [24 * 3600_000, '24h'],
]

// Below this a window has too few points to make a shape rather than a spike.
export const ENOUGH = 12

export function pickWindow(events, { now = Date.now(), ladder = LADDER } = {}) {
  const at = events.map(e => e.at).filter(t => t && t <= now)
  for (const [ms, label] of ladder) {
    const n = at.filter(t => t >= now - ms).length
    if (n >= ENOUGH) return { windowMs: ms, label, widened: ms !== ladder[0][0], events: n }
  }
  const [ms, label] = ladder[ladder.length - 1]
  return { windowMs: ms, label, widened: true, events: at.filter(t => t >= now - ms).length }
}

// Running, as opposed to typing.
//
// activeSessions() counts sessions that WROTE A FILE recently, and that is not
// what "is anything running" means: an agent reading, thinking, or waiting on
// you appends to its transcript without touching your repo. skein reported
// "0 sessions active · nothing is running" while an agent was demonstrably
// running, because it had not saved anything in five minutes.
//
// The transcript mtime is the signal. Both numbers are worth showing — one is
// "someone is here", the other is "work is landing" — but they are different
// questions and conflating them made the honest one wrong.
export const LIVE_MS = 5 * 60_000

export const liveSessions = (sessions, { now = Date.now(), windowMs = LIVE_MS } = {}) =>
  [...(sessions?.values?.() ?? [])].filter(s => s.seen && s.seen >= now - windowMs && s.seen <= now + 60_000)
