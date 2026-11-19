// rand() and srand() as glibc has them (its random(): an additive feedback generator, r[i] = r[i-3] + r[i-31]).
//
// Why Graphviz gets its own: sfdp takes its starting positions from rand(), and fdp and the overlap removal use it to
// push apart nodes that sit on one spot. wasi-libc's rand() is another generator, so the same graph came out as a
// different (equally valid) drawing than `dot -Ksfdp` makes on Linux — where Graphviz is developed and where its
// reference drawings come from. With this file the numbers are the same ones (unit suite: the first values for
// several seeds are held against glibc's, tests/fixtures/graphviz/glibc-rand.json; the drawings against native dot).
// drand48() and srand48(), which neato and fdp use for starting positions, are the same in every C library (POSIX
// fixes the formula) and stay wasi-libc's.
#include <stdint.h>
#include <stdlib.h>

static uint32_t st_r[34];
static int st_i = -1;               // index of the next value in the ring; -1 = not seeded yet (as srand(1))
void srand(unsigned seed) {
  int32_t word = seed ? (int32_t)seed : 1;
  uint32_t r[344];
  r[0] = (uint32_t)word;
  for (int i = 1; i < 31; i++) {    // word = 16807 * word mod (2^31 - 1), without overflow (Schrage)
    int32_t hi = word / 127773, lo = word % 127773;
    word = 16807 * lo - 2836 * hi;
    if (word < 0) word += 2147483647;
    r[i] = (uint32_t)word;
  }
  for (int i = 31; i < 34; i++) r[i] = r[i - 31];
  for (int i = 34; i < 344; i++) r[i] = r[i - 31] + r[i - 3];   // glibc throws the first 310 values away
  for (int i = 0; i < 34; i++) st_r[i] = r[310 + i];
  st_i = 0;
}
int rand(void) {
  if (st_i < 0) srand(1);
  // st_r holds the last 34 values, oldest at st_i: the new one is value[-31] + value[-3]
  uint32_t v = st_r[(st_i + 3) % 34] + st_r[(st_i + 31) % 34];
  st_r[st_i] = v;
  st_i = (st_i + 1) % 34;
  return (int)(v >> 1);
}
