// Compass (#/compass, Mobile only): Android absolute orientation → heading = (360 − alpha) mod 360, rounded, with the
// Chromium delivers orientation events only with the sensor permissions (granted by default on Android Chrome).
// 8-point direction (N, NE … NW, boundaries at 22.5° steps), dial rotated by −heading; 359.6° shows "0° N" (not 360);
// non-absolute (relative) events ignored + "No compass data" warning; iPhone webkitCompassHeading (true north) and
// motion permission; desktop note; phone layout.
import { mobileOnlyOnDesktop } from './_mobileonly.mjs';
import { phoneLayout } from './_phone.mjs';
const PTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const expect = (alpha) => { const hd = (360 - alpha) % 360; return { hd, text: `${Math.round(hd) % 360}° ${PTS[Math.round(hd / 45) % 8]}` }; };
export default async (ctx) => {
  const { base, page: newPage, ok, devices } = ctx;
  await mobileOnlyOnDesktop(ctx, 'compass');
  const page = await newPage({ ...devices['Pixel 7'], permissions: ['accelerometer', 'gyroscope', 'magnetometer'] }); await page.goto(`${base}#/compass`);
  const start = page.getByRole('button', { name: 'Start', exact: true }); await start.waitFor();
  const evName = await page.evaluate(() => ('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'));
  const send = (props) => page.evaluate(([n, p]) => dispatchEvent(Object.assign(new Event(n), p)), [evName, props]);
  const read = () => page.locator('.big-value').textContent();
  const dialDeg = () => page.locator('.dial').evaluate((d) => +/rotate\(([-\d.e]+)deg\)/.exec(d.style.transform)[1]);
  ok(await read() === '—', 'no heading before Start'); await start.click(); await page.waitForTimeout(50);
  const alphas = [0, 270, 225, 180, 90, 315, 135, 45, 22.6, 22.4, 337.6, 0.4, 359.6, 112.5];
  const bad = []; let prev = 0, maxTurn = 0;
  for (const a of alphas) {
    await send({ absolute: true, alpha: a, beta: 0, gamma: 0 });
    const r = await read(), e = expect(a), d = await dialDeg();
    const dd = ((d + e.hd) % 360 + 540) % 360 - 180; // dial angle should be −heading (mod 360)
    maxTurn = Math.max(maxTurn, Math.abs(d - prev)); prev = d;
    if (r !== e.text || Math.abs(dd) > 0.01) bad.push(`alpha ${a}: "${r}" ≠ "${e.text}" or dial ${d.toFixed(2)}°`);
  }
  ok(!bad.length, `heading = (360 − alpha) mod 360 with 8 compass points and the dial turned to match, ${alphas.length} cases ${bad.join('; ')}`);
  ok(maxTurn <= 180, `the dial always takes the short way round (largest single turn ${maxTurn.toFixed(1)}°)`);
  await send({ absolute: true, alpha: 359, beta: 0, gamma: 0 }); const d1 = await dialDeg(); await send({ absolute: true, alpha: 1, beta: 0, gamma: 0 }); const d2 = await dialDeg();
  ok(Math.abs(d2 - d1 - 2) < 1e-6, `crossing north (1° → 359°) turns the dial 2°, not 358° back (${d1} → ${d2})`);
  await send({ absolute: true, alpha: 0.4, beta: 0, gamma: 0 }); ok(await read() === '0° N', `359.6° shows "0° N" (${await read()})`);
  await send({ absolute: true, alpha: 90, beta: 0, gamma: 0 }); ok(await read() === '270° W', 'alpha 90 → 270° W');
  await send({ absolute: false, alpha: 10, beta: 0, gamma: 0 }); ok(await read() === '270° W', 'relative (non-absolute) readings are ignored');
  await send({ absolute: true, alpha: null, beta: null, gamma: null }); ok(await read() === '270° W', 'events without alpha ignored');
  ok(/magnetic north/.test(await page.locator('.note').last().textContent()), 'Android note: magnetic north + figure-8 calibration');
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor();
  await page.goto(`${base}#/compass`); await page.getByRole('button', { name: 'Start', exact: true }).click();
  await send({ absolute: false, alpha: 10, beta: 0, gamma: 0 }); await page.waitForTimeout(1700);
  ok(await read() === '—' && /No compass data/.test(await page.locator('.note-warn').textContent()), 'only relative data for 1.5 s → "No compass data" warning');
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor(); await send({ absolute: true, alpha: 5 });
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  // iPhone: webkitCompassHeading, permission
  const ip = await newPage({ ...devices['iPhone 13'], permissions: ['accelerometer', 'gyroscope', 'magnetometer'] });
  await ip.addInitScript(() => { window.DeviceOrientationEvent.requestPermission = async () => window.__perm || 'denied'; });
  await ip.goto(`${base}#/compass`); const ist = ip.getByRole('button', { name: 'Start', exact: true }); await ist.click();
  ok(/Motion access was denied/.test(await ip.locator('.note-err').textContent()), 'iPhone: permission denied message');
  await ip.evaluate(() => (window.__perm = 'granted')); await ist.click();
  const iev = await ip.evaluate(() => ('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'));
  await ip.evaluate((n) => dispatchEvent(Object.assign(new Event(n), { webkitCompassHeading: 45.4, alpha: 300, absolute: false })), iev);
  ok(await ip.locator('.big-value').textContent() === '45° NE' && /true north/.test(await ip.locator('.note').last().textContent()), `iPhone: webkitCompassHeading 45.4 → "45° NE", true north note (${await ip.locator('.big-value').textContent()})`);
  await phoneLayout(ctx, 'compass', { ready: '.dial', buttons: ['Start'] });
};
