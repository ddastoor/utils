// Make PDF Searchable (potentials #3): a scanned page's words written on it as invisible text (render mode 3) — each word at
// its place, stretched or squeezed to its box (Tz), in Helvetica, one of PDF's standard fonts (WinAnsi) — the way OCRmyPDF and
// Tesseract's own PDF renderer lay a text layer: the page looks as it did, and its words can be searched, selected and
// copied. The words come from the OCR tab's reading path, read on the page drawn at `s` px a point and turned `t` quarter
// turns clockwise to stand upright. No DOM: the unit suite runs it in Node.
import type { OcrResult } from './ocr';
import { pdfString, isLatin1 } from './pdf';

/** A point of the picture read (the page as shown, drawn Wr × Hr px and turned t quarter turns clockwise) on the page as
 *  shown, in points from its bottom left (H: the page's height in points). */
export function toPage(x: number, y: number, t: number, Wr: number, Hr: number, s: number, H: number): [number, number] {
  let xr: number, yr: number;
  switch (((t % 4) + 4) % 4) {
    case 1: xr = y; yr = Hr - x; break;       // the picture was the page turned a quarter to the right
    case 2: xr = Wr - x; yr = Hr - y; break;  // upside down
    case 3: xr = Wr - y; yr = x; break;       // a quarter to the left
    default: xr = x; yr = y;
  }
  return [xr / s, H - yr / s];
}
/** The text's direction and its "up" on the page as shown, for a picture read turned t quarter turns: a text matrix's a b c d. */
export const DIRS: Array<[number, number, number, number]> = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]];

/** What WinAnsi can show: ligatures written out, anything else it lacks a question mark (the word still takes its place). */
export function latin(text: string): string {
  return [...text.replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl').replace(/\s+/g, ' ')]
    .map((c) => (isLatin1(c) ? c : '?')).join('');
}

/** Helvetica's ascent to descent, in ems: a line of OCR'd words from its tallest letter to its lowest is about that high */
export const EM_LINE = 0.93, DESCENT = 0.207;
const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : String(+n.toFixed(3)));

export interface LayerOpts {
  /** quarter turns clockwise the page was turned to be read */
  t: number;
  /** the page as shown, drawn: its size in pixels, the pixels a point, its height in points */
  Wr: number; Hr: number; s: number; H: number;
  /** a text's width in Helvetica at size 1 (points) */
  width: (text: string) => number;
}
/** The content operators of a page's text layer (in the page's shown coordinates, as `stampPage` takes them) and how many words
 *  it holds. Each line's words take one size — the line's height — and its baseline (above the lowest letter's descent);
 *  each word starts at its box and is stretched to its width, a space after it so that a reader of the text sees words. */
export function textLayer(r: Pick<OcrResult, 'words' | 'lines'>, o: LayerOpts): { ops: string; words: number } {
  const [a, b, c, d] = DIRS[((o.t % 4) + 4) % 4];
  const lines = r.lines?.length ? r.lines : [{ w0: 0, w1: r.words.length, para: 0, block: 0 }];
  let ops = 'BT 3 Tr /STF 1 Tf ', n = 0;
  for (const l of lines) {
    const ws = r.words.slice(l.w0, l.w1).filter((w) => w.text.trim() && w.x1 > w.x0 && w.y1 > w.y0);
    if (!ws.length) continue;
    const top = Math.min(...ws.map((w) => w.y0)), bot = Math.max(...ws.map((w) => w.y1));
    const S = Math.max(0.5, (bot - top) / o.s / EM_LINE), base = bot - DESCENT * S * o.s;
    for (const w of ws) {
      const text = latin(w.text.trim()), tw = o.width(text);
      if (!(tw > 0)) continue;
      const tz = (100 * ((w.x1 - w.x0) / o.s)) / (tw * S);
      const [X, Y] = toPage(w.x0, base, o.t, o.Wr, o.Hr, o.s, o.H);
      ops += `${f(tz)} Tz ${f(a * S)} ${f(b * S)} ${f(c * S)} ${f(d * S)} ${f(X)} ${f(Y)} Tm ${pdfString(`${text} `)} Tj `;
      n++;
    }
  }
  return { ops: `${ops}ET`, words: n };
}

/** A page is read unless it has text already — a page of real text, or one read before (OCRmyPDF's --skip-text). A page with
 *  no picture is read too: its letters may be drawn as shapes (outlined fonts); a blank one reads as no words, quickly. */
export const hasText = (k: { chars: number }) => k.chars >= 20;
