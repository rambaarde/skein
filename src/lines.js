// Stream a JSONL file line by line, optionally starting at a byte offset.
//
// Not an optimisation. The largest Codex rollout on the author's machine is
// 1.27 GB -- past Node's maximum string length -- so readFileSync throws
// ERR_STRING_TOO_LONG on real data. Transcripts grow without bound; treat
// every one of them as too big to hold.
import { openSync, readSync, closeSync } from 'node:fs'

const CHUNK = 4 * 1024 * 1024

export function* readLines(file, from = 0, size = Infinity) {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(CHUNK)
    let pos = from
    let rest = ''
    while (pos < size) {
      const n = readSync(fd, buf, 0, Math.min(CHUNK, size - pos), pos)
      if (n <= 0) break
      pos += n
      // Split on the last newline so a multi-byte character is never cut.
      const text = rest + buf.toString('utf8', 0, n)
      const cut = text.lastIndexOf('\n')
      if (cut === -1) { rest = text; continue }
      rest = text.slice(cut + 1)
      for (const line of text.slice(0, cut).split('\n')) if (line) yield line
    }
    if (rest) yield rest
  } finally { closeSync(fd) }
}
