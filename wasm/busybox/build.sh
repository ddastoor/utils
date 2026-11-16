#!/usr/bin/env bash
# Builds src/wasm/bin/busybox.wasm — BusyBox compiled by us to wasm32-wasi (WASI command module) for the
# Linux Terminal tab and the bc console. ZIG=/path/to/zig wasm/busybox/build.sh
#  - source: busybox_1.38.0.orig.tar.bz2 from the Ubuntu archive, SHA-256 checked against Ubuntu's signed .dsc
#    (busybox.net itself is not reachable from the build sandbox)
#  - applets: applets.cfg (file/stdio/clock/random only — nothing that needs processes, sockets, ttys or mounts)
#  - compat.h + wasi_stubs.c: POSIX bits WASI lacks (fail with ENOSYS or act as a single root user)
#  - setjmp/longjmp via wasm exception handling (-mllvm -wasm-enable-sjlj; tag in sjlj_tag.s)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
VER=1.38.0
SHA=34f9ea6ff8636f2c9241153b9114eefa9e65674a45318ae1ef95bb5f31c53bb2
W="$HERE/.build"; mkdir -p "$W"; cd "$W"
TAR="busybox_$VER.orig.tar.bz2"
[ -f "$TAR" ] || curl -fsSL --retry 3 -o "$TAR" "http://archive.ubuntu.com/ubuntu/pool/main/b/busybox/$TAR"
echo "$SHA  $TAR" | sha256sum -c -
rm -rf "busybox-$VER"; tar xjf "$TAR"; cd "busybox-$VER"

# toolchain wrappers (LLVM ar/wasm-ld understand wasm objects; compat.h only for C sources)
cat > "$W/zigcc" <<CC
#!/bin/sh
INC="-include $HERE/compat.h"
for a in "\$@"; do case "\$a" in *.S|*.s|-E|-xassembler-with-cpp) INC="";; esac; done
exec "$ZIG" cc --target=wasm32-wasi -mexception-handling -mllvm -wasm-enable-sjlj -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_MMAN \$INC "\$@"
CC
printf '#!/bin/sh\nexec "%s" ar "$@"\n' "$ZIG" > "$W/zigar"
cat > "$W/zigld" <<LD
#!/bin/sh
args=""; for a in "\$@"; do [ "\$a" = "-nostdlib" ] || args="\$args \$a"; done
exec "$ZIG" wasm-ld \$args
LD
chmod +x "$W/zigcc" "$W/zigar" "$W/zigld"

# config: everything off, then our applet list
make allnoconfig >/dev/null 2>&1
grep -v '^#' "$HERE/applets.cfg" | grep -v '^$' | while IFS= read -r l; do
  k=${l%%=*}; v=${l#*=}; sed -i "/^# $k is not set$/d; /^$k=.*/d" .config
  if [ "$v" = n ]; then echo "# $k is not set" >> .config; else echo "$l" >> .config; fi
done
sed -i '/^# CONFIG_LFS is not set$/d' .config; echo CONFIG_LFS=y >> .config
yes "" | make oldconfig >/dev/null 2>&1 || true   # yes(1) gets SIGPIPE when make finishes

cp "$HERE/wasi_stubs.c" libbb/; echo "lib-y += wasi_stubs.o" >> libbb/Kbuild.src
make -j"$(nproc)" CC="$W/zigcc" AR="$W/zigar" LD="$W/zigld" HOSTCC=gcc SKIP_STRIP=y busybox_unstripped >/dev/null
"$W/zigcc" -c -mexception-handling "$HERE/sjlj_tag.s" -o "$W/sjlj_tag.o"
# BusyBox's trylink drops main (WASI's _start only references it weakly) — link ourselves with appletlib.o first
"$W/zigcc" -Oz -o "$ROOT/src/wasm/bin/busybox.wasm" libbb/appletlib.o "$W/sjlj_tag.o" \
  -Wl,--start-group $(ls */lib.a */*/lib.a) -Wl,--end-group -Wl,--strip-all \
  -lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-getpid -lwasi-emulated-mman
ls -l "$ROOT/src/wasm/bin/busybox.wasm"
./busybox_unstripped --list 2>/dev/null | wc -l || true
