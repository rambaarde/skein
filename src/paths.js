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
const xdg = (envVar, ...fallback) => {
  const v = process.env[envVar]
  return v && isAbsolute(v) ? v : join(HOME, ...fallback)
}
export const XDG_DATA = xdg('XDG_DATA_HOME', '.local', 'share')
export const XDG_CONFIG = xdg('XDG_CONFIG_HOME', '.config')

// Where each agent keeps its sessions. Detected, never configured (PRD D12).
export const STORES = {
  claude: join(HOME, '.claude', 'projects'),
  codex: join(HOME, '.codex', 'sessions'),
  opencode: join(XDG_DATA, 'opencode', 'storage'),
}

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
