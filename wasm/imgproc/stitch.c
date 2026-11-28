/* The Long Screenshot Stitcher (potentials #87; own C, included at the end of imgproc.c).
 *
 * Screenshots of one chat or page, taken while it scrolls and given in any order → one tall picture. A row of a screenshot
 * is known by its signature (p_scroll_sig: the mean luma of K bands of its width, in sixteenths), its detail (the steps
 * between neighbouring bands — a row of text has many, a blank row or the inside of a bubble almost none) and its mean.
 *
 * p_st_pair: between screenshots a and b, the shift under which b's row y shows what a showed at row y + d + f/4 (f a
 *   quarter of a row: screenshots made smaller after they were taken — sent through a chat app — move by no whole number
 *   of rows). Found in two steps. Votes: every row of b with detail looks up the rows of a with nearly the same mean
 *   (a sorted index) and a few bands alike, and votes for their distance — the shift of the screenshots gathers the
 *   votes of all the rows they share. Then each shift that gathered many is checked row by row: b's rows with detail
 *   (or a's at that shift) score +1 when they match (at most a tenth of the bands off by more than `tol`) and −2 when
 *   they do not, and the best stretch (Kadane's maximum sum) is what the two share. Rows outside that stretch are each
 *   screenshot's own: its bars (the status bar, the app's title, the typing box — they do not move), what floats over
 *   the content (a date chip, a "scroll down" button, a scrollbar's thumb) or what only one of them shows. A chat's
 *   wallpaper that stays put while the messages scroll is faint and has little detail: it neither helps nor hurts.
 * p_st_seam: where to join two screenshots in the stretch they share — the rows in its middle three fifths where the two
 *   differ least, pixel for pixel (away from what floats near either end).
 * p_st_same: the rows that stay put between two screenshots of one height (for "leave out the bars"). */

/* shifts smaller than this are no scroll: the bars and the rows next to them match there (a row of a typing box is much
   like the next one); two screenshots that close are the same one (out[9]) */
#define ST_MINSHIFT 8

static int st_match(const int32_t *b, const int32_t *a0, const int32_t *a1, int f4, int K, int tol, int allow) {
    int bad = 0;
    for (int k = 0; k < K; k++) {
        int32_t av = f4 ? (a0[k] * (4 - f4) + a1[k] * f4 + 2) >> 2 : a0[k];
        int32_t q = b[k] - av;
        if ((q < 0 ? -q : q) > tol && ++bad > allow) return 0;
    }
    return 1;
}

/* per row: the signature, the detail and the mean; returns K. The detail is the steps across the row — but only for a row
   that also differs from the rows above and below it: the inside of a bubble or a bar has strong edges at its sides and
   is the same row after row, so two bubbles of one width would look alike; a row of text or of a photo differs from the
   row above it or the one below. A row without detail counts for nothing either way. */
API int p_st_rows(const uint8_t *px, int w, int h, int smooth, int32_t *sig, int32_t *tex, int32_t *mean) {
    int K = p_scroll_sig(px, w, h, sig);
    if (smooth && h > 2) { /* a soft copy (sent through a chat app): each band over three rows, 1 : 2 : 1 — JPEG's noise evens out */
        int32_t *prev = malloc(sizeof(int32_t) * (size_t)K), *cur = malloc(sizeof(int32_t) * (size_t)K);
        if (prev && cur) {
            memcpy(prev, sig, sizeof(int32_t) * (size_t)K);
            for (int y = 0; y < h; y++) {
                int32_t *s = sig + (size_t)y * K, *nx = y + 1 < h ? s + K : s;
                memcpy(cur, s, sizeof(int32_t) * (size_t)K);
                for (int k = 0; k < K; k++) s[k] = (prev[k] + 2 * cur[k] + nx[k] + 2) >> 2;
                int32_t *t = prev; prev = cur; cur = t;
            }
        }
        free(prev); free(cur);
    }
    int64_t vmin = (int64_t)6 * K; /* a few levels in all: text changes from row to row in its curves and ends, not its stems */
    for (int y = 0; y < h; y++) {
        const int32_t *s = sig + (size_t)y * K; int64_t t = 0, m = 0, up = -1, dn = -1;
        for (int k = 0; k < K; k++) { m += s[k]; if (k) { int32_t q = s[k] - s[k - 1]; t += q < 0 ? -q : q; } }
        if (y > 0) { up = 0; for (int k = 0; k < K; k++) { int32_t q = s[k] - s[k - K]; up += q < 0 ? -q : q; } }
        if (y + 1 < h) { dn = 0; for (int k = 0; k < K; k++) { int32_t q = s[k] - s[k + K]; dn += q < 0 ? -q : q; } }
        int64_t v = up > dn ? up : dn;
        if (v < vmin) t = 0;
        tex[y] = (int32_t)(t > INT32_MAX ? INT32_MAX : t); mean[y] = (int32_t)(m / K);
    }
    return K;
}

typedef struct { const int32_t *s, *t, *m; int h; } st_img;

/* row y of b against row ya of a (f4: a quarter of a row further, between ya and ya + 1): 1 they match, 0 not, −1 the row
   tells nothing. With screenshots of one height (`same`), a band that stays put on either side — it is the same at that
   place in the other screenshot: a date chip, a "scroll down" button, a banner floating over what scrolls, a wallpaper
   that does not move — is left out: what floats over the content must not decide whether the content matches. */
static int st_row(const st_img *A, const st_img *B, int K, int y, int ya, int f4, int tol, int same) {
    const int32_t *b = B->s + (size_t)y * K, *a0 = A->s + (size_t)ya * K, *a1 = f4 ? a0 + K : a0;
    const int32_t *bA = same ? A->s + (size_t)y * K : 0, *aB = same && ya < B->h ? B->s + (size_t)ya * K : 0;
    int used = 0, bad = 0;
    for (int k = 0; k < K; k++) {
        if (bA && abs(b[k] - bA[k]) <= tol) continue;  /* b's band is where it was in a */
        if (aB && abs(a0[k] - aB[k]) <= tol) continue; /* a's band is where it is in b */
        int32_t av = f4 ? (a0[k] * (4 - f4) + a1[k] * f4 + 2) >> 2 : a0[k];
        used++;
        if (abs(b[k] - av) > tol) bad++;
    }
    if (used < 3) return -1;
    return bad * 10 <= used ? 1 : 0;
}

/* the best stretch of b's rows that match a's at shift d + f4/4: its score, first and last row (+1), rows matched and not */
static int st_stretch(const st_img *A, const st_img *B, int K, int d, int f4, int tol, int tmin, int32_t *res) {
    int y0 = d < 0 ? -d : 0, y1 = B->h, lim = A->h - d - (f4 ? 1 : 0), same = A->h == B->h;
    if (y1 > lim) y1 = lim;
    int cur = 0, best = 0, start = y0, cm = 0, cx = 0;
    res[0] = 0; res[1] = res[2] = y0; res[3] = res[4] = 0;
    for (int y = y0; y < y1; y++) {
        int ya = y + d;
        if (B->t[y] < tmin && A->t[ya] < tmin && !(f4 && A->t[ya + 1] >= tmin)) continue;
        int m = st_row(A, B, K, y, ya, f4, tol, same);
        if (m < 0) continue;
        if (m) { if (cur == 0) { start = y; cm = cx = 0; } cur += 1; cm++; }
        else if (cur > 0) { cur -= 2; cx++; if (cur < 0) cur = 0; }
        if (cur > best) { best = cur; res[0] = best; res[1] = start; res[2] = y + 1; res[3] = cm; res[4] = cx; }
    }
    return best;
}

static const int32_t *st_keys;
static int st_cmp(const void *x, const void *y) {
    int32_t a = st_keys[*(const int32_t *)x], b = st_keys[*(const int32_t *)y];
    return a < b ? -1 : a > b;
}

/* out: [0] 1 a shift found (0 none) · [1] d · [2] f (quarters of a row: the shift is d + f/4) · [3] the stretch's score ·
   [4] the best score of any other shift (more than 3 rows away) · [5] the stretch's first row in b · [6] its last + 1 ·
   [7] rows with detail matched in it · [8] not matched · [9] at the same place: the share of b's rows with detail that
   match a's (×1000; −1 for screenshots of other heights) · [10] the votes of the shift · [11] the shift of the best
   other (×4: quarters of a row; 0 none) — where rows repeat (a run of "Ok"), the one to try instead · [12] [13] over
   all the rows the shift lays over each other (not only the stretch): rows matched and not — a stretch that is a
   coincidence (a header that moved, two alike rows) sits among rows that do not match */
API void p_st_pair(const int32_t *sa, const int32_t *ta, const int32_t *ma, int ha,
                   const int32_t *sb, const int32_t *tb, const int32_t *mb, int hb, int K, int tol, int32_t *out) {
    for (int i = 0; i < 14; i++) out[i] = 0;
    out[9] = -1;
    if (ha < 8 || hb < 8 || K < 1) return;
    int tmin = 32 * K;
    st_img A = { sa, ta, ma, ha }, B = { sb, tb, mb, hb };
    /* at the same place, or within a few rows of it (a duplicate, or one scrolled by a hair): the best share of b's rows
       with detail that match */
    if (ha == hb) {
        int n = 0, allow = K / 10 < 1 ? 1 : K / 10, best = 0;
        for (int y = 0; y < hb; y++) n += tb[y] >= tmin;
        for (int d = -(ST_MINSHIFT - 1); d < ST_MINSHIFT && n; d++) {
            int same = 0;
            for (int y = d < 0 ? -d : 0; y < hb && y + d < ha; y++) if (tb[y] >= tmin) same += st_match(sb + (size_t)y * K, sa + (size_t)(y + d) * K, 0, 0, K, tol, allow);
            if (same > best) best = same;
        }
        out[9] = n ? (int32_t)((int64_t)best * 1000 / n) : 0;
    }
    /* a's rows with detail, by their mean */
    int32_t *idx = malloc(sizeof(int32_t) * (size_t)ha), *votes = calloc((size_t)(ha + hb + 2), sizeof(int32_t));
    if (!idx || !votes) { free(idx); free(votes); return; }
    int na = 0;
    for (int y = 0; y < ha; y++) if (ta[y] >= tmin) idx[na++] = y;
    st_keys = ma; qsort(idx, (size_t)na, sizeof(int32_t), st_cmp);
    int tolm = 2 * tol, tolq = 4 * tol, kq[4] = { K / 8, (3 * K) / 8, (5 * K) / 8, (7 * K) / 8 };
    for (int y = 0; y < hb; y++) {
        if (tb[y] < tmin) continue;
        int32_t lo = mb[y] - tolm, hi = mb[y] + tolm;
        int L = 0, R = na; /* the first index whose mean ≥ lo */
        while (L < R) { int M = (L + R) >> 1; if (ma[idx[M]] < lo) L = M + 1; else R = M; }
        const int32_t *bs = sb + (size_t)y * K;
        for (int i = L; i < na && ma[idx[i]] <= hi; i++) {
            int j = idx[i], d = j - y, ok = 1;
            if (abs(d) < ST_MINSHIFT) continue;
            const int32_t *as = sa + (size_t)j * K;
            for (int q = 0; q < 4 && ok; q++) { int32_t e = bs[kq[q]] - as[kq[q]]; if ((e < 0 ? -e : e) > tolq) ok = 0; }
            if (ok) votes[d + hb]++;
        }
    }
    free(idx);
    /* the shifts most voted for (three rows together: a shift by no whole number of rows splits its votes) */
    enum { NC = 8 };
    int cand[NC], cw[NC], nc = 0;
    for (int d = -(hb - 1); d <= ha - 1; d++) {
        if (abs(d) < ST_MINSHIFT) continue;
        int i = d + hb, w = votes[i] + (i > 0 ? votes[i - 1] : 0) + votes[i + 1];
        if (w < 6) continue;
        /* a local peak: no neighbour within 4 rows has more */
        int peak = 1;
        for (int e = -4; e <= 4 && peak; e++) {
            int k = i + e; if (!e || k < 1 || k > ha + hb) continue;
            int w2 = votes[k] + votes[k - 1] + votes[k + 1];
            if (w2 > w || (w2 == w && e < 0)) peak = 0;
        }
        if (!peak) continue;
        if (nc < NC) { cand[nc] = d; cw[nc] = w; nc++; }
        else { int lo = 0; for (int c = 1; c < NC; c++) if (cw[c] < cw[lo]) lo = c; if (w > cw[lo]) { cand[lo] = d; cw[lo] = w; } }
    }
    int32_t r[5];
    int bestS = 0, bestD = 0, bestF = 0, bestC = -1, cscore[NC], cd[NC];
    for (int c = 0; c < nc; c++) {
        cscore[c] = 0; cd[c] = cand[c];
        for (int e = -1; e <= 1; e++) {
            if (abs(cand[c] + e) < ST_MINSHIFT) continue; /* the same place: the bars match there, not what scrolls */
            int s = st_stretch(&A, &B, K, cand[c] + e, 0, tol, tmin, r);
            if (s > cscore[c]) { cscore[c] = s; cd[c] = cand[c] + e; }
        }
        if (cscore[c] > bestS) { bestS = cscore[c]; bestD = cd[c]; bestC = c; }
    }
    if (bestC < 0) { free(votes); return; }
    /* the best two, a quarter of a row at a time */
    int second = -1; for (int c = 0; c < nc; c++) if (c != bestC && (second < 0 || cscore[c] > cscore[second])) second = c;
    for (int pass = 0; pass < 2; pass++) {
        int c = pass ? second : bestC; if (c < 0) continue;
        for (int dd = cd[c] - 1; dd <= cd[c]; dd++) for (int f = 1; f < 4; f++) {
            if (abs(dd * 4 + f) < 4 * ST_MINSHIFT) continue;
            int s = st_stretch(&A, &B, K, dd, f, tol, tmin, r);
            if (s > cscore[c]) cscore[c] = s;
            if (s > bestS) { bestS = s; bestD = dd; bestF = f; bestC = c; }
        }
    }
    int other = 0, otherD = 0;
    for (int c = 0; c < nc; c++) if (c != bestC && abs(cd[c] - bestD) > 3 && cscore[c] > other) { other = cscore[c]; otherD = cd[c]; }
    out[11] = otherD * 4;
    st_stretch(&A, &B, K, bestD, bestF, tol, tmin, r);
    { int y0 = bestD < 0 ? -bestD : 0, y1 = hb, lim = ha - bestD - (bestF ? 1 : 0), same = ha == hb, mm = 0, xx = 0;
      if (y1 > lim) y1 = lim;
      for (int y = y0; y < y1; y++) {
          int ya = y + bestD;
          if (tb[y] < tmin && ta[ya] < tmin && !(bestF && ta[ya + 1] >= tmin)) continue;
          int m = st_row(&A, &B, K, y, ya, bestF, tol, same);
          if (m > 0) mm++; else if (m == 0) xx++;
      }
      out[12] = mm; out[13] = xx; }
    out[0] = 1; out[1] = bestD; out[2] = bestF; out[3] = r[0]; out[4] = other; out[5] = r[1]; out[6] = r[2]; out[7] = r[3]; out[8] = r[4];
    { int i = bestD + hb; if (i < 1) i = 1; if (i > ha + hb) i = ha + hb; out[10] = votes[i - 1] + votes[i] + votes[i + 1]; }
    free(votes);
}

/* where to join a (above) and b (below: b's row y shows a's row y + d), near b's rows y0 … y1 (the stretch they share):
   the row whose three rows differ least between the two, pixel for pixel, in the stretch and as far again on either side
   (within the rows the shift lays over each other) — what floats over one of them (a date chip, a "scroll down" button)
   and the bars differ there, so the join keeps away from them; ties: the nearest the stretch's middle. out: [0] the row
   of b (a gives the rows above row + d, b the rows from row on) · [1] the mean |Δ| of a channel over it and its two
   neighbours ×1000 · [2] over the stretch ×1000 · [3] the share of the stretch's pixels off by more than 24 ×10⁶ */
API void p_st_seam(const uint8_t *pa, int ha, const uint8_t *pb, int hb, int w, int d, int y0, int y1, int32_t *out) {
    for (int i = 0; i < 4; i++) out[i] = 0;
    int ov0 = d < 0 ? -d : 0, ov1 = hb < ha - d ? hb : ha - d;
    if (y0 < ov0) y0 = ov0;
    if (y1 > ov1) y1 = ov1;
    if (y1 <= y0) { out[0] = y0 < ov1 ? y0 : ov0; return; }
    int L = y1 - y0, s0 = y0 - L < ov0 ? ov0 : y0 - L, s1 = y1 + L > ov1 ? ov1 : y1 + L, n = s1 - s0;
    int64_t *cost = malloc(sizeof(int64_t) * (size_t)n);
    if (!cost) { out[0] = (y0 + y1) / 2; return; }
    uint64_t sum = 0, bad = 0;
    for (int y = s0; y < s1; y++) {
        const uint8_t *p = pb + (size_t)y * w * 4, *q = pa + (size_t)(y + d) * w * 4; int64_t c = 0, b = 0;
        for (int x = 0; x < w; x++, p += 4, q += 4) {
            int d0 = abs(p[0] - q[0]), d1 = abs(p[1] - q[1]), d2 = abs(p[2] - q[2]);
            c += d0 + d1 + d2; if (d0 > 24 || d1 > 24 || d2 > 24) b++;
        }
        cost[y - s0] = c;
        if (y >= y0 && y < y1) { sum += (uint64_t)c; bad += (uint64_t)b; }
    }
    int mid = (y0 + y1) / 2 - s0, best = -1;
    int64_t bc = INT64_MAX;
    for (int i = 0; i < n; i++) {
        int64_t c = cost[i] + (i > 0 ? cost[i - 1] : cost[i]) + (i + 1 < n ? cost[i + 1] : cost[i]);
        if (c < bc || (c == bc && abs(i - mid) < abs(best - mid))) { bc = c; best = i; }
    }
    out[0] = s0 + best;
    out[1] = (int32_t)((double)bc * 1000.0 / (9.0 * w));
    out[2] = (int32_t)((double)sum * 1000.0 / (3.0 * w * (double)L));
    out[3] = (int32_t)((double)bad * 1e6 / ((double)w * L));
    free(cost);
}

/* the rows of b that match a's at the same place (screenshots of one height): out[y] = 1 when at most a quarter of the
   row's bands are off by more than tol (a clock that changed spoils few), 2 when the row also has detail */
API void p_st_same(const int32_t *sa, const int32_t *sb, const int32_t *tb, int h, int K, int tol, uint8_t *out) {
    int allow = K / 4 < 1 ? 1 : K / 4, tmin = 32 * K;
    for (int y = 0; y < h; y++) {
        int m = st_match(sb + (size_t)y * K, sa + (size_t)y * K, 0, 0, K, tol, allow);
        out[y] = (uint8_t)(m ? (tb[y] >= tmin ? 2 : 1) : 0);
    }
}
