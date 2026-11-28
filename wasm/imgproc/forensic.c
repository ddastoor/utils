/* "Is This Screenshot Real?" — the picture looked at for signs of editing (included at the end of imgproc.c).
 *
 *  p_jpeg_ghost   each 8 × 8 block's brightness (JPEG's Y, on JPEG's grid from the top left) transformed by JPEG's own DCT and
 *                 quantized again with the standard (IJG, Annex K) luminance table at every quality q0 … q1: the error each
 *                 quality leaves, a block at a time — "JPEG ghosts" (H. Farid, "Exposing digital forgeries from JPEG ghosts",
 *                 2009): a picture saved before at quality Q0 and then at a higher one keeps a dip in its error at Q0, and an
 *                 area pasted or painted after the first save does not. JPEG's 8 × 8 DCT is orthonormal, so the error of the
 *                 pixels is the error of the coefficients (Parseval): the DCT is taken once a block, each quality costs 64
 *                 divisions. Also each block's detail (its AC energy, the variance of its pixels): a flat block says nothing.
 *  p_ela          error level analysis: each block quantized again at one quality and turned back into pixels; the difference,
 *                 multiplied, as a picture (a heat scale).
 *  p_copy_move    areas of a photo copied to another place in it (cloned): blocks of 16 × 16 compared by the means of their
 *                 4 × 4 parts, sorted so that alike blocks stand together (J. Fridrich, D. Soukal, J. Lukáš, "Detection of
 *                 copy-move forgery in digital images", 2003), the shifts between alike blocks counted; a shift that many
 *                 blocks share, and that is no repeating pattern (the blocks do not match again at twice the shift), is a
 *                 copied area — its source and its copy.
 *  p_cell_diff    how far two pictures of one size differ, cell by cell (a file's embedded thumbnail against the picture).
 *  p_block_clip   each 8 × 8 block's share of pixels with a colour clipped at 0 or 255 (the checks leave such blocks out: a
 *                 decoder clips them, and what a JPEG save left there is lost).
 */

/* JPEG's standard tables (ITU T.81 Annex K), natural order */
static const int K_LUMA[64] = {
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99};

/* libjpeg's jpeg_quality_scaling and jpeg_add_quant_table (force_baseline): the table a quality makes */
static void ijg_table(int q, int *t) {
    if (q < 1) q = 1;
    if (q > 100) q = 100;
    int scale = q < 50 ? 5000 / q : 200 - 2 * q;
    for (int k = 0; k < 64; k++) {
        long v = ((long)K_LUMA[k] * scale + 50) / 100;
        if (v < 1) v = 1;
        if (v > 255) v = 255;
        t[k] = (int)v;
    }
}

/* the orthonormal 8 × 8 DCT-II (JPEG's FDCT): F = C · f · Cᵀ, C[u][x] = c(u)/2 · cos((2x + 1)uπ/16) */
static float DCTM[8][8];
static int dct_ready = 0;
static void dct_init(void) {
    if (dct_ready) return;
    for (int u = 0; u < 8; u++)
        for (int x = 0; x < 8; x++) DCTM[u][x] = (u ? 0.5f : 0.35355339f) * cosf((2 * x + 1) * u * 3.14159265f / 16.0f);
    dct_ready = 1;
}
static void fdct8(const float *f, float *F) { /* f, F: 64 values, row-major */
    float t[64];
    for (int y = 0; y < 8; y++)
        for (int u = 0; u < 8; u++) { float s = 0; for (int x = 0; x < 8; x++) s += DCTM[u][x] * f[y * 8 + x]; t[y * 8 + u] = s; }
    for (int v = 0; v < 8; v++)
        for (int u = 0; u < 8; u++) { float s = 0; for (int y = 0; y < 8; y++) s += DCTM[v][y] * t[y * 8 + u]; F[v * 8 + u] = s; }
}
static void idct8(const float *F, float *f) {
    float t[64];
    for (int v = 0; v < 8; v++)
        for (int x = 0; x < 8; x++) { float s = 0; for (int u = 0; u < 8; u++) s += DCTM[u][x] * F[v * 8 + u]; t[v * 8 + x] = s; }
    for (int y = 0; y < 8; y++)
        for (int x = 0; x < 8; x++) { float s = 0; for (int v = 0; v < 8; v++) s += DCTM[v][y] * t[v * 8 + x]; f[y * 8 + x] = s; }
}
/* a block's brightness, centred as JPEG centres it (JFIF's Y) */
static void block_y(const uint8_t *px, int w, int bx, int by, float *f) {
    for (int y = 0; y < 8; y++)
        for (int x = 0; x < 8; x++) {
            const uint8_t *p = px + ((size_t)(by * 8 + y) * w + bx * 8 + x) * 4;
            f[y * 8 + x] = 0.299f * p[0] + 0.587f * p[1] + 0.114f * p[2] - 128.0f;
        }
}

/* out: (q1 − q0 + 1) × nb floats — the mean squared error a block keeps when quantized again at q, for q = q0 … q1 (block
   by block in reading order, nb = ⌊w/8⌋ · ⌊h/8⌋); var: nb floats — the variance of the block's brightness. Returns nb. */
API int p_jpeg_ghost(const uint8_t *px, int w, int h, int q0, int q1, float *out, float *var) {
    dct_init();
    int bw = w / 8, bh = h / 8, nb = bw * bh, nq = q1 - q0 + 1;
    if (nb <= 0 || nq <= 0) return 0;
    int (*tabs)[64] = malloc(sizeof(int[64]) * (size_t)nq);
    for (int i = 0; i < nq; i++) ijg_table(q0 + i, tabs[i]);
    float f[64], F[64];
    for (int by = 0; by < bh; by++)
        for (int bx = 0; bx < bw; bx++) {
            int b = by * bw + bx;
            block_y(px, w, bx, by, f);
            fdct8(f, F);
            float ac = 0;
            for (int k = 1; k < 64; k++) ac += F[k] * F[k];
            var[b] = ac / 64.0f;
            for (int i = 0; i < nq; i++) {
                const int *t = tabs[i];
                float e = 0;
                for (int k = 0; k < 64; k++) { float d = F[k] - t[k] * roundf(F[k] / t[k]); e += d * d; }
                out[(size_t)i * nb + b] = e / 64.0f;
            }
        }
    free(tabs);
    return nb;
}

/* How closely each block's coefficients sit on the grid of the standard table at each quality q0 … q1: a picture saved before
   at Q0 keeps its coefficients near multiples of Q0's steps through a later save at a higher quality (whose steps are finer);
   coefficients that never passed through Q0 lie anywhere between them. out[(q − q0) · nb + b] = the mean distance of block
   b's coefficients to the nearest multiple, in steps (0 … 0.5; about 0.25 for coefficients unrelated to the grid), over the
   coefficients that say something — a step of 4 and more (finer ones are lost in the decoder's rounding) and a magnitude of
   half a step and more —, or −1 when fewer than 4 do. Returns nb. */
API int p_jpeg_grid(const uint8_t *px, int w, int h, int q0, int q1, float *out) {
    dct_init();
    int bw = w / 8, bh = h / 8, nb = bw * bh, nq = q1 - q0 + 1;
    if (nb <= 0 || nq <= 0) return 0;
    int (*tabs)[64] = malloc(sizeof(int[64]) * (size_t)nq);
    for (int i = 0; i < nq; i++) ijg_table(q0 + i, tabs[i]);
    float f[64], F[64];
    for (int by = 0; by < bh; by++)
        for (int bx = 0; bx < bw; bx++) {
            int b = by * bw + bx;
            block_y(px, w, bx, by, f);
            fdct8(f, F);
            for (int i = 0; i < nq; i++) {
                const int *t = tabs[i];
                float sum = 0; int cnt = 0;
                for (int k = 1; k < 64; k++) { /* the AC coefficients: the DC carries the block's mean, rounded by every editor */
                    if (t[k] < 4 || fabsf(F[k]) < 0.5f * t[k]) continue;
                    float r = F[k] / t[k];
                    sum += fabsf(r - roundf(r)); cnt++;
                }
                out[(size_t)i * nb + b] = cnt >= 4 ? sum / cnt : -1.0f;
            }
        }
    free(tabs);
    return nb;
}

/* error level analysis at quality q: |Y − Y_q| × gain on a heat scale (black, red, yellow, white), the picture's size; the
   pixels beyond the last whole block black. Returns the mean error. */
API float p_ela(const uint8_t *px, int w, int h, int q, float gain, uint8_t *out) {
    dct_init();
    int bw = w / 8, bh = h / 8, t[64];
    ijg_table(q, t);
    memset(out, 0, (size_t)w * h * 4);
    for (size_t i = 0; i < (size_t)w * h; i++) out[i * 4 + 3] = 255;
    float f[64], F[64], g[64];
    double sum = 0;
    for (int by = 0; by < bh; by++)
        for (int bx = 0; bx < bw; bx++) {
            block_y(px, w, bx, by, f);
            fdct8(f, F);
            for (int k = 0; k < 64; k++) F[k] = t[k] * roundf(F[k] / t[k]);
            idct8(F, g);
            for (int y = 0; y < 8; y++)
                for (int x = 0; x < 8; x++) {
                    float r = g[y * 8 + x] + 128.0f;
                    r = r < 0 ? 0 : r > 255 ? 255 : roundf(r);
                    float e = fabsf(f[y * 8 + x] + 128.0f - r);
                    sum += e;
                    float v = e * gain; /* 0 … 765: black → red → yellow → white */
                    if (v > 765) v = 765;
                    uint8_t *o = out + ((size_t)(by * 8 + y) * w + bx * 8 + x) * 4;
                    o[0] = (uint8_t)(v > 255 ? 255 : v);
                    o[1] = (uint8_t)(v > 510 ? 255 : v > 255 ? v - 255 : 0);
                    o[2] = (uint8_t)(v > 510 ? v - 510 : 0);
                }
        }
    return bw * bh ? (float)(sum / ((double)bw * bh * 64)) : 0;
}

/* -------------------------------------------------------------------------------------------------- copy-move */
#define CM_B 16       /* block side */
#define CM_F 16       /* features: the means of its 4 × 4 parts */
typedef struct { float f[CM_F]; int x, y; } CmBlock;
static int cm_cmp(const void *a, const void *b) {
    const CmBlock *p = a, *q = b;
    for (int k = 0; k < CM_F; k++) {
        int x = (int)(p->f[k] * 0.25f), y = (int)(q->f[k] * 0.25f); /* coarse steps of 4 levels: noise does not split alike blocks */
        if (x != y) return x < y ? -1 : 1;
    }
    return 0;
}
static float cm_dist(const float *a, const float *b) { float s = 0; for (int k = 0; k < CM_F; k++) { float d = a[k] - b[k]; s += d * d; } return s; }
typedef struct { int dx, dy, n, sx0, sy0, sx1, sy1, tx0, ty0, tx1, ty1; } CmShift;

/* the features of the block at (x, y): the means of its sixteen 4 × 4 parts, from the integral image `ii` ((w+1) × (h+1)) */
static void cm_feat(const double *ii, int w, int x, int y, float *f) {
    int W1 = w + 1;
    for (int j = 0; j < 4; j++)
        for (int i = 0; i < 4; i++) {
            int x0 = x + i * 4, y0 = y + j * 4, x1 = x0 + 4, y1 = y0 + 4;
            f[j * 4 + i] = (float)((ii[(size_t)y1 * W1 + x1] - ii[(size_t)y0 * W1 + x1] - ii[(size_t)y1 * W1 + x0] + ii[(size_t)y0 * W1 + x0]) / 16.0);
        }
}

/* out: [n, then n × 11 ints: dx, dy, cells (4 × 4 px) of the area, one area x0 y0 x1 y1, the other x0 y0 x1 y1]; at most `cap`
   areas, the most blocks first.
   `stride`: the step between blocks (1, or 2 on a large photo); `min_blocks`: the blocks an area needs. Returns n. */
API int p_copy_move(const uint8_t *px, int w, int h, int stride, int min_blocks, int32_t *out, int cap) {
    out[0] = 0;
    if (w < CM_B * 3 || h < CM_B * 3 || stride < 1) return 0;
    int W1 = w + 1;
    double *ii = calloc((size_t)W1 * (h + 1), sizeof(double));
    double *ii2 = calloc((size_t)W1 * (h + 1), sizeof(double));
    for (int y = 0; y < h; y++) {
        double row = 0, row2 = 0;
        for (int x = 0; x < w; x++) {
            const uint8_t *p = px + ((size_t)y * w + x) * 4;
            double v = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
            row += v; row2 += v * v;
            ii[(size_t)(y + 1) * W1 + x + 1] = ii[(size_t)y * W1 + x + 1] + row;
            ii2[(size_t)(y + 1) * W1 + x + 1] = ii2[(size_t)y * W1 + x + 1] + row2;
        }
    }
    int nx = (w - CM_B) / stride + 1, ny = (h - CM_B) / stride + 1;
    CmBlock *bl = malloc(sizeof(CmBlock) * (size_t)nx * ny);
    int n = 0;
    for (int by = 0; by < ny; by++)
        for (int bx = 0; bx < nx; bx++) {
            int x = bx * stride, y = by * stride;
            double s = ii[(size_t)(y + CM_B) * W1 + x + CM_B] - ii[(size_t)y * W1 + x + CM_B] - ii[(size_t)(y + CM_B) * W1 + x] + ii[(size_t)y * W1 + x];
            double s2 = ii2[(size_t)(y + CM_B) * W1 + x + CM_B] - ii2[(size_t)y * W1 + x + CM_B] - ii2[(size_t)(y + CM_B) * W1 + x] + ii2[(size_t)y * W1 + x];
            double m = s / (CM_B * CM_B), v = s2 / (CM_B * CM_B) - m * m;
            if (v < 36.0) continue; /* flat (sky, a wall, a page): alike everywhere, says nothing */
            cm_feat(ii, w, x, y, bl[n].f);
            /* the parts' means must differ too: a block of fine noise with flat means is no texture to match */
            float lo = 1e9f, hi = -1e9f;
            for (int k = 0; k < CM_F; k++) { if (bl[n].f[k] < lo) lo = bl[n].f[k]; if (bl[n].f[k] > hi) hi = bl[n].f[k]; }
            if (hi - lo < 6.0f) continue;
            bl[n].x = x; bl[n].y = y; n++;
        }
    qsort(bl, (size_t)n, sizeof(CmBlock), cm_cmp);
    /* the shifts between alike blocks, counted in an open hash table */
    int hcap = 1 << 16;
    CmShift *tab = calloc((size_t)hcap, sizeof(CmShift));
    char *used = calloc((size_t)hcap, 1);
    const int WIN = 12, MIN_D = 24;
    const float THR = CM_F * 2.0f * 2.0f; /* about 2 levels a part */
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n && j <= i + WIN; j++) {
            if (cm_dist(bl[i].f, bl[j].f) > THR) continue;
            int dx = bl[j].x - bl[i].x, dy = bl[j].y - bl[i].y;
            const CmBlock *s = &bl[i], *t = &bl[j];
            if (dx < 0 || (dx == 0 && dy < 0)) { dx = -dx; dy = -dy; s = &bl[j]; t = &bl[i]; }
            if (dx * dx + dy * dy < MIN_D * MIN_D) continue;
            unsigned key = ((unsigned)(dx + 32768) * 2654435761u) ^ ((unsigned)(dy + 32768) * 40503u);
            int k = (int)(key & (unsigned)(hcap - 1));
            while (used[k] && (tab[k].dx != dx || tab[k].dy != dy)) k = (k + 1) & (hcap - 1);
            CmShift *c = &tab[k];
            if (!used[k]) {
                used[k] = 1; c->dx = dx; c->dy = dy; c->n = 0;
                c->sx0 = c->sy0 = 1 << 30; c->sx1 = c->sy1 = -1; c->tx0 = c->ty0 = 1 << 30; c->tx1 = c->ty1 = -1;
            }
            c->n++;
            if (s->x < c->sx0) c->sx0 = s->x; if (s->y < c->sy0) c->sy0 = s->y;
            if (s->x + CM_B > c->sx1) c->sx1 = s->x + CM_B; if (s->y + CM_B > c->sy1) c->sy1 = s->y + CM_B;
            if (t->x < c->tx0) c->tx0 = t->x; if (t->y < c->ty0) c->ty0 = t->y;
            if (t->x + CM_B > c->tx1) c->tx1 = t->x + CM_B; if (t->y + CM_B > c->ty1) c->ty1 = t->y + CM_B;
        }
    /* the shifts many blocks share, the largest first; a shift next to a larger one (±2: noise) joins it */
    int found = 0;
    for (;;) {
        int best = -1;
        for (int k = 0; k < hcap; k++) if (used[k] && tab[k].n >= min_blocks && (best < 0 || tab[k].n > tab[best].n)) best = k;
        if (best < 0 || found >= cap) break;
        CmShift c = tab[best];
        used[best] = 0;
        for (int k = 0; k < hcap; k++)
            if (used[k] && abs(tab[k].dx - c.dx) <= 2 && abs(tab[k].dy - c.dy) <= 2) { c.n += tab[k].n; used[k] = 0; }
        /* a repeating pattern (stripes, tiles, a fence) matches again at twice the shift: no copy */
        int rep = 0, tried = 0;
        for (int y = c.sy0; y + CM_B <= c.sy1 && tried < 400; y += CM_B / 2)
            for (int x = c.sx0; x + CM_B <= c.sx1 && tried < 400; x += CM_B / 2) {
                int x2 = x + 2 * c.dx, y2 = y + 2 * c.dy, x1 = x + c.dx, y1 = y + c.dy;
                if (x2 < 0 || y2 < 0 || x2 + CM_B > w || y2 + CM_B > h || x1 + CM_B > w || y1 + CM_B > h || y1 < 0) continue;
                float a[CM_F], b[CM_F], m[CM_F];
                cm_feat(ii, w, x, y, a); cm_feat(ii, w, x1, y1, m); cm_feat(ii, w, x2, y2, b);
                if (cm_dist(a, m) > THR) continue; /* not a block of the copy */
                tried++;
                if (cm_dist(a, b) <= THR * 2) rep++;
            }
        if (tried && rep * 10 > tried * 4) continue; /* 40 % match again: a pattern */
        /* where the copy is: the blocks on a 4-px grid that are textured and alike at the shift, their largest connected area */
        const int G = 4;
        int gw = (w - CM_B) / G + 1, gh = (h - CM_B) / G + 1;
        uint8_t *mk = calloc((size_t)gw * gh, 1);
        for (int gy = 0; gy < gh; gy++)
            for (int gx = 0; gx < gw; gx++) {
                int x = gx * G, y = gy * G, x1 = x + c.dx, y1 = y + c.dy;
                if (x1 < 0 || y1 < 0 || x1 + CM_B > w || y1 + CM_B > h) continue;
                double s1 = ii[(size_t)(y + CM_B) * W1 + x + CM_B] - ii[(size_t)y * W1 + x + CM_B] - ii[(size_t)(y + CM_B) * W1 + x] + ii[(size_t)y * W1 + x];
                double s2 = ii2[(size_t)(y + CM_B) * W1 + x + CM_B] - ii2[(size_t)y * W1 + x + CM_B] - ii2[(size_t)(y + CM_B) * W1 + x] + ii2[(size_t)y * W1 + x];
                double mm = s1 / (CM_B * CM_B);
                if (s2 / (CM_B * CM_B) - mm * mm < 36.0) continue;
                float a[CM_F], b[CM_F];
                cm_feat(ii, w, x, y, a); cm_feat(ii, w, x1, y1, b);
                if (cm_dist(a, b) <= THR) mk[(size_t)gy * gw + gx] = 1;
            }
        int *stack = malloc(sizeof(int) * (size_t)gw * gh), bestn = 0, bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
        for (int i0 = 0; i0 < gw * gh; i0++) {
            if (mk[i0] != 1) continue;
            int sp = 0, cnt = 0, x0 = 1 << 30, y0 = 1 << 30, x1 = -1, y1 = -1;
            stack[sp++] = i0; mk[i0] = 2;
            while (sp) {
                int i = stack[--sp], gx = i % gw, gy = i / gw;
                cnt++;
                if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
                const int nb[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
                for (int q = 0; q < 4; q++) {
                    int ax = gx + nb[q][0], ay = gy + nb[q][1];
                    if (ax < 0 || ay < 0 || ax >= gw || ay >= gh) continue;
                    int j = ay * gw + ax;
                    if (mk[j] == 1) { mk[j] = 2; stack[sp++] = j; }
                }
            }
            if (cnt > bestn) { bestn = cnt; bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; }
        }
        free(stack); free(mk);
        if (bestn < 6) continue; /* scattered look-alikes, no area */
        int32_t *o = out + 1 + found * 11;
        o[0] = c.dx; o[1] = c.dy; o[2] = bestn;
        o[3] = bx0 * G; o[4] = by0 * G; o[5] = bx1 * G + CM_B; o[6] = by1 * G + CM_B;
        o[7] = o[3] + c.dx; o[8] = o[4] + c.dy; o[9] = o[5] + c.dx; o[10] = o[6] + c.dy;
        found++;
    }
    out[0] = found;
    free(tab); free(used); free(bl); free(ii); free(ii2);
    return found;
}

/* two pictures of one size (w × h, RGBA) compared on a grid of cells × cells: out[cells²] the mean absolute difference of their
   brightness in each cell (0 … 255). Returns the mean over the whole picture. */
API float p_cell_diff(const uint8_t *a, const uint8_t *b, int w, int h, int cells, float *out) {
    double total = 0;
    for (int cy = 0; cy < cells; cy++)
        for (int cx = 0; cx < cells; cx++) {
            int x0 = cx * w / cells, x1 = (cx + 1) * w / cells, y0 = cy * h / cells, y1 = (cy + 1) * h / cells;
            double s = 0; int n = 0;
            for (int y = y0; y < y1; y++)
                for (int x = x0; x < x1; x++) {
                    const uint8_t *p = a + ((size_t)y * w + x) * 4, *q = b + ((size_t)y * w + x) * 4;
                    float la = 0.299f * p[0] + 0.587f * p[1] + 0.114f * p[2], lb = 0.299f * q[0] + 0.587f * q[1] + 0.114f * q[2];
                    s += fabsf(la - lb); n++;
                }
            out[cy * cells + cx] = n ? (float)(s / n) : 0;
            total += s;
        }
    return w * h ? (float)(total / ((double)w * h)) : 0;
}

/* out[b] (blocks of 8 × 8 on JPEG's grid, ⌈w/8⌉ × ⌈h/8⌉ in reading order — a partial last row and column counted on what
   they hold): 255 × the share of the block's pixels that have a channel at 0 or 255 and are a colour — channels 12 apart and
   more (a saturated colour clipped; white and black, and the slight tint a JPEG leaves on them, stay). Returns the blocks. */
API int p_block_clip(const uint8_t *px, int w, int h, uint8_t *out) {
    int bw = (w + 7) / 8, bh = (h + 7) / 8;
    for (int by = 0; by < bh; by++)
        for (int bx = 0; bx < bw; bx++) {
            int n = 0, c = 0;
            for (int y = by * 8; y < by * 8 + 8 && y < h; y++)
                for (int x = bx * 8; x < bx * 8 + 8 && x < w; x++) {
                    const uint8_t *p = px + ((size_t)y * w + x) * 4;
                    n++;
                    int at = p[0] == 0 || p[0] == 255 || p[1] == 0 || p[1] == 255 || p[2] == 0 || p[2] == 255;
                    int hi = p[0] > p[1] ? p[0] : p[1], lo = p[0] < p[1] ? p[0] : p[1];
                    if (p[2] > hi) hi = p[2];
                    if (p[2] < lo) lo = p[2];
                    if (at && hi - lo >= 12) c++; /* a colour: near-white or near-black with a decoder's faint tint is no colour */
                }
            out[by * bw + bx] = (uint8_t)(n ? (c * 255 + n / 2) / n : 0);
        }
    return bw * bh;
}
