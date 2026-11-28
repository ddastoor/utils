// To-do #40 (owner, 27 Nov 2026): the EPUB Reader's "Remember book" — "Processing…" over the whole page while the book's fingerprint
// is made (XXH128 of its file, held to xxhsum / Python's xxhash), the book, its title and its exact place in the Settings (this browser,
// and a settings file); kept up to date as the pages turn — quietly, without a settings file a page; the same file opened again — in
// another visit, at another text size — opens where it was left ("Back where you left off"); switched off → forgotten; the Settings page
// lists it with Forget, and the reader follows. And ▷ on the page: that page read here — no jump to the Text-to-Speech tab —, the first
// time with all the voices to choose from, the voice kept in the Settings and used from then on; the sentence being heard marked on
// the page; a page turned stops it; the selection read too. A phone.
import { fileURLToPath } from 'node:url';
import { readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const B = (n) => fileURLToPath(new URL(`../fixtures/ebooks/${n}`, import.meta.url));
const NAME = /^superutils_settings_(\d{8})_(\d{4})\.json$/;

/** XXH128 of a file by a tool of its own: xxhsum -H2, else Python's xxhash; null where neither is installed */
function xxh128(path) {
  const x = spawnSync('xxhsum', ['-H2', path], { encoding: 'utf8' });
  if (x.status === 0) return (/^([0-9a-f]{32})\b/.exec(x.stdout) || [])[1] ?? null;
  const p = spawnSync('python3', ['-I', '-c', 'import sys, xxhash; print(xxhash.xxh3_128_hexdigest(open(sys.argv[1], "rb").read()))', path], { encoding: 'utf8' });
  return p.status === 0 ? p.stdout.trim() : null;
}

export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const where = (p) => p.locator('.ebr-where').innerText();
  const waitWhere = (p, re, timeout = 30000) => p.waitForFunction((src) => new RegExp(src).test(document.querySelector('.ebr-where')?.textContent || ''), re.source, { timeout });
  const shown = async (p) => { const r = /^Pages? (\d+)(?:–(\d+))? of (\d+)/.exec(await where(p)); return r ? { first: +r[1] - 1, last: +(r[2] || r[1]) - 1, of: +r[3] } : null; };
  const open = async (p, file) => { await p.locator('input[type=file]').first().setInputFiles(file); await waitWhere(p, /^Pages? \d+/); await p.waitForTimeout(400); };
  const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('superutils.app.ebook.v1') || 'null'));
  const sw = (p) => p.locator('.ebr-remember input');
  const tool = (p, name) => p.locator('.ebr-tools').getByRole('button', { name });
  const toasts = (p) => p.locator('.toast').allInnerTexts().catch(() => []);
  let n = 0;
  const filesOf = (p) => {
    const got = [];
    p.on('download', async (d) => { if (!NAME.test(d.suggestedFilename())) return; const path = join(tmp, `eb-settings-${++n}.json`); await d.saveAs(path); got.push(JSON.parse(readFileSync(path, 'utf8'))); });
    return got;
  };

  // ================================================================ a PC: remember a book
  const pc = await newPage({ viewport: { width: 1280, height: 900 }, settingsFiles: true });
  const files = filesOf(pc);
  await pc.goto(`${base}#/ebook`);
  await pc.getByText('Choose an e-book').waitFor();
  const book = join(tmp, 'Lighthouse copy.epub'); copyFileSync(B('novel.epub'), book); // any name: the book is known by its bytes
  await open(pc, book);
  ok(await pc.locator('.ebr-remember').isVisible() && /Remember book/.test(await pc.locator('.ebr-remember').innerText()) && !(await sw(pc).isChecked()), 'the reader shows "Remember book", off for a book it does not know');
  for (let k = 0; k < 3; k++) await pc.keyboard.press('ArrowRight');
  await pc.waitForTimeout(600);
  const at = await shown(pc);
  // the switch: "Processing…" over the whole page, then the book in the Settings
  const seen = pc.waitForSelector('dialog.ebr-processing[open]', { timeout: 5000 }).then(async (d) => ({ text: await d.innerText(), modal: await d.evaluate((e) => e.matches(':modal')) }), () => null);
  await pc.locator('.ebr-remember').click();
  const proc = await seen;
  ok(proc && /^Processing…/.test(proc.text) && proc.modal, `switched on: a "Processing…" window over the whole page while the fingerprint is made (${JSON.stringify(proc?.text?.slice(0, 60))})`);
  await pc.waitForSelector('dialog.ebr-processing', { state: 'detached', timeout: 15000 });
  const s1 = await stored(pc), want = xxh128(book);
  const b1 = s1?.books?.[0];
  ok(b1 && /^[0-9a-f]{32}$/.test(b1.hash) && (want === null || b1.hash === want), `the book's fingerprint is XXH128 of its file${want === null ? ' (xxhsum and Python\'s xxhash are not installed: not held to them)' : ', as xxhsum gives it'} (${b1?.hash})`);
  ok(b1 && b1.title === 'The Lighthouse Almanac' && b1.author === 'Ines Farrow' && b1.page === at.first && b1.pages === at.of && b1.anchor.length > 10, `… with its title, author and place: page ${b1?.page + 1} of ${b1?.pages}, "${b1?.anchor}"`);
  ok((await toasts(pc)).some((x) => /^Remembered: open “The Lighthouse Almanac” again and it opens at this page\.$/.test(x)), 'and the reader says so');
  await pc.waitForTimeout(2500);
  ok(files.length === 1 && files[0].settings.ebook.books[0].hash === b1.hash, `a settings file follows, with the book in it (${files.length} file)`);
  // the pages turned: the place kept at once, but no settings file a page
  for (let k = 0; k < 4; k++) { await pc.keyboard.press('ArrowRight'); await pc.waitForTimeout(700); }
  const at2 = await shown(pc), s2 = await stored(pc);
  await pc.waitForTimeout(2500);
  ok(s2.books[0].page === at2.first && s2.books[0].anchor !== b1.anchor && files.length === 1, `pages turned: the place kept at once (page ${s2.books[0].page + 1}), and no settings file for it (${files.length} in all)`);
  // closed and opened again: where it was left
  await tool(pc, 'Close the book').click();
  ok(/Books you asked it to remember \(1\)/.test(await pc.locator('.ebr-known').innerText()), 'before a book: the books it remembers, listed');
  await pc.reload(); await pc.getByText('Choose an e-book').waitFor();
  await open(pc, B('novel.epub'));
  const at3 = await shown(pc);
  ok(at3.first === at2.first && await sw(pc).isChecked(), `another visit, the same book (another file name): it opens at page ${at3.first + 1}, where it was left, "Remember book" on`);
  ok((await toasts(pc)).some((x) => x === `Back where you left off: page ${at3.first + 1} of ${at3.of}.`), 'and says "Back where you left off"');
  // another text size: the same words, another page number
  await tool(pc, 'Close the book').click();
  await pc.evaluate(() => { const k = 'superutils.app.ebook.v1', v = JSON.parse(localStorage.getItem(k)); v.size = 28; localStorage.setItem(k, JSON.stringify(v)); });
  await pc.reload(); await pc.getByText('Choose an e-book').waitFor();
  await open(pc, B('novel.epub'));
  const at4 = await shown(pc), anchor = (await stored(pc)).books[0].anchor;
  const pageWords = await pc.locator('#ebr-text').textContent();
  ok(at4.of > at3.of && (pageWords.replace(/\s+/g, ' ').includes(anchor.slice(0, 30)) || at4.first !== at3.first), `a larger text (${at4.of} pages, not ${at3.of}): it opens on the page that holds the same words (page ${at4.first + 1})`);
  // a book it does not know: the switch off, page 1
  await tool(pc, 'Close the book').click();
  await open(pc, B('old.epub'));
  ok(!(await sw(pc).isChecked()) && (await shown(pc)).first === 0, 'another book: not remembered, from its start');
  // forgotten in the reader
  await tool(pc, 'Close the book').click();
  await open(pc, B('novel.epub'));
  const before = files.length;
  await pc.locator('.ebr-remember').click();
  await pc.waitForTimeout(2500);
  ok(!(await sw(pc).isChecked()) && (await stored(pc)).books.length === 0 && files.length === before + 1, `switched off: forgotten (and a settings file follows: ${files.length - before})`);
  await tool(pc, 'Close the book').click();
  await open(pc, B('novel.epub'));
  ok((await shown(pc)).first === 0, '… and the book opens at its start again');

  // ================================================================ the Settings page lists it, Forget there, the reader follows
  await pc.locator('.ebr-remember').click();
  await pc.waitForSelector('dialog.ebr-processing', { state: 'detached', timeout: 15000 });
  await pc.keyboard.press('ArrowRight'); await pc.waitForTimeout(700);
  // (another tab of the same browser: the harness's pages are each a profile of their own)
  const st = await pc.context().newPage();
  const stErrors = []; st.on('pageerror', (e) => stErrors.push(String(e)));
  await st.goto(`${base}#/settings`);
  await st.locator('#settings-ebook .st-books li').first().waitFor();
  const row = await st.locator('#settings-ebook .st-books li').first().innerText();
  ok(/The Lighthouse Almanac · Ines Farrow — page \d+ of \d+ \(\d+ %\), last read/.test(row), `the Settings page lists the book with its place and when it was last read ("${row.replace(/\s+/g, ' ').slice(0, 90)}")`);
  await st.locator('#settings-ebook .st-books').getByRole('button', { name: 'Forget' }).click();
  await pc.waitForTimeout(800);
  ok(!(await sw(pc).isChecked()) && (await stored(st)).books.length === 0, 'Forget there: the reader open in another tab turns its switch off');
  ok(/No books remembered/.test(await st.locator('#settings-ebook .st-books').innerText()), '… and the list says there is none');

  // ================================================================ ▷: the page read here, the voice chosen once
  const rd = await newPage({ viewport: { width: 1280, height: 900 } });
  const reqs = []; rd.on('request', (r) => reqs.push(r.url()));
  await rd.goto(`${base}#/ebook`);
  await rd.getByText('Choose an e-book').waitFor();
  await open(rd, B('novel.epub'));
  await rd.keyboard.press('ArrowRight'); await rd.waitForTimeout(500);
  const pg = await shown(rd);
  await tool(rd, 'Read this page aloud').click();
  const dlg = rd.locator('dialog.ebr-panel');
  await dlg.getByRole('heading', { name: 'Read aloud with' }).waitFor({ timeout: 10000 });
  const groups = await dlg.locator('legend').allInnerTexts(), radios = await dlg.locator('input[type=radio]').count();
  ok(['US English', 'British English', 'Indian English'].every((g) => groups.includes(g)) && radios >= 15 && await rd.evaluate(() => location.hash) === '#/ebook',
    `the first ▷: all the voices to choose from (${groups.join(', ')} — ${radios}), the reader stays (no jump to Text-to-Speech)`);
  await dlg.locator('label.ebr-voice', { hasText: 'Female voice 2 (TNI)' }).click();
  ok(/Indian English voice made on this device — 77 MB the first time/.test(await dlg.locator('.ebr-voice-hint').innerText()), 'the voice\'s download said before it is fetched');
  await dlg.getByRole('radio', { name: 'Faster' }).click();
  await dlg.getByRole('button', { name: 'Read aloud' }).click();
  const sv = await stored(rd);
  ok(sv.voice === 'in_tni' && sv.speed === '1.2', `the voice and speed kept in the Settings (${sv.voice}, ${sv.speed})`);
  await rd.locator('.ebr-saybar:not([hidden])').waitFor({ timeout: 10000 });
  ok(/^Reading pages \d+–\d+ aloud/.test(await rd.locator('.ebr-sayline').innerText()), `the bar: what is read (${await rd.locator('.ebr-sayline').innerText()})`);
  // the voice speaks (Piper on ONNX Runtime): the first sentence marked on the page
  await rd.waitForFunction(() => /Female voice 2/.test(document.querySelector('.ebr-sayline')?.textContent || '') && /^\d+:\d+$/.test(document.querySelector('.ebr-marks')?.dataset.reading || ''), null, { timeout: 180000 });
  const mark = await rd.locator('.ebr-marks').getAttribute('data-reading'), [mp] = mark.split(':').map(Number);
  const green = await rd.evaluate(() => { const c = document.querySelector('.ebr-marks'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 20 && d[i + 1] > d[i] && d[i + 1] > d[i + 2]) k++; return k; });
  ok((mp === pg.first || mp === pg.last) && green > 200 && /Female voice 2/.test(await rd.locator('.ebr-sayline').innerText()), `the sentence being heard is marked on the page (${mark}; ${green} green pixels; "${await rd.locator('.ebr-sayline').innerText()}")`);
  ok(reqs.some((u) => /models\/piper\//.test(u)) && !reqs.some((u) => /#\/tts/.test(u)), 'the voice\'s model fetched from this site, in this tab');
  // a page turned stops it
  await rd.keyboard.press('ArrowRight'); await rd.waitForTimeout(600);
  ok(await rd.locator('.ebr-saybar').isHidden() && !(await rd.locator('.ebr-marks').getAttribute('data-reading')), 'a page turned: the reading stops, the mark goes');
  // the second ▷: no dialog, read at once with the kept voice
  await tool(rd, 'Read this page aloud').click();
  await rd.waitForTimeout(500);
  ok(!(await dlg.count()) && await rd.locator('.ebr-saybar:not([hidden])').count() === 1, 'the next ▷: no question, read at once with the voice kept');
  await rd.locator('.ebr-saybar').getByRole('button', { name: 'Voice…' }).click();
  await dlg.getByRole('heading', { name: 'The reading voice' }).waitFor();
  ok(await dlg.locator('input[value="in_tni"]').isChecked(), '"Voice…" while reading: the voices again, the kept one chosen');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await rd.locator('.ebr-saybar').getByRole('button', { name: 'Stop' }).click();
  ok(await rd.locator('.ebr-saybar').isHidden(), 'Stop ends it');
  // the selection read here too
  const box = await rd.locator('.ebr-stage').boundingBox();
  await rd.mouse.move(box.x + 80, box.y + 120); await rd.mouse.down(); await rd.mouse.move(box.x + 360, box.y + 160, { steps: 8 }); await rd.mouse.up();
  await rd.locator('.ebr-selbar:not([hidden])').waitFor({ timeout: 5000 });
  await rd.locator('.ebr-selbar').getByRole('button', { name: 'Read aloud' }).click();
  await rd.locator('.ebr-saybar:not([hidden])').waitFor({ timeout: 5000 });
  ok(/^Reading the selection aloud/.test(await rd.locator('.ebr-sayline').innerText()) && await rd.evaluate(() => location.hash) === '#/ebook', 'a selection: read here as well');
  await rd.locator('.ebr-saybar').getByRole('button', { name: 'Stop' }).click();
  // the Settings page shows the voice; changed there, the reader takes it
  const st2 = await rd.context().newPage();
  st2.on('pageerror', (e) => stErrors.push(String(e)));
  await st2.goto(`${base}#/settings`); await st2.locator('#settings-ebook select').first().waitFor();
  const vsel = st2.getByLabel('EPUB Reader reading voice');
  ok(await vsel.inputValue() === 'in_tni', 'the Settings page shows the reading voice chosen in the reader');
  await vsel.selectOption('bf_emma');
  await rd.waitForTimeout(500);
  ok((await stored(rd)).voice === 'bf_emma', '… changed there, it is the reader\'s');
  const errs = [pc, rd].flatMap((p) => p.errors).concat(stErrors);
  ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);

  // ================================================================ a phone
  const ph = await newPage({ ...devices['iPhone 13'] });
  await ph.goto(`${base}#/ebook`); await ph.getByText('Choose an e-book').waitFor();
  await open(ph, B('novel.epub'));
  const swBox = await ph.locator('.ebr-remember').boundingBox();
  ok(swBox && swBox.height >= 44 && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `phone: "Remember book" fits the top bar and takes a finger (${swBox && `${Math.round(swBox.width)} × ${Math.round(swBox.height)} px`}), no sideways scroll`);
  await ph.locator('.ebr-tools').getByRole('button', { name: 'Read this page aloud' }).tap();
  await ph.locator('dialog.ebr-panel').getByRole('heading', { name: 'Read aloud with' }).waitFor({ timeout: 10000 });
  const rowH = await ph.locator('label.ebr-voice').first().boundingBox();
  ok(rowH && rowH.height >= 44, `phone: each voice takes a finger (${rowH && Math.round(rowH.height)} px)`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
