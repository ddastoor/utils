// Doc Scanner's page finder in a worker: DocCornerNet LEAN (scanic-ml 0.2.0, MIT) on ONNX Runtime Web 1.31 — the
// app's copy of Microsoft's WebAssembly build (shared with Text-to-Speech, so the browser's cache serves it to both).
// In: 224 × 224 RGBA (made with imgproc's area resize on the page). Out: corners + P(document). src/lib/pagefind.ts.
import * as ort from 'onnxruntime-web/wasm';
import modelUrl from 'scanic-ml/dist/doccornernet_lean.ort?url';
import { SIZE, modelInput, readOutput } from '../lib/pagefind';

let session: Promise<ort.InferenceSession> | null = null;
function open() {
  session ??= (async () => {
    ort.env.wasm.numThreads = 1; // GitHub Pages cannot enable cross-origin isolation (no threads)
    ort.env.wasm.proxy = false;
    const r = await fetch(modelUrl);
    if (!r.ok) throw new Error(`the page finder's model could not be fetched (HTTP ${r.status})`);
    return ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { session = null; throw e; }); // the next page tries again
  return session;
}

self.onmessage = async (ev: MessageEvent<{ id: number; rgba: Uint8ClampedArray }>) => {
  const { id, rgba } = ev.data;
  try {
    const s = await open();
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', modelInput(rgba), [1, SIZE, SIZE, 3]) });
    const found = readOutput(out as any);
    if (!found) throw new Error('the page finder gave no corners');
    postMessage({ id, ok: true, ...found });
  } catch (e) {
    postMessage({ id, ok: false, message: String((e as Error)?.message ?? e) });
  }
};
