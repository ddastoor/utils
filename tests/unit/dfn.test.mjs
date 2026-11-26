// The Noise Remover's Studio voice (to-do #20). DeepFilterNet 3's signal processing in audio.wasm (wasm/audio/studio.c)
// held to DeepFilterNet's own libDF + ONNX Runtime (tests/fixtures/dfn/reference.json, scripts/make-dfn-reference.py); the
// network on ONNX Runtime Web in Node with the site's model (public/models/deepfilternet3, fetched by the build); the
// segments of src/lib/studio.ts against one pass and against an identity network (exact); the studio finish — loudness and
// true peak held to FFmpeg's ebur128 (the native ffmpeg; skipped with a note where it is missing), every step measured on
// signals whose answer is known.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from '../lib/child.mjs';

export default async (t, { load, wasm }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { bindAudio, FINISH } = await load('/src/wasm/audio.ts');
  const st = await load('/src/lib/studio.ts');
  const au = bindAudio(await wasm('audio'));
  const ref = JSON.parse(readFileSync(root + 'tests/fixtures/dfn/reference.json', 'utf8'));
  /** a 16-bit PCM WAV → Float32Array (s / 32768, as soundfile reads it) */
  const wav16 = (p) => {
    const b = readFileSync(p); let o = 12;
    while (b.toString('latin1', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
    const n = b.readUInt32LE(o + 4) / 2, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + 2 * i) / 32768;
    return x;
  };
  const mix16 = wav16(root + 'tests/fixtures/speech/traffic-speech.wav');
  const hold3 = (x) => { const y = new Float32Array(x.length * 3); for (let i = 0; i < y.length; i++) y[i] = x[(i / 3) | 0]; return y; };
  const x = hold3(mix16.subarray(0, 32000)); // as the reference: 2 s at 48 kHz, every sample three times
  const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
  const sdr = (r, y) => { let rr = 0, ry = 0; for (let i = 0; i < r.length; i++) { rr += r[i] * r[i]; ry += r[i] * y[i]; } const g = ry / rr; let s = 0, e = 0; for (let i = 0; i < r.length; i++) { const v = g * r[i]; s += v * v; e += (y[i] - v) ** 2; } return 10 * Math.log10(s / e); };

  // ---- the signal processing against libDF
  t.eq([...au.dfnErbWidths()], ref.erbWidths, `the 32 ERB bands of libDF's erb_fb(48000, 960, 32, 2): ${ref.erbWidths.join(' ')}`);
  const prep = au.dfnPrepare(x), spec = au.dfnSpec(prep.T);
  t.eq(prep.T, ref.T, `frames: (2 s + 960) / 480 = ${ref.T}, as libDF's analysis of the padded signal`);
  {
    let ws = 0, we = 0, wf = 0;
    for (const f of Object.keys(ref.spec).map(Number)) ws = Math.max(ws, maxDiff(spec.subarray(f * 962, f * 962 + 962), ref.spec[f]));
    for (const f of ref.frames) {
      we = Math.max(we, maxDiff(prep.ferb.subarray(f * 32, f * 32 + 32), ref.ferb[f]));
      const ours = []; for (let k = 0; k < 96; k++) ours.push(prep.fspec[f * 96 + k], prep.fspec[prep.T * 96 + f * 96 + k]);
      wf = Math.max(wf, maxDiff(ours, ref.fspec[f]));
    }
    t.ok(ws < 1e-7, `the STFT (Vorbis window, analysis scaled by 1 / 960) as libDF's: largest difference ${ws.toExponential(1)} (magnitudes up to ${Math.max(...ref.spec[100].map(Math.abs)).toFixed(3)})`);
    t.ok(we < 2e-5, `the ERB features (band powers in dB less their running mean from −60 … −90, / 40) as libDF's erb_norm: largest difference ${we.toExponential(1)}`);
    t.ok(wf < 2e-5, `the first 96 bins over their running magnitude (from 0.001 … 0.0001) as libDF's unit_norm: largest difference ${wf.toExponential(1)}`);
  }
  // ---- the network on ONNX Runtime Web, as the worker runs it
  const ort = await import(root + 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs');
  ort.env.wasm.numThreads = 1;
  const sess = await ort.InferenceSession.create(new Uint8Array(readFileSync(root + 'public/models/deepfilternet3/deepfilter.onnx')), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  t.eq([sess.inputNames, sess.outputNames], [['feat_erb', 'feat_spec'], ['erb_mask', 'df_coefs']], "the model's inputs and outputs as the worker names them");
  const net = async (ferb, fspec, T) => {
    const o = await sess.run({ feat_erb: new ort.Tensor('float32', ferb, [1, 1, T, 32]), feat_spec: new ort.Tensor('float32', fspec, [1, 2, T, 96]) });
    return { mask: o.erb_mask.data, coefs: o.df_coefs.data };
  };
  const { mask, coefs } = await net(prep.ferb, prep.fspec, prep.T);
  {
    let wm = 0, wc = 0;
    for (const f of Object.keys(ref.mask).map(Number)) wm = Math.max(wm, maxDiff(mask.subarray(f * 32, f * 32 + 32), ref.mask[f]));
    for (const f of Object.keys(ref.coefs).map(Number)) {
      const ours = []; for (let k = 0; k < 5; k++) for (let b = 0; b < 192; b++) ours.push(coefs[(k * prep.T + f) * 192 + b]);
      wc = Math.max(wc, maxDiff(ours, ref.coefs[f]));
    }
    t.ok(wm < 1e-4 && wc < 1e-4, `ONNX Runtime Web gives the network's mask and deep-filter coefficients of ONNX Runtime's Python build: largest differences ${wm.toExponential(1)}, ${wc.toExponential(1)}`);
  }
  const y = au.dfnApply(mask, coefs), every8 = Float32Array.from({ length: ref.every8.length }, (_, i) => y[i * 8]);
  t.eq(y.length, x.length, 'the cleaned segment is as long as the input (the 480 samples of the STFT delay taken off)');
  const agree = sdr(ref.every8, every8);
  t.ok(agree > 70, `the cleaned sound — mask on the bands, the deep filter on the noisy spectrum below bin 96, overlap-add — as DeepFilterNet's: ${agree.toFixed(1)} dB apart (every 8th sample of 2 s)`);

  // ---- segments: an identity network gives the input back exactly (crossfades sum to 1, nothing shifted), a real one
  //      gives what one pass over the whole gives
  const ident = async (_f, _s, T) => { const c = new Float32Array(5 * T * 96 * 2); for (let tt = 0; tt < T; tt++) for (let f = 0; f < 96; f++) c[((2 * T + tt) * 96 + f) * 2] = 1; return { mask: new Float32Array(T * 32).fill(1), coefs: c }; };
  {
    let s = 3; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5);
    const z = Float32Array.from({ length: 48000 * 25 + 123 }, () => r() * 0.5);
    const seen = [];
    const out = await st.deepFilter(z, au, ident, (d, n) => seen.push([d, n]));
    t.ok(maxDiff(out, z) < 1e-5, `an identity network through the segments (10 s, 3 s before, 1 s after, 0.5 s crossfades) gives 25 s of noise back sample for sample (largest difference ${maxDiff(out, z).toExponential(1)})`);
    t.eq(seen.map((p) => p[0]), [480000, 960000, z.length], 'progress after each segment, ending at the length');
    t.eq(st.segmentStarts(48000 * 25 + 123), [0, 480000, 960000], 'segments start every 10 s');
    const stale = await st.deepFilter(z, au, ident, undefined, () => true);
    t.eq(stale, null, 'a run the page no longer wants ends at the next segment (null)');
  }
  {
    const long = hold3(Float32Array.from({ length: mix16.length * 3 }, (_, i) => mix16[i % mix16.length])); // 31 s
    const one = au.dfnPrepare(long), whole = await net(one.ferb, one.fspec, one.T), once = au.dfnApply(whole.mask, whole.coefs);
    const seg = await st.deepFilter(long, au, net);
    const d = sdr(once, seg);
    t.ok(d > 35, `31 s in segments against one pass over the whole: ${d.toFixed(1)} dB apart (measured with libDF: 40 dB, as clean)`);
  }
  t.ok(st.sameChannels([x, x.slice()]) && !st.sameChannels([x, x.map((v) => -v)]), 'two channels that hold the same sound are cleaned once');

  // ---- loudness and true peak against FFmpeg's ebur128
  const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  const sig = [];
  { let s = 9; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5);
    const speech = hold3(mix16);
    sig.push(['the traffic mixture, mono', [speech]]);
    sig.push(['the same, quieter, in stereo with the right side 0.7 and later', [speech.map((v) => v * 0.3), speech.map((v, i) => 0.21 * (speech[i - 37] || 0))]]);
    sig.push(['a 997 Hz sine at −20 dBFS, mono', [Float32Array.from({ length: 48000 * 5 }, (_, i) => 0.1 * Math.SQRT2 * Math.sin(2 * Math.PI * 997 * i / 48000))]]);
    sig.push(['noise bursts with silence between, stereo', [0, 1].map(() => Float32Array.from({ length: 48000 * 6 }, (_, i) => ((i / 48000) % 1 < 0.5 ? r() * 0.8 : 0)))]); }
  if (ff.status !== 0) t.ok(true, 'NOTE: no native ffmpeg here — loudness and true peak not held to FFmpeg\'s ebur128 (apt install ffmpeg)');
  else {
    const dir = mkdtempSync(join(tmpdir(), 'dfn-'));
    for (const [label, chs] of sig) {
      const w = au.wav(chs, 48000, 32), p = join(dir, 'm.wav'); writeFileSync(p, w);
      const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr, sum = e.slice(e.lastIndexOf('Summary:'));
      const I = +/I:\s+(-?[\d.]+) LUFS/.exec(sum)[1], P = +/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)[1];
      const li = au.loudness(chs), tp = au.truePeak(chs);
      t.ok(Math.abs(li - I) <= 0.06 && Math.abs(tp - P) <= 0.15, `${label}: loudness ${li.toFixed(2)} LUFS and true peak ${tp.toFixed(2)} dBTP, FFmpeg's ebur128 ${I.toFixed(1)} and ${P.toFixed(1)}`);
    }
  }
  t.near(au.loudness([sig[2][1][0]]), -20, 0.05, "a 997 Hz sine at −20 dBFS RMS reads −20 LUFS on one channel (BS.1770's calibration)");

  // ---- the finish, step by step on signals with known answers
  const sine = (f, a, sec, sr = 48000) => Float32Array.from({ length: sr * sec }, (_, i) => a * Math.sin(2 * Math.PI * f * i / sr));
  const amp = (z, f, a0 = 0.25, a1 = 0.75) => { // the amplitude of frequency f over the middle half (Goertzel)
    const s = Math.floor(z.length * a0), e = Math.floor(z.length * a1), w = 2 * Math.PI * f / 48000; let re = 0, im = 0;
    for (let i = s; i < e; i++) { re += z[i] * Math.cos(w * i); im -= z[i] * Math.sin(w * i); }
    return 2 * Math.hypot(re, im) / (e - s);
  };
  const g = (a, b) => 20 * Math.log10(a / b);
  { // rumble filter: 30 Hz down by > 25 dB (4th-order Butterworth at 75 Hz: 31.8 dB), 1 kHz kept
    const z = sine(30, 0.3, 4).map((v, i) => v + 0.3 * Math.sin(2 * Math.PI * 1000 * i / 48000));
    const o = au.studioFinish([z], FINISH.rumble).chs[0];
    t.ok(g(amp(o, 30), amp(z, 30)) < -25 && Math.abs(g(amp(o, 1000), amp(z, 1000))) < 0.1, `rumble filter: 30 Hz ${g(amp(o, 30), amp(z, 30)).toFixed(1)} dB, 1 kHz ${g(amp(o, 1000), amp(z, 1000)).toFixed(2)} dB`);
  }
  { // EQ: −3 dB at 350 Hz, +3 dB at 3.5 kHz, body below 160 Hz, air above 10 kHz, 1 kHz about level
    const at = (f) => { const z = sine(f, 0.1, 2); return g(amp(au.studioFinish([z], FINISH.eq).chs[0], f), amp(z, f)); };
    const r = { 100: at(100), 350: at(350), 1000: at(1000), 3500: at(3500), 14000: at(14000) };
    t.ok(r[100] > 1.5 && r[350] < -1.8 && Math.abs(r[1000]) < 1 && r[3500] > 2.4 && r[14000] > 1.5, `warmth and presence: ${Object.entries(r).map(([f, v]) => `${f} Hz ${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`).join(', ')}`);
  }
  { // expander: a pause of quiet noise lowered, the voice-like tone kept
    let s = 5; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5);
    const z = Float32Array.from({ length: 48000 * 6 }, (_, i) => ((i / 48000) % 2 < 1 ? 0.2 * Math.sin(2 * Math.PI * 220 * i / 48000) : 0.002 * r()));
    const o = au.studioFinish([z], FINISH.expander), rms = (a, s0, e0) => { s0 = Math.round(s0); e0 = Math.round(e0); let q = 0; for (let i = s0; i < e0; i++) q += a[i] * a[i]; return Math.sqrt(q / (e0 - s0)); };
    const pause = g(rms(o.chs[0], 48000 * 1.4, 48000 * 1.9), rms(z, 48000 * 1.4, 48000 * 1.9)), tone = g(rms(o.chs[0], 48000 * 2.3, 48000 * 2.8), rms(z, 48000 * 2.3, 48000 * 2.8));
    t.ok(pause < -6 && Math.abs(tone) < 0.3, `expander: the pauses ${pause.toFixed(1)} dB (noise at −60 dBFS), the tone ${tone.toFixed(2)} dB; reported ${o.report.expander.toFixed(1)} dB`);
  }
  { // compressor: the loud half of a tone that steps up by 20 dB is lowered, the quiet half kept (thresholds follow the voice)
    const z = Float32Array.from({ length: 48000 * 8 }, (_, i) => (i < 48000 * 4 ? 0.03 : 0.3) * Math.sin(2 * Math.PI * 440 * i / 48000));
    const o = au.studioFinish([z], FINISH.compressor), q = g(amp(o.chs[0], 440, 0.1, 0.45), amp(z, 440, 0.1, 0.45)), l = g(amp(o.chs[0], 440, 0.6, 0.95), amp(z, 440, 0.6, 0.95));
    t.ok(l < -3 && l < q - 3, `compressor: the loud half ${l.toFixed(1)} dB, the quiet half ${q.toFixed(1)} dB (largest reduction ${o.report.compressor.toFixed(1)} dB)`);
  }
  { // de-esser: hiss above 6 kHz as loud as the voice is lowered, the voice's 200 Hz kept
    let s = 11; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5);
    const hiss = Float32Array.from({ length: 48000 * 4 }, () => r()); // differenced below: 98 % of its energy above 6 kHz
    const z = Float32Array.from({ length: 48000 * 4 }, (_, i) => 0.1 * Math.sin(2 * Math.PI * 200 * i / 48000) + ((i / 48000) % 1 > 0.5 ? 0.3 * (hiss[i] - (hiss[i - 1] || 0)) : 0));
    const o = au.studioFinish([z], FINISH.deesser).chs[0];
    const hi = (a) => { let q = 0, k = 0; for (let i = 124800; i < 139200; i++) { const d = a[i] - a[i - 1]; q += d * d; k++; } return Math.sqrt(q / k); };
    const ess = g(hi(o), hi(z)), low = g(amp(o, 200, 0.05, 0.12), amp(z, 200, 0.05, 0.12));
    t.ok(ess < -3 && Math.abs(low) < 0.2, `de-esser: the "s" ${ess.toFixed(1)} dB, the voice between them ${low.toFixed(2)} dB`);
  }
  { // the whole finish on the traffic mixture cleaned by DeepFilterNet 3: −16 LUFS as heard on two speakers, peaks at −1.5 dBTP
    const speech = hold3(mix16), clean48 = await st.deepFilter(speech, au, net);
    const f = au.studioFinish([clean48]), out = f.chs[0], r = f.report;
    const two = au.loudness([out]) + 10 * Math.log10(2), tp = au.truePeak([out]);
    t.ok(Math.abs(two + 16) < 0.3 && Math.abs(r.after - two) < 1e-6, `the finished voice: ${two.toFixed(2)} LUFS as heard on two speakers (one channel: ${(two - 3.01).toFixed(2)}), as reported`);
    t.ok(tp <= -1.45 && Math.abs(r.peak - tp) < 1e-6, `its true peak ${tp.toFixed(2)} dBTP (the ceiling −1.5)`);
    const st2 = au.studioFinish([out, out]); // the same voice as stereo: −16 too, no louder per channel than the mono one
    t.ok(Math.abs(st2.report.after + 16) < 0.3 && Math.abs(au.loudness([st2.chs[0]]) - au.loudness([out])) < 0.5, `the same voice in stereo: ${st2.report.after.toFixed(2)} LUFS, each side as loud as the mono file (${au.loudness([st2.chs[0]]).toFixed(2)} and ${au.loudness([out]).toFixed(2)} LUFS)`);
    t.ok(/^Studio finish: −\d+\.\d → −1[56]\.\d LUFS, peaks at −1\.5 dBTP/.test(st.finishWords(r)), `the line under the result: ${st.finishWords(r)}`);
    if (ff.status === 0) {
      const dir = mkdtempSync(join(tmpdir(), 'dfn-')), p = join(dir, 'o.wav'); writeFileSync(p, au.wav([out], 48000, 32));
      const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', 'ebur128=peak=true:dualmono=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr, sum = e.slice(e.lastIndexOf('Summary:'));
      const I = +/I:\s+(-?[\d.]+) LUFS/.exec(sum)[1], P = +/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)[1];
      t.ok(Math.abs(I + 16) <= 0.35 && P <= -1.4, `FFmpeg's ebur128 (dual mono) reads the finished voice at ${I} LUFS, true peak ${P} dBTP`);
    }
  }
  { // nothing to finish: silence stays silence, no NaN
    const o = au.studioFinish([new Float32Array(48000 * 2)]);
    t.ok(o.chs[0].every((v) => v === 0) && o.report.before === -Infinity, 'silence: the finish leaves it silent (no NaN), its loudness −∞');
    t.eq(st.finishWords(o.report), 'Studio finish: there is no voice to finish', 'and says there is no voice');
    const short = au.studioFinish([sine(440, 0.1, 0.2)]);
    t.ok(short.chs[0].length === 9600 && short.chs[0].every(Number.isFinite), 'a sound shorter than one loudness block (0.4 s) comes back as long, finite');
  }
};
