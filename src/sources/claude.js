// Claude Code — ~/.claude/projects/<slug>/<sessionId>.jsonl
//
// Three capture paths, because one is not enough. M0 measured the split over
// 30 days of real history:
//
//   file-history-delta   2110   (present in only 63 of 197 transcripts)
//   Edit/Write/MCP edit  5090
//   shell writes         1650
//
// Reading only the first -- which is what the founder thesis assumed was the
// whole contract -- finds 6 collisions where there are 97.
import { bashTargets, bashCwd } from './bash.js'
import { abs } from '../paths.js'
import { contextOf } from '../context.js'
import { basename, isAbsolute } from 'node:path'

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const isEditTool = name =>
  EDIT_TOOLS.has(name) || /trueline_edit$/.test(name ?? '') || /__(edit|write)$/.test(name ?? '')

export function parse(lines, { session, seed }) {
  const events = []
  const meta = { tools: { ...(seed?.tools ?? {}) }, cwd: seed?.cwd ?? null, branch: seed?.branch ?? null, title: seed?.title ?? null, prLink: seed?.prLink ?? false, first: seed?.first ?? Infinity, last: seed?.last ?? 0, context: seed?.context ?? 0, compactions: seed?.compactions ?? 0, dropped: seed?.dropped ?? 0, compactMs: seed?.compactMs ?? 0, autoCompactions: seed?.autoCompactions ?? 0, model: seed?.model ?? null, limit: seed?.limit ?? 0 }

  for (const line of lines) {
    if (!line) continue
    let d
    try { d = JSON.parse(line) } catch { continue }
    if (!d || typeof d !== 'object') continue

    const at = d.timestamp ? Date.parse(d.timestamp) : 0
    if (at) { meta.first = Math.min(meta.first, at); meta.last = Math.max(meta.last, at) }
    // Claude records the session's own summary as `aiTitle`; when it has not
    // produced one yet, the last prompt is the closest honest stand-in.
    // Context pressure: the newest request's total is the session's current
    // fill. Not a running sum — the window is what it holds now, not what has
    // ever passed through it.
    const usage = d?.message?.usage
    if (usage) meta.context = contextOf(usage)
    if (d?.message?.model) meta.model = d.message.model
    // A compaction, and what it cost.
    //
    // This looked for `compact_file_reference`, a record type Claude Code no
    // longer writes: measured across 169 transcripts in thirty days, skeins
    // reported ZERO compactions against 36 that actually happened, 21 sessions
    // affected, 58.8M tokens dropped and 83 minutes of wall clock spent. A
    // metric that silently reads zero is worse than an absent one, because
    // nobody goes looking for it.
    //
    // The real record states what it cost, which is the part worth having:
    //   { type: 'system', subtype: 'compact_boundary', compactMetadata: {
    //       trigger: 'auto' | 'manual', preTokens, postTokens,
    //       cumulativeDroppedTokens, durationMs } }
    //
    // durationMs is ATTENTION -- time the session spent rebuilding a picture
    // it already had -- and `trigger: auto` means the ceiling was hit rather
    // than a compaction chosen. 33 of those 36 were automatic.
    if (d.type === 'system' && d.subtype === 'compact_boundary') {
      const m = d.compactMetadata ?? {}
      meta.compactions++
      meta.dropped = (meta.dropped ?? 0) + (m.cumulativeDroppedTokens ?? 0)
      meta.compactMs = (meta.compactMs ?? 0) + (m.durationMs ?? 0)
      if (m.trigger === 'auto') meta.autoCompactions = (meta.autoCompactions ?? 0) + 1
    }

    if (d.type === 'ai-title' && typeof d.aiTitle === 'string') meta.title = d.aiTitle
    if (d.type === 'last-prompt' && typeof d.lastPrompt === 'string' && !meta.title) meta.title = d.lastPrompt
    if (d.type === 'pr-link') meta.prLink = true

    // Tool calls are tallied BEFORE the sidechain skip, unlike edits. A
    // subagent's edits must not collide with its parent's, but its tool calls
    // are work the parent session caused -- counting the session's own calls
    // and not its subagents' would understate what it actually did.
    const blocks = d?.message?.content
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (b?.type === 'tool_use' && typeof b.name === 'string') {
          meta.tools[b.name] = (meta.tools[b.name] ?? 0) + 1
        }
      }
    }

    // Subagent work belongs to its parent session: a session must never
    // collide with its own subagent.
    if (d.isSidechain) continue

    if (d.cwd && !meta.cwd) meta.cwd = d.cwd
    if (d.gitBranch && d.gitBranch !== 'HEAD') meta.branch = d.gitBranch

    const push = (path, kind, via) => {
      const p = abs(path, meta.cwd)
      if (p) events.push({ agent: 'claude', session, path: p, kind, at, via })
    }

    if (d.type === 'file-history-delta' && d.trackingPath) push(d.trackingPath, 'edit', 'delta')

    const content = d?.message?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      if (b?.type !== 'tool_use') continue
      if (isEditTool(b.name)) {
        const fp = b.input?.file_path ?? b.input?.notebook_path ?? b.input?.path
        if (fp) push(fp, b.name === 'Write' ? 'add' : 'edit', 'tool')
      } else if (b.name === 'Bash') {
        const cmd = b.input?.command
        const base = bashCwd(cmd)
        for (const fp of bashTargets(cmd)) {
          const p = abs(fp, base && isAbsolute(base) ? base : meta.cwd)
          // A relative write under an unresolvable cd is dropped rather than
          // filed under the wrong project.
          if (p && !(base && !isAbsolute(base) && !isAbsolute(fp))) {
            events.push({ agent: 'claude', session, path: p, kind: 'edit', at, via: 'bash' })
          }
        }
      }
    }
  }
  return { events, meta }
}

export const sessionIdFromPath = file => basename(file, '.jsonl')
