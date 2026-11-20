// The Noise Remover's work off the main thread. RNNoise (Jitsi's build of RNNoise 0.2, src/wasm/rnnoise.ts) cleans at
// 48 kHz; audio.wasm brings the sound there and back, scales it to RNNoise's ±32768 and mixes the strength.
//   { op: 'clean', chs, sr, mix } → the cleaned sound at that strength, the voice probability per 10 ms, the time taken.
//     The input and the fully cleaned sound are kept, so that
//   { op: 'mix', mix }            → the same sound at another strength, without cleaning it again.
// Messages are handled one after the other (a 'mix' sent while a 'clean' runs gets the new sound).
import { instantiateWasi } from '../wasm/wasi';
import { bindAudio, type AudioEngine } from '../wasm/audio';
import { bindRnnoise, type Rnnoise, type RnnoiseModule } from '../wasm/rnnoise';
import audioUrl from '../wasm/bin/audio.wasm?url';

type Msg = { id: number; op: 'clean'; chs: Float32Array[]; sr: number; mix: number } | { id: number; op: 'mix'; mix: number };
let au: Promise<AudioEngine> | null = null, rn: Promise<Rnnoise> | null = null;
let kept: { src: Float32Array[]; full: Float32Array[] } | null = null;
// a failed download is tried again with the next message
const audioEngine = () => (au ||= instantiateWasi(audioUrl).then((x) => bindAudio(x.exports)).catch((e) => { au = null; throw e; }));
const rnnoise = () => (rn ||= import('@jitsi/rnnoise-wasm/dist/rnnoise-sync.js')
  .then((m) => bindRnnoise(m.default() as RnnoiseModule)).catch((e) => { rn = null; throw e; }));

/** full·mix + src·(1 − mix): 1 = cleaned, 0 = the input as it came */
const mixed = (a: AudioEngine, mix: number) => mix >= 1 ? kept!.full.map((c) => c.slice()) : mix <= 0 ? kept!.src.map((c) => c.slice()) : a.mix2(kept!.full, kept!.src, mix, 1 - mix);

async function handle(m: Msg) {
  const a = await audioEngine();
  if (m.op === 'mix') {
    if (!kept) throw new Error('The cleaned sound is gone — open the file again.');
    return { chs: mixed(a, m.mix) };
  }
  kept = null;
  const r = await rnnoise(), t0 = performance.now(), { chs, sr } = m, n = chs[0].length;
  const fit = (c: Float32Array) => (c.length === n ? c : (() => { const x = new Float32Array(n); x.set(c.subarray(0, n)); return x; })());
  const at48 = sr === 48000 ? chs : a.resample(chs, 48000 / sr);
  const res = r.denoise(a.scale(at48, 32768));
  const back = a.gain(res.chs, 1 / 32768); // back to ±1 (clamped)
  kept = { src: chs, full: (sr === 48000 ? back : a.resample(back, sr / 48000)).map(fit) };
  return { chs: mixed(a, m.mix), vad: res.vad, ms: performance.now() - t0 };
}

let chain: Promise<unknown> = Promise.resolve();
self.onmessage = (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  chain = chain.then(async () => {
    try {
      const r: { chs: Float32Array[]; vad?: Float32Array; ms?: number } = await handle(m);
      const moved = [...r.chs.map((c) => c.buffer), ...(r.vad ? [r.vad.buffer] : [])] as ArrayBuffer[];
      (self as any).postMessage({ id: m.id, ...r }, moved);
    } catch (e: any) {
      (self as any).postMessage({ id: m.id, error: e?.message || String(e) });
    }
  });
};
