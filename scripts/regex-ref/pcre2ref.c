/* pcre2ref — the native PCRE2 reference of the Regex Tester's PCRE2 flavour (scripts/make-regex-reference.py).
 * Reads one request on stdin as "<length>:<bytes>" fields (pattern, flags, text, has replacement, replacement,
 * every match) and prints JSON: the matches of PCRE2's global loop as pcre2demo.c makes it (an empty match is tried
 * again at the same place with NOTEMPTY_ATSTART | ANCHORED, then one character on), the group names, and
 * pcre2_substitute's result (EXTENDED; GLOBAL for every match). Offsets in UTF-8 bytes.
 * Build: cc -O2 -o pcre2ref pcre2ref.c -lpcre2-8 */
#define PCRE2_CODE_UNIT_WIDTH 8
#include <pcre2.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *field[6]; static size_t flen[6];

static int read_fields(void) {
  size_t cap = 1 << 16, n = 0; char *buf = malloc(cap);
  for (;;) { size_t r = fread(buf + n, 1, cap - n, stdin); n += r; if (n < cap) break; cap *= 2; buf = realloc(buf, cap); }
  size_t p = 0;
  for (int i = 0; i < 6; i++) {
    size_t len = 0;
    while (p < n && buf[p] != ':') len = len * 10 + (size_t)(buf[p++] - '0');
    if (p >= n) return 0;
    p++; field[i] = buf + p; flen[i] = len; p += len;
  }
  return 1;
}

static void put_str(const char *s, size_t n) {
  putchar('"');
  for (size_t i = 0; i < n; i++) {
    unsigned char c = (unsigned char)s[i];
    if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
    else if (c < 0x20) printf("\\u%04x", c);
    else putchar(c);
  }
  putchar('"');
}

int main(void) {
  if (!read_fields()) { puts("{\"error\":\"bad request\"}"); return 0; }
  uint32_t opts = PCRE2_UTF;
  for (size_t i = 0; i < flen[1]; i++) switch (field[1][i]) {
    case 'i': opts |= PCRE2_CASELESS; break; case 'm': opts |= PCRE2_MULTILINE; break; case 's': opts |= PCRE2_DOTALL; break;
    case 'x': opts |= PCRE2_EXTENDED; break; case 'n': opts |= PCRE2_NO_AUTO_CAPTURE; break; case 'U': opts |= PCRE2_UNGREEDY; break;
    case 'J': opts |= PCRE2_DUPNAMES; break; case 'D': opts |= PCRE2_DOLLAR_ENDONLY; break; case 'A': opts |= PCRE2_ANCHORED; break;
    case 'u': opts |= PCRE2_UCP; break;
  }
  int err; PCRE2_SIZE eoff;
  pcre2_code *re = pcre2_compile((PCRE2_SPTR)field[0], flen[0], opts, &err, &eoff, NULL);
  if (!re) {
    PCRE2_UCHAR msg[256]; pcre2_get_error_message(err, msg, sizeof msg);
    printf("{\"error\":"); put_str((char *)msg, strlen((char *)msg)); printf(",\"offset\":%zu}\n", (size_t)eoff);
    return 0;
  }
  uint32_t ncap; pcre2_pattern_info(re, PCRE2_INFO_CAPTURECOUNT, &ncap);
  uint32_t nnames, esize; PCRE2_SPTR table;
  pcre2_pattern_info(re, PCRE2_INFO_NAMECOUNT, &nnames); pcre2_pattern_info(re, PCRE2_INFO_NAMEENTRYSIZE, &esize); pcre2_pattern_info(re, PCRE2_INFO_NAMETABLE, &table);
  printf("{\"names\":[");
  for (uint32_t g = 1; g <= ncap; g++) {
    const char *name = "";
    for (uint32_t k = 0; k < nnames; k++) { PCRE2_SPTR e = table + k * esize; if (((e[0] << 8) | e[1]) == (int)g) { name = (const char *)e + 2; break; } }
    if (g > 1) putchar(','); put_str(name, strlen(name));
  }
  printf("],\"matches\":[");
  PCRE2_SPTR s = (PCRE2_SPTR)field[2]; size_t len = flen[2];
  pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
  int rc = pcre2_match(re, s, len, 0, 0, md, NULL), total = 0;
  PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
  while (rc >= 0) {
    if (total) putchar(',');
    putchar('[');
    for (uint32_t g = 0; g <= ncap; g++) {
      long a = (int)g < rc && ov[2 * g] != PCRE2_UNSET ? (long)ov[2 * g] : -1, b = a < 0 ? -1 : (long)ov[2 * g + 1];
      printf("%s%ld,%ld", g ? "," : "", a, b);
    }
    putchar(']'); total++;
    uint32_t o = 0; PCRE2_SIZE start = ov[1];
    if (ov[0] == ov[1]) { if (ov[0] == len) break; o = PCRE2_NOTEMPTY_ATSTART | PCRE2_ANCHORED; }
    else { PCRE2_SIZE sc = pcre2_get_startchar(md); if (start <= sc) { if (sc >= len) break; start = sc + 1; while (start < len && (s[start] & 0xc0) == 0x80) start++; } }
    rc = pcre2_match(re, s, len, start, o, md, NULL);
    if (rc == PCRE2_ERROR_NOMATCH && o) { // nothing non-empty here: one character on
      PCRE2_SIZE next = start + 1;
      while (next < len && (s[next] & 0xc0) == 0x80) next++;
      if (next > len) break;
      ov[0] = ov[1] = next; // as if an empty match had ended here, without one
      rc = pcre2_match(re, s, len, next, 0, md, NULL);
    }
  }
  printf("],\"total\":%d", total);
  if (rc < -1 && rc != PCRE2_ERROR_NOMATCH) { PCRE2_UCHAR msg[256]; pcre2_get_error_message(rc, msg, sizeof msg); printf(",\"matchError\":"); put_str((char *)msg, strlen((char *)msg)); }
  if (flen[3] == 1 && field[3][0] == '1') {
    PCRE2_SIZE outlen = len * 2 + 4096; PCRE2_UCHAR *out = malloc(outlen + 1);
    uint32_t so = PCRE2_SUBSTITUTE_EXTENDED | PCRE2_SUBSTITUTE_OVERFLOW_LENGTH | (field[5][0] == '1' ? PCRE2_SUBSTITUTE_GLOBAL : 0);
    int r = pcre2_substitute(re, s, len, 0, so, NULL, NULL, (PCRE2_SPTR)field[4], flen[4], out, &outlen);
    if (r == PCRE2_ERROR_NOMEMORY) { out = realloc(out, outlen + 1); r = pcre2_substitute(re, s, len, 0, so, NULL, NULL, (PCRE2_SPTR)field[4], flen[4], out, &outlen); }
    if (r >= 0) { printf(",\"replaced\":"); put_str((char *)out, outlen); }
    else { PCRE2_UCHAR msg[256]; pcre2_get_error_message(r, msg, sizeof msg); printf(",\"repError\":"); put_str((char *)msg, strlen((char *)msg)); }
  }
  printf(",\"version\":\"%d.%d\"}\n", PCRE2_MAJOR, PCRE2_MINOR);
  return 0;
}
