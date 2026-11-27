// Promise wrapper around the EPUB Reader's worker (src/workers/ebook.worker.ts). The worker — MuPDF and the book in it —
// is made when a book is opened and ended when the tab is left (or another book is opened: `closeReader()`).
import { trackWorker, releaseNow } from '../lifecycle';
import type { BookInfo, Entry, Hit, Look, PageLink } from './ebook';

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; onHits?: (h: Hit[]) => void; onProgress?: (done: number, total: number) => void };
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, Pending>();
export class ReaderGone extends Error {}

function w() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/ebook.worker.ts', import.meta.url), { type: 'module' }), 'ebook-worker', () => {
      const ps = [...pending.values()]; pending.clear(); worker = null;
      for (const p of ps) p.reject(new ReaderGone('The reader was closed.'));
    });
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id);
      if (!p) return;
      if (m.type === 'hits') { p.onHits?.(m.hits); return; }
      if (m.type === 'progress') { p.onProgress?.(m.done, m.total); return; }
      pending.delete(m.id);
      m.type === 'done' ? p.resolve(m.result) : p.reject(new Error(m.message));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      const ps = [...pending.values()]; pending.clear();
      releaseNow('ebook-worker');
      for (const p of ps) p.reject(new Error(`the reader could not be loaded (${e.message || 'worker error'}). Try again.`));
    };
  }
  return worker;
}
function call<T>(msg: object, transfer: Transferable[] = [], extra: Partial<Pending> = {}): { id: number; done: Promise<T> } {
  const wk = w(), id = ++seq;
  const done = new Promise<T>((resolve, reject) => { pending.set(id, { resolve, reject, ...extra }); wk.postMessage({ id, ...msg }, transfer); });
  return { id, done };
}

export interface Opening { info?: BookInfo; note?: string; missing?: string[]; refused?: string; unpack?: 'RAR' | '7z' }
/** Open a book (its bytes are handed over) and lay it out at w × h CSS px. */
export const openBook = (bytes: Uint8Array, name: string, look: Look, w: number, h: number) =>
  call<Opening>({ op: 'open', bytes, name, look, w, h, base: document.baseURI }, [bytes.buffer]).done;
/** Lay the open book out again; the page on which the anchor's words now stand (else the same share of the book). */
export const relayout = (look: Look, w: number, h: number, anchor: string, share: number) =>
  call<{ pages: number; contents: Entry[]; page: number; missing: string[] }>({ op: 'layout', look, w, h, anchor, share }).done;
export const drawPage = (i: number, scale: number, bg: string) => call<{ w: number; h: number; rgba: Uint8ClampedArray }>({ op: 'draw', i, scale, bg }).done;
export const pageSize = (i: number) => call<[number, number]>({ op: 'size', i }).done;
export const anchorOf = (i: number) => call<string>({ op: 'anchor', i }).done;
export const textFrom = (from: number, max: number) => call<string>({ op: 'text', from, max }).done;
export const pageText = (i: number) => call<string>({ op: 'pagetext', i }).done;
export const linksOf = (i: number) => call<PageLink[]>({ op: 'links', i }).done;
export const selectText = (i: number, a: [number, number], b: [number, number]) => call<{ text: string; quads: number[][] }>({ op: 'select', i, a, b }).done;
export const wordAt = (i: number, at: [number, number]) => call<{ a: [number, number]; b: [number, number] } | null>({ op: 'word', i, at }).done;

/** Search the book from a page on, round to the page before it; hits arrive as they are found. */
export function searchBook(query: string, from: number, onHits: (h: Hit[]) => void, onProgress: (done: number, total: number) => void) {
  const { id, done } = call<{ found: number; stopped?: boolean; capped?: boolean }>({ op: 'search', query, from }, [], { onHits, onProgress });
  return { done, stop: () => worker?.postMessage({ op: 'stop', target: id }) };
}
/** End the worker and the book in it. */
export const closeReader = () => releaseNow('ebook-worker');
