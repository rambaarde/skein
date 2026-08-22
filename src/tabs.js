// The detail pane's tabs.
//
// agtop puts a tab bar on its lower panel — Info · Performance · Processes ·
// Tool Activity · Cost · Config — and that shape is right: one pane, several
// questions, switched rather than tiled. Read from its published screenshots
// and README only. agtop is GPL-2.0 and skein is not, so its source stays
// unread and nothing here is ported from it.
//
// What skein does NOT copy is Cost. agtop gets prices by fetching LiteLLM's
// table at runtime and caching it for a day. skein has no dependencies and
// makes no network calls, and a price table that ships in the binary is wrong
// the first time a rate changes — a confidently wrong dollar figure is worse
// than no dollar figure. Context pressure is the honest version of that column:
// it is measured from your own transcripts and it is the thing that actually
// bites, because a full window compacts and loses the thread.
import { toolsOf, totalOf, shape, shortTool } from './tools.js'

export const TABS = ['info', 'sessions', 'files', 'tools', 'collisions']

// Everything below returns an array of already-rendered strings, the same
// contract the pane already had. Each takes one context object so the tab
// bodies stay independent of how the renderer happens to be structured today.
export function sessionsTab(p, ctx) {
  const { state, now, detailW, detailH, F } = ctx
  const { fit, hue, ago, trunc, humanTokens, meter, DIM, R, BOLD, LUT, limitOf, ceiling } = F
  const out = []
  const ids = [...new Map((p.events ?? []).map(e => [e.session, e])).values()].sort((a, b) => b.at - a.at)
  if (!ids.length) return [` ${DIM}no sessions in this window${R}`]

  out.push(` ${DIM}${fit('AGENT', 9)}${fit('CONTEXT', 15)}${fit('MODEL', 14)}${'LAST'.padStart(5)}${R}`)
  for (const e of ids.slice(0, Math.max(1, detailH - 4))) {
    const s = state.sessions?.get(e.session)
    const tokens = s?.context ?? 0
    const cap = limitOf(s, ceiling)
    const frac = tokens ? Math.min(1, tokens / cap) : 0
    const gauge = tokens
      ? `${meter(frac, 5, LUT.heat)} ${LUT.heat[Math.round(frac * 100)]}${humanTokens(tokens).padStart(6)}${R}`
      : `${DIM}${'—'.padStart(12)}${R}`
    out.push(` ${hue(e.agent)}${fit(e.agent, 9)}${R}${fit(gauge, 15)}${DIM}${fit(trunc(s?.model, 13) ?? '—', 14)}${ago(e.at, now).padStart(5)}${R}`)
    // The title is what you actually recognise a session by, so it gets its own
    // line rather than being truncated into a column.
    if (s?.title) out.push(`   ${DIM}${trunc(s.title, Math.max(8, detailW - 6))}${R}`)
  }
  return out
}

export function filesTab(p, ctx) {
  const { now, detailW, detailH, F } = ctx
  const { fit, hue, ago, short, DIM, R, LUT, meter } = F
  const counts = new Map()
  for (const e of p.events ?? []) {
    const k = e.path
    if (!k) continue
    const c = counts.get(k) ?? { n: 0, at: 0, agents: new Set() }
    c.n++; c.at = Math.max(c.at, e.at); c.agents.add(e.agent)
    counts.set(k, c)
  }
  if (!counts.size) return [` ${DIM}no files touched in this window${R}`]

  const rows = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)
  const top = Math.max(1, ...rows.map(([, c]) => c.n))
  // A bare digit after the count read as part of the count — '7 2' looked like
  // a number, not "two agents touched this". It gets a header now.
  const nameW = Math.max(8, detailW - 25)
  const out = [` ${DIM}${fit('FILE', nameW)} ${fit('EDITS', 10)} ${fit('AG', 3)}${'LAST'.padStart(5)}${R}`]
  for (const [path, c] of rows.slice(0, Math.max(1, detailH - 4))) {
    // Bar relative to the busiest file, so "hot" is a comparison and not a
    // number you have to hold in your head.
    const bar = meter(c.n / top, 6, LUT.activity)
    // More than one agent in one file is the thing worth noticing here.
    const who = c.agents.size > 1 ? `${LUT.heat[70]}${String(c.agents.size).padEnd(3)}${R}` : '   '
    out.push(` ${fit(short(path, p.root), nameW)} ${bar} ${String(c.n).padStart(3)} ${who}${DIM}${ago(c.at, now).padStart(5)}${R}`)
  }
  return out
}

// What the agents DID, as opposed to what they left behind.
//
// The files tab counts what was written; this counts what was called. A
// session is mostly reads, searches and shell commands, so a project showing
// nine files touched can be nine minutes of editing or four hours of reading
// the codebase to find the nine. The read:write ratio is the difference.
export function toolsTab(p, ctx) {
  const { detailW, detailH, F } = ctx
  const { fit, DIM, R, BOLD, LUT, meter } = F
  const tools = toolsOf(p, ctx.state?.sessions)
  if (!tools.length) {
    // Absence has two causes here and they are not the same thing, so the
    // pane says which one it is rather than printing a zero (AXI 5).
    return [
      ` ${DIM}no tool calls recorded for this project${R}`,
      '',
      ` ${DIM}the agents state these in their own transcripts; a session${R}`,
      ` ${DIM}that only ever edited files has nothing else to report.${R}`,
    ]
  }
  const total = totalOf(tools)
  const s = shape(tools)
  const pct = n => `${Math.round((n / Math.max(1, total)) * 100)}%`
  // The bar, the count and the share cost 18 between them. Everything else
  // is the name, because a tool truncated to `trueline_r…` is not a tool you
  // can identify.
  // Capped as well as floored: given a full-width pane the name column
  // swallowed the space and pushed SHARE off the right edge. Tool names are
  // short once the server namespace is off them.
  const nameW = Math.max(10, Math.min(24, detailW - 18))
  const out = [
    // Short enough to survive a half-width pane. 'other' earns its place only
    // when it is big enough to change how the ratio reads.
    ` ${BOLD}${total}${R}${DIM} calls · ${R}` +
    `${LUT.activity[70]}${pct(s.read)} read${R}${DIM} · ${R}` +
    `${LUT.heat[60]}${pct(s.write)} write${R}${DIM} · ${R}` +
    `${pct(s.run)} run${R}${s.other / Math.max(1, total) >= 0.1 ? `${DIM} · ${pct(s.other)} other${R}` : ''}`,
    '',
    ` ${DIM}${fit('TOOL', nameW)}${fit('CALLS', 11)}${'SHARE'.padStart(5)}${R}`,
  ]
  const top = Math.max(1, ...tools.map(t => t.n))
  for (const t of tools.slice(0, Math.max(1, detailH - 6))) {
    // Shown short: an MCP tool arrives as `mcp__plugin_x_mcp__trueline_edit`
    // and the namespace is the server, not the tool. Full names stay in the
    // CLI, where something might be matching on them.
    out.push(` ${fit(shortTool(t.tool), nameW)}${meter(t.n / top, 6, LUT.activity)} ${String(t.n).padStart(4)}${DIM}${pct(t.n).padStart(5)}${R}`)
  }
  if (tools.length > Math.max(1, detailH - 6)) {
    out.push(` ${DIM}+${tools.length - Math.max(1, detailH - 6)} more tool${tools.length - Math.max(1, detailH - 6) === 1 ? '' : 's'}${R}`)
  }
  return out
}

export function collisionsTab(p, ctx) {
  const { collsHere, now, detailW, detailH, lookback, F } = ctx
  const { fit, short, ago, DIM, R, BOLD, LUT } = F
  if (!collsHere.length) {
    // A bare zero reads as a broken panel. Say what was checked.
    return [
      ` ${DIM}no collisions here in ${lookback}.${R}`,
      '',
      ` ${DIM}a collision is two SESSIONS editing the${R}`,
      ` ${DIM}same file close enough together to${R}`,
      ` ${DIM}overwrite each other — often the same${R}`,
      ` ${DIM}agent in two windows, which is still a${R}`,
      ` ${DIM}lost edit.${R}`,
    ]
  }
  const out = [` ${DIM}${fit('FILE', Math.max(8, detailW - 24))}${fit('APART', 11)}${'WHEN'.padStart(5)}${R}`]
  for (const c of collsHere.slice(0, Math.max(1, detailH - 4))) {
    out.push(` ${LUT.heat[90]}·${R} ${fit(short(c.path, c.project), Math.max(8, detailW - 26))}${DIM}${fit(`${c.gapMin}m`, 11)}${ago(c.at, now).padStart(5)}${R}`)
    // Name the two sides. c.agents never existed on the record, so this line
    // silently rendered nothing at all.
    const pair = c.a?.agent === c.b?.agent ? `2 × ${c.a?.agent}` : `${c.a?.agent} ↔ ${c.b?.agent}`
    if (c.a) out.push(`   ${DIM}${fit(pair, Math.max(8, detailW - 6))}${R}`)
  }
  return out
}

// What the pane's border says for each tab. The border is skein's metadata
// line, so it has to describe what is actually under it — it kept claiming
// "what an agent is told here" while the file list was on screen.
export const TAB_TITLES = [
  'what an agent is told here',
  'sessions and their context',
  'files, hottest first',
  'tool calls, most used first',
  'collisions',
]
