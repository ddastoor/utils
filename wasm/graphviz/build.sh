#!/usr/bin/env bash
# Builds src/wasm/bin/graphviz.wasm: Graphviz 14.1.2 (EPL-1.0) — cgraph, gvc, the dot/neato/fdp/sfdp/circo/twopi/osage/
# patchwork layouts and the core renderers (svg, json, xdot, dot, plain…) — with Expat 2.9.0 (MIT, for HTML-like labels),
# compiled by us with zig cc for wasm32-wasi as a reactor + glue.c (gv_render). Sources: the Ubuntu archive's
# graphviz_14.1.2.orig.tar.bz2 and expat_2.9.0.orig.tar.gz, SHA-256 from Ubuntu's signed .dsc files (gitlab/github are
# not reachable from the sandbox). A native CMake configure + build (needs cmake, bison, flex, a host C/C++ compiler)
# generates the parser/lexer sources and gives the exact list of sources of each library; those are then compiled
# unmodified for wasm with our config.h / expat_config.h. Text is measured with Graphviz's built-in font metrics
# (no FreeType/Pango in the browser build); the browser draws the SVG text.
#   ZIG=/path/to/zig wasm/graphviz/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
: "${ZIG:?set ZIG to the zig binary}"
WORK="${WORK:-/tmp/graphviz-build}"; mkdir -p "$WORK"; cd "$WORK"
GV=graphviz_14.1.2.orig.tar.bz2; GVSHA=8ba7611c378b3e82f2a0ca5fc9dbcc5fef77c86d9fdfe3281f8f59eaab3314f6
EX=expat_2.9.0.orig.tar.gz; EXSHA=6e8ce7b52ebbaa423c59becc7cf1e6875c42e49228c062ac8123c10e700cec27
[ -f "$GV" ] || curl -fsSL --retry 4 -o "$GV" "https://archive.ubuntu.com/ubuntu/pool/universe/g/graphviz/$GV"
[ -f "$EX" ] || curl -fsSL --retry 4 -o "$EX" "https://archive.ubuntu.com/ubuntu/pool/main/e/expat/$EX"
echo "$GVSHA  $GV" | sha256sum -c -; echo "$EXSHA  $EX" | sha256sum -c -
rm -rf graphviz-14.1.2 libexpat-R_2_9_0 native obj && tar xjf "$GV" && tar xzf "$EX" && mkdir -p native obj
S="$WORK/graphviz-14.1.2"; E="$WORK/libexpat-R_2_9_0/expat"
# 1. native configure + build of the libraries we need: generates grammar.c, scan.c, htmlparse.c, entities.h, colortbl.h…
(cd native && GIT_DIR=/nonexistent cmake "$S" -DBUILD_SHARED_LIBS=OFF -DENABLE_LTDL=OFF -DGRAPHVIZ_CLI=OFF -DENABLE_TCL=OFF -DENABLE_SWIG=OFF \
  -Dwith_gvedit=OFF -Dwith_smyrna=OFF >/dev/null && make -j"$(nproc)" gvc gvplugin_core gvplugin_dot_layout gvplugin_neato_layout >/dev/null)
cp "$HERE/config.h" native/config.h
SRCS=$(cd native && find lib plugin -name '*.o' | sed 's|/CMakeFiles/[^/]*\.dir/|/|; s|\.o$||' | sort)
INC=(-I"$E/lib" -I"$WORK/native" -I"$WORK/native/lib" -I"$WORK/native/lib/common" -I"$WORK/native/lib/cgraph" -I"$S" -I"$S/lib")
for d in "$S"/lib/*/; do INC+=(-I"$d"); done
DEF=(-DDIGCOLA -DIPSEPCOLA -DORTHO -DSFDP '-DGVLIBDIR="lib/graphviz"' -DNDEBUG -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_MMAN -D_GNU_SOURCE)
i=0; pids=()
for f in $SRCS; do
  src="$S/$f"; [ -f "$src" ] || src="$WORK/native/$f"
  o="obj/$(echo "$f" | tr / _).o"
  case "$f" in
    *.cpp) "$ZIG" c++ --target=wasm32-wasi -O2 -std=c++17 -fexceptions -include "$HERE/fstreamshim.h" "${DEF[@]}" "${INC[@]}" -c "$src" -o "$o" & ;;
    *)     "$ZIG" cc --target=wasm32-wasi -O2 -std=gnu17 -Wno-everything -include "$HERE/compat.h" "${DEF[@]}" "${INC[@]}" -c "$src" -o "$o" & ;;
  esac
  pids+=($!); i=$((i+1)); if [ $((i % 16)) = 0 ]; then for p in "${pids[@]}"; do wait "$p"; done; pids=(); fi
done
for p in "${pids[@]}"; do wait "$p"; done
for f in xmlparse xmlrole xmltok xcs random_arc4random_buf; do "$ZIG" cc --target=wasm32-wasi -O2 -I"$HERE" -I"$E/lib" -c "$E/lib/$f.c" -o "obj/expat_$f.o"; done
"$ZIG" cc --target=wasm32-wasi -O2 -I"$E/lib" -c "$HERE/cxxabi_stubs.c" -o obj/cxxabi.o
"$ZIG" cc --target=wasm32-wasi -O2 "${DEF[@]}" "${INC[@]}" -c "$HERE/glue.c" -o obj/glue.o
"$ZIG" c++ --target=wasm32-wasi -mexec-model=reactor -O2 obj/*.o -lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-mman \
  $(for f in gv_alloc gv_free gv_out gv_out_len gv_err gv_err_len gv_render; do printf -- '-Wl,--export=%s ' $f; done) \
  -Wl,--strip-all -Wl,-z,stack-size=8388608 -Wl,--max-memory=2147483648 -o "$ROOT/src/wasm/bin/graphviz.wasm"
ls -la "$ROOT/src/wasm/bin/graphviz.wasm"
