// Output shapes. Two doors, one set of numbers (PRD D13).
import { relative } from 'node:path'
import { HOME } from './paths.js'

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
export const short = (p, root) => {
  if (root) {
    const r = relative(root, p)
    if (!r.startsWith('..')) return r
  }
  return p.startsWith(HOME + '/') ? `~/${p.slice(HOME.length + 1)}` : p
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
