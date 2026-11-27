// OCR engine: Tesseract 5 LSTM (C++ → WebAssembly, tesseract.js-core), all models served
// from this site (public/vendor/tesseract). Languages (owner): English, French, Spanish, German. cacheMethod 'none': models are never stored in IndexedDB (stateless app).
import type { Worker as TWorker } from 'tesseract.js';
import { onLeave } from '../lifecycle';

export type OcrLang = 'eng' | 'fra' | 'spa' | 'deu' | 'eng+fra+spa+deu';
const at = (p: string) => new URL(p, document.baseURI).href;
let current: { langs: OcrLang; w: Promise<TWorker> } | null = null;
let progressCb: ((p: number, status: string) => void) | null = null;
let failCb: ((e: Error) => void) | null = null;

/** Tesseract.js reports what went wrong as the text of a JavaScript error ("TypeError: Failed to fetch"); in words. */
export function ocrError(e: unknown): Error {
  const s = String((e as Error)?.message ?? e ?? '').replace(/^Error:\s*/, '');
  if (/fetch|network|load|404|traineddata/i.test(s)) return new Error(`The text engine or its language data could not be fetched (${s}) — check the connection and try again.`);
  return new Error(`The text engine stopped: ${s || 'no reason given'}. Try again.`);
}

export async function ocrWorker(langs: OcrLang): Promise<TWorker> {
  if (current?.langs === langs) return current.w;
  const old = current; current = null;
  if (old) old.w.then((x) => x.terminate()).catch(() => {});
  const { createWorker, OEM } = await import('tesseract.js');
  let fail!: (e: Error) => void;
  const failed = new Promise<never>((_, reject) => { fail = reject; });
  failed.catch(() => {});
  // Tesseract.js rejects createWorker only when its first step fails: a language file that cannot be fetched left the
  // promise pending for ever (the tab stuck at "Loading the text engine…") and threw from its message handler (an
  // uncaught error). Its errorHandler is told about every failed job: the worker is given up and the caller is told.
  const made = createWorker(langs.split('+'), OEM.LSTM_ONLY, {
    workerPath: at('vendor/tesseract/worker.min.js'),
    corePath: at('vendor/tesseract/core/'),
    langPath: at('vendor/tesseract/lang'),
    gzip: true, cacheMethod: 'none', workerBlobURL: false,
    logger: (m: any) => progressCb?.(m.progress ?? 0, m.status || ''),
    errorHandler: (e: unknown) => { const err = ocrError(e); fail(err); failCb?.(err); },
  }).then(async (x) => {
    // Tesseract's own diagnostics ("Estimating resolution as 274", "Line cannot be recognized!!" on a blurred photo) are
    // printed as console errors: they go nowhere (they change no result — measured)
    await x.setParameters({ debug_file: '/dev/null' } as any);
    return x;
  });
  const w = Promise.race([made, failed]);
  const entry = { langs, w };
  current = entry;
  w.catch(() => { if (current === entry) current = null; made.then((x) => x.terminate()).catch(() => {}); }); // the next call starts afresh
  onLeave('ocr-worker', () => { const c = current; current = null; c?.w.then((x) => x.terminate()).catch(() => {}); });
  return w;
}

/** Below this average confidence a reading is poor: the OCR tab tries the picture turned, and both tabs say that a sharper
 *  photo would read better. Measured on photographed pages (scripts/measure-ocr.mjs, 21 Nov 2026): sharp photos average
 *  94 – 95; every reading below 60 had most of its words wrong (the photo out of focus, shaken, or its text a few pixels
 *  high). */
export const POOR = 60;

export interface OcrWord { text: string; conf: number; x0: number; y0: number; x1: number; y1: number }
/** A line of a reading: its words (`words[w0]` up to, not with, `words[w1]`) and the paragraph and block it belongs to —
 *  Tesseract's text puts a blank line between paragraphs. The OCR tab sets a page's lists out by them (to-do #31). */
export interface OcrLine { w0: number; w1: number; para: number; block: number }
export interface OcrResult {
  text: string; confidence: number; words: OcrWord[]; lines?: OcrLine[];
  /** words in blocks Tesseract's page layout took for vertical text (a blurred page of horizontal lines can look like it:
   *  letters of neighbouring lines run together) — the Newspaper Clipper reads such a page again, sharpened */
  vertical?: number;
}
/** Tesseract's block types (PolyBlockType) its text leaves out — pictures and rules (TessBaseAPI::GetUTF8Text) */
const NOT_TEXT = new Set([9, 10, 11, 12, 13]);
/** PT_VERTICAL_TEXT */
const VERTICAL = 7;
/** Tesseract.js's result (`text`, `confidence`, `blocks`) as the tabs' reading: the text, the words with their boxes and
 *  the lines of the text — each line's words joined by single spaces are the text's line, its paragraphs apart by a blank
 *  line (GetUTF8Text's own rule). No DOM: scripts/measure-ocr.mjs reads Tesseract in Node through it. */
export function readingOf(data: { text?: string | null; confidence?: number | null; blocks?: any[] | null }): OcrResult {
  const words: OcrWord[] = [], lines: OcrLine[] = [];
  let para = 0, block = 0, vertical = 0;
  for (const b of data.blocks || []) {
    const text = !NOT_TEXT.has(b.blocktype);
    if (b.blocktype === VERTICAL) for (const p of b.paragraphs || []) for (const l of p.lines || []) vertical += (l.words || []).length;
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) {
        const w0 = words.length;
        for (const wd of l.words || []) words.push({ text: wd.text, conf: wd.confidence, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 });
        if (text && words.length > w0) lines.push({ w0, w1: words.length, para, block });
      }
      para++;
    }
    block++;
  }
  return { text: (data.text || '').replace(/\n{3,}/g, '\n\n').trim(), confidence: data.confidence ?? 0, words, lines, vertical };
}
/** How Tesseract lays the picture out (its page segmentation mode): 'page' finds the blocks of a page — columns, a
 *  sidebar, a table's cells — and reads each on its own (mode 3); 'block' reads the picture as one block of lines (mode
 *  6: what Tesseract.js does unless told — lines run straight across columns; and text lying sideways is garbage, which
 *  the quick readings that decide which way up a page stands rely on). */
export type Layout = 'page' | 'block';
export const PSM: Record<Layout, string> = { page: '3', block: '6' };
export async function recognize(img: ImageData | HTMLCanvasElement | Blob, langs: OcrLang, onProgress?: (p: number, status: string) => void, layout: Layout = 'block'): Promise<OcrResult> {
  progressCb = onProgress || null;
  try {
    const w = await ocrWorker(langs);
    const src = img instanceof ImageData ? (() => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(img, 0, 0); return c; })() : img;
    // a job that fails is reported to errorHandler as well as rejected: whichever comes first ends the wait
    const failed = new Promise<never>((_, reject) => { failCb = reject; });
    failed.catch(() => {});
    const { data } = await Promise.race([w.recognize(src as any, { tessedit_pageseg_mode: PSM[layout] } as any, { text: true, blocks: true }), failed]).catch((e) => { throw e instanceof Error && /text engine/.test(e.message) ? e : ocrError(e); });
    return readingOf(data as any);
  } finally { progressCb = null; failCb = null; }
}
