// Which files does a shell command WRITE?
//
// M0 found ~1650 edits in 30 days arriving this way and invisible to every
// other capture path -- Claude Code's auto mode is instructed to edit with
// sed, heredocs and redirects rather than the Edit tool. A reader that ignores
// shell writes misses them, and misses the collisions they cause.
//
// Deliberately conservative: a false positive here invents a collision that
// never happened, which is worse than missing one. Read-only commands
// (cat, grep, head, sed without -i) are ignored by construction.
const unquote = s => s.replace(/^["']|["']$/g, '')

// Strip heredoc BODIES before looking for redirects.
//
// `cat > f.js <<'EOF'` is followed by arbitrary text, and that text routinely
// contains `>` -- every JavaScript comparison does. Scanning it as shell
// invents files like `c.at` out of `a.at > c.at`. The heredoc's own target is
// on the opening line, which survives.
export function stripHeredocs(cmd) {
  const out = []
  let term = null
  for (const line of cmd.split('\n')) {
    if (term !== null) {
      if (line.trim() === term) term = null
      continue
    }
    out.push(line)
    const m = line.match(/<<-?\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))/)
    if (m) term = m[1] ?? m[2] ?? m[3]
  }
  return out.join('\n')
}

const PATTERNS = [
  // > file   >> file        (not >&2, not >/dev/null)
  /(?:^|[;&|]|\s)>>?\s*("[^"]+"|'[^']+'|[^\s;&|)<>]+)/g,
  // sed -i … file
  /\bsed\b[^;&|]*?\s-i(?:\.\S+)?\s[^;&|]*?\s("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:$|[;&|])/g,
  // tee file   tee -a file
  /\btee\b\s+(?:-a\s+)?("[^"]+"|'[^']+'|[^\s;&|]+)/g,
  // mv src dst — the destination is written
  /\bmv\b\s+(?:-\S+\s+)*\S+\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g,
  // cp src dst
  /\bcp\b\s+(?:-\S+\s+)*\S+\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g,
]

// A command may cd before it writes: `cd /repo/b && cat > src/x.ts`.
// Resolving that relative path against the SESSION's cwd files the edit under
// the wrong project and invents a collision in a repo nobody touched.
export function bashCwd(raw) {
  if (!raw) return null
  const cmd = stripHeredocs(raw)
  let base = null
  for (const m of cmd.matchAll(/(?:^|[;&|]\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g)) {
    const d = unquote(m[1])
    if (d && d !== '-' && !d.startsWith('$')) base = d
  }
  return base
}

export function bashTargets(raw) {
  if (!raw || typeof raw !== 'string') return []
  const cmd = stripHeredocs(raw)
  const out = new Set()
  for (const re of PATTERNS) {
    for (const m of cmd.matchAll(re)) {
      const f = unquote(m[1] ?? '')
      if (!f || f.startsWith('-') || f.startsWith('&')) continue
      if (f.startsWith('/dev/')) continue
      if (!/\.[A-Za-z0-9]{1,6}$/.test(f)) continue   // must look like a file
      out.add(f)
    }
  }
  return [...out]
}
