import test from 'node:test'
import assert from 'node:assert/strict'
import { TIERS, graph, gradient, tierFor } from '../src/symbols.js'
import { toon, ago, table } from '../src/format.js'
import { box, fit, width } from '../src/box.js'

test('the braille table is btop\'s, exactly', () => {
  assert.deepEqual(TIERS.braille.up,
    [' ', '⢀', '⢠', '⢰', '⢸', '⡀', '⣀', '⣠', '⣰', '⣸', '⡄', '⣄', '⣤', '⣴', '⣼', '⡆', '⣆', '⣦', '⣶', '⣾', '⡇', '⣇', '⣧', '⣷', '⣿'])
})

test('every tier is the same 25-entry shape, so the renderer never branches', () => {
  for (const [name, t] of Object.entries(TIERS)) {
    assert.equal(t.up.length, 25, name)
    assert.equal(t.down.length, 25, name)
  }
})

test('a graph packs two samples per cell', () => {
  const rows = graph(Array(40).fill(1), { width: 20, rows: 1, tier: 'braille' })
  assert.equal(rows.length, 1)
  assert.equal([...rows[0]].length, 20)      // 40 samples -> 20 cells
})

test('stacked rows give 4 levels each', () => {
  const top = graph([...Array(8).fill(0.1)], { width: 4, rows: 3 })
  assert.equal(top.length, 3)
  assert.equal(top[0].trim(), '')            // a low series leaves the top row empty
})

test('gradients are 101-entry lookup tables', () => {
  const lut = gradient('#000000', '#808080', '#ffffff')
  assert.equal(lut.length, 101)
  assert.match(lut[0], /38;2;0;0;0/)
  assert.match(lut[100], /38;2;255;255;255/)
})

test('the tier degrades without unicode', () => {
  assert.equal(tierFor({ TERM: 'xterm-256color', LANG: 'en_US.UTF-8' }), 'braille')
  assert.equal(tierFor({ TERM: 'xterm', LANG: 'C' }), 'block')
  assert.equal(tierFor({ TERM: 'dumb' }), 'tty')
})

test('toon states its own length and fields', () => {
  const out = toon('projects', [{ a: 1, b: 'x' }, { a: 2, b: 'y,z' }], ['a', 'b'])
  assert.equal(out.split('\n')[0], 'projects[2]{a,b}:')
  assert.match(out, /"y,z"/)                 // commas are quoted, never ambiguous
})

test('an empty toon list is still a definitive statement', () => {
  assert.equal(toon('projects', [], ['a']), 'projects[0]{a}:')
})

test('the border carries title and state, costing no interior row', () => {
  const b = box({ w: 40, title: 'skein', state: '3 projects' })
  assert.equal(width(b.top), 40)
  assert.equal(width(b.bottom), 40)
  assert.equal(width(b.row('hi')), 40)
  assert.match(b.top, /skein/)
  assert.match(b.bottom, /3 projects/)
})

test('fit pads and truncates to an exact width, ignoring colour', () => {
  assert.equal(fit('abc', 6), 'abc   ')
  assert.equal(fit('abcdefgh', 4), 'abc…')
  assert.equal(width(fit('\x1b[2mabc\x1b[0m', 6)), 6)
})

test('ago is stable and coarse', () => {
  const now = 1_000_000_000_000
  assert.equal(ago(now - 30_000, now), '30s')
  assert.equal(ago(now - 120_000, now), '2m')
  assert.equal(ago(now - 7_200_000, now), '2h')
  assert.equal(ago(now - 172_800_000, now), '2d')
})

test('a quiet hour is still visible beside a busy one', async () => {
  // The bug this guards: linear normalisation against the peak rendered one
  // edit next to fifty as 0.02, which rounds to nothing. Every hour except the
  // busiest drew blank, and the chart looked like scattered dust.
  const { render } = await import('../src/tui.js')
  const now = 1_700_000_000_000
  const since = now - 86_400_000
  const at = frac => since + Math.floor((now - since) * frac)
  const events = [
    ...Array.from({ length: 50 }, () => ({ at: at(0.5), session: 's', agent: 'claude', path: '/r/a.ts' })),
    { at: at(0.1), session: 's', agent: 'claude', path: '/r/b.ts' },   // a single edit
  ]
  const state = {
    projects: [{ name: 'r', root: '/r', agents: ['claude'], sessions: 1, files: 2, events, last: now }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since, now, lookback: '24h', windowMin: 30, tick: 0,
  }
  const lines = render(state, { cols: 120, rows: 20 }).split('\n')
  const row = lines.find(l => l.includes('▸')) ?? ''
  const marks = [...row.replace(/\x1b\[[0-9;]*m/g, '')].filter(c => c >= '⠁' && c <= '⣿')
  assert.ok(marks.length >= 2, `the lone edit should still draw a mark, got ${marks.length}`)
})

test('the pulse advances so a still screen reads as a live one', async () => {
  const { render } = await import('../src/tui.js')
  const base = {
    projects: [], sessions: new Map(), sel: 0, expanded: new Set(), colls: [],
    tier: 'braille', since: 0, now: 1, lookback: '24h', windowMin: 30,
  }
  const a = render({ ...base, tick: 0 }, { cols: 80, rows: 16 })
  const b = render({ ...base, tick: 1 }, { cols: 80, rows: 16 })
  assert.notEqual(a, b, 'consecutive ticks must differ')
})

test('the demo frame contains nothing from the machine that renders it', async () => {
  // The README screenshot once carried real client project names into a public
  // repo and into every npm tarball. This asserts the demo generator is
  // self-contained: same bytes on any machine, and no real path in them.
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const script = fileURLToPath(new URL('../docs/demo-frame.mjs', import.meta.url))
  const once = execFileSync(process.execPath, [script], { encoding: 'utf8' })
  const twice = execFileSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(once, twice, 'the demo must be deterministic')
  assert.doesNotMatch(once, /\/Users\/|\/home\/|C:\\Users/, 'a real path leaked into the demo')
  assert.match(once, /atlas-api/, 'the invented projects should be there')
})

test('a COLLISIONS header never appears with no room for a row', async () => {
  const { render } = await import('../src/tui.js')
  const now = 1_700_000_000_000
  const ev = (session, at) => ({ session, at, agent: 'claude', path: '/r/x.ts', kind: 'edit', project: '/r' })
  const events = [ev('a', now - 600_000), ev('b', now - 300_000)]
  const colls = [{ path: '/r/x.ts', project: '/r', a: events[0], b: events[1], gapMin: 5, at: now - 600_000 }]
  const state = {
    projects: [{ name: 'r', root: '/r', agents: ['claude'], sessions: 2, files: 1, events, last: now }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls, tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }
  for (const rows of [12, 14, 16, 20, 30]) {
    const out = render(state, { cols: 100, rows })
    if (out.includes('COLLISIONS')) {
      const after = out.split('\n').slice(out.split('\n').findIndex(l => l.includes('COLLISIONS')) + 1)
      assert.ok(after.some(l => l.includes('x.ts')), `header with no row at rows=${rows}`)
    }
  }
})

test('the TUI boots without throwing', async () => {
  // It did not, once: the refresh scheduler was called a few lines above where
  // it was declared, so `skein` crashed on launch with a temporal-dead-zone
  // ReferenceError. Every unit test passed, because none of them started it.
  const { start } = await import('../src/tui.js')
  const { PassThrough } = await import('node:stream')
  const out = new PassThrough(); out.columns = 100; out.rows = 24; out.isTTY = true
  const inp = new PassThrough(); inp.isTTY = true; inp.setRawMode = () => {}
  let painted = ''
  out.on('data', d => { painted += d.toString() })
  assert.doesNotThrow(() => start({ stdout: out, stdin: inp }))
  await new Promise(r => setTimeout(r, 50))
  assert.match(painted, /skein/, 'the first frame should have been painted')
  assert.match(painted, /\x1b\[\?1049h/, 'it should switch to the alternate screen')
})

test('keys are handled without throwing', async () => {
  const { start } = await import('../src/tui.js')
  const { PassThrough } = await import('node:stream')
  const out = new PassThrough(); out.columns = 100; out.rows = 24; out.isTTY = true
  const inp = new PassThrough(); inp.isTTY = true; inp.setRawMode = () => {}
  out.resume()
  start({ stdout: out, stdin: inp })
  await new Promise(r => setTimeout(r, 30))
  // every key except the ones that quit
  for (const k of ['j', 'k', '\r', ' ', 's', 'c', 'a', 'w', 'r', 'g', 'G', '?', 'x']) {
    assert.doesNotThrow(() => inp.write(k), `key ${JSON.stringify(k)} threw`)
  }
  // the filter is a mode: type into it, backspace, then escape out
  inp.write('/'); for (const c of 'atlas') inp.write(c)
  inp.write('\x7f'); inp.write('\x1b')
  await new Promise(r => setTimeout(r, 30))
})

test('the border carries a clock, and it advances', async () => {
  // btop's data interval is 2000ms — the same as ours — and it still feels
  // alive, because it repaints every second and stamps the time in its border.
  // A screen that never changes cannot be told apart from a crashed one.
  const { render } = await import('../src/tui.js')
  const base = {
    projects: [], sessions: new Map(), sel: 0, expanded: new Set(), colls: [],
    tier: 'braille', since: 0, lookback: '24h', windowMin: 30, tick: 0,
  }
  const at = t => render({ ...base, now: t }, { cols: 100, rows: 16 }).replace(/\x1b\[[0-9;]*m/g, '')
  const t0 = Date.parse('2026-08-22T11:52:30Z')
  assert.match(at(t0), /\d\d:\d\d:\d\d/, 'no clock in the border')
  const [a, b] = [at(t0), at(t0 + 1000)]
  assert.notEqual(a, b, 'the clock must advance with the second')
})

test('controls hang off the border showing their current value', async () => {
  const { render } = await import('../src/tui.js')
  const state = {
    projects: [], sessions: new Map(), sel: 0, expanded: new Set(), colls: [],
    tier: 'braille', since: 0, now: 1, lookback: '7d', windowMin: 30, tick: 0,
    sort: 'edits', filter: '', onlyColliding: false,
  }
  const plain = render(state, { cols: 110, rows: 16 }).replace(/\x1b\[[0-9;]*m/g, '')
  // btop brackets these with ┘…└; copied faithfully they rendered as detached
  // ticks in fonts that do not join box-drawing to a rule. Same idea, plain
  // glyphs: highlighted key, dim label, middle-dot separated.
  assert.match(plain, /s edits/, 'the sort tag should show the ACTIVE sort')
  assert.match(plain, /a 7d/, 'the window tag should show the ACTIVE window')
  assert.match(plain, /\? keys/)
  assert.doesNotMatch(plain, /[┘└]/, 'no box-drawing brackets in the control row')
})

test('btop theme files are read as-is', async () => {
  const { parseTheme, buildTheme } = await import('../src/theme.js')
  // The literal format btop ships, including the transparent-background
  // convention: an empty main_bg means "inherit the terminal".
  const t = parseTheme(`# a comment
theme[main_bg]=""
theme[main_fg]="#cfc9c2"
theme[selected_bg]="#414868"
theme[cpu_start]="#9ece6a"
theme[cpu_mid]="#e0af68"
theme[cpu_end]="#f7768e"
not a theme line at all`)
  assert.equal(t.main_bg, '')
  assert.equal(t.main_fg, '#cfc9c2')
  assert.equal(Object.keys(t).length, 6)
})

test('an unknown theme falls back to the terminal rather than failing', async () => {
  const { buildTheme } = await import('../src/theme.js')
  const t = buildTheme('no-such-theme-anywhere')
  assert.equal(t.name, null)
  // The default is opaque now — btop's look out of the box — so the fallback
  // paints black rather than nothing. --transparent is the way back.
  assert.match(t.surface, /48;2;0;0;0/, 'the fallback paints the default background')
  assert.equal(t.activity.length, 101, 'it still needs a gradient')
})

test('a theme changes what is drawn', async () => {
  const { setTheme, listThemes } = await import('../src/theme.js')
  const { render } = await import('../src/tui.js')
  const available = listThemes()
  if (!available.length) return    // btop not installed on this runner
  const now = Date.now()
  const state = () => ({
    projects: [{ name: 'a', root: '/r', agents: ['claude'], sessions: 1, files: 1,
                 events: [{ at: now, session: 's', agent: 'claude', path: '/r/a.ts' }], last: now }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  })
  setTheme(null)
  const plainRun = render(state(), { cols: 90, rows: 12 })
  setTheme(available[0].name)
  const themed = render(state(), { cols: 90, rows: 12 })
  setTheme(null)                                   // leave the suite as we found it
  assert.notEqual(plainRun, themed, 'the theme should have changed the output')
  const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '')
  assert.equal(strip(plainRun), strip(themed), 'but only the colour, never the layout')
})

test('the layout fills the terminal instead of padding a fixed split', async () => {
  // Before: the list box took a fixed ~65% whether it held three projects or
  // thirty, so a normal machine drew seven rows and thirteen blank ones — and
  // a mostly-empty screen reads as frozen however fast the clock ticks.
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const ev = (i) => ({ session: `s${i % 3}`, at: now - i * 60_000, agent: 'claude', path: `/r/f${i}.ts`, kind: 'edit', project: '/r' })
  const events = Array.from({ length: 40 }, (_, i) => ev(i))
  const state = {
    events,
    projects: [{ name: 'r', root: '/r', agents: ['claude'], sessions: 3, files: 40, events, last: now }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }
  for (const rows of [16, 24, 40]) {
    const lines = render(state, { cols: 100, rows }).split('\n')
    assert.equal(lines.length, rows)
    const blank = lines.filter(l => /^.\s+.$/.test(l.replace(/\x1b\[[0-9;]*m/g, ''))).length
    assert.ok(blank < rows / 3, `at ${rows} rows, ${blank} were blank — the screen should be filled`)
  }
})

test('the activity feed is newest-first and deduplicated', async () => {
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const mk = (sess, path, secsAgo) => ({ session: sess, path, at: now - secsAgo * 1000, agent: 'claude', kind: 'edit', project: '/r' })
  const events = [mk('a', '/r/old.ts', 900), mk('a', '/r/new.ts', 5), mk('a', '/r/new.ts', 60)]
  const state = {
    events,
    projects: [{ name: 'r', root: '/r', agents: ['claude'], sessions: 1, files: 2, events, last: now }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }
  // Scoped to the feed by COLUMN, not by line: in the wide layout the detail
  // pane sits beside the feed on the same rows, and it legitimately names the
  // same file because it shows what an agent starting in that repo is told.
  const { layout } = await import('../src/layout.js')
  const cols = 100
  const L = layout(cols, 24)
  const lines = render(state, { cols, rows: 24 }).replace(/\x1b\[[0-9;]*m/g, '').split('\n')
  const feed = lines.map(l => [...l].slice(L.feed.x, L.feed.x + L.feed.w).join('')).join('\n')
  assert.match(feed, /activity/, 'the feed pane should be on screen')
  const newAt = feed.indexOf('new.ts'), oldAt = feed.indexOf('old.ts')
  assert.ok(newAt > -1 && oldAt > -1, 'both files should be listed')
  assert.ok(newAt < oldAt, 'the newer edit must come first')
  assert.equal(feed.split('new.ts').length - 1, 1, 'the same file in one session should appear once in the feed')
})

test('a recent age counts in seconds so it visibly ticks', async () => {
  const { ago } = await import('../src/format.js')
  const now = 1_700_000_000_000
  assert.equal(ago(now - 5_000, now), '5s')
  assert.equal(ago(now - 90_000, now), '90s', 'a minute and a half must still tick, not freeze at 2m')
  assert.equal(ago(now - 300_000, now), '5m')
})

test('the name column is sized to the names, not to the leftover space', async () => {
  // It used to absorb all the slack, which put nine characters of nothing in
  // every row and starved the timeline. btop never leaves a gap it could put
  // data in.
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const mk = name => ({ name, root: `/${name}`, agents: ['claude'], sessions: 1, files: 2,
                        events: [{ at: now, session: 's', agent: 'claude', path: `/${name}/a.ts` }], last: now })
  const state = p => ({
    events: [], projects: p, sessions: new Map(), sel: 0, expanded: new Set(), colls: [],
    tier: 'braille', since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  })
  const shortNames = render(state([mk('a'), mk('b')]), { cols: 120, rows: 12 }).replace(/\x1b\[[0-9;]*m/g, '')
  const longNames = render(state([mk('a-very-long-project-name')]), { cols: 120, rows: 12 }).replace(/\x1b\[[0-9;]*m/g, '')
  const col = s => (s.split('\n').find(l => l.includes('PROJECT') && l.includes('AGENTS')) ?? '').indexOf('AGENTS')
  assert.ok(col(shortNames) < col(longNames), 'short names should give the timeline more room')
})

test('share is drawn as a meter, and collisions get their own column', async () => {
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const ev = n => Array.from({ length: n }, (_, i) => ({ at: now - i * 1000, session: 's', agent: 'claude', path: `/r/f${i}.ts`, project: '/r' }))
  const big = { name: 'big', root: '/big', agents: ['claude'], sessions: 1, files: 9, events: ev(90), last: now }
  const small = { name: 'small', root: '/small', agents: ['claude'], sessions: 1, files: 1, events: ev(10), last: now }
  const colls = [{ path: '/big/f1.ts', project: '/big', a: {}, b: {}, gapMin: 2, at: now }]
  const plain = render({
    events: [], projects: [big, small], sessions: new Map(), sel: 0, expanded: new Set(), colls,
    tier: 'braille', since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }, { cols: 120, rows: 26 }).replace(/\x1b\[[0-9;]*m/g, '').split('\n')
  const bigRow = plain.find(l => l.includes('big')), smallRow = plain.find(l => l.includes('small'))
  assert.ok(bigRow && smallRow, 'both projects should be on screen at 26 rows')
  const filled = s => (s.match(/■/g) ?? []).length
  assert.ok(filled(bigRow) > filled(smallRow), 'the busier project needs a longer bar')
  assert.match(plain.find(l => l.includes('PROJECT')) ?? '', /COLL/, 'collisions should have a column of their own')
})

test('two panes side by side stay exactly aligned', async () => {
  // The whole risk of a 2D layout: if either pane yields a line of the wrong
  // width, every row below drifts one character further out. Assert the
  // invariant directly rather than trusting it.
  const { render } = await import('../src/tui.js')
  const { layout } = await import('../src/layout.js')
  const now = Date.now()
  const events = Array.from({ length: 30 }, (_, i) => ({ session: `s${i % 3}`, at: now - i * 60_000, agent: 'claude', path: `/r/f${i}.ts`, project: '/r' }))
  const projects = Array.from({ length: 6 }, (_, i) => ({ name: `project-${i}`, root: `/r${i}`, agents: ['claude'], sessions: 2, files: 9, events, last: now - i * 90_000 }))
  const state = { events, projects, sessions: new Map(), sel: 1, expanded: new Set(), colls: [],
                  tier: 'braille', since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0 }
  for (const cols of [100, 120, 160, 200]) {
    const L = layout(cols, 26)
    assert.equal(L.wide, true, `${cols} columns should use the two-column layout`)
    const lines = render(state, { cols, rows: 26 }).split('\n')
    assert.equal(lines.length, 26)
    for (const [i, l] of lines.entries()) {
      const plain = l.replace(/\x1b\[[0-9;]*m/g, '')
      assert.equal([...plain].length, cols, `row ${i} at ${cols} cols`)
    }
    // the seam between the two panes must be a border on every lower row
    const seam = L.detail.w
    for (let y = L.detail.y; y < 26; y++) {
      const plain = lines[y].replace(/\x1b\[[0-9;]*m/g, '')
      assert.match([...plain][seam] ?? '', /[│╭╮╰╯]/, `no seam at row ${y}, col ${seam}`)
    }
  }
})

test('a narrow terminal falls back to one column', async () => {
  const { layout } = await import('../src/layout.js')
  assert.equal(layout(80, 24).wide, false)
  assert.equal(layout(99, 24).wide, false)
  assert.equal(layout(100, 24).wide, true)
  // stacked panes must span the full width
  const l = layout(80, 24)
  for (const r of [l.head, l.detail, l.feed]) assert.equal(r.w, 80)
})

test('the pane shows the line an agent would actually be handed', async () => {
  // Thesis §5: the defensible claim is not the chart, it is that an agent can
  // read this. The TUI has to show that, or the product is invisible in its
  // own dashboard.
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const events = [
    { session: 'a', at: now - 4 * 60_000, agent: 'claude', path: '/r/src/auth/middleware.ts', kind: 'edit', project: '/r' },
    { session: 'b', at: now - 60_000, agent: 'codex', path: '/r/src/auth/session.ts', kind: 'edit', project: '/r' },
  ]
  const state = {
    events,
    projects: [{ name: 'atlas-api', root: '/r', agents: ['claude', 'codex'], sessions: 2, files: 2, events, last: now, attention: 300_000 }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }
  const plain = render(state, { cols: 120, rows: 24 }).replace(/\x1b\[[0-9;]*m/g, '')
  assert.match(plain, /what an agent is told here/)
  assert.match(plain, /2 other agents active in this repo/)
  assert.match(plain, /middleware\.ts/)
})

test('when nobody else is here it says so, rather than showing an empty box', async () => {
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const events = [{ session: 'a', at: now - 9 * 3_600_000, agent: 'claude', path: '/r/a.ts', kind: 'edit', project: '/r' }]
  const plain = render({
    events, projects: [{ name: 'r', root: '/r', agents: ['claude'], sessions: 1, files: 1, events, last: now - 9 * 3_600_000, attention: 60_000 }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }, { cols: 120, rows: 24 }).replace(/\x1b\[[0-9;]*m/g, '')
  assert.match(plain, /would be told nothing/)
})

test('the headline metric is time, not a count of edits', async () => {
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  // Same edit count, very different amounts of a day.
  const burst = Array.from({ length: 20 }, (_, i) => ({ session: 'a', at: now - i * 1000, agent: 'claude', path: `/b/f${i}.ts`, project: '/b' }))
  const spread = Array.from({ length: 20 }, (_, i) => ({ session: 'c', at: now - i * 20 * 60_000, agent: 'claude', path: `/s/f${i}.ts`, project: '/s' }))
  const mk = (name, root, events) => ({ name, root, agents: ['claude'], sessions: 1, files: 20, events, last: now })
  const plain = render({
    events: [...burst, ...spread], projects: [mk('burst', '/b', burst), mk('spread', '/s', spread)],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }, { cols: 120, rows: 26 }).replace(/\x1b\[[0-9;]*m/g, '').split('\n')
  const header = plain.find(l => l.includes('PROJECT')) ?? ''
  assert.match(header, /TIME/, 'the column should be TIME')
  // The wide ATTENTION column became a short ATTN sparkline paired with a PEAK
  // percentage — btop's per-core form. The shape moved to the tall strip.
  assert.match(header, /ATTN/, 'the per-project sparkline should still be there')
  assert.match(header, /PEAK/, 'and it must carry a number beside it')
  const bars = l => (l.match(/■/g) ?? []).length
  const burstRow = plain.find(l => l.includes('burst')), spreadRow = plain.find(l => l.includes('spread'))
  assert.ok(bars(spreadRow) > bars(burstRow), 'the same edit count must not give the same share')
})

test('the timeline is stacked by agent, per thesis §6.5', async () => {
  // A single undifferentiated line cannot say whether a project was worked by
  // one agent or two, which is most of what you want to know about a shared
  // repo. R7's mirrored tables carry the second series.
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const mk = (agent, session, offsets) => offsets.map(m => ({ at: now - m * 60_000, session, agent, path: `/r/${agent}.ts`, project: '/r' }))
  const solo = mk('claude', 'a', [10, 12, 14, 16])
  const both = [...mk('claude', 'a', [10, 12, 14, 16]), ...mk('codex', 'b', [40, 42, 44, 46])]
  const state = events => ({
    events,
    projects: [{ name: 'r', root: '/r', agents: [...new Set(events.map(e => e.agent))], sessions: 1, files: 2, events, last: now }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  })
  const row = s => (render(s, { cols: 120, rows: 26 }).replace(/\x1b\[[0-9;]*m/g, '').split('\n').find(l => l.includes('▸')) ?? '')
  // The mirrored form uses dots in the TOP half of the cell, which the
  // bottom-filling single-series form never produces.
  const hasUpper = l => [...l].some(c => c >= '⠁' && c <= '⣿' && (c.codePointAt(0) & 0b1001) !== 0)
  assert.ok(hasUpper(row(state(both))), 'two agents should draw a mirrored pair')
  assert.notEqual(row(state(solo)), row(state(both)), 'one agent and two must not look identical')
})

test('a zero is reported beside a comparison, not on its own', async () => {
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const events = [{ at: now, session: 's', agent: 'claude', path: '/r/a.ts', project: '/r' }]
  const plain = render({
    events, projects: [{ name: 'r', root: '/r', agents: ['claude'], sessions: 1, files: 1, events, last: now }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }, { cols: 120, rows: 24 }).replace(/\x1b\[[0-9;]*m/g, '')
  // "0 collisions" reads as a broken tool; naming the window reads as news.
  assert.match(plain, /no collisions in 24h/)
  assert.doesNotMatch(plain, /· 0 collisions ·/)
})

test('a column must differ between rows to be drawn', async () => {
  // Measured on a real one-agent machine: AGENTS carried one distinct value
  // across seven projects and COLL carried one — two columns of screen width
  // saying nothing, while BRANCH and DOING were captured and never shown.
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const mk = (name, agents, branch) => ({
    name, root: `/${name}`, agents, sessions: 1, files: 3, last: now,
    events: [{ at: now, session: `s-${name}`, agent: agents[0], path: `/${name}/a.ts`, project: `/${name}` }],
  })
  const sess = (name, branch, title) => [`s-${name}`, { agent: 'claude', branch, title, first: 0, last: now }]

  const oneAgent = {
    events: [], colls: [], sel: 0, expanded: new Set(), tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
    projects: [mk('a', ['claude']), mk('b', ['claude'])],
    sessions: new Map([sess('a', 'main', 'Fix the importer'), sess('b', 'develop', 'Rotate the header')]),
  }
  const head = s => (render(s, { cols: 150, rows: 16 }).replace(/\x1b\[[0-9;]*m/g, '').split('\n').find(l => l.includes('PROJECT')) ?? '')

  const h1 = head(oneAgent)
  assert.doesNotMatch(h1, /AGENTS/, 'one agent everywhere is not worth a column')
  assert.doesNotMatch(h1, /COLL/, 'no collisions is not worth a column')
  assert.match(h1, /BRANCH/, 'branch differs, so it earns its place')
  assert.match(h1, /DOING/, 'and so does what each project is on')

  // give it two agents and a collision, and the columns come back
  const twoAgents = {
    ...oneAgent,
    projects: [mk('a', ['claude']), mk('b', ['claude', 'codex'])],
    colls: [{ path: '/b/a.ts', project: '/b', a: {}, b: {}, gapMin: 2, at: now }],
  }
  const h2 = head(twoAgents)
  assert.match(h2, /AGENTS/, 'agents differ now, so show them')
  assert.match(h2, /COLL/, 'and there is a collision to report')
})

test('the headline is a chart per project, tall and graduated', async () => {
  // Founder thesis §6.5. The headline used to be ONE aggregate braille graph of
  // every project's edits at once — it moved, and it answered nothing. What it
  // has to answer is which project the time went to, so it is one line per
  // project, and the lines have to be tellable apart without colour, because
  // in a shared cell only one hue survives.
  const { render } = await import('../src/tui.js')
  const { MARKERS } = await import('../src/chart.js')
  const now = Date.now()
  // Two projects, worked at different times of day, in bursts — a lone edit is
  // one MIN_STRETCH and would draw a dot rather than a line.
  const burst = (root, agent, offsets) => offsets.flatMap(o =>
    Array.from({ length: 12 }, (_, i) => ({ at: now - o + i * 20_000, session: `s-${root}`, agent, path: `${root}/f${i}.ts`, project: root })))
  const events = [...burst('/r', 'claude', [3_600_000, 7_200_000]), ...burst('/q', 'codex', [20_000, 5_400_000])]
  const mk = (name, root) => ({ name, root, agents: [...new Set(events.filter(e => e.project === root).map(e => e.agent))],
                                sessions: 1, files: 9, events: events.filter(e => e.project === root), last: now })
  const state = {
    events,
    projects: [mk('r', '/r'), mk('q', '/q')],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }
  const lines = render(state, { cols: 140, rows: 32 }).replace(/\x1b\[[0-9;]*m/g, '').split('\n')

  // Every row carries a gradation, the way btop and agtop label theirs — with
  // only the ends marked a spike is a shape, not a value.
  const axis = lines.filter(l => /^\│\s+[\d.]+%?\s+┤/.test(l))
  assert.ok(axis.length >= 5, `the chart should be several graduated rows, got ${axis.length}`)
  assert.ok(lines.some(l => /^\│\s+0\s+┤/.test(l)), 'and the baseline should read 0')
  const values = axis.map(l => Number(l.match(/^\│\s+([\d.]+)/)[1]))
  assert.deepEqual(values, [...values].sort((a, b) => b - a), 'the scale must run downward')

  // Both projects are on the chart, each with its own marker.
  const plotted = axis.join('')
  assert.ok(plotted.includes(MARKERS[0]), 'the busiest project is drawn')
  assert.ok(plotted.includes(MARKERS[1]), 'and so is the second, with a different marker')

  // Which line is which, what it means, and when — all three, or the markers
  // are a cipher and the x axis is a shape rather than a measurement.
  assert.ok(lines.some(l => l.includes(`${MARKERS[0]}: r`) || l.includes(`${MARKERS[0]}: q`)), 'the legend names the lines')
  assert.ok(lines.some(l => l.includes('attention · 24h')), 'and says what the axis measures')
  assert.ok(lines.some(l => /└┬/.test(l)), 'the x axis is ruled with ticks')
  assert.ok(lines.some(l => /\d\d:\d\d.*now\s*│/.test(l)), 'and labelled with clock times ending at now')
})

test('a per-project sparkline is short and stands next to a number', async () => {
  const { render } = await import('../src/tui.js')
  const now = Date.now()
  const events = Array.from({ length: 20 }, (_, i) => ({ at: now - i * 60_000, session: 's', agent: 'claude', path: `/r/f${i}.ts`, project: '/r' }))
  const lines = render({
    events, projects: [{ name: 'r', root: '/r', agents: ['claude'], sessions: 1, files: 9, events, last: now }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], tier: 'braille',
    since: now - 86_400_000, now, lookback: '24h', windowMin: 30, tick: 0,
  }, { cols: 140, rows: 28 }).replace(/\x1b\[[0-9;]*m/g, '').split('\n')
  const header = lines.find(l => l.includes('PROJECT')) ?? ''
  assert.match(header, /ATTN/)
  assert.match(header, /PEAK/)
  const row = lines.find(l => l.includes('▸')) ?? ''
  assert.match(row, /\d+%/, 'the row needs a readable number, not only a shape')
  const spark = [...row].filter(c => c >= '⠁' && c <= '⣿').length
  assert.ok(spark <= 14, `the inline sparkline should stay short, was ${spark}`)
})

test('a theme background is actually painted, not just parsed', async () => {
  // main_bg was read from every btop theme since the first day and never used,
  // so a translucent terminal showed straight through the panes.
  const { setTheme, setOpaque, THEME } = await import('../src/theme.js')
  const { box } = await import('../src/box.js')
  const { setTransparent } = await import('../src/theme.js')
  setTheme(null)
  assert.ok(box({ w: 20 }).row('x').includes('\x1b[48;2;0;0;0m'), 'default is opaque black')
  setTransparent()
  assert.equal(box({ w: 20 }).row('x').includes('\x1b[48;2;'), false, '--transparent inherits the terminal')
  setOpaque('#101020')
  const painted = box({ w: 20 }).row('x')
  assert.ok(painted.includes('\x1b[48;2;16;16;32m'), 'the surface must reach the row')
  // and it must survive the resets inside the line
  const resets = painted.split('\x1b[0m').length - 1
  const bgs = painted.split('\x1b[48;2;16;16;32m').length - 1
  assert.ok(bgs >= resets - 1, `background re-armed ${bgs} times against ${resets} resets`)
  setTheme(null)
})

test('a home directory never reaches the screen', async () => {
  // The loose bucket has no git root, so paths there printed in full —
  // /Users/<you>/... on screen and in every screenshot taken of it.
  const { short } = await import('../src/format.js')
  const { HOME } = await import('../src/paths.js')
  const out = short(`${HOME}/Documents/thing/file.ts`, null)
  assert.equal(out, '~/Documents/thing/file.ts')
  assert.doesNotMatch(out, /\/Users\/|\/home\//)
  assert.equal(short('/w/repo/src/a.ts', '/w/repo'), 'src/a.ts', 'a repo still wins')

  // Windows. relative() returns native separators and a home is C:\Users\you,
  // so both branches above were broken there — the second one silently, by
  // printing the whole absolute path this test is named after.
  const win = 'C:\\Users\\you'
  assert.equal(short(`${win}\\repo\\src\\a.ts`, `${win}\\repo`), 'src/a.ts', 'no backslash reaches the screen')
  assert.doesNotMatch(short(`${HOME}\\Documents\\x.ts`, null), /\\/, 'nor via the home branch')
  assert.doesNotMatch(short(`${HOME}/Documents/x.ts`, null), /Users|home/i, 'a home is still hidden')
})

test('a long project list must not delete the graph', async () => {
  // The other half of "where is the spike?". The strip took whatever the table
  // left over, so with a dozen projects it got zero rows and the graph vanished
  // — squeezed out rather than switched off, which reads as a broken tool.
  const { render } = await import('../src/tui.js')
  const now = 1_700_000_000_000
  const projects = Array.from({ length: 20 }, (_, i) => ({
    name: `proj-${i}`, root: `/w/proj-${i}`, sessions: 1, files: 3,
    agents: ['claude'], attention: 60_000, last: now - i * 60_000,
    events: [{ at: now - i * 60_000, agent: 'claude', path: `/w/proj-${i}/a.ts`, session: 's' }],
  }))
  const state = {
    projects, sessions: new Map(), sel: 0, expanded: new Set(), colls: [],
    events: projects.flatMap(p => p.events),
    tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false, preset: 0,
  }
  const plain = render(state, { cols: 120, rows: 30, now }).replace(/\x1b\[[0-9;]*m/g, '')
  assert.match(plain, /EDITS\/MIN/, 'the strip survives a long list')
  assert.ok(plain.split('\n').filter(l => l.includes('┤')).length >= 3, 'and keeps enough rows to read a shape')
  // Rows that did not fit are counted, never silently dropped.
  assert.match(plain, /\d+ more below/)
})

test('presets change what is on screen, not just its size', async () => {
  const { render } = await import('../src/tui.js')
  const now = 1_700_000_000_000
  const base = {
    projects: [{
      name: 'a', root: '/w/a', sessions: 1, files: 1, agents: ['claude'],
      attention: 60_000, last: now,
      events: [{ at: now, agent: 'claude', path: '/w/a/x.ts', session: 's' }],
    }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], events: [],
    tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false,
  }
  const at = i => render({ ...base, preset: i }, { cols: 120, rows: 30, now }).replace(/\x1b\[[0-9;]*m/g, '')

  assert.match(at(0), /activity/, 'preset 1 keeps the feed')
  assert.match(at(0), /what an agent is told here|no project/, 'and the detail pane')
  assert.match(at(1), /activity/, 'preset 2 keeps the feed')
  assert.doesNotMatch(at(1), /what an agent is told here/, 'and drops detail entirely')
  assert.doesNotMatch(at(2), /activity/, 'preset 3 is the table alone')

  // btop prints the preset in the box border; so does skein.
  assert.match(at(0), /preset 1 all/)
  assert.match(at(2), /preset 3 table/)
})

test('truncation keeps colour — the reason the TUI looked plain', async () => {
  const { fit, clip, width } = await import('../src/box.js')
  const RED = '\x1b[38;2;255;0;0m', OFF = '\x1b[0m'

  // Both fit() and the row clipper used to strip every escape before cutting.
  // Table rows are built to fill their pane, so they overshoot by a character
  // or two — and every one of them arrived at the terminal grey. The colour was
  // being computed correctly and thrown away one layer before the screen.
  const painted = `${RED}docs/readme-library${OFF}`
  const cut = fit(painted, 12)
  assert.equal(width(cut), 12, 'still exactly the asked width')
  assert.match(cut, /\x1b\[38;2;255;0;0m/, 'and still red')
  assert.match(cut, /…$|…\x1b\[0m$/)

  // A plain string must come back plain: appending a reset to uncoloured text
  // is invisible but not equal, and rendered output is compared by equality.
  assert.equal(fit('abcdef', 4), 'abc…')
  assert.equal(clip('abcdef', 4), 'abc…')

  // Padding is unchanged, and escapes never count toward the width.
  assert.equal(width(fit(painted, 30)), 30)
  assert.equal(width(fit(`${RED}ab${OFF}`, 5)), 5)
})

test('the frame is not one grey box — each pane owns its outline', async () => {
  const { render } = await import('../src/tui.js')
  const { THEME } = await import('../src/theme.js')
  const now = 1_700_000_000_000
  const state = {
    projects: [{ name: 'a', root: '/w/a', sessions: 1, files: 1, agents: ['claude'], attention: 1, last: now,
                 events: [{ at: now, agent: 'claude', path: '/w/a/x.ts', session: 's' }] }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], events: [],
    tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false, preset: 0, tab: 0, feedTop: 0,
  }
  const raw = render(state, { cols: 120, rows: 30, now })
  // btop gives cpu_box, mem_box, net_box and proc_box four separate theme keys
  // (design language R6). skein had one DIM for all three panes.
  for (const [name, colour] of [['head', THEME.boxHead], ['detail', THEME.boxDetail], ['feed', THEME.boxFeed]]) {
    assert.ok(raw.includes(colour), `${name} draws in its own colour`)
  }
  // One project and one event, so most of the gradient range never appears —
  // the real screen runs to about 35. Six is still far above what this rendered
  // before, when the only 24-bit colour on screen came from the two gradients
  // and every border, title and header fell back to the terminal's grey.
  const distinct = new Set([...raw.matchAll(/\x1b\[38;2;[\d;]+m/g)].map(m => m[0]))
  assert.ok(distinct.size >= 6, `a painted screen, got ${distinct.size} distinct colours`)
})

test('no control character ever reaches the frame', async () => {
  // A literal \r got into the border because the clickable-tag change set the
  // expand tag's DISPLAYED GLYPH to the key it dispatches. The terminal obeyed
  // it, returned to column 0 and overwrote the row — the visible symptom was a
  // gap. width() also counts it as one column while it renders as none, so
  // every hit region after it was off by one, which is why the controls were
  // hard to click. This guards the whole class, not just \r.
  const { render } = await import('../src/tui.js')
  const now = 1_700_000_000_000
  const state = {
    projects: [{ name: 'a', root: '/w/a', sessions: 1, files: 1, agents: ['claude'], attention: 1, last: now,
                 events: [{ at: now, agent: 'claude', path: '/w/a/x.ts', session: 's' }] }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], events: [],
    tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false, preset: 0, tab: 0, feedTop: 0,
  }
  for (const [cols, rows] of [[143, 44], [120, 30], [100, 26], [80, 20]]) {
    const raw = render(state, { cols, rows, now })
    // Everything except ESC (which starts a legitimate SGR) and \n (row break).
    const bad = raw.match(/[\x00-\x09\x0b-\x1a\x1c-\x1f]/g)
    assert.equal(bad, null, `control chars at ${cols}x${rows}: ${JSON.stringify(bad)}`)
    // And every row must still fill the width exactly, or the terminal's own
    // background shows through as a band.
    for (const line of raw.split('\n')) {
      assert.equal([...line.replace(/\x1b\[[0-9;]*m/g, '')].length, cols)
    }
  }
})

test('a label that looks like a control is one', async () => {
  const { render } = await import('../src/tui.js')
  const { hitTag } = await import('../src/mouse.js')
  const now = 1_700_000_000_000
  const state = {
    projects: [{ name: 'a', root: '/w/a', sessions: 1, files: 1, agents: ['claude'], attention: 1, last: now,
                 events: [{ at: now, agent: 'claude', path: '/w/a/x.ts', session: 's' }] }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], events: [],
    tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false, preset: 0, tab: 0, feedTop: 0,
  }
  const raw = render(state, { cols: 143, rows: 44, now })
  const top = raw.split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '')

  // 'preset 1 all' sat in the border doing nothing when clicked.
  const region = state.hit.tags.find(t => t.y === 0)
  assert.ok(region, 'the preset label registers a hit region')
  assert.equal(hitTag(state.hit, region.x0, 0), 'p')
  assert.equal(hitTag(state.hit, region.x0 - 1, 0), null, 'and only where the label actually is')
  assert.equal(top.slice(region.x0, region.x1), 'preset 1 all', 'the region lines up with the text')

  // The glyph is what you read; the key is what it sends. Conflating them is
  // what put a carriage return on screen.
  const expand = state.hit.tags.find(t => t.key === '\r')
  assert.ok(expand, 'expand dispatches Enter')
  assert.match(raw, /⏎/, 'and displays a glyph, not the byte')
})

test('a project opens its own page, not two inline rows', async () => {
  const { render } = await import('../src/tui.js')
  const now = 1_700_000_000_000
  const events = Array.from({ length: 40 }, (_, i) => ({
    at: now - i * 90_000, agent: i % 5 ? 'claude' : 'codex',
    path: `/w/a/src/f${i % 7}.ts`, session: `s${i % 3}`,
  }))
  const p = { name: 'a', root: '/w/a', sessions: 3, files: 7, agents: ['claude', 'codex'],
              attention: 3600_000, last: now, events }
  const base = {
    projects: [p, { name: 'b', root: '/w/b', sessions: 1, files: 1, agents: ['claude'],
                    attention: 1, last: now, events: [{ at: now, agent: 'claude', path: '/w/b/x.ts', session: 'z' }] }],
    sessions: new Map([['s0', { agent: 'claude', context: 120_000, title: 'a session', branch: 'main' }]]),
    sel: 0, expanded: new Set(),
    colls: [{ path: '/w/a/src/f1.ts', project: '/w/a', gapMin: 12, at: now,
              a: { agent: 'claude', session: 's0' }, b: { agent: 'codex', session: 's1' } }],
    events, tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false, preset: 0, tab: 0, feedTop: 0,
  }
  const list = render({ ...base, page: null }, { cols: 140, rows: 42, now }).replace(/\x1b\[[0-9;]*m/g, '')
  const page = render({ ...base, page: '/w/a' }, { cols: 140, rows: 42, now }).replace(/\x1b\[[0-9;]*m/g, '')

  assert.match(list, /activity/, 'the list is unchanged')
  assert.doesNotMatch(page, /activity/, 'the page replaces the whole screen')

  // Everything the question "what happened in this repo" needs, on one screen.
  for (const box of ['agents', 'sessions', 'files', 'collisions']) {
    assert.match(page, new RegExp(box), `the page has a ${box} box`)
  }
  // Thesis §6.5 one level down: the page's own chart is stacked BY AGENT, so
  // it can say whether a repo was one agent working or two agents in it.
  assert.match(page, /attention · 24h/, "and this project's own chart")
  assert.match(page, /#: claude/, 'with a line for each agent that worked here')
  assert.match(page, /\*: codex/)
  assert.match(page, /esc/, 'and says how to get back')
  assert.match(page, /claude ↔ codex/, 'collisions name both sides')

  // The frame invariants still hold on this second screen.
  for (const line of page.split('\n')) {
    assert.equal([...line].length, 140)
  }
  assert.equal(page.split('\n').length, 42)
  assert.equal(page.match(/[\x00-\x09\x0b-\x1a]/g), null, 'no control characters')

  // An unknown page id falls back to the list rather than a blank screen.
  const missing = render({ ...base, page: '/w/nope' }, { cols: 140, rows: 42, now }).replace(/\x1b\[[0-9;]*m/g, '')
  assert.match(missing, /activity/)
})

test('a keypress is on screen in the next frame, not the next poll', async () => {
  // draw() copied six interactive variables into state and silently omitted
  // page, tab, preset and feedTop. Those are set by a keypress or a click and
  // then rendered from the STALE state, so the new screen only appeared when
  // reload() next rebuilt state — up to a poll interval later. That is the
  // whole of "nothing happens when I click" and "it takes about two seconds".
  //
  // Runs in a subprocess against a FIXTURE home. The first version of this test
  // drove the real TUI against whatever was in ~/.claude, which passed on the
  // machine that wrote it and failed on every CI runner, because a runner has
  // no sessions and so no project for Enter to open. skein's own rule is to
  // test against fixtures and never against real history; this is why.
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { join } = await import('node:path')

  // NOT under os.tmpdir(). skein's noise filter drops anything beginning /tmp,
  // /private/tmp or /var — and macOS mkdtemp hands back /var/folders/..., so a
  // fixture there produces zero projects and the test fails for a reason that
  // has nothing to do with what it is testing. Under the repo it looks like
  // ordinary work on every platform.
  const home = mkdtempSync(join(process.cwd(), '.skein-test-home-'))
  const repo = join(home, 'work', 'demo')
  const dir = join(home, '.claude', 'projects', 'demo')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(repo, '.git'), { recursive: true })
  const at = n => new Date(Date.now() - n * 60_000).toISOString()
  const lines = [
    { type: 'user', cwd: repo, gitBranch: 'main', timestamp: at(60), message: { content: 'build the thing' } },
    ...Array.from({ length: 12 }, (_, i) => ({
      cwd: repo, timestamp: at(50 - i * 3),
      message: { role: 'assistant', usage: { input_tokens: 1000 + i },
                 content: [{ type: 'tool_use', name: 'Edit', input: { file_path: join(repo, `src/f${i % 4}.ts`) } }] },
    })),
  ]
  // Trailing newline: the reader treats a final line with no terminator as a
  // partial append and holds it back, which is right for a live transcript.
  writeFileSync(join(dir, 's1.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n')

  const mod = new URL('../src/tui.js', import.meta.url).href
  // In tools/, not test/: anything under test/ is collected BY the runner, so
  // a helper living there is executed as a test with no arguments and fails.
  const driver = new URL('../tools/drive-tui.mjs', import.meta.url)
  const raw = execFileSync(process.execPath, [driver.pathname.replace(/^\/([A-Za-z]:)/, '$1'), mod],
    { env: { ...process.env, HOME: home, USERPROFILE: home, SKEIN_HOME: join(home, '.skein') },
      encoding: 'utf8', timeout: 30_000 })
  rmSync(home, { recursive: true, force: true })
  const marker = raw.match(/@@(.*)@@/)
  assert.ok(marker, `the driver printed no result:\n${raw.slice(0, 400)}`)
  const seen = JSON.parse(marker[1])

  assert.ok(seen.projects, 'the fixture home produced a project to act on')
  assert.ok(seen.painted, 'a keypress paints immediately')
  assert.match(seen.tab, /files {2}collisions/, 'the new tab is what got drawn')
  assert.match(seen.enter, /esc back/, 'enter opens the page in the same frame')
  assert.match(seen.esc, /activity/, 'and esc comes straight back')
  assert.match(seen.preset, /preset 2 watch/, 'preset switches in the same frame')
  // Deliberately never pressing q: quit() calls process.exit(0), which would end
  // the run and silently drop every test after it — the count goes down and
  // nothing reports a failure.
})

test('one click opens a project, and there is a way back without the keyboard', async () => {
  const { render } = await import('../src/tui.js')
  const { hitTag } = await import('../src/mouse.js')
  const now = 1_700_000_000_000
  const mk = (name, root) => ({ name, root, sessions: 1, files: 1, agents: ['claude'],
    attention: 60_000, last: now, events: [{ at: now, agent: 'claude', path: `${root}/x.ts`, session: 's' }] })
  const state = {
    projects: [mk('a', '/w/a'), mk('b', '/w/b')], sessions: new Map(), sel: 0,
    expanded: new Set(), colls: [], events: [],
    tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false, preset: 0, tab: 0, feedTop: 0, page: '/w/a',
  }
  const raw = render(state, { cols: 140, rows: 42, now })
  const lines = raw.replace(/\x1b\[[0-9;]*m/g, '').split('\n')

  // A full screen with no visible exit is a trap for anyone using the mouse.
  const backs = state.hit.tags.filter(t => t.key === '\x1b')
  assert.ok(backs.length >= 2, 'both the top-right and the border offer a way out')
  for (const t of backs) {
    assert.equal(hitTag(state.hit, t.x0, t.y), '\x1b')
    // Every region must sit on the label it claims — checked against ITS OWN
    // row, which is the part I got wrong while verifying this by hand.
    assert.match(lines[t.y].slice(t.x0, t.x1), /back/)
  }
})

test('the no-repo bucket claims no branch, on the page as well as the list', async () => {
  const { render } = await import('../src/tui.js')
  const now = 1_700_000_000_000
  const loose = {
    name: 'not in a repo', root: null, sessions: 2, files: 2, agents: ['claude'],
    attention: 60_000, last: now,
    events: [{ at: now, agent: 'claude', path: '/tmp/x.ts', session: 's1' },
             { at: now - 1000, agent: 'claude', path: '/tmp/y.ts', session: 's2' }],
  }
  const state = {
    projects: [loose], sessions: new Map([['s1', { agent: 'claude', branch: 'develop', title: 'unrelated' }]]),
    sel: 0, expanded: new Set(), colls: [], events: loose.events,
    tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false, preset: 0, tab: 0, feedTop: 0, page: 'not in a repo',
  }
  const page = render(state, { cols: 140, rows: 42, now }).replace(/\x1b\[[0-9;]*m/g, '')
  // Unrelated work sharing a row: a branch from whichever session came first
  // says something untrue about every other session in the bucket.
  assert.doesNotMatch(page.split('\n')[0], /develop/, 'the title must not borrow a branch')
  assert.match(page.split('\n')[0], /not in a repo/)
})
