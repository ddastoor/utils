/* Local time for jq on wasi-libc, which is built without time zones (its localtime() is gmtime(), so `localtime` and
 * `strflocaltime` answered in UTC for everybody). The page knows the user's zone — the browser's Intl has the whole
 * time-zone database — so "what is the UTC offset at this moment" goes to the host:
 *   supertools.tz_info(seconds, is_local, out[3], name, cap)
 * fills out = { seconds east of UTC, is it daylight time, the year's other offset } and name ("IST", "EDT", "+0545").
 * build.sh compiles jq with -Dlocaltime_r=supertools_localtime_r -Dmktime=supertools_mktime (the two libc functions
 * jq takes local time from: f_localtime and jv2tm) and -Dtimegm=supertools_timegm (see below); libc's strftime then
 * prints %Z and %z from the struct tm filled in here.
 * Same mechanism as CPython's (wasm/python/wasi_start.c); the host side is src/lib/tzinfo.ts. */
#include <time.h>
#include <errno.h>
#include <limits.h>
#include <string.h>

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
static void st_zone(long long t, int local, int *isdst, int *offset, long *oppoff, const char **zonename) {   /* wasi-libc: __tm_gmtoff is an int */
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
/* jq's strftime / todate go through timegm(); glibc — what the jq command line is built on everywhere — names that
 * zone "GMT" for %Z, musl "UTC". Keep the command line's answer. */
time_t supertools_timegm(struct tm *tm) {
  time_t t = timegm(tm);
  if (t != (time_t)-1 || tm->__tm_zone) tm->__tm_zone = "GMT";
  return t;
}
