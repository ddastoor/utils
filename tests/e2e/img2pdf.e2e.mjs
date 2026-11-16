// Images → PDF (#/img2pdf): real JPG/PNG/HEIC photos → one page each; JPEG embedded byte-for-byte; A4 / Fit sizes.
import { readFileSync } from 'node:fs';
import { pdfInfo, renderGrey } from '../lib/pdfcheck.mjs';
const I = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/img2pdf');
  await page.locator('input[type=file]').first().setInputFiles([I('coffee.jpg'), I('chelsea.png'), I('pug.heic'), I('coffee-orientation6.jpg')]);
  await page.waitForFunction(() => document.querySelectorAll('.pdf-tile').length === 4, null, { timeout: 60000 });
  const make = () => download(page, () => page.getByRole('button', { name: 'Make PDF' }).click());
  const f1 = await make(), i1 = await pdfInfo(f1);
  ok(i1.pages === 4, `four pages (${i1.pages})`);
  ok(i1.list[0].w === 842 && i1.list[0].h === 595, `wide photo on a landscape A4 page (${i1.list[0].w}×${i1.list[0].h})`);
  const pdfBytes = readFileSync(f1), jpg = readFileSync(I('coffee.jpg'));
  ok(pdfBytes.includes(jpg.subarray(2, 4000)), 'the upright JPEG is embedded unchanged (no re-compression)');
  // coffee-orientation6.jpg stores the pixels turned 90° with EXIF Orientation 6: shown upright it is landscape again,
  // so it gets a landscape page and is re-encoded (a raw copy would come out sideways)
  const rotJpg = readFileSync(I('coffee-orientation6.jpg'));
  ok(i1.list[3].w === 842 && i1.list[3].h === 595 && !pdfBytes.includes(rotJpg.subarray(200, 2000)), `EXIF-rotated photo placed upright (${i1.list[3].w}×${i1.list[3].h}, re-encoded)`);
  const r = await renderGrey(f1, 0, 0.5);
  ok(r.mean(0.4, 0.4, 0.6, 0.6) < 200 && r.mean(0.0, 0.0, 0.01, 0.01) > 250, 'photo drawn in the middle, white margin around it');
  // reorder, remove, then Fit to image
  await page.getByRole('button', { name: 'Remove pug.heic' }).click();
  await page.getByRole('button', { name: 'Move chelsea.png earlier' }).click();
  await page.getByRole('radio', { name: 'Fit to image' }).click();
  const i2 = await pdfInfo(await make());
  ok(i2.pages === 3, 'removed image is gone');
  ok(i2.list[0].w === Math.round(451 * 72 / 150) && i2.list[0].h === Math.round(300 * 72 / 150), `Fit: page = image size at 150 dpi, cat first (${i2.list[0].w}×${i2.list[0].h})`);
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/img2pdf');
  await phone.locator('input[type=file]').first().setInputFiles([I('coffee.jpg'), I('chelsea.png')]);
  await phone.waitForFunction(() => document.querySelectorAll('.pdf-tile').length === 2);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
