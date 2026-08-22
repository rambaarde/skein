# Regenerate with:
#
#   docker build -t vhs-node docs/vhs-node
#   docker run --rm --network=none -v "$PWD:/repo:ro" -v "$PWD/docs:/out" \
#     -v "$PWD/docs/demo.tape:/tape.tape:ro" vhs-node /tape.tape
#   bash scripts/optimize.sh docs/demo.mp4 docs/demo.gif
#
# skein — the demo. Every frame is the real program reading a FIXTURE world
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

Type "./skein"
Sleep 400ms
Enter
Sleep 4s

# 1 all — attention per project, the table, the live feed.
Down@700ms 2
Sleep 2500ms

# The detail pane: what an agent is told, then the tool calls behind the edits.
Tab
Sleep 1200ms
Tab
Sleep 1200ms
Tab
Sleep 2800ms

# The project's own screen.
Enter
Sleep 4s
Escape
Sleep 1200ms

# 2 watch — the feed at full width.
Type "p"
Sleep 2500ms

# 3 table — the most projects on screen.
Type "p"
Sleep 2500ms

# Widen the window: velocity is a "where did the week go" question, and a
# day is too short a lever to see a trend with.
Type "a"
Sleep 900ms
Type "a"
Sleep 1800ms

# 4 velocity — what landed, and how long it took.
Type "p"
Sleep 5s

Escape
Sleep 1500ms
Type "q"
Sleep 1s
