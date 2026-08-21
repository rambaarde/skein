// Incremental parse cache (PRD D10). Transcripts are append-only, so a file
// whose size and mtime are unchanged is re-served from the cache, and a file
// that grew is parsed from its previous end rather than from byte zero.
//
// No daemon: nothing to start, nothing to have crashed.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { SKEIN_DIR, CACHE_FILE } from './paths.js'

const VERSION = 1

export function load() {
  try {
    const c = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (c.version === VERSION) return c
  } catch {}
  return { version: VERSION, files: {} }
}

export function save(cache) {
  // Best-effort. A cache we cannot write is a slow skein, never a broken one.
  try {
    mkdirSync(SKEIN_DIR, { recursive: true })
    const tmp = `${CACHE_FILE}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(cache))
    renameSync(tmp, CACHE_FILE)
  } catch {}
}

// entry: { size, mtimeMs, events }
export const fresh = (entry, stat) =>
  entry && entry.mtimeMs === stat.mtimeMs && entry.size === stat.size

export const grew = (entry, stat) =>
  entry && stat.size > entry.size && entry.mtimeMs !== stat.mtimeMs
