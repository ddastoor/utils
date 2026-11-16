#!/usr/bin/env bash
# Rebuilds every WebAssembly module we compile ourselves, then runs their self-tests.
#   ZIG=/path/to/zig wasm/build-all.sh
# Toolchain: Zig (pip download ziglang==0.17.1; see CLAUDE.md §5). Each module's build.sh pins and verifies its sources.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
for m in crypto mathcore textcore imgproc metacore markdown busybox; do
  if [ -x "$HERE/$m/build.sh" ]; then echo "== $m"; "$HERE/$m/build.sh"; fi
done
node "$HERE/../tests/unit.mjs"
