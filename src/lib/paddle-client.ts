// Promise wrapper around the PaddleOCR worker (src/workers/paddle.worker.ts) — the second reader for soft photos. The
// worker and its models are fetched the first time a photo needs them and ended when the tab is left.
import { trackWorker } from '../lifecycle';
import type { Img } from '../wasm/imgproc';
import type { PaddleLine } from './paddle';

/** How far the second reader has come: its models fetched (bytes), or the lines read. */
export interface PaddleProgress { phase: 'fetch' | 'read'; done: number; total: number }
type Pending = { resolve: (v: PaddleLine[] | null) => void; reject: (e: Error) => void; progress?: (p: PaddleProgress) => void; stale?: () => boolean };
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, Pending>();
const end = (why: string) => { for (const p of pending.values()) p.reject(new Error(why)); pending.clear(); worker = null; };

function w() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/paddle.worker.ts', import.meta.url), { type: 'module' }), 'paddle-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') {
        // a reading the page no longer wants (a newer photo, the tab left) is ended at the worker's next line
        if (p.stale?.()) worker?.postMessage({ id: m.id, op: 'cancel' });
        p.progress?.({ phase: m.phase, done: m.done, total: m.total });
        return;
      }
      pending.delete(m.id);
      m.type === 'done' ? p.resolve(m.lines) : p.reject(new Error(m.message));
    };
    worker.onerror = (e) => { e.preventDefault(); end(`the second reader could not be loaded (${e.message || 'worker error'})`); };
  }
  return worker;
}

/** PaddleOCR's lines of a picture (null: the reading was ended because `stale()` said so). */
export function paddleLines(img: Img, progress?: (p: PaddleProgress) => void, stale?: () => boolean): Promise<PaddleLine[] | null> {
  const id = ++seq, wk = w(), data = new Uint8ClampedArray(img.data); // a copy: the picture stays the caller's
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress, stale });
    wk.postMessage({ id, op: 'read', base: document.baseURI, img: { data, width: img.width, height: img.height } }, [data.buffer]);
  });
}
