// The Cartoonizer's anime looks in a worker (src/lib/anime.ts): AnimeGAN v2's Hayao, Shinkai and Paprika generators and the face
// portrait v2, as ONNX graphs on ONNX Runtime Web — the app's copy of Microsoft's WebAssembly build (shared with the other tabs' networks,
// so the browser's cache serves it to all). Each look's graph (8.6 MB) is fetched from this site with progress the first time it is
// chosen; the two used last are kept for the visit. One drawing at a time; the worker is ended when the tab is left.
import * as ort from 'onnxruntime-web/wasm';
import { animeInput, animeOutput, animeStyle, ANIME_DIR } from '../lib/anime';
import { instantiateWasi } from '../wasm/wasi';
import { bindImgproc, type Imgproc } from '../wasm/imgproc';
import ipUrl from '../wasm/bin/imgproc.wasm?url';

const post = (m: unknown, t: Transferable[] = []) => (self as any).postMessage(m, t);
// the pixels into the network's input and back: imgproc.wasm's C (p_anime_in, p_anime_out), an instance of its own here
let ipP: Promise<Imgproc> | null = null;
const ip = () => (ipP ??= instantiateWasi(ipUrl).then((x) => bindImgproc(x.exports)).catch((e) => { ipP = null; throw e; }));
const sessions = new Map<string, Promise<ort.InferenceSession>>(); // the order of use: the oldest first

function session(id: string, base: string, job: number) {
  let s = sessions.get(id);
  if (s) { sessions.delete(id); sessions.set(id, s); return s; } // used again: the newest
  const style = animeStyle(id);
  s = (async () => {
    ort.env.wasm.numThreads = 1; // GitHub Pages cannot enable cross-origin isolation (no threads)
    ort.env.wasm.proxy = false;
    const r = await fetch(new URL(ANIME_DIR + style.file, base).href);
    if (!r.ok || !r.body) throw new Error(`the ${style.name} look could not be fetched (HTTP ${r.status})`);
    const parts: Uint8Array[] = [], rd = r.body.getReader();
    let got = 0, last = -Infinity;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value); got += value.length;
      if (got - last > style.bytes / 40) { last = got; post({ id: job, type: 'progress', phase: 'fetch', done: Math.min(got, style.bytes), total: style.bytes }); }
    }
    const bytes = new Uint8Array(got);
    let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })();
  s.catch(() => sessions.delete(id)); // the next try fetches it again
  sessions.set(id, s);
  while (sessions.size > 2) { const [old, p] = sessions.entries().next().value!; sessions.delete(old); p.then((x) => x.release()).catch(() => {}); }
  return s;
}

self.onmessage = async (ev: MessageEvent<{ id: number; style: string; base: string; rgba: Uint8ClampedArray; width: number; height: number }>) => {
  const { id, style, base, rgba, width, height } = ev.data;
  try {
    const st = animeStyle(style), [s, p] = await Promise.all([session(style, base, id), ip()]);
    post({ id, type: 'progress', phase: 'draw' });
    const x = animeInput(p, { data: rgba, width, height }, st.layout);
    const t0 = performance.now();
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', x.data, x.dims) });
    const y = out[s.outputNames[0]];
    const px = animeOutput(p, y.data as Float32Array, y.dims as number[], width, height, st.layout).data;
    post({ id, type: 'done', result: { data: px, width, height, ms: performance.now() - t0 } }, [px.buffer]);
  } catch (e) {
    post({ id, type: 'error', error: String((e as Error)?.message ?? e) });
  }
};
