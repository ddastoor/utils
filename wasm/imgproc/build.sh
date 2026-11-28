#!/usr/bin/env bash
# Builds src/wasm/bin/imgproc.wasm (own C) — ZIG=/path/to/zig wasm/imgproc/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
EXPORTS=$(grep -ohE '^API [^(]*\b(p_[a-z0-9_]+)\(' "$HERE/imgproc.c" "$HERE/flatten.c" "$HERE/kindle.c" "$HERE/flat.c" | grep -oE 'p_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O3 -msimd128 "$HERE/imgproc.c" $EXPORTS \
  -Wl,--strip-all -Wl,-z,stack-size=1048576 -Wl,--max-memory=4294901760 -o "$ROOT/src/wasm/bin/imgproc.wasm"
ls -l "$ROOT/src/wasm/bin/imgproc.wasm"
