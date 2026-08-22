#!/usr/bin/env node
// Build a throwaway world for skein to look at.
//
//   node tools/sandbox.mjs [dir]      default: ../skein-sandbox
//   cd <dir> && ./skein               runs skein against the fixtures only
//
// skein resolves every agent store from the home directory, so the sandbox is
// simply a fake HOME plus real git repositories. Nothing you own is read, and
// there is no flag to get wrong — the isolation is the process environment.
import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const OUT = resolve(process.argv[2] ?? join(dirname(new URL(import.meta.url).pathname), '..', '..', 'skein-sandbox'))
const HOME = join(OUT, 'home')
const REPOS = join(OUT, 'repos')

const NOW = Date.now()
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = a => a[Math.floor(rnd() * a.length)]

const PROJECTS = [
  { name: 'atlas-api', files: ['src/auth/session.ts', 'src/auth/middleware.ts', 'src/routes/users.ts', 'src/db/pool.ts', 'test/auth.test.ts'] },
  { name: 'atlas-web', files: ['app/login/page.tsx', 'app/dashboard/page.tsx', 'lib/api.ts', 'components/Nav.tsx'] },
  { name: 'checkout', files: ['src/cart.ts', 'src/pricing.ts', 'test/cart.test.ts'] },
  { name: 'notify-svc', files: ['worker.go', 'queue.go', 'README.md'] },
  { name: 'docs-site', files: ['content/intro.md', 'content/guide.md'] },
]
const TITLES = [
  'Rotate the session expiry header', 'Add rate limiting to /auth', 'Fix the flaky cart test',
  'Backfill the audit log', 'Split the pricing module', 'Tidy the onboarding guide',
]

rmSync(OUT, { recursive: true, force: true })
mkdirSync(HOME, { recursive: true })

// Real git roots, because skein finds a project by walking up to a .git.
for (const p of PROJECTS) {
  const dir = join(REPOS, p.name)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'README.md'), `# ${p.name}\n\nFixture repository. Nothing here is real.\n`)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-q',
    '--allow-empty', '-m', 'init'], { cwd: dir })
}

// ---- claude: ~/.claude/projects/<slug>/<session>.jsonl ---------------------
const claudeDir = join(HOME, '.claude', 'projects')
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
    }
    write(join(claudeDir, slug, `${id}.jsonl`), lines)
  }
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
// cannot demonstrate the flagship: `skein who` and `skein hook` are both scoped
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
      write(join(HOME, '.codex', 'sessions', String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()),
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
  write(join(HOME, '.codex', 'sessions', String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()),
    `rollout-${iso(start).replace(/[:.]/g, '-')}-fixture-${p.name}.jsonl`), lines)
}

// ---- opencode: storage/{project,session,part} ------------------------------
{
  const store = join(HOME, '.local', 'share', 'opencode', 'storage')
  const root = join(REPOS, 'notify-svc')
  const pid = 'proj_fixture', sid = 'ses_fixture'
  const j = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 1)) }
  j(join(store, 'project', `${pid}.json`), { id: pid, worktree: root, vcs: 'git' })
  j(join(store, 'session', `${sid}.json`), { id: sid, projectID: pid })
  for (let i = 0; i < 9; i++) {
    j(join(store, 'part', `msg_${i}`, `prt_${i}.json`), {
      id: `prt_${i}`, sessionID: sid, type: 'tool', tool: 'edit',
      state: { status: 'completed', input: { filePath: join(root, pick(PROJECTS[3].files)) }, time: { start: NOW - (i + 1) * 47 * MIN } },
    })
  }
}

// ---- a runner, so nobody has to remember the env var ----------------------
const runner = join(OUT, 'skein')
writeFileSync(runner, `#!/bin/sh
# Runs skein against THIS sandbox only. HOME is what scopes it: every agent
# store, and skein's own cache, resolve from the home directory.
export HOME="${HOME}"
exec "$(command -v skein || echo skein)" "$@"
`)
chmodSync(runner, 0o755)
writeFileSync(join(OUT, 'README.md'), `# skein-sandbox

A throwaway world for trying skein. **Nothing of yours is read.**

    ./skein              the TUI
    ./skein ls           projects
    ./skein collisions   the seeded collision
    ./skein who          who else is in a repo

Regenerate at any time:

    node ../skein/tools/sandbox.mjs

\`home/\` is a fake HOME holding fixture sessions for Claude Code, Codex and
opencode. \`repos/\` holds real (empty) git repositories so project resolution
has something to find. Delete the whole folder when you are done.
`)

console.log(`sandbox: ${OUT}
  repos    ${PROJECTS.length} git roots
  claude   ${sessionN} sessions + 1 seeded collision
  codex    3 sessions
  opencode 1 session

run it:  cd ${OUT} && ./skein`)
