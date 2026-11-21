// The text of a photo set upright before it is read (owner, 21 Nov 2026: "when I take my phone and turn it 90 degrees
// horizontally, either with my left hand or my right hand, and then take a photo of my Kindle, it gets screwed up …
// Do whatever you have to do internally, rotate the image" — the Photo Dictionary and the OCR tab). imgproc's
// p_text_turns finds which way up the text stands from the picture alone (the lines' axis from each letter's nearest
// neighbour; which end is up from the letters that rise above the x-height against those that drop below the baseline),
// so it serves a phone held either way, a photo from the gallery and a page held sideways to a webcam alike. Letters
// that are too small at one size, or fall apart into specks at another, are read at the next size.
import { imgproc, type Img } from '../wasm/imgproc';

type Turns = { turns: number; across0: boolean; slant: number; letters: number };
export interface TurnOps {
  resize(img: Img, w: number, h: number): Img | Promise<Img>;
  textTurns(img: Img): Turns | Promise<Turns>;
  orient(img: Img, o: number): Img | Promise<Img>;
  rotate(img: Img, deg: number, w: number, h: number, fill: number): Img | Promise<Img>;
  crop(img: Img, x: number, y: number, w: number, h: number): Img | Promise<Img>;
}
const workerOps: TurnOps = {
  resize: (img, w, h) => imgproc('resize', img, w, h),
  textTurns: (img) => imgproc('textTurns', img),
  orient: (img, o) => imgproc('orient', img, o),
  rotate: (img, deg, w, h, fill) => imgproc('rotate', img, deg, w, h, fill),
  crop: (img, x, y, w, h) => imgproc('crop', img, x, y, w, h),
};
/** A slant of the lines smaller than this is left to Tesseract (it takes a few degrees in its stride; and below it the
 *  slant measured on a real photo is not to be trusted — measured on the Kindle photo set, 21 Nov 2026). */
const LEVEL_FROM = 5;
/** A turned or levelled picture is kept when its quick reading scores more than this share of the picture as it is, plus
 *  three words (score: the words read right, as the OCR's confidence puts it). */
const BETTER_BY = 1.15;
/** The quick reading is of the middle of the picture, at most this many pixels a side, at the picture's own scale — the
 *  letters as large as the reading proper will see them (a copy made smaller left the text of a whole photo too small to
 *  read either way round). */
const GLANCE = 1000;
/** Quarter turns to the right as EXIF orientations (p_orient). */
export const ROT = [1, 6, 3, 8];
/** The sizes (longest side) the text is looked at, in this order. */
const SIZES = [1200, 800, 1800];

/** The quarter turns to the right that set the text upright (0–3); or `null` with `axis` when the lines' direction is
 *  clear but not which end is up ('across': the turns are 0 or 2; 'down': 1 or 3); or `null` without one when there is
 *  too little text to say. */
export async function textTurns(img: Img, ops: TurnOps = workerOps): Promise<{ turns: number | null; axis?: 'across' | 'down'; slant: number }> {
  let axis: 'across' | 'down' | undefined, slant: number | undefined;
  const L = Math.max(img.width, img.height);
  for (const size of SIZES) {
    if (size > L && size !== SIZES[0]) continue; // a small picture is looked at once, as it is
    const k = Math.min(1, size / L);
    const im = k < 1 ? await ops.resize(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k))) : img;
    const r = await ops.textTurns(im);
    if (slant === undefined && r.letters >= 30) slant = r.slant; // the slant of the first size that found letters
    if (r.turns >= 0) return { turns: r.turns, slant: slant ?? r.slant };
    if (r.turns === -2) axis ||= r.across0 ? 'across' : 'down';
  }
  return { turns: null, axis, slant: slant ?? 0 };
}

/** The picture levelled — turned back by the slant of its lines, on a canvas large enough for every corner, the new
 *  corners white (they are the page's ground once the clean-up has run). */
async function level(img: Img, slant: number, ops: TurnOps): Promise<Img> {
  const a = (Math.abs(slant) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const w = Math.round(img.width * c + img.height * s), h = Math.round(img.width * s + img.height * c);
  return ops.rotate(img, -slant, w, h, 0xffffffff);
}

/** The picture turned so that its text stands upright (as it was when it already does, or when that cannot be told);
 *  a slanted one (owner, 21 Nov 2026: photos taken "at different angles") levelled first. `slant`: the degrees it was
 *  turned back by (0: none). */
export async function upright(img: Img, ops: TurnOps = workerOps): Promise<{ img: Img; turns: number; sure: boolean; axis?: 'across' | 'down'; slant: number }> {
  // a steep slant is measured a little short (the letters' boxes): what is left is measured on the levelled picture and
  // added — each time levelling the original, so the picture is resampled once
  const orig = img;
  let r = await textTurns(img, ops), slant = 0;
  for (let i = 0; i < 3 && Math.abs(r.slant) >= (i ? 0.4 : LEVEL_FROM); i++) {
    slant += r.slant;
    img = await level(orig, slant, ops);
    r = await textTurns(img, ops);
  }
  if (r.turns === null) return { img, turns: 0, sure: false, axis: r.axis, slant };
  return { img: r.turns ? await ops.orient(img, ROT[r.turns]) : img, turns: r.turns, sure: true, slant };
}

type Reading = { confidence: number; words: ArrayLike<{ text: string; conf: number }> };
/** How a quick reading is judged when the ways round are compared: the words read right, as the OCR's own confidence in
 *  each puts it (words of two letters or more; signs and stray letters are what a page the wrong way round gives). Not
 *  the average confidence: a page lying sideways can be read confidently in a few places (the OCR turns some lines by
 *  itself) — 34 words of 451 at 85 % (the Kindle photo set, 21 Nov 2026). */
export const score = (r: Reading) => { let s = 0; for (const w of Array.from(r.words)) if (/\p{L}.*\p{L}/u.test(w.text)) s += Math.max(0, w.conf) / 100; return s; };

/** The picture set upright and level for reading. What the letters say (upright()) is a suggestion: on a soft photo
 *  the letters run together into words and the suggestion can be wrong — even upside down (the Kindle photo set, 21 Nov
 *  2026: an upright page turned over read 2 % of its words instead of 98 %). So every change is tried: the picture as
 *  it is and each picture the suggestion gives are read quickly (`read` gets the middle of it, GLANCE), and a change
 *  is kept only when it reads clearly better (score, BETTER_BY). Only when the letters say the text stands upright and level
 *  is nothing read here. `how`: 'text' (upright and level, as the letters say), 'reading' (the readings decided),
 *  'none' (too little text to say: left as it was). */
export async function uprightByReading(img: Img, read: (im: Img) => Promise<Reading>, ops: TurnOps = workerOps): Promise<{ img: Img; turns: number; slant: number; how: 'text' | 'reading' | 'none' }> {
  const u = await upright(img, ops);
  if (u.sure && !u.turns && !u.slant) return { img, turns: 0, slant: 0, how: 'text' };
  const tries: { img: Img; turns: number; slant: number }[] = [];
  if (u.sure) tries.push({ img: u.img, turns: u.turns, slant: u.slant });
  else if (u.axis) for (const t of u.axis === 'across' ? [0, 2] : [1, 3]) { if (t || u.slant) tries.push({ img: t ? await ops.orient(u.img, ROT[t]) : u.img, turns: t, slant: u.slant }); }
  else if (u.slant) tries.push({ img: u.img, turns: 0, slant: u.slant });
  if (!tries.length) return { img, turns: 0, slant: 0, how: 'none' };
  const glance = async (im: Img) => {
    const w = Math.min(GLANCE, im.width), h = Math.min(GLANCE, im.height);
    return score(await read(w < im.width || h < im.height ? await ops.crop(im, (im.width - w) >> 1, (im.height - h) >> 1, w, h) : im));
  };
  const asIs = await glance(img);
  let best = { img, turns: 0, slant: 0 }, top = asIs * BETTER_BY + 3;
  for (const c of tries) { const m = await glance(c.img); if (m > top) { top = m; best = c; } }
  return { ...best, how: 'reading' };
}

/** "turned a quarter to the right" … for a status line. */
export const turnWords = (t: number) => (t === 2 ? 'upside down' : t === 1 ? 'a quarter to the right' : 'a quarter to the left');
/** What was done to set the text upright, for a status line ("levelled (12°) and turned a quarter to the left"). */
export const uprightWords = (u: { turns: number; slant: number }) => [Math.abs(u.slant) >= LEVEL_FROM ? `levelled (${Math.round(Math.abs(u.slant))}°)` : '', u.turns ? `turned ${turnWords(u.turns)}` : ''].filter(Boolean).join(' and ');
