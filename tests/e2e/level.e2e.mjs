// Bubble Level (#/level, Mobile only): tilt from deviceorientation (gamma = left/right, beta = front/back) shown as
// Chromium delivers orientation events only with the sensor permissions (granted by default on Android Chrome).
// "x° · y°", the bubble moves the opposite way by 100 px per 45° (stops at the rim, the reading does not), green when
// within 0.6° of level, Calibrate sets the zero, no "-0.0°", events without angles ignored, "no sensor" warning,
// iPhone motion-permission denied / granted, desktop shows the Mobile-only note, phone layout.
import { mobileOnlyOnDesktop } from './_mobileonly.mjs';
import { phoneLayout } from './_phone.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok, devices } = ctx;
  await mobileOnlyOnDesktop(ctx, 'level');
  const page = await newPage({ ...devices['Pixel 7'], permissions: ['accelerometer', 'gyroscope', 'magnetometer'] }); await page.goto(`${base}#/level`);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }); await btn('Start').waitFor();
  const tilt = (beta, gamma) => page.evaluate(([beta, gamma]) => dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta, gamma })), [beta, gamma]);
  const read = () => page.locator('.big-value').textContent();
  const bub = () => page.locator('.bubble').evaluate((b) => { const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(b.style.transform); return { x: +m[1], y: +m[2], level: b.classList.contains('level') }; });
  const fmt = (v) => `${(Math.abs(v) < 0.05 ? 0 : v).toFixed(1)}°`;
  ok(await read() === '—', 'no reading before Start');
  await tilt(10, -20); ok(await read() === '—', 'events before Start are ignored');
  await btn('Start').click(); await page.waitForTimeout(50);
  const cases = [[10, -20], [-5, 7.5], [0.3, 0.4], [0.4, 0.5], [-0.3, -0.4], [44, -44]];
  for (const [b, g] of cases) {
    await tilt(b, g); const r = await read(), p = await bub();
    const wantLevel = Math.hypot(b, g) < 0.6;
    ok(r === `${fmt(g)} · ${fmt(b)}` && Math.abs(p.x - (-g / 45) * 100) < 1e-3 && Math.abs(p.y - (-b / 45) * 100) < 1e-3 && p.level === wantLevel,
      `beta ${b}°, gamma ${g}° → "${r}", bubble (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) px, ${p.level ? 'level' : 'not level'}`);
  }
  await tilt(30, 80); let p = await bub();
  ok(await read() === '80.0° · 30.0°' && p.x === -100 && Math.abs(p.y + 66.667) < 0.01, `80° sideways: bubble stops at the rim (−100 px) but the reading says 80.0° (${await read()})`);
  await tilt(2, 3); await btn('Calibrate (set zero)').click(); await tilt(2, 3);
  ok(await read() === '0.0° · 0.0°' && (await bub()).level, 'Calibrate on a sloped surface → that slope reads 0.0° and level');
  await tilt(5, 3); ok(await read() === '0.0° · 3.0°', `then +3° front/back reads 3.0° (${await read()})`);
  await tilt(1.97, 2.96); ok(await read() === '0.0° · 0.0°', `tiny negative values show 0.0°, not −0.0° (${await read()})`);
  await page.evaluate(() => dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: null, beta: null, gamma: null })));
  ok(await read() === '0.0° · 0.0°', 'events without angles are ignored');
  ok(await page.locator('.note-warn').count() === 0, 'no "no sensor" warning when data arrives');
  // the screen turned to landscape (the phone lies flat, the picture stays as it was): the bubble runs along the screen's axes
  await page.evaluate(() => { Object.defineProperty(window, 'orientation', { configurable: true, get: () => 90 }); });
  await btn('Calibrate (set zero)').click(); // zero at beta 1.97, gamma 2.96 (from above) → tilt relative to that
  await tilt(1.97, 2.96 + 10); let q = await bub();
  ok(await read() === '0.0° · −10.0°'.replace('−', '-') && Math.abs(q.x) < 1e-6 && Math.abs(q.y - (10 / 45) * 100) < 1e-3, `landscape: the phone's right side 10° lower is the screen's top 10° lower — the bubble goes down (${await read()}, bubble ${q.x.toFixed(2)}, ${q.y.toFixed(2)}; it went sideways)`);
  await tilt(1.97 + 5, 2.96); q = await bub();
  ok(await read() === '5.0° · 0.0°' && Math.abs(q.x + (5 / 45) * 100) < 1e-3 && Math.abs(q.y) < 1e-6, `landscape: the phone's top 5° higher is the screen's right side 5° lower (${await read()})`);
  await page.evaluate(() => { Object.defineProperty(window, 'orientation', { configurable: true, get: () => 0 }); });
  ok(/left–right · front–back/.test(await page.locator('.card').first().textContent()), 'the two numbers are named');
  // fresh mount without data → warning
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor(); await tilt(1, 1);
  await page.goto(`${base}#/level`); await btn('Start').click(); await btn('Start').click(); await page.waitForTimeout(1700);
  ok(/No motion sensor data/.test(await page.locator('.note-warn').textContent()) && await page.locator('.note-warn').count() === 1, 'no sensor events within 1.5 s → "No motion sensor data" warning, once (Start twice showed it twice)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  // iPhone: motion permission
  const ip = await newPage({ ...devices['iPhone 13'], permissions: ['accelerometer', 'gyroscope', 'magnetometer'] });
  await ip.addInitScript(() => { window.DeviceOrientationEvent.requestPermission = async () => window.__perm || 'denied'; });
  await ip.goto(`${base}#/level`); await ip.getByRole('button', { name: 'Start', exact: true }).click();
  ok(/Motion access was denied/.test(await ip.locator('.note-err').textContent()), 'iPhone: permission denied → how to allow it');
  await ip.evaluate(() => (window.__perm = 'granted')); await ip.getByRole('button', { name: 'Start', exact: true }).click();
  await ip.evaluate(() => dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 1, gamma: 2 })));
  ok(await ip.locator('.note-err').count() === 0 && await ip.locator('.big-value').textContent() === '2.0° · 1.0°', 'iPhone: permission granted → readings, old error cleared');
  await phoneLayout(ctx, 'level', { ready: '.vial', buttons: ['Start', 'Calibrate (set zero)'] });
};
