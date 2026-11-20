#!/usr/bin/env bash
# The Noise Remover's reference: RNNoise 0.2 — the release Jitsi's WebAssembly build carries — compiled natively with
# the system's C compiler from the Ubuntu archive's copy of the release (Debian's repack with the model; SHA-256 from
# the signed .dsc), run by scripts/rnnoise-ref/driver.c on the test recording and on white noise.
#   bash scripts/make-rnnoise-reference.sh   → tests/fixtures/rnnoise/reference.json
# (os_support.h: the release's generic code path includes Opus's os_support.h, which the release does not ship.)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/.." && pwd)"; CC="${CC:-cc}"
URL=http://archive.ubuntu.com/ubuntu/pool/universe/r/rnnoise/rnnoise_0.2+ds.orig.tar.xz
SHA=db2718ee4a0b294bfbbe198fe94aabfdc8cd0d77cb9cd95d76c7a818ad805f0b
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
curl -fsSL --retry 4 -o "$WORK/src.txz" "$URL"
echo "$SHA  $WORK/src.txz" | sha256sum -c -
tar xJf "$WORK/src.txz" -C "$WORK"
S="$WORK/rnnoise-0.2"
grep -q 0b50c45 "$S/model_version"
# -DDISABLE_DEBUG_FLOAT: the release as its own configure builds it (the network on the model's 8-bit weights; the
# float weights are a debugging option, --enable-dnn-debug-float) — and as Jitsi builds it.
# -U__SSE2__ …: the generic C path, as in every WebAssembly build (on x86 the release otherwise takes vec_avx.h).
"$CC" -O2 -ffp-contract=off -DDISABLE_DEBUG_FLOAT -U__SSE__ -U__SSE2__ -U__AVX__ -U__AVX2__ -U__FMA__ -I"$S/include" -I"$S/src" -I"$HERE/rnnoise-ref" -w \
  "$S"/src/{denoise,rnn,pitch,kiss_fft,celt_lpc,nnet,nnet_default,parse_lpcnet_weights,rnnoise_data,rnnoise_tables}.c \
  "$HERE/rnnoise-ref/driver.c" -lm -o "$WORK/ref"
mkdir -p "$ROOT/tests/fixtures/rnnoise"
"$WORK/ref" "$ROOT/tests/fixtures/speech/noisy-speech.wav" > "$ROOT/tests/fixtures/rnnoise/reference.json"
ls -l "$ROOT/tests/fixtures/rnnoise/reference.json"
