// Image Editor (#/image): real photos (EXIF orientation, GPS, HEIC), geometry, adjustments, encoders, target size.
import { imageInfo, decodeInPage } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  const open = async (file) => {
    await page.goto(base + '#/');
    await page.goto(base + '#/image');
    await page.locator('input[type=file]').setInputFiles(F(file));
    await page.waitForFunction(() => /\d+×\d+ · original/.test(document.querySelector('.ed-stage')?.closest('.card')?.textContent || ''), null, { timeout: 30000 });
  };
  const dims = async () => [+(await page.getByLabel('Width (px)').inputValue()), +(await page.getByLabel('Height (px)').inputValue())];
  const save = () => download(page, () => page.getByRole('button', { name: 'Save', exact: true }).click());
  const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

  // 1. EXIF orientation 6 displays upright (600×400), GPS photo exports without metadata
  await open('coffee-orientation6.jpg');
  ok(String(await dims()) === '600,400', `orientation 6 shown upright: ${await dims()}`);
  const upright = await save();
  const ui = imageInfo(upright);
  ok(ui.type === 'jpeg' && ui.width === 600 && ui.height === 400, `export upright 600×400 JPEG: ${JSON.stringify(ui)}`);
  ok(!ui.exif, 'export has no EXIF block');
  await open('coffee.jpg');
  const ref = await save();
  const pts = [[0.2, 0.2], [0.5, 0.5], [0.8, 0.3], [0.3, 0.8]];
  const [a, b] = [await decodeInPage(page, upright, pts), await decodeInPage(page, ref, pts)];
  ok(a.px.every((p, i) => near(p, b.px[i], 30)), `orientation-6 pixels match the upright original: ${JSON.stringify(a.px)} vs ${JSON.stringify(b.px)}`);

  await open('coffee-gps.jpg');
  const g = imageInfo(await save());
  ok(!g.exif && !g.gps, 'GPS photo: saved file has no EXIF/GPS');

  // 2. Rotate right swaps dimensions; export follows
  await open('coffee.jpg');
  await page.getByRole('button', { name: 'Rotate right' }).click();
  ok(String(await dims()) === '400,600', `rotate right → 400×600: ${await dims()}`);
  const r = imageInfo(await save());
  ok(r.width === 400 && r.height === 600, `rotated export 400×600: ${r.width}×${r.height}`);
  await page.getByRole('button', { name: 'Rotate left' }).click();
  ok(String(await dims()) === '600,400', 'rotate left restores 600×400');

  // 3. Flip horizontal mirrors pixels
  await page.getByRole('button', { name: 'Flip horizontal' }).click();
  const fl = await decodeInPage(page, await save(), [[0.15, 0.5], [0.85, 0.5]]);
  const orig = await decodeInPage(page, ref, [[0.85, 0.5], [0.15, 0.5]]);
  ok(near(fl.px[0], orig.px[0], 30) && near(fl.px[1], orig.px[1], 30), 'flip horizontal mirrors left/right');

  // 4. Resize keeps aspect ratio
  await open('coffee.jpg');
  await page.getByLabel('Width (px)').fill('300');
  ok((await page.getByLabel('Height (px)').inputValue()) === '200', 'width 300 → height 200 (ratio locked)');
  const rs = imageInfo(await save());
  ok(rs.width === 300 && rs.height === 200, `resized export 300×200: ${rs.width}×${rs.height}`);

  // 5. Crop 1:1 gives a square
  await open('coffee.jpg');
  await page.getByRole('radio', { name: '1:1' }).click();
  const [cw, ch] = await dims();
  ok(Math.abs(cw - ch) <= 1 && cw < 600, `1:1 crop dims square: ${cw}×${ch}`);
  const sq = imageInfo(await save());
  ok(Math.abs(sq.width - sq.height) <= 1, `1:1 crop export square: ${sq.width}×${sq.height}`);
  await page.getByRole('radio', { name: 'No crop' }).click();
  ok(String(await dims()) === '600,400', 'No crop restores full size');

  // 6. Exposure +1 EV brightens
  await page.locator('.slider', { hasText: 'Exposure' }).locator('input[type=range]').fill('1');
  const bright = await decodeInPage(page, await save());
  const base0 = await decodeInPage(page, ref);
  ok(bright.mean[0] + bright.mean[1] + bright.mean[2] > (base0.mean[0] + base0.mean[1] + base0.mean[2]) * 1.25, `exposure +1 brightens: ${bright.mean.slice(0, 3).map(Math.round)} vs ${base0.mean.slice(0, 3).map(Math.round)}`);
  await page.getByRole('button', { name: 'Reset adjustments' }).click();
  const reset = await decodeInPage(page, await save());
  ok(near(reset.mean.slice(0, 3), base0.mean.slice(0, 3), 3), 'reset adjustments restores the image');

  // 7. Formats: WebP and PNG (lossless, no metadata chunks)
  await page.getByRole('radio', { name: 'WebP' }).click();
  const w = imageInfo(await save());
  ok(w.type === 'webp' && w.width === 600 && w.height === 400, `WebP export: ${JSON.stringify(w)}`);
  await page.getByRole('radio', { name: 'PNG' }).click();
  const p = imageInfo(await save());
  ok(p.type === 'png' && p.width === 600 && !p.exif && !p.chunks.includes('tEXt'), `PNG export: ${p.type} ${p.width} ${p.chunks}`);

  // 8. Target file size (JPEG ≤ 20 KB, WebP ≤ 12 KB)
  await page.getByRole('radio', { name: 'JPEG' }).click();
  await page.getByRole('radio', { name: 'By file size' }).click();
  await page.getByLabel('Maximum file size (KB)').fill('20');
  const t = imageInfo(await save());
  ok(t.type === 'jpeg' && t.size <= 20 * 1024 && t.size > 8 * 1024, `target 20 KB → ${t.size} bytes`);
  await page.getByRole('radio', { name: 'WebP' }).click();
  await page.getByLabel('Maximum file size (KB)').fill('12');
  const tw = imageInfo(await save());
  ok(tw.type === 'webp' && tw.size <= 12 * 1024, `WebP target 12 KB → ${tw.size} bytes`);

  // 9. Real HEIC photo opens and exports
  await open('pug.heic');
  const [hw, hh] = await dims();
  ok(hw > 100 && hh > 100, `HEIC opened: ${hw}×${hh}`);
  const hj = imageInfo(await save());
  ok(hj.type === 'jpeg' && hj.width === hw && hj.height === hh, `HEIC → JPEG ${hj.width}×${hj.height}`);

  // 10. PNG with alpha/greyscale input (scanned page) and large WebP round trip
  await open('page.png');
  ok(String(await dims()) === '384,191', 'greyscale PNG opens at 384×191');

  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // 11. Phone: Share button, no horizontal scroll
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/image');
  await phone.locator('input[type=file]').setInputFiles(F('coffee.jpg'));
  await phone.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  ok(await phone.getByRole('button', { name: 'Share' }).isVisible(), 'phone: Share button shown');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  const btn = await phone.getByRole('button', { name: 'Save', exact: true }).boundingBox();
  ok(btn && btn.height >= 44, `phone: Save button ≥44 px tall (${btn?.height})`);
  ok(phone.errors.length === 0, `phone: no errors: ${phone.errors.join(' | ')}`);
};
