// Codex — ~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<ts>-<id>.jsonl
//
// Richest of the three contracts: patch_apply_end.changes is a map of absolute
// path -> { type: "update" | "add" | "delete" }, so Codex tells us what KIND of
// change it made. Neither branch nor task title is recorded -- both render as
// absent, never as breakage (PRD acceptance criterion 4).
const KIND = { update: 'edit', add: 'add', delete: 'delete' }

export function parse(lines, { session, seed }) {
  const events = []
  const meta = { cwd: seed?.cwd ?? null, branch: null, title: seed?.title ?? null, prLink: false, first: seed?.first ?? Infinity, last: seed?.last ?? 0, context: seed?.context ?? 0, compactions: seed?.compactions ?? 0, model: seed?.model ?? null, limit: seed?.limit ?? 0 }

  for (const line of lines) {
    if (!line) continue
    let d
    try { d = JSON.parse(line) } catch { continue }
    if (!d || typeof d !== 'object') continue

    const at = d.timestamp ? Date.parse(d.timestamp) : 0
    if (at) { meta.first = Math.min(meta.first, at); meta.last = Math.max(meta.last, at) }

    const p = d.payload
    if (!p || typeof p !== 'object') continue

    // last_token_usage, NOT total_token_usage: the total is cumulative over the
    // session's life and was being read as window occupancy, which produced a
    // ceiling of 255M and a meter that meant nothing.
    //
    // Codex also states model_context_window outright, so for these sessions
    // the limit is known rather than inferred.
    const info = p.info ?? p
    const last = info.last_token_usage
    if (last) meta.context = (last.input_tokens ?? 0) + (last.cached_input_tokens ?? 0)
    if (info.model_context_window) meta.limit = info.model_context_window
    if (p.type === 'session_meta') meta.cwd ??= p.payload?.cwd ?? p.cwd ?? null
    if (p.type === 'turn_context') meta.cwd ??= p.cwd ?? p.workspace_roots?.[0] ?? null

    // No title is recorded; the first user prompt is the closest thing.
    if (!meta.title && p.type === 'user_message' && typeof p.message === 'string') {
      meta.title = p.message.split('\n')[0].slice(0, 60)
    }

    if (p.type === 'patch_apply_end' && p.changes && typeof p.changes === 'object') {
      for (const [path, change] of Object.entries(p.changes)) {
        events.push({ agent: 'codex', session, path, kind: KIND[change?.type] ?? 'edit', at, via: 'patch' })
      }
    }
  }
  return { events, meta }
}

import { basename } from 'node:path'
export const sessionIdFromPath = file => basename(file, '.jsonl').replace(/^rollout-/, '')
