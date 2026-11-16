// Main-thread side of src/workers/python.worker.ts: one run at a time, output streamed through callbacks.
import { trackWorker, releaseNow } from '../lifecycle';
export interface PyRun { code: number; ms: number; note: string; error?: string; files: Array<{ name: string; bytes: Uint8Array }> }
let worker: Worker | null = null, seq = 0;
let cur: { id: number; out: (s: string) => void; err: (s: string) => void; res: (r: PyRun) => void; rej: (e: Error) => void } | null = null;
export function runPython(code: string, o: { stdin?: string; files?: Array<{ name: string; bytes: Uint8Array }>; args?: string[]; out: (s: string) => void; err: (s: string) => void }): Promise<PyRun> {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/python.worker.ts', import.meta.url), { type: 'module' }), 'python-worker', () => { cur?.rej(new Error('Stopped')); cur = null; worker = null; });
    worker.onmessage = (e) => {
      const m = e.data; if (!cur) return;
      if (m.type === 'out') cur.out(m.text); else if (m.type === 'err') cur.err(m.text);
      else if (m.type === 'done' && m.id === cur.id) { const c = cur; cur = null; m.error ? c.rej(new Error(m.error)) : c.res(m); }
    };
    worker.onerror = (e) => { cur?.rej(new Error(e.message || 'Python failed to start')); cur = null; };
  }
  if (cur) return Promise.reject(new Error('A program is already running'));
  const id = ++seq;
  return new Promise((res, rej) => { cur = { id, out: o.out, err: o.err, res, rej }; worker!.postMessage({ id, code, stdin: o.stdin || '', files: o.files || [], args: o.args || [] }); });
}
/** Stop the running program: the worker is terminated (a fresh one starts on the next run). */
export function stopPython() { releaseNow('python-worker'); }
export const pythonBusy = () => cur != null;
