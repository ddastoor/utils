#!/usr/bin/env bash
# Builds src/wasm/bin/zxcvbn.wasm from wasm/zxcvbn (Rust): zxcvbn 3.1.1 (MIT; Rust port of Dropbox's password-strength
# estimator with its frequency lists), feature custom_wasm_env (timer via an import instead of wasm-bindgen), with four
# small fixes applied to the crate (zxcvbn-fixes.patch, found by comparing a few hundred passwords with the Python port of the
# reference: ALL-CAPS words with a digit, repeats taken for sequences, single-character l33t "words", keyboard-walk degree
# divided in integers). tests/unit/zxcvbn.test.mjs pins them against tests/fixtures/zxcvbn/reference.json.
#   wasm/zxcvbn/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
# the crate's source with our fixes (zxcvbn-fixes.patch): same file crates.io serves, same SHA-256 as Cargo.lock had
CRATE=zxcvbn-3.1.1; SHA=f9eaee90f4a795d1eb4ba6c51e1c1721d4784d550e8efa7b2600f29c867365e0
rm -rf target/patched && mkdir -p target/patched
curl -fsSL --retry 4 -o target/patched/$CRATE.crate "https://static.crates.io/crates/zxcvbn/$CRATE.crate"
echo "$SHA  target/patched/$CRATE.crate" | sha256sum -c -
tar xzf target/patched/$CRATE.crate -C target/patched
patch -p1 -d target/patched/$CRATE < zxcvbn-fixes.patch
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/zxcvbn_wasm.wasm "$ROOT/src/wasm/bin/zxcvbn.wasm"
ls -l "$ROOT/src/wasm/bin/zxcvbn.wasm"
