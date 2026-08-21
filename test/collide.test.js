import test from 'node:test'
import assert from 'node:assert/strict'
import { collisions, who, isNoise } from '../src/collide.js'

const T = Date.parse('2026-08-01T12:00:00Z')
const ev = (session, path, minutes, agent = 'claude') =>
  ({ agent, session, path, at: T + minutes * 60_000, kind: 'edit', project: '/r' })
const live = (...ids) => new Map(ids.map(i => [i, { first: T - 3_600_000, last: T + 3_600_000 }]))

test('two sessions in one file inside the window is a collision', () => {
  const c = collisions([ev('a', '/r/x.ts', 0), ev('b', '/r/x.ts', 10)], live('a', 'b'))
  assert.equal(c.length, 1)
  assert.equal(c[0].gapMin, 10)
})

test('outside the window it is not', () => {
  assert.equal(collisions([ev('a', '/r/x.ts', 0), ev('b', '/r/x.ts', 45)], live('a', 'b')).length, 0)
})

test('one session editing its own file repeatedly is never a collision', () => {
  assert.equal(collisions([ev('a', '/r/x.ts', 0), ev('a', '/r/x.ts', 5), ev('a', '/r/x.ts', 9)], live('a')).length, 0)
})

test('a handover is not parallel work — session lifetimes must overlap', () => {
  const sessions = new Map([
    ['a', { first: T - 60_000, last: T + 60_000 }],
    ['b', { first: T + 300_000, last: T + 900_000 }],   // starts after a ended
  ])
  assert.equal(collisions([ev('a', '/r/x.ts', 0), ev('b', '/r/x.ts', 6)], sessions).length, 0)
})

test('repeated edits inside one overlap collapse to a single collision', () => {
  const evs = [ev('a', '/r/x.ts', 0), ev('b', '/r/x.ts', 2), ev('a', '/r/x.ts', 4), ev('b', '/r/x.ts', 6)]
  assert.equal(collisions(evs, live('a', 'b')).length, 1)
})

test('noise is not work', () => {
  for (const p of ['/r/node_modules/x.js', '/r/dist/a.js', '/r/x.log', '/tmp/scratch.ts',
                   '/Users/me/.claude/projects/a.jsonl', '/Users/me/.codex/sessions/b.jsonl'])
    assert.equal(isNoise(p), true, p)
  assert.equal(isNoise('/r/src/index.ts'), false)
})

test('who reports one row per session, most recent first, excluding self', () => {
  const evs = [ev('a', '/r/x.ts', -5), ev('a', '/r/y.ts', -1), ev('b', '/r/z.ts', -3), ev('me', '/r/q.ts', -2)]
  const rows = who(evs, live('a', 'b', 'me'), { root: '/r', activeMin: 30, self: 'me', now: T })
  assert.deepEqual(rows.map(r => r.session), ['a', 'b'])
  assert.equal(rows[0].path, '/r/y.ts')
})

test('who is scoped to the repo you are standing in', () => {
  const evs = [{ ...ev('a', '/other/x.ts', -1), project: '/other' }, ev('b', '/r/y.ts', -1)]
  const rows = who(evs, live('a', 'b'), { root: '/r', activeMin: 30, now: T })
  assert.deepEqual(rows.map(r => r.session), ['b'])
})

test('one file named two ways is still one file', async () => {
  // On Windows two agents can record C:\r\x.ts and C:/r/x.ts for the same file.
  // Compared raw that is a collision skein misses, which is the expensive way
  // to be wrong.
  const { canon } = await import('../src/collide.js')
  assert.equal(canon('/r/x.ts'), canon('\\r\\x.ts'))
})

test('the collision reports the path the agent actually wrote', () => {
  const c = collisions([ev('a', '/r/x.ts', 0), ev('b', '/r/x.ts', 5)], live('a', 'b'))
  assert.equal(c[0].path, '/r/x.ts')
})
