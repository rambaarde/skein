// Drives the real TUI in a subprocess and reports what each keystroke painted.
//
// It lives in a file rather than inside a template literal in the test: the
// first version was an inline -e script, and escaping \x1b and \t through two
// levels of quoting produced a syntax error that said nothing useful.
//
// argv[2] is the module path to import. HOME is set by the caller to a fixture
// directory, so this never reads anyone's real sessions.
import { PassThrough } from 'node:stream'

const { start } = await import(process.argv[2])

const out = []
const stdout = new PassThrough()
stdout.columns = 140
stdout.rows = 42
stdout.on('data', d => out.push(String(d)))
const stdin = new PassThrough()
stdin.isTTY = true
stdin.setRawMode = () => {}

start({ stdout, stdin })

const frame = () => String(out[out.length - 1] ?? '').replace(/\x1b\[\??[0-9;]*[A-Za-z]/g, '')

setTimeout(() => {
  const seen = { projects: /PROJECT/.test(frame()) }
  const before = out.length
  // Tab first: the 'watch' preset drops the detail pane, so switching preset
  // before tab would test a tab bar that is no longer on screen.
  stdin.write('\t')
  seen.painted = out.length > before
  seen.tab = frame()
  stdin.write('\r')
  seen.enter = frame()
  stdin.write('\x1b')
  seen.esc = frame()
  stdin.write('p')
  seen.preset = frame()
  // Exit from the write callback. process.exit() straight after a write to a
  // pipe truncates it — the first version printed nothing at all and exited 0,
  // which reads as "the driver silently did nothing".
  process.stdout.write('\n@@' + JSON.stringify(seen) + '@@\n', () => process.exit(0))
}, 300)
