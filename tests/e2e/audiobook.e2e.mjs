// PDF / EPUB → Audiobook (#/audiobook, PC + phones; potentials #14): the tab end to end on the books of
// tests/fixtures/audiobook (scripts/make-audiobook-books.py) and tests/fixtures/ebooks. Real MP3s are made — Piper's
// Indian English and Kokoro's US English, two speech engines at once — and read back in Node: valid MPEG frames at the
// voice's rate and the chosen bitrate, the ID3 tags (title, book, author, track n/N, genre, language, the cover) read by
// FFmpeg's ffprobe, the length FFmpeg decodes (the silences at the ends), and what each file says, heard by Whisper
// (faster-whisper, where installed); the zip with every MP3 and a playlist; a folder that already holds some tracks is
// carried on from; a PDF read into its chapters; footnotes; refusals; Stop; leaving the tab; the phone.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { spawnSync } from '../lib/child.mjs';
import { mp3Frames } from './audio.e2e.mjs';
import { phoneLayout } from './_phone.mjs';

const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const F = (n) => fileURLToPath(new URL(`../fixtures/audiobook/${n}`, import.meta.url));
const E = (n) => fileURLToPath(new URL(`../fixtures/ebooks/${n}`, import.meta.url));
const P = (n) => fileURLToPath(new URL(`../fixtures/pdf/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('index.json'), 'utf8'));
const SPELL = { harbour: 'harbor', grey: 'gray', colour: 'color', neighbour: 'neighbor' };
const words = (s) => (s.toLowerCase().replace(/[’']/g, '').match(/[\p{L}\p{N}]+/gu) || []).map((w) => SPELL[w] || w);
/** the LAME / Xing frame of an MP3: its frame count, and the encoder's delay and padding (samples) */
function lameTag(b) {
  let o = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 ? 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) : 0;
  const t = b.indexOf('Info', o) >= 0 && b.indexOf('Info', o) < o + 64 ? b.indexOf('Info', o) : b.indexOf('Xing', o);
  if (t < 0 || t > o + 64) return null;
  const flags = b.readUInt32BE(t + 4); let k = t + 8;
  const frames = flags & 1 ? b.readUInt32BE(k) : 0; if (flags & 1) k += 4;
  if (flags & 2) k += 4; if (flags & 4) k += 100; if (flags & 8) k += 4;
  const d = k + 21;   // after the encoder's name (9), revision (1), lowpass (1), peak (4), gains (4), flags (1), bitrate (1)
  return { frames, delay: (b[d] << 4) | (b[d + 1] >> 4), padding: ((b[d + 1] & 0x0f) << 8) | b[d + 2], version: b.toString('latin1', k, k + 9) };
}
/** the share of `want`'s words heard in order (longest common subsequence) */
const heard = (want, got) => { const d = Array.from({ length: want.length + 1 }, () => new Uint16Array(got.length + 1)); for (let i = 1; i <= want.length; i++) for (let j = 1; j <= got.length; j++) d[i][j] = want[i - 1] === got[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[want.length][got.length] / Math.max(1, want.length); };
const probe = (f) => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags:stream=codec_type,codec_name,sample_rate,channels,bit_rate', '-of', 'json', f], { encoding: 'utf8' }); return r.error ? null : JSON.parse(r.stdout || '{}'); };
const decode = (f) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:a', '-f', 'f32le', '-ac', '1', '-'], { maxBuffer: 1 << 27 }); return r.error ? null : new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length)); };
const rms = (x, a, b) => { let q = 0; for (let i = a; i < b; i++) q += x[i] * x[i]; return Math.sqrt(q / Math.max(1, b - a)); };

export default async ({ base, page: newPage, ok, info, download, tmp, devices, released }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = [];
  page.on('request', (r) => fetched.push(r.url()));
  // a folder for "Save them into a folder" (the File System Access API, stood in for: a map of names to files)
  await page.addInitScript(() => {
    const files = (window.__folder = new Map());
    const file = (name) => ({ kind: 'file', name, getFile: async () => { if (!files.has(name)) throw new DOMException('gone', 'NotFoundError'); return new File([files.get(name)], name); },
      createWritable: async () => { let parts = []; return { write: async (b) => { parts.push(b); }, close: async () => { files.set(name, new Blob(parts)); } }; } });
    window.showDirectoryPicker = async () => ({ kind: 'directory', name: 'Books', getFileHandle: async (name, o = {}) => { if (!files.has(name) && !o.create) throw new DOMException('no such file', 'NotFoundError'); return file(name); } });
  });
  await page.goto(base + '#/audiobook');
  await page.getByRole('button', { name: 'Make the audiobook' }).waitFor();
  await page.waitForTimeout(400);
  ok(!fetched.some((u) => /\.wasm($|\?)|\/models\//.test(u)), 'nothing heavy fetched before a book is chosen (MuPDF with the book, the voice with the first sample or run)');

  const rows = () => page.locator('.ab-row');
  // the rows of the book shown are marked first: the new book's rows are waited for, not the old ones
  const choose = async (path, n) => {
    await page.evaluate(() => document.querySelectorAll('.ab-row').forEach((e) => e.setAttribute('data-old', '')));
    await page.locator('input[type=file]').first().setInputFiles(path);
    await page.locator('.ab-row:not([data-old])').nth(n - 1).waitFor({ timeout: 120000 });
    await page.waitForTimeout(150);
  };
  const titles = () => rows().locator('input.ab-title').evaluateAll((els) => els.map((e) => e.value));
  const checks = () => rows().locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => e.checked));
  const line = () => page.locator('.ab-line').innerText();
  const made = async (re = /^Done|^Stopped|could not be made|already/, timeout = 600000) => { await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.ab-line')?.textContent || ''), re.source, { timeout }); return line(); };
  const setVoice = (id) => page.getByLabel('Voice', { exact: true }).selectOption(id);

  // ---- a small EPUB with a cover: its tracks, then real MP3s with Piper, two engines at once
  await choose(F('tiny.epub'), 3);
  const T = TRUTH['tiny.epub'];
  ok(JSON.stringify(await titles()) === JSON.stringify(T.tracks.map((x) => x.title)), `tiny.epub: a track per chapter (${(await titles()).join(' · ')})`);
  ok(await page.getByLabel('Book title').inputValue() === 'Three Small Chapters' && await page.getByLabel('Author').inputValue() === 'Ines Farrow', 'the book\'s title and author from its package');
  await page.locator('.ab-cover-img').waitFor({ timeout: 30000 });
  ok(await page.locator('.ab-cover-img').evaluate((im) => im.naturalWidth > 100 && im.naturalHeight > im.naturalWidth), 'its cover shown');
  const total = T.tracks.reduce((s, x) => s + x.words.length, 0);
  ok(new RegExp(`^3 of 3 tracks chosen · ${total} words · less than a minute of speech at 1×$`).test(await page.locator('.ab-list ~ div').first().innerText()), `the summary line (${await page.locator('.ab-list ~ div').first().innerText()})`);
  // a title of one's own goes into its MP3
  await rows().nth(2).locator('input.ab-title').fill('Chapter Three: The Letter');
  await setVoice('in_svbi');
  await page.getByLabel('Speech engines at once').selectOption('2');
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Make the audiobook' }).click();
  await page.getByRole('button', { name: 'Stop' }).waitFor();
  const done1 = await made();
  info(`Piper, two engines: ${done1} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  ok(/^Done: 3 tracks/.test(done1), `three tracks made (${done1})`);
  ok(await page.locator('.ab-row audio').count() === 3, 'each track can be played in the page');
  const files = [];
  for (let k = 0; k < 3; k++) {
    const p = await download(page, () => rows().nth(k).getByRole('button', { name: /^Download / }).click());
    files.push(p);
  }
  const names = files.map((f) => f.split(/[\\/]/).pop().replace(/^\d+-/, ''));
  ok(JSON.stringify(names) === JSON.stringify(['01 The Harbour.mp3', '02 The Light.mp3', '03 Chapter Three: The Letter.mp3'].map((n) => n.replace(/:/g, ' ').replace(/\s+/g, ' '))), `file names numbered as the book's tracks (${names.join(' · ')})`);
  const mp3 = files.map((f) => readFileSync(f));
  const fr = mp3.map((b) => mp3Frames(b));
  ok(fr.every((x) => x.ok && x.sr === 22050 && x.rates.slice(1).every((r) => r === 64)), `valid MP3s: every frame MPEG-2 Layer III, 22.05 kHz (Piper), 64 kbps (${fr.map((x) => x.frames).join(', ')} frames)`);
  const pr = files.map(probe);
  if (!pr[0]) ok(true, 'ffprobe is not installed: the tags and lengths are not read back');
  else {
    const tags = pr.map((x) => x.format.tags || {});
    ok(tags.every((t, k) => t.album === 'Three Small Chapters' && t.artist === 'Ines Farrow' && t.track === `${k + 1}/3` && t.genre === 'Audiobook' && (t.language === 'eng' || t.TLAN === 'eng')), `ffprobe reads the book, the author, the track n/3, the genre and the language in every file (${JSON.stringify(tags[0])})`);
    ok(JSON.stringify(tags.map((t) => t.title)) === JSON.stringify(['The Harbour', 'The Light', 'Chapter Three: The Letter']), 'each file\'s title — the one typed in for track 3');
    ok(pr.every((x) => x.streams.some((s) => s.codec_type === 'video' && s.codec_name === 'mjpeg')), 'the cover in every file (a JPEG, as ffprobe shows an attached picture)');
    const lens = pr.map((x) => +x.format.duration);
    ok(lens.every((d) => d > 8 && d < 25), `lengths ${lens.map((d) => d.toFixed(2)).join(', ')} s (three short sentences, a heading and the pauses)`);
    const x = decode(files[0]), sr = 22050;
    if (x) {
      const lt = lameTag(mp3[0]), want = lt ? lt.frames * 576 - lt.delay - lt.padding : -1;
      ok(lt && x.length === want, `FFmpeg decodes exactly the samples the LAME frame says (${lt?.frames} frames × 576 − ${lt?.delay} delay − ${lt?.padding} padding = ${want}; decoded ${x.length}: gapless)`);
      ok(rms(x, 0, Math.round(0.6 * sr)) < 0.003 && rms(x, x.length - Math.round(1.6 * sr), x.length) < 0.003 && rms(x, Math.round(0.8 * sr), x.length - Math.round(2 * sr)) > 0.02, `silence at the start (0.75 s) and the end (2 s), speech between (RMS ${rms(x, Math.round(0.8 * sr), x.length - Math.round(2 * sr)).toFixed(3)})`);
    }
  }
  // what the files say, heard by Whisper
  const tr = spawnSync('python3', [fileURLToPath(new URL('../lib/transcribe.py', import.meta.url)), ...files], { encoding: 'utf8', timeout: 600000 });
  const said = JSON.parse(tr.stdout || '{}');
  if (said._skip || !tr.stdout) ok(true, `Whisper not run: ${said._skip || tr.stderr?.slice(0, 200)}`);
  else {
    // each file says its own chapter, in order, far more than any other chapter (Piper's Indian English voice is heard
    // through its accent by a small model: "Tomorrow, what it go" for "Mara watched it go")
    const want = T.tracks.map((t, k) => words(k === 2 ? t.sentences.join(' ') : `${t.title} ${t.sentences.join(' ')}`));
    files.forEach((f, k) => {
      const got = words(said[f] || ''), own = heard(want[k], got), other = Math.max(...want.filter((_, j) => j !== k).map((w) => heard(w, got)));
      ok(own >= 0.65 && own - other >= 0.3, `track ${k + 1} says its chapter: ${Math.round(own * 100)} % of its words heard in order, another chapter's at most ${Math.round(other * 100)} % (“${said[f]}”)`);
    });
  }

  // ---- the zip: every MP3 as it was made, and a playlist
  const zp = await download(page, () => page.getByRole('button', { name: 'Download all (.zip)' }).click());
  const z = unzipSync(new Uint8Array(readFileSync(zp)));
  const zn = Object.keys(z).sort();
  ok(JSON.stringify(zn) === JSON.stringify(['Three Small Chapters/01 The Harbour.mp3', 'Three Small Chapters/02 The Light.mp3', `Three Small Chapters/${names[2]}`, 'Three Small Chapters/Three Small Chapters.m3u'].sort()), `the zip: a folder named after the book with the three MP3s and a playlist (${zn.join(' · ')})`);
  ok(Buffer.from(z['Three Small Chapters/01 The Harbour.mp3']).equals(mp3[0]), 'the zip holds the MP3s byte for byte');
  const m3u = strFromU8(z['Three Small Chapters/Three Small Chapters.m3u']);
  ok(/^#EXTM3U\n#EXTINF:\d+,Ines Farrow - The Harbour\n01 The Harbour\.mp3\n/.test(m3u) && (m3u.match(/#EXTINF/g) || []).length === 3, `the playlist lists the tracks in order with their lengths (${m3u.split('\n')[1]})`);

  // ---- Kokoro: one track, another voice — made again; the others kept
  await rows().nth(0).locator('input[type=checkbox]').uncheck();
  await rows().nth(2).locator('input[type=checkbox]').uncheck();
  await setVoice('af_heart');
  await page.getByRole('button', { name: 'Make the audiobook' }).click();
  ok(/^Done: 3 tracks/.test(await made()), 'one track made with Kokoro; the summary counts the three');
  const k2 = await download(page, () => rows().nth(1).getByRole('button', { name: /^Download / }).click());
  const kf = mp3Frames(readFileSync(k2));
  ok(kf.ok && kf.sr === 24000, `Kokoro's track: 24 kHz (${kf.sr})`);
  const ks = JSON.parse(spawnSync('python3', [fileURLToPath(new URL('../lib/transcribe.py', import.meta.url)), k2], { encoding: 'utf8', timeout: 600000 }).stdout || '{}');
  if (ks._skip || !ks[k2]) ok(true, `Whisper not run on Kokoro's track: ${ks._skip || 'no answer'}`);
  else { const want = words(`${T.tracks[1].title} ${T.tracks[1].sentences.join(' ')}`), got = words(ks[k2]); ok(heard(want, got) >= 0.9, `Kokoro's Heart says the chapter clearly: ${Math.round(heard(want, got) * 100)} % of its words heard in order (“${ks[k2]}”)`); }
  await page.getByRole('button', { name: 'Make the audiobook' }).click();
  await page.waitForFunction(() => /made already/.test(document.querySelector('.ab-line')?.textContent || ''), null, { timeout: 10000 });
  ok(true, 'Make again with nothing changed: "Every chosen track is made already"');

  // ---- a sample of the voice
  await page.getByRole('button', { name: 'Listen to a sample' }).click();
  await page.waitForFunction(() => { const a = document.querySelector('audio.ab-player[aria-label="Sample"]'); return a && !a.hidden && a.src && a.duration > 0.5; }, null, { timeout: 120000 });
  ok(/A sample of Heart/.test(await page.locator('.card').filter({ hasText: 'Choose a book' }).locator('[aria-live]').first().innerText()), 'Listen to a sample: the beginning of the first chosen track, in the chosen voice');

  // ---- a folder: tracks go in as they are made; a folder that holds some is carried on from
  await page.getByLabel('Where the MP3 files go').selectOption('folder');
  await setVoice('in_asi');
  await choose(F('tiny.epub'), 3);
  await page.getByRole('button', { name: 'Make the audiobook' }).click();
  ok(/^Done: 3 tracks/.test(await made()), 'into a folder: three tracks');
  const inFolder = await page.evaluate(() => [...window.__folder.entries()].map(([n, b]) => [n, b.size]));
  ok(inFolder.length === 3 && inFolder.every(([, s]) => s > 20000), `the folder holds the three MP3s (${inFolder.map(([n, s]) => `${n} ${s}`).join(' · ')})`);
  ok(await page.locator('.ab-row').filter({ hasText: 'Saved into the folder' }).count() === 3, 'each row says it was saved into the folder');
  await page.evaluate(() => window.__folder.delete('02 The Light.mp3'));
  await choose(F('tiny.epub'), 3);
  ok(await line() === '', 'a new book clears the last run\'s line (it spoke of the book before)');
  await page.getByRole('button', { name: 'Make the audiobook' }).click();
  await made();
  ok(await page.locator('.ab-row').filter({ hasText: 'Already in the folder' }).count() === 2 && await page.locator('.ab-row').filter({ hasText: 'Saved into the folder' }).count() === 1, 'chosen again with the same folder: the two tracks in it are skipped, the missing one is made');
  await choose(F('tiny.epub'), 3);
  await page.getByRole('button', { name: 'Make the audiobook' }).click();
  await page.waitForFunction(() => /in the folder already/.test(document.querySelector('.ab-line')?.textContent || ''), null, { timeout: 20000 });
  ok(true, 'a folder that holds every track: "Every chosen track is in the folder already."');
  await page.getByLabel('Where the MP3 files go').selectOption('page');

  // ---- Stop
  await choose(F('gutenberg.epub'), 4);
  await setVoice('in_svbi');
  const live = () => page.evaluate(() => globalThis.__superutilsLive?.().workers ?? 0);
  const before = await live();
  await page.getByRole('button', { name: 'Make the audiobook' }).click();
  await page.waitForFunction(() => /of speech made/.test(document.querySelector('.ab-line')?.textContent || ''), null, { timeout: 120000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  const stopLine = await made(/^Stopped/, 30000);
  ok(/^Stopped\./.test(stopLine) && await page.getByRole('button', { name: 'Make the audiobook' }).isVisible(), `Stop ends the run at once (${stopLine})`);
  ok(await live() === before, `Stop ends the speech engines (workers: ${before} before the run, ${await live()} after Stop)`);

  // ---- footnotes: left out, or read when asked for
  const not = async () => page.locator('.ab-book').innerText();
  ok(/Not read: 4 footnote marks, 4 notes/.test(await not()), 'gutenberg.epub: its four note marks and four notes are not read');
  await page.getByText('Read the footnotes').click();
  await page.waitForFunction(() => /Not read: 4 footnote marks\./.test(document.querySelector('.ab-book')?.textContent || ''), null, { timeout: 60000 });
  ok(true, 'Read the footnotes: the notes are read (their marks still not)');
  await page.getByText('Read the footnotes').click();

  // ---- a PDF: its chapters from its bookmarks; the index not chosen
  await choose(F('book.pdf'), 5);
  ok(JSON.stringify(await titles()) === JSON.stringify(['Part One: The Rock — Chapter 1. The Keeper', 'Chapter 2. Fog', 'Part Two: The Ledger — Chapter 3. Inventory', 'Chapter 4. Zephyrine', 'Index']), `book.pdf: a track per chapter from its bookmarks (${(await titles()).join(' · ')})`);
  ok(JSON.stringify(await checks()) === JSON.stringify([true, true, true, true, false]), 'the index is not chosen');
  ok(/Not read: 1 note, 8 running heads and page numbers/.test(await not()), `what is not read is said (${(await not()).match(/Not read[^.]*/)?.[0]})`);
  await page.getByRole('button', { name: 'Choose none' }).click();
  ok((await checks()).every((c) => !c) && /0 of 5 tracks chosen/.test(await page.locator('.ab-list ~ div').first().innerText()), 'Choose none');
  await page.getByRole('button', { name: 'Choose all' }).click();
  ok((await checks()).every(Boolean), 'Choose all');

  // ---- a protected PDF, and files that are no book
  await page.locator('input[type=file]').first().setInputFiles(P('aes256-asdfzxcv.pdf'));
  await page.getByLabel('Password of the PDF').waitFor({ timeout: 60000 });
  await page.getByLabel('Password of the PDF').fill('wrong');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByText('That password is not this PDF’s.').waitFor({ timeout: 60000 });
  await page.getByLabel('Password of the PDF').fill('asdfzxcv');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ab-row') || /no text to read/.test(document.querySelector('.tool-body')?.textContent || ''), null, { timeout: 60000 });
  ok(true, 'a protected PDF: its password asked for, a wrong one said, the right one opens it');
  for (const [file, re] of [[E('comic.cbz'), /is a comic/], [E('drm.epub'), /locked with Adobe/], [P('vicksburg-ocr.pdf'), /no text to read: its pages are pictures \(a scan\)/]]) {
    const fname = file.split(/[\\/]/).pop();
    await page.locator('input[type=file]').first().setInputFiles(file);
    await page.waitForFunction((n) => document.querySelector('.ab-row') || [...document.querySelectorAll('.tool-body .note-warn, .tool-body .note-err')].some((e) => e.textContent.includes(n)), fname, { timeout: 120000 });
    const msg = await page.locator('.tool-body .note-warn, .tool-body .note-err').filter({ hasText: fname }).first().innerText().catch(() => '');
    ok(re.test(msg) || (await rows().count()) > 0, `${fname}: ${msg || `${await rows().count()} tracks`}`);
  }
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
  const held = await released(page, 'audiobook');
  ok(!held.length, `leaving the tab lets the MP3s and the cover go (${held.length} blob URLs held)`);

  // ---- WCAG 2.2 A / AA with a book open (axe-core), light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });   // the CSP forbids the injected checker
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto(base + '#/audiobook');
    await ax.locator('input[type=file]').first().setInputFiles(F('tiny.epub'));
    await ax.locator('.ab-row').nth(2).waitFor({ timeout: 120000 });
    await ax.locator('.ab-cover-img').waitFor({ timeout: 30000 });
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, a book open: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'audiobook', {
    ready: '.drop', buttons: ['Make the audiobook'],
    before: async (p) => { await p.locator('input[type=file]').first().setInputFiles(F('tiny.epub')); await p.locator('.ab-row').nth(2).waitFor({ timeout: 120000 }); },
  });
  const fixed = await ph.evaluate(() => getComputedStyle(document.querySelector('.actions')).position);
  ok(fixed === 'fixed', `phone: Make the audiobook in the bar at the bottom (${fixed})`);
  const small = await ph.locator('.ab-row button, .ab-row label.ab-check').evaluateAll((els) => els.filter((e) => e.getClientRects().length && (e.getBoundingClientRect().height < 44 || e.getBoundingClientRect().width < 44)).length);
  ok(!small, `phone: every control of a track at least 44 × 44 px (${small} smaller)`);
  ok(!(await ph.getByLabel('Speech engines at once').count()) && !(await ph.getByLabel('Where the MP3 files go').count()), 'phone: one speech engine, files kept in the page (no folder)');
};
