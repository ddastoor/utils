// The Screenshot Finder's steps without the page (src/tools/finder.ts uses them; tests/unit/finder.test.mjs runs them in Node
// with the same engines): when a picture was taken, the size it is read at, the picture made ready for the reading
// (imgproc.wasm), the words put into the search's index, and the order of what a search finds.
import type { Img } from '../wasm/imgproc';
import { findNorm, type FindHit } from '../wasm/textcore';
import type { OcrWord } from './ocr';

/** When a screenshot or photo was taken, from its name as phones and computers write it — Screenshot_20261102-190712_WhatsApp,
 *  Screenshot 2026-11-03 at 10.12.44, IMG_20261201_081530, WhatsApp Image 2026-11-02 at 19.07.12, Screenshot from
 *  2026-11-03 10-12-44, Screenshot 2026-11-03 101244, IMG-20261102-WA0012 (the date alone) —; null without one ("Screenshot
 *  (12)", IMG_1234). A file copied from a phone keeps its name, not always its date. Local time, as the names are written. */
export function takenAt(name: string): { t: number; timed: boolean } | null {
  const m = name.match(/(?:^|[^0-9])(20\d\d)[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:(?:[-_ T]|\s+at\s+)([01]\d|2[0-3])[-_.:]?([0-5]\d)(?:[-_.:]?([0-5]\d))?)?(?![0-9])/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss] = m;
  const t = new Date(+y, +mo - 1, +d, hh ? +hh : 0, mi ? +mi : 0, ss ? +ss : 0);
  return t.getMonth() === +mo - 1 ? { t: t.getTime(), timed: hh != null } : null; // 31 November is no date
}

/** a picture is read at most this many pixels: a phone's screenshot at its own size, a 12-megapixel photo at half */
export const READ_PX = 6_000_000;
/** … but a tall one (a scrolling screenshot) at least this wide, its text kept readable, … */
export const READ_WIDTH = 1000;
/** … and at most this long on a side */
export const READ_SIDE = 12_000;
/** the size a picture of w × h is read at */
export function readSize(w: number, h: number) {
  const k = Math.min(1, Math.max(Math.sqrt(READ_PX / (w * h)), READ_WIDTH / w), READ_SIDE / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** the imgproc.wasm ops the preparation needs (the worker's in the page, a bound module in Node) */
export interface PrepOps {
  histogram(img: Img): Uint32Array | Promise<Uint32Array>;
  invert(img: Img): Img | Promise<Img>;
  flatShare(img: Img): number | Promise<number>;
  docEnhance(img: Img, mode: 0 | 1 | 2): Img | Promise<Img>;
}
/** A picture made ready for the sparse reading (measured on the test screenshots and photos — docs/WASM-AUDIT.md, Screenshot
 *  Finder): light text on a dark screen (a chat or a phone in dark mode) turned dark on light; the document clean-up, which
 *  evens out the background — a chat's bubbles, a page's lighting — so that the text stands on white; and whether it is a
 *  screenshot (a fifth of it exactly one colour, as no camera makes), read with Sauvola's local thresholds (a photo with
 *  Otsu's). */
export async function prepare(img: Img, ops: PrepOps): Promise<{ img: Img; screenshot: boolean; dark: boolean }> {
  const hist = await ops.histogram(img);
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[768 + v];
  const dark = sum / (img.width * img.height) < 110;
  if (dark) img = await ops.invert(img);
  const screenshot = (await ops.flatShare(img)) >= 0.2;
  return { img: await ops.docEnhance(img, 0), screenshot, dark };
}

/** a word as the index keeps it (findNorm); one that is nothing but signs, or a guess the OCR is less than 15 % sure of (the
 *  grain of a photo without text: "pt" at 5; the test screenshots' words read right were 28 % sure and more), keeps its
 *  place as "·" — the hits' word numbers are the reading's — and matches nothing */
export const indexWords = (words: OcrWord[]) => words.map((w) => (w.conf >= 15 && findNorm(w.text)) || '·');
/** whether a reading found any text: a word of two letters or digits read 30 % sure or more */
export const hasText = (words: OcrWord[]) => words.some((w) => w.conf >= 30 && findNorm(w.text).length >= 2);

/** what a search found, in the order it is shown: the pictures with all the words first, then those with more of them, then
 *  the engine's score (the words next to each other, exact before a slip …), then the newest */
export function rank<T extends { hit: FindHit; when: number }>(hits: T[]): T[] {
  return hits.sort((a, b) => Number(b.hit.m === b.hit.n) - Number(a.hit.m === a.hit.n) || b.hit.m - a.hit.m || b.hit.s - a.hit.s || b.when - a.when);
}
