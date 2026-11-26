// The page side of the scrolling-screenshot worker (src/workers/scrollshot.worker.ts; to-do #28): one request at a time
// per frame, answered in order; the worker is ended when the tab is left (src/lifecycle.ts).
import { trackWorker } from '../lifecycle';

export interface ScrollStepMsg { kind: 'first' | 'still' | 'added' | 'back' | 'nofit' | 'blank' | 'size' | 'full'; d: number; height: number; views: number; width: number }
export interface ScrollPart { data: Uint8ClampedArray; width: number; height: number }
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, (m: any) => void>();
function the(): Worker {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/scrollshot.worker.ts', import.meta.url), { type: 'module' }), 'scrollshot-worker', () => {
      for (const r of pending.values()) r({ error: 'ended' });
      pending.clear(); worker = null;
    });
    worker.onmessage = (ev) => { const r = pending.get(ev.data.id); pending.delete(ev.data.id); r?.(ev.data); };
    worker.onerror = (ev) => { ev.preventDefault(); for (const r of pending.values()) r({ error: ev.message || 'the worker failed' }); pending.clear(); };
  }
  return worker;
}
const ask = (msg: any, transfer: Transferable[] = []) => new Promise<any>((resolve) => { const id = ++seq; pending.set(id, resolve); the().postMessage({ ...msg, id }, transfer); });
/** a view of the page (the frame is handed over and closed by the worker) */
export const scrollFrame = (frame: VideoFrame): Promise<{ step?: ScrollStepMsg; error?: string }> => ask({ op: 'frame', frame }, [frame as unknown as Transferable]);
/** the picture so far, in parts; the capture is over */
export const scrollFinish = (): Promise<{ parts?: ScrollPart[]; error?: string }> => ask({ op: 'finish' });
/** the capture let go without a picture */
export const scrollDrop = (): Promise<unknown> => (worker ? ask({ op: 'drop' }) : Promise.resolve());
