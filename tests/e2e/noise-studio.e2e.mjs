// Noise Remover (#/noise), "Studio voice" (to-do #20): DeepFilterNet 3 on ONNX Runtime Web, its signal processing in
// audio.wasm, then the studio finish. Known answers, on the LibriSpeech sentence with real street traffic (DEMAND) at 5 dB:
// the cleaned sound is far closer to the clean speech than the noisy one and than RNNoise's (SI-SDR against the clean
// speech, decoded by the browser); with the finish it is at −16 LUFS as heard on two speakers and its peaks under −1.5 dBTP
// (measured here with BS.1770's own K-weighting — written in this file — and by FFmpeg's ebur128 where it is installed); the
// model is fetched only when Studio voice is chosen, once a visit, with its progress; strength 0 with the finish off is the
// file sample for sample; the finish switched or a new strength is mixed again, not cleaned again; a stereo file of one voice
// is cleaned once; a model that cannot be fetched is said and the next try fetches it; leaving ends the work; the phone.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { readWav } from './audio.e2e.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/speech/${n}`, import.meta.url));

/** BS.1770-4 integrated loudness (LUFS) of planar audio at any rate: the K-weighting's two filters from their analogue
 *  prototypes (libebur128's and FFmpeg's constants, bilinear transform), 400 ms blocks every 100 ms, gates −70 and −10.
 *  `dual`: a mono sound counted on both speakers. Written here, apart from the engine it measures. */
export function bs1770(chs, sr, dual = false) {
  const k1 = (() => { const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / sr), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K;
    return [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]; })();
  const k2 = (() => { const f0 = 38.13547087602444, Q = 0.5003270373238773, K = Math.tan(Math.PI * f0 / sr), a0 = 1 + K / Q + K * K; return [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]; })();
  const run = (f, x) => { const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = f[0] * x[i] + f[1] * x1 + f[2] * x2 - f[3] * y1 - f[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const step = Math.round(sr / 10), len = 4 * step, n = chs[0].length, nb = n >= len ? Math.floor((n - len) / step) + 1 : 0;
  const cell = new Float64Array(Math.floor(n / step) + 1);
  for (const c of chs) { const y = run(k2, run(k1, c)); for (let i = 0; i < n; i++) cell[Math.floor(i / step)] += y[i] * y[i]; }
  const blk = Array.from({ length: nb }, (_, j) => (cell[j] + cell[j + 1] + cell[j + 2] + cell[j + 3]) / len * (dual ? 2 : 1));
  const L = (z) => -0.691 + 10 * Math.log10(z);
  const abs = blk.filter((z) => L(z) > -70); if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((s, z) => s + z, 0) / abs.length) - 10, g = abs.filter((z) => L(z) > rel);
  return L(g.reduce((s, z) => s + z, 0) / g.length);
}

export default async ({ base, page: newPage, ok, info, download, devices, tmp }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage; window.__noiseOps = [];
    Worker.prototype.postMessage = function (m, ...rest) { if (m && (m.op === 'clean' || m.op === 'mix')) window.__noiseOps.push(m.op === 'clean' ? `clean ${m.engine}` : `mix ${m.mix}${m.finish ? ' finish' : ''}`); return post.call(this, m, ...rest); };
    window.__said = [];
    // every line the tab's live regions show (the recorder and the save panel have their own: all are kept, new ones only)
    new MutationObserver(() => { for (const el of document.querySelectorAll('[aria-live="polite"]')) { const t = el.textContent; if (t && !window.__said.includes(t)) window.__said.push(t); } }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  const model = []; page.on('request', (r) => { if (/models\/deepfilternet3\//.test(r.url())) model.push(r.url()); });
  await page.goto(`${base}#/noise`);
  const ops = () => page.evaluate(() => window.__noiseOps.slice());
  const said = () => page.evaluate(() => window.__said.slice());
  const save = () => download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click());
  const status = () => page.getByText(/ s cleaned in /).textContent();
  const studioDone = () => page.getByText(/^10\.4 s cleaned in [\d.]+ s with DeepFilterNet 3/).waitFor({ timeout: 180000 });
  const setStrength = (v) => page.getByRole('slider').evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const pick = (f) => page.locator('input[type=file]').first().setInputFiles(f);
  const finishSwitch = page.locator('label.switch', { hasText: 'Studio finish' });
  const decode16k = (file) => page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), b = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes.buffer);
    return Array.from(b.getChannelData(0));
  }, readFileSync(file).toString('base64'));
  const clean = Float32Array.from(await decode16k(F('librispeech-1.flac')));
  /** SI-SDR (dB) of y against the clean speech */
  const sdr = (y) => { const n = Math.min(y.length, clean.length); let xy = 0, xx = 0; for (let i = 0; i < n; i++) { xy += clean[i] * y[i]; xx += clean[i] * clean[i]; } const g = xy / xx; let e = 0, s = 0; for (let i = 0; i < n; i++) { const t = g * clean[i]; s += t * t; e += (y[i] - t) ** 2; } return 10 * Math.log10(s / e); };
  const input = readWav(readFileSync(F('traffic-speech.wav')));

  // the K-weighting written here gives the standard's 48 kHz coefficients, and −20 LUFS for a 997 Hz sine at −20 dBFS
  const sine = Float32Array.from({ length: 48000 * 5 }, (_, i) => 0.1 * Math.SQRT2 * Math.sin(2 * Math.PI * 997 * i / 48000));
  ok(Math.abs(bs1770([sine], 48000) + 20) < 0.02, `the test's own BS.1770: a 997 Hz sine at −20 dBFS RMS reads ${bs1770([sine], 48000).toFixed(3)} LUFS`);

  // ---- Remove noise (RNNoise) first: nothing of DeepFilterNet is fetched
  ok(await page.getByRole('radio', { name: 'Remove noise' }).getAttribute('aria-checked') === 'true', 'the tab opens on Remove noise (RNNoise, as it was)');
  await pick(F('traffic-speech.wav'));
  await page.getByText(/^10\.4 s cleaned in [\d.]+ s · speech detected/).waitFor({ timeout: 60000 });
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  const rn = readWav(readFileSync(await save()));
  ok(model.length === 0, `nothing of DeepFilterNet is fetched while Remove noise is chosen (${model.length} requests)`);
  ok(await finishSwitch.isHidden(), 'the finish switch shows only with Studio voice');

  // ---- Studio voice: the model fetched with its progress, the file cleaned again
  await page.getByRole('radio', { name: 'Studio voice' }).click();
  ok(await finishSwitch.isVisible() && /DeepFilterNet 3/.test(await page.locator('.note').filter({ hasText: 'Studio voice' }).textContent()), 'Studio voice: the finish switch and what it does');
  await studioDone();
  const lines = await said();
  ok(lines.some((l) => /^Fetching the studio voice model \([\d.]+ of 8\.6 MB, once a visit\)…$/.test(l)) && lines.some((l) => /^Cleaning with DeepFilterNet 3… \d+ %$/.test(l)) && lines.includes('The studio finish: level, warmth and presence…'), `the download, the cleaning and the finish say how far they are (${lines.filter((l) => /Fetching|Cleaning|finish:/.test(l)).slice(0, 4).join(' · ')} …)`);
  ok(model.length === 1, `the model is fetched once (${model.map((u) => basename(u)).join(', ')})`);
  const line = await status();
  info(line);
  ok(/ · Studio finish: −\d+\.\d → −1[56]\.\d LUFS, peaks at −1\.5 dBTP/.test(line), `the line says what the finish did: ${line}`);

  // the finish on: −16 LUFS as heard on two speakers, peaks under −1.5 dBTP; saved under -studio
  const fileOn = await save(), on = readWav(readFileSync(fileOn));
  ok(/traffic-speech-studio\.wav$/.test(fileOn) && on.sr === 16000 && on.n === input.n, `saved as ${basename(fileOn)}: the file's rate and length (${on.n} samples at ${on.sr} Hz)`);
  const lu = bs1770(on.data, on.sr, on.ch === 1), pk = on.data[0].reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  ok(Math.abs(lu + 16) < 0.5, `the studio voice is at ${lu.toFixed(2)} LUFS as heard on two speakers (BS.1770 measured in this file)`);
  // (the ceiling holds the true peak at 48 kHz; the file's own rate and its 16-bit steps move a sample by a few hundredths)
  ok(20 * Math.log10(pk) <= -1.45, `its largest sample ${(20 * Math.log10(pk)).toFixed(3)} dBFS (the true peak at 48 kHz −1.5 dBTP)`);
  const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (ff.status === 0) {
    const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', fileOn, '-af', 'ebur128=peak=true:dualmono=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr, s = e.slice(e.lastIndexOf('Summary:'));
    const I = +/I:\s+(-?[\d.]+) LUFS/.exec(s)[1], P = +/Peak:\s+(-?[\d.]+) dBFS/.exec(s)[1];
    ok(Math.abs(I + 16) <= 0.5 && P <= -1.2, `FFmpeg's ebur128 (dual mono): ${I} LUFS, true peak ${P} dBTP`);
    // said in the run's summary, so a log (the Windows check's) shows which reference measured it
    info(`FFmpeg's ebur128 (${(ff.stdout.match(/^ffmpeg version (\S+)/m) || [, '?'])[1]}, dual mono): ${I} LUFS, true peak ${P} dBTP`);
  } else {
    ok(true, 'NOTE: no native ffmpeg — the loudness checked by this file\'s BS.1770 only');
    info('no native ffmpeg: the loudness was checked by this file\'s BS.1770 only');
  }

  // the finish off: DeepFilterNet 3 alone — far closer to the clean speech than the noisy file and than RNNoise
  const before = (await ops()).filter((o) => o.startsWith('clean')).length;
  await finishSwitch.click();
  await page.waitForFunction(() => window.__noiseOps.some((o) => o.startsWith('mix') && !o.endsWith('finish')), null, { timeout: 30000 });
  await page.getByText(/^10\.4 s cleaned in [\d.]+ s with DeepFilterNet 3$/).waitFor({ timeout: 30000 });
  const off = readWav(readFileSync(await save()));
  const sIn = sdr(input.data[0]), sRn = sdr(rn.data[0]), sDf = sdr(off.data[0]);
  info(`SI-SDR against the clean speech: noisy ${sIn.toFixed(1)} dB, RNNoise ${sRn.toFixed(1)} dB, DeepFilterNet 3 ${sDf.toFixed(1)} dB`);
  ok(sIn > 3 && sIn < 7, `the fixture is at 5 dB (${sIn.toFixed(1)} dB)`);
  ok(sDf > sIn + 8 && sDf > sRn + 2.5, `DeepFilterNet 3 takes the traffic out: ${sIn.toFixed(1)} → ${sDf.toFixed(1)} dB (RNNoise ${sRn.toFixed(1)} dB)`);
  const after = await ops();
  ok(after.filter((o) => o.startsWith('clean')).length === before, `switching the finish mixes again, it does not clean again (${after.slice(-3).join(', ')})`);

  // strength 0 with the finish off: the file sample for sample; 50 %: the middle
  await setStrength(0);
  const w0 = readWav(readFileSync(await save()));
  let d0 = 0; for (let i = 0; i < input.n; i++) d0 = Math.max(d0, Math.abs(w0.data[0][i] - input.data[0][i]));
  ok(d0 === 0, `strength 0 % without the finish saves the file sample for sample (largest difference ${(d0 * 32768).toFixed(1)} of a step)`);
  await setStrength(50);
  const w50 = readWav(readFileSync(await save()));
  let mid = 0; for (let i = 0; i < input.n; i++) mid = Math.max(mid, Math.abs(w50.data[0][i] - (off.data[0][i] + w0.data[0][i]) / 2));
  ok(mid <= 1.01 / 32768, `strength 50 % is the middle of the cleaned sound and the file (largest difference ${(mid * 32768).toFixed(2)} of a step)`);
  await setStrength(100);
  await finishSwitch.click();
  await page.getByText(/ · Studio finish: /).waitFor({ timeout: 30000 });
  ok((await ops()).filter((o) => o.startsWith('clean')).length === before, 'a new strength and the finish back on: still no new cleaning');

  // A/B in Studio voice
  await page.getByRole('button', { name: 'Hear the original' }).click();
  ok(await page.getByText('Showing the ORIGINAL').waitFor({ timeout: 10000 }).then(() => true, () => false), 'A/B: the original');
  await page.getByRole('button', { name: 'Hear the cleaned audio' }).click();

  // a stereo file of one voice: cleaned once (progress once from 0 to 100 %), both sides the same
  const ints = Int16Array.from(input.data[0], (v) => Math.round(v * 32768));
  const b = Buffer.alloc(44 + ints.length * 4); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + ints.length * 4, 4); b.write('WAVEfmt ', 8, 'latin1'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(64000, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36, 'latin1'); b.writeUInt32LE(ints.length * 4, 40);
  for (let i = 0; i < ints.length; i++) { b.writeInt16LE(ints[i], 44 + i * 4); b.writeInt16LE(ints[i], 46 + i * 4); }
  const stereo = join(tmp, 'two-sides.wav'); writeFileSync(stereo, b);
  await page.evaluate(() => { window.__said = []; });
  const t0 = Date.now(); await pick(stereo); await studioDone();
  const pct = (await said()).map((l) => /Cleaning with DeepFilterNet 3… (\d+) %/.exec(l)?.[1]).filter(Boolean).map(Number);
  const st = readWav(readFileSync(await save()));
  let sides = 0; for (let i = 0; i < st.n; i++) sides = Math.max(sides, Math.abs(st.data[0][i] - st.data[1][i]));
  ok(st.ch === 2 && sides === 0 && pct.length && pct[0] >= 90, `a stereo file of one voice is cleaned once, both sides the same (progress ${pct.join(' → ')} % — two passes would read 48 → 50 → 98 → 100; ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  ok(model.length === 1, 'the model is not fetched again in the same visit');

  // leaving while it cleans: the work ends with the tab
  await pick(F('traffic-speech.wav'));
  await page.getByText(/Cleaning with DeepFilterNet 3… \d+ %|Making a studio voice…/).waitFor({ timeout: 20000 });
  await page.goto(`${base}#/`);
  ok(await page.waitForFunction(() => globalThis.__superutilsLive().workers === 0, null, { timeout: 8000 }).then(() => true, () => false), 'leaving the tab while it cleans ends the noise worker');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // a model that cannot be fetched: said; the next try fetches it
  const p2 = await newPage({ viewport: { width: 1280, height: 900 } });
  await p2.context().route('**/models/deepfilternet3/**', (r) => r.abort()); // (the context's route: the request comes from the worker)
  await p2.goto(`${base}#/noise`);
  await p2.locator('input[type=file]').first().setInputFiles(F('traffic-speech.wav'));
  await p2.getByText(/ s cleaned in /).waitFor({ timeout: 60000 });
  await p2.getByRole('radio', { name: 'Studio voice' }).click();
  await p2.getByText(/^Could not clean the sound: /).waitFor({ timeout: 60000 });
  const why = await p2.getByText(/^Could not clean the sound: /).textContent();
  ok(/studio voice model could not be fetched/.test(why), `a model that cannot be fetched is said in words: ${why}`);
  await p2.context().unroute('**/models/deepfilternet3/**');
  await p2.getByRole('radio', { name: 'Remove noise' }).click();
  await p2.getByText(/speech detected/).waitFor({ timeout: 60000 });
  await p2.getByRole('radio', { name: 'Studio voice' }).click();
  ok(await p2.getByText(/^10\.4 s cleaned in [\d.]+ s with DeepFilterNet 3/).waitFor({ timeout: 180000 }).then(() => true, () => false), 'a model that could not be fetched is said, and the next try fetches it');
  ok(!p2.errors.length, `no page errors ${p2.errors.slice(0, 3).join(' | ')}`);

  // the phone
  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/noise`);
  await ph.locator('input[type=file]').first().setInputFiles(F('traffic-speech.wav'));
  await ph.getByText(/cleaned in/).waitFor({ timeout: 60000 });
  await ph.getByRole('radio', { name: 'Studio voice' }).click();
  ok(await ph.getByText(/with DeepFilterNet 3/).waitFor({ timeout: 240000 }).then(() => true, () => false), 'phone: Studio voice cleans the recording');
  const box = await ph.getByRole('radio', { name: 'Studio voice' }).boundingBox();
  ok(box.height >= 44 && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `phone: the choice is ${Math.round(box.height)} px tall, no sideways scroll`);
};
