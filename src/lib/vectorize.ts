// The pipelines of the Image to SVG and Clipart Maker tabs (potentials #1, #117), without the DOM: the tracing worker
// (src/workers/vector.worker.ts) gives them its engines, the unit suite gives them the same engines in Node.
// - Black and white: imgproc.wasm's black and white (by a threshold, Otsu's, or a photo of paper cleaned up first) → Potrace 1.16.
// - Clip art: the subject found by U²-Net small at a working size (≤ 1,024 px) and refined by the guided filter, cleaned (islands and
//   holes taken in), taken from the photo's own pixels at the clip art's size; a light smoothing for the ink lines (Winnemöller's
//   difference of Gaussians: eyes, a mouth, folds), a strong one — bilateral then Kuwahara — for flat colours (k-means in CIE Lab,
//   specks taken in); the colours, the subject's outline and the lines traced by VTracer. All pixel work is imgproc.wasm's.
import type { Imgproc, Img } from '../wasm/imgproc';
import type { Vtracer, VtOptions } from '../wasm/vtracer';

export interface BwOptions { threshold: number; invert: boolean; paper: boolean; turdsize: number; alphamax: number; opticurve: boolean; opttolerance: number }
/** Potrace's options as esm-potrace-wasm takes them (turnpolicy 4: minority, Potrace's own default) */
export interface PotraceOptions { turdsize: number; turnpolicy: number; alphamax: number; opticurve: number; opttolerance: number; pathonly: false; extractcolors: false }
export type Potrace = (img: Img, o: PotraceOptions) => Promise<string>;

export interface ClipOptions {
  /** cut the subject out of its background */ cut: boolean;
  /** the number of flat colours */ colors: number;
  /** areas smaller than this share of the picture are taken into their neighbours */ detail: number;
  /** the clip art's long side, px */ size: number;
}
export interface ClipResult {
  /** the flat colours traced (VTracer, stacked) */ shapes: string;
  /** the subject's shape traced (black) */ silhouette: string;
  /** the ink lines traced (black), or '' */ lines: string;
  width: number; height: number;
  palette: Array<[number, number, number]>;
  /** a subject was found and cut out */ found: boolean;
  /** the share of the photo the subject takes (1 without a cut) */ share: number;
  /** the part of the photo used: x, y, width, height */ crop: [number, number, number, number];
  ms: number;
}
export interface ClipEngines {
  p: Imgproc;
  v: Vtracer;
  /** the subject's mask (0 … 255, the size of `work`) — U²-Net; not needed without a cut */
  cut?: (work: Img) => Promise<Uint8Array>;
  progress?: (phase: 'flat') => void;
}

/** VTracer's settings for the clip art's shapes, outline and lines (splines, two decimals are enough at its size) */
const SHAPES: VtOptions = { color: true, colorPrecision: 8, layerDifference: 0, filterSpeckle: 2, mode: 'spline', cornerThreshold: 60, lengthThreshold: 4, spliceThreshold: 45, precision: 1 };
const OUTLINE: VtOptions = { color: false, filterSpeckle: 4, mode: 'spline', cornerThreshold: 60, lengthThreshold: 4, spliceThreshold: 45, precision: 1 };
const LINES: VtOptions = { color: false, filterSpeckle: 2, mode: 'spline', cornerThreshold: 60, lengthThreshold: 4, spliceThreshold: 45, precision: 1 };
/** the working size the subject is found at, px */
export const CUT_WORK = 1024;
/** a mask that holds less of the photo than this found nothing */
export const MIN_SHARE = 0.01;

/** black and white, traced by Potrace: returns the SVG and the threshold used (128 for a photo of paper) */
export async function bwSvg(img: Img, o: BwOptions, p: Imgproc, potrace: Potrace): Promise<{ svg: string; threshold: number }> {
  let pic = img;
  if (o.paper) pic = p.docEnhance(pic, 2); // a photo of paper: the ink found by an adaptive threshold
  const r = p.bw(pic, o.paper ? 128 : o.threshold, o.invert);
  const svg = await potrace(r.img, { turdsize: o.turdsize, turnpolicy: 4, alphamax: o.alphamax, opticurve: o.opticurve ? 1 : 0, opttolerance: o.opttolerance, pathonly: false, extractcolors: false });
  return { svg, threshold: r.threshold };
}

/** U²-Net small's mask of `img` (0 … 255, its size): rembg's input (320 × 320, divided by its largest value, ImageNet's means and
 *  deviations), the network (`run`: the planes in, its first output out), stretched to 0 … 255 and refined by the guided filter */
export async function cutMask(img: Img, p: Imgproc, run: (planes: Float32Array) => Promise<Float32Array>): Promise<Uint8Array> {
  const prob = await run(p.u2Planes(img, 320));
  const m320 = p.u2Mask(prob.subarray(0, 320 * 320));
  const r = Math.max(2, Math.round((3 * Math.max(img.width, img.height)) / 1000));
  return p.guidedAlpha(img, m320, 320, 320, r, 1e-4);
}

/** a clip art's parts (see the head of this file) */
export async function clipParts(img: Img, o: ClipOptions, e: ClipEngines): Promise<ClipResult> {
  const t0 = performance.now();
  const { p, v } = e;
  const sc = Math.min(1, CUT_WORK / Math.max(img.width, img.height));
  let work = sc < 1 ? p.resize(img, img.width * sc, img.height * sc) : { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  const W = work.width, H = work.height;
  let found = false, share = 1, box: [number, number, number, number] = [0, 0, img.width, img.height];
  if (o.cut && e.cut) {
    const m = p.clipMask(await e.cut(work), W, H, Math.max(16, Math.round(0.002 * W * H)), 2);
    share = m.on / (W * H);
    if (share >= MIN_SHARE) {
      work = p.clipApply(work, m.mask); found = true;
      const bb = p.alphaBBox(work, 128);
      if (bb.w > 0 && bb.h > 0) {
        // the subject's box on the photo, a pixel of the working size round it
        const x0 = Math.max(0, Math.floor((bb.x - 1) / sc)), y0 = Math.max(0, Math.floor((bb.y - 1) / sc));
        const x1 = Math.min(img.width, Math.ceil((bb.x + bb.w + 1) / sc)), y1 = Math.min(img.height, Math.ceil((bb.y + bb.h + 1) / sc));
        box = [x0, y0, x1 - x0, y1 - y0];
      }
    }
  }
  e.progress?.('flat');
  // the subject from the photo's own pixels at the clip art's size, with the mask's box resized to it
  const [bx, by, bw0, bh0] = box, t = o.size / Math.max(bw0, bh0);
  const tw = Math.max(8, Math.round(bw0 * t)), th = Math.max(8, Math.round(bh0 * t));
  let pic = p.resize(p.crop(img, bx, by, bw0, bh0), tw, th);
  if (found) {
    const mx = Math.min(W - 1, Math.round(bx * sc)), my = Math.min(H - 1, Math.round(by * sc));
    const mw = Math.max(1, Math.min(W - mx, Math.round(bw0 * sc))), mh = Math.max(1, Math.min(H - my, Math.round(bh0 * sc)));
    pic = p.clipAlpha(pic, p.resize(p.crop(work, mx, my, mw, mh), tw, th));
  }
  // two smoothings: light for the lines, strong for the colours (sizes for 800 px, scaled)
  const k = o.size / 800;
  const light = p.bilateral(pic, Math.max(3, Math.round(5 * k)), 4 * k, 28, 2);
  const strong = p.kuwahara(p.bilateral(pic, Math.round(7 * k), 6 * k, 40, 3), Math.max(2, Math.round(4 * k)));
  const flat = p.clipFlat(strong, o.colors, Math.max(6, Math.round(o.detail * tw * th)), 3);
  const shapes = v.trace(flat.img, SHAPES);
  const silhouette = v.trace(p.clipSilhouette(flat.img), OUTLINE);
  const ink = p.clipLines(light, 1.5 * k, 0.5, Math.max(4, Math.round(0.0002 * tw * th)));
  const lines = ink.on > 0 ? v.trace(ink.img, LINES) : '';
  return { shapes, silhouette, lines, width: tw, height: th, palette: flat.palette, found, share, crop: box, ms: Math.round(performance.now() - t0) };
}
