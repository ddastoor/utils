// The page in a photo, found and straightened before it is read (owner, 21 Nov 2026: the Photo Dictionary — and the OCR
// tab — must read a phone's photo of a Kindle Paperwhite page "extremely well", then newspapers and printed pages). A
// Kindle's screen is the bright quadrilateral inside its black body; a sheet of paper the bright one on a darker table:
// imgproc's p_page_quad finds it (of every bright region the cleanest quadrilateral of a page's size, one that does not
// run off the photo's edges first — a light desk around the Kindle is no page), and one perspective warp makes
// the text upright, square on and as large as the photo allows — and leaves the body, the table and the hand out, which
// the OCR otherwise reads as letters. Measured on photos of Kindle pages and newspapers (scripts/make-kindle-photos.py,
// scripts/measure-ocr.mjs): the words read right went from 31 % to 64 % over six photos, and from 14 – 91 % to 79 – 100 % on
// the camera's stills. Nothing changes when no page is found, when it is too small to be the page (a lamp, a white mug),
// when it fills the photo anyway (a scan), or when the picture is no camera's photo (a screenshot: large areas exactly
// one colour, where a camera has noise everywhere — and the page found in it square on: its white panel).
// Paper (to-do #18; owner, 26 Nov 2026: documents photographed with a phone read "very poorly"): a white sheet on a light
// desk is no bright region in a dark one, and the Kindle finder then takes a part of the page for it (a column, the space
// under a table) — or a tilted sheet on a smooth desk, which JPEG makes exactly flat in places, passed for a screenshot.
// Each outline is now checked where it matters: across every edge a page is lighter than what lies around it
// (p_quad_steps). Where the Kindle finder's outline is not a page's on all four edges, the Doc Scanner's network
// (DocCornerNet, src/lib/pagefind.ts — fetched only then) is asked too, and the outline with more real edges is taken.
// Measured (scripts/make-doc-photos.py): every Kindle screen's outline steps by 97 – 213 on all four edges (the network is
// never asked for a Kindle: its corners stray into the bezel — 67 % of the words read right fell to 53 %), wrong outlines
// by 0 – 11.
import { imgproc, type Img } from '../wasm/imgproc';
import { isPageQuad, clampQuad, MIN_SCORE, SIZE, type Found } from './pagefind';

/** What the straightening needs of imgproc: the worker's operations in the tab, the module itself in Node's suites. */
export interface PageOps {
  resize(img: Img, w: number, h: number): Img | Promise<Img>;
  pageQuad(img: Img): { corners: number[]; confidence: number } | Promise<{ corners: number[]; confidence: number }>;
  flatShare(img: Img): number | Promise<number>;
  warp(img: Img, corners: number[], w: number, h: number): Img | Promise<Img>;
  /** The brightness step across each edge of an outline (p_quad_steps). */
  quadSteps(img: Img, corners: number[]): number[] | Promise<number[]>;
  /** The Doc Scanner's network on the small copy (corners as fractions of it, P(document)); absent: not asked. */
  docCorners?(small: Img): Promise<Found | null>;
  /** An outline's edges fitted to the photo's (p_refine_quad) — the network's corners are a 224 px look's. */
  refineQuad?(img: Img, corners: number[], search: number): { corners: number[]; edges: number } | Promise<{ corners: number[]; edges: number }>;
  /** The letters of the picture inside an outline and outside it (p_quad_text). */
  quadText?(img: Img, corners: number[]): { inside: number; outside: number } | Promise<{ inside: number; outside: number }>;
  /** A strip of what lay round the page, left along its edges, painted the paper's colour (p_clear_border). */
  clearBorder?(img: Img, maxfrac: number): { img: Img; painted: number } | Promise<{ img: Img; painted: number }>;
}
const workerOps: PageOps = {
  resize: (img, w, h) => imgproc('resize', img, w, h),
  pageQuad: (img) => imgproc('pageQuad', img),
  flatShare: (img) => imgproc('flatShare', img),
  warp: (img, c, w, h) => imgproc('warp', img, c, w, h),
  quadSteps: (img, c) => imgproc('quadSteps', img, c),
  refineQuad: (img, c, search) => imgproc('refineQuad', img, c, search),
  quadText: (img, c) => imgproc('quadText', img, c),
  clearBorder: (img, f) => imgproc('clearBorder', img, f),
  // its worker and ONNX Runtime are fetched the first time a photo needs them (ended with the tab)
  docCorners: async (small) => (await import('./pagefind-client')).findPage((await imgproc('resizeArea', small, SIZE, SIZE)).data),
};

/** The outline is looked for on a copy this large (the outline is coarse; a 3000 px photo would take long for nothing). */
const FIND_SIZE = 1200;
/** The page found must cover between these shares of the photo. */
export const MIN_SHARE = 0.1, MAX_SHARE = 0.92;
/** A picture with more than this share exactly flat may be no camera's photo (a screenshot, a drawing): left as it is
 *  when the page found in it stands square on (a screenshot's panel). A camera's photo of a tilted page on a smooth desk
 *  can be as flat (JPEG makes a plain area exactly one value block by block; measured 0.22 – 0.34). */
export const DIGITAL = 0.2;
/** An edge of a page steps by at least this much from the page to what lies around it (p_quad_steps). Measured: wrong
 *  outlines 0 – 11, real edges 31 – 213 (paper on a light desk, Kindle screens, newspapers). */
export const STEP = 20;
/** How many of an outline's edges are a page's edges (an edge along the photo's border counts: nothing to compare). */
export const realEdges = (steps: number[]) => steps.filter((v) => v >= STEP).length;
/** Square on to the picture within half a degree (a screenshot's panel; a photographed page never is). */
export function squareOn(c: number[]): boolean {
  const flat = (a: number, b: number, along: 0 | 1) => {
    const dx = Math.abs(c[b * 2] - c[a * 2]), dy = Math.abs(c[b * 2 + 1] - c[a * 2 + 1]);
    return along === 0 ? dy <= dx * 0.0087 : dx <= dy * 0.0087;
  };
  return flat(0, 1, 0) && flat(3, 2, 0) && flat(0, 3, 1) && flat(1, 2, 1);
}

/** The size of the straightened page: its longer opposite sides (no detail is lost). */
export function pageSize(c: number[]): [number, number] {
  const d = (a: number, b: number) => Math.hypot(c[2 * a] - c[2 * b], c[2 * a + 1] - c[2 * b + 1]);
  return [Math.max(1, Math.round(Math.max(d(0, 1), d(3, 2)))), Math.max(1, Math.round(Math.max(d(0, 3), d(1, 2))))];
}

/** A page is never more elongated than this (its longer side over its shorter): the most elongated page found in the
 *  photos of scripts/measure-ocr.mjs is 1.49 : 1, a long receipt is about 4 : 1. An outline round a line of text in a
 *  screenshot is 30 : 1 and more (to-do #13: on Windows, where Chrome draws the OCR suite's dark test sentence in Arial,
 *  the outline of its line was taken for a page and straightened — the descenders cut off: "iumps … lazv doa"). */
export const MAX_ASPECT = 6;
/** Is this outline the page? Convex, in the photo, of a page's shape and of a page's share of it. `beyond`: the share of
 *  the photo's size a corner may lie outside it (the network's page refined: a page that runs off the photo has its
 *  corners outside), and then the page may cover the photo up to as much. */
export function usable(corners: number[], w: number, h: number, beyond = 0): boolean {
  const q = corners.map((v, k) => v / (k % 2 ? h : w));
  if (!isPageQuad(q) || !q.every((v) => v >= -0.01 - beyond && v <= 1.01 + beyond)) return false;
  const [pw, ph] = pageSize(corners);
  if (Math.max(pw, ph) > MAX_ASPECT * Math.min(pw, ph)) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; area += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1]; }
  const share = Math.abs(area) / 2;
  return share >= MIN_SHARE && share <= (beyond ? 1 + 2 * beyond : MAX_SHARE);
}
/** How far beyond the photo the network's refined corners may lie (a quarter of its size), and how far its edges are
 *  looked for either side (3 % of the shorter side: the network's corners are a 224 px look's). */
export const BEYOND = 0.25, SEARCH = 0.03;

/** A page's outline holds the photo's text: one that leaves at least this share of its letters (and LEFT_OUT letters)
 *  outside is a region inside the page — the white area a big watermark's letters fence in (measured: pages leave 0 –
 *  8 % outside, such regions 25 – 73 %). */
export const OUTSIDE = 0.2, LEFT_OUT = 25;
export const holdsText = (t: { inside: number; outside: number }) => !(t.outside >= LEFT_OUT && t.outside >= OUTSIDE * (t.inside + t.outside));

/** The outline of the page in a ≤ 1200 px copy (px of it) and how it was found, or null. */
export async function findOutline(small: Img, ops: PageOps = workerOps): Promise<{ corners: number[]; edges: number; by: 'outline' | 'network' } | null> {
  let best: { corners: number[]; edges: number; by: 'outline' | 'network' } | null = null;
  const text = async (c: number[]) => !ops.quadText || holdsText(await ops.quadText(small, c));
  const q = await ops.pageQuad(small);
  if (q.confidence > 0 && usable(q.corners, small.width, small.height) && (await text(q.corners))) best = { corners: q.corners, edges: realEdges(await ops.quadSteps(small, q.corners)), by: 'outline' };
  // not a page's outline on every edge (paper on a light desk): the network is asked as well
  if ((!best || best.edges < 4) && ops.docCorners) {
    const m = await ops.docCorners(small).catch(() => null); // it could not be fetched: the outline alone decides
    if (m && m.score >= MIN_SCORE) {
      // its corners fitted to the photo's edges (a 224 px look is a little off, and puts a corner where a page that runs
      // off the photo leaves it: straightened like that the text would be sheared); else as it gave them, in the photo
      let c = clampQuad(m.corners).map((v, i) => v * (i % 2 ? small.height : small.width)), beyond = 0;
      if (ops.refineQuad) {
        const r = await ops.refineQuad(small, m.corners.map((v, i) => v * (i % 2 ? small.height : small.width)), SEARCH * Math.min(small.width, small.height));
        if (r.edges >= 2 && usable(r.corners, small.width, small.height, BEYOND)) { c = r.corners; beyond = BEYOND; }
      }
      if (usable(c, small.width, small.height, beyond)) {
        const edges = realEdges(await ops.quadSteps(small, c));
        if (edges >= 3 && edges > (best?.edges ?? -1) && (await text(c))) best = { corners: c, edges, by: 'network' };
      }
    }
  }
  // an outline with at most one edge of a page is a region inside it (a column, a white space): the whole photo is read
  return best && best.edges >= 2 ? best : null;
}

/** The photo with its page straightened, or the photo as it was (found: false). */
export async function straighten(img: Img, ops: PageOps = workerOps): Promise<{ img: Img; found: boolean; corners?: number[]; by?: 'outline' | 'network' }> {
  const L = Math.max(img.width, img.height), k = L > FIND_SIZE ? FIND_SIZE / L : 1;
  const small = k < 1 ? await ops.resize(img, Math.round(img.width * k), Math.round(img.height * k)) : img;
  const flat = (await ops.flatShare(small)) > DIGITAL;
  const o = await findOutline(small, ops);
  // nothing found; or a screenshot's panel (square on in a picture with large flat areas: a white panel is no page)
  if (!o || (flat && squareOn(o.corners))) return { img, found: false };
  const corners = o.corners.map((v) => v / k);
  const [w, h] = pageSize(corners);
  let page = await ops.warp(img, corners, w, h);
  // the network's corners (a 224 px look) can lie a little outside the page: a strip of the desk left along an edge is
  // painted the paper's colour — with a dark strip down its side Tesseract read a form without its title. The Kindle
  // finder's outline follows the page's own edge (painting a Kindle's thin bezel line only moved a soft photo's reading)
  if (ops.clearBorder && o.by === 'network') page = (await ops.clearBorder(page, BORDER)).img;
  return { img: page, found: true, corners, by: o.by };
}
/** How far in from each edge of the straightened page a dark strip is looked for (of its size). */
export const BORDER = 0.03;
