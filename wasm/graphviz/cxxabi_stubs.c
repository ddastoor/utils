/* Graphviz's VPSC solver (neato's ipsep mode) throws only on fatal solver errors. This wasm build has no exception
 * unwinding (zig's wasm32-wasi libc++abi is built without it), so a throw reports and aborts — the JS side sees a trap,
 * reports "layout failed" and makes a fresh instance. catch blocks are never reached. */
#include <stdio.h>
#include <stdlib.h>
void *__cxa_allocate_exception(size_t n) { return malloc(n ? n : 1); }
void __cxa_free_exception(void *p) { free(p); }
_Noreturn void __cxa_throw(void *obj, void *tinfo, void (*dest)(void *)) {
  (void)obj; (void)tinfo; (void)dest;
  fputs("graphviz: fatal error in the layout solver (C++ exception)\n", stderr);
  abort();
}
/* Single-threaded wasm32-wasi libc has no stdio locking: Graphviz only locks stderr around its messages. */
void flockfile(FILE *f) { (void)f; }
void funlockfile(FILE *f) { (void)f; }
