// A project is a git root (PRD D4). Sessions with no git root collect into one
// visible `loose` bucket -- counted, never promoted (PRD D5).
import { statSync } from 'node:fs'
import { dirname, join, basename, parse } from 'node:path'
import { HOME } from './paths.js'
import { attentionOf } from './attention.js'

const cache = new Map()

export function gitRoot(path) {
  if (!path) return null
  let dir = dirname(path)
  const stop = parse(dir).root          // '/' on POSIX, 'C:\\' on Windows
  const seen = []
  while (dir && dir !== stop && dir !== HOME) {
    if (cache.has(dir)) {
      const hit = cache.get(dir)
      for (const d of seen) cache.set(d, hit)
      return hit
    }
    seen.push(dir)
    try {
      statSync(join(dir, '.git'))
      for (const d of seen) cache.set(d, dir)
      return dir
    } catch {}
    dir = dirname(dir)
  }
  for (const d of seen) cache.set(d, null)
  return null
}

// "loose" was internal shorthand from the thesis and it leaked onto the screen,
// where it reads as a project the user does not have. Say what it is instead:
// work that is not inside any git repository.
export const NO_REPO = 'not in a repo'
export const projectName = root => (root ? basename(root) : NO_REPO)

// Group events by project. `loose` is a real bucket, never a silent discard.
export function byProject(events) {
  const map = new Map()
  for (const e of events) {
    const root = e.project ?? gitRoot(e.path)
    const key = root ?? 'loose'
    if (!map.has(key)) map.set(key, { root, name: projectName(root), events: [] })
    map.get(key).events.push(e)
  }
  for (const p of map.values()) {
    p.events.sort((a, b) => a.at - b.at)
    p.last = p.events.at(-1)?.at ?? 0
    p.sessions = new Set(p.events.map(e => e.session)).size
    // Thesis §2: the question is where the ATTENTION went, not how many edits
    // there were. Two projects with a hundred edits each can be an afternoon
    // and ten minutes.
    p.attention = attentionOf(p.events)
    p.agents = [...new Set(p.events.map(e => e.agent))].sort()
    p.files = new Set(p.events.map(e => e.path)).size
  }
  return map
}
