/* config.h for gnulib's regex in wasm32-wasi (wasi-libc = musl): what GNU grep's configure would find there.
 * Single-threaded (no GNULIB_LOCK: regex_internal.h then takes no locks). */
#include <stdbool.h>
/* GNU's own template first (its #undef lines are harmless; its verbatim blocks define _GL_ATTRIBUTE_* and the rest
 * attribute.h asks for), then what configure would have found */
#include "config.hin"
#define HAVE_LANGINFO_CODESET 1
#define HAVE_WCHAR_H 1
#define HAVE_WCTYPE_H 1
#define HAVE_ISBLANK 1
#define HAVE_ISWCTYPE 1
#define HAVE_MBRTOWC 1
#define HAVE_WCRTOMB 1
#define HAVE_WCSCOLL 1
#define HAVE_ALLOCA 1
#define HAVE_ALLOCA_H 1
#define HAVE_STDBOOL_H 1
#define _REGEX_INCLUDE_LIMITS_H 1
#define _REGEX_LARGE_OFFSETS 1
#define __STDC_WANT_IEC_60559_BFP_EXT__ 1
