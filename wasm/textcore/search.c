/*
 * Tool search ranking (own code; ported from the former src/search.ts). Input strings are already normalised by the
 * browser (lower-case, NFKD accents removed, only [a-z0-9+#.%/ -]), so everything here is ASCII.
 *   t_search_build(data, n)        index records "id\ttitle\tkw1|kw2|…\tdesc\n" → handle
 *   t_search_query(h, q, n, out, max) ranked record numbers → count
 *   t_search_free(h)
 * Scoring: whole-phrase matches (title/keyword exact, prefix, substring) + per-word scores (id, title word, keyword,
 * keyword word, prefix, substring, stem, Damerau-Levenshtein typo tolerance, description). Every meaningful word
 * must match unless the whole phrase matched.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define API __attribute__((visibility("default")))

typedef struct { const char *s; int n; } Str;
typedef struct { Str *v; int n, cap; } Vec;
typedef struct { Str id, title, desc; Vec title_w, kws, kw_w, stems; } Rec;
typedef struct { char *buf, *arena; Rec *r; int n; } Index;

static void vpush(Vec *v, Str s) { if (v->n == v->cap) { v->cap = v->cap ? v->cap * 2 : 8; v->v = realloc(v->v, sizeof(Str) * v->cap); } v->v[v->n++] = s; }
static int seq(Str a, Str b) { return a.n == b.n && !memcmp(a.s, b.s, a.n); }
static int starts(Str a, Str p) { return a.n >= p.n && !memcmp(a.s, p.s, p.n); }
static int contains(Str a, Str p) {
    if (p.n == 0) return 1;
    for (int i = 0; i + p.n <= a.n; i++) if (!memcmp(a.s + i, p.s, p.n)) return 1;
    return 0;
}
static int vhas(const Vec *v, Str s) { for (int i = 0; i < v->n; i++) if (seq(v->v[i], s)) return 1; return 0; }
static int is_sep(char c) { return c == ' ' || c == '\t' || c == '/' || c == '-'; }
/* split on [\s/-]+ */
static void split_words(Str s, Vec *out, int unique) {
    int i = 0;
    while (i < s.n) {
        while (i < s.n && is_sep(s.s[i])) i++;
        int j = i;
        while (j < s.n && !is_sep(s.s[j])) j++;
        if (j > i) { Str w = {s.s + i, j - i}; if (!unique || !vhas(out, w)) vpush(out, w); }
        i = j;
    }
}

/* stem: if len > 4, strip the longest suffix of (ations?|ings?|ors?|ers?|ed|es|s|al|ion|ment), then one trailing 'e'.
   Writes into dst (≥ n bytes), returns new length. Matches the JS regex semantics (leftmost match = longest suffix). */
static const char *SUF[] = {"ations", "ation", "ings", "ing", "ors", "or", "ers", "er", "ed", "es", "s", "al", "ion", "ment"};
static int stem(const char *w, int n, char *dst) {
    memcpy(dst, w, n);
    if (n <= 4) return n;
    int best = 0;
    for (unsigned k = 0; k < sizeof SUF / sizeof *SUF; k++) {
        int l = (int)strlen(SUF[k]);
        if (l <= n && l > best && !memcmp(w + n - l, SUF[k], l)) best = l;
    }
    n -= best;
    if (n > 0 && dst[n - 1] == 'e') n--;
    return n;
}

static const char *STOP[] = {"to", "from", "on", "of", "a", "an", "the", "for", "my", "in", "into", "with", "and", "or", "how", "i", "me", "want",
                             "make", "do", "online", "free", "tool", "app", "is", "it", "what", "which", "can", "should", "by"};
static int is_stop(Str w) { for (unsigned k = 0; k < sizeof STOP / sizeof *STOP; k++) if ((int)strlen(STOP[k]) == w.n && !memcmp(STOP[k], w.s, w.n)) return 1; return 0; }

/* Optimal-string-alignment (Damerau-Levenshtein) distance with early exit once every cell exceeds max. */
static int dist(Str a, Str b, int max) {
    int m = a.n, n = b.n;
    if (abs(m - n) > max) return max + 1;
    if (n > 63 || m > 63) return max + 1;
    int p2[64], p[64], c[64];
    for (int j = 0; j <= n; j++) p[j] = j;
    for (int i = 1; i <= m; i++) {
        c[0] = i;
        int best = i;
        for (int j = 1; j <= n; j++) {
            int cost = a.s[i - 1] == b.s[j - 1] ? 0 : 1;
            int v = p[j] + 1;
            if (c[j - 1] + 1 < v) v = c[j - 1] + 1;
            if (p[j - 1] + cost < v) v = p[j - 1] + cost;
            if (i > 1 && j > 1 && a.s[i - 1] == b.s[j - 2] && a.s[i - 2] == b.s[j - 1] && p2[j - 2] + 1 < v) v = p2[j - 2] + 1;
            c[j] = v;
            if (v < best) best = v;
        }
        if (best > max) return max + 1;
        memcpy(p2, p, sizeof(int) * (n + 1));
        memcpy(p, c, sizeof(int) * (n + 1));
    }
    return p[n];
}

API Index *t_search_build(const char *data, int len) {
    Index *ix = calloc(1, sizeof(Index));
    ix->buf = malloc(len + 1);
    memcpy(ix->buf, data, len);
    ix->buf[len] = 0;
    int cap = 0;
    char *s = ix->buf, *end = ix->buf + len;
    while (s < end) {
        char *nl = memchr(s, '\n', end - s);
        if (!nl) nl = end;
        Str f[4] = {{0, 0}, {0, 0}, {0, 0}, {0, 0}};
        char *q = s;
        for (int k = 0; k < 4; k++) {
            char *t = k < 3 ? memchr(q, '\t', nl - q) : 0;
            if (!t) t = nl;
            f[k].s = q; f[k].n = (int)(t - q);
            q = t < nl ? t + 1 : nl;
        }
        if (ix->n == cap) { cap = cap ? cap * 2 : 64; ix->r = realloc(ix->r, sizeof(Rec) * cap); }
        Rec *r = &ix->r[ix->n++];
        memset(r, 0, sizeof *r);
        r->id = f[0]; r->title = f[1]; r->desc = f[3];
        split_words(r->title, &r->title_w, 0);
        /* keywords separated by '|' */
        int i = 0;
        while (i <= f[2].n) {
            int j = i;
            while (j < f[2].n && f[2].s[j] != '|') j++;
            if (j > i) vpush(&r->kws, (Str){f[2].s + i, j - i});
            i = j + 1;
        }
        for (int k = 0; k < r->kws.n; k++) split_words(r->kws.v[k], &r->kw_w, 1);
        s = nl + 1;
    }
    /* stems live in a second arena so record strings stay pointing into buf */
    size_t total = 0;
    for (int k = 0; k < ix->n; k++) for (int w = 0; w < ix->r[k].title_w.n + ix->r[k].kw_w.n; w++) total += 64;
    char *arena = malloc(total + 1), *a = arena;
    for (int k = 0; k < ix->n; k++) {
        Rec *r = &ix->r[k];
        for (int w = 0; w < r->title_w.n + r->kw_w.n; w++) {
            Str src = w < r->title_w.n ? r->title_w.v[w] : r->kw_w.v[w - r->title_w.n];
            if (src.n > 63) continue;
            int n = stem(src.s, src.n, a);
            Str st = {a, n};
            if (!vhas(&r->stems, st)) { vpush(&r->stems, st); a += 64; }
        }
    }
    ix->arena = arena;
    return ix;
}

API void t_search_free(Index *ix) {
    if (!ix) return;
    for (int k = 0; k < ix->n; k++) { free(ix->r[k].title_w.v); free(ix->r[k].kws.v); free(ix->r[k].kw_w.v); free(ix->r[k].stems.v); }
    free(ix->arena); free(ix->r); free(ix->buf); free(ix);
}

static int word_score(Str w, const Rec *x) {
    int s = 0;
    if (seq(x->id, w)) s = 90;
    for (int i = 0; i < x->title_w.n; i++) {
        if (seq(x->title_w.v[i], w)) { if (s < 75) s = 75; }
        else if (starts(x->title_w.v[i], w)) { if (s < 60) s = 60; }
    }
    for (int i = 0; i < x->kws.n; i++) {
        if (seq(x->kws.v[i], w)) { if (s < 70) s = 70; }
        else if (starts(x->kws.v[i], w)) { if (s < 45) s = 45; }
    }
    for (int i = 0; i < x->kw_w.n; i++) {
        if (seq(x->kw_w.v[i], w)) { if (s < 55) s = 55; }
        else if (starts(x->kw_w.v[i], w)) { if (s < 35) s = 35; }
        else if (w.n >= 4 && contains(x->kw_w.v[i], w)) { if (s < 20) s = 20; }
    }
    if (s) return s;
    if (w.n > 4 && w.n <= 63) {
        char b[64];
        Str st = {b, stem(w.s, w.n, b)};
        if (vhas(&x->stems, st)) return 50;
    }
    if (w.n >= 4) {
        int max = w.n >= 8 ? 2 : 1;
        for (int i = 0; i < x->title_w.n; i++) if (x->title_w.v[i].n >= 3 && dist(w, x->title_w.v[i], max) <= max) return 40;
        for (int i = 0; i < x->kw_w.n; i++) if (x->kw_w.v[i].n >= 3 && dist(w, x->kw_w.v[i], max) <= max) return vhas(&x->title_w, x->kw_w.v[i]) ? 40 : 28;
    }
    if (w.n >= 3 && contains(x->desc, w)) return 12;
    return 0;
}

typedef struct { int score, order; } Hit;
static int cmp_hit(const void *a, const void *b) {
    const Hit *x = a, *y = b;
    return x->score != y->score ? y->score - x->score : x->order - y->order;
}

API int t_search_query(Index *ix, const char *q, int qn, int32_t *out, int max) {
    if (!ix || qn <= 0) return 0;
    Str Q = {q, qn};
    Vec all = {0}, ws = {0};
    split_words(Q, &all, 0);
    for (int i = 0; i < all.n; i++) if (!is_stop(all.v[i])) vpush(&ws, all.v[i]);
    if (!ws.n) for (int i = 0; i < all.n; i++) vpush(&ws, all.v[i]);
    Hit *hits = malloc(sizeof(Hit) * (ix->n ? ix->n : 1));
    int nh = 0;
    for (int k = 0; k < ix->n; k++) {
        const Rec *x = &ix->r[k];
        int phrase = 0;
        if (seq(x->title, Q)) phrase = 220;
        else if (vhas(&x->kws, Q)) phrase = 170;
        else if (starts(x->title, Q)) phrase = 130;
        else {
            if (qn >= 4) for (int i = 0; i < x->kws.n && !phrase; i++) if (starts(x->kws.v[i], Q)) phrase = 110;
            if (!phrase && qn >= 5) {
                if (contains(x->title, Q)) phrase = 90;
                else for (int i = 0; i < x->kws.n && !phrase; i++) if (contains(x->kws.v[i], Q)) phrase = 90;
            }
        }
        int total = phrase, ok = 1;
        for (int i = 0; i < ws.n; i++) {
            int sc = word_score(ws.v[i], x);
            if (!sc) { ok = 0; break; }
            total += sc;
        }
        if (ok || phrase) { hits[nh].score = total; hits[nh].order = k; nh++; }
    }
    qsort(hits, nh, sizeof(Hit), cmp_hit);
    int n = nh < max ? nh : max;
    for (int i = 0; i < n; i++) out[i] = hits[i].order;
    free(hits); free(all.v); free(ws.v);
    return n;
}
