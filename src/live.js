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

// Samples oldest → newest, so the newest is on the right and everything
// marches left as `now` advances.
export function rateSeries(events, samples, { now = Date.now(), windowMs = WINDOW_MS } = {}) {
  const out = new Array(samples).fill(0)
  const since = now - windowMs
  const per = windowMs / samples
  for (const e of events) {
    if (!e.at || e.at < since || e.at > now) continue
    const i = Math.min(samples - 1, Math.floor((e.at - since) / per))
    out[i]++
  }
  // Edits per minute in each slot, so the axis is a rate rather than a count
  // that changes meaning when the window does.
  return out.map(v => v / (per / 60_000))
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
