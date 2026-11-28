#!/usr/bin/env bash
# Builds src/wasm/bin/jpegcoef.wasm — libjpeg-turbo's decoder, as far as a JPEG's stored DCT coefficients (jpeg_read_coefficients:
# baseline, extended, progressive and arithmetic-coded files; no pixels decoded), and our glue (glue.c): the quantization tables
# and the checks of "Is This Screenshot Real?" made on the coefficients. ZIG=/path/to/zig bash wasm/jpegcoef/build.sh
#  - source: libjpeg-turbo_3.1.3.orig.tar.gz from the Ubuntu archive (libjpeg-turbo.org's release; SHA-256 from Ubuntu's signed
#    libjpeg-turbo_3.1.3-4ubuntu2.dsc)
#  - the 8-bit sources (12-bit only where libjpeg-turbo's transcoder asks for it: a 12-bit file reads too), no SIMD, our
#    jconfig.h / jconfigint.h for wasm32 (what CMake would write), jversion.h from its template
#  - errors: libjpeg's error_exit writes its message and traps (glue.c); the page makes a new instance
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
VER=3.1.3
SHA=3a13a5ba767dc8264bc40b185e41368a80d5d5f945944d1dbaa4b2fb0099f4e5
WORK="${WORK:-/tmp/jpegcoef-build}"; mkdir -p "$WORK"; cd "$WORK"
TAR="libjpeg-turbo_$VER.orig.tar.gz"
[ -f "$TAR" ] || curl -fsSL --retry 3 -o "$TAR" "http://archive.ubuntu.com/ubuntu/pool/main/libj/libjpeg-turbo/$TAR"
echo "$SHA  $TAR" | sha256sum -c -
rm -rf "libjpeg-turbo-$VER"; tar xzf "$TAR"; S="$WORK/libjpeg-turbo-$VER/src"; G="$WORK/gen"; mkdir -p "$G"

cat > "$G/jconfig.h" <<H
#define JPEG_LIB_VERSION  62
#define LIBJPEG_TURBO_VERSION  $VER
#define LIBJPEG_TURBO_VERSION_NUMBER  3001003
#define D_ARITH_CODING_SUPPORTED  1
#define MEM_SRCDST_SUPPORTED  1
#ifndef BITS_IN_JSAMPLE
#define BITS_IN_JSAMPLE  8
#endif
H
cat > "$G/jconfigint.h" <<'H'
#define BUILD  "superutils-wasm32"
#define HIDDEN  __attribute__((visibility("hidden")))
#undef inline
#define INLINE  __inline__ __attribute__((always_inline))
#define THREAD_LOCAL
#define PACKAGE_NAME  "libjpeg-turbo"
#define VERSION  "3.1.3"
#define SIZEOF_SIZE_T  4
#define HAVE_BUILTIN_CTZL
#define FALLTHROUGH  __attribute__((fallthrough));
#ifndef BITS_IN_JSAMPLE
#define BITS_IN_JSAMPLE  8
#endif
#undef C_ARITH_CODING_SUPPORTED
#undef D_ARITH_CODING_SUPPORTED
#undef WITH_SIMD
#if BITS_IN_JSAMPLE == 8
#define D_ARITH_CODING_SUPPORTED  1
#endif
H
sed 's/@COPYRIGHT_YEAR@/1991-2025/' "$S/jversion.h.in" > "$G/jversion.h"

SRCS="jdapimin.c jdtrans.c jdinput.c jdmarker.c jdhuff.c jdphuff.c jdarith.c jaricom.c jcomapi.c jerror.c jmemmgr.c jmemnobs.c jdatasrc.c
      jpeg_nbits.c wrapper/jdcoefct-8.c wrapper/jdcoefct-12.c wrapper/jutils-8.c wrapper/jutils-12.c wrapper/jutils-16.c"
OBJ="$WORK/obj"; rm -rf "$OBJ"; mkdir -p "$OBJ"
for f in $SRCS; do
  "$ZIG" cc --target=wasm32-wasi -O2 -I"$G" -I"$S" -c "$S/$f" -o "$OBJ/$(echo "$f" | tr / _).o"
done
EXPORTS=$(grep -ohE '^API [^(]*\b(jc_[a-z0-9_]+)\(' "$HERE/glue.c" | grep -oE 'jc_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
"$ZIG" cc --target=wasm32-wasi -O2 -mexec-model=reactor -I"$G" -I"$S" "$HERE/glue.c" "$OBJ"/*.o -o "$ROOT/src/wasm/bin/jpegcoef.wasm" \
  -Wl,--strip-all $EXPORTS
ls -l "$ROOT/src/wasm/bin/jpegcoef.wasm"
