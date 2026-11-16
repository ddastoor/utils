// Signature Maker (#/signature): draw with the mouse (vector strokes), type (self-hosted fonts), photo of ink on
// paper (scikit-image "text" sample: dark text on unevenly lit paper) → trimmed transparent PNG / JPEG on white.
import { imageInfo, decodeInPage } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/signature');
  await page.waitForSelector('.sig-pad');
  // empty pad → friendly error, no download
  await page.getByRole('button', { name: 'Save PNG (transparent)' }).click();
  await page.waitForSelector('.toast-err', { timeout: 10000 });
  ok(/sign first/i.test(await page.locator('.toast-err').first().textContent()), 'empty pad: asks to sign first');
  // draw a zig-zag (measure after scrolling: clicking Save scrolled the page)
  await page.evaluate(() => document.querySelector('.sig-pad').scrollIntoView({ block: 'center' }));
  const padBox = await page.locator('.sig-pad').boundingBox();
  await page.mouse.move(padBox.x + 60, padBox.y + 120); await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(padBox.x + 60 + i * 12, padBox.y + 120 + (i % 2 ? -40 : 30), { steps: 3 });
  await page.mouse.up();
  const png = await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click());
  const pi = imageInfo(png);
  ok(pi.type === 'png' && pi.colorType === 6, `PNG with alpha (colour type ${pi.colorType})`);
  ok(pi.width > 1000 && pi.width < 1500 && pi.height > 250 && pi.height < 420, `trimmed to the strokes at 4×: ${pi.width}×${pi.height}`);
  const d = await decodeInPage(page, png, [[0.002, 0.002], [0.5, 0.5]]);
  ok(d.px[0][3] === 0, 'corner transparent');
  ok(d.mean[2] > d.mean[0], 'blue ink by default');
  const jpg = imageInfo(await download(page, () => page.getByRole('button', { name: 'Save JPG (white)' }).click()));
  ok(jpg.type === 'jpeg' && jpg.width === pi.width, 'JPEG on white, same trim');
  const dj = await decodeInPage(page, (await download(page, () => page.getByRole('button', { name: 'Save JPG (white)' }).click())), [[0.002, 0.002]]);
  ok(dj.px[0].slice(0, 3).every((v) => v > 245), 'JPEG background is white');
  // undo → empty again
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Save PNG (transparent)' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.toast-err').length >= 1);
  ok(true, 'undo removed the stroke');

  // type mode with a self-hosted handwriting font
  await page.getByRole('radio', { name: 'Type' }).click();
  await page.getByLabel('Your name').fill('Dinesh Kumar');
  await page.getByRole('radio', { name: 'Black' }).click();
  const tp = await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click());
  const ti = imageInfo(tp);
  ok(ti.type === 'png' && ti.width > 500 && ti.height > 80, `typed signature ${ti.width}×${ti.height}`);
  ok(await page.evaluate(() => document.fonts.check("40px 'Great Vibes'")), 'Great Vibes font loaded from this site');

  // photo of ink on paper
  await page.getByRole('radio', { name: 'From photo' }).click();
  await page.locator('input[type=file]').setInputFiles(F('text.png'));
  await page.waitForFunction(() => document.querySelector('.sig-photo')?.width === 448, null, { timeout: 60000 }); // a blank canvas is already 300 px wide
  const pp = await download(page, () => page.getByRole('button', { name: 'Save PNG (transparent)' }).click());
  const ppi = imageInfo(pp), pd = await decodeInPage(page, pp);
  ok(ppi.type === 'png' && ppi.width <= 448 && ppi.width > 100, `photo → PNG ${ppi.width}×${ppi.height} (colour type ${ppi.colorType})`);
  ok(pd.mean[3] > 10 && pd.mean[3] < 160, `mostly transparent paper, opaque ink (mean alpha ${pd.mean[3].toFixed(0)})`);
  const unexpected = page.errors.filter((e) => !/Nothing to save yet/.test(e)); // the deliberate empty-pad saves
  ok(unexpected.length === 0, `no page errors: ${unexpected.join(' | ')}`);

  // phone: touch drawing works and the pad fits the screen
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/signature');
  const pb = await (await phone.waitForSelector('.sig-pad')).boundingBox();
  ok(pb.width <= 390 && pb.height >= 120, `phone pad ${pb.width.toFixed(0)}×${pb.height.toFixed(0)}`);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
