/*
 * imgproc.wasm — image processing for SuperUtils (own code). Built as a WASI reactor (see build.sh).
 * All images are interleaved RGBA8, row-major, no padding. Functions work in place unless they take src/dst.
 *
 * Sections: tone & colour adjustment · resampling (Lanczos-3) · blur/sharpen · rotation · artistic filters
 * (bilateral, cartoon/DoG lines/k-means, Kuwahara oil paint, pencil sketch, watercolour, halftone) · redaction
 * (pixelate/blur rect) · matting (guided filter, compositing) · documents (page detection, perspective warp,
 * enhancement / adaptive threshold) · utilities (histogram, grayscale).
 */
#include <math.h>
#ifdef CM_DEBUG
#include <stdio.h>
#endif
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define API __attribute__((visibility("default")))
#define CLAMP(x, a, b) ((x) < (a) ? (a) : (x) > (b) ? (b) : (x))
static inline uint8_t u8(float v) { return (uint8_t)(v <= 0 ? 0 : v >= 255 ? 255 : v + 0.5f); }

API void *p_malloc(uint32_t n) { return malloc(n ? n : 1); }
API void p_free(void *p) { free(p); }

/* sRGB <-> linear lookup */
static float s2l[256];
static int s2l_ready = 0;
static void init_s2l(void) {
    if (s2l_ready) return;
    for (int i = 0; i < 256; i++) { float c = i / 255.0f; s2l[i] = c <= 0.04045f ? c / 12.92f : powf((c + 0.055f) / 1.055f, 2.4f); }
    s2l_ready = 1;
}
static inline float l2s(float l) { l = CLAMP(l, 0.0f, 1.0f); return 255.0f * (l <= 0.0031308f ? 12.92f * l : 1.055f * powf(l, 1 / 2.4f) - 0.055f); }

/* ======================================================================== tone & colour */
/*
 * bright, contrast, sat, vib, temp, tint, highlights, shadows in [-1, 1]; exposure in stops; gamma > 0 (1 = none);
 * hue in degrees. One LUT pass for tone, then per-pixel colour ops in a luma-preserving space.
 */
API void p_adjust(uint8_t *px, int n, float bright, float contrast, float exposure, float gamma, float sat, float vib,
                  float hue, float temp, float tint, float highlights, float shadows) {
    init_s2l();
    float lut[256];
    float ef = powf(2.0f, exposure), cf = contrast >= 0 ? 1 + contrast * 2.0f : 1 + contrast;
    for (int i = 0; i < 256; i++) {
        float v = l2s(s2l[i] * ef) / 255.0f;                  /* exposure in linear light */
        v += bright * 0.5f;                                    /* brightness */
        v = (v - 0.5f) * cf + 0.5f;                            /* contrast around mid-grey */
        v = CLAMP(v, 0.0f, 1.0f);
        if (shadows != 0) v += shadows * 0.5f * (1 - v) * (1 - v) * v * 4; /* lift/crush shadows */
        if (highlights != 0) v += highlights * 0.5f * v * v * (1 - v) * 4;
        v = CLAMP(v, 0.0f, 1.0f);
        if (gamma > 0 && gamma != 1) v = powf(v, 1 / gamma);
        lut[i] = v * 255.0f;
    }
    float rg = 1 + temp * 0.25f, bg = 1 - temp * 0.25f, gg = 1 - tint * 0.2f;
    float hr = hue * (float)M_PI / 180.0f, cs = cosf(hr), sn = sinf(hr);
    /* hue rotation matrix around the luma axis (Rec.601 weights) */
    float m[9] = {
        0.299f + 0.701f * cs + 0.168f * sn, 0.587f - 0.587f * cs + 0.330f * sn, 0.114f - 0.114f * cs - 0.497f * sn,
        0.299f - 0.299f * cs - 0.328f * sn, 0.587f + 0.413f * cs + 0.035f * sn, 0.114f - 0.114f * cs + 0.292f * sn,
        0.299f - 0.300f * cs + 1.250f * sn, 0.587f - 0.588f * cs - 1.050f * sn, 0.114f + 0.886f * cs - 0.203f * sn};
    int doHue = hue != 0, doColor = sat != 0 || vib != 0 || temp != 0 || tint != 0 || doHue;
    for (int i = 0; i < n; i++) {
        uint8_t *p = px + i * 4;
        float r = lut[p[0]], g = lut[p[1]], b = lut[p[2]];
        if (doColor) {
            r *= rg; b *= bg; g *= gg;
            if (doHue) { float r2 = m[0] * r + m[1] * g + m[2] * b, g2 = m[3] * r + m[4] * g + m[5] * b, b2 = m[6] * r + m[7] * g + m[8] * b; r = r2; g = g2; b = b2; }
            float l = 0.299f * r + 0.587f * g + 0.114f * b;
            float mx = fmaxf(r, fmaxf(g, b)), mn = fminf(r, fminf(g, b)), cur = mx > 0 ? (mx - mn) / mx : 0;
            float s = 1 + sat + vib * (1 - cur);              /* vibrance boosts dull colours more */
            r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s;
        }
        p[0] = u8(r); p[1] = u8(g); p[2] = u8(b);
    }
}

API void p_grayscale(uint8_t *px, int n) { for (int i = 0; i < n; i++) { uint8_t *p = px + i * 4; uint8_t l = u8(0.299f * p[0] + 0.587f * p[1] + 0.114f * p[2]); p[0] = p[1] = p[2] = l; } }
API void p_invert(uint8_t *px, int n) { for (int i = 0; i < n; i++) { uint8_t *p = px + i * 4; p[0] = 255 - p[0]; p[1] = 255 - p[1]; p[2] = 255 - p[2]; } }
API void p_histogram(const uint8_t *px, int n, uint32_t *out /* 4*256: r,g,b,luma */) {
    memset(out, 0, 4 * 256 * sizeof(uint32_t));
    for (int i = 0; i < n; i++) { const uint8_t *p = px + i * 4; out[p[0]]++; out[256 + p[1]]++; out[512 + p[2]]++; out[768 + u8(0.299f * p[0] + 0.587f * p[1] + 0.114f * p[2])]++; }
}

/* ======================================================================== Lanczos-3 resampling */
static inline float sinc(float x) { if (x == 0) return 1; x *= (float)M_PI; return sinf(x) / x; }
static inline float lanczos(float x) { return (x > -3 && x < 3) ? sinc(x) * sinc(x / 3) : 0; }
typedef struct { int start, n; float *w; } Contrib;
static Contrib *contribs(int src, int dst, float **pool) {
    float scale = (float)dst / src, support = 3.0f * (scale < 1 ? 1 / scale : 1), fs = scale < 1 ? scale : 1;
    int maxn = (int)ceilf(support * 2) + 2;
    Contrib *c = malloc(sizeof(Contrib) * dst);
    float *w = malloc(sizeof(float) * dst * maxn); *pool = w;
    for (int i = 0; i < dst; i++) {
        float center = (i + 0.5f) / scale - 0.5f;
        int a = (int)floorf(center - support), b = (int)ceilf(center + support);
        if (a < 0) a = 0; if (b > src - 1) b = src - 1;
        float sum = 0; int n = 0;
        c[i].start = a; c[i].w = w + i * maxn;
        for (int j = a; j <= b && n < maxn; j++) { float v = lanczos((j - center) * fs); c[i].w[n++] = v; sum += v; }
        c[i].n = n;
        if (sum != 0) for (int k = 0; k < n; k++) c[i].w[k] /= sum;
    }
    return c;
}
API void p_resize(const uint8_t *src, int sw, int sh, uint8_t *dst, int dw, int dh) {
    float *pw, *ph;
    Contrib *cx = contribs(sw, dw, &pw), *cy = contribs(sh, dh, &ph);
    float *tmp = malloc(sizeof(float) * 4 * dw * sh);         /* premultiplied, horizontal pass */
    for (int y = 0; y < sh; y++) {
        const uint8_t *row = src + (size_t)y * sw * 4;
        for (int x = 0; x < dw; x++) {
            float r = 0, g = 0, b = 0, a = 0;
            for (int k = 0; k < cx[x].n; k++) { const uint8_t *p = row + (cx[x].start + k) * 4; float w = cx[x].w[k], al = p[3] * w; r += p[0] * al; g += p[1] * al; b += p[2] * al; a += al; }
            float *t = tmp + ((size_t)y * dw + x) * 4; t[0] = r; t[1] = g; t[2] = b; t[3] = a;
        }
    }
    for (int x = 0; x < dw; x++) {
        for (int y = 0; y < dh; y++) {
            float r = 0, g = 0, b = 0, a = 0;
            for (int k = 0; k < cy[y].n; k++) { const float *t = tmp + ((size_t)(cy[y].start + k) * dw + x) * 4; float w = cy[y].w[k]; r += t[0] * w; g += t[1] * w; b += t[2] * w; a += t[3] * w; }
            uint8_t *d = dst + ((size_t)y * dw + x) * 4;
            if (a > 0.5f) { d[0] = u8(r / a); d[1] = u8(g / a); d[2] = u8(b / a); } else d[0] = d[1] = d[2] = 0;
            d[3] = u8(a);
        }
    }
    free(tmp); free(cx); free(cy); free(pw); free(ph);
}

/* Area resize = OpenCV's cv2.resize(..., interpolation=INTER_AREA) on 8-bit RGBA, as imgproc/src/resize.cpp (4.x, 5.x)
   computes it. The page-finding model of the Doc Scanner was trained on photos made 224 × 224 this way, and its
   corners come out best when it is fed the same pixels (tests/unit/pagefind.test.mjs holds this to OpenCV itself):
   – both axes shrink by a whole number: the mean of each block (2 × 2: (sum + 2) >> 2, OpenCV's vector code; other
     blocks: the sum times 1/area in float, rounded half to even — cvRound);
   – both axes shrink: OpenCV's area table (a source pixel covered by less than 1/1000 is left out), sums in float,
     rounded half to even;
   – an axis grows (or one grows and one shrinks): two taps per axis with INTER_AREA's coefficients (sx = ⌊dx·scale⌋,
     fx = (dx + 1) − (sx + 1)/scale, 0 when ≤ 0, else its fraction) in OpenCV's 11-bit fixed point, rows combined as its
     vector code rounds (where OpenCV's scalar tail rounds otherwise, a value can be one off). */
typedef struct { int di, si; float alpha; } AreaTap;
static int area_tab(int ssize, int dsize, double scale, AreaTap *tab) {
    int k = 0;
    for (int dx = 0; dx < dsize; dx++) {
        double fsx1 = dx * scale, fsx2 = fsx1 + scale, cell = fmin(scale, ssize - fsx1);
        int sx1 = (int)ceil(fsx1), sx2 = (int)floor(fsx2);
        if (sx2 > ssize - 1) sx2 = ssize - 1;
        if (sx1 > sx2) sx1 = sx2;
        if (sx1 - fsx1 > 1e-3) { tab[k].di = dx; tab[k].si = sx1 - 1; tab[k++].alpha = (float)((sx1 - fsx1) / cell); }
        for (int sx = sx1; sx < sx2; sx++) { tab[k].di = dx; tab[k].si = sx; tab[k++].alpha = (float)(1.0 / cell); }
        if (fsx2 - sx2 > 1e-3) { tab[k].di = dx; tab[k].si = sx2; tab[k++].alpha = (float)(fmin(fmin(fsx2 - sx2, 1.), cell) / cell); }
    }
    return k;
}
static inline uint8_t u8_even(float v) { v = nearbyintf(v); return (uint8_t)(v <= 0 ? 0 : v >= 255 ? 255 : v); }
static inline short s16_even(float v) { return (short)nearbyintf(v); }
/* INTER_AREA's two taps per target pixel when an axis grows (OpenCV's resizeGeneric with area_mode). */
static void area_linear_taps(int sn, int dn, int *ofs, short *al) {
    double inv = (double)dn / sn, scale = 1. / inv;
    for (int d = 0; d < dn; d++) {
        int sx = (int)floor(d * scale);
        float fx = (float)((d + 1) - (sx + 1) * inv);
        fx = fx <= 0 ? 0.f : fx - floorf(fx);
        if (sx < 0) { fx = 0; sx = 0; }
        if (sx >= sn - 1) { fx = 0; sx = sn - 1; }
        ofs[d] = sx; al[d * 2] = s16_even((1.f - fx) * 2048); al[d * 2 + 1] = s16_even(fx * 2048);
    }
}
API void p_resize_area(const uint8_t *src, int sw, int sh, uint8_t *dst, int dw, int dh) {
    double sx = 1. / ((double)dw / sw), sy = 1. / ((double)dh / sh);
    if (sx >= 1 && sy >= 1) {
        int ix = (int)lround(sx), iy = (int)lround(sy);
        if (fabs(sx - ix) < 2.2204460492503131e-16 && fabs(sy - iy) < 2.2204460492503131e-16) {   /* whole blocks */
            int area = ix * iy; float scale = 1.f / area;
            for (int y = 0; y < dh; y++) for (int x = 0; x < dw; x++) for (int c = 0; c < 4; c++) {
                int sum = 0;
                for (int j = 0; j < iy; j++) for (int i = 0; i < ix; i++) sum += src[((size_t)(y * iy + j) * sw + x * ix + i) * 4 + c];
                dst[((size_t)y * dw + x) * 4 + c] = ix == 2 && iy == 2 ? (uint8_t)((sum + 2) >> 2) : u8_even(sum * scale);
            }
            return;
        }
        AreaTap *xt = malloc(sizeof(AreaTap) * (size_t)(sw * 2 + 2)), *yt = malloc(sizeof(AreaTap) * (size_t)(sh * 2 + 2));
        int xn = area_tab(sw, dw, sx, xt), yn = area_tab(sh, dh, sy, yt);
        float *buf = malloc(sizeof(float) * 4 * (size_t)dw), *sum = calloc((size_t)dw * 4, sizeof(float));
        int prev = yt[0].di;
        for (int j = 0; j < yn; j++) {
            float beta = yt[j].alpha; int dy = yt[j].di; const uint8_t *row = src + (size_t)yt[j].si * sw * 4;
            memset(buf, 0, sizeof(float) * 4 * (size_t)dw);
            for (int k = 0; k < xn; k++) {
                const uint8_t *p = row + (size_t)xt[k].si * 4; float *b = buf + (size_t)xt[k].di * 4, a = xt[k].alpha;
                b[0] = b[0] + p[0] * a; b[1] = b[1] + p[1] * a; b[2] = b[2] + p[2] * a; b[3] = b[3] + p[3] * a;
            }
            if (dy != prev) {
                uint8_t *d = dst + (size_t)prev * dw * 4;
                for (int i = 0; i < dw * 4; i++) { d[i] = u8_even(sum[i]); sum[i] = beta * buf[i]; }
                prev = dy;
            } else for (int i = 0; i < dw * 4; i++) sum[i] += beta * buf[i];
        }
        { uint8_t *d = dst + (size_t)prev * dw * 4; for (int i = 0; i < dw * 4; i++) d[i] = u8_even(sum[i]); }
        free(xt); free(yt); free(buf); free(sum);
        return;
    }
    int *xo = malloc(sizeof(int) * dw), *yo = malloc(sizeof(int) * dh);
    short *xa = malloc(sizeof(short) * 2 * dw), *ya = malloc(sizeof(short) * 2 * dh);
    area_linear_taps(sw, dw, xo, xa); area_linear_taps(sh, dh, yo, ya);
    int *h0 = malloc(sizeof(int) * 4 * (size_t)dw), *h1 = malloc(sizeof(int) * 4 * (size_t)dw);
    for (int y = 0; y < dh; y++) {
        int r0 = yo[y], r1 = r0 + 1 < sh ? r0 + 1 : r0;
        for (int pass = 0; pass < 2; pass++) {
            const uint8_t *row = src + (size_t)(pass ? r1 : r0) * sw * 4; int *h = pass ? h1 : h0;
            for (int x = 0; x < dw; x++) {
                int s0 = xo[x], s1 = s0 + 1 < sw ? s0 + 1 : s0;
                for (int c = 0; c < 4; c++) h[x * 4 + c] = row[s0 * 4 + c] * xa[x * 2] + row[s1 * 4 + c] * xa[x * 2 + 1];
            }
        }
        short b0 = ya[y * 2], b1 = ya[y * 2 + 1];
        uint8_t *d = dst + (size_t)y * dw * 4;
        for (int i = 0; i < dw * 4; i++) {
            int t = (((h0[i] >> 4) * b0) >> 16) + (((h1[i] >> 4) * b1) >> 16);
            t = (t + 2) >> 2; d[i] = (uint8_t)(t < 0 ? 0 : t > 255 ? 255 : t);
        }
    }
    free(xo); free(yo); free(xa); free(ya); free(h0); free(h1);
}

/* ======================================================================== blur & sharpen */
static void box_h(const float *in, float *out, int w, int h, int ch, int r) {
    float inv = 1.0f / (2 * r + 1);
    for (int y = 0; y < h; y++) for (int c = 0; c < ch; c++) {
        const float *row = in + (size_t)y * w * ch; float *o = out + (size_t)y * w * ch;
        float acc = 0;
        for (int k = -r; k <= r; k++) acc += row[CLAMP(k, 0, w - 1) * ch + c];
        for (int x = 0; x < w; x++) {
            o[x * ch + c] = acc * inv;
            acc += row[CLAMP(x + r + 1, 0, w - 1) * ch + c] - row[CLAMP(x - r, 0, w - 1) * ch + c];
        }
    }
}
static void box_v(const float *in, float *out, int w, int h, int ch, int r) {
    float inv = 1.0f / (2 * r + 1);
    for (int x = 0; x < w; x++) for (int c = 0; c < ch; c++) {
        float acc = 0;
        for (int k = -r; k <= r; k++) acc += in[((size_t)CLAMP(k, 0, h - 1) * w + x) * ch + c];
        for (int y = 0; y < h; y++) {
            out[((size_t)y * w + x) * ch + c] = acc * inv;
            acc += in[((size_t)CLAMP(y + r + 1, 0, h - 1) * w + x) * ch + c] - in[((size_t)CLAMP(y - r, 0, h - 1) * w + x) * ch + c];
        }
    }
}
/* Gaussian approximation: three box passes. Works on float planes with `ch` channels. */
static void gauss_f(float *buf, int w, int h, int ch, float sigma) {
    if (sigma <= 0.3f) return;
    int r = (int)floorf(sqrtf(12 * sigma * sigma / 3 + 1) / 2 + 0.5f); if (r < 1) r = 1;
    float *tmp = malloc(sizeof(float) * (size_t)w * h * ch);
    for (int i = 0; i < 3; i++) { box_h(buf, tmp, w, h, ch, r); box_v(tmp, buf, w, h, ch, r); }
    free(tmp);
}
static float *to_f(const uint8_t *px, int n, int ch) { float *f = malloc(sizeof(float) * (size_t)n * ch); for (int i = 0; i < n; i++) for (int c = 0; c < ch; c++) f[(size_t)i * ch + c] = px[(size_t)i * 4 + c]; return f; }
API void p_blur(uint8_t *px, int w, int h, float sigma) {
    float *f = to_f(px, w * h, 4); gauss_f(f, w, h, 4, sigma);
    for (size_t i = 0; i < (size_t)w * h * 4; i++) px[i] = u8(f[i]);
    free(f);
}
API void p_sharpen(uint8_t *px, int w, int h, float amount, float sigma) {
    if (amount <= 0) return;
    float *f = to_f(px, w * h, 3); gauss_f(f, w, h, 3, sigma);
    for (int i = 0; i < w * h; i++) for (int c = 0; c < 3; c++) { float o = px[i * 4 + c]; px[i * 4 + c] = u8(o + (o - f[i * 3 + c]) * amount); }
    free(f);
}

/* ======================================================================== rotation (bilinear) */
static inline void sample_bilinear(const uint8_t *src, int w, int h, float x, float y, uint8_t *out, uint32_t fill) {
    if (x < -0.5f || y < -0.5f || x > w - 0.5f || y > h - 0.5f) { memcpy(out, &fill, 4); return; }
    x = CLAMP(x, 0.0f, (float)(w - 1)); y = CLAMP(y, 0.0f, (float)(h - 1));
    int x0 = (int)x, y0 = (int)y, x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
    float fx = x - x0, fy = y - y0;
    const uint8_t *a = src + ((size_t)y0 * w + x0) * 4, *b = src + ((size_t)y0 * w + x1) * 4, *c = src + ((size_t)y1 * w + x0) * 4, *d = src + ((size_t)y1 * w + x1) * 4;
    for (int k = 0; k < 4; k++) out[k] = u8((a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy);
}
/* Rotate by deg (any angle) about the centre into a dw×dh canvas (caller picks dw,dh — e.g. crop-to-fit). */
API void p_rotate(const uint8_t *src, int w, int h, uint8_t *dst, int dw, int dh, float deg, uint32_t fill) {
    float a = -deg * (float)M_PI / 180.0f, cs = cosf(a), sn = sinf(a), cx = w / 2.0f, cy = h / 2.0f, dcx = dw / 2.0f, dcy = dh / 2.0f;
    for (int y = 0; y < dh; y++) for (int x = 0; x < dw; x++) {
        float dx = x + 0.5f - dcx, dy = y + 0.5f - dcy;
        sample_bilinear(src, w, h, cs * dx - sn * dy + cx - 0.5f, sn * dx + cs * dy + cy - 0.5f, dst + ((size_t)y * dw + x) * 4, fill);
    }
}

/* Lossless geometry. EXIF orientation semantics (o = 1..8): 2 flip H, 3 rotate 180, 4 flip V, 5 transpose,
   6 rotate 90 CW, 7 transverse, 8 rotate 90 CCW. dst is w×h for o<5, h×w for o>=5. */
API void p_orient(const uint32_t *src, int w, int h, uint32_t *dst, int o) {
    int W = o >= 5 ? h : w;
    for (int y = 0; y < h; y++) {
        const uint32_t *row = src + (size_t)y * w;
        for (int x = 0; x < w; x++) {
            int X = x, Y = y;
            switch (o) {
                case 2: X = w - 1 - x; break;
                case 3: X = w - 1 - x; Y = h - 1 - y; break;
                case 4: Y = h - 1 - y; break;
                case 5: X = y; Y = x; break;
                case 6: X = h - 1 - y; Y = x; break;
                case 7: X = h - 1 - y; Y = w - 1 - x; break;
                case 8: X = y; Y = w - 1 - x; break;
                default: break;
            }
            dst[(size_t)Y * W + X] = row[x];
        }
    }
}
/* Copy the rectangle (x,y,cw,ch) — caller clamps it to the image. */
API void p_crop(const uint32_t *src, int w, int h, uint32_t *dst, int x, int y, int cw, int ch) {
    (void)h;
    for (int r = 0; r < ch; r++) memcpy(dst + (size_t)r * cw, src + (size_t)(y + r) * w + x, (size_t)cw * 4);
}

/* Bounding box of pixels with alpha > thr. out = x, y, w, h (w = 0 if none). */
API void p_alpha_bbox(const uint8_t *px, int w, int h, int thr, int32_t *out) {
    int x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (int y = 0; y < h; y++) {
        const uint8_t *row = px + (size_t)y * w * 4;
        for (int x = 0; x < w; x++) if (row[x * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    out[0] = x0; out[1] = y0; out[2] = x1 - x0 + 1; out[3] = y1 - y0 + 1;
}
/* Photo of ink on paper → transparent "ink" layer. Paper brightness is estimated locally (large blur of a max
   filter, as in doc enhance) so shadows/uneven light do not become ink. alpha = smoothstep of darkness relative to
   the local paper level; colour = rgb (0xRRGGBB) or the original ink colour if keep_color. */
API void p_ink_to_alpha(uint8_t *px, int w, int h, uint32_t rgb, int keep_color, float strength) {
    int n = w * h;
    float *l = malloc(sizeof(float) * n), *bg = malloc(sizeof(float) * n);
    for (int i = 0; i < n; i++) l[i] = 0.299f * px[i * 4] + 0.587f * px[i * 4 + 1] + 0.114f * px[i * 4 + 2];
    /* local paper level: separable max filter (radius ~ 1.5% of size) then box blur */
    int r = (w > h ? w : h) / 64 + 2;
    float *tmp = malloc(sizeof(float) * n);
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { float m = 0; for (int k = -r; k <= r; k++) { int xx = x + k; if (xx >= 0 && xx < w && l[y * w + xx] > m) m = l[y * w + xx]; } tmp[y * w + x] = m; }
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { float m = 0; for (int k = -r; k <= r; k++) { int yy = y + k; if (yy >= 0 && yy < h && tmp[yy * w + x] > m) m = tmp[yy * w + x]; } bg[y * w + x] = m; }
    for (int y = 0; y < h; y++) { float s = 0; int c = 0; for (int x = -r; x < w + r; x++) { if (x + r < w) { s += bg[y * w + x + r]; c++; } if (x - r - 1 >= 0) { s -= bg[y * w + x - r - 1]; c--; } if (x >= 0 && x < w) tmp[y * w + x] = s / (c ? c : 1); } }
    for (int x = 0; x < w; x++) { float s = 0; int c = 0; for (int y = -r; y < h + r; y++) { if (y + r < h) { s += tmp[(y + r) * w + x]; c++; } if (y - r - 1 >= 0) { s -= tmp[(y - r - 1) * w + x]; c--; } if (y >= 0 && y < h) bg[y * w + x] = s / (c ? c : 1); } }
    uint8_t R = (rgb >> 16) & 255, G = (rgb >> 8) & 255, B = rgb & 255;
    for (int i = 0; i < n; i++) {
        float paper = bg[i] < 40 ? 40 : bg[i];
        float d = (paper - l[i]) / paper; /* 0 = paper, 1 = black */
        float lo = 0.10f / strength, hi = 0.45f / strength;
        float t = (d - lo) / (hi - lo); t = t < 0 ? 0 : t > 1 ? 1 : t;
        float a = t * t * (3 - 2 * t);
        uint8_t *p = px + (size_t)i * 4;
        if (!keep_color) { p[0] = R; p[1] = G; p[2] = B; }
        p[3] = (uint8_t)(a * 255 + 0.5f);
    }
    free(l); free(bg); free(tmp);
}

/* Fill a rectangle with a solid colour (0xAABBGGRR little-endian RGBA, as in p_rotate). */
API void p_fill_rect(uint8_t *px, int w, int h, int rx, int ry, int rw, int rh, uint32_t rgba) {
    int x0 = rx < 0 ? 0 : rx, y0 = ry < 0 ? 0 : ry, x1 = rx + rw > w ? w : rx + rw, y1 = ry + rh > h ? h : ry + rh;
    for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) memcpy(px + ((size_t)y * w + x) * 4, &rgba, 4);
}
/* Greedy non-maximum suppression. boxes = n × (x, y, w, h, score) floats. Keeps boxes in descending score order,
   dropping any whose IoU with a kept box exceeds iou_thr or where one box lies mostly (> contain_thr of the smaller
   area) inside the other. Writes kept indices to keep; returns how many. */
API int p_nms(const float *boxes, int n, float iou_thr, float contain_thr, int32_t *keep) {
    int *order = malloc(sizeof(int) * (n ? n : 1)), k = 0;
    for (int i = 0; i < n; i++) order[i] = i;
    for (int i = 1; i < n; i++) { int v = order[i], j = i - 1; while (j >= 0 && boxes[order[j] * 5 + 4] < boxes[v * 5 + 4]) { order[j + 1] = order[j]; j--; } order[j + 1] = v; }
    for (int a = 0; a < n; a++) {
        const float *A = boxes + order[a] * 5;
        int drop = 0;
        for (int b = 0; b < k && !drop; b++) {
            const float *B = boxes + keep[b] * 5;
            float ix = fmaxf(0, fminf(A[0] + A[2], B[0] + B[2]) - fmaxf(A[0], B[0])), iy = fmaxf(0, fminf(A[1] + A[3], B[1] + B[3]) - fmaxf(A[1], B[1]));
            float inter = ix * iy, ua = A[2] * A[3], ub = B[2] * B[3], uni = ua + ub - inter;
            float small = fminf(ua, ub);
            if ((uni > 0 && inter / uni > iou_thr) || (small > 0 && inter / small > contain_thr)) drop = 1; /* either box mostly inside the other */
        }
        if (!drop) keep[k++] = order[a];
    }
    free(order);
    return k;
}

/* Composite the foreground (alpha 0..255) over a background image of the same size: out = fg·a + bg·(1−a). */
API void p_composite_img(uint8_t *rgba, int w, int h, const uint8_t *alpha, const uint8_t *bg) {
    size_t n = (size_t)w * h;
    for (size_t i = 0; i < n; i++) {
        int a = alpha[i];
        for (int k = 0; k < 3; k++) rgba[i * 4 + k] = (uint8_t)((rgba[i * 4 + k] * a + bg[i * 4 + k] * (255 - a) + 127) / 255);
        rgba[i * 4 + 3] = 255;
    }
}

/* Person mask from MediaPipe selfie-multiclass confidences (6 planes w×h: background, hair, body skin, face skin,
   clothes, others/accessories). Person = hair + skin + clothes; "others" counts only near the person (a dilation of
   radius r), so glasses/hats/bags are kept while background objects the model calls "accessory" are dropped. */
API void p_person_mask(const float *cats, int w, int h, int r, uint8_t *out) {
    int n = w * h;
    const float *hair = cats + n, *body = cats + 2 * n, *face = cats + 3 * n, *cloth = cats + 4 * n, *other = cats + 5 * n;
    float *core = malloc(sizeof(float) * n), *tmp = malloc(sizeof(float) * n), *near = malloc(sizeof(float) * n);
    for (int i = 0; i < n; i++) core[i] = hair[i] + body[i] + face[i] + cloth[i];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { float m = 0; for (int k = -r; k <= r; k++) { int xx = x + k; if (xx >= 0 && xx < w && core[y * w + xx] > m) m = core[y * w + xx]; } tmp[y * w + x] = m; }
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { float m = 0; for (int k = -r; k <= r; k++) { int yy = y + k; if (yy >= 0 && yy < h && tmp[yy * w + x] > m) m = tmp[yy * w + x]; } near[y * w + x] = m; }
    for (int i = 0; i < n; i++) {
        float nb = near[i] > 0.5f ? 1.0f : near[i] * 2.0f;
        float v = core[i] + other[i] * nb;
        out[i] = u8(CLAMP(v, 0.0f, 1.0f) * 255.0f);
    }
    free(core); free(tmp); free(near);
}

/* Top-most row (searching downward) where the mask exceeds thr in at least a third of the columns x0..x1:
   the crown (top of hair) above a detected face. Returns -1 if none. */
API int p_mask_top(const uint8_t *mask, int w, int h, int x0, int x1, int thr) {
    if (x0 < 0) x0 = 0; if (x1 > w) x1 = w; if (x1 <= x0) return -1;
    int need = (x1 - x0) / 3 + 1;
    for (int y = 0; y < h; y++) { int c = 0; for (int x = x0; x < x1; x++) if (mask[y * w + x] > thr) c++; if (c >= need) return y; }
    return -1;
}

/* ======================================================================== artistic filters */
/* Separable bilateral approximation (edge-preserving smoothing), applied `iters` times. */
API void p_bilateral(uint8_t *px, int w, int h, int radius, float sigma_s, float sigma_r, int iters) {
    float *f = to_f(px, w * h, 3), *t = malloc(sizeof(float) * (size_t)w * h * 3);
    float ws[64]; if (radius > 31) radius = 31;
    for (int k = -radius; k <= radius; k++) ws[k + radius] = expf(-(k * k) / (2 * sigma_s * sigma_s));
    float ir = -1.0f / (2 * sigma_r * sigma_r);
    for (int it = 0; it < iters; it++) {
        for (int pass = 0; pass < 2; pass++) {
            float *in = pass ? t : f, *out = pass ? f : t;
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                const float *c = in + ((size_t)y * w + x) * 3;
                float sr = 0, sg = 0, sb = 0, sw = 0;
                for (int k = -radius; k <= radius; k++) {
                    int xx = pass ? x : CLAMP(x + k, 0, w - 1), yy = pass ? CLAMP(y + k, 0, h - 1) : y;
                    const float *q = in + ((size_t)yy * w + xx) * 3;
                    float d = (q[0] - c[0]) * (q[0] - c[0]) + (q[1] - c[1]) * (q[1] - c[1]) + (q[2] - c[2]) * (q[2] - c[2]);
                    float wt = ws[k + radius] * expf(d * ir);
                    sr += q[0] * wt; sg += q[1] * wt; sb += q[2] * wt; sw += wt;
                }
                float *o = out + ((size_t)y * w + x) * 3; o[0] = sr / sw; o[1] = sg / sw; o[2] = sb / sw;
            }
        }
    }
    for (int i = 0; i < w * h; i++) for (int c = 0; c < 3; c++) px[i * 4 + c] = u8(f[i * 3 + c]);
    free(f); free(t);
}

static float *luma_f(const uint8_t *px, int n) { float *l = malloc(sizeof(float) * n); for (int i = 0; i < n; i++) l[i] = 0.299f * px[i * 4] + 0.587f * px[i * 4 + 1] + 0.114f * px[i * 4 + 2]; return l; }

/* Edge lines (Winnemöller DoG): D = G_sigma - tau * G_k*sigma on luminance 0..1. Flat areas give D > 0 (no ink); the dark
   side of an edge gives D < 0 → darkness 1 - (1 + tanh(phi * D)). Only real edges get ink, whatever the brightness. */
/* An exact Gaussian (separable, clamped edges, radius 3σ) for one plane: the three-box approximation of gauss_f cannot
   go below σ ≈ 1.4 (one box of radius 1), and the Cartoonizer's finest lines need σ 0.25 – 3 (to-do #16). */
static void gauss_exact_f(float *buf, int w, int h, float sigma) {
    if (sigma <= 0.05f) return;
    int r = (int)ceilf(3 * sigma); if (r < 1) r = 1;
    float *k = malloc(sizeof(float) * (2 * r + 1)), sum = 0;
    for (int i = -r; i <= r; i++) { k[i + r] = expf(-(float)(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
    for (int i = 0; i <= 2 * r; i++) k[i] /= sum;
    float *tmp = malloc(sizeof(float) * (size_t)w * h);
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        float a = 0; for (int i = -r; i <= r; i++) a += k[i + r] * buf[(size_t)y * w + CLAMP(x + i, 0, w - 1)];
        tmp[(size_t)y * w + x] = a;
    }
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        float a = 0; for (int i = -r; i <= r; i++) a += k[i + r] * tmp[(size_t)CLAMP(y + i, 0, h - 1) * w + x];
        buf[(size_t)y * w + x] = a;
    }
    free(tmp); free(k);
}
static void gauss_fine_f(float *buf, int w, int h, float sigma) { if (sigma < 3) gauss_exact_f(buf, w, h, sigma); else gauss_f(buf, w, h, 1, sigma); }
static float *dog_lines(const uint8_t *px, int w, int h, float sigma, float tau, float phi) {
    int n = w * h;
    float *a = luma_f(px, n), *b = malloc(sizeof(float) * n);
    for (int i = 0; i < n; i++) { a[i] /= 255.0f; b[i] = a[i]; }
    gauss_fine_f(a, w, h, sigma); gauss_fine_f(b, w, h, sigma * 1.6f);
    for (int i = 0; i < n; i++) { float d = a[i] - tau * b[i]; a[i] = d >= 0 ? 0.0f : CLAMP(-tanhf(phi * d), 0.0f, 1.0f); }
    free(b);
    return a;
}

/* k-means colour quantisation (k ≤ 32) on a subsample, then nearest-centre mapping. */
static int cmp_u64(const void *a, const void *b) { const uint64_t x = *(const uint64_t *)a, y = *(const uint64_t *)b; return x < y ? -1 : x > y; }
static void kmeans_quantize(uint8_t *px, int n, int k) {
    if (k < 2) return; if (k > 32) k = 32;
    float c[32][3]; int samples = n < 40000 ? n : 40000, step = n / samples;
    /* the starting colours at the k luminance quantiles of the samples: the same picture at another size starts from the
       same colours, so the Cartoonizer's full-size save gets the palette its preview showed (to-do #16 — random pixels
       picked by index started elsewhere at each size and could settle on other colours) */
    uint64_t *pr = malloc(sizeof(uint64_t) * (size_t)samples);
    for (int i = 0; i < samples; i++) { const uint8_t *p = px + (size_t)i * step * 4; pr[i] = ((uint64_t)(p[0] * 77 + p[1] * 150 + p[2] * 29) << 32) | (uint32_t)i; }
    qsort(pr, (size_t)samples, sizeof(uint64_t), cmp_u64);
    for (int i = 0; i < k; i++) { int j = (int)(pr[(size_t)((i + 0.5) * samples / k)] & 0xffffffffu); const uint8_t *p = px + (size_t)j * step * 4; for (int q = 0; q < 3; q++) c[i][q] = p[q]; }
    free(pr);
    for (int it = 0; it < 12; it++) {
        double s[32][3] = {{0}}; int cnt[32] = {0};
        for (int i = 0; i < samples; i++) {
            const uint8_t *p = px + (size_t)i * step * 4; int best = 0; float bd = 1e30f;
            for (int j = 0; j < k; j++) { float d = (p[0] - c[j][0]) * (p[0] - c[j][0]) + (p[1] - c[j][1]) * (p[1] - c[j][1]) + (p[2] - c[j][2]) * (p[2] - c[j][2]); if (d < bd) { bd = d; best = j; } }
            for (int q = 0; q < 3; q++) s[best][q] += p[q]; cnt[best]++;
        }
        for (int j = 0; j < k; j++) if (cnt[j]) for (int q = 0; q < 3; q++) c[j][q] = (float)(s[j][q] / cnt[j]);
    }
    for (int i = 0; i < n; i++) {
        uint8_t *p = px + i * 4; int best = 0; float bd = 1e30f;
        for (int j = 0; j < k; j++) { float d = (p[0] - c[j][0]) * (p[0] - c[j][0]) + (p[1] - c[j][1]) * (p[1] - c[j][1]) + (p[2] - c[j][2]) * (p[2] - c[j][2]); if (d < bd) { bd = d; best = j; } }
        for (int q = 0; q < 3; q++) p[q] = u8(c[best][q]);
    }
}

/* Filter scale: 1 = tuned for a ~1000 px image; sigmas and radii grow with it so a 4000 px save looks like the preview. */
static float fscale(float s) { return s < 0.25f ? 0.25f : s > 6 ? 6 : s; }
static int srad(float r, float s) { int v = (int)(r * fscale(s) + 0.5f); return v < 1 ? 1 : v > 31 ? 31 : v; }

/* Cartoon: smooth (bilateral) → quantise colours → multiply XDoG ink lines. */
API void p_cartoon(uint8_t *px, int w, int h, int colors, float edge_strength, int smooth, float scale) {
    float s = fscale(scale);
    p_bilateral(px, w, h, srad(5, s), 4.0f * s, 28.0f, smooth < 1 ? 1 : smooth);
    float *e = dog_lines(px, w, h, 1.0f * s, 0.985f, 60.0f);
    kmeans_quantize(px, w * h, colors);
    for (int i = 0; i < w * h; i++) { float m = 1 - e[i] * edge_strength; for (int c = 0; c < 3; c++) px[i * 4 + c] = u8(px[i * 4 + c] * m); }
    free(e);
}

/* Kuwahara (oil paint) using integral images of colour and squared luminance. */
API void p_kuwahara(uint8_t *px, int w, int h, int r) {
    size_t W = w + 1, N = W * (h + 1);
    double *S[3], *L = calloc(N, sizeof(double)), *L2 = calloc(N, sizeof(double));
    for (int c = 0; c < 3; c++) S[c] = calloc(N, sizeof(double));
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        const uint8_t *p = px + ((size_t)y * w + x) * 4; double l = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
        size_t i = (y + 1) * W + (x + 1), u = y * W + (x + 1), lft = (y + 1) * W + x, ul = y * W + x;
        for (int c = 0; c < 3; c++) S[c][i] = p[c] + S[c][u] + S[c][lft] - S[c][ul];
        L[i] = l + L[u] + L[lft] - L[ul]; L2[i] = l * l + L2[u] + L2[lft] - L2[ul];
    }
    uint8_t *out = malloc((size_t)w * h * 4);
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        double best = 1e300; double col[3] = {0};
        int qx[4][2] = {{x - r, x}, {x, x + r}, {x - r, x}, {x, x + r}}, qy[4][2] = {{y - r, y}, {y - r, y}, {y, y + r}, {y, y + r}};
        for (int q = 0; q < 4; q++) {
            int x0 = CLAMP(qx[q][0], 0, w - 1), x1 = CLAMP(qx[q][1], 0, w - 1), y0 = CLAMP(qy[q][0], 0, h - 1), y1 = CLAMP(qy[q][1], 0, h - 1);
            double n = (double)(x1 - x0 + 1) * (y1 - y0 + 1);
            size_t a = y0 * W + x0, b = y0 * W + x1 + 1, c = (y1 + 1) * W + x0, d = (y1 + 1) * W + x1 + 1;
            double m = (L[d] - L[b] - L[c] + L[a]) / n, v = (L2[d] - L2[b] - L2[c] + L2[a]) / n - m * m;
            if (v < best) { best = v; for (int k = 0; k < 3; k++) col[k] = (S[k][d] - S[k][b] - S[k][c] + S[k][a]) / n; }
        }
        uint8_t *o = out + ((size_t)y * w + x) * 4; o[0] = u8((float)col[0]); o[1] = u8((float)col[1]); o[2] = u8((float)col[2]); o[3] = px[((size_t)y * w + x) * 4 + 3];
    }
    memcpy(px, out, (size_t)w * h * 4);
    free(out); free(L); free(L2); for (int c = 0; c < 3; c++) free(S[c]);
}

/* Pencil sketch: colour-dodge of greyscale with its blurred inverse; colour=1 tints with the original. */
API void p_sketch(uint8_t *px, int w, int h, float sigma, int color) {
    int n = w * h;
    float *g = luma_f(px, n), *inv = malloc(sizeof(float) * n);
    for (int i = 0; i < n; i++) inv[i] = 255 - g[i];
    gauss_f(inv, w, h, 1, sigma);
    for (int i = 0; i < n; i++) {
        float d = inv[i] >= 254.5f ? 255 : fminf(255, g[i] * 255 / (255 - inv[i]));
        d = 255 - (255 - d) * 1.35f;                          /* deepen strokes */
        d *= 0.5f + 0.5f * fminf(1.0f, g[i] / 110.0f);        /* graphite shading in dark areas (dodge alone turns them white) */
        uint8_t *p = px + i * 4;
        if (color) { float t = d / 255.0f; for (int c = 0; c < 3; c++) p[c] = u8(p[c] * 0.35f * t + d * 0.65f * t + 255 * 0 ); }
        else p[0] = p[1] = p[2] = u8(d);
    }
    free(g); free(inv);
}

/* Watercolour: strong edge-preserving smoothing, soft quantisation, darkened edges and paper grain. */
API void p_watercolor(uint8_t *px, int w, int h, float scale) {
    float s = fscale(scale);
    p_bilateral(px, w, h, srad(5, s), 4.0f * s, 32.0f, 2);
    kmeans_quantize(px, w * h, 20);
    float *e = dog_lines(px, w, h, 1.0f * s, 0.985f, 50.0f);  /* pigment pooling where washes meet */
    gauss_f(e, w, h, 1, 0.8f * s);
    p_blur(px, w, h, 0.9f * s);                                  /* softly bleeding wet edges */
    /* paper: low-frequency fibres (blurred noise) + fine grain */
    float *paper = malloc(sizeof(float) * w * h); uint32_t seed = 99;
    for (int i = 0; i < w * h; i++) { seed = seed * 1664525u + 1013904223u; paper[i] = (seed >> 24) / 255.0f - 0.5f; }
    gauss_f(paper, w, h, 1, 1.5f * s);
    for (int i = 0; i < w * h; i++) {
        float m = 1 - e[i] * 0.6f, t = 1 + paper[i] * 0.5f;
        /* thin the paint toward white (transparent washes), keep the hue */
        for (int c = 0; c < 3; c++) px[i * 4 + c] = u8(255 - (255 - (px[i * 4 + c] * m)) * 0.85f * t);
    }
    free(e); free(paper);
}

/* Comic halftone: posterised colour + dot screen on the shadows + ink lines. */
API void p_halftone(uint8_t *px, int w, int h, int cell, float scale) {
    if (cell < 3) cell = 3;
    float *e = dog_lines(px, w, h, 1.0f * fscale(scale), 0.98f, 80.0f);
    float *l = luma_f(px, w * h);
    kmeans_quantize(px, w * h, 8);
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * w + x;
        /* 45° screen */
        float u = (x + y) / 1.41421356f, v = (x - y) / 1.41421356f;
        float fu = fmodf(u, (float)cell) - cell / 2.0f, fv = fmodf(v, (float)cell) - cell / 2.0f;
        if (fu < -cell / 2.0f) fu += cell; if (fv < -cell / 2.0f) fv += cell;
        float darkness = 1 - l[i] / 255.0f, radius = sqrtf(darkness) * cell * 0.62f;
        int dot = sqrtf(fu * fu + fv * fv) < radius && darkness > 0.25f;
        float m = (dot ? 0.55f : 1.0f) * (1 - e[i]);
        for (int c = 0; c < 3; c++) px[i * 4 + c] = u8(px[i * 4 + c] * m);
    }
    free(e); free(l);
}

/* ======================================================================== redaction */
API void p_pixelate_rect(uint8_t *px, int w, int h, int rx, int ry, int rw, int rh, int block) {
    if (block < 2) block = 2;
    int x0 = CLAMP(rx, 0, w), y0 = CLAMP(ry, 0, h), x1 = CLAMP(rx + rw, 0, w), y1 = CLAMP(ry + rh, 0, h);
    for (int by = y0; by < y1; by += block) for (int bx = x0; bx < x1; bx += block) {
        int ex = bx + block < x1 ? bx + block : x1, ey = by + block < y1 ? by + block : y1;
        unsigned s[4] = {0}, n = 0;
        for (int y = by; y < ey; y++) for (int x = bx; x < ex; x++) { const uint8_t *p = px + ((size_t)y * w + x) * 4; for (int c = 0; c < 4; c++) s[c] += p[c]; n++; }
        for (int y = by; y < ey; y++) for (int x = bx; x < ex; x++) { uint8_t *p = px + ((size_t)y * w + x) * 4; for (int c = 0; c < 4; c++) p[c] = (uint8_t)(s[c] / n); }
    }
}
API void p_blur_rect(uint8_t *px, int w, int h, int rx, int ry, int rw, int rh, float sigma) {
    int x0 = CLAMP(rx, 0, w), y0 = CLAMP(ry, 0, h), x1 = CLAMP(rx + rw, 0, w), y1 = CLAMP(ry + rh, 0, h);
    int cw = x1 - x0, ch = y1 - y0; if (cw <= 0 || ch <= 0) return;
    uint8_t *tile = malloc((size_t)cw * ch * 4);
    for (int y = 0; y < ch; y++) memcpy(tile + (size_t)y * cw * 4, px + ((size_t)(y + y0) * w + x0) * 4, (size_t)cw * 4);
    p_blur(tile, cw, ch, sigma); p_blur(tile, cw, ch, sigma); /* two passes: unrecoverable */
    for (int y = 0; y < ch; y++) memcpy(px + ((size_t)(y + y0) * w + x0) * 4, tile + (size_t)y * cw * 4, (size_t)cw * 4);
    free(tile);
}

/* ======================================================================== matting */
/*
 * Refine a low-resolution foreground probability mask (mw×mh, 0..255) to a full-resolution alpha using a
 * guided filter (He et al.) with the image luminance as guide. r = radius px, eps = regularisation (0..1 scale).
 */
API void p_guided_alpha(const uint8_t *rgba, int w, int h, const uint8_t *mask, int mw, int mh, uint8_t *alpha, int r, float eps) {
    int n = w * h;
    float *I = malloc(sizeof(float) * n), *p = malloc(sizeof(float) * n);
    for (int i = 0; i < n; i++) I[i] = (0.299f * rgba[i * 4] + 0.587f * rgba[i * 4 + 1] + 0.114f * rgba[i * 4 + 2]) / 255.0f;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {               /* bilinear upsample of the mask */
        float fx = (x + 0.5f) * mw / w - 0.5f, fy = (y + 0.5f) * mh / h - 0.5f;
        fx = CLAMP(fx, 0.0f, (float)(mw - 1)); fy = CLAMP(fy, 0.0f, (float)(mh - 1));
        int x0 = (int)fx, y0 = (int)fy, x1 = x0 + 1 < mw ? x0 + 1 : x0, y1 = y0 + 1 < mh ? y0 + 1 : y0;
        float ax = fx - x0, ay = fy - y0;
        p[y * w + x] = ((mask[y0 * mw + x0] * (1 - ax) + mask[y0 * mw + x1] * ax) * (1 - ay) + (mask[y1 * mw + x0] * (1 - ax) + mask[y1 * mw + x1] * ax) * ay) / 255.0f;
    }
    float *mI = malloc(sizeof(float) * n), *mp = malloc(sizeof(float) * n), *mIp = malloc(sizeof(float) * n), *mII = malloc(sizeof(float) * n), *tmp = malloc(sizeof(float) * n);
    for (int i = 0; i < n; i++) { mIp[i] = I[i] * p[i]; mII[i] = I[i] * I[i]; }
    memcpy(mI, I, sizeof(float) * n); memcpy(mp, p, sizeof(float) * n);
    #define BOX(b) do { box_h(b, tmp, w, h, 1, r); box_v(tmp, b, w, h, 1, r); } while (0)
    BOX(mI); BOX(mp); BOX(mIp); BOX(mII);
    for (int i = 0; i < n; i++) { float cov = mIp[i] - mI[i] * mp[i], var = mII[i] - mI[i] * mI[i]; float a = cov / (var + eps); mIp[i] = a; mII[i] = mp[i] - a * mI[i]; }
    BOX(mIp); BOX(mII);
    #undef BOX
    for (int i = 0; i < n; i++) {
        float q = mIp[i] * I[i] + mII[i];
        q = (q - 0.12f) / 0.76f;                                 /* tighten the soft band */
        alpha[i] = u8(CLAMP(q, 0.0f, 1.0f) * 255.0f);
    }
    free(I); free(p); free(mI); free(mp); free(mIp); free(mII); free(tmp);
}
/* Composite onto a solid colour (0xRRGGBB) or, if blur_sigma > 0, onto a blurred copy of the image. */
API void p_composite(uint8_t *rgba, int w, int h, const uint8_t *alpha, uint32_t rgb, float blur_sigma, int keep_alpha) {
    int n = w * h;
    uint8_t *bgimg = NULL;
    if (blur_sigma > 0) { bgimg = malloc((size_t)n * 4); memcpy(bgimg, rgba, (size_t)n * 4); p_blur(bgimg, w, h, blur_sigma); }
    float br = (rgb >> 16) & 255, bgc = (rgb >> 8) & 255, bb = rgb & 255;
    for (int i = 0; i < n; i++) {
        uint8_t *p = rgba + i * 4; float a = alpha[i] / 255.0f;
        if (keep_alpha) { p[3] = alpha[i]; continue; }
        float r0 = bgimg ? bgimg[i * 4] : br, g0 = bgimg ? bgimg[i * 4 + 1] : bgc, b0 = bgimg ? bgimg[i * 4 + 2] : bb;
        p[0] = u8(p[0] * a + r0 * (1 - a)); p[1] = u8(p[1] * a + g0 * (1 - a)); p[2] = u8(p[2] * a + b0 * (1 - a)); p[3] = 255;
    }
    free(bgimg);
}

/* ======================================================================== documents */
static int otsu(const uint8_t *g, int n) {
    unsigned hist[256] = {0}; for (int i = 0; i < n; i++) hist[g[i]]++;
    double sum = 0; for (int i = 0; i < 256; i++) sum += i * (double)hist[i];
    double sb = 0, wb = 0, best = -1; int th = 128;
    for (int t = 0; t < 256; t++) {
        wb += hist[t]; if (!wb) continue; double wf = n - wb; if (!wf) break;
        sb += t * (double)hist[t]; double mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf);
        if (v > best) { best = v; th = t; }
    }
    return th;
}
/*
 * Detect a document page: work at ≤512 px, Otsu-threshold the blurred luminance, keep the largest bright
 * connected component not touching too much border, take its extreme points (TL,TR,BR,BL) as corners.
 * Writes 8 floats (x,y ×4, original pixel coords). Returns confidence 0..100 (0 = fall back to full image).
 */
API int p_detect_quad(const uint8_t *rgba, int w, int h, float *out) {
    float s = (w > h ? w : h) > 512 ? 512.0f / (w > h ? w : h) : 1.0f;
    int sw = (int)(w * s), sh = (int)(h * s); if (sw < 8 || sh < 8) return 0;
    uint8_t *small = malloc((size_t)sw * sh * 4); p_resize(rgba, w, h, small, sw, sh);
    p_blur(small, sw, sh, 2.0f);
    uint8_t *g = malloc((size_t)sw * sh);
    for (int i = 0; i < sw * sh; i++) g[i] = u8(0.299f * small[i * 4] + 0.587f * small[i * 4 + 1] + 0.114f * small[i * 4 + 2]);
    int th = otsu(g, sw * sh);
    int *lab = calloc((size_t)sw * sh, sizeof(int)), *stack = malloc(sizeof(int) * (size_t)sw * sh);
    int bestLab = 0, bestSize = 0, nl = 0, bestBorder = 0;
    for (int i = 0; i < sw * sh; i++) {
        if (g[i] <= th || lab[i]) continue;
        nl++; int sz = 0, border = 0, sp = 0; stack[sp++] = i; lab[i] = nl;
        while (sp) {
            int q = stack[--sp], x = q % sw, y = q / sw; sz++;
            if (x == 0 || y == 0 || x == sw - 1 || y == sh - 1) border++;
            int nb[4] = {q - 1, q + 1, q - sw, q + sw}, ok[4] = {x > 0, x < sw - 1, y > 0, y < sh - 1};
            for (int k = 0; k < 4; k++) if (ok[k] && !lab[nb[k]] && g[nb[k]] > th) { lab[nb[k]] = nl; stack[sp++] = nb[k]; }
        }
        if (sz > bestSize) { bestSize = sz; bestLab = nl; bestBorder = border; }
    }
    int conf = 0;
    if (bestLab && bestSize > sw * sh / 12 && bestSize < sw * sh * 0.97) {
        float best[4] = {1e9f, -1e9f, -1e9f, 1e9f}; int idx[4] = {0, 0, 0, 0}; /* min(x+y), max(x-y), max(x+y), min(x-y) */
        for (int i = 0; i < sw * sh; i++) if (lab[i] == bestLab) {
            int x = i % sw, y = i / sw; float a = x + y, b = x - y;
            if (a < best[0]) { best[0] = a; idx[0] = i; } if (b > best[1]) { best[1] = b; idx[1] = i; }
            if (a > best[2]) { best[2] = a; idx[2] = i; } if (b < best[3]) { best[3] = b; idx[3] = i; }
        }
        for (int k = 0; k < 4; k++) { out[k * 2] = (idx[k] % sw + 0.5f) / s; out[k * 2 + 1] = (idx[k] / sw + 0.5f) / s; }
        conf = (int)(100.0f * bestSize / (sw * sh)); if (bestBorder > (sw + sh) / 2) conf /= 3; if (conf > 100) conf = 100; if (conf < 1) conf = 1;
    }
    if (conf) {
        /* sanity: the outline must be convex and cover a real part of the photo, else fall back to the whole image */
        float area = 0; int sign = 0, convex = 1;
        for (int k = 0; k < 4; k++) {
            float x0 = out[k * 2], y0 = out[k * 2 + 1], x1 = out[((k + 1) % 4) * 2], y1 = out[((k + 1) % 4) * 2 + 1], x2 = out[((k + 2) % 4) * 2], y2 = out[((k + 2) % 4) * 2 + 1];
            area += x0 * y1 - x1 * y0;
            float cr = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
            int sg = cr > 0 ? 1 : cr < 0 ? -1 : 0;
            if (sg) { if (sign && sg != sign) convex = 0; sign = sg; }
        }
        if (!convex || fabsf(area) / 2 < 0.2f * w * h) conf = 0;
    }
    if (!conf) { out[0] = 0; out[1] = 0; out[2] = w; out[3] = 0; out[4] = w; out[5] = h; out[6] = 0; out[7] = h; }
    free(small); free(g); free(lab); free(stack);
    return conf;
}
/* The page of a photo for reading (the Photo Dictionary and the OCR tab; owner, 21 Nov 2026: a phone's photo of a Kindle
   page must read "extremely well"). Like p_detect_quad, but among every bright region it takes the one most like a page:
   a clean quadrilateral (the region's area against the quadrilateral of its extreme points), of a page's size, not
   running off the photo's edges — so a Kindle's screen inside its black body wins over a light desk around it, and a
   sheet of paper over the table. Several thresholds around Otsu's are tried (a lamp's glare can light the black body
   between the screen and the desk at one of them). out = TL, TR, BR, BL in photo pixels; returns 1 – 100 (how clean
   the quadrilateral is), 0 when there is none. */
static float page_try(const uint8_t *g, int sw, int sh, int th, int *lab, int *stack, float *q) {
    int n = sw * sh, nl = 0; float best = 0;
    memset(lab, 0, sizeof(int) * (size_t)n);
    for (int i = 0; i < n; i++) {
        if (g[i] <= th || lab[i]) continue;
        nl++; int sz = 0, border = 0, sp = 0; stack[sp++] = i; lab[i] = nl;
        float e[4] = {1e9f, -1e9f, -1e9f, 1e9f}; int ix[4] = {i, i, i, i};
        while (sp) {
            int p = stack[--sp], x = p % sw, y = p / sw; sz++;
            if (x == 0 || y == 0 || x == sw - 1 || y == sh - 1) border++;
            float a = (float)(x + y), b = (float)(x - y);
            if (a < e[0]) { e[0] = a; ix[0] = p; } if (b > e[1]) { e[1] = b; ix[1] = p; }
            if (a > e[2]) { e[2] = a; ix[2] = p; } if (b < e[3]) { e[3] = b; ix[3] = p; }
            int nb[4] = {p - 1, p + 1, p - sw, p + sw}, ok[4] = {x > 0, x < sw - 1, y > 0, y < sh - 1};
            for (int k = 0; k < 4; k++) if (ok[k] && !lab[nb[k]] && g[nb[k]] > th) { lab[nb[k]] = nl; stack[sp++] = nb[k]; }
        }
        if (sz < n / 25) continue;                              /* a page is at least 4 % of the photo */
        float c[8], area = 0; int sign = 0, convex = 1;
        for (int k = 0; k < 4; k++) { c[k * 2] = (float)(ix[k] % sw) + 0.5f; c[k * 2 + 1] = (float)(ix[k] / sw) + 0.5f; }
        for (int k = 0; k < 4; k++) {
            float x0 = c[k * 2], y0 = c[k * 2 + 1], x1 = c[((k + 1) % 4) * 2], y1 = c[((k + 1) % 4) * 2 + 1], x2 = c[((k + 2) % 4) * 2], y2 = c[((k + 2) % 4) * 2 + 1];
            area += x0 * y1 - x1 * y0;
            float cr = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
            int sg = cr > 0 ? 1 : cr < 0 ? -1 : 0;
            if (sg) { if (sign && sg != sign) convex = 0; sign = sg; }
        }
        area = fabsf(area) / 2;
        if (!convex || area < n * 0.04f || area > n * 0.985f) continue;
        float fill = sz / area; if (fill > 1) fill = 1;          /* a page with its lines of text: about 0.7 – 1 */
        /* a page has something darker around it (a table, a body); a region with light paper all round is a part of a
           larger page — a newspaper's column when the paper runs off the photo — and the whole photo is the page */
        int out = 0, light = 0; float off = 0.03f * (sw > sh ? sw : sh);
        for (int k = 0; k < 4; k++) {
            float x0 = c[k * 2], y0 = c[k * 2 + 1], x1 = c[((k + 1) % 4) * 2], y1 = c[((k + 1) % 4) * 2 + 1];
            float len = sqrtf((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)); if (len < 1) continue;
            float nx = (y1 - y0) / len, ny = -(x1 - x0) / len;   /* outwards (the corners go round clockwise) */
            for (int j = 1; j < 20; j++) {
                int px = (int)(x0 + (x1 - x0) * j / 20.0f + nx * off), py = (int)(y0 + (y1 - y0) * j / 20.0f + ny * off);
                if (px < 0 || py < 0 || px >= sw || py >= sh) continue;
                out++; if (g[py * sw + px] > th) light++;
            }
        }
        if (out >= 16 && light > out * 0.6f) continue;
        float score = sz * fill * fill * fill * (border > (sw + sh) / 50 ? 0.15f : 1.0f);
        if (score > best) { best = score; memcpy(q, c, sizeof c); q[8] = fill; }
    }
    return best;
}
/* The screen inside a dark body (a Kindle, a phone, a tablet): the largest dark region that does not touch the photo's
   edges, and the light pixels inside the quadrilateral of its extreme points; their extreme points are the screen's
   corners. Works where a lamp's glare joins the screen to a light desk across the body (the light regions are one). */
static float page_in_frame(const uint8_t *g, int sw, int sh, int th, int *lab, int *stack, float *q) {
    int n = sw * sh, nl = 0, bestSz = 0; float bq[8];
    memset(lab, 0, sizeof(int) * (size_t)n);
    for (int i = 0; i < n; i++) {
        if (g[i] > th || lab[i]) continue;
        nl++; int sz = 0, border = 0, sp = 0; stack[sp++] = i; lab[i] = nl;
        float e[4] = {1e9f, -1e9f, -1e9f, 1e9f}; int ix[4] = {i, i, i, i};
        while (sp) {
            int p = stack[--sp], x = p % sw, y = p / sw; sz++;
            if (x == 0 || y == 0 || x == sw - 1 || y == sh - 1) border++;
            float a = (float)(x + y), b = (float)(x - y);
            if (a < e[0]) { e[0] = a; ix[0] = p; } if (b > e[1]) { e[1] = b; ix[1] = p; }
            if (a > e[2]) { e[2] = a; ix[2] = p; } if (b < e[3]) { e[3] = b; ix[3] = p; }
            int nb[4] = {p - 1, p + 1, p - sw, p + sw}, ok[4] = {x > 0, x < sw - 1, y > 0, y < sh - 1};
            for (int k = 0; k < 4; k++) if (ok[k] && !lab[nb[k]] && g[nb[k]] <= th) { lab[nb[k]] = nl; stack[sp++] = nb[k]; }
        }
        if (border > (sw + sh) / 50 || sz < n / 30 || sz <= bestSz) continue;
        bestSz = sz;
        for (int k = 0; k < 4; k++) { bq[k * 2] = (float)(ix[k] % sw) + 0.5f; bq[k * 2 + 1] = (float)(ix[k] / sw) + 0.5f; }
    }
    if (!bestSz) return 0;
    /* the light pixels inside the body's quadrilateral (a point is inside when it is on the same side of all four edges) */
    float e[4] = {1e9f, -1e9f, -1e9f, 1e9f}; int ix[4] = {-1, -1, -1, -1}, cnt = 0;
    for (int y = 0; y < sh; y++) for (int x = 0; x < sw; x++) {
        int i = y * sw + x; if (g[i] <= th) continue;
        int in = 1, sg = 0;
        for (int k = 0; k < 4 && in; k++) {
            float x1 = bq[k * 2], y1 = bq[k * 2 + 1], x2 = bq[((k + 1) % 4) * 2], y2 = bq[((k + 1) % 4) * 2 + 1];
            float cr = (x2 - x1) * (y + 0.5f - y1) - (y2 - y1) * (x + 0.5f - x1);
            int s2 = cr > 0 ? 1 : cr < 0 ? -1 : 0;
            if (s2) { if (sg && s2 != sg) in = 0; sg = s2; }
        }
        if (!in) continue;
        cnt++;
        float a = (float)(x + y), b = (float)(x - y);
        if (a < e[0]) { e[0] = a; ix[0] = i; } if (b > e[1]) { e[1] = b; ix[1] = i; }
        if (a > e[2]) { e[2] = a; ix[2] = i; } if (b < e[3]) { e[3] = b; ix[3] = i; }
    }
    if (cnt < n / 25 || ix[0] < 0) return 0;
    float c[8], area = 0;
    for (int k = 0; k < 4; k++) { c[k * 2] = (float)(ix[k] % sw) + 0.5f; c[k * 2 + 1] = (float)(ix[k] / sw) + 0.5f; }
    for (int k = 0; k < 4; k++) area += c[k * 2] * c[((k + 1) % 4) * 2 + 1] - c[((k + 1) % 4) * 2] * c[k * 2 + 1];
    area = fabsf(area) / 2;
    if (area < n * 0.04f) return 0;
    float fill = cnt / area; if (fill > 1) fill = 1;
    memcpy(q, c, sizeof c); q[8] = fill;
    return cnt * fill * fill * fill;
}
API int p_page_quad(const uint8_t *rgba, int w, int h, float *out) {
    float s = (w > h ? w : h) > 512 ? 512.0f / (w > h ? w : h) : 1.0f;
    int sw = (int)(w * s), sh = (int)(h * s); if (sw < 8 || sh < 8) return 0;
    uint8_t *small = malloc((size_t)sw * sh * 4); p_resize(rgba, w, h, small, sw, sh);
    p_blur(small, sw, sh, 1.5f);
    uint8_t *g = malloc((size_t)sw * sh);
    for (int i = 0; i < sw * sh; i++) g[i] = u8(0.299f * small[i * 4] + 0.587f * small[i * 4 + 1] + 0.114f * small[i * 4 + 2]);
    int th = otsu(g, sw * sh);
    int *lab = malloc(sizeof(int) * (size_t)sw * sh), *stack = malloc(sizeof(int) * (size_t)sw * sh);
    float best = 0, q[9], bq[9] = {0};
    const int steps[5] = {0, 20, 40, -20, 60};
    for (int k = 0; k < 5; k++) {
        int t = th + steps[k]; if (t < 16 || t > 240) continue;
        float sc = page_try(g, sw, sh, t, lab, stack, q);
        if (sc > best) { best = sc; memcpy(bq, q, sizeof q); }
    }
    { float sc = page_in_frame(g, sw, sh, th, lab, stack, q); if (sc > best) { best = sc; memcpy(bq, q, sizeof q); } }
    int conf = 0;
    if (best > 0) {
        for (int k = 0; k < 8; k++) out[k] = bq[k] / s;
        conf = (int)(100 * bq[8]); if (conf < 1) conf = 1; if (conf > 100) conf = 100;
    } else { out[0] = 0; out[1] = 0; out[2] = (float)w; out[3] = 0; out[4] = (float)w; out[5] = (float)h; out[6] = 0; out[7] = (float)h; }
    free(small); free(g); free(lab); free(stack);
    return conf;
}
/* How much of a picture is exactly flat (a pixel equal to its right and lower neighbours in R, G and B), in 1/10000 of
   it. A camera's photo has noise everywhere (about 0); a screenshot, a scan made by a program, a drawing has large flat
   areas — the reading tabs leave such a picture as it is (it is square on already). */
API int p_flat_share(const uint8_t *px, int w, int h) {
    if (w < 2 || h < 2) return 0;
    long long flat = 0, n = 0;                                   /* 64 bits: long is 32 in WebAssembly */
    for (int y = 0; y < h - 1; y += 2) for (int x = 0; x < w - 1; x += 2) {
        const uint8_t *a = px + ((size_t)y * w + x) * 4, *r = a + 4, *d = a + (size_t)w * 4;
        n++;
        if (a[0] == r[0] && a[1] == r[1] && a[2] == r[2] && a[0] == d[0] && a[1] == d[1] && a[2] == d[2]) flat++;
    }
    return n ? (int)(flat * 10000 / n) : 0;
}
/* What lay round the page, left along its edges once it is straightened (to-do #18): an outline a few pixels outside
   the page (the Doc Scanner's network looks at 224 px; a soft photo's blur), a screen's dark bezel. With such a dark
   strip down its side Tesseract read a form without its title (laid out as one block). Along each edge, in 16 pieces,
   the lines from the border inward that are mostly dark against the paper — three quarters of the piece below three
   quarters of the paper's brightness (the 80th percentile of the page) — up to maxfrac of the page, and the line after
   them (the strip's soft edge), are painted the paper's colour. Text never darkens three quarters of a line, and a strip
   has to start at the border. A dark page (light text on a dark ground) is left alone. Returns the pixels painted. */
API int p_clear_border(uint8_t *px, int w, int h, float maxfrac) {
    if (w < 32 || h < 32) return 0;
    int n = w * h;
    uint32_t hist[256] = {0};
    for (int i = 0; i < n; i++) { const uint8_t *p = px + (size_t)i * 4; hist[(77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8]++; }
    int p80 = 255; { long long acc = 0; for (int v = 0; v < 256; v++) { acc += hist[v]; if (acc * 100 >= (long long)n * 80) { p80 = v; break; } } }
    if (p80 < 96) return 0;
    double sr = 0, sg = 0, sb = 0; long long cnt = 0;
    for (int i = 0; i < n; i += 3) {
        const uint8_t *p = px + (size_t)i * 4; int l = (77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8;
        if (l >= p80 - 8 && l <= p80 + 8) { sr += p[0]; sg += p[1]; sb += p[2]; cnt++; }
    }
    if (!cnt) return 0;
    uint8_t paper[4] = { (uint8_t)(sr / cnt), (uint8_t)(sg / cnt), (uint8_t)(sb / cnt), 255 };
    int dark = p80 * 3 / 4, painted = 0;
    for (int side = 0; side < 4; side++) {
        int along = side < 2 ? w : h, across = side < 2 ? h : w, maxd = (int)(maxfrac * across);
        for (int sg2 = 0; sg2 < 16; sg2++) {
            int a0 = along * sg2 / 16, a1 = along * (sg2 + 1) / 16, len = a1 - a0, depth = 0;
            if (len < 4) continue;
            for (int d = 0; d < maxd; d++) {
                int nd = 0;
                for (int a = a0; a < a1; a++) {
                    int x = side == 0 || side == 1 ? a : side == 2 ? d : w - 1 - d, y = side == 0 ? d : side == 1 ? h - 1 - d : a;
                    const uint8_t *p = px + ((size_t)y * w + x) * 4;
                    if (((77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8) < dark) nd++;
                }
                if (nd * 4 < len * 3) break;
                depth = d + 1;
            }
            if (!depth) continue;
            if (depth < across) depth++;
            for (int d = 0; d < depth; d++) for (int a = a0; a < a1; a++) {
                int x = side == 0 || side == 1 ? a : side == 2 ? d : w - 1 - d, y = side == 0 ? d : side == 1 ? h - 1 - d : a;
                memcpy(px + ((size_t)y * w + x) * 4, paper, 4);
            }
            painted += depth * len;
        }
    }
    return painted;
}
/* Is this outline the edge of a page? (to-do #18: the page finders of the reading tabs — the Kindle finder above and
   the Doc Scanner's network — each take a wrong outline at times: a region inside the page, a corner in the Kindle's
   bezel.) Across each edge of quad (TL, TR, BR, BL, px) the brightness steps from inside to outside: a page or a screen
   is lighter than what lies around it. out[e] = the median of (inside − outside) luma, 3×3 means at d = dfrac × the
   shorter side either side of the edge, over 41 points of its middle 80 %; 9999 when fewer than 10 points have an
   outside in the picture (the edge lies along the photo's border: the page runs off it). */
static float qs_luma(const uint8_t *px, int w, int h, float x, float y) {
    int xi = (int)lroundf(x), yi = (int)lroundf(y);
    if (xi < 1 || yi < 1 || xi >= w - 1 || yi >= h - 1) return -1.0f;
    float s = 0;
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { const uint8_t *p = px + ((size_t)(yi + dy) * w + xi + dx) * 4; s += 0.299f * p[0] + 0.587f * p[1] + 0.114f * p[2]; }
    return s / 9.0f;
}
static int qs_cmp(const void *a, const void *b) { float x = *(const float *)a, y = *(const float *)b; return (x > y) - (x < y); }
/* the step across the segment a → b, inside being the side of (cx, cy): at each of 41 points of its middle 80 %, the
   brightest within 2 … d px inside it (the paper between letters: text just inside a page's edge, a footer, is no step)
   less the median of d/2 … 3d/2 px outside it (what lies around the page, robust to specks; from d/2: an outline a
   little inside the page still finds it); the median of those; 9999 when fewer than 10 points have both sides in the
   picture */
static int qs_fcmp(const void *a, const void *b) { float x = *(const float *)a, y = *(const float *)b; return (x > y) - (x < y); }
static int qs_segment(const uint8_t *px, int w, int h, float ax, float ay, float bx, float by, float cx, float cy, float d) {
    float nx = -(by - ay), ny = bx - ax, len = sqrtf(nx * nx + ny * ny), v[41];
    if (len < 1e-3f) return 0;
    nx /= len; ny /= len;
    if ((cx - (ax + bx) / 2) * nx + (cy - (ay + by) / 2) * ny < 0) { nx = -nx; ny = -ny; }       /* n points inside */
    int k = 0, D = (int)d, D2 = D / 2 > 1 ? D / 2 : 1;
    float o[128];
    for (int s = 0; s <= 40; s++) {
        float t = 0.1f + 0.8f * s / 40, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, in = -1;
        int no = 0, off = 0;
        for (int b = 2; b <= D && !off; b++) { float vi = qs_luma(px, w, h, x + nx * b, y + ny * b); if (vi < 0) off = 1; else if (vi > in) in = vi; }
        for (int b = D2; b <= D + D2 && !off && no < 128; b++) { float vo = qs_luma(px, w, h, x - nx * b, y - ny * b); if (vo < 0) off = 1; else o[no++] = vo; }
        if (off || in < 0 || !no) continue;                                                     /* a side leaves the picture */
        qsort(o, no, sizeof(float), qs_fcmp);
        v[k++] = in - o[no / 2];
    }
    if (k < 10) return 9999;
    qsort(v, k, sizeof(float), qs_cmp);
    return (int)lroundf(v[k / 2]);
}
API void p_quad_steps(const uint8_t *px, int w, int h, const float *q, float dfrac, int32_t *out) {
    float d = dfrac * (w < h ? w : h); if (d < 3) d = 3;
    float cx = (q[0] + q[2] + q[4] + q[6]) / 4, cy = (q[1] + q[3] + q[5] + q[7]) / 4;
    for (int e = 0; e < 4; e++) out[e] = qs_segment(px, w, h, q[e * 2], q[e * 2 + 1], q[((e + 1) % 4) * 2], q[((e + 1) % 4) * 2 + 1], cx, cy, d);
}
/* The Doc Scanner's network gives a page's corners from a 224 × 224 look at the photo: a little off, and when the page
   runs off the photo, a corner put where its edge leaves the picture — straightened like that, the text is sheared (to-do
   #18: a page photographed close up read 63 % of its words with the Kindle finder's wrong outline, 41 % with the
   network's). Each edge is refined against the photo: along it, the place across it (within ±search px) where the
   brightness steps most from outside to inside — bands of a few pixels either side, so that a letter's stroke near the
   edge is no step — at least 20 levels; a line is fitted to those points (least squares, then again without the points
   more than 2 px off); an edge with fewer than 12 such points keeps its line. The corners are where the lines meet —
   outside the photo where the page runs off it. out[8]: the corners; returns the edges refitted (0: out = q, the
   lines did not make a sensible page). */
static int rq_fit(const float *xs, const float *ys, int n, float *nx, float *ny, float *d) {
    if (n < 2) return 0;
    double mx = 0, my = 0; for (int i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n;
    double sxx = 0, sxy = 0, syy = 0; for (int i = 0; i < n; i++) { double dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    double th = 0.5 * atan2(2 * sxy, sxx - syy);                 /* the direction of most spread */
    *nx = (float)-sin(th); *ny = (float)cos(th); *d = (float)(*nx * mx + *ny * my);
    return 1;
}
API int p_refine_quad(const uint8_t *px, int w, int h, const float *q, float search, float *out) {
    for (int k = 0; k < 8; k++) out[k] = q[k];
    float cx = (q[0] + q[2] + q[4] + q[6]) / 4, cy = (q[1] + q[3] + q[5] + q[7]) / 4;
    float band = 0.006f * (w < h ? w : h); if (band < 3) band = 3;
    int S = (int)search; if (S < 4) S = 4;
    float LN[4][3]; int fitted = 0, have[4] = {0};
    float xs[80], ys[80];
    for (int e = 0; e < 4; e++) {
        float ax = q[e * 2], ay = q[e * 2 + 1], bx = q[((e + 1) % 4) * 2], by = q[((e + 1) % 4) * 2 + 1];
        float nx = -(by - ay), ny = bx - ax, len = sqrtf(nx * nx + ny * ny);
        if (len < 8) continue;
        nx /= len; ny /= len;
        if ((cx - (ax + bx) / 2) * nx + (cy - (ay + by) / 2) * ny < 0) { nx = -nx; ny = -ny; }   /* n points inside */
        int np = 0;
        for (int k = 0; k < 80; k++) {
            float t = 0.04f + 0.92f * k / 79, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, best = 20, bs = 1e9f;
            for (int s = -S; s <= S; s++) {
                float in = 0, ou = 0; int ni = 0, no = 0;
                for (int b = 1; b <= (int)band; b++) {
                    float vi = qs_luma(px, w, h, x + nx * (s + b), y + ny * (s + b)), vo = qs_luma(px, w, h, x + nx * (s - b), y + ny * (s - b));
                    if (vi >= 0) { in += vi; ni++; } if (vo >= 0) { ou += vo; no++; }
                }
                if (ni < band * 0.6f || no < band * 0.6f) continue;
                float st = in / ni - ou / no;
                if (st > best) { best = st; bs = (float)s; }
            }
            if (bs < 1e8f) { xs[np] = x + nx * bs; ys[np] = y + ny * bs; np++; }
        }
        if (np < 12) continue;
        float lx, ly, ld;
        if (!rq_fit(xs, ys, np, &lx, &ly, &ld)) continue;
        int m = 0; for (int i = 0; i < np; i++) if (fabsf(lx * xs[i] + ly * ys[i] - ld) <= 2.0f) { xs[m] = xs[i]; ys[m] = ys[i]; m++; }
        if (m < 12 || !rq_fit(xs, ys, m, &lx, &ly, &ld)) continue;
        /* kept only when it is at least as clearly a page's edge as the line it replaces (a footer's rule, a desk's grain
           can step more than the paper here and there): the step across it — between where the edge's ends fall on it —
           against the step across the edge as given */
        float d = 0.015f * (w < h ? w : h); if (d < 3) d = 3;
        float pa = lx * ax + ly * ay - ld, pb = lx * bx + ly * by - ld;
        int now = qs_segment(px, w, h, ax - lx * pa, ay - ly * pa, bx - lx * pb, by - ly * pb, cx, cy, d);
        int was = qs_segment(px, w, h, ax, ay, bx, by, cx, cy, d);
        if (now < 20 || (now != 9999 && was != 9999 && was >= 20 && now < 0.7f * was)) continue;
        LN[e][0] = lx; LN[e][1] = ly; LN[e][2] = ld; have[e] = 1; fitted++;
    }
    if (!fitted) return 0;
    for (int e = 0; e < 4; e++) if (!have[e]) {                          /* an edge not refitted keeps its own line */
        float ax = q[e * 2], ay = q[e * 2 + 1], bx = q[((e + 1) % 4) * 2], by = q[((e + 1) % 4) * 2 + 1];
        float nx = -(by - ay), ny = bx - ax, len = sqrtf(nx * nx + ny * ny); if (len < 1e-3f) return 0;
        LN[e][0] = nx / len; LN[e][1] = ny / len; LN[e][2] = LN[e][0] * ax + LN[e][1] * ay;
    }
    /* an edge the photo does not show (the page runs off it there: the edge as given lies along the photo's border) is
       taken parallel to the opposite edge, through the farther of the points where the edges beside it leave the photo —
       the border itself as the page's edge would distort the text from one side of the page to the other */
    float tol = 0.02f * (w > h ? w : h);
    for (int e = 0; e < 4; e++) {
        int o = (e + 2) % 4; if (have[e] || !have[o]) continue;
        float ax = q[e * 2], ay = q[e * 2 + 1], bx = q[((e + 1) % 4) * 2], by = q[((e + 1) % 4) * 2 + 1], B[3];
        if (ay <= tol && by <= tol) { B[0] = 0; B[1] = 1; B[2] = 0; }                       /* along the top */
        else if (ay >= h - 1 - tol && by >= h - 1 - tol) { B[0] = 0; B[1] = 1; B[2] = (float)(h - 1); }
        else if (ax <= tol && bx <= tol) { B[0] = 1; B[1] = 0; B[2] = 0; }
        else if (ax >= w - 1 - tol && bx >= w - 1 - tol) { B[0] = 1; B[1] = 0; B[2] = (float)(w - 1); }
        else continue;
        float best = -1, px0 = 0, py0 = 0;
        for (int sd = 0; sd < 2; sd++) {                                  /* the edges beside it: e − 1 and e + 1 */
            float *a = LN[sd ? (e + 1) % 4 : (e + 3) % 4], det = a[0] * B[1] - a[1] * B[0];
            if (fabsf(det) < 0.05f) continue;
            float x = (a[2] * B[1] - a[1] * B[2]) / det, y = (a[0] * B[2] - a[2] * B[0]) / det, dist = fabsf(LN[o][0] * x + LN[o][1] * y - LN[o][2]);
            if (dist > best) { best = dist; px0 = x; py0 = y; }
        }
        if (best < 0) continue;
        LN[e][0] = LN[o][0]; LN[e][1] = LN[o][1]; LN[e][2] = LN[o][0] * px0 + LN[o][1] * py0;
    }
    float c[8], lim = 0.3f * (w > h ? w : h);
    for (int i = 0; i < 4; i++) {                                        /* corner i: edges i − 1 and i */
        float *a = LN[(i + 3) % 4], *b = LN[i], det = a[0] * b[1] - a[1] * b[0];
        if (fabsf(det) < 0.05f) return 0;                                /* (nearly) parallel: no corner */
        c[i * 2] = (a[2] * b[1] - a[1] * b[2]) / det; c[i * 2 + 1] = (a[0] * b[2] - a[2] * b[0]) / det;
        if (fabsf(c[i * 2] - q[i * 2]) > lim || fabsf(c[i * 2 + 1] - q[i * 2 + 1]) > lim) return 0;
    }
    for (int i = 0; i < 4; i++) {                                        /* still a convex page, corners in the same order */
        float x1 = c[((i + 1) % 4) * 2] - c[i * 2], y1 = c[((i + 1) % 4) * 2 + 1] - c[i * 2 + 1], x2 = c[((i + 2) % 4) * 2] - c[((i + 1) % 4) * 2], y2 = c[((i + 2) % 4) * 2 + 1] - c[((i + 1) % 4) * 2 + 1];
        if (x1 * y2 - y1 * x2 <= 0) return 0;
    }
    for (int k = 0; k < 8; k++) out[k] = c[k];
    return fitted;
}
/* Where the text of a picture is: the ww × wh window holding the most ink (to-do #18 — the quick readings that decide
   which way up a page stands read one window of it; the middle of a form or a short letter is blank paper, and a
   reading of nothing decided an upright page was upside down). Looked at on a copy about 400 px long: ink = clearly
   darker than the mean of its neighbourhood. out[0], out[1]: the window's top-left corner in the picture's pixels (the
   middle when nothing stands out); returns the ink in the window, in 1/10000 of the window. */
API int p_ink_window(const uint8_t *px, int w, int h, int ww, int wh, int32_t *out) {
    out[0] = (w - ww) / 2 > 0 ? (w - ww) / 2 : 0; out[1] = (h - wh) / 2 > 0 ? (h - wh) / 2 : 0;
    if (ww >= w && wh >= h) return 0;
    int f = (w > h ? w : h) / 400; if (f < 1) f = 1;
    int gw = w / f, gh = h / f; if (gw < 8 || gh < 8) return 0;
    float *g = malloc(sizeof(float) * gw * gh); double *ii = malloc(sizeof(double) * (gw + 1) * (gh + 1)); int *ink = malloc(sizeof(int) * (gw + 1) * (gh + 1));
    if (!g || !ii || !ink) { free(g); free(ii); free(ink); return 0; }
    for (int y = 0; y < gh; y++) for (int x = 0; x < gw; x++) {
        float sum = 0;
        for (int dy = 0; dy < f; dy++) for (int dx = 0; dx < f; dx++) { const uint8_t *p = px + ((size_t)(y * f + dy) * w + x * f + dx) * 4; sum += 0.299f * p[0] + 0.587f * p[1] + 0.114f * p[2]; }
        g[y * gw + x] = sum / (f * f);
    }
    for (int x = 0; x <= gw; x++) ii[x] = 0;
    for (int y = 0; y < gh; y++) { double row = 0; ii[(y + 1) * (gw + 1)] = 0; for (int x = 0; x < gw; x++) { row += g[y * gw + x]; ii[(y + 1) * (gw + 1) + x + 1] = ii[y * (gw + 1) + x + 1] + row; } }
    int r = (gw < gh ? gw : gh) / 30; if (r < 3) r = 3;
    for (int x = 0; x <= gw; x++) ink[x] = 0;
    for (int y = 0; y < gh; y++) {
        int y0 = y - r < 0 ? 0 : y - r, y1 = y + r + 1 > gh ? gh : y + r + 1, row = 0; ink[(y + 1) * (gw + 1)] = 0;
        for (int x = 0; x < gw; x++) {
            int x0 = x - r < 0 ? 0 : x - r, x1 = x + r + 1 > gw ? gw : x + r + 1;
            double m = (ii[y1 * (gw + 1) + x1] - ii[y0 * (gw + 1) + x1] - ii[y1 * (gw + 1) + x0] + ii[y0 * (gw + 1) + x0]) / ((x1 - x0) * (y1 - y0));
            double d = m * 0.12 < 14 ? 14 : m * 0.12;
            row += g[y * gw + x] < m - d;
            ink[(y + 1) * (gw + 1) + x + 1] = ink[y * (gw + 1) + x + 1] + row;
        }
    }
    int sw = ww / f, sh = wh / f; if (sw > gw) sw = gw; if (sh > gh) sh = gh; if (sw < 1) sw = 1; if (sh < 1) sh = 1;
    int best = -1, bx = (gw - sw) / 2, by = (gh - sh) / 2;
    float cx = (gw - sw) / 2.0f, cy = (gh - sh) / 2.0f;
    double bd = 1e30;
    for (int y = 0; y + sh <= gh; y++) for (int x = 0; x + sw <= gw; x++) {
        int v = ink[(y + sh) * (gw + 1) + x + sw] - ink[y * (gw + 1) + x + sw] - ink[(y + sh) * (gw + 1) + x] + ink[y * (gw + 1) + x];
        double dd = (x - cx) * (x - cx) + (y - cy) * (y - cy);       /* of equal windows, the one nearest the middle */
        if (v > best || (v == best && dd < bd)) { best = v; bx = x; by = y; bd = dd; }
    }
    free(g); free(ii); free(ink);
    if (best <= 0) return 0;
    out[0] = bx * f; out[1] = by * f;
    if (out[0] + ww > w) out[0] = w - ww > 0 ? w - ww : 0; if (out[1] + wh > h) out[1] = h - wh > 0 ? h - wh : 0;
    return (int)((long long)best * 10000 / ((long long)sw * sh));
}
/* Perspective warp: H (row-major 3x3) maps destination (x,y,1) to source coordinates. */
API void p_warp(const uint8_t *src, int sw, int sh, uint8_t *dst, int dw, int dh, const float *H);
/* 3×3 homography (row-major, h33 = 1) mapping the dw×dh output rectangle onto the quad q = TL,TR,BR,BL (x,y pairs).
   8×8 linear system solved by Gaussian elimination with partial pivoting (double precision). Returns 0 if singular. */
static int quad_homography(const float *q, int dw, int dh, float *H) {
    double A[8][9];
    const double from[4][2] = {{0, 0}, {dw, 0}, {dw, dh}, {0, dh}};
    for (int i = 0; i < 4; i++) {
        double x = from[i][0], y = from[i][1], u = q[i * 2], v = q[i * 2 + 1];
        double r0[9] = {x, y, 1, 0, 0, 0, -u * x, -u * y, u}, r1[9] = {0, 0, 0, x, y, 1, -v * x, -v * y, v};
        memcpy(A[i * 2], r0, sizeof r0); memcpy(A[i * 2 + 1], r1, sizeof r1);
    }
    for (int c = 0; c < 8; c++) {
        int p = c;
        for (int r = c + 1; r < 8; r++) if (fabs(A[r][c]) > fabs(A[p][c])) p = r;
        if (fabs(A[p][c]) < 1e-12) return 0;
        if (p != c) for (int k = 0; k < 9; k++) { double t = A[c][k]; A[c][k] = A[p][k]; A[p][k] = t; }
        for (int r = 0; r < 8; r++) if (r != c) { double f = A[r][c] / A[c][c]; for (int k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
    }
    for (int i = 0; i < 8; i++) H[i] = (float)(A[i][8] / A[i][i]);
    H[8] = 1;
    return 1;
}
/* Perspective-correct the quad (TL,TR,BR,BL in source px) into a dw×dh image. Returns 0 on a degenerate quad. */
API int p_warp_quad(const uint8_t *src, int sw, int sh, uint8_t *dst, int dw, int dh, const float *quad) {
    float H[9];
    if (!quad_homography(quad, dw, dh, H)) return 0;
    p_warp(src, sw, sh, dst, dw, dh, H);
    return 1;
}
/* Same, with an explicit fill colour (0xAABBGGRR) for areas outside the source. */
API int p_warp_quad_fill(const uint8_t *src, int sw, int sh, uint8_t *dst, int dw, int dh, const float *quad, uint32_t fill) {
    float H[9];
    if (!quad_homography(quad, dw, dh, H)) return 0;
    for (int y = 0; y < dh; y++) for (int x = 0; x < dw; x++) {
        float X = x + 0.5f, Y = y + 0.5f, z = H[6] * X + H[7] * Y + H[8];
        sample_bilinear(src, sw, sh, (H[0] * X + H[1] * Y + H[2]) / z - 0.5f, (H[3] * X + H[4] * Y + H[5]) / z - 0.5f, dst + ((size_t)y * dw + x) * 4, fill);
    }
    return 1;
}
API void p_warp(const uint8_t *src, int sw, int sh, uint8_t *dst, int dw, int dh, const float *H) {
    for (int y = 0; y < dh; y++) for (int x = 0; x < dw; x++) {
        float X = x + 0.5f, Y = y + 0.5f, z = H[6] * X + H[7] * Y + H[8];
        float u = (H[0] * X + H[1] * Y + H[2]) / z - 0.5f, v = (H[3] * X + H[4] * Y + H[5]) / z - 0.5f;
        sample_bilinear(src, sw, sh, u, v, dst + ((size_t)y * dw + x) * 4, 0xffffffffu);
    }
}
/*
 * Document clean-up. mode 0 = colour (flatten lighting, whiten paper), 1 = greyscale, 2 = black & white
 * (adaptive threshold on the flattened image). Background estimated with a large blur of a max-filtered copy.
 */
API void p_doc_enhance(uint8_t *px, int w, int h, int mode) {
    int n = w * h, sw = w / 8 > 1 ? w / 8 : 1, shh = h / 8 > 1 ? h / 8 : 1;
    uint8_t *small = malloc((size_t)sw * shh * 4), *bg = malloc((size_t)n * 4);
    p_resize(px, w, h, small, sw, shh);
    /* dilate (max) to remove text, then blur → paper/lighting estimate */
    uint8_t *dil = malloc((size_t)sw * shh * 4);
    for (int y = 0; y < shh; y++) for (int x = 0; x < sw; x++) for (int c = 0; c < 3; c++) {
        int m = 0; for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { int xx = CLAMP(x + dx, 0, sw - 1), yy = CLAMP(y + dy, 0, shh - 1); int v = small[(yy * sw + xx) * 4 + c]; if (v > m) m = v; }
        dil[(y * sw + x) * 4 + c] = (uint8_t)m; dil[(y * sw + x) * 4 + 3] = 255;
    }
    p_blur(dil, sw, shh, 3.0f);
    p_resize(dil, sw, shh, bg, w, h);
    for (int i = 0; i < n; i++) for (int c = 0; c < 3; c++) {
        float b = bg[i * 4 + c] < 8 ? 8 : bg[i * 4 + c];
        float v = px[i * 4 + c] * 255.0f / b;                    /* divide out the lighting */
        v = (v - 30) * 1.15f;                                    /* crisp blacks, clean whites */
        px[i * 4 + c] = u8(v);
    }
    if (mode >= 1) p_grayscale(px, n);
    if (mode == 2) {
        float *l = luma_f(px, n), *m = malloc(sizeof(float) * n);
        memcpy(m, l, sizeof(float) * n);
        int r = (w > h ? w : h) / 60 + 4;
        float *tmp = malloc(sizeof(float) * n); box_h(m, tmp, w, h, 1, r); box_v(tmp, m, w, h, 1, r); free(tmp);
        for (int i = 0; i < n; i++) { uint8_t v = (l[i] < m[i] * 0.88f && l[i] < 215) || l[i] < 128 ? 0 : 255; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; }
        free(l); free(m);
    }
    free(small); free(bg); free(dil);
}

/* ======================================================================== channel expansion */
/* Grey (1), grey+alpha (2) or RGB (3) samples → RGBA (used to feed PDF images to the resizer / encoders). */
API void p_expand(const uint8_t *src, int n, int comps, uint8_t *dst) {
    for (int i = 0; i < n; i++) {
        const uint8_t *s = src + (size_t)i * comps; uint8_t *d = dst + (size_t)i * 4;
        if (comps == 1) { d[0] = d[1] = d[2] = s[0]; d[3] = 255; }
        else if (comps == 2) { d[0] = d[1] = d[2] = s[0]; d[3] = s[1]; }
        else if (comps == 3) { d[0] = s[0]; d[1] = s[1]; d[2] = s[2]; d[3] = 255; }
        else { d[0] = s[0]; d[1] = s[1]; d[2] = s[2]; d[3] = s[3]; }
    }
}

/* ======================================================================== figure regions (PDF → EPUB) */
/* Ink (luma < thr) on a rendered page after blanking the text boxes `skip` (n × [x, y, w, h] px): dilate by `dil` px,
 * label 8-connected components, return their boxes (x, y, w, h) with area ≥ min_area, at most `max`. */
API int p_ink_regions(const uint8_t *px, int w, int h, int thr, const float *skip, int nskip, int dil, int min_area, int32_t *out, int max) {
    int n = w * h;
    uint8_t *m = calloc(n, 1), *d = calloc(n, 1);
    int32_t *cs = malloc(sizeof(int32_t) * (w + 1)), *stack = malloc(sizeof(int32_t) * n);
    if (!m || !d || !cs || !stack) { free(m); free(d); free(cs); free(stack); return 0; }
    for (int i = 0; i < n; i++) { const uint8_t *p = px + (size_t)i * 4; m[i] = (77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8 < thr; }
    for (int k = 0; k < nskip; k++) {
        int x0 = (int)skip[k * 4], y0 = (int)skip[k * 4 + 1], x1 = (int)(skip[k * 4] + skip[k * 4 + 2] + 1), y1 = (int)(skip[k * 4 + 1] + skip[k * 4 + 3] + 1);
        if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > w) x1 = w; if (y1 > h) y1 = h;
        for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) m[y * w + x] = 0;
    }
    /* dilation: horizontal then vertical box max via running sums */
    uint8_t *t = calloc(n, 1);
    for (int y = 0; y < h; y++) {
        cs[0] = 0; for (int x = 0; x < w; x++) cs[x + 1] = cs[x] + m[y * w + x];
        for (int x = 0; x < w; x++) { int a = x - dil < 0 ? 0 : x - dil, b = x + dil + 1 > w ? w : x + dil + 1; t[y * w + x] = cs[b] - cs[a] > 0; }
    }
    int32_t *cv = malloc(sizeof(int32_t) * (h + 1));
    for (int x = 0; x < w; x++) {
        cv[0] = 0; for (int y = 0; y < h; y++) cv[y + 1] = cv[y] + t[y * w + x];
        for (int y = 0; y < h; y++) { int a = y - dil < 0 ? 0 : y - dil, b = y + dil + 1 > h ? h : y + dil + 1; d[y * w + x] = cv[b] - cv[a] > 0; }
    }
    free(t); free(cv);
    int k = 0;
    for (int s = 0; s < n && k < max; s++) {
        if (d[s] != 1) continue;
        int top = 0, x0 = w, y0 = h, x1 = -1, y1 = -1; stack[top++] = s; d[s] = 2;
        while (top) {
            int i = stack[--top], x = i % w, y = i / w;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                int xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                int j = yy * w + xx; if (d[j] == 1) { d[j] = 2; stack[top++] = j; }
            }
        }
        /* undo the dilation margin */
        x0 += dil; y0 += dil; x1 -= dil; y1 -= dil;
        if (x1 < x0 || y1 < y0) continue;
        if ((x1 - x0 + 1) * (y1 - y0 + 1) >= min_area) { out[k * 4] = x0; out[k * 4 + 1] = y0; out[k * 4 + 2] = x1 - x0 + 1; out[k * 4 + 3] = y1 - y0 + 1; k++; }
    }
    free(m); free(d); free(cs); free(stack);
    return k;
}

/* ======================================================================== which way up the text stands */
/* Owner, 21 Nov 2026: a Kindle page photographed with the phone held sideways (either hand) could not be read. From the
 * picture alone: (1) ink = pixels clearly darker than the mean of their neighbourhood (light text on a dark screen is
 * turned round first); (2) its 8-connected components of letter size; (3) the axis of the lines — a letter's nearest
 * neighbour stands beside it in the line far more often than above or below it (the letters of a word are closer
 * together than the lines are); (4) the direction along that axis — in Latin script more letters rise above the
 * x-height (b d f h k l t, capitals, digits, the dots of i and j) than drop below the baseline (g j p q y): in every
 * run of letters the side more of them stick out of is the top.
 * out[8]: the quarter turns to the right that make the text upright (0–3; as EXIF orientations 1, 6, 3, 8), the
 * neighbour votes along and across the lines, the letters sticking out on the low side (top or left) and on the high
 * side, the letters used, 1 when the lines run across the picture (0: up and down it), and the lines' slant in
 * hundredths of a degree, −45° … 45° from the nearer axis (owner, 21 Nov 2026: a photo taken "at different angles" —
 * the direction of most letters' nearest neighbour; positive: the lines fall to the right). Returns the turns; -1 when
 * the picture holds too little text to say, -2 when the lines' axis is clear but not which end is up (the caller may
 * compare readings). A slanted picture is levelled by the caller first (p_rotate), then asked again. */
typedef struct { int x0, y0, x1, y1, n; } tt_box;
static int tt_cmp(const void *a, const void *b) { int x = *(const int *)a, y = *(const int *)b; return (x > y) - (x < y); }
/* the exact median (the mean of the middle two for an even count): the same band whichever way round the page lies */
static float tt_median(int *v, int n) { qsort(v, n, sizeof(int), tt_cmp); return n % 2 ? (float)v[n / 2] : 0.5f * (v[n / 2 - 1] + v[n / 2]); }
static int tt_find(int *p, int i) { while (p[i] != i) { p[i] = p[p[i]]; i = p[i]; } return i; }

API int p_text_turns(const uint8_t *px, int w, int h, int32_t *out) {
    for (int k = 0; k < 8; k++) out[k] = 0;
    int n = w * h;
    if (w < 32 || h < 32) return -1;
    uint8_t *g = malloc(n), *ink = calloc(n, 1);
    uint32_t *ii = malloc(sizeof(uint32_t) * (size_t)(w + 1) * (h + 1));
    int32_t *stack = malloc(sizeof(int32_t) * n);
    int cap = 40000; tt_box *bx = malloc(sizeof(tt_box) * cap);
    if (!g || !ink || !ii || !stack || !bx) { free(g); free(ink); free(ii); free(stack); free(bx); return -1; }
    unsigned hist[256] = {0};
    for (int i = 0; i < n; i++) { const uint8_t *p = px + (size_t)i * 4; g[i] = (77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8; hist[g[i]]++; }
    { int c = 0, med = 0; while (med < 255 && (c += hist[med]) < n / 2) med++; if (med < 100) for (int i = 0; i < n; i++) g[i] = 255 - g[i]; }
    /* the neighbourhood mean through an integral image; ink is clearly darker than it */
    for (int x = 0; x <= w; x++) ii[x] = 0;
    for (int y = 0; y < h; y++) {
        uint32_t row = 0; ii[(size_t)(y + 1) * (w + 1)] = 0;
        for (int x = 0; x < w; x++) { row += g[y * w + x]; ii[(size_t)(y + 1) * (w + 1) + x + 1] = ii[(size_t)y * (w + 1) + x + 1] + row; }
    }
    int r = (w < h ? w : h) / 40; if (r < 8) r = 8;
    for (int y = 0; y < h; y++) {
        int y0 = y - r < 0 ? 0 : y - r, y1 = y + r + 1 > h ? h : y + r + 1;
        for (int x = 0; x < w; x++) {
            int x0 = x - r < 0 ? 0 : x - r, x1 = x + r + 1 > w ? w : x + r + 1;
            uint32_t s = ii[(size_t)y1 * (w + 1) + x1] - ii[(size_t)y0 * (w + 1) + x1] - ii[(size_t)y1 * (w + 1) + x0] + ii[(size_t)y0 * (w + 1) + x0];
            int m = (int)(s / (uint32_t)((x1 - x0) * (y1 - y0))), d = m * 12 / 100; if (d < 14) d = 14;
            ink[y * w + x] = g[y * w + x] < m - d;
        }
    }
    free(ii); free(g);
    /* letter-sized components */
    int nb = 0;
    for (int s = 0; s < n && nb < cap; s++) {
        if (ink[s] != 1) continue;
        int top = 0, cnt = 0; tt_box b = { w, h, -1, -1, 0 }; stack[top++] = s; ink[s] = 2;
        while (top) {
            int i = stack[--top], x = i % w, y = i / w; cnt++;
            if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                int xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                int j = yy * w + xx; if (ink[j] == 1) { ink[j] = 2; stack[top++] = j; }
            }
        }
        int bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1; b.n = cnt;
        if (cnt >= 3 && bw <= w / 8 && bh <= h / 8 && (bw > 1 || bh > 1)) bx[nb++] = b;
    }
    free(ink); free(stack);
    if (nb < 30) { out[5] = nb; free(bx); return -1; }
    /* the size of a letter: the median of the larger side of the components */
    int *tmp = malloc(sizeof(int) * nb);
    for (int k = 0; k < nb; k++) { int bw = bx[k].x1 - bx[k].x0 + 1, bh = bx[k].y1 - bx[k].y0 + 1; tmp[k] = bw > bh ? bw : bh; }
    int sz = (int)(tt_median(tmp, nb) + 0.5f); if (sz < 3) sz = 3;
    /* letters: from half to three times that size (dots, specks, pictures and rules left out) */
    int nl = 0;
    for (int k = 0; k < nb; k++) { int bw = bx[k].x1 - bx[k].x0 + 1, bh = bx[k].y1 - bx[k].y0 + 1, m = bw > bh ? bw : bh; if (2 * m >= sz && m <= 3 * sz) bx[nl++] = bx[k]; }
    out[5] = nl;
    if (nl < 30) { free(tmp); free(bx); return -1; }
    /* nearest neighbours through a grid of cells 2 letters wide */
    int cs = 2 * sz, gw = w / cs + 1, gh = h / cs + 1;
    int *head = malloc(sizeof(int) * gw * gh), *next = malloc(sizeof(int) * nl);
    for (int c = 0; c < gw * gh; c++) head[c] = -1;
    for (int k = 0; k < nl; k++) { int cx = (bx[k].x0 + bx[k].x1) / 2 / cs, cy = (bx[k].y0 + bx[k].y1) / 2 / cs; next[k] = head[cy * gw + cx]; head[cy * gw + cx] = k; }
    int along_h = 0, along_v = 0;
    /* the slant: a histogram of the nearest neighbour's direction folded to −45° … 45° (half-degree bins) */
    float sh[180]; for (int b = 0; b < 180; b++) sh[b] = 0;
    float *ang = malloc(sizeof(float) * nl); int na = 0;
    for (int k = 0; k < nl; k++) {
        float cx = (bx[k].x0 + bx[k].x1) * 0.5f, cy = (bx[k].y0 + bx[k].y1) * 0.5f, best = 1e30f, sdx = 0, sdy = 0;
        int gx = (int)cx / cs, gy = (int)cy / cs;
        for (int yy = gy - 1; yy <= gy + 1; yy++) for (int xx = gx - 1; xx <= gx + 1; xx++) {
            if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
            for (int j = head[yy * gw + xx]; j >= 0; j = next[j]) {
                if (j == k) continue;
                float dx = (bx[j].x0 + bx[j].x1) * 0.5f - cx, dy = (bx[j].y0 + bx[j].y1) * 0.5f - cy, d = dx * dx + dy * dy;
                if (d < best) { best = d; sdx = dx; sdy = dy; }
            }
        }
        if (best > 6.25f * sz * sz || best < 0.04f * sz * sz) continue;
        float a = atan2f(sdy, sdx) * 57.29578f;          /* −180 … 180 */
        while (a > 45.0f) a -= 90.0f; while (a <= -45.0f) a += 90.0f;
        int b = (int)((a + 45.0f) * 2.0f); if (b < 0) b = 0; if (b > 179) b = 179;
        sh[b] += 1.0f; ang[na++] = a;
    }
    if (na >= 20) {
        int pk = 0; float pv = -1;
        for (int b = 0; b < 180; b++) { float v = 0; for (int q = -3; q <= 3; q++) v += sh[(b + q + 180) % 180]; if (v > pv) { pv = v; pk = b; } }
        float c = pk / 2.0f - 45.0f + 0.25f, sum = 0; int cnt = 0;
        for (int q = 0; q < na; q++) { float d = ang[q] - c; if (d > 45) d -= 90; if (d <= -45) d += 90; if (fabsf(d) <= 2.0f) { sum += d; cnt++; } }
        float sk = cnt ? c + sum / cnt : c; if (sk > 45) sk -= 90; if (sk <= -45) sk += 90;
        out[7] = (int32_t)lroundf(sk * 100.0f);
    }
    free(ang);
    for (int k = 0; k < nl; k++) {
        float cx = (bx[k].x0 + bx[k].x1) * 0.5f, cy = (bx[k].y0 + bx[k].y1) * 0.5f, best = 1e30f, bdx = 0, bdy = 0;
        int gx = (int)cx / cs, gy = (int)cy / cs;
        for (int yy = gy - 1; yy <= gy + 1; yy++) for (int xx = gx - 1; xx <= gx + 1; xx++) {
            if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
            for (int j = head[yy * gw + xx]; j >= 0; j = next[j]) {
                if (j == k) continue;
                float dx = (bx[j].x0 + bx[j].x1) * 0.5f - cx, dy = (bx[j].y0 + bx[j].y1) * 0.5f - cy, d = dx * dx + dy * dy;
                if (d < best) { best = d; bdx = fabsf(dx); bdy = fabsf(dy); }
            }
        }
        if (best > 6.25f * sz * sz) continue;
        if (bdx > 1.7f * bdy) along_h++; else if (bdy > 1.7f * bdx) along_v++;
    }
    int horiz = along_h >= along_v;
    out[1] = horiz ? along_h : along_v; out[2] = horiz ? along_v : along_h; out[6] = horiz;
    int sure_axis = out[1] >= 25 && out[1] * 2 >= out[2] * 3;
    if (!sure_axis) { free(head); free(next); free(tmp); free(bx); return -1; }
    /* runs of letters along the axis: letters joined to every letter within 1.6 sizes along it and 0.45 across */
    int *par = malloc(sizeof(int) * nl);
    for (int k = 0; k < nl; k++) par[k] = k;
    for (int k = 0; k < nl; k++) {
        float cx = (bx[k].x0 + bx[k].x1) * 0.5f, cy = (bx[k].y0 + bx[k].y1) * 0.5f;
        int gx = (int)cx / cs, gy = (int)cy / cs;
        for (int yy = gy - 1; yy <= gy + 1; yy++) for (int xx = gx - 1; xx <= gx + 1; xx++) {
            if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
            for (int j = head[yy * gw + xx]; j >= 0; j = next[j]) {
                if (j <= k) continue;
                float dx = fabsf((bx[j].x0 + bx[j].x1) * 0.5f - cx), dy = fabsf((bx[j].y0 + bx[j].y1) * 0.5f - cy);
                float a = horiz ? dx : dy, c = horiz ? dy : dx;
                if (a <= 1.6f * sz && c <= 0.45f * sz) { int ra = tt_find(par, k), rb = tt_find(par, j); if (ra != rb) par[ra] = rb; }
            }
        }
    }
    /* in each run of five letters or more: the core band (the median low and high ends across the axis) and the
     * letters that stick out of it on either side */
    int *order = malloc(sizeof(int) * nl), *lo = malloc(sizeof(int) * nl), *hi = malloc(sizeof(int) * nl);
    for (int k = 0; k < nl; k++) order[k] = k;
    int *root = tmp; for (int k = 0; k < nl; k++) root[k] = tt_find(par, k);
    /* group by root: a counting sort over the roots */
    int *cnt = calloc(nl, sizeof(int)), *start = malloc(sizeof(int) * (nl + 1));
    for (int k = 0; k < nl; k++) cnt[root[k]]++;
    start[0] = 0; for (int k = 0; k < nl; k++) start[k + 1] = start[k] + cnt[k];
    int *fill = calloc(nl, sizeof(int));
    for (int k = 0; k < nl; k++) order[start[root[k]] + fill[root[k]]++] = k;
    long up = 0, down = 0;
    for (int rt = 0; rt < nl; rt++) {
        int m = cnt[rt]; if (m < 5) continue;
        int *mem = order + start[rt];
        for (int q = 0; q < m; q++) { tt_box *b = bx + mem[q]; lo[q] = horiz ? b->y0 : b->x0; hi[q] = horiz ? b->y1 : b->x1; }
        float l = tt_median(lo, m), hgh = tt_median(hi, m), core = hgh - l + 1; if (core < 2) continue;
        float marg = 0.35f * core;
        for (int q = 0; q < m; q++) {
            tt_box *b = bx + mem[q]; int a = horiz ? b->y0 : b->x0, z = horiz ? b->y1 : b->x1;
            if (a < l - marg) up++;      /* sticks out on the low side (the top, if upright or turned left) */
            if (z > hgh + marg) down++;  /* sticks out on the high side */
        }
    }
    out[3] = (int32_t)up; out[4] = (int32_t)down;
    free(order); free(lo); free(hi); free(cnt); free(start); free(fill); free(par); free(head); free(next); free(tmp); free(bx);
    int turns;
    if (up + down < 20 || (up * 5 < down * 6 && down * 5 < up * 6)) turns = -2; /* within 20 %: not sure which end is up */
    else if (horiz) turns = up > down ? 0 : 2;
    else turns = up > down ? 1 : 3; /* tops toward the left: a quarter turn to the right sets them up; toward the right: to the left */
    out[0] = turns;
    return turns;
}

/* ======================================================================== the lines' direction from projection profiles */
/* Owner, 21 Nov 2026: photos taken "at different angles". The letter-based p_text_turns misjudges soft photos — their
 * letters run together into words, whose nearest neighbour may be the word below. This looks at the ink as a whole:
 * (1) ink as in p_text_turns, in the pieces of letter or word size (the Kindle's body, a photo's edges and other large
 * shapes left out, specks too); (2) for every direction θ (−90° … 89° by one degree, then by a tenth around the best)
 * the ink projected across θ into a profile of 1-px bins — text lines running along θ give the profile its sharpest
 * rises and falls: the score is Σ (P[i+1] − P[i])² (Postl's criterion, the one Leptonica's skew finder uses);
 * (3) at the best θ the profile folded on the line pitch (the first peak of its autocorrelation) is the average line —
 * the side of its x-height band with more ink is the top (Latin script: b d f h k l t, capitals and digits rise above
 * it, only g j p q y drop below the baseline: several times the ink).
 * out[8] (floats): θ, the lines' direction in degrees from the x axis toward y (clockwise on the screen), −90 < θ ≤ 90;
 * the score at θ over the score at right angles to it; the ink beside the band on the side of smaller t
 * (t = −x·sinθ + y·cosθ) and on the side of larger t; the pitch in pixels; its strength (autocorrelation at the pitch
 * over at 0); the ink pixels used; and the turns. Returns the turns: 0–3, the quarter turns to the right that set the
 * text upright once it is levelled (as p_text_turns), −1 when there is too little ink or no direction stands out, −2
 * when the direction does but not which side is the top. */
/* (each pixel shared between the two bins it falls between: whole bins would alias — at 45° the pixel grid alone gives the
 * profile a comb of sharp steps) */
static double tl_score(const int16_t *xs, const int16_t *ys, int k, double deg, int off, float *prof, int len) {
    double a = deg * 3.14159265358979323846 / 180.0, s = sin(a), c = cos(a);
    for (int i = 0; i < len; i++) prof[i] = 0;
    for (int i = 0; i < k; i++) {
        double t = -xs[i] * s + ys[i] * c + off; int b = (int)floor(t); float f = (float)(t - b);
        if (b >= 0 && b + 1 < len) { prof[b] += 1 - f; prof[b + 1] += f; }
    }
    double sc = 0; for (int i = 1; i < len; i++) { double d = prof[i] - prof[i - 1]; sc += d * d; }
    return sc;
}
static double tl_norm(double d) { while (d > 90) d -= 180; while (d <= -90) d += 180; return d; }

API int p_text_lines(const uint8_t *px, int w, int h, float *out) {
    for (int k = 0; k < 8; k++) out[k] = 0;
    int n = w * h;
    if (w < 32 || h < 32) return -1;
    uint8_t *g = malloc(n), *ink = calloc(n, 1);
    uint32_t *ii = malloc(sizeof(uint32_t) * (size_t)(w + 1) * (h + 1));
    int32_t *stack = malloc(sizeof(int32_t) * n);
    if (!g || !ink || !ii || !stack) { free(g); free(ink); free(ii); free(stack); return -1; }
    unsigned hist[256] = {0};
    for (int i = 0; i < n; i++) { const uint8_t *p = px + (size_t)i * 4; g[i] = (77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8; hist[g[i]]++; }
    { int c = 0, med = 0; while (med < 255 && (c += hist[med]) < n / 2) med++; if (med < 100) for (int i = 0; i < n; i++) g[i] = 255 - g[i]; }
    for (int x = 0; x <= w; x++) ii[x] = 0;
    for (int y = 0; y < h; y++) {
        uint32_t row = 0; ii[(size_t)(y + 1) * (w + 1)] = 0;
        for (int x = 0; x < w; x++) { row += g[y * w + x]; ii[(size_t)(y + 1) * (w + 1) + x + 1] = ii[(size_t)y * (w + 1) + x + 1] + row; }
    }
    int r = (w < h ? w : h) / 40; if (r < 8) r = 8;
    for (int y = 0; y < h; y++) {
        int y0 = y - r < 0 ? 0 : y - r, y1 = y + r + 1 > h ? h : y + r + 1;
        for (int x = 0; x < w; x++) {
            int x0 = x - r < 0 ? 0 : x - r, x1 = x + r + 1 > w ? w : x + r + 1;
            uint32_t s = ii[(size_t)y1 * (w + 1) + x1] - ii[(size_t)y0 * (w + 1) + x1] - ii[(size_t)y1 * (w + 1) + x0] + ii[(size_t)y0 * (w + 1) + x0];
            int m = (int)(s / (uint32_t)((x1 - x0) * (y1 - y0))), d = m * 12 / 100; if (d < 14) d = 14;
            ink[y * w + x] = g[y * w + x] < m - d;
        }
    }
    free(ii); free(g);
    /* components: their size first (1 → 2), then the kept ones' pixels marked 3, the others 4 */
    int cap = 60000, nb = 0; tt_box *bx = malloc(sizeof(tt_box) * cap); int32_t *seed = malloc(sizeof(int32_t) * cap);
    if (!bx || !seed) { free(ink); free(stack); free(bx); free(seed); return -1; }
    for (int s0 = 0; s0 < n; s0++) {
        if (ink[s0] != 1) continue;
        int top = 0, cnt = 0; tt_box b = { w, h, -1, -1, 0 }; stack[top++] = s0; ink[s0] = 2;
        while (top) {
            int i = stack[--top], x = i % w, y = i / w; cnt++;
            if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                int xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                int j = yy * w + xx; if (ink[j] == 1) { ink[j] = 2; stack[top++] = j; }
            }
        }
        b.n = cnt;
        if (nb < cap) { bx[nb] = b; seed[nb] = s0; nb++; }
    }
    /* the size of a piece: the median of the larger side of those of three pixels or more */
    int *tmp = malloc(sizeof(int) * (nb ? nb : 1)), nt = 0;
    for (int q = 0; q < nb; q++) if (bx[q].n >= 3) { int bw = bx[q].x1 - bx[q].x0 + 1, bh = bx[q].y1 - bx[q].y0 + 1; tmp[nt++] = bw > bh ? bw : bh; }
    if (nt < 30) { free(tmp); free(ink); free(stack); free(bx); free(seed); out[6] = 0; return -1; }
    int sz = (int)(tt_median(tmp, nt) + 0.5f); if (sz < 3) sz = 3;
    free(tmp);
    int lim = (w < h ? w : h) / 3, kept = 0;
    for (int q = 0; q < nb; q++) {
        int bw = bx[q].x1 - bx[q].x0 + 1, bh = bx[q].y1 - bx[q].y0 + 1, m = bw > bh ? bw : bh, t = bw < bh ? bw : bh;
        int keep = bx[q].n >= 3 && 2 * m >= sz && m <= 8 * sz && m <= lim && t <= 3 * sz;
        uint8_t mark = keep ? 3 : 4; int top = 0; stack[top++] = seed[q]; ink[seed[q]] = mark;
        while (top) {
            int i = stack[--top], x = i % w, y = i / w;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                int xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                int j = yy * w + xx; if (ink[j] == 2) { ink[j] = mark; stack[top++] = j; }
            }
        }
        if (keep) kept += bx[q].n;
    }
    free(bx); free(seed); free(stack);
    if (kept < 400) { free(ink); out[6] = kept; return -1; }
    /* the kept ink's pixels (every one, or every second, third … beyond 250,000) */
    int stride = kept > 250000 ? (kept + 249999) / 250000 : 1, k = 0, c0 = 0;
    int16_t *xs = malloc(sizeof(int16_t) * (kept / stride + 2)), *ys = malloc(sizeof(int16_t) * (kept / stride + 2));
    if (!xs || !ys) { free(ink); free(xs); free(ys); return -1; }
    for (int i = 0; i < n; i++) if (ink[i] == 3 && (c0++ % stride) == 0) { xs[k] = (int16_t)(i % w); ys[k] = (int16_t)(i / w); k++; }
    free(ink);
    out[6] = (float)k;
    int off = w + h + 2, len = 2 * off + 2;
    float *prof = malloc(sizeof(float) * len);
    double *sc = malloc(sizeof(double) * 180);
    if (!prof || !sc) { free(xs); free(ys); free(prof); free(sc); return -1; }
    int best = 0;
    for (int a = 0; a < 180; a++) { sc[a] = tl_score(xs, ys, k, a - 90, off, prof, len); if (sc[a] > sc[best]) best = a; }
    double th = best - 90, top = sc[best];
    for (int q = -10; q <= 10; q++) { double d = best - 90 + q * 0.1, v = tl_score(xs, ys, k, d, off, prof, len); if (v > top) { top = v; th = d; } }
    th = tl_norm(th);
    double across = tl_score(xs, ys, k, tl_norm(th + 90), off, prof, len);
    double contrast = across > 0 ? top / across : 99;
    /* the profile at θ, the line pitch and the average line */
    tl_score(xs, ys, k, th, off, prof, len);
    free(xs); free(ys); free(sc);
    int i0 = 0, i1 = len - 1; while (i0 < len && prof[i0] <= 0) i0++; while (i1 > i0 && prof[i1] <= 0) i1--;
    int span = i1 - i0 + 1, maxlag = span / 3; if (maxlag > 400) maxlag = 400;
    double mean = 0; for (int i = i0; i <= i1; i++) mean += prof[i]; mean /= span;
    double r0 = 0; for (int i = i0; i <= i1; i++) r0 += (prof[i] - mean) * (prof[i] - mean);
    double pitch = 0, strength = 0;
    if (maxlag > 6 && r0 > 0) {
        double prev = 1, rbest = 0; int lbest = 0, crossed = 0;
        double *rr = malloc(sizeof(double) * (maxlag + 2));
        for (int lag = 0; lag <= maxlag + 1; lag++) { double s = 0; for (int i = i0; i + lag <= i1; i++) s += (prof[i] - mean) * (prof[i + lag] - mean); rr[lag] = s / r0; }
        for (int lag = 2; lag <= maxlag; lag++) {
            if (rr[lag] < 0) crossed = 1;
            if (crossed && rr[lag] > rr[lag - 1] && rr[lag] >= rr[lag + 1] && rr[lag] > rbest) { rbest = rr[lag]; lbest = lag; }
            prev = rr[lag];
        }
        (void)prev;
        if (lbest) {
            double a = rr[lbest - 1], b = rr[lbest], cc = rr[lbest + 1], den = a - 2 * b + cc;
            pitch = lbest + (den != 0 ? 0.5 * (a - cc) / den : 0); strength = rbest;
        }
        free(rr);
    }
    out[0] = (float)th; out[1] = (float)contrast; out[4] = (float)pitch; out[5] = (float)strength;
    if (contrast < 1.15) { free(prof); return -1; }
    int turns = -2;
    if (pitch >= 4 && strength > 0.1) {
        int M = (int)(pitch + 0.5); double *A = calloc(M, sizeof(double)), lo = 0, hi = 0;
        for (int i = i0; i <= i1; i++) { double f = fmod((i - i0) / pitch, 1.0); int b = (int)(f * M); if (b >= M) b = M - 1; A[b] += prof[i]; }
        /* smoothed a little; the gap between lines = the lowest bin, the band = the bins of half the highest and more
         * around the highest; the ink above the gap's level, from the gap to the band on each side */
        double *Sm = malloc(sizeof(double) * M); int gi = 0, mi = 0;
        for (int b = 0; b < M; b++) Sm[b] = (A[(b + M - 1) % M] + 2 * A[b] + A[(b + 1) % M]) / 4;
        for (int b = 0; b < M; b++) { if (Sm[b] < Sm[gi]) gi = b; if (Sm[b] > Sm[mi]) mi = b; }
        double base = Sm[gi], half = base + 0.5 * (Sm[mi] - base);
        int cs = mi, ce = mi;
        for (int q = 1; q < M; q++) { int b = (mi - q + M) % M; if (Sm[b] < half || b == gi) break; cs = b; }
        for (int q = 1; q < M; q++) { int b = (mi + q) % M; if (Sm[b] < half || b == gi) break; ce = b; }
        /* the ink just outside the band, as far as 0.6 of its height on each side (the rising letters reach about that
         * far, the dropping ones less) and never past the gap */
        int hc = (ce - cs + M) % M + 1, wz = (int)(0.6 * hc + 0.5); if (wz < 2) wz = 2;
        for (int q = 1; q <= wz; q++) { int b = (cs - q + M) % M; if (b == gi || b == ce) break; lo += Sm[b] - base; }   /* the side of smaller t */
        for (int q = 1; q <= wz; q++) { int b = (ce + q) % M; if (b == gi || b == cs) break; hi += Sm[b] - base; }        /* the side of larger t */
        out[2] = (float)lo; out[3] = (float)hi;
        if ((lo > 1.4 * hi || hi > 1.4 * lo) && lo + hi > 0) {
            /* the top of the text: toward smaller t when lo wins, i.e. along −n, n = (−sinθ, cosθ) */
            double a = th * 3.14159265358979323846 / 180.0, ux = lo > hi ? sin(a) : -sin(a), uy = lo > hi ? -cos(a) : cos(a);
            double bestd = -2; for (int q = 0; q < 4; q++) { if (-uy > bestd) { bestd = -uy; turns = q; } double t2 = ux; ux = -uy; uy = t2; }
        }
        free(A); free(Sm);
    }
    free(prof);
    out[7] = (float)turns;
    return turns;
}

/* ================================================================================ a watermark washed over the page */
/* To-do #18 (owner, 26 Nov 2026: "Also improve the quality when the document has a watermark"): a watermark as strong as
 * printers make them (CONFIDENTIAL across the page, a red DRAFT, a stamp) is a second, lighter level of ink under the text.
 * Laid out as a page, Tesseract took the text under its big letters for a picture and left a paragraph out. On a page set
 * upright and cleaned up (grey, dark text on light paper): the histogram of the ink has, beside the text and its soft
 * edges — which rise smoothly towards the paper — a peak of its own in the greys when a watermark is there (plain pages
 * and a Kindle's soft text have none: nothing is done). The pixels of that grey that form broad strokes — wider than any
 * letter's stroke, they survive an erosion by a square of 2r + 1 px — and the grey within three times r of them (between the
 * letters where text crosses the watermark) are painted the paper's colour, and the strokes' soft edges next to them; the
 * text over the watermark is darker and stays. out[0] = pixels painted, out[1] and out[2] = the grey band (luma). */
API int p_clear_wash(uint8_t *px, int w, int h, int32_t *out) {
    out[0] = out[1] = out[2] = 0;
    int n = w * h;
    if (w < 64 || h < 64) return 0;
    uint8_t *g = malloc(n);
    if (!g) return 0;
    uint32_t hist[256] = {0};
    for (int i = 0; i < n; i++) { const uint8_t *p = px + (size_t)i * 4; g[i] = (77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8; hist[g[i]]++; }
    int paper = 255; { long long acc = 0; for (int v = 0; v < 256; v++) { acc += hist[v]; if (acc * 100 >= (long long)n * 80) { paper = v; break; } } }
    int median = 255; { long long acc = 0; for (int v = 0; v < 256; v++) { acc += hist[v]; if (acc * 2 >= n) { median = v; break; } } }
    if (median < 200) { free(g); return 0; }              /* not mostly light paper (a screen in dark mode): nothing to take */
    /* bins of 8 levels; a peak bin b: at least 1 % of the page with its two neighbours, at least 2.2 × the bins 24 – 39
       levels either side (the text's soft edges are a smooth slope there), between 96 and the paper − 32 */
    double bin[32] = {0};
    for (int v = 0; v < 256; v++) bin[v >> 3] += hist[v];
    int best = -1; double bestv = 0;
    for (int b = 12; b <= 28 && b * 8 + 8 <= paper - 32; b++) {
        double c = bin[b - 1] + bin[b] + bin[b + 1], side = (bin[b - 4] + bin[b - 3] + bin[b + 3] + (b + 4 < 32 ? bin[b + 4] : bin[b + 3])) / 4;
        if (bin[b] >= bin[b - 1] && bin[b] >= bin[b + 1] && c >= 0.01 * n && bin[b] >= 2.2 * side && bin[b] > bestv) { best = b; bestv = bin[b]; }
    }
    if (best < 0) { free(g); return 0; }
    int lo = best, hi = best;
    while (lo > 0 && bin[lo - 1] >= 0.5 * bestv) lo--;
    while (hi < 31 && bin[hi + 1] >= 0.5 * bestv) hi++;
    int vlo = lo * 8 - 4, vhi = hi * 8 + 11;              /* the band, a little wider than its bins (a stroke's own edges) */
    if (vhi > paper - 12) vhi = paper - 12;
    /* a watermark is a second level of ink: a minority of the page (not its ground), one even grey (a narrow band — the
       grey text of a Kindle spreads over half the scale), and lighter than the text, which is there below it (a Kindle's
       text is the grey itself, with nothing darker: the first version painted a whole Kindle page white) */
    { long long inb = 0, dark = 0; for (int v = vlo < 0 ? 0 : vlo; v <= vhi; v++) inb += hist[v];
      for (int v = 0; v < vlo - 16 && v < 256; v++) dark += hist[v];
      if (inb * 4 > n || vhi - vlo > 64 || dark * 2 < inb) { free(g); return 0; } }
    out[1] = vlo; out[2] = vhi;
    /* the opening: in-band pixels whose (2r + 1)² square is all in band, grown back by the same square */
    int r = (w > h ? w : h) / 300; if (r < 4) r = 4;       /* strokes of 2r + 1 px and wider: 21 at 3,000 px — no letter's */
    uint32_t *ii = malloc(sizeof(uint32_t) * (size_t)(w + 1) * (h + 1));
    uint8_t *core = calloc(n, 1);
    if (!ii || !core) { free(g); free(ii); free(core); return 0; }
    #define WASH_II(mask) do { for (int x = 0; x <= w; x++) ii[x] = 0; \
        for (int y = 0; y < h; y++) { uint32_t row = 0; ii[(size_t)(y + 1) * (w + 1)] = 0; \
            for (int x = 0; x < w; x++) { row += (mask); ii[(size_t)(y + 1) * (w + 1) + x + 1] = ii[(size_t)y * (w + 1) + x + 1] + row; } } } while (0)
    #define WASH_BOX(x, y) ({ int x0_ = (x) - r < 0 ? 0 : (x) - r, y0_ = (y) - r < 0 ? 0 : (y) - r, x1_ = (x) + r + 1 > w ? w : (x) + r + 1, y1_ = (y) + r + 1 > h ? h : (y) + r + 1; \
        ii[(size_t)y1_ * (w + 1) + x1_] - ii[(size_t)y0_ * (w + 1) + x1_] - ii[(size_t)y1_ * (w + 1) + x0_] + ii[(size_t)y0_ * (w + 1) + x0_]; })
    WASH_II(g[y * w + x] >= vlo && g[y * w + x] <= vhi);
    int side = 2 * r + 1;
    for (int y = r; y < h - r; y++) for (int x = r; x < w - r; x++) if (WASH_BOX(x, y) == (uint32_t)(side * side)) core[y * w + x] = 1;
    /* grown back further than the square (three times): the grey between the letters where text crosses the watermark
       goes too (the letters are darker than the band and stay) */
    WASH_II(core[y * w + x]);
    int painted = 0, rr = r; r = 3 * rr;
    uint8_t *done = calloc(n, 1);
    if (!done) { free(g); free(ii); free(core); return 0; }
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * w + x;
        if (g[i] < vlo || g[i] > vhi || !WASH_BOX(x, y)) continue;
        uint8_t *p = px + (size_t)i * 4; p[0] = p[1] = p[2] = (uint8_t)paper; done[i] = 1; painted++;
    }
    /* the strokes' soft edges, lighter than the band, next to what was painted (2 px): its faint outline */
    r = 2;
    WASH_II(done[y * w + x]);
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * w + x;
        if (done[i] || g[i] <= vhi || g[i] >= paper || !WASH_BOX(x, y)) continue;
        uint8_t *p = px + (size_t)i * 4; p[0] = p[1] = p[2] = (uint8_t)paper; painted++;
    }
    r = rr;
    #undef WASH_II
    #undef WASH_BOX
    free(g); free(ii); free(core); free(done);
    out[0] = painted;
    return painted;
}

/* ======================================================================== ruled lines and list marks (to-do #18) */
/* Owner, 26 Nov 2026: documents "that have formatting, rich text formatting like bullet points, indentation" read poorly,
 * "especially using the phone camera"; "no need to keep bullets and indentation in the text;.. but the ocr should not get
 * confused by them". On a page set upright and cleaned up (dark text on light paper), before it is read:
 *  - ruled lines (a table's grid, a box round a text, a rule under a heading): runs of ink at least seven x-heights long
 *    along the lines of the text or across them, at most 0.45 of an x-height thick, with paper on both sides along most
 *    of their length (an underline, with the letters on it, stays) — painted the paper's colour (Tesseract read them as
 *    | and _);
 *  - list marks: the first thing on a line (nothing just before it, even half an x-height up or down: a comma hangs
 *    below the baseline), followed by a gap wider than every word space of its line (two more gaps on the line as wide:
 *    a word — "a" on a soft photo, its hole closed, is a solid blob; justified text stretches its spaces alike) and then
 *    letters — a solid dot,
 *    square, diamond or triangle (● ■ ▪ ◆ ►), a ring or an empty box (○ ◦ □ ☐), a box with a tick or a cross in it
 *    (☑ ☒) — painted the paper's colour (read as e, o, ©, ®, «, 71 …). A ring the size and shape of the letter o counts
 *    only after the gap of a tab (Word's second-level bullet is an o; the word "o" — Spanish for "or" — is followed by
 *    a space). A box (a frame with ink in its four corners) counts after any gap (a checklist sets it off by a word
 *    space). On a soft page (its letters pale) a solid blob as dark as the letters is a letter whose hole the blur closed
 *    (a lettered list's "a."), no mark. Faint marks — a box or a ring in thin grey strokes that a phone's photo breaks up
 *    in the ink — are looked for on the light ink: paler than the letters after them, and only in a list (another mark
 *    at the same place on another line) (to-do #31).
 * The x-height and the slant of the lines are measured on the page (the letters' heights; their nearest neighbours).
 * Then, with bit 2, the columns of text are counted: gutters — a band at least an x-height wide with almost no ink,
 * text on both sides of it down the page, the lines on its left running up to it, the columns either side at least
 * eighteen x-heights wide (a form's labels and a table's cells are narrower, and stop short), on a page of at least
 * twelve bands of text (in six lines of justified text the word spaces lined up by chance) — the reading tabs read a
 * page of columns as a page (Tesseract's layout analysis), anything else as one block (to-do #18: a newsletter's two
 * columns were read straight across; a form read as columns lost its order).
 * what: bit 0 the lines, bit 1 the marks, bit 2 the columns. out[0] = pixels of lines cleared, out[1] = marks cleared,
 * out[2] = the x-height (px), out[3] = the slant used (hundredths of a degree), out[4] = the columns of text (1 when one
 * or none), out[5] = pixels of the lines cleared inside the page (not along its edges: a table's, a form's), out[7] = the
 * labels of a list kept where a mark would have been cleared (a soft "a." or "ii.", below: counted as list marks are by
 * the reading path's decisions). Returns
 * out[0] + out[1] > 0 (0: the page as it was).
 * list (when not null): every mark cleared, five numbers each — its box x0, y0, x1, y1 (px, the ink) and what it was
 * (CM_DOT …) — at most `cap` of them, their number in out[6]: the OCR tab puts them back at the start of their
 * lines (to-do #31; owner, 26 Nov 2026: "In the OCR app, the rich formatting should be preserved, the bullet points"). */
typedef struct { int x0, y0, x1, y1, n, off; } cm_comp;
/* what a list mark was (p_clear_marks' list): a dot (• ●), a ring (◦ ○, Word's o), a square (▪ ■), a diamond (◆), a
   triangle (► ▸), an empty box (☐ □), a box with a tick (☑), a box with a cross (☒), a ring round a dot (◉, a radio
   button chosen) — the size of a mark (• or ●) is not told: on the marks of tests/fixtures/ocr/marks.jpg ● measured 0.79
   of the x-height and ■ 0.86, Word's letter o 0.93 */
enum { CM_DOT = 1, CM_RING = 2, CM_SQUARE = 3, CM_DIAMOND = 4, CM_TRIANGLE = 5, CM_BOX = 6, CM_TICKED = 7, CM_CROSSED = 8, CM_RADIO = 9 };
/* a solid mark's shape by how much of its box it fills (a square all of it, a disc π/4, a diamond or a triangle half) and,
   for the last two, where its ink lies (a diamond's in the middle, a triangle's towards its flat side) */
static int cm_solid(const int32_t *pix, int n, int w, int x0, int bw, int bh) {
    if ((bw > bh ? bw : bh) <= 5) return CM_DOT;                    /* a few pixels: no shape to tell */
    double fill = (double)n / ((double)bw * bh), sx = 0;
    if (fill >= 0.88) return CM_SQUARE;
    if (fill >= 0.66) return CM_DOT;
    for (int k = 0; k < n; k++) sx += pix[k] % w - x0 + 0.5;
    return fabs(sx / n / bw - 0.5) < 0.08 ? CM_DIAMOND : CM_TRIANGLE;
}
/* a box's contents: a cross (✗) has ink in all four quarters of the box, a tick (✓) leaves the top left one empty */
static int cm_tick(const long q[4]) {
    long t = q[0] + q[1] + q[2] + q[3], m = q[0];
    for (int k = 1; k < 4; k++) if (q[k] < m) m = q[k];
    if (t <= 0) return CM_BOX;
    return m >= 0.12 * t ? CM_CROSSED : CM_TICKED;
}
/* ink in all four corners of a component's box (a frame: □ ☐ ☑ ☒ — no letter has it: D, O and 0 are round at two or
   four corners) — each corner a square of `frac` of the box's shorter side (a tenth; a fifth for a frame a phone's photo
   has softened, its corners rounded), at least a pixel */
static int cm_corners(const int32_t *pix, int n, int w, int x0, int y0, int bw, int bh, float frac) {
    int r = (int)lroundf(frac * (bw < bh ? bw : bh)); if (r < 1) r = 1;
    int seen[4] = {0, 0, 0, 0};
    for (int k = 0; k < n; k++) {
        int x = pix[k] % w - x0, y = pix[k] / w - y0, left = x < r, right = x >= bw - r, top = y < r, bottom = y >= bh - r;
        if (top && left) seen[0] = 1; if (top && right) seen[1] = 1; if (bottom && left) seen[2] = 1; if (bottom && right) seen[3] = 1;
    }
    return seen[0] && seen[1] && seen[2] && seen[3];
}
/* the darkest grey of a component's pixels */
static int cm_darkest(const uint8_t *px, const int32_t *pix, int n) {
    int m = 255;
    for (int k = 0; k < n; k++) { const uint8_t *p = px + (size_t)pix[k] * 4; int v = (77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8; if (v < m) m = v; }
    return m;
}
/* a run of ink just before a component on its line that the search for its neighbours does not look at — a word or words
   run together on a soft photo, longer than the search reaches (it looks at what has its middle within about five
   x-heights): then the component is not the first thing on its line (to-do #31: "Scuba Configuration UI" on a soft frame
   of a form — "Scuba Configuration" one blob, unseen, and "UI" cleared as a ticked box). Tall ink (a picture, a rule
   standing up) does not count, as in the search. Asked only of what would be cleared — a few components a page. */
static int cm_run_before(const cm_comp *cs, int nc, const uint8_t *gone, const cm_comp *c, float xh, float t) {
    float ccx = (c->x0 + c->x1) * 0.5f, ctop = c->y0 - ccx * t, cbot = c->y1 - ccx * t;
    for (int j = 0; j < nc; j++) {
        const cm_comp *o = &cs[j];
        if (gone[j] || o->x1 >= c->x0 || c->x0 - o->x1 > 2.5f * xh) continue;
        int ow = o->x1 - o->x0 + 1, oh = o->y1 - o->y0 + 1;
        if (ow <= 5 * xh || oh > 3 * xh) continue;
        float ox = (o->x0 + o->x1) * 0.5f, otop = o->y0 - ox * t, obot = o->y1 - ox * t;
        if (obot >= ctop - 0.5f * xh && otop <= cbot + 0.5f * xh) return 1;
    }
    return 0;
}
/* the quarter of a box (x0, y0)–(x1, y1) a pixel lies in: 0 top left, 1 top right, 2 bottom left, 3 bottom right */
#define CM_QUARTER(x, y, x0, y0, x1, y1) ((2 * (y) > (y0) + (y1) ? 2 : 0) + (2 * (x) > (x0) + (x1) ? 1 : 0))
static int cm_cmpi(const void *a, const void *b) { int x = *(const int *)a, y = *(const int *)b; return (x > y) - (x < y); }
/* 8-connected components of mask == 1 (set to 2 when visited): pixel lists in pix (the components' pixels one after
   another, found breadth first), boxes in cs (at most cap). Returns the number of components. */
static int cm_label(uint8_t *mask, int w, int h, int32_t *pix, cm_comp *cs, int cap) {
    int nc = 0, top = 0;
    for (int s = 0; s < w * h && nc < cap; s++) {
        if (mask[s] != 1) continue;
        cm_comp c = { w, h, -1, -1, 0, top };
        int rd = top; pix[top++] = s; mask[s] = 2;
        while (rd < top) {
            int i = pix[rd++], x = i % w, y = i / w;
            if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                int xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                int j = yy * w + xx; if (mask[j] == 1) { mask[j] = 2; pix[top++] = j; }
            }
        }
        c.n = top - c.off; cs[nc++] = c;
    }
    return nc;
}
/* paint a list of pixels and their 8 neighbours white (the anti-aliased rim goes with them) */
static void cm_clear(uint8_t *px, int w, int h, const int32_t *pix, int n) {
    for (int k = 0; k < n; k++) {
        int i = pix[k], x = i % w, y = i / w;
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
            int xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            uint8_t *p = px + ((size_t)yy * w + xx) * 4; p[0] = p[1] = p[2] = 255;
        }
    }
}
/* the area of the convex hull of a component (its rows' leftmost and rightmost pixels), by Andrew's monotone chain */
static double cm_hull(const int32_t *pix, int n, int w, int x0, int y0, int bw, int bh) {
    int *lo = malloc(sizeof(int) * bh), *hi = malloc(sizeof(int) * bh);
    for (int r = 0; r < bh; r++) { lo[r] = 1 << 30; hi[r] = -1; }
    for (int k = 0; k < n; k++) { int x = pix[k] % w - x0, r = pix[k] / w - y0; if (x < lo[r]) lo[r] = x; if (x > hi[r]) hi[r] = x; }
    /* points: (lo, r) and (hi + 1, r), (lo, r + 1), (hi + 1, r + 1) — the pixels' outer corners — in order of x then y */
    int np = 0; double (*p)[2] = malloc(sizeof(double[2]) * bh * 4 + 16);
    for (int r = 0; r < bh; r++) if (hi[r] >= 0) {
        p[np][0] = lo[r]; p[np++][1] = r; p[np][0] = lo[r]; p[np++][1] = r + 1;
        p[np][0] = hi[r] + 1; p[np++][1] = r; p[np][0] = hi[r] + 1; p[np++][1] = r + 1;
    }
    free(lo); free(hi);
    /* sort by x, then y (insertion sort on doubles — np is at most four times a mark's height) */
    for (int i = 1; i < np; i++) { double a = p[i][0], b = p[i][1]; int j = i - 1; while (j >= 0 && (p[j][0] > a || (p[j][0] == a && p[j][1] > b))) { p[j + 1][0] = p[j][0]; p[j + 1][1] = p[j][1]; j--; } p[j + 1][0] = a; p[j + 1][1] = b; }
    double (*hl)[2] = malloc(sizeof(double[2]) * (2 * np + 2)); int k = 0;
    #define CROSS(o, a, b) (((a)[0] - (o)[0]) * ((b)[1] - (o)[1]) - ((a)[1] - (o)[1]) * ((b)[0] - (o)[0]))
    for (int i = 0; i < np; i++) { while (k >= 2 && CROSS(hl[k - 2], hl[k - 1], p[i]) <= 0) k--; hl[k][0] = p[i][0]; hl[k++][1] = p[i][1]; }
    for (int i = np - 2, t = k + 1; i >= 0; i--) { while (k >= t && CROSS(hl[k - 2], hl[k - 1], p[i]) <= 0) k--; hl[k][0] = p[i][0]; hl[k++][1] = p[i][1]; }
    #undef CROSS
    double a = 0; for (int i = 0; i + 1 < k; i++) a += hl[i][0] * hl[i + 1][1] - hl[i + 1][0] * hl[i][1];
    free(p); free(hl);
    return fabs(a) / 2;
}
/* a component's holes: the paper inside its box that cannot be reached from the box's edge (4-connected). Returns
   their number; *area = their pixels. */
static int cm_holes(const int32_t *pix, int n, int w, int x0, int y0, int bw, int bh, int *area) {
    int W = bw + 2, H = bh + 2, N = W * H, holes = 0; *area = 0;
    uint8_t *m = calloc(N, 1); int32_t *q = malloc(sizeof(int32_t) * N);
    for (int k = 0; k < n; k++) m[(pix[k] / w - y0 + 1) * W + pix[k] % w - x0 + 1] = 1;
    int top = 0, rd = 0; q[top++] = 0; m[0] = 2;                              /* the outside: from the frame's corner */
    while (rd < top) { int i = q[rd++], x = i % W, y = i / W; const int d[4][2] = {{1,0},{-1,0},{0,1},{0,-1}};
        for (int e = 0; e < 4; e++) { int xx = x + d[e][0], yy = y + d[e][1]; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; int j = yy * W + xx; if (!m[j]) { m[j] = 2; q[top++] = j; } } }
    for (int s = 0; s < N; s++) if (!m[s]) {                                  /* every region left is a hole */
        holes++; top = 0; rd = 0; q[top++] = s; m[s] = 3;
        while (rd < top) { int i = q[rd++], x = i % W, y = i / W; const int d[4][2] = {{1,0},{-1,0},{0,1},{0,-1}};
            for (int e = 0; e < 4; e++) { int xx = x + d[e][0], yy = y + d[e][1]; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; int j = yy * W + xx; if (!m[j]) { m[j] = 3; q[top++] = j; } } }
        *area += top;
    }
    free(m); free(q);
    return holes;
}
/* Does an outline hold the photo's text? (to-do #18: on a scan with a large watermark the Kindle finder took the white
   area that the watermark's letters fence in for the page, and the page was read from half way down.) The letters of
   the picture — small components a quarter darker than their neighbourhood (print, not a desk's grain), of a letter's, a word's or a line of small print's size — counted
   inside the quad (TL, TR, BR, BL, px) and outside it: out[0] inside, out[1] outside. Only marks on a ground as light as
   paper count (the picture's 95th percentile × 0.7): the grain of a wooden desk and a newspaper's dark print on a
   brown table are no letters. A page's outline holds nearly all of them (outside lies the desk, a screen's bezel, a
   hand); a region inside the page leaves most outside. */
API void p_quad_text(const uint8_t *px, int w, int h, const float *q, int32_t *out) {
    out[0] = out[1] = 0;
    int n = w * h;
    if (w < 32 || h < 32) return;
    uint8_t *g = malloc(n), *ink = calloc(n, 1), *mean = malloc(n);
    uint32_t *ii = malloc(sizeof(uint32_t) * (size_t)(w + 1) * (h + 1));
    int32_t *pix = malloc(sizeof(int32_t) * n);
    int cap = 200000; cm_comp *cs = malloc(sizeof(cm_comp) * cap);
    if (!g || !ink || !mean || !ii || !pix || !cs) { free(g); free(ink); free(mean); free(ii); free(pix); free(cs); return; }
    uint32_t hist[256] = {0};
    for (int i = 0; i < n; i++) { const uint8_t *p = px + (size_t)i * 4; g[i] = (77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8; hist[g[i]]++; }
    int p95 = 255; { long long acc = 0; for (int v = 0; v < 256; v++) { acc += hist[v]; if (acc * 100 >= (long long)n * 95) { p95 = v; break; } } }
    int paper = p95 * 7 / 10;
    for (int x = 0; x <= w; x++) ii[x] = 0;
    for (int y = 0; y < h; y++) {
        uint32_t row = 0; ii[(size_t)(y + 1) * (w + 1)] = 0;
        for (int x = 0; x < w; x++) { row += g[y * w + x]; ii[(size_t)(y + 1) * (w + 1) + x + 1] = ii[(size_t)y * (w + 1) + x + 1] + row; }
    }
    int r = (w < h ? w : h) / 40; if (r < 8) r = 8;
    for (int y = 0; y < h; y++) {
        int y0 = y - r < 0 ? 0 : y - r, y1 = y + r + 1 > h ? h : y + r + 1;
        for (int x = 0; x < w; x++) {
            int x0 = x - r < 0 ? 0 : x - r, x1 = x + r + 1 > w ? w : x + r + 1;
            uint32_t s = ii[(size_t)y1 * (w + 1) + x1] - ii[(size_t)y0 * (w + 1) + x1] - ii[(size_t)y1 * (w + 1) + x0] + ii[(size_t)y0 * (w + 1) + x0];
            int m = (int)(s / (uint32_t)((x1 - x0) * (y1 - y0))), d = m / 4; if (d < 20) d = 20;   /* print, not a desk's grain */
            ink[y * w + x] = g[y * w + x] < m - d;
            mean[y * w + x] = (uint8_t)m;
        }
    }
    int nc = cm_label(ink, w, h, pix, cs, cap), sh = w < h ? w : h;
    for (int k = 0; k < nc; k++) {
        cm_comp *c = &cs[k];
        int bw = c->x1 - c->x0 + 1, bh = c->y1 - c->y0 + 1;
        if (c->n < 4 || bh < 3 || bh > sh / 20 || bw > 25 * bh || bw > sh / 6) continue;  /* no letter, word or line of small print */
        float cx = (c->x0 + c->x1) * 0.5f, cy = (c->y0 + c->y1) * 0.5f;
        if (mean[(int)cy * w + (int)cx] < paper) continue;                                 /* not on paper */
        int pos = 0, neg = 0;
        for (int e = 0; e < 4; e++) {
            const float *a = q + e * 2, *b = q + ((e + 1) % 4) * 2;
            float cr = (b[0] - a[0]) * (cy - a[1]) - (b[1] - a[1]) * (cx - a[0]);
            if (cr > 0) pos++; else if (cr < 0) neg++;
        }
        if (!pos || !neg) out[0]++; else out[1]++;
    }
    free(g); free(ink); free(mean); free(ii); free(pix); free(cs);
}
API int p_clear_marks(uint8_t *px, int w, int h, int what, int32_t *out, int32_t *list, int cap_list) {
    for (int k = 0; k < 6; k++) out[k] = 0;
    out[4] = 1; out[7] = 0;
    if (!list) cap_list = 0;
    else out[6] = 0;
    int nlist = 0;      /* the marks put in the list */
    int n = w * h;
    if (w < 64 || h < 64) return 0;
    uint8_t *g = malloc(n), *ink = calloc(n, 1), *lite = calloc(n, 1);
    uint32_t *ii = malloc(sizeof(uint32_t) * (size_t)(w + 1) * (h + 1));
    int32_t *pix = malloc(sizeof(int32_t) * n);
    int cap = 200000; cm_comp *cs = malloc(sizeof(cm_comp) * cap);
    if (!g || !ink || !lite || !ii || !pix || !cs) { free(g); free(ink); free(lite); free(ii); free(pix); free(cs); return 0; }
    for (int i = 0; i < n; i++) { const uint8_t *p = px + (size_t)i * 4; g[i] = (77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8; }
    /* ink: clearly darker than the mean of its neighbourhood (as p_text_turns) */
    for (int x = 0; x <= w; x++) ii[x] = 0;
    for (int y = 0; y < h; y++) {
        uint32_t row = 0; ii[(size_t)(y + 1) * (w + 1)] = 0;
        for (int x = 0; x < w; x++) { row += g[y * w + x]; ii[(size_t)(y + 1) * (w + 1) + x + 1] = ii[(size_t)y * (w + 1) + x + 1] + row; }
    }
    int r = (w < h ? w : h) / 40; if (r < 8) r = 8;
    for (int y = 0; y < h; y++) {
        int y0 = y - r < 0 ? 0 : y - r, y1 = y + r + 1 > h ? h : y + r + 1;
        for (int x = 0; x < w; x++) {
            int x0 = x - r < 0 ? 0 : x - r, x1 = x + r + 1 > w ? w : x + r + 1;
            uint32_t s = ii[(size_t)y1 * (w + 1) + x1] - ii[(size_t)y0 * (w + 1) + x1] - ii[(size_t)y1 * (w + 1) + x0] + ii[(size_t)y0 * (w + 1) + x0];
            int m = (int)(s / (uint32_t)((x1 - x0) * (y1 - y0))), d = m * 12 / 100, dl = m * 4 / 100; if (d < 14) d = 14; if (dl < 6) dl = 6;
            ink[y * w + x] = g[y * w + x] < m - d;
            lite[y * w + x] = g[y * w + x] < m - dl;      /* a light line too (a table's grey grid, softened by the camera) */
        }
    }
    free(ii); free(g);
    /* the letters: components of a letter's size; the x-height = the median height of those */
    uint8_t *lab = malloc(n); memcpy(lab, ink, n);
    int nc = cm_label(lab, w, h, pix, cs, cap);
    free(lab);
    int *tmp = malloc(sizeof(int) * (nc + 1)), nt = 0;
    for (int k = 0; k < nc; k++) { int bw = cs[k].x1 - cs[k].x0 + 1, bh = cs[k].y1 - cs[k].y0 + 1, m = bw > bh ? bw : bh; if (cs[k].n >= 3 && bw <= w / 8 && bh <= h / 8 && m > 1) tmp[nt++] = m; }
    if (nt < 30) { free(tmp); free(ink); free(lite); free(pix); free(cs); return 0; }
    qsort(tmp, nt, sizeof(int), cm_cmpi);
    int sz = tmp[nt / 2]; if (sz < 3) sz = 3;
    int nl = 0;
    for (int k = 0; k < nc; k++) { int bw = cs[k].x1 - cs[k].x0 + 1, bh = cs[k].y1 - cs[k].y0 + 1, m = bw > bh ? bw : bh; if (cs[k].n >= 3 && 2 * m >= sz && m <= 3 * sz) tmp[nl++] = bh; }
    if (nl < 30) { free(tmp); free(ink); free(lite); free(pix); free(cs); return 0; }
    qsort(tmp, nl, sizeof(int), cm_cmpi);
    float xh = (float)tmp[nl / 2]; if (xh < 4) xh = 4;
    free(tmp);
    out[2] = (int32_t)lroundf(xh);
    /* the slant of the lines: the direction of each letter's nearest neighbour, folded to −45° … 45° (half-degree bins) */
    float slant = 0;
    {
        int cell = 2 * sz, gw = w / cell + 1, gh = h / cell + 1, *head = malloc(sizeof(int) * gw * gh), *next = malloc(sizeof(int) * nc);
        float hist[180]; for (int b = 0; b < 180; b++) hist[b] = 0;
        for (int c = 0; c < gw * gh; c++) head[c] = -1;
        for (int k = 0; k < nc; k++) { int bw = cs[k].x1 - cs[k].x0 + 1, bh = cs[k].y1 - cs[k].y0 + 1, m = bw > bh ? bw : bh; next[k] = -2;
            if (cs[k].n < 3 || 2 * m < sz || m > 3 * sz) continue;
            int cx = (cs[k].x0 + cs[k].x1) / 2 / cell, cy = (cs[k].y0 + cs[k].y1) / 2 / cell; next[k] = head[cy * gw + cx]; head[cy * gw + cx] = k; }
        float *ang = malloc(sizeof(float) * nc); int na = 0;
        for (int k = 0; k < nc; k++) {
            if (next[k] == -2) continue;
            float cx = (cs[k].x0 + cs[k].x1) * 0.5f, cy = (cs[k].y0 + cs[k].y1) * 0.5f, best = 1e30f, sdx = 0, sdy = 0;
            int gx = (int)cx / cell, gy = (int)cy / cell;
            for (int yy = gy - 1; yy <= gy + 1; yy++) for (int xx = gx - 1; xx <= gx + 1; xx++) {
                if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
                for (int j = head[yy * gw + xx]; j >= 0; j = next[j]) {
                    if (j == k) continue;
                    float dx = (cs[j].x0 + cs[j].x1) * 0.5f - cx, dy = (cs[j].y0 + cs[j].y1) * 0.5f - cy, d2 = dx * dx + dy * dy;
                    if (d2 < best) { best = d2; sdx = dx; sdy = dy; }
                }
            }
            if (best > 6.25f * sz * sz || best < 0.04f * sz * sz) continue;
            float a = atan2f(sdy, sdx) * 57.29578f;
            while (a > 45.0f) a -= 90.0f; while (a <= -45.0f) a += 90.0f;
            int b = (int)((a + 45.0f) * 2.0f); if (b < 0) b = 0; if (b > 179) b = 179;
            hist[b] += 1.0f; ang[na++] = a;
        }
        if (na >= 20) {
            int pk = 0; float pv = -1;
            for (int b = 0; b < 180; b++) { float v = 0; for (int q = -3; q <= 3; q++) v += hist[(b + q + 180) % 180]; if (v > pv) { pv = v; pk = b; } }
            float c = pk / 2.0f - 45.0f + 0.25f, sum = 0; int cnt = 0;
            for (int q = 0; q < na; q++) { float d = ang[q] - c; if (d > 45) d -= 90; if (d <= -45) d += 90; if (fabsf(d) <= 2.0f) { sum += d; cnt++; } }
            slant = cnt ? c + sum / cnt : c;
        }
        free(ang); free(head); free(next);
    }
    /* only a page whose lines run nearly across it (the caller sets the text upright and levels it beyond a few degrees) */
    if (fabsf(slant) > 8.0f) slant = 0;
    /* made exact (the letters' neighbours give it within half a degree; a rule scanned half a degree off leaves it every
       hundred pixels): the angle within a degree of it, by tenths, whose profile of the ink across the lines is the
       sharpest — Postl's criterion, the sum of the squared differences of neighbouring rows */
    {
        int nb = h + (int)(2 * tanf(9.0f * 0.017453293f) * w) + 4, off = nb / 2 - h / 2;
        float *prof = malloc(sizeof(float) * nb), bestv = -1, bests = slant;
        for (int q = -10; q <= 10; q++) {
            float a = slant + q * 0.1f, tt = tanf(a * 0.017453293f);
            for (int b = 0; b < nb; b++) prof[b] = 0;
            for (int y = 0; y < h; y += 1) for (int x = 0; x < w; x += 2) if (ink[y * w + x]) { int b = (int)lroundf(y - x * tt) + off; if (b >= 0 && b < nb) prof[b] += 1; }
            float v = 0; for (int b = 1; b < nb; b++) { float d = prof[b] - prof[b - 1]; v += d * d; }
            if (v > bestv) { bestv = v; bests = a; }
        }
        free(prof);
        slant = bests;
    }
    out[3] = (int32_t)lroundf(slant * 100.0f);
    float t = tanf(slant * 0.017453293f);
    if (what & 1) {
        /* ruled lines: long runs along the lines (y = y0 + x·t) and across them (x = x0 − y·t) */
        uint8_t *rm = calloc(n, 1);
        int L = (int)(7 * xh); if (L < 40) L = 40;
        int ext = (int)ceilf(fabsf(t) * (w > h ? w : h)) + 2;
        /* (on the light ink, with gaps of up to 2 px bridged: a soft photo's grey rule breaks up here and there) */
        for (int y0 = -ext; y0 < h + ext; y0++) {
            int run = 0, gap = 0;
            for (int x = 0; x <= w; x++) {
                int y = x < w ? (int)lroundf(y0 + x * t) : -1, on = x < w && y >= 0 && y < h && lite[y * w + x];
                if (on) { if (run) run += gap; run++; gap = 0; continue; }
                if (run && ++gap <= 2 && x < w) continue;
                /* the run: its last pixel on is x − gap */
                if (run >= L) for (int k = x - gap - run + 1; k <= x - gap; k++) { if (k < 0 || k >= w) continue; int yy = (int)lroundf(y0 + k * t); if (yy >= 0 && yy < h) rm[yy * w + k] |= 1; }
                run = 0; gap = 0;
            }
        }
        for (int x0 = -ext; x0 < w + ext; x0++) {
            int run = 0, gap = 0;
            for (int y = 0; y <= h; y++) {
                int x = y < h ? (int)lroundf(x0 - y * t) : -1, on = y < h && x >= 0 && x < w && lite[y * w + x];
                if (on) { if (run) run += gap; run++; gap = 0; continue; }
                if (run && ++gap <= 2 && y < h) continue;
                if (run >= L) for (int k = y - gap - run + 1; k <= y - gap; k++) { if (k < 0 || k >= h) continue; int xx = (int)lroundf(x0 - k * t); if (xx >= 0 && xx < w) rm[k * w + xx] |= 2; }
                run = 0; gap = 0;
            }
        }
        /* each direction's runs: thin, with paper beside them along most of their length */
        uint8_t *dm = malloc(n);
        int cleared = 0, inner = 0;
        float thick = 0.45f * xh; if (thick < 3) thick = 3;
        int side = (int)lroundf(0.2f * xh) + 2;
        for (int dir = 1; dir <= 2; dir++) {
            for (int i = 0; i < n; i++) dm[i] = (rm[i] & dir) ? 1 : 0;
            int nr = cm_label(dm, w, h, pix, cs, cap);
            for (int k = 0; k < nr; k++) {
                cm_comp *c = &cs[k];
                /* the thickness across the run: the spread of (y − x·t) or (x + y·t) over its pixels */
                float lo = 1e30f, hi = -1e30f;
                for (int q = 0; q < c->n; q++) { int i = pix[c->off + q], x = i % w, y = i / w; float v = dir == 1 ? y - x * t : x + y * t; if (v < lo) lo = v; if (v > hi) hi = v; }
#ifdef CM_DEBUG
                if (c->n > 200) fprintf(stderr, "rule dir=%d (%d,%d)-(%d,%d) n=%d thick=%.1f max=%.1f\n", dir, c->x0, c->y0, c->x1, c->y1, c->n, hi - lo + 1, thick);
#endif
                if (hi - lo + 1 > thick) continue;
                /* paper beside it: along most of its length, ink-free on both sides from two pixels off it to `side` + 1
                   (a table's rule has its cells' padding either side; the serifs along a long word's baseline, which run
                   as long, have the letters above them; the middle of a soft word without ascenders — its letters run
                   together there — has the rest of the letters just above and below it, and a bold word's top and bottom
                   are two such runs with the strokes between them). Ink of a rule across it (a table's grid) does not
                   count; another run along it does (two runs that close are a word's, or a double rule — left as it is). */
                int seen = 0, clear = 0; float mid = (lo + hi) / 2, half = (hi - lo) / 2;
                int a0 = dir == 1 ? c->x0 : c->y0, a1 = dir == 1 ? c->x1 : c->y1;
                for (int a = a0; a <= a1; a += 2) {
                    int ok[2] = {1, 1}, any = 0;
                    for (int sgn = 0; sgn < 2; sgn++) {
                        float s = sgn ? 1.0f : -1.0f;
                        for (int d = 2; d <= side + 1 && ok[sgn]; d++) {
                            float v = mid + s * (half + d);
                            int x, y;
                            if (dir == 1) { x = a; y = (int)lroundf(v + a * t); } else { y = a; x = (int)lroundf(v - a * t); }
                            if (x < 0 || y < 0 || x >= w || y >= h) continue;
                            any = 1;
                            int j = y * w + x;
                            if ((ink[j] && !(rm[j] & (3 - dir))) || (rm[j] & dir)) ok[sgn] = 0;
                        }
                    }
                    if (!any) continue;
                    seen++; if (ok[0] && ok[1]) clear++;
                }
#ifdef CM_DEBUG
                if (c->n > 200) fprintf(stderr, "  sides seen=%d clear=%d\n", seen, clear);
#endif
                if (seen < 4 || clear < 0.6f * seen) continue;
                cm_clear(px, w, h, pix + c->off, c->n);
                for (int q = 0; q < c->n; q++) ink[pix[c->off + q]] = 0;
                cleared += c->n;
                /* a rule inside the page (a table's, a form's), not a line along its edge (a page straightened from a photo
                   keeps a trace of its edge — every Kindle photo has two) */
                if (dir == 1 ? c->y0 > 0.02f * h && c->y1 < 0.98f * h : c->x0 > 0.02f * w && c->x1 < 0.98f * w) inner += c->n;
            }
        }
        free(dm); free(rm);
        out[0] = cleared; out[5] = inner;
    }
    if (what & 2) {
        /* list marks: the components again (without the lines just cleared) */
        uint8_t *lab = malloc(n); memcpy(lab, ink, n);
        nc = cm_label(lab, w, h, pix, cs, cap);
        free(lab);
        int cell = (int)(2 * xh) + 1, gw = w / cell + 1, gh = h / cell + 1, *head = malloc(sizeof(int) * gw * gh), *next = malloc(sizeof(int) * nc);
        for (int c = 0; c < gw * gh; c++) head[c] = -1;
        for (int k = 0; k < nc; k++) { int cx = (cs[k].x0 + cs[k].x1) / 2 / cell, cy = (cs[k].y0 + cs[k].y1) / 2 / cell; next[k] = head[cy * gw + cx]; head[cy * gw + cx] = k; }
        uint8_t *gone = calloc(nc, 1);
        int marks = 0, labels = 0;
        for (int k = 0; k < nc; k++) {
            cm_comp *c = &cs[k];
            int bw = c->x1 - c->x0 + 1, bh = c->y1 - c->y0 + 1, m = bw > bh ? bw : bh;
            float asp = (float)bw / bh;
            if (m < 0.3f * xh || m > 2.0f * xh || asp < 0.5f || asp > 2.0f || c->n < 6) continue;
            /* the line it stands on: neighbours overlapping it up and down (along the slant); the nearest one to the
               right, and anything just to its left */
            float ccx = (c->x0 + c->x1) * 0.5f, ctop = c->y0 - ccx * t, cbot = c->y1 - ccx * t;
            int right = -1, rgap = 1 << 30, left = 0, nr = 0, rx0[64], rx1[64];
            int gx0 = (int)((c->x0 - 3 * xh) / cell) - 1, gx1 = (int)((c->x1 + 25 * xh) / cell) + 1, gy0 = (int)((c->y0 - 2 * xh) / cell) - 1, gy1 = (int)((c->y1 + 2 * xh) / cell) + 1;
            for (int gy = gy0; gy <= gy1 && !left; gy++) for (int gx = gx0; gx <= gx1 && !left; gx++) {
                if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
                for (int j = head[gy * gw + gx]; j >= 0; j = next[j]) {
                    if (j == k || gone[j]) continue;
                    cm_comp *o = &cs[j];
                    if (o->x0 >= c->x0 && o->x1 <= c->x1 && o->y0 >= c->y0 && o->y1 <= c->y1) continue;   /* inside it (a box's tick) */
                    int ow = o->x1 - o->x0 + 1, oh = o->y1 - o->y0 + 1, om = ow > oh ? ow : oh;
                    if (om < 0.25f * xh || om > 8 * xh) continue;                     /* specks; pictures */
                    float ox = (o->x0 + o->x1) * 0.5f, otop = o->y0 - ox * t, obot = o->y1 - ox * t;
                    float ov = (cbot < obot ? cbot : obot) - (ctop > otop ? ctop : otop) + 1;
                    /* something right above or below it (the dot of an i or a j, a colon's other dot): no mark */
                    int hov = (c->x1 < o->x1 ? c->x1 : o->x1) - (c->x0 > o->x0 ? c->x0 : o->x0) + 1;
                    if (ov <= 0 && hov >= 0.3f * (bw < ow ? bw : ow) && (otop - cbot < 0.6f * xh && ctop - obot < 0.6f * xh)) { left = 1; break; }
                    /* something just before it, up to half an x-height above or below (a comma hangs below the baseline:
                       the word before it): not the start of a line */
                    if (o->x1 < c->x0 && c->x0 - o->x1 <= 2.5f * xh && obot >= ctop - 0.5f * xh && otop <= cbot + 0.5f * xh) { left = 1; break; }
                    if (ov < 0.4f * (bh < oh ? bh : oh)) continue;                     /* not on its line */
                    if (o->x1 >= c->x0 && o->x0 <= c->x1) { left = 1; break; }        /* beside it up and down: inside something */
                    if (o->x1 < c->x0) { if (c->x0 - o->x1 <= 2.5f * xh) { left = 1; break; } continue; }
                    int gap = o->x0 - c->x1 - 1;
                    if (gap < rgap) { rgap = gap; right = j; }
                    if (gap <= 25 * xh && nr < 64) { rx0[nr] = o->x0; rx1[nr] = o->x1; nr++; }   /* the line's text, for its word spaces */
                }
            }
#ifdef CM_DEBUG
            if (m >= 0.4f * xh) fprintf(stderr, "cand (%d,%d) %dx%d n=%d left=%d right=%d rgap=%d xh=%.1f\n", c->x0, c->y0, bw, bh, c->n, left, right, rgap, xh);
#endif
            if (left || right < 0 || rgap > 9 * xh) continue;
            { cm_comp *o = &cs[right]; int oh = o->y1 - o->y0 + 1; if (oh < 0.5f * xh || oh > 3 * xh) continue; }   /* letters follow */
            /* the shape */
            int harea = 0, holes = cm_holes(pix + c->off, c->n, w, c->x0, c->y0, bw, bh, &harea);
            double hull = cm_hull(pix + c->off, c->n, w, c->x0, c->y0, bw, bh), box = (double)bw * bh;
            float gmin = 0, filled = (float)((c->n + harea) / box);    /* the shape with its hole filled, of its box */
            int inner = 0, cls = 0;     /* cls: which of the four shapes below it is (for the list of marks) */
            if (m >= 0.35f * xh && m < 0.8f * xh && holes <= 1 && c->n + harea >= 0.85 * hull && asp >= 0.6f && asp <= 1.7f) { gmin = 0.6f * xh; cls = 1; }   /* • ◦ ○ smaller than a letter (a soft photo closes a small ring's hole) */
            else if (holes == 0 && c->n >= 0.85 * hull && c->n >= 0.45 * box && m >= 0.35f * xh && m <= 2.0f * xh) { gmin = 0.6f * xh; cls = 2; }   /* ● ■ ▪ ◆ ► (no letter is a solid convex blob) */
            else if (holes == 1 && harea >= 0.3 * box && c->n + harea >= 0.85 * hull && asp >= 0.7f && asp <= 1.45f && m >= 0.4f * xh && m <= 1.9f * xh) {
                cls = 3;
                /* a hollow square (□ ☐: it fills its box, as no letter does), or a thin ring (○: the hole 0.6 and more of
                   the shape it fills) after the gap of a list; a ring as thick as a letter's (o, O, 0 — Word's
                   second-level bullet is an o) only after a tab */
                gmin = (filled >= 0.88f && asp >= 0.8f && asp <= 1.25f) || harea >= 0.6 * (harea + c->n) ? 0.6f * xh : 1.3f * xh;
                inner = 1;                                                                                              /* ☑ ☒ whose tick does not touch the box */
            }
            else if (asp >= 0.75f && asp <= 1.33f && m >= 0.8f * xh && m <= 2.0f * xh) {                                 /* ☑ ☒: a frame round something (its border may be broken) */
                int edge = 0, on = 0;
                uint8_t *bm = calloc((size_t)bw * bh, 1);
                for (int q = 0; q < c->n; q++) { int i = pix[c->off + q]; bm[(i / w - c->y0) * bw + i % w - c->x0] = 1; }
                for (int x = 0; x < bw; x++) { edge += 2; on += bm[x] | (bh > 1 ? bm[bw + x] : 0); on += bm[(bh - 1) * bw + x] | (bh > 1 ? bm[(bh - 2) * bw + x] : 0); }
                for (int y = 0; y < bh; y++) { edge += 2; on += bm[y * bw] | (bw > 1 ? bm[y * bw + 1] : 0); on += bm[y * bw + bw - 1] | (bw > 1 ? bm[y * bw + bw - 2] : 0); }
                free(bm);
                if (on >= 0.75 * edge) { gmin = 0.6f * xh; inner = 1; cls = 4; }
            }
#ifdef CM_DEBUG
            fprintf(stderr, "  shape holes=%d harea=%d hull=%.0f box=%.0f fill=%.2f hullfill=%.2f ring=%.2f gmin=%.1f rgap=%d\n", holes, harea, hull, box, c->n / box, (c->n + harea) / hull, harea / (double)(harea + c->n), gmin, rgap);
#endif
            if (gmin <= 0 || rgap < gmin) continue;
            /* a small mark without a hole, paler than the letter after it by a quarter of the way from its ink to the paper,
               was drawn with thin strokes: a ring whose hole the blur closed (◦ in a soft video frame: its darkest grey 161 –
               176 where the letters' is 111 and the solid dots' 19 – 36) — for the list of marks only */
            int pale = 0, letter = 0;
            if ((cls == 1 || cls == 2) && !holes) {
                int lt = cm_darkest(px, pix + cs[right].off, cs[right].n), dk = cm_darkest(px, pix + c->off, c->n);
                pale = cls == 1 && dk > lt + (255 - lt) / 4;
                /* on a soft page (its letters pale: thin strokes, blurred) a solid mark stays far darker than the letters (dots
                   19 – 36, letters 111); a blob as dark as they are and as tall as the x-height is a letter whose hole the blur
                   closed — the "a." of a lettered list (122; 1.0 and 0.91 of the x-height on two frames), set off by a tab, or
                   "ii." run together: kept. A small mark drawn with thin strokes is as pale as the letters but shorter (the ►
                   of a soft frame of a report: 0.67 – 0.78 of the x-height; kept, they made Tesseract read 33 % of its words
                   instead of 46 %) */
#ifdef CM_DEBUG
                { double sx = 0; for (int q = 0; q < c->n; q++) sx += pix[c->off + q] % w - c->x0 + 0.5;
                  fprintf(stderr, "  letter? dk=%d lt=%d pale=%d bh/xh=%.2f centroid %.3f\n", dk, lt, pale, bh / xh, sx / c->n / bw - 0.5); }
#endif
                letter = lt > 80 && !pale && dk >= lt * 3 / 4 && bh >= 0.85f * xh;
            }
            /* a list's mark is set off from its text by more than any word space of its line (a tab, an indent); the first
               word of a line of running text by one of them — "a" on a soft photo, its hole closed by the blur, is a solid
               blob (it was cleared from the start of Kindle lines: "a pod of dolphins"). Two more gaps on the line about as
               wide (justified text stretches its spaces alike): a word space, no mark. Not asked of a box (□ ☐ ☑ ☒: a frame
               with ink in its four corners, which no letter has), which a checklist sets off by no more than a word space
               (to-do #31: the boxes of a Google Docs checklist stayed and were read as "[J" and "[0") */
            int boxish = cls == 4 || (cls == 3 && filled >= 0.88f && asp >= 0.8f && asp <= 1.25f && cm_corners(pix + c->off, c->n, w, c->x0, c->y0, bw, bh, 0.1f));
            if (!boxish) {
                for (int q = 1; q < nr; q++) { int a0 = rx0[q], a1 = rx1[q], r2 = q; while (r2 > 0 && rx0[r2 - 1] > a0) { rx0[r2] = rx0[r2 - 1]; rx1[r2] = rx1[r2 - 1]; r2--; } rx0[r2] = a0; rx1[r2] = a1; }
                int wide = 0, end = nr ? rx1[0] : 0;
                for (int q = 1; q < nr; q++) { int gp = rx0[q] - end - 1; if (gp >= 0.75f * rgap) wide++; if (rx1[q] > end) end = rx1[q]; }
#ifdef CM_DEBUG
                fprintf(stderr, "  gap after it %d; gaps on its line as wide: %d\n", rgap, wide);
#endif
                if (wide >= 2) continue;
            }
            if (cm_run_before(cs, nc, gone, c, xh, t)) continue;
            /* a list's label kept (see above): counted, as the marks are, for what they tell of the page — a list (the
               reading path decides with them which picture PaddleOCR reads, and whether to read the page again) */
            if (letter) { labels++; continue; }
            cm_clear(px, w, h, pix + c->off, c->n); gone[k] = 1; marks++;
            long quarter[4] = {0, 0, 0, 0};   /* the ink inside a box (a tick, a cross), by the quarters of the box */
            if (inner) for (int gy = c->y0 / cell; gy <= c->y1 / cell; gy++) for (int gx = c->x0 / cell; gx <= c->x1 / cell; gx++) {
                if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
                for (int j = head[gy * gw + gx]; j >= 0; j = next[j]) { cm_comp *o = &cs[j]; if (!gone[j] && o->x0 > c->x0 && o->x1 < c->x1 && o->y0 > c->y0 && o->y1 < c->y1) {
                    cm_clear(px, w, h, pix + o->off, o->n); gone[j] = 1;
                    for (int q = 0; q < o->n; q++) { int i = pix[o->off + q]; quarter[CM_QUARTER(i % w, i / w, c->x0, c->y0, c->x1, c->y1)]++; }
                } }
            }
            if (nlist < cap_list) {
                int kind;
                if (cls == 1) kind = holes || pale ? CM_RING : cm_solid(pix + c->off, c->n, w, c->x0, bw, bh);
                else if (cls == 2) kind = cm_solid(pix + c->off, c->n, w, c->x0, bw, bh);
                else if (cls == 3) {
                    /* a square (☐, or ☑ ☒ with their tick or cross inside, not touching it) or a ring (○, Word's o; ◉ with a dot) */
                    int square = filled >= 0.88f && asp >= 0.8f && asp <= 1.25f, any = quarter[0] + quarter[1] + quarter[2] + quarter[3] > 0;
                    kind = square ? (any ? cm_tick(quarter) : CM_BOX) : (any ? CM_RADIO : CM_RING);
                } else {
                    /* a frame round its tick or cross (they touch it): the ink of the component away from the frame */
                    int b = (int)lroundf(0.18f * (bw < bh ? bw : bh)); if (b < 1) b = 1;
                    for (int q = 0; q < c->n; q++) {
                        int i = pix[c->off + q], x = i % w, y = i / w;
                        if (x - c->x0 < b || c->x1 - x < b || y - c->y0 < b || c->y1 - y < b) continue;
                        quarter[CM_QUARTER(x, y, c->x0, c->y0, c->x1, c->y1)]++;
                    }
                    kind = cm_tick(quarter);
                }
                int32_t *e = list + 5 * nlist++; e[0] = c->x0; e[1] = c->y0; e[2] = c->x1; e[3] = c->y1; e[4] = kind;
            }
        }
        /* faint marks (to-do #31): a box or a ring drawn in thin grey strokes, which a phone's photo softens below the ink
           threshold in places — a Google Docs checklist's ☐ whose top and bottom came out fainter than its sides (two bars
           in the ink), its ○ in pieces — but keeps whole in the light ink. On the light ink (what is not cleared yet): a
           frame (its four corners inked) or a ring with its hole, between half and twice the x-height, the first thing on
           its line, letters after it beyond a gap, and paler than them (a letter o, O, D or 0 is as dark as the rest);
           taken only where another mark of the page stands at the same place on another line — a list (a pale letter of
           a light watermark stands alone) */
        {
            uint8_t *lm = malloc(n);
            int32_t *pix2 = malloc(sizeof(int32_t) * n);
            cm_comp *cs2 = malloc(sizeof(cm_comp) * cap);
            int maxf = 256, nf = 0, *fk = malloc(sizeof(int) * maxf), *fholes = malloc(sizeof(int) * maxf), *fkind = malloc(sizeof(int) * maxf);
            if (lm && pix2 && cs2 && fk && fholes && fkind) {
                for (int i = 0; i < n; i++) { const uint8_t *p = px + (size_t)i * 4; lm[i] = lite[i] && ((77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8) < 250; }
                int nc2 = cm_label(lm, w, h, pix2, cs2, cap);
                for (int k2 = 0; k2 < nc2 && nf < maxf; k2++) {
                    cm_comp *f = &cs2[k2];
                    int bw = f->x1 - f->x0 + 1, bh = f->y1 - f->y0 + 1, m = bw > bh ? bw : bh;
                    float asp = (float)bw / bh;
#ifdef CM_DEBUG
                    if (f->x0 < 320 && m >= 0.4f * xh && m <= 2.5f * xh) fprintf(stderr, "faint cand (%d,%d) %dx%d n=%d asp=%.2f\n", f->x0, f->y0, bw, bh, f->n, asp);
#endif
                    if (m < 0.5f * xh || m > 1.9f * xh || asp < 0.7f || asp > 1.45f || f->n < 8) continue;
                    /* nothing just before it, letters after it on its line (the ink's components, the grid above) */
                    float fcx = (f->x0 + f->x1) * 0.5f, ftop = f->y0 - fcx * t, fbot = f->y1 - fcx * t;
                    int right = -1, rgap = 1 << 30, left = 0;
                    int gx0 = (int)((f->x0 - 3 * xh) / cell) - 1, gx1 = (int)((f->x1 + 10 * xh) / cell) + 1, gy0 = (int)((f->y0 - 2 * xh) / cell) - 1, gy1 = (int)((f->y1 + 2 * xh) / cell) + 1;
                    for (int gy = gy0; gy <= gy1 && !left; gy++) for (int gx = gx0; gx <= gx1 && !left; gx++) {
                        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
                        for (int j = head[gy * gw + gx]; j >= 0; j = next[j]) {
                            cm_comp *o = &cs[j];
                            if (gone[j] || (o->x0 >= f->x0 - 1 && o->x1 <= f->x1 + 1 && o->y0 >= f->y0 - 1 && o->y1 <= f->y1 + 1)) continue;   /* its own strokes, a tick */
                            int ow = o->x1 - o->x0 + 1, oh = o->y1 - o->y0 + 1, om = ow > oh ? ow : oh;
                            if (om < 0.25f * xh || om > 8 * xh) continue;
                            float ox = (o->x0 + o->x1) * 0.5f, otop = o->y0 - ox * t, obot = o->y1 - ox * t;
                            float ov = (fbot < obot ? fbot : obot) - (ftop > otop ? ftop : otop) + 1;
                            if (o->x1 < f->x0 && f->x0 - o->x1 <= 2.5f * xh && obot >= ftop - 0.5f * xh && otop <= fbot + 0.5f * xh) { left = 1; break; }
                            if (ov < 0.4f * (bh < oh ? bh : oh) || o->x1 < f->x0) continue;
                            if (o->x0 <= f->x1) { left = 1; break; }     /* beside it up and down: inside something */
                            int gap = o->x0 - f->x1 - 1;
                            if (gap < rgap) { rgap = gap; right = j; }
                        }
                    }
#ifdef CM_DEBUG
                    fprintf(stderr, "  left=%d right=%d rgap=%d darkest %d letter %d\n", left, right, rgap, cm_darkest(px, pix2 + f->off, f->n), right >= 0 ? cm_darkest(px, pix + cs[right].off, cs[right].n) : -1);
#endif
                    /* (the light ink widens both the mark and the letter after it: the gap between them narrows) */
                    if (left || right < 0 || rgap < 0.3f * xh || rgap > 9 * xh) continue;
                    { int oh = cs[right].y1 - cs[right].y0 + 1; if (oh < 0.5f * xh || oh > 3 * xh) continue; }
                    int lt = cm_darkest(px, pix + cs[right].off, cs[right].n);
                    if (cm_darkest(px, pix2 + f->off, f->n) <= lt + (255 - lt) / 4) continue;
                    /* the shape — looked at last: most components are letters, which the checks above leave out */
                    int harea = 0, holes = cm_holes(pix2 + f->off, f->n, w, f->x0, f->y0, bw, bh, &harea);
                    double hull = cm_hull(pix2 + f->off, f->n, w, f->x0, f->y0, bw, bh), box = (double)bw * bh;
                    /* a box (its hole large, its corners inked near the corner: softened, they are round) or a round mark —
                       a ring whose hole the light ink fills (the light ink takes in the blur around thin strokes) */
                    int frame = (f->n + harea) >= 0.85 * box && asp >= 0.8f && asp <= 1.25f && holes >= 1 && harea >= 0.08 * box && cm_corners(pix2 + f->off, f->n, w, f->x0, f->y0, bw, bh, 0.22f);
                    int ring = !frame && f->n + harea >= 0.85 * hull;
#ifdef CM_DEBUG
                    if (f->x0 < 320) fprintf(stderr, "  holes=%d harea=%d fill=%.2f hullfill=%.2f corners=%d frame=%d ring=%d\n", holes, harea, (f->n + harea) / box, (f->n + harea) / hull, cm_corners(pix2 + f->off, f->n, w, f->x0, f->y0, bw, bh, 0.22f), frame, ring);
#endif
                    if (!frame && !ring) continue;
                    if (cm_run_before(cs, nc, gone, f, xh, t)) continue;
                    fk[nf] = k2; fholes[nf] = holes; fkind[nf] = frame ? CM_BOX : CM_RING; nf++;
                }
                /* a list: another mark — faint, or cleared above — at the same place (within half an x-height) on another line */
                for (int q = 0; q < nf; q++) {
                    cm_comp *f = &cs2[fk[q]];
                    int pair = 0;
                    for (int r2 = 0; r2 < nf && !pair; r2++) { cm_comp *g2 = &cs2[fk[r2]]; if (r2 != q && abs(g2->x0 - f->x0) <= 0.5f * xh && (g2->y0 > f->y1 || g2->y1 < f->y0)) pair = 1; }
                    for (int r2 = 0; r2 < nlist && !pair; r2++) { const int32_t *e = list + 5 * r2; if (abs(e[0] - f->x0) <= 0.5f * xh && (e[1] > f->y1 || e[3] < f->y0)) pair = 1; }
                    if (!pair) continue;
                    /* what is inside a box — a tick or a cross: it splits the box's hole (a soft frame's own blur thickens its
                       inner edge, so the ink near the frame says nothing), or it stands apart inside — by the quarters it fills */
                    long quarter[4] = {0, 0, 0, 0};
                    int apart = 0;
                    int bw = f->x1 - f->x0 + 1, bh = f->y1 - f->y0 + 1, b = (int)lroundf(0.18f * (bw < bh ? bw : bh)); if (b < 1) b = 1;
                    for (int q2 = 0; q2 < f->n; q2++) {
                        int i = pix2[f->off + q2], x = i % w, y = i / w;
                        if (x - f->x0 < b || f->x1 - x < b || y - f->y0 < b || f->y1 - y < b) continue;
                        const uint8_t *p = px + (size_t)i * 4;
                        if (ink[i] && ((77 * p[0] + 150 * p[1] + 29 * p[2]) >> 8) < 250) quarter[CM_QUARTER(x, y, f->x0, f->y0, f->x1, f->y1)]++;
                    }
                    for (int gy = f->y0 / cell; gy <= f->y1 / cell; gy++) for (int gx = f->x0 / cell; gx <= f->x1 / cell; gx++) {
                        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
                        /* (clear of the frame's band: the frame's own sides are shapes of their own in the ink) */
                        for (int j = head[gy * gw + gx]; j >= 0; j = next[j]) { cm_comp *o = &cs[j]; if (!gone[j] && o->x0 >= f->x0 + b && o->x1 <= f->x1 - b && o->y0 >= f->y0 + b && o->y1 <= f->y1 - b) {
                            for (int q2 = 0; q2 < o->n; q2++) { int i = pix[o->off + q2]; quarter[CM_QUARTER(i % w, i / w, f->x0, f->y0, f->x1, f->y1)]++; }
                            cm_clear(px, w, h, pix + o->off, o->n); gone[j] = 1; apart += o->n;
                        } }
                    }
                    int any = fholes[q] >= 2 || apart >= 0.04 * bw * bh;   /* (a speck of the photo's noise is no tick) */
                    int kind = fkind[q] == CM_BOX ? (any ? cm_tick(quarter) : CM_BOX) : CM_RING;   /* (a soft ring's own strokes fill it) */
                    cm_clear(px, w, h, pix2 + f->off, f->n); marks++;
#ifdef CM_DEBUG
                    fprintf(stderr, "faint mark %d at (%d,%d) %dx%d\n", kind, f->x0, f->y0, bw, bh);
#endif
                    if (nlist < cap_list) { int32_t *e = list + 5 * nlist++; e[0] = f->x0; e[1] = f->y0; e[2] = f->x1; e[3] = f->y1; e[4] = kind; }
                }
            }
            free(lm); free(pix2); free(cs2); free(fk); free(fholes); free(fkind);
        }
        free(gone); free(head); free(next);
        out[1] = marks; out[7] = labels;
        if (list) out[6] = nlist;
    }
    if (what & 4) {
        /* the columns of text, band by band (bands three x-heights high, across the lines' slant: x' = x + y·t): a gutter
           is a strip at least an x-height wide that is empty in most bands that hold text (a heading or a picture across
           it fills a few), at least six x-heights in from the text's sides, with text on both sides of it in most of
           those bands. Word spaces never line up down a page like that. */
        int ext = (int)ceilf(fabsf(t) * h) + 2, nb = w + 2 * ext, bh = (int)ceilf(3 * xh); if (bh < 6) bh = 6;
        int nbands = (h + bh - 1) / bh;
        int *prof = calloc((size_t)nb * nbands, sizeof(int)), *tot = calloc(nbands, sizeof(int));
        int X0 = nb, X1 = -1;
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) if (ink[y * w + x]) {
            int b = (int)lroundf(x + y * t) + ext; if (b < 0 || b >= nb) continue;
            prof[(y / bh) * nb + b]++; tot[y / bh]++; if (b < X0) X0 = b; if (b > X1) X1 = b;
        }
        int textb = 0; for (int k = 0; k < nbands; k++) if (tot[k] >= xh * xh) textb++;      /* a band with a few letters in it */
        /* (a few lines are one column: in six lines of justified text the word spaces lined up in six of eight bands and
           passed for two gutters; real column pages have 14 – 68 bands of text, their gutters empty in 72 – 100 %) */
        if (X1 - X0 > 14 * xh && textb >= 12) {
            int *empty = calloc(nb, sizeof(int));
            for (int k = 0; k < nbands; k++) if (tot[k] >= xh * xh) for (int b = X0; b <= X1; b++) if (!prof[k * nb + b]) empty[b]++;
            /* the text's sides: where text bands begin and end (the outermost x' that is not empty in a fifth of them) */
            int L0 = X0, L1 = X1;
            while (L0 < X1 && empty[L0] > 0.8 * textb) L0++;
            while (L1 > X0 && empty[L1] > 0.8 * textb) L1--;
            /* a column of running text is wide — eighteen x-heights and more (a newspaper's narrowest, some 20
               characters); a form's labels or a table's columns are narrower */
            int cols = 1, wmin = (int)ceilf(xh), side = (int)ceilf(6 * xh), colw = (int)ceilf(18 * xh), prev = L0;
            for (int b = L0 + side; b <= L1 - side; b++) {
                if (empty[b] < 0.7 * textb) continue;
                int e = b; while (e + 1 <= L1 - side && empty[e + 1] >= 0.7 * textb) e++;
                if (e - b + 1 >= wmin) {
                    /* text on both sides: bands with ink within six x-heights left of it, and right of it; and the lines on
                       its left run up to it (within 1.5 x-heights) in most of those bands — a column of text is filled
                       to its edge, a form's labels and a table's short cells stop well short of the gap after them */
                    int lt = 0, rt = 0, full = 0;
                    for (int k = 0; k < nbands; k++) {
                        if (tot[k] < xh * xh) continue;
                        int l = 0, r2 = 0, reach = side + 1;
                        for (int q = 1; q <= side; q++) { l += prof[k * nb + b - q]; r2 += prof[k * nb + e + q]; if (reach > side && prof[k * nb + b - q]) reach = q; }
                        if (l >= xh) { lt++; if (reach <= 1.5f * xh) full++; }
                        if (r2 >= xh) rt++;
                    }
#ifdef CM_DEBUG
                    fprintf(stderr, "gutter %d..%d (%d wide) empty in %d of %d bands; text left %d right %d, left lines up to it %d\n", b, e, e - b + 1, empty[b], textb, lt, rt, full);
#endif
                    if (lt >= 0.5 * textb && rt >= 0.5 * textb && full >= 0.5 * lt && b - prev >= colw && L1 - e >= colw) { cols++; prev = e; }
                }
                b = e;
            }
            out[4] = cols;
            free(empty);
        }
        free(prof); free(tot);
    }
    free(ink); free(lite); free(pix); free(cs);
    return out[0] + out[1] > 0;
}

/* ======================================================================== PaddleOCR, around its networks
 * The second reader of the OCR tab and the Photo Dictionary, for soft photos (owner, 26 Nov 2026: "Ok use PaddleOCR
 * fallback for soft photos"): PaddleOCR's PP-OCRv6 detector and recogniser and PP-OCRv4's direction classifier on
 * ONNX Runtime Web. These are the steps RapidOCR 3.10 takes around the networks (rapidocr/ch_ppocr_det/utils.py,
 * utils/process_img.py, ch_ppocr_cls/main.py, ch_ppocr_rec/main.py and utils.py), in OpenCV's conventions wherever a
 * result depends on them; src/lib/paddle.ts is the glue, and tests/unit/paddle.test.mjs holds the whole to RapidOCR. */

/* cv2.resize with INTER_LINEAR on an 8-bit picture, in OpenCV's own integer arithmetic (imgproc/src/resize.cpp, 4.x):
   per axis a source index and two weights of 2048 (fx = (d + 0.5)·scale − 0.5, cut at the edges, cvRound); the rows
   combined from 32-bit sums as its vector code does — ((S0 >> 4)·b0 >> 16) + ((S1 >> 4)·b1 >> 16), + 2, >> 2 — for the
   values its vector loops cover (16, then 8 at a time, along a row of 3 × dw values in its B, G, R order) and as its
   scalar code does for the rest ((S0·b0 + S1·b1 + 2^21) >> 22); a picture made exactly half as large both ways is made
   with INTER_AREA, as cv::resize does. RapidOCR resizes so (the photo to 2000 px, the detector's and the recogniser's
   inputs). */
static void lin_taps(int sn, int dn, int *idx, short *wt) {
    double scale = 1. / ((double)dn / sn);
    for (int d = 0; d < dn; d++) {
        float fx = (float)((d + 0.5) * scale - 0.5);
        int sx = (int)floorf(fx); fx -= sx;
        if (sx < 0) { fx = 0; sx = 0; }
        if (sx >= sn - 1) { fx = 0; sx = sn - 1; }
        idx[d] = sx;
        wt[d * 2] = (short)nearbyintf((1.f - fx) * 2048); wt[d * 2 + 1] = (short)nearbyintf(fx * 2048);
    }
}
typedef struct { int sw, sh, dw, dh, *xi, *yi, *h0, *h1; short *xa, *yb; } Lin;
static Lin lin_open(int sw, int sh, int dw, int dh) {
    Lin L = {sw, sh, dw, dh, malloc(sizeof(int) * dw), malloc(sizeof(int) * dh), malloc(sizeof(int) * dw * 4), malloc(sizeof(int) * dw * 4), malloc(sizeof(short) * dw * 2), malloc(sizeof(short) * dh * 2)};
    lin_taps(sw, dw, L.xi, L.xa); lin_taps(sh, dh, L.yi, L.yb);
    return L;
}
static void lin_close(Lin *L) { free(L->xi); free(L->yi); free(L->h0); free(L->h1); free(L->xa); free(L->yb); }
/* the horizontal pass of one source row: 32-bit sums (the last source pixel alone, × 2048, past the right edge) */
static void lin_hrow(const Lin *L, const uint8_t *row, int *h) {
    for (int x = 0; x < L->dw; x++) {
        int sx = L->xi[x];
        for (int c = 0; c < 4; c++) h[x * 4 + c] = sx + 1 < L->sw ? row[sx * 4 + c] * L->xa[x * 2] + row[(sx + 1) * 4 + c] * L->xa[x * 2 + 1] : row[sx * 4 + c] * 2048;
    }
}
/* target row y: 4 × dw values (RGBA; alpha by the scalar rule) */
static void lin_row(Lin *L, const uint8_t *src, int y, int *out) {
    int sy = L->yi[y], sy1 = sy + 1 < L->sh ? sy + 1 : sy, b0 = L->yb[y * 2], b1 = L->yb[y * 2 + 1];
    lin_hrow(L, src + (size_t)sy * L->sw * 4, L->h0); lin_hrow(L, src + (size_t)sy1 * L->sw * 4, L->h1);
    int width = L->dw * 3, x1 = width / 16 * 16, x2 = width - x1 > 8 ? x1 + 8 : x1;
    for (int x = 0; x < L->dw; x++) for (int c = 0; c < 4; c++) {
        int s0 = L->h0[x * 4 + c], s1 = L->h1[x * 4 + c], v, oc = c == 3 ? -1 : 2 - c;
        if (oc >= 0 && x * 3 + oc < x2) v = ((((s0 >> 4) * b0) >> 16) + (((s1 >> 4) * b1) >> 16) + 2) >> 2;
        else v = (s0 * b0 + s1 * b1 + (1 << 21)) >> 22;
        out[x * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
}
API void p_resize_linear(const uint8_t *src, int sw, int sh, uint8_t *dst, int dw, int dh) {
    if (sw == 2 * dw && sh == 2 * dh) { p_resize_area(src, sw, sh, dst, dw, dh); return; }
    if (sw == dw && sh == dh) { memcpy(dst, src, (size_t)sw * sh * 4); return; }
    Lin L = lin_open(sw, sh, dw, dh);
    int *row = malloc(sizeof(int) * dw * 4);
    for (int y = 0; y < dh; y++) { lin_row(&L, src, y, row); uint8_t *o = dst + (size_t)y * dw * 4; for (int i = 0; i < dw * 4; i++) o[i] = (uint8_t)row[i]; }
    free(row); lin_close(&L);
}
/* RGBA → a network's input: resized to dw × dh as cv2.resize does (p_resize_linear), as three planes in OpenCV's order
   B, G, R (PaddleOCR reads images with cv2), each value v / 127.5 − 1 (= (v / 255 − 0.5) / 0.5); the planes are pw ≥ dw
   wide and the columns from dw on are 0 (the recogniser's input is padded so). */
API void p_net_planes(const uint8_t *src, int sw, int sh, int dw, int dh, int pw, float *out) {
    size_t plane = (size_t)dh * pw;
    uint8_t *tmp = (sw == dw && sh == dh) ? (uint8_t *)src : malloc((size_t)dw * dh * 4);
    if (tmp != src) p_resize_linear(src, sw, sh, tmp, dw, dh);
    for (int y = 0; y < dh; y++) {
        const uint8_t *r = tmp + (size_t)y * dw * 4;
        float *ob = out + (size_t)y * pw, *og = ob + plane, *or_ = og + plane;
        for (int x = 0; x < dw; x++) { or_[x] = r[x * 4] / 127.5f - 1.f; og[x] = r[x * 4 + 1] / 127.5f - 1.f; ob[x] = r[x * 4 + 2] / 127.5f - 1.f; }
        for (int x = dw; x < pw; x++) ob[x] = og[x] = or_[x] = 0;
    }
    if (tmp != src) free(tmp);
}

typedef struct { double x, y; } Pt;
static int pt_cmp(const void *a, const void *b) {
    const Pt *p = a, *q = b;
    return p->x < q->x ? -1 : p->x > q->x ? 1 : p->y < q->y ? -1 : p->y > q->y;
}
static double pt_cross(Pt o, Pt a, Pt b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
/* the convex hull of n points (Andrew's monotone chain; p is sorted in place, h has room for n + 1); returns its size */
static int convex_hull(Pt *p, int n, Pt *h) {
    qsort(p, n, sizeof(Pt), pt_cmp);
    if (n < 3) { memcpy(h, p, sizeof(Pt) * n); return n; }
    int k = 0;
    for (int i = 0; i < n; i++) { while (k >= 2 && pt_cross(h[k - 2], h[k - 1], p[i]) <= 0) k--; h[k++] = p[i]; }
    for (int i = n - 2, t = k + 1; i >= 0; i--) { while (k >= t && pt_cross(h[k - 2], h[k - 1], p[i]) <= 0) k--; h[k++] = p[i]; }
    return k - 1;
}
/* the rectangle of least area round a convex hull (cv2.minAreaRect): one side along an edge of the hull; `u` the unit
   vector of that edge, the rectangle u0…u1 along it and v0…v1 across it (v = u turned a quarter) */
typedef struct { double ux, uy, u0, u1, v0, v1; } MinRect;
static MinRect min_area_rect(const Pt *h, int n) {
    MinRect r = {1, 0, 0, 0, 0, 0}; double best = INFINITY;
    if (n == 1) { r.u0 = r.u1 = h[0].x; r.v0 = r.v1 = h[0].y; return r; }
    for (int i = 0; i < n; i++) {
        Pt a = h[i], b = h[(i + 1) % n]; double dx = b.x - a.x, dy = b.y - a.y, L = sqrt(dx * dx + dy * dy);
        if (L == 0) continue;
        double ux = dx / L, uy = dy / L, u0 = INFINITY, u1 = -INFINITY, v0 = INFINITY, v1 = -INFINITY;
        for (int k = 0; k < n; k++) {
            double u = h[k].x * ux + h[k].y * uy, v = -h[k].x * uy + h[k].y * ux;
            if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
        }
        double area = (u1 - u0) * (v1 - v0);
        if (area < best - 1e-9) { best = area; r = (MinRect){ux, uy, u0, u1, v0, v1}; }
    }
    return r;
}
/* the rectangle's corners in order round it */
static void rect_corners(MinRect r, Pt c[4]) {
    double us[4] = {r.u0, r.u1, r.u1, r.u0}, vs[4] = {r.v0, r.v0, r.v1, r.v1};
    for (int q = 0; q < 4; q++) { c[q].x = us[q] * r.ux - vs[q] * r.uy; c[q].y = us[q] * r.uy + vs[q] * r.ux; }
}
/* a line of OpenCV's 8-connected Bresenham, traced from its left end (cv::line, LINE_8 — LineIterator), into a mask */
static void line8(uint8_t *m, int mw, int mh, int x0, int y0, int x1, int y1) {
    if (x0 > x1) { int t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
    int dx = x1 - x0, dy = y1 - y0, sy = dy < 0 ? -1 : 1; dy = dy < 0 ? -dy : dy;
    int swap = dy > dx;
    if (swap) { int t = dx; dx = dy; dy = t; }
    int err = dx - 2 * dy, plus = 2 * dx, minus = -2 * dy, x = x0, y = y0;
    for (int i = 0; i <= dx; i++) {
        if (x >= 0 && y >= 0 && x < mw && y < mh) m[(size_t)y * mw + x] = 1;
        int step = err < 0;
        err += minus + (step ? plus : 0);
        if (swap) { y += sy; if (step) x++; } else { x++; if (step) y += sy; }
    }
}
/* floor(n / d) for d > 0 */
static inline long long fdiv(long long n, long long d) { return n >= 0 ? n / d : -((-n + d - 1) / d); }
/* the mean of `pr` (w wide) over the quad c, as box_score_fast takes it: the quad's pixel box (floor / ceil, inside the
   map), the quad's corners shifted into it and cut to whole pixels (np.int32), the pixels cv2.fillPoly sets — its
   edges drawn as lines (LINE_8) and each row filled between its edges, to the last pixel whose centre lies left of the
   right edge + ½ (OpenCV 5.1, held to cv2.fillPoly exactly on 266,196 pixels of random quads) — counted */
static float quad_mean(const float *pr, int w, int h, const Pt c[4]) {
    double xmn = c[0].x, xmx = c[0].x, ymn = c[0].y, ymx = c[0].y;
    for (int q = 1; q < 4; q++) { if (c[q].x < xmn) xmn = c[q].x; if (c[q].x > xmx) xmx = c[q].x; if (c[q].y < ymn) ymn = c[q].y; if (c[q].y > ymx) ymx = c[q].y; }
    int x0 = CLAMP((int)floor(xmn), 0, w - 1), x1 = CLAMP((int)ceil(xmx), 0, w - 1), y0 = CLAMP((int)floor(ymn), 0, h - 1), y1 = CLAMP((int)ceil(ymx), 0, h - 1);
    int mw = x1 - x0 + 1, mh = y1 - y0 + 1, px[4], py[4], ylo = INT32_MAX, yhi = INT32_MIN;
    for (int q = 0; q < 4; q++) { px[q] = (int)(c[q].x - x0); py[q] = (int)(c[q].y - y0); if (py[q] < ylo) ylo = py[q]; if (py[q] > yhi) yhi = py[q]; }
    uint8_t *m = calloc((size_t)mw * mh, 1);
    for (int q = 0; q < 4; q++) { int a = (q + 3) & 3; line8(m, mw, mh, px[a], py[a], px[q], py[q]); }
    for (int y = ylo < 0 ? 0 : ylo; y < yhi && y < mh; y++) {
        /* the edges this row crosses (each from its top to the row before its bottom): x = xa + (xb − xa)(y − ya) / (yb − ya) */
        long long ln = 0, ld = 1, rn = 0, rd = 1; int k = 0;
        for (int q = 0; q < 4; q++) {
            int a = (q + 3) & 3, xa = px[a], ya = py[a], xb = px[q], yb = py[q];
            if (ya == yb) continue;
            if (ya > yb) { int t = xa; xa = xb; xb = t; t = ya; ya = yb; yb = t; }
            if (y < ya || y >= yb) continue;
            long long n = (long long)xa * (yb - ya) + (long long)(xb - xa) * (y - ya), d = yb - ya;
            if (!k) { ln = rn = n; ld = rd = d; }
            else { if (n * ld < ln * d) { ln = n; ld = d; } if (n * rd > rn * d) { rn = n; rd = d; } }
            k++;
        }
        if (k < 2) continue;
        long long a = fdiv(2 * ln + ld, 2 * ld), b = -fdiv(-(2 * rn + rd), 2 * rd) - 1; /* ⌊xl + ½⌋, ⌈xr + ½⌉ − 1 */
        if (a < 0) a = 0; if (b > mw - 1) b = mw - 1;
        for (long long x = a; x <= b; x++) m[(size_t)y * mw + x] = 1;
    }
    double sum = 0; long cnt = 0;
    for (int y = 0; y < mh; y++) for (int x = 0; x < mw; x++) if (m[(size_t)y * mw + x]) { sum += pr[(size_t)(y + y0) * w + x + x0]; cnt++; }
    free(m);
    return cnt ? (float)(sum / cnt) : 0.f;
}
/* the boxes of text in the detector's probability map (DBPostProcess: thresh, box_thresh, unclip_ratio,
   max_candidates; RapidOCR's settings 0.3, 0.5, 1.6, 1000, with the 2 × 2 dilation): the map above `thresh`, grown by a
   pixel to the right and down; for each 8-connected region the rectangle of least area round it (no side below 3 px)
   scored by the mean probability inside it (at least box_thresh), grown on every side by area × unclip / perimeter
   (the round offset of pyclipper, whose least rectangle this is, made of the corners cut to whole pixels), no side
   below 5 px; scaled to the dw × dh picture the map was made from (rounded half to even, kept inside it) and its
   corners put in the order TL, TR, BR, BL (order_points_clockwise), whole pixels inside the picture; a box less than 4 px
   wide or high left out. out: 9 floats a box (the corners, the score); returns how many (at most max). */
API int p_db_boxes(const float *pr, int w, int h, float thresh, float box_thresh, float unclip, int max_cand, int dw, int dh, float *out, int max) {
    size_t n = (size_t)w * h;
    uint8_t *seg = malloc(n), *m = calloc(n, 1);
    for (size_t i = 0; i < n; i++) seg[i] = pr[i] > thresh;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {   /* cv2.dilate with [[1,1],[1,1]], anchor (1,1) */
        size_t i = (size_t)y * w + x;
        m[i] = seg[i] || (x && seg[i - 1]) || (y && seg[i - w]) || (x && y && seg[i - w - 1]);
    }
    free(seg);
    int32_t *stack = malloc(sizeof(int32_t) * n);
    int *rmin = malloc(sizeof(int) * h), *rmax = malloc(sizeof(int) * h);
    for (int y = 0; y < h; y++) { rmin[y] = INT32_MAX; rmax[y] = -1; }
    Pt *pts = malloc(sizeof(Pt) * (2 * h + 8)), *hull = malloc(sizeof(Pt) * (2 * h + 8));
    int k = 0, cand = 0;
    for (size_t s = 0; s < n && cand < max_cand && k < max; s++) {
        if (m[s] != 1) continue;
        cand++;
        int top = 0, ylo = h, yhi = -1;
        stack[top++] = (int32_t)s; m[s] = 2;
        while (top) {
            int32_t p = stack[--top]; int y = p / w, x = p % w;
            if (x < rmin[y]) rmin[y] = x; if (x > rmax[y]) rmax[y] = x;
            if (y < ylo) ylo = y; if (y > yhi) yhi = y;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                int xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                size_t q = (size_t)yy * w + xx;
                if (m[q] == 1) { m[q] = 2; stack[top++] = (int32_t)q; }
            }
        }
        int np = 0;
        for (int y = ylo; y <= yhi; y++) {
            if (rmax[y] >= 0) { pts[np++] = (Pt){rmin[y], y}; if (rmax[y] != rmin[y]) pts[np++] = (Pt){rmax[y], y}; }
            rmin[y] = INT32_MAX; rmax[y] = -1;
        }
        int nh = convex_hull(pts, np, hull);
        MinRect r = min_area_rect(hull, nh);
        if (fmin(r.u1 - r.u0, r.v1 - r.v0) < 3) continue;
        Pt c[4]; rect_corners(r, c);
        float score = quad_mean(pr, w, h, c);
        if (box_thresh > score) continue;
        double sw = r.u1 - r.u0, sh = r.v1 - r.v0, dist = sw * sh * unclip / (2 * (sw + sh));
        Pt ci[4];
        for (int q = 0; q < 4; q++) ci[q] = (Pt){(double)(int)c[q].x, (double)(int)c[q].y};
        int ni = convex_hull(ci, 4, hull);
        MinRect e = min_area_rect(hull, ni);
        e.u0 -= dist; e.u1 += dist; e.v0 -= dist; e.v1 += dist;
        if (fmin(e.u1 - e.u0, e.v1 - e.v0) < 5) continue;
        Pt b[4]; rect_corners(e, b);
        float bx[4], by[4];
        for (int q = 0; q < 4; q++) {
            bx[q] = CLAMP(rintf((float)(b[q].x / w * dw)), 0.f, (float)dw);
            by[q] = CLAMP(rintf((float)(b[q].y / h * dh)), 0.f, (float)dh);
        }
        /* order_points_clockwise: the two of least x (in their order on ties) are TL / BL by y, the other two TR / BR */
        int ix[4] = {0, 1, 2, 3};
        for (int i = 1; i < 4; i++) for (int j = i; j > 0 && bx[ix[j]] < bx[ix[j - 1]]; j--) { int t = ix[j]; ix[j] = ix[j - 1]; ix[j - 1] = t; }
        int tl = ix[0], bl = ix[1], tr = ix[2], br = ix[3];
        if (by[bl] < by[tl]) { int t = tl; tl = bl; bl = t; }
        if (by[br] < by[tr]) { int t = tr; tr = br; br = t; }
        int ord[4] = {tl, tr, br, bl};
        float *o = out + (size_t)k * 9;
        for (int q = 0; q < 4; q++) {
            o[q * 2] = (float)(int)fminf(fmaxf(bx[ord[q]], 0.f), (float)(dw - 1));
            o[q * 2 + 1] = (float)(int)fminf(fmaxf(by[ord[q]], 0.f), (float)(dh - 1));
        }
        if ((int)hypotf(o[0] - o[2], o[1] - o[3]) <= 3 || (int)hypotf(o[0] - o[6], o[1] - o[7]) <= 3) continue;
        o[8] = score;
        k++;
    }
    free(m); free(stack); free(rmin); free(rmax); free(pts); free(hull);
    return k;
}
/* OpenCV's bicubic weight (a = −0.75) */
static inline float cubic_w(float t) {
    const float A = -0.75f;
    t = fabsf(t);
    return t <= 1 ? ((A + 2) * t - (A + 3)) * t * t + 1 : t < 2 ? ((A * t - 5 * A) * t + 8 * A) * t - 4 * A : 0;
}
/* A line of text cut out of the picture and straightened as get_rotate_crop_image does it: the quad (TL, TR, BR, BL)
   warped onto a rectangle as wide as the longer of its top and bottom edges and as high as the longer of its sides
   (whole pixels), each pixel sampled bicubically (cv2.warpPerspective, INTER_CUBIC, the edge pixels repeated); a crop
   at least 1.5 times as high as wide turned a quarter to the left (np.rot90). wh gets the crop's size; out = NULL: only
   the size. Returns 0 for a quad of no size. */
API int p_crop_quad(const uint8_t *src, int sw, int sh, const float *q, uint8_t *out, int32_t *wh) {
    double d01 = hypot(q[0] - q[2], q[1] - q[3]), d23 = hypot(q[4] - q[6], q[5] - q[7]);
    double d03 = hypot(q[0] - q[6], q[1] - q[7]), d12 = hypot(q[2] - q[4], q[3] - q[5]);
    int cw = (int)(d01 > d23 ? d01 : d23), ch = (int)(d03 > d12 ? d03 : d12);
    if (cw < 1 || ch < 1) return 0;
    int rot = ch * 1.0 / cw >= 1.5;
    wh[0] = rot ? ch : cw; wh[1] = rot ? cw : ch;
    if (!out) return 1;
    float H[9];
    if (!quad_homography(q, cw, ch, H)) return 0;
    uint8_t *tmp = rot ? malloc((size_t)cw * ch * 4) : out;
    for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
        double z = H[6] * x + H[7] * y + H[8], u = (H[0] * x + H[1] * y + H[2]) / z, v = (H[3] * x + H[4] * y + H[5]) / z;
        int iu = (int)floor(u), iv = (int)floor(v); float fu = (float)(u - iu), fv = (float)(v - iv);
        float wx[4], wy[4], acc[4] = {0, 0, 0, 0};
        for (int t = 0; t < 4; t++) { wx[t] = cubic_w(fu - (t - 1)); wy[t] = cubic_w(fv - (t - 1)); }
        for (int j = 0; j < 4; j++) {
            const uint8_t *row = src + (size_t)CLAMP(iv - 1 + j, 0, sh - 1) * sw * 4;
            for (int i = 0; i < 4; i++) {
                const uint8_t *p = row + CLAMP(iu - 1 + i, 0, sw - 1) * 4; float wgt = wx[i] * wy[j];
                acc[0] += p[0] * wgt; acc[1] += p[1] * wgt; acc[2] += p[2] * wgt; acc[3] += p[3] * wgt;
            }
        }
        uint8_t *o = tmp + ((size_t)y * cw + x) * 4;
        for (int c = 0; c < 4; c++) o[c] = u8_even(acc[c]);
    }
    if (rot) {   /* np.rot90: out[r][c] = crop[c][cw − 1 − r] — cw rows of ch pixels */
        for (int r = 0; r < cw; r++) for (int c = 0; c < ch; c++) memcpy(out + ((size_t)r * ch + c) * 4, tmp + ((size_t)c * cw + (cw - 1 - r)) * 4, 4);
        free(tmp);
    }
    return 1;
}
/* CTC's greedy reading of one line (T steps × C classes of probabilities, CTCLabelDecode): per step the likeliest class
   (the first of equals); a class that repeats the step before and class 0 (the blank) left out. Writes the classes kept,
   their probabilities and their steps; returns how many. */
API int p_ctc(const float *pr, int T, int C, int32_t *cls, float *prob, int32_t *step) {
    int n = 0, prev = -1;
    for (int t = 0; t < T; t++) {
        const float *r = pr + (size_t)t * C; int k = 0; float m = r[0];
        for (int c = 1; c < C; c++) if (r[c] > m) { m = r[c]; k = c; }
        if (k != prev && k != 0) { cls[n] = k; prob[n] = m; step[n] = t; n++; }
        prev = k;
    }
    return n;
}

/* ======================================================================== scrolling screenshots (Screenshot, to-do #28)
 * A page scrolled while views of it are taken; each new view is placed against the one before by its rows. A row is
 * known by its signature: its luma summed over K bands of its width (p_scroll_sig). Between two views: the rows that stay
 * put at the top and the bottom (a sticky header, a footer, a chat's input box — the same signature at the same place),
 * and between them the shift d of the rest: b's row y shows what a showed at row y + d (d > 0 when the page went down).
 * The shift is the one under which the overlapping rows differ least measured against how much detail they hold — a
 * stretch of blank rows fits any shift and says nothing, so an overlap with too little detail is no evidence. Every
 * shift is tried (the rows of the overlap taken two by two), then the pixels of the overlap are compared at the shift
 * found. A screen is captured as it is drawn (no compression), so at the right shift the overlap is the same. */
#define SC_KMAX 48
/* how many bands a row of w pixels is summed over */
API int p_scroll_bands(int w) { int k = w / 24; if (k < 4) k = w < 4 ? (w < 1 ? 1 : w) : 4; return k > SC_KMAX ? SC_KMAX : k; }
/* sig[y·K + k] = the mean luma (BT.601 in integers) of band k of row y, in sixteenths (0 – 4080): a mean, not a sum, so
   that bands one pixel wider than others do not make an even row look detailed; returns K */
API int p_scroll_sig(const uint8_t *px, int w, int h, int32_t *sig) {
    int K = p_scroll_bands(w);
    int x0[SC_KMAX + 1];
    for (int k = 0; k <= K; k++) x0[k] = (int)((int64_t)k * w / K);
    for (int y = 0; y < h; y++) {
        const uint8_t *r = px + (size_t)y * w * 4; int32_t *s = sig + (size_t)y * K;
        for (int k = 0; k < K; k++) {
            int32_t acc = 0, bw = x0[k + 1] - x0[k];
            for (int x = x0[k]; x < x0[k + 1]; x++) { const uint8_t *p = r + x * 4; acc += (p[0] * 77 + p[1] * 150 + p[2] * 29) >> 8; }
            s[k] = bw ? (acc * 16 + bw / 2) / bw : 0;
        }
    }
    return K;
}
static inline int64_t sc_diff(const int32_t *a, const int32_t *b, int K) {
    int64_t d = 0;
    for (int k = 0; k < K; k++) { int32_t t = a[k] - b[k]; d += t < 0 ? -t : t; }
    return d;
}
/* the fit of shift d over the rows of b from y0 to y1 (exclusive), every `step`th: the difference over the detail;
   `*info` = the detail (0 when there is none) */
static double sc_fit(const int32_t *sa, const int32_t *sb, const int64_t *tex, int K, int d, int y0, int y1, int step, int64_t *info) {
    int64_t num = 0, den = 0;
    for (int y = y0; y < y1; y += step) { num += sc_diff(sb + (size_t)y * K, sa + (size_t)(y + d) * K, K); den += tex[y]; }
    *info = den;
    return den > 0 ? (double)num / (double)den : (num ? 1e9 : 0);
}
/* out: [0] what was found — 0 nothing moved, 1 the shift, 2 nothing fits (scrolled too far, or sideways), 3 more than
   one shift fits (repeated rows): the one nearest `prior` (or the smallest move) given, 4 the overlapping rows hold too
   little to tell (blank) · cap_top / cap_bottom: the fewest rows that stayed put before (−1: none known) · [1] the shift d · [2] rows that stay put at the top · [3] at the bottom · [4] the fit at d
   ×10⁴ (difference over detail, 0 = the same) · [5] the best fit of any other shift ×10⁴ · [6] the overlap's pixels at d:
   mean |Δ| of a channel ×1000 · [7] the share of its pixels with a channel off by more than 24, ×10⁶ · [8] the rows of
   the overlap */
API void p_scroll_match(const uint8_t *a, const int32_t *sa, const uint8_t *b, const int32_t *sb, int w, int h, int prior, int has_prior,
                        int cap_top, int cap_bottom, int32_t *out) {
    for (int i = 0; i < 9; i++) out[i] = 0;
    int K = p_scroll_bands(w), T = 0, B = 0;
    int64_t same = (int64_t)K * 16;       /* a row "stays put" when its bands differ by a level on average (a capture's
                                             rounding); a changed row of text differs by hundreds in a band */
    while (T < h && sc_diff(sa + (size_t)T * K, sb + (size_t)T * K, K) <= same) T++;
    if (T >= h) { out[2] = h; return; }                                   /* nothing moved */
    while (B < h - T && sc_diff(sa + (size_t)(h - 1 - B) * K, sb + (size_t)(h - 1 - B) * K, K) <= same) B++;
    /* blank rows next to a header or a footer stay put too, and would narrow the shifts searched: a header is never
       taller than the smallest seen before (cap_top, cap_bottom ≥ 0 when known) */
    if (cap_top >= 0 && T > cap_top) T = cap_top;
    if (cap_bottom >= 0 && B > cap_bottom) B = cap_bottom;
    out[2] = T; out[3] = B;
    int Hr = h - T - B;
    if (Hr < 16) return;                                                   /* a caret, a spinner: no scroll */
    int minov = Hr / 10 > 12 ? Hr / 10 : 12, D = Hr - minov;
    if (D < 1) return;
    int64_t *tex = calloc((size_t)h, sizeof(int64_t));
    double *fit = malloc(sizeof(double) * (size_t)(2 * D + 1));
    uint8_t *inf = calloc((size_t)(2 * D + 1), 1);
    if (!tex || !fit || !inf) { free(tex); free(fit); free(inf); out[0] = 2; return; }
    for (int y = T; y < h - B; y++) {                                      /* the detail of b's rows: across and down */
        const int32_t *s = sb + (size_t)y * K; int64_t t = 0;
        for (int k = 1; k < K; k++) { int32_t q = s[k] - s[k - 1]; t += q < 0 ? -q : q; }
        if (y > T) { const int32_t *u = s - K; for (int k = 0; k < K; k++) { int32_t q = s[k] - u[k]; t += q < 0 ? -q : q; } }
        tex[y] = t;
    }
    int64_t texmin = (int64_t)K * 32;    /* less detail than this tells nothing (a blank overlap has none at all; a
                                             faint gradient over a few rows has more) */
    double best = 1e18; int bd = 0, any = 0;
    for (int d = -D; d <= D; d++) {
        int y0 = d >= 0 ? T : T - d, y1 = d >= 0 ? h - B - d : h - B; int64_t info;
        double f = sc_fit(sa, sb, tex, K, d, y0, y1, 2, &info);
        fit[d + D] = f; inf[d + D] = info >= texmin;
        if (inf[d + D]) { any = 1; if (f < best || (f == best && abs(d) < abs(bd))) { best = f; bd = d; } }
    }
    double second = 1e18;
    for (int d = -D; d <= D; d++) if (inf[d + D] && abs(d - bd) > 2 && fit[d + D] < second) second = fit[d + D];
    /* a fit: the same rows (≤ 0.15 — a screen captured exactly gives 0), or, where a capture's rounding is large against
       little detail (a faint gradient), clearly better than any other shift */
    int good = any && (best <= 0.15 || (best <= 0.6 && second >= 2.0 * best));
    int blank_at_prior = has_prior && prior >= -D && prior <= D && !inf[prior + D];
    if (!any || (!good && blank_at_prior)) {
        /* blank: nothing to tell the shift by — or the overlap at the shift expected is blank and no other shift fits
           (new rows entering below a blank stretch): the expected shift, its pixels checked */
        int d = has_prior && prior >= -D && prior <= D ? prior : 0;
        int y0 = d >= 0 ? T : T - d, y1 = d >= 0 ? h - B - d : h - B;
        uint64_t sum = 0, bad = 0, n = 0;
        for (int y = y0; y < y1; y++) {
            const uint8_t *p = b + (size_t)y * w * 4, *q = a + (size_t)(y + d) * w * 4;
            for (int x = 0; x < w; x++, p += 4, q += 4) {
                int d0 = abs(p[0] - q[0]), d1 = abs(p[1] - q[1]), d2 = abs(p[2] - q[2]);
                sum += (uint64_t)(d0 + d1 + d2); if (d0 > 24 || d1 > 24 || d2 > 24) bad++;
            }
            n += (uint64_t)w;
        }
        out[0] = 4; out[1] = d; out[4] = out[5] = 0;
        out[6] = n ? (int32_t)((double)sum * 1000.0 / (3.0 * (double)n)) : 0;
        out[7] = n ? (int32_t)((double)bad * 1e6 / (double)n) : 0;
        out[8] = y1 - y0;
        free(tex); free(fit); free(inf); return;
    }
    int status = 1;
    double tie = best * 1.25 + 0.01;
    if (second <= tie) {                                                   /* repeated rows: more than one shift fits */
        status = 3; int pick = bd, want = has_prior ? prior : 0;
        for (int d = -D; d <= D; d++) if (inf[d + D] && fit[d + D] <= tie && abs(d - want) < abs(pick - want)) pick = d;
        bd = pick;
    }
    /* every row at the shift and its neighbours (rows taken two by two can miss a smooth stretch by one) */
    { double bf = 1e18; int bb = bd;
      for (int d = bd - 1; d <= bd + 1; d++) {
        if (d < -D || d > D) continue;
        int y0 = d >= 0 ? T : T - d, y1 = d >= 0 ? h - B - d : h - B; int64_t info;
        double f = sc_fit(sa, sb, tex, K, d, y0, y1, 1, &info);
        if (info >= texmin && f < bf) { bf = f; bb = d; }
      }
      if (bf < 1e17) { bd = bb; best = bf; } }
    int y0 = bd >= 0 ? T : T - bd, y1 = bd >= 0 ? h - B - bd : h - B;
    if (bd == 0) status = status == 3 ? 3 : 1;
    /* the pixels of the overlap at the shift */
    uint64_t sum = 0, bad = 0, n = 0;
    for (int y = y0; y < y1; y++) {
        const uint8_t *p = b + (size_t)y * w * 4, *q = a + (size_t)(y + bd) * w * 4;
        for (int x = 0; x < w; x++, p += 4, q += 4) {
            int d0 = abs(p[0] - q[0]), d1 = abs(p[1] - q[1]), d2 = abs(p[2] - q[2]);
            sum += (uint64_t)(d0 + d1 + d2);
            if (d0 > 24 || d1 > 24 || d2 > 24) bad++;
        }
        n += (uint64_t)w;
    }
    out[0] = good ? status : 2;
    out[1] = bd;
    out[4] = (int32_t)(best > 1e5 ? 1e9 : best * 1e4);
    out[5] = (int32_t)(second > 1e5 ? 1e9 : second * 1e4);
    out[6] = n ? (int32_t)((double)sum * 1000.0 / (3.0 * (double)n)) : 0;
    out[7] = n ? (int32_t)((double)bad * 1e6 / (double)n) : 0;
    out[8] = y1 - y0;
    free(tex); free(fit); free(inf);
}

#include "flatten.c" /* the Book Page Flattener (uses cm_label above) */
#include "kindle.c" /* PDF for Kindle: where a region of a page may be cut */
