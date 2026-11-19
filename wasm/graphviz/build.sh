#!/usr/bin/env bash
# Builds src/wasm/bin/graphviz.wasm: Graphviz 16.1.0 (EPL-2.0) — cgraph, gvc, the dot/neato/fdp/sfdp/circo/twopi/osage/
# patchwork layouts and the core renderers (svg, json, xdot, dot, plain…) — with Expat 2.9.0 (MIT, for HTML-like labels),
# compiled by us with zig cc for wasm32-wasi as a reactor + glue.c.
# Sources: Graphviz's official release archive (gitlab.com/graphviz/graphviz, package "graphviz-releases"; SHA-256 as
# published next to it) and expat_2.9.0.orig.tar.gz from the Ubuntu archive (SHA-256 from its signed .dsc).
#
# Our changes to the Graphviz source (each file says why):
#   storeline.patch       a label that starts with an empty line left a text span uninitialised — a trap in WebAssembly
#   triangulation.patch   prism overlap removal and sfdp's smoothing on our Delaunay triangulation (st_delaunay.h, a C
#                         port of Delaunator) in place of the GTS library, which no WebAssembly build has
# and beside it, for the module only:
#   qsort.c, rand.c       glibc's qsort (stable) and rand() in place of wasi-libc's: the drawings come out as on Linux
#   glue.c                the exported functions, several graphs in one text, text measured by the host
#
# A NATIVE build of the same patched source comes first (configure + make; needs a host C/C++ compiler and make). It
# gives the exact list of sources of each library and leaves the tool the test references are made with:
#     $WORK/native/cmd/dot/dot_static        →  DOT=… node scripts/make-graphviz-reference.mjs
# It is built without GTS even when the machine has it, so that tool and module run the same code; what the unit suite
# compares is then the WebAssembly build against a native one (the patches have tests of their own).
# The same files (the archive ships the generated parsers) are then compiled for wasm with our config.h and
# expat_config.h. Without a host that measures text (the unit harness) the module uses Graphviz's built-in font
# metrics, as that native build does; in the tab the browser measures.
#   ZIG=/path/to/zig wasm/graphviz/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
: "${ZIG:?set ZIG to the zig binary}"
WORK="${WORK:-/tmp/graphviz-build}"; mkdir -p "$WORK"; cd "$WORK"
VER=16.1.0
GV=graphviz-$VER.tar.gz; GVSHA=beea483ab130f456c1c3905f4f2e40778a9c493c3d73ae8012367d552d71ca84
EX=expat_2.9.0.orig.tar.gz; EXSHA=6e8ce7b52ebbaa423c59becc7cf1e6875c42e49228c062ac8123c10e700cec27
[ -f "$GV" ] || curl -fsSL --retry 4 -o "$GV" "https://gitlab.com/api/v4/projects/4207231/packages/generic/graphviz-releases/$VER/$GV"
[ -f "$EX" ] || curl -fsSL --retry 4 -o "$EX" "https://archive.ubuntu.com/ubuntu/pool/main/e/expat/$EX"
echo "$GVSHA  $GV" | sha256sum -c -; echo "$EXSHA  $EX" | sha256sum -c -
rm -rf "graphviz-$VER" libexpat-R_2_9_0 native obj inc && tar xzf "$GV" && tar xzf "$EX" && mkdir -p native obj inc
S="$WORK/graphviz-$VER"; E="$WORK/libexpat-R_2_9_0/expat"
# our changes to the source; the header they include sits in a directory of its own (ours also holds a config.h)
patch -d "$S" -p1 < "$HERE/storeline.patch"
patch -d "$S" -p1 < "$HERE/triangulation.patch"
cp "$HERE/st_delaunay.h" inc/
LIBS="cdt cgraph circogen common dotgen fdpgen gvc label neatogen ortho osage pack patchwork pathplan rbtree sfdpgen sparse twopigen util vpsc xdot"
PLUGINS="core dot_layout neato_layout"
# 1. the native build: object lists, and the reference tool
(cd native && "$S/configure" --disable-shared --enable-static --disable-ltdl --disable-swig --disable-tcl --disable-man-pdfs \
   --without-x --without-qt --without-gtk --without-pangocairo --without-libgd --without-freetype2 --without-fontconfig \
   --without-gdk --without-gdk-pixbuf --without-rsvg --without-ghostscript --without-poppler --without-webp --without-devil \
   --without-lasi --without-glut --without-smyrna --without-gvedit --without-zlib --without-gts --with-expat \
   CPPFLAGS="-I$WORK/inc -DSUPERTOOLS_DELAUNAY" >configure.log 2>&1 \
 && make -j"$(nproc)" -C lib >make.log 2>&1 && make -j"$(nproc)" -C plugin >>make.log 2>&1 && make -j"$(nproc)" -C cmd/dot >>make.log 2>&1)
"$WORK/native/cmd/dot/dot_static" -V
SRCS=""
for d in $(for l in $LIBS; do echo "lib/$l"; done) $(for p in $PLUGINS; do echo "plugin/$p"; done); do
  for o in "native/$d"/*.o; do
    n="$(basename "$o" .o | sed -E 's/^lib[A-Za-z0-9_]+_la-//')"
    if   [ -f "$S/$d/$n.c" ];   then SRCS="$SRCS $d/$n.c"
    elif [ -f "$S/$d/$n.cpp" ]; then SRCS="$SRCS $d/$n.cpp"
    else echo "no source for $o" >&2; exit 1; fi
  done
done
SRCS="$(echo $SRCS | tr ' ' '\n' | sort -u)"
echo "$(echo "$SRCS" | wc -l) Graphviz sources"
# 2. the same sources for WebAssembly
mkdir -p cfg && cp "$HERE/config.h" cfg/config.h
INC=(-I"$WORK/cfg" -I"$WORK/inc" -I"$E/lib" -I"$WORK/native/lib" -I"$WORK/native/lib/common" -I"$S" -I"$S/lib")
for d in "$S"/lib/*/; do INC+=(-I"$d"); done
# -UNDEBUG (zig cc defines NDEBUG by itself at -O2): Graphviz's assertions stay in, as in the native tool. Where one
# fails the module stops there (a trap; the tab says which check) instead of running on with a null pointer, which
# WebAssembly does not notice. -ffile-prefix-map: the file names in those messages do not carry the build directory.
DEF=(-UNDEBUG "-ffile-prefix-map=$S/=" -DHAVE_CONFIG_H -DSUPERTOOLS_DELAUNAY -DDIGCOLA -DIPSEPCOLA -DORTHO -DSFDP '-DGVLIBDIR="lib/graphviz"' -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_MMAN -D_GNU_SOURCE)
i=0; pids=()
for f in $SRCS; do
  o="obj/$(echo "$f" | tr / _).o"
  case "$f" in
    *.cpp) "$ZIG" c++ --target=wasm32-wasi -O2 -std=c++17 -fexceptions -include "$HERE/fstreamshim.h" "${DEF[@]}" "${INC[@]}" -c "$S/$f" -o "$o" & ;;
    *)     "$ZIG" cc --target=wasm32-wasi -O2 -std=gnu17 -Wno-everything -include "$HERE/compat.h" "${DEF[@]}" "${INC[@]}" -c "$S/$f" -o "$o" & ;;
  esac
  pids+=($!); i=$((i+1)); if [ $((i % 16)) = 0 ]; then for p in "${pids[@]}"; do wait "$p"; done; pids=(); fi
done
for p in "${pids[@]}"; do wait "$p"; done
for f in xmlparse xmlrole xmltok xcs random_arc4random_buf; do "$ZIG" cc --target=wasm32-wasi -O2 -I"$HERE" -I"$E/lib" -c "$E/lib/$f.c" -o "obj/expat_$f.o"; done
"$ZIG" cc --target=wasm32-wasi -O2 -I"$E/lib" -c "$HERE/cxxabi_stubs.c" -o obj/cxxabi.o
"$ZIG" cc --target=wasm32-wasi -O2 "${DEF[@]}" "${INC[@]}" -c "$HERE/glue.c" -o obj/glue.o
"$ZIG" cc --target=wasm32-wasi -O2 -c "$HERE/qsort.c" -o obj/st_qsort.o   # glibc's stable qsort instead of musl's (see the file)
"$ZIG" cc --target=wasm32-wasi -O2 -c "$HERE/rand.c" -o obj/st_rand.o     # glibc's rand() instead of musl's (see the file)
EXPORTS="gv_alloc gv_free gv_out gv_out_len gv_err gv_err_len gv_version gv_layout gv_format gv_done gv_count gv_engine gv_render gv_delaunay gv_rand gv_sort_pairs"
"$ZIG" c++ --target=wasm32-wasi -mexec-model=reactor -O2 obj/*.o -lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-mman \
  $(for f in $EXPORTS; do printf -- '-Wl,--export=%s ' $f; done) \
  -Wl,--strip-all -Wl,-z,stack-size=8388608 -Wl,--max-memory=2147483648 -o "$ROOT/src/wasm/bin/graphviz.wasm"
ls -la "$ROOT/src/wasm/bin/graphviz.wasm"
