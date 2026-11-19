// Main-thread side of src/workers/graphviz.worker.ts. The module is fetched and compiled on first use and the worker
// started with it; both end when the tab is left. One layout runs at a time and the newest request wins: a request
// that arrives while a layout runs waits for it a moment, then the worker is ended and a new one draws the newer text
// (a layout cannot be interrupted any other way).
import { trackWorker, releaseNow, onLeave } from '../lifecycle';
import { compileWasi } from '../wasm/wasi';
import wasmUrl from '../wasm/bin/graphviz.wasm?url';
import type { GvRender } from '../wasm/graphviz';

export interface GvJob { src: string; engine: string; formats: string[]; index?: number }
export interface GvAnswer extends GvRender {
  /** time the layout and the formats took, in ms */
  ms: number;
  /** the Graphviz release of the module */
  version: string;
  /** true when the text was measured with the browser's fonts (false: Graphviz's built-in tables) */
  measured: boolean;
}
/** How long a running layout may hold up a newer request before it is ended. */
export const PATIENCE_MS = 400;
type Waiter = { job: GvJob; res: (v: GvAnswer) => void; rej: (e: Error) => void };
let worker: Worker | null = null, seq = 0, module: Promise<WebAssembly.Module> | null = null;
let running: (Waiter & { id: number }) | null = null, waiting: Waiter | null = null, impatient: any = null;

function end(why: string) {
  clearTimeout(impatient); impatient = null;
  const r = running; running = null;
  r?.rej(new Error(why));
  releaseNow('graphviz-worker');
}
function start(w: Waiter) {
  const id = ++seq;
  running = { ...w, id };
  if (!module) { module = compileWasi(wasmUrl); onLeave('graphviz-module', () => { module = null; }); }
  module.then((m) => {
    if (running?.id !== id) return;                       // stopped or superseded while the module loaded
    if (!worker) {
      worker = trackWorker(new Worker(new URL('../workers/graphviz.worker.ts', import.meta.url), { type: 'module' }), 'graphviz-worker', () => { worker = null; });
      worker.onmessage = (e) => {
        const r = running; if (!r || e.data.id !== r.id) return;
        running = null; clearTimeout(impatient); impatient = null;
        e.data.error ? r.rej(new Error(e.data.error)) : r.res(e.data.result);
        next();
      };
      worker.onerror = (e) => { e.preventDefault?.(); end(e.message || 'Graphviz failed to start'); next(); };
    }
    worker.postMessage({ id, module: m, ...w.job });
  }, (e) => { module = null; if (running?.id === id) { running = null; w.rej(e instanceof Error ? e : new Error(String(e))); next(); } });
}
function next() { const w = waiting; waiting = null; if (w) start(w); }

/** Lay out graph `index` of `src` once and write it in each of `formats`. Rejects with "Superseded" when a newer
 *  request took its place and with "Stopped" after stopGraphviz(). */
export function graphviz(job: GvJob): Promise<GvAnswer> {
  return new Promise((res, rej) => {
    const w = { job, res, rej };
    if (!running) return start(w);
    waiting?.rej(new Error('Superseded'));
    waiting = w;
    impatient ||= setTimeout(() => { impatient = null; if (running && waiting) { end('Superseded'); next(); } }, PATIENCE_MS);
  });
}
/** End a long layout. Pending calls are rejected with "Stopped"; the next call starts a fresh worker. */
export function stopGraphviz() {
  const w = waiting; waiting = null;
  w?.rej(new Error('Stopped'));
  end('Stopped');
}
/** Is a layout running or waiting? */
export const graphvizBusy = () => !!running;
