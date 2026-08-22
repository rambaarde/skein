// The entry point, extracted from bin/ so it can actually be tested.
//
// The bug this exists to prevent: `start()` returns as soon as the first frame
// is painted — the TUI stays alive on the event loop, not on the call stack —
// so a trailing `process.exit()` killed it immediately. It drew one frame and
// dropped back to the shell. Every headless test missed it, because they all
// stubbed process.exit; the one thing that mattered was the thing they faked.
import { run } from './cli.js'

export async function main({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  exit = process.exit,
  tty = process.stdout.isTTY === true,
  startTui = null,
} = {}) {
  try {
    const r = run(argv, { tty })

    if (r.err) { stderr.write(`${r.err}\n`); return exit(r.code) }

    if (r.tui) {
      const start = startTui ?? (await import('./tui.js')).start
      start()
      return           // NOT exit(): the terminal keeps the process alive
    }

    if (r.text) stdout.write(`${r.text}\n`)
    return exit(r.code)
  } catch (e) {
    // Fail open. skein is advisory; a broken skein must never break the caller,
    // and `skein hook` exits 0 on every path (PRD acceptance criterion 2).
    const isHook = argv.includes('hook')
    if (!isHook) stderr.write(`skein: ${e.message}\n`)
    return exit(isHook ? 0 : 1)
  }
}
