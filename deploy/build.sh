#!/bin/sh
# Builds the Scriba image for this machine's architecture and loads it into the local daemon.
#
# Usage: deploy/build.sh [image-tag]
# The default tag is bbartolome/scriba:dev. A multi-architecture build needs a registry (buildx
# cannot --load more than one platform), so publishing is left to the release workflow.
set -eu

TAG="${1:-bbartolome/scriba:dev}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

docker buildx build \
  --platform "${PLATFORM:-linux/$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')}" \
  --file "$ROOT/deploy/Dockerfile" \
  --tag "$TAG" \
  --load \
  "$ROOT"
