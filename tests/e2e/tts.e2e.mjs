// Text-to-Speech (#/tts): Kokoro (US/UK) and Piper (Indian English) on ONNX Runtime Web with our espeak.wasm.
// Known answers from the audio itself: sample rate, length vs speed, female voices pitched higher than male ones
// (median F0 by autocorrelation), speech energy; MP3 frames; markdown → text; stop.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWav, mp3Frames } from './audio.e2e.mjs';

/** Median F0 (Hz) of voiced 40 ms frames, autocorrelation in 70–400 Hz. */
export function medianF0(x, sr) {
  const n = Math.round(sr * 0.04), f0s = [];
  for (let s = 0; s + n < x.length; s += Math.round(n / 2)) {
    let e = 0; for (let i = 0; i < n; i++) e += x[s + i] ** 2;
    if (Math.sqrt(e / n) < 0.02) continue;
    let best = 0, lag = 0;
    for (let L = Math.floor(sr / 400); L <= Math.ceil(sr / 70); L++) { let c = 0, a = 0, b = 0; for (let i = 0; i + L < n; i++) { c += x[s + i] * x[s + i + L]; a += x[s + i] ** 2; b += x[s + i + L] ** 2; } const r = c / Math.sqrt(a * b + 1e-12); if (r > best) { best = r; lag = L; } }
    if (best > 0.6) f0s.push(sr / lag);
  }
  f0s.sort((a, b) => a - b);
  return f0s.length ? f0s[Math.floor(f0s.length / 2)] : 0;
}
const TEXT = 'The quick brown fox jumps over the lazy dog near the river bank.';

export default async ({ base, page: newPage, ok, info, download, tmp }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${base}#/tts`);
  await page.getByLabel('Text to read').fill(TEXT);
  let runs = 0;
  const say = async (voice, fmt = 'wav') => {
    await page.getByLabel('Voice', { exact: true }).selectOption(voice);
    await page.getByRole('combobox', { name: /^Save as/ }).selectOption(fmt);
    const before = runs++;
    await page.locator('.actions').getByRole('button', { name: 'Speak' }).click();
    await page.waitForFunction((n) => (window.__ttsDone || 0) > n || document.querySelector('.actions button[aria-label="Download"]:not([hidden])'), before, { timeout: 240000 });
    await page.getByRole('button', { name: 'Download' }).waitFor({ timeout: 240000 });
    const p = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
    const status = await page.getByText(/of speech made in/).textContent();
    return { p, status };
  };
  const wavOf = async (voice) => { const { p, status } = await say(voice); const w = readWav(readFileSync(p)); return { w, x: w.data[0], status, secs: w.n / w.sr }; };
  const rms = (x) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

  const heart = await wavOf('af_heart');
  info(`Kokoro Heart: ${heart.secs.toFixed(2)} s · ${heart.status}`);
  ok(heart.w.sr === 24000 && heart.w.ch === 1, 'Kokoro: 24 kHz mono');
  ok(heart.secs > 2 && heart.secs < 6, `a 13-word sentence lasts ${heart.secs.toFixed(2)} s`);
  ok(rms(heart.x) > 0.02, `speech energy (RMS ${rms(heart.x).toFixed(3)})`);
  const michael = await wavOf('am_michael');
  const fF = medianF0(heart.x, 24000), fM = medianF0(michael.x, 24000);
  ok(fF > fM + 40 && fF > 150 && fM < 160, `female voice higher than male: Heart ${fF.toFixed(0)} Hz, Michael ${fM.toFixed(0)} Hz`);
  const emma = await wavOf('bf_emma');
  ok(emma.w.sr === 24000 && emma.secs > 2 && medianF0(emma.x, 24000) > 150, `British Emma: ${emma.secs.toFixed(2)} s, ${medianF0(emma.x, 24000).toFixed(0)} Hz`);
  // speed 2× ≈ half as long
  await page.getByRole('slider').evaluate((el) => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const fast = await wavOf('af_heart');
  ok(fast.secs / heart.secs > 0.4 && fast.secs / heart.secs < 0.7, `2× speed: ${fast.secs.toFixed(2)} s vs ${heart.secs.toFixed(2)} s`);
  await page.getByRole('slider').evaluate((el) => { el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); });

  // Indian English (Piper L2-ARCTIC)
  const svbi = await wavOf('in_svbi'), asi = await wavOf('in_asi');
  info(`Piper SVBI ${svbi.secs.toFixed(2)} s · ${svbi.status}`);
  ok(svbi.w.sr === 22050 && svbi.secs > 2 && svbi.secs < 7 && rms(svbi.x) > 0.02, `Indian English female: 22.05 kHz, ${svbi.secs.toFixed(2)} s`);
  const pF = medianF0(svbi.x, 22050), pM = medianF0(asi.x, 22050);
  ok(pF > pM + 40, `Indian English: female ${pF.toFixed(0)} Hz above male ${pM.toFixed(0)} Hz`);

  // MP3
  const { p: mp } = await say('bm_george', 'mp3');
  const fr = mp3Frames(readFileSync(mp));
  ok(fr.ok && fr.sr === 24000 && /speech-bm_george\.mp3$/.test(mp), `MP3 (${fr.frames} frames, ${fr.sr} Hz, ${mp.split('/').pop()})`);

  // several sentences are read one after another
  await page.getByLabel('Text to read').fill('First sentence here. Second one follows! And a third? Yes, a fourth.');
  await page.getByLabel('Voice', { exact: true }).selectOption('af_bella');
  await page.locator('.actions').getByRole('button', { name: 'Speak' }).click();
  await page.getByText(/^Reading \d of \d/).first().waitFor({ timeout: 120000 });
  ok(true, 'reads sentence by sentence (progress shown)');
  await page.locator('.actions').getByRole('button', { name: 'Stop' }).click();
  ok(await page.getByText('Stopped.').isVisible(), 'stop');
  ok(await page.locator('.tts-now').textContent() === '', 'after Stop no sentence is shown as being read');
  // Speak again while a run is still making its sentences: the old run ends first (two runs shared the ONNX session)
  await page.locator('.actions').getByRole('button', { name: 'Speak' }).click();
  await page.getByText(/^Reading \d of \d/).first().waitFor({ timeout: 120000 });
  await page.locator('.actions').getByRole('button', { name: 'Stop' }).click();
  await page.locator('.actions').getByRole('button', { name: 'Speak' }).click();
  await page.getByText(/of speech made in/).waitFor({ timeout: 180000 });
  const st = await page.locator('[aria-live="polite"].muted').filter({ hasText: 'of speech made' }).textContent();
  ok(/^0:0[4-9]|^0:1\d/.test(st) && await page.locator('.toast.err, .toast-err').count() === 0, `a run started right after another one stops: whole (${st})`);
  // a .txt saved by Notepad in Windows-1252
  const w1252 = join(tmp, 'cafe.txt'); writeFileSync(w1252, Buffer.from('Caf\xe9 au lait, na\xefve r\xe9sum\xe9.', 'latin1'));
  await page.locator('input[type=file]').setInputFiles(w1252);
  await page.waitForFunction(() => /Café/.test(document.querySelector('textarea')?.value || ''), null, { timeout: 5000 });
  ok(await page.getByLabel('Text to read').inputValue() === 'Café au lait, naïve résumé.', 'a Windows-1252 text file: café (it was caf\uFFFD, read aloud as nonsense)');

  // .md file → plain text
  const md = join(tmp, 'notes.md'); writeFileSync(md, '# Title\n\nSome **bold** text and a [link](https://example.com).\n\n- item one\n- item two\n');
  await page.locator('input[type=file]').setInputFiles(md);
  await page.waitForTimeout(300);
  const t = await page.getByLabel('Text to read').inputValue();
  ok(t.includes('Title.') && t.includes('Some bold text and a link.') && !/[#*\[\]()]/.test(t), `markdown read as text: ${JSON.stringify(t.slice(0, 60))}`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
};
