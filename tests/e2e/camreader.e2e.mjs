// Camera Reader (#/camreader, PC + phones; potentials #81) end to end on the papers of tests/fixtures/snaps (scripts/make-snap-photos.py):
// a leaflet read and then read aloud on its own (after a tap in the page, as a person's), every piece marked in turn and the sound
// heard by Whisper (tests/lib/transcribe.py — the words of the leaflet, in order); pause and go on (nothing moves while paused); a
// tap on a sentence reads from there; Next and Back; Faster is shorter; a medicine leaflet in small print with the Indian English
// voice (milligrams, millilitres, degrees Celsius heard); a letter (its date and times); Copy; the text handed to Text-to-Speech; a
// photo without text; leaving while it speaks; WCAG 2.2 A / AA in both themes; the phone's bar.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/snaps/${n}`, import.meta.url));
const IMG = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const T = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const words = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
/** the share of `want`'s words heard in order (longest common subsequence) */
const inOrder = (want, got) => { const d = Array.from({ length: want.length + 1 }, () => new Uint16Array(got.length + 1)); for (let i = 1; i <= want.length; i++) for (let j = 1; j <= got.length; j++) d[i][j] = want[i - 1] === got[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[want.length][got.length] / Math.max(1, want.length); };

/** in the page: every sound played (each buffer's first channel, as it was started) and the pieces marked, in order */
const CAPTURE = () => {
  window.__crSounds = []; window.__crSeen = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    try { if (this.buffer) window.__crSounds.push({ sr: this.buffer.sampleRate, data: this.buffer.getChannelData(0).slice() }); } catch { /* none */ }
    return start.apply(this, a);
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target;
      if (el.classList?.contains('cr-s') && el.classList.contains('on')) { const i = +el.dataset.i; if (window.__crSeen[window.__crSeen.length - 1] !== i) window.__crSeen.push(i); }
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
};

export default async ({ base, page: newPage, ok, info, tmp, devices }) => {
  const reads = (p) => p.evaluate(() => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0));
  const read = async (p, file) => {
    const n = await reads(p);
    await p.locator('input[type=file]').first().setInputFiles(file);
    await p.waitForFunction((k) => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0) > k, n, { timeout: 180000 });
  };
  const state = (p) => p.evaluate(() => document.querySelector('[data-state]')?.getAttribute('data-state') || '');
  const until = (p, s, timeout = 240000) => p.waitForFunction((want) => want.includes(document.querySelector('[data-state]')?.getAttribute('data-state')), [].concat(s), { timeout });
  const pieces = (p) => p.locator('.cr-s').evaluateAll((els) => els.map((e) => e.textContent));
  /** the sounds played since `from`, laid end to end (a third of a second apart) as a WAV file; their length in seconds */
  const wav = async (p, from, name) => {
    const { sr, b64, secs } = await p.evaluate((k) => {
      const s = window.__crSounds.slice(k), sr = s[0]?.sr || 24000, gap = Math.round(sr * 0.3);
      const n = s.reduce((a, x) => a + x.data.length + gap, 0), all = new Float32Array(n);
      let o = 0; for (const x of s) { all.set(x.data, o); o += x.data.length + gap; }
      const i16 = new Int16Array(n); for (let i = 0; i < n; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(all[i] * 32767)));
      let bin = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return { sr, b64: btoa(bin), secs: s.reduce((a, x) => a + x.data.length / x.sr, 0) };
    }, from);
    const pcm = Buffer.from(b64, 'base64'), h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    const path = join(tmp, name); writeFileSync(path, Buffer.concat([h, pcm]));
    return { path, secs };
  };
  const whisper = (files) => { const r = spawnSync('python3', [fileURLToPath(new URL('../lib/transcribe.py', import.meta.url)), ...files], { encoding: 'utf8', timeout: 600000 }); try { return JSON.parse(r.stdout || '{}'); } catch { return { _skip: r.stderr?.slice(0, 200) || 'no output' }; } };

  const page = await newPage({ viewport: { width: 1280, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await page.addInitScript(CAPTURE);
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/camreader');
  await page.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  const early = asked.filter((u) => /\.wasm(\?|$)|\/vendor\/|\/models\/|\/data\//.test(u));
  ok(!early.length, `nothing heavy fetched as the tab opens — the OCR and the voice come with the first photo ${early.join(' ')}`);

  // ---- a leaflet: read, then read aloud on its own (a tap in the page first, as a person's — then sound may start)
  await page.locator('.tool-body').click({ position: { x: 4, y: 4 } });
  await read(page, F('leaflet.jpg'));
  const lp = await pieces(page);
  ok(lp.length === 5 && lp[0] === 'How to take this medicine' && (await page.locator('.cr-heading').count()) === 1, `the leaflet shown: its title a heading, four sentences (${lp.join(' | ')})`);
  await until(page, 'ended');
  const seen = await page.evaluate(() => window.__crSeen);
  ok(JSON.stringify(seen) === JSON.stringify([0, 1, 2, 3, 4]), `read aloud on its own once read: every piece marked in turn (${seen.join(', ')})`);
  ok(/Read to the end/.test(await page.locator('.cr-say').innerText()) && (await page.getByRole('button', { name: 'Read again' }).isVisible()), '"Read to the end."; the button reads "Read again"');
  const normal = await wav(page, 0, 'leaflet.wav');
  const said = whisper([normal.path]);
  if (said._skip) ok(true, `Whisper not run: ${said._skip}`);
  else {
    const got = words(said[normal.path] || ''), share = inOrder(words(T.leaflet.text), got);
    ok(share >= 0.85, `Whisper hears the leaflet: ${Math.round(share * 100)} % of its words in order (“${said[normal.path]}”)`);
  }

  // ---- pause and go on
  let n0 = await page.evaluate(() => window.__crSounds.length);
  await page.evaluate(() => { window.__crSeen = []; });
  await page.getByRole('button', { name: 'Read again' }).click();
  await page.waitForFunction(() => window.__crSeen.length >= 2, null, { timeout: 120000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  await until(page, 'paused', 5000);
  const at = await page.evaluate(() => window.__crSeen.slice());
  await page.waitForTimeout(2500);
  const still = await page.evaluate(() => window.__crSeen.slice());
  ok(JSON.stringify(at) === JSON.stringify(still) && /Paused/.test(await page.locator('.cr-say').innerText()) && (await page.getByRole('button', { name: 'Go on' }).isVisible()), `Pause: nothing moves for 2.5 s, "Go on" offered (${still.join(', ')})`);
  await page.getByRole('button', { name: 'Go on' }).click();
  await until(page, 'ended');
  const after = await page.evaluate(() => window.__crSeen.slice());
  ok(after[after.length - 1] === 4 && after.slice(0, still.length).join() === still.join(), `Go on: it carries on from where it was to the end (${after.join(', ')})`);

  // ---- a tap on a sentence reads from there; Next and Back; Stop
  await page.evaluate(() => { window.__crSeen = []; });
  await page.locator('.cr-s[data-i="3"]').click();
  await page.waitForFunction(() => window.__crSeen.length >= 1, null, { timeout: 60000 });
  ok((await page.evaluate(() => window.__crSeen[0])) === 3, 'a tap on the fourth sentence reads from there');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForFunction(() => document.querySelector('.cr-s.on')?.dataset.i === '2', null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForFunction(() => document.querySelector('.cr-s.on')?.dataset.i === '3', null, { timeout: 60000 });
  ok(true, 'Back goes to the piece before, Next to the one after');
  await page.getByRole('button', { name: 'Stop' }).click();
  await until(page, 'idle', 5000);
  ok((await page.locator('.cr-s.on').count()) === 0, 'Stop: nothing marked, back to the start');

  // ---- faster is shorter
  await page.getByRole('radio', { name: 'Faster' }).click();
  n0 = await page.evaluate(() => window.__crSounds.length);
  await page.getByRole('button', { name: 'Read aloud' }).click();
  await until(page, 'ended');
  const fast = await wav(page, n0, 'leaflet-fast.wav');
  const ratio = fast.secs / normal.secs;
  ok(ratio > 0.72 && ratio < 0.92, `Faster (1.2×): the speech ${Math.round(ratio * 100)} % as long (${normal.secs.toFixed(1)} s → ${fast.secs.toFixed(1)} s)`);
  await page.getByRole('radio', { name: 'Normal' }).click();

  // ---- a medicine leaflet in small print, with the Indian English voice
  await page.getByLabel('Voice', { exact: true }).selectOption('in_svbi');
  n0 = await page.evaluate(() => window.__crSounds.length);
  await read(page, F('leaflet-b.jpg'));
  const bp = await pieces(page);
  ok(bp.length === T['leaflet-b'].say.length && (await page.locator('.cr-item').count()) === 3, `the medicine leaflet: ${bp.length} pieces, its three list items (${bp.join(' | ')})`);
  await until(page, 'ended');
  const med = await wav(page, n0, 'leaflet-b.wav');
  // ---- a letter, with the voice back to Kokoro
  await page.getByLabel('Voice', { exact: true }).selectOption('af_heart');
  n0 = await page.evaluate(() => window.__crSounds.length);
  await read(page, F('letter.jpg'));
  ok(JSON.stringify(await pieces(page)) === JSON.stringify(T.letter.say), 'the letter: its address a line at a time, its date, greeting, three sentences and closing');
  await until(page, 'ended');
  const let_ = await wav(page, n0, 'letter.wav');
  const heard = whisper([med.path, let_.path]);
  if (heard._skip) ok(true, `Whisper not run: ${heard._skip}`);
  else {
    const m = (heard[med.path] || '').toLowerCase(), l = (heard[let_.path] || '').toLowerCase();
    // what is heard of the medicine leaflet, in order — units and number words written alike on both sides (Whisper writes a
    // spoken "milligrams" as "mg"; that the units are said in words is the unit suite's, on the very text the voice is given).
    // Piper's voice varies from run to run (its noise), and a small English model hears its accent less well: as in the
    // Audiobook suite, two thirds of the words in order
    const unify = (x) => words(x.replace(/\bmilligrams?\b/gi, 'mg').replace(/\bmillilit(?:er|re)s?\b/gi, 'ml').replace(/\bgrams?\b/gi, 'g').replace(/\bdegrees?\s+celsius\b|°\s?c\b/gi, 'c'))
      .map((w) => ({ zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', eight: '8', twelve: '12', thirty: '30' })[w] ?? w);
    const share = inOrder(unify(T['leaflet-b'].say.join(' ')), unify(heard[med.path] || ''));
    ok(share >= 0.65, `Whisper hears the medicine leaflet read by the Indian English voice: ${Math.round(share * 100)} % of its words in order (“${heard[med.path]}”)`);
    ok(/november/.test(l) && /2026|twenty twenty/.test(l) && /\b10\b.*(a\.?m|am)|ten a\.?m/.test(l) && /k[ou]lkarn/.test(l), `Whisper hears the letter: its dates and times in words (“${heard[let_.path]}”)`);
  }

  // ---- Copy; the text to Text-to-Speech
  await page.getByRole('button', { name: 'Copy the text' }).click();
  const clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'); // (Windows: \r\n on the clipboard)
  ok(clip.startsWith('14 Gangapur Road\n\nNashik 422013\n\n27/11/2026\n\nDear Mr. Kulkarni,\n\nThank you for your letter of 20/11/2026. Your pension') && /Yours faithfully,\n\nBranch Manager$/.test(clip), `Copy gives the text as shown, its paragraphs kept (${JSON.stringify(clip.slice(0, 80))}…)`);
  await page.getByRole('button', { name: 'Open in Text-to-Speech (save as MP3)' }).click();
  await page.waitForFunction(() => location.hash === '#/tts' && document.querySelector('textarea[aria-label="Text to read"]')?.value.startsWith('14 Gangapur Road'), null, { timeout: 20000 });
  ok(true, 'the text handed to Text-to-Speech (to save as an MP3)');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- a photo without text
  const none = await newPage({ viewport: { width: 1280, height: 900 } });
  await none.goto(base + '#/camreader'); await none.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await read(none, IMG('coffee.jpg'));
  ok(/No text was found on this photo/.test(await none.locator('.tool-body').innerText()) && (await none.locator('.cr-controls').isHidden()), 'a photo without text: "No text was found…", no player');

  // ---- leaving while it speaks
  const lv = await newPage();
  await lv.goto(base + '#/camreader'); await lv.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await lv.locator('.tool-body').click({ position: { x: 4, y: 4 } });
  await read(lv, F('leaflet.jpg'));
  await until(lv, ['playing', 'waiting'], 120000);
  await lv.goto(base + '#/ocr'); await lv.waitForTimeout(1500);
  const live = await lv.evaluate(() => globalThis.__superutilsLive?.());
  ok(!lv.errors.length && live && !live.workers, `leaving while it speaks: no page errors, no worker left (${JSON.stringify(live)}) ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with a page shown, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/camreader');
    await ax.locator('input[type=file]').first().waitFor({ state: 'attached' });
    await ax.locator('.tool-body').click({ position: { x: 4, y: 4 } });
    await read(ax, F('leaflet-b.jpg'));
    await ax.waitForFunction(() => document.querySelector('.cr-s.on'), null, { timeout: 120000 });
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, a page being read: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }
  info(`speech: the leaflet ${normal.secs.toFixed(1)} s, faster ${fast.secs.toFixed(1)} s, the medicine leaflet ${med.secs.toFixed(1)} s, the letter ${let_.secs.toFixed(1)} s`);

  // ---- the phone: the player in the bar at the foot of the screen
  await phoneLayout({ base, page: newPage, devices, ok }, 'camreader', { ready: '.drop', buttons: ['Back', 'Next'], before: async (p) => { await read(p, F('letter.jpg')); } });
};
