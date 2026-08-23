// What actually landed, and how long it took to land.
//
// skeins's four DORA-shaped numbers, for ONE developer. DORA is an org metric
// and three quarters of it does not survive the translation:
//
//   deployment frequency  -> what LANDED on the trunk. Honest, from git.
//   lead time for changes -> when you STARTED to when it landed. See below.
//   change failure rate   -> rework: the share of landings typed fix/revert.
//                            A proxy, and named one on screen.
//   mean time to restore  -> needs incidents. Not derivable, not shown.
//
// The same rule as the cost column: a number that is wrong is worse than a
// number that is absent.
//
// Lead time is the interesting one, and it is where skeins has something git
// does not. Measured on this repository, every trunk commit has ONE parent and
// its author date equals its commit date — squash merges erase the branch, so
// git alone cannot say when the work started. skeins can: the transcripts know
// when you first touched the repo after the previous landing. That is a better
// definition anyway, because it measures from when you started WORKING rather
// than from when you happened to first commit.
import { execFileSync } from 'node:child_process'
import { statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// In priority order. `develop` is here because work lands there first in repos
// that keep one, and a landing on develop is a landing.
export const TRUNKS = ['main', 'master', 'develop', 'trunk']

// release-please and friends open a second trunk commit per change. Counting
// it doubles every number, and it is not a change — it is the same change
// being versioned.
export const RELEASE = /^chore(\([^)]*\))?!?:\s*release\b/i
export const HOTFIX = /^(fix|revert)(\([^)]*\))?!?:/i

// A deployment is a version tag, or -- in a repo that tags nothing -- a
// release commit. Tags are preferred where they exist: measured across this
// machine, four of eleven repositories tag and only one has release-bot
// commits, and a tag is the thing that actually went out.
export const VERSION_TAG = /^v?\d+\.\d+/

// A landing changes a ref, so the newest mtime across the ref stores is enough
// to know whether the answer can have changed. Without this, six projects on a
// two-second poll would spawn git eighteen hundred times an hour.
const stamp = root => {
  let k = ''
  for (const f of ['HEAD', 'packed-refs', 'refs/heads', 'refs/remotes/origin']) {
    try { k += `${statSync(join(root, '.git', f)).mtimeMs},` } catch { k += 'x,' }
  }
  return k
}

// Which ref is the trunk. Read off the filesystem rather than asked of git,
// because asking costs a second process per project and this is two stats.
const hasRef = (root, name) => {
  try { statSync(join(root, '.git', 'refs', 'heads', name)); return true } catch {}
  try {
    return new RegExp(`^[0-9a-f]+ refs/heads/${name}$`, 'm')
      .test(readFileSync(join(root, '.git', 'packed-refs'), 'utf8'))
  } catch { return false }
}

export const trunkOf = root => TRUNKS.find(t => hasRef(root, t)) ?? null

const memo = new Map()

// Everything that landed on the trunk in the window, newest first.
//
// Returns null — not an empty list — when there is no git history to read, so
// a caller can say "no history here" rather than "you shipped nothing", which
// are very different statements (AXI 5).
// The memo key is quantised to the DAY, and the answer is then trimmed back
// to the exact `since` the caller asked for.
//
// Every screen computes `since` as `now - lookback`, and `now` advances every
// second, so the key `${stamp(root)}|${since}` was different on every single
// draw and nothing ever hit. Measured at a 30-day window: 680ms a repaint.
// Quantising at each call site fixed one screen at a time and was forgotten
// twice; doing it here fixes every caller at once, including the ones not
// written yet.
//
// git is asked for whole days, which is a superset, and the extra commits are
// filtered out before returning -- so the answer is exactly what was asked
// for and only the cache is coarser.
const day = ms => Math.floor(ms / 86_400_000) * 86_400_000

// Keyed on the root AND the window, not one slot per root.
//
// One slot meant two screens asking about different windows evicted each
// other on every draw: the velocity table asks for thirty days and the trend
// band asks for eight weeks, so each call missed the other's entry and git was
// spawned again. A CPU profile of twelve draws showed 8.7 SECONDS inside
// spawnSync -- 726ms a draw, all of it re-answering questions already answered.
const slot = (m, root, key) => {
  const hit = m.get(`${root}\u0000${key}`)
  return hit ?? null
}

export function landings(root, { since, run = gitLog } = {}) {
  if (!root) return null
  // The memo is keyed on the repo, so it MUST NOT answer for an injected
  // reader -- the whole point of passing one is to get a different answer for
  // the same root, and a cache that ignores that hands back the last one.
  const asked = day(since)
  const key = `${stamp(root)}|${asked}`
  const hit = run === gitLog ? slot(memo, root, key) : null
  if (hit) return hit.value.filter(s => s.at >= since)
  const trunk = trunkOf(root)
  const out = trunk ? run(root, trunk, asked) : null
  if (run === gitLog && out) memo.set(`${root}\u0000${key}`, { key, value: out })
  return out ? out.filter(s => s.at >= since) : out
}

function gitLog(root, trunk, since) {
  try {
    const raw = execFileSync('git', [
      'log', '--first-parent', trunk,
      `--since=${new Date(since).toISOString()}`,
      '--format=%ct%x00%s', '--name-only',
    ], { cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 8 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
    return parse(raw)
  } catch {
    // A repo mid-rebase, a git that is not installed, a submodule with no
    // history. None of those are skeins's problem to report loudly.
    return null
  }
}

// `git log --name-only` writes the header line, then the paths that commit
// touched, then a blank.
//
// The files are what makes a change failure rate possible at all. Without
// them, "was this deployment hotfixed" collapses to "did a fix happen
// afterwards" — which on any repository actually being worked on is always
// yes. Measured on this one: 92% by that rule, against 15% when the hotfix
// has to touch what the deployment shipped.
export function parse(raw) {
  const out = []
  let cur = null
  for (const line of String(raw).split('\n')) {
    if (line.includes('\0')) {
      const [ct, subject = ''] = line.split('\0')
      const at = Number(ct) * 1000
      cur = Number.isFinite(at) && at
        ? { at, subject, files: [], release: RELEASE.test(subject), hotfix: HOTFIX.test(subject) }
        : null
      if (cur) out.push(cur)
      continue
    }
    if (cur && line.trim()) cur.files.push(line.trim())
  }
  return out
}

export const median = xs => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

// Lead time, per landing: from the first edit made after the PREVIOUS landing
// until this one. That is "I started on this, and this is when it shipped".
//
// A landing with no edit before it in the window contributes nothing rather
// than zero — it was worked on before the window opened, and calling that an
// instant lead time would drag the median toward a lie.
export function leadTimes(ships, events, since) {
  const at = events.map(e => e.at).filter(Boolean).sort((a, b) => a - b)
  const asc = [...ships].sort((a, b) => a.at - b.at)
  const out = []
  let prev = since, i = 0
  for (const s of asc) {
    while (i < at.length && at[i] <= prev) i++
    if (i < at.length && at[i] <= s.at) out.push(s.at - at[i])
    prev = s.at
  }
  return out
}

// When something actually went out.
//
// A version tag first, a release commit only where the repo tags nothing.
// Measured across this machine: four of eleven repositories tag, and one has
// release-bot commits — and a tag is the thing that actually shipped, where a
// release commit is a repo's bookkeeping about it. Taking both would count
// release-please twice, since it writes a commit AND a tag for one publish.
// Memoised on the same key landings uses, and for the same reason it turned
// out to matter: this shells out to `git tag`, the velocity screen calls it
// once per project on every draw, and every keypress was paying for it.
// Measured on a machine with 41 projects: landings 1ms against deployments
// 220ms, which is the entire feel of that screen being slow to move around.
const deployMemo = new Map()

export function deployments(root, { since, all = null, run = gitTags } = {}) {
  const asked = day(since)
  const key = `${stamp(root)}|${asked}`
  const hit = run === gitTags ? slot(deployMemo, root, key) : null
  // `all` only decides the FALLBACK, and the fallback is only consulted when
  // the repo has no version tags -- so it cannot change an answer the tags
  // already gave, and it is derived from landings, which is keyed the same way.
  if (hit) return hit.value.filter(d => d.at >= since)
  const tags = (run(root) ?? []).filter(t => t.at >= asked).sort((a, b) => a.at - b.at)
  const value = tags.length
    ? tags
    : (all ?? []).filter(s => s.release).map(s => ({ at: s.at, name: s.subject })).sort((a, b) => a.at - b.at)
  if (run === gitTags) deployMemo.set(`${root}\u0000${key}`, { key, value })
  return value.filter(d => d.at >= since)
}

function gitTags(root) {
  try {
    const raw = execFileSync('git', ['tag', '--format=%(creatordate:unix) %(refname:short)'],
      { cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 4 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
    return raw.split('\n').filter(Boolean).map(l => {
      const i = l.indexOf(' ')
      return { at: Number(l.slice(0, i)) * 1000, name: l.slice(i + 1) }
    }).filter(t => Number.isFinite(t.at) && t.at && VERSION_TAG.test(t.name))
  } catch { return null }
}

// Change failure rate, measured against DEPLOYMENTS rather than commits.
//
// A deployment ships everything landed since the previous one. It FAILED if
// the next batch contains a hotfix touching a file it shipped -- something
// went out, and the next thing that went out was a repair to it.
//
// The three rules that make this a measurement rather than a mood:
//
//   The unit is the deployment. A fix that lands before the next release means
//   nothing ever shipped broken, and counting it made every fast repository
//   look broken -- 92% on this one, against 15% by this definition.
//
//   The hotfix has to touch what the deployment shipped. "A fix happened
//   afterwards" is true of every repository being worked on.
//
//   The newest deployment CANNOT be judged: nothing has shipped after it yet.
//   It leaves the denominator rather than counting as a success, or every
//   release would improve the number for a day and then not.
export function failureRate(all, deploys) {
  if (!all || !deploys || deploys.length < 2) return null
  const landed = all.filter(s => !s.release).sort((a, b) => a.at - b.at)
  const batches = []
  let prev = -Infinity
  for (const d of deploys) {
    batches.push({ at: d.at, name: d.name, shipped: new Set(landed.filter(s => s.at > prev && s.at <= d.at).flatMap(s => s.files)) })
    prev = d.at
  }
  // One pass, and it keeps the WORKING that produced the verdict.
  //
  // The rate answers "how often", which is where every dashboard stops. The
  // question a developer actually has next is "at what", and the answer was
  // already computed here and thrown away: to decide a deployment failed, this
  // has to know exactly which hotfix touched exactly which file it shipped.
  // Keeping that turns a percentage into a list you can act on.
  const verdicts = []
  let failed = 0
  for (let i = 0; i < batches.length - 1; i++) {
    const after = landed.filter(s => s.hotfix && s.at > batches[i].at && s.at <= batches[i + 1].at)
    const repaired = after.filter(s => s.files.some(f => batches[i].shipped.has(f)))
    if (repaired.length) failed++
    verdicts.push({
      at: batches[i].at,
      name: batches[i].name ?? null,
      failed: repaired.length > 0,
      // What repaired it, and what it touched of what went out. Empty arrays
      // on a deployment that held, never absent -- a caller must not have to
      // tell "nothing broke" from "we did not look".
      by: repaired.map(s => s.subject),
      files: [...new Set(repaired.flatMap(s => s.files.filter(f => batches[i].shipped.has(f))))],
    })
  }
  const judged = batches.length - 1
  return {
    rate: failed / judged,
    failed,
    judged,
    deployments: deploys.length,
    verdicts,
    offenders: offenders(verdicts, batches),
  }
}

// Which files keep being shipped and then repaired -- AGAINST how often they
// ship at all.
//
// The bare count is a popularity contest. Measured on this repository:
// src/tui.js appears in 7 of 7 failures, and it also appears in 44 of 49
// deployments, because it is the biggest file and nearly every change touches
// it. "7 times" reads as a fragile file; "7 of 44" reads as what it is. A list
// without the denominator would send a reader to rewrite the file that ships
// most often rather than the one that breaks most often.
const PRIOR = 3

export function offenders(verdicts, batches) {
  const shipped = new Map()
  for (const b of batches) for (const f of b.shipped) shipped.set(f, (shipped.get(f) ?? 0) + 1)
  const hit = new Map()
  for (const v of verdicts) for (const f of v.files) hit.set(f, (hit.get(f) ?? 0) + 1)
  return [...hit]
    .map(([file, hotfixed]) => ({ file, hotfixed, shipped: shipped.get(file) ?? 0 }))
    // Sorted by a SMOOTHED rate, because a raw one is dominated by small
    // denominators. On this repository the raw rate put three 1-of-3 files
    // above src/tui.js at 7-of-22 -- and a file that shipped three times and
    // was repaired once is not evidence of anything, while seven repairs in
    // twenty-two is.
    //
    // Additive smoothing with a prior of PRIOR pretend-clean shipments: it
    // costs a high-denominator file almost nothing and collapses a 1-of-3 to
    // where its sample size belongs. Count breaks the tie.
    .sort((a, b) => (b.hotfixed / (b.shipped + PRIOR)) - (a.hotfixed / (a.shipped + PRIOR)) || b.hotfixed - a.hotfixed)
}

// The change failure rate as it stood at each point across the window.
//
// Cumulative WITHIN the window, not over a trailing few deployments. Two
// reasons, and the second one is the important one:
//
//   A trailing window is jumpier, which flatters a chart and misleads a
//   reader: with four deployments in it, one hotfix moves the line 25 points.
//
//   The right-hand edge of this series is the CFR over every deployment in
//   the window -- which is exactly the number the table prints. A chart whose
//   endpoint disagrees with the number beside it is worse than no chart, and
//   this codebase has already shipped that mistake once.
//
// Before the second deployment there is nothing to judge, so the series holds
// at zero rather than inventing a rate.
export function cfrSeries(verdicts, buckets, since, now) {
  const out = new Array(Math.max(1, buckets)).fill(0)
  if (!verdicts?.length) return out
  const span = Math.max(1, now - since)
  const asc = [...verdicts].sort((a, b) => a.at - b.at)
  let i = 0, judged = 0, failed = 0
  for (let c = 0; c < out.length; c++) {
    const t = since + ((c + 1) / out.length) * span
    while (i < asc.length && asc[i].at <= t) { judged++; if (asc[i].failed) failed++; i++ }
    out[c] = judged ? failed / judged : 0
  }
  return out
}

// The numbers, per project. `attention` comes from the caller because it is
// already computed for the table and must not be able to disagree with it.
export function velocity(root, events, { since, now, attention = 0, ships = null, deploys = null } = {}) {
  const all = ships ?? landings(root, { since })
  if (!all) return null
  const landed = all.filter(s => !s.release)
  const days = Math.max(1, (now - since) / 86_400_000)
  const cfr = failureRate(all, deploys ?? deployments(root, { since, all }))
  return {
    landed: landed.length,
    days,
    // Both rates, because which one is honest depends on the window. Twenty
    // five landings in a day is 175 a week only if you keep it up for a week,
    // and printing that as a measurement is a projection wearing a
    // measurement's clothes.
    perDay: landed.length / days,
    perWeek: (landed.length / days) * 7,
    lead: median(leadTimes(landed, events, since)),
    // Hours per landing is the join no other tool can make: skeins knows the
    // attention, git knows what came out of it.
    perShip: landed.length ? Math.round(attention / landed.length) : null,
    // null, not zero, when there are fewer than two deployments to compare.
    // A repository that never ships has no change failure rate -- that is a
    // different statement from "it never fails".
    cfr: cfr ? cfr.rate : null,
    cfrOf: cfr,
    releases: all.length - landed.length,
  }
}

// Count of timestamps falling in each of `n` even buckets across the window.
// The chart wants a running total of landings, and a landing is an instant
// rather than a duration, so this is a count and not a sum of spans.
export function bucket(times, n, since, now) {
  const out = new Array(Math.max(1, n)).fill(0)
  const span = Math.max(1, now - since)
  for (const t of times) {
    if (!t || t < since || t > now) continue
    out[Math.min(out.length - 1, Math.floor(((t - since) / span) * out.length))]++
  }
  return out
}
