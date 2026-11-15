#!/usr/bin/env bash
# Builds src/wasm/bin/textcore.wasm (own C) — ZIG=/path/to/zig wasm/textcore/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
EXPORTS=$(grep -oE '^API [^(]*\b(t_[a-z0-9_]+)\(' "$HERE/textcore.c" | grep -oE 't_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O3 -msimd128 "$HERE/textcore.c" $EXPORTS -Wl,--strip-all -Wl,--max-memory=1073741824 -o "$ROOT/src/wasm/bin/textcore.wasm"
ls -l "$ROOT/src/wasm/bin/textcore.wasm"
