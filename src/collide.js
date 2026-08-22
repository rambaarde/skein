// Two agents in one file. The whole product (PRD §0.1).
//
// Advisory only: this module reports that an overlap happened. Nothing here
// blocks, locks, claims or queues -- PRD D8, and the line that defines skein.
import { gitRoot } from './project.js'

// Two agents can name one file differently and still mean the same file:
// C:\repo\src\x.ts and C:/repo/src/x.ts, or Repo and repo on a
// case-insensitive volume. Compared raw, that is a collision skein MISSES --
// the expensive direction. Canonicalise for comparison only; the path a user
// sees is always the one their agent actually wrote.
const WIN = process.platform === 'win32'
export const canon = p => {
  const s = String(p).replace(/\\/g, '/')
  return WIN ? s.toLowerCase() : s
}

export const WINDOW_MIN = 30

// A collision only counts if it is work. Logs, dependencies, build output and
// scratch directories are not work.
const NOISE = /(^|\/)(node_modules|\.git|dist|build|coverage|\.next|target|vendor)\//
// An agent's own store is not project work. Without this, skein reports itself
// and its neighbours editing ~/.claude/projects and calls it a collision.
const AGENT_INTERNALS = /\/(\.claude|\.codex)\/|\/\.local\/share\/opencode\//
// A path that still contains a shell variable was never expanded — it came out
// of a command line, not off the disk, so it names no real file.
const UNEXPANDED = /[$`]|^~[^/]/
export const isNoise = p =>
  !p || NOISE.test(p) || AGENT_INTERNALS.test(p) || UNEXPANDED.test(p) ||
  /\.(log|lock)$/.test(p) || /^\/(tmp|private\/tmp|var)\//.test(p)

// Did these two sessions actually run at the same time? Two edits landing
// inside 30 minutes is not parallel work if one session ended before the
// other began -- that is just a handover.
const overlap = (sessions, a, b) => {
  const A = sessions.get(a), B = sessions.get(b)
  if (!A || !B) return true            // unknown lifetimes: do not invent a reason to drop it
  return A.first <= B.last && B.first <= A.last
}

export function collisions(events, sessions, { windowMin = WINDOW_MIN, since = 0 } = {}) {
  const byPath = new Map()
  for (const e of events) {
    if (!e.at || e.at < since || isNoise(e.path)) continue
    const k = canon(e.path)
    if (!byPath.has(k)) byPath.set(k, [])
    byPath.get(k).push(e)
  }

  const found = new Map()   // path + session-pair -> earliest occurrence
  for (const [, evs] of byPath) {
    const path = evs[0].path            // display the path as it was recorded
    evs.sort((a, b) => a.at - b.at)
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        if (evs[j].at - evs[i].at > windowMin * 60_000) break
        if (evs[j].session === evs[i].session) continue
        if (!overlap(sessions, evs[i].session, evs[j].session)) continue
        const key = `${path}::${[evs[i].session, evs[j].session].sort().join('|')}`
        const hit = {
          path,
          project: evs[i].project ?? gitRoot(path),
          a: evs[i],
          b: evs[j],
          gapMin: Math.round((evs[j].at - evs[i].at) / 60_000),
          at: evs[i].at,
        }
        if (!found.has(key) || found.get(key).at > hit.at) found.set(key, hit)
      }
    }
  }
  return [...found.values()].sort((a, b) => b.at - a.at)
}

// Who else is working here right now. `path` narrows to a single file.
export function who(events, sessions, { root, path = null, activeMin = 30, self = null, now = Date.now() } = {}) {
  const cutoff = now - activeMin * 60_000
  const seen = new Map()
  for (const e of events) {
    if (e.at < cutoff || isNoise(e.path)) continue
    if (path && canon(e.path) !== canon(path)) continue
    if (root && (e.project ?? gitRoot(e.path)) !== root) continue
    if (self && e.session === self) continue
    const cur = seen.get(e.session)
    if (!cur || cur.at < e.at) {
      seen.set(e.session, { session: e.session, agent: e.agent, path: e.path, at: e.at, kind: e.kind, title: sessions.get(e.session)?.title ?? null, branch: sessions.get(e.session)?.branch ?? null })
    }
  }
  return [...seen.values()].sort((a, b) => b.at - a.at)
}
