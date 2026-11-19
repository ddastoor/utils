// qsort as glibc does it: a merge sort, which keeps elements that compare equal in the order they came in.
//
// Why Graphviz gets its own: the C standard leaves that order open, wasi-libc (musl) sorts with smoothsort, and
// several of Graphviz's comparison functions call different elements equal (nodes of the same weight in the crossing
// minimisation of dot, for one). The order they end up in decides which of several equally good layouts is drawn.
// Graphviz is developed and its reference drawings are made on Linux with glibc; with this file the module draws
// what `dot` draws there (unit suite: tests/unit/graphviz.test.mjs compares with the native tool, graph by graph).
// The steps are those of glibc's stdlib/msort.c (split at n / 2, take from the left half while it is not greater),
// so even a comparison function that contradicts itself is asked the same questions in the same order.
#include <stdlib.h>
#include <string.h>

typedef int (*st_cmp)(const void *, const void *);
static void st_msort(char *b, size_t n, size_t s, st_cmp cmp, char *tmp) {
  if (n <= 1) return;
  size_t n1 = n / 2, n2 = n - n1;
  char *b1 = b, *b2 = b + n1 * s, *t = tmp;
  st_msort(b1, n1, s, cmp, tmp);
  st_msort(b2, n2, s, cmp, tmp);
  while (n1 > 0 && n2 > 0) {
    if (cmp(b1, b2) <= 0) { memcpy(t, b1, s); b1 += s; n1--; }
    else { memcpy(t, b2, s); b2 += s; n2--; }
    t += s;
  }
  if (n1 > 0) memcpy(t, b1, n1 * s);
  memcpy(b, tmp, (n - n2) * s);
}
void qsort(void *base, size_t n, size_t size, st_cmp cmp) {
  if (n < 2 || size == 0) return;
  char *tmp = malloc(n * size);
  if (!tmp) abort();                      // out of memory: the worker ends and the tab says so
  st_msort(base, n, size, cmp, tmp);
  free(tmp);
}
