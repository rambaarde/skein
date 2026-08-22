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

// What skeins looked for, and what it found there.
//
// A first run that finds nothing showed an empty grid and the words "0
// projects". That reads as a broken program, and it is the one moment where a
// user has no way to tell a bug from an empty machine -- reported by a real
// one on Linux, running an agent skeins does not read, with no way to discover
// that from the screen (AXI 5: a definitive empty state, never an ambiguous
// blank).
//
// Cheap on purpose: readdir and stat, no parsing. It runs only when there is
// nothing to show, so it never costs anything on a machine that has data.
export function probe({ now = Date.now() } = {}) {
  return Object.entries(STORES).map(([agent, dir]) => {
    if (!existsSync(dir)) return { agent, dir, found: false, files: 0, newest: 0 }
    const files = listFiles(dir, agent === 'opencode' ? '.json' : '.jsonl')
    let newest = 0
    for (const f of files) {
      try { newest = Math.max(newest, statSync(f).mtimeMs) } catch {}
    }
    return { agent, dir, found: true, files: files.length, newest }
  })
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

// Why a store produced nothing.
//
// probe() says a store exists and holds files. That was enough to tell one
// user his screen was not broken, and not enough to tell either of us WHY it
// was empty -- we spent several rounds guessing from screenshots. This opens
// the newest files a store has and reports what was actually in them: how many
// records, what KINDS of record, whether a cwd was resolved, and how many edit
// events came out.
//
// The record histogram is the part that catches format drift. An agent that
// renames the event skeins reads shows up here as a type nobody recognises,
// rather than as an empty dashboard.
export function diagnose({ now = Date.now(), sinceMs = now - 86_400_000, sample = 4 } = {}) {
  const readers = { claude, codex, opencode }
  return Object.entries(STORES).map(([agent, dir]) => {
    const out = { agent, dir, found: existsSync(dir), files: 0, inWindow: 0, records: 0, events: 0, cwd: null, types: [] }
    if (!out.found) return out
    const all = listFiles(dir, agent === 'opencode' ? '.json' : '.jsonl')
      .map(f => { try { return { f, at: statSync(f).mtimeMs } } catch { return null } })
      .filter(Boolean)
    out.files = all.length
    const recent = all.filter(x => x.at >= sinceMs).sort((a, b) => b.at - a.at)
    out.inWindow = recent.length

    const types = new Map()
    for (const { f } of recent.slice(0, sample)) {
      let text
      try { text = readFileSync(f, 'utf8') } catch { continue }
      if (agent === 'opencode') {
        out.records++
        let d
        try { d = JSON.parse(text) } catch { continue }
        const k = d?.type === 'tool' ? `tool:${d.tool}` : String(d?.type)
        types.set(k, (types.get(k) ?? 0) + 1)
        if (opencode.parsePart(text, { file: f })) out.events++
        continue
      }
      const lines = text.split('\n').filter(Boolean)
      out.records += lines.length
      for (const line of lines) {
        let d
        try { d = JSON.parse(line) } catch { continue }
        const p = d.payload ?? d
        const k = `${p.type ?? '(no type)'}${p.name ? `:${p.name}` : ''}`
        types.set(k, (types.get(k) ?? 0) + 1)
      }
      const { events, meta } = readers[agent].parse(lines, { session: 'diagnose' })
      out.events += events.length
      out.cwd ??= meta.cwd ?? null
    }
    out.types = [...types].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, n]) => ({ type, n }))
    return out
  })
}
