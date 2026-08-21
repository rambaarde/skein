---
type: proposal
status: draft
date: 2026-08-22
revision: 2
revised: 2026-08-22
project: skein
former_names: [clew]
author: Ram + AI
companion: skein-founder-thesis.md, skein-design-language.md
repo_root: ~/Documents/opensource/skeins (created 2026-08-21 as clew; renamed 2026-08-22)
vault_note: (none yet)
moved_from: _Ai_Memory/_proposals/clew-prd-v1.md (2026-08-22)
adopted_standards: [AXI, btop]
---

# skein v1 — Product Requirements

Status: **revision 2, 2026-08-22.** Revision 1 was written before any code, and
its §0.2 made itself conditional on a measurement that had not been taken.

**That measurement has now been taken, and M1 has shipped.** This revision
records what running the thing changed about the plan. Sections marked
**[REVISED]** or **[RESOLVED]** changed materially; the rest survived intact.

Three things moved:

1. **The gate cleared** — 97 collisions in 30 days against a threshold of 5
   (§0.2). The project exists.
2. **§5.2's data contract was incomplete, and it would have been fatal.** The
   documented capture path accounts for under a quarter of real edits (§5.2).
3. **§7's gating unknown resolved in the good direction** — all three agents
   have a session-start surface, and two of them share a schema (§7).

Scope: the installable npm package `skeins`, binary `skein` — the
readers, the project rollup, the collision primitive, the agent-facing CLI, the
SessionStart hook, and the TUI. Anything that starts, stops, routes or blocks an
agent is out of scope, and §9 is the section that makes that binding.

**The name.** `skein`, as the founder thesis had it: a length of yarn wound in a
loose coil — many separate threads held together without tangling — and a flock
of wild geese *in flight*, a word that only applies while they are moving, in
formation, at the same time.

It briefly went by `skein` while the npm registry was the thing driving the
decision. That was the wrong master. The registry constrains one string — the
package name — and nothing else: not the product, not the repository, not the
command. The bare `skein` is held by a 2015 crypto package with just enough
traffic that npm will not release it, so the package is **`skeins`** and
everything a user sees or types is `skein`.

Two costs, accepted rather than discovered later:

- **`npm i -g skein` will never work.** The plural is as close as the registry
  allows.
- **The Skein hash function owns the search results** — a NIST SHA-3 finalist,
  and permanent. Weighed against R6 and R7 (§9) and taken anyway.

---

## 0. The tension this document must not hide

### 0.1 The part you want to build is the part that does not matter

The thesis is blunt about this and the PRD has to carry it forward: **the chart
is not the product.** From `skein-founder-thesis.md` §5 —

> The timeline chart is the human half. It is real work and it is the part that
> will get the screenshots, but **it is not the thesis.** If the chart shipped
> alone this would be a worse agtop.

Every incentive points the wrong way. The TUI is the fun part, it is the part
with a beautiful reverse-engineered design language already written for it, and
it is the part that demos. It is also the part that five other tools already
have, and the part that makes R7 — *"reads as an agtop clone"* — come true.

The defensible claim is one line of text injected into another agent's session
before it writes a file. It is boring, it has no screenshot, and nothing else in
the field can do it.

So v1's ruling, mirroring the `aps` PRD's "a library you never file into":

> **A coordination primitive that happens to have a dashboard on it.** The CLI
> and the hook must be useful alone.

**[REVISED]** The original ruling also deferred the TUI to M2. **The author
overruled that, and the TUI shipped in M1.** Recorded here as a decision rather
than left to read as a drift:

- The argument in §0.1 was about *sequencing risk*, not about whether the TUI
  belongs. It does; it is the product's identity, and `skein-design-language.md`
  existed before this PRD did.
- The risk §0.1 guards against is shipping a chart and calling it a product. M1
  shipped the chart **and** the primitive together, so the failure mode it was
  written to prevent did not occur.
- What survives unchanged: **no metric may exist only in the TUI** (D13), and
  the hook must be useful with the TUI never opened.

The test for any proposed feature: *does an agent become better informed, or
does a human get a nicer picture?* Both are allowed. Only the first is urgent.

### 0.2 This document is void if M0 fails

`skein-founder-thesis.md` §10 sets a kill gate, and this PRD inherits it rather
than quietly outliving it:

> If M0 finds fewer than ~5 real collisions in 30 days of genuinely parallel
> work, **the thesis is wrong and this is cancelled.**

**[RESOLVED 2026-08-22 — the gate cleared.]** `tools/m0.mjs` measured 30 days of
real history: **97 collisions**, across 8 distinct days, against a threshold of
5. Full output and method in `docs/m0-result.txt`.

Two caveats the number alone hides, both carried forward:

- **They cluster.** 97 events over 8 days, not spread evenly. Collisions are
  rare on an ordinary day and common on a parallel one — which is what the
  thesis predicted, but it makes *collisions per day* the wrong headline. The
  honest metric is **collisions per day of parallel work**.
- **The measurement depended entirely on getting §5.2 right.** Built on the
  contract revision 1 assumed, M0 returns **6** and cancels the project. This is
  the single most important thing M0 produced, and it is not the 97.

R1 is retired. R6 ("yet another agent dashboard") is not, and never was a
measurement question.

---

## 1. Product summary

One npm package, zero runtime dependencies, that answers two questions nothing
else answers: **where did my week actually go, per project** — and, asked by an
agent rather than by you, **is anyone else already in this file?**

```
skein                    → the TUI: projects, agents nested, timeline
skein ls                 → one line per project            (pipe-safe)
skein who [path]         → who else is in this repo, right now
skein collisions         → recent same-file overlaps
skein hook               → print the SessionStart line, exit
skein install            → wire the hook into your agents, once
skein --json | --toon    → machine-readable, AXI-shaped
```

The flagship is not any of the above. It is the line an agent reads before it
edits, without anyone asking for it:

```
2 other agents active in this repo
  claude  editing  src/auth/middleware.ts   (4m ago)
  codex   editing  src/auth/session.ts      (1m ago)
```

**The thing to protect:** skein is *advisory*. It hands over a fact and stops.
Nothing here blocks a write, claims a lock, queues work, or tells any agent what
to do. The aviation distinction from the thesis is exact and load-bearing — this
is a flight information service ("traffic in your area, same altitude"), never
air traffic control ("turn left heading 270 now").

---

## 2. Decisions this PRD ratifies

Recorded so overturning one is a decision rather than a drift.

| # | Decision | Ruling | Why |
|---|---|---|---|
| D1 | What to read | **Session transcripts** — the opposite of `aps` D1 | File-edit events exist *only* in transcripts. `aps` deliberately reads prompt-only history files and never transcripts, for speed. **This is why skein cannot be an `aps` subcommand** (thesis Q2): different files, different size class, different performance profile. Sharing a product name would imply a shared reader that does not exist |
| D2 | Runtime | **Node ≥20, plain ESM, zero runtime dependencies** | The `aps` discipline, and agtop's. A dependency tree costs more than the thing it renders |
| D3 | Licence | **Apache-2.0. agtop's source is never read** | R8, the only irreversible risk. agtop is GPL-2.0; the design ancestor is btop (Apache-2.0), which is agtop's ancestor too. Take from the parent, not the sibling |
| D4 | Primary object | **The project — a git root** | The spine change against agtop, thesis §3.1. Sessions do not disappear; they nest one level down |
| D5 | Non-git sessions | **One `loose` bucket: visible, counted, never promoted, never expanded by default** | 24% of real sessions have no git root and all of it is scratch. AXI principle 5 forbids ambiguous absence — a tool that silently discards a quarter of its input is untrustworthy even when the discard is correct |
| D6 | Two repos, one product | **Two rows. No grouping** | thesis §6.4.1. Collisions are per-file so nothing is missed; only the timeline splits. Inferring a product from a shared parent directory is magic that is wrong in someone else's folder layout. If ever grouped, read `.nacre.yml`'s `project:` — not v1, no such file exists yet |
| D7 | Collision definition | **Same file, ≥2 agents, within 30 minutes** | thesis Q4. Start at file granularity; **M0 tunes the window before it is fixed in code**, and same-function/same-hunk is deferred until file-level proves too noisy |
| D8 | Advisory only | **Warn, never block** | thesis Q3 + §8. A tool that stops an agent mid-task gets uninstalled the first time it is wrong. No locks, no claims, no queues, no "wait for the other agent" |
| D9 | Bare `skein` | **TUI when interactive; rollup text when piped** | AXI 6 (never prompt) and 8 (content first). The same rule `aps` already keeps. A TUI that renders escape codes into a pipe composes with nothing |
| D10 | Freshness | **On-demand incremental parse, cached by `(path, mtime, byte offset)`** | Transcripts are large and grow append-only, so only new bytes are ever parsed. **No daemon** — nothing to start, nothing to have crashed |
| D11 | Telemetry | **None. Absent, not off-by-default** | `aps` D11. Paths and titles carry client names |
| D12 | Agent discovery | **Detected, never configured** | `aps` D4. A configured list is a list the user must maintain |
| D13 | Metric parity | **No metric may exist in only one door** | thesis §7. Anything the chart shows, the CLI answers, and the reverse. Otherwise one door becomes second-class — the failure that makes most TUIs unscriptable |
| D14 | TOON | **Implement the uniform-array subset in-tree** | thesis R5. Our data is exactly TOON's sweet spot, and `@toon-format/toon` would break D2 for one output format |
| **D15** | **Capture breadth [NEW]** | **Every path an agent can write a file by, not the documented one** | §5.2. Measured, not assumed: the documented contract is 24% of edits. A reader is only as good as its worst-covered write path, and the missing ones are not exotic — they are how auto mode is instructed to work |
| **D16** | **Reading large transcripts [NEW]** | **Stream every file; never hold one in memory** | The largest rollout on the author's machine is **1.27 GB**, past Node's maximum string length, so `readFileSync` throws on real data. Transcripts grow without bound; treat every one as too big |
| **D17** | **Cold-read bound [NEW]** | **Skip files whose mtime predates the window** | A first run otherwise pays for all history ever written: 2.5 GB and 16 s. Bounded, ~4 s |

D1 and D7 are the two worth revisiting. D1 sets the entire performance budget;
D7 is the one M0 is allowed to overrule.

---

## 3. Users

| Who | Uses | Success looks like |
|---|---|---|
| **An agent about to write** (primary — this is the thesis) | the SessionStart hook, `skein who` | Learns another agent touched this file four minutes ago, *before* rewriting it. Never told what to do about it |
| **Developer with four sessions open** | `skein`, `skein collisions` | Sees the board they can no longer hold in their head. Finds the silent overwrite the same day rather than in a merge |
| **Developer at the end of a week** | `skein ls` | Knows where the attention went, per project — not what it cost |
| **Scripts, other tools** | `--json`, `--toon` | Composes. Aggregates arrive pre-computed, per AXI 4 |
| **Developer on Codex or opencode** | all of the above, degraded | Gets collisions in full (D5 of the thesis contract). Sees branch and title render as *absent*, not as breakage |

---

## 4. Architecture

```
sources/     claude.js · codex.js · opencode.js
             transcript tail-reader → normalised edit events   (D1, D12)
                 ↓
index.js     cache keyed (path, mtime, offset); parse only new bytes  (D10)
                 ↓
project.js   git-root resolution → rollup + loose bucket       (D4, D5, D6)
                 ↓
collide.js   same file, ≥2 agents, inside the window → advisories (D7, D8)
                 ↓
       ┌─────────┴─────────┐
   cli.js                tui.js
   AXI: TOON, minimal    btop grammar: 2 samples/cell, LUT
   schemas, aggregates,  gradients, mirrored pairs, metadata
   structured errors     in the border
       ↓
   hook.js   one line at SessionStart, exit 0 always          (D8, NFR-2)
```

Everything above `tui.js` runs without a terminal and is unit-testable — the
same split that lets 77 tests cover `aps` without driving a TUI. **`tui.js` is
M2.** M1 ships the left-hand column only.

---

## 5. Data contracts

Verified against real session files on 2026-08-22. This is the section with the
least guesswork in it and the most leverage.

### 5.1 The normalised edit event

Every reader returns this shape; nothing downstream knows which agent it came
from.

```js
{
  agent:   'claude' | 'codex' | 'opencode',
  session: '<id>',
  project: '/abs/git/root' | null,      // null → the loose bucket (D5)
  path:    'src/auth/session.ts',       // repo-relative
  kind:    'edit' | 'add' | 'delete' | 'read',
  at:      1755820000000,
  branch:  'feat/auth' | null,          // claude only
  title:   'Fix auth middleware' | null // claude only
}
```

**Absence is an explicit `null`, never an omitted key.** AXI 5, and thesis R2 —
design the columns so absence reads as absence rather than as breakage.

### 5.2 The sources **[REVISED — this was wrong, and it was nearly fatal]**

Revision 1 recorded one capture path per agent. For Claude that was **24% of
the truth**, and a reader built on it finds 6 collisions where there are 97.

Measured over 30 days of real history (`docs/m0-result.txt`):

| Claude capture path | edits | present in |
|---|---|---|
| `file-history-delta.trackingPath` | 2,110 | **63 of 197 transcripts** |
| `Edit` / `Write` / `NotebookEdit` / MCP edit tools | 5,090 | most |
| shell writes — `>`, `>>`, `sed -i`, `tee`, `mv`, `cp` | 1,650 | many |

The shell path is not an edge case. Claude Code's auto mode is *instructed* to
edit files with `sed` and heredocs rather than the Edit tool, so on a machine
using it the documented contract degrades further, not less.

Two hazards that only appear once you parse shell, both of which **invent
collisions that never happened** — and a false positive is worse than a miss,
because it burns the trust the whole product runs on:

- **Heredoc bodies are not shell.** Every JavaScript comparison contains a `>`,
  so scanning the body of `cat > f.js <<'EOF'` turns `a.at > c.at` into a file
  named `c.at`. Strip bodies first; the real target is on the opening line.
- **`cd` moves the base.** `cd /repo-b && cat > src/x.ts` resolved against the
  *session's* cwd files the edit under the wrong project entirely.

Two more corrections of the same kind:

- **Subagent (`isSidechain`) records belong to the parent session**, or a
  session collides with its own subagent.
- **An agent's own store is not project work.** Without excluding `~/.claude`,
  `~/.codex` and opencode's storage, skein reports itself editing transcripts.

| Agent | File edits | Project | Branch | Title | PR |
|---|---|---|---|---|---|
| **Claude Code** | all three paths above | `cwd` | ✓ `gitBranch` | ✓ `aiTitle`, falling back to `lastPrompt` | ✓ `pr-link` |
| **Codex** | `patch_apply_end.changes` — map of path → `update`/`add`/`delete` | `session_meta.cwd`, `turn_context.workspace_roots` | ✗ | ✗ derive from first prompt | ✗ |
| **opencode** | `part` → `tool:edit`/`write`, `state.input.filePath` | `path.cwd` | ✗ | ✗ (has a `todo` store) | ✗ |

**The collision primitive is fully portable** — all three record file-level
activity. Codex's shape is richest (it says what *kind* of change); opencode's
distinguishes read from edit.

The field is `aiTitle`, not `ai-title.title` — revision 1 named the record and
guessed the key, and the roster rendered every title as absent until it was
read from a real file. Where no title exists yet, `lastPrompt` is the closest
honest stand-in.

**Two fields are Claude-only:** `pr-link` and the title. Any feature resting on
those degrades visibly on the other two (R2), and no acceptance criterion may
depend on them.

### 5.3 Live status

Where `herdr` is present, `herdr api snapshot` gives `agent`, `agent_status`
(`working`/`idle`), `cwd`, `terminal_title` per pane. The portable fallback is
process inspection plus last-write age, which agtop has already proven works
cross-platform — **and which must be reimplemented rather than read** (D3).

---

## 6. Commands

```
skein                     TUI if a tty, rollup text if piped         (D9)
skein ls                  one line per project, newest activity first
skein who [path]          agents active in this repo; [path] narrows to one file
skein collisions [--since 24h]
skein hook                print the ambient line and exit 0
skein install [--agent x] wire the SessionStart hook; idempotent
skein --json | --toon     machine-readable                       (D14, AXI 1)
skein <cmd> --help        per subcommand                          (AXI 10)
```

Every list command returns pre-computed aggregates inline — `collisions`,
`active`, `loose` — because the TUI needs them anyway (AXI 4). Empty is stated,
never silent: `no agents active (0 projects, 3 loose)` (AXI 5).

---

## 7. The hook, on three agents **[RESOLVED 2026-08-22]**

Revision 1 called this "the largest unverified risk in this document" and warned
that if two of three agents had no hook surface, the flagship reached one agent
and the framing had to shrink.

**All three have one, and two of them share a schema.**

| Agent | Mechanism | Status |
|---|---|---|
| **Claude Code** | `~/.claude/settings.json` → `hooks.SessionStart[].hooks[]{type,command,timeout}` | ✓ verified against a live config |
| **Codex** | `~/.codex/hooks.json` → **the identical shape** | ✓ verified |
| **opencode** | `~/.config/opencode/plugins/*.js`, exporting `experimental.chat.system.transform` | ✓ verified |

Codex sharing Claude's schema means one installer covers two agents, and
opencode's plugin is a dozen lines that shells out to `skein hook`. `skein install`
does all three, additively and idempotently, backing up whatever it edits —
users already have their own hooks in these files, and appending is the only
acceptable behaviour.

**R2 drops from Medium to Low.** The ambient claim in §5 holds for the whole
field, not just for Claude.

Where the hook cannot work, `skein install` says so and prints the manual wiring
— the `aps` rule: *the hotkey is honest*.

---

## 8. Non-functional requirements

- **First useful output under ~1 s warm**, under ~5 s cold over 30 days of
  history. **[MEASURED 2026-08-22: ~20 ms warm, ~3.9 s cold]** over 234
  sessions and 2.5 GB of transcripts. Three things buy it, and all three were
  discovered by running it rather than by planning it:
  - **D10's incremental cache** — a file whose size and mtime are unchanged is
    never reopened; one that grew is parsed from its previous end.
  - **D17's mtime bound** — an unbounded first run costs 16 s because it reads
    every byte of history ever written. Bounded to the window, 3.9 s.
  - **D16's streaming** — unrelated to speed, and non-negotiable: the largest
    file here is 1.27 GB and `readFileSync` throws `ERR_STRING_TOO_LONG` on it.
- **Fail open, always.** skein being broken must never impede an agent. The hook
  **exits 0 and prints nothing** on any internal error. An advisory tool that
  breaks a session is uninstalled the same day.
- **Read-only over agents' files.** The only path ever written is skein's own
  cache. Same rule as `aps`.
- **Deterministic.** The same on-disk state produces the same output. No
  wall-clock in the comparison path except the explicit window in D7.
- **No colours of its own.** Transparent background, terminal's palette
  (btop R5, and the reasoning that deleted `aps`'s OSC-11 probe).
- **Zero runtime dependencies**, enforced in CI.
- **Tests** on ubuntu/macos/windows × node 20/22/24. Format parsers covered by
  fixtures in the real on-disk layouts, never mocks — *a mock of someone else's
  format only proves you remembered your mock.*

---

## 9. Non-goals

Binding. Each is something an incumbent already does well, or something that
rots.

| Not building | Because |
|---|---|
| **Orchestration of any kind** | **The line that defines the product.** No starting, stopping, restarting, routing, queueing, scheduling or assigning. herdr, agent-manager and TUICommander already run agents; skein only ever *describes* what is running |
| **Blocking or gating an agent's work** | D8. Advisory only, forever |
| Locks, claims, leases on files | The same thing wearing a filesystem hat |
| Cost and token panels | agtop and agentic-metric both do this well. Weeks spent to draw even |
| Process trees, CPU/memory gauges | agtop's is good, and it is three platforms of `ps`/`lsof` pain |
| Session management (start/stop/attach) | herdr and agent-manager own this |
| A hosted or shared dashboard | Paths and titles carry client names. Nothing leaves the machine |
| Config or skill browsers | agtop has one |
| Writing to any agent's files | Read-only, always |
| A daemon or background indexer | D10. Nothing to start, nothing to have crashed |
| A theme system in v1 | btop R6 is admired, not adopted yet. Inherit the terminal (R5) until someone asks |
| Grouping repos into products by directory inference | D6 |

The `aps` test still applies: *if you stopped using this for three months, would
it be worse when you came back?* Collision history gets richer. A cost panel
just redraws what agtop already showed you.

---

## 10. Open questions

| # | Question | Current lean |
|---|---|---|
| ~~Q1~~ | ~~Do Codex and opencode expose any hook surface?~~ | **RESOLVED — yes, both.** §7. Codex uses Claude's exact schema; opencode takes a plugin |
| Q2 | Is the metric *attention* (active minutes, prompts) or *outcomes* (PRs, files landed)? | Attention for the chart, outcomes for the list |
| Q3 | Is 30 minutes the right collision window? | M0 decides. D7 is written in pencil until it reports |
| Q4 | Where does the cache live — `~/.skein/` or XDG `~/.local/share/skein/`? | `~/.skein/`, matching the `.claude`/`.codex`/`.aps` neighbours it sits beside. Moving it later needs a migration |
| Q5 | Does `skein who` report reads, or only writes? | Writes in v1. opencode and Codex both distinguish them; Claude's contract is thinner. Reads may be noise |
| Q6 | Does the Kitty/Sixel tier slot into the btop R2 symbol table, or need its own path? | Unknown, and it sets M2's cost. Worth a spike before M2, not before M1 |
| Q7 | Should the hook line be suppressed when there is nothing to say? | **Yes** — silence when alone. AXI 5's "definitive empty state" governs the CLI, not an injected line nobody asked for |

---

## 11. Acceptance criteria

Properties a change must not break. Written now so M1 has something to fail
against.

1. **Never writes to any agent's file.** The only path written is skein's own
   cache.
2. **Never blocks.** The hook exits 0 on every path, including every error path.
   No exit code skein produces can halt a session.
3. **Advisory language only.** No output tells an agent what to do — it reports
   what is true and stops.
4. **Absence reads as absence.** A Codex row missing branch and title renders as
   absent, never as an error or an empty-looking bug.
5. **The loose bucket is visible and counted**, and never silently swallows a
   session.
6. **Metric parity.** Every metric the TUI shows is answerable from the CLI, and
   the reverse (D13).
7. **First run is useful.** No configuration, no import, no index build before
   the tool answers.
8. **Absent agents are normal.** No error, no prompt to install anything.
9. **Zero runtime dependencies**, verified in CI.
10. **The hook is honest.** Where it cannot work, `skein install` says so and
    prints the wiring that can.
11. **A stranger can tell it apart from agtop in one screenshot** (R7). The top
    level is a *project*, not a session. If that is not instantly legible, the
    identity is wrong, not the marketing.

---

## 12. Milestones **[REVISED]**

| | What | Outcome |
|---|---|---|
| ~~**M0**~~ | Throwaway script over existing session files | ✅ **Cleared: 97 collisions / 30 days** against a threshold of 5. `tools/m0.mjs`, `docs/m0-result.txt` |
| ~~**M0.5**~~ | Confirm the hook surface on all three agents | ✅ **All three have one**; Codex shares Claude's schema (§7) |
| ~~**M1**~~ | ~~CLI door + hook, no TUI~~ → **CLI door + hook + TUI** | ✅ Shipped. 43 tests, zero runtime dependencies. TUI pulled forward from M2 by the author's call (§0.1) |
| **M2** | What M1 deliberately left out — see below | Next |

### 12.1 What M1 did not do **[NEW]**

Recorded so the gaps are known rather than discovered:

| | Why it was left |
|---|---|
| **CI** | Added alongside this revision. The matrix matters more here than for `aps`: this reads paths written by three programs on three operating systems |
| **Publish workflow** | Nothing to publish until the name and version are settled |
| **The Kitty/Sixel tier** (design language D1, thesis Q6) | The braille tier is good on its own, which was the R4 mitigation. Still unspiked |
| **Expand-on-focus for sessions** (design language D2) | The detail box shows them instead. Cheaper, and it may be enough |
| **Themes** (design language D3) | Q5's lean holds: inherit the terminal, ship none |
| **Same-function / same-hunk collisions** (Q4) | File granularity has not proved too noisy yet |

### 12.2 The one thing M1 learned that changes M2 **[NEW]**

**`loose` is not the scratch bucket the thesis predicted.** Thesis §6.4 measured
24% of sessions as having no git root and called the remainder "entirely
scratch". Running it, `loose` holds **~1,000 events of real work** — the parent
directory `~/Documents/opensource`, and an un-versioned notes vault.

D5 behaves exactly as designed: visible, counted, never promoted. The *thesis's
characterisation* is what was wrong, and it matters because a bucket of real
work is worth a row in the TUI, whereas a bucket of junk is worth suppressing.
Leave it visible.
