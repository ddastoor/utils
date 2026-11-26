// The Noise Remover's work off the main thread, at 48 kHz (audio.wasm brings the sound there and back).
//   Standard: RNNoise (Jitsi's build of RNNoise 0.2, src/wasm/rnnoise.ts); audio.wasm scales the sound to its ±32768.
//   Studio voice (to-do #20): DeepFilterNet 3 — its signal processing in audio.wasm (wasm/audio/studio.c), its network on
//     ONNX Runtime Web (the app's copy of Microsoft's WebAssembly build; the model, 8.6 MB, fetched from this site the first
//     time, once a visit: public/models/deepfilternet3, SHA-256 pinned in scripts/assets.json) in segments (src/lib/studio.ts)
//     — then, if asked, the studio finish (audio.wasm).
//   { op: 'clean', engine, chs, sr, mix, finish, base } → the cleaned sound at that strength, the voice probability per
//     10 ms (Standard), what the finish did (Studio), the time taken. The input and the fully cleaned sound are kept, so that
//   { op: 'mix', mix, finish }  → the same sound at another strength (or with the finish on or off), without cleaning it again.
// Messages are handled one after the other (a 'mix' sent while a 'clean' runs gets the new sound). While a Studio clean
// runs, { id, progress: { phase: 'fetch' | 'clean' | 'finish', done, total } } messages tell how far it is.
import * as ort from 'onnxruntime-web/wasm';
import { instantiateWasi } from '../wasm/wasi';
import { bindAudio, FINISH, type AudioEngine, type FinishReport } from '../wasm/audio';
import { bindRnnoise, type Rnnoise, type RnnoiseModule } from '../wasm/rnnoise';
import { deepFilter, sameChannels, SR } from '../lib/studio';
import audioUrl from '../wasm/bin/audio.wasm?url';

type Engine = 'rnnoise' | 'studio';
type Msg = { id: number; op: 'clean'; engine: Engine; chs: Float32Array[]; sr: number; mix: number; finish: boolean; base: string } | { id: number; op: 'mix'; mix: number; finish: boolean };
type Reply = { chs: Float32Array[]; vad?: Float32Array; ms?: number; report?: FinishReport };
const MODEL = 'models/deepfilternet3/deepfilter.onnx', MODEL_BYTES = 8608859;
let au: Promise<AudioEngine> | null = null, rn: Promise<Rnnoise> | null = null, dfn: Promise<ort.InferenceSession> | null = null;
/** Standard: the input and the fully cleaned sound at the file's rate. Studio: both at 48 kHz, and the file's rate. */
let kept: { engine: 'rnnoise'; src: Float32Array[]; full: Float32Array[] } | { engine: 'studio'; src: Float32Array[]; src48: Float32Array[]; full48: Float32Array[]; sr: number; full?: Float32Array[] } | null = null;
const post = (m: unknown, t: Transferable[] = []) => (self as any).postMessage(m, t);
// a failed download is tried again with the next message
const audioEngine = () => (au ||= instantiateWasi(audioUrl).then((x) => bindAudio(x.exports)).catch((e) => { au = null; throw e; }));
const rnnoise = () => (rn ||= import('@jitsi/rnnoise-wasm/dist/rnnoise-sync.js')
  .then((m) => bindRnnoise(m.default() as RnnoiseModule)).catch((e) => { rn = null; throw e; }));
function network(base: string, id: number) {
  return (dfn ||= (async () => {
    ort.env.wasm.numThreads = 1; // GitHub Pages cannot enable cross-origin isolation (no threads)
    ort.env.wasm.proxy = false;
    const r = await fetch(new URL(MODEL, base).href).catch(() => { throw new Error('the studio voice model could not be fetched — check the connection and try again'); });
    if (!r.ok) throw new Error(`the studio voice model could not be fetched (HTTP ${r.status}) — try again`);
    let bytes: Uint8Array;
    if (!r.body) bytes = new Uint8Array(await r.arrayBuffer());
    else {
      const parts: Uint8Array[] = [], rd = r.body.getReader(); let got = 0, last = 0;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); got += value.length;
        if (got - last > MODEL_BYTES / 40) { last = got; post({ id, progress: { phase: 'fetch', done: Math.min(got, MODEL_BYTES), total: MODEL_BYTES } }); }
      }
      bytes = new Uint8Array(got); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
    }
    post({ id, progress: { phase: 'fetch', done: MODEL_BYTES, total: MODEL_BYTES } });
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { dfn = null; throw e; }));
}

/** full·mix + src·(1 − mix): 1 = cleaned, 0 = the input as it came */
const blend = (a: AudioEngine, full: Float32Array[], src: Float32Array[], mix: number) => mix >= 1 ? full.map((c) => c.slice()) : mix <= 0 ? src.map((c) => c.slice()) : a.mix2(full, src, mix, 1 - mix);
const fitTo = (n: number) => (c: Float32Array) => (c.length === n ? c : (() => { const x = new Float32Array(n); x.set(c.subarray(0, n)); return x; })());

/** The Studio result at a strength. Without the finish: the cleaned sound at the file's rate mixed with the file itself
 *  (as Remove noise mixes: 0 % is the file sample for sample, 50 % the exact middle). With it: mixed at 48 kHz, finished,
 *  then brought to the file's rate. */
function studioOut(a: AudioEngine, mix: number, finish: boolean): Reply {
  const k = kept as Extract<typeof kept, { engine: 'studio' }>, n = k.src[0].length;
  if (!finish) {
    k.full ??= (k.sr === SR ? k.full48.map((c) => c.slice()) : a.resample(k.full48, k.sr / SR)).map(fitTo(n));
    return { chs: blend(a, k.full, k.src, mix) };
  }
  const f = a.studioFinish(blend(a, k.full48, k.src48, mix), FINISH.all);
  return { chs: (k.sr === SR ? f.chs : a.resample(f.chs, k.sr / SR)).map(fitTo(n)), report: f.report };
}

async function handle(m: Msg): Promise<Reply> {
  const a = await audioEngine();
  if (m.op === 'mix') {
    if (!kept) throw new Error('The cleaned sound is gone — open the file again.');
    return kept.engine === 'rnnoise' ? { chs: blend(a, kept.full, kept.src, m.mix) } : studioOut(a, m.mix, m.finish);
  }
  kept = null;
  const t0 = performance.now(), { chs, sr } = m, n = chs[0].length;
  const at48 = sr === SR ? chs : a.resample(chs, SR / sr);
  if (m.engine === 'rnnoise') {
    const r = await rnnoise();
    const res = r.denoise(a.scale(at48, 32768));
    const back = a.gain(res.chs, 1 / 32768); // back to ±1 (clamped)
    kept = { engine: 'rnnoise', src: chs, full: (sr === SR ? back : a.resample(back, sr / SR)).map(fitTo(n)) };
    return { chs: blend(a, kept.full, kept.src, m.mix), vad: res.vad, ms: performance.now() - t0 };
  }
  const sess = await network(m.base, m.id);
  const net = async (ferb: Float32Array, fspec: Float32Array, T: number) => {
    const o = await sess.run({ feat_erb: new ort.Tensor('float32', ferb, [1, 1, T, 32]), feat_spec: new ort.Tensor('float32', fspec, [1, 2, T, 96]) });
    return { mask: o.erb_mask.data as Float32Array, coefs: o.df_coefs.data as Float32Array };
  };
  const same = sameChannels(at48), todo = same ? 1 : at48.length, len = at48[0].length;
  const full48: Float32Array[] = [];
  for (let c = 0; c < todo; c++) {
    const y = await deepFilter(at48[c], a, net, (done) => post({ id: m.id, progress: { phase: 'clean', done: c * len + done, total: todo * len } }));
    full48.push(y!);
  }
  while (full48.length < at48.length) full48.push(full48[0].slice());
  kept = { engine: 'studio', src: chs, src48: at48, full48, sr };
  if (m.finish) post({ id: m.id, progress: { phase: 'finish', done: 0, total: 1 } });
  return { ...studioOut(a, m.mix, m.finish), ms: performance.now() - t0 };
}

let chain: Promise<unknown> = Promise.resolve();
self.onmessage = (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  chain = chain.then(async () => {
    try {
      const r = await handle(m);
      const moved = [...r.chs.map((c) => c.buffer), ...(r.vad ? [r.vad.buffer] : [])] as ArrayBuffer[];
      post({ id: m.id, ...r }, moved);
    } catch (e: any) {
      post({ id: m.id, error: e?.message || String(e) });
    }
  });
};
