// What actually landed, and how long it took to land.
//
// skein's four DORA-shaped numbers, for ONE developer. DORA is an org metric
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
// Lead time is the interesting one, and it is where skein has something git
// does not. Measured on this repository, every trunk commit has ONE parent and
// its author date equals its commit date — squash merges erase the branch, so
// git alone cannot say when the work started. skein can: the transcripts know
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
export const REWORK = /^(fix|revert)(\([^)]*\))?!?:/i

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
export function landings(root, { since, run = gitLog } = {}) {
  if (!root) return null
  const key = `${stamp(root)}|${since}`
  const hit = memo.get(root)
  if (hit && hit.key === key) return hit.value
  const trunk = trunkOf(root)
  const out = trunk ? run(root, trunk, since) : null
  memo.set(root, { key, value: out })
  return out
}

function gitLog(root, trunk, since) {
  try {
    const raw = execFileSync('git', [
      'log', '--first-parent', trunk,
      `--since=${new Date(since).toISOString()}`,
      '--format=%ct%x00%s',
    ], { cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 4 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
    return parse(raw)
  } catch {
    // A repo mid-rebase, a git that is not installed, a submodule with no
    // history. None of those are skein's problem to report loudly.
    return null
  }
}

export function parse(raw) {
  const out = []
  for (const line of String(raw).split('\n')) {
    if (!line) continue
    const [ct, subject = ''] = line.split('\0')
    const at = Number(ct) * 1000
    if (!Number.isFinite(at) || !at) continue
    out.push({ at, subject, release: RELEASE.test(subject), rework: REWORK.test(subject) })
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

// The four numbers, per project. `attention` comes from the caller because it
// is already computed for the table and must not be able to disagree with it.
export function velocity(root, events, { since, now, attention = 0, ships = null } = {}) {
  const all = ships ?? landings(root, { since })
  if (!all) return null
  const landed = all.filter(s => !s.release)
  const days = Math.max(1, (now - since) / 86_400_000)
  return {
    landed: landed.length,
    perWeek: (landed.length / days) * 7,
    lead: median(leadTimes(landed, events, since)),
    // Hours per landing is the join no other tool can make: skein knows the
    // attention, git knows what came out of it.
    perShip: landed.length ? Math.round(attention / landed.length) : null,
    rework: landed.length ? landed.filter(s => s.rework).length / landed.length : null,
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
