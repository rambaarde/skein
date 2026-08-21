import test from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, run } from '../src/cli.js'
import { render } from '../src/tui.js'
import { tierFor } from '../src/symbols.js'

test('durations parse, and a bad one is a structured error, never a prompt', () => {
  assert.equal(parseArgs(['--since', '24h']).since, 86_400_000)
  assert.equal(parseArgs(['--since', '90m']).since, 5_400_000)
  assert.match(parseArgs(['--since', 'soon']).error, /duration/)
  assert.match(parseArgs(['--nope']).error, /unknown option/)
})

test('a TUI is for a tty; anything piped gets text', () => {
  assert.equal(run([], { tty: true }).tui, true)
  assert.equal(run([], { tty: false }).tui, undefined)
})

test('--json and --toon never open a TUI, even on a tty', () => {
  assert.equal(run(['--json'], { tty: true }).tui, undefined)
  assert.equal(run(['--toon'], { tty: true }).tui, undefined)
})

test('an unknown command exits non-zero and says what to try', () => {
  const r = run(['nonsense'], { tty: false })
  assert.equal(r.code, 1)
  assert.match(r.err, /--help/)
})

test('--help works without touching the filesystem', () => {
  const r = run(['--help'], { tty: false })
  assert.equal(r.code, 0)
  assert.match(r.text, /never starts, stops, routes or blocks/)
})

test('the hook is silent when there is nobody else', () => {
  const r = run(['hook'], { cwd: '/nonexistent-repo-xyz', tty: false })
  assert.equal(r.code, 0)
  assert.equal(r.text, '')
})

test('empty states are stated, never silent stdout', () => {
  const r = run(['collisions', '--since', '1m'], { cwd: '/nonexistent-repo-xyz', tty: false })
  assert.match(r.text, /0 collisions|no collisions/)
})

test('render fits the terminal it is given and never wraps', () => {
  const state = {
    projects: [{ name: 'skein', root: '/r', agents: ['claude'], sessions: 1, files: 2, events: [{ at: Date.now(), session: 's', agent: 'claude' }], last: Date.now() }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: tierFor(),
    since: Date.now() - 86_400_000, now: Date.now(), lookback: '24h', windowMin: 30,
  }
  for (const cols of [60, 80, 120, 200]) {
    const lines = render(state, { cols, rows: 20 }).split('\n')
    assert.equal(lines.length, 20, `rows at ${cols}`)
    for (const l of lines) {
      const plain = l.replace(/\x1b\[[0-9;]*m/g, '')
      assert.equal([...plain].length, Math.max(50, cols), `width at ${cols}`)
    }
  }
})

test('D13 — both doors count the same things', async () => {
  // The CLI once counted files the TUI filtered as noise, so the same question
  // got two different answers depending on which door you asked through.
  const { collect } = await import('../src/sources/index.js')
  const { isNoise } = await import('../src/collide.js')
  const { byProject } = await import('../src/project.js')
  const since = Date.now() - 86_400_000
  const { events } = collect({ sinceMs: since })
  const filtered = events.filter(e => e.at >= since && !isNoise(e.path))
  const viaTui = [...byProject(filtered).values()].reduce((n, p) => n + p.events.length, 0)
  const viaCli = JSON.parse(run(['ls', '--json', '--since', '24h'], { tty: false }).text)
    .reduce((n, r) => n + r.edits, 0)
  assert.equal(viaCli, viaTui)
})

test('an empty result says what it was scoped to', () => {
  const r = run(['collisions', '--since', '1m'], { cwd: process.cwd(), tty: false })
  assert.match(r.text, /0 collisions/)
})
