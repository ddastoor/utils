/* whisper.cpp / ggml only throw on fatal errors (failed initialisation, impossible allocations). This wasm build has
 * no exception unwinding (zig's wasm32-wasi libc++abi is built without it), so a throw reports and aborts — the JS
 * side sees a trap and reports the error. catch blocks are never reached. */
#include <stdio.h>
#include <stdlib.h>
void *__cxa_allocate_exception(size_t n) { return malloc(n ? n : 1); }
void __cxa_free_exception(void *p) { free(p); }
_Noreturn void __cxa_throw(void *obj, void *tinfo, void (*dest)(void *)) {
  (void)obj; (void)tinfo; (void)dest;
  fputs("whisper: fatal error (C++ exception)\n", stderr);
  abort();
}
