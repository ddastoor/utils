// Main-thread side of src/workers/sqlite.worker.ts: sql('exec', 'select 1'). Worker starts on first use, ends on leave.
import { trackWorker } from '../lifecycle';
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
export type SqlOp = 'open' | 'exec' | 'schema' | 'importSheet' | 'exportDb' | 'exportResult' | 'inTransaction';
export function sql<T = any>(op: SqlOp, ...args: any[]): Promise<T> {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/sqlite.worker.ts', import.meta.url), { type: 'module' }), 'sqlite-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.result); };
    worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || 'SQLite failed to start')); pending.clear(); worker = null; };
  }
  const id = ++seq;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); worker!.postMessage({ id, op, args }); });
}
