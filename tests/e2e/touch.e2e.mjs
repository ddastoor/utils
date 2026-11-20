// Touch Test (#/touch, Mobile only): real touches through Chrome DevTools Input.dispatchTouchEvent on an emulated
// Pixel 7 — one finger reports "1 touch · max 1 · pressure", a stroke is drawn in that finger's colour along the path
// (pixels read back), two and five fingers at once raise the max, Clear wipes the canvas and the max, the canvas keeps
// its real pixel size after rotating, maxTouchPoints note, desktop shows the Mobile-only note.
import { mobileOnlyOnDesktop } from './_mobileonly.mjs';
const COLORS = ['#4f46e5', '#e11d48', '#059669', '#d97706', '#0891b2', '#7c3aed', '#db2777', '#65a30d', '#ea580c', '#0d9488'];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export default async (ctx) => {
  const { base, page: newPage, ok, devices } = ctx;
  await mobileOnlyOnDesktop(ctx, 'touch');
  const page = await newPage(devices['Pixel 7']);
  await page.addInitScript(() => { window.__pids = []; addEventListener('pointerdown', (e) => window.__pids.push(e.pointerId), true); });
  await page.goto(`${base}#/touch`);
  const cv = page.locator('canvas.touch-canvas'); await cv.waitFor(); await page.waitForTimeout(100);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, force: 0.5, radiusX: 5, radiusY: 5 })) });
  const info = () => page.locator('.card .muted.center').textContent();
  const size = () => cv.evaluate((c) => [c.width, c.height, Math.round(c.clientWidth * devicePixelRatio), Math.round(c.clientHeight * devicePixelRatio)]);
  let s = await size(); ok(Math.abs(s[0] - s[2]) <= 1 && Math.abs(s[1] - s[3]) <= 1 && s[0] > 0, `canvas at the screen's real pixel size (${s})`);
  ok(await info() === 'Draw with one or more fingers', 'prompt before touching');
  const b = await cv.boundingBox(), y = b.y + b.height / 2, x0 = b.x + 40, x1 = b.x + b.width - 40;
  await touch('touchStart', [[x0, y, 1]]);
  ok(/^1 touch · max 1 · pressure \d\.\d\d$/.test(await info()), `one finger: "${await info()}"`);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[x0 + ((x1 - x0) * i) / 10, y, 1]]);
  await touch('touchEnd', []);
  ok(/^No finger on the screen · max 1$/.test(await info()), `all fingers lifted: said (it kept "1 touch") — "${await info()}"`);
  const pid = await page.evaluate(() => window.__pids.at(-1)), want = rgb(COLORS[pid % COLORS.length]);
  const px = (cx, cy) => cv.evaluate((c, [cx, cy]) => { const r = c.getBoundingClientRect(); return [...c.getContext('2d').getImageData(Math.round((cx - r.left) * devicePixelRatio), Math.round((cy - r.top) * devicePixelRatio), 1, 1).data]; }, [cx, cy]);
  const mid = await px((x0 + x1) / 2, y), off = await px((x0 + x1) / 2, y + 60);
  ok(mid[3] === 255 && mid.slice(0, 3).every((v, i) => Math.abs(v - want[i]) < 3), `stroke drawn along the finger's path in its colour ${COLORS[pid % COLORS.length]} (${mid})`);
  ok(off[3] === 0, 'nothing drawn away from the path');
  await touch('touchStart', [[x0, y - 100, 1]]); await touch('touchStart', [[x0, y - 100, 1], [x1, y - 100, 2]]);
  ok(/^2 touches · max 2 · /.test(await info()), `two fingers at once: "${await info()}"`);
  const pids2 = await page.evaluate(() => window.__pids.slice(-2));
  await touch('touchMove', [[x0 + 50, y - 100, 1], [x1 - 50, y - 100, 2]]); await touch('touchEnd', []);
  const c1 = await px(x0 + 25, y - 100), c2 = await px(x1 - 25, y - 100);
  ok(pids2[0] !== pids2[1] && c1.slice(0, 3).join() === rgb(COLORS[pids2[0] % 10]).join() && c2.slice(0, 3).join() === rgb(COLORS[pids2[1] % 10]).join(), `each finger draws in its own colour (${c1.slice(0, 3)} / ${c2.slice(0, 3)})`);
  await touch('touchStart', [[x0, y + 100, 3]]); ok(/^1 touch · max 2 · /.test(await info()), 'the max is remembered'); await touch('touchEnd', []);
  const five = [1, 2, 3, 4, 5].map((k) => [b.x + k * 50, y + 150, 10 + k]);
  for (let k = 1; k <= 5; k++) await touch('touchStart', five.slice(0, k));
  ok(/^5 touches · max 5 · /.test(await info()), `five fingers: "${await info()}"`); await touch('touchEnd', []);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  ok(await cv.evaluate((c) => !c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v) => v)) && await info() === 'Draw with one or more fingers', 'Clear wipes the canvas and resets the prompt');
  await touch('touchStart', [[x0, y, 20]]); ok(/^1 touch · max 1 · /.test(await info()), 'max restarts after Clear'); await touch('touchEnd', []);
  const mtp = await page.evaluate(() => navigator.maxTouchPoints);
  ok((await page.locator('.note').last().textContent()).includes(`reports up to ${mtp} simultaneous touch points`), `note shows navigator.maxTouchPoints (${mtp})`);
  await page.setViewportSize({ width: 915, height: 412 }); await page.waitForTimeout(150);
  s = await size(); ok(Math.abs(s[0] - s[2]) <= 1 && Math.abs(s[1] - s[3]) <= 1, `after rotating to landscape the canvas is resized to its new pixel size (${s})`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
  const clr = await page.getByRole('button', { name: 'Clear', exact: true }).boundingBox(); ok(clr.height >= 44, `Clear button ≥ 44 px (${clr.height})`);
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor(); await page.setViewportSize({ width: 412, height: 915 }); await page.waitForTimeout(100);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
};
