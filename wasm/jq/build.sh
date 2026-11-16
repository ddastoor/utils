#!/usr/bin/env bash
# Builds src/wasm/bin/jq.wasm: jq 1.8.2 (MIT; with its vendored oniguruma 6.9 regex library, BSD-2, and decNumber) compiled
# by us with zig cc for wasm32-wasi as a reactor + glue.c (jq_run). Source: Ubuntu archive jq_1.8.2.orig.tar.gz, SHA-256
# checked against the value in Ubuntu's signed jq_1.8.2-1ubuntu1.dsc (github.com is not reachable from the sandbox).
#   ZIG=/path/to/zig wasm/jq/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
: "${ZIG:?set ZIG to the zig binary}"
WORK="${WORK:-/tmp/jq-build}"; mkdir -p "$WORK"; cd "$WORK"
TAR=jq_1.8.2.orig.tar.gz; SHA=71b8d6e8f5fe81f6c6d0d110e3892251f6ce76ed095abd315e26e6e1193af3af
[ -f "$TAR" ] || curl -fsSL -o "$TAR" "https://archive.ubuntu.com/ubuntu/pool/main/j/jq/$TAR"
echo "$SHA  $TAR" | sha256sum -c -
rm -rf jq-1.8.2 && tar xzf "$TAR" && cd jq-1.8.2
printf '#!/bin/sh\nexec %s cc --target=wasm32-wasi -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_MMAN "$@"\n' "$ZIG" > "$WORK/zcc"; chmod +x "$WORK/zcc"
CC="$WORK/zcc" AR="$ZIG ar" RANLIB="$ZIG ranlib" CFLAGS="-O2" ./configure --host=wasm32-wasi --build=x86_64-linux-gnu \
  --with-oniguruma=builtin --disable-docs --disable-valgrind --disable-maintainer-mode --enable-static --disable-shared >/dev/null
make -C vendor/oniguruma -j8 >/dev/null
make src/builtin.inc src/config_opts.inc src/version.h >/dev/null
make -j8 libjq.la >/dev/null
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O2 -flto -I src -D_WASI_EMULATED_SIGNAL "$HERE/glue.c" .libs/libjq.a vendor/oniguruma/src/.libs/libonig.a \
  -lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-mman \
  $(for f in jq_alloc jq_dealloc jq_out jq_out_len jq_err jq_err_len jq_run; do printf -- '-Wl,--export=%s ' $f; done) \
  -Wl,--strip-all -Wl,-z,stack-size=4194304 -Wl,--max-memory=1073741824 -o "$ROOT/src/wasm/bin/jq.wasm"
ls -l "$ROOT/src/wasm/bin/jq.wasm"
