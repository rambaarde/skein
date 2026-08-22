// What the agents actually did, as opposed to what they left behind.
//
// skein has always counted FILES CHANGED, because that is what the collision
// primitive needs. But a session is mostly reads, searches and shell commands:
// the writes are the visible residue of the work, not the work. A project that
// shows nine files touched can be nine minutes of editing or four hours of
// reading the codebase to find the nine.
//
// Every agent already states this on disk and skein was walking straight past
// it -- the claude reader iterated every tool_use block and kept only the ones
// that wrote a file.
//
// Read from the transcripts, not from agtop. agtop is GPL-2.0 and skein is
// Apache-2.0, so its source stays unread (founder thesis R8); the agents write
// these records for themselves and reading them is the same thing skein has
// done since the first commit.

// A session's tally is a plain object so it survives JSON round-tripping
// through the parse cache without a revive step.
export const EMPTY = Object.freeze({})

// Sum the per-session tallies for one project.
//
// A project's sessions are found through its events rather than through a
// back-reference, which is the same route every other rollup takes -- one way
// to answer "which sessions is this project's", so they cannot disagree.
export function toolsOf(project, sessions) {
  const out = new Map()
  for (const id of new Set((project?.events ?? []).map(e => e.session))) {
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
const READING = /^(read|grep|glob|search|list|ls|web_?search|web_?fetch|fetch)/i
const WRITING = /^(edit|write|multiedit|patch|apply_patch|notebook)/i
const RUNNING = /^(bash|exec|shell|run|command)/i

export const classify = tool =>
  WRITING.test(tool) ? 'write' : READING.test(tool) ? 'read' : RUNNING.test(tool) ? 'run' : 'other'

// The same tally, grouped into the three things an agent spends its turn on.
// Named 'other' rather than folded into one of the three, because a tool this
// does not recognise is an unknown, and quietly filing it under 'run' would
// make the ratio wrong in a way nobody could see.
export function shape(tools) {
  const out = { read: 0, write: 0, run: 0, other: 0 }
  for (const { tool, n } of tools) out[classify(tool)] += n
  return out
}
