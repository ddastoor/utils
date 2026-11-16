#!/usr/bin/env bash
# Builds src/wasm/bin/zxcvbn.wasm from wasm/zxcvbn (Rust): zxcvbn 3.1.1 (MIT; Rust port of Dropbox's password-strength
# estimator with its frequency lists), feature custom_wasm_env (timer via an import instead of wasm-bindgen).
#   wasm/zxcvbn/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/zxcvbn_wasm.wasm "$ROOT/src/wasm/bin/zxcvbn.wasm"
ls -l "$ROOT/src/wasm/bin/zxcvbn.wasm"
