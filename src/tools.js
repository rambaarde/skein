// What the agents actually did, as opposed to what they left behind.
//
// skeins has always counted FILES CHANGED, because that is what the collision
// primitive needs. But a session is mostly reads, searches and shell commands:
// the writes are the visible residue of the work, not the work. A project that
// shows nine files touched can be nine minutes of editing or four hours of
// reading the codebase to find the nine.
//
// Every agent already states this on disk and skeins was walking straight past
// it -- the claude reader iterated every tool_use block and kept only the ones
// that wrote a file.
//
// Read from the transcripts, not from agtop. agtop is GPL-2.0 and skeins is
// Apache-2.0, so its source stays unread (founder thesis R8); the agents write
// these records for themselves and reading them is the same thing skeins has
// done since the first commit.

// A session's tally is a plain object so it survives JSON round-tripping
// through the parse cache without a revive step.
export const EMPTY = Object.freeze({})

// Sum the per-session tallies for one project.
//
// A project's sessions are the ones that edited in it plus the ones open in
// it -- the same two routes byProject uses, so the panes cannot disagree about
// whose sessions these are.
export function toolsOf(project, sessions) {
  const out = new Map()
  // Sessions attributed by EDIT, plus sessions merely open in this project.
  //
  // Reads outnumber writes several to one, so a session can make five hundred
  // tool calls and land four edits -- and if those edits belong to a nested
  // repo, the project it is actually working in had no session by this map at
  // all. A real one reported "no tool calls recorded" against 524 of them.
  // The tools pane exists to show the reading, so it must not be reachable
  // only through writing.
  const ids = new Set([
    ...(project?.events ?? []).map(e => e.session),
    ...(project?.open ?? []).map(o => o.session),
  ])
  for (const id of ids) {
    const tools = sessions?.get?.(id)?.tools
    if (!tools) continue
    for (const [name, n] of Object.entries(tools)) out.set(name, (out.get(name) ?? 0) + n)
  }
  return [...out.entries()]
    .map(([tool, n]) => ({ tool, n }))
    // Busiest first, then alphabetically, so a tie does not reorder between
    // frames and make the pane look like it is churning.
    .sort((a, b) => b.n - a.n || a.tool.localeCompare(b.tool))
}

export const totalOf = tools => tools.reduce((n, t) => n + t.n, 0)

// Reads outnumber writes several to one, and that ratio is the interesting
// number: it is the difference between a session that was building and one
// that was working out what to build.
// The lookahead is a word boundary that `\b` cannot express here: without
// it `^edit` matches `editorconfig` and a config file becomes a write.
const READING = /^(read|grep|glob|search|list|ls|outline|web_?search|web_?fetch|fetch)(?![a-z])/i
const WRITING = /^(edit|write|multiedit|patch|apply_patch|notebookedit|notebook)(?![a-z])/i
const RUNNING = /^(bash|exec|shell|run|command)(?![a-z])/i

// An MCP tool arrives namespaced -- `mcp__plugin_trueline-mcp_mcp__trueline_read`
// -- so a pattern anchored at the start of the whole name never matches one,
// and every MCP call was landing in 'other'. On a machine that uses an MCP
// server for reads and edits that is most of the session, and it made the
// read:write ratio describe the wrong thing entirely.
//
// The last `__` segment is the tool's own name; everything before it is the
// server it came from.
export const shortTool = tool => String(tool ?? '').split('__').pop() || String(tool ?? '')

// And the name itself is often prefixed too -- `trueline_read`, `web_search`,
// `apply_patch` -- so the verb is matched against the whole short name AND
// against its last underscore segment. Anchoring at the start of either is
// what keeps `read_the_docs` a read and stops `editorconfig` becoming a write.
export function classify(tool) {
  const short = shortTool(tool)
  const names = [short, short.split('_').pop()]
  const any = re => names.some(n => re.test(n))
  return any(WRITING) ? 'write' : any(READING) ? 'read' : any(RUNNING) ? 'run' : 'other'
}

// The same tally, grouped into the three things an agent spends its turn on.
// Named 'other' rather than folded into one of the three, because a tool this
// does not recognise is an unknown, and quietly filing it under 'run' would
// make the ratio wrong in a way nobody could see.
export function shape(tools) {
  const out = { read: 0, write: 0, run: 0, other: 0 }
  for (const { tool, n } of tools) out[classify(tool)] += n
  return out
}
