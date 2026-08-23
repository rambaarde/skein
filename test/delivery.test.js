import test from 'node:test'
import assert from 'node:assert/strict'
import { parse, median, leadTimes, velocity, bucket, failureRate, cfrSeries, deployments, landings, RELEASE, HOTFIX, VERSION_TAG, TRUNKS } from '../src/delivery.js'

const M = 60_000, H = 3_600_000
// `run` is injectable so every test here reads a fixture rather than a real
// repository. A test that shells out to git passes on the author's laptop and
// fails on nine CI runners, which this project has already learned once.
const fake = ships => () => ships

test('a release commit is not a change', () => {
  // release-please opens a second trunk commit per change. Counting it doubles
  // every number, and it is not a change — it is the same change, versioned.
  assert.ok(RELEASE.test('chore(main): release 0.19.1'))
  assert.ok(RELEASE.test('chore: release v2'))
  assert.ok(!RELEASE.test('chore(deps): bump node'))
  assert.ok(!RELEASE.test('feat(tui): released the graph'), 'the word in a sentence is not the type')
})

test('a hotfix is fix and revert, by conventional type', () => {
  assert.ok(HOTFIX.test('fix(tui): the border ate a row'))
  assert.ok(HOTFIX.test('revert: the border change'))
  assert.ok(HOTFIX.test('fix!: a breaking repair'))
  assert.ok(!HOTFIX.test('feat: fix up the docs'), 'the word in a subject is not the type')
})

test('a deployment is a version tag, or a release commit where nothing is tagged', () => {
  // Taking both would count release-please twice: it writes a commit AND a tag
  // for one publish.
  assert.ok(VERSION_TAG.test('v1.2.0') && VERSION_TAG.test('0.9.1'))
  assert.ok(!VERSION_TAG.test('nightly') && !VERSION_TAG.test('release-please--branches'))
  const all = [{ at: 5, subject: 'chore(main): release 1', release: true, hotfix: false, files: [] }]
  const tagged = deployments('/w/x', { since: 0, all, run: () => [{ at: 9, name: 'v1.0.0' }] })
  assert.deepEqual(tagged, [{ at: 9, name: 'v1.0.0' }], 'the tag wins where there is one')
  const untagged = deployments('/w/x', { since: 0, all, run: () => [] })
  assert.deepEqual(untagged, [{ at: 5, name: 'chore(main): release 1' }], 'and the commit stands in where there is not')
})

test('a trunk log parses to landings, with the files each one touched', () => {
  // The files are what makes a change failure rate possible: without them
  // "was this deployment hotfixed" collapses to "did a fix happen afterwards",
  // which on any repository being worked on is always yes.
  //
  // NUL is built rather than typed. A literal one in the source makes this
  // file binary to every tool that looks at it, including the editors that
  // have to read it later.
  const NUL = String.fromCharCode(0)
  const raw = [
    `1787398093${NUL}chore(main): release 0.17.1 (#49)`,
    '',
    `1787398006${NUL}fix(tui): a poll behind (#48)`,
    'src/tui.js',
    'test/render.test.js',
    '',
  ].join('\n')
  const out = parse(raw)
  assert.equal(out.length, 2)
  assert.equal(out[0].at, 1787398093000, 'seconds become milliseconds')
  assert.ok(out[0].release && !out[0].hotfix)
  assert.ok(out[1].hotfix && !out[1].release)
  assert.deepEqual(out[1].files, ['src/tui.js', 'test/render.test.js'])
  assert.deepEqual(out[0].files, [], 'a commit with no paths listed has none, not undefined')
  assert.deepEqual(parse(''), [], 'an empty log is an empty list, not a throw')
  assert.deepEqual(parse('garbage'), [], 'and so is a line that is not one')
})

test('no git history is null, not zero', () => {
  // AXI 5. "This repo landed nothing this week" and "skeins cannot see this
  // repo" are entirely different statements and must not share a rendering.
  const now = Date.now(), since = now - 7 * 86_400_000
  assert.equal(velocity(null, [], { since, now }), null, 'a project with no root says nothing')
  const v = velocity('/w/x', [], { since, now, ships: [], deploys: [] })
  assert.equal(v.landed, 0, 'a repo with an empty log did land nothing')
  assert.equal(v.cfr, null, 'and has no change failure rate to report')
  assert.equal(v.lead, null)
})

test('lead time runs from when you started, not from when you committed', () => {
  // Measured on this repository: every trunk commit has ONE parent and its
  // author date equals its commit date, because squash merges erase the
  // branch. git alone cannot say when the work started; the transcripts can.
  const t0 = 1_700_000_000_000
  const ships = [{ at: t0 + 5 * H }, { at: t0 + 9 * H }]
  const events = [
    { at: t0 + 1 * H },                 // started the first change
    { at: t0 + 2 * H },
    { at: t0 + 7 * H },                 // started the second, after the first landed
  ]
  assert.deepEqual(leadTimes(ships, events, t0), [4 * H, 2 * H])
})

test('a landing with no edit before it contributes nothing, not zero', () => {
  // It was worked on before the window opened. Calling that an instant lead
  // time would drag the median toward a lie.
  const t0 = 1_700_000_000_000
  const leads = leadTimes([{ at: t0 + H }, { at: t0 + 5 * H }], [{ at: t0 + 3 * H }], t0)
  assert.deepEqual(leads, [2 * H], 'only the landing that had a start counts')
})

test('the four numbers, and the one that is a join', () => {
  const now = 1_700_000_000_000, since = now - 7 * 86_400_000
  const ships = [
    { at: since + 1 * H, subject: 'feat: a', release: false, hotfix: false, files: ['a.ts'] },
    { at: since + 3 * H, subject: 'fix: b', release: false, hotfix: true, files: ['a.ts'] },
    { at: since + 4 * H, subject: 'chore(main): release 1', release: true, hotfix: false, files: [] },
  ]
  const v = velocity('/w/x', [{ at: since + 30 * M }, { at: since + 2 * H }], { since, now, attention: 4 * H, ships, deploys: [] })
  assert.equal(v.landed, 2, 'the release is excluded')
  assert.equal(v.releases, 1, 'and counted separately rather than dropped')
  assert.equal(v.perWeek, 2, 'two landings in a seven-day window is two a week')
  // The join no other tool can make: skeins knows the hours, git knows what
  // came out of them.
  assert.equal(v.perShip, 2 * H, 'four hours of attention over two landings')
})

test('landings bucket into a countable series', () => {
  const now = 1_700_000_000_000, since = now - 4 * H
  assert.deepEqual(bucket([since + 30 * M, since + 45 * M, since + 3.5 * H], 4, since, now), [2, 0, 0, 1])
  assert.deepEqual(bucket([since - H, now + H], 4, since, now), [0, 0, 0, 0], 'outside the window is dropped')
  assert.deepEqual(bucket([now], 4, since, now), [0, 0, 0, 1], 'and the last instant lands in the last bucket')
})

test('a median is a median', () => {
  assert.equal(median([]), null, 'of nothing, nothing — never zero')
  assert.equal(median([5]), 5)
  assert.equal(median([1, 9]), 5)
  assert.equal(median([3, 1, 2]), 2, 'the input is not assumed sorted')
})

test('develop counts as a trunk', () => {
  // Work lands there first in repos that keep one, and a landing on develop
  // is a landing.
  assert.ok(TRUNKS.includes('develop'))
  assert.equal(TRUNKS[0], 'main', 'but main wins when both exist')
})

test('a change failure rate is measured per DEPLOYMENT, not per commit', () => {
  // Three rules, and each one was arrived at by a measurement that came back
  // absurd without it. On this repository: 92% by "a fix touched the same file
  // within 48h", against ~21% by this definition.
  const H = 3_600_000
  const land = (at, subject, files, hotfix = false) => ({ at, subject, files, hotfix, release: false })
  const all = [
    land(1 * H, 'feat: a', ['a.ts']),          // shipped by deploy 1
    land(3 * H, 'fix: repair a', ['a.ts'], true), // …and hotfixed before deploy 2
    land(5 * H, 'feat: b', ['b.ts']),          // shipped by deploy 2
    land(7 * H, 'fix: unrelated', ['z.ts'], true), // a fix, but not to what deploy 2 shipped
    land(9 * H, 'feat: c', ['c.ts']),          // shipped by deploy 3 — cannot be judged yet
  ]
  const deploys = [{ at: 2 * H, name: 'v1' }, { at: 6 * H, name: 'v2' }, { at: 10 * H, name: 'v3' }]
  const f = failureRate(all, deploys)

  assert.equal(f.judged, 2, 'the newest deployment leaves the denominator — nothing has shipped after it')
  assert.equal(f.failed, 1, 'only the one whose own files were repaired next counts')
  assert.equal(Math.round(f.rate * 100), 50)

  // "A fix happened afterwards" is true of every repository being worked on.
  // The hotfix has to touch what the deployment actually shipped.
  const unrelatedOnly = failureRate(
    [land(1 * H, 'feat: a', ['a.ts']), land(3 * H, 'fix: elsewhere', ['z.ts'], true)],
    [{ at: 2 * H }, { at: 4 * H }],
  )
  assert.equal(unrelatedOnly.failed, 0, 'a fix to something else is not this deployment failing')
})

test('fewer than two deployments is null, never zero', () => {
  // A repository that never ships has no change failure rate. That is a
  // different statement from "it never fails", and printing 0% would be the
  // most flattering possible lie.
  const one = [{ at: 1, subject: 'feat: a', files: ['a.ts'], hotfix: false, release: false }]
  assert.equal(failureRate(one, [{ at: 2 }]), null, 'one deployment cannot be judged against anything')
  assert.equal(failureRate(one, []), null)
  assert.equal(failureRate(null, [{ at: 1 }, { at: 2 }]), null)
})

test('the failure trend ends exactly where the table says it does', () => {
  // A chart whose endpoint disagrees with the number printed beside it is
  // worse than no chart. So the series is cumulative WITHIN the window: its
  // right-hand edge is the change failure rate over every deployment in that
  // window, which is the number the table prints.
  const H = 3_600_000
  const land = (at, subject, files, hotfix = false) => ({ at, subject, files, hotfix, release: false })
  const all = [
    land(1 * H, 'feat: a', ['a.ts']),
    land(3 * H, 'fix: repair a', ['a.ts'], true),
    land(5 * H, 'feat: b', ['b.ts']),
    land(9 * H, 'feat: c', ['c.ts']),
  ]
  const deploys = [{ at: 2 * H }, { at: 6 * H }, { at: 10 * H }]
  const f = failureRate(all, deploys)
  const series = cfrSeries(f.verdicts, 40, 0, 12 * H)

  assert.equal(series.length, 40)
  assert.equal(series.at(-1), f.rate, 'the right edge IS the rate the table prints')
  assert.equal(series[0], 0, 'before the second deployment there is nothing to judge')
  assert.ok(series.every(v => v >= 0 && v <= 1), 'it is a rate, so it stays between none and all')

  // The verdicts carry when each deployment was judged, so the trend and the
  // rate are computed from one pass rather than from two that could disagree.
  assert.equal(f.verdicts.length, f.judged)
  assert.equal(f.verdicts.filter(v => v.failed).length, f.failed)
})

test('a trend with nothing to judge is flat, not absent', () => {
  assert.deepEqual(cfrSeries([], 4, 0, 100), [0, 0, 0, 0])
  assert.deepEqual(cfrSeries(null, 3, 0, 100), [0, 0, 0])
})

test('a failure rate says what failed, not only how often', async () => {
  // A percentage tells a reader to worry; it does not tell them where. The
  // overlap that decides the verdict is already computed -- which hotfix
  // touched which shipped file -- and was being thrown away.
  const { failureRate } = await import('../src/delivery.js')
  const D = 86_400_000
  const t0 = Date.parse('2026-08-01T00:00:00Z')
  const all = [
    { at: t0 + 1 * D, subject: 'feat: a', files: ['src/a.js'], release: false, hotfix: false },
    { at: t0 + 2 * D, subject: 'chore(main): release 1.0.0', files: [], release: true, hotfix: false },
    { at: t0 + 3 * D, subject: 'fix: repair a', files: ['src/a.js'], release: false, hotfix: true },
    { at: t0 + 4 * D, subject: 'feat: b', files: ['src/b.js'], release: false, hotfix: false },
    { at: t0 + 5 * D, subject: 'chore(main): release 1.1.0', files: [], release: true, hotfix: false },
    { at: t0 + 6 * D, subject: 'fix: unrelated', files: ['src/z.js'], release: false, hotfix: true },
    { at: t0 + 7 * D, subject: 'chore(main): release 1.2.0', files: [], release: true, hotfix: false },
  ]
  const deploys = [
    { at: t0 + 2 * D, name: 'v1.0.0' },
    { at: t0 + 5 * D, name: 'v1.1.0' },
    { at: t0 + 7 * D, name: 'v1.2.0' },
  ]
  const cfr = failureRate(all, deploys)
  assert.equal(cfr.judged, 2)
  assert.equal(cfr.failed, 1, 'only the release whose file came back counts')

  const [first, second] = cfr.verdicts
  assert.equal(first.name, 'v1.0.0')
  assert.deepEqual(first.by, ['fix: repair a'], 'the commit that repaired it, by name')
  assert.deepEqual(first.files, ['src/a.js'], 'and what it touched of what went out')
  // A deployment that held reports empty arrays, never absent ones: a caller
  // must not have to tell "nothing broke" from "we did not look".
  assert.equal(second.failed, false)
  assert.deepEqual(second.by, [])
  assert.deepEqual(second.files, [])

  // The rollup carries the DENOMINATOR. Without it a bare count is a
  // popularity contest and the busiest file always wins.
  const a = cfr.offenders.find(o => o.file === 'src/a.js')
  assert.equal(a.hotfixed, 1)
  // TWO, not one: the repair itself shipped in the next release, so the file
  // went out twice. That is the honest denominator -- a file you keep fixing
  // keeps shipping, and pretending otherwise would inflate every rate.
  assert.equal(a.shipped, 2)
  assert.equal(cfr.offenders.find(o => o.file === 'src/z.js'), undefined, 'a fix to what nothing shipped is not a failure')
})

test('the offender list is not won by the file that ships most', async () => {
  // Measured on this repository: the raw rate put three 1-of-3 files above
  // src/tui.js at 7-of-22, and a file repaired once out of three shipments is
  // not evidence of anything.
  const { offenders } = await import('../src/delivery.js')
  const batches = [
    ...Array.from({ length: 20 }, () => ({ shipped: new Set(['big.js']) })),
    ...Array.from({ length: 3 }, () => ({ shipped: new Set(['small.js']) })),
  ]
  const verdicts = [
    ...Array.from({ length: 6 }, () => ({ files: ['big.js'] })),
    { files: ['small.js'] },
  ]
  const [top] = offenders(verdicts, batches)
  assert.equal(top.file, 'big.js', '6 of 20 outranks 1 of 3')
  assert.equal(top.shipped, 20)
})

test('the deployment cache never answers for an injected reader', () => {
  // deployments() shells out to `git tag`, and the velocity screen calls it
  // once per project on every draw -- 41 projects cost 220ms a keypress, which
  // is the whole feel of that screen being slow. It is memoised now.
  //
  // But a memo keyed on the repo must not answer for a caller that passed its
  // own reader: the entire point of passing one is to get a different answer
  // for the same root, and the first version handed back the previous stub's.
  const root = process.cwd()
  const a = deployments(root, { since: 0, run: () => [{ at: 1, name: 'v9.9.9' }] })
  const b = deployments(root, { since: 0, run: () => [{ at: 2, name: 'v8.8.8' }] })
  assert.equal(a[0].name, 'v9.9.9')
  assert.equal(b[0].name, 'v8.8.8', 'the second reader is not served the first answer')

  // And the real path is genuinely cached, or the fix does nothing.
  const t0 = process.hrtime.bigint()
  deployments(root, { since: 0 })
  const cold = process.hrtime.bigint() - t0
  const t1 = process.hrtime.bigint()
  deployments(root, { since: 0 })
  const warm = process.hrtime.bigint() - t1
  assert.ok(warm < cold, `a second call is cheaper (${cold}ns then ${warm}ns)`)
})

test('two windows do not evict each other', async () => {
  // The cache held ONE slot per repo, so two screens asking about different
  // windows evicted each other on every draw: the velocity table asks for
  // thirty days and the trend band for eight weeks, so each call missed the
  // other's entry and git was spawned again. A CPU profile of twelve draws
  // showed 8.7 SECONDS inside spawnSync -- 726ms a draw.
  const root = process.cwd()
  const now = Date.now()
  const wide = now - 56 * 86_400_000
  const narrow = now - 30 * 86_400_000
  landings(root, { since: wide })
  landings(root, { since: narrow })

  const t0 = process.hrtime.bigint()
  landings(root, { since: wide })
  const a = process.hrtime.bigint() - t0
  const t1 = process.hrtime.bigint()
  landings(root, { since: narrow })
  const b = process.hrtime.bigint() - t1
  // Both warm, neither having thrown the other out. A spawn is milliseconds;
  // a cache hit is microseconds.
  assert.ok(a < 3_000_000n, `wide window still cached (${a}ns)`)
  assert.ok(b < 3_000_000n, `narrow window still cached (${b}ns)`)
})

test('a coarser cache still answers the exact question asked', () => {
  // git is asked for whole days so the key is stable across a moving clock,
  // and the extra commits that come back are trimmed before returning -- or
  // the count would silently include work from before the window.
  const root = process.cwd()
  const now = Date.now()
  const all = landings(root, { since: now - 30 * 86_400_000 }) ?? []
  const recent = landings(root, { since: now - 2 * 86_400_000 }) ?? []
  for (const s of recent) assert.ok(s.at >= now - 2 * 86_400_000, 'nothing older than asked for')
  assert.ok(recent.length <= all.length)
})
