<div align="center">

# skeins

**Every agent running across every repository, grouped by project — and a
read-only door so the agents can check who else is in a file before they write
it.**

Four sessions open across three repos, two of them on the same repo. One edits
`src/auth/session.ts`; twenty minutes later another opens the same file with a
stale picture of it and rewrites a function the first one had already changed.
Neither agent could have known. Both behaved correctly.

Most agent dashboards scope to the **session**. You do not work in sessions — you
work in projects, and the collisions that cost you happen *between* sessions,
where a session-shaped tool cannot look. skeins's unit is the **project**, and the
agents can consult it themselves.

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
![tests](https://img.shields.io/badge/tests-195%20passing-brightgreen)
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

`p` cycles them, `1`–`4` jump straight there.

| | Shows |
|---|---|
| **1 all** | the chart, the project table, a detail pane and the live activity feed |
| **2 watch** | the chart and the feed at full width — what is happening right now |
| **3 table** | the project table alone, the most projects on screen |
| **4 velocity** | what landed on each trunk, how long it took, and what had to be repaired |

`⏎` opens a project's own screen: its agents, its sessions and their context
pressure, its files, its tool calls, its collisions.

---

## What the numbers mean

Every term below is also in the tool: press `m` for the menu and choose
**METRICS**, or run `skeins glossary` (`--json` for agents). One list, three
doors — they cannot drift apart.

### Attention

**ATTENTION** is wall-clock time an agent spent *editing* a project. Gaps longer
than a few minutes are not counted, so it is time worked, not time elapsed.
Everything else on the velocity screen is git's; this is the half only skeins has.

### Velocity, for one developer

DORA is an org metric and half of it does not survive being pointed at one
person. skeins ships the part that does, and names the part it cannot:

| | |
|---|---|
| **LANDED** | commits on the trunk's first-parent line (`main`, `master`, `develop`) inside the window. Release commits excluded — they are bookkeeping, not work |
| **/DAY** · **/WEEK** | landed divided by the window. Under seven days the column reads `/DAY`, because a weekly rate extrapolated from two days is a projection, not a measurement |
| **LEAD** | median time from the first edit made *after the previous landing* until this one lands — from when you started, which git cannot see through a squash merge |
| **ATTN/SHIP** | attention divided by landings: what one shipped change cost in agent time. The join no other tool can make — skeins knows the time, git knows what came out of it |
| ~~MTTR~~ | mean time to restore needs incident data a laptop does not have. Absent, not faked |
| ~~deploy frequency~~ | for one developer that is the **LANDED** column. Not printed twice |

### Change failure rate

The share of your deployments that had to be repaired. It gets its own graph
beside the table, for whichever project the cursor is on.

| | |
|---|---|
| **a deployment** | a version tag. Where a repo tags nothing, a release commit instead — never both, or a release bot counts one publish twice |
| **DEPLOYS n/m** | `m` deployments in the window, `n` of them judged. The newest can never be judged: nothing has shipped after it yet, so it leaves the denominator rather than counting as a success |
| **CFR** | of the judged deployments, the share whose **next** deployment carried a `fix` or `revert` **touching a file that deployment shipped** |

Both halves of that last rule matter:

- **The unit is the deployment, not the commit.** A fix that lands before the
  next release means nothing ever shipped broken. Counting those made every
  fast-moving repo look broken — 92% on this one, against 30% by the rule above.
- **The hotfix has to touch what went out.** "A fix happened afterwards" is true
  of every repository anyone is working on.

Colour is red at every value and only the *tone* moves, so it reads as severity
at a glance. The legend names DORA's band: **0–15%** elite and high, **16–30%**
medium, above that low.

A project with fewer than two deployments has no change failure rate. That is
not the same as never failing, and the screen says so instead of drawing a zero.

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
| `m` | the menu — METRICS · KEYS · QUIT, over a dimmed dashboard |
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
