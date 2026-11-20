// Pitch & Speed (#/pitch): Signalsmith Stretch (its authors' WebAssembly / AudioWorklet release) rendered offline. Known
// answers on generated WAVs: speed changes the length but not the frequency (within 3 cents), pitch the frequency but
// not the length (within 6 cents). Measured over the whole range (docs/WASM-AUDIT.md 145): Signalsmith is 0.3 – 2.4
// cents sharp at a speed alone and up to 5.0 cents with a pitch shift — it re-estimates every partial; Rubber Band R3 is
// exact on a lone sine but smears a chord's partials (−13 to −23 dB), our WSOLA was exact and 7 – 15 dB dirtier than
// Signalsmith on a chord. A chord keeps its partials clean; the sound starts at full level; "Original" is the file
// sample for sample; moving a slider during a rendering renders the newest settings once; the newest file wins; Save
// waits for the file just chosen; a selection follows its passage when the speed changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeWav, readWav, freqOf, mp3Frames } from './audio.e2e.mjs';

/** stray energy: everything more than 6 Hz from the expected partials, in dB of all (Hann, 65,536 points, mid-file) */
function strayDb(x, sr, partials) {
  const N = 65536, s = Math.floor(x.length / 2 - N / 2), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) { const a = (-2 * Math.PI) / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), d = Math.sin(a * k), h = i + k + len / 2, vr = re[h] * c - im[h] * d, vi = re[h] * d + im[h] * c; re[h] = re[i + k] - vr; im[h] = im[i + k] - vi; re[i + k] += vr; im[i + k] += vi; } }
  let tot = 0, near = 0;
  for (let k = 1; k < N / 2; k++) { const p = re[k] ** 2 + im[k] ** 2, f = (k * sr) / N; tot += p; if (partials.some((q) => Math.abs(f - q) <= 6)) near += p; }
  return 10 * Math.log10((tot - near) / tot);
}
const cents = (f, want) => 1200 * Math.log2(f / want);

export default async ({ base, page: newPage, ok, info, download, tmp, devices }) => {
  const sr = 44100, N = sr * 2, L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) { L[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr); R[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / sr); }
  const fx = join(tmp, 'a440.wav'); writeFileSync(fx, makeWav([L, R], sr));
  const C = [261.63, 329.63, 392.0], chord = Float32Array.from({ length: sr * 4 }, (_, i) => C.reduce((a, f) => a + 0.25 * Math.sin(2 * Math.PI * f * i / sr), 0));
  const chordFile = join(tmp, 'c-major.wav'); writeFileSync(chordFile, makeWav([chord], sr));
  let seed = 9; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 0.6;
  const longFile = join(tmp, 'minute.wav'); writeFileSync(longFile, makeWav([Float32Array.from({ length: sr * 60 }, rnd), Float32Array.from({ length: sr * 60 }, rnd)], sr));

  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  // the renderings: every OfflineAudioContext longer than a probe (decodeAudio opens 1-frame ones)
  await page.addInitScript(() => {
    const O = window.OfflineAudioContext; window.__renders = [];
    window.OfflineAudioContext = class extends O { constructor(...a) { super(...a); const len = typeof a[0] === 'object' ? a[0].length : a[1]; if (len > 1000) window.__renders.push(len); } };
  });
  await page.goto(`${base}#/pitch`);
  const renders = () => page.evaluate(() => window.__renders.length);
  const save = () => download(page, () => page.locator('.actions').getByRole('button', { name: 'Download' }).click());
  const statusText = () => page.locator('.card [aria-live]').first().textContent();
  const done = (re = /→ [\d.]+ s · /) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.card [aria-live]')?.textContent || ''), re.source, { timeout: 60000 }).catch(async (e) => { throw new Error(`${e.message.split('\n')[0]} — waiting for ${re} — the line says “${await statusText()}”`); });
  const setRange = (label, v) => page.getByRole('slider').nth(label === 'speed' ? 0 : 1).evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const pick = (f) => page.locator('input[type=file]').setInputFiles(f);
  const original = readWav(readFileSync(fx));

  await pick(fx); await done();
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  const w0 = readWav(readFileSync(await save()));
  let d0 = 0; for (let k = 0; k < 2; k++) for (let i = 0; i < original.n; i++) d0 = Math.max(d0, Math.abs(w0.data[k][i] - original.data[k][i]));
  ok(w0.n === original.n && d0 === 0, `untouched ("Original"): the file sample for sample (${w0.n} samples, largest difference ${(d0 * 32768).toFixed(1)} of a step)`);

  // speed 1.5×: length 1.333 s, still 440 Hz; full level from the first millisecond; stereo balance kept
  await setRange('speed', 1.5); await page.waitForTimeout(500); await done(/1\.5× speed/);
  ok(await page.getByText(/2\.0 s → 1\.3 s · 1\.5× speed · 0 semitones/).isVisible(), 'status shows 2.0 s → 1.3 s');
  const w1 = readWav(readFileSync(await save())), f1 = freqOf(w1.data[0], w1.sr);
  ok(w1.n === Math.round(N / 1.5) && Math.abs(cents(f1, 440)) < 3, `1.5× speed: ${w1.n} samples (${(w1.n / w1.sr).toFixed(3)} s), ${f1.toFixed(2)} Hz (${cents(f1, 440).toFixed(1)} cents)`);
  const rms = (x, a, b) => { let q = 0; for (let i = a; i < b; i++) q += x[i] * x[i]; return Math.sqrt(q / (b - a)); };
  const start = rms(w1.data[0], 0, 441) / rms(w1.data[0], 20000, 40000);
  ok(start > 0.8, `the sound starts at full level (first 10 ms at ${(start * 100).toFixed(0)} % of the steady level; started at the output's 0 it faded in over ~50 ms)`);
  ok(w1.ch === 2 && Math.abs(rms(w1.data[1], 5000, 40000) / rms(w1.data[0], 5000, 40000) - 0.6) < 0.03, `stereo balance kept (${(rms(w1.data[1], 5000, 40000) / rms(w1.data[0], 5000, 40000)).toFixed(3)} of 0.600)`);

  // pitch +7 at 1.5×: 440·2^(7/12) = 659.26 Hz, same length
  await setRange('pitch', 7); await page.waitForTimeout(500); await done(/\+7 semitones/);
  const w2 = readWav(readFileSync(await save())), f2 = freqOf(w2.data[0], w2.sr);
  ok(w2.n === Math.round(N / 1.5) && Math.abs(cents(f2, 659.26)) < 6, `+7 semitones: ${f2.toFixed(2)} Hz (${cents(f2, 659.26).toFixed(1)} cents from 659.26), ${(w2.n / w2.sr).toFixed(3)} s`);

  // presets
  await page.getByRole('button', { name: 'Deep voice' }).click(); await done(/1× speed · −5 semitones/);
  const w3 = readWav(readFileSync(await save())), f3 = freqOf(w3.data[0], w3.sr);
  ok(w3.n === N && Math.abs(cents(f3, 440 * 2 ** (-5 / 12))) < 6, `Deep voice preset: −5 st = ${f3.toFixed(2)} Hz (${cents(f3, 440 * 2 ** (-5 / 12)).toFixed(1)} cents), length kept`);
  await page.getByRole('button', { name: 'Practice (75 %)' }).click(); await done(/0\.75× speed/);
  await page.getByRole('radio', { name: 'MP3', exact: true }).click();
  const mp = await save(), mf = mp3Frames(readFileSync(mp));
  ok(mf.ok && Math.abs(((mf.frames - 1) * 1152) / mf.sr - 2 / 0.75) < 0.1, `Practice preset as MP3: ${(((mf.frames - 1) * 1152) / mf.sr).toFixed(2)} s (≈ 2.67 s)`);
  ok(/-0\.75x\.mp3$/.test(mp), `file name says the speed (${mp.split('/').pop()})`);

  // a chord stays clean: stray energy far below the partials (our WSOLA left −33.8 dB here)
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  await pick(chordFile); await setRange('speed', 1.25); await setRange('pitch', 3); await done(/4\.0 s → 3\.2 s · 1\.25× speed · \+3 semitones/);
  const wc = readWav(readFileSync(await save())), stray = strayDb(wc.data[0], sr, C.map((f) => f * 2 ** (3 / 12)));
  info(`C major at 1.25× and +3 semitones: stray energy ${stray.toFixed(1)} dB`);
  ok(stray < -40, `a C-major chord at 1.25× and +3 semitones keeps its partials clean (stray energy ${stray.toFixed(1)} dB, below −40)`);

  // a selection follows its passage: 1.0 – 2.0 s at 1.25× is 0.625 – 1.25 s at 2×
  await page.getByLabel('Start (seconds)').fill('1'); await page.getByLabel('End (seconds)').fill('2');
  await setRange('speed', 2); await done(/2× speed/);
  ok(await page.getByLabel('Start (seconds)').inputValue() === '0.63' && await page.getByLabel('End (seconds)').inputValue() === '1.25', `the selection follows the same passage at another speed (${await page.getByLabel('Start (seconds)').inputValue()} – ${await page.getByLabel('End (seconds)').inputValue()} s)`);

  // sliders moved during a rendering: the newest settings are rendered once, not once per step
  await pick(longFile); await done(/60\.0 s → 30\.0 s/);
  const before = await renders();
  for (const v of [1.1, 1.2, 1.3, 1.4]) { await setRange('speed', v); await page.waitForTimeout(450); }
  await done(/1\.4× speed/);
  const made = (await renders()) - before;
  ok(made <= 3 && (await statusText()).includes('60.0 s → 42.9 s · 1.4× speed'), `four speeds chosen while a minute of stereo renders: ${made} renderings, the last one 1.4× (one per step before)`);

  // Save right after another file is chosen: that file's result, under its name
  await pick(fx);
  const wn = await save(), wnw = readWav(readFileSync(wn));
  ok(/a440-1\.4x-up3\.wav$/.test(wn) && wnw.n === Math.round(N / 1.4), `Save at once after choosing a440.wav gives its result (${wn.split('/').pop()}, ${wnw.n} samples)`);
  // the newest file wins
  await pick(longFile); await pick(chordFile); await done(/4\.0 s → 2\.9 s/); await page.waitForTimeout(1500);
  ok((await statusText()).startsWith('4.0 s → 2.9 s'), 'the file chosen last stays (a minute-long file chosen just before it never replaces it)');
  // a file that is no sound: said, and the open file stays
  const junk = join(tmp, 'notes.mp3'); writeFileSync(junk, 'not a sound at all '.repeat(300));
  await pick(junk); await page.getByText(/Cannot read this audio/).waitFor({ timeout: 15000 });
  ok((await statusText()).startsWith('4.0 s → 2.9 s'), 'a file that is no sound is refused; the open file stays');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
  // leaving while it renders
  await pick(longFile); await page.getByText('Processing…').waitFor({ timeout: 20000 });
  await page.goto(`${base}#/`); await page.waitForTimeout(800);
  ok(!page.errors.length, `leaving while it renders: no errors ${page.errors.slice(0, 3).join(' | ')}`);

  // phone: controls and the sticky bar fit
  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/pitch`);
  await ph.locator('input[type=file]').setInputFiles(fx);
  await ph.getByRole('button', { name: 'Save' }).waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
