// Watermark (#/watermark): real photos; text (corner + tiled) and logo watermarks; batch + zip; formats.
import { imageInfo, regionMeans, lum, zipEntries } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/watermark');
  await page.locator('input[type=file]').first().setInputFiles([F('coffee.jpg'), F('chelsea.png')]);
  await page.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  const runAll = async () => {
    await page.getByRole('button', { name: 'Watermark all' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.result-row').length === 2, null, { timeout: 60000 });
  };
  const BR = [0.55, 0.86, 0.97, 0.97], TL = [0.03, 0.03, 0.4, 0.2];
  const [origBR, origTL] = await regionMeans(page, F('coffee.jpg'), [BR, TL]);

  // text, bottom-right (default), white 60% → bottom-right brighter, top-left untouched
  await page.getByLabel('Text', { exact: true }).fill('© SUPERTOOLS TEST');
  await runAll();
  const names = await page.locator('.result-row .file-name').allTextContents();
  ok(String(names) === 'coffee-watermarked.jpg,chelsea-watermarked.jpg', `outputs: ${names}`);
  const out1 = await download(page, () => page.getByRole('button', { name: 'Save coffee-watermarked.jpg' }).click());
  const [br1, tl1] = await regionMeans(page, out1, [BR, TL]);
  ok(lum(br1) > lum(origBR) + 6, `bottom-right got brighter (${lum(origBR).toFixed(1)} → ${lum(br1).toFixed(1)})`);
  ok(Math.abs(lum(tl1) - lum(origTL)) < 3, `top-left unchanged (${lum(origTL).toFixed(1)} vs ${lum(tl1).toFixed(1)})`);
  const i1 = imageInfo(out1); ok(i1.width === 600 && i1.height === 400 && !i1.exif, 'full size, no metadata');
  const z = zipEntries(await download(page, () => page.getByRole('button', { name: /Download all \(2\)/ }).click()));
  ok(z?.length === 2, 'zip of both');

  // top-left position moves it
  await page.getByRole('radio', { name: '↖' }).click();
  await runAll();
  const [br2, tl2] = await regionMeans(page, await download(page, () => page.getByRole('button', { name: 'Save coffee-watermarked.jpg' }).click()), [BR, TL]);
  ok(lum(tl2) > lum(origTL) + 4 && Math.abs(lum(br2) - lum(origBR)) < 3, 'top-left position: only top-left changed');

  // tiled covers the whole image
  await page.getByRole('radio', { name: 'Tiled' }).click();
  await page.locator('.slider', { hasText: 'Opacity' }).locator('input').fill('80');
  await runAll();
  const quads = [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
  const before = await regionMeans(page, F('coffee.jpg'), quads), after = await regionMeans(page, await download(page, () => page.getByRole('button', { name: 'Save coffee-watermarked.jpg' }).click()), quads);
  ok(after.every((m, i) => lum(m) > lum(before[i]) + 0.8), `tiled: every quadrant brighter ${after.map((m, i) => (lum(m) - lum(before[i])).toFixed(1))}`);

  // logo watermark (astronaut photo as the "logo"), PNG output
  await page.getByRole('radio', { name: 'Logo' }).click();
  await page.locator('input[type=file]').nth(1).setInputFiles(F('astronaut.png'));
  await page.getByRole('radio', { name: '↘' }).click();
  await page.locator('.slider', { hasText: 'Size' }).locator('input').fill('10');
  await page.locator('.slider', { hasText: 'Opacity' }).locator('input').fill('100');
  await page.getByRole('radio', { name: 'PNG' }).click();
  await page.getByRole('button', { name: 'Watermark all' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.result-row .file-name')].some((e) => e.textContent.endsWith('.png')), null, { timeout: 60000 });
  const lp = await download(page, () => page.getByRole('button', { name: 'Save coffee-watermarked.png' }).click());
  const li = imageInfo(lp); ok(li.type === 'png' && li.width === 600, 'PNG output');
  const [lbr, ltl] = await regionMeans(page, lp, [[0.7, 0.7, 0.95, 0.95], TL]);
  ok(Math.abs(lum(lbr) - lum(origBR)) > 8 && Math.abs(lum(ltl) - lum(origTL)) < 3, 'logo drawn bottom-right only');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/watermark');
  await phone.locator('input[type=file]').first().setInputFiles(F('coffee.jpg'));
  await phone.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  ok(phone.errors.length === 0, `phone: no errors: ${phone.errors.join(' | ')}`);
};
