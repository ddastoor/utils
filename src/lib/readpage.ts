// One reading path for the OCR tab and the Photo Dictionary (to-do #18; owner, 26 Nov 2026: "can u make the ocr app's
// ocr capability the same quality as the Photo Dictionary's" — and: "One shared reading path is fine.. but make sure no
// functionality is compramised.. the high quality of the ocr is paramount !!!"). Every step either tab took is here, and
// each tab asks for its own (`ReadOptions`):
//   the picture turned as the reader turned it (OCR tab: the buttons) → at most 3000 px → with the clean-up: the page
//   found and straightened (src/lib/pagecrop.ts: the Kindle finder, the Doc Scanner's network where its outline is not a
//   page's) → the text set upright and level (src/lib/upright.ts; not when turned by hand) → with the clean-up: (OCR tab)
//   light text on a dark ground turned dark on light, (Photo Dictionary) a screen's moiré blurred (Photo Dictionary: "Photo of a screen"), the document
//   clean-up (imgproc docEnhance), a watermark taken out (p_clear_wash), ruled lines and list marks cleared (p_clear_marks: the owner — "no need to keep
//   bullets and indentation in the text;.. but the ocr should not get confused by them") → read → a page found that
//   gave fewer than 25 words: the whole photo read too, the better kept → (OCR tab) a poor reading tried the three other
//   ways round on a smaller copy, a way that reads clearly better taken.
// The engines are passed in (`ReadEngines`): the tabs use imgproc's worker and Tesseract.js; scripts/measure-ocr.mjs and
// the unit suite run exactly this code on imgproc.wasm and Tesseract in Node.
import { imgproc, type Img } from '../wasm/imgproc';
import { textcore } from '../wasm/textcore';
import { recognize, POOR, type OcrLang, type OcrResult, type Layout } from './ocr';
import { paddleResult, lineBoxes, cutGaps, type PaddleLine } from './paddle';
import type { PaddleProgress } from './paddle-client';
import { straighten, type PageOps } from './pagecrop';
import { uprightByReading, score, ROT, type TurnOps } from './upright';

/** imgproc's operations the reading uses — the worker's in the tabs, the module's in Node. */
export interface ReadOps extends PageOps, TurnOps {
  histogram(img: Img): Uint32Array | Promise<Uint32Array>;
  invert(img: Img): Img | Promise<Img>;
  blur(img: Img, sigma: number): Img | Promise<Img>;
  docEnhance(img: Img, mode: 0 | 1 | 2): Img | Promise<Img>;
  clearMarks(img: Img, what: number): { img: Img; lines: number; inner: number; marks: number; columns: number } | Promise<{ img: Img; lines: number; inner: number; marks: number; columns: number }>;
  /** A watermark washed over the page taken out (p_clear_wash): its broad strokes of a second, lighter level of ink. */
  clearWash?(img: Img): { img: Img; painted: number } | Promise<{ img: Img; painted: number }>;
}
export interface ReadEngines {
  ops: ReadOps;
  /** Tesseract: the picture read in the language(s) given, laid out as a page or as one block (src/lib/ocr.ts). */
  read(img: Img, lang: OcrLang, onProgress: ((p: number, status: string) => void) | undefined, layout: Layout): Promise<OcrResult>;
  /** PaddleOCR, the second reader for soft photos (src/lib/paddle.ts in src/workers/paddle.worker.ts): the lines of a
   *  picture (null: ended because `stale()` said so). */
  paddle?(img: Img, progress?: (p: PaddleProgress) => void, stale?: () => boolean): Promise<PaddleLine[] | null>;
  /** textcore's XY-cut: the reading order of boxes (PaddleOCR's lines on a page of columns). */
  xycut?(boxes: number[][], gx: number, gy: number): Promise<number[]> | number[];
}
const op = <T>(name: string) => (...a: any[]) => imgproc(name as any, ...a) as Promise<T>;
export const browserEngines: ReadEngines = {
  ops: {
    resize: op('resize'), pageQuad: op('pageQuad'), flatShare: op('flatShare'), warp: op('warp'), quadSteps: op('quadSteps'), refineQuad: op('refineQuad'), quadText: op('quadText'), clearBorder: op('clearBorder'),
    // the Doc Scanner's network: its worker and ONNX Runtime are fetched the first time a photo needs them
    docCorners: async (small: Img) => (await import('./pagefind-client')).findPage((await imgproc('resizeArea', small, 224, 224)).data),
    textTurns: op('textTurns'), textLines: op('textLines'), orient: op('orient'), rotate: op('rotate'), crop: op('crop'), inkWindow: op('inkWindow'),
    histogram: op('histogram'), invert: op('invert'), blur: op('blur'), docEnhance: op('docEnhance'), clearMarks: op('clearMarks'), clearWash: op('clearWash'),
  } as ReadOps,
  read: (img, lang, onProgress, layout) => recognize(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), lang, onProgress, layout),
  // the worker and its 31.7 MB of models are fetched the first time a soft photo needs them
  paddle: (img, progress, stale) => import('./paddle-client').then((m) => m.paddleLines(img, progress, stale)),
  xycut: async (boxes, gx, gy) => (await textcore()).xycut(boxes, gx, gy).order,
};
/** How a page is read (to-do #18): Tesseract.js reads one block unless told — straight across a newsletter's two columns,
 *  "meaning helmsman or pilot. K8s as an Note. The TTS Handbook documents the". A page whose text stands in columns
 *  (imgproc counts the gutters: p_clear_marks) is read as a page — Tesseract's layout analysis finds the columns and
 *  reads each on its own; any other as one block, which reads a soft photo, a form and a table's rows better (measured:
 *  scripts/measure-ocr.mjs). The quick readings that decide which way up a page stands read one block: text lying
 *  sideways is garbage there (laid out as a page, Tesseract turns sideways lines by itself and a sideways copy can read as
 *  well as the upright one). */
export const layoutFor = (columns: number): Layout => (columns >= 2 ? 'page' : 'block');
export const GLANCE_LAYOUT: Layout = 'block';

export interface ReadOptions {
  lang: OcrLang;
  /** The clean-up of a photographed page (the OCR tab's switch; always on in the Photo Dictionary): the page found and
   *  straightened, the document clean-up, ruled lines and list marks cleared. Off: the picture is read as it is. */
  clean: boolean;
  /** A photo of a screen (Kindle, phone, monitor): its moiré blurred first (the Photo Dictionary's switch). */
  screen?: boolean;
  /** A dark picture (light text on a dark ground: a screenshot in dark mode, chalk on a board) turned dark on light
   *  before the clean-up — the OCR tab. The Photo Dictionary never did: a whole photo of a Kindle in its black body on a
   *  dark desk is as dark, and turned over it would not read. */
  invertDark?: boolean;
  /** Set the text upright and level first (off once the reader has turned the picture by hand). */
  auto: boolean;
  /** Quarter turns to the right the reader gave the picture (the OCR tab's buttons). */
  turns?: number;
  /** A poor reading tried the three other ways round (the OCR tab). */
  retryTurns?: boolean;
  /** An unsure reading of a page with rules, list marks or columns read again laid out the other way, the better kept
   *  (default: on). */
  again?: boolean;
  /** Tesseract's progress, for the main readings (not the quick ones that decide which way up). */
  onProgress?: (p: number, status: string) => void;
  /** Told when the poor reading is tried the other ways round. */
  onRetry?: () => void;
  /** A newer picture or the tab left: the reading stops (null). */
  stale?: () => boolean;
  /** A soft photo (Tesseract's reading unsure: `soft`) read by PaddleOCR too, the better reading kept (default: on). */
  second?: boolean;
  /** Told when PaddleOCR reads the photo again (null), and how far it has come (its models fetched, its lines read). */
  onSecond?: (p: PaddleProgress | null) => void;
}
export interface PageReading {
  r: OcrResult;
  /** the picture as it was read (the words' boxes are on it) */
  img: Img;
  /** the same picture before the clean-up: the page straightened, set upright and level (the words' boxes fit it too) */
  pre: Img;
  /** the picture to show in place of the photo (the page straightened, levelled, turned) — null: the photo as it is */
  shown: Img | null;
  /** the page was found and straightened (and how) */
  page: boolean;
  by?: 'outline' | 'network';
  /** what was done to set the text upright */
  up: { turns: number; slant: number };
  /** the poor reading's retry: the quarter turns to the right (from the photo as given) that read clearly better; null:
   *  not turned */
  turned: number | null;
  /** what the clean-up cleared: pixels of ruled lines (`inner`: of those inside the page, not along its edges), list marks,
   *  pixels of a watermark */
  cleared: { lines: number; inner: number; marks: number; wash: number };
  /** the columns of text found (2 and more: read as a page) */
  columns: number;
  /** how the reading kept was laid out */
  layout: Layout;
  /** the reader whose text was kept: Tesseract, or PaddleOCR (the photo was soft and PaddleOCR read it better) */
  engine: 'tesseract' | 'paddle';
  /** PaddleOCR read the photo too (it was soft); `secondError`: it could not (its models not fetched …) */
  second: boolean;
  secondError?: string;
}

/** Light text on a dark ground (a screenshot in dark mode, chalk on a board, a Kindle in dark mode): the clean-up expects
 *  dark text on paper. `luma`: the histogram's luma part (256 counts). */
export const isDark = (luma: ArrayLike<number>) => {
  let n = 0, sum = 0;
  for (let v = 0; v < 256; v++) { n += luma[v]; sum += v * luma[v]; }
  return n > 0 && sum / n < 110;
};
/** Tesseract reads x-heights of 20 – 30 px best: a photo above this many pixels a side is made smaller first. */
export const MAX_SIDE = 3000;
/** A page found that gives fewer words than this was not the page: the whole photo is read too. */
export const FEW = 25;
/** A page with a structure — a table's or a form's rules, a list's marks, columns — read less surely than this
 *  (Tesseract's mean confidence) is read again laid out the other way — one block ⇄ a page — and the one that reads more
 *  words surely is kept (`score`, by at least AGAIN_BY): on a soft photo Tesseract laid out as one block can lose a whole
 *  line (a form's title, a table's row) that its layout analysis reads, and the other way round. Measured on the photos of
 *  scripts/measure-ocr.mjs: it read 4 document photos better, none worse — and never changed a page of plain text (a
 *  Kindle's), which is read once (a second reading costs a phone seconds). Sharp photos read at 87 – 95 %. */
export const AGAIN = 85, AGAIN_BY = 1.03;

/** PaddleOCR, the second reader (in progress: off until its rule is measured — the owner's rule for every change to the
 *  reading): which picture it reads, when a reading is soft, which one is kept. */
export const SECOND_ON = false;
export const SECOND_READS: 'pre' | 'img' = 'pre';
export const SOFT = 88;
export const soft = (r: OcrResult) => r.confidence < SOFT;
export const secondBetter = (paddle: OcrResult, tess: OcrResult) => score(paddle) > score(tess) * 1.1;

/** PaddleOCR's confidences run higher than Tesseract's (a character's probability against a word's certainty): its
 *  reading reads poorly below PADDLE_POOR, and a word of it is unsure below PADDLE_UNSURE (measured). */
export const PADDLE_POOR = 80, PADDLE_UNSURE = 85;
/** A reading that reads poorly: both tabs say a sharper photo would read better. */
export const readsPoorly = (res: Pick<PageReading, 'r' | 'engine'>) => res.r.confidence < (res.engine === 'paddle' ? PADDLE_POOR : POOR);
/** A word its reader is unsure of (the OCR tab marks it on the picture). */
export const unsureWord = (conf: number, engine: PageReading['engine']) => conf < (engine === 'paddle' ? PADDLE_UNSURE : 60);
/** What the second reader is doing, in words (both tabs' progress line): null = starting. */
export function secondWords(q: PaddleProgress | null): { p: number | null; text: string } {
  if (!q) return { p: null, text: 'The photo is soft — reading it again with PaddleOCR, the second reader…' };
  const mb = (n: number) => (n / 1e6).toFixed(1);
  if (q.phase === 'fetch') return { p: q.total ? q.done / q.total : null, text: `Fetching PaddleOCR, the second reader (${mb(q.done)} of ${mb(q.total)} MB, once a visit)…` };
  return { p: q.total ? q.done / q.total : null, text: `PaddleOCR is reading the soft photo: line ${Math.min(q.done + 1, Math.max(1, q.total))} of ${q.total}…` };
}

export async function readPage(photo: Img, o: ReadOptions, eng: ReadEngines = browserEngines): Promise<PageReading | null> {
  const { ops } = eng, live = () => !o.stale?.();
  const cap = async (im: Img, L: number) => { const s = Math.max(im.width, im.height); return s > L ? ops.resize(im, Math.round((im.width * L) / s), Math.round((im.height * L) / s)) : im; };
  /** the clean-up for reading; `final`: the picture read in full — ruled lines and list marks cleared too */
  const enhance = async (im: Img, final: boolean) => {
    if (!o.clean) return { img: im, lines: 0, inner: 0, marks: 0, wash: 0, columns: 1 };
    let x = im;
    if (o.invertDark && isDark((await ops.histogram(x)).subarray(768, 1024))) x = await ops.invert(x);
    if (o.screen) x = await ops.blur(x, 1.1);
    x = await ops.docEnhance(x, 1);
    if (!final) return { img: x, lines: 0, inner: 0, marks: 0, wash: 0, columns: 1 };
    // a watermark washed over the page (a second, lighter level of ink in broad strokes): laid out as a page, Tesseract
    // took the text under CONFIDENTIAL's big letters for a picture and left a paragraph out
    const wsh = ops.clearWash ? await ops.clearWash(x) : null;
    if (wsh) x = wsh.img;
    const c = await ops.clearMarks(x, 7); // the lines, the marks, and the columns counted
    return { img: c.img, lines: c.lines, inner: c.inner, marks: c.marks, wash: wsh?.painted ?? 0, columns: c.columns };
  };
  /** a quick reading, to decide which way up the text stands (the clean-up without clearing marks; no progress shown) */
  const glance = async (im: Img) => eng.read((await enhance(im, false)).img, o.lang, undefined, GLANCE_LAYOUT);
  const prepare = async (from: Img, t: number, straight: boolean, auto: boolean) => {
    let img = await cap(t ? await ops.orient(from, ROT[t]) : from, MAX_SIDE), page = false, by: PageReading['by'];
    if (o.clean && straight) {
      const s = await straighten(img, ops).catch(() => null); // no page: the photo as it is
      if (s?.found) { img = s.img; page = true; by = s.by; }
    }
    let up = { turns: 0, slant: 0 };
    if (auto) {
      const u = await uprightByReading(img, glance, ops).catch(() => null);
      if (u && (u.turns || u.slant)) { img = u.img; up = { turns: u.turns, slant: u.slant }; }
    }
    const shown = page || up.turns || up.slant ? img : null;
    const e = await enhance(img, true);
    return { img: e.img, pre: img, shown, page, by, up, cleared: { lines: e.lines, inner: e.inner, marks: e.marks, wash: e.wash }, columns: e.columns };
  };
  const t0 = ((o.turns ?? 0) % 4 + 4) % 4;
  let p = await prepare(photo, t0, true, o.auto);
  if (!live()) return null;
  let r = await eng.read(p.img, o.lang, o.onProgress, layoutFor(p.columns));
  if (!live()) return null;
  // a page found that gave little (it was not the page): the whole photo is read too, and the better reading kept
  if (p.page && r.words.length < FEW) {
    const w = await prepare(photo, t0, false, o.auto);
    if (!live()) return null;
    const r2 = await eng.read(w.img, o.lang, o.onProgress, layoutFor(w.columns));
    if (!live()) return null;
    if (r2.words.length > r.words.length) { r = r2; p = w; }
  }
  let layout = layoutFor(p.columns);
  if ((o.again ?? true) && r.confidence < AGAIN && (p.cleared.inner > 0 || p.cleared.marks > 0 || p.columns >= 2)) {
    const other: Layout = layout === 'block' ? 'page' : 'block', r2 = await eng.read(p.img, o.lang, o.onProgress, other);
    if (!live()) return null;
    if (score(r2) > score(r) * AGAIN_BY) { r = r2; layout = other; }
  }
  let turned: number | null = null;
  if (o.retryTurns && r.confidence < POOR) {
    // sideways or upside down after all? A smaller copy read each other way round; a way that reads clearly better is taken
    o.onRetry?.();
    const small = await cap(photo, 1200), cur = (t0 + p.up.turns) % 4;
    let best = { t: cur, conf: r.confidence };
    for (const k of [1, 3, 2]) {
      const tt = (cur + k) % 4, q = await eng.read((await prepare(small, tt, true, false)).img, o.lang, undefined, GLANCE_LAYOUT);
      if (!live()) return null;
      if (q.confidence > best.conf) best = { t: tt, conf: q.confidence };
    }
    if (best.t !== cur && best.conf >= POOR && best.conf >= r.confidence + 20) {
      p = await prepare(photo, best.t, true, false);
      if (!live()) return null;
      r = await eng.read(p.img, o.lang, o.onProgress, (layout = layoutFor(p.columns)));
      if (!live()) return null;
      turned = best.t;
    }
  }
  // a soft photo: PaddleOCR reads the page too (the page as Tesseract read it), and the reading with more words read
  // surely is kept (owner, 26 Nov 2026: "Ok use PaddleOCR fallback for soft photos")
  let engine: PageReading['engine'] = 'tesseract', second = false, secondError: string | undefined;
  if ((o.second ?? SECOND_ON) && eng.paddle && soft(r)) {
    second = true;
    o.onSecond?.(null);
    const pic = SECOND_READS === 'pre' ? p.pre : p.img;
    const lines = await eng.paddle(pic, (q) => { if (live()) o.onSecond?.(q); }, () => !live()).catch((e) => { secondError = String((e as Error)?.message ?? e); return null; });
    if (!live()) return null;
    if (lines?.length) {
      let order: number[] | undefined;
      if (p.columns >= 2 && lines.length > 1 && eng.xycut) { const bb = lineBoxes(lines), g = cutGaps(bb); order = await eng.xycut(bb, g.gx, g.gy); }
      const r2 = paddleResult(lines, { order });
      if (secondBetter(r2, r)) { r = r2; engine = 'paddle'; }
    }
  }
  return { r, img: p.img, pre: p.pre, shown: p.shown, page: p.page, by: p.by, up: p.up, turned, cleared: p.cleared, columns: p.columns, layout, engine, second, secondError };
}
