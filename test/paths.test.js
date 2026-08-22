import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { storesIn, claudeDirIn } from '../src/paths.js'

// Built with join(), never written as literals: a hardcoded '/h/.claude' is a
// POSIX assumption, and these ran red on Windows for exactly that reason.

test('the stores follow the variables the agents themselves honour', () => {
  // ~/.local/share is a DEFAULT, not a rule. It is the XDG fallback and it is
  // what almost everyone has, which is exactly why hardcoding it passes every
  // test on one laptop and finds nothing on someone else's. Reported by a real
  // user on Linux, whose screen was simply empty.
  const H = join('/h')
  const plain = storesIn(H, {})
  assert.equal(plain.claude, join(H, '.claude', 'projects'))
  assert.equal(plain.codex, join(H, '.codex', 'sessions'))
  assert.equal(plain.opencode, join(H, '.local', 'share', 'opencode', 'storage'))

  const moved = storesIn(H, { XDG_DATA_HOME: join('/x'), CLAUDE_CONFIG_DIR: join('/c') })
  assert.equal(moved.opencode, join('/x', 'opencode', 'storage'), 'opencode follows XDG_DATA_HOME')
  assert.equal(moved.claude, join('/c', 'projects'), 'and Claude Code follows CLAUDE_CONFIG_DIR')
  assert.equal(moved.codex, join(H, '.codex', 'sessions'), 'codex documents ~/.codex and stays there')
})

test('a relative or empty override is ignored, not obeyed', () => {
  // A variable set to a relative path would put the store somewhere that moves
  // with the working directory, which is worse than the default it replaced.
  for (const bad of ['', '   ', join('relative', 'path'), undefined]) {
    assert.equal(storesIn(join('/h'), { XDG_DATA_HOME: bad }).opencode,
      join('/h', '.local', 'share', 'opencode', 'storage'))
    assert.equal(claudeDirIn(join('/h'), { CLAUDE_CONFIG_DIR: bad }), join('/h', '.claude'))
  }
})

test('the resolver is shared, so the fixture and the reader cannot disagree', () => {
  // tools/sandbox.mjs builds its world through this same function. It used to
  // hardcode ~/.local/share while skein had learned to honour XDG_DATA_HOME --
  // the identical duplication, one layer down, which would have made the
  // sandbox silently test nothing.
  const env = { XDG_DATA_HOME: join('/x'), CLAUDE_CONFIG_DIR: join('/c') }
  assert.deepEqual(storesIn(join('/h'), env), storesIn(join('/h'), env), 'same inputs, same answer')
})
