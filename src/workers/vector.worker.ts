// The tracing worker of the Image to SVG and Clipart Maker tabs (potentials #1, #117): visioncortex's VTracer 0.6.5 (our build,
// vtracer.wasm) for colour, Potrace 1.16 (esm-potrace-wasm, the engine of SVGcode) for black and white, imgproc.wasm for the pixel
// work, and U²-Net small (u2netp, rembg's, 4.6 MB in public/models/u2netp) on ONNX Runtime Web — the app's copy — to cut the subject
// out of a photo, fetched from this site the first time a clip art is made. The pipelines are src/lib/vectorize.ts. One job at a time.
import * as ort from 'onnxruntime-web/wasm';
import { instantiateWasi } from '../wasm/wasi';
import { bindImgproc, type Imgproc, type Img } from '../wasm/imgproc';
import { bindVtracer, type Vtracer, type VtOptions } from '../wasm/vtracer';
import { bwSvg, cutMask, clipParts, type BwOptions, type ClipOptions, type PotraceOptions } from '../lib/vectorize';
import ipUrl from '../wasm/bin/imgproc.wasm?url';
import vtUrl from '../wasm/bin/vtracer.wasm?url';

const post = (m: unknown) => (self as any).postMessage(m);
const MODEL = 'models/u2netp/u2netp.onnx', MODEL_SIZE = 4574861;
let ipP: Promise<Imgproc> | null = null, vtP: Promise<Vtracer> | null = null, netP: Promise<ort.InferenceSession> | null = null;
let poP: Promise<typeof import('esm-potrace-wasm')> | null = null;
const ip = () => (ipP ??= instantiateWasi(ipUrl).then((x) => bindImgproc(x.exports)).catch((e) => { ipP = null; throw e; }));
const vt = () => (vtP ??= instantiateWasi(vtUrl).then((x) => bindVtracer(x.exports)).catch((e) => { vtP = null; throw e; }));
const po = () => (poP ??= import('esm-potrace-wasm').then(async (m) => { await m.init(); return m; }).catch((e) => { poP = null; throw e; }));

/** U²-Net small, fetched with progress (once a visit) */
function net(base: string, id: number) {
  netP ??= (async () => {
    ort.env.wasm.numThreads = 1; // GitHub Pages cannot enable cross-origin isolation (no threads)
    ort.env.wasm.proxy = false;
    const r = await fetch(new URL(MODEL, base).href);
    if (!r.ok || !r.body) throw new Error(`the cut-out model could not be fetched (HTTP ${r.status})`);
    const parts: Uint8Array[] = [], rd = r.body.getReader();
    let got = 0, last = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value); got += value.length;
      if (got - last > MODEL_SIZE / 40) { last = got; post({ id, type: 'progress', phase: 'fetch', done: Math.min(got, MODEL_SIZE), total: MODEL_SIZE }); }
    }
    const bytes = new Uint8Array(got);
    let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { netP = null; throw e; });
  return netP;
}

async function clipart(img: Img, o: ClipOptions, base: string, id: number) {
  const p = await ip(), v = await vt();
  return clipParts(img, o, {
    p, v,
    cut: async (work) => {
      const s = await net(base, id);
      post({ id, type: 'progress', phase: 'cut' });
      return cutMask(work, p, async (x) => {
        const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, 320, 320]) });
        return out[s.outputNames[0]].data as Float32Array;
      });
    },
    progress: (phase) => post({ id, type: 'progress', phase }),
  });
}

async function bw(img: Img, o: BwOptions) {
  const m = await po();
  return bwSvg(img, o, await ip(), async (pic, opts: PotraceOptions) =>
    m.potrace(new ImageData(new Uint8ClampedArray(pic.data), pic.width, pic.height), opts) as Promise<string>);
}

let chain: Promise<unknown> = Promise.resolve();
self.onmessage = (ev: MessageEvent) => {
  const { id, op } = ev.data as { id: number; op: string };
  chain = chain.then(async () => {
    try {
      let result: unknown;
      if (op === 'color') result = { svg: (await vt()).trace(ev.data.img, ev.data.opts as VtOptions) };
      else if (op === 'bw') result = await bw(ev.data.img, ev.data.opts as BwOptions);
      else if (op === 'clipart') result = await clipart(ev.data.img, ev.data.opts as ClipOptions, ev.data.base, id);
      else throw new Error(`unknown op ${op}`);
      post({ id, type: 'done', result });
    } catch (e) {
      post({ id, type: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  });
};
