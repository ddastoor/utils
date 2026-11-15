// HEIC → JPG (#/heic): real iPhone-style HEIC files (pillow-heif test images) → JPEG/PNG/WebP, zip of all.
import { imageInfo, zipEntries } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/heic');
  await page.locator('input[type=file]').setInputFiles([F('pug.heic'), F('xiaomi.heic')]);
  await page.waitForFunction(() => document.querySelectorAll('.result-row').length === 2, null, { timeout: 60000 });
  const names = await page.locator('.result-row .file-name').allTextContents();
  ok(String(names) === 'pug.jpg,xiaomi.jpg', `two JPEGs named after the inputs: ${names}`);
  const p1 = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save pug.jpg' }).click()));
  ok(p1.type === 'jpeg' && p1.width > 100 && p1.height > 100 && !p1.exif, `pug.jpg valid JPEG without EXIF: ${JSON.stringify(p1)}`);
  const shown = await page.locator('.result-row').first().textContent();
  ok(shown.includes(`${p1.width}×${p1.height}`), 'result row shows the pixel size');
  const z = zipEntries(await download(page, () => page.getByRole('button', { name: /Download all \(2\)/ }).click()));
  ok(z && String(z.sort()) === 'pug.jpg,xiaomi.jpg', `zip contains both: ${z}`);

  await page.getByRole('radio', { name: 'PNG' }).click();
  ok(await page.locator('.slider', { hasText: 'Quality' }).isHidden(), 'quality slider hidden for PNG');
  await page.locator('input[type=file]').setInputFiles(F('pug.heic'));
  await page.waitForFunction(() => document.querySelectorAll('.result-row').length === 3, null, { timeout: 60000 });
  const png = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save pug.png' }).click()));
  ok(png.type === 'png' && png.width === p1.width && png.height === p1.height, `PNG output same size: ${png.width}×${png.height}`);

  await page.getByRole('radio', { name: 'WebP' }).click();
  await page.locator('input[type=file]').setInputFiles(F('xiaomi.heic'));
  await page.waitForFunction(() => document.querySelectorAll('.result-row').length === 4, null, { timeout: 60000 });
  const wp = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save xiaomi.webp' }).click()));
  ok(wp.type === 'webp' && wp.width > 0, `WebP output: ${wp.width}×${wp.height}`);

  // a non-HEIC file is converted too (JPEG input), a broken file gives a clear error and no result
  await page.getByRole('radio', { name: 'JPG' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: Buffer.from('not really a heic file at all') });
  await page.waitForSelector('.toast-err', { timeout: 30000 });
  ok((await page.locator('.result-row').count()) === 4, 'broken file adds no result');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/HEIC|heif|Not a readable|not supported/i.test(e)));
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/heic');
  await phone.locator('input[type=file]').setInputFiles(F('pug.heic'));
  await phone.waitForSelector('.result-row', { timeout: 60000 });
  ok(await phone.getByRole('button', { name: 'Save pug.jpg' }).isVisible(), 'phone: per-file save/share button');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
