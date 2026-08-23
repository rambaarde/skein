import test from 'node:test'
import assert from 'node:assert/strict'
import { byRoot } from '../src/machine.js'

test('CPU with no resolvable cwd is counted, not dropped', () => {
  // A process lsof could not fully introspect, or one that exited between the
  // ps and cwd calls, has no root. AXI 5: the CPU is real even when skein
  // cannot say whose project it belongs to.
  const rows = [
    { pid: 1, agent: 'claude', cpu: 5, cwd: '/w/a', root: '/w/a' },
    { pid: 2, agent: 'claude', cpu: 3, cwd: '/w/a', root: '/w/a' },
    { pid: 3, agent: 'codex', cpu: 2, cwd: null, root: null },
  ]
  const { roots, unrooted } = byRoot(rows)
  assert.equal(roots.get('/w/a').cpu, 8)
  assert.deepEqual([...roots.get('/w/a').agents], ['claude'])
  assert.equal(unrooted, 2)
})

test('no running agents is an empty sample, not a throw', () => {
  const { roots, unrooted } = byRoot([])
  assert.equal(roots.size, 0)
  assert.equal(unrooted, 0)
})
