/*
 * imgproc.wasm — image processing for SuperTools (own code). Built as a WASI reactor (see build.sh).
 * All images are interleaved RGBA8, row-major, no padding. Functions work in place unless they take src/dst.
 *
 * Sections: tone & colour adjustment · resampling (Lanczos-3) · blur/sharpen · rotation · artistic filters
 * (bilateral, cartoon/XDoG/k-means, Kuwahara oil paint, pencil sketch, watercolour, halftone) · redaction
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

/* XDoG ink lines: returns per-pixel darkness 0..1 */
static float *xdog(const uint8_t *px, int w, int h, float sigma, float k, float p, float eps, float phi) {
    int n = w * h;
    float *a = luma_f(px, n), *b = malloc(sizeof(float) * n), *e = malloc(sizeof(float) * n);
    for (int i = 0; i < n; i++) { a[i] /= 255.0f; b[i] = a[i]; }
    gauss_f(a, w, h, 1, sigma); gauss_f(b, w, h, 1, sigma * k);
    for (int i = 0; i < n; i++) {
        float d = (1 + p) * a[i] - p * b[i];
        float v = d >= eps ? 1.0f : 1.0f + tanhf(phi * (d - eps));
        e[i] = 1.0f - CLAMP(v, 0.0f, 1.0f);
    }
    free(a); free(b);
    return e;
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

/* Cartoon: smooth (bilateral) → quantise colours → multiply XDoG ink lines. */
API void p_cartoon(uint8_t *px, int w, int h, int colors, float edge_strength, int smooth) {
    float *e = xdog(px, w, h, 1.2f, 1.6f, 20.0f, 0.75f, 12.0f);
    p_bilateral(px, w, h, 5, 4.0f, 28.0f, smooth < 1 ? 1 : smooth);
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
        uint8_t *p = px + i * 4;
        if (color) { float t = d / 255.0f; for (int c = 0; c < 3; c++) p[c] = u8(p[c] * 0.35f * t + d * 0.65f * t + 255 * 0 ); }
        else p[0] = p[1] = p[2] = u8(d);
    }
    free(g); free(inv);
}

/* Watercolour: strong edge-preserving smoothing, soft quantisation, darkened edges and paper grain. */
API void p_watercolor(uint8_t *px, int w, int h) {
    float *e = xdog(px, w, h, 2.0f, 1.6f, 12.0f, 0.8f, 6.0f);
    p_bilateral(px, w, h, 7, 6.0f, 40.0f, 3);
    kmeans_quantize(px, w * h, 18);
    p_blur(px, w, h, 1.2f);
    uint32_t seed = 99;
    for (int i = 0; i < w * h; i++) {
        seed = seed * 1664525u + 1013904223u; float grain = ((seed >> 24) / 255.0f - 0.5f) * 10;
        float m = 1 - e[i] * 0.35f;
        for (int c = 0; c < 3; c++) px[i * 4 + c] = u8((px[i * 4 + c] * 0.9f + 25) * m + grain);
    }
    free(e);
}

/* Comic halftone: posterised colour + dot screen on the shadows + ink lines. */
API void p_halftone(uint8_t *px, int w, int h, int cell) {
    if (cell < 3) cell = 3;
    float *e = xdog(px, w, h, 1.0f, 1.6f, 25.0f, 0.7f, 15.0f);
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
