// The Book Page Flattener's steps around imgproc.wasm (p_book_fit, p_book_render — wasm/imgproc/flatten.c: Matt Zucker's
// page-dewarp method in C): a copy of the photo of at most FIT_SIZE px is set the right way up and its pages fitted; each
// page is then drawn flat from the whole photo at the photo's own resolution. No DOM: the engine's calls are passed in
// (the tab gives the imgproc worker's, the unit suite imgproc.wasm's binding in Node).
import type { Img, BookFit, BookPage } from '../wasm/imgproc';

/** The fit works on a copy of at most this many pixels a side (the engine makes it smaller still for its letters). */
export const FIT_SIZE = 1600;
export type PagesMode = 'auto' | 'one' | 'two';
export const MODE_ID: Record<PagesMode, 0 | 1 | 2> = { auto: 0, one: 1, two: 2 };
/** A quarter turn to the right n times, as p_orient takes it (EXIF orientation codes). */
export const ROT = [1, 6, 3, 8] as const;

export interface BookOps {
  bookFit(img: Img, mode: 0 | 1 | 2, focal?: number): BookFit | Promise<BookFit>;
  bookRender(img: Img, page: BookPage, w: number, h: number, fill?: number): Img | Promise<Img>;
  bookProject?(page: BookPage, w: number, h: number, pts: number[][]): number[][] | Promise<number[][]>;
  orient(img: Img, o: number): Img | Promise<Img>;
}

export interface Analysis { turns: number; fit: BookFit; img: Img }
const samples = (f: BookFit) => f.pages.reduce((n, p) => n + p.samples, 0);
/** How much of the text a fit found: its samples — or none when they do not make lines of print. A photo held sideways
 *  still gives "lines": the smearing that joins letters into words joins the letters of neighbouring lines across, into
 *  short pieces (about 4 samples a line, where real lines give 15) that the model fits badly (5 – 7 px; real lines 1). */
export function found(f: BookFit): number {
  if (!f.pages.length || !f.spans) return 0;
  const s = samples(f), rms = Math.max(...f.pages.map((p) => p.rms));
  return s / f.spans >= 8 && rms < 3 ? s : 0;
}

/**
 * The pages of a photo (a copy of at most FIT_SIZE px). `first`: the quarter turns to try first (the letters' guess —
 * src/lib/upright.ts); when that finds no page or few lines, the photo turned a quarter either way is tried too (a phone
 * held sideways: the lines run up and down it) and the turn that found the most of the text is kept. `only`: that turn
 * alone (the reader turned the photo by hand).
 */
export async function analyse(img: Img, mode: PagesMode, ops: BookOps, first = 0, only = false, focal = 0): Promise<Analysis> {
  const tries = only ? [first] : [first, (first + 1) % 4, (first + 3) % 4];
  let best: Analysis | null = null;
  for (const t of tries) {
    const im = t ? await ops.orient(img, ROT[t]) : img;
    const fit = await ops.bookFit(im, MODE_ID[mode], focal);
    const better = !best || found(fit) > found(best.fit) || (!found(best.fit) && !found(fit) && samples(fit) > samples(best.fit));
    if (better) best = { turns: t, fit, img: im };
    if (found(fit) && fit.spans >= 12) break; // the lines are found: the other ways round need not be looked at
  }
  // pieces that are no lines of print (a photo of a cup, a table's grain): no page
  if (!found(best!.fit)) best!.fit = { ...best!.fit, pages: [], gutter: null };
  return best!;
}

/** The camera's focal length as the fit takes it (in half the photo's longer side) from the 35 mm-equivalent focal length
 *  a phone writes into the photo (EXIF FocalLengthIn35mmFilm — defined on the diagonal of a 36 × 24 mm frame, 43.27 mm):
 *  26 mm on a 4 : 3 photo → 1.50. 0 when it is not given (the engine then takes 1.45). */
export function focalFrom35(f35: number | undefined, w: number, h: number): number {
  if (!f35 || !(f35 > 0) || !(w > 0) || !(h > 0)) return 0;
  return (2 * f35 * Math.hypot(w, h)) / (43.267 * Math.max(w, h));
}

/** The flat page's size in pixels drawn from a photo of W × H (the way round the fit saw it): as many pixels as the photo
 *  gives the text, the longer side at most `cap`. */
export function pageSize(page: BookPage, W: number, H: number, cap: number): [number, number] {
  const ppu = (page.scale * Math.max(W, H)) / 2;
  const w = (page.rect[2] - page.rect[0]) * ppu, h = (page.rect[3] - page.rect[1]) * ppu;
  const k = Math.min(1, cap / Math.max(w, h, 1));
  return [Math.max(16, Math.round(w * k)), Math.max(16, Math.round(h * k))];
}

/** A page drawn flat from the photo (set the way round the fit saw it, any size of it), its longer side at most `cap`. */
export async function renderPage(photo: Img, page: BookPage, cap: number, ops: BookOps): Promise<Img> {
  const [w, h] = pageSize(page, photo.width, photo.height, cap);
  return ops.bookRender(photo, page, w, h, 0xffffffff);
}

/** What the fit found, in words: "two pages · 76 lines", "one page · 38 lines". */
export function summary(fit: BookFit): string {
  if (!fit.pages.length) return 'no lines of text found';
  const lines = fit.pages.reduce((n, p) => n + p.spans, 0);
  return `${fit.pages.length === 2 ? 'two pages' : 'one page'} · ${lines} lines`;
}

/** A page's place in a photo of two: the left one or the right one, else the page. */
export const sideName = (p: BookPage) => (p.side === 'left' ? 'left page' : p.side === 'right' ? 'right page' : 'page');

/** "Fit to page" in a PDF: the page's shape, its longer side as long as A4's (a photo does not say how big the book is;
 *  a typical paperback comes out a little larger than in the hand — as the Doc Scanner's "Fit to scan"). */
export function fitPage(w: number, h: number): [number, number] {
  const s = 841.89 / Math.max(w, h);
  return [Math.round(w * s * 100) / 100, Math.round(h * s * 100) / 100];
}
