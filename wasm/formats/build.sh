#!/usr/bin/env bash
# Builds src/wasm/bin/formats-yaml.wasm (serde_yaml_ng = unsafe-libyaml, a Rust translation of libyaml; toml) and
# src/wasm/bin/formats-schema.wasm (jsonschema 0.61, no network/file resolvers) from wasm/formats (Rust).
#   wasm/formats/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
for f in yaml schema; do
  cargo build --release --locked --target wasm32-wasip1 --no-default-features --features "$f"
  cp target/wasm32-wasip1/release/formats.wasm "$ROOT/src/wasm/bin/formats-$f.wasm"
  ls -l "$ROOT/src/wasm/bin/formats-$f.wasm"
done
