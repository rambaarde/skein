// Read every agent's sessions into one normalised stream of edit events.
// Nothing downstream knows which agent an event came from (PRD §5.1).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { STORES } from '../paths.js'
import { load, save, fresh } from '../cache.js'
import { readLines } from '../lines.js'
import * as claude from './claude.js'
import * as codex from './codex.js'
import * as opencode from './opencode.js'

const listFiles = (dir, ext, out = []) => {
  let ents
  try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = join(dir, e.name)
    if (e.isDirectory()) listFiles(p, ext, out)
    else if (!ext || p.endsWith(ext)) out.push(p)
  }
  return out
}

// `sinceMs` bounds the COLD read: a transcript untouched since then cannot
// contain an event we care about, so it is never opened. Without this, a first
// run pays for every byte of history ever written -- 2.5 GB and 16 s on the
// author's machine. With it, ~1 s.
export function collect({ useCache = true, sinceMs = Date.now() - 30 * 86_400_000 } = {}) {
  const cache = useCache ? load() : { version: 1, files: {} }
  const events = []
  const sessions = new Map()
  // The TUI re-reads every two seconds. Rewriting a multi-megabyte cache on
  // every tick when nothing on disk moved is pure churn, so the save is
  // conditional on an actual parse having happened.
  let dirty = false

  const ingest = (file, reader, sessionId) => {
    let st
    try { st = statSync(file) } catch { return }
    const key = file
    const prev = cache.files[key]
    if (!prev && st.mtimeMs < sinceMs) return   // too old to matter, never opened
    // The transcript's mtime is the only honest liveness signal we have. A
    // session that is thinking, reading, or waiting on you appends messages
    // without writing a single file, so counting edits reported "nothing is
    // running" at the exact moment an agent was running. Carry the mtime.
    if (fresh(prev, st)) {
      for (const e of prev.events) events.push(e)
      if (prev.meta) sessions.set(sessionId, { agent: prev.meta.agent, ...prev.meta, seen: st.mtimeMs })
      return
    }
    // Append-only fast path: parse only the new tail, keep what we had.
    const canTail = prev && st.size > prev.size
    const { events: fresh_, meta } = reader.parse(
      readLines(file, canTail ? prev.size : 0, st.size),
      { session: sessionId, seed: canTail ? prev.meta : null })
    const merged = canTail ? [...prev.events, ...fresh_] : fresh_
    dirty = true
    cache.files[key] = { size: st.size, mtimeMs: st.mtimeMs, events: merged, meta: { ...meta, agent: reader.AGENT } }
    for (const e of merged) events.push(e)
    sessions.set(sessionId, { agent: reader.AGENT, ...meta, seen: st.mtimeMs })
  }

  if (existsSync(STORES.claude))
    for (const f of listFiles(STORES.claude, '.jsonl'))
      ingest(f, { ...claude, AGENT: 'claude' }, claude.sessionIdFromPath(f))

  if (existsSync(STORES.codex))
    for (const f of listFiles(STORES.codex, '.jsonl'))
      ingest(f, { ...codex, AGENT: 'codex' }, codex.sessionIdFromPath(f))

  if (existsSync(STORES.opencode)) {
    const roots = opencode.readProjects(STORES.opencode, d => listFiles(d, '.json'))
    for (const f of listFiles(join(STORES.opencode, 'part'), '.json')) {
      let st
      try { st = statSync(f) } catch { continue }
      const prev = cache.files[f]
      if (!prev && st.mtimeMs < sinceMs) continue
      let ev, tool
      if (fresh(prev, st)) { ev = prev.events[0] ?? null; tool = prev.meta ?? null }
      else {
        const raw = readFileSync(f, 'utf8')
        ev = opencode.parsePart(raw, { file: f })
        // Cached even when the part is not an edit, or the tool count would be
        // right on the first run and empty on every one after it -- the file
        // has not changed, so it is never read again.
        tool = opencode.toolOf(raw)
        dirty = true
        cache.files[f] = { size: st.size, mtimeMs: st.mtimeMs, events: ev ? [ev] : [], meta: tool }
      }
      if (tool) {
        const root = roots.get(tool.session)
        if (!sessions.has(tool.session)) {
          sessions.set(tool.session, { agent: 'opencode', cwd: root ?? null, branch: null, title: null, prLink: false, first: tool.at, last: tool.at, tools: {} })
        }
        const s = sessions.get(tool.session)
        s.tools = s.tools ?? {}
        s.tools[tool.tool] = (s.tools[tool.tool] ?? 0) + 1
      }
      if (!ev) continue
      const root = roots.get(ev.session)
      events.push(root ? { ...ev, project: root } : ev)
      if (!sessions.has(ev.session)) sessions.set(ev.session, { agent: 'opencode', cwd: root ?? null, branch: null, title: null, prLink: false, first: ev.at, last: ev.at, tools: {} })
      const s = sessions.get(ev.session)
      s.first = Math.min(s.first ?? Infinity, ev.at); s.last = Math.max(s.last ?? 0, ev.at)
    }
  }

  if (useCache && dirty) save(cache)
  events.sort((a, b) => a.at - b.at)
  return { events, sessions, dirty }
}
