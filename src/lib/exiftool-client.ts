// Page side of the ExifTool worker: one worker while the EXIF tab is open, terminated when it is left.
import { trackWorker } from '../lifecycle';
import type { Tags } from './photoinfo';

let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();

function w(): Worker {
  if (worker) return worker;
  worker = trackWorker(new Worker(new URL('../workers/exiftool.worker.ts', import.meta.url), { type: 'module' }), 'exiftool', () => { worker = null; pending.clear(); });
  worker.onmessage = (e) => { const m = e.data, p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.rej(new Error(m.error)) : p.res(m); };
  worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || 'ExifTool stopped working.')); pending.clear(); worker?.terminate(); worker = null; };
  return worker;
}
function call(op: 'read' | 'strip' | 'previews', file: File): Promise<any> {
  const wk = w(); // first: trackWorker may release an older worker, which clears `pending`
  const id = ++seq;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); wk.postMessage({ id, op, file, base: document.baseURI }); });
}
export const readPhotoTags = async (file: File): Promise<Tags> => (await call('read', file)).tags;
/** the pictures kept inside the file (EXIF's thumbnail, a preview, Photoshop's thumbnail), by tag */
export const readPreviews = async (file: File): Promise<Record<string, Uint8Array>> => (await call('previews', file)).previews;
export const stripPhoto = async (file: File): Promise<Uint8Array> => new Uint8Array((await call('strip', file)).buf);
