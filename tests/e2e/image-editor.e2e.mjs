// Image Editor (#/image): real photos (EXIF orientation, GPS, HEIC), geometry, adjustments, encoders, target size;
// a transparent PNG saved as JPEG (white, not black) and as WebP (alpha kept); straightening keeps no empty corner;
// the size boxes refuse what cannot be made; resizing in linear light (a 1-pixel checkerboard halves to ≈ 187, not 128).
import { fileURLToPath } from 'node:url';
import { imageInfo, decodeInPage } from '../lib/imgcheck.mjs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));

export default async ({ base, page: newPage, ok, download, devices, tmp }) => {
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

  // test pictures: a transparent one, a checkerboard, a white sheet with a mark
  // (the paths go as arguments: inside Python's source a Windows path's \U… is an escape)
  const mk = spawnSync('python3', ['-c', `import sys
from PIL import Image
im=Image.new('RGBA',(200,100),(0,0,0,0))
for x in range(100,200):
  for y in range(100): im.putpixel((x,y),(220,20,20,255))
im.save(sys.argv[1])
cb=Image.new('RGB',(64,64))
for x in range(64):
  for y in range(64): cb.putpixel((x,y),(255,255,255) if (x+y)%2 else (0,0,0))
cb.save(sys.argv[2])
wh=Image.new('RGB',(384,191),(255,255,255))
for x in range(180,204):
  for y in range(85,105): wh.putpixel((x,y),(0,0,0))
wh.save(sys.argv[3])`, join(tmp, 'alpha.png'), join(tmp, 'checker.png'), join(tmp, 'white.png')]);
  if (mk.status !== 0) ok(false, `test images: ${mk.stderr}`);
  const openPath = async (p) => { await page.goto(base + '#/'); await page.goto(base + '#/image'); await page.locator('input[type=file]').setInputFiles(p); await page.waitForFunction(() => /\d+×\d+ · original/.test(document.querySelector('.ed-stage')?.closest('.card')?.textContent || ''), null, { timeout: 30000 }); };
  // 12. Straighten: no empty corners; the size boxes follow
  const scg = (w, h, deg) => { const a = Math.abs(deg) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), k = Math.min(w / (w * c + h * sn), h / (w * sn + h * c)); return [Math.floor(w * k), Math.floor(h * k)]; };
  await openPath(join(tmp, 'white.png'));
  await page.locator('.slider', { hasText: 'Straighten' }).locator('input[type=range]').fill('10');
  ok(String(await dims()) === String(scg(384, 191, 10)), `straighten 10°: the boxes show the kept size ${await dims()} (the largest rectangle without empty corners)`);
  const st = await save(), sti = imageInfo(st);
  const corners = await decodeInPage(page, st, [[0.01, 0.01], [0.99, 0.01], [0.01, 0.99], [0.99, 0.99]]);
  ok(String([sti.width, sti.height]) === String(scg(384, 191, 10)) && corners.px.every((p) => p[0] > 245 && p[1] > 245 && p[2] > 245), `straightened export ${sti.width}×${sti.height}: the corners are the white sheet, not black (${JSON.stringify(corners.px)})`);
  await page.locator('.slider', { hasText: 'Straighten' }).locator('input[type=range]').fill('0');

  // 13. The size boxes
  for (const [v, rx] of [['0', /The width must be at least 1 pixel/], ['-5', /The width must be at least 1 pixel/], ['99999', /at most 16,384 pixels/], ['12.5', /whole number of pixels/]]) {
    await page.getByLabel('Width (px)').fill(v);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    ok(rx.test(await page.locator('.toast').last().textContent()), `width "${v}": refused in words (−5 gave a 1-pixel picture, 0 the original size)`);
  }

  // 14. Transparency, and resizing in linear light
  await openPath(join(tmp, 'alpha.png'));
  const aj = await decodeInPage(page, await save(), [[0.25, 0.5], [0.75, 0.5]]);
  ok(aj.px[0][0] > 245 && aj.px[0][1] > 245 && aj.px[0][2] > 245 && aj.px[1][0] > 180 && aj.px[1][1] < 60, `a transparent PNG saved as JPEG: the transparent half is white (it was black): ${JSON.stringify(aj.px)}`);
  await page.getByRole('radio', { name: 'WebP' }).click();
  const aw = await decodeInPage(page, await save(), [[0.25, 0.5], [0.75, 0.5]]);
  ok(aw.px[0][3] < 10 && aw.px[1][3] > 245, `… as WebP the transparency is kept: ${JSON.stringify(aw.px)}`);
  await page.getByRole('radio', { name: 'PNG' }).click();
  await openPath(join(tmp, 'checker.png'));
  await page.getByRole('radio', { name: 'PNG' }).click();
  await page.getByLabel('Width (px)').fill('32');
  const half = await decodeInPage(page, await save(), [[0.5, 0.5], [0.25, 0.25]]);
  ok(half.px.every((p) => Math.abs(p[0] - 187) <= 4), `a 1-pixel black/white checkerboard halved is ≈ 187 grey — light averaged in linear light (sRGB arithmetic gives 128): ${JSON.stringify(half.px)}`);

  const unexpectedE = page.errors.filter((x) => !/The width (must|can|is)/.test(x)); // the Save button logs the refusals it shows
  ok(unexpectedE.length === 0, `no page errors: ${unexpectedE.join(' | ')}`);

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
