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
/* Small letter of every code point U+00C0–U+024F (itself when it is not a capital): generated from Python's
   str.lower() (Unicode 15.1.0) — the ranges this file had before lowered ł to ń, ń to ņ, ź to ż and left Latin
   Extended-B alone. U+0130 İ lowers to i. */
static const uint16_t LOW[0x190] = {
    0x0e0, 0x0e1, 0x0e2, 0x0e3, 0x0e4, 0x0e5, 0x0e6, 0x0e7, 0x0e8, 0x0e9, 0x0ea, 0x0eb,
    0x0ec, 0x0ed, 0x0ee, 0x0ef, 0x0f0, 0x0f1, 0x0f2, 0x0f3, 0x0f4, 0x0f5, 0x0f6, 0x0d7,
    0x0f8, 0x0f9, 0x0fa, 0x0fb, 0x0fc, 0x0fd, 0x0fe, 0x0df, 0x0e0, 0x0e1, 0x0e2, 0x0e3,
    0x0e4, 0x0e5, 0x0e6, 0x0e7, 0x0e8, 0x0e9, 0x0ea, 0x0eb, 0x0ec, 0x0ed, 0x0ee, 0x0ef,
    0x0f0, 0x0f1, 0x0f2, 0x0f3, 0x0f4, 0x0f5, 0x0f6, 0x0f7, 0x0f8, 0x0f9, 0x0fa, 0x0fb,
    0x0fc, 0x0fd, 0x0fe, 0x0ff, 0x101, 0x101, 0x103, 0x103, 0x105, 0x105, 0x107, 0x107,
    0x109, 0x109, 0x10b, 0x10b, 0x10d, 0x10d, 0x10f, 0x10f, 0x111, 0x111, 0x113, 0x113,
    0x115, 0x115, 0x117, 0x117, 0x119, 0x119, 0x11b, 0x11b, 0x11d, 0x11d, 0x11f, 0x11f,
    0x121, 0x121, 0x123, 0x123, 0x125, 0x125, 0x127, 0x127, 0x129, 0x129, 0x12b, 0x12b,
    0x12d, 0x12d, 0x12f, 0x12f, 0x069, 0x131, 0x133, 0x133, 0x135, 0x135, 0x137, 0x137,
    0x138, 0x13a, 0x13a, 0x13c, 0x13c, 0x13e, 0x13e, 0x140, 0x140, 0x142, 0x142, 0x144,
    0x144, 0x146, 0x146, 0x148, 0x148, 0x149, 0x14b, 0x14b, 0x14d, 0x14d, 0x14f, 0x14f,
    0x151, 0x151, 0x153, 0x153, 0x155, 0x155, 0x157, 0x157, 0x159, 0x159, 0x15b, 0x15b,
    0x15d, 0x15d, 0x15f, 0x15f, 0x161, 0x161, 0x163, 0x163, 0x165, 0x165, 0x167, 0x167,
    0x169, 0x169, 0x16b, 0x16b, 0x16d, 0x16d, 0x16f, 0x16f, 0x171, 0x171, 0x173, 0x173,
    0x175, 0x175, 0x177, 0x177, 0x0ff, 0x17a, 0x17a, 0x17c, 0x17c, 0x17e, 0x17e, 0x17f,
    0x180, 0x253, 0x183, 0x183, 0x185, 0x185, 0x254, 0x188, 0x188, 0x256, 0x257, 0x18c,
    0x18c, 0x18d, 0x1dd, 0x259, 0x25b, 0x192, 0x192, 0x260, 0x263, 0x195, 0x269, 0x268,
    0x199, 0x199, 0x19a, 0x19b, 0x26f, 0x272, 0x19e, 0x275, 0x1a1, 0x1a1, 0x1a3, 0x1a3,
    0x1a5, 0x1a5, 0x280, 0x1a8, 0x1a8, 0x283, 0x1aa, 0x1ab, 0x1ad, 0x1ad, 0x288, 0x1b0,
    0x1b0, 0x28a, 0x28b, 0x1b4, 0x1b4, 0x1b6, 0x1b6, 0x292, 0x1b9, 0x1b9, 0x1ba, 0x1bb,
    0x1bd, 0x1bd, 0x1be, 0x1bf, 0x1c0, 0x1c1, 0x1c2, 0x1c3, 0x1c6, 0x1c6, 0x1c6, 0x1c9,
    0x1c9, 0x1c9, 0x1cc, 0x1cc, 0x1cc, 0x1ce, 0x1ce, 0x1d0, 0x1d0, 0x1d2, 0x1d2, 0x1d4,
    0x1d4, 0x1d6, 0x1d6, 0x1d8, 0x1d8, 0x1da, 0x1da, 0x1dc, 0x1dc, 0x1dd, 0x1df, 0x1df,
    0x1e1, 0x1e1, 0x1e3, 0x1e3, 0x1e5, 0x1e5, 0x1e7, 0x1e7, 0x1e9, 0x1e9, 0x1eb, 0x1eb,
    0x1ed, 0x1ed, 0x1ef, 0x1ef, 0x1f0, 0x1f3, 0x1f3, 0x1f3, 0x1f5, 0x1f5, 0x195, 0x1bf,
    0x1f9, 0x1f9, 0x1fb, 0x1fb, 0x1fd, 0x1fd, 0x1ff, 0x1ff, 0x201, 0x201, 0x203, 0x203,
    0x205, 0x205, 0x207, 0x207, 0x209, 0x209, 0x20b, 0x20b, 0x20d, 0x20d, 0x20f, 0x20f,
    0x211, 0x211, 0x213, 0x213, 0x215, 0x215, 0x217, 0x217, 0x219, 0x219, 0x21b, 0x21b,
    0x21d, 0x21d, 0x21f, 0x21f, 0x19e, 0x221, 0x223, 0x223, 0x225, 0x225, 0x227, 0x227,
    0x229, 0x229, 0x22b, 0x22b, 0x22d, 0x22d, 0x22f, 0x22f, 0x231, 0x231, 0x233, 0x233,
    0x234, 0x235, 0x236, 0x237, 0x238, 0x239, 0x2c65, 0x23c, 0x23c, 0x19a, 0x2c66, 0x23f,
    0x240, 0x242, 0x242, 0x180, 0x289, 0x28c, 0x247, 0x247, 0x249, 0x249, 0x24b, 0x24b,
    0x24d, 0x24d, 0x24f, 0x24f,
};
static int lower(int c) {
    if (c >= 'A' && c <= 'Z') return c + 32;
    if (c >= 0xc0 && c < 0x250) return LOW[c - 0xc0];
    return c;
}
static int is_upper(int c) { return lower(c) != c; }
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
/* a full stop after these is not the end of a sentence: "Mr. Darcy" — the name after it is in mid-sentence */
static const char *TITLE[] = { "mr", "mrs", "ms", "mx", "dr", "prof", "rev", "fr", "st", "mt", "jr", "sr", "gen", "col", "capt", "lt", "sgt",
    "maj", "adm", "gov", "sen", "hon", "messrs", "mme", "mlle", 0 };
static int title(const char *w, int n) { for (int i = 0; TITLE[i]; i++) if ((int)strlen(TITLE[i]) == n && !memcmp(TITLE[i], w, n)) return 1; return 0; }
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

/* ------------------------------------------------------------------ words broken over two lines */
/* The joining rule (a = the first half, b = the second, both lower case, j = the two together): join when the joined
   word is known and a half is not a word ("magnani-mous"), or the joined word is common ("re-turn"), or at least as
   common as the rarer half; keep compounds of two words ("well-known": "wellknown" is only a rare misspelling). */
static int join_ok(const char *j, int jl, const char *a, int al, const char *b, int bl) {
    int zj = fget(j, jl), za = fget(a, al), zb = fget(b, bl);
    return zj >= 0 && (za < 0 || zb < 0 || zj >= 30 || zj >= (za < zb ? za : zb));
}
/* the marks a line can end with when a word goes on in the next one: the hyphen, the Unicode hyphens, the figure dash,
   the en and em dashes (OCR reads a hyphen as one of those), the not sign (the hyphen of Fraktur and of some OCR) and
   the soft hyphen */
static int is_break_mark(int c) { return c == '-' || c == 0x2010 || c == 0x2011 || c == 0x2012 || c == 0x2013 || c == 0x2014 || c == 0xac || c == 0xad; }
static int is_dash(int c) { return c == 0x2013 || c == 0x2014; }

/* Where a word broken at offset i (a mark right after letters) goes on: the offset of its second half's first letter
   (after the line break, spaces and up to 4 stray marks before it and 3 after — the noise at a page's edge, as
   t_rare reads it), or -1 when the mark is not at a line end or the next line does not start with letters. */
static int broken_at(const uint8_t *s, int len, int i, int cl) {
    int k = i + cl, junkc = 0, l2;
    while (k < len && s[k] != '\n' && junkc <= 4) { int cc = dec(s + k, len - k, &l2); if (is_letter(cc) || is_digit(cc)) return -1; if (s[k] != ' ' && s[k] != '\r' && s[k] != '\t') junkc++; k += l2; }
    if (k >= len || s[k] != '\n' || junkc > 4) return -1;
    k++; junkc = 0;
    while (k < len && junkc <= 3) { int cc = dec(s + k, len - k, &l2); if (is_letter(cc)) return k; if (is_digit(cc) || cc == '\n') return -1; if (s[k] != ' ' && s[k] != '\r' && s[k] != '\t') junkc++; k += l2; }
    return -1;
}

/* t_dehyphen: the OCR text with the words broken over two lines put together (owner, 21 Nov 2026: "If words have a
   hyphen or a dash between them because they have to go to the next line … treat them as one word") — for the text
   shown and everything taken from it (a tap on a word, a selected phrase, the ranking). A line-end mark between
   letters, the next line starting with letters, is
     joined ("extra-" + "ordinary" → "extraordinary") when join_ok says so — and always for the soft hyphen, which
       only marks where a word may be broken;
     kept as a compound ("well-" + "known" → "well-known") for a hyphen or the not sign that is not joined;
     left as it was for an en or em dash that is not joined (at a line end a dash is punctuation as often as not).
   A word put together ends its first line: the rest of the second line, after its spaces, starts the next line
   (punctuation right after the word stays with it). Nothing else of the text is changed. UTF-8 into out (cap bytes;
   the result is never longer than the text); returns its length. */
API int t_dehyphen(const char *text, int len, char *out, int cap) {
    const uint8_t *s = (const uint8_t *)text;
    int p = 0, i = 0, wl = 0, bad = 0; /* wl: the letters of the word being read, lower case, in w */
    char w[256];
    #define OUT(b, n) do { if (p + (n) <= cap) memcpy(out + p, b, n); p += (n); } while (0)
    while (i < len) {
        int cl = 1, c = dec(s + i, len - i, &cl);
        if (is_letter(c)) { if (wl < 200) wl += enc(lower(c), w + wl); else bad = 1; OUT(text + i, cl); i += cl; continue; }
        int k = wl && is_break_mark(c) ? broken_at(s, len, i, cl) : -1;
        if (k > 0) {
            /* the second half: its letters (lower case for the rule) */
            char j[256]; int jl = wl, e = k, l2; memcpy(j, w, wl);
            while (e < len) { int cc = dec(s + e, len - e, &l2); if (!is_letter(cc)) break; if (jl < 200) jl += enc(lower(cc), j + jl); e += l2; }
            int join = c == 0xad || (!bad && join_ok(j, jl, w, wl, j + wl, jl - wl));
            if (join || !is_dash(c)) {
                if (!join) OUT(text + i, cl);  /* the compound keeps its hyphen */
                OUT(text + k, e - k);            /* the second half, as written */
                /* punctuation right after it stays with it; then the rest of the line starts a new one */
                while (e < len && s[e] != ' ' && s[e] != '\t' && s[e] != '\n' && s[e] != '\r') { int cc = dec(s + e, len - e, &l2); if (is_letter(cc)) break; OUT(text + e, l2); e += l2; }
                while (e < len && (s[e] == ' ' || s[e] == '\t')) e++;
                if (e < len && s[e] != '\n' && s[e] != '\r') OUT("\n", 1);
                i = e; wl = 0; bad = 0;
                /* the word goes on with letters after punctuation (rare): read it as a new word */
                continue;
            }
        }
        wl = 0; bad = 0;
        OUT(text + i, cl); i += cl;
    }
    #undef OUT
    if (p < cap) out[p] = 0;
    return p;
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
    char w[256]; int wl = 0, capital = 0, junk = 0, sentence = 1, mid = 0, abbr = 0; /* abbr: the word before was a title or an initial */
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
                if (is_apos(c)) { if (wl < 200) w[wl++] = '\''; i = j; continue; } /* bounded like the letters: w has 256 bytes */
                if (nl) {
                    /* "exam-\nple": join when the joined word is known, else keep the hyphen */
                    int k = j, wl2 = wl; char tmp[256]; memcpy(tmp, w, wl);
                    while (k < len) { int cc = dec(s + k, len - k, &l2); if (!is_letter(cc)) break; if (wl2 < 200) wl2 += enc(lower(cc), tmp + wl2); k += l2; }
                    /* join when a half is not a word ("magnani-mous") or the joined word is common ("re-turn"); keep
                       compounds of two words ("well-known": "wellknown" is only a rare misspelling) */
                    if (join_ok(tmp, wl2, w, wl, tmp + wl, wl2 - wl)) { memcpy(w, tmp, wl2); wl = wl2; i = k; continue; }
                }
                if (wl < 200) w[wl++] = '-';
                i = j; continue;
            }
        }
        if (wl) {
            abbr = title(w, wl) || (wl == 1 && capital && w[0] != 'i'); /* "Dr." · "J. R. R. Tolkien" (not "I.") */
            /* possessives: dog's → dog, dogs' → dogs */
            if (wl > 2 && w[wl - 2] == '\'' && w[wl - 1] == 's') wl -= 2;
            while (wl && (w[wl - 1] == '\'' || w[wl - 1] == '-')) wl--;
            int titled = i < len && c == '.' && title(w, wl); /* "Prof.", "Capt.": an abbreviation, not a hard word */
            if (!junk && wl >= 2 && !stopword(w, wl) && !titled) add_token(w, wl, capital, mid);
            wl = 0; sentence = 0;
        }
        junk = 0;
        if (i < len && (c == '.' || c == '!' || c == '?' || c == 0x2026) && !(c == '.' && abbr)) sentence = 1;
        if (i < len && c != ' ' && c != '.') abbr = 0;
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
