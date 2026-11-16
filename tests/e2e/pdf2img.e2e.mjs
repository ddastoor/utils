// PDF → Images (#/pdf2img): exact pixel sizes per dpi, JPG / PNG, page ranges, zip of all.
import { readFileSync } from 'node:fs';
import { imageInfo, zipEntries } from '../lib/imgcheck.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, info, download, devices }) => {
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
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf2img');
  await phone.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await phone.getByText('crazyones.pdf: 1 page').waitFor();
  await convert(phone, ['crazyones-p1.jpg']);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
