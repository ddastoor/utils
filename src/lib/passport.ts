// Passport photo engine. Analysis: MediaPipe Face Landmarker (478 points) on a ≤1024 px copy → eye centres, chin,
// tilt; crown (top of hair) from the person mask scanned in C. Layout: scale so chin-to-crown = the preset's head
// height, crown at a fixed share of the free space, centred between the eyes, tilt removed. Build: only the crop region
// is processed at full resolution — new background (guided-filter matte in imgproc.wasm), then one homography warp
// straightens, scales and crops in a single sampling step.
import { faceLandmarker, toImageData } from './mediapipe';
import { personMask } from './segment';
import { imgproc, imgprocDirect, type Img } from '../wasm/imgproc';
import type { PhotoSpec } from './passport-specs';

export const DPI = 300;
const PPM = DPI / 25.4; // pixels per mm at 300 dpi
type P = [number, number];
export interface Analysis { w: number; h: number; eyeL: P; eyeR: P; chin: P; crown: P; roll: number; crownFromMask: boolean }
export interface Adjust { zoom: number; dx: number; dy: number } // zoom: head size ×, dx/dy: mm in the output

/** Find the face. Coordinates are in source pixels. Throws if there is no face. */
export async function analyse(img: Img): Promise<Analysis> {
  const ip = await imgprocDirect();
  const s = Math.min(1, 1024 / Math.max(img.width, img.height));
  const small = s < 1 ? ip.resize(img, Math.round(img.width * s), Math.round(img.height * s)) : img;
  const fl = await faceLandmarker();
  const r = fl.detect(toImageData(small));
  if (!r.faceLandmarks?.length) throw new Error('No face found. Use a front-facing photo with the whole head visible and good light.');
  // the largest face
  const faces = r.faceLandmarks.map((lm) => ({ lm, size: Math.abs(lm[152].y - lm[10].y) })).sort((a, b) => b.size - a.size);
  const lm = faces[0].lm;
  const at = (i: number): P => [lm[i].x * img.width, lm[i].y * img.height];
  const avg = (...p: P[]): P => [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
  const eyeL = lm.length > 473 ? at(468) : avg(at(33), at(133)), eyeR = lm.length > 473 ? at(473) : avg(at(362), at(263));
  const [a, b] = eyeL[0] < eyeR[0] ? [eyeL, eyeR] : [eyeR, eyeL];
  const roll = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const chin = at(152), brow = at(10);
  const faceH = Math.hypot(chin[0] - brow[0], chin[1] - brow[1]);
  // crown: top of the person mask in a band over the face; sanity-checked against face proportions
  let crown: P = [brow[0] - (chin[0] - brow[0]) * 0.28, brow[1] - (chin[1] - brow[1]) * 0.28], fromMask = false;
  try {
    const pm = await personMask(small);
    const sx = pm.w / img.width, sy = pm.h / img.height, cx = (a[0] + b[0]) / 2, half = Math.abs(b[0] - a[0]) * 0.5;
    const top = ip.maskTop(pm.mask, pm.w, pm.h, (cx - half) * sx, (cx + half) * sx, 128);
    if (top >= 0) {
      const ty = top / sy, gap = brow[1] - ty;
      if (gap > faceH * 0.08 && gap < faceH * 0.75) { crown = [cx, ty]; fromMask = true; }
    }
  } catch { /* fall back to proportions */ }
  return { w: img.width, h: img.height, eyeL: a, eyeR: b, chin, crown, roll, crownFromMask: fromMask };
}

/** Where to cut: quad (TL, TR, BR, BL) in source px + output size + achieved measurements in mm. */
export function layout(an: Analysis, spec: Pick<PhotoSpec, 'w' | 'h' | 'head' | 'eyes'>, adj: Adjust = { zoom: 1, dx: 0, dy: 0 }) {
  const outW = Math.round(spec.w * PPM), outH = Math.round(spec.h * PPM);
  const headMm = (spec.head ? (spec.head[0] + spec.head[1]) / 2 : spec.h * 0.7) * adj.zoom;
  const E: P = [(an.eyeL[0] + an.eyeR[0]) / 2, (an.eyeL[1] + an.eyeR[1]) / 2];
  const c = Math.cos(-an.roll), s = Math.sin(-an.roll);
  const up = (p: P): P => [E[0] + (p[0] - E[0]) * c - (p[1] - E[1]) * s, E[1] + (p[0] - E[0]) * s + (p[1] - E[1]) * c]; // into the upright frame
  const back = (p: P): P => [E[0] + (p[0] - E[0]) * Math.cos(an.roll) - (p[1] - E[1]) * Math.sin(an.roll), E[1] + (p[0] - E[0]) * Math.sin(an.roll) + (p[1] - E[1]) * Math.cos(an.roll)];
  const chin = up(an.chin), crown = up(an.crown), eye = E;
  const headPx = chin[1] - crown[1];
  const k = headPx / (headMm * PPM); // source px per output px
  // vertical placement: where the rule gives an eye height (e.g. US 28–35 mm from the bottom) aim for its middle;
  // otherwise leave 35 % of the free height above the crown (ICAO-style: head slightly above centre)
  const eyeBelowCrownMm = (eye[1] - crown[1]) / k / PPM;
  const topMm = (spec.eyes ? spec.h - (spec.eyes[0] + spec.eyes[1]) / 2 - eyeBelowCrownMm : (spec.h - headMm) * 0.35) + adj.dy;
  const top = crown[1] - topMm * PPM * k, left = eye[0] - (outW * k) / 2 - adj.dx * PPM * k;
  const W = outW * k, H = outH * k;
  const quad = [back([left, top]), back([left + W, top]), back([left + W, top + H]), back([left, top + H])].flat();
  return {
    quad, outW, outH, k,
    headMm, eyesFromBottomMm: (top + H - eye[1]) / k / PPM, topMm,
    fits: quad.every((v, i) => (i % 2 ? v >= -0.02 * an.h && v <= an.h * 1.02 : v >= -0.02 * an.w && v <= an.w * 1.02)),
  };
}

const rgbOf = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Full-resolution passport photo (Img at 300 dpi size) with the background replaced by bgHex. */
export async function buildPhoto(src: Img, an: Analysis, spec: Pick<PhotoSpec, 'w' | 'h' | 'head' | 'eyes'>, bgHex: string, adj: Adjust): Promise<Img> {
  const L = layout(an, spec, adj);
  // 1. crop the region the quad covers (+ margin), never more than ~2.2× the output resolution
  const xs = L.quad.filter((_, i) => i % 2 === 0), ys = L.quad.filter((_, i) => i % 2 === 1);
  const mx = (Math.max(...xs) - Math.min(...xs)) * 0.06, my = (Math.max(...ys) - Math.min(...ys)) * 0.06;
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - mx)), y0 = Math.max(0, Math.floor(Math.min(...ys) - my));
  const x1 = Math.min(src.width, Math.ceil(Math.max(...xs) + mx)), y1 = Math.min(src.height, Math.ceil(Math.max(...ys) + my));
  let region = await imgproc('crop', src, x0, y0, x1 - x0, y1 - y0);
  let quad = L.quad.map((v, i) => v - (i % 2 ? y0 : x0));
  const f = L.k > 2.2 ? 2.2 / L.k : 1;
  if (f < 1) { region = await imgproc('resize', region, Math.max(1, Math.round(region.width * f)), Math.max(1, Math.round(region.height * f))); quad = quad.map((v) => v * f); }
  // 2. new background on the region (segmentation re-run on the region for the best edge)
  const pm = await personMask(region);
  const alpha = await imgproc('guidedAlpha', region, pm.mask, pm.w, pm.h, Math.max(2, Math.round(Math.max(region.width, region.height) / 160)), 1e-4);
  const rgb = rgbOf(bgHex);
  const clean = await imgproc('composite', region, alpha, (rgb[0] << 16) | (rgb[1] << 8) | rgb[2], 0, false);
  // 3. straighten + scale + crop in one bilinear warp (source ≤ 2.2× output, so no aliasing)
  return imgproc('warpFill', clean, quad, L.outW, L.outH, rgb);
}

/** Print sheet (4×6 in landscape or A4 portrait) at 300 dpi with as many copies as fit and light cut guides. */
export function printSheet(photo: Img, paper: '4x6' | 'a4'): Img {
  const W = paper === '4x6' ? 1800 : 2480, H = paper === '4x6' ? 1200 : 3508, gap = Math.round(2 * PPM), margin = Math.round(3 * PPM);
  const cols = Math.max(1, Math.floor((W - 2 * margin + gap) / (photo.width + gap))), rows = Math.max(1, Math.floor((H - 2 * margin + gap) / (photo.height + gap)));
  const c = new OffscreenCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const pc = new OffscreenCanvas(photo.width, photo.height); pc.getContext('2d')!.putImageData(toImageData(photo), 0, 0);
  const ox = Math.round((W - cols * photo.width - (cols - 1) * gap) / 2), oy = Math.round((H - rows * photo.height - (rows - 1) * gap) / 2);
  g.strokeStyle = '#c8c8c8'; g.lineWidth = 1;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const x = ox + q * (photo.width + gap), y = oy + r * (photo.height + gap);
    g.drawImage(pc, x, y);
    g.strokeRect(x - 0.5, y - 0.5, photo.width + 1, photo.height + 1);
  }
  const d = g.getImageData(0, 0, W, H);
  return { data: d.data, width: W, height: H, copies: rows * cols } as Img & { copies: number };
}
