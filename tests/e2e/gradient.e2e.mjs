// CSS Gradient (#/gradient, PC only): generated CSS for linear / radial / conic / repeating with sorted stops, the
// browser accepts it (computed background-image is a gradient), the preview's pixels follow the stops (sampled from a
// screenshot: 0 %, 25 % = halfway between stop 1 and 2, 50 %, 100 %), add/remove stops, at least two, copy, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/gradient`);
  const prev = page.locator('.grad-preview'), code = page.locator('.css-out'); await prev.waitFor();
  ok(await code.textContent() === 'background: linear-gradient(90deg, #ff9933 0%, #ffffff 50%, #138808 100%);', `default tricolour CSS (${await code.textContent()})`);
  ok(/^linear-gradient\(90deg, rgb\(255, 153, 51\) 0%, rgb\(255, 255, 255\) 50%, rgb\(19, 136, 8\) 100%\)$/.test(await prev.evaluate((e) => getComputedStyle(e).backgroundImage)), 'the browser accepts it');
  const sample = async (fracs) => { const b = await prev.boundingBox(); const png = await page.screenshot({ clip: b }); return page.evaluate(async ([b64, fr]) => { const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d'); g.drawImage(bm, 0, 0); return fr.map((f) => [...g.getImageData(Math.min(bm.width - 3, Math.max(2, Math.round(f * bm.width))), bm.height >> 1, 1, 1).data.slice(0, 3)]); }, [png.toString('base64'), fracs]); };
  const near = (a, b, t = 4) => a.every((v, i) => Math.abs(v - b[i]) <= t);
  let px = await sample([0, 0.25, 0.5, 1]);
  ok(near(px[0], [255, 153, 51]) && near(px[1], [255, 204, 153], 5) && near(px[2], [255, 255, 255]) && near(px[3], [19, 136, 8]), `preview pixels follow the stops (${JSON.stringify(px)})`);
  const pos = page.locator('input[aria-label="Stop 2 position"]'); await pos.fill('100'); await page.locator('input[aria-label="Stop 3 position"]').fill('40');
  ok(await code.textContent() === 'background: linear-gradient(90deg, #ff9933 0%, #138808 40%, #ffffff 100%);', 'stops are written in position order');
  await page.locator('input[type=range]').fill('180'); await page.locator('input[type=range]').dispatchEvent('input'); ok((await code.textContent()).includes('linear-gradient(180deg'), 'angle slider');
  await page.getByRole('radio', { name: 'Radial' }).click(); await page.locator('select').first().selectOption('ellipse'); await page.locator('select').nth(1).selectOption('top left');
  ok((await code.textContent()).startsWith('background: radial-gradient(ellipse at top left, ') && /radial-gradient/.test(await prev.evaluate((e) => getComputedStyle(e).backgroundImage)), 'radial, ellipse at top left');
  await page.getByRole('radio', { name: 'Conic' }).click(); ok((await code.textContent()).startsWith('background: conic-gradient(from 180deg at top left, ') && /conic-gradient/.test(await prev.evaluate((e) => getComputedStyle(e).backgroundImage)), 'conic');
  await page.locator('label.switch', { hasText: 'Repeating' }).click(); ok((await code.textContent()).startsWith('background: repeating-conic-gradient('), 'repeating');
  await page.getByRole('button', { name: 'Add colour' }).click(); ok(await page.locator('.stop-row').count() === 4 && (await code.textContent()).includes('#4f46e5 100%'), 'add a stop');
  await page.locator('input[aria-label="Stop 4 colour"]').fill('#00f'); ok((await code.textContent()).includes('#0000ff 100%'), 'edit a stop colour (short hex normalised)');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Remove stop 1' }).click();
  ok(await page.locator('.stop-row').count() === 2 && /at least two colours/.test(await page.locator('.toast').last().textContent()), 'cannot go below two stops');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/at least two/.test(e)));
  await page.getByRole('button', { name: 'Copy CSS' }).click(); ok(await page.evaluate(() => navigator.clipboard.readText()) === await code.textContent(), 'Copy CSS');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'gradient');
};
