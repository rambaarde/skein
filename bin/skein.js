#!/usr/bin/env node
// The CLI must never open a TUI when piped, and never prompt (AXI 6).
import { run } from '../src/cli.js'

try {
  const r = run(process.argv.slice(2), { tty: process.stdout.isTTY === true })
  if (r.err) { process.stderr.write(`${r.err}\n`); process.exit(r.code) }
  if (r.tui) { const { start } = await import('../src/tui.js'); start(); }
  else
  if (r.text) process.stdout.write(`${r.text}\n`)
  process.exit(r.code)
} catch (e) {
  // Fail open. skein is advisory; a broken skein must never break the caller.
  // `skein hook` in particular exits 0 on every path (PRD acceptance 2).
  const isHook = process.argv.includes('hook')
  if (!isHook) process.stderr.write(`skein: ${e.message}\n`)
  process.exit(isHook ? 0 : 1)
}
