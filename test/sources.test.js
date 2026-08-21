import test from 'node:test'
import assert from 'node:assert/strict'
import { bashTargets, bashCwd, stripHeredocs } from '../src/sources/bash.js'
import * as claude from '../src/sources/claude.js'
import * as codex from '../src/sources/codex.js'
import { parsePart } from '../src/sources/opencode.js'
import { join } from 'node:path'

const jl = (...objs) => objs.map(o => JSON.stringify(o))

test('bash: heredoc bodies are not scanned for redirects', () => {
  const cmd = [`cat > src/x.js <<'EOF'`, `const n = a.at > c.at ? 1 : 2`, `EOF`, `sed -i '' s/a/b/ README.md`].join('\n')
  assert.deepEqual(bashTargets(cmd).sort(), ['README.md', 'src/x.js'])
})

test('bash: a cd sets the base for relative writes', () => {
  assert.equal(bashCwd('cd /repo/b && cat > src/x.ts <<EOF'), '/repo/b')
  assert.equal(bashCwd('echo hi'), null)
})

test('bash: read-only commands write nothing', () => {
  assert.deepEqual(bashTargets('cat README.md | grep foo | head -5'), [])
  assert.deepEqual(bashTargets('sed -n 1,5p file.txt'), [])
})

test('bash: /dev and flags are never files', () => {
  assert.deepEqual(bashTargets('foo > /dev/null 2>&1'), [])
})

test('stripHeredocs keeps the opening line', () => {
  assert.match(stripHeredocs(`cat > a.txt <<'E'\nbody > b.txt\nE`), /cat > a.txt/)
  assert.doesNotMatch(stripHeredocs(`cat > a.txt <<'E'\nbody > b.txt\nE`), /b\.txt/)
})

test('claude: all three capture paths, subagents excluded', () => {
  const lines = jl(
    { type: 'user', cwd: '/repo', gitBranch: 'main', timestamp: '2026-08-01T00:00:00Z' },
    { type: 'file-history-delta', trackingPath: '/repo/a.ts', timestamp: '2026-08-01T00:01:00Z' },
    { timestamp: '2026-08-01T00:02:00Z', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/b.ts' } }] } },
    { timestamp: '2026-08-01T00:03:00Z', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cat > src/c.ts <<EOF' } }] } },
    { isSidechain: true, timestamp: '2026-08-01T00:04:00Z', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'sub.ts' } }] } },
  )
  const { events, meta } = claude.parse(lines, { session: 's1' })
  assert.deepEqual(events.map(e => e.path),
    ['/repo/a.ts', join('/repo', 'src/b.ts'), join('/repo', 'src/c.ts')])
  assert.deepEqual(events.map(e => e.via), ['delta', 'tool', 'bash'])
  assert.equal(meta.branch, 'main')
})

test('claude: a cd inside a bash command files the edit under the right repo', () => {
  const lines = jl(
    { type: 'user', cwd: '/repo-a', timestamp: '2026-08-01T00:00:00Z' },
    { timestamp: '2026-08-01T00:01:00Z', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cd /repo-b && cat > src/x.ts <<EOF' } }] } },
  )
  assert.equal(claude.parse(lines, { session: 's' }).events[0].path, join('/repo-b', 'src/x.ts'))
})

test('codex: patch_apply_end yields one event per changed path, with kind', () => {
  const lines = jl({
    timestamp: '2026-08-01T00:00:00Z', type: 'event_msg',
    payload: { type: 'patch_apply_end', changes: { '/r/a.ts': { type: 'update' }, '/r/b.ts': { type: 'add' } } },
  })
  const { events } = codex.parse(lines, { session: 'c1' })
  assert.deepEqual(events.map(e => [e.path, e.kind]), [['/r/a.ts', 'edit'], ['/r/b.ts', 'add']])
})

test('codex: branch and title are absent, never invented', () => {
  const { meta } = codex.parse(jl({ timestamp: '2026-08-01T00:00:00Z', payload: { type: 'turn_context', cwd: '/r' } }), { session: 'c' })
  assert.equal(meta.branch, null)
})

test('opencode: writes count, reads do not', () => {
  const edit = { type: 'tool', tool: 'edit', sessionID: 's', state: { status: 'completed', input: { filePath: '/r/a.ts' }, time: { start: 5 } } }
  assert.equal(parsePart(JSON.stringify(edit), {}).path, '/r/a.ts')
  assert.equal(parsePart(JSON.stringify({ ...edit, tool: 'read' }), {}), null)
})

test('readers never throw on malformed lines', () => {
  assert.doesNotThrow(() => claude.parse(['{bad json', '', 'null'], { session: 's' }))
  assert.doesNotThrow(() => codex.parse(['{bad', 'null'], { session: 's' }))
  assert.equal(parsePart('not json', {}), null)
})

test('session ids survive both path separators', () => {
  assert.equal(claude.sessionIdFromPath('/a/b/8a524e3c.jsonl'), '8a524e3c')
  assert.equal(claude.sessionIdFromPath('C:\\Users\\x\\.claude\\projects\\p\\8a524e3c.jsonl'.replace(/\\/g, '/')), '8a524e3c')
  assert.equal(codex.sessionIdFromPath('/a/rollout-2026-07-27T12-42-36-019fa1e1.jsonl'), '2026-07-27T12-42-36-019fa1e1')
})

test('a Windows absolute path is not treated as relative', async () => {
  const { abs } = await import('../src/paths.js')
  assert.equal(abs('C:\\repo\\src\\a.ts', '/other'), 'C:\\repo\\src\\a.ts')
  assert.equal(abs('/repo/a.ts', '/other'), '/repo/a.ts')
})
