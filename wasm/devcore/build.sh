#!/usr/bin/env bash
# Builds src/wasm/bin/devcore-<feature>.wasm from wasm/devcore (Rust): one small module per tab, so a tab downloads
# only its own engine. Crates from crates.io, verified by Cargo.lock (--locked): ipnet, croner (+ chrono; zone offsets
# come from the browser through env.tz_offset), nodejs-semver, globset, data-encoding, bs58, rmpv, ciborium,
# x509-parser, sha1/sha2, diffy, sqlformat, serde_json. Target wasm32-wasip1.
#   wasm/devcore/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
rm -f "$ROOT/src/wasm/bin/devcore.wasm"
for f in cidr cron semver glob patch sqlfmt x509 enc bin hex jsondiff; do
  cargo build --release --locked --target wasm32-wasip1 --no-default-features --features "$f"
  cp target/wasm32-wasip1/release/devcore.wasm "$ROOT/src/wasm/bin/devcore-$f.wasm"
  ls -l "$ROOT/src/wasm/bin/devcore-$f.wasm"
done
