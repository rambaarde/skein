// The one graph skeins has that carries structure: which files change together.
//
// The obvious graph was sessions against the files they touched. Measured on
// real data it is DEGENERATE for a solo developer -- two agents in one repo
// both touch the same files, every node ends up with the same degree, and a
// force-directed layout given a graph with no structure draws a symmetric
// starburst. It conveyed one fact, on a whole screen, that the files pane
// already gives in three rows.
//
// Change coupling does have structure. Measured on this repository over
// ninety days: 49 commits, 55 files, 762 co-change pairs, 24 of them strong,
// and they cluster into things a reader recognises -- package.json with its
// release manifest, a module with its test, a renderer with the mouse code it
// grew alongside. That is a finding: two files that always move together are
// one thing wearing two names, or a test welded to an implementation.
//
// The collision overlay stays on top of it, because that is the part only
// skeins can know. Structure from git, danger from the transcripts, one
// picture.
import { short } from './format.js'

// Caps, so the picture stays a picture. Both are stated on screen when they
// bite (AXI 5): a graph that silently drops half its nodes is a lie about how
// contested a project is.
export const MAX_NODES = 22
export const MAX_EDGES = 26

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

// Files that change in the same commit, and how reliably.
//
// The ratio is co-changes over the FEWER of the two files' own change counts,
// not over their union. A file changed twice, always alongside a file changed
// fifty times, is entirely coupled to it -- that is the reading a developer
// wants, and dividing by the union would bury it at 4%.
export function coupling(commits, { minTogether = 3, minRatio = 0.4 } = {}) {
  const count = new Map(), together = new Map()
  for (const c of commits ?? []) {
    // A release commit touches everything it bumps and means nothing about
    // how the code is organised.
    if (c.release) continue
    const files = [...new Set((c.files ?? []).filter(Boolean))]
    // A commit touching half the repo says nothing about which two files
    // belong together; it just makes every pair in it look coupled.
    if (files.length > 12) continue
    for (const f of files) count.set(f, (count.get(f) ?? 0) + 1)
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const k = files[i] < files[j] ? `${files[i]}\u0000${files[j]}` : `${files[j]}\u0000${files[i]}`
        together.set(k, (together.get(k) ?? 0) + 1)
      }
    }
  }
  const pairs = []
  for (const [k, n] of together) {
    if (n < minTogether) continue
    const [a, b] = k.split('\u0000')
    const ratio = n / Math.max(1, Math.min(count.get(a) ?? 1, count.get(b) ?? 1))
    if (ratio < minRatio) continue
    pairs.push({ a, b, n, ratio })
  }
  // Strongest first, and a tie goes to the pair seen more often -- a 3-of-3
  // is weaker evidence than a 25-of-25 at the same ratio.
  pairs.sort((x, y) => y.ratio - x.ratio || y.n - x.n)
  return { pairs, count }
}

// The graph itself: nodes are files, edges are couplings, and anything two
// sessions were both in is marked whether it is coupled or not.
export function coupled(commits, { root = '', contested = new Map() } = {}) {
  const { pairs, count } = coupling(commits)
  const kept = pairs.slice(0, MAX_EDGES)
  const names = new Set()
  for (const p of kept) { names.add(p.a); names.add(p.b) }
  // A contested file is drawn even with no coupling: it is the reason this
  // tool exists, and leaving it out because git happens not to have paired it
  // would be the graph hiding the one thing it is best placed to show.
  for (const f of contested.keys()) names.add(f)

  const list = [...names]
    .sort((a, b) => (contested.has(b) ? 1 : 0) - (contested.has(a) ? 1 : 0) || (count.get(b) ?? 0) - (count.get(a) ?? 0))
    .slice(0, MAX_NODES)
  const index = new Map(list.map((f, i) => [f, i]))

  const nodes = list.map(f => ({
    id: f,
    kind: 'file',
    label: short(f, root),
    // How often it changes at all -- what the node's size means on screen.
    weight: count.get(f) ?? 0,
    contested: contested.get(f) ?? null,
  }))
  const edges = []
  for (const p of kept) {
    if (!index.has(p.a) || !index.has(p.b)) continue
    edges.push([index.get(p.a), index.get(p.b), p.ratio, p.n])
  }
  return {
    nodes,
    edges,
    morePairs: Math.max(0, pairs.length - kept.length),
    moreFiles: Math.max(0, names.size - list.length),
    files: count.size,
    pairs: pairs.length,
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
