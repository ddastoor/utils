#!/usr/bin/env bash
# Builds src/wasm/bin/crypto.wasm = libsodium (stable) + glue.c + hashes.c as a WASI reactor.
#
#   ZIG=/path/to/zig wasm/crypto/build.sh
#
# libsodium source comes from the crates.io crate libsodium-sys-stable, which vendors the official
# "libsodium-stable" tarball plus its minisign signature. Two independent checks are made:
#   1. SHA-256 of the .crate file must equal the checksum published in the crates.io index.
#   2. The tarball's minisign signature must verify against libsodium's official public key.
set -euo pipefail

CRATE_VER=1.22.3
CRATE_SHA256=b023d38f2afdfe36f81e15a9d7232097701d7b107e3a93ba903083985e235239
LIBSODIUM_PUBKEY=RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ZIG="${ZIG:-zig}"
WORK="$HERE/.build"
mkdir -p "$WORK"
cd "$WORK"

if [ -f "$WORK/prefix/lib/libsodium.a" ] && [ "${REBUILD:-0}" != 1 ]; then
  echo "libsodium already built in $WORK/prefix (REBUILD=1 to rebuild)"
else
CRATE="libsodium-sys-stable-$CRATE_VER.crate"
if [ ! -f "$CRATE" ]; then
  curl -fsSL -o "$CRATE" "https://static.crates.io/crates/libsodium-sys-stable/$CRATE"
fi
echo "$CRATE_SHA256  $CRATE" | sha256sum -c -

rm -rf src && mkdir src
tar -xzf "$CRATE" -C src --strip-components=1 \
  "libsodium-sys-stable-$CRATE_VER/LATEST.tar.gz" "libsodium-sys-stable-$CRATE_VER/LATEST.tar.gz.minisig"
node "$ROOT/wasm/tools/verify-minisign.mjs" src/LATEST.tar.gz src/LATEST.tar.gz.minisig "$LIBSODIUM_PUBKEY"
tar -xzf src/LATEST.tar.gz -C src
cd src/libsodium-stable

export CC="$ZIG cc --target=wasm32-wasi"
export AR="$ZIG ar"
export RANLIB="$ZIG ranlib"
export CFLAGS="-O3"
export CPPFLAGS="-DED25519_NONDETERMINISTIC=1"
./configure --host=wasm32-wasi --prefix="$WORK/prefix" \
  --disable-pie --disable-ssp --disable-shared --without-pthreads >/dev/null
make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)" >/dev/null
make install >/dev/null
fi
cd "$WORK"

EXPORTS=""
for f in $(grep -oE 'EXPORT [^(]*\b(u_[a-z0-9_]+)\(' "$HERE/glue.c" | grep -oE 'u_[a-z0-9_]+'); do
  EXPORTS="$EXPORTS -Wl,--export=$f"
done

$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O3 -flto \
  -I"$WORK/prefix/include" \
  "$HERE/glue.c" "$HERE/hashes.c" "$WORK/prefix/lib/libsodium.a" \
  $EXPORTS -Wl,--strip-all -Wl,-z,stack-size=1048576 \
  -Wl,--max-memory=4294901760 \
  -o "$ROOT/src/wasm/bin/crypto.wasm"

ls -l "$ROOT/src/wasm/bin/crypto.wasm"
sha256sum "$ROOT/src/wasm/bin/crypto.wasm"
