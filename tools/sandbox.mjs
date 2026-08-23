#!/usr/bin/env node
// Build a throwaway world for skeins to look at.
//
//   node tools/sandbox.mjs [dir]      default: ../skeins-sandbox
//   cd <dir> && ./skeins               runs skeins against the fixtures only
//
// skeins resolves every agent store from the home directory, so the sandbox is
// simply a fake HOME plus real git repositories. Nothing you own is read, and
// there is no flag to get wrong — the isolation is the process environment.
import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
// The same resolver skeins reads with, so the world this builds and the world
// skeins looks for cannot drift apart. They already had once: this file
// hardcoded ~/.local/share while skeins had learned to honour XDG_DATA_HOME.
import { storesIn } from '../src/paths.js'

const OUT = resolve(process.argv[2] ?? join(dirname(new URL(import.meta.url).pathname), '..', '..', 'skeins-sandbox'))
const HOME = join(OUT, 'home')
const REPOS = join(OUT, 'repos')

const NOW = Date.now()
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = a => a[Math.floor(rnd() * a.length)]

// Wide enough that a batch between releases covers a MINORITY of the repo.
//
// With five files a release shipped nearly all of them, so every subsequent
// fix touched something it shipped and the fixture reported a 100% change
// failure rate -- a catastrophically broken repo, in the screenshot that is
// supposed to show the tool working. The rate is a property of how much of a
// repo each release covers, so the fixture has to look like a repo.
const PROJECTS = [
  { name: 'atlas-api', files: ['src/auth/session.ts', 'src/auth/middleware.ts', 'src/routes/users.ts', 'src/routes/orders.ts', 'src/db/pool.ts', 'src/db/migrate.ts', 'src/mail/send.ts', 'src/config.ts', 'src/log.ts', 'test/auth.test.ts'] },
  { name: 'atlas-web', files: ['app/login/page.tsx', 'app/dashboard/page.tsx', 'app/settings/page.tsx', 'lib/api.ts', 'lib/format.ts', 'components/Nav.tsx', 'components/Table.tsx', 'styles/theme.css'] },
  { name: 'checkout', files: ['src/cart.ts', 'src/pricing.ts', 'src/tax.ts', 'src/coupon.ts', 'src/receipt.ts', 'src/refund.ts', 'src/currency.ts', 'src/session.ts', 'test/cart.test.ts'] },
  { name: 'notify-svc', files: ['worker.go', 'queue.go', 'retry.go', 'templates.go', 'dispatch.go', 'backoff.go', 'metrics.go', 'config.go', 'README.md'] },
  { name: 'docs-site', files: ['content/intro.md', 'content/guide.md', 'content/api.md', 'content/faq.md', 'content/install.md', 'content/cli.md', 'content/themes.md', 'content/changelog.md'] },
]
// Weighted by how often a real session reaches for them: Read dominates,
// then Grep and Bash, with the occasional Task and web call.
const READ_TOOLS = [
  'Read', 'Read', 'Read', 'Read', 'Read', 'Read',
  'Grep', 'Grep', 'Grep', 'Glob', 'Glob',
  'Bash', 'Bash', 'Bash',
  'TodoWrite', 'Task', 'WebFetch',
]
const TITLES = [
  'Rotate the session expiry header', 'Add rate limiting to /auth', 'Fix the flaky cart test',
  'Backfill the audit log', 'Split the pricing module', 'Tidy the onboarding guide',
]

rmSync(OUT, { recursive: true, force: true })
mkdirSync(HOME, { recursive: true })

// Real git roots, because skeins finds a project by walking up to a .git — and
// real trunk HISTORY, because `skeins velocity` reads what landed on the trunk.
// One empty init commit made every fixture project look like it had shipped
// once and never again, which is a poor thing to show and a worse thing to
// test against.
//
// The subjects are Conventional Commits because velocity classifies by TYPE:
// `fix`/`revert` is what rework counts, and `chore(main): release` is excluded
// so a release-automation repo does not report double.
const SUBJECTS = [
  'feat(auth): rotate the session expiry header',
  'fix(cart): the flaky test was a real race',
  'refactor(db): one pool, created once',
  'feat(api): rate limit /auth',
  'chore(main): release',
  'fix(nav): the active link was a link to here',
  'docs: say what the window means',
  'perf(pricing): stop recomputing the whole basket',
  'fix(queue): a dead letter is not a retry',
  'feat(dashboard): a project opens its own screen',
]

// The date is formatted inline rather than through iso(), which is declared
// further down: a const does not hoist, and reaching back for one is the exact
// trap this codebase has now hit five times.
const gitAt = (dir, at, args) => {
  const when = new Date(at).toISOString()
  return execFileSync('git', [
    '-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', ...args,
  ], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } })
}

for (const [pi, p] of PROJECTS.entries()) {
  const dir = join(REPOS, p.name)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'README.md'), `# ${p.name}\n\nFixture repository. Nothing here is real.\n`)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  // Busier projects land more. The first one ships most, so the demo has a
  // leader rather than five identical lines.
  // Enough commits that a PAIR repeats. Coupling needs three co-changes to
  // count as evidence, and twenty commits walking a ring of ten files visits
  // each pair exactly twice -- so the fixture had real files, real releases,
  // and a coupling graph of three edges that looked broken rather than quiet.
  // A FLOOR, not just a ceiling. The smaller projects were getting twelve
  // commits and four tags, so three judgeable deployments -- where a single
  // repaired release reads 33%, and two read 100%. Pooled across the machine
  // that dragged the trend band to 47%, which is not what a working machine
  // looks like and is the first number a reader sees in the README.
  const n = Math.max(20, 44 - pi * 6)
  // Commits TOUCH FILES, and touch them in pairs.
  //
  // They were `--allow-empty`, which made the fixture silently useless for two
  // whole screens: the coupling graph had nothing to pair, and the change
  // failure rate could never fire because its rule is "the hotfix touched a
  // file this deployment shipped" and no deployment shipped a file. The
  // sandbox reported 0% forever and looked correct.
  //
  // A source file lands with its test, which is what real commits do and what
  // makes the graph show a cluster rather than a scatter.
  // A project whose files are ALL markdown -- docs-site -- has no source to
  // pair with a test, and filtering left it with nothing to commit at all.
  // Pair each file with the next one instead; the point is co-change, not
  // that one of them is called a test.
  // Each file pairs with its NEIGHBOUR, not with one shared test.
  //
  // Pairing every source against the single test file put that test in every
  // commit, so every release shipped it and every subsequent fix touched
  // something the release shipped -- a 100% change failure rate produced
  // entirely by the fixture's shape. Neighbours spread the commits across the
  // repo the way real work does.
  const sources = p.files.filter(f => !f.startsWith('test/'))
  const ring = sources.length > 1 ? sources : p.files
  const pairs = ring.map((f, i) => [f, ring[(i + 1) % ring.length]])
  for (let i = 0; i < n; i++) {
    // Spread back over the month, newest last, with a little jitter so the
    // lead times are not all identical. The last one lands within the hour:
    // a repo whose newest commit is a day old reports nothing at all in the
    // default 24h window, which is a poor thing to look at and a worse thing
    // to test velocity against.
    const at = NOW - ((n - 1 - i) / Math.max(1, n - 1)) * 26 * DAY - Math.floor(rnd() * 5 * HOUR) - 20 * MIN
    const subject = SUBJECTS[(i + pi) % SUBJECTS.length]
    const isFix = /^(fix|revert)/.test(subject)
    const [src, mate] = pairs[i % pairs.length]
    const touched = [src, mate]
    // The README and the test suite move with FEATURE work, not with fixes.
    //
    // Touching the README every third commit regardless put it in nearly every
    // release batch AND in most hotfixes, so the hotfix always hit something
    // the release had shipped and the fixture reported 100%. A bug fix that
    // also rewrites the README is not what repositories look like, and here it
    // was manufacturing the failure rate on its own.
    if (!isFix && i % 3 === 0) touched.push('README.md')
    const suite = p.files.find(x => x.startsWith('test/'))
    if (suite && !isFix && i % 4 === 0) touched.push(suite)
    for (const f of touched) {
      mkdirSync(dirname(join(dir, f)), { recursive: true })
      writeFileSync(join(dir, f), `// ${p.name} · ${f}\n// commit ${i}, fixture only.\n`)
    }
    gitAt(dir, at, ['add', '-A'])
    gitAt(dir, at, ['commit', '-q', '-m', subject])
    // A version tag every few commits, because a change failure rate needs
    // DEPLOYMENTS and the fixture had two -- one judgeable batch, so the rate
    // was whatever that single batch did, and it read 100%. Tags are what
    // deployments() prefers, and they give the rate a denominator.
    if (i > 0 && i % 3 === 0) {
      gitAt(dir, at, ['tag', `v0.${Math.floor(i / 3)}.0`])
    }
  }
}

// ---- claude: ~/.claude/projects/<slug>/<session>.jsonl ---------------------
const STORE = storesIn(HOME)
const claudeDir = STORE.claude
const write = (p, lines) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, lines.map(o => JSON.stringify(o)).join('\n') + '\n') }
const iso = t => new Date(t).toISOString()

let sessionN = 0
for (const p of PROJECTS) {
  const root = join(REPOS, p.name)
  const slug = root.replace(/\//g, '-')
  const howMany = 1 + Math.floor(rnd() * 3)
  for (let s = 0; s < howMany; s++) {
    const id = `fixture-${p.name}-${s}`
    const branch = s === 0 ? 'main' : pick(['feat/rate-limit', 'fix/cart', 'chore/deps'])
    const start = NOW - (rnd() * 20 * DAY)
    const lines = [
      { type: 'user', cwd: root, gitBranch: branch, sessionId: id, timestamp: iso(start) },
      { type: 'ai-title', aiTitle: TITLES[sessionN++ % TITLES.length], sessionId: id },
    ]
    for (let i = 0; i < 8 + Math.floor(rnd() * 25); i++) {
      const at = start + i * (2 + rnd() * 25) * MIN
      if (at > NOW) break
      const f = pick(p.files)
      // Mix the three capture paths, the way a real session does.
      const r = rnd()
      if (r < 0.4) lines.push({ type: 'file-history-delta', trackingPath: join(root, f), timestamp: iso(at) })
      else if (r < 0.8) lines.push({ timestamp: iso(at), cwd: root, gitBranch: branch, message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: f } }] } })
      else lines.push({ timestamp: iso(at), cwd: root, gitBranch: branch, message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `cd ${root} && sed -i '' s/a/b/ ${f}` } }] } })

      // Everything a session does that leaves no file behind. Real sessions
      // are mostly this -- reading, searching, running things -- and a fixture
      // that emits only writes makes the tools tab look like a two-row list
      // and hides the read:write ratio, which is the number worth reading.
      for (let k = 0, n = Math.floor(rnd() * 6); k < n; k++) {
        lines.push({
          timestamp: iso(at + k * 9_000), cwd: root, gitBranch: branch,
          message: { content: [{ type: 'tool_use', name: pick(READ_TOOLS), input: {} }] },
        })
      }
    }
    write(join(claudeDir, slug, `${id}.jsonl`), lines)
  }
}

// A FIRST SESSION: opened minutes ago, has read and searched, written nothing.
//
// This is what a new user's very first `skeins` looks like, and it was the
// case nothing exercised. It has to show something: the project, the session,
// its context, and the tool calls it has made -- because for the first few
// minutes of any session that is all there is, and a screen of four empty
// panes reads as a tool that does not work rather than as work that has not
// landed yet.
{
  const root = join(REPOS, 'first-look')
  // A real repo with NO history: a project someone just started. Its velocity
  // row reads "no git history", which is the honest answer and a different
  // one from "you landed nothing".
  mkdirSync(root, { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  const id = 'fixture-first-session'
  const start = NOW - 9 * MIN
  const lines = [
    { type: 'user', cwd: root, gitBranch: 'main', sessionId: id, timestamp: iso(start) },
    { type: 'ai-title', aiTitle: 'plan the auth refactor', sessionId: id },
  ]
  for (let i = 0; i < 14; i++) {
    lines.push({
      timestamp: iso(start + i * 30_000), cwd: root, gitBranch: 'main',
      message: { content: [{ type: 'tool_use', name: pick(READ_TOOLS), input: {} }] },
    })
  }
  write(join(claudeDir, root.replace(/\//g, '-'), `${id}.jsonl`), lines)
}

// A deliberate collision: two live sessions, one file, twenty minutes apart.
{
  const root = join(REPOS, 'atlas-api')
  const slug = root.replace(/\//g, '-')
  for (const [i, id] of ['fixture-collide-a', 'fixture-collide-b'].entries()) {
    write(join(claudeDir, slug, `${id}.jsonl`), [
      { type: 'user', cwd: root, gitBranch: i ? 'feat/rate-limit' : 'main', sessionId: id, timestamp: iso(NOW - 90 * MIN) },
      { type: 'ai-title', aiTitle: i ? 'Add rate limiting to /auth' : 'Rotate the session expiry header', sessionId: id },
      { type: 'file-history-delta', trackingPath: join(root, 'src/auth/session.ts'), timestamp: iso(NOW - (40 - i * 20) * MIN) },
      { type: 'user', cwd: root, gitBranch: i ? 'feat/rate-limit' : 'main', sessionId: id, timestamp: iso(NOW - 2 * MIN) },
    ])
  }
}

// Two agents in atlas-api RIGHT NOW, minutes apart. Without this the sandbox
// cannot demonstrate the flagship: `skeins who` and `skeins hook` are both scoped
// to the last thirty minutes, so a fixture whose newest edit is an hour old
// shows an empty screen for the one feature that matters.
{
  const root = join(REPOS, 'atlas-api')
  const slug = root.replace(/\//g, '-')
  const live = [
    ['fixture-live-claude', 'claude', 'main', 'src/auth/middleware.ts', 4],
    ['fixture-live-codex', 'codex', 'feat/rate-limit', 'src/auth/session.ts', 1],
  ]
  for (const [id, agent, branch, file, minsAgo] of live) {
    if (agent === 'claude') {
      write(join(claudeDir, slug, `${id}.jsonl`), [
        { type: 'user', cwd: root, gitBranch: branch, sessionId: id, timestamp: iso(NOW - 25 * MIN) },
        { type: 'ai-title', aiTitle: 'Rotate the session expiry header', sessionId: id },
        { type: 'file-history-delta', trackingPath: join(root, file), timestamp: iso(NOW - minsAgo * MIN) },
      ])
    } else {
      const d = new Date(NOW - 25 * MIN)
      const pad = n => String(n).padStart(2, '0')
      write(join(STORE.codex, String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()),
        `rollout-live-${id}.jsonl`), [
        { timestamp: iso(NOW - 25 * MIN), type: 'session_meta', payload: { type: 'session_meta', cwd: root } },
        { timestamp: iso(NOW - minsAgo * MIN), type: 'event_msg',
          payload: { type: 'patch_apply_end', success: true, changes: { [join(root, file)]: { type: 'update' } } } },
      ])
    }
  }
}

// ---- codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl -------------------
for (const p of PROJECTS.slice(0, 3)) {
  const root = join(REPOS, p.name)
  const start = NOW - rnd() * 10 * DAY
  const d = new Date(start)
  const pad = n => String(n).padStart(2, '0')
  const lines = [{ timestamp: iso(start), type: 'session_meta', payload: { type: 'session_meta', cwd: root } }]
  for (let i = 0; i < 6 + Math.floor(rnd() * 14); i++) {
    const at = start + i * (5 + rnd() * 40) * MIN
    if (at > NOW) break
    lines.push({
      timestamp: iso(at), type: 'event_msg',
      payload: { type: 'patch_apply_end', success: true, changes: { [join(root, pick(p.files))]: { type: pick(['update', 'update', 'add']) } } },
    })
  }
  write(join(STORE.codex, String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()),
    `rollout-${iso(start).replace(/[:.]/g, '-')}-fixture-${p.name}.jsonl`), lines)
}

// ---- opencode: storage/{project,session,part} ------------------------------
{
  const store = STORE.opencode
  const root = join(REPOS, 'notify-svc')
  const pid = 'proj_fixture', sid = 'ses_fixture'
  const j = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 1)) }
  j(join(store, 'project', `${pid}.json`), { id: pid, worktree: root, vcs: 'git' })
  j(join(store, 'session', `${sid}.json`), { id: sid, projectID: pid })
  // Edits AND everything else. opencode writes one part per tool call and
  // names it outright, so a fixture that emits only edits makes the session
  // report 0% read -- which is not what any session has ever looked like.
  const PARTS = ['edit', 'read', 'read', 'read', 'grep', 'bash', 'read', 'edit', 'glob', 'read', 'bash', 'write', 'read', 'grep']
  for (const [i, tool] of PARTS.entries()) {
    j(join(store, 'part', `msg_${i}`, `prt_${i}.json`), {
      id: `prt_${i}`, sessionID: sid, type: 'tool', tool,
      state: { status: 'completed', input: { filePath: join(root, pick(PROJECTS[3].files)) }, time: { start: NOW - (i + 1) * 31 * MIN } },
    })
  }
}

// ---- a runner, so nobody has to remember the env var ----------------------
const runner = join(OUT, 'skeins')
const BIN = resolve(dirname(new URL(import.meta.url).pathname), '..', 'bin', 'skeins.js')
writeFileSync(runner, `#!/bin/sh
# Runs skeins against THIS sandbox only.
#
# HOME alone is NOT enough, and that was a real hole. skeins honours the
# variables the agents themselves honour -- XDG_DATA_HOME for opencode,
# CLAUDE_CONFIG_DIR for Claude Code -- so on a machine that sets either, a
# sandbox overriding only HOME would have read the user's own history while
# promising it read nothing. Every one of them is pinned inside the sandbox.
#
# It runs the CHECKOUT this sandbox was seeded from, not whatever is installed
# globally -- otherwise you test the last release while looking at your working
# tree, which is a confusing hour. Set SKEINS_BIN to override.
export HOME="${HOME}"
export XDG_DATA_HOME="${HOME}/.local/share"
export XDG_CONFIG_HOME="${HOME}/.config"
export XDG_STATE_HOME="${HOME}/.local/state"
export CLAUDE_CONFIG_DIR="${HOME}/.claude"
export SKEIN_HOME="${HOME}/.skeins"
BIN="\${SKEINS_BIN:-\${SKEIN_BIN:-${BIN}}}"
if [ -f "$BIN" ]; then exec node "$BIN" "$@"; fi
exec "$(command -v skeins || echo skeins)" "$@"
`)
chmodSync(runner, 0o755)
writeFileSync(join(OUT, 'README.md'), `# skeins-sandbox

A throwaway world for trying skeins. **Nothing of yours is read.**

    ./skeins              the TUI
    ./skeins ls           projects
    ./skeins collisions   the seeded collision
    ./skeins who          who else is in a repo

Regenerate at any time:

    node ../skeins/tools/sandbox.mjs

\`home/\` is a fake HOME holding fixture sessions for Claude Code, Codex and
opencode. \`repos/\` holds real (empty) git repositories so project resolution
has something to find. Delete the whole folder when you are done.
`)

console.log(`sandbox: ${OUT}
  repos    ${PROJECTS.length} git roots
  claude   ${sessionN} sessions + 1 seeded collision
  codex    3 sessions
  opencode 1 session

run it:  cd ${OUT} && ./skeins`)
