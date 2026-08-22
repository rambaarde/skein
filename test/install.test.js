import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// URL.pathname yields '/D:/a/...' on Windows, which resolves to 'D:\D:\a\...'.
const bin = fileURLToPath(new URL('../bin/skein.js', import.meta.url))

const fakeHome = () => {
  const home = mkdtempSync(join(tmpdir(), 'skein-test-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(join(home, '.codex'), { recursive: true })
  mkdirSync(join(home, '.config', 'opencode'), { recursive: true })
  return home
}
// os.homedir() reads USERPROFILE on Windows and HOME elsewhere. Set both, or
// these tests write into the real profile on one of the three platforms.
//
// And HOME alone is not enough, which CI proved: skein honours XDG_CONFIG_HOME
// and CLAUDE_CONFIG_DIR now, the GitHub Ubuntu runner SETS XDG_CONFIG_HOME, and
// the child inherited it -- so install correctly wrote the opencode plugin
// outside the temporary home and the assertion looked in the wrong place. The
// behaviour was right and the harness was leaking. Same hole the sandbox had,
// one layer down: anything that overrides HOME must pin the rest with it.
const install = home => execFileSync(process.execPath, [bin, 'install'], {
  env: {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    SKEIN_HOME: join(home, '.skein'),
  },
  encoding: 'utf8',
})
const settings = home => JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'))
const commands = s => s.hooks.SessionStart.flatMap(e => e.hooks.map(h => h.command))

test('install never destroys a hook that was already there', () => {
  const home = fakeHome()
  writeFileSync(join(home, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'mine.sh' }] }] } }))
  install(home)
  const cmds = commands(settings(home))
  assert.ok(cmds.includes('mine.sh'), 'existing hook survived')
  assert.ok(cmds.includes('skein hook'), 'skein was added')
})

test('install is idempotent', () => {
  const home = fakeHome()
  install(home)
  install(home)
  assert.equal(commands(settings(home)).filter(c => c === 'skein hook').length, 1)
})

test('install backs up anything it edits', () => {
  const home = fakeHome()
  writeFileSync(join(home, '.claude', 'settings.json'), '{"model":"opus"}')
  install(home)
  assert.ok(existsSync(join(home, '.claude', 'settings.json.skein-bak')))
  assert.equal(settings(home).model, 'opus', 'unrelated settings survive')
})

test('install skips agents that are not installed', () => {
  const home = mkdtempSync(join(tmpdir(), 'skein-empty-'))
  const out = install(home)
  assert.match(out, /not installed — skipped/)
})

test('all three agents get a session-start surface', () => {
  const home = fakeHome()
  install(home)
  assert.ok(existsSync(join(home, '.codex', 'hooks.json')))
  assert.ok(existsSync(join(home, '.config', 'opencode', 'plugins', 'skein.js')))
})
