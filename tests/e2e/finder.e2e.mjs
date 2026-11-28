// Screenshot Finder (potentials #76): the test pictures (scripts/make-finder-shots.py — a phone's screenshots of chats, light
// and dark, a bank's SMS, an order e-mail, the phone's settings, a payment; a PC's screenshot; photos of a circular and a bill;
// a photo without text; an iPhone's HEIC) read in the browser by the tab's pool of readers, then searched: every query of
// truth.json finds its pictures in the order the tab promises, every word that must be found is found in its picture, and
// the words found are marked on the picture where the generator drew them (truth.json's boxes, not the tab's own reading).
// The viewer (the picture large, its text copied, the picture saved byte for byte), all the text saved, Stop and Go on,
// pictures chosen twice, a file that is no picture and one that cannot be opened, a folder (File System Access, the
// webkitdirectory input, a folder dropped), the readers ended and the thumbnails let go when the tab is left, the phone (one
// reader, no folder button, 44 px), WCAG 2.2 in both themes with results and with the viewer open; nothing fetched at open.
import { readFileSync, readdirSync, mkdtempSync, copyFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { phoneLayout } from './_phone.mjs';

const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const DIR = fileURLToPath(new URL('../fixtures/finder/', import.meta.url));
const F = (n) => join(DIR, n);
const truth = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const ALL = readdirSync(DIR).filter((f) => /\.(png|jpe?g|heic)$/i.test(f));
const norm = (s) => s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
/** at most one edit apart (the OCR's slip: "KT7mq2Vrow" for kT7mq2Vr9w) */
const near = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
};
/** the word marked is the word looked for: the same, within it ("Rs.2,032.71" for 2,032.71) or one slip of the OCR away */
const isWord = (marked, w) => { const a = norm(marked), b = norm(w); return a.includes(b) || near(a, b); };

/** Tesseract's workers counted as they are made and ended (Tesseract.js makes its own Worker objects) */
const countWorkers = () => {
  const W = window.Worker; window.__tw = { made: 0, live: 0 };
  window.Worker = class extends W {
    constructor(u, o) {
      super(u, o);
      if (!/tesseract/.test(String(u))) return;
      window.__tw.made++; window.__tw.live++;
      let ended = false; const end = this.terminate.bind(this);
      this.terminate = () => { if (!ended) { ended = true; window.__tw.live--; } end(); };
    }
  };
};

export default async (ctx) => {
  const { base, page: newPage, ok, download, released } = ctx;
  const page = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await page.addInitScript(countWorkers);
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })); // three readers at once
  const asked = [];
  page.on('request', (r) => { const u = r.url(); if (/tesseract|traineddata|\.wasm/.test(u)) asked.push(u.replace(/^.*\//, '')); });
  await page.goto(`${base}#/finder`);
  await page.waitForSelector('.tool-body > :not(.loading)');
  await page.waitForTimeout(400);
  ok(!asked.length, `nothing of the engines is fetched before a picture is chosen (${asked.join(', ')})`);
  ok(await page.locator('input.fi-q').count() === 1 && !(await page.locator('input.fi-q').isVisible()), 'the search waits for pictures (hidden at first)');

  const status = () => page.locator('.fi-status').textContent();
  const allRead = (p = page, n = null) => p.waitForFunction((n) => { const s = document.querySelector('.fi-status')?.textContent || ''; return /pictures? read/.test(s) && !/Reading/.test(s) && (n == null || s.startsWith(`${n} `)); }, n, { timeout: 180000 });
  const search = async (q, p = page) => {
    await p.fill('input.fi-q', q);
    await p.waitForFunction((q) => { const s = document.querySelector('.fi-summary')?.textContent || ''; return q ? /pictures? ha|No picture/.test(s) : true; }, q, { timeout: 10000 });
    await p.waitForTimeout(220); // the grid follows the summary within the same render
    return p.$$eval('.fi-item', (els) => els.map((e) => ({ name: e.querySelector('.fi-name').textContent, meta: e.querySelector('.fi-meta').textContent, marked: [...e.querySelectorAll('.fi-snip mark')].map((m) => m.textContent), marks: e.querySelectorAll('.fi-mark').length })));
  };

  // ------------------------------------------------------------------ every picture read, every query
  const t0 = Date.now();
  await page.locator('.drop input[type=file]').setInputFiles(ALL.map(F));
  await page.waitForFunction(() => /Reading: \d+ of 11/.test(document.querySelector('.fi-status')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  await allRead();
  const secs = (Date.now() - t0) / 1000;
  const st = await status();
  ok(/^11 pictures read · 1 without text\.$/.test(st), `11 pictures read, the coffee photo "without text" (${st}; ${secs.toFixed(1)} s)`);
  const tw = await page.evaluate(() => window.__tw);
  ok(tw.made === 3 && tw.live === 3, `three readers at once on a PC of 8 cores, kept for more pictures (${JSON.stringify(tw)})`);

  for (const [q, want] of [...truth.queries, ...truth.heic.queries]) {
    const got = await search(q), full = got.filter((x) => !/ of \d+ words/.test(x.meta)).map((x) => x.name);
    ok(JSON.stringify(full) === JSON.stringify(want), `"${q}" → ${want.join(', ')} (got ${full.join(', ')})`);
  }
  const words = { ...truth.words, [truth.heic.file]: truth.heic.words };
  for (const [file, ws] of Object.entries(words)) {
    const missed = [];
    for (const w of ws) { const got = await search(w); if (!got.some((x) => x.name === file && x.marked.some((m) => isWord(m, w)))) missed.push(w); }
    ok(!missed.length, `${file}: ${ws.join(', ')} found in it and marked in its line (missed: ${missed.join(', ')})`);
  }
  const none = await search('');
  ok(!none.length && /11 of 11 pictures read — type words to search them/.test(await page.locator('.fi-summary').textContent()), 'an empty search: no tiles, the count of pictures read');
  let r = await search('xyzzy plugh');
  ok(!r.length && /No picture has “xyzzy plugh”\./.test(await page.locator('.fi-summary').textContent()), 'a search that finds nothing says so');
  r = await search('pnr goa');
  ok(r.length && r.every((x) => / of 2 words/.test(x.meta) || /Boarding|Screenshot_20261102/.test(x.name)) && /No picture has all the words · \d+ ha(s|ve) some of them/.test(await page.locator('.fi-summary').textContent()), `some of the words: said as such (${r.map((x) => `${x.name} ${x.meta}`).join(' | ')})`);

  // ------------------------------------------------------------------ the marks: where the generator drew the words
  r = await search('pnr 4521 678 903');
  const tile = page.locator('.fi-item').first();
  const boxes = await tile.locator('.fi-mark').evaluateAll((els) => els.map((e) => ({ left: parseFloat(e.style.left), top: parseFloat(e.style.top), width: parseFloat(e.style.width), height: parseFloat(e.style.height) })));
  const drawn = truth.boxes['Screenshot_20261102-190712_WhatsApp.png'].filter((b) => ['PNR', '4521', '678', '903,'].includes(b[0]));
  const W0 = 720, H0 = 1600;
  const hits = drawn.map(([w, x0, y0, x1, y1]) => boxes.some((b) => { const bx0 = b.left * W0 / 100, by0 = b.top * H0 / 100, bx1 = bx0 + b.width * W0 / 100, by1 = by0 + b.height * H0 / 100; const ix = Math.min(x1, bx1) - Math.max(x0, bx0), iy = Math.min(y1, by1) - Math.max(y0, by0); return ix > 0.8 * (x1 - x0) && iy > 0.6 * (y1 - y0) && bx1 - bx0 < 1.6 * (x1 - x0) + 12; }) && w);
  ok(boxes.length === 4 && hits.every(Boolean), `the four words marked on the thumbnail where they were drawn (${hits.join(', ')}; ${boxes.length} marks)`);
  ok(r[0].marked.join(' ') === 'PNR 4521 678 903,', `the line under the thumbnail marks the words found (${r[0].marked.join(' ')})`);
  const view = await page.evaluate(() => { const t = document.querySelector('.fi-item .fi-thumb'), m = t.querySelector('.fi-mark'); const a = t.getBoundingClientRect(), b = m.getBoundingClientRect(); return b.top >= a.top && b.bottom <= a.bottom; });
  ok(view, 'a tall screenshot\'s thumbnail shows the part with the words found');

  // ------------------------------------------------------------------ the viewer
  await tile.locator('.fi-open').click();
  const dlg = page.locator('.fi-dlg[open]');
  await dlg.waitFor();
  ok(await dlg.locator('h2').textContent() === 'Screenshot_20261102-190712_WhatsApp.png', 'the picture opens large, named');
  ok(await page.evaluate(() => { const i = document.querySelector('.fi-dlg .fi-big-img'); return i.complete && i.naturalWidth === 720; }), 'the picture itself, at its own size');
  ok(await dlg.locator('.fi-mark').count() === 4, 'the words found marked on it');
  ok(/2 Nov 2026, 7:07|2 Nov 2026, 19:07|Nov 2, 2026, 7:07/.test(await dlg.locator('.fi-dlg-side p').first().textContent()), `when it was taken, from its name (${await dlg.locator('.fi-dlg-side p').first().textContent()})`);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await dlg.getByRole('button', { name: 'Copy the text' }).click();
  let clip = '';
  for (let i = 0; i < 4 && !/PNR 4521 678 903/.test(clip); i++) { await page.waitForTimeout(300); clip = await page.evaluate(() => navigator.clipboard.readText()); }
  ok(/Booked\. PNR 4521 678 903, coach B2,/.test(clip) && /Hill View Residency/.test(clip), `Copy the text: what was read in it (${clip.slice(0, 80).replace(/\n/g, ' / ')}…)`);
  const saved = await download(page, () => dlg.getByRole('button', { name: 'Save the picture' }).click());
  ok(readFileSync(saved).equals(readFileSync(F('Screenshot_20261102-190712_WhatsApp.png'))), 'Save the picture: the file itself, byte for byte');
  await page.keyboard.press('Escape');
  ok(await page.waitForFunction(() => !document.querySelector('.fi-dlg'), null, { timeout: 5000 }).then(() => true, () => false), 'Escape closes it (and the picture is let go)');
  // the HEIC: shown as a JPEG of it (the browser cannot show HEIC itself)
  await search('boarding pass');
  await page.locator('.fi-item .fi-open').first().click();
  await page.locator('.fi-dlg[open]').waitFor();
  ok(await page.waitForFunction(() => { const i = document.querySelector('.fi-dlg .fi-big-img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 }).then(() => true, () => false), 'an iPhone\'s HEIC opens large (a JPEG made of it)');
  await page.getByRole('button', { name: 'Close' }).click();

  // ------------------------------------------------------------------ all the text, chosen twice, no picture, broken
  const txt = readFileSync(await download(page, () => page.getByRole('button', { name: 'Save all the text (.txt)' }).click()), 'utf8');
  ok(ALL.every((f) => txt.includes(`=== ${f}`)) && /PNR 4521 678 903/.test(txt) && /\r\n/.test(txt) && !/[^\r]\n/.test(txt), `Save all the text: every picture's name and text, CRLF (${txt.length} characters)`);
  await page.locator('.drop input[type=file]').setInputFiles([F('Screenshot_20261101-120001_Mail.png')]);
  ok(await status() === 'Those pictures are here already.', 'a picture chosen again: said, not read twice');
  const tmp = mkdtempSync(join(tmpdir(), 'finder-'));
  writeFileSync(join(tmp, 'notes.txt'), 'not a picture');
  writeFileSync(join(tmp, 'broken.png'), Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 73) % 251)));
  await page.locator('.drop input[type=file]').setInputFiles([join(tmp, 'notes.txt')]);
  ok(await status() === 'Those are no pictures.', 'a file that is no picture: said');
  await page.locator('.drop input[type=file]').setInputFiles([join(tmp, 'broken.png')]);
  await allRead(page, 12);
  ok(/12 pictures read · 1 without text · 1 could not be opened\./.test(await status()) && /broken\.png — this picture could not be opened/.test(await page.locator('.fi-unread').textContent()), `a picture that cannot be opened: counted and listed (${await status()})`);

  // ------------------------------------------------------------------ Start over, Stop and Go on
  await page.getByRole('button', { name: 'Start over' }).click();
  ok(await status() === 'Forgotten. Choose pictures to search again.' && !(await page.locator('input.fi-q').isVisible()), 'Start over forgets the pictures');
  ok((await page.evaluate(() => window.__tw.live)) === 0, 'Start over ends the readers');
  await page.locator('.drop input[type=file]').setInputFiles(ALL.map(F));
  await page.getByRole('button', { name: 'Stop reading' }).click();
  await page.waitForFunction(() => /^Stopped: \d+ of 11 pictures/.test(document.querySelector('.fi-status')?.textContent || ''), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const stopped = await status();
  ok(/^Stopped: \d+ of 11 pictures/.test(stopped) && await page.getByRole('button', { name: 'Go on reading' }).isVisible(), `Stop reading: the pictures read so far stay searchable (${stopped})`);
  await page.getByRole('button', { name: 'Go on reading' }).click();
  await allRead(page, 11);
  r = await search('kT7mq2Vr9w');
  ok(r.length === 1 && r[0].name === 'Screenshot_20261020-213344_WhatsApp.png', 'Go on reading reads the rest: the Wi-Fi password found in the dark chat');

  // ------------------------------------------------------------------ leaving the tab
  const before = await page.evaluate(() => window.__tw.live);
  const kept = await released(page, 'finder');
  const after = await page.evaluate(() => window.__tw.live);
  ok(before === 3 && after === 0, `leaving the tab ends the readers (${before} → ${after})`);
  ok(!kept.length, `leaving the tab lets the thumbnails and pictures go (${kept.length} kept)`);
  await page.goto(`${base}#/finder`);
  await page.waitForSelector('.tool-body > :not(.loading)');
  ok(!(await page.locator('input.fi-q').isVisible()) && !(await page.locator('.fi-item').count()), 'back in the tab: nothing remembered');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.close();

  // ------------------------------------------------------------------ folders
  const folder = await newPage({ viewport: { width: 1366, height: 900 } });
  await folder.goto(`${base}#/finder`);
  await folder.waitForSelector('.tool-body > :not(.loading)');
  // File System Access: a folder, a folder inside it, a hidden file and a text file left out
  const pick = (n) => ({ name: n, b64: readFileSync(F(n)).toString('base64') });
  await folder.evaluate((files) => {
    const file = (f) => new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.name.endsWith('.png') ? 'image/png' : 'image/jpeg' });
    const dir = (name, entries) => ({ kind: 'directory', name, async *entries() { for (const e of entries) yield [e.name, e]; } });
    const fh = (f) => ({ kind: 'file', name: f.name, getFile: async () => file(f) });
    const txt = { kind: 'file', name: 'readme.txt', getFile: async () => new File(['hi'], 'readme.txt') };
    const hidden = { kind: 'file', name: '.thumbnail.png', getFile: async () => new File(['x'], '.thumbnail.png') };
    window.showDirectoryPicker = async () => dir('Screenshots', [fh(files[0]), txt, hidden, dir('Chats', [fh(files[1])])]);
  }, [pick('Screenshot_20261106-090102_Pay.png'), pick('Screenshot_20261020-213344_WhatsApp.png')]);
  await folder.getByRole('button', { name: 'Choose a folder' }).click();
  await allRead(folder, 2);
  r = await search('upi ref', folder);
  ok(r[0]?.name === 'Screenshots/Screenshot_20261106-090102_Pay.png', `a folder (File System Access): its pictures with their paths (${r.map((x) => x.name).join(', ')})`);
  r = await search('wifi password', folder);
  ok(r[0]?.name === 'Screenshots/Chats/Screenshot_20261020-213344_WhatsApp.png', `… and those of the folders inside it, the text file and the hidden file left out (${r.map((x) => x.name).join(', ')})`);
  // the webkitdirectory input (browsers without File System Access)
  await folder.evaluate(() => { window.showDirectoryPicker = undefined; });
  const dirPath = join(tmp, 'Phone');
  mkdirSync(join(dirPath, 'Camera'), { recursive: true });
  copyFileSync(F('Screenshot_20261105-081530_Messages.png'), join(dirPath, 'Screenshot_20261105-081530_Messages.png'));
  copyFileSync(F('IMG_20261201_081530.jpg'), join(dirPath, 'Camera', 'IMG_20261201_081530.jpg'));
  const chooser = folder.waitForEvent('filechooser');
  await folder.getByRole('button', { name: 'Choose a folder' }).click();
  await (await chooser).setFiles(dirPath);
  await allRead(folder, 4);
  r = await search('otp', folder);
  ok(r[0]?.name === 'Phone/Screenshot_20261105-081530_Messages.png', `a folder without File System Access (webkitdirectory) (${r.map((x) => x.name).join(', ')})`);
  r = await search('parent teacher meeting', folder);
  ok(r[0]?.name === 'Phone/Camera/IMG_20261201_081530.jpg', `… its folders too (${r.map((x) => x.name).join(', ')})`);
  // a folder dropped on the tab
  await folder.evaluate((files) => {
    const file = (f) => new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: 'image/png' });
    const fileEntry = (f) => ({ isFile: true, isDirectory: false, name: f.name, file: (ok) => ok(file(f)) });
    const dirEntry = (name, kids) => ({ isFile: false, isDirectory: true, name, createReader: () => { let done = false; return { readEntries: (ok) => { ok(done ? [] : kids); done = true; } }; } });
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { items: [{ webkitGetAsEntry: () => dirEntry('Dropped', [fileEntry(files[0]), dirEntry('Older', [fileEntry(files[1])])]) }], types: ['Files'], files: [] } });
    document.querySelector('.drop').dispatchEvent(ev);
  }, [pick('Screenshot_20261015-100203_Settings.png'), pick('Screenshot_20261101-120001_Mail.png')]);
  await allRead(folder, 6);
  r = await search('imei', folder);
  const r2 = await search('tracking id', folder);
  ok(r[0]?.name === 'Dropped/Screenshot_20261015-100203_Settings.png' && r2[0]?.name === 'Dropped/Older/Screenshot_20261101-120001_Mail.png', `a folder dropped on the tab, with the folder inside it (${r[0]?.name}, ${r2[0]?.name})`);
  ok(!folder.errors.length, `folders: no page errors ${folder.errors.join(' | ')}`);
  await folder.close();

  // ------------------------------------------------------------------ WCAG 2.2 A / AA, both themes: results, the viewer
  for (const scheme of ['light', 'dark']) {
    const ax = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await ax.goto(`${base}#/finder`);
    await ax.waitForSelector('.tool-body > :not(.loading)');
    await ax.locator('.drop input[type=file]').setInputFiles(['Screenshot_20261102-190712_WhatsApp.png', 'Screenshot 2026-11-03 at 10.12.44.png', 'IMG_20261012_073000.jpg'].map(F));
    await allRead(ax, 3);
    await search('lonavala', ax);
    await ax.addScriptTag({ content: AXE });
    const run = () => ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    let vv = await run();
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations with results ${vv.join(' | ')}`);
    await ax.locator('.fi-item .fi-open').first().click();
    await ax.locator('.fi-dlg[open]').waitFor();
    vv = await run();
    ok(!vv.length, `${scheme}: none with the viewer open ${vv.join(' | ')}`);
    await ax.close();
  }

  // ------------------------------------------------------------------ the phone
  const ph = await phoneLayout(ctx, 'finder', { ready: '.drop', before: async (p) => {
    await p.addInitScript(countWorkers);
    await p.reload(); await p.waitForSelector('.tool-body > :not(.loading)');
    await p.locator('.drop input[type=file]').setInputFiles(['Screenshot_20261102-190712_WhatsApp.png', 'Screenshot_20261106-090102_Pay.png', 'IMG_20261127_213012.jpg'].map(F));
    await allRead(p, 3);
    await search('spice garden', p);
  } });
  ok(await ph.getByRole('button', { name: 'Choose a folder' }).count() === 0, 'phone: no folder button (a phone\'s picker chooses many pictures)');
  ok((await ph.evaluate(() => window.__tw.made)) === 1, 'phone: one reader');
  ok(await ph.getByRole('button', { name: 'Use camera' }).isVisible(), 'phone: the camera beside the picker');
  const cols = await ph.$$eval('.fi-item', (els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))].length);
  ok(cols === 2, `phone: the pictures found in two columns (${cols})`);
  await ph.locator('.fi-item .fi-open').first().click();
  await ph.locator('.fi-dlg[open]').waitFor();
  const full = await ph.evaluate(() => { const r = document.querySelector('.fi-dlg').getBoundingClientRect(); return Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight; });
  ok(full, 'phone: the viewer fills the screen');
  const small = await ph.$$eval('.fi-dlg .btn', (bs) => bs.filter((b) => b.getBoundingClientRect().width).map((b) => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label') || b.textContent.trim(), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => w < 44 || h < 44));
  ok(!small.length, `phone: the viewer's buttons are 44 px and more (${JSON.stringify(small)})`);
  ok(await ph.getByRole('button', { name: 'Share or save' }).isVisible(), 'phone: "Share or save" in the viewer');
  await ph.close();
};
