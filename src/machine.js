// What the OS knows that the transcripts do not: which agent process is
// actually running, where its cwd is, and how much CPU it is spending.
//
// Sampled on the SLOW poll timer, not the paint timer. Measured on a real
// machine with eight running agents: one `ps` call and one batched `lsof`
// call cost ~50ms each. A per-process `lsof -p <pid>` call costs 22ms, so
// eight of those is 178ms -- more than the whole 1s paint budget. Batched
// once, on a timer that already backs off from 2s to 16s, it is free.
import { execFileSync } from 'node:child_process'
import { readlinkSync } from 'node:fs'
import { normalize } from 'node:path'
import { gitRoot } from './project.js'

const WIN = process.platform === 'win32'
const LINUX = process.platform === 'linux'
const pathKey = p => normalize(String(p ?? '')).replace(/\\/g, '/').toLowerCase()
export const AGENTS = ['claude', 'codex', 'opencode']

// pid -> { cpu, agent }, filtered to the three agents skein already reads
// transcripts from. Anything else running is not this tool's business.
function psSample() {
  if (WIN) return new Map()
  let raw
  try {
    raw = execFileSync('ps', ['-Ao', 'pid,pcpu,comm'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch { return new Map() }
  const out = new Map()
  for (const line of raw.split('\n').slice(1)) {
    const m = /^\s*(\d+)\s+([\d.]+)\s+(.*)$/.exec(line)
    if (!m) continue
    // `comm` on Linux is truncated to 15 characters and on macOS may be a
    // full path; matching a PREFIX against the short name catches both
    // without either platform's quirk becoming a miss.
    const name = m[3].trim().split('/').pop()
    const agent = AGENTS.find(a => name === a || name.startsWith(a))
    if (!agent) continue
    out.set(Number(m[1]), { cpu: Number(m[2]), agent })
  }
  return out
}

// pid -> cwd, for exactly the pids psSample found.
//
// Linux: one readlink per pid, which is a syscall, not a subprocess -- cheap
// enough to do per-pid. macOS/BSD have no /proc, so lsof is batched across
// every agent process in ONE call rather than one call per pid; that is the
// 22ms x N versus 52ms difference above.
function cwdSample(pids) {
  if (WIN || !pids.size) return new Map()
  const out = new Map()
  if (LINUX) {
    for (const pid of pids) {
      try { out.set(pid, readlinkSync(`/proc/${pid}/cwd`)) } catch {}
    }
    return out
  }
  // lsof exits 1 whenever it cannot fully introspect ONE process -- a
  // permission it does not have, one that exited mid-scan -- while still
  // printing everything it could read. execFileSync throws on that exit code,
  // and the thrown error carries the good output on .stdout; discarding it
  // meant this returned nothing on a machine with any agent process it
  // couldn't fully see, which in practice was every real run.
  let raw
  try {
    raw = execFileSync('lsof', ['-d', 'cwd', '-a', ...AGENTS.flatMap(a => ['-c', a]), '-Fpn'],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) {
    raw = typeof e.stdout === 'string' ? e.stdout : null
    if (!raw) return out
  }
  let pid = null
  for (const line of raw.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n' && pid !== null && pids.has(pid)) out.set(pid, line.slice(1))
  }
  return out
}

// One machine-wide sample: which project each running agent process is
// sitting in right now, and how much CPU it is using.
//
// This is a SNAPSHOT, unlike everything else skein reads. Transcripts are a
// record of what happened; this is only ever true for the instant it was
// taken, and the caller decides how long to trust it (the same poll interval
// that governs everything else on screen).
// Both readers are injectable, the same discipline delivery.js and estate.js
// already keep: a test that calls the REAL ps/lsof is a test of this
// machine's process table at this instant, not of skein's logic, and it is
// flaky on any CI runner with no agent of its own running.
export function sample({ ps: psFn = psSample, cwd: cwdFn = cwdSample } = {}) {
  const ps = psFn()
  const cwd = cwdFn(new Set(ps.keys()))
  const rows = []
  for (const [pid, p] of ps) {
    const dir = cwd.get(pid) ?? null
    rows.push({ pid, agent: p.agent, cpu: p.cpu, cwd: dir, root: dir ? gitRoot(`${dir}/.`) : null })
  }
  return rows
}

// Pooled per project root.
//
// A process with no resolvable cwd -- permission denied, or it exited between
// the two calls that make up one sample -- is counted in `unrooted` rather
// than silently dropped. The CPU is real even when skein cannot say whose
// project it belongs to, and AXI 5 says that gap has to be visible.
export function byRoot(rows) {
  const roots = new Map()
  let unrooted = 0
  for (const r of rows) {
    if (!r.root) { unrooted += r.cpu; continue }
    const cur = roots.get(r.root) ?? { cpu: 0, agents: new Set() }
    cur.cpu += r.cpu
    cur.agents.add(r.agent)
    roots.set(r.root, cur)
  }
  return { roots, unrooted, rows }
}

/** Attribute sampled processes to most-specific linked checkout paths. */
export function attributeToPaths(rows, paths) {
  const out = new Map(paths.map(path => [path, { cpu: 0, agents: new Set() }]))
  const keys = new Map(paths.map(path => [path, pathKey(path)]))
  for (const row of rows) {
    const cwd = pathKey(row.cwd)
    const path = [...out.keys()]
      .filter(candidate => cwd === keys.get(candidate) || cwd.startsWith(`${keys.get(candidate)}/`))
      .sort((a, b) => b.length - a.length)[0]
    if (!path) continue
    const bucket = out.get(path)
    bucket.cpu += row.cpu
    bucket.agents.add(row.agent)
  }
  return out
}
