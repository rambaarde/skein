#!/bin/sh
# Every screen as a still, from the fixture world the gif uses.
#
#   sh docs/shots.sh
#
# VHS 0.11 has no Screenshot command, so docs/shots.tape records one clip that
# holds each screen for exactly four seconds and this pulls a frame from the
# middle of each. The offsets below are that cadence, not guesses: screen N is
# at 2 + 4N seconds.
#
# Nothing here reads real history. tools/sandbox.mjs builds invented
# repositories and transcripts inside the container, which has nothing else.
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT="$REPO/docs/shots"
mkdir -p "$OUT"

docker build -q -t skeins-vhs "$REPO/docs/vhs-node" >/dev/null
docker run --rm --entrypoint sh -v "$REPO:/repo:ro" -v "$OUT:/out" skeins-vhs \
  -c 'vhs /repo/docs/shots.tape' >/dev/null

i=0
for name in preset-1-all project preset-2-watch preset-3-table \
            preset-4-velocity preset-5-graph menu metrics; do
  at=$(( 2 + 4 * i ))
  docker run --rm --entrypoint sh -v "$OUT:/out" skeins-vhs \
    -c "ffmpeg -v error -ss $at -i /out/screens.mp4 -frames:v 1 -y /out/$name.png"
  # Palette-reduced to 64 colours. A terminal uses a handful, and the raw
  # frames were 2.6MB for eight stills -- committed weight for no visible
  # difference, in a repository whose whole point is having no dependencies
  # and nothing heavy in it.
  docker run --rm --entrypoint sh -v "$OUT:/out" skeins-vhs -c "
    ffmpeg -v error -i /out/$name.png -vf 'palettegen=max_colors=64:stats_mode=full' -y /tmp/p.png
    ffmpeg -v error -i /out/$name.png -i /tmp/p.png -lavfi 'paletteuse=dither=none' -y /out/$name.q.png
    mv /out/$name.q.png /out/$name.png"
  echo "  ${at}s  docs/shots/$name.png"
  i=$(( i + 1 ))
done
rm -f "$OUT/screens.mp4"
