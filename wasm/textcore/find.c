/*
 * The Screenshot Finder's search (potentials #76): the words read in each picture, and a query matched against them.
 *   t_find_new()                          → handle
 *   t_find_add(h, pic, data, len)         a picture's words, one a line, normalised by the page (lower case, accents off)
 *   t_find_query(h, q, qn, out, cap)      → bytes of JSON written to out (or the bytes needed, when more than cap):
 *                                           [{"p":pic,"m":tokens matched,"n":tokens,"s":score,"w":[word indices]}, …]
 *                                           all tokens matched first, then by score; only pictures with half the tokens
 *   t_find_free(h)
 * A token of the query takes the best of its words: the same word (10), the same with its signs left out ("wi-fi",
 * "wifi": 9), several words in a row that make it ("4521 678 903" for "4521678903": 8), the same after the OCR's usual
 * slips (0/O, 1/l/I, 5/S, 8/B, rn/m, vv/w — when one of the two has a digit and the other a letter, or both letters: 7),
 * the beginning of a word (from 3 letters: 6), inside a word (from 4: "gmail" in "ravi@gmail.com", 5), one slip of the
 * keyboard or the OCR (Damerau-Levenshtein, from 5 letters: 4; two from 9: 3; a code of letters and digits from 8: one —
 * never a number of digits alone, where one digit apart is another number). Tokens matched by words next to each
 * other in the query's order add 3 each pair. Small words ("the", "a", "of" …) are left out unless the query is only
 * those. The whole query written together is tried too ("wi fi" → "wifi").
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define API __attribute__((visibility("default")))

typedef struct { char *s; int n; char *sq; int sqn; char *fold; int fn; } Word;
typedef struct { int pic; Word *w; int n, cap; } Doc;
typedef struct { Doc *d; int n, cap; } Finder;

static int is_alnum(unsigned char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || c >= 0x80; }
static int has_digit(const char *s, int n) { for (int i = 0; i < n; i++) if (s[i] >= '0' && s[i] <= '9') return 1; return 0; }
static int has_letter(const char *s, int n) { for (int i = 0; i < n; i++) { unsigned char c = (unsigned char)s[i]; if ((c >= 'a' && c <= 'z') || c >= 0x80) return 1; } return 0; }

/* the word without its signs (letters and digits only; bytes of other scripts kept) */
static int squeeze(const char *s, int n, char *dst) { int k = 0; for (int i = 0; i < n; i++) if (is_alnum((unsigned char)s[i])) dst[k++] = s[i]; return k; }
/* the OCR's usual slips undone on a squeezed word: 0→o, 1→l, i→l, 5→s, 8→b, rn→m, vv→w */
static int fold(const char *s, int n, char *dst) {
    int k = 0;
    for (int i = 0; i < n; i++) {
        char c = s[i];
        if (c == 'r' && i + 1 < n && s[i + 1] == 'n') { dst[k++] = 'm'; i++; continue; }
        if (c == 'v' && i + 1 < n && s[i + 1] == 'v') { dst[k++] = 'w'; i++; continue; }
        dst[k++] = c == '0' ? 'o' : c == '1' || c == 'i' ? 'l' : c == '5' ? 's' : c == '8' ? 'b' : c;
    }
    return k;
}

static void word_init(Word *w, const char *s, int n) {
    w->s = malloc(n + 1); memcpy(w->s, s, n); w->s[n] = 0; w->n = n;
    w->sq = malloc(n + 1); w->sqn = squeeze(s, n, w->sq); w->sq[w->sqn] = 0;
    w->fold = malloc(n + 1); w->fn = fold(w->sq, w->sqn, w->fold); w->fold[w->fn] = 0;
}
static void word_free(Word *w) { free(w->s); free(w->sq); free(w->fold); }

/* optimal string alignment distance, with an early exit above max */
static int osa(const char *a, int m, const char *b, int n, int max) {
    if (abs(m - n) > max) return max + 1;
    if (m > 63 || n > 63) return max + 1;
    int p2[64], p[64], c[64];
    for (int j = 0; j <= n; j++) p[j] = j;
    for (int i = 1; i <= m; i++) {
        c[0] = i; int best = i;
        for (int j = 1; j <= n; j++) {
            int cost = a[i - 1] == b[j - 1] ? 0 : 1, v = p[j] + 1;
            if (c[j - 1] + 1 < v) v = c[j - 1] + 1;
            if (p[j - 1] + cost < v) v = p[j - 1] + cost;
            if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] && p2[j - 2] + 1 < v) v = p2[j - 2] + 1;
            c[j] = v; if (v < best) best = v;
        }
        if (best > max) return max + 1;
        memcpy(p2, p, sizeof(int) * (n + 1)); memcpy(p, c, sizeof(int) * (n + 1));
    }
    return p[n];
}
static int contains(const char *a, int an, const char *p, int pn) {
    if (pn == 0 || pn > an) return 0;
    for (int i = 0; i + pn <= an; i++) if (!memcmp(a + i, p, pn)) return 1;
    return 0;
}

/* how well a word matches a token (0: not at all) */
static int score_word(const Word *t, const Word *w) {
    if (t->n == w->n && !memcmp(t->s, w->s, t->n)) return 10;
    if (!t->sqn || !w->sqn) return 0;
    if (t->sqn == w->sqn && !memcmp(t->sq, w->sq, t->sqn)) return 9;
    int mixed = (has_digit(t->sq, t->sqn) && has_letter(w->sq, w->sqn)) || (has_letter(t->sq, t->sqn) && has_digit(w->sq, w->sqn)) || (!has_digit(t->sq, t->sqn) && !has_digit(w->sq, w->sqn));
    if (mixed && t->sqn >= 3 && t->fn == w->fn && !memcmp(t->fold, w->fold, t->fn)) return 7;
    if (t->sqn >= 3 && w->sqn > t->sqn && !memcmp(w->sq, t->sq, t->sqn)) return 6;
    if (t->sqn >= 4 && contains(w->sq, w->sqn, t->sq, t->sqn)) return 5;
    /* a long code of letters and digits (a password, a tracking ID) with one slip of the OCR — not a number: one digit
     * apart is another number */
    if (t->sqn >= 8 && has_digit(t->sq, t->sqn) && has_letter(t->sq, t->sqn) && osa(t->sq, t->sqn, w->sq, w->sqn, 1) == 1) return 4;
    if (t->sqn >= 5 && !has_digit(t->sq, t->sqn)) {
        int max = t->sqn >= 9 ? 2 : 1, d = osa(t->sq, t->sqn, w->sq, w->sqn, max); /* max + 1: farther */
        if (d == 1) return 4;
        if (d == 2 && max == 2) return 3;
    }
    return 0;
}

static const char *STOP[] = {"the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "my", "that", "this", "is", "it", "with", "from", "by", "at", "me", "i"};
static int is_stop(const Word *t) { for (unsigned k = 0; k < sizeof STOP / sizeof *STOP; k++) if ((int)strlen(STOP[k]) == t->n && !memcmp(STOP[k], t->s, t->n)) return 1; return 0; }

API Finder *t_find_new(void) { return calloc(1, sizeof(Finder)); }
API void t_find_free(Finder *f) {
    if (!f) return;
    for (int i = 0; i < f->n; i++) { for (int j = 0; j < f->d[i].n; j++) word_free(&f->d[i].w[j]); free(f->d[i].w); }
    free(f->d); free(f);
}
/* a picture's words, one a line (replaces what it had) */
API void t_find_add(Finder *f, int pic, const char *data, int len) {
    Doc *d = NULL;
    for (int i = 0; i < f->n; i++) if (f->d[i].pic == pic) { d = &f->d[i]; for (int j = 0; j < d->n; j++) word_free(&d->w[j]); d->n = 0; break; }
    if (!d) {
        if (f->n == f->cap) { f->cap = f->cap ? f->cap * 2 : 64; f->d = realloc(f->d, sizeof(Doc) * f->cap); }
        d = &f->d[f->n++]; memset(d, 0, sizeof *d); d->pic = pic;
    }
    int i = 0;
    while (i < len) {
        int j = i; while (j < len && data[j] != '\n') j++;
        if (j > i) {
            if (d->n == d->cap) { d->cap = d->cap ? d->cap * 2 : 64; d->w = realloc(d->w, sizeof(Word) * d->cap); }
            word_init(&d->w[d->n++], data + i, j - i);
        }
        i = j + 1;
    }
}

typedef struct { int pic, m, n, s; int *w; int wn; } Hit;
static int hit_cmp(const void *a, const void *b) {
    const Hit *x = a, *y = b;
    int fx = x->m == x->n, fy = y->m == y->n;
    if (fx != fy) return fy - fx;
    if (x->m != y->m) return y->m - x->m;
    if (x->s != y->s) return y->s - x->s;
    return x->pic - y->pic;
}

/* the best way a document takes the tokens: per token its best word (and where), then the pairs next to each other */
static void match_doc(const Doc *d, Word *tok, int nt, Hit *h) {
    int *best = calloc(nt, sizeof(int)), *at = malloc(sizeof(int) * nt), *span = calloc(nt, sizeof(int));
    for (int k = 0; k < nt; k++) at[k] = -1;
    for (int k = 0; k < nt; k++) {
        for (int j = 0; j < d->n; j++) {
            int s = score_word(&tok[k], &d->w[j]);
            if (s > best[k]) { best[k] = s; at[k] = j; span[k] = 1; }
            if (best[k] >= 9) continue;
            /* several words in a row that make the token (a number read with its spaces) */
            if (tok[k].sqn >= 4 && j + 1 < d->n) {
                char buf[192], fb[192]; int bn = 0, fn = 0;
                for (int e = j; e < d->n && e < j + 4 && bn + d->w[e].sqn < (int)sizeof buf; e++) {
                    memcpy(buf + bn, d->w[e].sq, d->w[e].sqn); bn += d->w[e].sqn;
                    memcpy(fb + fn, d->w[e].fold, d->w[e].fn); fn += d->w[e].fn;
                    if (e > j && bn == tok[k].sqn && !memcmp(buf, tok[k].sq, bn) && 8 > best[k]) { best[k] = 8; at[k] = j; span[k] = e - j + 1; }
                    else if (e > j && fn == tok[k].fn && !memcmp(fb, tok[k].fold, fn) && 7 > best[k]) { best[k] = 7; at[k] = j; span[k] = e - j + 1; } /* with the OCR's slips */
                    if (bn >= tok[k].sqn) break;
                }
            }
        }
    }
    int m = 0, s = 0;
    for (int k = 0; k < nt; k++) if (best[k]) { m++; s += best[k]; }
    for (int k = 0; k + 1 < nt; k++) if (best[k] && best[k + 1] && at[k + 1] == at[k] + span[k]) s += 3;
    h->pic = d->pic; h->m = m; h->n = nt; h->s = s;
    int wn = 0; for (int k = 0; k < nt; k++) if (best[k]) wn += span[k];
    h->w = malloc(sizeof(int) * (wn + 1)); h->wn = 0;
    for (int k = 0; k < nt; k++) if (best[k]) for (int e = 0; e < span[k]; e++) h->w[h->wn++] = at[k] + e;
    free(best); free(at); free(span);
}

API int t_find_query(Finder *f, const char *q, int qn, char *out, int cap) {
    /* the query's tokens: split at white space, signs at the ends left out (as the page does to the words) */
    Word tok[24]; int nt = 0;
    for (int i = 0; i < qn && nt < 24; ) {
        while (i < qn && (q[i] == ' ' || q[i] == '\t' || q[i] == '\n')) i++;
        int j = i; while (j < qn && q[j] != ' ' && q[j] != '\t' && q[j] != '\n') j++;
        int a = i, b = j;
        while (a < b && !is_alnum((unsigned char)q[a])) a++;
        while (b > a && !is_alnum((unsigned char)q[b - 1])) b--;
        if (b > a) word_init(&tok[nt++], q + a, b - a);
        i = j;
    }
    /* small words left out, unless nothing else is left */
    int keep = 0; for (int k = 0; k < nt; k++) if (!is_stop(&tok[k])) keep++;
    if (keep && keep < nt) { int k2 = 0; for (int k = 0; k < nt; k++) { if (is_stop(&tok[k])) word_free(&tok[k]); else tok[k2++] = tok[k]; } nt = k2; }
    /* the whole query written together ("wi fi" → "wifi") */
    Word joined; int has_joined = 0;
    if (nt > 1) {
        char buf[256]; int bn = 0;
        for (int k = 0; k < nt && bn + tok[k].sqn < (int)sizeof buf; k++) { memcpy(buf + bn, tok[k].sq, tok[k].sqn); bn += tok[k].sqn; }
        if (bn >= 4) { word_init(&joined, buf, bn); has_joined = 1; }
    }
    Hit *hits = malloc(sizeof(Hit) * (f->n + 1)); int nh = 0;
    for (int i = 0; i < f->n && nt; i++) {
        Hit h; match_doc(&f->d[i], tok, nt, &h);
        if (has_joined) {
            Hit hj; match_doc(&f->d[i], &joined, 1, &hj);
            if (hj.m && (h.m < nt || hj.s * nt > h.s)) { free(h.w); h = hj; h.m = nt; h.n = nt; h.s = hj.s * nt; }
            else free(hj.w);
        }
        if (h.m * 2 >= nt && h.m) hits[nh++] = h; else free(h.w);
    }
    qsort(hits, nh, sizeof(Hit), hit_cmp);
    /* JSON */
    int k = 0;
    #define PUT(...) do { int r = snprintf(cap > k ? out + k : NULL, cap > k ? (size_t)(cap - k) : 0, __VA_ARGS__); k += r; } while (0)
    PUT("[");
    for (int i = 0; i < nh; i++) {
        PUT("%s{\"p\":%d,\"m\":%d,\"n\":%d,\"s\":%d,\"w\":[", i ? "," : "", hits[i].pic, hits[i].m, hits[i].n, hits[i].s);
        for (int j = 0; j < hits[i].wn; j++) PUT("%s%d", j ? "," : "", hits[i].w[j]);
        PUT("]}");
        free(hits[i].w);
    }
    PUT("]");
    #undef PUT
    free(hits);
    for (int t = 0; t < nt; t++) word_free(&tok[t]);
    if (has_joined) word_free(&joined);
    return k;
}
