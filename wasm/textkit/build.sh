#!/usr/bin/env bash
# Builds src/wasm/bin/textkit.wasm from wasm/textkit (Rust): the unicode-segmentation crate (UAX #29 grapheme
# clusters, words and sentences) and our counting rules on top; the similar crate for the Text Diff's module.
# crates.io sources verified by Cargo.lock.
#   wasm/textkit/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
# one module per group of tabs (Cargo features): text → textkit.wasm, diff → textkit-diff.wasm, lorem → textkit-lorem.wasm
# (the diff library is generic over every kind of token and every algorithm: its module is built for size — a
#  quarter smaller, and no slower in a way a reader would notice)
for f in text diff lorem; do
  opt=3; [ "$f" = text ] || opt='"s"'
  cargo build --release --locked --target wasm32-wasip1 --no-default-features --features "$f" --config "profile.release.opt-level=$opt"
  out="textkit.wasm"; [ "$f" = text ] || out="textkit-$f.wasm"
  cp target/wasm32-wasip1/release/textkit.wasm "$ROOT/src/wasm/bin/$out"
  ls -l "$ROOT/src/wasm/bin/$out"
done
