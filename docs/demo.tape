# Regenerate with:
#
#   docker build -t vhs-node docs/vhs-node
#   docker run --rm --network=none -v "$PWD:/repo:ro" -v "$PWD/docs:/out" \
#     -v "$PWD/docs/demo.tape:/tape.tape:ro" vhs-node /tape.tape
#   bash scripts/optimize.sh docs/demo.mp4 docs/demo.gif
#
# skeins — the demo. Every frame is the real program reading a FIXTURE world
# built by tools/sandbox.mjs: five git repositories, sessions for all three
# agents, one deliberate collision. Nothing here is anybody's real history.
Output "/out/demo.mp4"

Set Shell "bash"
Set FontSize 15
Set Width 1500
Set Height 850
Set Padding 22
Set Theme { "name": "skein", "background": "#0d0f14", "foreground": "#c8d3e0", "cursor": "#e5b567", "selection": "#2a3040", "black": "#0d0f14", "red": "#d1495b", "green": "#7cb87c", "yellow": "#e5b567", "blue": "#4fb3c8", "magenta": "#b48ead", "cyan": "#49b7a0", "white": "#c8d3e0", "brightBlack": "#4d5666", "brightRed": "#d9866a", "brightGreen": "#8fbf8f", "brightYellow": "#e8d17a", "brightBlue": "#6ec4d8", "brightMagenta": "#c39fbd", "brightCyan": "#5fd0b8", "brightWhite": "#e6edf5" }

# Build the throwaway world, off camera.
Hide
Type "export LANG=C.UTF-8 LC_ALL=C.UTF-8 && cd /repo && node tools/sandbox.mjs /demo >/dev/null 2>&1 && cd /demo && clear"
Enter
Sleep 12s
Show

Type "./skeins"
Sleep 400ms
Enter
Sleep 4s

# 1 all — attention per project, the table, the live feed.
#
# Moving the cursor lights that project's line on the chart and fades the rest,
# and swaps the info pane's LIVE graph to the project now under it. Hold long
# enough on each for that pane to redraw: it is a rolling window, so it slides
# on its own even when nothing is happening.
Down@700ms 2
Sleep 3200ms
Up@700ms 2
Sleep 3200ms

# The detail pane: what an agent is told, the files, then the TOOL CALLS
# behind them -- a session is mostly reads, and the edits are the residue.
Tab
Sleep 1100ms
Tab
Sleep 1100ms
Tab
Sleep 3800ms

# Widen the window. A day is the right default for "what is running now", and
# too short a lever for anything about where the time went.
Type "a"
Sleep 800ms
Type "a"
Sleep 1800ms

# The project's own screen: agents, sessions, files and tools, all ranked,
# with the collisions this repo actually had along the bottom.
Enter
Sleep 6s
Escape
Sleep 1200ms

# 2 watch — the feed at full width.
Type "p"
Sleep 2500ms

# 3 table — the most projects on screen.
Type "p"
Sleep 2500ms

# 4 velocity — what landed, and how long it took.
Type "p"
Sleep 5s

Escape
Sleep 1500ms
Type "q"
Sleep 1s
