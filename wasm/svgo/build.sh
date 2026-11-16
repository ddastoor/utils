#!/usr/bin/env bash
# Builds src/wasm/bin/svgo.wasm from wasm/svgo (Rust): OXVG 0.0.9 (MIT; Rust port of SVGO's plugins, incl. lightningcss
# for <style>), crates.io sources verified by Cargo.lock (--locked). Target wasm32-wasip1, opt-level z (~4.9 MB, 1.3 MB gz).
#   wasm/svgo/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/svgo.wasm "$ROOT/src/wasm/bin/svgo.wasm"
ls -l "$ROOT/src/wasm/bin/svgo.wasm"
