#!/usr/bin/env bash
# Builds src/wasm/bin/geo.wasm: Charles Karney's geodesic.c 2.2 (GeographicLib's geodesic routines in C, MIT) + glue.c.
# Source: the two files src/geodesic.c and src/geodesic.h of the PROJ 9.9.0 release (PROJ ships Karney's library
# unmodified), from proj_9.9.0.orig.tar.gz in the Ubuntu archive; SHA-256 from Ubuntu's signed proj_9.9.0-1.dsc.
#   ZIG=/path/to/zig wasm/geo/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
URL=http://archive.ubuntu.com/ubuntu/pool/universe/p/proj/proj_9.9.0.orig.tar.gz
SHA=791a0610547eeabb17006cfd49cdbd2034f3240f47ed5e88a1031811f4e2bcf3
WORK="${TMPDIR:-/tmp}/geo-build"; rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
curl -fsSL --retry 4 -o src.tgz "$URL"
echo "$SHA  src.tgz" | sha256sum -c -
tar xzf src.tgz --wildcards '*/src/geodesic.c' '*/src/geodesic.h'
S="$WORK/proj-9.9.0/src"
grep -q 'GEODESIC_VERSION_MAJOR 2' "$S/geodesic.h" && grep -q 'GEODESIC_VERSION_MINOR 2' "$S/geodesic.h"
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O2 -I"$S" "$S/geodesic.c" "$HERE/glue.c" \
  $(grep -oE '^API [^(]*\b(g_[a-z0-9_]+)\(' "$HERE/glue.c" | grep -oE 'g_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ') \
  -Wl,--strip-all -Wl,-z,stack-size=65536 -o "$ROOT/src/wasm/bin/geo.wasm"
ls -l "$ROOT/src/wasm/bin/geo.wasm"
