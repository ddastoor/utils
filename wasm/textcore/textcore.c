/*
 * textcore.wasm — text algorithms for SuperUtils (own code).
 *   This file: the allocator the wrapper uses. The engines are search.c (tool search), rare.c (rare-word ranking
 *   for the Photo Dictionary) and xycut.c (reading order for PDF → EPUB). The Text Diff's own Myers routine lived
 *   here until Nov 2026; that tab now uses textkit-diff.wasm (wasm/textkit).
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define API __attribute__((visibility("default")))
API void *t_malloc(uint32_t n) { return malloc(n ? n : 1); }
API void t_free(void *p) { free(p); }
