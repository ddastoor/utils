#!/usr/bin/env bash
# Builds src/wasm/bin/hunspell.wasm: Hunspell 1.7.6 (C++; LGPL-2.1+ / GPL-2.0+ / MPL-1.1, tri-licensed) + glue.cxx, for the
# Spell Checker tab. Source: hunspell_1.7.6.orig.tar.gz from the Ubuntu archive; SHA-256 from Ubuntu's signed hunspell_1.7.6-3.dsc.
# Hunspell cuts its suggestions after 250 / 100 / 50 ms (atypes.hxx); a WebAssembly build — and a phone — is slower than the
# desktop, so it would give fewer suggestions than the desktop's Hunspell for the same word. The limits are raised ten times here,
# and in the native reference this script leaves at $WORK/native/hsref (the same source, the same changes; scripts/hunspell-ref/
# ref.cxx): what the tab suggests is what Hunspell 1.7.6 suggests. Hunspell's file streams are read through C's stdio
# (stdio_stream.hxx: the C++ library of a WebAssembly build has none), in both. The tab's order of the suggestions (rank.hxx) is
# compiled into both too.
#   ZIG=/path/to/zig wasm/hunspell/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
URL=http://archive.ubuntu.com/ubuntu/pool/main/h/hunspell/hunspell_1.7.6.orig.tar.gz
SHA=4fa9c52a5337fb0a3e03f3212b6372d0159eac3d1a3e6e938e8897ff3d9c3d0c
WORK="${WORK:-${TMPDIR:-/tmp}/hunspell-build}"; rm -rf "$WORK"; mkdir -p "$WORK/native"; cd "$WORK"
curl -fsSL --retry 4 -o src.tgz "$URL"
echo "$SHA  src.tgz" | sha256sum -c -
tar xzf src.tgz
S="$WORK/hunspell-1.7.6/src/hunspell"
grep -q 'HUNSPELL_VERSION_STRING "1.7.6"' "$S/hunversion.h"
# the time limits, ten times as long (each line checked: the build fails if Hunspell changes them)
for pair in 'TIMELIMIT_GLOBAL_MS std::chrono::milliseconds(250)|TIMELIMIT_GLOBAL_MS std::chrono::milliseconds(2500)' \
            'TIMELIMIT_SUGGESTION_MS std::chrono::milliseconds(100)|TIMELIMIT_SUGGESTION_MS std::chrono::milliseconds(1000)' \
            'TIMELIMIT_MS std::chrono::milliseconds(50)|TIMELIMIT_MS std::chrono::milliseconds(500)'; do
  from="${pair%%|*}"; to="${pair##*|}"
  grep -qF "#define $from" "$S/atypes.hxx"
  sed -i "s|#define $from|#define $to|" "$S/atypes.hxx"   # BRE: ( and ) are plain characters
  grep -qF "#define $to" "$S/atypes.hxx"
done
# file streams → C's stdio (wasm/hunspell/stdio_stream.hxx; each replacement checked)
cp "$HERE/stdio_stream.hxx" "$S/"
swap() { grep -qF "$2" "$S/$1"; F="$S/$1" A="$2" B="$3" python3 -c 'import os; p=os.environ["F"]; s=open(p).read(); open(p,"w").write(s.replace(os.environ["A"], os.environ["B"]))'; grep -qF "$3" "$S/$1"; }
swap csutil.hxx '#include <fstream>' '#include "stdio_stream.hxx"'
swap csutil.hxx 'void myopen(std::ifstream& stream,' 'void myopen(StdioStream& stream,'
swap csutil.cxx 'void myopen(std::ifstream& stream,' 'void myopen(StdioStream& stream,'
swap filemgr.hxx '#include <fstream>' '#include "stdio_stream.hxx"'
swap filemgr.hxx 'std::ifstream fin;' 'StdioStream fin;'
swap hunzip.hxx '#include <fstream>' '#include "stdio_stream.hxx"'
swap hunzip.hxx 'std::ifstream fin;' 'StdioStream fin;'
if grep -nE '^[^/]*(std::ifstream|<fstream>)' "$S"/*.cxx "$S"/*.hxx; then echo 'a file stream is left'; exit 1; fi
SRCS="affentry.cxx affixmgr.cxx csutil.cxx filemgr.cxx hashmgr.cxx hunspell.cxx hunspelltrace.cxx hunzip.cxx phonet.cxx replist.cxx suggestmgr.cxx"
FLAGS="-DBUILDING_LIBHUNSPELL -DHUNSPELL_STATIC -std=c++17"
# the native reference
# — 32-bit x86 with zig's C++ library, as the module is: Hunspell's word hash is a `long`, and on a 64-bit machine equally
# scored suggestions come out in another order (the module, wasm32, matches the 32-bit build word for word)
( cd "$S" && $ZIG c++ -target x86-linux-musl -O2 $FLAGS -I"$S" -I"$HERE" $SRCS "$ROOT/scripts/hunspell-ref/ref.cxx" -o "$WORK/native/hsref" )
# the WebAssembly module
EXPORTS=$(grep -oE '^API [^(]*\b(hs_[a-z0-9_]+)\(' "$HERE/glue.cxx" | grep -oE 'hs_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
( cd "$S" && $ZIG c++ --target=wasm32-wasi -mexec-model=reactor -O2 -fno-exceptions $FLAGS -I"$S" -ffile-prefix-map="$WORK"=. \
  $SRCS "$HERE/glue.cxx" $EXPORTS -Wl,--strip-all -Wl,-z,stack-size=1048576 -o "$ROOT/src/wasm/bin/hunspell.wasm" )
ls -l "$ROOT/src/wasm/bin/hunspell.wasm" "$WORK/native/hsref"
