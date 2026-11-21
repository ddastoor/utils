#!/usr/bin/env bash
# Builds src/wasm/bin/python.wasm (CPython 3.14.8, PSF licence) for wasm32-wasi with zig, and src/wasm/bin/python314.zip
# (its standard library, precompiled .pyc, plus the tzdata time-zone package). Sources: the Ubuntu archive's
# python3.14_3.14.8.orig.tar.xz and zlib 1.3.2 (SHA-256 from the signed .dsc files; python.org/github are not reachable
# from the sandbox), tzdata 2026.6 and the regex module 2026.11.19 (mrab-regex, Apache-2.0 / CNRI-Python — the Regex
# Tester's "Python (regex module)" flavour, and import regex in the Python tab) from PyPI (SHA-256 published by PyPI).
# Steps: native CPython (the "build Python" a cross build needs) → zlib for wasm → CPython's own WASI configure
# (Tools/wasm/wasi/config.site + config.site.extra) with zig cc → make. wasi_start.c links zig's single-threaded
# libc main thread into its own thread list (else pthread_key_delete loops forever at exit), starts in $PWD and
# supplies local time (wasi-libc has no time zones: the host answers from the browser's Intl).
# One patch to the upstream sources, stack-guard.patch: CPython 3.14 limits C recursion by the address of the stack in
# wasm memory, but what runs out in a browser is the engine's own call stack (about 1 MB, invisible to C) — memoised
# recursion 500 deep, a runaway __repr__ or JSON nested 2000 deep ended in "Maximum call stack size exceeded" instead
# of a RecursionError. The patch makes every function that checks the limit reserve SUPERTOOLS_STACK_PAD bytes (the
# interpreter loop SUPERTOOLS_EVAL_PAD more), so the visible stack counts nested calls, and sets the budget
# SUPERTOOLS_C_STACK (overridable at start-up with the environment variable of the same name). The three numbers were
# measured in Chrome (tests/e2e/python.e2e.mjs keeps the table): every recursion path stops with a RecursionError at
# 55–75 % of the depth at which the engine's stack would overflow.
#   ZIG=/path/to/zig wasm/python/build.sh          (≈ 10 min on 4 cores; needs a host C compiler, make, xz)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
: "${ZIG:?set ZIG to the zig binary}"
WORK="${WORK:-/tmp/python-build}"; mkdir -p "$WORK"; cd "$WORK"
PY=python3.14_3.14.8.orig.tar.xz; PYSHA=c2215904f02b175596dc49351585104f4bc20341e1c47378b26a2c274360ce73
ZL=zlib_1.3.dfsg+really1.3.2.orig.tar.gz; ZLSHA=7b6903eb019983987b7112eccf90f1703f1c6c0e0cede36564bf611d19ca579d
TZ=tzdata-2026.6-py2.py3-none-any.whl; TZSHA=0a10eec6e13ef16b627fabed9a5f2ba61a62b1c67f327305f4e7e412a70b4aec
RX=regex-2026.11.19.tar.gz; RXSHA=2826a006b68acfd3ed5074433caafe21d7f9d026eb82cb856724a4a893a70915
[ -f "$PY" ] || curl -fsSL --retry 4 -o "$PY" "https://archive.ubuntu.com/ubuntu/pool/main/p/python3.14/$PY"
[ -f "$ZL" ] || curl -fsSL --retry 4 -o "$ZL" "https://archive.ubuntu.com/ubuntu/pool/main/z/zlib/$ZL"
[ -f "$TZ" ] || curl -fsSL --retry 4 -o "$TZ" "https://files.pythonhosted.org/packages/0a/66/9a06c2227fedfd4919f0eaaa8b94377d9730882a7e4f95823c9a331ab5e1/$TZ"
[ -f "$RX" ] || curl -fsSL --retry 4 -o "$RX" "https://files.pythonhosted.org/packages/b8/17/ef8c46a9e7cf2304968eb260f594bbd4220fab6281e64c090cdd85884511/$RX"
printf '%s  %s\n%s  %s\n%s  %s\n%s  %s\n' "$PYSHA" "$PY" "$ZLSHA" "$ZL" "$TZSHA" "$TZ" "$RXSHA" "$RX" | sha256sum -c -
rm -rf Python-3.14.8 zsrc zlib native wasi zipsrc tz regex-2026.11.19 && tar xJf "$PY" && mkdir zsrc zlib native wasi tz && tar xzf "$ZL" -C zsrc
(cd Python-3.14.8 && patch -p1 --no-backup-if-mismatch < "$HERE/stack-guard.patch")
GUARD="-DSUPERTOOLS_STACK_PAD=512 -DSUPERTOOLS_EVAL_PAD=384 -DSUPERTOOLS_C_STACK=580000"
# local time comes from the host (wasi-libc has no time zones): see wasi_start.c
LOCALTIME="-Dlocaltime_r=supertools_localtime_r -Dmktime=supertools_mktime"
S="$WORK/Python-3.14.8"; J=$(nproc)
# the regex module (mrab-regex, PyPI "regex"): its C extension is built in as the module _regex (Modules/Setup.local);
# its Python package goes into the zip with regex_ext.py as regex/_regex.py, which hands the package the built-in module
# (regex-wasm.patch: five functions declared with fewer parameters than CPython calls them with — a trap in WebAssembly)
tar xzf "$RX" && (cd regex-2026.11.19 && patch -p1 --no-backup-if-mismatch < "$HERE/regex-wasm.patch") \
  && cp regex-2026.11.19/src/_regex.c regex-2026.11.19/src/_regex.h regex-2026.11.19/src/_regex_unicode.c \
  regex-2026.11.19/src/_regex_unicode.h "$S/Modules/"
mkdir -p wasi/Modules && printf '*static*\n_regex _regex.c _regex_unicode.c\n' > wasi/Modules/Setup.local
# 1. native build Python
(cd native && "$S/configure" -q && make -j"$J" -s >/dev/null)
# 2. zlib for wasm32-wasi
ZD=$(ls -d zsrc/*/)
for f in adler32 compress crc32 deflate gzclose gzlib gzread gzwrite infback inffast inflate inftrees trees uncompr zutil; do
  "$ZIG" cc --target=wasm32-wasi -O2 -D_LARGEFILE64_SOURCE=1 -DHAVE_UNISTD_H -c "$ZD$f.c" -o "zlib/$f.o"; done
"$ZIG" ar rcs zlib/libz.a zlib/*.o; cp "$ZD/zlib.h" "$ZD/zconf.h" zlib/
"$ZIG" cc --target=wasm32-wasi -O2 -c "$HERE/wasi_start.c" -o wasi_start.o
# 3. zig wrappers (zig rejects --stack-first, which only changes the memory layout)
cat > zcc <<W
#!/bin/sh
for a do shift; case "\$a" in -Wl,--stack-first) ;; *) set -- "\$@" "\$a";; esac; done
exec "$ZIG" cc --target=wasm32-wasi "\$@"
W
printf '#!/bin/sh\nexec "%s" ar "$@"\n' "$ZIG" > zar; printf '#!/bin/sh\nexec "%s" ranlib "$@"\n' "$ZIG" > zranlib; chmod +x zcc zar zranlib
cat "$S/Tools/wasm/wasi/config.site-wasm32-wasi" "$HERE/config.site.extra" > config.site
# 4. CPython for wasm32-wasi
(cd wasi && CONFIG_SITE="$WORK/config.site" CC="$WORK/zcc" AR="$WORK/zar" RANLIB="$WORK/zranlib" CFLAGS="-O2 -Wno-date-time" \
  LDFLAGS="-Wl,--strip-all" ZLIB_CFLAGS="-I$WORK/zlib" ZLIB_LIBS="$WORK/zlib/libz.a" PKG_CONFIG_PATH= PKG_CONFIG_LIBDIR=/nonexistent \
  LIBS="$WORK/wasi_start.o" "$S/configure" -q --host=wasm32-wasip1 --build=x86_64-pc-linux-gnu --with-build-python="$WORK/native/python" \
  --prefix=/ --disable-test-modules && make -j"$J" -s EXTRA_CFLAGS="$GUARD $LOCALTIME" >/dev/null)
cp wasi/python.wasm "$ROOT/src/wasm/bin/python.wasm"
# 5. standard library zip: .pyc only (compiled by the same CPython version), without tests, IDLE, Tk, venv, ensurepip…
#    (pydoc_data stays: help("if"), help("LISTS") and the other topics need it; dbm.dumb stays: shelve needs it)
cp -r "$S/Lib" zipsrc && cp wasi/build/lib.wasi-wasm32-3.14/_sysconfig* zipsrc/
# our own additions (wasm/python/lib): a no-network stand-in for _socket (so that socket, asyncio, doctest, logging.handlers,
# email.utils, urllib.request … import), an asyncio event loop that needs no sockets or threads, sitecustomize
cp "$HERE"/lib/*.py zipsrc/
mkdir zipsrc/regex && cp regex-2026.11.19/regex/__init__.py regex-2026.11.19/regex/_main.py regex-2026.11.19/regex/_regex_core.py zipsrc/regex/ \
  && cp "$HERE/regex_ext.py" zipsrc/regex/_regex.py
python3 "$HERE/patch-stdlib.py" zipsrc
(cd tz && python3 -m zipfile -e "../$TZ" . && cp -r tzdata ../zipsrc/)
(cd zipsrc && rm -rf test idlelib tkinter turtledemo ensurepip venv __phello__ site-packages turtle.py sqlite3 dbm/sqlite3.py dbm/gnu.py dbm/ndbm.py curses \
  && find . -type d \( -name tests -o -name __pycache__ \) -prune -exec rm -rf {} + \
  && "$WORK/native/python" -m compileall -q -b --invalidation-mode unchecked-hash . && find . -name '*.py' -delete \
  && "$WORK/native/python" -c "
import zipfile, os
z = zipfile.ZipFile('$ROOT/src/wasm/bin/python314.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
for r, ds, fs in os.walk('.'):
    ds.sort()
    for f in sorted(fs):
        p = os.path.join(r, f)[2:]; i = zipfile.ZipInfo(p, (2026, 1, 1, 0, 0, 0)); i.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(i, open(p, 'rb').read(), compresslevel=9)
z.close()")
ls -la "$ROOT/src/wasm/bin/python.wasm" "$ROOT/src/wasm/bin/python314.zip"
# 6. things made from this build — run them after every rebuild and commit their output:
#    python3 scripts/make-tzabbr.py                              (src/lib/tzabbr.json: zone names of the tzdata in the zip)
#    "$WORK/native/python" scripts/make-python-reference.py     (tests/fixtures/python/reference.json: native CPython's answers)
echo "now run: python3 scripts/make-tzabbr.py && $WORK/native/python scripts/make-python-reference.py"
