// PaddleOCR — the second reader of the OCR tab and the Photo Dictionary, for soft photos (owner, 26 Nov 2026: "Ok use
// PaddleOCR fallback for soft photos"): PP-OCRv6's text detector and recogniser (the small ones) — PaddlePaddle's
// models, converted to ONNX by RapidAI and shipped in the RapidOCR 3.10.0 wheel on PyPI (scripts/assets.json) — on ONNX
// Runtime Web. This file is RapidOCR's pipeline around the networks (rapidocr/main.py, ch_ppocr_det, ch_ppocr_rec,
// utils/process_img.py) with its settings (rapidocr/config.yaml): no DOM and no ONNX Runtime import, so the tabs' worker
// (src/workers/paddle.worker.ts), the unit suite and scripts/measure-ocr.mjs run the same code. The pixel work is
// imgproc.wasm's (p_resize_linear, p_net_planes, p_db_boxes, p_crop_quad, p_ctc); RapidOCR in Python is the reference of
// tests/unit/paddle.test.mjs. Two differences, on purpose:
// - no direction classifier (RapidOCR's PP-OCRv4 one, which turns a line it takes for upside down): the tabs set the page
//   upright before it is read (src/lib/upright.ts), and on the photos of scripts/measure-ocr.mjs it turned 134 of 3,611
//   upright lines over — every one then read as garbage ("Sin e t n t", "Plannning"), RapidOCR's own reading too (a line
//   of the checklist fixture at 0.90000963 against its threshold of 0.9);
// - the recogniser reads one line at a time (RapidOCR: six of similar shape padded to the widest) — a phone holds one
//   line's output (up to 19 MB), not six; on one thread a batch is no faster.
import type { Img } from '../wasm/imgproc';

/** imgproc's operations the pipeline needs (synchronous: the worker binds its own instance). */
export interface PaddleOps {
  resizeLinear(img: Img, w: number, h: number): Img;
  netPlanes(img: Img, w: number, h: number, pw?: number): Float32Array;
  dbBoxes(prob: Float32Array, w: number, h: number, dw: number, dh: number, o?: { thresh?: number; boxThresh?: number; unclip?: number; maxCandidates?: number }): Array<{ box: number[]; score: number }>;
  cropQuad(img: Img, quad: number[]): Img | null;
  ctc(probs: Float32Array, T: number, C: number): { cls: Int32Array; prob: Float32Array; step: Int32Array };
}
/** The three networks (ONNX Runtime sessions in the worker; the same models in Node). */
export interface PaddleNets {
  /** the detector on a 1 × 3 × h × w input → its h × w map of how likely each pixel is text */
  det(x: Float32Array, w: number, h: number): Promise<Float32Array>;
  /** the recogniser on 1 × 3 × 48 × w → T steps × C classes of probabilities */
  rec(x: Float32Array, w: number): Promise<{ data: Float32Array; T: number; C: number }>;
}

/** RapidOCR's settings (config.yaml, Global / Det / Rec). */
export const SETTINGS = {
  maxSide: 2000, minSide: 30, minHeight: 30, widthHeightRatio: 8,
  detLimit: 736, thresh: 0.3, boxThresh: 0.5, unclip: 1.6, maxCandidates: 1000,
  recH: 48, recW: 320, textScore: 0.5,
} as const;

export interface PaddleChar { c: string; p: number; x0: number; x1: number }
export interface PaddleLine {
  text: string;
  /** the mean probability of the characters read (CTCLabelDecode) */
  score: number;
  /** TL, TR, BR, BL on the picture given */
  box: number[];
  /** the characters with their probabilities and where they stand along the line (0 … 1 of its length) */
  chars: PaddleChar[];
  /** the line stood up and down: its crop was turned a quarter to the left to be read (get_rotate_crop_image) */
  tall: boolean;
}

/** Python's round(): half to even (int(round(v / 32) * 32) in RapidOCR's resizing). */
export const roundEven = (v: number) => { const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1; };
const to32 = (v: number) => roundEven(v / 32) * 32;
/** The size a photo is read at: at most `maxSide` (reduce_max_side) and at least `minSide` (increase_min_side) a side,
 *  both rounded to 32 — the photo as it is when it fits (resize_image_within_bounds). */
export function boundSize(w: number, h: number): { w: number; h: number } {
  let W = w, H = h;
  if (Math.max(H, W) > SETTINGS.maxSide) {
    const r = SETTINGS.maxSide / (H > W ? H : W);
    H = to32(Math.trunc(H * r)); W = to32(Math.trunc(W * r));
  }
  if (Math.min(H, W) < SETTINGS.minSide) {
    const r = SETTINGS.minSide / (H < W ? H : W);
    H = to32(Math.trunc(H * r)); W = to32(Math.trunc(W * r));
  }
  return { w: W, h: H };
}
/** The detector's input size (DetPreProcess, limit_type "min"): the short side brought up to 736 when shorter, both
 *  sides rounded to 32. */
export function detSize(w: number, h: number): { w: number; h: number } {
  const r = Math.min(h, w) < SETTINGS.detLimit ? SETTINGS.detLimit / (h < w ? h : w) : 1;
  return { w: to32(Math.trunc(w * r)), h: to32(Math.trunc(h * r)) };
}
/** Black rows above and below a picture that is very wide or very low (apply_vertical_padding); `top` rows added. */
export function verticalPadding(w: number, h: number): number {
  if (!(h <= SETTINGS.minHeight || w / h > SETTINGS.widthHeightRatio)) return 0;
  const newH = Math.max(Math.trunc(w / SETTINGS.widthHeightRatio), SETTINGS.minHeight) * 2;
  return Math.trunc(Math.abs(newH - h) / 2);
}
function pad(img: Img, top: number): Img {
  const h = img.height + 2 * top, data = new Uint8ClampedArray(img.width * h * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  data.set(img.data, top * img.width * 4);
  return { data, width: img.width, height: h };
}
/** TextDetector.sorted_boxes: by the top-left corner's y (stable), a new line where it moves 10 px or more from the box
 *  before, then by line and x. */
export function sortedBoxes<T extends { box: number[] }>(boxes: T[]): T[] {
  const byY = boxes.map((b, i) => ({ b, i })).sort((p, q) => p.b.box[1] - q.b.box[1] || p.i - q.i);
  let line = 0;
  const keyed = byY.map((e, k) => { if (k && e.b.box[1] - byY[k - 1].b.box[1] >= 10) line++; return { ...e, line, k }; });
  return keyed.sort((p, q) => p.line - q.line || p.b.box[0] - q.b.box[0] || p.k - q.k).map((e) => e.b);
}
/** The recogniser's resize_norm_img: h high, as wide as the crop's shape asks (at most `maxW`), padded to `padW`. */
function lineInput(ops: PaddleOps, crop: Img, h: number, maxW: number, padW: number): { x: Float32Array; w: number } {
  const want = Math.ceil(h * (crop.width / crop.height)), w = Math.max(1, Math.min(maxW, want));
  return { x: ops.netPlanes(crop, w, h, padW), w };
}

/** The text of a picture read by PaddleOCR, line by line in RapidOCR's order (top to bottom, then left to right).
 *  `onLine(done, total)` tells how far the recogniser has come; `stale()` true ends the reading (null). */
export async function paddleRead(img: Img, nets: PaddleNets, ops: PaddleOps, alphabet: string[], o: { onLine?: (done: number, total: number) => void; stale?: () => boolean; line?: boolean } = {}): Promise<PaddleLine[] | null> {
  const S = SETTINGS, chars = ['', ...alphabet, ' ']; // CTCLabelDecode: the blank first, a space last
  let im = img, rw = 1, rh = 1, top = 0;
  let boxes: Array<{ box: number[]; score: number }>, crops: Array<Img | null>, tall: boolean[];
  if (o.line) {
    // one line already (a camera helper's line read again): the recogniser alone, on the whole picture — RapidOCR without its
    // detector (use_det=False); the detector cut a short line into boxes that overlap, and their texts joined twice what
    // stood in both ("+91 98450" + "0 12345 (M)")
    boxes = [{ box: [0, 0, img.width, 0, img.width, img.height, 0, img.height], score: 1 }]; crops = [img]; tall = [false];
  } else {
    // the photo at most 2000 px a side (and at least 30)
    const b = boundSize(img.width, img.height);
    im = b.w === img.width && b.h === img.height ? img : ops.resizeLinear(img, b.w, b.h);
    rw = img.width / im.width; rh = img.height / im.height;
    top = verticalPadding(im.width, im.height);
    if (top) im = pad(im, top);
    // the detector
    const d = detSize(im.width, im.height);
    if (d.w <= 0 || d.h <= 0) return [];
    const prob = await nets.det(ops.netPlanes(im, d.w, d.h), d.w, d.h);
    if (o.stale?.()) return null;
    boxes = sortedBoxes(ops.dbBoxes(prob, d.w, d.h, im.width, im.height, { thresh: S.thresh, boxThresh: S.boxThresh, unclip: S.unclip, maxCandidates: S.maxCandidates }));
    crops = boxes.map((x) => ops.cropQuad(im, x.box));
    tall = boxes.map((x) => { const q = x.box; return Math.trunc(Math.max(Math.hypot(q[0] - q[6], q[1] - q[7]), Math.hypot(q[2] - q[4], q[3] - q[5]))) >= 1.5 * Math.trunc(Math.max(Math.hypot(q[0] - q[2], q[1] - q[3]), Math.hypot(q[4] - q[6], q[5] - q[7]))); });
  }
  // the recogniser, line by line
  const lines: PaddleLine[] = [];
  for (let i = 0; i < crops.length; i++) {
    o.onLine?.(i, crops.length);
    const c = crops[i];
    if (!c) continue;
    const padW = Math.trunc(S.recH * Math.max(S.recW / S.recH, c.width / c.height));
    const { x, w } = lineInput(ops, c, S.recH, padW, padW);
    const out = await nets.rec(x, padW);
    if (o.stale?.()) return null;
    const r = ops.ctc(out.data, out.T, out.C);
    let text = '', sum = 0;
    const cs: PaddleChar[] = [];
    for (let k = 0; k < r.cls.length; k++) {
      const ch = chars[r.cls[k]] ?? '';
      text += ch; sum += Math.round(r.prob[k] * 1e5) / 1e5;
      // the step's share of the padded input, as a share of the line's own width (x0 … x1 of 0 … 1)
      const step = padW / out.T, a = (r.step[k] * step) / w, z = ((r.step[k] + 1) * step) / w;
      cs.push({ c: ch, p: r.prob[k], x0: Math.min(1, a), x1: Math.min(1, z) });
    }
    const score = r.cls.length ? Math.round((sum / r.cls.length) * 1e5) / 1e5 : 0;
    if (!text.trim() || score < S.textScore) continue;
    // the box on the picture given: the padding off, the scale undone, inside the picture (map_boxes_to_original)
    const q = boxes[i].box.map((v, k) => (k % 2 ? Math.min(img.height, Math.max(0, (v - top) * rh)) : Math.min(img.width, Math.max(0, v * rw))));
    lines.push({ text, score, box: q, chars: cs, tall: tall[i] });
  }
  o.onLine?.(crops.length, crops.length);
  return lines;
}

/** A list mark PaddleOCR reads as a character at the start of a line (●, •, ■, ☐, ✓ …): left out, as the tabs leave
 *  marks out of Tesseract's reading (owner, to-do #18: "no need to keep bullets and indentation in the text"). */
const MARK = /^[•‣⁃⁌⁍∙■-◿☐-☒✓✔✗✘➢➤⦾⦿·‧◦⦁]+\s*/u;

export interface PaddleWord { text: string; conf: number; x0: number; y0: number; x1: number; y1: number }
/** The lines' boxes, upright (x0, y0, x1, y1), for the reading order. */
export const lineBoxes = (lines: PaddleLine[]) => lines.map((l) => { const xs = [l.box[0], l.box[2], l.box[4], l.box[6]], ys = [l.box[1], l.box[3], l.box[5], l.box[7]]; return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
/** How much of each box's height is taken off at its top, its bottom and both ends before the XY-cut (cutInput). */
export const CUT_SHRINK = 0.4;
/** What textcore's XY-cut (t_xycut) is given to order a page of columns: the middle of each line's box — CUT_SHRINK of
 *  its height off at the top and the bottom, as much off at both ends (never past its middle) — and the gaps it needs,
 *  a gutter at least 0.8 and a gap between blocks at least half of that middle's height (the median line). PaddleOCR's
 *  boxes reach past their text (the detector's region is widened by 1.6 × its area over its perimeter), so neighbouring
 *  lines touch and the gap under a title above two columns was narrower than half a box: the XY-cut found no way into
 *  the columns and read them across, line by line (a newsletter's video frame: 192 of its 342 words in order, 322 with
 *  the middles — measured on every photo with columns, docs/BUGHUNT.md). */
export function cutInput(lines: PaddleLine[]): { boxes: number[][]; gx: number; gy: number } {
  const boxes = lineBoxes(lines).map(([x0, y0, x1, y1]) => {
    const m = CUT_SHRINK * (y1 - y0), cx = (x0 + x1) / 2;
    return [Math.min(x0 + m, cx), y0 + m, Math.max(x1 - m, cx), y1 - m];
  });
  const hs = boxes.map((b) => b[3] - b[1]).sort((a, b) => a - b), h = hs.length ? hs[hs.length >> 1] : 10;
  return { boxes, gx: Math.max(3, 0.8 * h), gy: Math.max(2, 0.5 * h) };
}
/** PaddleOCR's lines as a reading of the tabs (src/lib/ocr.ts OcrResult): the text in reading order — RapidOCR's (top to
 *  bottom, then left to right), or `order` (a page of columns: textcore's XY-cut of the lines' boxes, column by column)
 *  —, lines side by side joined into one, a list mark at a line's start left out; each word with a confidence (its
 *  characters' mean probability × 100) and its box on the picture (where its characters stand along the line); the
 *  reading's confidence the mean of its words'; and its lines, all of one paragraph (the text has no blank lines). */
export function paddleResult(lines: PaddleLine[], o: { order?: number[] } = {}): { text: string; confidence: number; words: PaddleWord[]; lines: Array<{ w0: number; w1: number; para: number; block: number }> } {
  const bb = lineBoxes(lines);
  const order = o.order && o.order.length === lines.length ? o.order : lines.map((_, i) => i);
  const rows: number[][] = [];
  for (const i of order) {
    const row = rows[rows.length - 1], last = row ? row[row.length - 1] : -1;
    // the next box on the same row: it starts right of the last one and its middle lies within that one's height
    const mid = (bb[i][1] + bb[i][3]) / 2;
    if (row && bb[i][0] >= bb[last][2] - 0.5 * (bb[last][3] - bb[last][1]) && mid >= bb[last][1] && mid <= bb[last][3]) row.push(i);
    else rows.push([i]);
  }
  const words: PaddleWord[] = [], text: string[] = [], out: Array<{ w0: number; w1: number; para: number; block: number }> = [];
  for (const row of rows) {
    const parts: string[] = [], w0 = words.length;
    row.forEach((i, k) => {
      const l = lines[i];
      let chars = l.chars;
      if (k === 0) { const m = MARK.exec(l.text); if (m) { let cut = m[0].length; chars = chars.filter((c) => (cut -= c.c.length) < 0); } }
      // the words of the line and where they stand along it
      const at = (f: number, top: boolean) => {
        const q = l.box, a = top ? 0 : 6, b = top ? 2 : 4;
        return [q[a] + (q[b] - q[a]) * f, q[a + 1] + (q[b + 1] - q[a + 1]) * f];
      };
      let cur: PaddleChar[] = [];
      const flush = () => {
        if (!cur.length) return;
        const t = cur.map((c) => c.c).join(''), conf = (100 * cur.reduce((s, c) => s + c.p, 0)) / cur.length;
        let box: number[];
        if (l.tall) box = bb[i];
        else {
          const f0 = cur[0].x0, f1 = cur[cur.length - 1].x1, p = [at(f0, true), at(f1, true), at(f0, false), at(f1, false)];
          box = [Math.min(...p.map((v) => v[0])), Math.min(...p.map((v) => v[1])), Math.max(...p.map((v) => v[0])), Math.max(...p.map((v) => v[1]))];
        }
        words.push({ text: t, conf, x0: Math.round(box[0]), y0: Math.round(box[1]), x1: Math.round(box[2]), y1: Math.round(box[3]) });
        parts.push(t);
        cur = [];
      };
      for (const c of chars) { if (/\s/u.test(c.c)) flush(); else cur.push(c); }
      flush();
    });
    if (parts.length) { text.push(parts.join(' ')); out.push({ w0, w1: words.length, para: 0, block: 0 }); }
  }
  // the lines of the text (one paragraph: PaddleOCR's text has no blank lines) — the OCR tab sets its lists out by them
  return { text: text.join('\n'), confidence: words.length ? words.reduce((s, w) => s + w.conf, 0) / words.length : 0, words, lines: out };
}
