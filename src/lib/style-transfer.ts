// Main-thread side of the neural style engine (src/workers/style.worker.ts). One worker per page, created on first use.
import { imgprocDirect, type Img } from '../wasm/imgproc';

let worker: Worker | null = null, seq = 0, ready: Promise<string> | null = null;
const pend = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();

function call(op: string, data: any = {}, transfer: Transferable[] = []): Promise<any> {
  if (!worker) {
    worker = new Worker(new URL('../workers/style.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const m = e.data, p = pend.get(m.id); if (!p) return; pend.delete(m.id); m.error ? p.rej(new Error(m.error)) : p.res(m); };
    worker.onerror = (e) => { for (const p of pend.values()) p.rej(new Error(e.message || 'Style engine crashed')); pend.clear(); };
  }
  const id = ++seq;
  return new Promise((res, rej) => { pend.set(id, { res, rej }); worker!.postMessage({ id, op, ...data }, transfer); });
}

/** Loads TF.js + both models. Resolves to the backend name: 'webgl' (GPU), 'wasm' (WebAssembly) or 'cpu'. */
export function styleEngine(prefer?: 'webgl' | 'wasm' | 'cpu'): Promise<string> {
  return (ready ||= call('init', { base: document.baseURI, prefer }).then((r) => r.backend).catch((e) => { ready = null; throw e; }));
}

const fit = async (img: Img, side: number): Promise<Img> => {
  const s = side / Math.max(img.width, img.height);
  if (s >= 1) return img;
  return (await imgprocDirect()).resize(img, Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
};

/** 100-number style description of a painting (the predictor sees it at ≤ 256 px, like Magenta's demo). */
export async function styleVector(style: Img): Promise<Float32Array> {
  await styleEngine();
  const s = await fit(style, 256);
  return (await call('vector', { img: s })).vector;
}

/** Paints `img` (scaled to ≤ side px) in the style `vector`. strength 0..1 blends from the photo's own style. */
export async function stylize(img: Img, vector: Float32Array, strength: number, side: number): Promise<{ img: Img; ms: number }> {
  await styleEngine();
  const content = await fit(img, side), own = await fit(img, 256);
  const r = await call('stylize', { img: content, ownStyle: own, vector, strength });
  let out: Img = r.img;
  // the network's strided layers can trim a few pixels: bring it back to the input size
  if (out.width !== content.width || out.height !== content.height) out = (await imgprocDirect()).resize(out, content.width, content.height);
  return { img: out, ms: r.ms };
}

export function disposeStyleEngine() { worker?.terminate(); worker = null; ready = null; for (const p of pend.values()) p.rej(new Error('closed')); pend.clear(); }
