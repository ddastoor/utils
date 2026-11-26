// Wrapper for imgproc.wasm (own C: wasm/imgproc/imgproc.c). `bindImgproc` is environment-neutral (Node tests);
// `imgproc()` runs it in a Web Worker so heavy filters never freeze the page.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/imgproc.wasm?url';
import { onLeave, trackWorker } from '../lifecycle';

export interface Img { data: Uint8ClampedArray; width: number; height: number }
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
    inkRegions(img: Img, skip: Array<[number, number, number, number]>, o: { thr?: number; dil?: number; minArea?: number; max?: number } = {}) {
      const max = o.max ?? 256, s = put(img.data), k = e.p_malloc(Math.max(1, skip.length) * 16), out = e.p_malloc(max * 16);
      try {
        new Float32Array(mem(), k, skip.length * 4).set(skip.flat());
        const c = e.p_ink_regions(s, img.width, img.height, o.thr ?? 200, k, skip.length, o.dil ?? 6, o.minArea ?? 900, out, max);
        const r = new Int32Array(mem(), out, c * 4);
        return Array.from({ length: c }, (_, i) => ({ x: r[i * 4], y: r[i * 4 + 1], w: r[i * 4 + 2], h: r[i * 4 + 3] }));
      } finally { e.p_free(s); e.p_free(k); e.p_free(out); }
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
     *  degrees, `columns` = the columns of text (1: one, or not counted). */
    clearMarks(img: Img, what = 3): { img: Img; lines: number; inner: number; marks: number; xh: number; slant: number; columns: number } {
      const p = put(img.data), o = e.p_malloc(24);
      try {
        e.p_clear_marks(p, img.width, img.height, what, o);
        const v = Array.from(new Int32Array(mem(), o, 6));
        return { img: { width: img.width, height: img.height, data: new Uint8ClampedArray(mem().slice(p, p + img.data.length)) }, lines: v[0], inner: v[5], marks: v[1], xh: v[2], slant: v[3] / 100, columns: v[4] };
      } finally { e.p_free(p); e.p_free(o); }
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
    histogram(img: Img) { const s = put(img.data), o = e.p_malloc(4096); try { e.p_histogram(s, n(img), o); return new Uint32Array(mem().slice(o, o + 4096)); } finally { e.p_free(s); e.p_free(o); } },
  };
}
export type Imgproc = ReturnType<typeof bindImgproc>;

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
