<div align="center">

# skeins

**Every agent running across every repository, grouped by project — and a
read-only door so the agents can check who else is in a file before they write
it.**

Two agents, one repo. One edits `src/auth/session.ts`; twenty minutes later the
other rewrites the same function from a stale picture. Neither could have known.

Dashboards scope to the **session**. You work in **projects**, and collisions
happen *between* sessions — where a session-shaped tool cannot look.

No daemon. No account. No telemetry. Nothing leaves the machine.

</div>

<!-- Outside the centred block on purpose: align="center" centres every LINE of
     a code fence, so a short first line sits indented and the block reads as
     mis-typed code rather than as something to paste. -->

```sh
npm i -g skeins
skeins install          # wires the hook into claude, codex and opencode
skeins                  # the dashboard
```

<div align="center">

[![npm](https://img.shields.io/npm/v/skeins)](https://www.npmjs.com/package/skeins)
![tests](https://img.shields.io/badge/tests-199%20passing-brightgreen)
![runtime deps](https://img.shields.io/badge/runtime%20deps-0-blue)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![ci](https://img.shields.io/badge/ci-ubuntu%20%C2%B7%20macos%20%C2%B7%20windows%20%C3%97%20node%2020%2F22%2F24-brightgreen)
![license](https://img.shields.io/badge/license-Apache--2.0-blue)

<img src="https://raw.githubusercontent.com/rambaarde/skein/main/docs/demo.gif" alt="skeins running against fixture projects" width="900">

</div>

---

## The one line that is the product

Everything else here is a dashboard, and five other tools already have one. This
is the part none of them can do — injected into an agent's session before it
writes, without anyone asking for it:

```
2 other agents active in this repo
  claude   editing  src/auth/middleware.ts   (4m ago)
  codex    editing  src/auth/session.ts      (1m ago)
```

`skeins install` wires that into Claude Code, Codex and opencode. The agent is
told and decides for itself; nothing is blocked, queued or claimed. If skeins
breaks, the hook exits 0 and says nothing.

---

## The dashboard

```
╭─ skeins¹ ───────────────────────────────────────────────────────────────────────────────────────────────────── preset 1 all  22:20:00 ⠸ ─╮
│ 3h00  ┤                                                                                                                                  │
│ 2h45  ┤                                                                                                               ⣀⣀⡤⠤⠤⠤⠖⠒⠋⠉⠉ 2h46   │
│ 2h30  ┤                                                                                                     ⣀⣀⣀⣀⡤⠤⠤⠖⠋⠉⠁                  │
│ 2h15  ┤                                                                                         ⣀⣀⣀⣀⡤⠤⠤⠤⠖⠒⠒⠋⠁          ⣀⣀⣀⣀⡤⠤⠤⠤⠤⠖ 2h09   │
│ 2h00  ┤                                                                               ⣀⣀⣀⣀⣀⡤⠖⠒⠒⠒⠃      ⣀⣀⣀⡤⠤⠤⠤⠖⠒⠋⠉⠉⠉⠉⠉⠉⠁                 │
│ 1h45  ┤                                                                    ⣀⣀⡤⠤⠤⠖⠒⠒⠋⠉⠉⠁ ⣀⣀⣀⣀⣀⣀⣀⡤⠤⠤⠖⠒⠋⠉⠉⠁                                 │
│ 1h30  ┤                                                           ⣀⣀⣀⣀⣀⡖⠒⠋⠉⣁⣀⣀⣀⡤⠤⠤⠖⠒⠒⠒⠋⠉⠁                                                │
│ 1h15  ┤                                                ⣀⣀⣀⣀⡤⠤⠤⠤⠖⠒⠒⠃⣀⣀⣀⡤⠤⠤⠤⠖⠃                                                             │
│ 1h00  ┤                                    ⣀⣀⣀⡤⠤⠤⠖⠒⣋⣉⣉⣉⡥⠤⠤⠤⠖⠒⠒⠒⠋⠉⠉⠉⠁                                                ⣀⣀⣀⣀⣀⣀⣀⣀⡤⠤⠤⠤⠤ 52m    │
│ 45m   ┤                    ⣀⣀⡤⠤⠤⠤⠖⠒⠒⠒⠒⠋⣉⣉⣉⡭⠥⠤⠤⠖⠒⠒⠒⠋⠁                   ⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⡤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠖⠒⣒⣒⣒⣒⣒⣒⣒⣒⡶⠶⠯⠭⠭⠭⠭⠭⠟⠛⠓⠒⠒⠒⠒⠒⠒⠒⠋⠉⠉⠉⠉ 42m    │
│ 30m   ┤          ⣀⣀⣀⣀⡤⣤⣖⣒⣒⡯⣥⣤⣤⣤⣖⣒⣒⣋⣉⣉⣉⣉⣁⣀⣀⣀⡤⠤⠤⠤⠤⠤⠤⠤⠖⠒⠒⠒⣒⣒⣒⣒⣒⣒⣒⣒⣒⣒⣒⣒⣋⣉⣉⣉⣁⣀⣀⣤⣤⣤⣤⣤⣤⡤⠤⠤⠶⠶⠶⠶⠶⠶⠶⠟⠛⠛⠛⠛⠛⠛⠛⠓⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⣒⣒⣒⣒⣒⣒⣒⣒⣒⣒⣒⣒⣋⣉⣉⣉⣉ 28m    │
│ 0     ┤⣀⣀⣤⣶⣶⣶⣶⣿⣿⣿⣷⣶⣿⣿⣿⣷⡿⠿⠿⠿⠷⠶⠶⠶⠶⠶⠶⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠯⠭⠭⠭⠭⠭⠭⠭⠭⠭⠟⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠓⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠋⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠁                        │
│       └┬─────────────────────────────┬──────────────────────────────┬─────────────────────────────┬─────────────────────────────┬        │
│        22:20                         10:20                          22:20                         10:20                       now        │
│        attention · 30d  │ ⣿⣿ atlas-api 2h46 │ ⣿⣿ atlas-web 2h09 │ ⣿⣿ checkout 52m │ ⣿⣿ not in a repo 42m │ ⣿⣿ notify-svc 28m │ +1 more   │
│ EDITS/MIN · 6h    now 0.4   nobody running      quiet 15m  claude ■■■■■■ 0.4                                                             │
│──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────│
│ PROJECT         DOING                          AGENTS            SESS  FILES    TIME    SHARE  COLL ATTN            PEAK   LAST          │
│ ▸ atlas-api     Rotate the session expiry hea… claude+codex         8     75    2h46 ■■■·····     2 ⣝⣉⣏⣉⣙⣉⣹⣝⣋⣛⣏⣛⣫⣛    1%     8s          │
│ ▸ atlas-web     —                              claude+codex         5     61    2h09 ■■······     1 ⣍⣙⣉⣹⣍⣏⣫⣩⣫⣉⣭⣝⣉⣍    1%     4m          │
│ ▸ checkout      —                              claude               3     29     52m ■·······     · ⣦⣼⡆⣦⣤⣄⣦⣦⣠⣠⣠⣴⣤⣾    0%    22m          │
│ ▸ notify-svc    —                              codex+opencode       2     18     28m ■·······     · ⣈⡃⡇⡈⣉⡀⠛⣃⣛⣨⢀⠀⠈⣟    0%     2h          │
│ ▸ docs-site     —                              claude               2     12     16m ········     · ⡄⣦⣴⡄⢠⢸⢰⢰⣴⢰⢠⢰⣤⢸    0%     9h          │
│ ▸ not in a repo —                              claude+codex         7     40     42m ■·······     · ⣏⣩⣈⣀⡁⡉⡛⢘⢙⣍⣝⣌⣯⡇    0%     1d          │
╰─ 6 projects · 3 collisions · 30d · by recent  ⏎ expand · s recent · p all · a 30d · / filter · c all · ? keys · q quit ──────────────────╯
╭─ atlas-api — what an agent is told here² ───────────────╮╭─ activity³ ──────────────────────────────────────────────────── newest first ─╮
│ info  sessions  files  collisions                       ││ 22:19:52 claude    atlas-api         src/mod0.ts                            8s│
│ ────                                                    ││ 22:16:00 claude    atlas-web         src/mod0.ts                            4m│
│ 3 other agents active in this repo                      ││ 22:01:23 codex     atlas-api         src/mod59.ts                          19m│
│   claude   editing src/mod0.ts          8s              ││ 22:00:00 codex     atlas-api         src/auth/session.ts                   20m│
│   codex    editing src/mod59.ts        19m              ││ 21:58:00 claude    checkout          src/mod0.ts                           22m│
│   codex    editing src/auth/session.…  20m              ││ 21:45:57 claude    checkout          src/mod8.ts                           34m│
│                                                         ││ 21:40:00 claude    atlas-api         src/auth/session.ts                   40m│
│ COLLISIONS                                              ││ 20:47:00 claude    checkout          src/mod25.ts                           2h│
│ · src/auth/session.ts          20m apart    40m         ││ 20:34:53 codex     atlas-web         src/mod16.ts                           2h│
│ · src/mod47.ts                 10m apart     9d         ││ 20:20:00 opencode  notify-svc        src/mod1.ts                            2h│
│                                                         ││ 20:20:00 opencode  notify-svc        src/mod3.ts                            2h│
│                                                         ││ 20:20:00 opencode  notify-svc        src/mod7.ts                            2h│
│                                                         ││ 20:20:00 codex     notify-svc        src/mod0.ts                            2h│
│                                                         ││ 19:16:57 opencode  notify-svc        src/mod17.ts                           3h│
╰─ 8 sessions · 2 collisions ─────────────────────────────╯╰─ 836 edits in 30d ────────────────────────────────────────────────────────────╯
```

The headline is **attention accumulated per project** — the line climbs while you
were in a repo and runs flat while you were not, and ends the day at its own
total. The project you have selected is lit; the rest fade back.

### Four screens, one key

`p` cycles them, `1`–`5` jump straight there.

| | Shows |
|---|---|
| **1 all** | the chart, the project table, a detail pane and the live activity feed |
| **2 watch** | the chart and the feed at full width — what is happening right now |
| **3 table** | the project table alone, the most projects on screen |
| **4 velocity** | what landed on each trunk, how long it took, and what had to be repaired |
| **5 graph** | within one project, which sessions touched the same file |

`⏎` opens a project's own screen: its agents, its sessions and their context
pressure, its files, its tool calls, its collisions.

---

## Where the numbers come from

Nothing here is inferred, estimated or modelled. Every number is read from one
of two places — **the agents' own transcript files**, or **git** — and this
table says which, and by what rule. `skeins doctor` prints what it actually
found in each store on your machine.

### The two sources

| | |
|---|---|
| **transcripts** | `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR`), `~/.codex/sessions/**/*.jsonl`, `$XDG_DATA_HOME/opencode/storage`. Read-only, never written. These are the files the agents already keep. |
| **git** | `git log --first-parent <trunk> --format=%ct%x00%s --name-only` and `git tag --format='%(creatordate:unix) %(refname:short)'`, run in each project root. Read-only, no network. |

### Every metric, and its rule

| metric | source | exact rule |
|---|---|---|
| **open** | transcripts | a session records a `cwd`, and its last record is inside the window |
| **files** · **edits** | transcripts | records that WROTE a file — an edit, a write, a patch, or a shell command that redirects into one. Reads, searches and plain commands are not edits |
| **attention** | transcripts | wall-clock spanned by those write events, with any gap over **5 minutes** cut out and any stretch under **30 seconds** dropped |
| **collision** | transcripts | two *sessions* wrote the same canonical path within **30 minutes** (`w` cycles it) *and* their lifetimes overlapped. Two edits either side of a handover are not a collision |
| **tools** | transcripts | the agents' own tool-call records, counted by name. MCP names are matched on their last segment, so `mcp__x__read` counts as a read |
| **landed** | git | commits on the first-parent line of the trunk (`main`, `master`, `develop`, `trunk` — first that exists), minus release commits matching `^chore(...)!?: release` |
| **lead** | both | median of: first *write event* after the previous landing → that landing's commit time. Measured from when you started, which git cannot see through a squash merge |
| **attn/ship** | both | attention ÷ landed |
| **deployment** | git | a tag matching `^v?\d+\.\d+`. Only if the repo has no such tag does it fall back to release commits — never both, or a release bot counts one publish twice |
| **CFR** | git | of the deployments that can be judged, the share whose **next** deployment contained a commit matching `^(fix\|revert)(...)!?:` that touched a file the first one shipped |
| **hotfixed n/m** | git | per file: `n` deployments that shipped it were repaired by the next one, out of `m` deployments it shipped in at all |

### What is deliberately absent

| | |
|---|---|
| **MTTR** | needs incident data. A laptop has none, and inventing one would make the other three numbers untrustworthy by association |
| **deploy frequency** | for one developer that is the `landed` column. Not printed twice under a second name |
| **any advice** | skeins reports what it observed. "What you should improve" is not in the transcripts or in git |

### Three things that are easy to get wrong, and how skeins handles them

- **A fix is not a failure.** A fix that lands *before* the next release means nothing ever shipped broken. Counting those rated this repository at 92%; counting per *deployment* rates it at 15%.
- **The newest deployment can never be judged.** Nothing has shipped after it, so it leaves the denominator rather than counting as a success — otherwise every release would improve the number for a day and then not.
- **Absence is an explicit `null`.** "This repo has no git history", "you landed nothing" and "there were fewer than two deployments to compare" are three different answers, and none of them is `0`.

---

## What the numbers mean

Every term below is also in the tool: press `m` for the menu and choose
**METRICS**, or run `skeins glossary` (`--json` for agents). One list, three
doors — they cannot drift apart.

### When a project appears

The moment an agent **opens a session in it** — not when it first writes a
file. Those are minutes apart, and sometimes much more: measured on one real
machine, the gap between a session opening and its first write ran from zero to
forty-one minutes, and a quarter of sessions never wrote a file at all.

That gap used to be a blind spot in the door that matters most. `skeins who`
would answer *"nobody else is in this repo"* while another agent had been in
there half an hour reading the files it was about to change — the exact
scenario at the top of this README.

```
$ skeins who
AGENT   DID   FILE                        BRANCH   AGO
claude  open  — nothing written here yet  develop   2s
```

`open` is stated, never guessed. skeins knows the session is in the repo and
has left no file behind; it does not know what it is reading. A project with
only open sessions shows **0 files and no attention**, because none was
observed.

### Attention

Wall-clock time an agent spent *editing* a project — time worked, not time
elapsed. Everything else on the velocity screen is git's; this is the half only
skeins has, and it is what makes `ATTN/SHIP` possible: git knows what came out,
skeins knows what it cost.

### Velocity, for one developer

DORA is an org metric and half of it does not survive being pointed at one
person. skeins ships the part that does and names the part it cannot — see
*what is deliberately absent* above.

`/DAY` and `/WEEK` are the same number over a different divisor, and the column
header says which: under seven days it reads `/DAY`, because a weekly rate
extrapolated from two days is a projection wearing a measurement's clothes.

### Change failure rate

The share of your deployments that had to be repaired. It gets its own graph
beside the table, for whichever project the cursor is on.

Both halves of the rule matter, and both were wrong in an earlier version:

- **The unit is the deployment, not the commit.** A fix that lands before the
  next release means nothing ever shipped broken. Counting those rated this
  repository at 92%, against 15% by the rule that ships.
- **The hotfix has to touch what went out.** "A fix happened afterwards" is
  true of every repository anyone is working on.

Colour is red at every value and only the *tone* moves, so it reads as severity
at a glance. The legend names DORA's band: **0–15%** elite and high, **16–30%**
medium, above that low.

### Why it failed

A percentage tells you to worry; it does not tell you where. Deciding a
deployment failed already requires knowing *which* hotfix touched *which* file
it shipped — so skeins keeps that instead of throwing it away.

The failure panel on the velocity screen says how many came back and points at
them; `⏎` on the project opens two panes, and `skeins failures` prints the same
thing:

```
what keeps breaking                    and what repaired it
  7/22  32%  src/tui.js                v0.17.0  fix(tui): the screen was a poll behind…
  6/22  27%  README.md                 v0.16.1  fix(tui): a carriage return in the border
  5/21  24%  test/render.test.js       v0.16.0  fix(tui): the feed scrolls, the controls…
```

**`7/22` is the whole point.** A bare count is a popularity contest — the
biggest file ships in nearly every release, so of course it appears in every
failure. The denominator is what separates a fragile file from a busy one, and
it is the part no reader can derive. Ranking uses a smoothed rate, so a file
repaired once out of three shipments does not outrank one repaired seven times
out of twenty-two.

There is deliberately no "what to improve" panel. Anything skeins did not
observe would be a horoscope.

A project with fewer than two deployments has no change failure rate. That is
not the same as never failing, and the screen says so instead of drawing a zero.

### The graph

Preset `5` draws the one graph skeins has: inside a project, which sessions
touched the same file.

```
        ⣤⡄                                          ⣀⡀
        ⠿⠗⢦…t/presets.test.js                     ⣀⡤⣿⡇ …st/render.test.js
           ⠈⠚⢕⡢⢄⡀                            ⣀⠤⢔⡪⠛⠉
     ⣀⣀⣀⣀⡠⠤⠤⠤⠔⠒⠒⠓⠲⣒⠒⠒⠉⠉⣉⠝⠿⠟b6cf8790⢒⠶⠒⠣⠤⠤⠤⠤⣀⣀⣀⣀⣀⡀
  ⢰⣶⣀⣀⠤⠤⠤⠔⠒⠒⠒⠊⠉⠉⠉                    ⠑⠢⡠⠔⠉     ⠈⠒⢄⡀⣀⠤⠊⠁
  ⠘⠛ src/theme.js                                 tools/sandbox.mjs

  ● session   ● file, bigger is more contested
```

**Red is the point.** A file two sessions merely share is dim; a file two
*overlapping* sessions wrote minutes apart is red, and its label says the gap:

```
…-legacy/AGENTS.md ×4 · 0m apart      ← four sessions, two of them simultaneous
src/presets.js ×2 · 19h               ← shared, but nineteen hours apart
```

That distinction is the whole tool. "Two sessions touched this" is a fact the
files pane already gives you; "two live sessions were in it twelve minutes
apart" is a warning, and it is the only thing on any of these screens that
could have prevented the overwrite at the top of this README.

Every node carries its context: a file says how many sessions are in it and
when it was last written (`×2 · 15h`), a session says which agent it is and
when it last wrote (`claude · 15h`). Sessions draw as a **hollow ring** in the
agent's hue, files as a **solid block** that grows and reddens with how
contested they are.

A file **no one shares is not drawn** — one writer is work, not a conflict.
Layout is Fruchterman–Reingold, seeded from the project root, so the same repo
always draws the same shape rather than boiling on every repaint.

It is deliberately **one project, not the machine**. The whole-machine version
measured 1,573 nodes on a real laptop, which every result in the literature
says renders as an unreadable hairball; one project is 1–13 sessions and a
handful of contested files, which is the size a node-link picture is *for*.
Caps are stated on screen (`+19 more files`) rather than applied silently, and
the drawing's size follows the node count — a five-node graph sits compactly in
the middle rather than being stretched across the terminal, so the space around
it means *this project is quiet*.

### Collisions

Two **sessions** editing one file close enough together to overwrite each other,
*and* whose lifetimes actually overlapped — two edits half an hour apart are a
handover, not a conflict. Frequently the same agent twice, and the screen says
that rather than claiming two agents.

---

## Commands

The command is `skeins`. `skein` still works — it is what `skeins install`
wrote into three agents' settings files, and a name that vanishes breaks every
one of them silently. Environment variables read `SKEINS_*` first and still
honour `SKEIN_*`.

A tty gets the TUI; a pipe gets text. **No metric exists in only one door** —
anything the chart shows, the CLI answers, and the reverse.

```
skeins                     the dashboard
skeins ls                  one line per project
skeins who [path]          who else is in this repo, or in one file
skeins collisions          recent same-file overlaps
skeins velocity            what landed, how long it took, what failed
skeins tools               what the agents called, not only what they wrote
skeins failures           which files keep being shipped and then repaired
skeins glossary            what every number on these screens counts
skeins doctor              why is my screen empty: what each store held, and
                          what skeins could read out of it
skeins hook                the ambient line, for a session-start hook
skeins install             wire the hook into every agent it finds
skeins --json | --toon     machine-readable
```

Absence is an explicit `null`, never an omitted key or a zero standing in for
one: "this repo has no git history" and "you landed nothing" are different
answers.

## Keys

| | |
|---|---|
| `↑` `↓` `j` `k` | move between projects |
| `⏎` | open the project's own screen |
| `space` | peek at it inline |
| `tab` | switch the detail pane — info · sessions · files · tools · collisions |
| `p` · `1`–`4` | presets |
| `a` | window: 6h · 24h · 7d · 30d |
| `s` | sort: recent · time · files · sessions · name |
| `/` | filter by name |
| `c` | only projects that collided |
| `esc` | back one level, then quit |
| `m` | the menu — METRICS · KEYS · QUIT, over a dimmed dashboard. Also a `m menu` tag beside the box name, as btop has it |
| `?` | every key — then `tab` for what every number means |

The mouse works too: rows, tabs, feed entries and the controls on the border are
all clickable.

---

## Try it without showing it your history

```sh
node tools/sandbox.mjs
cd ../skeins-sandbox && ./skeins
```

That builds a throwaway world — five git repositories with a month of commits,
fixture sessions for all three agents, and one deliberate collision — and pins
`HOME`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME` and `CLAUDE_CONFIG_DIR` inside it, so
none of your own work is read. Delete the folder when you are done.

On Linux, or to check skeins against paths that are not the defaults:

```sh
sh tools/linux-check.sh
```

That runs the same world inside a container with `XDG_DATA_HOME` and
`CLAUDE_CONFIG_DIR` pointed somewhere no default would put them, and reads it
back. skeins honours both, and `~/.codex` where Codex documents it.

## Themes are btop's, unmodified

```sh
skeins --theme tokyo-night        # any .theme file btop can read
skeins --themes                   # list what is installed
```

skeins reads btop's own theme format from btop's own directories. A theme changes
colour and never layout; a test asserts exactly that.

---

## What skeins will not do

Binding, and each one is either something an incumbent does well or something
that rots.

- **Orchestration of any kind.** No starting, stopping, restarting, routing,
  queueing, scheduling or assigning. This is the line that defines the product.
- **Blocking or gating an agent.** Advisory only, forever.
- **Locks, claims or leases.** The same thing wearing a filesystem hat.
- **Cost.** Neither agent records a price, so a cost column means shipping a rate
  table and being silently wrong the day it drifts. *Context pressure* is the
  honest version and skeins does show it — how full a session's window is now is
  an operational state, like memory pressure, not a receipt.
- **Process trees and CPU gauges.** agtop's are good, and it is three platforms
  of `ps` pain.
- **Session management.** herdr and agent-manager own this.
- **Anything hosted or shared.** Paths and titles carry client names.
- **Telemetry.** Absent, not off-by-default.

**Read-only, always.** The one path skeins writes is its own cache in `~/.skeins`,
and CI greps the source to keep it that way.

## Licence

Apache-2.0. Inspired by [agtop](https://github.com/ldegio/agtop), descended from
[btop](https://github.com/aristocratos/btop) — Copyright 2021 Aristocratos,
Apache-2.0.
