import { homedir } from 'node:os'
import { join, isAbsolute } from 'node:path'

export const HOME = homedir()

// XDG, because ~/.local/share is a DEFAULT and not a rule.
//
// It is the default on Linux and it is what most people have, which is exactly
// why hardcoding it survives every test on a laptop and then finds nothing on
// somebody else's. A user who sets XDG_DATA_HOME -- and distributions and
// dotfile frameworks set it for people who never asked -- got an empty screen
// with no way to tell why.
const xdg = (env, home, envVar, ...fallback) => {
  const v = env[envVar]
  return v && isAbsolute(v) ? v : join(home, ...fallback)
}
export const XDG_DATA = xdg(process.env, HOME, 'XDG_DATA_HOME', '.local', 'share')
export const XDG_CONFIG = xdg(process.env, HOME, 'XDG_CONFIG_HOME', '.config')

// CLAUDE_CONFIG_DIR moves ~/.claude wholesale. It is how people keep a work
// account and a personal one apart, and skein reading the wrong one -- or
// nothing at all -- is the same empty screen with a different cause.
export const claudeDirIn = (home, env = process.env) =>
  env.CLAUDE_CONFIG_DIR && isAbsolute(env.CLAUDE_CONFIG_DIR) ? env.CLAUDE_CONFIG_DIR : join(home, '.claude')
export const CLAUDE_DIR = claudeDirIn(HOME)

// Where each agent keeps its sessions. Detected, never configured (PRD D12) --
// but detection has to include the variables the agents themselves honour, or
// "detected" means "assumed".
// Resolved for an arbitrary home, so the thing that BUILDS a fixture world and
// the thing that READS one cannot disagree about where it goes. They did: the
// sandbox hardcoded ~/.local/share while skein had learned to honour
// XDG_DATA_HOME, which is the same duplication that produced the bug in the
// first place, one layer down.
export const storesIn = (home, env = process.env) => ({
  claude: join(claudeDirIn(home, env), 'projects'),
  codex: join(home, '.codex', 'sessions'),
  opencode: join(xdg(env, home, 'XDG_DATA_HOME', '.local', 'share'), 'opencode', 'storage'),
})

export const STORES = storesIn(HOME)

// skein's own state. The only thing we ever write (PRD acceptance criterion 1).
export const SKEIN_DIR = process.env.SKEIN_HOME || join(HOME, '.skein')
export const CACHE_FILE = join(SKEIN_DIR, 'cache.json')

// Resolve a possibly-relative path recorded by an agent against its cwd.
export const abs = (p, cwd) => {
  if (!p) return null
  if (isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) return p
  if (p.startsWith('~/')) return join(HOME, p.slice(2))
  return cwd ? join(cwd, p) : null
}
