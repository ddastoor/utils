// Graphing Calculator (#/graph): curves drawn where the maths says (pixels read from the canvas), zoom / reset / pan,
// the hover readout (f(x) values, degrees vs radians), invalid input, show/hide, six functions max, PNG export.
import { readFileSync } from 'node:fs';
export default async ({ base, page: newPage, ok, devices, download }) => {
  const page = await newPage({ viewport: { width: 1200, height: 900 } }); await page.goto(`${base}#/graph`);
  const canvas = page.locator('canvas.graph-canvas'), fin = page.locator('.fn-input');
  await fin.first().waitFor(); await page.waitForTimeout(200);
  const setFn = async (i, s) => { await fin.nth(i).fill(s); await fin.nth(i).dispatchEvent('input'); };
  /** is the curve colour (#4f46e5) within ±2 px of (dx, dy) units-in-pixels from the centre? */
  const colourNear = (dx, dy, rgb = [79, 70, 229]) => canvas.evaluate((c, [dx, dy, rgb]) => {
    const dpr = c.width / c.clientWidth, g = c.getContext('2d'), cx = c.clientWidth / 2 + dx, cy = c.clientHeight / 2 - dy;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -1; ox <= 1; ox++) { const d = g.getImageData(Math.round((cx + ox) * dpr), Math.round((cy + oy) * dpr), 1, 1).data; if (Math.abs(d[0] - rgb[0]) + Math.abs(d[1] - rgb[1]) + Math.abs(d[2] - rgb[2]) < 60) return true; }
    return false;
  }, [dx, dy, rgb]);
  await page.locator('.fn-row').nth(1).getByRole('button', { name: 'Remove' }).click();
  await setFn(0, '2');
  ok(await colourNear(37, 100) && await colourNear(-180, 100) && !(await colourNear(37, 60)), 'y = 2 drawn 100 px above the axis (50 px per unit)');
  await setFn(0, 'x/2 + 1');
  ok(await colourNear(100, 100) && await colourNear(-100, 0) && await colourNear(0, 50), 'y = x/2 + 1 passes (2, 2), (−2, 0), (0, 1)');
  await setFn(0, '3x^2 - 2');
  ok(await colourNear(50, 50) && await colourNear(0, -100) && await colourNear(-50, 50), 'implicit multiplication 3x² − 2 through (±1, 1) and (0, −2)');
  await setFn(0, '2');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  ok(await colourNear(37, 150) && !(await colourNear(37, 100)), 'zoom in ×1.5 → y = 2 at 150 px');
  await page.getByRole('button', { name: 'Zoom out' }).click(); await page.getByRole('button', { name: 'Zoom out' }).click();
  ok(await colourNear(37, 100 / 1.5), 'zoom out');
  await page.getByRole('button', { name: 'Reset view' }).click();
  ok(await colourNear(37, 100), 'reset view');
  const box = await canvas.boundingBox(), C = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const readout = async (dx, dy) => { await page.mouse.move(C.x + dx, C.y - dy); return page.locator('.graph-readout').textContent(); };
  const nums = (s) => Object.fromEntries([...s.matchAll(/(x|y|f\d\(x\)) = (-?[\d.e+-]+)/g)].map((m) => [m[1], +m[2]]));
  await setFn(0, 'x^2');
  let r = nums(await readout(50, 0));
  ok(Math.abs(r.x - 1) < 0.03 && Math.abs(r['f1(x)'] - r.x ** 2) < 1e-4, `hover at x ≈ 1 → f1(x) = x² (${JSON.stringify(r)})`);
  await setFn(0, 'sin(90x)');
  r = nums(await readout(50, 0));
  ok(Math.abs(r['f1(x)'] - Math.sin(90 * r.x)) < 1e-4, `radians: sin(90x) (${r['f1(x)']})`);
  await page.getByRole('radio', { name: 'Degrees', exact: true }).click();
  r = nums(await readout(50, 0));
  ok(Math.abs(r['f1(x)'] - Math.sin((90 * r.x * Math.PI) / 180)) < 1e-4 && r['f1(x)'] > 0.99, `degrees: sin(90°·x) ≈ 1 at x = 1 (${r['f1(x)']})`);
  await page.getByRole('radio', { name: 'Radians', exact: true }).click();
  // pan: drag 100 px right → the centre now shows x = −2
  await setFn(0, '2');
  await page.mouse.move(C.x, C.y); await page.mouse.down(); await page.mouse.move(C.x + 50, C.y, { steps: 3 }); await page.mouse.move(C.x + 100, C.y + 50, { steps: 3 }); await page.mouse.up();
  r = nums(await readout(0, 0));
  ok(Math.abs(r.x + 2) < 0.05 && Math.abs(r.y - 1) < 0.05 && await colourNear(37, 50) && !(await colourNear(37, 100)), `drag pans with the content: centre is now (−2, 1), y = 2 moved down to 50 px (${JSON.stringify(r)})`);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await setFn(0, 'sin(');
  ok(await fin.first().evaluate((e) => e.classList.contains('bad')) && !(await colourNear(37, 100)), 'invalid function flagged, nothing drawn');
  await setFn(0, '1/x');
  ok(!(await colourNear(0, 0)) && await colourNear(50, 50) && await colourNear(-50, -50), '1/x: no vertical line across the pole');
  await setFn(0, '2');
  await page.locator('.fn-swatch').first().click();
  ok(!(await colourNear(37, 100)), 'swatch hides the curve');
  await page.locator('.fn-swatch').first().click();
  ok(await colourNear(37, 100), 'and shows it again');
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Add function' }).click();
  ok(await fin.count() === 6, 'at most six functions');
  await setFn(1, '-1');
  ok(await colourNear(37, -50, [225, 29, 72]), 'second function in its own colour (#e11d48)');
  const png = readFileSync(await download(page, () => page.getByRole('button', { name: 'Save PNG' }).click()));
  const W = png.readUInt32BE(16), H = png.readUInt32BE(20), cw = await canvas.evaluate((c) => c.width);
  ok(png.subarray(1, 4).toString() === 'PNG' && W === cw && H > 200, `PNG export ${W}×${H}`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/graph`); await ph.locator('canvas.graph-canvas').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && (await ph.locator('canvas.graph-canvas').boundingBox()).width > 300, 'phone: full-width graph, no horizontal scroll');
};
