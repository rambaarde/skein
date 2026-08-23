import test from 'node:test'
import assert from 'node:assert/strict'
import { toolsOf, totalOf, shape, classify, shortTool } from '../src/tools.js'

const project = (name, sessionIds) => ({
  name,
  events: sessionIds.map(session => ({ session, at: 1, path: `/w/${name}/f.ts`, agent: 'claude' })),
})

test('a project sums the tallies of its own sessions', () => {
  const sessions = new Map([
    ['a', { tools: { Read: 10, Edit: 2 } }],
    ['b', { tools: { Read: 5, Bash: 3 } }],
    ['c', { tools: { Read: 99 } }],          // another project's, must not leak
  ])
  const out = toolsOf(project('p', ['a', 'b', 'a']), sessions)
  assert.deepEqual(out, [{ tool: 'Read', n: 15 }, { tool: 'Bash', n: 3 }, { tool: 'Edit', n: 2 }])
  assert.equal(totalOf(out), 20)
})

test('a tie keeps a stable order', () => {
  // Two tools on the same count must not swap places between frames, or the
  // pane looks like it is churning when nothing has happened.
  const sessions = new Map([['a', { tools: { Write: 4, Bash: 4, Read: 4 } }]])
  const out = toolsOf(project('p', ['a']), sessions).map(t => t.tool)
  assert.deepEqual(out, ['Bash', 'Read', 'Write'], 'alphabetical inside a tie')
})

test('a session with no tally contributes nothing rather than throwing', () => {
  // Sessions parsed by an older cache version have no tools field at all.
  const sessions = new Map([['a', { agent: 'claude' }], ['b', { tools: { Read: 1 } }]])
  assert.deepEqual(toolsOf(project('p', ['a', 'b']), sessions), [{ tool: 'Read', n: 1 }])
  assert.deepEqual(toolsOf(project('p', ['a']), sessions), [], 'and an empty list, not a zero row')
  assert.deepEqual(toolsOf(null, sessions), [])
  assert.deepEqual(toolsOf(project('p', ['a']), null), [])
})

test('tools are classified by what they do to the repo', () => {
  // The read:write ratio is the point: it separates a session that was
  // building from one that was working out what to build.
  for (const t of ['Read', 'Grep', 'Glob', 'WebFetch', 'web_search', 'list']) {
    assert.equal(classify(t), 'read', t)
  }
  for (const t of ['Edit', 'Write', 'MultiEdit', 'apply_patch', 'NotebookEdit']) {
    assert.equal(classify(t), 'write', t)
  }
  for (const t of ['Bash', 'exec', 'shell']) assert.equal(classify(t), 'run', t)
})

test('an unrecognised tool is other, never quietly filed as run', () => {
  // Folding an unknown into one of the three would make the ratio wrong in a
  // way nobody could see. 'other' is visible.
  assert.equal(classify('Task'), 'other')
  assert.equal(classify('mcp__something__weird'), 'other')
  const s = shape([{ tool: 'Read', n: 6 }, { tool: 'Edit', n: 2 }, { tool: 'Bash', n: 1 }, { tool: 'Task', n: 1 }])
  assert.deepEqual(s, { read: 6, write: 2, run: 1, other: 1 })
  assert.equal(s.read + s.write + s.run + s.other, 10, 'every call is counted exactly once')
})

test('the claude reader tallies every tool call, subagents included', async () => {
  // Edits from a subagent must not collide with its parent's, which is why the
  // reader skips sidechain lines. Its tool CALLS are work the parent caused,
  // and counting only the parent's own would understate what it did.
  const { parse } = await import('../src/sources/claude.js')
  const call = (name, extra = {}) => JSON.stringify({
    timestamp: '2026-08-22T10:00:00Z', cwd: '/w/p', ...extra,
    message: { content: [{ type: 'tool_use', name, input: { file_path: '/w/p/f.ts' } }] },
  })
  const { meta } = parse([
    call('Read'), call('Read'), call('Edit'), call('Bash'),
    call('Grep', { isSidechain: true }),
  ], { session: 's' })
  assert.deepEqual(meta.tools, { Read: 2, Edit: 1, Bash: 1, Grep: 1 })
})

test('the codex reader reads tool names off the rollout', async () => {
  // Verified against real sessions: codex records a call as custom_tool_call
  // carrying .name, and states a patch and a web search as their own types.
  const { parse } = await import('../src/sources/codex.js')
  const line = payload => JSON.stringify({ timestamp: '2026-08-22T10:00:00Z', payload })
  const { meta } = parse([
    line({ type: 'custom_tool_call', name: 'exec' }),
    line({ type: 'custom_tool_call', name: 'exec' }),
    line({ type: 'function_call', name: 'read_file' }),
    line({ type: 'web_search_end' }),
    line({ type: 'patch_apply_end', changes: { '/w/p/f.ts': { type: 'update' } } }),
    line({ type: 'reasoning' }),
  ], { session: 's' })
  assert.deepEqual(meta.tools, { exec: 2, read_file: 1, web_search: 1, apply_patch: 1 })
})

test('an opencode part reports its tool whether or not it wrote anything', async () => {
  const { toolOf, parsePart } = await import('../src/sources/opencode.js')
  const part = (tool, status = 'completed') => JSON.stringify({
    type: 'tool', tool, sessionID: 's', state: { status, time: { start: 5 }, input: { filePath: '/w/p/f.ts' } },
  })
  assert.deepEqual(toolOf(part('grep')), { session: 's', tool: 'grep', at: 5 })
  assert.equal(parsePart(part('grep'), { file: 'x' }), null, 'but it is still not an edit')
  assert.equal(toolOf(part('grep', 'running')), null, 'an incomplete call is not a call yet')
  assert.equal(toolOf('not json'), null)
  assert.equal(toolOf(JSON.stringify({ type: 'text' })), null)
})

test('an MCP tool is classified by its own name, not its server', () => {
  // MCP tools arrive namespaced — mcp__plugin_trueline-mcp_mcp__trueline_read
  // — so a pattern anchored at the start of the whole name never matched one,
  // and every MCP call landed in 'other'. On a machine that reads and edits
  // through an MCP server that is most of the session, and it made the
  // read:write ratio describe the wrong thing entirely.
  assert.equal(classify('mcp__plugin_trueline-mcp_mcp__trueline_read'), 'read')
  assert.equal(classify('mcp__plugin_trueline-mcp_mcp__trueline_edit'), 'write')
  assert.equal(classify('mcp__x__trueline_search'), 'read')
  assert.equal(classify('mcp__x__trueline_outline'), 'read')
  assert.equal(shortTool('mcp__plugin_x_mcp__trueline_edit'), 'trueline_edit', 'the server is not the tool')
  assert.equal(shortTool('Bash'), 'Bash', 'an unnamespaced tool is left alone')
})

test('a verb must be the whole word, not a prefix of one', () => {
  // Without a boundary `^edit` matches `editorconfig` and a config file
  // becomes a write.
  assert.equal(classify('editorconfig'), 'other')
  assert.equal(classify('readme'), 'other')
  assert.equal(classify('Edit'), 'write')
  assert.equal(classify('Read'), 'read')
  assert.equal(classify('NotebookEdit'), 'write')
  assert.equal(classify('MultiEdit'), 'write')
})

test('a session open in a project contributes its tool calls', async () => {
  // A real session: 524 tool calls, 4 edits, and those edits belonged to a
  // NESTED repo -- so the project it was actually working in had no session by
  // the events map, and the pane read "no tool calls recorded" against 524 of
  // them. Reads outnumber writes several to one, which is the whole reason the
  // pane exists, so it must not be reachable only through writing.
  const { toolsOf, totalOf, shape } = await import('../src/tools.js')
  const sessions = new Map([
    ['wrote', { tools: { Edit: 2 } }],
    ['open-only', { tools: { Read: 40, Bash: 10 } }],
    ['elsewhere', { tools: { Read: 999 } }],
  ])
  const project = {
    events: [{ session: 'wrote', path: '/w/p/a.ts' }],
    open: [{ session: 'open-only' }, { session: 'wrote' }],
  }
  const rolled = toolsOf(project, sessions)
  assert.equal(totalOf(rolled), 52, 'both routes, and neither counted twice')
  assert.deepEqual(shape(rolled), { read: 40, write: 2, run: 10, other: 0 })
  assert.equal(rolled.find(t => t.tool === 'Read')?.n, 40)
  // A session in some other project is never borrowed.
  assert.equal(rolled.some(t => t.n === 999), false)

  // And a project with no `open` at all still works -- every other caller
  // passes one built from events only.
  assert.equal(totalOf(toolsOf({ events: project.events }, sessions)), 2)
})
