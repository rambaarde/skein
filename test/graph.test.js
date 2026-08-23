import test from 'node:test'
import assert from 'node:assert/strict'
import { contention, layout, MAX_FILES } from '../src/graph.js'
import { canvas } from '../src/canvas.js'

test('only files two sessions both touched are a graph at all', () => {
  const now = Date.now()
  const p = {
    root: '/w/p',
    events: [
      { at: now, session: 'a', path: '/w/p/shared.ts' },
      { at: now, session: 'b', path: '/w/p/shared.ts' },
      { at: now, session: 'a', path: '/w/p/mine.ts' },
      { at: now, session: 'c', path: '/w/p/also-shared.ts' },
      { at: now, session: 'b', path: '/w/p/also-shared.ts' },
    ],
  }
  const g = contention(p)
  const files = g.nodes.filter(n => n.kind === 'file').map(n => n.label)
  assert.deepEqual(files.sort(), ['also-shared.ts', 'shared.ts'])
  // A file with one writer is not a node. It is work, and drawing it as a dot
  // with no edge says "nothing happened here" about the ordinary case.
  assert.equal(files.includes('mine.ts'), false)
  // Sessions are only kept if they reach a contested file: `a` touched one,
  // so it stays; nothing here is dropped, but the count must be honest.
  assert.equal(g.nodes.filter(n => n.kind === 'session').length, 3)
  assert.equal(g.edges.length, 4)
})

test('a capped graph says what it left out', () => {
  const now = Date.now()
  const events = []
  for (let i = 0; i < MAX_FILES + 7; i++) {
    events.push({ at: now, session: 'a', path: `/w/p/f${i}.ts` })
    events.push({ at: now, session: 'b', path: `/w/p/f${i}.ts` })
  }
  const g = contention({ root: '/w/p', events })
  assert.equal(g.nodes.filter(n => n.kind === 'file').length, MAX_FILES)
  // AXI 5: a picture that silently drops a third of its nodes is a claim that
  // the project is calmer than it is.
  assert.equal(g.moreFiles, 7)
  assert.equal(g.totalShared, MAX_FILES + 7)
})

test('the layout is deterministic and fills its frame', () => {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, kind: i < 4 ? 'session' : 'file' }))
  const edges = [[0, 4], [0, 5], [1, 4], [1, 6], [2, 7], [3, 8], [2, 9], [3, 10], [0, 11]]
  const a = layout(nodes, edges, { seed: '/w/p' })
  const b = layout(nodes, edges, { seed: '/w/p' })
  // Math.random would reseat every node on every repaint and the graph would
  // boil. Same repo, same shape, every frame.
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, layout(nodes, edges, { seed: '/w/other' }))

  for (const q of a) {
    assert.ok(q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1, 'inside the frame')
    assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), 'and a real number')
  }
  // Normalised to the full extent, or a graph that settled in one corner
  // draws at a tenth of the size for no reason a reader can see.
  assert.equal(Math.min(...a.map(q => q.x)), 0)
  assert.equal(Math.max(...a.map(q => q.x)), 1)
})

test('an empty or single-node graph does not throw', () => {
  assert.deepEqual(layout([], []), [])
  assert.deepEqual(layout([{ id: 'one' }], []), [{ x: 0.5, y: 0.5 }])
  assert.deepEqual(contention(null).nodes, [])
  assert.deepEqual(contention({ events: [] }).nodes, [])
})

test('the canvas draws a line at any angle and never off the edge', () => {
  const c = canvas(20, 5)
  // Diagonal, plus two that leave the frame entirely.
  c.line(0, 0, 39, 19, '')
  c.line(-50, -50, 200, 200, '')
  c.line(10, 10, 10, 10, '')
  const rows = c.rows()
  assert.equal(rows.length, 5)
  for (const r of rows) {
    assert.ok([...r.replace(/\x1b\[[0-9;]*m/g, '')].length <= 20, 'never wider than the canvas')
  }
  assert.ok(rows.join('').includes('\u2800') === false, 'an empty cell is a space, not blank braille')
  assert.match(rows.join(''), /[\u2801-\u28ff]/, 'and something was actually drawn')
})
