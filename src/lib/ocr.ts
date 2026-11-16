// OCR engine: Tesseract 5 LSTM (C++ → WebAssembly, tesseract.js-core), all models served
// from this site (public/vendor/tesseract). Languages (owner): English, French, Spanish, German. cacheMethod 'none': models are never stored in IndexedDB (stateless app).
import type { Worker as TWorker } from 'tesseract.js';
import { onLeave } from '../lifecycle';

export type OcrLang = 'eng' | 'fra' | 'spa' | 'deu' | 'eng+fra+spa+deu';
const at = (p: string) => new URL(p, document.baseURI).href;
let current: { langs: OcrLang; w: Promise<TWorker> } | null = null;
let progressCb: ((p: number, status: string) => void) | null = null;

export async function ocrWorker(langs: OcrLang): Promise<TWorker> {
  if (current?.langs === langs) return current.w;
  const old = current; current = null;
  if (old) (await old.w).terminate();
  const { createWorker, OEM } = await import('tesseract.js');
  const w = createWorker(langs.split('+'), OEM.LSTM_ONLY, {
    workerPath: at('vendor/tesseract/worker.min.js'),
    corePath: at('vendor/tesseract/core/'),
    langPath: at('vendor/tesseract/lang'),
    gzip: true, cacheMethod: 'none', workerBlobURL: false,
    logger: (m: any) => progressCb?.(m.progress ?? 0, m.status || ''),
  });
  current = { langs, w };
  onLeave('ocr-worker', () => { const c = current; current = null; c?.w.then((x) => x.terminate()).catch(() => {}); });
  return w;
}

export interface OcrResult { text: string; confidence: number; words: Array<{ text: string; conf: number; x0: number; y0: number; x1: number; y1: number }> }
export async function recognize(img: ImageData | HTMLCanvasElement | Blob, langs: OcrLang, onProgress?: (p: number, status: string) => void): Promise<OcrResult> {
  progressCb = onProgress || null;
  const w = await ocrWorker(langs);
  const src = img instanceof ImageData ? (() => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(img, 0, 0); return c; })() : img;
  const { data } = await w.recognize(src as any, {}, { text: true, blocks: true });
  const words: OcrResult['words'] = [];
  for (const b of (data as any).blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const wd of l.words || []) words.push({ text: wd.text, conf: wd.confidence, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 });
  progressCb = null;
  return { text: (data.text || '').replace(/\n{3,}/g, '\n\n').trim(), confidence: data.confidence, words };
}
