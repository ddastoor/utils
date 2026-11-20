// Dead Pixel Test (#/pixels): 9 swatches in order, full-screen panel covering the whole viewport, colour order black →
// white → red → green → blue → grey → yellow → cyan → magenta and back to black, advanced by click / → / Space /
// Enter, ← goes back, hint shown only on the first colour, Esc and leaving full screen close it, leaving the tab
// (Back button) removes it, phone: tap advances and the panel covers the phone screen.
import { phoneLayout } from './_phone.mjs';
const ORDER = ['rgb(0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)', 'rgb(128, 128, 128)', 'rgb(255, 255, 0)', 'rgb(0, 255, 255)', 'rgb(255, 0, 255)'];
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/pixels`);
  const start = page.getByRole('button', { name: 'Start full-screen test', exact: true }); await start.waitFor();
  const panel = page.locator('.pixel-panel'), bg = () => panel.evaluate((e) => getComputedStyle(e).backgroundColor);
  ok(JSON.stringify(await page.$$eval('.swatches span', (s) => s.map((e) => getComputedStyle(e).backgroundColor))) === JSON.stringify(ORDER), 'swatches show the 9 test colours in order');
  await start.click(); await panel.waitFor();
  ok(await bg() === ORDER[0] && /Esc to exit/.test(await panel.textContent()), 'starts on black with the hint');
  const box = await panel.boundingBox(), vp = page.viewportSize();
  ok(box.x === 0 && box.y === 0 && box.width === vp.width && box.height === vp.height, `panel covers the whole viewport (${box.width}×${box.height})`);
  ok(await page.evaluate(() => document.fullscreenElement?.classList.contains('pixel-panel')), 'browser full screen requested on the panel');
  const seq = [];
  await panel.click(); seq.push(await bg()); ok(await panel.textContent() === '', 'hint disappears after the first change');
  for (const k of ['ArrowRight', ' ', 'Enter', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight']) { await page.keyboard.press(k === ' ' ? 'Space' : k); seq.push(await bg()); }
  ok(JSON.stringify(seq) === JSON.stringify([...ORDER.slice(1), ORDER[0]]), `click / → / Space / Enter step through all 9 colours and wrap to black (${seq.join(' → ')})`);
  await page.keyboard.press('ArrowLeft'); ok(await bg() === ORDER[8], 'ArrowLeft goes back (black → magenta)');
  await page.keyboard.press('ArrowLeft'); ok(await bg() === ORDER[7], 'ArrowLeft again → cyan');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await panel.count() === 0 && await page.evaluate(() => !document.fullscreenElement), 'Esc closes the panel and leaves full screen');
  await page.keyboard.press('ArrowRight'); ok(await panel.count() === 0, 'keys do nothing after closing');
  await start.click(); await panel.waitFor(); ok(await bg() === ORDER[0], 'reopening starts on black again');
  await page.evaluate(() => document.exitFullscreen()); await page.waitForTimeout(200);
  ok(await panel.count() === 0, 'leaving full screen (browser Esc / F11) closes the panel');
  await start.click(); await panel.waitFor();
  await page.evaluate(() => { location.hash = '#/screen'; }); await page.locator('.kv').first().waitFor();
  ok(await panel.count() === 0 && await page.evaluate(() => !document.fullscreenElement), 'leaving the tab (Back / another tab) removes the panel');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await phoneLayout(ctx, 'pixels', { ready: '.swatches', buttons: ['Start full-screen test'] });
  await ph.getByRole('button', { name: 'Start full-screen test', exact: true }).click(); const pp = ph.locator('.pixel-panel'); await pp.waitFor();
  const pb = await pp.boundingBox(), pv = ph.viewportSize();
  ok(pb.width === pv.width && pb.height >= pv.height, `phone: panel covers the screen (${pb.width}×${pb.height})`);
  await ph.tap('.pixel-panel'); ok(await pp.evaluate((e) => getComputedStyle(e).backgroundColor) === ORDER[1], 'phone: tap → next colour');
  // an iPhone: Safari makes only videos full screen — without it there is no Esc: a tap on the last colour ends the test
  const ip = await newPage({ ...ctx.devices['iPhone 13'] });
  await ip.addInitScript(() => { Element.prototype.requestFullscreen = function () { return Promise.reject(new TypeError('not supported')); }; });
  await ip.goto(`${base}#/pixels`); await ip.getByRole('button', { name: 'Start full-screen test', exact: true }).click();
  const ipp = ip.locator('.pixel-panel'); await ipp.waitFor(); await ip.waitForTimeout(100);
  ok(/the test ends after the last one/.test(await ipp.textContent()) && !/Esc/.test(await ipp.textContent()), `iPhone (no full screen): the hint says how the test ends, not "Esc" (${await ipp.textContent()})`);
  const seen = []; for (let k = 0; k < 8; k++) { await ip.tap('.pixel-panel'); seen.push(await ipp.evaluate((e) => getComputedStyle(e).backgroundColor)); }
  ok(JSON.stringify(seen) === JSON.stringify(ORDER.slice(1)), 'iPhone: taps go through the colours to magenta');
  await ip.tap('.pixel-panel'); await ip.waitForTimeout(100);
  ok(await ipp.count() === 0, 'iPhone: a tap on the last colour ends the test (the panel could be left only with Back)');
  // the mouse pointer is hidden while it rests on the colour
  const dp = await newPage(); await dp.goto(`${base}#/pixels`); await dp.getByRole('button', { name: 'Start full-screen test', exact: true }).click();
  const dpp = dp.locator('.pixel-panel'); await dpp.waitFor(); await dp.mouse.move(300, 300); await dp.waitForTimeout(1800);
  const hid = await dpp.evaluate((e) => getComputedStyle(e).cursor); await dp.mouse.move(320, 310); const back = await dpp.evaluate((e) => getComputedStyle(e).cursor);
  ok(hid === 'none' && back !== 'none', `the mouse pointer hides when it rests and comes back when it moves (${hid} → ${back})`);
};
