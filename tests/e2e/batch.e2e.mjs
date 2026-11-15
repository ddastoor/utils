// Batch Images (#/batch, PC only): real photos of several formats → resize/convert/limit size → zip.
import { imageInfo, zipEntries } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/batch');
  const inputs = ['coffee.jpg', 'chelsea.png', 'astronaut.png', 'pug.heic', 'coffee-gps.jpg'].map(F);
  const run = async (n) => {
    await page.getByRole('button', { name: 'Process images' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.result-row').length === n && /Done/.test(document.querySelector('.progress-label')?.textContent || ''), n, { timeout: 90000 });
  };
  const rowInfo = async () => (await page.locator('.result-row').allTextContents());
  await page.locator('input[type=file]').setInputFiles(inputs);
  ok(/5 images/.test(await page.locator('main, body').first().innerText()), 'five images listed');

  // long side 300 → JPEG; never upscale
  await page.getByLabel('Long side (px)').fill('300');
  await run(5);
  const rows = await rowInfo();
  ok(rows.some((r) => r.includes('coffee.jpg') && r.includes('300×200')), `coffee 600×400 → 300×200: ${rows[0]}`);
  ok(rows.some((r) => r.includes('chelsea.jpg') && r.includes('300×200')), 'chelsea 451×300 → 300×200 (PNG → JPEG)');
  ok(rows.some((r) => r.includes('astronaut.jpg') && r.includes('300×300')), 'astronaut 512² → 300²');
  const zip = zipEntries(await download(page, () => page.getByRole('button', { name: /Download all \(5\)/ }).click()));
  ok(zip && zip.length === 5 && zip.includes('pug.jpg'), `zip has 5 files: ${zip}`);
  const gpsOut = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save coffee-gps.jpg' }).click()));
  ok(gpsOut.type === 'jpeg' && !gpsOut.gps && !gpsOut.exif && gpsOut.width === 300, 'GPS photo output has no EXIF');

  // rename pattern + exact size + WebP
  await page.getByRole('radio', { name: 'Exact' }).click();
  await page.getByLabel('Width (px)').fill('128'); await page.getByLabel('Height (px)').fill('96');
  await page.getByRole('radio', { name: 'WebP' }).click();
  await page.getByLabel('File names').fill('holiday-{n}-{w}x{h}');
  await run(5);
  const names = await page.locator('.result-row .file-name').allTextContents();
  ok(String(names) === 'holiday-1-128x96.webp,holiday-2-128x96.webp,holiday-3-128x96.webp,holiday-4-128x96.webp,holiday-5-128x96.webp', `rename pattern: ${names}`);
  const w = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save holiday-3-128x96.webp' }).click()));
  ok(w.type === 'webp' && w.width === 128 && w.height === 96, `exact 128×96 WebP: ${JSON.stringify(w)}`);

  // per-file size limit
  await page.getByRole('radio', { name: 'Percent' }).click();
  await page.getByLabel('Scale (%)').fill('100');
  await page.getByRole('radio', { name: 'JPEG' }).click();
  await page.getByLabel('File names').fill('{name}');
  await page.locator('label.switch', { hasText: 'Limit file size' }).click();
  await page.getByLabel('Maximum size per file (KB)').fill('25');
  await run(5);
  const sizes = [];
  for (const n of ['coffee.jpg', 'astronaut.jpg', 'chelsea.jpg']) sizes.push(imageInfo(await download(page, () => page.getByRole('button', { name: `Save ${n}` }).click())).size);
  ok(sizes.every((s) => s <= 25 * 1024), `every file ≤ 25 KB: ${sizes}`);

  // keep format: PNG stays PNG
  await page.locator('label.switch', { hasText: 'Limit file size' }).click();
  await page.getByRole('radio', { name: 'Same as input' }).click();
  await run(5);
  const kept = await page.locator('.result-row .file-name').allTextContents();
  ok(kept.includes('chelsea.png') && kept.includes('coffee.jpg'), `formats kept: ${kept}`);
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // PC only: hidden on phones
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/batch');
  ok(/PC|computer|desktop/i.test(await phone.locator('body').innerText()), 'phone: explains Batch Images is PC only');
};
