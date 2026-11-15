// EXIF / Photo Info (#/exif): real photos with GPS/camera EXIF; lossless strip; HEIC re-encode.
import { imageInfo } from '../lib/imgcheck.mjs';
import { readFileSync } from 'node:fs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  const open = async (f) => {
    await page.goto(base + '#/'); await page.goto(base + '#/exif');
    await page.locator('input[type=file]').setInputFiles(F(f));
    await page.waitForSelector('.exif-thumb', { timeout: 30000 });
    return page.locator('main, body').first().innerText();
  };
  let t = await open('coffee-gps.jpg');
  ok(t.includes('18.922100') && t.includes('72.834667'), 'GPS decimal coordinates shown');
  ok(t.includes('18° 55′ 19.56″ N') && t.includes('72° 50′ 4.80″ E'), 'GPS in degrees/minutes/seconds');
  ok(/SuperToolsCam/.test(t) && /Fixture One/.test(t) && /1\/250 s/.test(t) && /f\/1\.8/.test(t) && /ISO\s*200/.test(t), 'camera + exposure fields');
  ok(/2025-12-31 18:45:00/.test(t), 'date taken formatted');
  ok(/600 × 400/.test(t), 'pixel size');
  const osm = await page.getByRole('link', { name: /OpenStreetMap/ }).getAttribute('href');
  ok(osm.startsWith('https://www.openstreetmap.org/?mlat=18.922100&mlon=72.834667'), 'map link (opened only on click)');
  const out = await download(page, () => page.getByRole('button', { name: 'Save without metadata' }).click());
  const oi = imageInfo(out), orig = readFileSync(F('coffee-gps.jpg')), clean = readFileSync(out);
  ok(oi.type === 'jpeg' && !oi.exif && !oi.gps && oi.width === 600, 'clean JPEG: no EXIF/GPS, same size');
  ok(Buffer.compare(clean.subarray(clean.length - 8192), orig.subarray(orig.length - 8192)) === 0, 'picture data byte-identical (lossless)');
  ok(clean.length < orig.length, 'file got smaller');

  t = await open('coffee.png');
  ok(/no EXIF metadata/i.test(t), 'PNG without EXIF: friendly note');
  const pclean = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save without metadata' }).click()));
  ok(pclean.type === 'png' && !pclean.chunks.includes('tIME'), 'PNG strip keeps PNG, drops tIME');

  t = await open('flower.jpg');
  ok(/All tags/.test(t), 'real camera photo shows the full tag list');

  t = await open('exif_gps.jpg');
  ok(!/Location \(GPS\)/.test(t), 'malformed GPS is not shown as a location');

  t = await open('pug.heic');
  ok(/re-saved as a high-quality JPEG/.test(t), 'HEIC: explains re-encode');
  const hj = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save without metadata' }).click()));
  ok(hj.type === 'jpeg' && !hj.exif && hj.width > 0, 'HEIC → clean JPEG');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/exif');
  await phone.locator('input[type=file]').setInputFiles(F('coffee-gps.jpg'));
  await phone.waitForSelector('.exif-thumb', { timeout: 30000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  ok(phone.errors.length === 0, `phone: no errors: ${phone.errors.join(' | ')}`);
};
