// Delaunay triangulation of points in the plane — for Graphviz, in place of the GTS library.
//
// Graphviz takes its triangulations from GTS (LGPL, needs GLib): the prism overlap removal (overlap=prism, and
// overlap=false where a triangulation is there; sfdp's default) and sfdp's smoothing are built on one. No
// WebAssembly build of Graphviz has it — GLib is a large thing to bring to wasm32 — so sfdp printed "remove_overlap:
// Graphviz not built with triangulation library" for every drawing and left the nodes overlapping.
//
// This file is a C port of Delaunator 5.1.0 (Volodymyr Agafonkin / Mapbox, ISC licence: a sweep-hull triangulation,
// the one behind d3-delaunay) with the orientation test of robust-predicates 3.0.3 (Unlicense; Jonathan Shewchuk's
// adaptive-precision orient2d). It follows the JavaScript step by step — same seed triangle, same sort, same edge
// flips — so that for every input the arrays that come out are the ones the original makes
// (tests/unit/graphviz.test.mjs holds it to the npm package, and checks the triangulations with exact arithmetic).
// Two deliberate differences, both where the original would index an array with NaN or -1: a point that sits exactly
// on the centre of the seed circle has no angle and is looked up in bucket 0, and a hash table without a live entry
// makes the hull search start at the hull's first point (any starting point is correct, the table only saves time).
//
// Everything is static: the file is included by Graphviz's lib/neatogen/delaunay.c (wasm/graphviz/triangulation.patch).
#pragma once
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifdef __clang__
#pragma STDC FP_CONTRACT OFF   // the predicates rely on every operation being rounded on its own
#endif

typedef struct {
  int ntriangles;        // triangles[3 * t .. 3 * t + 2] = the corners of triangle t (indices of points)
  uint32_t *triangles;
  int32_t *halfedges;    // halfedges[e] = the same edge seen from the neighbouring triangle, or -1 on the hull
  int nhull;             // the convex hull — or, when all points lie on one line, the points in order along it
  uint32_t *hull;
} st_tri_t;

static void st_tri_free(st_tri_t *t) { free(t->triangles); free(t->halfedges); free(t->hull); memset(t, 0, sizeof *t); }

// ---- robust-predicates: orient2d -------------------------------------------------------------------------------------
#define ST_EPS 1.1102230246251565e-16
#define ST_SPLITTER 134217729.0
static const double st_resulterrbound = (3 + 8 * ST_EPS) * ST_EPS;
static const double st_ccwerrboundA = (3 + 16 * ST_EPS) * ST_EPS;
static const double st_ccwerrboundB = (2 + 12 * ST_EPS) * ST_EPS;
static const double st_ccwerrboundC = (9 + 64 * ST_EPS) * ST_EPS * ST_EPS;

// fast_expansion_sum_zeroelim
static int st_sum(int elen, const double *e, int flen, const double *f, double *h) {
  double Q, Qnew, hh, bvirt;
  int eindex = 0, findex = 0, hindex = 0;
  double enow = e[0], fnow = f[0];
#define ST_ENEXT() (enow = ++eindex < elen ? e[eindex] : 0)
#define ST_FNEXT() (fnow = ++findex < flen ? f[findex] : 0)
  if ((fnow > enow) == (fnow > -enow)) { Q = enow; ST_ENEXT(); } else { Q = fnow; ST_FNEXT(); }
  if (eindex < elen && findex < flen) {
    if ((fnow > enow) == (fnow > -enow)) { Qnew = enow + Q; hh = Q - (Qnew - enow); ST_ENEXT(); }
    else { Qnew = fnow + Q; hh = Q - (Qnew - fnow); ST_FNEXT(); }
    Q = Qnew;
    if (hh != 0) h[hindex++] = hh;
    while (eindex < elen && findex < flen) {
      if ((fnow > enow) == (fnow > -enow)) { Qnew = Q + enow; bvirt = Qnew - Q; hh = Q - (Qnew - bvirt) + (enow - bvirt); ST_ENEXT(); }
      else { Qnew = Q + fnow; bvirt = Qnew - Q; hh = Q - (Qnew - bvirt) + (fnow - bvirt); ST_FNEXT(); }
      Q = Qnew;
      if (hh != 0) h[hindex++] = hh;
    }
  }
  while (eindex < elen) { Qnew = Q + enow; bvirt = Qnew - Q; hh = Q - (Qnew - bvirt) + (enow - bvirt); ST_ENEXT(); Q = Qnew; if (hh != 0) h[hindex++] = hh; }
  while (findex < flen) { Qnew = Q + fnow; bvirt = Qnew - Q; hh = Q - (Qnew - bvirt) + (fnow - bvirt); ST_FNEXT(); Q = Qnew; if (hh != 0) h[hindex++] = hh; }
  if (Q != 0 || hindex == 0) h[hindex++] = Q;
#undef ST_ENEXT
#undef ST_FNEXT
  return hindex;
}
// (a × b) − (c × d) as an expansion of four doubles: the "Two_Product, Two_Product, Two_Two_Diff" of the original
static void st_cross(double a, double b, double c2, double d, double *out) {
  double bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;
  s1 = a * b; c = ST_SPLITTER * a; ahi = c - (c - a); alo = a - ahi; c = ST_SPLITTER * b; bhi = c - (c - b); blo = b - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = c2 * d; c = ST_SPLITTER * c2; ahi = c - (c - c2); alo = c2 - ahi; c = ST_SPLITTER * d; bhi = c - (c - d); blo = d - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0; bvirt = s0 - _i; out[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i; bvirt = _j - s1; _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1; bvirt = _0 - _i; out[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i; bvirt = u3 - _j; out[2] = _j - (u3 - bvirt) + (_i - bvirt);
  out[3] = u3;
}
static double st_orient2dadapt(double ax, double ay, double bx, double by, double cx, double cy, double detsum) {
  double B[4], C1[8], C2[12], D[16], u[4];
  double acxtail, acytail, bcxtail, bcytail, bvirt;
  const double acx = ax - cx, bcx = bx - cx, acy = ay - cy, bcy = by - cy;
  st_cross(acx, bcy, acy, bcx, B);
  double det = B[0] + B[1] + B[2] + B[3];          // estimate(4, B): summed in this order
  double errbound = st_ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) return det;
  bvirt = ax - acx; acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx; bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy; acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy; bcytail = by - (bcy + bvirt) + (bvirt - cy);
  if (acxtail == 0 && acytail == 0 && bcxtail == 0 && bcytail == 0) return det;
  errbound = st_ccwerrboundC * detsum + st_resulterrbound * fabs(det);
  det += (acx * bcytail + bcy * acxtail) - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;
  st_cross(acxtail, bcy, acytail, bcx, u);
  const int C1len = st_sum(4, B, 4, u, C1);
  st_cross(acx, bcytail, acy, bcxtail, u);
  const int C2len = st_sum(C1len, C1, 4, u, C2);
  st_cross(acxtail, bcytail, acytail, bcxtail, u);
  const int Dlen = st_sum(C2len, C2, 4, u, D);
  return D[Dlen - 1];
}
/** < 0 when a, b, c turn counter-clockwise with y pointing up; 0 when they lie on one line — exactly. */
static double st_orient2d(double ax, double ay, double bx, double by, double cx, double cy) {
  const double detleft = (ay - cy) * (bx - cx), detright = (ax - cx) * (by - cy), det = detleft - detright;
  const double detsum = fabs(detleft + detright);
  if (fabs(det) >= st_ccwerrboundA * detsum) return det;
  return -st_orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}

// ---- Delaunator ------------------------------------------------------------------------------------------------------
typedef struct {
  const double *coords; int n;
  uint32_t *triangles; int32_t *halfedges; int trianglesLen;
  int hashSize; uint32_t *hullPrev, *hullNext, *hullTri; int32_t *hullHash;
  uint32_t *ids; double *dists;
  double cx, cy; uint32_t hullStart;
} st_del;

static double st_pseudoAngle(double dx, double dy) { const double p = dx / (fabs(dx) + fabs(dy)); return (dy > 0 ? 3 - p : 1 + p) / 4; }
static double st_dist(double ax, double ay, double bx, double by) { const double dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
static int st_inCircle(double ax, double ay, double bx, double by, double cx, double cy, double px, double py) {
  const double dx = ax - px, dy = ay - py, ex = bx - px, ey = by - py, fx = cx - px, fy = cy - py;
  const double ap = dx * dx + dy * dy, bp = ex * ex + ey * ey, cp = fx * fx + fy * fy;
  return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
}
static double st_circumradius(double ax, double ay, double bx, double by, double cx, double cy) {
  const double dx = bx - ax, dy = by - ay, ex = cx - ax, ey = cy - ay;
  const double bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, d = 0.5 / (dx * ey - dy * ex);
  const double x = (ey * bl - dy * cl) * d, y = (dx * cl - ex * bl) * d;
  return x * x + y * y;
}
static void st_circumcenter(double ax, double ay, double bx, double by, double cx, double cy, double *ox, double *oy) {
  const double dx = bx - ax, dy = by - ay, ex = cx - ax, ey = cy - ay;
  const double bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, d = 0.5 / (dx * ey - dy * ex);
  *ox = ax + (ey * bl - dy * cl) * d; *oy = ay + (dx * cl - ex * bl) * d;
}
static void st_swap(uint32_t *arr, int i, int j) { const uint32_t tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; }
static void st_quicksort(uint32_t *ids, const double *dists, int left, int right) {
  if (right - left <= 20) {
    for (int i = left + 1; i <= right; i++) {
      const uint32_t temp = ids[i]; const double tempDist = dists[temp];
      int j = i - 1;
      while (j >= left && dists[ids[j]] > tempDist) { ids[j + 1] = ids[j]; j--; }
      ids[j + 1] = temp;
    }
  } else {
    const int median = (left + right) >> 1;
    int i = left + 1, j = right;
    st_swap(ids, median, i);
    if (dists[ids[left]] > dists[ids[right]]) st_swap(ids, left, right);
    if (dists[ids[i]] > dists[ids[right]]) st_swap(ids, i, right);
    if (dists[ids[left]] > dists[ids[i]]) st_swap(ids, left, i);
    const uint32_t temp = ids[i]; const double tempDist = dists[temp];
    for (;;) {
      do i++; while (dists[ids[i]] < tempDist);
      do j--; while (dists[ids[j]] > tempDist);
      if (j < i) break;
      st_swap(ids, i, j);
    }
    ids[left + 1] = ids[j]; ids[j] = temp;
    if (right - i + 1 >= j - left) { st_quicksort(ids, dists, i, right); st_quicksort(ids, dists, left, j - 1); }
    else { st_quicksort(ids, dists, left, j - 1); st_quicksort(ids, dists, i, right); }
  }
}
static int st_hashKey(const st_del *d, double x, double y) {
  const double a = st_pseudoAngle(x - d->cx, y - d->cy);
  if (!(a >= 0)) return 0;                              // the point is the centre itself: no angle (see the top)
  return (int)fmod(floor(a * d->hashSize), d->hashSize);
}
static void st_link(st_del *d, int a, int b) { d->halfedges[a] = b; if (b != -1) d->halfedges[b] = a; }
static int st_addTriangle(st_del *d, uint32_t i0, uint32_t i1, uint32_t i2, int a, int b, int c) {
  const int t = d->trianglesLen;
  d->triangles[t] = i0; d->triangles[t + 1] = i1; d->triangles[t + 2] = i2;
  st_link(d, t, a); st_link(d, t + 1, b); st_link(d, t + 2, c);
  d->trianglesLen += 3;
  return t;
}
#define ST_EDGE_STACK 512
static int st_legalize(st_del *d, int a) {
  uint32_t *triangles = d->triangles; int32_t *halfedges = d->halfedges; const double *coords = d->coords;
  int stack[ST_EDGE_STACK], i = 0, ar = 0;
  for (;;) {
    const int b = halfedges[a];
    const int a0 = a - a % 3;
    ar = a0 + (a + 2) % 3;
    if (b == -1) { if (i == 0) break; a = stack[--i]; continue; }           // an edge of the hull
    const int b0 = b - b % 3, al = a0 + (a + 1) % 3, bl = b0 + (b + 2) % 3;
    const uint32_t p0 = triangles[ar], pr = triangles[a], pl = triangles[al], p1 = triangles[bl];
    const int illegal = st_inCircle(coords[2 * p0], coords[2 * p0 + 1], coords[2 * pr], coords[2 * pr + 1], coords[2 * pl], coords[2 * pl + 1], coords[2 * p1], coords[2 * p1 + 1]);
    if (illegal) {
      triangles[a] = p1; triangles[b] = p0;
      const int hbl = halfedges[bl];
      if (hbl == -1) {            // the edge flipped lies on the other side of the hull (rare): repair its reference
        uint32_t e = d->hullStart;
        do { if ((int)d->hullTri[e] == bl) { d->hullTri[e] = (uint32_t)a; break; } e = d->hullPrev[e]; } while (e != d->hullStart);
      }
      st_link(d, a, hbl); st_link(d, b, halfedges[ar]); st_link(d, ar, bl);
      const int br = b0 + (b + 1) % 3;
      if (i < ST_EDGE_STACK) stack[i++] = br;
    } else { if (i == 0) break; a = stack[--i]; }
  }
  return ar;
}
/** Triangulate n points given as x0 y0 x1 y1 …; 0 when the memory ran out (out is then empty). Free with st_tri_free. */
static int st_delaunay(const double *coords, int n, st_tri_t *out) {
  memset(out, 0, sizeof *out);
  if (n <= 0) return 1;
  st_del d; memset(&d, 0, sizeof d);
  d.coords = coords; d.n = n;
  const int maxTriangles = 2 * n - 5 > 0 ? 2 * n - 5 : 0;
  d.hashSize = (int)ceil(sqrt((double)n));
  d.triangles = calloc((size_t)maxTriangles * 3 + 1, sizeof(uint32_t));
  d.halfedges = calloc((size_t)maxTriangles * 3 + 1, sizeof(int32_t));
  d.hullPrev = calloc((size_t)n, sizeof(uint32_t)); d.hullNext = calloc((size_t)n, sizeof(uint32_t)); d.hullTri = calloc((size_t)n, sizeof(uint32_t));
  d.hullHash = calloc((size_t)d.hashSize, sizeof(int32_t));
  d.ids = calloc((size_t)n, sizeof(uint32_t)); d.dists = calloc((size_t)n, sizeof(double));
  int ok = 0;
  if (!d.triangles || !d.halfedges || !d.hullPrev || !d.hullNext || !d.hullTri || !d.hullHash || !d.ids || !d.dists) goto done;
  uint32_t *hullPrev = d.hullPrev, *hullNext = d.hullNext, *hullTri = d.hullTri; int32_t *hullHash = d.hullHash;

  double minX = INFINITY, minY = INFINITY, maxX = -INFINITY, maxY = -INFINITY;
  for (int i = 0; i < n; i++) {
    const double x = coords[2 * i], y = coords[2 * i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    d.ids[i] = (uint32_t)i;
  }
  const double bx = (minX + maxX) / 2, by = (minY + maxY) / 2;
  int i0 = 0, i1 = 0, i2 = 0;
  double minDist = INFINITY;
  for (int i = 0; i < n; i++) {                       // a seed point close to the centre
    const double ds = st_dist(bx, by, coords[2 * i], coords[2 * i + 1]);
    if (ds < minDist) { i0 = i; minDist = ds; }
  }
  const double i0x = coords[2 * i0], i0y = coords[2 * i0 + 1];
  minDist = INFINITY;
  for (int i = 0; i < n; i++) {                       // the point closest to the seed
    if (i == i0) continue;
    const double ds = st_dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]);
    if (ds < minDist && ds > 0) { i1 = i; minDist = ds; }
  }
  double i1x = coords[2 * i1], i1y = coords[2 * i1 + 1];
  double minRadius = INFINITY;
  for (int i = 0; i < n; i++) {                       // the third point: smallest circle through the three
    if (i == i0 || i == i1) continue;
    const double r = st_circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);
    if (r < minRadius) { i2 = i; minRadius = r; }
  }
  double i2x = coords[2 * i2], i2y = coords[2 * i2 + 1];

  if (minRadius == INFINITY) {
    // all points on one line: order them along it (by x, or by y when every x is the same) and return that as the hull
    for (int i = 0; i < n; i++) { const double dx = coords[2 * i] - coords[0]; d.dists[i] = dx != 0 && dx == dx ? dx : coords[2 * i + 1] - coords[1]; }
    st_quicksort(d.ids, d.dists, 0, n - 1);
    out->hull = calloc((size_t)n, sizeof(uint32_t));
    if (!out->hull) goto done;
    int j = 0; double d0 = -INFINITY;
    for (int i = 0; i < n; i++) { const uint32_t id = d.ids[i]; const double ds = d.dists[id]; if (ds > d0) { out->hull[j++] = id; d0 = ds; } }
    out->nhull = j;
    ok = 1; goto done;
  }
  if (st_orient2d(i0x, i0y, i1x, i1y, i2x, i2y) < 0) {   // counter-clockwise seed triangle
    const int i = i1; const double x = i1x, y = i1y;
    i1 = i2; i1x = i2x; i1y = i2y; i2 = i; i2x = x; i2y = y;
  }
  st_circumcenter(i0x, i0y, i1x, i1y, i2x, i2y, &d.cx, &d.cy);
  for (int i = 0; i < n; i++) d.dists[i] = st_dist(coords[2 * i], coords[2 * i + 1], d.cx, d.cy);
  st_quicksort(d.ids, d.dists, 0, n - 1);                 // by distance from the centre of the seed circle

  d.hullStart = (uint32_t)i0;
  int hullSize = 3;
  hullNext[i0] = hullPrev[i2] = (uint32_t)i1;
  hullNext[i1] = hullPrev[i0] = (uint32_t)i2;
  hullNext[i2] = hullPrev[i1] = (uint32_t)i0;
  hullTri[i0] = 0; hullTri[i1] = 1; hullTri[i2] = 2;
  for (int i = 0; i < d.hashSize; i++) hullHash[i] = -1;
  hullHash[st_hashKey(&d, i0x, i0y)] = i0;
  hullHash[st_hashKey(&d, i1x, i1y)] = i1;
  hullHash[st_hashKey(&d, i2x, i2y)] = i2;
  d.trianglesLen = 0;
  st_addTriangle(&d, (uint32_t)i0, (uint32_t)i1, (uint32_t)i2, -1, -1, -1);

  double xp = 0, yp = 0;
  for (int k = 0; k < n; k++) {
    const int i = (int)d.ids[k];
    const double x = coords[2 * i], y = coords[2 * i + 1];
    if (k > 0 && fabs(x - xp) <= 0x1p-52 && fabs(y - yp) <= 0x1p-52) continue;   // a (near-)duplicate of the point before
    xp = x; yp = y;
    if (i == i0 || i == i1 || i == i2) continue;

    int start = 0;                                        // an edge of the hull the point can see, through the hash
    for (int j = 0, key = st_hashKey(&d, x, y); j < d.hashSize; j++) {
      start = hullHash[(key + j) % d.hashSize];
      if (start != -1 && (uint32_t)start != hullNext[start]) break;
    }
    if (start < 0 || (uint32_t)start == hullNext[start]) start = (int)d.hullStart;   // no live entry in the table: any hull point will do
    start = (int)hullPrev[start];
    int e = start, q;
    while (q = (int)hullNext[e], st_orient2d(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1]) >= 0) {
      e = q;
      if (e == start) { e = -1; break; }
    }
    if (e == -1) continue;                                // most likely a near-duplicate: leave it out

    int t = st_addTriangle(&d, (uint32_t)e, (uint32_t)i, hullNext[e], -1, -1, (int)hullTri[e]);
    hullTri[i] = (uint32_t)st_legalize(&d, t + 2);
    hullTri[e] = (uint32_t)t;
    hullSize++;

    int nn = (int)hullNext[e];                            // forward along the hull
    while (q = (int)hullNext[nn], st_orient2d(x, y, coords[2 * nn], coords[2 * nn + 1], coords[2 * q], coords[2 * q + 1]) < 0) {
      t = st_addTriangle(&d, (uint32_t)nn, (uint32_t)i, (uint32_t)q, (int)hullTri[i], -1, (int)hullTri[nn]);
      hullTri[i] = (uint32_t)st_legalize(&d, t + 2);
      hullNext[nn] = (uint32_t)nn;                        // marked as removed
      hullSize--;
      nn = q;
    }
    if (e == start) {                                     // and backward from the other side
      while (q = (int)hullPrev[e], st_orient2d(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1]) < 0) {
        t = st_addTriangle(&d, (uint32_t)q, (uint32_t)i, (uint32_t)e, -1, (int)hullTri[e], (int)hullTri[q]);
        st_legalize(&d, t + 2);
        hullTri[q] = (uint32_t)t;
        hullNext[e] = (uint32_t)e;
        hullSize--;
        e = q;
      }
    }
    d.hullStart = hullPrev[i] = (uint32_t)e;
    hullNext[e] = hullPrev[nn] = (uint32_t)i;
    hullNext[i] = (uint32_t)nn;
    hullHash[st_hashKey(&d, x, y)] = i;
    hullHash[st_hashKey(&d, coords[2 * e], coords[2 * e + 1])] = e;
  }
  out->hull = calloc((size_t)hullSize, sizeof(uint32_t));
  if (!out->hull) goto done;
  out->nhull = hullSize;
  for (uint32_t i = 0, e = d.hullStart; i < (uint32_t)hullSize; i++) { out->hull[i] = e; e = hullNext[e]; }
  out->ntriangles = d.trianglesLen / 3;
  out->triangles = d.triangles; out->halfedges = d.halfedges; d.triangles = NULL; d.halfedges = NULL;
  ok = 1;
done:
  free(d.triangles); free(d.halfedges); free(d.hullPrev); free(d.hullNext); free(d.hullTri); free(d.hullHash); free(d.ids); free(d.dists);
  if (!ok) st_tri_free(out);
  return ok;
}
