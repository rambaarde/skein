// opencode — ~/.local/share/opencode/storage/
//
//   part/<messageId>/<partId>.json   one file per tool call
//   session/<...>.json               session -> projectID
//   project/<id>.json                { worktree } -- the project root, given
//
// The only one of the three that hands us the project directly rather than
// making us infer it from a cwd. Distinguishes read from edit, so reads are
// dropped for free (PRD Q5: writes only in v1).
import { readFileSync } from 'node:fs'

const EDIT_TOOLS = new Set(['edit', 'write', 'patch', 'multiedit'])

// The tool name of any completed tool part, edit or not.
//
// parsePart drops everything that is not an edit, which is right for the
// collision primitive and wrong for counting work: a session is mostly reads,
// greps and shell commands, and reporting only its writes describes a fraction
// of what it did. opencode is the one agent that states the tool name plainly
// on every part, so this costs a field read.
export function toolOf(json) {
  let d
  try { d = typeof json === 'string' ? JSON.parse(json) : json } catch { return null }
  if (d?.type !== 'tool' || typeof d.tool !== 'string' || !d.tool) return null
  if (d?.state?.status && d.state.status !== 'completed') return null
  return { session: d.sessionID ?? 'unknown', tool: d.tool, at: d?.state?.time?.start ?? 0 }
}

export function parsePart(json, { file }) {
  let d
  try { d = typeof json === 'string' ? JSON.parse(json) : json } catch { return null }
  if (d?.type !== 'tool' || !EDIT_TOOLS.has(d.tool)) return null
  if (d?.state?.status && d.state.status !== 'completed') return null
  const path = d?.state?.input?.filePath ?? d?.state?.input?.file_path
  if (!path) return null
  return {
    agent: 'opencode',
    session: d.sessionID ?? 'unknown',
    path,
    kind: d.tool === 'write' ? 'add' : 'edit',
    at: d?.state?.time?.start ?? 0,
    via: 'tool',
  }
}

export function readProjects(storageDir, listFiles) {
  const projects = new Map()   // projectID -> worktree
  const sessions = new Map()   // sessionID -> worktree
  for (const f of listFiles(`${storageDir}/project`)) {
    try {
      const d = JSON.parse(readFileSync(f, 'utf8'))
      if (d?.id && d?.worktree) projects.set(d.id, d.worktree)
    } catch {}
  }
  for (const f of listFiles(`${storageDir}/session`)) {
    try {
      const d = JSON.parse(readFileSync(f, 'utf8'))
      const root = projects.get(d?.projectID)
      if (d?.id && root) sessions.set(d.id, root)
    } catch {}
  }
  return sessions
}
