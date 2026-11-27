// PDF Redact, pictures: numbers read in a scanned page (no text layer) and QR codes and barcodes on any page — they hold
// what the printed numbers say (an e-Aadhaar's QR code). No DOM and no engine of its own: the page is drawn by MuPDF, read
// by the OCR tab's Tesseract and the scanner's zxing-cpp — handed in (`PicEngines`) so the unit suite runs the same code
// in Node. Boxes come back in MuPDF's page space (the drawing's pixels divided by its scale).
import type { OcrResult } from './ocr';
import { rectsOf, type Hit, type PageText, type Rect, type Scan } from './redact';

export interface Img { data: Uint8ClampedArray; width: number; height: number }
export interface Code { text: string; format: string; box: Rect }
export interface PicEngines {
  /** the page drawn at `scale` pixels a point, RGBA */
  render(page: number, scale: number): Promise<Img> | Img;
  ocr(img: Img, page: number): Promise<OcrResult>;
  codes(img: Img): Promise<Code[]>;
}
/** pixels a point for reading a scanned page (about 216 dpi: Tesseract reads 10-point type well) and for finding codes */
export const OCR_SCALE = 3, CODE_SCALE = 2;

/** An OCR reading as a page's text: its lines, words apart by a space; each character carries its word's box. */
export function wordsText(r: OcrResult, scale: number): PageText {
  let text = ''; const quads: Array<number[] | null> = []; const line: number[] = [];
  const lines = r.lines?.length ? r.lines : [{ w0: 0, w1: r.words.length, para: 0, block: 0 }];
  lines.forEach((l, li) => {
    if (text) { text += '\n'; quads.push(null); line.push(-1); }
    for (let w = l.w0; w < l.w1; w++) {
      const wd = r.words[w]; if (!wd) continue;
      if (w > l.w0) { text += ' '; quads.push(null); line.push(li); }
      const [x0, y0, x1, y1] = [wd.x0 / scale, wd.y0 / scale, wd.x1 / scale, wd.y1 / scale];
      const q = [x0, y0, x1, y0, x0, y1, x1, y1];
      for (let i = 0; i < wd.text.length; i++) { text += wd.text[i]; quads.push(q); line.push(li); }
    }
  });
  return { text, quads, line: Int32Array.from(line) };
}

let nid = 0;
/** Numbers read in the pictures of the scanned pages, and every QR code or barcode found on the pages. */
export async function findInPictures(o: { ocrPages: number[]; codePages: number[] }, scan: Scan, e: PicEngines, progress?: (done: number, all: number, what: string) => void): Promise<Hit[]> {
  const hits: Hit[] = [];
  const all = o.ocrPages.length + o.codePages.length; let done = 0;
  for (const p of o.ocrPages) {
    progress?.(done, all, `Reading the scanned page ${p + 1}`);
    const img = await e.render(p, OCR_SCALE);
    const pt = wordsText(await e.ocr(img, p), OCR_SCALE);
    for (const f of scan(pt.text)) {
      const rects = rectsOf(pt, f.s, f.e); if (!rects.length) continue;
      hits.push({ id: `p${++nid}`, page: p, kind: f.kind, value: f.value, text: pt.text.slice(f.s, f.e).replace(/\s+/g, ' '), rects, source: 'ocr', on: true });
    }
    done++;
  }
  for (const p of o.codePages) {
    progress?.(done, all, `Looking for QR codes on page ${p + 1}`);
    const img = await e.render(p, CODE_SCALE);
    for (const c of await e.codes(img)) {
      // the code's quiet zone too: a sliver of a code left at its edge reads no more, but a whole one would
      const [x0, y0, x1, y1] = c.box, pad = Math.max(4, (x1 - x0) * 0.06);
      const r: Rect = [(x0 - pad) / CODE_SCALE, (y0 - pad) / CODE_SCALE, (x1 + pad) / CODE_SCALE, (y1 + pad) / CODE_SCALE];
      hits.push({ id: `q${++nid}`, page: p, kind: 'qr', value: c.text, text: `${c.format}: ${c.text.length > 60 ? c.text.slice(0, 57) + '…' : c.text}`, rects: [r], source: 'qr', on: true });
    }
    done++;
  }
  progress?.(all, all, '');
  return hits;
}
