import { homedir } from 'node:os'
import { join, isAbsolute } from 'node:path'

export const HOME = homedir()

// Where each agent keeps its sessions. Detected, never configured (PRD D12).
export const STORES = {
  claude: join(HOME, '.claude', 'projects'),
  codex: join(HOME, '.codex', 'sessions'),
  opencode: join(HOME, '.local', 'share', 'opencode', 'storage'),
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
