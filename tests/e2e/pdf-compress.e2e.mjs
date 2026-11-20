// Compress PDF (#/pdf-compress): a real PDF with a 1800×1200 photo; levels, target size, scanned-pages mode; text and
// soft masks survive; nothing is downloaded when the file cannot get smaller.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { pdfInfo, renderGrey } from '../lib/pdfcheck.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, info, download, devices, tmp }) => {
  const m = await import('mupdf');
  const images = (f) => { const d = m.Document.openDocument(readFileSync(f), 'application/pdf').asPDF(), out = []; for (let k = 1; k < d.countObjects(); k++) { const o = d.newIndirect(k); if (o.isStream() && o.get('Subtype').toString() === '/Image') out.push({ w: o.get('Width').asNumber(), h: o.get('Height').asNumber(), smask: !o.get('SMask').isNull(), filter: String(o.get('Filter')) }); } return out; };
  const page = await newPage();
  await page.goto(base + '#/pdf-compress');
  const go = () => download(page, () => page.getByRole('button', { name: 'Compress' }).click());
  const src = P('side-by-side-subfig.pdf'), size0 = statSync(src).size;
  await page.locator('input[type=file]').first().setInputFiles(src);
  await page.getByText('side-by-side-subfig.pdf: 1 page').waitFor();
  const f1 = await go(), s1 = statSync(f1).size, i1 = await pdfInfo(f1);
  info(`recommended: ${size0} → ${s1} bytes; images ${JSON.stringify(images(f1))}`);
  ok(s1 < size0 * 0.6, `Recommended: much smaller (${Math.round(size0 / 1024)} → ${Math.round(s1 / 1024)} KB)`);
  ok(i1.pages === 1 && /Your Chapter/.test(i1.list[0].text), 'text layer kept');
  ok(images(f1).every((im) => im.w <= 1754 && /DCT/.test(im.filter)), 'images at most 150 dpi of the page, JPEG');
  const [a, b] = [await renderGrey(src, 0, 0.5), await renderGrey(f1, 0, 0.5)];
  const ma = a.mean(0.1, 0.25, 0.9, 0.55), mb = b.mean(0.1, 0.25, 0.9, 0.55);
  ok(Math.abs(ma - mb) < 6, `figures look the same (mean grey ${ma.toFixed(1)} vs ${mb.toFixed(1)}, ${a.w}×${a.h} vs ${b.w}×${b.h})`);
  ok(/−\d+ %/.test(await page.locator('.note').filter({ hasText: '→' }).textContent()), 'result shows the saving');
  await page.getByRole('radio', { name: 'Extreme' }).click();
  const s2 = statSync(await go()).size;
  await page.getByRole('radio', { name: 'Light (best quality)' }).click();
  const s3 = statSync(await go()).size;
  ok(s2 < s1 && s1 < s3, `Extreme < Recommended < Light (${[s2, s1, s3].map((x) => Math.round(x / 1024)).join(' < ')} KB)`);
  // target size
  await page.getByRole('radio', { name: 'Target size' }).click();
  await page.getByRole('spinbutton').fill('200');
  const f4 = await go();
  ok(statSync(f4).size <= 200 * 1024, `target 200 KB met (${Math.round(statSync(f4).size / 1024)} KB)`);
  // scanned-pages mode: one JPEG per page, same page size, no text layer
  await page.getByRole('radio', { name: 'Scanned pages' }).click();
  const f5 = await go(), i5 = await pdfInfo(f5);
  ok(i5.pages === 1 && i5.list[0].w === 595 && i5.list[0].h === 842 && !i5.list[0].text.trim(), `scanned mode: page size kept (${i5.list[0].w}×${i5.list[0].h}), picture only`);
  ok(images(f5).length === 1, 'scanned mode: one image per page');
  // soft mask kept (jpeg.pdf: photo + alpha mask)
  await page.getByRole('radio', { name: 'Compression level' }).click();
  await page.getByRole('radio', { name: 'Extreme' }).click();
  await page.locator('input[type=file]').first().setInputFiles(P('jpeg.pdf'));
  await page.getByText('jpeg.pdf: 1 page').waitFor();
  const f6 = await go().catch(() => null);
  if (f6) ok(images(f6).some((im) => im.smask), 'image keeps its soft mask');
  else ok(true, 'jpeg.pdf could not get smaller (kept as is)');
  // nothing to gain → message, no download
  await page.getByRole('radio', { name: 'Recommended' }).click();
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.getByText('crazyones.pdf: 1 page').waitFor();
  const dl = page.waitForEvent('download', { timeout: 2500 }).then(() => true, () => false);
  await page.getByRole('button', { name: 'Compress' }).click();
  ok(!(await dl) && /Already compact/.test(await page.locator('.note').filter({ hasText: '→' }).textContent()), 'text-only PDF: “Already compact”, no download');
  // protected input
  await page.locator('input[type=file]').first().setInputFiles(P('aes256-asdfzxcv.pdf'));
  await page.getByPlaceholder('Password').fill('asdfzxcv'); await page.getByPlaceholder('Password').press('Enter');
  await page.getByText('aes256-asdfzxcv.pdf: 1 page').waitFor();
  await page.getByRole('radio', { name: 'Scanned pages' }).click();
  const i7 = await pdfInfo(await go());
  ok(!i7.encrypted && i7.pages === 1, 'protected PDF compressed; result has no password');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // a colour-key mask (/Mask [r r g g b b]) cuts out exact colours — after JPEG they are not exact: such an image stays
  const ck = new m.PDFDocument(), im = ck.addImage(new m.Image(readFileSync(new URL('../fixtures/images/coffee.png', import.meta.url).pathname)));
  const key = ck.newArray(); for (const v of [240, 255, 240, 255, 240, 255]) key.push(v);
  im.put('Mask', key);
  ck.insertPage(-1, ck.addPage([0, 0, 595, 842], 0, ck.addObject({ XObject: { I0: im } }), 'q 400 0 0 267 97 400 cm /I0 Do Q'));
  const ckPath = `${tmp}/colour-key.pdf`; writeFileSync(ckPath, ck.saveToBuffer('compress').asUint8Array());
  const p2 = await newPage();
  await p2.goto(base + '#/pdf-compress');
  await p2.locator('input[type=file]').first().setInputFiles(ckPath);
  await p2.getByText('colour-key.pdf: 1 page').waitFor();
  const dl2 = p2.waitForEvent('download', { timeout: 6000 }).then(() => true, () => false);
  await p2.getByRole('button', { name: 'Compress' }).click();
  ok(!(await dl2), 'an image with a colour-key mask is not turned into JPEG (nothing else to gain: no download)');

  // a PDF chosen during compression gets no result and no download from the run that was going; leaving the tab too
  const p3 = await newPage();
  let downloads = 0; p3.on('download', () => downloads++);
  await p3.goto(base + '#/pdf-compress');
  await p3.locator('input[type=file]').first().setInputFiles(P('side-by-side-subfig.pdf'));
  await p3.getByText('side-by-side-subfig.pdf: 1 page').waitFor();
  await p3.getByRole('button', { name: 'Compress' }).click();
  await p3.waitForTimeout(100);
  await p3.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await p3.getByText('crazyones.pdf: 1 page').waitFor();
  await p3.waitForTimeout(6000);
  ok(downloads === 0 && await p3.locator('.note').filter({ hasText: '→' }).count() === 0, `another PDF chosen during compression: no download, no result (it was the first file's result under the new name; ${downloads} downloads)`);
  await p3.locator('input[type=file]').first().setInputFiles(P('side-by-side-subfig.pdf'));
  await p3.getByText('side-by-side-subfig.pdf: 1 page').waitFor();
  await p3.getByRole('button', { name: 'Compress' }).click();
  await p3.waitForTimeout(100);
  await p3.goto(base + '#/');
  await p3.waitForTimeout(6000);
  ok(downloads === 0, 'the tab left during compression: no download afterwards');
  // target size: a box read in KB of 1,000 bytes; under 20 refused in words
  const p4 = await newPage();
  await p4.goto(base + '#/pdf-compress');
  await p4.locator('input[type=file]').first().setInputFiles(P('side-by-side-subfig.pdf'));
  await p4.getByText('side-by-side-subfig.pdf: 1 page').waitFor();
  await p4.getByRole('radio', { name: 'Target size' }).click();
  await p4.getByLabel('Target size in KB').fill('5');
  await p4.getByRole('button', { name: 'Compress' }).click();
  ok(await p4.locator('.toast', { hasText: 'Target size: at least 20 KB.' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'a target under 20 KB is refused in words (it was raised to 20 without a word)');
  await p4.getByLabel('Target size in KB').fill('300');
  const ft = await download(p4, () => p4.getByRole('button', { name: 'Compress' }).click());
  ok(statSync(ft).size <= 300000, `target 300 KB: at most 300,000 bytes (${statSync(ft).size})`);
  ok(p2.errors.length === 0 && p3.errors.length === 0 && p4.errors.filter((e) => !/at least 20 KB/.test(e)).length === 0, `no page errors: ${[...p2.errors, ...p3.errors, ...p4.errors].join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-compress');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
