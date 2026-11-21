// Noise Remover (#/noise): RNNoise 0.2 (Jitsi's WebAssembly build) on real speech with 5 dB of white noise. Known answers:
// the cleaned sound is much closer to the clean LibriSpeech reference (SNR measured against it); it keeps the file's rate
// and length; strength 0 % is the file sample for sample and 50 % the exact middle of the two; a new strength is mixed, not
// cleaned again; the newest file wins; Save waits for a file just chosen; a voice on one channel only is found; a 48 kHz
// file is cleaned without resampling; a file that is no sound leaves the open one; leaving ends the work.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWav, mp3Frames } from './audio.e2e.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/speech/${n}`, import.meta.url));
const MEDIA = (n) => fileURLToPath(new URL(`../fixtures/media/${n}`, import.meta.url));
/** 16-bit WAV of planar channels given as 16-bit integers */
function wav16(chs, sr) {
  const n = chs[0].length, c = chs.length, b = Buffer.alloc(44 + n * c * 2);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + n * c * 2, 4); b.write('WAVEfmt ', 8, 'latin1'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * c * 2, 28); b.writeUInt16LE(c * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36, 'latin1'); b.writeUInt32LE(n * c * 2, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) b.writeInt16LE(chs[k][i], 44 + (i * c + k) * 2);
  return b;
}

export default async ({ base, page: newPage, ok, info, download, devices, tmp }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  // what the page asks the noise worker for: a new strength must be a 'mix', never another 'clean'
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage; window.__noiseOps = [];
    Worker.prototype.postMessage = function (m, ...rest) { if (m && (m.op === 'clean' || m.op === 'mix')) window.__noiseOps.push(m.op === 'clean' ? `clean ${m.chs[0].length}@${m.sr}` : `mix ${m.mix}`); return post.call(this, m, ...rest); };
  });
  await page.goto(`${base}#/noise`);
  const ops = () => page.evaluate(() => window.__noiseOps.slice());
  const save = () => download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click());
  const cleaned = (secs = '[\\d.]+') => page.getByText(new RegExp(`^${secs} s cleaned in [\\d.]+ s`)).waitFor({ timeout: 60000 });
  const statusText = () => page.getByText(/ s cleaned in /).textContent();
  const setStrength = (v) => page.getByRole('slider').evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const pick = (f) => page.locator('input[type=file]').first().setInputFiles(f);
  const wavRadio = () => page.getByRole('radio', { name: 'WAV', exact: true }).click();
  /** clean reference decoded by the browser at the file's own rate, 16 kHz (as the tool decodes since Nov 2026) */
  const decode16k = (file) => page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), ctx = new OfflineAudioContext(1, 1, 16000);
    const b = await ctx.decodeAudioData(bytes.buffer); return { sr: b.sampleRate, x: Array.from(b.getChannelData(0)) };
  }, readFileSync(file).toString('base64'));
  const ref = await decode16k(F('librispeech-1.flac')), clean = Float32Array.from(ref.x);
  /** SNR (dB) of y against the reference after the best gain (scale-invariant) */
  const snr = (y) => { const n = Math.min(y.length, clean.length); let xy = 0, xx = 0; for (let i = 0; i < n; i++) { xy += clean[i] * y[i]; xx += clean[i] * clean[i]; } const g = xy / xx; let e = 0, s = 0; for (let i = 0; i < n; i++) { const t = g * clean[i]; s += t * t; e += (y[i] - t) ** 2; } return 10 * Math.log10(s / e); };

  await pick(F('noisy-speech.wav'));
  await cleaned('10.4');
  ok(/speech detected in \d+ %/.test(await statusText()), 'voice activity reported');
  const voiced = +(await statusText()).match(/speech detected in (\d+) %/)[1];
  await wavRadio();
  const w = readWav(readFileSync(await save()));
  const input = readWav(readFileSync(F('noisy-speech.wav')));
  ok(w.sr === 16000 && w.n === input.n, `the cleaned file keeps the input's rate and length (${w.n} samples at ${w.sr} Hz) — RNNoise works at 48 kHz in between`);
  const sIn = snr(input.data[0]), sOut = snr(w.data[0]);
  info(`SNR vs clean speech: noisy ${sIn.toFixed(1)} dB → cleaned ${sOut.toFixed(1)} dB · speech in ${voiced} %`);
  ok(sIn > 3 && sIn < 7, `fixture is 5 dB SNR (${sIn.toFixed(1)} dB)`);
  ok(sOut > sIn + 5, `RNNoise improves SNR by ${(sOut - sIn).toFixed(1)} dB (> 5 dB)`);

  // A/B toggle shows the original
  await page.getByRole('button', { name: 'Hear the original' }).click();
  await page.getByText('Showing the ORIGINAL').waitFor({ timeout: 10000 }).catch(() => {});
  ok(await page.getByText('Showing the ORIGINAL').isVisible(), 'A/B: original shown');
  await page.getByRole('button', { name: 'Hear the cleaned audio' }).click();

  // strength 0 → the file itself; 50 % → the exact middle; neither cleans again
  const before = (await ops()).filter((o) => o.startsWith('clean')).length, line = await statusText();
  await setStrength(0);
  const w0 = readWav(readFileSync(await save()));
  let diff0 = 0; for (let i = 0; i < input.n; i++) diff0 = Math.max(diff0, Math.abs(w0.data[0][i] - input.data[0][i]));
  ok(w0.n === input.n && diff0 === 0, `strength 0 % saves the file sample for sample (largest difference ${(diff0 * 32768).toFixed(1)} of a 16-bit step; it went through the resampler twice before, then off by a step with ×32767)`);
  await setStrength(50);
  const w50 = readWav(readFileSync(await save()));
  let mid = 0; for (let i = 0; i < input.n; i++) mid = Math.max(mid, Math.abs(w50.data[0][i] - (w.data[0][i] + w0.data[0][i]) / 2));
  ok(mid <= 1.01 / 32768, `strength 50 % is the middle of the cleaned sound and the file (largest difference ${(mid * 32768).toFixed(2)} of a step)`);
  const after = await ops();
  ok(after.filter((o) => o.startsWith('clean')).length === before && after.includes('mix 0') && after.includes('mix 0.5'), `a new strength is mixed, not cleaned again (${after.join(', ')})`);
  ok(await statusText() === line, 'the line about the cleaning stays as it was');
  await setStrength(100);
  await page.getByRole('radio', { name: 'MP3', exact: true }).click();
  const mp = await save();
  ok(mp3Frames(readFileSync(mp)).ok && /noisy-speech-clean\.mp3$/.test(mp), `MP3 saved (${mp.split('/').pop()})`);

  // trim then save: selection respected
  await page.getByLabel('Start (seconds)').fill('2'); await page.getByLabel('End (seconds)').fill('5');
  await wavRadio();
  const wt = readWav(readFileSync(await save()));
  ok(Math.abs(wt.n / wt.sr - 3) < 0.002, `trimmed to 3.00 s (${(wt.n / wt.sr).toFixed(3)} s)`);
  await setStrength(80); await page.waitForTimeout(400);
  ok(await page.getByLabel('Start (seconds)').inputValue() === '2.00' && await page.getByLabel('End (seconds)').inputValue() === '5.00', 'a new strength keeps the selection');

  // Save right after another file is chosen: that file's sound, under its name (it saved the one before under the new name)
  await pick(MEDIA('tone.wav'));
  const wn = await save();
  const wnw = readWav(readFileSync(wn));
  ok(/tone-clean\.wav$/.test(wn) && wnw.n === 32000 && wnw.sr === 16000, `Save at once after choosing tone.wav gives tone.wav's sound (${wn.split('/').pop()}, ${wnw.n} samples at ${wnw.sr} Hz)`);
  ok(await page.getByLabel('Start (seconds)').inputValue() === '0.00' && await page.getByLabel('End (seconds)').inputValue() === '2.00', 'a new file is selected whole (the last file\'s 2 – 5 s was kept)');

  // the newest file wins: a long file then a short one — the short one stays, and does not wait for the long one
  const n = 48000 * 240, long = new Int16Array(n); let seed = 3;
  for (let i = 0; i < n; i++) { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; long[i] = ((seed >>> 16) & 0x7ff) - 1024; }
  const longFile = join(tmp, 'long-noise.wav'); writeFileSync(longFile, wav16([long], 48000));
  await pick(longFile); await pick(F('noisy-speech.wav'));
  await cleaned('10.4'); await page.waitForTimeout(2500);
  ok((await statusText()).startsWith('10.4 s cleaned'), 'the file chosen last stays (a long file chosen just before it never replaces it)');
  await pick(longFile);
  await page.getByText('Removing noise…').waitFor({ timeout: 20000 });
  const t0 = Date.now(); await pick(F('noisy-speech.wav'));
  const quick = await cleaned('10.4').then(() => true, () => false) && Date.now() - t0 < 7000;
  ok(quick, `a file chosen while a 4-minute one is being cleaned is cleaned at once (${((Date.now() - t0) / 1000).toFixed(1)} s; it waited for the long one)`);

  // a voice on one channel only: the share of speech is the same as in mono (it was read from the first channel only)
  const ints = Int16Array.from(input.data[0], (v) => Math.round(v * 32768)), hush = Int16Array.from(ints, (_, i) => (i % 7) - 3);
  const stereo = join(tmp, 'right-only.wav'); writeFileSync(stereo, wav16([hush, ints], 16000));
  await pick(stereo); await cleaned('10.4');
  const voicedR = +(await statusText()).match(/speech detected in (\d+) %/)[1];
  ok(Math.abs(voicedR - voiced) <= 2, `a voice on the right channel only is found (${voicedR} % of the recording; mono ${voiced} %)`);

  // 48 kHz: no resampling
  await pick(MEDIA('noisy-tone.wav')); await cleaned('3.0');
  const w48 = readWav(readFileSync(await save()));
  ok(w48.sr === 48000 && w48.n === 144000, `a 48 kHz file is saved at 48 kHz, as long as it was (${w48.n} samples)`);

  // a file that is no sound: said, and the open file stays
  const junk = join(tmp, 'notes.mp3'); writeFileSync(junk, 'this is not sound at all '.repeat(200));
  await pick(junk);
  await page.getByText(/Cannot read this audio/).waitFor({ timeout: 15000 });
  ok((await statusText()).startsWith('3.0 s cleaned'), 'a file that is no sound is refused with a message; the open file stays');
  const wj = await save();
  ok(/noisy-tone-clean\.wav$/.test(wj), `…and Save still gives the open file (${wj.split('/').pop()})`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // record path: the fake microphone through RNNoise
  await page.getByText('Or record with the microphone').click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByText(/1\.\d s cleaned in/).waitFor({ timeout: 60000 });
  ok(true, 'a microphone recording is cleaned');

  // leaving while it cleans: the work ends with the tab, without errors
  await pick(longFile);
  await page.getByText('Removing noise…').waitFor({ timeout: 20000 });
  await page.goto(`${base}#/`);
  ok(await page.waitForFunction(() => globalThis.__superutilsLive().workers === 0, null, { timeout: 8000 }).then(() => true, () => false), 'leaving the tab while it cleans ends the noise worker');
  ok(!page.errors.length, `no page errors after leaving ${page.errors.slice(0, 3).join(' | ')}`);

  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/noise`);
  await ph.locator('input[type=file]').first().setInputFiles(F('noisy-speech.wav'));
  await ph.getByText(/cleaned in/).waitFor({ timeout: 60000 });
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.getByRole('button', { name: 'Save' }).isVisible(), 'phone: no horizontal scroll, Save in the bottom bar');
};
