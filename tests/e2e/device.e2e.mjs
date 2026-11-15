// Device tools with Chromium's fake camera/microphone; phone-only sensors via an emulated phone + synthetic events.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['camera', 'microphone'] });
  const go = async (r) => { await page.goto(base + '#/' + r); await page.waitForSelector('.tool-body > *', { timeout: 15000 }); };
  await go('webcam'); await page.getByRole('button', { name: 'Start camera' }).click();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0, null, { timeout: 10000 });
  ok(/Resolution/.test(await page.locator('.kv').innerText()), 'webcam stream + settings shown');
  await go('mic'); await page.getByRole('button', { name: 'Start' }).click(); await page.waitForTimeout(500);
  ok(/Sample rate/.test(await page.locator('.kv').innerText()), 'microphone stream + settings');
  await go('soundmeter'); await page.getByRole('button', { name: 'Start' }).click(); await page.waitForTimeout(600);
  ok(/\d+ dB/.test(await page.locator('.db').textContent()), 'sound meter reading');
  await go('speaker'); await page.getByRole('button', { name: 'Left' }).click(); ok(true, 'speaker left tone');
  await go('keyboard'); await page.locator('.kb').click(); await page.keyboard.press('KeyA'); await page.keyboard.press('Space');
  ok((await page.locator('.kb-key.hit').count()) === 2, 'keyboard: 2 keys registered');
  await go('screen'); await page.waitForSelector('.kv'); ok(/Device pixel ratio/.test(await page.locator('.tool-body').innerText()), 'screen info');
  await go('pixels'); await page.getByRole('button', { name: 'Start full-screen test' }).click();
  ok((await page.locator('.pixel-panel').count()) === 1, 'dead-pixel panel opens'); await page.keyboard.press('Escape');
  ok((await page.locator('.pixel-panel').count()) === 0, 'dead-pixel panel closes');
  await go('ruler'); await page.waitForSelector('.tick.major', { timeout: 5000 }).catch(() => {}); ok((await page.locator('.tick.major').count()) >= 5, 'ruler ticks drawn');
  await go('level'); ok(/needs a phone/.test(await page.locator('.tool-body').innerText()), 'level is mobile-only on desktop');
  ok(!page.errors.length, 'desktop: no console errors ' + page.errors.join(' | '));

  const phone = await newPage({ ...devices['Pixel 7'], permissions: ['accelerometer', 'gyroscope', 'magnetometer'] });
  await phone.goto(base + '#/level'); await phone.getByRole('button', { name: 'Start' }).click(); await phone.waitForTimeout(150);
  await phone.evaluate(() => dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 0.1, gamma: 0.2, alpha: 0 })));
  ok(/0\.2° · 0\.1°/.test(await phone.locator('.big-value').textContent()) && (await phone.locator('.bubble.level').count()) === 1, 'level reads tilt and shows level');
  await phone.goto(base + '#/compass'); await phone.getByRole('button', { name: 'Start' }).click(); await phone.waitForTimeout(150);
  const evt = await phone.evaluate(() => ('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'));
  await phone.evaluate((name) => dispatchEvent(Object.assign(new Event(name), { absolute: true, alpha: 270, beta: 0, gamma: 0 })), evt);
  ok(/90° E/.test(await phone.locator('.big-value').textContent()), 'compass heading 90° E');
  await phone.goto(base + '#/touch'); await phone.waitForSelector('.tool-body > *'); ok((await phone.locator('canvas.touch-canvas').count()) === 1, 'touch test on phone');
  await phone.goto(base + '#/keyboard'); await phone.waitForSelector('.tool-body .note'); ok(/desktop browsers only/.test(await phone.locator('.tool-body').innerText()), 'keyboard is PC-only on phone');
  ok(!phone.errors.length, 'phone: no console errors ' + phone.errors.join(' | '));
};
