import test from 'node:test'
import assert from 'node:assert/strict'
import { TABS, TAB_TITLES, sessionsTab, filesTab, collisionsTab } from '../src/tabs.js'
import { hits, hitTab } from '../src/mouse.js'
import { render } from '../src/tui.js'

const now = 1_700_000_000_000
const F = {
  fit: (s, n) => String(s ?? '').slice(0, n).padEnd(n),
  hue: () => '', ago: () => '1m', trunc: s => s, short: p => p,
  humanTokens: n => `${Math.round(n / 1000)}k`, meter: () => '=====',
  DIM: '', R: '', BOLD: '', LUT: { heat: Array(101).fill(''), activity: Array(101).fill('') },
  limitOf: (s, fb) => s?.limit || fb, ceiling: 1_000_000,
}
const ctx = extra => ({ state: { sessions: new Map() }, now, detailW: 46, detailH: 12, collsHere: [], lookback: '24h', F, ...extra })

test('every tab has a title, and the border must not lie about which one', () => {
  // The border kept saying "what an agent is told here" while the file list was
  // on screen. It is skeins's metadata line, so it has to describe what is
  // actually under it.
  assert.equal(TABS.length, TAB_TITLES.length)
  assert.match(TAB_TITLES[0], /agent is told/)
  assert.match(TAB_TITLES[2], /files/)
})

test('the files tab ranks by edits and scales the bar to the busiest', () => {
  const p = { root: '/w/a', events: [
    ...Array.from({ length: 9 }, () => ({ at: now, agent: 'claude', path: '/w/a/hot.ts' })),
    { at: now, agent: 'claude', path: '/w/a/cold.ts' },
    { at: now, agent: 'codex', path: '/w/a/cold.ts' },
  ] }
  const out = filesTab(p, ctx()).join('\n')
  assert.ok(out.indexOf('hot.ts') < out.indexOf('cold.ts'), 'hottest first')
  assert.match(out, /hot\.ts.*9/, 'the count is shown, not just a bar')
  // Two agents on one file is the thing worth noticing, so it is marked.
  assert.match(out, /cold\.ts.*2/)
})

test('an empty tab says what was checked, not just nothing', () => {
  // "0 collisions" reads as a broken panel. Saying none-in-24h and what a
  // collision even is reads as good news.
  const rows = collisionsTab({ root: '/w/a', events: [] }, ctx()).join('\n')
  assert.match(rows, /no collisions here in 24h/)
  assert.match(rows, /two SESSIONS editing the/, 'and defines the term')
  // Accuracy: a collision is between two sessions, and they are frequently the
  // SAME agent in two windows. Most projects here have a one-entry agent list
  // and dozens of collisions, so calling them "two agents" was plainly wrong.
  // The copy is wrapped to the pane, so match it with the line break in place
  // rather than pretending the rendered text is one string.
  assert.match(rows.replace(/\s+/g, ' '), /often the same agent in two windows/)

  assert.match(filesTab({ root: '/w/a', events: [] }, ctx()).join(''), /no files touched/)
  assert.match(sessionsTab({ events: [] }, ctx()).join(''), /no sessions/)
})

test('the sessions tab scales each session against its own ceiling', () => {
  const sessions = new Map([
    ['a', { context: 200_000, limit: 258_400, title: 'codex work', model: 'gpt' }],
    ['b', { context: 200_000, title: 'claude work', model: 'opus' }],
  ])
  const p = { events: [{ at: now, agent: 'codex', session: 'a' }, { at: now - 1, agent: 'claude', session: 'b' }] }
  const out = sessionsTab(p, ctx({ state: { sessions } }))
  // Same token count, different windows — so they must not read identically.
  assert.match(out.join('\n'), /200k/)
  assert.equal(out.filter(r => r.includes('200k')).length, 2)
})

test('a tab is clickable, and the gaps between tabs are not', () => {
  const state = {
    projects: [{ name: 'a', root: '/w/a', sessions: 1, files: 1, agents: ['claude'], attention: 1, last: now,
                 events: [{ at: now, agent: 'claude', path: '/w/a/x.ts', session: 's' }] }],
    sessions: new Map(), sel: 0, expanded: new Set(), colls: [], events: [],
    tier: 'braille', since: now - 86400e3, now, lookback: '24h', windowMin: 30, tick: 0,
    sort: 'recent', filter: '', onlyColliding: false, preset: 0, tab: 0,
  }
  render(state, { cols: 120, rows: 34, now })
  assert.equal(state.hit.tabs.length, TABS.length, 'every tab registers a region')

  // Tabs sit side by side on one row, so a y-only lookup cannot tell them
  // apart — this is the first hit region in skeins that needs the column.
  const files = state.hit.tabs[2]
  assert.equal(hitTab(state.hit, files.x0, files.y), 2)
  assert.equal(hitTab(state.hit, files.x1 - 1, files.y), 2, 'x1 is exclusive')
  assert.equal(hitTab(state.hit, files.x1, files.y), null, 'the gap is dead space')
  assert.equal(hitTab(state.hit, files.x0, files.y + 1), null, 'and so is the row below')
  assert.equal(hitTab(hits(), 5, 5), null, 'an empty map never throws')
})


test('a collision names the two sides it actually has', () => {
  // The record carries `a` and `b`, each with its own agent and session — there
  // has never been a `c.agents` array, so the line that rendered it produced
  // nothing at all and the column sat blank.
  const same = { path: '/w/a/x.ts', project: '/w/a', gapMin: 28, at: now,
                 a: { agent: 'claude', session: 's1' }, b: { agent: 'claude', session: 's2' } }
  const diff = { ...same, b: { agent: 'codex', session: 's3' } }

  const one = collisionsTab({ root: '/w/a', events: [] }, ctx({ collsHere: [same] })).join('\n')
  assert.match(one, /2 × claude/, 'the same agent twice is said as such')

  const two = collisionsTab({ root: '/w/a', events: [] }, ctx({ collsHere: [diff] })).join('\n')
  assert.match(two, /claude ↔ codex/, 'and two different agents are both named')
  assert.doesNotMatch(two, /undefined/)
})
