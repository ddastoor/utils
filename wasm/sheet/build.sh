#!/usr/bin/env bash
# Builds src/wasm/bin/sheet.wasm from wasm/sheet (Rust): calamine 0.38 (read xlsx/xlsm/xlsb/xls/ods, MIT),
# rust_xlsxwriter 0.102 (write xlsx, MIT/Apache-2.0), csv 1 (MIT/Unlicense), serde_json. Crates come from crates.io and
# are verified by the checksums in Cargo.lock (--locked). Target wasm32-wasip1 (WASI random/clock only; no JS glue).
#   wasm/sheet/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/sheet.wasm "$ROOT/src/wasm/bin/sheet.wasm"
ls -l "$ROOT/src/wasm/bin/sheet.wasm"
