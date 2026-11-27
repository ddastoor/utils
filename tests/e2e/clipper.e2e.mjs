// Newspaper Clipper (#/clipper): a photographed newspaper page (tests/fixtures/news/, made by
// scripts/make-newspaper-photos.py with every story's words) → the page found, straightened and read in the browser
// (Tesseract's page layout gives the blocks) → a story chosen by its headline → the clipping held to the story as it was
// printed: its text in reading order; the saved picture read back by Tesseract in Node (the columns stacked in order, the
// headline on top); the PDF read back by MuPDF; the .txt; "Read aloud" handing the text to the Text-to-Speech tab. Also:
// blocks tapped one by one, a part moved, the labels, the clean-up, a photo with no newspaper on it, nothing fetched before
// a photo, leaving the tab, the phone.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { imageInfo } from '../lib/imgcheck.mjs';
import { phoneLayout } from './_phone.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const NEWS = (n) => join(root, 'tests/fixtures/news', n);
const IMG = (n) => join(root, 'tests/fixtures/images', n);
const { wordsOf, lcs, storyWords } = await import(join(root, 'scripts/measure-clipper.mjs'));

/** Leptonica's diagnostics inside Tesseract ("Error in boxClipToRectangle: box outside rectangle" — its page layout on a
 *  newspaper page) reach the console as errors; they are not the app's */
const real = (errs) => errs.filter((e) => !/^Error in [A-Za-z]+: /.test(e));
const innerWidthOf = (p) => p.viewportSize().width;

export default async ({ base, page: newPage, ok, info, download, devices, released }) => {
  const idx = JSON.parse(readFileSync(NEWS('index.json'), 'utf8'));
  const ent = idx[0], photo = `${ent.name}.jpg`;
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  const requests = []; page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${base}#/clipper`);
  await page.locator('input[type=file]').first().waitFor({ state: 'attached' });
  const body = () => page.locator('.tool-body').innerText();
  ok(!requests.some((u) => /tesseract|imgproc[^/]*\.wasm|textcore[^/]*\.wasm|ort-wasm|doccorner/i.test(u)), 'nothing of the engines is fetched before a photo is chosen');

  // ---- a photo of a page: found, straightened, read; its stories listed by their headlines
  await page.locator('input[type=file]').first().setInputFiles(NEWS(photo));
  await page.waitForFunction((n) => new RegExp(`Photo 1 of 1 · ${n.replace('.', '\\.')} · `).test(document.querySelector('.tool-body').innerText), photo, { timeout: 240000 });
  const line = (await body()).match(/Photo 1 of 1[^\n]*/)?.[0] ?? '';
  ok(/the page was found and straightened/.test(line) && /\d+ headlines?, \d+ blocks of text/.test(line), `the line says what was done and found: "${line}"`);
  ok(requests.every((u) => u.startsWith(base) || /^(data|blob):/.test(u)), 'the engines come from this site, nothing from elsewhere');
  const stories = await page.locator('.clip-stories button').allInnerTexts();
  const found = ent.stories.filter((s) => stories.some((b) => lcs(wordsOf(s.headline), wordsOf(b)) >= 0.8 * wordsOf(s.headline).length));
  ok(found.length >= ent.stories.length - 1, `the stories on the page are listed by their headlines (${found.length} of ${ent.stories.length}: ${stories.slice(0, 4).join(' | ')} …)`);
  ok(await page.locator('.clip-block').count() >= ent.stories.length * 2, `every block of the page can be tapped (${await page.locator('.clip-block').count()})`);
  ok(await page.locator('.clip-block[aria-pressed=true]').count() === 0, 'nothing is chosen at first');

  // ---- a story by its headline: the clipping's text is the story, in order
  const lead = ent.stories.reduce((a, b) => (b.blocks.length > a.blocks.length ? b : a));
  const headBtn = page.locator('.clip-stories button').filter({ hasText: lead.headline.split(' ').slice(0, 3).join(' ') }).first();
  await headBtn.click();
  await page.waitForFunction(() => document.querySelector('.clip-out canvas')?.dataset.parts, null, { timeout: 30000 });
  const text = await page.locator('textarea').inputValue();
  const truth = storyWords(lead), got = wordsOf(text), k = lcs(truth, got), extra = got.filter((x) => !new Set(truth).has(x)).length;
  ok(k >= 0.95 * truth.length, `the clipping's text is the story in reading order (${k} of its ${truth.length} words in order)`);
  ok(extra <= 0.03 * got.length, `… with nothing of other stories (${extra} words)`);
  ok(wordsOf(text).slice(0, wordsOf(lead.headline).length).join(' ') === wordsOf(lead.headline).join(' '), 'the headline comes first');
  ok(await headBtn.getAttribute('aria-pressed') === 'true', 'the story\'s headline is marked as chosen');
  const nParts = await page.locator('.clip-parts li').count();
  ok(nParts === lead.blocks.length + (lead.picture ? 1 : 0), `the parts: ${nParts} (the headline, ${lead.blocks.length - 1} more blocks${lead.picture ? ' and the picture' : ''})`);
  ok(/^Part 1: Headline: /.test(await page.locator('.clip-parts li').first().innerText()), 'part 1 is the headline');
  ok(/\d+ parts? · [\d,]+ words · \d+ × \d+ px when saved/.test(await body()), 'the clipping\'s size is said');

  // ---- the picture: one tall picture, the story's columns one under another — read back by Tesseract in Node
  const picPath = await download(page, () => page.getByRole('button', { name: 'Save picture' }).click());
  const pic = imageInfo(readFileSync(picPath));
  ok(pic.type === 'jpeg' && pic.height > 2 * pic.width, `a tall JPEG (${pic.width}×${pic.height})`);
  ok(/\.jpg$/.test(picPath) && new RegExp(wordsOf(lead.headline).slice(0, 2).join('-')).test(picPath.split(/[\\/]/).pop()), `named after the headline (${picPath.split(/[\\/]/).pop()})`);
  {
    const require = createRequire(join(root, 'package.json'));
    const { createWorker, OEM } = require('tesseract.js');
    const w = await createWorker('eng', OEM.LSTM_ONLY, { langPath: join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cacheMethod: 'none' });
    await w.setParameters({ debug_file: '/dev/null' });
    const { data } = await w.recognize(readFileSync(picPath), { tessedit_pageseg_mode: '4' });
    await w.terminate();
    const read = wordsOf(data.text), kk = lcs(truth, read);
    ok(kk >= 0.9 * truth.length, `the saved picture reads as the story, its columns in order (${kk} of ${truth.length} words in order, read back by Tesseract)`);
    const labels = new Set([...data.text.matchAll(/part\s*(\d+)/gi)].map((x) => +x[1]));
    // (Tesseract reads a label right over the headline's big letters with them — "Part 1" is often lost there)
    ok(labels.size >= Math.ceil(nParts / 2) && [...labels].every((x) => x >= 1 && x <= nParts), `its parts are labelled "Part 1", "Part 2" … (${[...labels].sort((a, b) => a - b).join(', ')} of ${nParts} read back)`);
  }

  // ---- the PDF: A4 pages, each a picture, ending between lines
  const pdfPath = await download(page, () => page.getByRole('button', { name: 'Save PDF' }).click());
  {
    const mupdf = await import(join(root, 'node_modules/mupdf/dist/mupdf.js'));
    const doc = mupdf.Document.openDocument(readFileSync(pdfPath), 'application/pdf');
    const n = doc.countPages(), b = doc.loadPage(0).getBounds();
    ok(n >= 1 && Math.abs(b[2] - b[0] - 595.28) < 1 && Math.abs(b[3] - b[1] - 841.89) < 1, `a PDF of A4 pages (${n}; ${(b[2] - b[0]).toFixed(0)}×${(b[3] - b[1]).toFixed(0)} pt)`);
    ok(/PDF: \d+ pages?, [\d.,]+ (KB|MB)/.test(await body()), 'the PDF\'s pages and size are said');
  }

  // ---- the text: .txt, Copy, Read aloud (handed to the Text-to-Speech tab)
  const txtPath = await download(page, () => page.getByRole('button', { name: 'Save .txt' }).click());
  const txt = readFileSync(txtPath, 'utf8');
  ok(txt.replace(/\r\n/g, '\n') === text && /\r\n/.test(txt), 'Save .txt gives the text (Windows line ends)');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  const clip = (await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `(clipboard: ${e.message})`)).replace(/\r\n/g, '\n');
  ok(clip === text, 'Copy puts the text on the clipboard');

  // ---- blocks tapped one by one; a part moved; the labels; the clean-up
  const before = (await page.locator('.clip-out canvas').getAttribute('data-parts')).split(',').length;
  // a block of text not in the story: tapped in, tapped out
  const free = await page.evaluate(() => [...document.querySelectorAll('.clip-block:not(.head):not(.pic)')].findIndex((b) => b.getAttribute('aria-pressed') === 'false'));
  await page.locator('.clip-block:not(.head):not(.pic)').nth(free).click();
  await page.waitForFunction((n) => document.querySelector('.clip-out canvas').dataset.parts.split(',').length === n + 1, before, { timeout: 15000 });
  ok(await page.locator('.clip-block:not(.head):not(.pic)').nth(free).getAttribute('aria-pressed') === 'true', 'a block tapped goes in (marked, and a part more)');
  ok(await page.locator('.clip-block:not(.head):not(.pic)').nth(free).locator('.clip-n').count() === 1, '… with its part number on it');
  await page.locator('.clip-block:not(.head):not(.pic)').nth(free).click();
  await page.waitForFunction((n) => document.querySelector('.clip-out canvas').dataset.parts.split(',').length === n, before, { timeout: 15000 });
  ok(true, 'tapped again, it comes out');
  // the last part (a column) moved up: the text follows the new order
  const t0 = await page.locator('textarea').inputValue(), n = await page.locator('.clip-parts li').count();
  await page.getByRole('button', { name: `Move part ${n} up` }).click();
  await page.waitForFunction((t) => document.querySelector('textarea').value !== t, t0, { timeout: 15000 });
  const t1 = await page.locator('textarea').inputValue(), paras0 = t0.split('\n\n'), paras1 = t1.split('\n\n'), m = paras0.length;
  ok(paras1[m - 1] === paras0[m - 2] && paras1[m - 2] === paras0[m - 1], 'a part moved up: the text follows the new order');
  ok(await page.getByRole('button', { name: `Move part ${n} down` }).isDisabled(), 'the last part cannot go further down');
  await page.getByRole('button', { name: `Move part ${n - 1} down` }).click();
  await page.waitForFunction((t) => document.querySelector('textarea').value === t, t0, { timeout: 15000 });
  ok(true, '… and back down');
  const h1 = await page.locator('.clip-out canvas').evaluate((c) => c.height);
  await page.getByText('Mark the parts', { exact: false }).click();
  await page.waitForFunction((hh) => document.querySelector('.clip-out canvas').height < hh, h1, { timeout: 15000 });
  ok(true, 'the labels switched off: the clipping is shorter by them');
  await page.getByText('Mark the parts', { exact: false }).click();
  await page.getByRole('radio', { name: 'B & W' }).click();
  const pngPath = await download(page, () => page.getByRole('button', { name: 'Save picture' }).click());
  const png = imageInfo(readFileSync(pngPath));
  ok(png.type === 'png' && png.width === pic.width && png.height === pic.height, `black and white: a PNG of the same size (${png.width}×${png.height})`);
  await page.getByRole('radio', { name: 'Colour' }).click();

  // ---- a story continued on another page: a second photo joined — its parts after the first photo's, labelled with it
  await page.locator('input[type=file]').first().setInputFiles({ name: 'page-2.jpg', mimeType: 'image/jpeg', buffer: readFileSync(NEWS(photo)) });
  await page.waitForFunction(() => /Photo 2 of 2 · page-2\.jpg · /.test(document.querySelector('.tool-body').innerText), null, { timeout: 240000 });
  const second = ent.stories.find((x) => x !== lead && x.blocks.length >= 3);
  const before2 = await page.locator('textarea').inputValue();
  await page.locator('.clip-stories button').filter({ hasText: second.headline.split(' ').slice(0, 3).join(' ') }).first().click();
  await page.waitForFunction((t) => document.querySelector('textarea').value.length > t.length, before2, { timeout: 30000 });
  const joined = await page.locator('textarea').inputValue();
  ok(joined.startsWith(before2) && lcs(storyWords(second), wordsOf(joined.slice(before2.length))) >= 0.95 * storyWords(second).length, 'the second photo\'s story follows the first photo\'s in the text');
  ok(/\(photo 2\)/.test(await page.locator('.clip-parts').innerText()), 'its parts are named with their photo');
  await page.getByRole('button', { name: 'Photo 1: ' + photo }).click();
  ok(await page.locator('.clip-block[aria-pressed=true]').count() >= lead.blocks.length, 'back on photo 1: its chosen blocks are still marked');
  await page.getByRole('button', { name: 'Photo 2: page-2.jpg' }).click();
  await page.getByRole('button', { name: 'Remove this photo' }).click();
  await page.waitForFunction((t) => document.querySelector('textarea').value === t, before2, { timeout: 15000 });
  ok(true, 'the second photo removed: its parts go with it');

  // ---- "Read aloud": the Text-to-Speech tab opens with the text
  await page.getByRole('button', { name: 'Read aloud' }).click();
  await page.waitForFunction(() => location.hash === '#/tts' && document.querySelector('.tts-text'), null, { timeout: 15000 });
  ok(await page.locator('.tts-text').inputValue() === text, '"Read aloud" opens Text-to-Speech with the clipping\'s text');
  await page.goto(`${base}#/`); await page.goto(`${base}#/tts`);
  await page.locator('.tts-text').waitFor();
  ok(await page.locator('.tts-text').inputValue() !== text, 'the text is handed over once (the tab opened again shows its own sample)');

  // ---- a photo with no newspaper on it: said
  await page.goto(`${base}#/clipper`);
  await page.locator('input[type=file]').first().setInputFiles(IMG('coffee.jpg'));
  await page.waitForFunction(() => /Photo 1 of 1 · coffee\.jpg · /.test(document.querySelector('.tool-body').innerText), null, { timeout: 240000 });
  ok(/The text reads poorly/.test(await body()) || /No headline was found/.test(await body()), 'a photo without a newspaper: no headline, and the hint to take a sharper photo');
  ok(real(page.errors).length === 0, `no page errors: ${real(page.errors).join(' | ')}`);

  // ---- leaving the tab lets go of what it made
  { const kept = await released(page, 'clipper');
    ok(kept.length === 0, `leaving the tab: the blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }

  // ---- the phone: the back camera, photos already taken, no sideways scroll, a story chosen
  const phone = await phoneLayout({ base, page: newPage, devices, ok }, 'clipper', { buttons: ['Use camera'] });
  ok(await phone.locator('input[type=file][capture]').count() === 0 && await phone.locator('input[type=file][multiple]').count() === 1, 'phone: "Choose photos" picks photos already taken (no camera forced)');
  await phone.locator('input[type=file]').first().setInputFiles(NEWS(photo));
  await phone.waitForSelector('.clip-stories button', { timeout: 240000 });
  await phone.locator('.clip-stories button').first().click();
  await phone.waitForFunction(() => document.querySelector('.clip-out canvas')?.dataset.parts, null, { timeout: 30000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: a story chosen, no horizontal scroll');
  const rowBtns = await phone.locator('.clip-parts li').first().locator('button').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.right, r.height]; }));
  ok(rowBtns.length === 3 && rowBtns.every(([right, hh]) => right <= innerWidthOf(phone) && hh >= 44), `phone: each part's buttons (up, down, out) on the screen and 44 px tall (${JSON.stringify(rowBtns.map(([r, hh]) => [Math.round(r), Math.round(hh)]))})`);
  for (const name of ['Picture', 'PDF', 'Share']) {
    const b = await phone.getByRole('button', { name, exact: true }).first().boundingBox();
    ok(b && b.height >= 44, `phone: "${name}" ≥ 44 px tall (${b && Math.round(b.height)})`);
  }
  ok(real(phone.errors).length === 0, `phone: no errors: ${real(phone.errors).join(' | ')}`);
  void info;
};
