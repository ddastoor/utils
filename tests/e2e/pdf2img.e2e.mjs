// PDF → Images (#/pdf2img): exact pixel sizes per dpi, JPG / PNG, page ranges, zip of all.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { imageInfo, zipEntries } from '../lib/imgcheck.mjs';
const P = (n) => fileURLToPath(new URL(`../fixtures/pdf/${n}`, import.meta.url));
export default async ({ base, page: newPage, ok, info, download, devices, tmp, released }) => {
  const page = await newPage();
  // click Convert and wait until the result list holds exactly these files
  const convert = async (pg, names) => {
    await pg.getByRole('button', { name: 'Convert' }).click();
    try { await pg.waitForFunction((n) => [...document.querySelectorAll('.result-row .file-name')].map((e) => e.textContent).join('|') === n.join('|'), names, { timeout: 60000 }); }
    catch (e) { info(`results: ${await pg.locator('.result-row .file-name').allTextContents()} · errors: ${pg.errors.join(' / ')}`); throw e; }
  };
  await page.goto(base + '#/pdf2img');
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.getByText('crazyones.pdf: 1 page').waitFor();
  await convert(page, ['crazyones-p1.jpg']);
  const j = await download(page, () => page.getByRole('button', { name: /Save crazyones-p1\.jpg/ }).click()), ji = imageInfo(j);
  ok(ji.type === 'jpeg' && ji.width === 1275 && ji.height === 1650, `150 dpi JPG: 612×792 pt → 1275×1650 px (${ji.width}×${ji.height})`);
  await page.getByRole('radio', { name: 'PNG' }).click(); await page.getByRole('radio', { name: '72 dpi (screen)' }).click();
  await convert(page, ['crazyones-p1.png']);
  const p = await download(page, () => page.getByRole('button', { name: /Save crazyones-p1\.png/ }).click()), pi = imageInfo(p);
  ok(pi.type === 'png' && pi.width === 612 && pi.height === 792, `72 dpi PNG: 612×792 px (${pi.width}×${pi.height})`);
  const png = readFileSync(p);
  ok(png.length > 5000, 'the page is drawn (not blank)');
  await page.locator('input[type=file]').first().setInputFiles(P('two-different-pages.pdf'));
  await page.getByText('two-different-pages.pdf: 2 pages').waitFor();
  await convert(page, ['two-different-pages-p1.png', 'two-different-pages-p2.png']);
  const z = zipEntries(await download(page, () => page.getByRole('button', { name: 'Download all (2) as .zip' }).click()));
  ok(z.length === 2 && z.includes('two-different-pages-p1.png') && z.includes('two-different-pages-p2.png'), `all pages as a zip (${z.join(', ')})`);
  await page.getByPlaceholder('All pages (or e.g. 1-3, 7)').fill('2');
  await convert(page, ['two-different-pages-p2.png']);
  ok(true, 'page range: only page 2');
  // twelve pages: names padded (p01 … p12) so that files sort in page order; a poster at 300 dpi is drawn smaller and
  // said; a PDF opened during a conversion never gets the old one's pages
  const m = await import('mupdf'), src = m.Document.openDocument(readFileSync(P('crazyones.pdf')), 'application/pdf').asPDF(), twelve = new m.PDFDocument();
  for (let k = 0; k < 12; k++) twelve.graftPage(-1, src, 0);
  const tw = `${tmp}/twelve.pdf`; writeFileSync(tw, twelve.saveToBuffer('compress').asUint8Array());
  await page.locator('input[type=file]').first().setInputFiles(tw);
  await page.getByText('twelve.pdf: 12 pages').waitFor();
  await page.getByPlaceholder('All pages (or e.g. 1-3, 7)').fill('');
  await page.getByRole('radio', { name: '72 dpi (screen)' }).click();
  await convert(page, Array.from({ length: 12 }, (_, i) => `twelve-p${String(i + 1).padStart(2, '0')}.png`));
  ok(true, 'twelve pages: twelve-p01.png … twelve-p12.png');
  const poster = new m.PDFDocument(); poster.insertPage(-1, poster.addPage([0, 0, 3000, 3000], 0, poster.addObject({}), '0 0 1 rg 100 100 2800 2800 re f'));
  const pp = `${tmp}/poster.pdf`; writeFileSync(pp, poster.saveToBuffer('compress').asUint8Array());
  await page.locator('input[type=file]').first().setInputFiles(pp);
  await page.getByText('poster.pdf: 1 page').waitFor();
  await page.getByRole('radio', { name: '300 dpi (print)' }).click();
  await convert(page, ['poster-p1.png']);
  const pi2 = imageInfo(await download(page, () => page.getByRole('button', { name: /Save poster-p1\.png/ }).click()));
  ok(pi2.width === 10000 && pi2.height === 10000 && /1 page \(1\) too large for 300 dpi: drawn smaller/.test(await page.locator('.muted.small').filter({ hasText: 'too large' }).textContent()),
    `a 3000 pt poster at 300 dpi: 10,000 px a side (100 megapixels; 12,500 asked), and said (${pi2.width}×${pi2.height})`);
  await page.locator('input[type=file]').first().setInputFiles(tw);
  await page.getByText('twelve.pdf: 12 pages').waitFor();
  await page.getByRole('button', { name: 'Convert' }).click();
  await page.waitForTimeout(150);
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.getByText('crazyones.pdf: 1 page').waitFor();
  await page.waitForTimeout(3000);
  ok(await page.locator('.result-row').count() === 0, `a PDF opened during a conversion: none of the old file's pages appear (${await page.locator('.result-row .file-name').allTextContents()})`);
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  // leaving the tab lets the pages' pictures go: the result list's blob URLs stayed alive (and their pictures in memory)
  // until the page was reloaded
  await convert(page, ['crazyones-p1.png']);
  const had = await page.evaluate(() => [...window.__blobs.values()].filter((b) => b.at === '#/pdf2img' && /^image/.test(b.type)));
  const kept = await released(page, 'pdf2img');
  ok(had.length > 0 && kept.length === 0, `leaving the tab releases its ${had.length} pictures (${kept.length} still held, ${Math.round(kept.reduce((a, b) => a + b.size, 0) / 1024)} KB${kept.length ? ': ' + kept.map((b) => `${b.type} ${b.from}`).join(', ') : ''})`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf2img');
  await phone.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await phone.getByText('crazyones.pdf: 1 page').waitFor();
  await convert(phone, ['crazyones-p1.jpg']);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
