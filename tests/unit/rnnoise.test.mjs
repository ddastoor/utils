// RNNoise as the Noise Remover runs it: Jitsi's WebAssembly build of RNNoise 0.2 (@jitsi/rnnoise-wasm 0.2.1) through
// src/wasm/rnnoise.ts (framing, alignment, voice probability), audio.wasm around it as in src/workers/noise.worker.ts.
// Reference: the RNNoise 0.2 release as its own configure builds it (the network on the model's 8-bit weights), compiled
// natively — scripts/make-rnnoise-reference.sh → tests/fixtures/rnnoise/reference.json (per 10 ms frame: the level of
// the cleaned sound and the voice probability).
import { readFileSync } from 'node:fs';
export default async (t, { load, wasm }) => {
  const { bindRnnoise, FRAME, DELAY } = await load('/src/wasm/rnnoise.ts');
  const { bindAudio } = await load('/src/wasm/audio.ts');
  const au = bindAudio(await wasm('audio'));
  const create = (await import(new URL('../../node_modules/@jitsi/rnnoise-wasm/dist/rnnoise-sync.js', import.meta.url).href)).default;
  // the module is built for pages and workers: it gets a worker's two names while it starts (at once, synchronously) and
  // loses them right after, so no other suite of this process ever sees them
  const start = () => { globalThis.self = { location: { href: 'file:///' } }; globalThis.importScripts = () => {}; try { return create(); } finally { delete globalThis.self; delete globalThis.importScripts; } };
  const M = start(), rn = bindRnnoise(M);
  t.ok(typeof M._rnnoise_process_frame === 'function' && typeof globalThis.self === 'undefined', 'Jitsi\'s module starts in Node; the borrowed names are gone again');
  const ref = JSON.parse(readFileSync(new URL('../fixtures/rnnoise/reference.json', import.meta.url), 'utf8'));
  const S = 32768, rms = (x, s = 0, e = x.length) => { e = Math.min(e, x.length); let q = 0; for (let i = s; i < e; i++) q += x[i] * x[i]; return Math.sqrt(q / Math.max(1, e - s)); };
  const db = (a, b) => 20 * Math.log10(a / b);
  const frameDb = (y, f) => { const a = f * FRAME, b = Math.min(a + FRAME, y.length); let q = 0; for (let i = a; i < b; i++) q += y[i] * y[i]; return q > 0 ? 10 * Math.log10(q / (b - a) / (S * S)) : -200; };
  /** the cleaned sound and the voice probabilities against the native release, frame by frame: the same computation
   *  gives the same numbers (the reference keeps two decimals of a dB and four of a probability). Our earlier build
   *  ran the network on the model's float weights — upstream's debugging option — and was 0.12 dB off at the first
   *  frame and 2.4 dB at the worst. */
  const vsNative = (label, r, want) => {
    t.eq([r.chs[0].length > 0, r.vad.length], [true, want.frames], `${label}: one voice probability per 10 ms frame (${want.frames})`);
    let loud = 0, off = 0, worst = 0, quiet = 0, vOff = 0, vWorst = 0;
    for (let f = 0; f < want.frames; f++) {
      const ours = frameDb(r.chs[0], f), d = Math.abs(ours - want.db[f]);
      if (want.db[f] > -70) { loud++; worst = Math.max(worst, d); if (d > 0.02) off++; } else if (ours > -60) quiet++;
      const dv = Math.abs(r.vad[f] - want.vad[f]); vWorst = Math.max(vWorst, dv); if (dv > 0.001) vOff++;
    }
    t.ok(loud > 0 && off === 0, `${label}: every cleaned frame at the level the native RNNoise 0.2 gives it, within 0.02 dB (${loud - off} of ${loud} audible frames; the largest difference ${worst.toFixed(3)} dB)`);
    t.ok(quiet === 0, `${label}: what the native release makes quiet (below −70 dBFS) is quiet here too (${quiet} frames above −60 dBFS)`);
    t.ok(vOff === 0, `${label}: every voice probability as the native release's, within 0.001 (the largest difference ${vWorst.toFixed(4)})`);
  };

  // white noise: the unit test's generator, exactly as the reference driver makes it
  let seed = 7; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const noise = Float32Array.from({ length: 48000 * 2 }, () => (rnd() - 0.5) * 0.35); // ≈ −20 dBFS
  const r1 = rn.denoise([noise.map((v) => v * S)]);
  vsNative('White noise', r1, ref.noise);
  t.ok(r1.chs[0].length === noise.length, 'same length out');
  t.ok(db(rms(r1.chs[0], 24000), rms(noise, 24000) * S) < -20, `white noise suppressed by ${(-db(rms(r1.chs[0], 24000), rms(noise, 24000) * S)).toFixed(0)} dB`);
  t.ok(Math.max(...r1.vad.slice(20)) < 0.5, `no voice found in noise (largest voice probability ${Math.max(...r1.vad.slice(20)).toFixed(2)})`);

  // the speech recording (16 kHz) three times each sample → 48 kHz, as the reference driver makes it
  const wav = readFileSync(new URL('../fixtures/speech/noisy-speech.wav', import.meta.url));
  const n16 = (wav.length - 44) / 2, x16 = new Float32Array(n16), zoh = new Float32Array(n16 * 3);
  for (let i = 0; i < n16; i++) { const v = wav.readInt16LE(44 + i * 2); x16[i] = v / S; zoh[3 * i] = zoh[3 * i + 1] = zoh[3 * i + 2] = v; }
  vsNative('Speech', rn.denoise([zoh]), ref.speech);

  // the worker's pipeline on the same recording: proper resampling, ±1 ⇄ ±32768 by audio.wasm
  const [x48] = au.resample([x16], 3);
  const r2 = rn.denoise(au.scale([x48], S)), [y] = au.gain(r2.chs, 1 / S);
  t.ok(y.length === x48.length && y.every((v) => v <= 1 && v >= -1), 'the cleaned sound comes back on ±1, as long as it went in');
  const speech = [...r2.vad].map((v, i) => [v, i]).filter(([v]) => v > 0.9).map(([, i]) => i), quiet = [...r2.vad].map((v, i) => [v, i]).filter(([v]) => v < 0.05).map(([, i]) => i);
  t.ok(speech.length > 300 && quiet.length > 50, `voice found (${speech.length} frames) and pauses (${quiet.length} frames)`);
  const fr = (sig, ids) => Math.sqrt(ids.reduce((a, i) => a + rms(sig, i * FRAME, i * FRAME + FRAME) ** 2, 0) / ids.length);
  const dropPause = db(fr(y, quiet), fr(x48, quiet)), keepSpeech = db(fr(y, speech), fr(x48, speech));
  t.ok(dropPause < -15, `noise in the pauses down by ${(-dropPause).toFixed(1)} dB`);
  t.ok(keepSpeech > -6, `speech level kept (${keepSpeech.toFixed(1)} dB)`);
  // alignment to the sample: RNNoise's lag of DELAY frames is taken out
  const corr = (lag) => { let s = 0; for (let i = 48000; i < 48000 * 4; i++) s += x48[i] * y[i + lag]; return s; };
  let best = 0, bestV = -Infinity; for (let lag = -2 * FRAME; lag <= 2 * FRAME; lag++) { const c = corr(lag); if (c > bestV) { bestV = c; best = lag; } }
  t.eq(best, 0, `the cleaned sound lines up with the input to the sample (best lag ${best} of ±${2 * FRAME}; RNNoise lags ${DELAY} frames)`);

  // channels: each on its own; the voice probability is the larger of the channels (a voice on the right only)
  const low = Float32Array.from({ length: x48.length }, () => (rnd() - 0.5) * 0.002 * S);
  const st = rn.denoise([low, au.scale([x48], S)[0]]), solo = rn.denoise([au.scale([x48], S)[0]]);
  t.ok(st.chs[1].every((v, i) => v === solo.chs[0][i]), 'stereo: the right channel cleaned exactly as on its own');
  t.ok(st.vad.every((v, i) => v === Math.max(v, solo.vad[i])) && st.vad.filter((v) => v > 0.5).length === solo.vad.filter((v) => v > 0.5).length, `a voice on one channel only is found (${st.vad.filter((v) => v > 0.5).length} voiced frames; the channel-0 rule found ${rn.denoise([low]).vad.filter((v) => v > 0.5).length})`);

  // lengths that are not whole frames, and nothing at all
  for (const n of [0, 1, 479, 480, 481, 4801]) {
    const r = rn.denoise([Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7) * 3000)]);
    t.eq([r.chs[0].length, r.vad.length], [n, Math.ceil(n / FRAME)], `${n} samples in → ${n} out, ${Math.ceil(n / FRAME)} voice probabilities`);
  }
  // the module's memory does not grow with the length: the sound goes through it a frame at a time
  const heap = M.HEAPF32.length; rn.denoise([new Float32Array(48000 * 60).fill(100)]);
  t.eq(M.HEAPF32.length, heap, `a minute of sound leaves the module's memory as it was (${(heap * 4 / 2 ** 20).toFixed(0)} MiB)`);
};
