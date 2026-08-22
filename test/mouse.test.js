import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMouse, hitRow, ON, OFF } from '../src/mouse.js'

test('SGR coordinates, because the old encoding breaks past column 223', () => {
  // A single byte cannot express column 224 on a wide terminal, which is an
  // ordinary width. btop enables 1006 for the same reason.
  assert.deepEqual(parseMouse('\x1b[<0;12;7M'), { kind: 'click', button: 0, x: 11, y: 6 })
  assert.deepEqual(parseMouse('\x1b[<0;300;40M'), { kind: 'click', button: 0, x: 299, y: 39 })
})

test('a release is not a click', () => {
  assert.equal(parseMouse('\x1b[<0;12;7m'), null)
})

test('drags and moves are not clicks', () => {
  assert.equal(parseMouse('\x1b[<32;12;7M'), null, 'motion carries bit 32')
})

test('the wheel is a direction, not a button', () => {
  assert.equal(parseMouse('\x1b[<64;1;1M').dir, -1)
  assert.equal(parseMouse('\x1b[<65;1;1M').dir, 1)
})

test('anything that is not a mouse sequence is ignored', () => {
  for (const s of ['', 'q', '\x1b[A', '\x1b[<bad;x;yM']) assert.equal(parseMouse(s), null, s)
})

test('the hit map answers which row a y landed on', () => {
  const map = { rows: [{ y: 7, index: 0 }, { y: 8, index: 1 }], tags: [] }
  assert.equal(hitRow(map, 8), 1)
  assert.equal(hitRow(map, 99), null, 'a click outside the table selects nothing')
})

test('tracking is turned off again on the way out', () => {
  // Leaving it on means the terminal keeps emitting escape sequences into the
  // shell after skeins exits, which looks like the shell is broken.
  for (const mode of ['1000', '1002', '1006']) {
    assert.ok(ON.includes(`?${mode}h`), `enable ${mode}`)
    assert.ok(OFF.includes(`?${mode}l`), `disable ${mode}`)
  }
})
