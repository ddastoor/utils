#!/usr/bin/env bash
# Builds src/wasm/bin/keys.wasm from wasm/keys (Rust, RustCrypto): hmac + md-5/sha1/sha2/sha3, argon2, bcrypt, pbkdf2,
# scrypt (PHC strings), ssh-key (OpenSSH Ed25519, bcrypt-pbkdf + AES-256-CTR). crates.io sources verified by Cargo.lock.
#   wasm/keys/build.sh        (needs: rustup target add wasm32-wasip1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
cargo build --release --locked --target wasm32-wasip1
cp target/wasm32-wasip1/release/keys.wasm "$ROOT/src/wasm/bin/keys.wasm"
ls -l "$ROOT/src/wasm/bin/keys.wasm"
