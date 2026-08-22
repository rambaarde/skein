#!/usr/bin/env node
// M0 — measure the pain before building the product.  PRD §0.2, thesis §10.
// Not product code.  Reads only; answers three questions and exits.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

const HOME = homedir()
const WINDOW_MIN = Number(process.env.WINDOW ?? 30)
const DAYS = Number(process.env.DAYS ?? 30)
const events = []   // { agent, session, path, at, branch }
const sessions = new Map()  // session -> { agent, cwd, branch, prLink, first, last }

const walk = (dir, out = []) => {
  let ents = []
  try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const abs = (p, cwd) => p.startsWith('/') ? p : (p.startsWith('~/') ? join(HOME, p.slice(2)) : join(cwd ?? '/', p))
// Files a shell command WRITES to. Deliberately conservative: redirects,
// in-place sed, tee, and heredoc targets. Read-only commands are ignored.
const bashTargets = cmd => {
  const out = new Set()
  const add = f => { if (f && !/^[-|&]/.test(f) && !/^\/dev\//.test(f)) out.add(f.replace(/^["']|["']$/g, '')) }
  for (const m of cmd.matchAll(/(?:^|[;&|]|\s)>>?\s*("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) add(m[1])
  for (const m of cmd.matchAll(/\bsed\b[^;&|]*?\s-i(?:\.\S+)?\s[^;&|]*?\s("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:$|[;&|])/g)) add(m[1])
  for (const m of cmd.matchAll(/\btee\b\s+(?:-a\s+)?("[^"]+"|'[^']+'|[^\s;&|]+)/g)) add(m[1])
  for (const m of cmd.matchAll(/\bmv\b\s+\S+\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g)) add(m[1])
  return [...out].filter(f => /\.[A-Za-z0-9]{1,6}$/.test(f))
}
const lines = f => { try { return readFileSync(f, 'utf8').split('\n') } catch { return [] } }
const sess = (id, agent) => {
  if (!sessions.has(id)) sessions.set(id, { agent, cwd: null, branch: null, prLink: false, first: Infinity, last: 0 })
  return sessions.get(id)
}

// ---- claude ---------------------------------------------------------------
const claudeDir = join(HOME, '.claude', 'projects')
let bashEdits = 0, toolEdits = 0
if (existsSync(claudeDir)) {
  for (const f of walk(claudeDir).filter(p => p.endsWith('.jsonl'))) {
    const id = f.split('/').pop().replace('.jsonl', '')
    const s = sess(id, 'claude')
    for (const line of lines(f)) {
      if (!line) continue
      let d; try { d = JSON.parse(line) } catch { continue }
      if (d.isSidechain) continue          // subagent work belongs to its parent
      if (d.cwd && !s.cwd) s.cwd = d.cwd
      if (d.gitBranch && d.gitBranch !== 'HEAD' && !s.branch) s.branch = d.gitBranch
      if (d.type === 'pr-link') s.prLink = true
      const at = d.timestamp ? Date.parse(d.timestamp) : 0
      if (at) { s.first = Math.min(s.first, at); s.last = Math.max(s.last, at) }
      if (d.type === 'file-history-delta' && d.trackingPath) {
        events.push({ agent: 'claude', session: id, path: d.trackingPath, at, branch: s.branch })
      }
      // blind-spot measurement: edits that never produce a file-history-delta
      const c = d?.message?.content
      if (Array.isArray(c)) for (const b of c) {
        if (b?.type !== 'tool_use') continue
        const push = path => events.push({ agent: 'claude', session: id, path, at, branch: s.branch, via: 'tool' })
        if (['Edit', 'Write', 'NotebookEdit'].includes(b.name) || /trueline_edit/.test(b.name ?? '')) {
          toolEdits++
          const fp = b.input?.file_path ?? b.input?.notebook_path
          if (fp) push(abs(fp, s.cwd))
        }
        if (b.name === 'Bash') {
          for (const fp of bashTargets(b.input?.command ?? '')) { bashEdits++; events.push({ agent: 'claude', session: id, path: abs(fp, s.cwd), at, branch: s.branch, via: 'bash' }) }
        }
      }
    }
  }
}

// ---- codex ----------------------------------------------------------------
const codexDir = join(HOME, '.codex', 'sessions')
if (existsSync(codexDir)) {
  for (const f of walk(codexDir).filter(p => p.endsWith('.jsonl'))) {
    const id = f.split('/').pop().replace('.jsonl', '')
    const s = sess(id, 'codex')
    for (const line of lines(f)) {
      if (!line) continue
      let d; try { d = JSON.parse(line) } catch { continue }
      const at = d.timestamp ? Date.parse(d.timestamp) : 0
      if (at) { s.first = Math.min(s.first, at); s.last = Math.max(s.last, at) }
      const p = d.payload ?? {}
      if (p.type === 'session_meta') s.cwd ??= p.payload?.cwd ?? p.cwd ?? null
      if (p.type === 'turn_context') s.cwd ??= p.cwd ?? null
      if (p.type === 'patch_apply_end' && p.changes) {
        for (const path of Object.keys(p.changes)) events.push({ agent: 'codex', session: id, path, at, branch: null })
      }
    }
  }
}

// ---- opencode -------------------------------------------------------------
const ocPart = join(HOME, '.local', 'share', 'opencode', 'storage', 'part')
if (existsSync(ocPart)) {
  for (const f of walk(ocPart).filter(p => p.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
    if (d?.type !== 'tool' || !['edit', 'write'].includes(d.tool)) continue
    const path = d?.state?.input?.filePath
    const at = d?.state?.time?.start ?? 0
    if (!path) continue
    const s = sess(d.sessionID, 'opencode')
    if (at) { s.first = Math.min(s.first, at); s.last = Math.max(s.last, at) }
    events.push({ agent: 'opencode', session: d.sessionID, path, at, branch: null })
  }
}

// ---- git roots ------------------------------------------------------------
const rootCache = new Map()
const gitRoot = p => {
  let dir = dirname(p)
  const seen = []
  while (dir && dir !== '/' && dir !== HOME) {
    if (rootCache.has(dir)) { const r = rootCache.get(dir); seen.forEach(d => rootCache.set(d, r)); return r }
    seen.push(dir)
    try { if (statSync(join(dir, '.git'))) { seen.forEach(d => rootCache.set(d, dir)); return dir } } catch {}
    dir = dirname(dir)
  }
  seen.forEach(d => rootCache.set(d, null))
  return null
}

// ---- noise filter ---------------------------------------------------------
// A collision only counts if it is work.  Logs, deps, build output and
// scratch directories are not work.
const NOISE = /(^|\/)(node_modules|\.git|dist|build|coverage|\.next|target|vendor)\//
const noisy = p => NOISE.test(p) || /\.(log|lock)$/.test(p) || /^\/(tmp|private\/tmp|var)\//.test(p)
const dropped = events.filter(e => noisy(e.path)).length

// ---- Q1: same file, different sessions, inside the window -----------------
const byPath = new Map()
for (const e of events) {
  if (!e.at || noisy(e.path)) continue
  if (!byPath.has(e.path)) byPath.set(e.path, [])
  byPath.get(e.path).push(e)
}
const collisions = []
for (const [path, evs] of byPath) {
  evs.sort((a, b) => a.at - b.at)
  for (let i = 0; i < evs.length; i++) {
    for (let j = i + 1; j < evs.length; j++) {
      const gap = evs[j].at - evs[i].at
      if (gap > WINDOW_MIN * 60_000) break
      if (evs[j].session === evs[i].session) continue
      collisions.push({ path, a: evs[i], b: evs[j], gapMin: gap / 60_000, at: evs[i].at })
    }
  }
}
// one row per (file, session-pair) — repeated edits in one overlap are one event
const uniq = new Map()
for (const c of collisions) {
  const k = [c.path, [c.a.session, c.b.session].sort().join('|')].join('::')
  if (!uniq.has(k) || uniq.get(k).at > c.at) uniq.set(k, c)
}
const all = [...uniq.values()].sort((a, b) => a.at - b.at)
const overlaps = c => {
  const A = sessions.get(c.a.session), B = sessions.get(c.b.session)
  return A && B && A.first <= B.last && B.first <= A.last
}
const cutoff = Date.now() - DAYS * 86_400_000
const recent = all.filter(c => c.at >= cutoff)

// ---- Q2: same repo, different branch, inside an hour ----------------------
const branchClashes = []
const byRoot = new Map()
for (const e of events) {
  const r = gitRoot(e.path); if (!r || !e.at) continue
  if (!byRoot.has(r)) byRoot.set(r, [])
  byRoot.get(r).push({ ...e, root: r })
}
for (const [root, evs] of byRoot) {
  evs.sort((a, b) => a.at - b.at)
  const pairs = new Set()
  for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) {
    if (evs[j].at - evs[i].at > 3_600_000) break
    if (evs[i].session === evs[j].session) continue
    if (!evs[i].branch || !evs[j].branch || evs[i].branch === evs[j].branch) continue
    const k = [root, evs[i].branch, evs[j].branch].sort().join('::')
    if (!pairs.has(k)) { pairs.add(k); branchClashes.push({ root, a: evs[i].branch, b: evs[j].branch, at: evs[i].at }) }
  }
}

// ---- report ---------------------------------------------------------------
const fmt = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ')
const rel = p => { const r = gitRoot(p); return r && p.startsWith(r + '/') ? p.slice(r.length + 1) : p }
const claudeSessions = [...sessions.values()].filter(s => s.agent === 'claude')

console.log(`
M0 — measured ${fmt(Date.now())}   window ${WINDOW_MIN}m   recent = last ${DAYS}d

  edit events        ${events.length}   (dropped as noise: ${dropped})
  by capture         file-history-delta ${events.filter(e=>!e.via).length} · tool_use ${events.filter(e=>e.via==='tool').length} · bash ${events.filter(e=>e.via==='bash').length}
  total              ${events.length}   (claude ${events.filter(e => e.agent === 'claude').length} · codex ${events.filter(e => e.agent === 'codex').length} · opencode ${events.filter(e => e.agent === 'opencode').length})
  sessions           ${sessions.size}
  distinct files     ${byPath.size}
  git roots seen     ${byRoot.size}

Q1  same file, two sessions, within ${WINDOW_MIN} minutes
      last ${DAYS} days   ${recent.length}      <-- the gate: >= 5 clears
      of those, sessions genuinely overlapping in time   ${recent.filter(overlaps).length}
      distinct days on which one occurred                ${new Set(recent.map(c => fmt(c.at).slice(0, 10))).size}
      all time         ${all.length}
      span             ${all.length ? fmt(all[0].at) + '  ->  ' + fmt(all.at(-1).at) : 'n/a'}

Q2  same repo, different branch, within an hour
      all time         ${branchClashes.length}

Q3  claude sessions with no pr-link
      ${claudeSessions.filter(s => !s.prLink).length} of ${claudeSessions.length}

Blind spot (claude only) — edits skeins would MISS
      tool edits (tracked)      ${toolEdits}
      bash-shaped edits         ${bashEdits}
`)
if (all.length) {
  console.log(`Most recent collisions:`)
  for (const c of all.slice(-12)) {
    console.log(`  ${fmt(c.at)}  ${c.a.agent}/${c.b.agent}  ${c.gapMin.toFixed(0).padStart(3)}m  ${rel(c.path)}`)
  }
}
