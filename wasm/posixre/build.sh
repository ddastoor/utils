#!/bin/bash
# Builds src/wasm/bin/posix-re.wasm — the Regex Tester's POSIX ERE flavour (to-do #8): GNU's regex (gnulib's regcomp /
# regexec, as GNU grep 3.12's source ships them; glibc's are the same code) + glue.c, a WASI reactor. Needs ZIG.
# Source: grep_3.12.orig.tar.xz from the Ubuntu archive (SHA-256 from its signed grep_3.12-1.dsc).
set -euo pipefail
: "${ZIG:?set ZIG to the zig binary (CLAUDE.md §5)}"
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
WORK=${WORK:-/tmp/posixre-build}; mkdir -p "$WORK"; cd "$WORK"
TAR=grep_3.12.orig.tar.xz SHA=2649b27c0e90e632eadcd757be06c6e9a4f48d941de51e7c0f83ff76408a07b9
[ -f "$TAR" ] || curl -fsSL --retry 3 -o "$TAR" "http://archive.ubuntu.com/ubuntu/pool/main/g/grep/$TAR"
echo "$SHA  $TAR" | sha256sum -c -
rm -rf grep-3.12 && tar xf "$TAR"
L=grep-3.12/lib
"$ZIG" cc --target=wasm32-wasi -O2 -mexec-model=reactor -D_GNU_SOURCE -include "$HERE/config.h" -I "$HERE" -I "$L" -I grep-3.12 \
  -Wno-everything -o "$ROOT/src/wasm/bin/posix-re.wasm" "$L/regex.c" "$L"/malloc/dynarray_*.c "$HERE/glue.c" \
  -Wl,--strip-all -Wl,--export=px_run -Wl,--export=px_alloc -Wl,--export=px_free -Wl,--export=px_out -Wl,--export=px_out_len
ls -la "$ROOT/src/wasm/bin/posix-re.wasm"
