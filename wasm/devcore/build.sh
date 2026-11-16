#!/usr/bin/env bash
# Builds src/wasm/bin/devcore.wasm from wasm/devcore (Rust). Crates from crates.io, verified by Cargo.lock (--locked):
# ipnet, croner + chrono-tz, nodejs-semver, globset, data-encoding, bs58, rmpv, ciborium, x509-parser, sha1/sha2, diffy,
# sqlformat, serde_json. Target wasm32-wasip1 (imports only WASI random/environ/fd_write/proc_exit).
#   wasm/devcore/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/devcore.wasm "$ROOT/src/wasm/bin/devcore.wasm"
ls -l "$ROOT/src/wasm/bin/devcore.wasm"
