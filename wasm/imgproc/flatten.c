/* ======================================================================== book pages: the Book Page Flattener */
/*
 * Included by imgproc.c. A photo of one or two pages of an open book → each page flat (potentials #96).
 *
 * The method is Matt Zucker's page-dewarp (2016, MIT), as page-dewarp 0.3.4 (Python) carries it on: the text lines of a
 * page are found as chains of word blobs ("spans"), sampled every few pixels, and a model is fitted to the samples — the
 * page a sheet bent along one axis, z = a cubic of x with z(0) = z(1) = 0 and end slopes α, β, seen by a pinhole camera
 * of focal length 1.2 (in units of half the photo's longer side): its rotation and translation, α and β, a height for
 * every line and a place along the page for every sample are chosen so that the model's points fall where the photo has
 * them. Every pixel of the flat page is then looked up in the photo through the model.
 *
 * As page-dewarp: the text mask (a mean adaptive threshold, 55 px, C 25; dilated 9 × 1, eroded 1 × 3), the blob filters,
 * the span assembly (edges of at most 100 px, 1 px of overlap and 7.5° of turn, scored length + 10 × angle, linked
 * greedily), the samples every 20 px (a blob's mean row in that column), the initial pose from a rectangle, the model and
 * its projection. Ours:
 *  - the scale those pixel sizes mean: page-dewarp works on the photo made at most 1280 × 700, so its sizes fit text of a
 *    few pixels — a close-up's letters fall apart and a far shot's run together. Here the photo is first made the size at
 *    which its letters are about 7 px tall (the median height of the ink's letter-sized parts);
 *  - the fit: Levenberg–Marquardt on the residuals, the per-sample unknowns eliminated (a Schur complement: each is tied
 *    only to its own two residuals), so a page of 1,000 samples solves in milliseconds — page-dewarp runs Powell's method
 *    on all of them (seconds to minutes) — to the same or a lower error;
 *  - each blob's direction made to point right before blobs or spans are compared or averaged (the SVD and PCA give
 *    either sign);
 *  - two pages: the gutter found where no line runs across, in four bands down the spread, a line fitted through those
 *    places; the spans on each side fitted as a page of their own; a strip of the facing page at a side left out;
 *  - the flat page's extent from its own text (the samples' places and the lines' heights after the fit), with margins;
 *    page-dewarp takes the photo's rectangle less 50 × 20 px for the page (it cuts text near the edges, and keeps the
 *    table around the page);
 *  - the page drawn in colour at the photo's own resolution (bicubic), not grey and thresholded.
 */

#define FB_F 1.2        /* the camera's focal length, in half the photo's longer side (page-dewarp's) */
#define FB_LETTER 7.0   /* the letter height (px) the working picture is made for: page-dewarp's sizes suit it */
#define FB_REC 24       /* floats per page in p_book_fit's answer */
#ifndef FB_SLOPE
#define FB_SLOPE 0.5    /* the cubic's end slopes are held within ±FB_SLOPE (page-dewarp: 0.5) */
#endif

typedef struct {
    int x0, y0, x1, y1, off, n; /* box, pixel list */
    double cx, cy, tx, ty;      /* centre; unit tangent, pointing right */
    double ang, lx0, lx1;       /* atan2 of the tangent; extent along it from the centre */
    double p0x, p0y, p1x, p1y;  /* the two ends */
    int pred, succ, used;
} fb_blob;
typedef struct { double s; int a, b; } fb_edge;
typedef struct { int first, n, page; double u0, v0, u1, v1; } fb_span; /* points [first, first + n) of the point list; the line's two ends (normalised) */

static int fb_cmp_edge(const void *x, const void *y) { double a = ((const fb_edge *)x)->s, b = ((const fb_edge *)y)->s; return (a > b) - (a < b); }

/* the last fit's samples (u, v normalised, span, page), for tests and a picture of what was found */
static float *fb_dbg = NULL; static int fb_ndbg = 0;
API int p_book_points(float *out, int cap) { int n = fb_ndbg < cap ? fb_ndbg : cap; if (fb_dbg) memcpy(out, fb_dbg, sizeof(float) * 4 * n); return fb_ndbg; }

/* grey (Rec. 601 luma, as OpenCV's RGB2GRAY) */
static uint8_t *fb_grey(const uint8_t *rgba, int n) {
    uint8_t *g = malloc(n);
    for (int i = 0; i < n; i++) { const uint8_t *p = rgba + (size_t)i * 4; g[i] = (uint8_t)((p[0] * 4899 + p[1] * 9617 + p[2] * 1868 + 8192) >> 14); }
    return g;
}
/* grey made smaller by area (each output pixel the mean of what it covers) */
static uint8_t *fb_shrink(const uint8_t *g, int w, int h, int dw, int dh) {
    uint8_t *o = malloc((size_t)dw * dh); double sx = (double)w / dw, sy = (double)h / dh;
    for (int y = 0; y < dh; y++) {
        double fy0 = y * sy, fy1 = fy0 + sy; int iy0 = (int)fy0, iy1 = (int)ceil(fy1); if (iy1 > h) iy1 = h;
        for (int x = 0; x < dw; x++) {
            double fx0 = x * sx, fx1 = fx0 + sx; int ix0 = (int)fx0, ix1 = (int)ceil(fx1); if (ix1 > w) ix1 = w;
            double s = 0, a = 0;
            for (int yy = iy0; yy < iy1; yy++) {
                double wy = fmin(fy1, yy + 1) - fmax(fy0, yy); if (wy <= 0) continue;
                for (int xx = ix0; xx < ix1; xx++) { double wx = fmin(fx1, xx + 1) - fmax(fx0, xx); if (wx <= 0) continue; s += g[(size_t)yy * w + xx] * wx * wy; a += wx * wy; }
            }
            o[(size_t)y * dw + x] = (uint8_t)(a > 0 ? s / a + 0.5 : 255);
        }
    }
    return o;
}
/* ink: darker than the mean of the win × win window around it by more than c (OpenCV's ADAPTIVE_THRESH_MEAN_C, inverted;
   the window clipped at the picture's edges) */
static void fb_ink(const uint8_t *g, int w, int h, int win, int c, uint8_t *out) {
    uint32_t *ii = calloc((size_t)(w + 1) * (h + 1), sizeof(uint32_t)); int r = win / 2;
    for (int y = 0; y < h; y++) { uint32_t row = 0; for (int x = 0; x < w; x++) { row += g[(size_t)y * w + x]; ii[(size_t)(y + 1) * (w + 1) + x + 1] = ii[(size_t)y * (w + 1) + x + 1] + row; } }
    for (int y = 0; y < h; y++) {
        int y0 = y - r < 0 ? 0 : y - r, y1 = y + r >= h ? h - 1 : y + r;
        for (int x = 0; x < w; x++) {
            int x0 = x - r < 0 ? 0 : x - r, x1 = x + r >= w ? w - 1 : x + r;
            uint32_t s = ii[(size_t)(y1 + 1) * (w + 1) + x1 + 1] - ii[(size_t)y0 * (w + 1) + x1 + 1] - ii[(size_t)(y1 + 1) * (w + 1) + x0] + ii[(size_t)y0 * (w + 1) + x0];
            double mean = (double)s / ((x1 - x0 + 1) * (y1 - y0 + 1));
            out[(size_t)y * w + x] = g[(size_t)y * w + x] <= mean - c ? 1 : 0;
        }
    }
    free(ii);
}
/* morphology with a k-long line: horizontal or vertical, max (dilate) or min (erode), the window clipped at the edges */
static void fb_morph(uint8_t *m, int w, int h, int k, int vertical, int dilate) {
    int r = k / 2, n = vertical ? h : w, lines = vertical ? w : h; uint8_t *buf = malloc(n);
    for (int l = 0; l < lines; l++) {
        for (int i = 0; i < n; i++) buf[i] = vertical ? m[(size_t)i * w + l] : m[(size_t)l * w + i];
        for (int i = 0; i < n; i++) {
            int a = i - r < 0 ? 0 : i - r, b = i + (k - 1 - r) >= n ? n - 1 : i + (k - 1 - r), v = dilate ? 0 : 1;
            for (int j = a; j <= b; j++) { if (dilate) { if (buf[j]) { v = 1; break; } } else if (!buf[j]) { v = 0; break; } }
            if (vertical) m[(size_t)i * w + l] = (uint8_t)v; else m[(size_t)l * w + i] = (uint8_t)v;
        }
    }
    free(buf);
}
/* the median height of the ink's letter-sized parts (3 – 80 px tall, not much wider than 3 × their height): the letters */
static double fb_letter_height(const uint8_t *g, int w, int h) {
    uint8_t *m = malloc((size_t)w * h); int win = (w > h ? w : h) / 30; win |= 1; if (win < 15) win = 15;
    fb_ink(g, w, h, win, 18, m);
    int32_t *pix = malloc(sizeof(int32_t) * (size_t)w * h); int cap = 200000; cm_comp *cs = malloc(sizeof(cm_comp) * cap);
    int nc = cm_label(m, w, h, pix, cs, cap), nh = 0; int *hs = malloc(sizeof(int) * (nc + 1));
    for (int i = 0; i < nc; i++) {
        int bw = cs[i].x1 - cs[i].x0 + 1, bh = cs[i].y1 - cs[i].y0 + 1;
        if (bh >= 3 && bh <= 80 && bw <= 3 * bh && cs[i].n >= 6) hs[nh++] = bh;
    }
    qsort(hs, nh, sizeof(int), cm_cmpi);
    double med = nh >= 20 ? hs[nh / 2] : 0;
    free(m); free(pix); free(cs); free(hs);
    return med;
}
static inline double fb_angdist(double b, double a) { double d = b - a; while (d > M_PI) d -= 2 * M_PI; while (d < -M_PI) d += 2 * M_PI; return fabs(d); }
/* rotation matrix from a rotation vector (Rodrigues' formula) */
static void fb_rodrigues(const double *r, double *R) {
    double th = sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
    if (th < 1e-12) { R[0] = 1; R[1] = -r[2]; R[2] = r[1]; R[3] = r[2]; R[4] = 1; R[5] = -r[0]; R[6] = -r[1]; R[7] = r[0]; R[8] = 1; return; }
    double x = r[0] / th, y = r[1] / th, z = r[2] / th, c = cos(th), s = sin(th), C = 1 - c;
    R[0] = c + x * x * C; R[1] = x * y * C - z * s; R[2] = x * z * C + y * s;
    R[3] = y * x * C + z * s; R[4] = c + y * y * C; R[5] = y * z * C - x * s;
    R[6] = z * x * C - y * s; R[7] = z * y * C + x * s; R[8] = c + z * z * C;
}
/* rotation vector from a rotation matrix */
static void fb_rvec(const double *R, double *r) {
    double c = (R[0] + R[4] + R[8] - 1) / 2; c = c > 1 ? 1 : c < -1 ? -1 : c; double th = acos(c);
    if (th < 1e-9) { r[0] = (R[7] - R[5]) / 2; r[1] = (R[2] - R[6]) / 2; r[2] = (R[3] - R[1]) / 2; return; }
    if (M_PI - th < 1e-6) { /* a half turn: the axis from the diagonal */
        double x = sqrt(fmax(0, (R[0] + 1) / 2)), y = sqrt(fmax(0, (R[4] + 1) / 2)), z = sqrt(fmax(0, (R[8] + 1) / 2));
        if (R[1] < 0) y = -y; if (R[2] < 0) z = -z; r[0] = x * th; r[1] = y * th; r[2] = z * th; return;
    }
    double s = 2 * sin(th); r[0] = (R[7] - R[5]) / s * th; r[1] = (R[2] - R[6]) / s * th; r[2] = (R[3] - R[1]) / s * th;
}
/* a point (X, Y) of the page model → the photo (normalised): z = the cubic of X with end slopes a, b (each held within
   ±0.5, as page-dewarp), then the camera R, t and the focal length */
static inline void fb_proj(const double *R, const double *t, double a, double b, double X, double Y, double *u, double *v) {
    a = a < -FB_SLOPE ? -FB_SLOPE : a > FB_SLOPE ? FB_SLOPE : a; b = b < -FB_SLOPE ? -FB_SLOPE : b > FB_SLOPE ? FB_SLOPE : b;
    double Z = (((a + b) * X + (-2 * a - b)) * X + a) * X;
    double xc = R[0] * X + R[1] * Y + R[2] * Z + t[0], yc = R[3] * X + R[4] * Y + R[5] * Z + t[1], zc = R[6] * X + R[7] * Y + R[8] * Z + t[2];
    if (fabs(zc) < 1e-12) zc = zc < 0 ? -1e-12 : 1e-12;
    *u = FB_F * xc / zc; *v = FB_F * yc / zc;
}
/* solve the n × n system A x = b (A symmetric positive definite, overwritten) by Cholesky; returns 0 when A is not */
static int fb_chol(double *A, double *b, int n) {
    for (int j = 0; j < n; j++) {
        double s = A[j * n + j]; for (int k = 0; k < j; k++) s -= A[j * n + k] * A[j * n + k];
        if (!(s > 0)) return 0; double d = sqrt(s); A[j * n + j] = d;
        for (int i = j + 1; i < n; i++) { double t = A[i * n + j]; for (int k = 0; k < j; k++) t -= A[i * n + k] * A[j * n + k]; A[i * n + j] = t / d; }
    }
    for (int i = 0; i < n; i++) { double s = b[i]; for (int k = 0; k < i; k++) s -= A[i * n + k] * b[k]; b[i] = s / A[i * n + i]; }
    for (int i = n - 1; i >= 0; i--) { double s = b[i]; for (int k = i + 1; k < n; k++) s -= A[k * n + i] * b[k]; b[i] = s / A[i * n + i]; }
    return 1;
}
/* the homography taking the four points (X, Y) to (x, y) (h33 = 1; 8 × 8 elimination with partial pivoting) */
static int fb_homography(const double *src, const double *dst, double *H) {
    double M[8][9];
    for (int i = 0; i < 4; i++) {
        double X = src[2 * i], Y = src[2 * i + 1], x = dst[2 * i], y = dst[2 * i + 1];
        double r0[9] = { X, Y, 1, 0, 0, 0, -x * X, -x * Y, x }, r1[9] = { 0, 0, 0, X, Y, 1, -y * X, -y * Y, y };
        memcpy(M[2 * i], r0, sizeof r0); memcpy(M[2 * i + 1], r1, sizeof r1);
    }
    for (int c = 0; c < 8; c++) {
        int p = c; for (int r = c + 1; r < 8; r++) if (fabs(M[r][c]) > fabs(M[p][c])) p = r;
        if (fabs(M[p][c]) < 1e-14) return 0;
        if (p != c) for (int k = 0; k < 9; k++) { double t = M[c][k]; M[c][k] = M[p][k]; M[p][k] = t; }
        for (int r = 0; r < 8; r++) if (r != c) { double f = M[r][c] / M[c][c]; for (int k = c; k < 9; k++) M[r][k] -= f * M[c][k]; }
    }
    for (int i = 0; i < 8; i++) H[i] = M[i][8] / M[i][i];
    H[8] = 1; return 1;
}
/* the pose of a flat rectangle (W × H at z = 0) whose corners are seen at img[8] (normalised): the homography from the
   plane to the camera's normalised rays, taken apart into R (made orthonormal) and t (in front of the camera) */
static int fb_plane_pose(double W, double Hh, const double *img, double *rvec, double *t) {
    double src[8] = { 0, 0, W, 0, W, Hh, 0, Hh }, dst[8], H[9];
    for (int i = 0; i < 8; i++) dst[i] = img[i] / FB_F;
    if (!fb_homography(src, dst, H)) return 0;
    double c1[3] = { H[0], H[3], H[6] }, c2[3] = { H[1], H[4], H[7] }, c3[3] = { H[2], H[5], H[8] };
    double n1 = sqrt(c1[0] * c1[0] + c1[1] * c1[1] + c1[2] * c1[2]), n2 = sqrt(c2[0] * c2[0] + c2[1] * c2[1] + c2[2] * c2[2]), lam = (n1 + n2) / 2;
    if (lam < 1e-14) return 0;
    if (c3[2] < 0) lam = -lam;
    double r1[3], r2[3], r3[3];
    for (int i = 0; i < 3; i++) { r1[i] = c1[i] / lam; r2[i] = c2[i] / lam; t[i] = c3[i] / lam; }
    double a = sqrt(r1[0] * r1[0] + r1[1] * r1[1] + r1[2] * r1[2]); for (int i = 0; i < 3; i++) r1[i] /= a;
    double d = r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2]; for (int i = 0; i < 3; i++) r2[i] -= d * r1[i];
    a = sqrt(r2[0] * r2[0] + r2[1] * r2[1] + r2[2] * r2[2]); for (int i = 0; i < 3; i++) r2[i] /= a;
    r3[0] = r1[1] * r2[2] - r1[2] * r2[1]; r3[1] = r1[2] * r2[0] - r1[0] * r2[2]; r3[2] = r1[0] * r2[1] - r1[1] * r2[0];
    double R[9] = { r1[0], r2[0], r3[0], r1[1], r2[1], r3[1], r1[2], r2[2], r3[2] };
    fb_rvec(R, rvec);
    return 1;
}

/* the weighted principal direction of point sets (each span's direction, pointing right, weighted by its length) */
static void fb_direction(const double *pu, const double *pv, const fb_span *sp, const int *which, int ns, double *dx, double *dy) {
    double ax = 0, ay = 0;
    for (int q = 0; q < ns; q++) {
        const fb_span *s = &sp[which[q]]; if (s->n < 2) continue;
        double mx = 0, my = 0; for (int k = 0; k < s->n; k++) { mx += pu[s->first + k]; my += pv[s->first + k]; } mx /= s->n; my /= s->n;
        double a = 0, b = 0, c = 0; for (int k = 0; k < s->n; k++) { double x = pu[s->first + k] - mx, y = pv[s->first + k] - my; a += x * x; b += x * y; c += y * y; }
        double th = 0.5 * atan2(2 * b, a - c), ex = cos(th), ey = sin(th);
        if (ex < 0) { ex = -ex; ey = -ey; }
        double wgt = hypot(pu[s->first + s->n - 1] - pu[s->first], pv[s->first + s->n - 1] - pv[s->first]);
        ax += ex * wgt; ay += ey * wgt;
    }
    double n = hypot(ax, ay); if (n < 1e-12) { *dx = 1; *dy = 0; return; }
    *dx = ax / n; *dy = ay / n;
}

/* the point (X, Y) of the model seen at (u, v): Newton's method from (X, Y) as given; returns 0 when it does not settle */
static int fb_unproject(const double *R, const double *t, double a, double b, double u, double v, double *X, double *Y) {
    for (int it = 0; it < 30; it++) {
        double pu0, pv0, pu1, pv1, pu2, pv2, e = 1e-6;
        fb_proj(R, t, a, b, *X, *Y, &pu0, &pv0); fb_proj(R, t, a, b, *X + e, *Y, &pu1, &pv1); fb_proj(R, t, a, b, *X, *Y + e, &pu2, &pv2);
        double j00 = (pu1 - pu0) / e, j10 = (pv1 - pv0) / e, j01 = (pu2 - pu0) / e, j11 = (pv2 - pv0) / e, det = j00 * j11 - j01 * j10;
        if (fabs(det) < 1e-12) return 0;
        double ru = u - pu0, rv = v - pv0, dX = (j11 * ru - j01 * rv) / det, dY = (-j10 * ru + j00 * rv) / det;
        *X += dX; *Y += dY;
        if (fabs(dX) + fabs(dY) < 1e-9) return 1;
    }
    return 0;
}

/*
 * The fit (Levenberg–Marquardt). Parameters p: FB_G globals — rvec[3], tvec[3], α, β, the left and the right margin — then
 * a height per line (ns), then a place along its line per point (np). Point k (target du[k], dv[k]) lies on line spanOf[k];
 * its residual is its projection less the target. Point −1 is the model's origin, held at (du0, dv0). A point with
 * marg[k] = 1 (a line's start) or 2 (its end) also has the residual FB_W × (its place − that margin). The places are
 * eliminated (each touches only its own residuals): a dense system of FB_G + ns unknowns per step. Returns the final cost.
 */
#define FB_G 10
#define FB_W 1.0
static double fb_lm(double *p, int ns, int np, const int *spanOf, const uint8_t *marg, const double *du, const double *dv, double du0, double dv0, int *iters, double *cost0) {
    const int m = FB_G + ns, P = m + np, NR = np + 1;
    double *ru = malloc(sizeof(double) * NR), *rv = malloc(sizeof(double) * NR), *tru = malloc(sizeof(double) * NR), *trv = malloc(sizeof(double) * NR);
    double *b1 = malloc(sizeof(double) * NR), *b2 = malloc(sizeof(double) * NR);
    double *Jg = malloc(sizeof(double) * NR * 16), *Jy = malloc(sizeof(double) * np * 2 + 2), *Jx = malloc(sizeof(double) * np * 2 + 2);
    double *A = malloc(sizeof(double) * m * m), *S = malloc(sizeof(double) * m * m), *bz = malloc(sizeof(double) * m), *rhs = malloc(sizeof(double) * m), *dz = malloc(sizeof(double) * m);
    double *bx = malloc(sizeof(double) * np + 8), *D = malloc(sizeof(double) * np + 8), *C = malloc(sizeof(double) * np * (FB_G + 1) + 8), *q = malloc(sizeof(double) * P);
    /* the projection residuals of parameters par into (ou, ov); the cost adds the margins' */
    #define FB_RES(par, ou, ov) do { double R_[9]; fb_rodrigues((par), R_); double uu, vv; \
        fb_proj(R_, (par) + 3, (par)[6], (par)[7], 0, 0, &uu, &vv); (ou)[0] = uu - du0; (ov)[0] = vv - dv0; \
        for (int k_ = 0; k_ < np; k_++) { fb_proj(R_, (par) + 3, (par)[6], (par)[7], (par)[m + k_], (par)[FB_G + spanOf[k_]], &uu, &vv); (ou)[k_ + 1] = uu - du[k_]; (ov)[k_ + 1] = vv - dv[k_]; } } while (0)
    #define FB_COST(par, ou, ov, out) do { double c_ = 0; for (int k_ = 0; k_ < NR; k_++) c_ += (ou)[k_] * (ou)[k_] + (ov)[k_] * (ov)[k_]; \
        for (int k_ = 0; k_ < np; k_++) if (marg[k_]) { double r_ = FB_W * ((par)[m + k_] - (par)[marg[k_] == 1 ? 8 : 9]); c_ += r_ * r_; } (out) = c_; } while (0)
    FB_RES(p, ru, rv); double cost; FB_COST(p, ru, rv, cost); *cost0 = cost;
    double lambda = 1e-3; int it, still = 0;
    for (it = 0; it < 200; it++) {
        const double hg = 1e-7;
        for (int j = 0; j < 8; j++) {
            double keep = p[j];
            p[j] = keep + hg; FB_RES(p, tru, trv); p[j] = keep - hg; FB_RES(p, b1, b2); p[j] = keep;
            for (int k = 0; k < NR; k++) { Jg[k * 16 + j] = (tru[k] - b1[k]) / (2 * hg); Jg[k * 16 + 8 + j] = (trv[k] - b2[k]) / (2 * hg); }
        }
        { double R_[9]; fb_rodrigues(p, R_);
          for (int k = 0; k < np; k++) {
              double X = p[m + k], Y = p[FB_G + spanOf[k]], u1, v1, u2, v2;
              fb_proj(R_, p + 3, p[6], p[7], X + hg, Y, &u1, &v1); fb_proj(R_, p + 3, p[6], p[7], X - hg, Y, &u2, &v2);
              Jx[2 * k] = (u1 - u2) / (2 * hg); Jx[2 * k + 1] = (v1 - v2) / (2 * hg);
              fb_proj(R_, p + 3, p[6], p[7], X, Y + hg, &u1, &v1); fb_proj(R_, p + 3, p[6], p[7], X, Y - hg, &u2, &v2);
              Jy[2 * k] = (u1 - u2) / (2 * hg); Jy[2 * k + 1] = (v1 - v2) / (2 * hg);
          } }
        /* the normal equations */
        memset(A, 0, sizeof(double) * m * m); memset(bz, 0, sizeof(double) * m);
        for (int k = 0; k < NR; k++) {
            const double *gu = Jg + k * 16, *gv = gu + 8; double r1 = ru[k], r2 = rv[k];
            for (int i = 0; i < 8; i++) { for (int j = 0; j <= i; j++) A[i * m + j] += gu[i] * gu[j] + gv[i] * gv[j]; bz[i] -= gu[i] * r1 + gv[i] * r2; }
            if (!k) continue;
            int pk = k - 1, s = FB_G + spanOf[pk]; double yu = Jy[2 * pk], yv = Jy[2 * pk + 1], xu = Jx[2 * pk], xv = Jx[2 * pk + 1];
            for (int i = 0; i < 8; i++) A[s * m + i] += yu * gu[i] + yv * gv[i];
            A[s * m + s] += yu * yu + yv * yv; bz[s] -= yu * r1 + yv * r2;
            D[pk] = xu * xu + xv * xv; bx[pk] = -(xu * r1 + xv * r2);
            double *c = C + pk * (FB_G + 1); for (int i = 0; i < 8; i++) c[i] = gu[i] * xu + gv[i] * xv; c[8] = c[9] = 0; c[FB_G] = yu * xu + yv * xv;
            if (marg[pk]) { /* FB_W (x − margin): ∂/∂x = FB_W, ∂/∂margin = −FB_W */
                int g = marg[pk] == 1 ? 8 : 9; double rm = FB_W * (p[m + pk] - p[g]);
                D[pk] += FB_W * FB_W; bx[pk] -= FB_W * rm; A[g * m + g] += FB_W * FB_W; bz[g] += FB_W * rm; c[g] = -FB_W * FB_W;
            }
        }
        for (int i = 0; i < m; i++) for (int j = 0; j < i; j++) A[j * m + i] = A[i * m + j];
        int ok = 0;
        while (lambda < 1e12) {
            memcpy(S, A, sizeof(double) * m * m); memcpy(rhs, bz, sizeof(double) * m);
            for (int i = 0; i < m; i++) S[i * m + i] += lambda * (A[i * m + i] > 1e-12 ? A[i * m + i] : 1e-12) + 1e-14;
            for (int k = 0; k < np; k++) {
                double d = D[k] * (1 + lambda) + 1e-14; const double *c = C + k * (FB_G + 1); int idx[FB_G + 1];
                for (int i = 0; i < FB_G; i++) idx[i] = i; idx[FB_G] = FB_G + spanOf[k];
                for (int i = 0; i <= FB_G; i++) { if (c[i] == 0) continue; rhs[idx[i]] -= c[i] * bx[k] / d; for (int j = 0; j <= FB_G; j++) if (c[j] != 0) S[idx[i] * m + idx[j]] -= c[i] * c[j] / d; }
            }
            memcpy(dz, rhs, sizeof(double) * m);
            if (!fb_chol(S, dz, m)) { lambda *= 10; continue; }
            memcpy(q, p, sizeof(double) * P);
            for (int i = 0; i < m; i++) q[i] += dz[i];
            for (int k = 0; k < np; k++) {
                double d = D[k] * (1 + lambda) + 1e-14; const double *c = C + k * (FB_G + 1); double sacc = bx[k];
                for (int i = 0; i < FB_G; i++) sacc -= c[i] * dz[i]; sacc -= c[FB_G] * dz[FB_G + spanOf[k]];
                q[m + k] += sacc / d;
            }
            q[6] = q[6] < -FB_SLOPE ? -FB_SLOPE : q[6] > FB_SLOPE ? FB_SLOPE : q[6]; q[7] = q[7] < -FB_SLOPE ? -FB_SLOPE : q[7] > FB_SLOPE ? FB_SLOPE : q[7]; /* held where the model holds them */
            FB_RES(q, tru, trv); double nc; FB_COST(q, tru, trv, nc);
            if (nc < cost) {
                double gain = (cost - nc) / (cost > 1e-300 ? cost : 1e-300);
                memcpy(p, q, sizeof(double) * P); memcpy(ru, tru, sizeof(double) * NR); memcpy(rv, trv, sizeof(double) * NR);
                cost = nc; lambda = lambda / 3 > 1e-12 ? lambda / 3 : 1e-12; ok = 1;
                still = gain < 1e-6 ? still + 1 : 0;
                break;
            }
            lambda *= 4;
        }
        if (!ok || still >= 3) break;
    }
    #undef FB_RES
    #undef FB_COST
    *iters = it;
    free(ru); free(rv); free(tru); free(trv); free(b1); free(b2); free(Jg); free(Jy); free(Jx); free(A); free(S); free(bz); free(rhs); free(dz); free(bx); free(D); free(C); free(q);
    return cost;
}
static int fb_cmpd(const void *a, const void *b) { double x = *(const double *)a, y = *(const double *)b; return (x > y) - (x < y); }

/*
 * Fit the model to one page's spans (indices which[0..ns)). Samples pu, pv (normalised). cu, cv (normalised): the ends of
 * word blobs in no line (a page number, a running head) — those just above or below the text, within its width, are on
 * the page too. Writes the page record (FB_REC floats) and returns 1, or 0 when it cannot (fewer than 2 lines).
 */
static int fb_fit_page(const double *pu, const double *pv, const fb_span *sp, const int *which, int ns, double px2norm, int side, const double *cu, const double *cv, int ncand, float *rec) {
    if (ns < 2) return 0;
    int ns0 = 0; for (int q = 0; q < ns; q++) ns0 += sp[which[q]].n;
    if (ns0 < 6) return 0;
    int np = ns0 + 2 * ns; /* the samples, then each line's two ends */
    double dx, dy; fb_direction(pu, pv, sp, which, ns, &dx, &dy);
    double ex = -dy, ey = dx; /* the page's down */
    /* the text's rectangle along those directions → the corners (page-dewarp: the photo's rectangle less its margins) */
    double x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (int q = 0; q < ns; q++) { const fb_span *s = &sp[which[q]]; for (int k = 0; k < s->n; k++) { double a = pu[s->first + k] * dx + pv[s->first + k] * dy, b = pu[s->first + k] * ex + pv[s->first + k] * ey; if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; } }
    double padx = 0.02 * (x1 - x0), pady = 0.02 * (y1 - y0); x0 -= padx; x1 += padx; y0 -= pady; y1 += pady;
    double cn[8] = { x0 * dx + y0 * ex, x0 * dy + y0 * ey, x1 * dx + y0 * ex, x1 * dy + y0 * ey, x1 * dx + y1 * ex, x1 * dy + y1 * ey, x0 * dx + y1 * ex, x0 * dy + y1 * ey };
    double W = x1 - x0, Hh = y1 - y0;
    int m = FB_G + ns, P = m + np;
    double *p = calloc(P, sizeof(double));
    if (!fb_plane_pose(W, Hh, cn, p, p + 3)) { free(p); return 0; }
    int *spanOf = malloc(sizeof(int) * np); uint8_t *marg = calloc(np, 1); double *du = malloc(sizeof(double) * np), *dv = malloc(sizeof(double) * np);
    for (int q = 0, k = 0; q < ns; q++) {
        const fb_span *s = &sp[which[q]]; double my = 0;
        for (int i = 0; i < s->n; i++) { double u = pu[s->first + i], v = pv[s->first + i]; my += u * ex + v * ey; p[m + k] = u * dx + v * dy - x0; du[k] = u; dv[k] = v; spanOf[k++] = q; }
        p[FB_G + q] = my / s->n - y0;
    }
    for (int q = 0; q < ns; q++) {
        const fb_span *s = &sp[which[q]]; int k = ns0 + 2 * q;
        du[k] = s->u0; dv[k] = s->v0; p[m + k] = s->u0 * dx + s->v0 * dy - x0; spanOf[k] = q;
        du[k + 1] = s->u1; dv[k + 1] = s->v1; p[m + k + 1] = s->u1 * dx + s->v1 * dy - x0; spanOf[k + 1] = q;
    }
    /* first the lines alone, then held to the margins: the lines that start (end) where most full lines start (end) —
       justified text; indented first lines, short last lines and headings are left free */
    int it1 = 0, it2 = 0; double c0;
    double cf1 = fb_lm(p, ns, np, spanOf, marg, du, dv, cn[0], cn[1], &it1, &c0);
    double *ys = malloc(sizeof(double) * ns), *st = malloc(sizeof(double) * ns), *en = malloc(sizeof(double) * ns);
    for (int q = 0; q < ns; q++) ys[q] = p[FB_G + q];
    qsort(ys, ns, sizeof(double), fb_cmpd);
    double *gaps = malloc(sizeof(double) * ns); int ng = 0;
    for (int i = 1; i < ns; i++) if (ys[i] - ys[i - 1] > 1e-6) gaps[ng++] = ys[i] - ys[i - 1];
    qsort(gaps, ng, sizeof(double), fb_cmpd);
    double pitch = ng ? gaps[ng / 2] : 0.02 * (Hh + 1e-6);
    int nl = 0, nr = 0;
    if (ns >= 4) {
        for (int q = 0; q < ns; q++) { st[q] = p[m + ns0 + 2 * q]; en[q] = p[m + ns0 + 2 * q + 1]; }
        double *ss = malloc(sizeof(double) * ns), *ee = malloc(sizeof(double) * ns); memcpy(ss, st, sizeof(double) * ns); memcpy(ee, en, sizeof(double) * ns);
        qsort(ss, ns, sizeof(double), fb_cmpd); qsort(ee, ns, sizeof(double), fb_cmpd);
        /* the margin: the middle of the densest stretch of 0.6 line spacings among the starts (ends) */
        double XL = ss[0], XR = ee[ns - 1]; int bestL = 0, bestR = 0;
        for (int i = 0; i < ns; i++) { int c = 0; double sum = 0; for (int j = i; j < ns && ss[j] - ss[i] <= 0.6 * pitch; j++) { c++; sum += ss[j]; } if (c > bestL) { bestL = c; XL = sum / c; } }
        for (int i = 0; i < ns; i++) { int c = 0; double sum = 0; for (int j = i; j < ns && ee[j] - ee[i] <= 0.6 * pitch; j++) { c++; sum += ee[j]; } if (c > bestR) { bestR = c; XR = sum / c; } }
        /* a margin only when a good share of the lines meet it, and when it is at the text's own edge */
        if (bestL >= 3 && bestL >= ns / 3 && XL <= ss[0] + 1.5 * pitch) { p[8] = XL; for (int q = 0; q < ns; q++) if (fabs(st[q] - XL) < 0.4 * pitch) { marg[ns0 + 2 * q] = 1; nl++; } }
        if (bestR >= 3 && bestR >= ns / 3 && XR >= ee[ns - 1] - 1.5 * pitch) { p[9] = XR; for (int q = 0; q < ns; q++) if (fabs(en[q] - XR) < 0.4 * pitch) { marg[ns0 + 2 * q + 1] = 2; nr++; } }
        free(ss); free(ee);
    }
    double cost = cf1; int it = it1;
    if (nl + nr >= 3) { double cA; cost = fb_lm(p, ns, np, spanOf, marg, du, dv, cn[0], cn[1], &it2, &cA); it += it2; }
    /* the page's extent in the model: the samples' places and the lines' heights, with margins */
    double X0 = 1e9, X1 = -1e9, Y0 = 1e9, Y1 = -1e9;
    for (int k = 0; k < np; k++) { if (p[m + k] < X0) X0 = p[m + k]; if (p[m + k] > X1) X1 = p[m + k]; }
    for (int q = 0; q < ns; q++) { if (p[FB_G + q] < Y0) Y0 = p[FB_G + q]; if (p[FB_G + q] > Y1) Y1 = p[FB_G + q]; }
    {
        /* a page number or a running head: unprojected from the nearest sample's place, kept when it lies within the text's
           width and at most 5 lines above or below it */
        double R_[9]; fb_rodrigues(p, R_); double tX0 = X0, tX1 = X1, tY0 = Y0, tY1 = Y1;
        for (int c = 0; c < ncand; c++) {
            int best = 0; double bd = 1e18;
            for (int k = 0; k < np; k++) { double d = (du[k] - cu[c]) * (du[k] - cu[c]) + (dv[k] - cv[c]) * (dv[k] - cv[c]); if (d < bd) { bd = d; best = k; } }
            double X = p[m + best], Y = p[FB_G + spanOf[best]];
            if (!fb_unproject(R_, p + 3, p[6], p[7], cu[c], cv[c], &X, &Y)) continue;
            if (X < tX0 - pitch || X > tX1 + pitch || Y < tY0 - 5 * pitch || Y > tY1 + 5 * pitch) continue;
            if (X < X0) X0 = X; if (X > X1) X1 = X; if (Y < Y0) Y0 = Y; if (Y > Y1) Y1 = Y;
        }
    }
    double mx = fmax(1.5 * pitch, 0.05 * (X1 - X0)), my = fmax(1.5 * pitch, 0.04 * (Y1 - Y0));
    X0 -= mx; X1 += mx; Y0 -= my; Y1 += my;
    /* the photo's scale at the middle of the text (the larger of the two directions: nothing is lost) */
    double R_[9]; fb_rodrigues(p, R_); double xc = (X0 + X1) / 2, yc = (Y0 + Y1) / 2, e = 0.01 * (X1 - X0), u0, v0, u1, v1, u2, v2;
    fb_proj(R_, p + 3, p[6], p[7], xc, yc, &u0, &v0); fb_proj(R_, p + 3, p[6], p[7], xc + e, yc, &u1, &v1); fb_proj(R_, p + 3, p[6], p[7], xc, yc + e, &u2, &v2);
    double ppu = fmax(hypot(u1 - u0, v1 - v0), hypot(u2 - u0, v2 - v0)) / e; /* normalised units per model unit */
    for (int i = 0; i < 8; i++) rec[i] = (float)p[i];
    rec[8] = (float)X0; rec[9] = (float)Y0; rec[10] = (float)X1; rec[11] = (float)Y1; rec[12] = (float)FB_F; rec[13] = (float)ppu;
    rec[14] = (float)(sqrt(cost / (np + 1)) / px2norm); rec[15] = (float)ns; rec[16] = (float)ns0; rec[17] = (float)it; rec[18] = (float)side;
    rec[19] = (float)(sqrt(c0 / (np + 1)) / px2norm); rec[20] = (float)pitch; rec[21] = (float)nl; rec[22] = (float)nr; rec[23] = 0;
    free(p); free(spanOf); free(marg); free(du); free(dv); free(ys); free(st); free(en); free(gaps);
    return 1;
}

/*
 * The pages of a photo (RGBA, w × h; any size — it is made the size its letters need). mode: 0 find out, 1 one page,
 * 2 two pages. out (cap floats, at least 8 + 2 × FB_REC): [0] pages found (0, 1 or 2), [1..4] the gutter (x, y at the
 * top and at the bottom, in this picture's pixels) when two, [5] spans, [6] blobs, [7] the working scale, then a record
 * of FB_REC floats per page: rvec[3], tvec[3], α, β, X0, Y0, X1, Y1 (the flat page in model units), focal length, the
 * photo's scale at the text (normalised units per model unit: × half a photo's longer side = its pixels per unit), rms of
 * the fit (px of the working picture), spans, samples, iterations, side (0 the whole picture, 1 left, 2 right), rms before
 * the fit, line spacing (units).
 */
API int p_book_fit(const uint8_t *rgba, int w0, int h0, int mode, float *out, int cap) {
    for (int i = 0; i < cap; i++) out[i] = 0;
    if (cap < 8 + 2 * FB_REC || w0 < 16 || h0 < 16) return 0;
    uint8_t *g0 = fb_grey(rgba, w0 * h0);
    /* the working size: letters about FB_LETTER px tall (never larger than the picture; at least 320 px across) */
    double lh = fb_letter_height(g0, w0, h0), k = lh > 0 ? FB_LETTER / lh : 1;
    if (k > 1) k = 1; int L = w0 > h0 ? w0 : h0; if (k * L < 320) k = 320.0 / L; if (k > 1) k = 1;
    int w = (int)(w0 * k + 0.5), h = (int)(h0 * k + 0.5); if (w < 16) w = 16; if (h < 16) h = 16;
    uint8_t *g = (w == w0 && h == h0) ? g0 : fb_shrink(g0, w0, h0, w, h);
    out[7] = (float)k;
    /* the text mask, as page-dewarp: mean adaptive threshold 55 / 25, dilate 9 × 1, erode 1 × 3 */
    uint8_t *m = malloc((size_t)w * h);
    fb_ink(g, w, h, 55, 25, m); fb_morph(m, w, h, 9, 0, 1); fb_morph(m, w, h, 3, 1, 0);
    int32_t *pix = malloc(sizeof(int32_t) * (size_t)w * h); int capc = 100000; cm_comp *cs = malloc(sizeof(cm_comp) * capc);
    int nc = cm_label(m, w, h, pix, cs, capc);
    fb_blob *bl = malloc(sizeof(fb_blob) * (nc + 1)); int nb = 0;
    int *colc = malloc(sizeof(int) * (w + 1));
    for (int i = 0; i < nc; i++) {
        const cm_comp *c = &cs[i]; int bw = c->x1 - c->x0 + 1, bh = c->y1 - c->y0 + 1;
        if (bw < 15 || bh < 2 || bw < 1.5 * bh) continue;
        /* thicker than 10 px in some column: a picture or a rule, not a line of text */
        memset(colc, 0, sizeof(int) * bw); int thick = 0;
        for (int j = 0; j < c->n; j++) { int x = pix[c->off + j] % w - c->x0; if (++colc[x] > thick) thick = colc[x]; }
        if (thick > 10) continue;
        double sx = 0, sy = 0; for (int j = 0; j < c->n; j++) { int q = pix[c->off + j]; sx += q % w; sy += q / w; }
        double cx = sx / c->n, cy = sy / c->n, a = 0, b = 0, cc = 0;
        for (int j = 0; j < c->n; j++) { int q = pix[c->off + j]; double x = q % w - cx, y = q / w - cy; a += x * x; b += x * y; cc += y * y; }
        double th = 0.5 * atan2(2 * b, a - cc), tx = cos(th), ty = sin(th); if (tx < 0) { tx = -tx; ty = -ty; }
        double l0 = 1e9, l1 = -1e9;
        for (int j = 0; j < c->n; j++) { int q = pix[c->off + j]; double v = (q % w - cx) * tx + (q / w - cy) * ty; if (v < l0) l0 = v; if (v > l1) l1 = v; }
        fb_blob B = { c->x0, c->y0, c->x1, c->y1, c->off, c->n, cx, cy, tx, ty, atan2(ty, tx), l0, l1, cx + tx * l0, cy + ty * l0, cx + tx * l1, cy + ty * l1, -1, -1, 0 };
        bl[nb++] = B;
    }
    out[6] = (float)nb;
    /* the text's direction: the blobs' (pointing right), weighted by their length; a along it, b down */
    double dx = 0, dy = 0;
    for (int i = 0; i < nb; i++) { double l = bl[i].lx1 - bl[i].lx0; dx += bl[i].tx * l; dy += bl[i].ty * l; }
    { double n = hypot(dx, dy); if (n < 1e-12) { dx = 1; dy = 0; } else { dx /= n; dy /= n; } }
    double ex = -dy, ey = dx;
    double *A0 = malloc(sizeof(double) * (nb + 1)), *A1 = malloc(sizeof(double) * (nb + 1)), *Bm = malloc(sizeof(double) * (nb + 1)), *Ln = malloc(sizeof(double) * (nb + 1));
    for (int i = 0; i < nb; i++) {
        double a = bl[i].p0x * dx + bl[i].p0y * dy, c = bl[i].p1x * dx + bl[i].p1y * dy;
        A0[i] = fmin(a, c); A1[i] = fmax(a, c); Bm[i] = bl[i].cx * ex + bl[i].cy * ey; Ln[i] = bl[i].lx1 - bl[i].lx0;
    }
    /* the text's extent (the middle 96 % of the blobs' length along each axis: a stray blob of the table does not stretch it) */
    double xa = 0, xb = 0, ya = 0, yb = 0, total = 0;
    {
        double *ka = malloc(sizeof(double) * (nb + 1)), *kb = malloc(sizeof(double) * (nb + 1));
        for (int i = 0; i < nb; i++) { ka[i] = (A0[i] + A1[i]) / 2; kb[i] = Bm[i]; total += Ln[i]; }
        for (int pass = 0; pass < 2; pass++) {
            double *v = pass ? kb : ka; int *ix = malloc(sizeof(int) * (nb + 1)); for (int i = 0; i < nb; i++) ix[i] = i;
            for (int i = 1; i < nb; i++) { int t = ix[i], j = i - 1; while (j >= 0 && v[ix[j]] > v[t]) { ix[j + 1] = ix[j]; j--; } ix[j + 1] = t; }
            double acc = 0, lo = nb ? v[ix[0]] : 0, hi = nb ? v[ix[nb - 1]] : 0; int got = 0;
            for (int q = 0; q < nb; q++) { acc += Ln[ix[q]]; if (!got && acc >= 0.02 * total) { lo = v[ix[q]]; got = 1; } if (acc >= 0.98 * total) { hi = v[ix[q]]; break; } }
            if (pass) { ya = lo; yb = hi; } else { xa = lo; xb = hi; }
            free(ix);
        }
        free(ka); free(kb);
        /* along a, the extent reaches the blobs' ends */
        double ta = 1e9, tb = -1e9; for (int i = 0; i < nb; i++) if (Bm[i] >= ya && Bm[i] <= yb) { if (A0[i] < ta) ta = A0[i]; if (A1[i] > tb) tb = A1[i]; }
        if (ta < tb) { xa = ta; xb = tb; }
    }
    /* the gutter: in four bands down the text, the widest stretch no word blob covers, near the middle (found before the
       lines are chained: in a photo the gutter is often narrower than the 100 px a line may jump) */
    int *side = calloc(nb + 1, sizeof(int)); /* 0 the page, 1 left, 2 right, −1 left out */
    int two = 0; double ga = 0, gb = 0;
    int nbins = (int)(xb - xa) + 3; uint8_t *cov = malloc(nbins > 0 ? nbins : 1);
    if (nb >= 4 && nbins > 8) {
        const int NB = 4; double gx[4], gy[4], gwid[4]; int ng = 0;
        for (int band = 0; band < NB; band++) {
            double b0 = ya + (yb - ya) * band / NB, b1 = ya + (yb - ya) * (band + 1) / NB;
            memset(cov, 0, nbins); int any = 0;
            for (int i = 0; i < nb; i++) {
                if (Bm[i] < b0 || Bm[i] >= b1) continue; any = 1;
                int i0 = (int)floor(A0[i] - xa) + 1, i1 = (int)ceil(A1[i] - xa) + 1; if (i0 < 0) i0 = 0; if (i1 >= nbins) i1 = nbins - 1;
                for (int q = i0; q <= i1; q++) cov[q] = 1;
            }
            if (!any) continue;
            int best = -1, bestw = 0;
            for (int i = 0; i < nbins;) {
                if (cov[i]) { i++; continue; } int j = i; while (j < nbins && !cov[j]) j++;
                double rel = ((i + j) / 2.0 - 1) / (xb - xa + 1e-12);
                if (rel > 0.2 && rel < 0.8 && j - i > bestw) { bestw = j - i; best = i; }
                i = j;
            }
            if (best >= 0 && bestw >= 6) { gx[ng] = xa + best + bestw / 2.0 - 1; gy[ng] = (b0 + b1) / 2; gwid[ng] = bestw; ng++; }
        }
        if (mode != 1 && ng >= 2) {
            double sb = 0, sa = 0, sbb = 0, sab = 0; for (int i = 0; i < ng; i++) { sb += gy[i]; sa += gx[i]; sbb += gy[i] * gy[i]; sab += gx[i] * gy[i]; }
            double den = ng * sbb - sb * sb; gb = fabs(den) > 1e-12 ? (ng * sab - sa * sb) / den : 0; ga = (sa - gb * sb) / ng;
            /* each side holds a fair share of the text, the gaps agree (a straight gutter), and it is wider than the gap
               between two columns of one page (2 – 4 % of the text's width) */
            double left = 0, right = 0; for (int i = 0; i < nb; i++) { if (Bm[i] < ya || Bm[i] > yb) continue; if ((A0[i] + A1[i]) / 2 < ga + gb * Bm[i]) left += Ln[i]; else right += Ln[i]; }
            double worst = 0, narrow = 1e9; for (int i = 0; i < ng; i++) { double r = fabs(gx[i] - (ga + gb * gy[i])); if (r > worst) worst = r; if (gwid[i] < narrow) narrow = gwid[i]; }
            if (fabs(gb) < 0.35 && left >= 0.2 * (left + right) && right >= 0.2 * (left + right) && worst < 0.125 * (xb - xa) && narrow >= 0.04 * (xb - xa)) two = 1;
            if (mode == 2 && !two && left > 0 && right > 0) two = 1;
        }
    }
    if (two) {
        for (int i = 0; i < nb; i++) side[i] = (A0[i] + A1[i]) / 2 < ga + gb * Bm[i] ? 1 : 2;
        double half0 = (w0 > h0 ? w0 : h0) / 2.0, half = (w > h ? w : h) / 2.0; /* the gutter in the given picture's pixels, at the text's top and bottom */
        double a0 = ga + gb * ya, a1 = ga + gb * yb;
        double X0w = a0 * dx + ya * ex, Y0w = a0 * dy + ya * ey, X1w = a1 * dx + yb * ex, Y1w = a1 * dy + yb * ey;
        out[1] = (float)(((X0w + 0.5 - w / 2.0) / half) * half0 + w0 / 2.0 - 0.5); out[2] = (float)(((Y0w + 0.5 - h / 2.0) / half) * half0 + h0 / 2.0 - 0.5);
        out[3] = (float)(((X1w + 0.5 - w / 2.0) / half) * half0 + w0 / 2.0 - 0.5); out[4] = (float)(((Y1w + 0.5 - h / 2.0) / half) * half0 + h0 / 2.0 - 0.5);
    } else if (nbins > 8) {
        /* one page: a strip of the facing page at a side — the blobs beyond an empty stretch down the whole text that hold
           under a fifth of its length — is left out */
        memset(cov, 0, nbins);
        for (int i = 0; i < nb; i++) { if (Bm[i] < ya || Bm[i] > yb) continue; int i0 = (int)floor(A0[i] - xa) + 1, i1 = (int)ceil(A1[i] - xa) + 1; if (i0 < 0) i0 = 0; if (i1 >= nbins) i1 = nbins - 1; for (int q = i0; q <= i1; q++) cov[q] = 1; }
        for (int i = 1; i < nbins - 1;) {
            if (cov[i]) { i++; continue; } int j = i; while (j < nbins - 1 && !cov[j]) j++;
            if (j - i >= 10 && j < nbins - 1) {
                double cut = xa + (i + j) / 2.0 - 1, L2 = 0, R2 = 0;
                for (int q = 0; q < nb; q++) { if (Bm[q] < ya || Bm[q] > yb) continue; if ((A0[q] + A1[q]) / 2 < cut) L2 += Ln[q]; else R2 += Ln[q]; }
                int dropLeft = L2 > 0 && L2 < 0.2 * (L2 + R2), dropRight = R2 > 0 && R2 < 0.2 * (L2 + R2);
                for (int q = 0; q < nb; q++) { double mid = (A0[q] + A1[q]) / 2; if ((dropLeft && mid < cut) || (dropRight && mid >= cut)) side[q] = -1; }
            }
            i = j;
        }
    }
    free(cov);
    /* spans: candidate edges between blobs (sorted by their tops) of one side, the best first, linked left → right */
    {
        int *ord = malloc(sizeof(int) * (nb + 1)); for (int i = 0; i < nb; i++) ord[i] = i;
        for (int i = 1; i < nb; i++) { int t = ord[i], j = i - 1; while (j >= 0 && bl[ord[j]].y0 > bl[t].y0) { ord[j + 1] = ord[j]; j--; } ord[j + 1] = t; }
        fb_blob *sorted = malloc(sizeof(fb_blob) * (nb + 1)); int *sside = malloc(sizeof(int) * (nb + 1));
        for (int i = 0; i < nb; i++) { sorted[i] = bl[ord[i]]; sside[i] = side[ord[i]]; }
        memcpy(bl, sorted, sizeof(fb_blob) * nb); memcpy(side, sside, sizeof(int) * nb); free(sorted); free(sside); free(ord);
    }
    int ecap = 1 << 16, ne = 0; fb_edge *ed = malloc(sizeof(fb_edge) * ecap);
    for (int i = 0; i < nb; i++) for (int j = i - 1; j >= 0; j--) {
        if (bl[i].y0 - bl[j].y0 > 100 + 40) break; /* tops further apart than an edge can reach (blobs are at most 10 px thick in a column) */
        if (side[i] != side[j] || side[i] < 0) continue;
        const fb_blob *a = &bl[i], *b = &bl[j]; int ia = i, ib = j;
        if (a->p0x > b->p1x) { const fb_blob *t = a; a = b; b = t; ia = j; ib = i; }
        double ba0 = (b->p0x - a->cx) * a->tx + (b->p0y - a->cy) * a->ty, ba1 = (b->p1x - a->cx) * a->tx + (b->p1y - a->cy) * a->ty;
        double ab0 = (a->p0x - b->cx) * b->tx + (a->p0y - b->cy) * b->ty, ab1 = (a->p1x - b->cx) * b->tx + (a->p1y - b->cy) * b->ty;
        double ova = fmin(a->lx1, ba1) - fmax(a->lx0, ba0), ovb = fmin(b->lx1, ab1) - fmax(b->lx0, ab0);
        double oang = atan2(b->cy - a->cy, b->cx - a->cx);
        double da = fmax(fb_angdist(a->ang, oang), fb_angdist(b->ang, oang)) * 180 / M_PI;
        double dist = hypot(b->p0x - a->p1x, b->p0y - a->p1y);
        if (dist > 100 || fmax(ova, ovb) > 1.0 || da > 7.5) continue;
        if (ne == ecap) { ecap *= 2; ed = realloc(ed, sizeof(fb_edge) * ecap); }
        ed[ne].s = dist + da * 10; ed[ne].a = ia; ed[ne].b = ib; ne++;
    }
    qsort(ed, ne, sizeof(fb_edge), fb_cmp_edge);
    for (int e = 0; e < ne; e++) { fb_blob *a = &bl[ed[e].a], *b = &bl[ed[e].b]; if (a->succ < 0 && b->pred < 0) { a->succ = ed[e].b; b->pred = ed[e].a; } }
    /* the spans' samples: every 20 px of each blob, its mean row in that column; normalised (half the longer side = 1,
       pixel centres) */
    double half = (w > h ? w : h) / 2.0;
    int pcap = 4096, npts = 0, nsp = 0, scap = 512; double *pu = malloc(sizeof(double) * pcap), *pv = malloc(sizeof(double) * pcap); fb_span *sp = malloc(sizeof(fb_span) * scap);
    double *csum = malloc(sizeof(double) * (w + 1));
    uint8_t *inspan = calloc(nb + 1, 1); int *chain = malloc(sizeof(int) * (nb + 1));
    for (int i = 0; i < nb; i++) {
        if (bl[i].used || side[i] < 0) continue;
        int c = i, guard = 0; while (bl[c].pred >= 0 && guard++ < nb) c = bl[c].pred;
        int first = npts, nchain = 0; double width = 0; guard = 0;
        for (int d = c; d >= 0 && !bl[d].used && guard++ <= nb; d = bl[d].succ) {
            fb_blob *b = &bl[d]; b->used = 1; width += b->lx1 - b->lx0; chain[nchain++] = d;
            int bw = b->x1 - b->x0 + 1; memset(colc, 0, sizeof(int) * bw); memset(csum, 0, sizeof(double) * bw);
            for (int j = 0; j < b->n; j++) { int q = pix[b->off + j], x = q % w - b->x0; colc[x]++; csum[x] += q / w; }
            for (int x = ((bw - 1) % 20) / 2; x < bw; x += 20) {
                if (!colc[x]) continue;
                if (npts == pcap) { pcap *= 2; pu = realloc(pu, sizeof(double) * pcap); pv = realloc(pv, sizeof(double) * pcap); }
                pu[npts] = (b->x0 + x + 0.5 - w / 2.0) / half; pv[npts] = (csum[x] / colc[x] + 0.5 - h / 2.0) / half; npts++;
            }
        }
        if (width > 30 && npts - first >= 2) {
            if (nsp == scap) { scap *= 2; sp = realloc(sp, sizeof(fb_span) * scap); }
            const fb_blob *b0 = &bl[chain[0]], *b1 = &bl[chain[nchain - 1]];
            sp[nsp].u0 = (b0->p0x + 0.5 - w / 2.0) / half; sp[nsp].v0 = (b0->p0y + 0.5 - h / 2.0) / half;
            sp[nsp].u1 = (b1->p1x + 0.5 - w / 2.0) / half; sp[nsp].v1 = (b1->p1y + 0.5 - h / 2.0) / half;
            sp[nsp].first = first; sp[nsp].n = npts - first; sp[nsp].page = side[c]; nsp++;
            for (int q = 0; q < nchain; q++) inspan[chain[q]] = 1;
        } else npts = first;
    }
    out[5] = (float)nsp;
    /* the blobs in no line kept (a page number, a running head …): their ends, for the pages' extents */
    int ncand = 0; double *cu = malloc(sizeof(double) * 2 * (nb + 1)), *cv = malloc(sizeof(double) * 2 * (nb + 1));
    for (int i = 0; i < nb; i++) if (!inspan[i] && side[i] >= 0) {
        cu[ncand] = (bl[i].p0x + 0.5 - w / 2.0) / half; cv[ncand++] = (bl[i].p0y + 0.5 - h / 2.0) / half;
        cu[ncand] = (bl[i].p1x + 0.5 - w / 2.0) / half; cv[ncand++] = (bl[i].p1y + 0.5 - h / 2.0) / half;
    }
    int pages = 0;
    {
        int *which = malloc(sizeof(int) * (nsp + 1));
        for (int pg = two ? 1 : 0; pg <= (two ? 2 : 0); pg++) {
            int nw = 0; for (int q = 0; q < nsp; q++) if (sp[q].page == pg) which[nw++] = q;
            if (fb_fit_page(pu, pv, sp, which, nw, 1.0 / half, pg, cu, cv, ncand, out + 8 + FB_REC * pages)) pages++;
        }
        free(which);
    }
    out[0] = (float)pages;
    /* the samples, for tests and a picture of what was found (in normalised units: the same in any size of the photo) */
    free(fb_dbg); fb_dbg = malloc(sizeof(float) * 4 * (npts + 1)); fb_ndbg = 0;
    for (int q = 0; q < nsp; q++) for (int i = 0; i < sp[q].n; i++) { float *d = fb_dbg + 4 * fb_ndbg++; d[0] = (float)pu[sp[q].first + i]; d[1] = (float)pv[sp[q].first + i]; d[2] = (float)q; d[3] = (float)sp[q].page; }
    if (g != g0) free(g);
    free(g0); free(m); free(pix); free(cs); free(bl); free(colc); free(ed); free(pu); free(pv); free(sp); free(csum); free(inspan); free(chain); free(cu); free(cv); free(A0); free(A1); free(Bm); free(Ln); free(side);
    return pages;
}

/* Catmull-Rom weights for a fraction t */
static inline void fb_cubw(double t, double *wgt) {
    double t2 = t * t, t3 = t2 * t;
    wgt[0] = -0.5 * t3 + t2 - 0.5 * t; wgt[1] = 1.5 * t3 - 2.5 * t2 + 1; wgt[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; wgt[3] = 0.5 * t3 - 0.5 * t2;
}
/*
 * Draw a page (a record of p_book_fit) from the photo src (RGBA, sw × sh — the full photo; the model is in normalised units,
 * so any size of it) into dst (dw × dh): the model's points on a grid every 8 px, the places between them interpolated,
 * the photo sampled bicubically. What falls outside the photo is fill (0xAABBGGRR).
 */
API void p_book_render(const uint8_t *src, int sw, int sh, const float *rec, uint8_t *dst, int dw, int dh, uint32_t fill) {
    double R[9], r[3] = { rec[0], rec[1], rec[2] }, t[3] = { rec[3], rec[4], rec[5] }, a = rec[6], b = rec[7];
    fb_rodrigues(r, R);
    double X0 = rec[8], Y0 = rec[9], X1 = rec[10], Y1 = rec[11], half = (sw > sh ? sw : sh) / 2.0;
    const int G = 8; int gw = (dw + G - 1) / G + 1, gh = (dh + G - 1) / G + 1;
    float *gx = malloc(sizeof(float) * gw * gh), *gy = malloc(sizeof(float) * gw * gh);
    for (int j = 0; j < gh; j++) for (int i = 0; i < gw; i++) {
        double X = X0 + (i * G + 0.5) / dw * (X1 - X0), Y = Y0 + (j * G + 0.5) / dh * (Y1 - Y0), u, v;
        fb_proj(R, t, a, b, X, Y, &u, &v);
        gx[j * gw + i] = (float)(u * half + sw / 2.0 - 0.5); gy[j * gw + i] = (float)(v * half + sh / 2.0 - 0.5);
    }
    uint8_t fr = fill & 255, fg = (fill >> 8) & 255, fbl = (fill >> 16) & 255, fa = fill >> 24;
    for (int y = 0; y < dh; y++) {
        int j = y / G; double fy = (double)(y - j * G) / G;
        for (int x = 0; x < dw; x++) {
            int i = x / G; double fx = (double)(x - i * G) / G;
            const float *p00x = gx + j * gw + i, *p00y = gy + j * gw + i;
            double sx = (1 - fy) * ((1 - fx) * p00x[0] + fx * p00x[1]) + fy * ((1 - fx) * p00x[gw] + fx * p00x[gw + 1]);
            double sy = (1 - fy) * ((1 - fx) * p00y[0] + fx * p00y[1]) + fy * ((1 - fx) * p00y[gw] + fx * p00y[gw + 1]);
            uint8_t *o = dst + ((size_t)y * dw + x) * 4;
            if (!(sx >= -0.5 && sy >= -0.5 && sx <= sw - 0.5 && sy <= sh - 0.5)) { o[0] = fr; o[1] = fg; o[2] = fbl; o[3] = fa; continue; }
            int ix = (int)floor(sx), iy = (int)floor(sy); double wx[4], wy[4]; fb_cubw(sx - ix, wx); fb_cubw(sy - iy, wy);
            double acc[4] = { 0, 0, 0, 0 };
            for (int m = 0; m < 4; m++) {
                int yy = iy - 1 + m; yy = yy < 0 ? 0 : yy >= sh ? sh - 1 : yy;
                const uint8_t *row = src + (size_t)yy * sw * 4; double rowacc[4] = { 0, 0, 0, 0 };
                for (int n = 0; n < 4; n++) { int xx = ix - 1 + n; xx = xx < 0 ? 0 : xx >= sw ? sw - 1 : xx; const uint8_t *p = row + xx * 4; for (int c = 0; c < 4; c++) rowacc[c] += wx[n] * p[c]; }
                for (int c = 0; c < 4; c++) acc[c] += wy[m] * rowacc[c];
            }
            for (int c = 0; c < 4; c++) o[c] = u8((float)acc[c]);
        }
    }
    free(gx); free(gy);
}

/*
 * Where on a flat page (a record of p_book_fit) points of the photo lie: pts = n (x, y) pixel indices of a picture w × h of
 * the photo (any size) → out = n (fx, fy), the place across and down the page drawn by p_book_render (0 – 1 inside it).
 * A coarse search over the page, then Newton's method. NaN for a point the model does not reach.
 */
API void p_book_locate(const float *rec, int w, int h, const float *pts, int n, float *out) {
    double R[9], r[3] = { rec[0], rec[1], rec[2] }, t[3] = { rec[3], rec[4], rec[5] }, a = rec[6], b = rec[7];
    fb_rodrigues(r, R);
    double X0 = rec[8], Y0 = rec[9], X1 = rec[10], Y1 = rec[11], half = (w > h ? w : h) / 2.0;
    const int G = 33; double *gu = malloc(sizeof(double) * G * G), *gv = malloc(sizeof(double) * G * G);
    for (int j = 0; j < G; j++) for (int i = 0; i < G; i++) fb_proj(R, t, a, b, X0 + (X1 - X0) * i / (G - 1), Y0 + (Y1 - Y0) * j / (G - 1), &gu[j * G + i], &gv[j * G + i]);
    for (int k = 0; k < n; k++) {
        double u = (pts[2 * k] + 0.5 - w / 2.0) / half, v = (pts[2 * k + 1] + 0.5 - h / 2.0) / half;
        int best = 0; double bd = 1e18;
        for (int q = 0; q < G * G; q++) { double d = (gu[q] - u) * (gu[q] - u) + (gv[q] - v) * (gv[q] - v); if (d < bd) { bd = d; best = q; } }
        double X = X0 + (X1 - X0) * (best % G) / (G - 1), Y = Y0 + (Y1 - Y0) * (best / G) / (G - 1);
        if (fb_unproject(R, t, a, b, u, v, &X, &Y)) { out[2 * k] = (float)((X - X0) / (X1 - X0)); out[2 * k + 1] = (float)((Y - Y0) / (Y1 - Y0)); }
        else out[2 * k] = out[2 * k + 1] = NAN;
    }
    free(gu); free(gv);
}
