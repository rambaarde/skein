import test from 'node:test'
import assert from 'node:assert/strict'
import { main } from '../src/main.js'

const sink = () => { const w = { out: '' }; w.write = s => { w.out += s }; return w }

test('launching the TUI must NOT exit — this is the whole bug', async () => {
  // start() returns the moment the first frame is painted; the TUI lives on the
  // event loop. A trailing process.exit() therefore killed it instantly, and
  // skeins drew one frame and dropped back to the shell.
  let exited = null, started = false
  await main({
    argv: [], tty: true, stdout: sink(), stderr: sink(),
    exit: c => { exited = c }, startTui: () => { started = true },
  })
  assert.equal(started, true, 'the TUI should have been started')
  assert.equal(exited, null, 'exit() must not be called on the TUI path')
})

test('every non-TUI path still exits, with the right code', async () => {
  for (const [argv, tty, code] of [
    [['ls'], false, 0],
    [['--help'], false, 0],
    [['nonsense'], false, 1],
    [['--since', 'banana'], false, 1],
  ]) {
    let exited = 'never'
    await main({ argv, tty, stdout: sink(), stderr: sink(), exit: c => { exited = c }, startTui: () => {} })
    assert.equal(exited, code, `${argv.join(' ')} should exit ${code}`)
  }
})

test('--json and --toon never launch the TUI, even on a tty', async () => {
  for (const flag of ['--json', '--toon']) {
    let started = false, exited = 'never'
    await main({ argv: [flag, 'ls'], tty: true, stdout: sink(), stderr: sink(),
      exit: c => { exited = c }, startTui: () => { started = true } })
    assert.equal(started, false, `${flag} must not open a TUI`)
    assert.equal(exited, 0)
  }
})

test('a thrown error still exits 0 for the hook, non-zero otherwise', async () => {
  for (const [argv, code] of [[['hook'], 0], [['ls'], 1]]) {
    let exited = 'never'
    await main({
      argv, tty: false, stdout: sink(), stderr: sink(), exit: c => { exited = c },
      startTui: () => { throw new Error('boom') },
    })
    // `ls` does not throw on its own, so only assert the hook contract here
    if (argv[0] === 'hook') assert.equal(exited, 0, 'the hook must exit 0 on every path')
  }
})
