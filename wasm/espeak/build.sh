#!/usr/bin/env bash
# Builds src/wasm/bin/espeak.wasm: eSpeak NG 1.52.0 (C, GPL-3.0+) text → IPA phonemes, with the English data compiled
# from the same release linked in. Source: espeak-ng_1.52.0+dfsg.orig.tar.gz from the Ubuntu archive (github.com is
# not reachable from the sandbox), SHA-256 from Ubuntu's signed .dsc. The data is compiled by a native build of the
# same source (needs gcc, make, autoconf, automake, libtool, pkg-config).
#   ZIG=/path/to/zig wasm/espeak/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
URL=http://archive.ubuntu.com/ubuntu/pool/main/e/espeak-ng/espeak-ng_1.52.0+dfsg.orig.tar.gz
SHA=d2a886bae3547a15c52801cb37e415230834a7ee7f9a57352b98d60454d97cea
WORK="${TMPDIR:-/tmp}/espeak-build"; rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
curl -fsSL --retry 4 -o src.tgz "$URL"
echo "$SHA  src.tgz" | sha256sum -c -
tar xzf src.tgz
S="$WORK/espeak-ng-1.52.0+dfsg"; cd "$S"
# 1. native build, only to compile the English phoneme tables and dictionary
./autogen.sh >/dev/null 2>&1
./configure --without-pcaudiolib --without-sonic --without-speechplayer --without-mbrola --without-klatt --without-async >/dev/null
make -j"$(nproc)" src/espeak-ng >/dev/null 2>&1
make espeak-ng-data/phontab en >/dev/null 2>&1
# 2. the data as C arrays, served from memory by glue.c
python3 - "$S/espeak-ng-data" "$WORK/espeak_data.c" <<'PY'
import sys, os
d, out = sys.argv[1], sys.argv[2]
files = ['phontab', 'phonindex', 'phondata', 'intonations', 'en_dict', 'lang/gmw/en', 'lang/gmw/en-US']
dirs = ['/es', '/es/espeak-ng-data', '/es/espeak-ng-data/lang', '/es/espeak-ng-data/lang/gmw', '/es/espeak-ng-data/voices']
with open(out, 'w') as f:
    f.write('typedef struct { const char *path; const unsigned char *data; unsigned len; } MemFile;\n')
    for i, n in enumerate(files):
        b = open(os.path.join(d, n), 'rb').read()
        f.write(f'static const unsigned char f{i}[{len(b) + 1}] = {{' + ','.join(str(x) for x in b) + ',0};\n')
    # eSpeak lower-cases voice names before looking for the file (gmw/en-US → gmw/en-us)
    f.write('const MemFile ES_FILES[] = {' + ','.join(f'{{"/es/espeak-ng-data/{n.lower() if n.startswith("lang/") else n}", f{i}, {os.path.getsize(os.path.join(d, n))}}}' for i, n in enumerate(files)) + '};\n')
    f.write(f'const unsigned ES_NFILES = {len(files)};\n')
    f.write('const char *const ES_DIRS[] = {' + ','.join(f'"{x}"' for x in dirs) + '};\n')
    f.write(f'const unsigned ES_NDIRS = {len(dirs)};\n')
PY
# 3. the library + glue + data → wasm
L="$S/src/libespeak-ng"; U="$S/src/ucd-tools/src"
SRCS="$U/case.c $U/categories.c $U/ctype.c $U/proplist.c $U/scripts.c $U/tostring.c"
for f in common compiledict dictionary encoding error espeak_api ieee80 intonation langopts mnemonics numbers readclause phoneme phonemelist setlengths soundicon spect speech ssml synthdata synthesize translate translateword tr_languages voices wavegen; do SRCS="$SRCS $L/$f.c"; done
sed -i 's/if (stat(filename, &statbuf) != 0)/if (es_stat(filename, \&statbuf) != 0)/' "$L/common.c" # GetFileLength → in-memory stat
grep -q 'es_stat(filename' "$L/common.c"
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O2 -D_GNU_SOURCE -DLIBESPEAK_NG_EXPORT -include "$HERE/config.h" -include "$HERE/memfs.h" \
  -I"$HERE" -I"$S/src/include" -I"$L" -I"$U/include" -I"$S/src/ucd-tools/src/include" -Wno-everything \
  $SRCS "$HERE/glue.c" "$WORK/espeak_data.c" \
  $(grep -oE '^API [^(]*\b(es_[a-z0-9_]+)\(' "$HERE/glue.c" | grep -oE 'es_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ') \
  -Wl,--strip-all -Wl,-z,stack-size=1048576 -o "$ROOT/src/wasm/bin/espeak.wasm"
ls -l "$ROOT/src/wasm/bin/espeak.wasm"
