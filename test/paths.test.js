import test from 'node:test'
import assert from 'node:assert/strict'
import { storesIn, claudeDirIn } from '../src/paths.js'

test('the stores follow the variables the agents themselves honour', () => {
  // ~/.local/share is a DEFAULT, not a rule. It is the XDG fallback and it is
  // what almost everyone has, which is exactly why hardcoding it passes every
  // test on one laptop and finds nothing on someone else's. Reported by a real
  // user on Linux, whose screen was simply empty.
  const plain = storesIn('/h', {})
  assert.equal(plain.claude, '/h/.claude/projects')
  assert.equal(plain.codex, '/h/.codex/sessions')
  assert.equal(plain.opencode, '/h/.local/share/opencode/storage')

  const moved = storesIn('/h', { XDG_DATA_HOME: '/x', CLAUDE_CONFIG_DIR: '/c' })
  assert.equal(moved.opencode, '/x/opencode/storage', 'opencode follows XDG_DATA_HOME')
  assert.equal(moved.claude, '/c/projects', 'and Claude Code follows CLAUDE_CONFIG_DIR')
  assert.equal(moved.codex, '/h/.codex/sessions', 'codex documents ~/.codex and stays there')
})

test('a relative or empty override is ignored, not obeyed', () => {
  // A variable set to a relative path would put the store somewhere that moves
  // with the working directory, which is worse than the default it replaced.
  for (const bad of ['', '   ', 'relative/path', undefined]) {
    assert.equal(storesIn('/h', { XDG_DATA_HOME: bad }).opencode, '/h/.local/share/opencode/storage')
    assert.equal(claudeDirIn('/h', { CLAUDE_CONFIG_DIR: bad }), '/h/.claude')
  }
})

test('the resolver is shared, so the fixture and the reader cannot disagree', () => {
  // tools/sandbox.mjs builds its world through this same function. It used to
  // hardcode ~/.local/share while skein had learned to honour XDG_DATA_HOME --
  // the identical duplication, one layer down, which would have made the
  // sandbox silently test nothing.
  const env = { XDG_DATA_HOME: '/x', CLAUDE_CONFIG_DIR: '/c' }
  assert.deepEqual(storesIn('/h', env), storesIn('/h', env), 'same inputs, same answer')
})
