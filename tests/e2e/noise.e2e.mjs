// Noise Remover (#/noise): RNNoise (own wasm) on real speech + 5 dB white noise. Known answer: the cleaned audio is
// much closer to the clean LibriSpeech reference (SNR measured against it), the output stays aligned, strength 0 = input.
import { readFileSync } from 'node:fs';
import { readWav, mp3Frames } from './audio.e2e.mjs';
const F = (n) => new URL(`../fixtures/speech/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${base}#/noise`);
  const save = () => download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click());
  const cleaned = () => page.getByText(/cleaned in [\d.]+ s/).waitFor({ timeout: 60000 });
  /** clean reference decoded by the browser at the page's rate (same rate the tool decodes at) */
  const ref = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), ctx = new AudioContext();
    const b = await ctx.decodeAudioData(bytes.buffer); return { sr: b.sampleRate, x: Array.from(b.getChannelData(0)) };
  }, readFileSync(F('librispeech-1.flac')).toString('base64'));
  const clean = Float32Array.from(ref.x);
  /** SNR (dB) of y against the reference after the best gain (scale-invariant) */
  const snr = (y) => { const n = Math.min(y.length, clean.length); let xy = 0, xx = 0; for (let i = 0; i < n; i++) { xy += clean[i] * y[i]; xx += clean[i] * clean[i]; } const g = xy / xx; let e = 0, s = 0; for (let i = 0; i < n; i++) { const t = g * clean[i]; s += t * t; e += (y[i] - t) ** 2; } return 10 * Math.log10(s / e); };

  await page.locator('input[type=file]').first().setInputFiles(F('noisy-speech.wav'));
  await cleaned();
  ok(/speech detected in \d+ %/.test(await page.getByText(/cleaned in/).textContent()), 'voice activity reported');
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  const w = readWav(readFileSync(await save()));
  ok(w.sr === ref.sr && Math.abs(w.n - clean.length) <= 2, `same length and rate as the input (${w.n} samples at ${w.sr} Hz)`);
  // input SNR against the reference, measured the same way
  const noisy = await page.evaluate(async (b64) => { const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), ctx = new AudioContext(); return Array.from((await ctx.decodeAudioData(bytes.buffer)).getChannelData(0)); }, readFileSync(F('noisy-speech.wav')).toString('base64'));
  const sIn = snr(Float32Array.from(noisy)), sOut = snr(w.data[0]);
  info(`SNR vs clean speech: noisy ${sIn.toFixed(1)} dB → cleaned ${sOut.toFixed(1)} dB`);
  ok(sIn > 3 && sIn < 7, `fixture is 5 dB SNR (${sIn.toFixed(1)} dB)`);
  ok(sOut > sIn + 5, `RNNoise improves SNR by ${(sOut - sIn).toFixed(1)} dB (> 5 dB)`);

  // A/B toggle shows the original
  await page.getByRole('button', { name: 'Hear the original' }).click();
  ok(await page.getByText('Showing the ORIGINAL').isVisible(), 'A/B: original shown');
  await page.getByRole('button', { name: 'Hear the cleaned audio' }).click();

  // strength 0 → the input unchanged
  await page.getByRole('slider').evaluate((el) => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(600); await cleaned();
  const w0 = readWav(readFileSync(await save()));
  ok(Math.abs(snr(w0.data[0]) - sIn) < 0.3, `strength 0 % = the original (${snr(w0.data[0]).toFixed(1)} dB)`);
  await page.getByRole('slider').evaluate((el) => { el.value = '100'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(600); await cleaned();
  await page.getByRole('radio', { name: 'MP3', exact: true }).click();
  const mp = await save();
  ok(mp3Frames(readFileSync(mp)).ok && /-clean\.mp3$/.test(mp), `MP3 saved (${mp.split('/').pop()})`);

  // trim then save: selection respected
  await page.getByLabel('Start (seconds)').fill('2'); await page.getByLabel('End (seconds)').fill('5');
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  const wt = readWav(readFileSync(await save()));
  ok(Math.abs(wt.n / wt.sr - 3) < 0.002, `trimmed to 3.00 s (${(wt.n / wt.sr).toFixed(3)} s)`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // record path: the fake microphone through RNNoise
  await page.getByText('Or record with the microphone').click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByText(/1\.\d s cleaned in/).waitFor({ timeout: 60000 });
  ok(true, 'a microphone recording is cleaned');

  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/noise`);
  await ph.locator('input[type=file]').first().setInputFiles(F('noisy-speech.wav'));
  await ph.getByText(/cleaned in/).waitFor({ timeout: 60000 });
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.getByRole('button', { name: 'Save' }).isVisible(), 'phone: no horizontal scroll, Save in the bottom bar');
};
