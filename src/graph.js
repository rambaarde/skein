// The one graph skeins actually has, and the layout that makes it readable.
//
// The obvious thing to draw is every file as a node, the way a notes app does.
// Measured on a real machine over thirty days: 1512 files and 61 sessions, so
// 1573 nodes into a 180x45 terminal's 8100 cells. That is the documented
// failure mode of force-directed layout on dense graphs -- a hairball -- and
// the literature is blunt that matrix forms beat node-link above roughly
// twenty nodes.
//
// So this draws the SMALL graph instead: within one project, which sessions
// touched the same file. Measured on the same machine that is 1-13 sessions
// and up to 36 contested files per project, which is the regime where a
// node-link picture is the right form rather than a decorative one. And it is
// the graph the tool is about: a file two sessions are both in is the thing
// skeins exists to warn you about.
//
// Files no one shares are not drawn. They are not edges, and a node with no
// edge is a dot that means "nothing happened here".
import { short } from './format.js'

// Caps, so the picture stays a picture. Both are stated on screen when they
// bite (AXI 5): a graph that silently drops half its nodes is a lie about how
// contested a project is.
export const MAX_FILES = 10
export const MAX_SESSIONS = 12

// Deterministic pseudo-randomness. Math.random would reseat every node on
// every repaint and the graph would boil; seeding from the project root means
// the same repo always draws the same shape, so you can recognise it.
const seeded = str => {
  let a = 2166136261
  for (let i = 0; i < str.length; i++) { a ^= str.charCodeAt(i); a = Math.imul(a, 16777619) }
  return () => {
    a += 0x6D2B79F5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Who shares what, inside one project.
export function contention(project) {
  const byFile = new Map()
  for (const e of project?.events ?? []) {
    if (!e.path || !e.session) continue
    if (!byFile.has(e.path)) byFile.set(e.path, new Map())
    const m = byFile.get(e.path)
    m.set(e.session, Math.max(m.get(e.session) ?? 0, e.at ?? 0))
  }
  const shared = [...byFile]
    .filter(([, s]) => s.size > 1)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))

  const files = shared.slice(0, MAX_FILES)
  const sessions = new Map()
  for (const [, s] of files) {
    for (const [id, at] of s) sessions.set(id, Math.max(sessions.get(id) ?? 0, at))
  }
  const kept = [...sessions]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SESSIONS)
    .map(([id]) => id)
  const keep = new Set(kept)

  const nodes = [
    ...kept.map(id => ({
      id,
      kind: 'session',
      label: id.slice(0, 8),
      // When this session last wrote one of the contested files. A node with
      // no time on it says a session exists; with one it says whether you are
      // looking at something live or something from Tuesday.
      at: sessions.get(id) ?? 0,
      // How many of the drawn files it is in -- the session equivalent of a
      // file's contention.
      weight: files.filter(([, s]) => s.has(id)).length,
    })),
    ...files.map(([path, s]) => ({
      id: path,
      kind: 'file',
      label: short(path, project?.root),
      // How contested, which is what the node's size means on screen.
      weight: [...s.keys()].filter(x => keep.has(x)).length,
      at: Math.max(...[...s.values()], 0),
    })),
  ].filter(n => n.kind === 'session' || n.weight > 1)

  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const edges = []
  for (const [path, s] of files) {
    if (!index.has(path)) continue
    for (const id of s.keys()) {
      if (index.has(id)) edges.push([index.get(id), index.get(path)])
    }
  }
  return {
    nodes,
    edges,
    // What was left out, so the screen can say so rather than imply the
    // project is calmer than it is.
    moreFiles: Math.max(0, shared.length - files.length),
    moreSessions: Math.max(0, sessions.size - kept.length),
    totalShared: shared.length,
  }
}

// Fruchterman-Reingold, the plain 1991 version: every node repels every other,
// every edge pulls its two together, and the whole thing cools.
//
// Written out rather than pulled in. It is thirty lines, skeins has no runtime
// dependencies, and the alternatives are all layout engines that assume pixels
// and a canvas.
export function layout(nodes, edges, { seed = 'skeins', iterations = 400 } = {}) {
  const n = nodes.length
  if (!n) return []
  const rnd = seeded(seed)
  // Seeded on a circle rather than at random points: a ring is already an
  // untangled starting state, so the solver spends its iterations separating
  // clusters instead of undoing a knot it was handed.
  const pos = nodes.map((_, i) => ({
    x: 0.5 + 0.35 * Math.cos((2 * Math.PI * i) / n) + (rnd() - 0.5) * 0.02,
    y: 0.5 + 0.35 * Math.sin((2 * Math.PI * i) / n) + (rnd() - 0.5) * 0.02,
  }))
  if (n === 1) return [{ x: 0.5, y: 0.5 }]

  const k = Math.sqrt(1 / n)
  let temp = 0.12
  for (let step = 0; step < iterations; step++) {
    const dx = new Array(n).fill(0), dy = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ax = pos[i].x - pos[j].x, ay = pos[i].y - pos[j].y
        let d = Math.hypot(ax, ay)
        // Two nodes exactly on top of each other have no direction to
        // separate along, so give them one rather than dividing by zero.
        if (d < 1e-6) { ax = (rnd() - 0.5) * 1e-3; ay = (rnd() - 0.5) * 1e-3; d = Math.hypot(ax, ay) || 1e-6 }
        const f = (k * k) / d
        dx[i] += (ax / d) * f; dy[i] += (ay / d) * f
        dx[j] -= (ax / d) * f; dy[j] -= (ay / d) * f
      }
    }
    for (const [a, b] of edges) {
      const ax = pos[a].x - pos[b].x, ay = pos[a].y - pos[b].y
      const d = Math.hypot(ax, ay) || 1e-6
      const f = (d * d) / k
      dx[a] -= (ax / d) * f; dy[a] -= (ay / d) * f
      dx[b] += (ax / d) * f; dy[b] += (ay / d) * f
    }
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dx[i], dy[i]) || 1e-6
      const m = Math.min(d, temp)
      // NOT clamped to the box. Clamping mid-solve pins whatever the
      // repulsion pushed outward against the wall, and a node stuck on the
      // frame drags a long straight edge across everything else -- which was
      // most of what made the first draw look like a scribble. Let them roam;
      // the normalise below brings the whole thing back into frame.
      pos[i].x += (dx[i] / d) * m
      pos[i].y += (dy[i] / d) * m
    }
    temp *= 0.975
  }

  // Normalise, then scale to what this many nodes DESERVES.
  //
  // Filling the frame unconditionally made five nodes span a whole terminal:
  // three files and two sessions became metre-long diagonals across an empty
  // screen, which reads as a sparse mess rather than as a small graph. A
  // drawing's area should grow with the thing it draws, so the extent follows
  // sqrt(n) and a five-node graph sits compactly in the middle -- the emptiness
  // around it is then information: this project is quiet.
  const xs = pos.map(p => p.x), ys = pos.map(p => p.y)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  const sx = x1 - x0 < 1e-6 ? 1 : x1 - x0
  const sy = y1 - y0 < 1e-6 ? 1 : y1 - y0
  const fill = Math.min(1, Math.sqrt(n / 22))
  const off = (1 - fill) / 2
  return pos.map(p => ({
    x: off + ((p.x - x0) / sx) * fill,
    y: off + ((p.y - y0) / sy) * fill,
  }))
}
