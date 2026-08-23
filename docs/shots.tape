# Every screen, as a still, from the SAME fixture world the gif uses.
#
#   sh docs/shots.sh
#
# VHS 0.11 has no Screenshot command, so this records one clip with a FIXED
# cadence -- every screen held for exactly four seconds -- and shots.sh pulls a
# frame from the middle of each. Timing is the contract between the two files:
# change a Sleep here and the extraction offsets move with it.
#
# Screenshots rather than a second gif: a reader deciding whether to install
# something wants to see the screens, and a gif makes them wait for the one
# they care about. The gif shows the tool moving; these show what it is.
#
# Nothing here touches real history. tools/sandbox.mjs builds invented
# repositories and invented transcripts inside the container, and the container
# has no access to anything else.
Output "/out/screens.mp4"

Set Shell "bash"
Set FontSize 15
Set Width 1500
Set Height 850
Set Padding 22
Set Theme { "name": "skein", "background": "#0d0f14", "foreground": "#c8d3e0", "cursor": "#e5b567", "selection": "#2a3040", "black": "#0d0f14", "red": "#d1495b", "green": "#7cb87c", "yellow": "#e5b567", "blue": "#4fb3c8", "magenta": "#b48ead", "cyan": "#49b7a0", "white": "#c8d3e0", "brightBlack": "#4d5666", "brightRed": "#d9866a", "brightGreen": "#8fbf8f", "brightYellow": "#e8d17a", "brightBlue": "#6ec4d8", "brightMagenta": "#c39fbd", "brightCyan": "#5fd0b8", "brightWhite": "#e6edf5" }

Hide
Type "export LANG=C.UTF-8 LC_ALL=C.UTF-8 && cd /repo && node tools/sandbox.mjs /demo >/dev/null 2>&1 && cd /demo && clear"
Enter
Sleep 15s
Type "./skeins"
Enter
Sleep 5s
# Thirty days, not the default twenty-four hours. The fixture spreads its
# commits over a month, so at 24h the project page has no judged deployment and
# its failure panes -- the ones worth a screenshot -- correctly do not appear.
Type "a"
Sleep 600ms
Type "a"
Sleep 2s
Show

# Each screen is held for exactly SECONDS=4, and the transitions between them
# are instant, so frame N sits at 2 + 4N seconds.
Sleep 4s

Enter
Sleep 4s
Escape

Type "p"
Sleep 4s

Type "p"
Sleep 4s

Type "p"
Sleep 4s

Type "p"
Sleep 4s

Type "1"
Type "m"
Sleep 4s

Enter
Sleep 4s

Hide
Type "q"
Sleep 1s
