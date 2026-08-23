// Output shapes. Two doors, one set of numbers (PRD D13).
import { relative } from 'node:path'
import { HOME } from './paths.js'

// Wall-clock time the way a person says it, not the way a timetable prints
// it. The axis read `12:27  18:27  00:27  06:27` -- four numbers, two of which
// need arithmetic before they mean anything, on a dashboard whose whole job is
// being readable at a glance.
//
// Deliberately fixed rather than locale-derived: toLocaleTimeString varies by
// ICU build ("6:27 PM", "6:27 p.m.") and newer versions put a narrow no-break
// space before the meridiem, which a terminal lays out at a width the box
// arithmetic here does not agree with. A box that loses a column is worse than
// a clock that ignores a preference.
export const clock12 = (t, { seconds = false } = {}) => {
  const d = new Date(t)
  const h = d.getHours()
  const hh = h % 12 || 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = seconds ? `:${String(d.getSeconds()).padStart(2, '0')}` : ''
  return `${hh}:${mm}${ss}${h < 12 ? 'am' : 'pm'}`
}

export const ago = (t, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - t) / 1000))
  // Seconds all the way to two minutes, so anything that just happened counts
  // up on screen every second. Rounding straight to "2m" freezes the newest
  // and most interesting rows, which is exactly where liveness is judged.
  if (s < 120) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

// Repo-relative where there is a repo; otherwise home-relative. Never the
// absolute path: the loose bucket has no root, and printing
// /Users/<you>/Documents/... put a home directory on screen and into every
// screenshot taken of it.
// Display paths are always forward-slashed. relative() hands back native
// separators, so Windows drew 'src\\a.ts'; more seriously, the ~ substitution
// tested HOME + '/' and a Windows home is 'C:\\Users\\you', so it never matched
// and the home directory this function exists to hide went straight to screen.
const slash = s => s.replace(/\\/g, '/')

export const short = (p, root) => {
  // Normalise BEFORE relative(), not after: the separator is a property of the
  // string, not of the host, and skeins reads transcripts written on machines
  // other than this one. Doing it here also means the behaviour is testable on
  // any platform instead of only on the one that produced the bug.
  const q = slash(p)
  const home = slash(HOME).replace(/\/+$/, '')
  if (root) {
    const r = slash(relative(slash(root), q))
    if (r && !r.startsWith('..')) return r
  }
  // Windows paths are case-insensitive; a home that differs only in case is
  // still the user's home.
  return q.toLowerCase().startsWith(home.toLowerCase() + '/') ? `~/${q.slice(home.length + 1)}` : q
}

export const trunc = (s, n) =>
  !s ? null : s.length <= n ? s : `${s.slice(0, n - 1)}…`

// TOON, uniform-array subset (PRD D14, AXI 1). Implemented in-tree rather than
// taking a dependency: our data is exactly the shape TOON is good at, and one
// output format must not cost the zero-dependency stance.
export function toon(name, rows, fields) {
  const esc = v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[,\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = `${name}[${rows.length}]{${fields.join(',')}}:`
  if (!rows.length) return head
  return [head, ...rows.map(r => `  ${fields.map(f => esc(r[f])).join(',')}`)].join('\n')
}

// A definitive empty state, never silent stdout (AXI 5).
export const empty = msg => msg

export function table(rows, cols) {
  if (!rows.length) return ''
  const w = cols.map(c => Math.max(c.head.length, ...rows.map(r => String(r[c.key] ?? '').length)))
  const line = cells => cells.map((c, i) => (cols[i].right ? String(c).padStart(w[i]) : String(c).padEnd(w[i]))).join('  ').trimEnd()
  return [line(cols.map(c => c.head)), ...rows.map(r => line(cols.map(c => r[c.key] ?? '')))].join('\n')
}
