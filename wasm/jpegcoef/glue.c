/* jpegcoef.wasm — a JPEG's stored DCT coefficients, read by libjpeg-turbo (jpeg_read_coefficients: baseline, extended,
 * progressive and arithmetic-coded JPEGs, nothing decoded to pixels), and the checks of "Is This Screenshot Real?" made on
 * them. Working on the coefficients as they are stored, nothing is lost to the decoder's rounding or to colours clipped at 0
 * or 255 — which a check on decoded pixels cannot avoid (a saturated colour, white around text).
 *
 *  jc_open / jc_info / jc_close   the file's frame, components, sampling and quantization tables
 *  jc_ghost   each 8 × 8 block quantized again with JPEG's standard (IJG, Annex K) table at every quality q0 … q1: the error it
 *             keeps — "JPEG ghosts" (H. Farid, "Exposing digital forgeries from JPEG ghosts", 2009): a picture saved before at
 *             a quality Q0 and then at a higher one keeps a dip in its error at Q0, and an area pasted or painted after the
 *             first save does not. On the stored coefficients it is exact: JPEG's DCT is orthonormal (Parseval), so the
 *             coefficients' error is the pixels' error.
 *  jc_grid    how far each block's coefficients lie from the standard table's grid at every quality (0 … 0.5 of a step).
 *  jc_coefs   a component's coefficients (for the tests).
 * Errors: libjpeg's error_exit must not return; it writes its message and traps — the page makes a new instance. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include "jpeglib.h"

#define API __attribute__((visibility("default")))

static struct jpeg_decompress_struct cinfo;
static struct jpeg_error_mgr jerr;
static jvirt_barray_ptr *coefs = NULL;
static int opened = 0, created = 0, warnings = 0;
static char msg[JMSG_LENGTH_MAX], warn[JMSG_LENGTH_MAX];

static void on_error(j_common_ptr c) { (*c->err->format_message)(c, msg); __builtin_trap(); }
static void on_message(j_common_ptr c, int level) {
    if (level >= 0) return;            /* trace messages */
    if (!warnings) (*c->err->format_message)(c, warn);
    warnings++;                        /* corrupt data: libjpeg goes on */
}

API void *jc_malloc(size_t n) { return malloc(n); }
API void jc_free(void *p) { free(p); }
API const char *jc_msg(void) { return msg; }
API const char *jc_warning(void) { return warn; }

API void jc_close(void) {
    if (created) jpeg_destroy_decompress(&cinfo);
    created = opened = 0; coefs = NULL;
}

/* Reads the file's header and, when it holds at most max_px pixels, its coefficients. Returns 0, or 2 when it is larger
   (jc_info still says its size). */
API int jc_open(const unsigned char *buf, int len, double max_px) {
    jc_close();
    msg[0] = warn[0] = 0; warnings = 0;
    cinfo.err = jpeg_std_error(&jerr);
    jerr.error_exit = on_error;
    jerr.emit_message = on_message;
    jpeg_create_decompress(&cinfo);
    created = 1;
    jpeg_mem_src(&cinfo, buf, (unsigned long)len);
    jpeg_read_header(&cinfo, TRUE);
    if ((double)cinfo.image_width * cinfo.image_height > max_px) return 2;
    coefs = jpeg_read_coefficients(&cinfo);
    opened = 1;
    return 0;
}

/* out (int32, 9 + 4 × 8 + 4 × 64): [0] components, [1] width, [2] height, [3] progressive, [4] arithmetic-coded, [5] bits a
   sample, [6] warnings, [7] the largest horizontal and [8] vertical sampling; at 9 + 8c, component c: id, h, v, blocks across,
   blocks down, its table's number, 1 when the coefficients were read; at 41 + 64c its table in natural order (row by row). */
API void jc_info(int32_t *out) {
    memset(out, 0, sizeof(int32_t) * (9 + 32 + 256));
    if (!created) return;
    int n = cinfo.num_components > 4 ? 4 : cinfo.num_components;
    out[0] = n; out[1] = (int32_t)cinfo.image_width; out[2] = (int32_t)cinfo.image_height;
    out[3] = cinfo.progressive_mode; out[4] = cinfo.arith_code; out[5] = cinfo.data_precision; out[6] = warnings;
    out[7] = cinfo.max_h_samp_factor; out[8] = cinfo.max_v_samp_factor;
    for (int c = 0; c < n; c++) {
        jpeg_component_info *ci = &cinfo.comp_info[c];
        int32_t *o = out + 9 + 8 * c;
        o[0] = ci->component_id; o[1] = ci->h_samp_factor; o[2] = ci->v_samp_factor;
        o[3] = (int32_t)ci->width_in_blocks; o[4] = (int32_t)ci->height_in_blocks; o[5] = ci->quant_tbl_no; o[6] = opened;
        JQUANT_TBL *t = ci->quant_table ? ci->quant_table : cinfo.quant_tbl_ptrs[ci->quant_tbl_no];
        if (t) for (int k = 0; k < 64; k++) out[41 + 64 * c + k] = t->quantval[k];
    }
}

/* JPEG's standard tables (ITU T.81 Annex K), natural order, scaled as libjpeg's jpeg_quality_scaling and
   jpeg_add_quant_table (force_baseline) scale them */
static const int K_LUMA[64] = {
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99};
static const int K_CHROMA[64] = {
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99};
static void std_table(int q, int chroma, int *t) {
    if (q < 1) q = 1;
    if (q > 100) q = 100;
    int scale = q < 50 ? 5000 / q : 200 - 2 * q;
    const int *k = chroma ? K_CHROMA : K_LUMA;
    for (int i = 0; i < 64; i++) {
        long v = ((long)k[i] * scale + 50) / 100;
        t[i] = (int)(v < 1 ? 1 : v > 255 ? 255 : v);
    }
}

/* calls fn for every block of component c (in reading order), with its dequantized coefficients */
typedef void (*block_fn)(int b, const float *F, const JCOEF *k, void *ctx);
static int each_block(int c, block_fn fn, void *ctx) {
    if (!opened || c < 0 || c >= cinfo.num_components) return 0;
    jpeg_component_info *ci = &cinfo.comp_info[c];
    const JQUANT_TBL *qt = ci->quant_table;
    if (!qt) return 0;
    int bw = (int)ci->width_in_blocks, bh = (int)ci->height_in_blocks;
    float F[64];
    for (int y = 0; y < bh; y++) {
        JBLOCKARRAY row = (*cinfo.mem->access_virt_barray)((j_common_ptr)&cinfo, coefs[c], (JDIMENSION)y, 1, FALSE);
        for (int x = 0; x < bw; x++) {
            const JCOEF *k = row[0][x];
            for (int i = 0; i < 64; i++) F[i] = (float)k[i] * qt->quantval[i];
            fn(y * bw + x, F, k, ctx);
        }
    }
    return bw * bh;
}

typedef struct { int nq, nb, (*tabs)[64]; float *err, *energy; } GhostCtx;
static void ghost_block(int b, const float *F, const JCOEF *raw, void *p) {
    (void)raw;
    GhostCtx *g = p;
    float ac = 0;
    for (int k = 1; k < 64; k++) ac += F[k] * F[k];
    g->energy[b] = ac / 64.0f;
    for (int i = 0; i < g->nq; i++) {
        const int *t = g->tabs[i];
        float e = 0;
        for (int k = 0; k < 64; k++) { float d = F[k] - t[k] * roundf(F[k] / t[k]); e += d * d; }
        g->err[(size_t)i * g->nb + b] = e / 64.0f;
    }
}
/* err[(q − q0) · nb + b]: the mean squared error block b keeps when quantized again at q (its brightness's error, a pixel at a
   time — Parseval); energy[b]: its detail (the AC energy, the variance of its pixels). Component c (0: brightness), the standard
   luminance table for it, the chrominance one for the others. Returns nb. */
API int jc_ghost(int c, int q0, int q1, float *err, float *energy) {
    if (!opened || c < 0 || c >= cinfo.num_components || q1 < q0) return 0;
    int nq = q1 - q0 + 1;
    GhostCtx g = {nq, (int)(cinfo.comp_info[c].width_in_blocks * cinfo.comp_info[c].height_in_blocks), malloc(sizeof(int[64]) * (size_t)nq), err, energy};
    for (int i = 0; i < nq; i++) std_table(q0 + i, c > 0, g.tabs[i]);
    int nb = each_block(c, ghost_block, &g);
    free(g.tabs);
    return nb;
}

typedef struct { int nq, nb, (*tabs)[64]; float *dist; } GridCtx;
static void grid_block(int b, const float *F, const JCOEF *raw, void *p) {
    (void)raw;
    GridCtx *g = p;
    for (int i = 0; i < g->nq; i++) {
        const int *t = g->tabs[i];
        float sum = 0; int cnt = 0;
        for (int k = 1; k < 64; k++) {                 /* the AC coefficients: the DC carries the block's mean */
            if (t[k] < 2 || fabsf(F[k]) < 0.5f * t[k]) continue;
            float r = F[k] / t[k];
            sum += fabsf(r - roundf(r)); cnt++;
        }
        g->dist[(size_t)i * g->nb + b] = cnt >= 4 ? sum / cnt : -1.0f;
    }
}
/* dist[(q − q0) · nb + b]: the mean distance of block b's AC coefficients to the nearest multiple of the standard table's step
   at q, in steps (0 … 0.5; about 0.25 for coefficients unrelated to that grid), over those of half a step and more; −1 when
   fewer than 4 are. Returns nb. */
API int jc_grid(int c, int q0, int q1, float *dist) {
    if (!opened || c < 0 || c >= cinfo.num_components || q1 < q0) return 0;
    int nq = q1 - q0 + 1;
    GridCtx g = {nq, (int)(cinfo.comp_info[c].width_in_blocks * cinfo.comp_info[c].height_in_blocks), malloc(sizeof(int[64]) * (size_t)nq), dist};
    for (int i = 0; i < nq; i++) std_table(q0 + i, c > 0, g.tabs[i]);
    int nb = each_block(c, grid_block, &g);
    free(g.tabs);
    return nb;
}

/* component c's quantized coefficients, 64 a block in natural order, blocks in reading order (int16). Returns the blocks. */
static void coef_block(int b, const float *F, const JCOEF *raw, void *p) {
    (void)F;
    memcpy((int16_t *)p + (size_t)b * 64, raw, 64 * sizeof(int16_t));
}
API int jc_coefs(int c, int16_t *out) { return each_block(c, coef_block, out); }

API int jc_version(void) { return LIBJPEG_TURBO_VERSION_NUMBER; }

/* ------------------------------------------------------------------------------------------------ the ghosts read
   The rule, measured on 476 JPEGs (12 screenshots and 5 photos, each saved once at ten qualities, twice at nine pairs of them,
   and edited between the two saves) and 171 PNGs (never a JPEG, a JPEG saved as PNG, edited between) — docs/WASM-AUDIT.md,
   "Is This Screenshot Real?":
   - the curve: the mean error of the blocks with detail at each quality. A picture saved once at Q1 gives a curve that falls
     towards Q1; one saved before at a lower Q0 dips at Q0 and rises after it. "Saved before" when the curve rises after its
     dip to G_DEPTH × the dip (no single save went above 1.024, no never-JPEG PNG above 0.987; 98 % of the screenshots saved
     twice above it — not when the two qualities are close, 75 → 85, 90 → 98);
   - the earlier quality: where the coefficients lie closest to the standard table's grid, near the dip (exact for 94 %);
   - the map: each block's error at Q0 within its own range of errors (Farid's normalisation), smoothed over 5 × 5 blocks;
     an area of G_AREA blocks and more, at least two rows high, standing G_EXCESS above the picture's median is a part not
     saved like the rest — painted or pasted after the first save. Blocks whose colours were clipped at 0 or 255 (left out by
     the caller: the first decode clipped them too) and faint ones (an error range under G_RANGE) are not looked at. Found in
     63 % of the edits; no area on any of the 287 unedited pictures. */
#define G_ENERGY 25.0f
#define G_MIN_BLOCKS 200
#define G_DEPTH 1.06f
#define G_RANGE 40.0f
#define G_CAND 0.06f
#define G_EXCESS 0.08f
#define G_AREA 12
#define G_MAXA 8

static int cmp_float(const void *a, const void *b) { float x = *(const float *)a, y = *(const float *)b; return (x > y) - (x < y); }

/* err / grid: (qhi − qlo + 1) × nb values (quality-major), energy and keep nb each; qend: the end of the dip search (the
   file's own quality for a JPEG; 99 for a picture saved without loss). out (float): [0] blocks with detail, [1] the quality of
   the deepest dip (0: none), [2] its depth, [3] the earlier save's quality (0: not saved before), [4] areas n, at 5 + 6i area
   i: blocks, x0, y0, x1, y1 (in blocks, inclusive), excess; at 5 + 6·G_MAXA the curve (qhi − qlo + 1 values); after it nb
   values, each block's smoothed excess over the median (−1 where not looked at). Returns the areas. */
API int jc_analyse(const float *err, const float *grid, const float *energy, const uint8_t *keep, int bw, int bh, int qlo, int qhi, int qend, float *out) {
    int nb = bw * bh, nq = qhi - qlo + 1;
    float *curve = out + 5 + 6 * G_MAXA, *map = curve + nq;
    memset(out, 0, sizeof(float) * (5 + 6 * G_MAXA));
    for (int b = 0; b < nb; b++) map[b] = -1;
    int tex = 0;
    for (int b = 0; b < nb; b++) tex += keep[b] && energy[b] > G_ENERGY;
    out[0] = (float)tex;
    for (int i = 0; i < nq; i++) {
        double s = 0;
        for (int b = 0; b < nb; b++) if (keep[b] && energy[b] > G_ENERGY) s += err[(size_t)i * nb + b];
        curve[i] = tex ? (float)(s / tex) : 0;
    }
    if (tex < G_MIN_BLOCKS || qend - qlo < 4) return 0;
    /* the deepest dip below the file's own quality */
    int qd = 0; float depth = 0;
    for (int q = qlo + 10 > 40 ? qlo + 10 : 40; q <= qend - 2 && q <= qhi; q++) {
        float v = curve[q - qlo], after = 0;
        if (v <= 0) continue;
        for (int r = q + 1; r <= qend - 1 && r <= qhi; r++) if (curve[r - qlo] > after) after = curve[r - qlo];
        if (after / v > depth) { depth = after / v; qd = q; }
    }
    out[1] = (float)qd; out[2] = depth;
    if (!qd || depth <= G_DEPTH) return 0;
    /* the earlier quality: the coefficients closest to the grid, near the dip */
    int q0 = qd; float best = 1e9f;
    for (int q = qd - 3; q <= qd + 1 && q <= qend - 2; q++) {
        if (q < qlo) continue;
        double s = 0; int n = 0;
        for (int b = 0; b < nb; b++) { float g = grid[(size_t)(q - qlo) * nb + b]; if (keep[b] && energy[b] > G_ENERGY && g >= 0) { s += g; n++; } }
        if (n && s / n < best) { best = (float)(s / n); q0 = q; }
    }
    out[3] = (float)q0;
    /* each block's error at q0 within its own range */
    float *norm = malloc(sizeof(float) * (size_t)nb);
    int used = 0;
    for (int b = 0; b < nb; b++) {
        norm[b] = -1;
        if (!keep[b] || energy[b] <= G_ENERGY) continue;
        float lo = 1e30f, hi = -1e30f;
        for (int i = 0; i < nq; i++) { float v = err[(size_t)i * nb + b]; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo < G_RANGE) continue;
        norm[b] = (err[(size_t)(q0 - qlo) * nb + b] - lo) / (hi - lo);
        used++;
    }
    if (used < 50) { free(norm); return 0; }
    /* smoothed over 5 × 5 blocks (those looked at) */
    float *vals = malloc(sizeof(float) * (size_t)used);
    int k = 0;
    for (int y = 0; y < bh; y++)
        for (int x = 0; x < bw; x++) {
            if (norm[y * bw + x] < 0) continue;
            float s = 0; int n = 0;
            for (int dy = -2; dy <= 2; dy++)
                for (int dx = -2; dx <= 2; dx++) {
                    int xx = x + dx, yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
                    float v = norm[yy * bw + xx];
                    if (v >= 0) { s += v; n++; }
                }
            map[y * bw + x] = s / n;
            vals[k++] = s / n;
        }
    qsort(vals, (size_t)used, sizeof(float), cmp_float);
    float med = vals[used / 2];
    for (int i = 0; i < used; i++) vals[i] = fabsf(vals[i] - med);
    qsort(vals, (size_t)used, sizeof(float), cmp_float);
    float mad = vals[used / 2], cut = med + (4 * mad > G_CAND ? 4 * mad : G_CAND);
    free(vals);
    /* areas: blocks above the cut, joined when within two blocks of each other */
    int *stack = malloc(sizeof(int) * (size_t)nb), n = 0;
    uint8_t *seen = calloc((size_t)nb, 1);
    for (int b0 = 0; b0 < nb; b0++) {
        if (seen[b0] || map[b0] <= cut) continue;
        int sp = 0, cnt = 0, x0 = bw, y0 = bh, x1 = -1, y1 = -1;
        double sum = 0;
        stack[sp++] = b0; seen[b0] = 1;
        while (sp) {
            int b = stack[--sp], x = b % bw, y = b / bw;
            cnt++; sum += map[b];
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            for (int dy = -2; dy <= 2; dy++)
                for (int dx = -2; dx <= 2; dx++) {
                    int xx = x + dx, yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
                    int j = yy * bw + xx;
                    if (!seen[j] && map[j] > cut) { seen[j] = 1; stack[sp++] = j; }
                }
        }
        float excess = (float)(sum / cnt) - med;
        /* an edit is a part of the picture; an "area" of a fifth of it and more is the picture's own (a photo saved three times) */
        if (cnt < G_AREA || y1 - y0 + 1 < 2 || excess <= G_EXCESS || cnt * 5 >= used) continue;
        /* keep the largest G_MAXA, by their size */
        int slot = n < G_MAXA ? n++ : -1;
        if (slot < 0) { int s = 0; for (int i = 1; i < G_MAXA; i++) if (out[5 + 6 * i] < out[5 + 6 * s]) s = i; if (out[5 + 6 * s] >= cnt) continue; slot = s; }
        float *o = out + 5 + 6 * slot;
        o[0] = (float)cnt; o[1] = (float)x0; o[2] = (float)y0; o[3] = (float)x1; o[4] = (float)y1; o[5] = excess;
    }
    for (int b = 0; b < nb; b++) if (map[b] >= 0) map[b] -= med;
    out[4] = (float)n;
    free(stack); free(seen); free(norm);
    return n;
}
