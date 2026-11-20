// Speech to Text (#/stt): our whisper.cpp wasm + Whisper English models. Known answers: the JFK inaugural clip and a
// LibriSpeech sample (word error rate), and round trips through our own Text-to-Speech — Indian English (Piper) and
// US English (Kokoro) voices read sentences that must come back as text. Also: hint box spelling, .srt/.vtt, stop.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const S = (n) => new URL(`../fixtures/speech/${n}`, import.meta.url).pathname;
const norm = (t) => t.toLowerCase().replace(/\bmr\b\.?/g, 'mister').replace(/\b7\b/g, 'seven').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
/** word error rate of `hyp` against `ref` (Levenshtein over words) */
export function wer(ref, hyp) {
  const r = norm(ref), h2 = norm(hyp), d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h2.length).fill(0)]);
  for (let j = 1; j <= h2.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h2.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h2[j - 1] ? 0 : 1));
  return d[r.length][h2.length] / r.length;
}

export default async ({ base, page: newPage, ok, info, download, tmp }) => {
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

  // 4b. a long recording: the names guide every 30 s window, not only the first. whisper.cpp keeps the prompt at the head
  // of its rolling context and pushes it out after ~224 tokens of transcript — at 83 s "Zentrixor … Amvika Raganathan"
  // came back; `carry_initial_prompt` keeps it in every window. A varied meeting (verbatim repeats make Whisper skip):
  // LibriSpeech and JFK, then ten sentences, the names and a closing sentence from our Text-to-Speech.
  const MEETING = ['Good morning everyone, and thank you for joining the quarterly planning meeting.', 'First, the warehouse in Pune finished moving its stock to the new building last week.', 'Deliveries were late on two days because a truck broke down near the highway toll plaza.', 'The finance team wants every invoice uploaded before the twentieth of each month.', 'We also hired three engineers who will start on the mobile application in January.', 'Customer complaints went down by about a third after the new help desk opened.', 'Next quarter we plan to open a small office in Bengaluru for the support staff.', 'The marketing budget stays the same, but more of it will go to online videos.', 'Please read the safety rules again, because the fire drill showed some problems.', 'Lunch will be served in the canteen on the ground floor after this meeting.', NAMES, 'The meeting ended at four, and everyone went home early because of the rain.'].join(' ');
  const mW = await speak('am_michael', MEETING);
  const b64 = (f) => readFileSync(f).toString('base64');
  const longB64 = await page.evaluate(async ([a, b, c]) => {
    const dec = async (s) => (await new OfflineAudioContext(1, 1, 16000).decodeAudioData(Uint8Array.from(atob(s), (x) => x.charCodeAt(0)).buffer)).getChannelData(0);
    const gap = new Float32Array(8000), parts = [await dec(a), gap, await dec(b), gap, await dec(c)];
    const n = parts.reduce((t, p) => t + p.length, 0), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44; for (const p of parts) for (const x of p) { v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(x * 32767))), true); o += 2; }
    let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(bin);
  }, [b64(S('librispeech-1.flac')), b64(S('jfk.flac')), b64(mW)]);
  const longFile = join(tmp, 'meeting.wav'); writeFileSync(longFile, Buffer.from(longB64, 'base64'));
  await page.getByLabel('Names and terms').fill('Zentrixa, Anvika Raghunathan');
  const lg = await transcribe(longFile, 'base');
  const named = [...(await page.locator('.stt-seg').allTextContents())].find((t) => /report to/.test(t)) || '';
  info(`a meeting of ${lg.st.split(' of audio')[0]} with the hint: "${named.trim()}" · ${lg.st}`);
  ok(/Zentrixa/.test(named) && /Anvika/.test(named) && /Raghunathan/.test(named) && /(\d:\d\d)/.test(named), `the names still guide the spelling late in a long recording ("${named.trim()}")`);
  ok(/everyone went home early/.test(lg.text) && /Good morning everyone/.test(lg.text) && /Bengaluru/.test(lg.text), 'nothing of the meeting is skipped (first, middle and closing sentences there)');
  await page.getByLabel('Names and terms').fill('');

  // 4c. a new file: the transcript of the last one goes (its downloads would carry the new name); the newest file wins
  await page.locator('input[type=file]').first().setInputFiles(S('jfk.flac'));
  await page.getByText(/jfk\.flac: 0:11/).waitFor({ timeout: 20000 });
  ok(await page.getByLabel('Transcript').isHidden(), 'a new file clears the transcript of the one before');
  await page.locator('input[type=file]').first().setInputFiles(longFile);
  await page.locator('input[type=file]').first().setInputFiles(S('librispeech-1.flac'));
  await page.getByText(/librispeech-1\.flac: 0:10/).waitFor({ timeout: 20000 }); await page.waitForTimeout(1500);
  ok(/librispeech-1\.flac/.test(await page.getByText(/transcribing takes roughly/).textContent()), 'the file chosen last stays');
  // silence: said, no transcript
  const silent = join(tmp, 'silence.wav'), sb = Buffer.alloc(44 + 16000 * 2 * 4);
  sb.write('RIFF', 0); sb.writeUInt32LE(36 + 16000 * 8, 4); sb.write('WAVEfmt ', 8); sb.writeUInt32LE(16, 16); sb.writeUInt16LE(1, 20); sb.writeUInt16LE(1, 22); sb.writeUInt32LE(16000, 24); sb.writeUInt32LE(32000, 28); sb.writeUInt16LE(2, 32); sb.writeUInt16LE(16, 34); sb.write('data', 36); sb.writeUInt32LE(16000 * 8, 40);
  writeFileSync(silent, sb);
  const sl = await transcribe(silent, 'base');
  ok(/no speech was found/.test(sl.st) && await page.getByLabel('Transcript').isHidden(), `four seconds of silence: "${sl.st}"`);
  // a long hint is pointed out
  await page.getByLabel('Names and terms').fill(Array.from({ length: 80 }, (_, i) => `Name${i}`).join(', '));
  ok(await page.getByText(/80 words: Whisper reads only about the last/).isVisible(), 'a hint of 80 names says that only the end of it is read');
  await page.getByLabel('Names and terms').fill('');

  // 4d. the model download: a server that announces fewer bytes than it sends (compression) — the buffer grows (it was
  // written past its end); a connection that drops — said in words. A fresh worker each time (leave the tab and come back).
  await page.goto(`${base}#/`); await page.goto(`${base}#/stt`);
  await page.route('**/ggml-base.en-q5_1.bin', (r) => r.request().method() === 'HEAD' ? r.fulfill({ status: 200, headers: { 'content-length': '1000' }, body: '' }) : r.continue());
  const sm = await transcribe(S('jfk.flac'), 'base');
  ok(wer(JFK, sm.text) === 0, `a model larger than announced is still read whole (JFK word for word: "${sm.text}")`);
  await page.unroute('**/ggml-base.en-q5_1.bin');
  await page.goto(`${base}#/`); await page.goto(`${base}#/stt`);
  await page.route('**/ggml-base.en-q5_1.bin', (r) => r.request().method() === 'HEAD' ? r.continue() : r.abort('connectionreset'));
  await page.locator('input[type=file]').first().setInputFiles(S('jfk.flac'));
  await page.getByText(/transcribing takes roughly/).waitFor({ timeout: 20000 });
  await page.getByRole('radio', { name: /Fast/ }).click();
  await page.locator('.actions').getByRole('button', { name: 'Transcribe' }).click();
  await page.getByText(/Could not download the fast English model \(60 MB\) — check the connection/).first().waitFor({ timeout: 30000 }).catch(() => {});
  ok(await page.getByText(/Could not download the fast English model \(60 MB\) — check the connection/).first().isVisible(), 'a dropped download is said in words');
  await page.unroute('**/ggml-base.en-q5_1.bin');

  // 5. stop
  await page.getByRole('radio', { name: /Accurate/ }).click();
  await page.locator('.actions').getByRole('button', { name: 'Transcribe' }).click();
  await page.waitForTimeout(1500);
  await page.locator('.actions').getByRole('button', { name: 'Stop' }).click();
  ok(await page.getByText('Stopped.').isVisible() && await page.locator('.actions').getByRole('button', { name: 'Transcribe' }).isVisible(), 'stop ends the job');
  ok(!page.errors.length && !tts.errors.length, `no page errors ${[...page.errors, ...tts.errors].slice(0, 3).join(' | ')}`);
};
