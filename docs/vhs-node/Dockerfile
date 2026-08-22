# VHS ships ttyd + ffmpeg + fonts but no node and no git. skeins is a node
# program whose demo world is built out of real git repositories, so add both.
FROM ghcr.io/charmbracelet/vhs
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl xz-utils \
 && curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-arm64.tar.xz -o /tmp/node.tar.xz \
 && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
 && rm /tmp/node.tar.xz \
 && rm -rf /var/lib/apt/lists/*
