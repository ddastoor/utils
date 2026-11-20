// Promise wrapper around the hash worker (src/workers/hash.worker.ts). `stopHashing()` ends the worker at once.
import { trackWorker, releaseNow } from '../lifecycle';

let worker: Worker | null = null, seq = 0;
type Pending = { resolve: (v: Record<string, string>) => void; reject: (e: Error) => void; onProgress?: (done: number, ms: number) => void };
const pending = new Map<number, Pending>();
const end = (why: string) => { for (const p of pending.values()) p.reject(new Error(why)); pending.clear(); worker = null; };

function w() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/hash.worker.ts', import.meta.url), { type: 'module' }), 'hash-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') p.onProgress?.(m.done, m.ms);
      else { pending.delete(m.id); m.type === 'done' ? p.resolve(m.result) : p.reject(new Error(m.message)); }
    };
    worker.onerror = (e) => { e.preventDefault(); end(`The hashing engine could not be loaded or stopped (${e.message || 'worker error'}). Try again.`); };
  }
  return worker;
}

/** The digests (lower-case hex) of a file or text for each algorithm id of src/lib/hashes.ts. */
export function hashData(data: Blob, algs: string[], onProgress?: (done: number, ms: number) => void): Promise<Record<string, string>> {
  const id = ++seq;
  const wk = w(); // first: making a worker may end an old one, and that clears what is pending
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); wk.postMessage({ id, data, algs }); });
}

export class Stopped extends Error {}
/** Ends a hashing run at once (the worker is terminated; the next run starts a new one). */
export function stopHashing() {
  if (!worker) return;
  const ps = [...pending.values()]; pending.clear();
  releaseNow('hash-worker'); // terminates it and forgets it (worker = null)
  for (const p of ps) p.reject(new Stopped('Stopped.'));
}
