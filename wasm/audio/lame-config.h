/* config.h for libmp3lame 4.0 on wasm32-wasi (from LAME's own ./configure run as a cross build, trimmed to what
 * libmp3lame reads; no frontend, no decoder, no NASM/SSE). */
#ifndef LAME_CONFIG_H
#define LAME_CONFIG_H
#define STDC_HEADERS 1
#define HAVE_ERRNO_H 1
#define HAVE_FCNTL_H 1
#define HAVE_INTTYPES_H 1
#define HAVE_LIMITS_H 1
#define HAVE_STDINT_H 1
#define HAVE_STDLIB_H 1
#define HAVE_STRING_H 1
#define HAVE_STRINGS_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_UNISTD_H 1
#define HAVE_INT8_T 1
#define HAVE_INT16_T 1
#define HAVE_INT32_T 1
#define HAVE_INT64_T 1
#define HAVE_UINT8_T 1
#define HAVE_UINT16_T 1
#define HAVE_UINT32_T 1
#define HAVE_UINT64_T 1
#define A_INT32_T int
#define A_INT64_T long long
#define A_UINT32_T unsigned int
#define A_UINT64_T unsigned long long
#define SIZEOF_DOUBLE 8
#define SIZEOF_FLOAT 4
#define SIZEOF_INT 4
#define SIZEOF_LONG 4
#define SIZEOF_LONG_LONG 8
#define SIZEOF_SHORT 2
#define SIZEOF_UNSIGNED_INT 4
#define SIZEOF_UNSIGNED_LONG 4
#define SIZEOF_UNSIGNED_LONG_LONG 8
#define SIZEOF_UNSIGNED_SHORT 2
#define LAME_LIBRARY_BUILD 1
#define NOANALYSIS 1
#define TAKEHIRO_IEEE754_HACK 0
#define USE_FAST_LOG 1
#define PACKAGE "lame"
#define VERSION "4.0"
#define ieee754_float32_t float
#endif
