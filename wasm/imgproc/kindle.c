/* PDF for Kindle (potentials #109): where a region of a page — a column, a full-width title, a figure across the page —
 * may be cut into pieces as high as a Kindle's screen. Own C, part of imgproc.wasm (included at the end of imgproc.c).
 * The owner's rule: "each column cut into screen-high pieces at the gaps between lines (never through a line of text, a
 * formula or a figure)".
 *
 * p_blank_rows(px, w, h, x0, y0, x1, y1, thr, prot, nprot, out): the rows y0 … y1 − 1 of an RGBA drawing of the page,
 *   seen between the columns x0 … x1 − 1: out[y − y0] = 1 when no pixel there is darker than thr (luma) and the row lies
 *   outside every protected interval (prot: nprot pairs [top, bottom) in rows of the drawing — a line's letters from above
 *   its capitals to below its baseline, a figure, a formula, a figure with its caption), else 0. Returns y1 − y0.
 *   (Blank rows inside a line — between an accent and its letter, inside a big Σ — are protected by the caller's
 *   intervals; the ink alone finds the real gaps between lines: MuPDF's line boxes, with the font's ascent and descent,
 *   often touch or overlap.)
 *
 * p_next_cut(blank, n, from, maxh, minfill, wide, over): where the piece that starts at row `from` of a region of n rows
 *   should end, at most maxh rows further: in the middle of a blank run that begins after the piece's first ink. A run of
 *   at least `wide` rows that reaches from + minfill · maxh — the gap after a paragraph, a figure, a heading — wins, the
 *   lowest of them; with none there, the lowest run within the limit (a gap between two lines: the screen filled).
 *   (Which of two line gaps is a row wider says nothing: the first version took the widest run and ended a screen at
 *   62 % of its height where two lines happened to have no descenders and ascenders between them.) Returns the row of the
 *   cut (from < cut ≤ from + maxh), or n when the rest of the region fits, or −1 when no blank row within the limit follows
 *   ink (a figure, a formula, a table taller than a screen): then *over is where such a piece ends — the middle of the
 *   first blank run after it — or −1 when it runs to the end of the region. */

API int p_blank_rows(const uint8_t *px, int w, int h, int x0, int y0, int x1, int y1, int thr, const float *prot, int nprot, uint8_t *out) {
    if (x0 < 0) x0 = 0;
    if (x1 > w) x1 = w;
    if (y0 < 0) y0 = 0;
    if (y1 > h) y1 = h;
    int n = y1 - y0;
    if (n <= 0) return 0;
    for (int y = y0; y < y1; y++) {
        int blank = 1;
        const uint8_t *p = px + ((size_t)y * w + (x0 > 0 ? x0 : 0)) * 4;
        for (int x = x0; x < x1; x++, p += 4)
            if (((77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8) < thr) { blank = 0; break; }
        out[y - y0] = (uint8_t)blank;
    }
    for (int k = 0; k < nprot; k++) {
        int a = (int)floorf(prot[2 * k]) - y0, b = (int)ceilf(prot[2 * k + 1]) - y0;
        if (a < 0) a = 0;
        if (b > n) b = n;
        for (int r = a; r < b; r++) out[r] = 0;
    }
    return n;
}

API int p_next_cut(const uint8_t *blank, int n, int from, int maxh, float minfill, int wide, int32_t *over) {
    *over = -1;
    if (from < 0) from = 0;
    if (maxh < 1) maxh = 1;
    int lim = from + maxh;
    if (lim >= n) return n;
    int ink = from;
    while (ink < n && blank[ink]) ink++;
    if (ink >= n) return n; /* only white space is left */
    int want = from + (int)(minfill * (float)maxh + 0.5f);
    int best = -1, low = -1, r = ink;
    while (r < n) {
        while (r < n && !blank[r]) r++;
        if (r >= n) break;
        int s = r;
        while (r < n && blank[r]) r++;
        /* the blank run [s, r) */
        if (s > lim) {
            if (low < 0) *over = (s + r) / 2;
            break;
        }
        int e = r < lim ? r : lim, cut = (s + e) / 2;
        if (cut <= from) cut = from + 1;
        if (e >= want && r - s >= wide) best = cut;
        low = cut;
    }
    if (best > from) return best;
    if (low > from) return low;
    return -1;
}
