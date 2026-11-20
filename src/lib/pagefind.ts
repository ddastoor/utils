// The Doc Scanner's page finder (docs/WASM-AUDIT.md, entry 121): DocCornerNet LEAN — a 1.9 MB network that gives the
// four corners of a document in a photo and how sure it is that there is one (scanic-ml 0.2.0, MIT) — run by ONNX
// Runtime Web (Microsoft's WebAssembly build, the one the Text-to-Speech tab ships). This file is the glue on both
// sides of the network: no DOM and no ONNX Runtime import, so the worker and the unit suite share it.

/** The model looks at the whole photo squeezed to 224 × 224 (imgproc's area resize — how its training data was made). */
export const SIZE = 224;
/** Below this P(document) the model's corners are not used (its own threshold; below it they are mostly wrong). */
export const MIN_SCORE = 0.5;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

/** 224 × 224 RGBA pixels → the model's input: NHWC float32, RGB, x/255 then ImageNet mean and deviation. */
export function modelInput(rgba: ArrayLike<number>): Float32Array {
  if (rgba.length !== SIZE * SIZE * 4) throw new Error(`The page finder needs ${SIZE} × ${SIZE} pixels.`);
  const x = new Float32Array(SIZE * SIZE * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    x[j] = (rgba[i] / 255 - MEAN[0]) / STD[0];
    x[j + 1] = (rgba[i + 1] / 255 - MEAN[1]) / STD[1];
    x[j + 2] = (rgba[i + 2] / 255 - MEAN[2]) / STD[2];
  }
  return x;
}

export interface Found { corners: number[]; score: number }

/** The model's outputs (8 coordinates TL, TR, BR, BL as fractions of the photo; one logit) → corners and P(document). */
export function readOutput(outs: Record<string, { data: ArrayLike<number | bigint> }>): Found | null {
  let c: number[] | null = null, logit: number | null = null;
  for (const k of Object.keys(outs)) {
    const d = Array.from(outs[k].data, Number);
    if (d.length === 8) c = d; else if (d.length === 1) logit = d[0];
  }
  if (!c || logit === null || !c.every(Number.isFinite) || !Number.isFinite(logit)) return null;
  return { corners: c, score: 1 / (1 + Math.exp(-logit)) };
}

const cross = (q: number[], a: number, b: number, c: number) =>
  (q[b * 2] - q[a * 2]) * (q[c * 2 + 1] - q[a * 2 + 1]) - (q[b * 2 + 1] - q[a * 2 + 1]) * (q[c * 2] - q[a * 2]);

/** Corners as fractions (TL, TR, BR, BL) of a w × h photo that make a page: a convex four-sided shape, corners in the
    order of going round it clockwise on screen, covering at least 2 % of the photo. */
export function isPageQuad(q: number[], w = 1, h = 1): boolean {
  if (q.length !== 8 || !q.every(Number.isFinite)) return false;
  const p = q.map((v, i) => v * (i % 2 ? h : w));
  const turns = [0, 1, 2, 3].map((i) => cross(p, i, (i + 1) % 4, (i + 2) % 4));
  if (!turns.every((t) => t > 0)) return false; // y grows downwards: clockwise on screen = positive cross products
  let area = 0;
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; area += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  return Math.abs(area) / 2 >= 0.02 * w * h;
}

/** Corners kept inside the photo (the model may put one a little outside when a page runs off the edge). */
export const clampQuad = (q: number[]) => q.map((v) => Math.min(1, Math.max(0, v)));

export type Source = 'model' | 'outline' | 'whole';
/** A little in from the edges, so all four handles can be grabbed. */
export const WHOLE = [0.02, 0.02, 0.98, 0.02, 0.98, 0.98, 0.02, 0.98];

/** The corners a new page starts with: the model's when it is sure there is a document and they make a page; else the
    page outline imgproc found (Otsu + the largest region — its confidence > 0); else the whole photo. */
export function startQuad(model: Found | null, outline: { corners: number[]; confidence: number } | null, w: number, h: number): { quad: number[]; from: Source } {
  if (model && model.score >= MIN_SCORE) {
    const q = clampQuad(model.corners);
    if (isPageQuad(q, w, h)) return { quad: q, from: 'model' };
  }
  if (outline && outline.confidence > 0) {
    const q = clampQuad(outline.corners.map((v, k) => v / (k % 2 ? h : w)));
    if (isPageQuad(q, w, h)) return { quad: q, from: 'outline' };
  }
  return { quad: WHOLE.slice(), from: 'whole' };
}
