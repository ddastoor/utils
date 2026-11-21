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
// one colour, where a camera has noise everywhere).
import { imgproc, type Img } from '../wasm/imgproc';
import { isPageQuad } from './pagefind';

/** What the straightening needs of imgproc: the worker's operations in the tab, the module itself in Node's suites. */
export interface PageOps {
  resize(img: Img, w: number, h: number): Img | Promise<Img>;
  pageQuad(img: Img): { corners: number[]; confidence: number } | Promise<{ corners: number[]; confidence: number }>;
  flatShare(img: Img): number | Promise<number>;
  warp(img: Img, corners: number[], w: number, h: number): Img | Promise<Img>;
}
const workerOps: PageOps = {
  resize: (img, w, h) => imgproc('resize', img, w, h),
  pageQuad: (img) => imgproc('pageQuad', img),
  flatShare: (img) => imgproc('flatShare', img),
  warp: (img, c, w, h) => imgproc('warp', img, c, w, h),
};

/** The outline is looked for on a copy this large (the outline is coarse; a 3000 px photo would take long for nothing). */
const FIND_SIZE = 1200;
/** The page found must cover between these shares of the photo. */
export const MIN_SHARE = 0.1, MAX_SHARE = 0.92;
/** A picture with more than this share exactly flat is no camera's photo (a screenshot, a drawing): left as it is. */
export const DIGITAL = 0.2;

/** The size of the straightened page: its longer opposite sides (no detail is lost). */
export function pageSize(c: number[]): [number, number] {
  const d = (a: number, b: number) => Math.hypot(c[2 * a] - c[2 * b], c[2 * a + 1] - c[2 * b + 1]);
  return [Math.max(1, Math.round(Math.max(d(0, 1), d(3, 2)))), Math.max(1, Math.round(Math.max(d(0, 3), d(1, 2))))];
}

/** Is this outline the page? Convex, in the photo, and of a page's share of it. */
export function usable(corners: number[], w: number, h: number): boolean {
  const q = corners.map((v, k) => v / (k % 2 ? h : w));
  if (!isPageQuad(q) || !q.every((v) => v >= -0.01 && v <= 1.01)) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; area += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1]; }
  const share = Math.abs(area) / 2;
  return share >= MIN_SHARE && share <= MAX_SHARE;
}

/** The photo with its page straightened, or the photo as it was (found: false). */
export async function straighten(img: Img, ops: PageOps = workerOps): Promise<{ img: Img; found: boolean; corners?: number[] }> {
  const L = Math.max(img.width, img.height), k = L > FIND_SIZE ? FIND_SIZE / L : 1;
  const small = k < 1 ? await ops.resize(img, Math.round(img.width * k), Math.round(img.height * k)) : img;
  if ((await ops.flatShare(small)) > DIGITAL) return { img, found: false }; // a screenshot: square on already, and a white panel in it is no page
  const q = await ops.pageQuad(small);
  if (!(q.confidence > 0) || !usable(q.corners, small.width, small.height)) return { img, found: false };
  const corners = q.corners.map((v) => v / k);
  const [w, h] = pageSize(corners);
  return { img: await ops.warp(img, corners, w, h), found: true, corners };
}
