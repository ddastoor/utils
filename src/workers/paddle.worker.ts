// PaddleOCR in a worker — the second reader of the OCR tab and the Photo Dictionary, for soft photos (src/lib/paddle.ts;
// owner, 26 Nov 2026). PP-OCRv6's detector and recogniser and PP-OCRv4's direction classifier (31.7 MB in
// public/models/paddleocr, SHA-256 pinned in scripts/assets.json) are fetched from this site the first time a photo
// needs them — once per visit — and run by ONNX Runtime Web (the app's copy of Microsoft's WebAssembly build, shared
// with Text-to-Speech and the Doc Scanner); imgproc.wasm does the pixel work around them. One reading at a time; a
// reading the page no longer wants ends at its next line.
import * as ort from 'onnxruntime-web/wasm';
import { instantiateWasi } from '../wasm/wasi';
import { bindImgproc, type Imgproc } from '../wasm/imgproc';
import wasmUrl from '../wasm/bin/imgproc.wasm?url';
import { paddleRead, type PaddleNets, type PaddleLine } from '../lib/paddle';

type Msg = { id: number; op: 'read'; base: string; img: { data: Uint8ClampedArray; width: number; height: number } } | { id: number; op: 'cancel' };
const post = (m: unknown) => (self as any).postMessage(m);
const MODELS = [['det', 'PP-OCRv6_det_small.onnx', 9929594], ['cls', 'ch_ppocr_mobile_v2.0_cls_mobile.onnx', 585532], ['rec', 'PP-OCRv6_rec_small.onnx', 21234383]] as const;
const ALPHABET = 'PP-OCRv6_rec_small.onnx.character.txt';
let engine: Promise<{ nets: PaddleNets; ip: Imgproc; alphabet: string[] }> | null = null;
const cancelled = new Set<number>();
let chain: Promise<unknown> = Promise.resolve();

/** The three models, fetched with progress (bytes of all three together). */
function open(base: string, id: number) {
  engine ??= (async () => {
    ort.env.wasm.numThreads = 1; // GitHub Pages cannot enable cross-origin isolation (no threads)
    ort.env.wasm.proxy = false;
    const total = MODELS.reduce((s, m) => s + m[2], 0);
    let loaded = 0, last = 0;
    const bytes = async (file: string) => {
      const r = await fetch(new URL(`models/paddleocr/${file}`, base).href);
      if (!r.ok) throw new Error(`the second reader's model ${file} could not be fetched (HTTP ${r.status})`);
      if (!r.body) { const b = new Uint8Array(await r.arrayBuffer()); loaded += b.length; return b; }
      const parts: Uint8Array[] = [], rd = r.body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); loaded += value.length;
        if (loaded - last > total / 50) { last = loaded; post({ id, type: 'progress', phase: 'fetch', done: Math.min(loaded, total), total }); }
      }
      const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
      let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
      return out;
    };
    const a = await fetch(new URL(`models/paddleocr/${ALPHABET}`, base).href);
    if (!a.ok) throw new Error(`the second reader's alphabet could not be fetched (HTTP ${a.status})`);
    const alphabet = (await a.text()).split('\n');
    const sess: Record<string, ort.InferenceSession> = {};
    for (const [k, f] of MODELS) sess[k] = await ort.InferenceSession.create(await bytes(f), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    post({ id, type: 'progress', phase: 'fetch', done: total, total });
    const run = async (s: ort.InferenceSession, x: Float32Array, dims: number[]) => (await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', x, dims) }))[s.outputNames[0]];
    const nets: PaddleNets = {
      det: async (x, w, h) => (await run(sess.det, x, [1, 3, h, w])).data as Float32Array,
      cls: async (x, n) => (await run(sess.cls, x, [n, 3, 48, 192])).data as Float32Array,
      rec: async (x, w) => { const o = await run(sess.rec, x, [1, 3, 48, w]); return { data: o.data as Float32Array, T: o.dims[1], C: o.dims[2] }; },
    };
    const ip = bindImgproc((await instantiateWasi(wasmUrl)).exports);
    return { nets, ip, alphabet };
  })().catch((e) => { engine = null; throw e; }); // the next photo tries again
  return engine;
}

self.onmessage = (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  if (m.op === 'cancel') { cancelled.add(m.id); return; }
  chain = chain.then(async () => {
    const stale = () => cancelled.has(m.id);
    try {
      if (stale()) { post({ id: m.id, type: 'done', lines: null }); return; }
      const e = await open(m.base, m.id);
      const lines: PaddleLine[] | null = await paddleRead(m.img, e.nets, e.ip, e.alphabet, {
        stale,
        onLine: (done, total) => post({ id: m.id, type: 'progress', phase: 'read', done, total }),
      });
      post({ id: m.id, type: 'done', lines });
    } catch (err) {
      post({ id: m.id, type: 'error', message: String((err as Error)?.message ?? err) });
    } finally { cancelled.delete(m.id); }
  });
};
