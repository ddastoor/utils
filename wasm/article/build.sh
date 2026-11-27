#!/usr/bin/env bash
# Builds src/wasm/bin/article.wasm from wasm/article (Rust): the dom_smoothie crate (Mozilla Readability's algorithm in
# Rust, MIT) finds the article in a web page; our code beside it reads Chrome's MHTML and Safari's web archives and writes
# the article as XHTML for an EPUB. crates.io sources verified by Cargo.lock.
#   wasm/article/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/article.wasm "$ROOT/src/wasm/bin/article.wasm"
ls -l "$ROOT/src/wasm/bin/article.wasm"
