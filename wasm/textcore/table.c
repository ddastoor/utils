/* PDF Tables → Excel (potentials #16): the tables of a page, found from its words' boxes and its ruled lines (own C, part of
 * textcore.wasm) — the two ways Tabula and Camelot know: "lattice", the grid the ruled lines draw, and "stream", columns
 * where no word stands and rows by the text's lines — made for bank statements and bills.
 *
 * words: n × [x0, y0, x1, y1] (points, y down); flags: n × bit 0 = the word is a number, an amount or a date (the page tells:
 * it has the text); rules: m × [x0, y0, x1, y1] (a ruled line's two ends; a thin filled bar given by its middle line).
 * Out: out_word 3 n: the table (−1: none), row and column of each word; out_tab 8 a table: kind (1 stream, 2 ruled), x0, y0,
 * x1, y1, columns, rows, header rows (the rows above the first that holds a number — merged into one in a stream table);
 * out_edges: each table's column edges (columns + 1), then its row edges (rows + 1), table after table.
 * force: the reader drew the table's box — the words given (those inside it) are one stream table, whatever their lines.
 * Returns the number of tables (at most maxT), −1 when out_edges is too small.
 *
 * Stream: words on one line (by their middle) make a line; a line breaks into chunks at gaps wider than 0.6 of the page's
 * usual word height (a space is about a quarter of it, a table's columns stand an em and more apart). Lines of two chunks
 * and more next to each other (no gap above 2.2 word heights between them), with the lines of one chunk among them that
 * keep inside the table and to less than half its width (a narration wrapped onto a second line), make a table when three
 * of its lines have two chunks or more. Its columns: the stretches no chunk of its lines with a number covers (chunks wider
 * than 45 % of the table left out — a total spanning columns), each cut at its middle; three of its lines must then reach
 * two columns or more. Its rows: a line with two chunks or
 * more and a word in the key column (the leftmost column that 80 % of the lines with numbers fill — the date) starts a row;
 * every other line belongs to the row above (a wrapped narration). The lines above the first row are its header, one row.
 * Lattice: horizontal and vertical rules that touch make a grid; one with two rules or more each way and two cells or more
 * is a table, its columns and rows between the rules; its words go to the cell their middle stands in.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define API __attribute__((visibility("default")))

typedef struct { float x0, y0, x1, y1; int num, used; } Wd;
typedef struct { int s, e; float x0, y0, x1, y1; int chunks, num, start; } Ln;   /* the words idx[s … e − 1] */
typedef struct { float a0, a1, c; } Seg;                                               /* a rule: from a0 to a1 at c */

static Wd *ws;
static int cmpf(const void *a, const void *b) { float d = *(const float *)a - *(const float *)b; return d < 0 ? -1 : d > 0; }
static int by_mid(const void *a, const void *b) {
    const Wd *p = &ws[*(const int *)a], *q = &ws[*(const int *)b];
    float d = (p->y0 + p->y1) - (q->y0 + q->y1); if (d) return d < 0 ? -1 : 1;
    return p->x0 < q->x0 ? -1 : p->x0 > q->x0;
}
static int by_x(const void *a, const void *b) { float d = ws[*(const int *)a].x0 - ws[*(const int *)b].x0; return d < 0 ? -1 : d > 0; }
static int seg_cmp(const void *a, const void *b) {
    const Seg *p = a, *q = b; float d = p->c - q->c; if (d < -1 || d > 1) return d < 0 ? -1 : 1;
    return p->a0 < q->a0 ? -1 : p->a0 > q->a0;
}
static float median(float *v, int n) { if (!n) return 0; qsort(v, n, sizeof(float), cmpf); return v[n / 2]; }

/* ---- output */
static int32_t *o_word; static float *o_tab, *o_edges; static int nT, maxT_, capE, nE;
static int emit(int kind, float x0, float y0, float x1, float y1, const float *cols, int nc, const float *rows, int nr, int nhead) {
    if (nT >= maxT_) return 0;
    if (nE + (nc + 1) + (nr + 1) > capE) return -1;
    float *t = o_tab + 8 * nT;
    t[0] = (float)kind; t[1] = x0; t[2] = y0; t[3] = x1; t[4] = y1; t[5] = (float)nc; t[6] = (float)nr; t[7] = (float)nhead;
    memcpy(o_edges + nE, cols, sizeof(float) * (nc + 1)); nE += nc + 1;
    memcpy(o_edges + nE, rows, sizeof(float) * (nr + 1)); nE += nr + 1;
    nT++;
    return 1;
}
static int col_of(const float *edges, int nc, float x) { int c = 0; while (c < nc - 1 && x >= edges[c + 1]) c++; return c; }

/* ---- lattice: the grids the rules draw */
static int uf_find(int *p, int i) { while (p[i] != i) i = p[i] = p[p[i]]; return i; }
static int merge_segs(Seg *s, int n) {            /* collinear pieces that touch become one */
    if (!n) return 0;
    qsort(s, n, sizeof(Seg), seg_cmp);
    int k = 0;
    for (int i = 1; i < n; i++) {
        if (s[i].c - s[k].c <= 1 && s[i].c - s[k].c >= -1 && s[i].a0 <= s[k].a1 + 2) { if (s[i].a1 > s[k].a1) s[k].a1 = s[i].a1; }
        else s[++k] = s[i];
    }
    return k + 1;
}
static int clusters(float *v, int n, float tol, float *out) {   /* sorted values within tol of each other → their mean */
    qsort(v, n, sizeof(float), cmpf);
    int k = 0;
    for (int i = 0; i < n;) {
        int j = i; double sum = 0;
        while (j < n && v[j] - v[i] <= tol) sum += v[j++];
        out[k++] = (float)(sum / (j - i)); i = j;
    }
    return k;
}
static int lattice(int n, const float *rules, int m) {
    Seg *hs = malloc(sizeof(Seg) * (m + 1)), *vs = malloc(sizeof(Seg) * (m + 1));
    int nh = 0, nv = 0;
    for (int i = 0; i < m; i++) {
        float x0 = rules[4 * i], y0 = rules[4 * i + 1], x1 = rules[4 * i + 2], y1 = rules[4 * i + 3];
        float dx = x1 > x0 ? x1 - x0 : x0 - x1, dy = y1 > y0 ? y1 - y0 : y0 - y1;
        if (dy <= 1.5f && dx >= 6) hs[nh++] = (Seg){ x0 < x1 ? x0 : x1, x0 < x1 ? x1 : x0, (y0 + y1) / 2 };
        else if (dx <= 1.5f && dy >= 6) vs[nv++] = (Seg){ y0 < y1 ? y0 : y1, y0 < y1 ? y1 : y0, (x0 + x1) / 2 };
    }
    nh = merge_segs(hs, nh); nv = merge_segs(vs, nv);
    int N = nh + nv, *par = malloc(sizeof(int) * (N + 1)), rc = 0;
    for (int i = 0; i < N; i++) par[i] = i;
    for (int i = 0; i < nh; i++) for (int j = 0; j < nv; j++) {
        if (vs[j].c >= hs[i].a0 - 2 && vs[j].c <= hs[i].a1 + 2 && hs[i].c >= vs[j].a0 - 2 && hs[i].c <= vs[j].a1 + 2) {
            int a = uf_find(par, i), b = uf_find(par, nh + j); if (a != b) par[a] = b;
        }
    }
    float *xs = malloc(sizeof(float) * (N + 2)), *ys = malloc(sizeof(float) * (N + 2)), *ex = malloc(sizeof(float) * (N + 2)), *ey = malloc(sizeof(float) * (N + 2));
    char *done = calloc(N + 1, 1);
    for (int r = 0; r < N && rc >= 0; r++) {
        int root = uf_find(par, r);
        if (done[root]) continue;
        done[root] = 1;
        int kx = 0, ky = 0;
        for (int i = 0; i < nh; i++) if (uf_find(par, i) == root) ys[ky++] = hs[i].c;
        for (int j = 0; j < nv; j++) if (uf_find(par, nh + j) == root) xs[kx++] = vs[j].c;
        if (kx < 2 || ky < 2) continue;
        int ncx = clusters(xs, kx, 2, ex) - 1, ncy = clusters(ys, ky, 2, ey) - 1;
        if (ncx < 1 || ncy < 1 || ncx * ncy < 2) continue;
        /* the words whose middle stands inside */
        int any = 0;
        for (int i = 0; i < n; i++) {
            if (ws[i].used) continue;
            float cx = (ws[i].x0 + ws[i].x1) / 2, cy = (ws[i].y0 + ws[i].y1) / 2;
            if (cx < ex[0] || cx > ex[ncx] || cy < ey[0] || cy > ey[ncy]) continue;
            any = 1;
        }
        if (!any) continue;
        /* header rows: the rows above the first one with a number (at most two, and only when one follows) */
        int first_num = -1;
        for (int i = 0; i < n; i++) {
            if (ws[i].used || !ws[i].num) continue;
            float cx = (ws[i].x0 + ws[i].x1) / 2, cy = (ws[i].y0 + ws[i].y1) / 2;
            if (cx < ex[0] || cx > ex[ncx] || cy < ey[0] || cy > ey[ncy]) continue;
            int row = col_of(ey, ncy, cy);
            if (first_num < 0 || row < first_num) first_num = row;
        }
        int nhead = first_num > 0 && first_num <= 2 ? first_num : 0;
        int t = nT, k = emit(2, ex[0], ey[0], ex[ncx], ey[ncy], ex, ncx, ey, ncy, nhead);
        if (k < 0) { rc = -1; break; }
        if (!k) continue;
        for (int i = 0; i < n; i++) {
            if (ws[i].used) continue;
            float cx = (ws[i].x0 + ws[i].x1) / 2, cy = (ws[i].y0 + ws[i].y1) / 2;
            if (cx < ex[0] || cx > ex[ncx] || cy < ey[0] || cy > ey[ncy]) continue;
            ws[i].used = 1;
            o_word[3 * i] = t; o_word[3 * i + 1] = col_of(ey, ncy, cy); o_word[3 * i + 2] = col_of(ex, ncx, cx);
        }
    }
    free(hs); free(vs); free(par); free(xs); free(ys); free(ex); free(ey); free(done);
    return rc;
}

/* ---- stream: columns where no word stands */
typedef struct { float x0, x1; } Iv;
static int iv_cmp(const void *a, const void *b) { float d = ((const Iv *)a)->x0 - ((const Iv *)b)->x0; return d < 0 ? -1 : d > 0; }
static int stream(int n, int force) {
    int *idx = malloc(sizeof(int) * (n + 1)), k = 0;
    for (int i = 0; i < n; i++) if (!ws[i].used) idx[k++] = i;
    if (k < 4) { free(idx); return 0; }
    float *hv = malloc(sizeof(float) * k);
    for (int i = 0; i < k; i++) hv[i] = ws[idx[i]].y1 - ws[idx[i]].y0;
    float em = median(hv, k); if (em <= 0) em = 10;
    free(hv);
    /* lines */
    qsort(idx, k, sizeof(int), by_mid);
    Ln *ls = malloc(sizeof(Ln) * (k + 1)); int nl = 0;
    for (int i = 0; i < k; i++) {
        const Wd *w = &ws[idx[i]];
        if (nl) {
            Ln *l = &ls[nl - 1];
            float ov = (w->y1 < l->y1 ? w->y1 : l->y1) - (w->y0 > l->y0 ? w->y0 : l->y0);
            float hmin = (w->y1 - w->y0) < (l->y1 - l->y0) ? (w->y1 - w->y0) : (l->y1 - l->y0);
            if (ov >= 0.5f * hmin) { l->e = i + 1; if (w->x0 < l->x0) l->x0 = w->x0; if (w->x1 > l->x1) l->x1 = w->x1; if (w->y0 < l->y0) l->y0 = w->y0; if (w->y1 > l->y1) l->y1 = w->y1; continue; }
        }
        ls[nl++] = (Ln){ i, i + 1, w->x0, w->y0, w->x1, w->y1, 0, 0, 0 };
    }
    /* chunks */
    for (int li = 0; li < nl; li++) {
        Ln *l = &ls[li];
        qsort(idx + l->s, l->e - l->s, sizeof(int), by_x);
        int ch = 1, num = 0; float right = ws[idx[l->s]].x1;
        for (int i = l->s; i < l->e; i++) {
            const Wd *w = &ws[idx[i]];
            if (i > l->s && w->x0 - right > 0.6f * em) ch++;
            if (w->x1 > right) right = w->x1;
            if (w->num) num = 1;
        }
        l->chunks = ch; l->num = num;
    }
    /* tables: runs of lines with two chunks or more, and the narrow one-chunk lines among them */
    int rc = 0;
    float *edges = malloc(sizeof(float) * (n + 2) * 2), *redges = malloc(sizeof(float) * (nl + 2));
    Iv *iv = malloc(sizeof(Iv) * (k + 1));
    int lo = 0;                                       /* the first line no table has taken */
    for (int a = 0; a < nl && rc >= 0;) {
        if (ls[a].chunks < 2 && !force) { a++; continue; }
        int b = a + 1, multi = ls[a].chunks >= 2; float rx0 = ls[a].x0, rx1 = ls[a].x1;
        if (force) {                                  /* the reader drew the table: all its lines are one */
            for (int li = 1; li < nl; li++) { if (ls[li].chunks >= 2) multi++; if (ls[li].x0 < rx0) rx0 = ls[li].x0; if (ls[li].x1 > rx1) rx1 = ls[li].x1; }
            b = nl;
        }
        while (b < nl) {
            const Ln *l = &ls[b];
            if (l->y0 - ls[b - 1].y1 > 2.2f * em) break;
            if (l->chunks >= 2) { multi++; if (l->x0 < rx0) rx0 = l->x0; if (l->x1 > rx1) rx1 = l->x1; b++; continue; }
            if (l->x0 >= rx0 - em && l->x1 <= rx1 + em && (l->x1 - l->x0) < 0.5f * (rx1 - rx0)) { b++; continue; }
            break;
        }
        /* one-chunk lines at its end are a note under it, unless they follow the line above as closely as a cell's wrapped
           lines do (the last row's narration on two lines) */
        while (!force && b > a + 1 && ls[b - 1].chunks < 2 && ls[b - 1].y0 - ls[b - 2].y1 > 0.5f * em) b--;
        if (multi < (force ? 1 : 3)) { a = b; continue; }
        /* columns: where no chunk of a line with a number stands (lines of two chunks and more; all of them if fewer than
           three have numbers) */
        int numlines = 0;
        for (int li = a; li < b; li++) if (ls[li].chunks >= 2 && ls[li].num) numlines++;
        int nv = 0; float width = rx1 - rx0;
        for (int li = a; li < b; li++) {
            const Ln *l = &ls[li];
            if (l->chunks < 2 || (numlines >= 3 && !l->num)) continue;
            float c0 = ws[idx[l->s]].x0, c1 = ws[idx[l->s]].x1;
            for (int i = l->s + 1; i <= l->e; i++) {
                if (i == l->e || ws[idx[i]].x0 - c1 > 0.6f * em) {
                    if (c1 - c0 < 0.45f * width) iv[nv++] = (Iv){ c0, c1 };
                    if (i < l->e) { c0 = ws[idx[i]].x0; c1 = ws[idx[i]].x1; }
                } else if (ws[idx[i]].x1 > c1) c1 = ws[idx[i]].x1;
            }
        }
        qsort(iv, nv, sizeof(Iv), iv_cmp);
        int nc = 0; edges[0] = rx0;
        float reach = nv ? iv[0].x1 : rx0;
        for (int i = 1; i < nv; i++) {
            if (iv[i].x0 - reach > 0.3f * em) edges[++nc] = (reach + iv[i].x0) / 2;
            if (iv[i].x1 > reach) reach = iv[i].x1;
        }
        edges[++nc] = rx1;
        if (nc < 2) { a = b; continue; }
        /* the lines stand in the columns: three of them must reach two columns or more. Lines of "label: value" whose second
           chunk falls in the first one's column (an account's details over a statement, its gaps widened by the OCR) are
           no table. */
        if (!force) {
            int spread = 0;
            for (int li = a; li < b; li++) {
                const Ln *l = &ls[li]; if (l->chunks < 2) continue;
                int c0 = col_of(edges, nc, (ws[idx[l->s]].x0 + ws[idx[l->s]].x1) / 2);
                for (int i = l->s + 1; i < l->e; i++) if (col_of(edges, nc, (ws[idx[i]].x0 + ws[idx[i]].x1) / 2) != c0) { spread++; break; }
            }
            if (spread < 3) { a = b; continue; }
        }
        /* a header a little further above (a rule under it, a scan's tight boxes): up to two lines without numbers, within
           3.5 word heights, whose chunks stand in two columns or more */
        if (!force) for (int up = 0; up < 2 && a > lo; up++) {
            const Ln *l = &ls[a - 1];
            if (l->num || l->chunks < 2 || ls[a].y0 - l->y1 > 3.5f * em || l->x0 < rx0 - em || l->x1 > rx1 + em) break;
            int seen = 0, last = -1;
            for (int i = l->s; i < l->e; i++) { int c = col_of(edges, nc, (ws[idx[i]].x0 + ws[idx[i]].x1) / 2); if (c != last) { seen++; last = c; } }
            if (seen < 2) break;
            a--;
        }
        /* the key column: the leftmost one that 80 % of the lines with numbers fill */
        int key = -1;
        if (numlines >= 3) {
            for (int c = 0; c < nc && key < 0; c++) {
                int filled = 0;
                for (int li = a; li < b; li++) {
                    const Ln *l = &ls[li]; if (l->chunks < 2 || !l->num) continue;
                    for (int i = l->s; i < l->e; i++) if (col_of(edges, nc, (ws[idx[i]].x0 + ws[idx[i]].x1) / 2) == c) { filled++; break; }
                }
                if (filled >= 0.8f * numlines) key = c;
            }
        }
        /* rows */
        int first = -1;
        for (int li = a; li < b; li++) {
            Ln *l = &ls[li]; l->start = 0;
            if (l->chunks < 2) continue;
            if (numlines >= 3 && !l->num && first < 0) continue;          /* a header line, above the first row */
            int haskey = key < 0;
            for (int i = l->s; i < l->e && !haskey; i++) if (col_of(edges, nc, (ws[idx[i]].x0 + ws[idx[i]].x1) / 2) == key) haskey = 1;
            if (haskey) { l->start = 1; if (first < 0) first = li; }
        }
        if (first < 0) { a = b; continue; }
        int nhead = first > a ? 1 : 0, nr = nhead;
        for (int li = first; li < b; li++) if (ls[li].start) nr++;
        int t = nT, row = -1, ri = 0;
        if (nhead) redges[ri++] = ls[a].y0;
        for (int li = first; li < b; li++) if (ls[li].start) redges[ri++] = ls[li].y0;
        redges[ri] = ls[b - 1].y1;
        float ty0 = ls[a].y0, ty1 = ls[b - 1].y1;
        int got = emit(1, rx0, ty0, rx1, ty1, edges, nc, redges, nr, nhead);
        if (got < 0) { rc = -1; break; }
        if (got) {
            for (int li = a; li < b; li++) {
                const Ln *l = &ls[li];
                if (li < first) row = 0;
                else if (l->start) row = (row < 0 ? -1 : row) + 1, row = row < nhead ? nhead : row;
                for (int i = l->s; i < l->e; i++) {
                    int w = idx[i];
                    ws[w].used = 1;
                    o_word[3 * w] = t; o_word[3 * w + 1] = row; o_word[3 * w + 2] = col_of(edges, nc, (ws[w].x0 + ws[w].x1) / 2);
                }
            }
            lo = b;
        }
        a = b;
    }
    free(edges); free(redges); free(iv); free(ls); free(idx);
    return rc;
}

API int t_tables(const float *words, const int32_t *flags, int n, const float *rules, int m, int force, int32_t *out_word, float *out_tab, int maxT, float *out_edges, int cap) {
    ws = malloc(sizeof(Wd) * (n + 1));
    for (int i = 0; i < n; i++) { ws[i] = (Wd){ words[4 * i], words[4 * i + 1], words[4 * i + 2], words[4 * i + 3], flags ? flags[i] & 1 : 0, 0 }; out_word[3 * i] = -1; out_word[3 * i + 1] = out_word[3 * i + 2] = 0; }
    o_word = out_word; o_tab = out_tab; o_edges = out_edges; nT = 0; maxT_ = maxT; capE = cap; nE = 0;
    int rc = force ? 0 : lattice(n, rules, m);
    if (rc >= 0) rc = stream(n, force);
    free(ws);
    if (rc < 0) return -1;
    /* in reading order: top to bottom (the words keep their tables' new numbers) */
    if (nT > 1) {
        int *perm = malloc(sizeof(int) * nT), *inv = malloc(sizeof(int) * nT);
        float *tabs = malloc(sizeof(float) * 9 * nT);
        for (int t = 0; t < nT; t++) { tabs[9 * t] = (float)t; memcpy(tabs + 9 * t + 1, out_tab + 8 * t, sizeof(float) * 8); }
        /* sort by top (y0 at [3] of the 9: index, kind, x0, y0 …) */
        for (int i = 0; i < nT; i++) perm[i] = i;
        for (int i = 1; i < nT; i++) for (int j = i; j > 0; j--) {
            const float *p = tabs + 9 * perm[j - 1], *q = tabs + 9 * perm[j];
            if (p[3] > q[3] + 1 || (p[3] >= q[3] - 1 && p[2] > q[2])) { int x = perm[j]; perm[j] = perm[j - 1]; perm[j - 1] = x; } else break;
        }
        /* the edges move with their tables */
        float *edges = malloc(sizeof(float) * (nE + 1)); int *off = malloc(sizeof(int) * (nT + 1));
        off[0] = 0;
        for (int t = 0; t < nT; t++) off[t + 1] = off[t] + (int)out_tab[8 * t + 5] + 1 + (int)out_tab[8 * t + 6] + 1;
        int pos = 0;
        for (int i = 0; i < nT; i++) { int t = perm[i]; memcpy(edges + pos, out_edges + off[t], sizeof(float) * (off[t + 1] - off[t])); pos += off[t + 1] - off[t]; inv[t] = i; }
        memcpy(out_edges, edges, sizeof(float) * nE);
        for (int i = 0; i < nT; i++) memcpy(out_tab + 8 * i, tabs + 9 * perm[i] + 1, sizeof(float) * 8);
        for (int i = 0; i < n; i++) if (out_word[3 * i] >= 0) out_word[3 * i] = inv[out_word[3 * i]];
        free(perm); free(inv); free(tabs); free(edges); free(off);
    }
    return nT;
}
