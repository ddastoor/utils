/* Rare-word ranking for the Photo Dictionary (own C, part of textcore.wasm).
 *
 * t_freq_load  loads the English frequency table (public/data/dict/freq.txt: lines "<zipf×10> word word …", from
 *              wordfreq) into an open-addressing hash table.
 * t_freq_get   Zipf×10 of a lower-case word, or -1.
 * t_rare       tokenises OCR text and returns the candidate "hard" words as JSON, rarest first:
 *                [{"w":"geese","b":"","z":31,"n":2,"c":0}, …]
 *              w = lower-case word as written (possessive and line-break hyphen removed), b = base form found by the
 *              lemmatiser when w itself is not in the table ("" otherwise), z = Zipf×10 (−1 = unknown to wordfreq,
 *              counted as rarest), n = occurrences, c = 1 when it looks like a name (always capitalised and capitalised
 *              at least once in mid-sentence). Words with z ≥ max_z, stop words, single letters and tokens mixed with
 *              digits are dropped.
 * Text is UTF-8. Letters: ASCII and Latin-1/Latin Extended-A; ’ inside a word is an apostrophe. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define API __attribute__((visibility("default")))

/* ------------------------------------------------------------------ frequency table */
static char *ftext;            /* copy of freq.txt with separators turned into NULs */
static uint32_t *fslot;        /* hash slots: offset into ftext + 1 (0 = empty) */
static uint8_t *fz;            /* Zipf×10 per slot */
static uint32_t fcap;

static uint32_t fnv1a(const char *s, int n) { uint32_t h = 2166136261u; for (int i = 0; i < n; i++) { h ^= (uint8_t)s[i]; h *= 16777619u; } return h; }

API int t_freq_load(const char *txt, int len) {
    free(ftext); free(fslot); free(fz); ftext = 0; fslot = 0; fz = 0; fcap = 0;
    int words = 0;
    for (int i = 0; i < len; i++) if (txt[i] == ' ') words++;
    fcap = 1; while (fcap < (uint32_t)words * 2 + 16) fcap <<= 1;
    ftext = malloc(len + 1); fslot = calloc(fcap, 4); fz = calloc(fcap, 1);
    if (!ftext || !fslot || !fz) return -1;
    memcpy(ftext, txt, len); ftext[len] = 0;
    int i = 0, count = 0;
    while (i < len) {
        int z = 0;
        while (i < len && ftext[i] >= '0' && ftext[i] <= '9') z = z * 10 + (ftext[i++] - '0');
        while (i < len && ftext[i] != '\n') {
            if (ftext[i] == ' ') { ftext[i++] = 0; continue; }
            int s = i; while (i < len && ftext[i] != ' ' && ftext[i] != '\n') i++;
            int n = i - s;
            uint32_t h = fnv1a(ftext + s, n) & (fcap - 1);
            for (;;) {
                if (!fslot[h]) { fslot[h] = s + 1; fz[h] = (uint8_t)(z > 255 ? 255 : z); count++; break; }
                const char *o = ftext + fslot[h] - 1;
                if ((int)strlen(o) == n && !memcmp(o, ftext + s, n)) break; /* keep the first (most frequent) */
                h = (h + 1) & (fcap - 1);
            }
        }
        if (i < len) ftext[i++] = 0;
    }
    return count;
}

static int fget(const char *w, int n) {
    if (!fcap || n <= 0) return -1;
    uint32_t h = fnv1a(w, n) & (fcap - 1);
    while (fslot[h]) {
        const char *o = ftext + fslot[h] - 1;
        if (!memcmp(o, w, n) && o[n] == 0) return fz[h];
        h = (h + 1) & (fcap - 1);
    }
    return -1;
}
API int t_freq_get(const char *w, int n) { return fget(w, n); }

/* ------------------------------------------------------------------ UTF-8 letters and case */
static int dec(const uint8_t *s, int n, int *len) {
    if (s[0] < 0x80) { *len = 1; return s[0]; }
    if ((s[0] & 0xe0) == 0xc0 && n >= 2) { *len = 2; return ((s[0] & 0x1f) << 6) | (s[1] & 0x3f); }
    if ((s[0] & 0xf0) == 0xe0 && n >= 3) { *len = 3; return ((s[0] & 0x0f) << 12) | ((s[1] & 0x3f) << 6) | (s[2] & 0x3f); }
    if ((s[0] & 0xf8) == 0xf0 && n >= 4) { *len = 4; return ((s[0] & 0x07) << 18) | ((s[1] & 0x3f) << 12) | ((s[2] & 0x3f) << 6) | (s[3] & 0x3f); }
    *len = 1; return 0xfffd;
}
static int enc(int c, char *o) {
    if (c < 0x80) { o[0] = (char)c; return 1; }
    if (c < 0x800) { o[0] = (char)(0xc0 | (c >> 6)); o[1] = (char)(0x80 | (c & 0x3f)); return 2; }
    o[0] = (char)(0xe0 | (c >> 12)); o[1] = (char)(0x80 | ((c >> 6) & 0x3f)); o[2] = (char)(0x80 | (c & 0x3f)); return 3;
}
static int is_letter(int c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= 0xc0 && c <= 0x24f && c != 0xd7 && c != 0xf7); }
static int is_upper(int c) { return (c >= 'A' && c <= 'Z') || (c >= 0xc0 && c <= 0xde && c != 0xd7) || (c >= 0x100 && c <= 0x17f && !(c & 1)); }
static int lower(int c) {
    if (c >= 'A' && c <= 'Z') return c + 32;
    if (c >= 0xc0 && c <= 0xde && c != 0xd7) return c + 32;
    if (c >= 0x100 && c <= 0x17f && !(c & 1) && c != 0x130 && c != 0x138) return c + 1;
    return c;
}
static int is_digit(int c) { return c >= '0' && c <= '9'; }
static int is_apos(int c) { return c == '\'' || c == 0x2019 || c == 0x2bc; }
static int is_hyph(int c) { return c == '-' || c == 0x2010 || c == 0xad; }

/* ------------------------------------------------------------------ stop words (never shown even if rare in wordfreq) */
static const char *STOP[] = { "a", "an", "the", "and", "or", "but", "nor", "if", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as",
    "is", "are", "was", "were", "be", "been", "being", "am", "it", "its", "this", "that", "these", "those", "i", "me", "my", "we", "us", "our",
    "you", "your", "he", "him", "his", "she", "her", "they", "them", "their", "not", "no", "so", "do", "does", "did", "have", "has", "had",
    "will", "would", "shall", "should", "can", "could", "may", "might", "must", "there", "here", "then", "than", "which", "who", "whom",
    "what", "when", "where", "why", "how", "all", "any", "some", "into", "onto", "upon", "about", "over", "under", "up", "down", "out",
    "off", "again", "very", "just", "also", "too", "yet", "s", "t", "d", "ll", "re", "ve", "m", "o", 0 };
static int stopword(const char *w, int n) { for (int i = 0; STOP[i]; i++) if ((int)strlen(STOP[i]) == n && !memcmp(STOP[i], w, n)) return 1; return 0; }

/* ------------------------------------------------------------------ lemmatiser (regular inflections only; irregular
   forms like "geese" are in wordfreq and Wiktionary maps them to their lemma) */
static int vowel(char c) { return c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u'; }
static int ends(const char *w, int n, const char *suf) { int k = (int)strlen(suf); return n > k + 1 && !memcmp(w + n - k, suf, k); }
static int try_base(const char *w, int n, int cut, const char *add, char *out) {
    int m = n - cut, k = (int)strlen(add);
    if (m < 2 || m + k > 62) return 0;
    memcpy(out, w, m); memcpy(out + m, add, k); out[m + k] = 0;
    return fget(out, m + k) >= 0 ? m + k : 0;
}
/* Writes the first known base form of w into out; returns its length or 0. */
static int lemma_d(const char *w, int n, char *out, int depth);
static int lemma(const char *w, int n, char *out) { return lemma_d(w, n, out, 0); }
static int lemma_d(const char *w, int n, char *out, int depth) {
    int r;
    #define T(cut, add) if ((r = try_base(w, n, cut, add, out))) return r
    if (ends(w, n, "ies")) { T(3, "y"); }
    if (ends(w, n, "ied")) { T(3, "y"); }
    if (ends(w, n, "iest")) { T(4, "y"); }
    if (ends(w, n, "ier")) { T(3, "y"); }
    if (ends(w, n, "ily")) { T(3, "y"); }
    if (ends(w, n, "ally")) { T(4, "al"); T(4, ""); }
    if (ends(w, n, "ly")) { T(2, ""); T(1, "e"); }
    if (ends(w, n, "es")) { T(2, ""); T(1, ""); }
    if (ends(w, n, "s") && !ends(w, n, "ss") && !ends(w, n, "us") && !ends(w, n, "is")) { T(1, ""); if (!depth && (r = lemma_d(w, n - 1, out, 1))) return r; } /* glimmerings → glimmering → glimmer */
    if (ends(w, n, "ing")) { if (n > 5 && w[n - 4] == w[n - 5] && !vowel(w[n - 4])) { T(4, ""); } T(3, ""); T(3, "e"); }
    if (ends(w, n, "ed")) { if (n > 4 && w[n - 3] == w[n - 4] && !vowel(w[n - 3])) { T(3, ""); } T(2, ""); T(1, ""); }
    if (ends(w, n, "est")) { if (n > 5 && w[n - 4] == w[n - 5]) { T(4, ""); } T(3, ""); T(2, ""); }
    if (ends(w, n, "er")) { if (n > 4 && w[n - 3] == w[n - 4]) { T(3, ""); } T(2, ""); T(1, ""); }
    #undef T
    return 0;
}

/* ------------------------------------------------------------------ candidates */
typedef struct { char w[64]; char b[64]; int wl, bl, z, n, first, caps, midcap; } Cand;
static Cand *cands; static int ncand, capc;

static void add(const char *w, int wl, int capital, int mid) {
    if (wl < 3 || wl > 62) return; /* no hard word has fewer than 3 letters; 2-letter tokens are mostly OCR noise */
    for (int i = 0; i < ncand; i++) if (cands[i].wl == wl && !memcmp(cands[i].w, w, wl)) {
        cands[i].n++; cands[i].caps &= capital; cands[i].midcap |= capital && mid; return;
    }
    if (ncand == capc) { capc = capc ? capc * 2 : 256; cands = realloc(cands, sizeof(Cand) * capc); }
    Cand *c = &cands[ncand]; memset(c, 0, sizeof *c);
    memcpy(c->w, w, wl); c->wl = wl; c->n = 1; c->first = ncand; c->caps = capital; c->midcap = capital && mid;
    c->z = fget(w, wl);
    if (c->z < 0) { c->bl = lemma(w, wl, c->b); if (c->bl) c->z = fget(c->b, c->bl); }
    ncand++;
}
/* Adds a token; a hyphenated token unknown to wordfreq also adds its parts ("self-aggrandizing" → "aggrandizing"). */
static void add_token(const char *w, int wl, int capital, int mid) {
    int hy = 0; for (int i = 0; i < wl; i++) if (w[i] == '-') hy = 1;
    if (!hy || fget(w, wl) >= 0) { add(w, wl, capital, mid); return; }
    int s = 0;
    for (int i = 0; i <= wl; i++) if (i == wl || w[i] == '-') { if (i > s) add(w + s, i - s, capital && s == 0, mid); s = i + 1; }
}
static int cmp_cand(const void *a, const void *b) {
    const Cand *x = a, *y = b;
    if (x->z != y->z) return x->z - y->z;
    if (x->n != y->n) return y->n - x->n;
    return x->first - y->first;
}

API int t_rare(const char *text, int len, int max_z, char *out, int cap) {
    ncand = 0;
    const uint8_t *s = (const uint8_t *)text;
    char w[256]; int wl = 0, capital = 0, junk = 0, sentence = 1, mid = 0;
    int i = 0;
    while (i <= len) {
        int cl = 1, c = i < len ? dec(s + i, len - i, &cl) : 0;
        if (i < len && is_letter(c)) {
            if (wl == 0) { capital = is_upper(c); mid = !sentence; }
            if (wl < 200) wl += enc(lower(c), w + wl);
            i += cl; continue;
        }
        if (i < len && is_digit(c)) { junk = 1; i += cl; sentence = 0; continue; }
        /* apostrophe or hyphen between letters stays in the word; hyphen + line break joins a split word */
        if (wl && i < len && (is_apos(c) || is_hyph(c))) {
            int j = i + cl, nl = 0, l2;
            if (is_hyph(c)) {
                /* "lugu- :\n. brious": at a line end, skip spaces and up to 4 stray marks (OCR noise from the page edge)
                   on both sides of the line break */
                int k = j, junkc = 0;
                while (k < len && s[k] != '\n' && junkc <= 4) { int cc = dec(s + k, len - k, &l2); if (is_letter(cc) || is_digit(cc)) break; if (s[k] != ' ' && s[k] != '\r') junkc++; k += l2; }
                if (k < len && s[k] == '\n' && junkc <= 4) {
                    nl = 1; k++; junkc = 0;
                    while (k < len && junkc <= 3) { int cc = dec(s + k, len - k, &l2); if (is_letter(cc)) break; if (is_digit(cc) || cc == '\n') { junkc = 99; break; } if (s[k] != ' ') junkc++; k += l2; }
                    if (junkc <= 3) j = k; else nl = 0;
                }
            }
            if (j < len && is_letter(dec(s + j, len - j, &l2))) {
                if (is_apos(c)) { w[wl++] = '\''; i = j; continue; }
                if (nl) {
                    /* "exam-\nple": join when the joined word is known, else keep the hyphen */
                    int k = j, wl2 = wl; char tmp[256]; memcpy(tmp, w, wl);
                    while (k < len) { int cc = dec(s + k, len - k, &l2); if (!is_letter(cc)) break; if (wl2 < 200) wl2 += enc(lower(cc), tmp + wl2); k += l2; }
                    /* join when a half is not a word ("magnani-mous") or the joined word is common ("re-turn"); keep
                       compounds of two words ("well-known": "wellknown" is only a rare misspelling) */
                    int zj = fget(tmp, wl2), za = fget(w, wl), zb = fget(tmp + wl, wl2 - wl);
                    if (zj >= 0 && (za < 0 || zb < 0 || zj >= 30 || zj >= (za < zb ? za : zb))) { memcpy(w, tmp, wl2); wl = wl2; i = k; continue; }
                }
                w[wl++] = '-'; i = j; continue;
            }
        }
        if (wl) {
            /* possessives: dog's → dog, dogs' → dogs */
            if (wl > 2 && w[wl - 2] == '\'' && w[wl - 1] == 's') wl -= 2;
            while (wl && (w[wl - 1] == '\'' || w[wl - 1] == '-')) wl--;
            if (!junk && wl >= 2 && !stopword(w, wl)) add_token(w, wl, capital, mid);
            wl = 0; sentence = 0;
        }
        junk = 0;
        if (i < len && (c == '.' || c == '!' || c == '?' || c == 0x2026)) sentence = 1;
        i += cl;
    }
    /* keep candidates under the threshold (unknown words are rarest) and sort */
    int k = 0;
    for (int j = 0; j < ncand; j++) if (cands[j].z < max_z) cands[k++] = cands[j];
    qsort(cands, k, sizeof(Cand), cmp_cand);
    int p = 0;
    #define PUT(str, n) do { if (p + (n) < cap) memcpy(out + p, str, n); p += (n); } while (0)
    PUT("[", 1);
    char num[48];
    for (int j = 0; j < k; j++) {
        Cand *c = &cands[j];
        if (j) PUT(",", 1);
        PUT("{\"w\":\"", 6); PUT(c->w, c->wl); PUT("\",\"b\":\"", 7); PUT(c->b, c->bl);
        int nl = 0, v; char t[16]; int tl;
        #define NUM(label, val) do { v = (val); tl = 0; int neg = v < 0; if (neg) v = -v; do { t[tl++] = (char)('0' + v % 10); v /= 10; } while (v); \
            nl = 0; for (const char *q = label; *q; q++) num[nl++] = *q; if (neg) num[nl++] = '-'; while (tl) num[nl++] = t[--tl]; PUT(num, nl); } while (0)
        NUM("\",\"z\":", c->z); NUM(",\"n\":", c->n); NUM(",\"c\":", c->caps && c->midcap ? 1 : 0);
        PUT("}", 1);
        #undef NUM
    }
    PUT("]", 1);
    #undef PUT
    if (p < cap) out[p] = 0;
    return p;
}
