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
  const row = render(state, { cols: 120, rows: 20 }).split('\n')[2]
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
  // btop's convention: ┘key label└ — the bracket says "press this"
  assert.match(plain, /┘s edits└/, 'the sort tag should show the ACTIVE sort')
  assert.match(plain, /┘a 7d└/, 'the window tag should show the ACTIVE window')
  assert.match(plain, /┘\? keys└/)
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
  assert.equal(t.surface, '', 'the fallback must not paint a background')
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
  const plain = render(state, { cols: 100, rows: 24 }).replace(/\x1b\[[0-9;]*m/g, '')
  const newAt = plain.indexOf('new.ts'), oldAt = plain.indexOf('old.ts')
  assert.ok(newAt > -1 && oldAt > -1, 'both files should be listed')
  assert.ok(newAt < oldAt, 'the newer edit must come first')
  assert.equal(plain.split('new.ts').length - 1, 1, 'the same file in one session should appear once')
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
  const col = s => s.split('\n')[1].indexOf('AGENTS')
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
  assert.match(plain[1], /COLL/, 'collisions should have a column of their own')
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
