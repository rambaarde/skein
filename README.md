<div align="center">

# skein

**Every agent running across every repository, grouped by project — and a
read-only door so the agents can check who else is in a file before they write
it.**

Four sessions open across three repos, two of them on the same repo. One edits
`src/auth/session.ts`; twenty minutes later another opens the same file with a
stale picture of it and rewrites a function the first one had already changed.
Neither agent could have known. Both behaved correctly.

Most agent dashboards scope to the **session**. You do not work in sessions — you
work in projects, and the collisions that cost you happen *between* sessions,
where a session-shaped tool cannot look. skein's unit is the **project**, and the
agents can consult it themselves.

No daemon. No account. No telemetry. Nothing leaves the machine.

</div>

<!-- Outside the centred block on purpose: align="center" centres every LINE of
     a code fence, so a short first line sits indented and the block reads as
     mis-typed code rather than as something to paste. -->

```sh
npm i -g skeins
skein install          # wires the hook into claude, codex and opencode
skein                  # the dashboard
```

<div align="center">

[![npm](https://img.shields.io/npm/v/skeins)](https://www.npmjs.com/package/skeins)
![tests](https://img.shields.io/badge/tests-192%20passing-brightgreen)
![runtime deps](https://img.shields.io/badge/runtime%20deps-0-blue)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![ci](https://img.shields.io/badge/ci-ubuntu%20%C2%B7%20macos%20%C2%B7%20windows%20%C3%97%20node%2020%2F22%2F24-brightgreen)
![license](https://img.shields.io/badge/license-Apache--2.0-blue)

<img src="https://raw.githubusercontent.com/rambaarde/skein/main/docs/demo.gif" alt="skein running against fixture projects" width="900">

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

`skein install` wires that into Claude Code, Codex and opencode. The agent is
told and decides for itself; nothing is blocked, queued or claimed. If skein
breaks, the hook exits 0 and says nothing.

---

## The dashboard

```
╭─ skein¹ ────────────────────────────────────────────────────────────────────────────────────────────────────── preset 1 all  22:20:00 ⠸ ─╮
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
| **4 velocity** | what landed on each trunk, and how long it took |

`⏎` opens a project's own screen: its agents, its sessions and their context
pressure, its files, its tool calls, its collisions.

### Velocity, for one developer

DORA is an org metric and three quarters of it does not survive being pointed at
one person, so skein ships the part that does and says so:

| | |
|---|---|
| **LANDED** · **/DAY** | trunk commits, release commits excluded |
| **LEAD** | first edit after the previous landing, until it lands. Measured from when you *started*, which git cannot see through a squash merge |
| **ATTN/SHIP** | your hours divided by what came out of them — the number that needs both halves |
| **REWORK** | share of landings typed `fix` or `revert`. A proxy for change-failure, and labelled one |
| ~~MTTR~~ | needs incident data. Not derivable, not shown |

A rate over a window shorter than a week is a projection, not a measurement, so
the column reads `/DAY` under seven days and `/WEEK` above.

---

## Commands

A tty gets the TUI; a pipe gets text. **No metric exists in only one door** —
anything the chart shows, the CLI answers, and the reverse.

```
skein                     the dashboard
skein ls                  one line per project
skein who [path]          who else is in this repo, or in one file
skein collisions          recent same-file overlaps
skein velocity            what landed, and how long it took
skein tools               what the agents called, not only what they wrote
skein doctor              why is my screen empty: what each store held, and
                          what skein could read out of it
skein hook                the ambient line, for a session-start hook
skein install             wire the hook into every agent it finds
skein --json | --toon     machine-readable
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
| `?` | every key |

The mouse works too: rows, tabs, feed entries and the controls on the border are
all clickable.

---

## Try it without showing it your history

```sh
node tools/sandbox.mjs
cd ../skein-sandbox && ./skein
```

That builds a throwaway world — five git repositories with a month of commits,
fixture sessions for all three agents, and one deliberate collision — and pins
`HOME`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME` and `CLAUDE_CONFIG_DIR` inside it, so
none of your own work is read. Delete the folder when you are done.

On Linux, or to check skein against paths that are not the defaults:

```sh
sh tools/linux-check.sh
```

That runs the same world inside a container with `XDG_DATA_HOME` and
`CLAUDE_CONFIG_DIR` pointed somewhere no default would put them, and reads it
back. skein honours both, and `~/.codex` where Codex documents it.

## Themes are btop's, unmodified

```sh
skein --theme tokyo-night        # any .theme file btop can read
skein --themes                   # list what is installed
```

skein reads btop's own theme format from btop's own directories. A theme changes
colour and never layout; a test asserts exactly that.

---

## What skein will not do

Binding, and each one is either something an incumbent does well or something
that rots.

- **Orchestration of any kind.** No starting, stopping, restarting, routing,
  queueing, scheduling or assigning. This is the line that defines the product.
- **Blocking or gating an agent.** Advisory only, forever.
- **Locks, claims or leases.** The same thing wearing a filesystem hat.
- **Cost.** Neither agent records a price, so a cost column means shipping a rate
  table and being silently wrong the day it drifts. *Context pressure* is the
  honest version and skein does show it — how full a session's window is now is
  an operational state, like memory pressure, not a receipt.
- **Process trees and CPU gauges.** agtop's are good, and it is three platforms
  of `ps` pain.
- **Session management.** herdr and agent-manager own this.
- **Anything hosted or shared.** Paths and titles carry client names.
- **Telemetry.** Absent, not off-by-default.

**Read-only, always.** The one path skein writes is its own cache in `~/.skein`,
and CI greps the source to keep it that way.

## Licence

Apache-2.0. Inspired by [agtop](https://github.com/ldegio/agtop), descended from
[btop](https://github.com/aristocratos/btop) — Copyright 2021 Aristocratos,
Apache-2.0.
