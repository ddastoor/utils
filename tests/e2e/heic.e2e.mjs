// HEIC → JPG (#/heic): real iPhone-style HEIC files (pillow-heif test images) → JPEG/PNG/WebP, zip of all; Display P3
// colours turned into sRGB (a patch chart, held to Pillow's ImageCms — tests/fixtures/heic/reference.json); files that
// are no photo listed, the others converted.
import { imageInfo, zipEntries, decodeInPage } from '../lib/imgcheck.mjs';
import { readFileSync } from 'node:fs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices, released }) => {
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

  // Display P3 → sRGB (as an iPhone photo carries it), checked on a chart of saturated patches
  const ref = JSON.parse(readFileSync(new URL('../fixtures/heic/reference.json', import.meta.url), 'utf8')).files['p3-colours.heic'];
  await page.getByRole('radio', { name: 'PNG' }).click();
  await page.locator('input[type=file]').setInputFiles(F('p3-colours.heic'));
  await page.waitForFunction(() => document.querySelectorAll('.result-row').length === 5, null, { timeout: 60000 });
  const chart = await decodeInPage(page, await download(page, () => page.getByRole('button', { name: 'Save p3-colours.png' }).click()), ref.points.map(([x, y]) => [x / 96, y / 64]));
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 3);
  ok(chart.px.every((p, i) => near(p.slice(0, 3), ref.srgb[i])), `P3 colours in sRGB = Pillow's ImageCms (red ${chart.px[0].slice(0, 3)} vs ${ref.srgb[0]}; it was ${ref.decoded[0]} — the photo's numbers without its profile)`);
  await page.locator('input[type=file]').setInputFiles([{ name: 'notes.heic', mimeType: 'image/heic', buffer: Buffer.from('not a photo') }, { name: 'pug.heic', mimeType: 'image/heic', buffer: readFileSync(F('pug.heic')) }]);
  await page.waitForFunction(() => document.querySelectorAll('.result-row').length === 6, null, { timeout: 60000 });
  ok(/1 file could not be converted:.*notes\.heic/.test(await page.locator('.note-err').textContent()), `a file that is no photo is listed (it was a toast that vanished); the other is converted: ${await page.locator('.note-err').textContent()}`);
  ok((await page.locator('.result-row .file-name').allTextContents()).includes('pug (2).png'), 'a second result of one name gets " (2)" (pug.png was there)');

  // a non-HEIC file is converted too (JPEG input), a broken file gives a clear error and no result
  await page.getByRole('radio', { name: 'JPG' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: Buffer.from('not really a heic file at all') });
  await page.waitForFunction(() => /broken\.heic/.test(document.querySelector('.note-err')?.textContent || ''), null, { timeout: 30000 });
  ok((await page.locator('.result-row').count()) === 6 && /not a photo this tool can read/.test(await page.locator('.note-err').textContent()), 'broken file adds no result; it is listed with the reason');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/HEIC|heif|Not a readable|not supported/i.test(e)));
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // leaving the tab lets go of what it made: its results' blob URLs (they kept the files in memory until the page reloaded)
  { const had = await page.evaluate((id) => [...window.__blobs.values()].filter((b) => b.at.startsWith(`#/${id}`) && !b.download && !/javascript/.test(b.type)).length, 'heic');
    const kept = await released(page, 'heic');
    ok(kept.length === 0, `leaving the tab: ${had} blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/heic');
  await phone.locator('input[type=file]').setInputFiles(F('pug.heic'));
  await phone.waitForSelector('.result-row', { timeout: 60000 });
  ok(await phone.getByRole('button', { name: 'Save pug.jpg' }).isVisible(), 'phone: per-file save/share button');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
