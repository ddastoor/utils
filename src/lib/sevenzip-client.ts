// Promise wrapper around the 7-Zip worker (src/workers/sevenzip.worker.ts). `stopSevenZip()` ends the worker at once.
import { trackWorker, releaseNow } from '../lifecycle';

let worker: Worker | null = null, seq = 0;
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (pct: number) => void };
const pending = new Map<number, Pending>();
export class Stopped extends Error {}

function w() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/sevenzip.worker.ts', import.meta.url), { type: 'module' }), 'sevenzip-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') p.onProgress?.(m.pct);
      else { pending.delete(m.id); m.type === 'done' ? p.resolve(m.result) : p.reject(new Error(m.message)); }
    };
    worker.onerror = (e) => { e.preventDefault(); const ps = [...pending.values()]; pending.clear(); releaseNow('sevenzip-worker'); for (const p of ps) p.reject(new Error(`7-Zip could not be loaded (${e.message || 'worker error'}). Try again.`)); };
  }
  return worker;
}

/** An archive (zip or 7z) of the files, each under its path. */
export function createArchive(files: Array<{ path: string; file: File }>, o: { format: 'zip' | '7z'; level: number; password: string; encryptNames: boolean }, onProgress?: (pct: number) => void): Promise<Uint8Array> {
  const wk = w(), id = ++seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); wk.postMessage({ id, op: 'create', files, ...o }); });
}

export function stopSevenZip() {
  if (!worker) return;
  const ps = [...pending.values()]; pending.clear();
  releaseNow('sevenzip-worker');
  for (const p of ps) p.reject(new Stopped('Stopped.'));
}
