// What is actually checked out: worktrees and the gap between a working copy
// and what it claims to be.
//
// Two git reads per project, memoised the same way delivery.js memoises --
// on the repo's own mtimes, not on a window, because neither answer depends
// on `since`. Measured cold across 27 real projects: 730ms. Skipping the memo
// here would be the exact defect fixed twice already today, a third time.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const stamp = root => {
  let k = ''
  for (const f of ['HEAD', 'packed-refs', 'refs/heads', 'worktrees']) {
    try { k += `${statSync(join(root, '.git', f)).mtimeMs},` } catch { k += 'x,' }
  }
  return k
}

/** Return recent commits, working-tree changes, and upstream sync for one checkout. */
export function worktreeState(root, { run = gitWorktreeState } = {}) {
  if (!root) return null
  return run(root)
}

function gitWorktreeState(root) {
  try {
    const run = args => execFileSync('git', args, {
      cwd: root, encoding: 'utf8', timeout: 2_000,
      maxBuffer: 1 << 20, stdio: ['ignore', 'pipe', 'ignore'],
    })
    const commits = run(['log', '-n3', '--pretty=%h%x09%s']).trim().split('\n').filter(Boolean)
      .map(line => { const [hash, subject] = line.split('\t'); return { hash, subject } })
    const changes = run(['status', '--porcelain']).split('\n').filter(Boolean)
    let ahead = null, behind = null
    try {
      const [left, right] = run(['rev-list', '--left-right', '--count', '@{u}...HEAD']).trim().split(/\s+/).map(Number)
      if (Number.isFinite(left) && Number.isFinite(right)) { behind = left; ahead = right }
    } catch {}
    return { commits, changes, ahead, behind }
  } catch { return null }
}
const memo = new Map()

// Every worktree of this repo, and which one this project root actually is.
//
// `git worktree list --porcelain` only has to be run from ONE of the
// worktrees to see all of them -- they share one `.git` -- so a project that
// is itself a linked worktree still reports its siblings correctly.
export function worktrees(root, { run = gitWorktrees } = {}) {
  if (!root) return null
  const key = stamp(root)
  const hit = run === gitWorktrees ? memo.get(root) : null
  if (hit && hit.key === key) return hit.value
  const value = run(root)
  if (run === gitWorktrees) memo.set(root, { key, value })
  return value
}

function gitWorktrees(root) {
  try {
    const raw = execFileSync('git', ['worktree', 'list', '--porcelain'],
      { cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 4 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
    const out = []
    let cur = null
    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) { cur = { path: line.slice(9), branch: null, locked: false }; out.push(cur) }
      else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
      else if (line === 'detached' && cur) cur.branch = null
      else if (line === 'locked' && cur) cur.locked = true
    }
    return out
  } catch { return null }
}

const verMemo = new Map()

// What this working copy claims to be, against what actually shipped.
//
// `package.json`'s version is a number a HUMAN typed (or release-please did)
// and can be stale the moment someone forgets to bump it after a manual edit.
// The latest tag is what a release process actually pointed at. The gap
// between them -- not either number alone -- is the thing worth a column.
export function versionOf(root, { run = gitLatestTag } = {}) {
  if (!root) return null
  const key = stamp(root)
  const hit = run === gitLatestTag ? verMemo.get(root) : null
  if (hit && hit.key === key) return hit.value
  let pkg = null
  try { pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? null } catch {}
  const tag = run(root)
  // Neither is invented. A repo with no package.json and no tags reports
  // both null rather than "0.0.0" -- a version nobody set is not zero, it is
  // absent.
  const value = (pkg || tag) ? { declared: pkg, tag } : null
  if (run === gitLatestTag) verMemo.set(root, { key, value })
  return value
}

function gitLatestTag(root) {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'],
      { cwd: root, encoding: 'utf8', timeout: 2_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(/^v/, '') || null
  } catch { return null }
}
