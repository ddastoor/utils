// Promise wrapper around the anime worker (src/workers/anime.worker.ts) of the Cartoonizer. Started with the first anime look, ended
// when the tab is left (the looks' graphs go with it).
import { trackWorker } from '../lifecycle';
import type { Img } from '../wasm/imgproc';

/** how far a drawing has come: the look's graph fetched (bytes, once a visit), then the drawing */
export interface AnimeProgress { phase: 'fetch' | 'draw'; done?: number; total?: number }
type Pending = { resolve: (v: Img & { ms: number }) => void; reject: (e: Error) => void; progress?: (p: AnimeProgress) => void };
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, Pending>();
const end = (why: string) => { for (const p of pending.values()) p.reject(new Error(why)); pending.clear(); worker = null; };

function w() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/anime.worker.ts', import.meta.url), { type: 'module' }), 'anime-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') { p.progress?.({ phase: m.phase, done: m.done, total: m.total }); return; }
      pending.delete(m.id);
      m.type === 'done' ? p.resolve(m.result) : p.reject(new Error(m.error));
    };
    worker.onerror = (e) => { e.preventDefault(); worker?.terminate(); end(`the anime looks could not be loaded (${e.message || 'worker error'})`); };
  }
  return worker;
}

/** A picture drawn in an anime look: the same size as the picture given (src/lib/anime.ts sizes it). */
export function animeDraw(img: Img, style: string, progress?: (p: AnimeProgress) => void): Promise<Img & { ms: number }> {
  const id = ++seq, wk = w(), rgba = new Uint8ClampedArray(img.data); // a copy: the picture stays the caller's
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    wk.postMessage({ id, style, base: document.baseURI, rgba, width: img.width, height: img.height }, [rgba.buffer]);
  });
}
