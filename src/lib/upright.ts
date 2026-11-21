// The text of a photo set upright before it is read (owner, 21 Nov 2026: "when I take my phone and turn it 90 degrees
// horizontally, either with my left hand or my right hand, and then take a photo of my Kindle, it gets screwed up …
// Do whatever you have to do internally, rotate the image" — the Photo Dictionary and the OCR tab). imgproc's
// p_text_turns finds which way up the text stands from the picture alone (the lines' axis from each letter's nearest
// neighbour; which end is up from the letters that rise above the x-height against those that drop below the baseline),
// so it serves a phone held either way, a photo from the gallery and a page held sideways to a webcam alike. Letters
// that are too small at one size, or fall apart into specks at another, are read at the next size.
import { imgproc, type Img } from '../wasm/imgproc';

export interface TurnOps {
  resize(img: Img, w: number, h: number): Img | Promise<Img>;
  textTurns(img: Img): { turns: number; across0: boolean } | Promise<{ turns: number; across0: boolean }>;
  orient(img: Img, o: number): Img | Promise<Img>;
}
const workerOps: TurnOps = {
  resize: (img, w, h) => imgproc('resize', img, w, h),
  textTurns: (img) => imgproc('textTurns', img),
  orient: (img, o) => imgproc('orient', img, o),
};
/** Quarter turns to the right as EXIF orientations (p_orient). */
export const ROT = [1, 6, 3, 8];
/** The sizes (longest side) the text is looked at, in this order. */
const SIZES = [1200, 800, 1800];

/** The quarter turns to the right that set the text upright (0–3); or `null` with `axis` when the lines' direction is
 *  clear but not which end is up ('across': the turns are 0 or 2; 'down': 1 or 3); or `null` without one when there is
 *  too little text to say. */
export async function textTurns(img: Img, ops: TurnOps = workerOps): Promise<{ turns: number | null; axis?: 'across' | 'down' }> {
  let axis: 'across' | 'down' | undefined;
  const L = Math.max(img.width, img.height);
  for (const size of SIZES) {
    if (size > L && size !== SIZES[0]) continue; // a small picture is looked at once, as it is
    const k = Math.min(1, size / L);
    const im = k < 1 ? await ops.resize(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k))) : img;
    const r = await ops.textTurns(im);
    if (r.turns >= 0) return { turns: r.turns };
    if (r.turns === -2) axis ||= r.across0 ? 'across' : 'down';
  }
  return { turns: null, axis };
}

/** The picture turned so that its text stands upright (as it was when it already does, or when that cannot be told). */
export async function upright(img: Img, ops: TurnOps = workerOps): Promise<{ img: Img; turns: number; sure: boolean; axis?: 'across' | 'down' }> {
  const r = await textTurns(img, ops);
  if (r.turns === null) return { img, turns: 0, sure: false, axis: r.axis };
  return { img: r.turns ? await ops.orient(img, ROT[r.turns]) : img, turns: r.turns, sure: true };
}

/** How a reading is judged when the two ways round are compared: its confidence, held down when it found next to
 *  nothing (garbage read from upside-down text can be confident about three "words"). */
const merit = (r: { confidence: number; words: ArrayLike<unknown> }) => r.confidence * Math.min(1, r.words.length / 12);

/** upright(), and when only the lines' axis is known, the two ways round read on a copy of at most 1,000 px (`read`
 *  gets the turned copy) and the better reading's way kept. `how`: 'text' (the letters said it), 'reading' (the
 *  readings did), 'none' (too little text to say: left as it was). */
export async function uprightByReading(img: Img, read: (im: Img) => Promise<{ confidence: number; words: ArrayLike<unknown> }>, ops: TurnOps = workerOps): Promise<{ img: Img; turns: number; how: 'text' | 'reading' | 'none' }> {
  const u = await upright(img, ops);
  if (u.sure) return { img: u.img, turns: u.turns, how: 'text' };
  if (!u.axis) return { img, turns: 0, how: 'none' };
  const k = Math.min(1, 1000 / Math.max(img.width, img.height));
  const small = k < 1 ? await ops.resize(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k))) : img;
  let best = 0, score = -1;
  for (const t of u.axis === 'across' ? [0, 2] : [1, 3]) {
    const s = merit(await read(t ? await ops.orient(small, ROT[t]) : small));
    if (s > score) { score = s; best = t; }
  }
  return { img: best ? await ops.orient(img, ROT[best]) : img, turns: best, how: 'reading' };
}

/** "turned a quarter to the right" … for a status line. */
export const turnWords = (t: number) => (t === 2 ? 'upside down' : t === 1 ? 'a quarter to the right' : 'a quarter to the left');
