import zlib from 'node:zlib';
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
  // a scan states its resolution: "Fit to image" keeps its paper size (a 300 dpi page of 900 × 1200 px is 3 × 4 inches;
  // at 150 dpi it was twice that); a photo that states 72 dpi or nothing keeps 150 dpi
  const png = (w, hh, dpi) => {
    const { deflateSync, crc32 } = zlib;
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(hh, 4); ihdr[8] = 8; ihdr[9] = 0;
    const phys = Buffer.alloc(9); phys.writeUInt32BE(Math.round(dpi / 0.0254), 0); phys.writeUInt32BE(Math.round(dpi / 0.0254), 4); phys[8] = 1;
    const rows = Buffer.alloc((w + 1) * hh, 255); for (let y = 0; y < hh; y++) { rows[y * (w + 1)] = 0; if (y > hh / 4 && y < hh / 4 + 20) rows.fill(0, y * (w + 1) + 1 + 50, y * (w + 1) + 1 + w - 50); }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('pHYs', phys), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  };
  const p3 = await newPage();
  await p3.goto(base + '#/img2pdf');
  await p3.locator('input[type=file]').first().setInputFiles([
    { name: 'page-10.png', mimeType: 'image/png', buffer: png(900, 1200, 300) },
    { name: 'page-2.png', mimeType: 'image/png', buffer: png(900, 1200, 72) },
    { name: 'page-1.png', mimeType: 'image/png', buffer: png(600, 800, 600) }]);
  await p3.waitForFunction(() => document.querySelectorAll('.pdf-tile').length === 3);
  await p3.getByRole('button', { name: 'Sort by file name' }).click();
  ok((await p3.locator('.pdf-tile-label').allTextContents()).join('|') === '1. page-1.png|2. page-2.png|3. page-10.png', `"Sort by file name": page-1, page-2, page-10 (${(await p3.locator('.pdf-tile-label').allTextContents()).join(', ')})`);
  await p3.getByRole('radio', { name: 'Fit to image' }).click();
  const i3 = await pdfInfo(await download(p3, () => p3.getByRole('button', { name: 'Make PDF' }).click()));
  ok(i3.list[0].w === 72 && i3.list[0].h === 96 && i3.list[1].w === 432 && i3.list[1].h === 576 && i3.list[2].w === 216 && i3.list[2].h === 288,
    `Fit: 600 dpi → 1 × 1⅓ in, 72 dpi → at 150 dpi, 300 dpi → 3 × 4 in (${i3.list.map((p) => `${p.w}×${p.h}`).join(', ')})`);
  ok(page.errors.length === 0 && p3.errors.length === 0, `no page errors: ${[...page.errors, ...p3.errors].join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/img2pdf');
  await phone.locator('input[type=file]').first().setInputFiles([I('coffee.jpg'), I('chelsea.png')]);
  await phone.waitForFunction(() => document.querySelectorAll('.pdf-tile').length === 2);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
