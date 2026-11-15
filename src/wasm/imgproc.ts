// Wrapper for imgproc.wasm (own C: wasm/imgproc/imgproc.c). `bindImgproc` is environment-neutral (Node tests);
// `imgproc()` runs it in a Web Worker so heavy filters never freeze the page.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/imgproc.wasm?url';

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
    invert: (img: Img) => inplace(img, (p) => e.p_invert(p, n(img))),
    resize: (img: Img, w: number, h: number) => into(img, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), (s, d) => e.p_resize(s, img.width, img.height, d, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))),
    blur: (img: Img, sigma: number) => inplace(img, (p) => e.p_blur(p, img.width, img.height, sigma)),
    sharpen: (img: Img, amount: number, sigma = 1.2) => inplace(img, (p) => e.p_sharpen(p, img.width, img.height, amount, sigma)),
    /** Rotate by any angle into a w×h canvas (default: same size → crops corners). fill = 0xAABBGGRR little-endian RGBA. */
    rotate: (img: Img, deg: number, w = img.width, h = img.height, fill = 0) => into(img, w, h, (s, d) => e.p_rotate(s, img.width, img.height, d, w, h, deg, fill >>> 0)),
    bilateral: (img: Img, radius = 5, sigmaS = 4, sigmaR = 30, iters = 2) => inplace(img, (p) => e.p_bilateral(p, img.width, img.height, radius, sigmaS, sigmaR, iters)),
    cartoon: (img: Img, colors = 12, edge = 0.9, smooth = 2) => inplace(img, (p) => e.p_cartoon(p, img.width, img.height, colors, edge, smooth)),
    kuwahara: (img: Img, r = 5) => inplace(img, (p) => e.p_kuwahara(p, img.width, img.height, r)),
    sketch: (img: Img, sigma = 8, color = false) => inplace(img, (p) => e.p_sketch(p, img.width, img.height, sigma, color ? 1 : 0)),
    watercolor: (img: Img) => inplace(img, (p) => e.p_watercolor(p, img.width, img.height)),
    halftone: (img: Img, cell = 6) => inplace(img, (p) => e.p_halftone(p, img.width, img.height, cell)),
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
    detectQuad(img: Img): { corners: number[]; confidence: number } {
      const s = put(img.data), o = e.p_malloc(32);
      try { const c = e.p_detect_quad(s, img.width, img.height, o); return { corners: Array.from(new Float32Array(mem(), o, 8)), confidence: c }; }
      finally { e.p_free(s); e.p_free(o); }
    },
    /** Perspective-correct the quad (TL,TR,BR,BL in source px) into a w×h image. */
    warp(img: Img, corners: number[], w: number, h: number): Img {
      const H = homography([[0, 0], [w, 0], [w, h], [0, h]], [[corners[0], corners[1]], [corners[2], corners[3]], [corners[4], corners[5]], [corners[6], corners[7]]]);
      const hp = e.p_malloc(36); new Float32Array(mem(), hp, 9).set(H);
      try { return into(img, w, h, (s, d) => e.p_warp(s, img.width, img.height, d, w, h, hp)); } finally { e.p_free(hp); }
    },
    docEnhance: (img: Img, mode: 0 | 1 | 2) => inplace(img, (p) => e.p_doc_enhance(p, img.width, img.height, mode)),
    histogram(img: Img) { const s = put(img.data), o = e.p_malloc(4096); try { e.p_histogram(s, n(img), o); return new Uint32Array(mem().slice(o, o + 4096)); } finally { e.p_free(s); e.p_free(o); } },
  };
}
export type Imgproc = ReturnType<typeof bindImgproc>;

/** 3×3 homography mapping points `from` → `to` (4 correspondences), row-major, h33 = 1. */
export function homography(from: number[][], to: number[][]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination (8×8)
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  return [...b.map((v, i) => v / A[i][i]), 1];
}

// ------------------------------------------------------------------ worker client (browser)
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
type Ops = Omit<Imgproc, never>;
/** Call any imgproc op in the worker: await imgproc('cartoon', img, 12, 0.9, 2) */
export function imgproc<K extends keyof Ops>(op: K, ...args: Parameters<Ops[K]>): Promise<ReturnType<Ops[K]>> {
  if (!worker) {
    worker = new Worker(new URL('../workers/imgproc.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.result); };
    worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Image worker failed')); pending.clear(); worker = null; };
  }
  const id = ++seq;
  const plain = args.map((a: any) => (a && a.data instanceof Uint8ClampedArray && 'width' in a ? { data: a.data, width: a.width, height: a.height } : a));
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker!.postMessage({ id, op, args: plain }); });
}
let direct: Promise<Imgproc> | null = null;
/** Same-thread binding for tiny, latency-sensitive ops (e.g. live preview on small images). */
export const imgprocDirect = () => (direct ||= instantiateWasi(wasmUrl).then((x) => bindImgproc(x.exports)));
export const toImageData = (img: Img) => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
