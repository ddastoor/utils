/* posix-re.wasm — the Regex Tester's POSIX ERE flavour (to-do #8): GNU's regex (gnulib, the copy GNU grep 3.12 ships;
 * glibc's own regcomp/regexec are the same code), the engine grep -E and sed -E run on Linux. Leftmost-longest matches,
 * POSIX classes, back-references, GNU's \w \W \s \S \b \B \< \> \` \'. The walk over the text is GNU sed's s///g (and
 * Go's): after an empty match one character on, and no empty match right where the previous match ended. Offsets are
 * UTF-8 byte offsets; the answer is JSON in px_out(). */
#include <locale.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "regex.h"

static char *out; static size_t olen, ocap;
static void put(const char *s, size_t n) {
  if (olen + n + 1 > ocap) { ocap = (olen + n + 1) * 2; out = realloc(out, ocap); }
  memcpy(out + olen, s, n); olen += n; out[olen] = 0;
}
static void puts_(const char *s) { put(s, strlen(s)); }
static void putnum(long v) { char b[32]; int n = snprintf(b, sizeof b, "%ld", v); put(b, (size_t)n); }
static void putstr(const char *s, size_t n) {
  put("\"", 1);
  for (size_t i = 0; i < n; i++) {
    unsigned char c = (unsigned char)s[i];
    if (c == '"' || c == '\\') { char b[2] = { '\\', (char)c }; put(b, 2); }
    else if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); put(b, 6); }
    else put((const char *)&c, 1);
  }
  put("\"", 1);
}
/* the length of the UTF-8 character at s[i] (1 for a byte that starts none) */
static size_t charlen(const char *s, size_t i, size_t n) {
  unsigned char c = (unsigned char)s[i];
  size_t k = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
  return i + k <= n ? k : 1;
}

__attribute__((export_name("px_alloc"))) void *px_alloc(size_t n) { return malloc(n ? n : 1); }
__attribute__((export_name("px_free"))) void px_free(void *p) { free(p); }
__attribute__((export_name("px_out"))) const char *px_out(void) { return out; }
__attribute__((export_name("px_out_len"))) size_t px_out_len(void) { return olen; }

/* flags: 1 = REG_ICASE (i), 2 = REG_NEWLINE (m) */
__attribute__((export_name("px_run")))
int px_run(const char *pat, size_t plen, const char *text, size_t tlen, int flags, int shown, int counted) {
  static int inited;
  if (!inited) { setlocale(LC_ALL, "C.UTF-8"); inited = 1; }
  olen = 0; put("", 0);
  char *p = malloc(plen + 1); memcpy(p, pat, plen); p[plen] = 0;
  regex_t re;
  int rc = regcomp(&re, p, REG_EXTENDED | (flags & 1 ? REG_ICASE : 0) | (flags & 2 ? REG_NEWLINE : 0));
  free(p);
  if (rc) { char msg[256]; regerror(rc, &re, msg, sizeof msg); puts_("{\"error\":"); putstr(msg, strlen(msg)); puts_("}"); return 0; }
  size_t ng = re.re_nsub;
  regmatch_t *m = malloc((ng + 1) * sizeof *m);
  puts_("{\"groups\":"); putnum((long)ng); puts_(",\"matches\":[");
  size_t pos = 0; long prev_end = -1; int total = 0;
  while (pos <= tlen) {
    m[0].rm_so = (regoff_t)pos; m[0].rm_eo = (regoff_t)tlen;
    if (regexec(&re, text, ng + 1, m, REG_STARTEND)) break;
    size_t s = (size_t)m[0].rm_so, e = (size_t)m[0].rm_eo;
    int accept = !(s == e && (long)s == prev_end);
    if (accept) {
      if (total < shown) {
        if (total) put(",", 1);
        put("[", 1);
        for (size_t g = 0; g <= ng; g++) { if (g) put(",", 1); putnum(m[g].rm_so < 0 ? -1 : (long)m[g].rm_so); put(",", 1); putnum(m[g].rm_so < 0 ? -1 : (long)m[g].rm_eo); }
        put("]", 1);
      }
      if (++total >= counted) break;
    }
    prev_end = (long)e;
    pos = s == e ? (e < tlen ? e + charlen(text, e, tlen) : e + 1) : e;
  }
  puts_("],\"total\":"); putnum(total); puts_("}");
  free(m); regfree(&re);
  return 0;
}
