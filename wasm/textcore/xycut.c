/* Recursive XY-cut for PDF → EPUB reading order (own C, part of textcore.wasm).
 * boxes: n × [x0, y0, x1, y1] (points, y down). A region is split at its vertical whitespace gaps (≥ gx) when any
 * exist — columns first, so text flows down a whole column before the next — otherwise in two at its widest horizontal
 * gap (≥ gy), recursively. The first vertical split of a region outside any column that gives at least two real columns
 * numbers those as columns 1, 2, … — a part is a real column when it holds at least three boxes and is at least `minh`
 * high (a margin note, a stamp or a row of table cells is not; minh 0 = every part counts); deeper vertical splits
 * (tables, side-by-side figures inside a column) keep the column number.
 * out_order: n box indices in reading order; out_col: column per output position (0 = full width). Returns n. */
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

static int *g_order, *g_col, g_k;
static float g_minh;
/* a part of a vertical split that reads as a column of its own */
static int real_column(const int *idx, int n) {
    if (g_minh <= 0) return 1;
    if (n < 3) return 0;
    float y0 = B[idx[0]].y0, y1 = B[idx[0]].y1;
    for (int i = 1; i < n; i++) { if (B[idx[i]].y0 < y0) y0 = B[idx[i]].y0; if (B[idx[i]].y1 > y1) y1 = B[idx[i]].y1; }
    return y1 - y0 >= g_minh;
}
static void cut(int *idx, int n, float gx, float gy, int col, int depth) {
    if (n <= 0) return;
    if (n == 1 || depth > 4000) { qsort(idx, n, sizeof(int), by_y); for (int i = 0; i < n; i++) { g_order[g_k] = idx[i]; g_col[g_k++] = col; } return; }
    /* vertical gaps: sweep in x */
    qsort(idx, n, sizeof(int), by_x);
    float maxx = B[idx[0]].x1; int nv = 0;
    for (int i = 1; i < n; i++) { if (B[idx[i]].x0 - maxx >= gx) nv++; if (B[idx[i]].x1 > maxx) maxx = B[idx[i]].x1; }
    if (nv) {
        /* the parts, left to right: [start, end) of idx */
        int *at = malloc(sizeof(int) * (nv + 2)), np = 0; at[np++] = 0; maxx = B[idx[0]].x1;
        for (int i = 1; i < n; i++) { if (B[idx[i]].x0 - maxx >= gx) at[np++] = i; if (B[idx[i]].x1 > maxx) maxx = B[idx[i]].x1; }
        at[np] = n;
        /* outside any column: number the real columns 1, 2, … when there are at least two of them; the other parts
           (a margin note beside the columns) and a split without two real columns stay outside (0), and a split
           further down may still find the columns */
        int real = 0, *num = calloc(np, sizeof(int));
        if (!col) { for (int p = 0; p < np; p++) if (real_column(idx + at[p], at[p + 1] - at[p])) num[p] = ++real; if (real < 2) for (int p = 0; p < np; p++) num[p] = 0; }
        for (int p = 0; p < np; p++) cut(idx + at[p], at[p + 1] - at[p], gx, gy, col ? col : num[p], depth + 1);
        free(num); free(at);
        return;
    }
    /* no column gutter: split once at the WIDEST horizontal gap (title | body | footnote), then recurse — splitting at
       every line gap would cut a two-column body into rows and interleave its columns */
    qsort(idx, n, sizeof(int), by_y);
    float maxy = B[idx[0]].y1, best = gy; int at = -1;
    for (int i = 1; i < n; i++) { float g = B[idx[i]].y0 - maxy; if (g >= best) { best = g; at = i; } if (B[idx[i]].y1 > maxy) maxy = B[idx[i]].y1; }
    if (at < 0) { for (int i = 0; i < n; i++) { g_order[g_k] = idx[i]; g_col[g_k++] = col; } return; } /* one block: top-to-bottom */
    int *rest = malloc(sizeof(int) * (n - at));
    for (int i = at; i < n; i++) rest[i - at] = idx[i];   /* the first part's recursion re-sorts idx[0..at) in place */
    cut(idx, at, gx, gy, col, depth + 1);
    cut(rest, n - at, gx, gy, col, depth + 1);
    free(rest);
}

API int t_xycut(const float *boxes, int n, float gx, float gy, float minh, int32_t *out_order, int32_t *out_col) {
    if (n <= 0) return 0;
    B = (const Box *)boxes; g_order = out_order; g_col = out_col; g_k = 0; g_minh = minh;
    int *idx = malloc(sizeof(int) * n);
    for (int i = 0; i < n; i++) idx[i] = i;
    cut(idx, n, gx, gy, 0, 0);
    free(idx);
    return g_k;
}
