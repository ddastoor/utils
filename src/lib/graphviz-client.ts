// Main-thread side of src/workers/graphviz.worker.ts. Worker starts on first use, ends on leave or stop().
import { trackWorker, releaseNow } from '../lifecycle';
import type { GvResult } from '../wasm/graphviz';
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { res: (v: GvResult) => void; rej: (e: Error) => void }>();
export function graphviz(src: string, engine = 'dot', format = 'svg'): Promise<GvResult> {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/graphviz.worker.ts', import.meta.url), { type: 'module' }), 'graphviz-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.result); };
    worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || 'Graphviz failed to start')); pending.clear(); worker = null; };
  }
  const id = ++seq;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); worker!.postMessage({ id, src, engine, format }); });
}
/** Terminate a long layout. Pending calls are rejected; the next call starts a fresh worker. */
export function stopGraphviz() {
  if (!worker) return;
  for (const p of pending.values()) p.rej(new Error('Stopped')); releaseNow('graphviz-worker');
}
