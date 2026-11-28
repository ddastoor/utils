/* The Clipart Maker's flat colours and the Image to SVG tab's black and white (own C; included at the end of imgproc.c).
 *
 * p_clip_flat: a picture's opaque pixels in k flat colours — k-means in CIE Lab (so skin, sky and shadows keep their look), seeded
 *   by greedy k-means++ with a fixed seed on a sample of the pixels; each pixel then takes its nearest colour; a mode filter evens out the
 *   edges between colours; areas smaller than `min_area` pixels take the colour most of their border has; each colour is the mean of
 *   its pixels. Pixels with alpha below 128 stay transparent (0, 0, 0, 0); the rest are opaque. Returns the colours used.
 * p_clip_mask: a mask (0 or 255) cleaned the same way — islands and holes smaller than `min_area` taken in, the edge evened out.
 * p_bw: black and white by luminance (on white where see-through), at a threshold or Otsu's; returns the threshold used. */

typedef struct { float L, a, b; } fl_lab;

static float fl_lin(int v) { float c = v / 255.0f; return c <= 0.04045f ? c / 12.92f : powf((c + 0.055f) / 1.055f, 2.4f); }
static int fl_srgb(float c) {
    c = c <= 0.0031308f ? 12.92f * c : 1.055f * powf(c < 0 ? 0 : c, 1.0f / 2.4f) - 0.055f;
    int v = (int)lrintf(c * 255.0f);
    return v < 0 ? 0 : v > 255 ? 255 : v;
}
static float fl_f(float t) { return t > 0.008856452f ? cbrtf(t) : t / 0.128418549f + 0.137931034f; }
static float fl_fi(float t) { return t > 0.206896552f ? t * t * t : 0.128418549f * (t - 0.137931034f); }
static fl_lab fl_tolab(const uint8_t *p) {
    float r = fl_lin(p[0]), g = fl_lin(p[1]), b = fl_lin(p[2]);
    float X = (0.4124564f * r + 0.3575761f * g + 0.1804375f * b) / 0.95047f;
    float Y = 0.2126729f * r + 0.7151522f * g + 0.0721750f * b;
    float Z = (0.0193339f * r + 0.1191920f * g + 0.9503041f * b) / 1.08883f;
    float fx = fl_f(X), fy = fl_f(Y), fz = fl_f(Z);
    fl_lab o = { 116.0f * fy - 16.0f, 500.0f * (fx - fy), 200.0f * (fy - fz) };
    return o;
}
static void fl_torgb(fl_lab c, uint8_t *out) {
    float fy = (c.L + 16.0f) / 116.0f, fx = fy + c.a / 500.0f, fz = fy - c.b / 200.0f;
    float X = 0.95047f * fl_fi(fx), Y = fl_fi(fy), Z = 1.08883f * fl_fi(fz);
    float r = 3.2404542f * X - 1.5371385f * Y - 0.4985314f * Z;
    float g = -0.9692660f * X + 1.8760108f * Y + 0.0415560f * Z;
    float b = 0.0556434f * X - 0.2040259f * Y + 1.0572252f * Z;
    out[0] = (uint8_t)fl_srgb(r); out[1] = (uint8_t)fl_srgb(g); out[2] = (uint8_t)fl_srgb(b);
}
static float fl_d2(fl_lab a, fl_lab b) { float dl = a.L - b.L, da = a.a - b.a, db = a.b - b.b; return dl * dl + da * da + db * db; }

/* the most common label of each pixel's (2r+1)² window among labels ≥ 0, ties keep the pixel's own; `iters` times */
static void fl_mode(int16_t *lab, int w, int h, int r, int iters, int nlab) {
    int16_t *tmp = (int16_t *)malloc((size_t)w * h * sizeof(int16_t));
    int *cnt = (int *)calloc((size_t)nlab + 1, sizeof(int));
    if (!tmp || !cnt) { free(tmp); free(cnt); return; }
    for (int it = 0; it < iters; it++) {
        int changed = 0;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                int16_t own = lab[(size_t)y * w + x];
                tmp[(size_t)y * w + x] = own;
                if (own < 0) continue;
                int best = own, bc = 0;
                for (int dy = -r; dy <= r; dy++) {
                    int yy = y + dy; if (yy < 0 || yy >= h) continue;
                    for (int dx = -r; dx <= r; dx++) {
                        int xx = x + dx; if (xx < 0 || xx >= w) continue;
                        int16_t l = lab[(size_t)yy * w + xx];
                        if (l >= 0) cnt[l]++;
                    }
                }
                bc = cnt[own];
                for (int dy = -r; dy <= r; dy++) {
                    int yy = y + dy; if (yy < 0 || yy >= h) continue;
                    for (int dx = -r; dx <= r; dx++) {
                        int xx = x + dx; if (xx < 0 || xx >= w) continue;
                        int16_t l = lab[(size_t)yy * w + xx];
                        if (l >= 0) { if (cnt[l] > bc) { bc = cnt[l]; best = l; } }
                    }
                }
                for (int dy = -r; dy <= r; dy++) {
                    int yy = y + dy; if (yy < 0 || yy >= h) continue;
                    for (int dx = -r; dx <= r; dx++) {
                        int xx = x + dx; if (xx < 0 || xx >= w) continue;
                        int16_t l = lab[(size_t)yy * w + xx];
                        if (l >= 0) cnt[l] = 0;
                    }
                }
                if (best != own) { tmp[(size_t)y * w + x] = (int16_t)best; changed++; }
            }
        memcpy(lab, tmp, (size_t)w * h * sizeof(int16_t));
        if (!changed) break;
    }
    free(tmp); free(cnt);
}

/* areas (4-connected, one label) smaller than min_area take the label most of their border has; transparent (-1) areas too when
 * `holes` (a mask's holes) — else they are left alone. Twice: an area merged may leave a neighbour still small. */
static void fl_merge(int16_t *lab, int w, int h, int min_area, int nlab, int holes) {
    size_t n = (size_t)w * h;
    int32_t *comp = (int32_t *)malloc(n * sizeof(int32_t)), *stack = (int32_t *)malloc(n * sizeof(int32_t));
    int *cnt = (int *)calloc((size_t)nlab + 2, sizeof(int));
    if (!comp || !stack || !cnt) { free(comp); free(stack); free(cnt); return; }
    for (int pass = 0; pass < 2; pass++) {
        for (size_t i = 0; i < n; i++) comp[i] = -1;
        int32_t nc = 0;
        for (size_t s = 0; s < n; s++) {
            if (comp[s] >= 0) continue;
            int16_t l = lab[s];
            /* flood the area */
            int32_t top = 0, area = 0; stack[top++] = (int32_t)s; comp[s] = nc;
            size_t start = 0; (void)start;
            int32_t head = 0;
            /* stack holds the area's pixels in order: walk it as a queue */
            while (head < top) {
                int32_t p = stack[head++]; area++;
                int x = p % w, y = p / w;
                int nb[4] = { x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1 };
                for (int k = 0; k < 4; k++) { int q = nb[k]; if (q >= 0 && comp[q] < 0 && lab[q] == l) { comp[q] = nc; stack[top++] = q; } }
            }
            if (area < min_area && (l >= 0 || holes)) {
                /* the border's labels */
                for (int32_t i = 0; i < top; i++) {
                    int32_t p = stack[i]; int x = p % w, y = p / w;
                    int nb[4] = { x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1 };
                    for (int k = 0; k < 4; k++) { int q = nb[k]; if (q >= 0 && lab[q] != l) cnt[lab[q] + 1]++; }
                }
                int best = -2, bc = 0;
                for (int k = 0; k <= nlab; k++) if (cnt[k] > bc && (k > 0 || holes)) { bc = cnt[k]; best = k - 1; }
                memset(cnt, 0, ((size_t)nlab + 2) * sizeof(int));
                if (best >= -1 && bc > 0) for (int32_t i = 0; i < top; i++) lab[stack[i]] = (int16_t)best;
            }
            nc++;
        }
    }
    free(comp); free(stack); free(cnt);
}

/* `palette`: 64 × 4 bytes — r, g, b and 255 for each colour kept, 0 elsewhere */
API int p_clip_flat(uint8_t *rgba, int w, int h, int k, int min_area, int smooth, uint8_t *palette) {
    size_t n = (size_t)w * h;
    if (k < 2) k = 2;
    if (k > 64) k = 64;
    fl_lab *px = (fl_lab *)malloc(n * sizeof(fl_lab));
    int16_t *lab = (int16_t *)malloc(n * sizeof(int16_t));
    if (!px || !lab) { free(px); free(lab); return 0; }
    size_t opaque = 0;
    for (size_t i = 0; i < n; i++) {
        if (rgba[i * 4 + 3] < 128) { lab[i] = -1; continue; }
        px[i] = fl_tolab(rgba + i * 4); lab[i] = 0; opaque++;
    }
    if (!opaque) { free(px); free(lab); memset(rgba, 0, n * 4); return 0; }
    /* a sample of the opaque pixels (at most 40,000, evenly spread) */
    size_t step = opaque > 40000 ? opaque / 40000 : 1, ns = 0;
    fl_lab *sm = (fl_lab *)malloc((opaque / step + 1) * sizeof(fl_lab));
    for (size_t i = 0, o = 0; i < n; i++) if (lab[i] >= 0) { if (o % step == 0) sm[ns++] = px[i]; o++; }
    if ((size_t)k > ns) k = (int)ns;
    /* k-means++ with a fixed seed */
    fl_lab c[64]; float *dist = (float *)malloc(ns * sizeof(float));
    uint32_t seed = 0x9e3779b9u;
    #define FL_RAND() (seed ^= seed << 13, seed ^= seed >> 17, seed ^= seed << 5, seed)
    c[0] = sm[FL_RAND() % ns];
    for (size_t i = 0; i < ns; i++) dist[i] = fl_d2(sm[i], c[0]);
    /* greedy k-means++ (scikit-learn's): 2 + ln k candidates drawn by D² at each step, the one that lowers the sum of squared
       distances most kept — a small colour of its own (an eye, a button) is almost never missed, as one draw can */
    int trials = 2 + (int)logf((float)k);
    float *cand = (float *)malloc(ns * sizeof(float)), *best = (float *)malloc(ns * sizeof(float));
    for (int j = 1; j < k; j++) {
        double tot = 0; for (size_t i = 0; i < ns; i++) tot += dist[i];
        double bestPot = -1; size_t bestPick = 0;
        for (int tr = 0; tr < trials; tr++) {
            size_t pick = 0;
            if (tot > 0) {
                double r = (FL_RAND() / 4294967296.0) * tot, acc = 0;
                pick = ns - 1;
                for (size_t i = 0; i < ns; i++) { acc += dist[i]; if (acc >= r) { pick = i; break; } }
            } else pick = FL_RAND() % ns;
            double pot = 0;
            for (size_t i = 0; i < ns; i++) { float d = fl_d2(sm[i], sm[pick]); cand[i] = d < dist[i] ? d : dist[i]; pot += cand[i]; }
            if (bestPot < 0 || pot < bestPot) { bestPot = pot; bestPick = pick; float *t = best; best = cand; cand = t; }
        }
        c[j] = sm[bestPick];
        memcpy(dist, best, ns * sizeof(float));
    }
    free(cand); free(best);
    #undef FL_RAND
    /* Lloyd's iterations on the sample */
    double sL[64], sa[64], sb[64]; int sc[64];
    for (int it = 0; it < 20; it++) {
        memset(sL, 0, sizeof sL); memset(sa, 0, sizeof sa); memset(sb, 0, sizeof sb); memset(sc, 0, sizeof sc);
        for (size_t i = 0; i < ns; i++) {
            int best = 0; float bd = fl_d2(sm[i], c[0]);
            for (int j = 1; j < k; j++) { float d = fl_d2(sm[i], c[j]); if (d < bd) { bd = d; best = j; } }
            sL[best] += sm[i].L; sa[best] += sm[i].a; sb[best] += sm[i].b; sc[best]++;
        }
        float moved = 0;
        for (int j = 0; j < k; j++) if (sc[j]) {
            fl_lab m = { (float)(sL[j] / sc[j]), (float)(sa[j] / sc[j]), (float)(sb[j] / sc[j]) };
            moved += fl_d2(m, c[j]); c[j] = m;
        }
        if (moved < 0.01f) break;
    }
    /* every pixel its nearest colour; edges evened out; specks taken in */
    for (size_t i = 0; i < n; i++) if (lab[i] >= 0) {
        int best = 0; float bd = fl_d2(px[i], c[0]);
        for (int j = 1; j < k; j++) { float d = fl_d2(px[i], c[j]); if (d < bd) { bd = d; best = j; } }
        lab[i] = (int16_t)best;
    }
    int16_t *lab0 = (int16_t *)malloc(n * sizeof(int16_t));
    if (lab0) memcpy(lab0, lab, n * sizeof(int16_t));
    if (smooth > 0) fl_mode(lab, w, h, smooth > 1 ? 2 : 1, smooth > 1 ? smooth : 2, k);
    if (min_area > 1) fl_merge(lab, w, h, min_area, k, 0);
    /* each colour the mean of its own pixels (in Lab) — those it had before the edges were evened out and the specks taken in, so a
       speck of another colour does not tint the area it joins; the colours used */
    memset(sL, 0, sizeof sL); memset(sa, 0, sizeof sa); memset(sb, 0, sizeof sb); memset(sc, 0, sizeof sc);
    int own[64] = { 0 };
    for (size_t i = 0; i < n; i++) if (lab[i] >= 0 && lab0 && lab0[i] == lab[i]) { int j = lab[i]; sL[j] += px[i].L; sa[j] += px[i].a; sb[j] += px[i].b; own[j]++; }
    for (size_t i = 0; i < n; i++) if (lab[i] >= 0) {
        int j = lab[i]; sc[j]++;
        if (!own[j] && (!lab0 || lab0[i] != j)) { sL[j] += px[i].L; sa[j] += px[i].a; sb[j] += px[i].b; }
    }
    for (int j = 0; j < k; j++) if (sc[j] && own[j]) sc[j] = own[j]; /* the mean over its own pixels */
    free(lab0);
    uint8_t rgb[64][3]; int used = 0;
    if (palette) memset(palette, 0, 64 * 4); /* 64 entries; those past k (and colours no pixel kept) have alpha 0 */
    for (int j = 0; j < k; j++) {
        fl_lab m = sc[j] ? (fl_lab){ (float)(sL[j] / sc[j]), (float)(sa[j] / sc[j]), (float)(sb[j] / sc[j]) } : c[j];
        fl_torgb(m, rgb[j]);
        if (palette) { palette[j * 4] = rgb[j][0]; palette[j * 4 + 1] = rgb[j][1]; palette[j * 4 + 2] = rgb[j][2]; palette[j * 4 + 3] = (uint8_t)(sc[j] ? 255 : 0); }
        if (sc[j]) used++;
    }
    for (size_t i = 0; i < n; i++) {
        uint8_t *p = rgba + i * 4;
        if (lab[i] < 0) { p[0] = p[1] = p[2] = p[3] = 0; continue; }
        p[0] = rgb[lab[i]][0]; p[1] = rgb[lab[i]][1]; p[2] = rgb[lab[i]][2]; p[3] = 255;
    }
    free(px); free(lab); free(sm); free(dist);
    return used;
}

API int p_clip_mask(uint8_t *mask, int w, int h, int min_area, int smooth) {
    size_t n = (size_t)w * h;
    int16_t *lab = (int16_t *)malloc(n * sizeof(int16_t));
    if (!lab) return -1;
    for (size_t i = 0; i < n; i++) lab[i] = mask[i] >= 128 ? 1 : 0;
    if (smooth > 0) fl_mode(lab, w, h, smooth > 1 ? 2 : 1, smooth > 1 ? smooth : 2, 2);
    if (min_area > 1) fl_merge(lab, w, h, min_area, 2, 0);
    int on = 0;
    for (size_t i = 0; i < n; i++) { mask[i] = lab[i] ? 255 : 0; on += lab[i] ? 1 : 0; }
    free(lab);
    return on;
}
/* a mask (0 … 255) as the picture's alpha */
API void p_clip_apply(uint8_t *rgba, const uint8_t *mask, int w, int h) {
    for (size_t i = 0; i < (size_t)w * h; i++) rgba[i * 4 + 3] = mask[i];
}
/* the alpha of `src` (the same size) onto `dst`: the mask found at the working size, on the photo's own pixels */
API void p_clip_alpha(uint8_t *dst, const uint8_t *src, int w, int h) {
    for (size_t i = 0; i < (size_t)w * h; i++) dst[i * 4 + 3] = src[i * 4 + 3];
}
/* the picture's shape: black where it is opaque (alpha ≥ 128), white elsewhere — for tracing its outline */
API void p_clip_silhouette(uint8_t *rgba, int w, int h) {
    for (size_t i = 0; i < (size_t)w * h; i++) { uint8_t *p = rgba + i * 4; uint8_t v = p[3] >= 128 ? 0 : 255; p[0] = p[1] = p[2] = v; p[3] = 255; }
}

API int p_bw(uint8_t *rgba, int w, int h, int t, int invert) {
    size_t n = (size_t)w * h;
    uint8_t *y = (uint8_t *)malloc(n);
    if (!y) return -1;
    uint32_t hist[256] = { 0 };
    for (size_t i = 0; i < n; i++) {
        const uint8_t *p = rgba + i * 4;
        int a = p[3], v = (299 * p[0] + 587 * p[1] + 114 * p[2] + 500) / 1000;
        v = (v * a + 255 * (255 - a) + 127) / 255; /* on white where see-through */
        y[i] = (uint8_t)v; hist[v]++;
    }
    if (t < 0) { /* Otsu */
        double sum = 0; for (int i = 0; i < 256; i++) sum += (double)i * hist[i];
        double sb = 0, wb = 0, best = -1; int bt = 128;
        for (int i = 0; i < 256; i++) {
            wb += hist[i]; if (wb == 0) continue;
            double wf = (double)n - wb; if (wf == 0) break;
            sb += (double)i * hist[i];
            double mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf);
            if (v > best) { best = v; bt = i + 1; }
        }
        t = bt;
    }
    for (size_t i = 0; i < n; i++) {
        int ink = y[i] < t;
        if (invert) ink = !ink;
        uint8_t *p = rgba + i * 4;
        p[0] = p[1] = p[2] = ink ? 0 : 255; p[3] = 255;
    }
    free(y);
    return t;
}

/* U²-Net's input as rembg gives it: the picture resized to d × d (Lanczos-3), divided by its largest value, less ImageNet's means
 * over its deviations, as three planes (R, G, B) of floats. */
API void p_u2_planes(const uint8_t *src, int sw, int sh, int d, float *out) {
    uint8_t *tmp = (uint8_t *)malloc((size_t)d * d * 4);
    if (!tmp) return;
    p_resize(src, sw, sh, tmp, d, d);
    int mx = 1;
    for (size_t i = 0; i < (size_t)d * d; i++) for (int c = 0; c < 3; c++) if (tmp[i * 4 + c] > mx) mx = tmp[i * 4 + c];
    const float mean[3] = { 0.485f, 0.456f, 0.406f }, sd[3] = { 0.229f, 0.224f, 0.225f };
    size_t plane = (size_t)d * d;
    for (size_t i = 0; i < plane; i++)
        for (int c = 0; c < 3; c++) out[c * plane + i] = ((float)tmp[i * 4 + c] / (float)mx - mean[c]) / sd[c];
    free(tmp);
}
/* the network's output stretched to 0 – 255 between its least and greatest value (rembg's normalisation) */
API void p_u2_mask(const float *prob, int n, uint8_t *out) {
    float lo = prob[0], hi = prob[0];
    for (int i = 1; i < n; i++) { if (prob[i] < lo) lo = prob[i]; if (prob[i] > hi) hi = prob[i]; }
    float s = hi > lo ? 255.0f / (hi - lo) : 0;
    for (int i = 0; i < n; i++) { int v = (int)lrintf((prob[i] - lo) * s); out[i] = (uint8_t)(v < 0 ? 0 : v > 255 ? 255 : v); }
}

/* AnimeGAN v2's input (the Cartoonizer's anime looks: src/lib/anime.ts) as its own code and bryandlee's make it: RGB as
 * v / 127.5 − 1 in single precision (numpy's float32 arithmetic), the w × h picture at the top left and its last row and column
 * repeated to W × H; NHWC, or three planes R, G, B (nchw: the face portrait). */
API void p_anime_in(const uint8_t *src, int w, int h, int W, int H, int nchw, float *out) {
    size_t plane = (size_t)W * H;
    for (int y = 0; y < H; y++) {
        const uint8_t *row = src + (size_t)(y < h ? y : h - 1) * w * 4;
        for (int x = 0; x < W; x++) {
            const uint8_t *p = row + (size_t)(x < w ? x : w - 1) * 4;
            size_t i = (size_t)y * W + x;
            for (int c = 0; c < 3; c++) {
                float v = (float)p[c] / 127.5f - 1.0f;
                if (nchw) out[c * plane + i] = v; else out[i * 3 + c] = v;
            }
        }
    }
}
/* its output (tanh, −1 … 1; W × H, NHWC or planes) → the w × h picture's RGBA, the padding cut off: (v + 1) × 127.5 in single
 * precision, held to 0 … 255 and truncated (AnimeGAN's inverse_transform: a clip, then astype(uint8)); opaque */
API void p_anime_out(const float *in, int W, int H, int nchw, int w, int h, uint8_t *dst) {
    size_t plane = (size_t)W * H;
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            size_t i = (size_t)y * W + x;
            uint8_t *o = dst + ((size_t)y * w + x) * 4;
            for (int c = 0; c < 3; c++) {
                float v = ((nchw ? in[c * plane + i] : in[i * 3 + c]) + 1.0f) * 127.5f;
                o[c] = !(v > 0) ? 0 : v >= 255 ? 255 : (uint8_t)v; /* NaN: 0 */
            }
            o[3] = 255;
        }
}

/* ink islands (label 1, 8-connected: a thin line steps diagonally) smaller than `min_area` pixels become paper (0); holes stay */
static void fl_drop_islands(int16_t *lab, int w, int h, int min_area) {
    size_t n = (size_t)w * h;
    uint8_t *seen = (uint8_t *)calloc(n, 1);
    int32_t *q = (int32_t *)malloc(n * sizeof(int32_t));
    if (!seen || !q) { free(seen); free(q); return; }
    for (size_t s = 0; s < n; s++) {
        if (seen[s] || lab[s] != 1) continue;
        int32_t top = 0, head = 0; q[top++] = (int32_t)s; seen[s] = 1;
        while (head < top) {
            int32_t p = q[head++]; int x = p % w, y = p / w;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                int xx = x + dx, yy = y + dy;
                if ((dx || dy) && xx >= 0 && xx < w && yy >= 0 && yy < h) {
                    int32_t r = yy * w + xx;
                    if (!seen[r] && lab[r] == 1) { seen[r] = 1; q[top++] = r; }
                }
            }
        }
        if (top < min_area) for (int32_t i = 0; i < top; i++) lab[q[i]] = 0;
    }
    free(seen); free(q);
}

/* The clip art's ink lines: Winnemöller's difference of Gaussians (the Cartoonizer's line finder, dog_lines) at scale `sigma` px on
 * the smoothed picture; a pixel darker than `thr` (0 … 1) on the line's dark side is ink, inside the subject only (alpha ≥ 128) and not
 * at its edge (the silhouette's outline is drawn there); the edges evened out by a mode filter and lines smaller than `min_area` pixels left out (texture
 * the smoothing left). The picture becomes black ink on white, opaque, for tracing. Returns the ink pixels. */
API int p_clip_lines(uint8_t *rgba, int w, int h, float sigma, float thr, int min_area) {
    size_t n = (size_t)w * h;
    float *e = dog_lines(rgba, w, h, sigma, 0.985f, 60.0f);
    int16_t *lab = (int16_t *)malloc(n * sizeof(int16_t));
    if (!e || !lab) { free(e); free(lab); return -1; }
    /* not within 2.5 σ of the subject's edge: the background's contrast there makes a line the outline already draws */
    int r = (int)ceilf(2.5f * sigma); if (r < 1) r = 1;
    size_t W = (size_t)w + 1;
    int32_t *I = (int32_t *)calloc(W * ((size_t)h + 1), sizeof(int32_t));
    if (!I) { free(e); free(lab); return -1; }
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
        I[(y + 1) * W + x + 1] = (rgba[((size_t)y * w + x) * 4 + 3] < 128) + I[y * W + x + 1] + I[(y + 1) * W + x] - I[y * W + x];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        size_t i = (size_t)y * w + x;
        int x0 = x - r < 0 ? 0 : x - r, x1 = x + r + 1 > w ? w : x + r + 1, y0 = y - r < 0 ? 0 : y - r, y1 = y + r + 1 > h ? h : y + r + 1;
        int out = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
        lab[i] = e[i] > thr && out == 0 ? 1 : 0;
    }
    free(I);
    fl_mode(lab, w, h, 1, 2, 2);
    if (min_area > 1) fl_drop_islands(lab, w, h, min_area);
    int on = 0;
    for (size_t i = 0; i < n; i++) {
        uint8_t *p = rgba + i * 4;
        uint8_t v = lab[i] == 1 ? 0 : 255;
        on += lab[i] == 1;
        p[0] = p[1] = p[2] = v; p[3] = 255;
    }
    free(e); free(lab);
    return on;
}
