// Promise wrapper around the page-finder worker (src/workers/pagefind.worker.ts). Ended when the tab is left.
import { trackWorker } from '../lifecycle';
import type { Found } from './pagefind';

let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { resolve: (v: Found) => void; reject: (e: Error) => void }>();
const end = (why: string) => { for (const p of pending.values()) p.reject(new Error(why)); pending.clear(); worker = null; };

function w() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/pagefind.worker.ts', import.meta.url), { type: 'module' }), 'pagefind-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.ok ? p.resolve({ corners: m.corners, score: m.score }) : p.reject(new Error(m.message));
    };
    worker.onerror = (e) => { e.preventDefault(); end(`the page finder could not be loaded (${e.message || 'worker error'})`); };
  }
  return worker;
}

/** Corners (fractions of the photo, TL TR BR BL) and P(document) for a photo made 224 × 224 with imgproc's resizeArea. */
export function findPage(rgba: Uint8ClampedArray): Promise<Found> {
  const id = ++seq;
  const wk = w();
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); wk.postMessage({ id, rgba }); });
}
