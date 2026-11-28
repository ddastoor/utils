// Wrapper for imgproc.wasm (own C: wasm/imgproc/imgproc.c). `bindImgproc` is environment-neutral (Node tests);
// `imgproc()` runs it in a Web Worker so heavy filters never freeze the page.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/imgproc.wasm?url';
import { onLeave, trackWorker } from '../lifecycle';

export interface Img { data: Uint8ClampedArray; width: number; height: number }
/** A list mark p_clear_marks cleared (to-do #31): its ink's box on the picture and what it was (MARK). */
export interface ListMark { x0: number; y0: number; x1: number; y1: number; kind: number }
export const MARK = { DOT: 1, RING: 2, SQUARE: 3, DIAMOND: 4, TRIANGLE: 5, BOX: 6, TICKED: 7, CROSSED: 8, RADIO: 9 } as const;
/** At most this many marks are listed (a page of lists has a few dozen). */
export const MAX_MARKS = 1024;
export interface Adjust { bright?: number; contrast?: number; exposure?: number; gamma?: number; sat?: number; vib?: number; hue?: number; temp?: number; tint?: number; highlights?: number; shadows?: number }

export function bindImgproc(e: any) {
  const mem = () => e.memory.buffer as ArrayBuffer;
  const put = (d: ArrayLike<number>) => { const p = e.p_malloc(d.length); new Uint8Array(mem(), p, d.length).set(d as any); return p; };
  const take = (p: number, n: number) => new Uint8ClampedArray(mem().slice(p, p + n));
  /** Copy image in, run f(ptr), copy result out (same size). */
  const inplace = (img: Img, f: (p: number) => void): Img => {
    const p = put(img.data);
    try { f(p); return { data: take(p, img.data.length), width: img.width, height: img.height }; } finally { e.p_free(p); }
  };
  const into = (img: Img, w: number, h: number, f: (src: number, dst: number) => void): Img => {
    const s = put(img.data), d = e.p_malloc(w * h * 4);
    try { f(s, d); return { data: take(d, w * h * 4), width: w, height: h }; } finally { e.p_free(s); e.p_free(d); }
  };
  const n = (img: Img) => img.width * img.height;
  return {
    adjust: (img: Img, a: Adjust) => inplace(img, (p) => e.p_adjust(p, n(img), a.bright ?? 0, a.contrast ?? 0, a.exposure ?? 0, a.gamma ?? 1, a.sat ?? 0, a.vib ?? 0, a.hue ?? 0, a.temp ?? 0, a.tint ?? 0, a.highlights ?? 0, a.shadows ?? 0)),
    grayscale: (img: Img) => inplace(img, (p) => e.p_grayscale(p, n(img))),
    /** Boxes {x, y, w, h} of ink (luma < thr) outside the `skip` boxes, dilated by `dil` px, area ≥ minArea. */
    /** Regions of ink (darker than `thr`) after a dilation of `dil` px, at least `minArea` px²; the boxes of `skip` — each
     *  [x, y, width, height] in px, not two corners — are left out (the lines of text, when looking for figures). */
    inkRegions(img: Img, skip: Array<[number, number, number, number]>, o: { thr?: number; dil?: number; minArea?: number; max?: number } = {}) {
      const max = o.max ?? 256, s = put(img.data), k = e.p_malloc(Math.max(1, skip.length) * 16), out = e.p_malloc(max * 16);
      try {
        new Float32Array(mem(), k, skip.length * 4).set(skip.flat());
        const c = e.p_ink_regions(s, img.width, img.height, o.thr ?? 200, k, skip.length, o.dil ?? 6, o.minArea ?? 900, out, max);
        const r = new Int32Array(mem(), out, c * 4);
        return Array.from({ length: c }, (_, i) => ({ x: r[i * 4], y: r[i * 4 + 1], w: r[i * 4 + 2], h: r[i * 4 + 3] }));
      } finally { e.p_free(s); e.p_free(k); e.p_free(out); }
    },
    /** PDF for Kindle: the rows y0 … y1 − 1 of a drawing of a page, seen between columns x0 … x1 − 1, where a piece may end
     *  — 1: no pixel darker than `thr` there and outside every protected interval ([top, bottom) rows: a line's letters,
     *  a figure, a formula). wasm/imgproc/kindle.c. */
    blankRows(img: Img, x0: number, y0: number, x1: number, y1: number, thr: number, prot: Array<[number, number]>): Uint8Array {
      const s = put(img.data), k = e.p_malloc(Math.max(1, prot.length) * 8), h = Math.max(0, Math.min(img.height, Math.round(y1)) - Math.max(0, Math.round(y0))), out = e.p_malloc(Math.max(1, h));
      try {
        new Float32Array(mem(), k, prot.length * 2).set(prot.flat());
        const c = e.p_blank_rows(s, img.width, img.height, Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), thr, k, prot.length, out);
        return new Uint8Array(mem().slice(out, out + Math.max(0, c)));
      } finally { e.p_free(s); e.p_free(k); e.p_free(out); }
    },
    /** PDF for Kindle: where the piece that starts at row `from` of a region (its rows from blankRows) ends, at most `maxh`
     *  rows further — the lowest gap of `wide` rows or more past `minfill` of the room (a paragraph's end), else the lowest
     *  gap — `cut` (n: the rest fits), or −1 with `over`, where a piece too tall for a screen ends (−1: the end). */
    nextCut(blank: Uint8Array, from: number, maxh: number, minfill: number, wide: number): { cut: number; over: number } {
      const b = put(blank), o = e.p_malloc(4);
      try { const cut = e.p_next_cut(b, blank.length, Math.round(from), Math.max(1, Math.floor(maxh)), minfill, Math.max(1, Math.round(wide)), o); return { cut, over: new Int32Array(mem(), o, 1)[0] }; } finally { e.p_free(b); e.p_free(o); }
    },
    /** Grey / grey+alpha / RGB / RGBA samples (e.g. a MuPDF pixmap) → RGBA image. */
    expand: (samples: Uint8Array | Uint8ClampedArray, w: number, h: number, comps: number): Img => {
      const s = put(samples), d = e.p_malloc(w * h * 4);
      try { e.p_expand(s, w * h, comps, d); return { data: take(d, w * h * 4), width: w, height: h }; } finally { e.p_free(s); e.p_free(d); }
    },
    invert: (img: Img) => inplace(img, (p) => e.p_invert(p, n(img))),
    resize: (img: Img, w: number, h: number) => into(img, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), (s, d) => e.p_resize(s, img.width, img.height, d, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))),
    /** OpenCV's INTER_AREA (the mean of the covered pixels) — what the Doc Scanner's page model was trained on. Opaque pictures. */
    resizeArea: (img: Img, w: number, h: number) => into(img, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), (s, d) => e.p_resize_area(s, img.width, img.height, d, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))),
    /** Lossless EXIF-style orientation transform (1–8): 2 flip H, 3 180°, 4 flip V, 5 transpose, 6 90° CW, 7 transverse, 8 90° CCW. */
    orient: (img: Img, o: number): Img => (o >= 2 && o <= 8 ? into(img, o >= 5 ? img.height : img.width, o >= 5 ? img.width : img.height, (s, d) => e.p_orient(s, img.width, img.height, d, o)) : img),
    /** Exact pixel crop (clamped to the image). */
    crop(img: Img, x: number, y: number, w: number, h: number): Img {
      x = Math.min(img.width - 1, Math.max(0, Math.round(x))); y = Math.min(img.height - 1, Math.max(0, Math.round(y)));
      w = Math.max(1, Math.min(img.width - x, Math.round(w))); h = Math.max(1, Math.min(img.height - y, Math.round(h)));
      return into(img, w, h, (s, d) => e.p_crop(s, img.width, img.height, d, x, y, w, h));
    },
    /** Bounding box {x,y,w,h} of pixels whose alpha > thr (w = 0 if fully transparent). */
    alphaBBox(img: Img, thr = 8) { const s = put(img.data), o = e.p_malloc(16); try { e.p_alpha_bbox(s, img.width, img.height, thr, o); const r = new Int32Array(mem(), o, 4); return { x: r[0], y: r[1], w: r[2], h: r[3] }; } finally { e.p_free(s); e.p_free(o); } },
    /** Photo of ink on paper → transparent ink (colour rgb 0xRRGGBB, or keep the ink's own colour). */
    inkToAlpha: (img: Img, rgb = 0x0b2a8a, keepColor = false, strength = 1) => inplace(img, (p) => e.p_ink_to_alpha(p, img.width, img.height, rgb >>> 0, keepColor ? 1 : 0, strength)),
    /** Solid fill (r, g, b, a 0–255). */
    fillRect: (img: Img, x: number, y: number, w: number, h: number, rgba: [number, number, number, number] = [0, 0, 0, 255]) =>
      inplace(img, (p) => e.p_fill_rect(p, img.width, img.height, x | 0, y | 0, Math.ceil(w), Math.ceil(h), ((rgba[3] << 24) | (rgba[2] << 16) | (rgba[1] << 8) | rgba[0]) >>> 0)),
    /** Non-maximum suppression over [x, y, w, h, score] boxes → indices kept (highest score first). */
    nms(boxes: number[][], iou = 0.3, contain = 0.7): number[] {
      const n = boxes.length, bp = e.p_malloc(Math.max(1, n) * 20), kp = e.p_malloc(Math.max(1, n) * 4);
      try { new Float32Array(mem(), bp, n * 5).set(boxes.flatMap((b) => b.slice(0, 5))); const k = e.p_nms(bp, n, iou, contain, kp); return Array.from(new Int32Array(mem(), kp, k)); }
      finally { e.p_free(bp); e.p_free(kp); }
    },
    blur: (img: Img, sigma: number) => inplace(img, (p) => e.p_blur(p, img.width, img.height, sigma)),
    sharpen: (img: Img, amount: number, sigma = 1.2) => inplace(img, (p) => e.p_sharpen(p, img.width, img.height, amount, sigma)),
    /** Rotate by any angle into a w×h canvas (default: same size → crops corners). fill = 0xAABBGGRR little-endian RGBA. */
    rotate: (img: Img, deg: number, w = img.width, h = img.height, fill = 0) => into(img, w, h, (s, d) => e.p_rotate(s, img.width, img.height, d, w, h, deg, fill >>> 0)),
    bilateral: (img: Img, radius = 5, sigmaS = 4, sigmaR = 30, iters = 2) => inplace(img, (p) => e.p_bilateral(p, img.width, img.height, radius, sigmaS, sigmaR, iters)),
    cartoon: (img: Img, colors = 12, edge = 0.9, smooth = 2, scale = 1) => inplace(img, (p) => e.p_cartoon(p, img.width, img.height, colors, edge, smooth, scale)),
    kuwahara: (img: Img, r = 5) => inplace(img, (p) => e.p_kuwahara(p, img.width, img.height, r)),
    sketch: (img: Img, sigma = 8, color = false) => inplace(img, (p) => e.p_sketch(p, img.width, img.height, sigma, color ? 1 : 0)),
    watercolor: (img: Img, scale = 1) => inplace(img, (p) => e.p_watercolor(p, img.width, img.height, scale)),
    halftone: (img: Img, cell = 6, scale = 1) => inplace(img, (p) => e.p_halftone(p, img.width, img.height, cell, scale)),
    pixelateRect: (img: Img, x: number, y: number, w: number, h: number, block: number) => inplace(img, (p) => e.p_pixelate_rect(p, img.width, img.height, x | 0, y | 0, w | 0, h | 0, block | 0)),
    /** A mosaic with its grid at a random place and each block's colour moved by a random amount (p_mosaic_rect — the
     *  Screenshot Annotator's Pixelate: nothing to match candidate texts against). */
    mosaicRect: (img: Img, x: number, y: number, w: number, h: number, block: number, ox: number, oy: number, noise: number, seed: number) =>
      inplace(img, (p) => e.p_mosaic_rect(p, img.width, img.height, x | 0, y | 0, w | 0, h | 0, block | 0, ox | 0, oy | 0, noise | 0, seed >>> 0)),
    blurRect: (img: Img, x: number, y: number, w: number, h: number, sigma: number) => inplace(img, (p) => e.p_blur_rect(p, img.width, img.height, x | 0, y | 0, w | 0, h | 0, sigma)),
    /** Full-resolution alpha (Uint8Array w*h) from a low-res probability mask using a guided filter. */
    guidedAlpha(img: Img, mask: Uint8Array, mw: number, mh: number, r = 8, eps = 1e-3): Uint8Array {
      const s = put(img.data), m = put(mask), a = e.p_malloc(n(img));
      try { e.p_guided_alpha(s, img.width, img.height, m, mw, mh, a, r, eps); return new Uint8Array(mem().slice(a, a + n(img))); }
      finally { e.p_free(s); e.p_free(m); e.p_free(a); }
    },
    /** Composite over a colour (0xRRGGBB), a blurred copy (blur>0) or keep transparency. */
    composite(img: Img, alpha: Uint8Array, rgb: number, blur = 0, keepAlpha = false): Img {
      const a = put(alpha);
      try { return inplace(img, (p) => e.p_composite(p, img.width, img.height, a, rgb >>> 0, blur, keepAlpha ? 1 : 0)); } finally { e.p_free(a); }
    },
    /** First row (from the top) where the mask is set across ≥⅓ of columns x0..x1 (crown above a face), or -1. */
    maskTop(mask: Uint8Array, w: number, h: number, x0: number, x1: number, thr = 128): number {
      const mp = e.p_malloc(mask.length); try { new Uint8Array(mem(), mp, mask.length).set(mask); return e.p_mask_top(mp, w, h, Math.round(x0), Math.round(x1), thr); } finally { e.p_free(mp); }
    },
    /** warp() with a fill colour [r,g,b] outside the source. */
    warpFill(img: Img, corners: number[], w: number, h: number, rgb: [number, number, number]): Img {
      const qp = e.p_malloc(32); new Float32Array(mem(), qp, 8).set(corners.slice(0, 8));
      const fill = ((255 << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
      try { return into(img, w, h, (s, d) => { if (!e.p_warp_quad_fill(s, img.width, img.height, d, w, h, qp, fill)) throw new Error('Could not map the photo.'); }); } finally { e.p_free(qp); }
    },
    /** Person mask (0..255) from 6 selfie-multiclass confidence planes (concatenated Float32, w×h each). */
    personMask(cats: Float32Array, w: number, h: number, r = 6): Uint8Array {
      const cp = e.p_malloc(cats.length * 4), op = e.p_malloc(w * h);
      try { new Float32Array(mem(), cp, cats.length).set(cats); e.p_person_mask(cp, w, h, r, op); return new Uint8Array(mem().slice(op, op + w * h)); }
      finally { e.p_free(cp); e.p_free(op); }
    },
    /** Foreground over a same-size background image using an alpha mask. */
    compositeImg(img: Img, alpha: Uint8Array, bg: Img): Img {
      const a = put(alpha), b = put(bg.data);
      try { return inplace(img, (p) => e.p_composite_img(p, img.width, img.height, a, b)); } finally { e.p_free(a); e.p_free(b); }
    },
    detectQuad(img: Img): { corners: number[]; confidence: number } {
      const s = put(img.data), o = e.p_malloc(32);
      try { const c = e.p_detect_quad(s, img.width, img.height, o); return { corners: Array.from(new Float32Array(mem(), o, 8)), confidence: c }; }
      finally { e.p_free(s); e.p_free(o); }
    },
    /** The pages of a photo of an open book and the model of each (p_book_fit — the Book Page Flattener): mode 0 find out,
     *  1 one page, 2 two pages; focal: the camera's focal length in half the photo's longer side (focalFrom35 of
     *  src/lib/bookflat.ts — from the photo's EXIF), 0 the engine's default (1.45). The models are in normalised units, so a
     *  page is drawn from the photo at any size. */
    bookFit(img: Img, mode = 0, focal = 0): BookFit {
      const s = put(img.data), cap = 8 + 2 * BOOK_REC, o = e.p_malloc(cap * 4);
      try {
        e.p_book_fit(s, img.width, img.height, mode, focal, o, cap);
        const f = Array.from(new Float32Array(mem(), o, cap));
        const pages: BookPage[] = [];
        for (let i = 0; i < f[0]; i++) {
          const r = f.slice(8 + BOOK_REC * i, 8 + BOOK_REC * (i + 1));
          pages.push({ rec: r, rect: [r[8], r[9], r[10], r[11]], scale: r[13], rms: r[14], spans: r[15], samples: r[16], iterations: r[17], side: (['whole', 'left', 'right'] as const)[r[18]] ?? 'whole', rms0: r[19], pitch: r[20] });
        }
        // the samples it fitted to (normalised): what a picture of the fit draws
        const n = e.p_book_points(0, 0), q = e.p_malloc(Math.max(1, n) * 16), points: number[][] = [];
        try { e.p_book_points(q, n); const v = new Float32Array(mem(), q, n * 4); for (let i = 0; i < n; i++) points.push([v[4 * i], v[4 * i + 1], v[4 * i + 2], v[4 * i + 3]]); } finally { e.p_free(q); }
        return { pages, gutter: f[0] === 2 ? [f[1], f[2], f[3], f[4]] : null, spans: f[5], blobs: f[6], work: f[7], points };
      } finally { e.p_free(s); e.p_free(o); }
    },
    /** Where points of the photo (pixel indices in a picture of it w × h, any size) lie on a page of bookFit as bookRender
     *  draws it: [across, down], 0 – 1 inside the page; NaN where the model does not reach (p_book_locate). */
    bookLocate(page: BookPage, w: number, h: number, pts: number[][]): number[][] {
      const n = pts.length, r = e.p_malloc(BOOK_REC * 4), p = e.p_malloc(Math.max(1, n) * 8), o = e.p_malloc(Math.max(1, n) * 8);
      try {
        new Float32Array(mem(), r, BOOK_REC).set(page.rec); new Float32Array(mem(), p, 2 * n).set(pts.flat());
        e.p_book_locate(r, w, h, p, n, o);
        const f = new Float32Array(mem(), o, 2 * n); return pts.map((_, i) => [f[2 * i], f[2 * i + 1]]);
      } finally { e.p_free(r); e.p_free(p); e.p_free(o); }
    },
    /** Where places of a page of bookFit ([across, down], 0 – 1 as bookRender draws it) are in the photo: pixel indices in
     *  a picture of it w × h (p_book_project — the inverse of bookLocate; the tab outlines each page on the photo). */
    bookProject(page: BookPage, w: number, h: number, pts: number[][]): number[][] {
      const n = pts.length, r = e.p_malloc(BOOK_REC * 4), p = e.p_malloc(Math.max(1, n) * 8), o = e.p_malloc(Math.max(1, n) * 8);
      try {
        new Float32Array(mem(), r, BOOK_REC).set(page.rec); new Float32Array(mem(), p, 2 * n).set(pts.flat());
        e.p_book_project(r, w, h, p, n, o);
        const f = new Float32Array(mem(), o, 2 * n); return pts.map((_, i) => [f[2 * i], f[2 * i + 1]]);
      } finally { e.p_free(r); e.p_free(p); e.p_free(o); }
    },
    /** A page of bookFit drawn flat from the photo (any size of it) at w × h; what lies outside the photo is fill. */
    bookRender(img: Img, page: BookPage, w: number, h: number, fill = 0xffffffff): Img {
      const r = e.p_malloc(BOOK_REC * 4); new Float32Array(mem(), r, BOOK_REC).set(page.rec);
      try { return into(img, w, h, (s, d) => e.p_book_render(s, img.width, img.height, r, d, w, h, fill >>> 0)); } finally { e.p_free(r); }
    },
    /** The share of the picture that is exactly flat, 0 – 1 (p_flat_share): about 0 for a camera's photo. */
    flatShare(img: Img): number { const s = put(img.data); try { return e.p_flat_share(s, img.width, img.height) / 10000; } finally { e.p_free(s); } },
    /** The page of a photo for reading (p_page_quad): the bright quadrilateral most like a page, preferring one that does
     *  not run off the photo's edges — a Kindle's screen in its black body over a light desk. confidence 0: none. */
    pageQuad(img: Img): { corners: number[]; confidence: number } {
      const s = put(img.data), o = e.p_malloc(32);
      try { const c = e.p_page_quad(s, img.width, img.height, o); return { corners: Array.from(new Float32Array(mem(), o, 8)), confidence: c }; }
      finally { e.p_free(s); e.p_free(o); }
    },
    /** The brightness step across each edge of an outline (p_quad_steps; corners TL TR BR BL in px): inside − outside,
     *  the median along the edge; 9999 where the edge lies along the photo's border (nothing outside to compare). A page
     *  or a screen is lighter than what lies around it: a real edge steps by tens of levels, a wrong one by a few. */
    quadSteps(img: Img, corners: number[], dfrac = 0.015): number[] {
      const s = put(img.data), q = e.p_malloc(32), o = e.p_malloc(16);
      try { new Float32Array(mem(), q, 8).set(corners); e.p_quad_steps(s, img.width, img.height, q, dfrac, o); return Array.from(new Int32Array(mem(), o, 4)); }
      finally { e.p_free(s); e.p_free(q); e.p_free(o); }
    },
    /** The busiest part of a picture (p_busy_window): the top-left corner of the ww × wh window with the most detail, weighed a
     *  little towards the middle; `detail` 0 for a flat picture (then the middle). */
    busyWindow(img: Img, ww: number, wh: number): { x: number; y: number; detail: number } {
      const s = put(img.data), o = e.p_malloc(8);
      try { const v = e.p_busy_window(s, img.width, img.height, Math.round(ww), Math.round(wh), o), r = new Int32Array(mem(), o, 2); return { x: r[0], y: r[1], detail: v / 100 }; }
      finally { e.p_free(s); e.p_free(o); }
    },
    /** Where the text of a picture is (p_ink_window): the top-left corner of the ww × wh window holding the most ink
     *  (the middle when nothing stands out), and the share of it that is ink. */
    inkWindow(img: Img, ww: number, wh: number): { x: number; y: number; ink: number } {
      const s = put(img.data), o = e.p_malloc(8);
      try { const v = e.p_ink_window(s, img.width, img.height, ww, wh, o), r = new Int32Array(mem(), o, 2); return { x: r[0], y: r[1], ink: v / 10000 }; }
      finally { e.p_free(s); e.p_free(o); }
    },
    /** A page's outline refined against the photo (p_refine_quad): each edge fitted to where the brightness steps from
     *  outside to inside within ±search px of it, the corners where the fitted lines meet — outside the photo where the
     *  page runs off it. `edges`: how many were refitted (0: the corners as they were). */
    refineQuad(img: Img, corners: number[], search: number): { corners: number[]; edges: number } {
      const s = put(img.data), q = e.p_malloc(32), o = e.p_malloc(32);
      try { new Float32Array(mem(), q, 8).set(corners); const n = e.p_refine_quad(s, img.width, img.height, q, search, o); return { corners: Array.from(new Float32Array(mem(), o, 8)), edges: n }; }
      finally { e.p_free(s); e.p_free(q); e.p_free(o); }
    },
    /** The letters of a picture inside an outline (TL, TR, BR, BL, px) and outside it (p_quad_text): a page's outline
     *  holds nearly all of them. */
    quadText(img: Img, corners: number[]): { inside: number; outside: number } {
      const s = put(img.data), qp = e.p_malloc(32), o = e.p_malloc(8);
      try {
        new Float32Array(mem(), qp, 8).set(corners);
        e.p_quad_text(s, img.width, img.height, qp, o);
        const v = new Int32Array(mem(), o, 2);
        return { inside: v[0], outside: v[1] };
      } finally { e.p_free(s); e.p_free(qp); e.p_free(o); }
    },
    /** What lay round a straightened page along its edges (a strip of the desk, a screen's bezel) painted the paper's
     *  colour (p_clear_border): `maxfrac` of the page at most from each edge. */
    clearBorder(img: Img, maxfrac = 0.03): { img: Img; painted: number } {
      const p = put(img.data);
      try {
        const painted = e.p_clear_border(p, img.width, img.height, maxfrac);
        return { img: { width: img.width, height: img.height, data: new Uint8ClampedArray(mem().slice(p, p + img.data.length)) }, painted };
      } finally { e.p_free(p); }
    },
    /** A watermark washed over a page set upright and cleaned up (p_clear_wash; to-do #18): when the ink has a second,
     *  lighter level of its own, its broad strokes painted the paper's colour; `band` = the grey taken (luma), `painted` =
     *  pixels (0: no watermark found, the page as it was). */
    clearWash(img: Img): { img: Img; painted: number; band: [number, number] } {
      const p = put(img.data), o = e.p_malloc(12);
      try {
        e.p_clear_wash(p, img.width, img.height, o);
        const v = new Int32Array(mem(), o, 3);
        return { img: { width: img.width, height: img.height, data: new Uint8ClampedArray(mem().slice(p, p + img.data.length)) }, painted: v[0], band: [v[1], v[2]] };
      } finally { e.p_free(p); e.p_free(o); }
    },
    /** Ruled lines and list marks painted the paper's colour on a page set upright and cleaned up (p_clear_marks; to-do
     *  #18): what — bit 0 the lines (a table's grid, rules, underlines), bit 1 the marks (● ○ ■ □ ☐ ☑ … at a line's start
     *  before a gap wider than its word spaces), bit 2 count the columns of text; `lines` = pixels cleared (`inner`: of
     *  lines inside the page, not along its edges), `marks` = marks cleared, `xh` = the x-height found, `slant` in
     *  degrees, `columns` = the columns of text (1: one, or not counted); `list`: every mark cleared, where it stood and
     *  what it was (the OCR tab puts them back at the start of their lines — to-do #31); `labels`: a list's labels kept
     *  where a mark would have been cleared (a soft "a." or "ii.": letters, not marks). */
    clearMarks(img: Img, what = 3): { img: Img; lines: number; inner: number; marks: number; xh: number; slant: number; columns: number; list: ListMark[]; labels: number } {
      const p = put(img.data), o = e.p_malloc(32), L = e.p_malloc(MAX_MARKS * 20);
      try {
        new Int32Array(mem(), o, 8).fill(0); // an output a module does not write reads 0 (an older build has no labels: out[7])
        e.p_clear_marks(p, img.width, img.height, what, o, L, MAX_MARKS);
        const v = Array.from(new Int32Array(mem(), o, 8)), m = new Int32Array(mem(), L, v[6] * 5), list: ListMark[] = [];
        for (let k = 0; k < v[6]; k++) list.push({ x0: m[5 * k], y0: m[5 * k + 1], x1: m[5 * k + 2], y1: m[5 * k + 3], kind: m[5 * k + 4] });
        return { img: { width: img.width, height: img.height, data: new Uint8ClampedArray(mem().slice(p, p + img.data.length)) }, lines: v[0], inner: v[5], marks: v[1], xh: v[2], slant: v[3] / 100, columns: v[4], list, labels: v[7] };
      } finally { e.p_free(p); e.p_free(o); e.p_free(L); }
    },
    /** Which way up the text of a picture stands (p_text_turns): the quarter turns to the right that set it upright
     *  (0–3), -1 when there is too little text to say, -2 when the lines' axis is clear but not which end is up; with
     *  the evidence — neighbour votes along / across the lines, letters sticking out on the low / high side, letters,
     *  `across0`: the lines run across the picture (else up and down it), and `slant`: the lines' angle from the nearer
     *  axis in degrees, −45 … 45 (positive: falling to the right). */
    textTurns(img: Img): { turns: number; along: number; across: number; up: number; down: number; letters: number; across0: boolean; slant: number } {
      const s = put(img.data), o = e.p_malloc(32);
      try {
        const t = e.p_text_turns(s, img.width, img.height, o), v = new Int32Array(mem(), o, 8);
        return { turns: t, along: v[1], across: v[2], up: v[3], down: v[4], letters: v[5], across0: v[6] === 1, slant: v[7] / 100 };
      } finally { e.p_free(s); e.p_free(o); }
    },
    /** The lines' direction from projection profiles (p_text_lines): `turns` 0–3 (the quarter turns to the right that
     *  set the text upright once levelled), -1 when no direction stands out, -2 when it does but not which side is the
     *  top; `angle`: the lines' direction in degrees from the x axis toward y (−90 < angle ≤ 90); `contrast`: how much
     *  sharper the profile is along the lines than across them; `low` / `high`: the ink beside the x-height band on
     *  either side; `pitch` (px) and its `strength`; `ink`: the ink pixels used. */
    textLines(img: Img): { turns: number; angle: number; contrast: number; low: number; high: number; pitch: number; strength: number; ink: number } {
      const s = put(img.data), o = e.p_malloc(32);
      try {
        const t = e.p_text_lines(s, img.width, img.height, o), v = new Float32Array(mem(), o, 8);
        return { turns: t, angle: v[0], contrast: v[1], low: v[2], high: v[3], pitch: v[4], strength: v[5], ink: v[6] };
      } finally { e.p_free(s); e.p_free(o); }
    },
    /** Perspective-correct the quad (TL,TR,BR,BL in source px) into a w×h image. */
    warp(img: Img, corners: number[], w: number, h: number): Img {
      const qp = e.p_malloc(32); new Float32Array(mem(), qp, 8).set(corners.slice(0, 8));
      try { return into(img, w, h, (s, d) => { if (!e.p_warp_quad(s, img.width, img.height, d, w, h, qp)) throw new Error('Those corners do not form a usable page outline.'); }); } finally { e.p_free(qp); }
    },
    docEnhance: (img: Img, mode: 0 | 1 | 2) => inplace(img, (p) => e.p_doc_enhance(p, img.width, img.height, mode)),
    // ---- PaddleOCR around its networks (the second reader for soft photos: src/lib/paddle.ts)
    /** cv2.resize with INTER_LINEAR (8-bit RGBA). */
    resizeLinear: (img: Img, w: number, h: number) => into(img, w, h, (s, d) => e.p_resize_linear(s, img.width, img.height, d, w, h)),
    /** A network's input (p_net_planes): the picture resized to w × h (INTER_LINEAR, 8-bit), as planes B, G, R of
     *  v / 127.5 − 1, `pw` wide (the columns from w on 0). */
    netPlanes(img: Img, w: number, h: number, pw = w): Float32Array {
      const s = put(img.data), o = e.p_malloc(pw * h * 12);
      try { e.p_net_planes(s, img.width, img.height, w, h, pw, o); return new Float32Array(mem().slice(o, o + pw * h * 12)); } finally { e.p_free(s); e.p_free(o); }
    },
    /** The boxes of text in the detector's w × h probability map, scaled to the dw × dh picture it was made from
     *  (p_db_boxes: RapidOCR's DBPostProcess): corners TL, TR, BR, BL and the mean probability inside. */
    dbBoxes(prob: Float32Array, w: number, h: number, dw: number, dh: number, o: { thresh?: number; boxThresh?: number; unclip?: number; maxCandidates?: number } = {}): Array<{ box: number[]; score: number }> {
      const max = o.maxCandidates ?? 1000, pp = e.p_malloc(prob.length * 4), op = e.p_malloc(max * 36);
      try {
        new Float32Array(mem(), pp, prob.length).set(prob);
        const k = e.p_db_boxes(pp, w, h, o.thresh ?? 0.3, o.boxThresh ?? 0.5, o.unclip ?? 1.6, max, dw, dh, op, max), v = new Float32Array(mem(), op, k * 9), r: Array<{ box: number[]; score: number }> = [];
        for (let i = 0; i < k; i++) r.push({ box: Array.from(v.subarray(i * 9, i * 9 + 8)), score: v[i * 9 + 8] });
        return r;
      } finally { e.p_free(pp); e.p_free(op); }
    },
    /** A line of text cut out and straightened (p_crop_quad: get_rotate_crop_image — bicubic, a tall crop turned a
     *  quarter to the left); null for a quad of no size. */
    cropQuad(img: Img, quad: number[]): Img | null {
      const s = put(img.data), qp = e.p_malloc(32), wp = e.p_malloc(8);
      try {
        new Float32Array(mem(), qp, 8).set(quad.slice(0, 8));
        if (!e.p_crop_quad(s, img.width, img.height, qp, 0, wp)) return null;
        const [w, h] = Array.from(new Int32Array(mem(), wp, 2)), d = e.p_malloc(w * h * 4);
        try { e.p_crop_quad(s, img.width, img.height, qp, d, wp); return { data: take(d, w * h * 4), width: w, height: h }; } finally { e.p_free(d); }
      } finally { e.p_free(s); e.p_free(qp); e.p_free(wp); }
    },
    /** CTC's greedy reading of one line of the recogniser's output (T steps × C classes): the classes kept, their
     *  probabilities and steps (p_ctc). */
    ctc(probs: Float32Array, T: number, C: number): { cls: Int32Array; prob: Float32Array; step: Int32Array } {
      const pp = e.p_malloc(T * C * 4), cp = e.p_malloc(T * 4), rp = e.p_malloc(T * 4), sp = e.p_malloc(T * 4);
      try {
        new Float32Array(mem(), pp, T * C).set(probs.subarray(0, T * C));
        const n = e.p_ctc(pp, T, C, cp, rp, sp);
        return { cls: new Int32Array(mem().slice(cp, cp + n * 4)), prob: new Float32Array(mem().slice(rp, rp + n * 4)), step: new Int32Array(mem().slice(sp, sp + n * 4)) };
      } finally { e.p_free(pp); e.p_free(cp); e.p_free(rp); e.p_free(sp); }
    },
    /** the picture's opaque pixels in k flat colours (k-means in CIE Lab; edges evened out `smooth` times; areas under `minArea` px
     *  taken in by their neighbours); pixels with alpha < 128 transparent. The palette: [r, g, b] of each colour used. */
    clipFlat(img: Img, k: number, minArea: number, smooth: number): { img: Img; palette: Array<[number, number, number]> } {
      const p = put(img.data), pal = e.p_malloc(64 * 4);
      try {
        e.p_clip_flat(p, img.width, img.height, k, minArea, smooth, pal);
        const pb = new Uint8Array(mem().slice(pal, pal + 64 * 4)), palette: Array<[number, number, number]> = [];
        for (let j = 0; j < 64; j++) if (pb[j * 4 + 3]) palette.push([pb[j * 4], pb[j * 4 + 1], pb[j * 4 + 2]]);
        return { img: { data: take(p, img.data.length), width: img.width, height: img.height }, palette };
      } finally { e.p_free(p); e.p_free(pal); }
    },
    /** a mask (0 / 255) with islands and holes under `minArea` px taken in and its edge evened out; and how many pixels are on */
    clipMask(mask: Uint8Array, w: number, h: number, minArea: number, smooth: number): { mask: Uint8Array; on: number } {
      const p = put(mask);
      try { const on = e.p_clip_mask(p, w, h, minArea, smooth); return { mask: new Uint8Array(mem().slice(p, p + w * h)), on }; } finally { e.p_free(p); }
    },
    /** a mask (0 … 255, w × h) as the picture's alpha */
    clipApply(img: Img, mask: Uint8Array): Img {
      const m = put(mask);
      try { return inplace(img, (p) => e.p_clip_apply(p, m, img.width, img.height)); } finally { e.p_free(m); }
    },
    /** `img` with the alpha of `from` (the same size) */
    clipAlpha(img: Img, from: Img): Img {
      if (from.width !== img.width || from.height !== img.height) throw new Error('clipAlpha: the two pictures differ in size');
      const fp = put(from.data);
      try { return inplace(img, (p) => e.p_clip_alpha(p, fp, img.width, img.height)); } finally { e.p_free(fp); }
    },
    /** black where the picture is opaque, white elsewhere */
    clipSilhouette: (img: Img) => inplace(img, (p) => e.p_clip_silhouette(p, img.width, img.height)),
    /** the clip art's ink lines (DoG at `sigma` px, darker than `thr` 0 … 1, specks under `minArea` px left out) as black on white */
    clipLines(img: Img, sigma: number, thr: number, minArea: number): { img: Img; on: number } {
      let on = 0;
      const out = inplace(img, (p) => { on = e.p_clip_lines(p, img.width, img.height, sigma, thr, Math.round(minArea)); });
      return { img: out, on };
    },
    /** black and white by luminance (on white where see-through) at threshold t (< 0: Otsu's); the threshold used */
    bw(img: Img, t = -1, invert = false): { img: Img; threshold: number } {
      let threshold = 0;
      const out = inplace(img, (p) => { threshold = e.p_bw(p, img.width, img.height, Math.round(t), invert ? 1 : 0); });
      return { img: out, threshold };
    },
    /** U²-Net's input planes (d × d, rembg's normalisation) */
    u2Planes(img: Img, d = 320): Float32Array {
      const s = put(img.data), o = e.p_malloc(d * d * 3 * 4);
      try { e.p_u2_planes(s, img.width, img.height, d, o); return new Float32Array(mem().slice(o, o + d * d * 3 * 4)); } finally { e.p_free(s); e.p_free(o); }
    },
    /** U²-Net's output stretched to 0 – 255 */
    u2Mask(prob: Float32Array): Uint8Array {
      const s = e.p_malloc(prob.length * 4), o = e.p_malloc(prob.length);
      try { new Float32Array(mem(), s, prob.length).set(prob); e.p_u2_mask(s, prob.length, o); return new Uint8Array(mem().slice(o, o + prob.length)); } finally { e.p_free(s); e.p_free(o); }
    },
    /** AnimeGAN v2's input (p_anime_in; the Cartoonizer's anime looks): RGB as v / 127.5 − 1, the last row and column repeated to
     *  W × H; NHWC, or planes R, G, B (`nchw`: the face portrait) */
    animeIn(img: Img, W: number, H: number, nchw: boolean): Float32Array {
      const s = put(img.data), o = e.p_malloc(W * H * 12);
      try { e.p_anime_in(s, img.width, img.height, W, H, nchw ? 1 : 0, o); return new Float32Array(mem().slice(o, o + W * H * 12)); } finally { e.p_free(s); e.p_free(o); }
    },
    /** its output (W × H, NHWC or planes) → the w × h picture (p_anime_out): (v + 1) × 127.5 held to 0 … 255, truncated */
    animeOut(out: Float32Array, W: number, H: number, nchw: boolean, w: number, h: number): Img {
      const s = e.p_malloc(out.length * 4), o = e.p_malloc(w * h * 4);
      try { new Float32Array(mem(), s, out.length).set(out); e.p_anime_out(s, W, H, nchw ? 1 : 0, w, h, o); return { data: new Uint8ClampedArray(mem().slice(o, o + w * h * 4)), width: w, height: h }; } finally { e.p_free(s); e.p_free(o); }
    },
    histogram(img: Img) { const s = put(img.data), o = e.p_malloc(4096); try { e.p_histogram(s, n(img), o); return new Uint32Array(mem().slice(o, o + 4096)); } finally { e.p_free(s); e.p_free(o); } },
    /** The views of a scrolling screenshot, w × h each, placed against the one kept before (p_scroll_match; to-do #28).
     *  Two frames and their row signatures stay in the module's memory: `first` and `keep` say which is the reference. */
    scrollMatcher(w: number, h: number) {
      const K = e.p_scroll_bands(w), bytes = w * h * 4;
      let pa = e.p_malloc(bytes), pb = e.p_malloc(bytes), sa = e.p_malloc(h * K * 4), sb = e.p_malloc(h * K * 4);
      const out = e.p_malloc(36);
      const load = (px: Uint8ClampedArray, to: number, sig: number) => { new Uint8Array(mem(), to, bytes).set(px.subarray(0, bytes)); e.p_scroll_sig(to, w, h, sig); };
      return {
        /** the first view: the reference of the next */
        first(px: Uint8ClampedArray) { load(px, pa, sa); },
        /** a new view against the reference; `prior` = the shift expected, if any; `cap` = the fewest rows that stayed put
         *  at the top and the bottom so far (−1: none known) */
        match(px: Uint8ClampedArray, prior?: number, cap: { top: number; bottom: number } = { top: -1, bottom: -1 }): ScrollFit {
          load(px, pb, sb);
          e.p_scroll_match(pa, sa, pb, sb, w, h, prior ?? 0, prior === undefined ? 0 : 1, cap.top, cap.bottom, out);
          const o = new Int32Array(mem(), out, 9);
          return { status: o[0], d: o[1], top: o[2], bottom: o[3], fit: o[4] / 1e4, other: o[5] / 1e4, mean: o[6] / 1000, bad: o[7] / 1e6, overlap: o[8] };
        },
        /** the view just matched becomes the reference */
        keep() { [pa, pb] = [pb, pa]; [sa, sb] = [sb, sa]; },
        /** rows y0 … y1 − 1 of the reference (`kept`) or of the view just matched — copies */
        rows(y0: number, y1: number, kept = false) { const p = kept ? pa : pb; return new Uint8ClampedArray(mem().slice(p + y0 * w * 4, p + y1 * w * 4)); },
        free() { for (const p of [pa, pb, sa, sb, out]) e.p_free(p); pa = pb = sa = sb = 0; },
      };
    },
    /** The Long Screenshot Stitcher's screenshots (potentials #87; wasm/imgproc/stitch.c): each one's row signatures stay in the
     *  module's memory under its id, so that every pair is compared without copying them again. */
    stitcher() {
      const shots = new Map<number, { h: number; K: number; s: number; t: number; m: number }>();
      const out = e.p_malloc(56);
      const get = (id: number) => { const x = shots.get(id); if (!x) throw new Error(`no screenshot ${id}`); return x; };
      return {
        /** a screenshot's rows (its pixels are not kept); returns the bands a row is known by. `smooth`: each band over
         *  three rows (a soft copy, sent through a chat app) */
        add(id: number, img: Img, smooth = false): number {
          const p = put(img.data), h = img.height, K = e.p_scroll_bands(img.width);
          const s = e.p_malloc(h * K * 4), t = e.p_malloc(h * 4), m = e.p_malloc(h * 4);
          try { e.p_st_rows(p, img.width, h, smooth ? 1 : 0, s, t, m); } finally { e.p_free(p); }
          shots.get(id) && this.remove(id);
          shots.set(id, { h, K, s, t, m });
          return K;
        },
        /** where b stands against a (p_st_pair): b's row y shows a's row y + shift */
        pair(ia: number, ib: number, tol = 64): StitchPair {
          const A = get(ia), B = get(ib);
          if (A.K !== B.K) throw new Error('screenshots of different widths');
          e.p_st_pair(A.s, A.t, A.m, A.h, B.s, B.t, B.m, B.h, A.K, tol, out);
          const o = new Int32Array(mem(), out, 14);
          return { found: o[0] === 1, d: o[1], f: o[2] / 4, shift: o[1] + o[2] / 4, score: o[3], other: o[4], y0: o[5], y1: o[6], matched: o[7], missed: o[8], same: o[9] / 1000, votes: o[10], otherShift: o[11] / 4, allMatched: o[12], allMissed: o[13] };
        },
        /** b's rows that match a's at the same place (p_st_same): 0 no, 1 yes, 2 yes and the row has detail */
        same(ia: number, ib: number, tol = 64): Uint8Array {
          const A = get(ia), B = get(ib);
          if (A.h !== B.h || A.K !== B.K) return new Uint8Array(B.h);
          const o = e.p_malloc(B.h);
          try { e.p_st_same(A.s, B.s, B.t, B.h, B.K, tol, o); return new Uint8Array(mem().slice(o, o + B.h)); } finally { e.p_free(o); }
        },
        remove(id: number) { const x = shots.get(id); if (x) { e.p_free(x.s); e.p_free(x.t); e.p_free(x.m); shots.delete(id); } },
        free() { for (const id of [...shots.keys()]) this.remove(id); e.p_free(out); },
      };
    },
    /** where to join a (above) and b (below; b's row y shows a's row y + d) between b's rows y0 and y1 (p_st_seam) */
    stitchSeam(a: Img, b: Img, d: number, y0: number, y1: number): { row: number; here: number; mean: number; off: number } {
      const pa = put(a.data), pb = put(b.data), o = e.p_malloc(16);
      try {
        e.p_st_seam(pa, a.height, pb, b.height, a.width, Math.round(d), Math.round(y0), Math.round(y1), o);
        const r = new Int32Array(mem(), o, 4);
        return { row: r[0], here: r[1] / 1000, mean: r[2] / 1000, off: r[3] / 1e6 };
      } finally { e.p_free(pa); e.p_free(pb); e.p_free(o); }
    },
  };
}
export type Imgproc = ReturnType<typeof bindImgproc>;
/** Where screenshot b stands against a (p_st_pair): `found` a shift; b's row y shows a's row y + shift (shift = d + f, f a
 *  quarter of a row at a time); the stretch they share (b's rows y0 … y1), its score and the best of any other shift; the
 *  rows with detail matched and not in it; `same` the share of b's rows with detail that match a's at the same place (a
 *  duplicate: near 1; −0.001 for other heights); the shift's votes; the best other shift (0: none) — where rows repeat; over
 *  all the rows the shift lays over each other, rows matched and not (a coincidence sits among rows that do not match). */
export interface StitchPair { found: boolean; d: number; f: number; shift: number; score: number; other: number; y0: number; y1: number; matched: number; missed: number; same: number; votes: number; otherShift: number; allMatched: number; allMissed: number }
/** Floats per page in p_book_fit's answer (wasm/imgproc/flatten.c, FB_REC). */
export const BOOK_REC = 26;
/** A page bookFit found: its model (rec, as p_book_render takes it), the flat page in model units (x0, y0, x1, y1), the
 *  photo's scale there (normalised units per model unit: × half a photo's longer side = its pixels per unit), the fit's
 *  error in px of the working picture (after and before), the lines and samples it was fitted to, which page. */
export interface BookPage { rec: number[]; rect: number[]; scale: number; rms: number; rms0: number; spans: number; samples: number; iterations: number; side: 'whole' | 'left' | 'right'; pitch: number }
/** bookFit's answer: the pages (none when no lines of text were found), the gutter of a spread (x, y at the text's top and
 *  bottom, in the given picture's pixels), the spans and blobs found, the working scale, and the samples fitted to (u, v
 *  normalised — half the picture's longer side = 1, from its middle; the line; the page: 0 whole, 1 left, 2 right). */
export interface BookFit { pages: BookPage[]; gutter: number[] | null; spans: number; blobs: number; work: number; points: number[][] }
/** What p_scroll_match found (see imgproc.c): status 0 nothing moved, 1 a shift, 2 nothing fits, 3 more than one fits
 *  (the nearest the expected one given), 4 too little in the overlap to tell; d the shift in rows; the rows that stay put
 *  at the top and the bottom; the fit (0 = the same) and the best other; the overlap's pixels: mean |Δ| of a channel and
 *  the share of pixels off by more than 24; its rows. */
export interface ScrollFit { status: number; d: number; top: number; bottom: number; fit: number; other: number; mean: number; bad: number; overlap: number }

// ------------------------------------------------------------------ worker client (browser)
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
type Ops = Omit<Imgproc, never>;
/** Call any imgproc op in the worker: await imgproc('cartoon', img, 12, 0.9, 2) */
export function imgproc<K extends keyof Ops>(op: K, ...args: Parameters<Ops[K]>): Promise<ReturnType<Ops[K]>> {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/imgproc.worker.ts', import.meta.url), { type: 'module' }), 'imgproc-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.result); };
    worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Image worker failed')); pending.clear(); worker = null; };
  }
  const id = ++seq;
  const plain = args.map((a: any) => (a && a.data instanceof Uint8ClampedArray && 'width' in a ? { data: a.data, width: a.width, height: a.height } : a));
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker!.postMessage({ id, op, args: plain }); });
}
let direct: Promise<Imgproc> | null = null;
/** Same-thread binding for tiny, latency-sensitive ops (e.g. live preview on small images). */
export const imgprocDirect = () => { if (!direct) { direct = instantiateWasi(wasmUrl).then((x) => bindImgproc(x.exports)); onLeave('imgproc-direct', () => (direct = null)); } return direct; };
export const toImageData = (img: Img) => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
