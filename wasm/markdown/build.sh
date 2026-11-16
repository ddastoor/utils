#!/usr/bin/env bash
# Builds src/wasm/bin/markdown.wasm: cmark-gfm (GitHub's CommonMark + GFM extensions, C, BSD-2) + glue.c.
# Source: the cmark-gfm tree vendored in the PyPI sdist of `cmarkgfm` (github.com is not reachable from the sandbox),
# verified against the SHA-256 PyPI publishes. Version: cmark-gfm 0.29.0.gfm.13.
#   ZIG=/path/to/zig wasm/markdown/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
VER=2025.10.22
URL=https://files.pythonhosted.org/packages/8f/0c/5010c87ceba51854dad42f45a3d28a3c67e81a21cfed8b20c34688aaa1b6/cmarkgfm-$VER.tar.gz
SHA=5bec61007b65b919488442c838c58a6c8bf4741f5103c593b2ef180d39818eda
WORK="${TMPDIR:-/tmp}/cmark-build"; rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
curl -fsSL --retry 4 -o src.tgz "$URL"
echo "$SHA  src.tgz" | sha256sum -c -
tar xzf src.tgz
S="cmarkgfm-$VER/third_party/cmark"; G="cmarkgfm-$VER/generated/unix"
grep -q '"0.29.0.gfm.13"' "$G/cmark-gfm_version.h"
SRCS=$(ls "$S"/src/*.c | grep -v '/main.c$') EXTS=$(ls "$S"/extensions/*.c)
$ZIG cc --target=wasm32-wasi -mexec-model=reactor -O2 -DCMARK_GFM_STATIC_DEFINE -DCMARK_GFM_EXTENSIONS_STATIC_DEFINE \
  -I"$G" -I"$S/src" -I"$S/extensions" $SRCS $EXTS "$HERE/glue.c" \
  -Wl,--export=md_html -Wl,--export=md_malloc -Wl,--export=md_free -Wl,--export=md_version -Wl,--strip-all \
  -o "$ROOT/src/wasm/bin/markdown.wasm"
ls -l "$ROOT/src/wasm/bin/markdown.wasm"
