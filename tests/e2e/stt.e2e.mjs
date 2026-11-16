// Speech to Text (#/stt): our whisper.cpp wasm + Whisper English models. Known answers: the JFK inaugural clip and a
// LibriSpeech sample (word error rate), and round trips through our own Text-to-Speech — Indian English (Piper) and
// US English (Kokoro) voices read sentences that must come back as text. Also: hint box spelling, .srt/.vtt, stop.
import { readFileSync } from 'node:fs';
const S = (n) => new URL(`../fixtures/speech/${n}`, import.meta.url).pathname;
const norm = (t) => t.toLowerCase().replace(/\bmr\b\.?/g, 'mister').replace(/\b7\b/g, 'seven').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
/** word error rate of `hyp` against `ref` (Levenshtein over words) */
export function wer(ref, hyp) {
  const r = norm(ref), h2 = norm(hyp), d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h2.length).fill(0)]);
  for (let j = 1; j <= h2.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h2.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h2[j - 1] ? 0 : 1));
  return d[r.length][h2.length] / r.length;
}

export default async ({ base, page: newPage, ok, info, download }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(`${base}#/stt`);
  const transcribe = async (file, model) => {
    await page.locator('input[type=file]').first().setInputFiles(file);
    await page.getByText(/transcribing takes roughly/).waitFor({ timeout: 20000 });
    await page.getByRole('radio', { name: model === 'small' ? /Accurate/ : /Fast/ }).click();
    await page.locator('.actions').getByRole('button', { name: 'Transcribe' }).click();
    await page.getByText(/of audio transcribed in/).waitFor({ timeout: 600000 });
    const text = await page.getByLabel('Transcript').inputValue(), st = await page.getByText(/of audio transcribed in/).textContent();
    await page.evaluate(() => { const s = [...document.querySelectorAll('[aria-live]')].find((e) => /transcribed in/.test(e.textContent)); if (s) s.textContent = ''; });
    return { text, st };
  };

  // 1. JFK (public domain), fast model
  const JFK = 'And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.';
  const j = await transcribe(S('jfk.flac'), 'base');
  info(`JFK (base.en): "${j.text}" · ${j.st}`);
  ok(wer(JFK, j.text) === 0, `JFK clip word for word (WER ${(wer(JFK, j.text) * 100).toFixed(0)} %)`);
  const srt = readFileSync(await download(page, () => page.getByRole('button', { name: '.srt' }).click()), 'utf8');
  ok(/^1\n00:00:00,000 --> 00:00:\d\d,\d{3}\n.*country/s.test(srt), `SRT subtitles (${JSON.stringify(srt.slice(0, 50))})`);
  const vtt = readFileSync(await download(page, () => page.getByRole('button', { name: '.vtt' }).click()), 'utf8');
  ok(/^WEBVTT\n\n00:00:00\.000 --> 00:00:\d\d\.\d{3}\n/.test(vtt), 'WebVTT subtitles');
  const txtPath = await download(page, () => page.getByRole('button', { name: '.txt' }).click());
  ok(/jfk\.txt$/.test(txtPath) && readFileSync(txtPath, 'utf8').trim() === j.text.trim(), 'plain text download (jfk.txt)');
  await page.getByText('Segments with times').click();
  await page.locator('.stt-seg').first().click();
  ok(await page.locator('.stt-seg').count() >= 1, 'segments listed with times (click plays from there)');

  // 2. LibriSpeech (CC BY 4.0), accurate model
  // LibriSpeech test-clean 1089-134686-0000 (reference transcript)
  const LS = 'He hoped there would be stew for dinner, turnips and carrots and bruised potatoes and fat mutton pieces to be ladled out in thick peppered flour fattened sauce.';
  const l = await transcribe(S('librispeech-1.flac'), 'small');
  info(`LibriSpeech (small.en): "${l.text}" · ${l.st}`);
  ok(wer(LS, l.text) <= 0.1, `LibriSpeech sample with the accurate model (WER ${(wer(LS, l.text) * 100).toFixed(0)} %)`);

  // 3. round trips through our own Text-to-Speech (Indian English via Piper, US English via Kokoro)
  const tts = await newPage({ viewport: { width: 1280, height: 1000 } });
  await tts.goto(`${base}#/tts`);
  const speak = async (voice, text) => {
    await tts.getByLabel('Text to read').fill(text);
    await tts.getByLabel('Voice', { exact: true }).selectOption(voice);
    await tts.getByRole('combobox', { name: /^Save as/ }).selectOption('wav');
    await tts.locator('.actions').getByRole('button', { name: 'Speak' }).click();
    await tts.getByRole('button', { name: 'Download' }).waitFor({ timeout: 240000 });
    return download(tts, () => tts.getByRole('button', { name: 'Download' }).click());
  };
  const IN = 'The train to Mumbai leaves at seven in the morning. Please carry your ticket and an identity card.';
  const inW = await speak('in_svbi', IN);
  const r1 = await transcribe(inW, 'small'); // the owner's default on PC, chosen for Indian accents
  info(`Indian English voice, accurate model → "${r1.text}"`);
  ok(wer(IN, r1.text) <= 0.2, `Indian English (Piper SVBI) round trip, accurate model (WER ${(wer(IN, r1.text) * 100).toFixed(0)} %)`);
  const r1b = await transcribe(inW, 'base');
  info(`Indian English voice, fast model → "${r1b.text}" (WER ${(wer(IN, r1b.text) * 100).toFixed(0)} %)`);
  const US = 'Our meeting moved to Thursday afternoon because the projector in the large room is broken.';
  const usW = await speak('am_michael', US);
  const r2 = await transcribe(usW, 'base');
  info(`US voice → "${r2.text}"`);
  ok(wer(US, r2.text) <= 0.15, `US English (Kokoro Michael) round trip (WER ${(wer(US, r2.text) * 100).toFixed(0)} %)`);

  // 4. names and terms: invented spellings come out as written in the hint box
  const NAMES = 'Please send the Zentrixa report to Anvika Raghunathan by Friday.';
  const nW = await speak('af_heart', NAMES);
  const plain = await transcribe(nW, 'base');
  await page.getByLabel('Names and terms').fill('Zentrixa, Anvika Raghunathan');
  const hinted = await transcribe(nW, 'base');
  info(`without hints: "${plain.text}" · with hints: "${hinted.text}"`);
  ok(/Zentrixa/.test(hinted.text) && /Anvika/.test(hinted.text) && /Raghunathan/.test(hinted.text), 'hint box gives the expected spellings');
  await page.getByLabel('Names and terms').fill('');

  // 5. stop
  await page.getByRole('radio', { name: /Accurate/ }).click();
  await page.locator('.actions').getByRole('button', { name: 'Transcribe' }).click();
  await page.waitForTimeout(1500);
  await page.locator('.actions').getByRole('button', { name: 'Stop' }).click();
  ok(await page.getByText('Stopped.').isVisible() && await page.locator('.actions').getByRole('button', { name: 'Transcribe' }).isVisible(), 'stop ends the job');
  ok(!page.errors.length && !tts.errors.length, `no page errors ${[...page.errors, ...tts.errors].slice(0, 3).join(' | ')}`);
};
