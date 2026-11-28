#!/usr/bin/env bash
# Builds src/wasm/bin/vtracer.wasm from wasm/vtracer (Rust): visioncortex's VTracer 0.6.5 (MIT OR Apache-2.0; the latest stable
# release) on visioncortex 0.8.10, as plain exports — a picture's pixels in, an SVG out. Crates from crates.io, verified by the
# checksums in Cargo.lock (--locked). Target wasm32-wasip1 (WASI random only; no JS glue). The authors' own WebAssembly build
# (npm vtracer-webapp 0.4.0) is their web app's: it reads its picture from a canvas of the page and writes into an SVG element of
# the page by their ids — no worker can run it (docs/WASM-AUDIT.md, tab 199).
#   bash wasm/vtracer/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/vtracer_module.wasm "$ROOT/src/wasm/bin/vtracer.wasm"
ls -l "$ROOT/src/wasm/bin/vtracer.wasm"
