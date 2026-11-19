// Page side of the Code Formatter's worker (src/workers/codefmt.worker.ts). The worker starts with the first Format
// and ends when the tab is left (src/lifecycle.ts).
import type { Lang, Options, Formatted } from './codefmt';
import { trackWorker } from '../lifecycle';

let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { res: (v: Formatted) => void; rej: (e: Error) => void }>();
let listener: ((what: string | null) => void) | null = null;
/** Told when a large engine starts to load ("biome") and when it is there (null). */
export function onEngineLoading(f: ((what: string | null) => void) | null) { listener = f; }
export function formatCode(lang: Lang, text: string, opts: Partial<Options>, name = ''): Promise<Formatted> {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/codefmt.worker.ts', import.meta.url), { type: 'module' }), 'codefmt-worker', () => { pending.clear(); worker = null; listener = null; });
    worker.onmessage = (e) => {
      if ('loading' in e.data) { listener?.(e.data.loading); return; }
      const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id);
      e.data.error != null ? p.rej(new Error(e.data.error)) : p.res(e.data.result);
    };
    worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || 'The formatter failed to start')); pending.clear(); };
  }
  const id = ++seq;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); worker!.postMessage({ id, lang, text, opts, name }); });
}
