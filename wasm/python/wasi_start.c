/* Start-up fixes for CPython on zig's single-threaded wasm32-wasi libc (run as constructors, before main):
 * 1. musl's __init_tp never runs there, so the main thread's `prev`/`next` links stay NULL and pthread_key_delete()
 *    (walks the thread list until it is back at self) loops forever — CPython calls it at exit. Link the main thread
 *    to itself, as __init_tp does on every other musl target. Layout = "Part 1" of musl's struct pthread for wasi-libc
 *    (self, prev, next), which musl documents as fixed ABI.
 * 2. WASI has no current directory; wasi-libc starts at "/". Start in $PWD when the host sets it (as a shell does), so
 *    `python main.py` and open("data.csv") work relative to the user's folder. */
#include <stdlib.h>
#include <unistd.h>
struct st_pthread_head { void *self, *prev, *next; };
extern _Thread_local struct st_pthread_head __wasilibc_pthread_self;
__attribute__((constructor)) static void st_wasi_start(void) {
  struct st_pthread_head *s = &__wasilibc_pthread_self;
  if (!s->next) s->prev = s->next = s;
  const char *pwd = getenv("PWD");
  if (pwd && pwd[0] == '/') chdir(pwd);
}
