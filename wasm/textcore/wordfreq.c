/*
 * Word frequency (own code). Tokens come from the browser's Unicode word segmenter (Intl.Segmenter), lower-cased
 * natively, joined with '\n' as UTF-8. Counting, stop-word/number/short-word filtering and top-K ranking run here.
 *   t_wordfreq(tokens, n, flags, out, k) → number of results; out = (first token index, count) pairs, sorted by
 *   count desc, then first appearance. flags bit 0: drop English stop words, bit 1: drop numbers,
 *   bits 8..15: minimum length in code points (0 = keep all).
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define API __attribute__((visibility("default")))

static const char *STOPW[] = {"a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "is", "are",
    "was", "were", "be", "been", "it", "its", "this", "that", "these", "those", "i", "you", "he", "she", "we", "they", "them", "his", "her", "our",
    "your", "their", "not", "no", "yes", "do", "does", "did", "so", "than", "then", "there", "here", "what", "which", "who", "whom", "how", "when",
    "where", "why", "all", "any", "each", "into", "over", "under", "about", "after", "before", "up", "down", "out", "just", "also", "can", "will",
    "would", "should", "could", "may", "might", "must", "have", "has", "had", "my", "me", "us"};
static int stopword(const char *s, int n) {
    for (unsigned i = 0; i < sizeof STOPW / sizeof *STOPW; i++) if ((int)strlen(STOPW[i]) == n && !memcmp(STOPW[i], s, n)) return 1;
    return 0;
}
static int codepoints(const char *s, int n) { int c = 0; for (int i = 0; i < n; i++) if (((unsigned char)s[i] & 0xc0) != 0x80) c++; return c; }
static int all_digits(const char *s, int n) { for (int i = 0; i < n; i++) if (s[i] < '0' || s[i] > '9') return 0; return n > 0; }
static uint32_t fnv(const char *s, int n) { uint32_t h = 2166136261u; for (int i = 0; i < n; i++) { h ^= (unsigned char)s[i]; h *= 16777619u; } return h; }

typedef struct { const char *s; int n, first, count; } Ent;
static int cmp_ent(const void *a, const void *b) {
    const Ent *x = a, *y = b;
    return x->count != y->count ? y->count - x->count : x->first - y->first;
}

API int t_wordfreq(const char *tok, int len, int flags, int32_t *out, int k) {
    int cap = 1024;
    while (cap < len / 2 + 16) cap <<= 1;
    Ent *tab = calloc(cap, sizeof(Ent));
    int used = 0, idx = 0, minlen = (flags >> 8) & 0xff;
    int i = 0;
    while (i <= len) {
        int j = i;
        while (j < len && tok[j] != '\n') j++;
        int n = j - i;
        const char *s = tok + i;
        int keep = n > 0 && !((flags & 1) && stopword(s, n)) && !((flags & 2) && all_digits(s, n)) && !(minlen && codepoints(s, n) < minlen);
        if (keep) {
            uint32_t h = fnv(s, n) & (cap - 1);
            while (tab[h].s && !(tab[h].n == n && !memcmp(tab[h].s, s, n))) h = (h + 1) & (cap - 1);
            if (!tab[h].s) { tab[h].s = s; tab[h].n = n; tab[h].first = idx; used++; }
            tab[h].count++;
        }
        if (j >= len) break;
        i = j + 1; idx++;
    }
    Ent *list = malloc(sizeof(Ent) * (used ? used : 1));
    int m = 0;
    for (int h = 0; h < cap; h++) if (tab[h].s) list[m++] = tab[h];
    qsort(list, m, sizeof(Ent), cmp_ent);
    int r = m < k ? m : k;
    for (int q = 0; q < r; q++) { out[q * 2] = list[q].first; out[q * 2 + 1] = list[q].count; }
    free(list); free(tab);
    return r;
}
