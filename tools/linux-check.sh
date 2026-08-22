#!/bin/sh
# Prove skeins works on Linux, on a Linux kernel, rather than assuming it.
#
#   sh tools/linux-check.sh
#
# Everything skeins reads is a path, and every path assumption that is wrong is
# wrong silently: the screen is simply empty. A user on Linux reported exactly
# that, and it could not be reproduced on the machine that wrote the code --
# which is the whole argument for running this somewhere else.
#
# The container gets a DELIBERATELY HOSTILE environment: XDG_DATA_HOME and
# CLAUDE_CONFIG_DIR pointed somewhere no default would ever put them. If skeins
# still finds the fixture world, its path handling is honouring the variables
# rather than getting lucky on the defaults.
set -e

REPO=$(cd "$(dirname "$0")/.." && pwd)
# The full image, not -slim: it already carries git, and the sandbox is built
# out of real git repositories. -slim would need apt, and apt needs a network
# this deliberately does not have.
IMAGE=node:22

echo "building a fixture world and reading it back, inside $IMAGE"

docker run --rm --network=none \
  -v "$REPO:/repo:ro" \
  -e HOME=/demo/home \
  -e XDG_DATA_HOME=/demo/xdg-data \
  -e XDG_CONFIG_HOME=/demo/xdg-config \
  -e CLAUDE_CONFIG_DIR=/demo/claude-elsewhere \
  "$IMAGE" sh -c '
    set -e
    # HOME does not exist yet, and git writes its config there.
    mkdir -p "$HOME"
    git config --global init.defaultBranch main
    git config --global user.email fixture@example.com
    git config --global user.name fixture

    # The sandbox builds against the env it is run with, so the stores land in
    # the same non-default places skeins will look in.
    node /repo/tools/sandbox.mjs /demo >/dev/null

    echo
    echo "--- where the fixture actually put things ---"
    ls -d /demo/xdg-data/opencode/storage 2>/dev/null && echo "  opencode: honoured XDG_DATA_HOME"
    ls -d /demo/claude-elsewhere/projects 2>/dev/null && echo "  claude:   honoured CLAUDE_CONFIG_DIR"
    ls -d /demo/home/.codex/sessions      2>/dev/null && echo "  codex:    ~/.codex as documented"

    echo
    echo "--- what skeins reads back, run DIRECTLY against the hostile env ---"
    echo "    (not through ./skeins, which pins everything inside the sandbox)"
    SKEIN_HOME=/demo/skeins-state node /repo/bin/skeins.js ls --since 30d

    echo
    echo "--- and the metrics that need git ---"
    SKEIN_HOME=/demo/skeins-state node /repo/bin/skeins.js velocity --all --since 30d | head -8
  '
