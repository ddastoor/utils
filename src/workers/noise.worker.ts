// Noise removal pipeline off the main thread: resample to 48 kHz (audio.wasm) → RNNoise (rnnoise.wasm) → back.
import { instantiateWasi } from '../wasm/wasi';
import { bindAudio, type AudioEngine } from '../wasm/audio';
import { bindRnnoise, type Rnnoise } from '../wasm/rnnoise';
import audioUrl from '../wasm/bin/audio.wasm?url';
import rnUrl from '../wasm/bin/rnnoise.wasm?url';

let au: Promise<AudioEngine> | null = null, rn: Promise<Rnnoise> | null = null;
self.onmessage = async (ev: MessageEvent<{ id: number; chs: Float32Array[]; sr: number; mix: number }>) => {
  const { id, chs, sr, mix } = ev.data;
  try {
    au ||= instantiateWasi(audioUrl).then((x) => bindAudio(x.exports));
    rn ||= instantiateWasi(rnUrl).then((x) => bindRnnoise(x.exports));
    const [a, r] = await Promise.all([au, rn]);
    const t0 = performance.now();
    const at48 = sr === 48000 ? chs : a.resample(chs, 48000 / sr);
    const res = r.denoise(at48, mix);
    let out = sr === 48000 ? res.chs : a.resample(res.chs, sr / 48000);
    const n = chs[0].length;
    out = out.map((c) => (c.length === n ? c : (() => { const x = new Float32Array(n); x.set(c.subarray(0, n)); return x; })()));
    (self as any).postMessage({ id, chs: out, vad: res.vad, ms: performance.now() - t0 }, [...out.map((c) => c.buffer), res.vad.buffer]);
  } catch (e: any) {
    (self as any).postMessage({ id, error: e?.message || String(e) });
  }
};
