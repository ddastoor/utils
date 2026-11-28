// Promise wrapper around the tracing worker (src/workers/vector.worker.ts) of the Image to SVG and Clipart Maker tabs. The worker —
// VTracer, Potrace, imgproc and, for a clip art, the cut-out model — is started with the first picture and ended when the tab is left.
import { trackWorker } from '../lifecycle';
import type { Img } from '../wasm/imgproc';
import type { VtOptions } from '../wasm/vtracer';
import type { BwOptions, ClipOptions, ClipResult } from './vectorize';
export type { BwOptions, ClipOptions, ClipResult };

/** how far a job has come: the cut-out model fetched (bytes), the subject cut out, the colours made flat */
export interface VectorProgress { phase: 'fetch' | 'cut' | 'flat'; done?: number; total?: number }
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; progress?: (p: VectorProgress) => void };
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, Pending>();
const end = (why: string) => { for (const p of pending.values()) p.reject(new Error(why)); pending.clear(); worker = null; };

function w() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/vector.worker.ts', import.meta.url), { type: 'module' }), 'vector-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') { p.progress?.({ phase: m.phase, done: m.done, total: m.total }); return; }
      pending.delete(m.id);
      m.type === 'done' ? p.resolve(m.result) : p.reject(new Error(m.error));
    };
    worker.onerror = (e) => { e.preventDefault(); worker?.terminate(); end(`the tracer could not be loaded (${e.message || 'worker error'})`); };
  }
  return worker;
}
function call<T>(op: string, img: Img, opts: unknown, progress?: (p: VectorProgress) => void): Promise<T> {
  const id = ++seq, wk = w(), data = new Uint8ClampedArray(img.data); // a copy: the picture stays the caller's
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    wk.postMessage({ id, op, base: document.baseURI, img: { data, width: img.width, height: img.height }, opts }, [data.buffer]);
  });
}
/** colour tracing (VTracer) */
export const traceColor = (img: Img, o: VtOptions) => call<{ svg: string }>('color', img, o).then((r) => r.svg);
/** black and white (Potrace), and the threshold used */
export const traceBw = (img: Img, o: BwOptions) => call<{ svg: string; threshold: number }>('bw', img, o);
/** a clip art's parts: its flat shapes and its outline, traced */
export const clipParts = (img: Img, o: ClipOptions, progress?: (p: VectorProgress) => void) => call<ClipResult>('clipart', img, o, progress);
