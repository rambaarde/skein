import test from 'node:test'
import assert from 'node:assert/strict'
import { parse, apply, PRESETS, MAX_PRESETS, MAX_BOXES, DEFAULT_PRESETS } from '../src/presets.js'
import { layout } from '../src/layout.js'

test("btop's preset string parses, including the rules it rejects", () => {
  // Format and limits read out of btop_config.cpp (Apache-2.0): "box:P:G",
  // presets space-separated, at most 9 of at most 4 boxes.
  const ok = parse('head:0:default,feed:1:braille')
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.presets[0], [
    { name: 'head', alt: false, symbol: 'default' },
    { name: 'feed', alt: true, symbol: 'braille' },
  ])

  // Every rejection names the thing that is wrong. A preset string is the one
  // piece of config written by hand, so a typo must not fail silently.
  const bad = s => { const r = parse(s); assert.equal(r.ok, false, s); return r.error }
  assert.match(bad('cpu:0:default'), /no box named 'cpu'/)
  assert.match(bad('head:2:default'), /position must be 0 or 1/)
  assert.match(bad('head:0:sixel'), /no graph symbol/)
  assert.match(bad('head:0:default,head:0:default'), /twice/)
  assert.match(bad('feed:0:default'), /must keep head/)
  assert.match(bad(new Array(MAX_PRESETS + 1).fill('head:0:default').join(' ')), /at most 9 presets/)
  assert.match(bad('head:0:default,detail:0:default,feed:0:default,feed:1:tty'), /twice|at most 4/)
  assert.equal(parse('').ok, false)
})

test('a preset drops boxes, and the survivors take the space', () => {
  // This is the whole point, and the difference from a zoom level: btop's own
  // defaults are cpu+proc, cpu+mem+net, cpu+net.
  const all = layout(120, 32, apply(parse(DEFAULT_PRESETS).presets[0]).shown)
  assert.ok(all.detail && all.feed)
  assert.equal(all.detail.w + all.feed.w, 120, 'two panes split the width')

  const watch = layout(120, 32, apply(parse(DEFAULT_PRESETS).presets[1]).shown)
  assert.equal(watch.detail, undefined, 'detail is gone, not shrunk')
  assert.equal(watch.feed.w, 120, 'the feed takes what detail left behind')

  const table = layout(120, 32, apply(parse(DEFAULT_PRESETS).presets[2]).shown)
  assert.equal(table.feed, undefined)
  assert.equal(table.head.h, 32, 'the table gets the whole screen')

  // velocity is a whole screen on its own: a different question, not a panel
  // of the dashboard, so it drops every other box rather than sharing.
  const vel = layout(120, 32, apply(parse(DEFAULT_PRESETS).presets[3]).shown)
  assert.equal(vel.head, undefined, 'the project list is gone, not shrunk')
  assert.equal(vel.detail, undefined)
  assert.equal(vel.feed, undefined)
  assert.equal(vel.velocity.h, 32, 'velocity gets the whole screen')

  // graph is the same kind of screen as velocity, for the same reason: a
  // picture of who is in the same file as whom is not a panel of anything.
  const gr = layout(120, 32, apply(parse(DEFAULT_PRESETS).presets[4]).shown)
  assert.equal(gr.head, undefined, 'the project list is gone, not shrunk')
  assert.equal(gr.graph.h, 32, 'graph gets the whole screen')
  assert.match(parse('graph:0:default,feed:0:default').error, /whole screen/)

  // estate is a different SOURCE (the OS, not the transcripts) and gets the
  // same treatment for the same reason.
  const es = layout(120, 32, apply(parse(DEFAULT_PRESETS).presets[5]).shown)
  assert.equal(es.head, undefined, 'the project list is gone, not shrunk')
  assert.equal(es.estate.h, 32, 'estate gets the whole screen')
  assert.match(parse('estate:0:default,feed:0:default').error, /whole screen/)

  assert.equal(PRESETS.length, 7)
})
