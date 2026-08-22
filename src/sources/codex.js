// Codex — ~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<ts>-<id>.jsonl
//
// Richest of the three contracts: patch_apply_end.changes is a map of absolute
// path -> { type: "update" | "add" | "delete" }, so Codex tells us what KIND of
// change it made. Neither branch nor task title is recorded -- both render as
// absent, never as breakage (PRD acceptance criterion 4).
import { isAbsolute } from 'node:path'
import { abs } from '../paths.js'
import { bashTargets, bashCwd } from './bash.js'

const KIND = { update: 'edit', add: 'add', delete: 'delete' }

// The shell command out of Codex's tool call. It hands its own tool a snippet
// of JavaScript rather than a bare command:
//
//   const r = await tools.exec_command({cmd:"sed -n '1,20p' foo.ts", ...})
//
// so the command is the first quoted `cmd:` argument. Non-greedy to the
// closing quote, and unescaped, because the JSON layer has already escaped it
// once and the shell parser wants the real thing.
export function shellOf(input) {
  if (typeof input !== 'string') return null
  const m = /\bcmd\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(input)
  if (m) return m[1].replace(/\\(.)/g, '$1')
  // A plain string, or JSON arguments, are both plausible shapes for other
  // Codex versions. Take the string itself rather than guessing at a schema.
  try {
    const j = JSON.parse(input)
    if (typeof j?.cmd === 'string') return j.cmd
    if (typeof j?.command === 'string') return j.command
    if (Array.isArray(j?.command)) return j.command.join(' ')
  } catch {}
  return null
}

export function parse(lines, { session, seed }) {
  const events = []
  const meta = { tools: { ...(seed?.tools ?? {}) }, cwd: seed?.cwd ?? null, branch: null, title: seed?.title ?? null, prLink: false, first: seed?.first ?? Infinity, last: seed?.last ?? 0, context: seed?.context ?? 0, compactions: seed?.compactions ?? 0, model: seed?.model ?? null, limit: seed?.limit ?? 0 }

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
    // Codex's cached_input_tokens is a SUBSET of input_tokens, not a sibling
    // of it — adding the two double-counts and pushed sessions to 173% of a
    // window Codex itself states as 258400. Its own total_tokens is the
    // occupancy, and it already accounts for the split.
    const last = info.last_token_usage
    if (last) meta.context = last.total_tokens ?? (last.input_tokens ?? 0) + (last.output_tokens ?? 0)
    if (info.model_context_window) meta.limit = info.model_context_window
    // The cwd comes from wherever it is stated, including the header line --
    // which carries `cwd` and NO `type` at all. Matching on session_meta alone
    // meant every rollout on this machine parsed with cwd null, and a null cwd
    // is a project that cannot be resolved: a Codex user saw zero projects
    // with a store full of fresh sessions.
    meta.cwd ??= p.cwd ?? p.payload?.cwd ?? p.workspace_roots?.[0] ?? null

    // No title is recorded; the first user prompt is the closest thing.
    if (!meta.title && p.type === 'user_message' && typeof p.message === 'string') {
      meta.title = p.message.split('\n')[0].slice(0, 60)
    }

    // Tool names, read off the rollout rather than guessed at. Verified
    // against real sessions: codex records a call as `custom_tool_call` (or
    // `function_call`) carrying `.name`, and states the two it does not name
    // that way -- a patch and a web search -- as their own event types.
    const called = (p.type === 'custom_tool_call' || p.type === 'function_call') ? p.name
      : p.type === 'patch_apply_end' ? 'apply_patch'
      : p.type === 'web_search_end' ? 'web_search'
      : null
    if (typeof called === 'string' && called) meta.tools[called] = (meta.tools[called] ?? 0) + 1

    // Codex edits through the SHELL far more than it patches. Measured across
    // five real rollouts: apply_patch 18 calls against exec 652 and
    // exec_command 315 -- so reading only patch_apply_end sees a few percent
    // of what a session did, and none at all of a session that never patched.
    // The Claude reader has parsed shell writes since the first commit; this
    // one simply never did.
    //
    // The command is inside `input`, wrapped in the JS Codex hands its own
    // tool: `const r = await tools.exec_command({cmd:"...", ...})`.
    if ((p.type === 'custom_tool_call' || p.type === 'function_call') && /^exec/.test(p.name ?? '')) {
      const cmd = shellOf(p.input ?? p.arguments)
      if (cmd) {
        const base = bashCwd(cmd)
        for (const fp of bashTargets(cmd)) {
          const path = abs(fp, base && isAbsolute(base) ? base : meta.cwd)
          // A relative write under an unresolvable cd is dropped rather than
          // filed under the wrong project -- the same rule the Claude reader
          // keeps.
          if (path && !(base && !isAbsolute(base) && !isAbsolute(fp))) {
            events.push({ agent: 'codex', session, path, kind: 'edit', at, via: 'bash' })
          }
        }
      }
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
