// Are you improving, or is this rotting?
//
// Every other screen answers "what is happening" or "what happened". This is
// the only one that answers "is it getting better", which is the question a
// developer actually has about their own habits.
//
// Three decisions here were forced by measuring, not chosen:
//
// POOLED ACROSS THE MACHINE, not per project. Measured on one real machine:
// per-project weekly ATTN/SHIP had two of four weeks EMPTY for every single
// project, and the weeks that were not empty read 4m then 17m -- which is two
// landings, not a trend. Pooled per fortnight the same data reads 47, 122,
// 150, 149 landed and 7m, 7m, 9m per change, which is legible.
//
// FORTNIGHTS, not weeks. A week does not contain enough landings for one
// developer to say anything with.
//
// A BUCKET BEFORE THE TRANSCRIPTS BEGIN IS null, NEVER ZERO. git history
// reaches back further than agent transcripts do, so the oldest bucket had
// real landings and no attention -- and "0m of attention per change" reads as
// a triumph rather than as a horizon. AXI 5: absence is explicit.
import { landings, deployments, failureRate } from './delivery.js'
import { attentionOf } from './attention.js'

export const FORTNIGHT = 14 * 86_400_000

// Below this a direction is not stated. Two landings moving to three is not an
// improvement, and an arrow drawn from it is a confident lie -- the same
// failure as a change failure rate computed from one judged deployment.
export const MIN_LANDED = 8

// A bucket needs this share of the busiest bucket's events before its
// attention is quoted at all.
export const MIN_COVERAGE = 0.15

// `since` is the edge of the data the CALLER loaded, which is not the same as
// the edge of what exists. The screen collects events for whatever window you
// are viewing, so asking it about eight weeks while it holds thirty days made
// the older buckets read `1m per change` against a true 6m -- starved, not
// improved. Anything attention-derived before `since` is unknown, and says so.
export function trend(projects, sessions, { now = Date.now(), buckets = 4, span = FORTNIGHT, since = -Infinity } = {}) {
  const from0 = now - buckets * span
  const out = Array.from({ length: buckets }, (_, i) => ({
    from: from0 + i * span,
    to: from0 + (i + 1) * span,
    landed: 0, attention: 0, failed: 0, judged: 0, compactMs: 0, events: 0,
  }))
  const slot = at => Math.floor((at - from0) / span)

  // ONE git read per project, and its `since` is QUANTISED TO THE DAY.
  //
  // Two versions of the same bug, both measured:
  //
  //   reading per bucket meant a `since` that differed per bucket -- 41
  //   projects x 4 buckets of uncached git, 2107ms a draw;
  //
  //   then reading once per project still passed `now - 4 * span`, and `now`
  //   moves every second, so the memo key moved with it: 376ms EVERY draw,
  //   against 3ms when `now` held still.
  //
  // The memo in delivery.js is keyed on `${stamp(root)}|${since}`, so a `since`
  // derived from a live clock can never hit it. Asking git for whole days
  // fetches a few extra commits, which `slot()` discards anyway, and the key
  // then changes once a day instead of once a second.
  const askFrom = Math.floor(from0 / 86_400_000) * 86_400_000
  for (const p of projects ?? []) {
    // The git half is skipped for a project with no repo. Its ATTENTION is
    // not: skipping the whole project made every event outside a repository
    // invisible to the trend, which on a real machine is a bucket of its own.
    const all = p.root ? landings(p.root, { since: askFrom }) : null
    if (all) {
      const deploys = deployments(p.root, { since: askFrom, all })
      for (const s of all) {
        const i = slot(s.at)
        if (i < 0 || i >= buckets || s.release) continue
        out[i].landed++
      }
      // A deployment is judged against the one after it, so the verdicts are
      // computed once over the whole span and then filed by when they landed.
      const cfr = failureRate(all, deploys)
      for (const v of cfr?.verdicts ?? []) {
        const i = slot(v.at)
        if (i < 0 || i >= buckets) continue
        out[i].judged++
        if (v.failed) out[i].failed++
      }
    }
    for (const e of p.events ?? []) {
      const i = slot(e.at)
      if (i < 0 || i >= buckets) continue
      out[i].events++
    }
    // Attention is a span, not a count, so it has to be measured per bucket
    // over that bucket's own events rather than summed from anything.
    for (let i = 0; i < buckets; i++) {
      const ev = (p.events ?? []).filter(e => e.at >= out[i].from && e.at < out[i].to)
      if (ev.length) out[i].attention += attentionOf(ev)
    }
  }
  for (const s of sessions?.values?.() ?? []) {
    const i = slot(s.last ?? 0)
    if (i < 0 || i >= buckets) continue
    out[i].compactMs += s.compactMs ?? 0
  }

  // Coverage, not a single earliest event.
  //
  // Taking the horizon from the oldest event anywhere meant one stray old file
  // vouched for a whole fortnight: the oldest bucket had 47 landings, almost no
  // transcript, and reported "0m of attention per change" -- which reads as a
  // triumph rather than as the edge of the evidence. A bucket has to carry a
  // real share of the machine's events before its attention is quoted.
  const busiest = Math.max(1, ...out.map(b => b.events))
  return {
    horizon: out.find(b => b.from >= since && b.events >= busiest * MIN_COVERAGE)?.from ?? null,
    buckets: out.map(b => {
      const seen = b.from >= since && b.events >= busiest * MIN_COVERAGE
      return {
        from: b.from,
        to: b.to,
        // git reaches back further than the transcripts, so landed is real
        // even in a bucket whose attention is not.
        landed: b.landed,
        attention: seen ? b.attention : null,
        perShip: seen && b.landed ? Math.round(b.attention / b.landed) : null,
        cfr: b.judged ? b.failed / b.judged : null,
        judged: b.judged,
        // null when nothing compacted, not 0.0%. A rate needs a numerator as
        // well as a denominator, and "0.0% spent compacting" on a fortnight
        // where no session ever hit its ceiling is a zero pretending to be a
        // measurement -- caught by the existing rule that every percentage on
        // this screen must have something behind it.
        compactShare: seen && b.attention && b.compactMs ? b.compactMs / b.attention : null,
      }
    }),
  }
}

// Which way a series is going, and whether that is good news.
//
// `better` is NOT the sign of the change: more landed is good, more attention
// per change is not, and an arrow without that is a shape rather than a
// verdict. `null` when there is not enough to say.
export function direction(values, { good = 'up', minSamples = 2 } = {}) {
  const seen = values.filter(v => v !== null && v !== undefined && Number.isFinite(v))
  if (seen.length < minSamples) return null
  const last = seen[seen.length - 1]
  const before = seen.slice(0, -1)
  const base = before.reduce((a, b) => a + b, 0) / before.length
  if (!Number.isFinite(base)) return null
  // A tenth either way is noise at these volumes, not a trend.
  const move = base === 0 ? (last === 0 ? 0 : 1) : (last - base) / Math.abs(base)
  const dir = Math.abs(move) < 0.1 ? 'flat' : move > 0 ? 'up' : 'down'
  if (dir === 'flat') return { dir, better: null, move }
  return { dir, better: good === 'up' ? dir === 'up' : dir === 'down', move }
}
