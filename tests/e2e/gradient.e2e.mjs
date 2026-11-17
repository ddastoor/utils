// CSS Gradient (#/gradient, PC only): generated CSS for linear / radial / conic / repeating with sorted stops, the
// browser accepts it (computed background-image is a gradient), the preview's pixels follow the stops (sampled from a
// screenshot: 0 %, 25 % = halfway between stop 1 and 2, 50 %, 100 %), only the controls the type uses are live, a new
// stop goes into the widest gap in the gradient's own colour there, positions outside 0–100 are brought back, colours
// with transparency / rgb() / names, add/remove stops, at least two, copy, phone note.
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
  await page.getByRole('button', { name: 'Add colour' }).click(); ok(await page.locator('.stop-row').count() === 4 && (await code.textContent()).includes('#89c484 70%'), `add a stop: in the widest gap (40 %–100 % → 70 %), in the colour half-way between its neighbours (${await code.textContent()})`);
  await page.locator('input[aria-label="Stop 4 colour"]').fill('#00f'); ok((await code.textContent()).includes('#0000ff 70%'), 'edit a stop colour (short hex normalised)');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Remove stop 1' }).click();
  ok(await page.locator('.stop-row').count() === 2 && /at least two colours/.test(await page.locator('.toast').last().textContent()), 'cannot go below two stops');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/at least two/.test(e)));
  await page.getByRole('button', { name: 'Copy CSS' }).click(); ok(await page.evaluate(() => navigator.clipboard.readText()) === await code.textContent(), 'Copy CSS');
  // a fresh page: which controls are live for which type
  const p2 = await newPage(); await p2.goto(`${base}#/gradient`); const code2 = p2.locator('.css-out'); await p2.locator('.grad-preview').waitFor();
  const live = () => p2.evaluate(() => [document.querySelector('.slider input').disabled, ...[...document.querySelectorAll('select')].map((x) => x.disabled)]);
  ok(JSON.stringify(await live()) === '[false,true,true]', 'linear: angle live; radial shape and centre off (they are not part of a linear gradient)');
  await p2.getByRole('radio', { name: 'Radial' }).click(); ok(JSON.stringify(await live()) === '[true,false,false]' && !/deg/.test(await code2.textContent()), 'radial: angle off (a radial gradient has none), shape and centre live');
  await p2.getByRole('radio', { name: 'Conic' }).click(); ok(JSON.stringify(await live()) === '[false,true,false]', 'conic: angle and centre live, shape off');
  await p2.locator('select').nth(1).selectOption('bottom right'); ok((await code2.textContent()).includes('at bottom right'), 'centre: bottom right');
  await p2.getByRole('radio', { name: 'Linear' }).click();
  // positions: out of range, empty, decimals
  const pos2 = p2.locator('input[aria-label="Stop 2 position"]');
  await pos2.fill('150'); ok((await code2.textContent()).includes('#ffffff 100%'), '150 is used as 100');
  await pos2.blur(); ok(await pos2.inputValue() === '100', '… and the box shows 100 once it is left (it used to keep 150)');
  await pos2.fill('-20'); await pos2.blur(); ok(await pos2.inputValue() === '0' && (await code2.textContent()).includes('#ffffff 0%'), '-20 becomes 0');
  await pos2.fill('33.333'); ok((await code2.textContent()).includes('#ffffff 33.333%'), 'decimal positions are kept');
  await pos2.fill(''); await pos2.blur(); ok(await pos2.inputValue() === '0', 'an empty position is 0');
  await pos2.fill('50');
  // colours: transparency, rgb(), names
  const c2 = p2.locator('input[aria-label="Stop 2 colour"]');
  await c2.fill('#ff000080'); ok((await code2.textContent()).includes('#ff000080 50%') && /rgba\(255, 0, 0, 0\.5\d*\) 50%/.test(await p2.locator('.grad-preview').evaluate((e) => getComputedStyle(e).backgroundImage)), 'an 8-digit colour keeps its transparency in the CSS and the preview (it used to be dropped)');
  await c2.fill('rgba(0, 0, 255, 0.25)'); ok((await code2.textContent()).includes('#0000ff40 50%'), 'rgba() → #0000ff40');
  await c2.fill('gold'); ok((await code2.textContent()).includes('#ffd700 50%') && await p2.locator('input[aria-label="Stop 2 colour picker"]').inputValue() === '#ffd700', 'a colour name → #ffd700, picker follows');
  await c2.fill('nope'); ok(await c2.evaluate((e) => e.classList.contains('bad')) && (await code2.textContent()).includes('#ffd700 50%'), 'a bad colour is marked and the last good one stays');
  // adding stops: each goes into the widest gap
  await c2.fill('#ffffff'); await p2.getByRole('button', { name: 'Add colour' }).click();
  ok((await code2.textContent()) === 'background: linear-gradient(90deg, #ff9933 0%, #ffcc99 25%, #ffffff 50%, #138808 100%);', `first added stop: 25 %, half-way saffron → white (${await code2.textContent()})`);
  await p2.getByRole('button', { name: 'Add colour' }).click(); ok((await code2.textContent()).includes('#89c484 75%'), `second added stop: 75 %, half-way white → green (${await code2.textContent()})`);
  ok(/rgb\(255, 204, 153\) 25%.*rgb\(137, 196, 132\) 75%/.test(await p2.locator('.grad-preview').evaluate((e) => getComputedStyle(e).backgroundImage)), 'the preview has the same five stops');
  ok(!p2.errors.length, `no page errors on the second page ${p2.errors.join(' | ')}`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'gradient');
};
