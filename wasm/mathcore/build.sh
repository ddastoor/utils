#!/usr/bin/env bash
# Builds src/wasm/bin/mathcore.wasm from mathcore.c (own code) as a WASI reactor.
#   ZIG=/path/to/zig wasm/mathcore/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
EXPORTS=$(grep -oE '^API [^(]*\b(m_[a-z0-9_]+)\(' "$HERE/mathcore.c" | grep -oE 'm_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O3 -msimd128 \
  "$HERE/mathcore.c" $EXPORTS -Wl,--strip-all -Wl,-z,stack-size=262144 -o "$ROOT/src/wasm/bin/mathcore.wasm"
ls -l "$ROOT/src/wasm/bin/mathcore.wasm"
