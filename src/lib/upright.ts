// The text of a photo set upright and level before it is read — the Photo Dictionary and the OCR tab (owner, 21 Nov
// 2026: "when I take my phone and turn it 90 degrees horizontally, either with my left hand or my right hand, and then
// take a photo of my Kindle, it gets screwed up … rotate the image"; and later the same day: "especially on the phone,
// when I click it at different angles"). From the picture alone, so it serves a phone held either way, a gallery photo
// and a page held sideways to a webcam alike — two looks at the ink, both own C in imgproc.wasm:
// - p_text_lines: the lines' direction and slant from projection profiles (the angle at which the ink, projected across
//   it, gives the sharpest profile) — sound where letters run together on a soft photo;
// - p_text_turns: which end is up from the letters (more of them rise above the x-height than drop below the baseline).
// Neither is trusted alone: what they suggest is tried by reading (uprightByReading), and only when both say "upright
// and level" is nothing read here. Measured on the 24 Kindle and newspaper photos of scripts/make-kindle-photos.py,
// each turned four ways (21 Nov 2026): the profiles gave the lines' axis of all 112 straightened pages at 800 px (the
// letters missed several soft ones); the two agreeing on "upright" was never wrong.
import { imgproc, type Img } from '../wasm/imgproc';

type Turns = { turns: number; across0: boolean; slant: number; letters: number };
type Lines = { turns: number; angle: number; contrast: number; low: number; high: number; pitch: number; strength: number; ink: number };
export interface TurnOps {
  resize(img: Img, w: number, h: number): Img | Promise<Img>;
  textTurns(img: Img): Turns | Promise<Turns>;
  textLines(img: Img): Lines | Promise<Lines>;
  orient(img: Img, o: number): Img | Promise<Img>;
  rotate(img: Img, deg: number, w: number, h: number, fill: number): Img | Promise<Img>;
  crop(img: Img, x: number, y: number, w: number, h: number): Img | Promise<Img>;
}
const workerOps: TurnOps = {
  resize: (img, w, h) => imgproc('resize', img, w, h),
  textTurns: (img) => imgproc('textTurns', img),
  textLines: (img) => imgproc('textLines', img),
  orient: (img, o) => imgproc('orient', img, o),
  rotate: (img, deg, w, h, fill) => imgproc('rotate', img, deg, w, h, fill),
  crop: (img, x, y, w, h) => imgproc('crop', img, x, y, w, h),
};
/** A slant of the lines smaller than this is left to Tesseract (it takes a few degrees in its stride). */
const LEVEL_FROM = 5;
/** A turned or levelled picture is kept when its quick reading scores more than this share of the picture as it is, plus
 *  three words (score: the words read right, as the OCR's confidence puts it). */
const BETTER_BY = 1.15;
/** A quick reading of the picture as it is this confident (and of a dozen words or more), with its lines running across
 *  it and nothing to level, settles it: text upside down reads far below this. */
const READS_WELL = 65;
/** The quick reading is of the middle of the picture, at most this many pixels a side, at the picture's own scale — the
 *  letters as large as the reading proper will see them (a copy made smaller left the text of a whole photo too small to
 *  read either way round). */
export const GLANCE = 1000;
/** Quarter turns to the right as EXIF orientations (p_orient). */
export const ROT = [1, 6, 3, 8];
/** The sizes (longest side) the letters are looked at, in this order; the profiles are looked at LINES_SIZE. */
const SIZES = [1200, 800, 1800];
const LINES_SIZE = 800;

const scaled = async (img: Img, size: number, ops: TurnOps) => {
  const k = Math.min(1, size / Math.max(img.width, img.height));
  return k < 1 ? ops.resize(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k))) : img;
};

/** What the letters say (p_text_turns): the turns when sure, else the axis when that is clear; the slant of the first
 *  size that found letters. */
async function byLetters(img: Img, ops: TurnOps): Promise<{ turns: number | null; axis?: 'across' | 'down'; slant: number }> {
  let axis: 'across' | 'down' | undefined, slant: number | undefined;
  const L = Math.max(img.width, img.height);
  for (const size of SIZES) {
    if (size > L && size !== SIZES[0]) continue; // a small picture is looked at once, as it is
    const r = await ops.textTurns(await scaled(img, size, ops));
    if (slant === undefined && r.letters >= 30) slant = r.slant;
    if (r.turns >= 0) return { turns: r.turns, axis: r.turns % 2 ? 'down' : 'across', slant: slant ?? r.slant };
    if (r.turns === -2) axis ||= r.across0 ? 'across' : 'down';
  }
  return { turns: null, axis, slant: slant ?? 0 };
}

type Axis = 'across' | 'down' | 'any';
type Option = { axis: 'across' | 'down'; slant: number };
/** The quarter turns to the right that set the text upright (0–3) when the profiles and the letters agree; else `null`
 *  with `axis` — 'across' when the lines run across the picture (the turns are 0 or 2), 'down' when up and down it (1
 *  or 3), 'any' when the two looks see the lines run different ways (a desk's stripes in a whole photo look like lines
 *  to the profiles; letters run together into words fool the letters) — or without one when there is too little text
 *  to say. `slant`: the lines' angle from the nearer axis, −45 … 45° (positive: falling to the right) — from the
 *  profiles where they found the lines (0 for 'any'). */
export async function textTurns(img: Img, ops: TurnOps = workerOps): Promise<{ turns: number | null; axis?: Axis; slant: number; options?: Option[] }> {
  const lines = await ops.textLines(await scaled(img, LINES_SIZE, ops)), letters = await byLetters(img, ops);
  if (lines.turns === -1) return letters; // no direction stands out in the profiles: the letters as they are
  const across = Math.abs(lines.angle) < 45, axis = across ? 'across' : 'down';
  const slant = across ? lines.angle : lines.angle > 0 ? lines.angle - 90 : lines.angle + 90;
  // the two see the lines run different ways: each one's reading of the lines (direction and slant) is tried
  if (letters.axis && letters.axis !== axis) return { turns: null, axis: 'any', slant: 0, options: [{ axis, slant }, { axis: letters.axis, slant: letters.slant }] };
  if (letters.turns !== null && lines.turns === letters.turns) return { turns: letters.turns, axis, slant };
  return { turns: null, axis, slant };
}

/** The picture levelled — turned back by the slant of its lines, on a canvas large enough for every corner, the new
 *  corners white (they are the page's ground once the clean-up has run). */
async function level(img: Img, slant: number, ops: TurnOps): Promise<Img> {
  const a = (Math.abs(slant) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const w = Math.round(img.width * c + img.height * s), h = Math.round(img.width * s + img.height * c);
  return ops.rotate(img, -slant, w, h, 0xffffffff);
}

/** The picture levelled (a slant of LEVEL_FROM and more; what is left of a steep slant is measured on the levelled
 *  picture and added, each time levelling the original, so it is resampled once) and turned upright where the two
 *  looks agree. `sure`: they agree; else `axis` when the lines' direction is known. `slant`: the degrees it was turned
 *  back by (0: none). */
export async function upright(img: Img, ops: TurnOps = workerOps): Promise<{ img: Img; turns: number; sure: boolean; axis?: Axis; slant: number; options?: Option[] }> {
  const orig = img;
  let r = await textTurns(img, ops), slant = 0;
  if (r.axis === 'any') return { img, turns: 0, sure: false, axis: 'any', slant: 0, options: r.options };
  for (let i = 0; i < 3 && Math.abs(r.slant) >= (i ? 0.4 : LEVEL_FROM); i++) {
    slant += r.slant;
    img = await level(orig, slant, ops);
    r = await textTurns(img, ops);
  }
  if (r.turns === null) return { img, turns: 0, sure: false, axis: r.axis, slant };
  return { img: r.turns ? await ops.orient(img, ROT[r.turns]) : img, turns: r.turns, sure: true, axis: r.axis, slant };
}

type Reading = { confidence: number; words: ArrayLike<{ text: string; conf: number }> };
/** How a quick reading is judged when the ways round are compared: the words read right, as the OCR's own confidence in
 *  each puts it (words of two letters or more; signs and stray letters are what a page the wrong way round gives). Not
 *  the average confidence: a page lying sideways can be read confidently in a few places (the OCR turns some lines by
 *  itself) — 34 words of 451 at 85 % (the Kindle photo set, 21 Nov 2026). */
export const score = (r: Reading) => { let s = 0; for (const w of Array.from(r.words)) if (/\p{L}.*\p{L}/u.test(w.text)) s += Math.max(0, w.conf) / 100; return s; };

/** The picture set upright and level for reading. What the two looks say is a suggestion: on a soft photo the letters
 *  run together into words and a suggestion can be wrong — even upside down (the Kindle photo set, 21 Nov 2026: an
 *  upright page turned over read 2 % of its words instead of 98 %). So the picture as it is and each picture the
 *  suggestion gives are read quickly (`read` gets the middle of it, GLANCE) and a change is kept only when it reads
 *  clearly better (score, BETTER_BY). Nothing is read when both looks say upright and level; only the picture as it is
 *  when its lines run across it, nothing needs levelling and it reads well (READS_WELL). `how`: 'text' (upright and
 *  level, as both looks say), 'reading' (the readings decided), 'none' (too little text to say: left as it was). */
export async function uprightByReading(img: Img, read: (im: Img) => Promise<Reading>, ops: TurnOps = workerOps): Promise<{ img: Img; turns: number; slant: number; how: 'text' | 'reading' | 'none' }> {
  const u = await upright(img, ops);
  if (u.sure && !u.turns && !u.slant) return { img, turns: 0, slant: 0, how: 'text' };
  const tries: { img: Img; turns: number; slant: number }[] = [];
  if (u.sure) tries.push({ img: u.img, turns: u.turns, slant: u.slant });
  else if (u.axis === 'any') {
    // each look's reading of the lines: levelled by its slant, then both ways along its axis
    for (const o of u.options ?? []) {
      const lv = Math.abs(o.slant) >= LEVEL_FROM ? await level(img, o.slant, ops) : img, sl = lv === img ? 0 : o.slant;
      for (const t of o.axis === 'across' ? [0, 2] : [1, 3]) if (t || sl) tries.push({ img: t ? await ops.orient(lv, ROT[t]) : lv, turns: t, slant: sl });
    }
  } else if (u.axis) for (const t of u.axis === 'across' ? [0, 2] : [1, 3]) { if (t || u.slant) tries.push({ img: t ? await ops.orient(u.img, ROT[t]) : u.img, turns: t, slant: u.slant }); }
  else if (u.slant) tries.push({ img: u.img, turns: 0, slant: u.slant });
  if (!tries.length) return { img, turns: 0, slant: 0, how: 'none' };
  const glance = async (im: Img) => {
    const w = Math.min(GLANCE, im.width), h = Math.min(GLANCE, im.height);
    return read(w < im.width || h < im.height ? await ops.crop(im, (im.width - w) >> 1, (im.height - h) >> 1, w, h) : im);
  };
  const first = await glance(img), asIs = score(first);
  // lines across, nothing to level, and it reads well as it is: the right way up (only a half turn was left to try)
  if (u.axis === 'across' && !u.slant && first.confidence >= READS_WELL && first.words.length >= 12) return { img, turns: 0, slant: 0, how: 'reading' };
  let best = { img, turns: 0, slant: 0 }, top = asIs * BETTER_BY + 3;
  for (const c of tries) { const m = score(await glance(c.img)); if (m > top) { top = m; best = c; } }
  return { ...best, how: 'reading' };
}

/** "turned a quarter to the right" … for a status line. */
export const turnWords = (t: number) => (t === 2 ? 'upside down' : t === 1 ? 'a quarter to the right' : 'a quarter to the left');
/** What was done to set the text upright, for a status line ("levelled (12°) and turned a quarter to the left"). */
export const uprightWords = (u: { turns: number; slant: number }) => [Math.abs(u.slant) >= LEVEL_FROM ? `levelled (${Math.round(Math.abs(u.slant))}°)` : '', u.turns ? `turned ${turnWords(u.turns)}` : ''].filter(Boolean).join(' and ');
