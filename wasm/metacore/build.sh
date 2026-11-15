#!/usr/bin/env bash
# Builds src/wasm/bin/metacore.wasm (own C: EXIF reader, metadata stripper, JPEG DPI, image sniffing).
#   ZIG=/path/to/zig wasm/metacore/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
EXPORTS=$(grep -oE '^API [^(]*\b(m_[a-z0-9_]+)\(' "$HERE/metacore.c" | grep -oE 'm_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O2 -Wall -Wextra "$HERE/metacore.c" $EXPORTS -Wl,--strip-all -Wl,--max-memory=2147483648 -o "$ROOT/src/wasm/bin/metacore.wasm"
ls -l "$ROOT/src/wasm/bin/metacore.wasm"
