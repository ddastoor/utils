#!/usr/bin/env bash
# Builds src/wasm/bin/devcore-<feature>.wasm from wasm/devcore (Rust): one small module per tab, so a tab downloads
# only its own engine. Crates from crates.io, verified by Cargo.lock (--locked): ipnet, croner (+ chrono; zone offsets
# come from the browser through env.tz_offset), regex-lite (our semver port), data-encoding, bs58,
# x509-parser, sha1/sha2, serde_json, json-patch (a second applier for the tests), unicode-ident and
# unicode-general-category (JSON → types); glob, patch, the binary decoders, the JSON formatter, the JSON diff, the XML
# formatter, the JSON → types generator and the SQL formatter are our own code. Target wasm32-wasip1.
#   wasm/devcore/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
rm -f "$ROOT/src/wasm/bin/devcore.wasm"
for f in cidr cron semver glob patch sqlfmt x509 enc bin hex jsondiff json xml j2t; do
  cargo build --release --locked --target wasm32-wasip1 --no-default-features --features "$f"
  cp target/wasm32-wasip1/release/devcore.wasm "$ROOT/src/wasm/bin/devcore-$f.wasm"
  ls -l "$ROOT/src/wasm/bin/devcore-$f.wasm"
done
