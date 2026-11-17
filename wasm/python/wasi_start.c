/* Start-up fixes for CPython on zig's single-threaded wasm32-wasi libc (run as constructors, before main):
 * 1. musl's __init_tp never runs there, so the main thread's `prev`/`next` links stay NULL and pthread_key_delete()
 *    (walks the thread list until it is back at self) loops forever — CPython calls it at exit. Link the main thread
 *    to itself, as __init_tp does on every other musl target. Layout = "Part 1" of musl's struct pthread for wasi-libc
 *    (self, prev, next), which musl documents as fixed ABI.
 * 2. WASI has no current directory; wasi-libc starts at "/". Start in $PWD when the host sets it (as a shell does), so
 *    `python main.py` and open("data.csv") work relative to the user's folder.
 * 3. supertools_stack_sink: the padding that stack-guard.patch puts into every function that checks the recursion
 *    limit stores its address here, so that the compiler cannot shrink it away.
 * 4. Local time. wasi-libc is built without time zones — localtime() is gmtime(), so datetime.now() was UTC for
 *    everybody. The page knows the user's zone (the browser's Intl has the whole time-zone database), so the question
 *    "what is the UTC offset at this moment" goes to the host: the import
 *    supertools.tz_info(seconds, is_local, out[3], name, cap) fills out = { seconds east of UTC, is it daylight time,
 *    the year's other offset } and name ("IST", "CEST", "+0545"). build.sh compiles CPython with
 *    -Dlocaltime_r=supertools_localtime_r -Dmktime=supertools_mktime: the two libc functions CPython takes local
 *    time from (libc's own are left alone; its strftime prints %z and %Z from the struct tm filled in here). */
#include <stdlib.h>
#include <unistd.h>
#include <time.h>
#include <errno.h>
#include <limits.h>
#include <string.h>
void *volatile supertools_stack_sink;
struct st_pthread_head { void *self, *prev, *next; };
extern _Thread_local struct st_pthread_head __wasilibc_pthread_self;
__attribute__((constructor)) static void st_wasi_start(void) {
  struct st_pthread_head *s = &__wasilibc_pthread_self;
  if (!s->next) s->prev = s->next = s;
  const char *pwd = getenv("PWD");
  if (pwd && pwd[0] == '/') chdir(pwd);
}

__attribute__((import_module("supertools"), import_name("tz_info")))
extern void st_tz_info(long long secs, int local, int *out, char *name, int cap);
extern int __secs_to_tm(long long, struct tm *);            /* libc internals: seconds <-> broken-down time */
extern long long __tm_to_secs(const struct tm *);
/* zone names handed out in struct tm must stay valid: a small table of the names seen */
static char st_names[8][12]; static int st_n;
static const char *st_intern(const char *s) {
  for (int i = 0; i < st_n; i++) if (!strcmp(st_names[i], s)) return st_names[i];
  int i = st_n < 8 ? st_n++ : 7;
  strncpy(st_names[i], s, 11); st_names[i][11] = 0; return st_names[i];
}
static void st_zone(long long t, int local, int *isdst, int *offset, long *oppoff, const char **zonename) {
  int out[3] = { 0, 0, 0 }; char name[12] = "UTC";
  st_tz_info(t, local, out, name, sizeof name);
  *offset = out[0]; *isdst = out[1];
  if (oppoff) *oppoff = out[2];
  if (zonename) *zonename = st_intern(name);
}
/* musl's localtime_r and mktime (src/time), asking the host instead of a time-zone file */
struct tm *supertools_localtime_r(const time_t *restrict t, struct tm *restrict tm) {
  if (*t < INT_MIN * 31622400LL || *t > INT_MAX * 31622400LL) { errno = EOVERFLOW; return 0; }
  st_zone(*t, 0, &tm->tm_isdst, &tm->__tm_gmtoff, 0, &tm->__tm_zone);
  if (__secs_to_tm((long long)*t + tm->__tm_gmtoff, tm) < 0) { errno = EOVERFLOW; return 0; }
  return tm;
}
time_t supertools_mktime(struct tm *tm) {
  struct tm new; long opp;
  long long t = __tm_to_secs(tm);
  st_zone(t, 1, &new.tm_isdst, &new.__tm_gmtoff, &opp, &new.__tm_zone);
  if (tm->tm_isdst >= 0 && new.tm_isdst != tm->tm_isdst) t -= opp - new.__tm_gmtoff;
  t -= new.__tm_gmtoff;
  if ((time_t)t != t) goto error;
  st_zone(t, 0, &new.tm_isdst, &new.__tm_gmtoff, &opp, &new.__tm_zone);
  if (__secs_to_tm(t + new.__tm_gmtoff, &new) < 0) goto error;
  *tm = new;
  return t;
error:
  errno = EOVERFLOW;
  return -1;
}
