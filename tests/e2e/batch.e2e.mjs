// Batch Images (#/batch, PC only): real photos of several formats → resize/convert/limit size → zip; names that would
// clash get " (2)"; sizes that cannot be made refused; a file that is no image named in a list, the others made; Stop.
import { imageInfo, zipEntries } from '../lib/imgcheck.mjs';
import { readFileSync } from 'node:fs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices, released }) => {
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

  // names that would clash, a file that is no image, sizes that cannot be made, Stop
  const fresh = async (files) => { await page.getByRole('button', { name: 'Clear list' }).click(); await page.locator('input[type=file]').setInputFiles(files); };
  await page.getByRole('radio', { name: 'JPEG' }).click(); await page.getByRole('radio', { name: 'Long side' }).click(); await page.getByLabel('Long side (px)').fill('200');
  await fresh([{ name: 'coffee.jpg', mimeType: 'image/jpeg', buffer: readFileSync(F('coffee.jpg')) }, { name: 'coffee.jpg', mimeType: 'image/jpeg', buffer: readFileSync(F('coffee-gps.jpg')) }, { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a picture') }, { name: 'chelsea.png', mimeType: 'image/png', buffer: readFileSync(F('chelsea.png')) }]);
  await run(3);
  const n2 = await page.locator('.result-row .file-name').allTextContents();
  ok(String(n2) === 'coffee.jpg,coffee (2).jpg,chelsea.jpg', `two files of one name: "coffee (2).jpg" (both were "coffee.jpg" — one overwrote the other in the zip): ${n2}`);
  ok(/1 image could not be processed:.*broken\.jpg/.test(await page.locator('.note-err').textContent()), `a file that is no image is named in a list, the others are made (it was a toast that vanished): ${await page.locator('.note-err').textContent()}`);
  const z2 = zipEntries(await download(page, () => page.getByRole('button', { name: /Download all \(3\)/ }).click()));
  ok(z2 && z2.includes('coffee.jpg') && z2.includes('coffee (2).jpg') && z2.length === 3, `the zip holds both: ${z2}`);
  await page.getByLabel('File names').fill('photo');
  await run(3);
  ok(String(await page.locator('.result-row .file-name').allTextContents()) === 'photo.jpg,photo (2).jpg,photo (3).jpg', 'a pattern without {n}: photo.jpg, photo (2).jpg …');
  await page.getByLabel('File names').fill('{name}');
  for (const [v, rx] of [['-5', /at least 1 pixel/], ['0', /at least 1 pixel/], ['12.5', /whole number of pixels/]]) {
    await page.getByLabel('Long side (px)').fill(v); await page.getByRole('button', { name: 'Process images' }).click();
    ok(rx.test(await page.locator('.toast').last().textContent()), `long side "${v}": refused in words (−5 made 1-pixel pictures)`);
  }
  await page.getByRole('radio', { name: 'Percent' }).click(); await page.getByLabel('Scale (%)').fill('0'); await page.getByRole('button', { name: 'Process images' }).click();
  ok(/percentage above 0/.test(await page.locator('.toast').last().textContent()), 'scale 0 %: refused');
  await page.getByLabel('Scale (%)').fill('100');
  await fresh(Array.from({ length: 40 }, (_, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: readFileSync(F('coffee.jpg')) })));
  await page.getByRole('button', { name: 'Process images' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.result-row').length >= 2, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.waitForFunction(() => /Stopped/.test(document.querySelector('.progress-label')?.textContent || ''), null, { timeout: 60000 });
  ok((await page.locator('.result-row').count()) < 40, `Stop ends the run after the image in hand (${await page.locator('.result-row').count()} of 40 made)`);
  const unexpectedB = page.errors.filter((x) => !/pixel|percentage/.test(x));
  ok(unexpectedB.length === 0, `no page errors: ${unexpectedB.join(' | ')}`);

  // PC only: hidden on phones
  // leaving the tab lets go of what it made: its results' blob URLs (they kept the files in memory until the page reloaded)
  { const had = await page.evaluate((id) => [...window.__blobs.values()].filter((b) => b.at.startsWith(`#/${id}`) && !b.download && !/javascript/.test(b.type)).length, 'batch');
    const kept = await released(page, 'batch');
    ok(kept.length === 0, `leaving the tab: ${had} blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/batch');
  ok(/PC|computer|desktop/i.test(await phone.locator('body').innerText()), 'phone: explains Batch Images is PC only');
};
