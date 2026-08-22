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
```

<div align="center">

[![npm](https://img.shields.io/npm/v/skeins)](https://www.npmjs.com/package/skeins)
![tests](https://img.shields.io/badge/tests-151%20passing-brightgreen)
![runtime deps](https://img.shields.io/badge/runtime%20deps-0-blue)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![ci](https://img.shields.io/badge/ci-ubuntu%20%C2%B7%20macos%20%C2%B7%20windows%20%C3%97%20node%2020%2F22%2F24-brightgreen)
![license](https://img.shields.io/badge/license-Apache--2.0-blue)

</div>

---

## The one line that is the product

Everything below this is a dashboard, and five other tools already have one. This
is the part none of them can do — injected into an agent's session before it
writes, without anyone asking for it:

```
2 other agents active in this repo
  claude   editing  src/auth/middleware.ts   (4m ago)
  codex    editing  src/auth/session.ts      (1m ago)
```

That is shared awareness, not coordination. **skein never starts, stops,
restarts, routes, queues, schedules or blocks anything.** It has no locks and no
claims. The aviation distinction is exact: this is a *flight information
service* — "traffic in your area, same altitude" — never air traffic control —
"turn left heading 270 now". A tool that stops an agent mid-task gets
uninstalled the first time it is wrong.

---

## The dashboard, which is the other half

```
╭─ skein¹ ────────────────────────────────────────────────────────────────────────────────────────────────────── preset 1 all  22:20:00 ⠸ ─╮
│ 3h00  ┤                                                                                                                                  │
│ 2h45  ┤                                                                                                                   ####### 2h46   │
│ 2h30  ┤                                                                                                         ###########              │
│ 2h15  ┤                                                                                            ##############         ******* 2h09   │
│ 2h00  ┤                                                                                #############    *******************              │
│ 1h45  ┤                                                                    #############*****************                                │
│ 1h30  ┤                                                           ##########*************                                                │
│ 1h15  ┤                                               #############*********                                                             │
│ 1h00  ┤                                ################************                                            +++++++++++++xxxxx 52m    │
│ 45m   ┤                   ##############***********            +++++++++++++++++++++++++++xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxooooooooo 28m    │
│ 30m   ┤      ##############++xxxxxxxxoooooooooooooooooooooooooooooooooooooo====================================================== 16m    │
│ 0     ┤#######==============================================================                                                             │
│       └┬─────────────────────────────┬──────────────────────────────┬─────────────────────────────┬─────────────────────────────┬        │
│        22:20                         10:20                          22:20                         10:20                       now        │
│        attention · 30d  │ #: atlas-api 2h46 │ *: atlas-web 2h09 │ +: checkout 52m │ x: not in a repo 42m │ o: notify-svc 28m │ +1 more   │
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

<p align="center"><em>A demo dataset — <code>node docs/demo-frame.mjs</code> regenerates it.<br>
Your own project names never leave your machine, which is rather the point.</em></p>

Timelines are value-gradient braille at **two samples per character cell**; the
roster carries per-agent hue. Both conventions come from
[btop](https://github.com/aristocratos/btop), and the braille table is asserted
identical to btop's, character for character.

`↑↓` move · `⏎` expand a project into its sessions · `s` sort · `/` filter ·
`a` window · `c` collisions only · `?` all keys · `q` quit

**Click any project** (or press `⏎`) and it opens its own page: that project's rate graph,
who worked in it and how much, every session with its context, the hottest files,
and the collisions with both sides named. `esc` comes back. `space` still peeks
inline without leaving the list.

**Presets** (`p`, or `1`-`3`) change *what is on screen*, not its size — btop's
idea, and its config format: `all` · `watch` (feed full width) · `table` (the
project list alone). **Tabs** (`tab`) switch the detail pane between `info`,
`sessions`, `files` and `collisions`.

**Scrolling**: the wheel scrolls whatever is under the pointer — the project
table or the activity feed — and the feed border shows your position (`21–35 of
292`). `g` returns to newest.

**The mouse works**: click a project row to select it, click it again to expand,
scroll the wheel to move through projects — and **click any line in the activity
feed** to open the whole record: agent, full path, branch, session title and
context, with `esc` to go back.

It redraws every two seconds while work is landing, and backs off to sixteen
when nothing changes — **0.11% of one core idle**, measured over thirty seconds.
The pulse in the border slows with it, so a lazy pulse means a quiet machine
rather than a stalled program.

### Themes are btop's, unmodified

```sh
skein themes                    # every .theme skein can find
skein --theme tokyo-night
```

The background is **solid black by default**, like btop. `--transparent`
inherits your terminal instead, and `--opaque '#1a1b26'` sets any colour.

skein reads **btop's own `.theme` files** and looks in btop's own directories,
so a palette you already use in btop works here with no porting — 36 of them
ship with btop, and the community has written many more. `theme[main_bg]=""`
still means *inherit the terminal*, which is the default and the fallback for
any key a theme leaves out. A theme changes colour and never layout; a test
asserts exactly that.

### Try it without showing it your history

```sh
node tools/sandbox.mjs
cd ../skein-sandbox && ./skein
```

That builds a throwaway world — five git repositories, fixture sessions for all
three agents, and one deliberate collision — and runs skein against a fake
`HOME`, so none of your own work is read. Delete the folder when you are done.

---

## Why now

Parallel agents stopped being exotic about a year ago. Three things changed at
once, and only the third one is new.

1. **Running four agents became normal.** Under a multiplexer it is routine to
   have several sessions open across several repositories, two of them on the
   same repo, all editing files at once.

2. **Nothing coordinates them, on purpose.** That is the right call — an
   orchestrator that routes work is a heavier product with a worse failure mode.
   But "no orchestrator" was quietly taken to mean "no awareness either".

3. **The agents can now be told things.** This is the one that matters. Every
   agent grew a session-start hook, so a fact can reach an agent *before* it
   writes, without a human relaying it. The defence used to be a human holding
   the whole board in their head — the exact thing that fails at four sessions.

skein is what you do about the third one.

---

## Before and after

| | Before | With skein |
|---|---|---|
| where your week went | a guess, or a token bill | per project, per agent, on a timeline |
| two agents in one file | found later, in a merge | the second one is told before it writes |
| what an agent knows about its neighbours | nothing | who is here, what they touched, how long ago |
| the unit of attention | the session | the project, with sessions nested under it |
| a repo you have not touched in a week | still on screen | ranked below the ones that are live |
| asking "is anyone else in this file?" | you cannot | `skein who src/auth/session.ts` |
| what happens when skein breaks | — | nothing. The hook exits 0 and says nothing |

---

## Two doors, one store

One reader underneath, two surfaces on top — the shape `aps` already proved.

| Door | For | Shape |
|---|---|---|
| **TUI** | your eyes | project rollup, agents nested, timeline |
| **CLI** | agents and pipes | `--json`, `--toon`, pre-computed aggregates, minimal schemas |
| **Hook** | agents, ambiently | one line at session start — the block above |

```
skein                     the TUI
skein ls                  one line per project
skein who [path]          who else is in this repo, or in one file
skein collisions          recent same-file overlaps
skein hook                the ambient line, for a session-start hook
skein --json | --toon     machine-readable
```

A tty gets the TUI; a pipe gets text. **No metric exists in only one door** —
anything the chart shows, the CLI answers, and the reverse. Otherwise one door
becomes second-class, which is the failure that makes most TUIs unscriptable.

---

## The problem

The code lands. Nobody knows who else was in it.

Your defence against two agents overwriting each other is that you are holding
the whole board in your head. That works at two sessions and fails at four,
which is a normal Tuesday. The cost is not tokens — it is a silent merge
conflict discovered later, in code neither you nor either agent remembers
writing.

- **Sessions are the wrong unit.** You think in projects. Every tool in the field
  keys on `sessionKey`, so "where did my week go, per project" has no answer.
- **The dashboards are write-only.** Five tools will draw you a chart. None can
  be *consulted by the agents they watch*, so the warning always arrives after
  the fact and always to a human.
- **The knowledge is per-file and nobody holds it.** *"Codex touched this file
  four minutes ago."* That fact exists on disk, in three different formats, and
  no agent can reach it.

## The promise

> **No agent writes into a file blind that another agent just changed.**
>
> **No agent is ever told what to do about it.**
>
> **Nothing you did not ask for leaves the machine.**

---

## Was this real, or a solution looking for a problem?

It was gated on that question, and the gate was allowed to kill it.

Before a line of product code, a throwaway script
([`tools/m0.mjs`](tools/m0.mjs)) measured 30 days of real history. The rule,
written down in advance: **fewer than ~5 collisions in 30 days and the project is
cancelled, not descoped.**

It found **97**, across 8 distinct days. ([full result](docs/m0-result.txt))

The more useful finding was about *capture*. The design assumed Claude records
file edits as `file-history-delta`. It does — in 63 of 197 transcripts, covering
2,110 of 8,850 edits. The rest arrive as `Edit`/`Write` tool calls (5,090) and as
shell redirects, `sed -i`, `tee` and heredocs (1,650), which is how Claude Code's
auto mode is *instructed* to edit files.

**A reader built on the documented contract alone finds 6 collisions and cancels
the project.** The same 30 days, read properly, contain 97.

---

## How it reads

| Agent | File edits | Project | Branch | Title |
|---|---|---|---|---|
| **Claude Code** | `file-history-delta` + `Edit`/`Write` + shell writes | `cwd` | ✓ | ✓ `aiTitle` |
| **Codex** | `patch_apply_end.changes` — says what *kind* of change | `session_meta.cwd` | — | first prompt |
| **opencode** | `tool:edit` / `write` parts | `project.worktree` | — | — |

Absence renders as absence, never as breakage. **Read-only, always** — the one
path skein writes is its own cache in `~/.skein`, and CI greps the source to keep
it that way.

Transcripts get large. The biggest on the author's machine is **1.27 GB**, past
Node's maximum string length, so every file is streamed and parsed incrementally
from its previous end. Cold read of a 30-day window: **~4 s**. Warm: **~20 ms**.
No daemon — nothing to start, nothing to have crashed.

---

## What skein will not do

Binding, and each one is either something an incumbent does well or something
that rots.

- **Orchestration of any kind.** No starting, stopping, restarting, routing,
  queueing, scheduling or assigning. This is the line that defines the product.
- **Blocking or gating an agent.** Advisory only, forever.
- **Locks, claims or leases.** The same thing wearing a filesystem hat.
- **Cost.** Neither agent records a price, so a cost column means shipping a rate
  table and being silently wrong the day it drifts. agtop and agentic-metric
  already do this well.
- **Token totals as a spend figure.** Same axis, same reason. *Context pressure*
  is different and skein does show it — how full a session's window is now is an
  operational state, like memory pressure, not a receipt.
- **Process trees and CPU gauges.** agtop's are good, and it is three platforms
  of `ps` pain.
- **Session management.** herdr and agent-manager own this.
- **Anything hosted or shared.** Paths and titles carry client names.
- **Telemetry.** Absent, not off-by-default.

## Design lineage

Inspired by [agtop](https://github.com/ldegio/agtop), descended from
[btop](https://github.com/aristocratos/btop) — Copyright 2021 Aristocratos,
Apache-2.0.

skein takes three things from btop and no code: the braille and block symbol
tables that pack two samples per character cell (asserted identical to btop's,
character for character, in `test/render.test.js`), the border grammar — title
in the top edge, controls in the bottom, a clock top-right — and the
`theme[key]="#rrggbb"` file format, which is why any btop theme works here
unported.

agtop proved the category — 273 stars in five months for a single-file, zero-dep
Node TUI. Its object is the **session**; skein's is the **project**, and that is a
spine change rather than a `groupBy`. agtop is GPL-2.0 and skein is permissive, so
**agtop's source is deliberately unread**: the visual grammar comes from btop
(Apache-2.0), which is agtop's own ancestor. Take from the parent, not the
sibling.

---

## Status

**M1.** The readers, the collision engine, the TUI, the CLI and the hook, with
49 tests and zero runtime dependencies, green on ubuntu/macOS/Windows × Node
20/22/24.

On npm as **`skeins`**; the command it installs is `skein`. The singular is held
by an unrelated 2015 crypto package with just enough traffic that npm will not
release it — so the plural carries the package and the singular is what you
type.

The hook has not yet been lived with for a week, which is the only test that
matters for it.

[`docs/prd-v1.md`](docs/prd-v1.md) is the product requirements, including the
parts that were wrong and what running it corrected.

## Open questions

- Does the hook line earn its place every session, or become wallpaper?
- Is "same file within 30 minutes" the right collision definition, or should it
  be same-function?
- Should `skein who` report reads, or only writes? (Writes, today.)
- Does the Kitty/Sixel tier slot into the symbol table, or need its own path?

## Licence

Apache-2.0.
