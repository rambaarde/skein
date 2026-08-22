// Incremental parse cache (PRD D10). Transcripts are append-only, so a file
// whose size and mtime are unchanged is re-served from the cache, and a file
// that grew is parsed from its previous end rather than from byte zero.
//
// No daemon: nothing to start, nothing to have crashed.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { SKEIN_DIR, CACHE_FILE } from './paths.js'

// Bump this whenever the SHAPE of what gets cached changes — not just when the
// cache format does. A fix to how a token count is derived is invisible to a
// user whose cache still holds the number the old code computed; the file has
// not grown, so it is never re-read.
//
//   v2  Codex context stopped double-counting cached_input_tokens, which is a
//       subset of input_tokens rather than a sibling.
//   v3  sessions carry a tool-call tally. A cached session parsed by v2 has no
//       tools field at all, so without a bump every existing user would see an
//       empty tools tab forever and conclude the feature was broken.
//
// Exported so tests assert the BEHAVIOUR -- old discarded, current reused --
// rather than a number they have to be remembered to update.
export const VERSION = 3

export function load() {
  try {
    const c = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (c.version === VERSION) return c
  } catch {}
  return { version: VERSION, files: {} }
}

export function save(cache) {
  // Best-effort. A cache we cannot write is a slow skeins, never a broken one.
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
