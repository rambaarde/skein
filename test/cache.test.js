import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// SKEIN_HOME is resolved when paths.js is imported, so each case needs its own
// process rather than a mutated env inside this one. The specifier must be a
// file:// URL: on Windows a bare absolute path is 'D:\\a\\...', which the ESM
// loader reads as a URL with the scheme 'd:'. .href and NOT .pathname — the
// pathname of a Windows file URL is '/D:/a/...', which is not a path either.
const CACHE_MOD = new URL('../src/cache.js', import.meta.url).href
const { VERSION } = await import(CACHE_MOD)
const inHome = (home, src) =>
  JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', src],
    { env: { ...process.env, SKEIN_HOME: home }, encoding: 'utf8' }))

const seed = (version, files) => {
  const home = mkdtempSync(join(tmpdir(), 'skein-cache-'))
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'cache.json'), JSON.stringify({ version, files }))
  return home
}

test('a cache written by an older version is discarded, not trusted', () => {
  // This is how a parsing fix reaches someone who already ran skein. Their
  // transcripts have not changed, so nothing is re-read and they keep whatever
  // the old code derived. The Codex double-count survived three verification
  // runs this way, until the cache was cleared by hand — which no user will do.
  const home = seed(VERSION - 1, { '/a.jsonl': { size: 10, ctx: 446_084 } })
  const c = inHome(home, `import {load} from '${CACHE_MOD}'
    console.log(JSON.stringify(load()))`)
  assert.equal(Object.keys(c.files).length, 0, 'a cache from the previous version must not survive')
  assert.equal(c.version, VERSION)
  rmSync(home, { recursive: true, force: true })
})

test('a cache at the current version is reused', () => {
  // The other half: bumping must not mean re-parsing everything on every run.
  const home = seed(VERSION, { '/a.jsonl': { size: 10, ctx: 226_000 } })
  const c = inHome(home, `import {load} from '${CACHE_MOD}'
    console.log(JSON.stringify(load()))`)
  assert.equal(c.files['/a.jsonl'].ctx, 226_000)
  rmSync(home, { recursive: true, force: true })
})
