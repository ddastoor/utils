#!/usr/bin/env bash
# Builds src/wasm/bin/rnnoise.wasm: Xiph RNNoise 0.2 (C, BSD-3; recurrent neural network speech denoiser, default
# model built in) + glue.c. Source: rnnoise_0.2+ds.orig.tar.xz from the Ubuntu archive (xiph.org is not reachable from
# the sandbox; Debian's repack of the upstream 0.2 release, model weights included), SHA-256 from the signed .dsc.
#   ZIG=/path/to/zig wasm/rnnoise/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
URL=http://archive.ubuntu.com/ubuntu/pool/universe/r/rnnoise/rnnoise_0.2+ds.orig.tar.xz
SHA=db2718ee4a0b294bfbbe198fe94aabfdc8cd0d77cb9cd95d76c7a818ad805f0b
WORK="${TMPDIR:-/tmp}/rnnoise-build"; rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
curl -fsSL --retry 4 -o src.txz "$URL"
echo "$SHA  src.txz" | sha256sum -c -
tar xJf src.txz
S="$WORK/rnnoise-0.2"
grep -q 0b50c45 "$S/model_version"
cd "$S/src"
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O2 -msimd128 -I"$S/include" -I"$S/src" -I"$HERE" -Wno-everything \
  denoise.c rnn.c pitch.c kiss_fft.c celt_lpc.c nnet.c nnet_default.c parse_lpcnet_weights.c rnnoise_data.c rnnoise_tables.c \
  "$HERE/glue.c" \
  $(grep -oE '^API [^(]*\b(n_[a-z0-9_]+)\(' "$HERE/glue.c" | grep -oE 'n_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ') \
  -Wl,--strip-all -Wl,-z,stack-size=1048576 -o "$ROOT/src/wasm/bin/rnnoise.wasm"
ls -l "$ROOT/src/wasm/bin/rnnoise.wasm"
