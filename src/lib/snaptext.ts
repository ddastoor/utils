// The camera helpers' reading (group 4 of the suggested order: Wi-Fi QR from a router sticker, Visiting Card → Contact, Paper
// Deadlines → Calendar, Bill Splitter by Photo, Camera Reader): a photo read by the OCR's reading path (src/lib/readpage.ts —
// the page found and straightened, set upright and level, cleaned up, PaddleOCR for a soft photo) as lines of words, each line
// cut into its parts where a wide gap stands between two words (a label's two columns, an amount set apart from its name, a
// QR code's specks beside a value), and the specks of a pattern read as letters left out. String glue around the readers'
// output (CLAUDE.md §3a). No DOM: the unit suites run it on the readings of the test photos in Node.
import type { OcrResult, OcrWord } from './ocr';
import type { ReadOptions } from './readpage';

export interface Part { text: string; words: OcrWord[]; x0: number; x1: number }
export interface Line { text: string; parts: Part[]; words: OcrWord[]; box: [number, number, number, number]; h: number }

/** How the camera helpers ask the reading path to read: as one block and as a page, the better kept (a card's name set larger
 *  than the rest, a label's QR code — `layout: 'both'`), and a small thing's reading not given up for the whole photo's when the
 *  desk's grain gives more words (`small`). */
export const SNAP_READ: Pick<ReadOptions, 'layout' | 'small' | 'clean' | 'auto'> = { layout: 'both', small: true, clean: true, auto: true };

/** A word that is no text: nothing but signs, or a speck read at low confidence (a pattern, a barcode's bars, a code's
 *  modules read as letters). */
const speck = (w: OcrWord) => !/[\p{L}\p{N}]/u.test(w.text) || (w.conf < 45 && w.text.length <= 3) || w.conf < 25;

/** The reading's lines, cut into parts at gaps wider than `gap` × the line's height; parts of nothing but specks left out
 *  (and their words), lines left empty left out. */
export function linesOf(r: Pick<OcrResult, 'words' | 'lines'>, gap = 1.1): Line[] {
  const out: Line[] = [];
  for (const l of r.lines ?? []) {
    const ws = r.words.slice(l.w0, l.w1).filter((w) => w && w.text.trim());
    if (!ws.length) continue;
    ws.sort((a, b) => a.x0 - b.x0);
    const hs = ws.map((w) => w.y1 - w.y0).sort((a, b) => a - b), h = Math.max(1, hs[hs.length >> 1]);
    const parts: Part[] = [];
    for (const w of ws) {
      const last = parts[parts.length - 1];
      if (last && w.x0 - last.x1 <= gap * h) { last.words.push(w); last.x1 = Math.max(last.x1, w.x1); }
      else parts.push({ text: '', words: [w], x0: w.x0, x1: w.x1 });
    }
    const kept = parts.filter((p) => !p.words.every(speck));
    for (const p of kept) {
      // a speck at the start or the end of a part (the label's frame read as "|", a code's module) goes too
      while (p.words.length > 1 && speck(p.words[0])) p.words.shift();
      while (p.words.length > 1 && speck(p.words[p.words.length - 1])) p.words.pop();
      p.text = p.words.map((w) => w.text).join(' ');
      p.x0 = p.words[0].x0; p.x1 = Math.max(...p.words.map((w) => w.x1));
    }
    if (!kept.length) continue;
    const words = kept.flatMap((p) => p.words);
    out.push({ text: kept.map((p) => p.text).join('\t'), parts: kept, words, h,
      box: [Math.min(...words.map((w) => w.x0)), Math.min(...words.map((w) => w.y0)), Math.max(...words.map((w) => w.x1)), Math.max(...words.map((w) => w.y1))] });
  }
  return out;
}
