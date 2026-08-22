// Attention, not counts.
//
// Founder thesis §2: "Where did my week actually go? Not what it cost — where
// the ATTENTION went, per project, over time." §6.5: the chart plots "active
// minutes or prompts — not cost. Cost is served twice over; attention is not."
//
// An edit count is a cost metric wearing a different hat. Two projects with a
// hundred edits each can be an afternoon and ten minutes, and the one that ate
// the afternoon is the one you wanted to know about. Measured on real history,
// ranking by edits and ranking by time disagree about the top three.
//
// Active time is the sum of a session's working stretches: consecutive events
// belong to the same stretch until a gap longer than IDLE, which is where you
// got up. A lone edit counts as MIN_STRETCH rather than zero, because it did
// take some time, and zero would make a real project vanish.
export const IDLE_MS = 5 * 60_000
export const MIN_STRETCH_MS = 30_000

export function activeMs(events, { idle = IDLE_MS, min = MIN_STRETCH_MS } = {}) {
  const at = events.map(e => e.at).filter(Boolean).sort((a, b) => a - b)
  if (!at.length) return 0
  let total = 0, start = at[0], prev = at[0]
  for (const t of at.slice(1)) {
    if (t - prev > idle) { total += Math.max(min, prev - start); start = t }
    prev = t
  }
  return total + Math.max(min, prev - start)
}

// Per session, then summed: two agents working the same hour spent an hour
// each, and the project really did consume two hours of attention.
export function attentionOf(events, opts) {
  const bySession = new Map()
  for (const e of events) {
    if (!bySession.has(e.session)) bySession.set(e.session, [])
    bySession.get(e.session).push(e)
  }
  let total = 0
  for (const evs of bySession.values()) total += activeMs(evs, opts)
  return total
}

// Active minutes falling in each bucket, which is what the timeline plots.
export function attentionSeries(events, buckets, since, now, opts = {}) {
  const idle = opts.idle ?? IDLE_MS
  const out = new Array(buckets).fill(0)
  const span = Math.max(1, now - since)
  const bySession = new Map()
  for (const e of events) {
    if (!bySession.has(e.session)) bySession.set(e.session, [])
    bySession.get(e.session).push(e)
  }
  for (const evs of bySession.values()) {
    const at = evs.map(e => e.at).filter(Boolean).sort((a, b) => a - b)
    let start = at[0], prev = at[0]
    const min = opts.min ?? MIN_STRETCH_MS
    const close = (a, b) => {
      // Spread a stretch across every bucket it overlaps, so an hour of work
      // draws an hour wide rather than a spike where it happened to end.
      //
      // A stretch of one event has zero duration but is not zero attention —
      // activeMs already floors it at MIN_STRETCH, and the timeline has to
      // agree or a real burst of work draws as a blank column.
      const end = Math.max(b, a + min)
      const from = Math.max(a, since), to = Math.min(end, now)
      if (to <= from) return
      const i0 = Math.floor(((from - since) / span) * buckets)
      const i1 = Math.min(buckets - 1, Math.floor(((to - since) / span) * buckets))
      for (let i = Math.max(0, i0); i <= i1; i++) {
        const bs = since + (i / buckets) * span, be = since + ((i + 1) / buckets) * span
        out[i] += Math.max(0, Math.min(be, to) - Math.max(bs, from))
      }
    }
    for (const t of at.slice(1)) {
      if (t - prev > idle) { close(start, prev); start = t }
      prev = t
    }
    close(start, prev)
  }
  return out
}

export const humanMs = ms => {
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}
