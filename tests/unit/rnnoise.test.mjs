// rnnoise.wasm (Xiph RNNoise 0.2 built by us): noise removed, speech kept, alignment, mix, VAD.
import { readFileSync } from 'node:fs';
export default async (t, { load, wasm }) => {
  const { bindRnnoise } = await load('/src/wasm/rnnoise.ts');
  const { bindAudio } = await load('/src/wasm/audio.ts');
  const rn = bindRnnoise(await wasm('rnnoise')), au = bindAudio(await wasm('audio'));
  const rms = (x, s = 0, e = x.length) => { e = Math.min(e, x.length); let q = 0; for (let i = s; i < e; i++) q += x[i] * x[i]; return Math.sqrt(q / Math.max(1, e - s)); };
  const db = (a, b) => 20 * Math.log10(a / b);
  let seed = 7; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const noise = Float32Array.from({ length: 48000 * 2 }, () => (rnd() - 0.5) * 0.35); // ≈ −20 dBFS white noise
  const r1 = rn.denoise([noise]);
  t.ok(r1.chs[0].length === noise.length, 'same length out');
  t.ok(db(rms(r1.chs[0], 24000), rms(noise, 24000)) < -20, `white noise suppressed by ${(-db(rms(r1.chs[0], 24000), rms(noise, 24000))).toFixed(0)} dB`);
  t.ok(r1.vad.length === 200 && Math.max(...r1.vad.slice(20)) < 0.5, `no voice detected in noise (max VAD ${Math.max(...r1.vad.slice(20)).toFixed(2)})`);
  const m0 = rn.denoise([noise], 0).chs[0];
  t.ok(m0.every((v, i) => Math.abs(v - noise[i]) < 1e-6), 'mix 0 returns the input unchanged');
  const half = rn.denoise([noise], 0.5).chs[0];
  t.near(rms(half, 24000), rms(noise, 24000) / 2, rms(noise, 24000) * 0.08, 'mix 0.5 ≈ half the noise level');

  // real speech + 5 dB white noise (16 kHz fixture → 48 kHz)
  const wav = readFileSync(new URL('../fixtures/speech/noisy-speech.wav', import.meta.url));
  const n16 = (wav.length - 44) / 2, x16 = new Float32Array(n16);
  for (let i = 0; i < n16; i++) x16[i] = wav.readInt16LE(44 + i * 2) / 32768;
  const [x48] = au.resample([x16], 3);
  const r2 = rn.denoise([x48]), y = r2.chs[0];
  const speech = [...r2.vad].map((v, i) => [v, i]).filter(([v]) => v > 0.9).map(([, i]) => i), quiet = [...r2.vad].map((v, i) => [v, i]).filter(([v]) => v < 0.05).map(([, i]) => i);
  t.ok(speech.length > 300 && quiet.length > 50, `VAD finds speech (${speech.length} frames) and pauses (${quiet.length} frames)`);
  const fr = (sig, ids) => Math.sqrt(ids.reduce((a, i) => a + rms(sig, i * 480, i * 480 + 480) ** 2, 0) / ids.length);
  const dropPause = db(fr(y, quiet), fr(x48, quiet)), keepSpeech = db(fr(y, speech), fr(x48, speech));
  t.ok(dropPause < -15, `noise in pauses reduced by ${(-dropPause).toFixed(1)} dB`);
  t.ok(keepSpeech > -6, `speech level kept (${keepSpeech.toFixed(1)} dB)`);
  // alignment: output and input line up (one-frame delay removed)
  const corr = (lag) => { let s = 0; for (let i = 48000; i < 48000 * 6; i += 3) s += x48[i] * y[i + lag]; return s; };
  const lags = [-480, -240, -48, 0, 48, 240, 480].map((l) => [l, corr(l)]).sort((a, b) => b[1] - a[1]);
  t.eq(lags[0][0], 0, `no delay (best lag ${lags[0][0]})`);
  const st = rn.denoise([x48.subarray(0, 48000), x48.subarray(48000, 96000)]);
  t.ok(st.chs.length === 2 && st.chs[0].length === 48000, 'stereo: each channel denoised');
};
