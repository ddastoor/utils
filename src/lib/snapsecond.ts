// The camera helpers' second look (Wi-Fi QR from a router sticker, Visiting Card → Contact): a line of a photo Tesseract was
// unsure of, read again by PaddleOCR, the second reader (src/lib/paddle.ts in its worker) — for a value where one character
// read wrong makes it useless (a password, a phone number, an e-mail address). The surer of the two readings is the one whose
// words are more often right at their reader's confidence (`secondBetter` of the reading path).
import type { Line } from './snaptext';
import type { Img } from '../wasm/imgproc';

/** Tesseract's confidence under which a value's line is read again */
export const SURE = 90;
/** The least confidence of a line's words. */
export const leastConf = (l: Line) => Math.min(...l.words.map((w) => w.conf));

/** The line's crop of the picture read (with a margin of 0.6 line heights) read by PaddleOCR: its text, its least score (0 – 1);
 *  null when it read nothing, the crop is too small, or the reading was given up. `again` names the step in the progress
 *  ("reading the label again"). */
export async function secondLook(img: Img, l: Line, stale: () => boolean, onProgress?: (p: number | null, text: string) => void, again = 'reading the line again'): Promise<{ text: string; score: number } | null> {
  const m = Math.round(l.h * 0.6);
  const x0 = Math.max(0, Math.round(l.box[0] - m)), y0 = Math.max(0, Math.round(l.box[1] - m)), x1 = Math.min(img.width, Math.round(l.box[2] + m)), y1 = Math.min(img.height, Math.round(l.box[3] + m));
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  const crop = { width: x1 - x0, height: y1 - y0, data: new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4) };
  for (let y = y0; y < y1; y++) crop.data.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x1) * 4), (y - y0) * (x1 - x0) * 4);
  const { browserEngines, secondWords } = await import('./readpage');
  // the crop is one line: PaddleOCR's recogniser reads it whole (its detector cut a short line into boxes that overlap)
  const pl = await browserEngines.paddle!(crop, (q) => { if (!stale() && onProgress) { const w = secondWords(q); onProgress(w.p, w.text.replace('reading the soft photo', again)); } }, stale, true).catch(() => null);
  if (stale() || !pl?.length) return null;
  return { text: pl.slice().sort((a, b) => a.box[0] - b.box[0]).map((x) => x.text).join(' '), score: Math.min(...pl.map((x) => x.score)) };
}

/** Is PaddleOCR's reading `again` (its least score 0 – 1) of a value surer than Tesseract's `was` (its least word confidence)? */
export async function surer(again: string, score: number, was: string, conf: number): Promise<boolean> {
  const { secondBetter } = await import('./readpage');
  const word = (text: string, c: number) => ({ text, conf: c, x0: 0, y0: 0, x1: 0, y1: 0 });
  return secondBetter({ words: [word(again, score * 100)] }, { words: [word(was, conf)] });
}
