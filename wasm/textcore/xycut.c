/* Recursive XY-cut for PDF → EPUB reading order (own C, part of textcore.wasm).
 * boxes: n × [x0, y0, x1, y1] (points, y down). A region is split at its vertical whitespace gaps (≥ gx) when any
 * exist — columns first, so text flows down a whole column before the next — otherwise in two at its widest horizontal
 * gap (≥ gy), recursively. The first vertical split of a region outside any column that gives at least two real columns
 * numbers those as columns 1, 2, … — a part is a real column when it holds at least three boxes and is at least `minh`
 * high (a margin note, a stamp or a row of table cells is not; minh 0 = every part counts); deeper vertical splits
 * (tables, side-by-side figures inside a column) keep the column number.
 * Parts (the owner's rule for PDF → EPUB, 21 Nov 2026: what stands side by side is read one after another, each piece
 * marked "Page N, part K"): the first vertical split of a region outside any part that has at least two sides that
 * count — a real column, or a side holding a heavy box (`heavy[i]` ≠ 0: a figure or a table) — gives every side a part
 * number of its own, 1, 2, … in reading order; a side that does not count (a margin note) joins the part that follows
 * it (or, at the right end, the one before). What lies outside every part is 0 (the full-width flow above, between
 * and below). heavy may be NULL.
 * out_order: n box indices in reading order; out_col: column per output position (0 = full width); out_part: part per
 * output position (0 = outside the parts; out_part may be NULL). Returns n.
 * A head over the columns (hd > 0): where a region splits into two real columns or more and the boxes at the top of one
 * of them end at least `hd` above the top of every other column, with a gap of at least gy under them across the whole
 * region (an epigraph or a quotation set above the start of the right-hand column), the region is cut across that gap
 * first: the head is read before the columns — read inside the right-hand column it cut a sentence that runs on there
 * from the left-hand one (test_2, 21 Nov 2026). */
#include <stdint.h>
#include <stdlib.h>
#define API __attribute__((visibility("default")))

typedef struct { float x0, y0, x1, y1; } Box;
static const Box *B;
static int by_x(const void *a, const void *b) { float d = B[*(const int *)a].x0 - B[*(const int *)b].x0; return d < 0 ? -1 : d > 0; }
static int by_y(const void *a, const void *b) {
    const Box *p = &B[*(const int *)a], *q = &B[*(const int *)b];
    float d = p->y0 - q->y0; if (d < -0.5f || d > 0.5f) return d < 0 ? -1 : 1;
    return p->x0 < q->x0 ? -1 : p->x0 > q->x0;
}

static int *g_order, *g_col, *g_part, g_k, g_parts;
static const int32_t *g_heavy;
static float g_minh, g_hd;
/* a part of a vertical split that reads as a column of its own */
static int real_column(const int *idx, int n) {
    if (g_minh <= 0) return 1;
    if (n < 3) return 0;
    float y0 = B[idx[0]].y0, y1 = B[idx[0]].y1;
    for (int i = 1; i < n; i++) { if (B[idx[i]].y0 < y0) y0 = B[idx[i]].y0; if (B[idx[i]].y1 > y1) y1 = B[idx[i]].y1; }
    return y1 - y0 >= g_minh;
}
/* a side of a vertical split that counts as a part: a real column, or one that holds a heavy box (a figure, a table) */
static int real_part(const int *idx, int n) {
    if (real_column(idx, n)) return 1;
    if (g_heavy) for (int i = 0; i < n; i++) if (g_heavy[idx[i]]) return 1;
    return 0;
}
static void put(int i, int col, int part) { g_order[g_k] = i; g_col[g_k] = col; if (g_part) g_part[g_k] = part; g_k++; }
static void cut(int *idx, int n, float gx, float gy, int col, int part, int depth) {
    if (n <= 0) return;
    if (n == 1 || depth > 4000) { qsort(idx, n, sizeof(int), by_y); for (int i = 0; i < n; i++) put(idx[i], col, part); return; }
    /* vertical gaps: sweep in x */
    qsort(idx, n, sizeof(int), by_x);
    float maxx = B[idx[0]].x1; int nv = 0;
    for (int i = 1; i < n; i++) { if (B[idx[i]].x0 - maxx >= gx) nv++; if (B[idx[i]].x1 > maxx) maxx = B[idx[i]].x1; }
    if (nv) {
        /* the parts, left to right: [start, end) of idx */
        int *at = malloc(sizeof(int) * (nv + 2)), np = 0; at[np++] = 0; maxx = B[idx[0]].x1;
        for (int i = 1; i < n; i++) { if (B[idx[i]].x0 - maxx >= gx) at[np++] = i; if (B[idx[i]].x1 > maxx) maxx = B[idx[i]].x1; }
        at[np] = n;
        /* a head over the columns (see the top): only between real columns — a margin note's side is no column */
        if (g_hd > 0) {
            int nreal = 0; float top_hi = -1e30f;
            for (int p = 0; p < np; p++) {
                if (!real_column(idx + at[p], at[p + 1] - at[p])) continue;
                nreal++; float t = 1e30f;
                for (int i = at[p]; i < at[p + 1]; i++) if (B[idx[i]].y0 < t) t = B[idx[i]].y0;
                if (t > top_hi) top_hi = t;
            }
            int nh = 0; float hb = -1e30f, rt = 1e30f;
            if (nreal >= 2) for (int i = 0; i < n; i++) { const Box *b = &B[idx[i]]; if (b->y1 <= top_hi - g_hd) { nh++; if (b->y1 > hb) hb = b->y1; } else if (b->y0 < rt) rt = b->y0; }
            if (nh > 0 && nh < n && nh <= n / 4 + 1 && rt - hb >= gy) {
                int *head = malloc(sizeof(int) * nh), *rest = malloc(sizeof(int) * (n - nh)), a = 0, r = 0;
                for (int i = 0; i < n; i++) { if (B[idx[i]].y1 <= top_hi - g_hd) head[a++] = idx[i]; else rest[r++] = idx[i]; }
                free(at);
                cut(head, nh, gx, gy, col, part, depth + 1);
                cut(rest, n - nh, gx, gy, col, part, depth + 1);
                free(head); free(rest);
                return;
            }
        }
        /* outside any column: number the real columns 1, 2, … when there are at least two of them; the other parts
           (a margin note beside the columns) and a split without two real columns stay outside (0), and a split
           further down may still find the columns */
        int real = 0, *num = calloc(np, sizeof(int)), *prt = calloc(np, sizeof(int));
        if (!col) { for (int p = 0; p < np; p++) if (real_column(idx + at[p], at[p + 1] - at[p])) num[p] = ++real; if (real < 2) for (int p = 0; p < np; p++) num[p] = 0; }
        /* outside any part: every side that counts gets a part of its own when two sides count; the others join the
           part after them (the last ones the part before) */
        if (!part) {
            int count = 0;
            for (int p = 0; p < np; p++) if (real_part(idx + at[p], at[p + 1] - at[p])) { prt[p] = -1; count++; }
            if (count >= 2) {
                for (int p = 0; p < np; p++) if (prt[p] == -1) prt[p] = ++g_parts;
                for (int p = np - 1, next = 0; p >= 0; p--) { if (prt[p] > 0) next = prt[p]; else prt[p] = next; }
                for (int p = 0, prev = 0; p < np; p++) { if (prt[p] > 0) prev = prt[p]; else prt[p] = prev; }
            } else for (int p = 0; p < np; p++) prt[p] = 0;
        }
        for (int p = 0; p < np; p++) cut(idx + at[p], at[p + 1] - at[p], gx, gy, col ? col : num[p], part ? part : prt[p], depth + 1);
        free(num); free(prt); free(at);
        return;
    }
    /* no column gutter: split once at the WIDEST horizontal gap (title | body | footnote), then recurse — splitting at
       every line gap would cut a two-column body into rows and interleave its columns */
    qsort(idx, n, sizeof(int), by_y);
    float maxy = B[idx[0]].y1, best = gy; int at = -1;
    for (int i = 1; i < n; i++) { float g = B[idx[i]].y0 - maxy; if (g >= best) { best = g; at = i; } if (B[idx[i]].y1 > maxy) maxy = B[idx[i]].y1; }
    if (at < 0) { for (int i = 0; i < n; i++) put(idx[i], col, part); return; } /* one block: top-to-bottom */
    int *rest = malloc(sizeof(int) * (n - at));
    for (int i = at; i < n; i++) rest[i - at] = idx[i];   /* the first part's recursion re-sorts idx[0..at) in place */
    cut(idx, at, gx, gy, col, part, depth + 1);
    cut(rest, n - at, gx, gy, col, part, depth + 1);
    free(rest);
}

API int t_xycut(const float *boxes, const int32_t *heavy, int n, float gx, float gy, float minh, float hd, int32_t *out_order, int32_t *out_col, int32_t *out_part) {
    if (n <= 0) return 0;
    B = (const Box *)boxes; g_heavy = heavy; g_order = out_order; g_col = out_col; g_part = out_part; g_k = 0; g_parts = 0; g_minh = minh; g_hd = hd;
    int *idx = malloc(sizeof(int) * n);
    for (int i = 0; i < n; i++) idx[i] = i;
    cut(idx, n, gx, gy, 0, 0, 0);
    free(idx);
    return g_k;
}
