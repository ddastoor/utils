// Watermark (#/watermark): real photos; text (corner + tiled) and logo watermarks; batch + zip; formats.
import { imageInfo, regionMeans, lum, zipEntries } from '../lib/imgcheck.mjs';
const F = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;

export default async ({ base, page: newPage, ok, download, devices, released }) => {
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
  // a logo that cannot be opened is said with its name
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'broken-logo.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
  ok(await page.locator('.toast', { hasText: 'broken-logo.png' }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'a logo that cannot be opened: said with its name');

  // empty text is refused
  await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.getByLabel('Text', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Watermark all' }).click();
  ok(await page.locator('.toast', { hasText: 'Type the text of the watermark' }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'empty text: "Type the text of the watermark."');
  await page.getByLabel('Text', { exact: true }).fill('© TEST');

  // Clear photos; a first photo that cannot be opened does not block the preview; a bad one later is listed
  await page.getByRole('button', { name: 'Clear photos' }).click();
  ok(await page.locator('.ed-canvas').isHidden() && !(await page.getByRole('button', { name: 'Clear photos' }).isVisible()), 'Clear photos empties the list and the preview');
  await page.locator('input[type=file]').first().setInputFiles([{ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('no picture here') }, { name: 'coffee.jpg', mimeType: 'image/jpeg', buffer: (await import('node:fs')).readFileSync(F('coffee.jpg')) }]);
  await page.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  ok(await page.locator('.toast', { hasText: 'broken.jpg' }).first().isVisible().catch(() => false) || await page.locator('.toast', { hasText: 'broken.jpg' }).count() > 0, 'an unreadable first photo is said …');
  ok(/^1 photo: coffee\.jpg$/.test((await page.locator('.row', { has: page.getByRole('button', { name: 'Clear photos' }) }).first().innerText()).replace(/\s*Clear photos\s*/, '').trim()), '… left out, and the next photo is the preview');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'later.png', mimeType: 'image/png', buffer: Buffer.from('broken too') });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Watermark all' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.result-row').length === 1 && /could not be watermarked/.test(document.body.innerText), null, { timeout: 60000 });
  ok(/1 photo could not be watermarked:[\s\S]*later\.png/.test(await page.locator('.note-err').last().innerText()), 'a photo that fails in the run is listed under the results; the others are made');
  const errs = page.errors.filter((e) => !/^Error: Type the text of the watermark/.test(e)); // the refusal above, logged by the button
  ok(errs.length === 0, `no page errors: ${errs.join(' | ')}`);

  // leaving the tab lets go of what it made: its results' blob URLs (they kept the files in memory until the page reloaded)
  { const had = await page.evaluate((id) => [...window.__blobs.values()].filter((b) => b.at.startsWith(`#/${id}`) && !b.download && !/javascript/.test(b.type)).length, 'watermark');
    const kept = await released(page, 'watermark');
    ok(kept.length === 0, `leaving the tab: ${had} blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/watermark');
  await phone.locator('input[type=file]').first().setInputFiles(F('coffee.jpg'));
  await phone.waitForSelector('.ed-canvas', { state: 'visible', timeout: 30000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
  ok(phone.errors.length === 0, `phone: no errors: ${phone.errors.join(' | ')}`);
};
