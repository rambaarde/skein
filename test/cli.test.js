import test from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, run } from '../src/cli.js'
import { render } from '../src/tui.js'
import { tierFor } from '../src/symbols.js'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  // Expanded, filtered and collision states all add rows the plain case does
  // not: the geometry has to hold in every one of them, not just at rest.
  for (const cols of [60, 70, 80, 96, 120, 200]) {
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

test('geometry holds when a project is expanded', async () => {
  // It did not: the nested session row budgeted two columns too many, so the
  // right border stepped out one place every time you pressed enter.
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const events = [{ session: 's1', at: now, agent: 'claude', path: '/r/a.ts', kind: 'edit', project: '/r' }]
  const state = {
    projects: [{ name: 'atlas-web', root: '/r', agents: ['claude'], sessions: 1, files: 4, events, last: now }],
    sessions: new Map([['s1', { agent: 'claude', branch: 'main', title: 'Fix the flaky cart test', first: 0, last: now }]]),
    sel: 0, expanded: new Set(['/r']), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }
  for (const cols of [60, 70, 80, 96, 120, 200]) {
    for (const l of render(state, { cols, rows: 20 }).split('\n')) {
      const plain = l.replace(/\x1b\[[0-9;]*m/g, '')
      assert.equal([...plain].length, Math.max(50, cols), `expanded row at ${cols} cols`)
    }
  }
})

test('a row can never push the border off the frame', async () => {
  const { box, width } = await import('../src/box.js')
  const b = box({ w: 40, title: 't', state: 's' })
  const huge = 'x'.repeat(200)
  assert.equal(width(b.row(huge)), 40, 'an over-long row must be truncated, not overflow')
  assert.equal(width(b.row('')), 40, 'an empty row must still be padded')
})

test('an empty rollup says where it looked', async () => {
  // Reported by a real user on Linux: an empty screen with no way to tell a
  // bug from an empty machine. The agent door has to answer it too, or the
  // person who pipes skein gets the ambiguous blank instead.
  //
  // A subprocess with a scrubbed HOME, not an in-process call: read against the
  // real machine this asserted that the developer running it had done no agent
  // work in the last minute, which is false exactly while they are working on
  // skein. An empty machine has to be built, not hoped for.
  const home = mkdtempSync(join(tmpdir(), 'skein-empty-'))
  const out = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/skein.js', import.meta.url)), 'ls', '--since', '1m'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_DATA_HOME: join(home, 'data'), XDG_CONFIG_HOME: join(home, 'config'), CLAUDE_CONFIG_DIR: join(home, 'claude'), SKEIN_HOME: join(home, 'state') },
  })
  assert.equal(out.status, 0, 'nothing found is not an error')
  assert.match(out.stdout, /0 projects/)
  for (const agent of ['claude', 'codex', 'opencode']) assert.match(out.stdout, new RegExp(agent))
  assert.match(out.stdout, /XDG_DATA_HOME/)
})

test('doctor says what was in the files, not just that they exist', async () => {
  // Several rounds were spent guessing at a user's empty screen from
  // photographs. probe() says a store exists and holds files; that was enough
  // to prove the program was not broken and not enough to say why it was
  // empty. This opens the newest sessions and reports what came out.
  const { run } = await import('../src/cli.js')
  const out = run(['doctor', '--since', '30d'])
  assert.equal(out.code, 0, 'a diagnosis is never an error')
  for (const agent of ['claude', 'codex', 'opencode']) assert.match(out.text, new RegExp(agent))
  assert.match(out.text, /records read|not found/, 'it reports what it read, per store')
  // The histogram is what catches an agent renaming the record skein reads:
  // it turns an empty dashboard into a type nobody recognises.
  assert.match(out.text, /saw:|not found/, 'and which kinds of record it saw')
  assert.match(out.text, /changed its format/, 'with the reason that matters said out loud')
})

test('a metric is defined in every door, or in none', async () => {
  // D13, applied to the definitions rather than the numbers: a term explained
  // only on the TUI's overlay is a term the person piping skein never reads,
  // and the agent consuming --json never reads at all.
  const { GLOSSARY } = await import('../src/glossary.js')
  const { render } = await import('../src/tui.js')
  const text = run(['glossary']).text
  const json = JSON.parse(run(['glossary', '--json']).text)
  const overlay = render({
    projects: [], events: [], sessions: new Map(), sel: 0, expanded: new Set(), colls: [],
    tier: 'braille', since: Date.now() - 86_400_000, now: Date.now(), lookback: '24h',
    windowMin: 30, tick: 0, sort: 'recent', filter: '', onlyColliding: false,
    preset: 0, tab: 0, feedTop: 0, page: null, help: 2,
  }, { cols: 120, rows: 40 }).replace(/\x1b\[[0-9;]*m/g, '')

  assert.match(overlay, /metrics/, 'the overlay has a metrics page')
  for (const [term] of GLOSSARY.filter(([t]) => t)) {
    assert.ok(text.includes(term), `${term} is in the CLI door`)
    assert.ok(json.some(r => r.term === term), `${term} is in the json door`)
    assert.ok(overlay.includes(term), `${term} is in the TUI door`)
  }
  // And the definitions that carry the number people will compare to others.
  assert.match(text, /0-15% elite and high, 16-30% medium/)
  assert.match(text, /newest can never be judged/)
})
