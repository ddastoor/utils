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
static float *dog_lines(const uint8_t *px, int w, int h, float sigma, float tau, float phi) {
    int n = w * h;
    float *a = luma_f(px, n), *b = malloc(sizeof(float) * n);
    for (int i = 0; i < n; i++) { a[i] /= 255.0f; b[i] = a[i]; }
    gauss_f(a, w, h, 1, sigma); gauss_f(b, w, h, 1, sigma * 1.6f);
    for (int i = 0; i < n; i++) { float d = a[i] - tau * b[i]; a[i] = d >= 0 ? 0.0f : CLAMP(-tanhf(phi * d), 0.0f, 1.0f); }
    free(b);
    return a;
}

/* k-means colour quantisation (k ≤ 32) on a subsample, then nearest-centre mapping. */
static void kmeans_quantize(uint8_t *px, int n, int k) {
    if (k < 2) return; if (k > 32) k = 32;
    float c[32][3]; int samples = n < 40000 ? n : 40000, step = n / samples;
    uint32_t seed = 12345;
    for (int i = 0; i < k; i++) { seed = seed * 1103515245u + 12345u; int j = (int)((seed >> 8) % (uint32_t)n); for (int q = 0; q < 3; q++) c[i][q] = px[j * 4 + q]; }
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
