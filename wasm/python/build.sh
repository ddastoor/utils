#!/usr/bin/env bash
# Builds src/wasm/bin/python.wasm (CPython 3.14.8, PSF licence) for wasm32-wasi with zig, and src/wasm/bin/python314.zip
# (its standard library, precompiled .pyc, plus the tzdata time-zone package). Sources: the Ubuntu archive's
# python3.14_3.14.8.orig.tar.xz and zlib 1.3.2 (SHA-256 from the signed .dsc files; python.org/github are not reachable
# from the sandbox), tzdata 2026.6 and the regex module 2026.11.19 (mrab-regex, Apache-2.0 / CNRI-Python — the Regex
# Tester's "Python (regex module)" flavour, and import regex in the Python tab) from PyPI (SHA-256 published by PyPI);
# SQLite 3.54.1, bzip2 1.0.8 and xz 5.8.4 (liblzma) from the Ubuntu archive — the C libraries of the modules sqlite3, bz2
# and lzma (owner, 28 Nov 2026: "finish off the small choices"), linked in statically.
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
#   ZIG=/path/to/zig wasm/python/build.sh          (≈ 12 min on 4 cores; needs a host C compiler, make, xz)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
: "${ZIG:?set ZIG to the zig binary}"
WORK="${WORK:-/tmp/python-build}"; mkdir -p "$WORK"; cd "$WORK"
PY=python3.14_3.14.8.orig.tar.xz; PYSHA=c2215904f02b175596dc49351585104f4bc20341e1c47378b26a2c274360ce73
ZL=zlib_1.3.dfsg+really1.3.2.orig.tar.gz; ZLSHA=7b6903eb019983987b7112eccf90f1703f1c6c0e0cede36564bf611d19ca579d
TZ=tzdata-2026.6-py2.py3-none-any.whl; TZSHA=0a10eec6e13ef16b627fabed9a5f2ba61a62b1c67f327305f4e7e412a70b4aec
RX=regex-2026.11.19.tar.gz; RXSHA=2826a006b68acfd3ed5074433caafe21d7f9d026eb82cb856724a4a893a70915
SQ=sqlite3_3.54.1.orig.tar.xz; SQSHA=faeff7682200b3dd58c8f0f229892a7271c73c1fdabc86e7315eb31eb7cb6e83
XZ=xz-utils_5.8.4.orig.tar.xz; XZSHA=4ce24038fd4221e0d13bc1a2de7a4db56e90b92b3bf75321f6c14be73f65de4b
BZ=bzip2_1.0.8.orig.tar.gz; BZSHA=ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269
[ -f "$PY" ] || curl -fsSL --retry 4 -o "$PY" "https://archive.ubuntu.com/ubuntu/pool/main/p/python3.14/$PY"
[ -f "$ZL" ] || curl -fsSL --retry 4 -o "$ZL" "https://archive.ubuntu.com/ubuntu/pool/main/z/zlib/$ZL"
[ -f "$TZ" ] || curl -fsSL --retry 4 -o "$TZ" "https://files.pythonhosted.org/packages/0a/66/9a06c2227fedfd4919f0eaaa8b94377d9730882a7e4f95823c9a331ab5e1/$TZ"
[ -f "$RX" ] || curl -fsSL --retry 4 -o "$RX" "https://files.pythonhosted.org/packages/b8/17/ef8c46a9e7cf2304968eb260f594bbd4220fab6281e64c090cdd85884511/$RX"
[ -f "$SQ" ] || curl -fsSL --retry 4 -o "$SQ" "https://archive.ubuntu.com/ubuntu/pool/main/s/sqlite3/$SQ"
[ -f "$XZ" ] || curl -fsSL --retry 4 -o "$XZ" "https://archive.ubuntu.com/ubuntu/pool/main/x/xz-utils/$XZ"
[ -f "$BZ" ] || curl -fsSL --retry 4 -o "$BZ" "https://archive.ubuntu.com/ubuntu/pool/main/b/bzip2/$BZ"
printf '%s  %s\n' "$PYSHA" "$PY" "$ZLSHA" "$ZL" "$TZSHA" "$TZ" "$RXSHA" "$RX" "$SQSHA" "$SQ" "$XZSHA" "$XZ" "$BZSHA" "$BZ" | sha256sum -c -
rm -rf Python-3.14.8 zsrc zlib native wasi zipsrc tz regex-2026.11.19 sqlite3-3.54.1 bzip2-1.0.8 xz-5.8.4 sq bz xzbw xzbn xzw xzn \
  && tar xJf "$PY" && mkdir zsrc zlib native wasi tz && tar xzf "$ZL" -C zsrc
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
# 0. the C libraries of sqlite3, bz2 and lzma. SQLite's amalgamation is made by its own build (with the Jim Tcl it carries —
#    no Tcl needed) and compiled twice: for wasm32-wasi and natively, so that the native Python (which makes the tests'
#    reference) runs the same SQLite with the same options; liblzma likewise (the same encoder gives the same bytes); bzip2
#    natively is the system's 1.0.8. WASI has no file locking, mmap or threads: SQLite opens files with its "unix-none" VFS
#    (one program, one in-memory file system: nothing to lock), no WAL (it needs shared memory; journal_mode=WAL stays
#    "delete"), temporary tables in memory, local time from the host (as CPython's — wasi_start.c).
SQLITE_OPT="-DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_OMIT_WAL -DSQLITE_MAX_MMAP_SIZE=0 -DSQLITE_TEMP_STORE=2
  -DSQLITE_DEFAULT_UNIX_VFS=\"unix-none\" -DSQLITE_ENABLE_FTS3 -DSQLITE_ENABLE_FTS3_PARENTHESIS -DSQLITE_ENABLE_FTS4 -DSQLITE_ENABLE_FTS5
  -DSQLITE_ENABLE_RTREE -DSQLITE_ENABLE_MATH_FUNCTIONS -DSQLITE_ENABLE_DBSTAT_VTAB -DHAVE_LOCALTIME_R=1"
tar xJf "$SQ" && (cd sqlite3-3.54.1 && ./configure --disable-tcl >/dev/null && make -s sqlite3.c >/dev/null)
mkdir -p sq/wasm sq/native && cp sqlite3-3.54.1/sqlite3.h sqlite3-3.54.1/sqlite3ext.h sq/
"$ZIG" cc --target=wasm32-wasi -O2 $SQLITE_OPT -D_WASI_EMULATED_GETPID $LOCALTIME -c sqlite3-3.54.1/sqlite3.c -o sq/wasm/sqlite3.o
"$ZIG" ar rcs sq/wasm/libsqlite3.a sq/wasm/sqlite3.o
cc -O2 -fPIC $SQLITE_OPT -c sqlite3-3.54.1/sqlite3.c -o sq/native/sqlite3.o && ar rcs sq/native/libsqlite3.a sq/native/sqlite3.o
tar xzf "$BZ" && mkdir bz && for f in blocksort huffman crctable randtable compress decompress bzlib; do
  "$ZIG" cc --target=wasm32-wasi -O2 -D_FILE_OFFSET_BITS=64 -c "bzip2-1.0.8/$f.c" -o "bz/$f.o"; done
"$ZIG" ar rcs bz/libbz2.a bz/*.o && cp bzip2-1.0.8/bzlib.h bz/
tar xJf "$XZ" && mkdir xzbw xzbn
XZOPT="--disable-shared --enable-static --disable-threads --disable-xz --disable-xzdec --disable-lzmadec --disable-lzmainfo
  --disable-lzma-links --disable-scripts --disable-doc --disable-nls --disable-sandbox"
(cd xzbn && CFLAGS="-O2 -fPIC" ../xz-5.8.4/configure -q --prefix="$WORK/xzn" $XZOPT && make -j"$J" -s >/dev/null && make -s install >/dev/null)
# 1. native build Python (its sqlite3 and lzma on the same SQLite and liblzma as the WebAssembly build's; configure's link checks
#    add -lsqlite3, so the libraries are named by their folder — an archive alone left _sqlite3 "missing" in the WebAssembly build)
(cd native && LIBSQLITE3_CFLAGS="-I$WORK/sq" LIBSQLITE3_LIBS="-L$WORK/sq/native -lsqlite3 -lm" LIBLZMA_CFLAGS="-I$WORK/xzn/include" \
  LIBLZMA_LIBS="$WORK/xzn/lib/liblzma.a" "$S/configure" -q && make -j"$J" -s >/dev/null)
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
# 3b. liblzma for wasm32-wasi (its own configure, cross)
(cd xzbw && CC="$WORK/zcc" AR="$WORK/zar" RANLIB="$WORK/zranlib" CFLAGS="-O2" ../xz-5.8.4/configure -q --host=wasm32-unknown-wasi \
  --build=x86_64-pc-linux-gnu --prefix="$WORK/xzw" $XZOPT && make -j"$J" -s >/dev/null && make -s install >/dev/null)
# 4. CPython for wasm32-wasi
(cd wasi && CONFIG_SITE="$WORK/config.site" CC="$WORK/zcc" AR="$WORK/zar" RANLIB="$WORK/zranlib" CFLAGS="-O2 -Wno-date-time" \
  LDFLAGS="-Wl,--strip-all" ZLIB_CFLAGS="-I$WORK/zlib" ZLIB_LIBS="$WORK/zlib/libz.a" PKG_CONFIG_PATH= PKG_CONFIG_LIBDIR=/nonexistent \
  LIBSQLITE3_CFLAGS="-I$WORK/sq" LIBSQLITE3_LIBS="-L$WORK/sq/wasm -lsqlite3" BZIP2_CFLAGS="-I$WORK/bz" BZIP2_LIBS="$WORK/bz/libbz2.a" \
  LIBLZMA_CFLAGS="-I$WORK/xzw/include" LIBLZMA_LIBS="$WORK/xzw/lib/liblzma.a" \
  LIBS="$WORK/wasi_start.o" "$S/configure" -q --host=wasm32-wasip1 --build=x86_64-pc-linux-gnu --with-build-python="$WORK/native/python" \
  --prefix=/ --disable-test-modules && make -j"$J" -s EXTRA_CFLAGS="$GUARD $LOCALTIME" >/dev/null)
cp wasi/python.wasm "$ROOT/src/wasm/bin/python.wasm"
# 5. standard library zip: .pyc only (compiled by the same CPython version), without tests, IDLE, Tk, venv, ensurepip…
#    (pydoc_data stays: help("if"), help("LISTS") and the other topics need it; dbm.dumb and dbm.sqlite3 stay: shelve uses them)
cp -r "$S/Lib" zipsrc && cp wasi/build/lib.wasi-wasm32-3.14/_sysconfig* zipsrc/
# our own additions (wasm/python/lib): a no-network stand-in for _socket (so that socket, asyncio, doctest, logging.handlers,
# email.utils, urllib.request … import), an asyncio event loop that needs no sockets or threads, sitecustomize
cp "$HERE"/lib/*.py zipsrc/
mkdir zipsrc/regex && cp regex-2026.11.19/regex/__init__.py regex-2026.11.19/regex/_main.py regex-2026.11.19/regex/_regex_core.py zipsrc/regex/ \
  && cp "$HERE/regex_ext.py" zipsrc/regex/_regex.py
python3 "$HERE/patch-stdlib.py" zipsrc
(cd tz && python3 -m zipfile -e "../$TZ" . && cp -r tzdata ../zipsrc/)
(cd zipsrc && rm -rf test idlelib tkinter turtledemo ensurepip venv __phello__ site-packages turtle.py dbm/gnu.py dbm/ndbm.py curses \
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
