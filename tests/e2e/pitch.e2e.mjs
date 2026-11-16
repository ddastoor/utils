// Pitch & Speed (#/pitch): WSOLA tempo + resampler pitch (own audio.wasm). Known answers on a generated 440 Hz WAV:
// speed changes the length but not the frequency, pitch changes the frequency but not the length.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeWav, readWav, freqOf, mp3Frames } from './audio.e2e.mjs';

export default async ({ base, page: newPage, ok, download, tmp, devices }) => {
  const sr = 44100, N = sr * 2, L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) { L[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr); R[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / sr); }
  const fx = join(tmp, 'a440.wav'); writeFileSync(fx, makeWav([L, R], sr));
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${base}#/pitch`);
  const save = () => download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click());
  const done = () => page.waitForFunction(() => /→ [\d.]+ s · /.test(document.querySelector('[aria-live]')?.textContent || '') || [...document.querySelectorAll('[aria-live]')].some((e) => /→ [\d.]+ s · /.test(e.textContent)), null, { timeout: 30000 });
  const setRange = (label, v) => page.getByRole('slider').nth(label === 'speed' ? 0 : 1).evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await page.locator('input[type=file]').setInputFiles(fx);
  await done();
  const ctxRate = +(await page.evaluate(() => new AudioContext().sampleRate));
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  const w0 = readWav(readFileSync(await save()));
  ok(Math.abs(w0.n / w0.sr - 2) < 0.002 && Math.abs(freqOf(w0.data[0], w0.sr) - 440) < 1, `untouched: 2.00 s at 440 Hz (${(w0.n / w0.sr).toFixed(3)} s)`);

  // speed 1.5×: length 1.333 s, still 440 Hz
  await setRange('speed', 1.5); await page.waitForTimeout(500); await done();
  ok(await page.getByText(/2\.0 s → 1\.3 s · 1\.5× speed · 0 semitones/).isVisible(), 'status shows 2.0 s → 1.3 s');
  const w1 = readWav(readFileSync(await save()));
  ok(Math.abs(w1.n / w1.sr - 2 / 1.5) < 0.003 && Math.abs(freqOf(w1.data[0], w1.sr) - 440) < 1.5, `1.5× speed: ${(w1.n / w1.sr).toFixed(3)} s, ${freqOf(w1.data[0], w1.sr).toFixed(1)} Hz`);
  ok(w1.ch === 2 && Math.abs(Math.max(...w1.data[1].slice(5000, 40000)) / Math.max(...w1.data[0].slice(5000, 40000)) - 0.6) < 0.05, 'stereo balance kept');

  // pitch +7 at 1.5×: 440·2^(7/12) = 659.3 Hz, same 1.333 s
  await setRange('pitch', 7); await page.waitForTimeout(500); await done();
  const w2 = readWav(readFileSync(await save()));
  ok(Math.abs(w2.n / w2.sr - 2 / 1.5) < 0.003 && Math.abs(freqOf(w2.data[0], w2.sr) - 659.26) < 2, `+7 semitones: ${freqOf(w2.data[0], w2.sr).toFixed(1)} Hz, ${(w2.n / w2.sr).toFixed(3)} s`);

  // presets
  await page.getByRole('button', { name: 'Deep voice' }).click(); await page.waitForTimeout(300); await done();
  const w3 = readWav(readFileSync(await save()));
  ok(Math.abs(w3.n / w3.sr - 2) < 0.003 && Math.abs(freqOf(w3.data[0], w3.sr) - 440 * 2 ** (-5 / 12)) < 1.5, `Deep voice preset: −5 st = ${freqOf(w3.data[0], w3.sr).toFixed(1)} Hz, length kept`);
  await page.getByRole('button', { name: 'Practice (75 %)' }).click(); await page.waitForTimeout(300); await done();
  await page.getByRole('radio', { name: 'MP3', exact: true }).click();
  const mp = await save(), mf = mp3Frames(readFileSync(mp));
  ok(mf.ok && Math.abs(((mf.frames - 1) * 1152) / mf.sr - 2 / 0.75) < 0.1, `Practice preset as MP3: ${(((mf.frames - 1) * 1152) / mf.sr).toFixed(2)} s (≈ 2.67 s)`);
  ok(/-0\.75x\.mp3$/.test(mp), `file name says the speed (${mp.split('/').pop()})`);
  ok(ctxRate > 0, `decoded at ${ctxRate} Hz`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // phone: controls and the sticky bar fit
  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/pitch`);
  await ph.locator('input[type=file]').setInputFiles(fx);
  await ph.getByRole('button', { name: 'Save' }).waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
