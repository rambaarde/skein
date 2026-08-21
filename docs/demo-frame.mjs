#!/usr/bin/env node
// Renders the README's screenshot from INVENTED data.
//
// The frame used to be captured from the author's own machine, which put real
// client and employer project names into a public README and into every npm
// tarball that shipped it. A screenshot of a tool whose whole job is reading
// your working history is a disclosure surface; this file makes the demo
// reproducible and keeps the real names off the internet.
//
//   node docs/demo-frame.mjs        → the frame, ready to paste into README.md
import { render } from '../src/tui.js'
import { collisions } from '../src/collide.js'
import { byProject } from '../src/project.js'

const NOW = Date.parse('2026-08-22T14:20:00Z')
const DAY = 86_400_000
const ago = (d, h = 0) => NOW - d * DAY - h * 3_600_000

// A plausible week: two services worked in parallel, a web app, some docs, and
// a scratch bucket. Nothing here corresponds to anything real.
const PROJECTS = [
  { root: '/w/atlas-api', agents: ['claude', 'codex'], sessions: 6, files: 74, edits: 311, last: 8 / 3600 / 24 },
  { root: '/w/atlas-web', agents: ['claude', 'codex'], sessions: 5, files: 61, edits: 248, last: 4 / 1440 },
  { root: '/w/checkout', agents: ['claude'], sessions: 3, files: 29, edits: 96, last: 22 / 1440 },
  { root: '/w/notify-svc', agents: ['codex', 'opencode'], sessions: 2, files: 18, edits: 54, last: 2 / 24 },
  { root: '/w/docs-site', agents: ['claude'], sessions: 2, files: 12, edits: 31, last: 9 / 24 },
  { root: null, agents: ['claude', 'codex'], sessions: 7, files: 40, edits: 88, last: 1.2 },
]

// Deterministic pseudo-random, so the frame is byte-identical on every run.
let seed = 20260822
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

const events = []
for (const p of PROJECTS) {
  for (let i = 0; i < p.edits; i++) {
    // Cluster edits into working hours rather than smearing them evenly, or
    // every project draws the same flat bar.
    const day = Math.floor(rnd() * 30)
    const burst = rnd() < 0.35 ? rnd() * 2 : rnd() * 14
    const at = Math.min(NOW - p.last * DAY, ago(day, burst))
    events.push({
      agent: p.agents[i % p.agents.length],
      session: `${p.root ?? 'loose'}#${i % p.sessions}`,
      project: p.root ?? undefined,
      path: `${p.root ?? '/w/scratch'}/src/mod${i % p.files}.ts`,
      kind: 'edit',
      at,
      via: 'tool',
    })
  }
  // Land the most recent edit exactly where the LAST column should read.
  events.push({
    agent: p.agents[0], session: `${p.root ?? 'loose'}#0`, project: p.root ?? undefined,
    path: `${p.root ?? '/w/scratch'}/src/mod0.ts`, kind: 'edit', at: NOW - p.last * DAY, via: 'tool',
  })
}

// Two agents in one file, twenty minutes apart — the thing the product exists
// to report, so the demo has to show one.
for (const [i, s] of [['claude', 'atlas-api#0'], ['codex', 'atlas-api#1']].entries()) {
  events.push({
    agent: s[0], session: s[1], project: '/w/atlas-api',
    path: '/w/atlas-api/src/auth/session.ts', kind: 'edit',
    at: NOW - 40 * 60_000 + i * 20 * 60_000, via: 'tool',
  })
}

const TITLES = {
  '/w/atlas-api#0': 'Rotate the session expiry header',
  '/w/atlas-api#1': 'Add rate limiting to /auth',
  '/w/atlas-api#2': 'Backfill the audit log',
}
const sessions = new Map(
  [...new Set(events.map(e => e.session))].map(id => [id, {
    agent: 'claude',
    branch: id.endsWith('#0') ? 'main' : id.endsWith('#1') ? 'feat/rate-limit' : null,
    title: TITLES[id] ?? null,
    first: NOW - 30 * DAY, last: NOW,
  }]),
)

const since = NOW - 30 * DAY
const projects = [...byProject(events).values()].sort((a, b) => b.last - a.last)
const colls = collisions(events, sessions, { windowMin: 30, since })

const frame = render(
  { projects, sessions, sel: 0, expanded: new Set(), colls, tier: 'braille', since, now: NOW, lookback: '30d', windowMin: 30, tick: 3 },
  { cols: 96, rows: 24 },
)
process.stdout.write(frame.replace(/\x1b\[[0-9;]*m/g, '') + '\n')
