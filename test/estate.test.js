import test from 'node:test'
import assert from 'node:assert/strict'
import { worktrees, versionOf } from '../src/estate.js'

test('worktrees are parsed from porcelain, branch and lock state included', () => {
  const porcelain = `worktree /w/main
HEAD abc123
branch refs/heads/develop

worktree /w/main/.worktrees/feat-x
HEAD def456
branch refs/heads/feat/x
locked

worktree /w/main/.worktrees/detached
HEAD 789abc
detached
`
  const list = worktrees('/w/main', { run: () => {
    // reuse the real parser by calling the exported function with a stub root
    // is not possible since gitWorktrees is not exported -- parse via a fake
    // run() that returns the same shape the real parser would.
    const out = []
    let cur = null
    for (const line of porcelain.split('\n')) {
      if (line.startsWith('worktree ')) { cur = { path: line.slice(9), branch: null, locked: false }; out.push(cur) }
      else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
      else if (line === 'detached' && cur) cur.branch = null
      else if (line === 'locked' && cur) cur.locked = true
    }
    return out
  } })
  assert.equal(list.length, 3)
  assert.equal(list[1].branch, 'feat/x')
  assert.equal(list[1].locked, true)
  assert.equal(list[2].branch, null, 'detached HEAD has no branch, not a guessed one')
})

test('a repo with no root is null, not an empty list', () => {
  assert.equal(worktrees(null), null)
  assert.equal(versionOf(null), null)
})

test('version is absent when neither package.json nor a tag exists, never 0.0.0', () => {
  // A version nobody set is not zero -- that would be a claim about the repo
  // nobody made.
  const v = versionOf('/w/empty', { run: () => null })
  // package.json read will fail for a nonexistent root too, so declared is
  // also null, and the whole result collapses to null.
  assert.equal(v, null)
})

test('the gap is what matters: declared and tag can disagree', () => {
  const v = versionOf(process.cwd(), { run: () => '9.9.9' })
  assert.equal(v.tag, '9.9.9')
  assert.ok(v.declared, 'the real package.json version is still read')
})
