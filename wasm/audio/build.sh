#!/usr/bin/env bash
# Builds src/wasm/bin/audio.wasm: LAME 4.0's libmp3lame (MP3 encoder, C, LGPL-2.0) + our own audio C (audio.c:
# WAV writer, waveform peaks, resampler, gain/fades/levels, MP3 glue; studio.c: DeepFilterNet 3's DSP and the studio finish).
# Source: lame_4.0.orig.tar.gz from the Ubuntu archive (lame.sourceforge.io is not reachable from the sandbox),
# SHA-256 from Ubuntu's signed lame_4.0-1.dsc (= upstream tarball, released 2026-07-11 by the LAME maintainers).
#   ZIG=/path/to/zig wasm/audio/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
URL=http://archive.ubuntu.com/ubuntu/pool/main/l/lame/lame_4.0.orig.tar.gz
SHA=3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb
WORK="${TMPDIR:-/tmp}/lame-build"; rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
curl -fsSL --retry 4 -o src.tgz "$URL"
echo "$SHA  src.tgz" | sha256sum -c -
tar xzf src.tgz
L="$WORK/lame-4.0"
grep -q '"4.0"\|LAME_MAJOR_VERSION *4' "$L/libmp3lame/version.h"
cp "$HERE/lame-config.h" "$L/config.h"
SRCS=$(ls "$L"/libmp3lame/*.c | grep -v mpglib_interface)
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O2 -msimd128 -DHAVE_CONFIG_H -I"$L" -I"$L/include" -I"$L/libmp3lame" \
  -Wno-everything $SRCS "$HERE/audio.c" \
  $(cat "$HERE/audio.c" "$HERE/studio.c" | grep -oE '^API [^(]*\b(a_[a-z0-9_]+)\(' | grep -oE 'a_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ') \
  -Wl,--strip-all -Wl,-z,stack-size=262144 \
  -o "$ROOT/src/wasm/bin/audio.wasm"
ls -l "$ROOT/src/wasm/bin/audio.wasm"
