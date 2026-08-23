import test from 'node:test'
import assert from 'node:assert/strict'
import { coupling, coupled, layout, MAX_EDGES } from '../src/graph.js'
import { canvas } from '../src/canvas.js'

const commit = (files, extra = {}) => ({ files, release: false, ...extra })

test('coupling is measured against the rarer file, not the union', () => {
  // A file changed twice, always alongside a file changed fifty times, is
  // entirely coupled to it -- that is the reading a developer wants. Dividing
  // by the union would bury it at 4% and the finding would never surface.
  const commits = [
    ...Array.from({ length: 20 }, () => commit(['big.js'])),
    commit(['big.js', 'rare.js']),
    commit(['big.js', 'rare.js']),
    commit(['big.js', 'rare.js']),
  ]
  const { pairs } = coupling(commits)
  const hit = pairs.find(x => x.a === 'big.js' && x.b === 'rare.js')
  assert.ok(hit, 'the pair is found')
  assert.equal(hit.n, 3)
  assert.equal(hit.ratio, 1, 'rare.js never changes without big.js')
})

test('a release commit and a sweeping commit are not evidence of structure', () => {
  // A release touches everything it bumps; a commit touching half the repo
  // makes every pair in it look coupled. Neither says anything about how the
  // code is organised.
  const wide = Array.from({ length: 20 }, (_, i) => `f${i}.js`)
  const commits = [
    commit(['a.js', 'b.js'], { release: true }),
    commit(['a.js', 'b.js'], { release: true }),
    commit(['a.js', 'b.js'], { release: true }),
    commit(wide), commit(wide), commit(wide),
  ]
  assert.deepEqual(coupling(commits).pairs, [])
})

test('a contested file is drawn even when git never paired it', () => {
  // It is the reason this tool exists. Leaving it out because git happens not
  // to have coupled it would be the graph hiding the one thing it is best
  // placed to show.
  const commits = [commit(['a.js', 'b.js']), commit(['a.js', 'b.js']), commit(['a.js', 'b.js'])]
  const contested = new Map([['/w/lonely.ts', { gapMin: 4 }]])
  const g = coupled(commits, { root: '/w', contested })
  const lonely = g.nodes.find(n => n.id === '/w/lonely.ts')
  assert.ok(lonely, 'the contested file is a node')
  assert.equal(lonely.contested.gapMin, 4)
  assert.equal(g.edges.some(([a, b]) => g.nodes[a] === lonely || g.nodes[b] === lonely), false, 'with no edge invented for it')
})

test('the graph is capped, and says by how much', () => {
  const commits = []
  for (let i = 0; i < MAX_EDGES + 12; i++) {
    for (let k = 0; k < 3; k++) commits.push(commit([`x${i}.js`, `y${i}.js`]))
  }
  const g = coupled(commits)
  assert.ok(g.edges.length <= MAX_EDGES)
  // AXI 5: a picture that silently drops a third of its structure is a claim
  // the codebase is simpler than it is.
  assert.ok(g.morePairs > 0, 'and it reports what it left out')
  assert.equal(g.pairs, MAX_EDGES + 12)
})

test('no commits is an empty graph, not a crash', () => {
  assert.deepEqual(coupled(null).nodes, [])
  assert.deepEqual(coupled([]).nodes, [])
  assert.deepEqual(coupling(null).pairs, [])
})

test('the layout is deterministic and scales to the node count', () => {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` }))
  const edges = Array.from({ length: 12 }, (_, i) => [i, (i + 1) % 12])
  const a = layout(nodes, edges, { seed: '/w/p' })
  // Math.random would reseat every node on every repaint and the graph would
  // boil. Same repo, same shape, every frame.
  assert.deepEqual(a, layout(nodes, edges, { seed: '/w/p' }))
  assert.notDeepEqual(a, layout(nodes, edges, { seed: '/w/other' }))
  for (const q of a) {
    assert.ok(q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1, 'inside the frame')
    assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y))
  }
  const span = xs => Math.max(...xs) - Math.min(...xs)
  const wide = layout(Array.from({ length: 22 }, (_, i) => ({ id: `n${i}` })),
    Array.from({ length: 22 }, (_, i) => [i, (i + 1) % 22]), { seed: 'w' })
  assert.ok(span(a.map(q => q.x)) < span(wide.map(q => q.x)), 'fewer nodes draw smaller')
  const lo = Math.min(...a.map(q => q.x)), hi = Math.max(...a.map(q => q.x))
  assert.ok(Math.abs(lo - (1 - hi)) < 1e-9, 'and a small graph is centred, not pinned to a corner')
})

test('an empty or single-node layout does not throw', () => {
  assert.deepEqual(layout([], []), [])
  assert.deepEqual(layout([{ id: 'one' }], []), [{ x: 0.5, y: 0.5 }])
})

test('the canvas draws a line at any angle and never off the edge', () => {
  const c = canvas(20, 5)
  c.line(0, 0, 39, 19, '')
  c.line(-50, -50, 200, 200, '')
  c.line(10, 10, 10, 10, '')
  const rows = c.rows()
  assert.equal(rows.length, 5)
  for (const r of rows) assert.ok([...r.replace(/\x1b\[[0-9;]*m/g, '')].length <= 20)
  assert.equal(rows.join('').includes('\u2800'), false, 'an empty cell is a space, not blank braille')
  assert.match(rows.join(''), /[\u2801-\u28ff]/, 'and something was actually drawn')
})
