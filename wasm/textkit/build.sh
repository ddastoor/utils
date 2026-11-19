#!/usr/bin/env bash
# Builds src/wasm/bin/textkit.wasm from wasm/textkit (Rust): the unicode-segmentation crate (UAX #29 grapheme
# clusters, words and sentences) and our counting rules on top. crates.io sources verified by Cargo.lock.
#   wasm/textkit/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/textkit.wasm "$ROOT/src/wasm/bin/textkit.wasm"
ls -l "$ROOT/src/wasm/bin/textkit.wasm"
