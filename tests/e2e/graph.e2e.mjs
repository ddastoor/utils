// Graphing Calculator (#/graph): curves drawn where the maths says (pixels read from the canvas) — steep lines, jumps
// and poles included; zoom (about the cursor, about the fingers, to its limits without freezing), reset, pan, keys;
// the hover readout (f(x) values, degrees vs radians, "undefined"); what a box may hold and the reason when it may
// not; vertical lines; show/hide; six functions at most; PNG export; phone.
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
  /** where the graph's centre is: typing into a box below scrolls the page and the graph slides under the sticky tab rows — back to the top first */
  const centre = async () => { await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); let b = await canvas.boundingBox(); for (let k = 0; k < 40; k++) { await page.waitForTimeout(40); const n = await canvas.boundingBox(); if (n.y === b.y && n.x === b.x) break; b = n; } C.x = b.x + b.width / 2; C.y = b.y + b.height / 2; };
  const readout = async (dx, dy) => { await centre(); await page.mouse.move(C.x + dx + 1, C.y - dy); await page.mouse.move(C.x + dx, C.y - dy); return page.locator('.graph-readout').textContent(); };
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
  await centre(); await page.mouse.move(C.x, C.y); await page.mouse.down(); await page.mouse.move(C.x + 50, C.y, { steps: 3 }); await page.mouse.move(C.x + 100, C.y + 50, { steps: 3 }); await page.mouse.up();
  r = nums(await readout(0, 0));
  ok(Math.abs(r.x + 2) < 0.05 && Math.abs(r.y - 1) < 0.05 && await colourNear(37, 50) && !(await colourNear(37, 100)), `drag pans with the content: centre is now (−2, 1), y = 2 moved down to 50 px (${JSON.stringify(r)})`);
  await page.getByRole('button', { name: 'Reset view' }).click();
  const err = () => page.locator('.fn-err').first().innerText();
  await setFn(0, 'sin(');
  ok(await fin.first().evaluate((e) => e.classList.contains('bad')) && !(await colourNear(37, 100)) && await err() === 'Incomplete expression', `a function that cannot be read is marked, not drawn, and the reason stands under it — there was only a red border (${await err()})`);
  for (const [src, reason] of [['x + y', 'Only x can be used here: "y" has no value.'], ['2x + t', 'Only x can be used here: "t" has no value.'], ['ans + x', 'Ans belongs to the calculator — a function here is written with x.'], ['x^2 + y^2 = 1', 'An equation cannot be drawn — write y as a function of x (2x + 1), or x = 2 for a vertical line. The Equation Solver solves equations.'],
    ['2x = 4', 'An equation cannot be drawn — write y as a function of x (2x + 1), or x = 2 for a vertical line. The Equation Solver solves equations.'], ['x = x', 'x = … takes a number: x = 2 draws a vertical line.'], ['x = 1/0', 'x = … needs a number that exists.'], ['foo(x)', 'Unknown name: foo']]) {
    await setFn(0, src); const e = await err();
    ok(e === reason && await fin.first().evaluate((el) => el.classList.contains('bad')), `"${src}" → "${reason}" (${e})`);
  }
  await setFn(0, '2x = 4'); await setFn(0, '2x');
  ok(!(await page.locator('.fn-err').first().isVisible()) && !(await fin.first().evaluate((e) => e.classList.contains('bad'))) && await colourNear(50, 100), 'a corrected function loses its message and is drawn');
  // ---- forms a box takes
  await setFn(0, 'y = 2'); ok(await colourNear(37, 100), '"y = 2"');
  await setFn(0, 'f(x) = 2'); ok(await colourNear(37, 100) && !(await page.locator('.fn-err').first().isVisible()), '"f(x) = 2" (it was refused without a word)');
  await setFn(0, 'x = 2');
  ok(await colourNear(100, 150) && await colourNear(100, -150) && await colourNear(100, 3) && !(await colourNear(60, 150)) && !(await colourNear(0, 100)), '"x = 2" is the vertical line at x = 2 — it drew the line y = x − 2');
  r = await readout(50, 0);
  ok(/line x = 2$/.test(r), `the readout names the line (${r})`);
  // ---- steep, broken and bounded curves
  const count = (x0, x1, y0, y1) => canvas.evaluate((c, [x0, x1, y0, y1]) => { const dpr = c.width / c.clientWidth, g = c.getContext('2d'), cx = c.clientWidth / 2, cy = c.clientHeight / 2; let n = 0;
    const d = g.getImageData(Math.round((cx + x0) * dpr), Math.round((cy - y1) * dpr), Math.round((x1 - x0) * dpr), Math.round((y1 - y0) * dpr)).data;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 79) + Math.abs(d[i + 1] - 70) + Math.abs(d[i + 2] - 229) < 60) n++; return n; }, [x0, x1, y0, y1]);
  await setFn(0, '1000x');
  ok(await count(-6, 6, -200, 200) > 600 && await colourNear(0, 150) && await colourNear(0, -150), `y = 1000x is drawn — a steep line through the origin; the tab drew nothing (${await count(-6, 6, -200, 200)} pixels)`);
  await setFn(0, '1000000(x - 1)');
  ok(await colourNear(50, 150) && await colourNear(50, -150), 'a million times steeper, at x = 1');
  await setFn(0, 'floor(x)');
  ok(await count(48, 52, 10, 40) === 0 && await count(-52, -48, -40, -10) === 0 && await count(60, 90, 45, 55) > 30 && await count(10, 40, -5, 5) > 30, `floor(x): steps without vertical connectors between them (${await count(48, 52, 10, 40)} pixels in the riser at x = 1)`);
  await setFn(0, 'tan(x)');
  ok(await count(76, 81, -220, 220) < 40 && await colourNear(39, 50) && await colourNear(-39, -50), 'tan(x): through (π/4, 1), no line down the pole at π/2');
  await setFn(0, '1/x');
  ok(!(await colourNear(0, 0)) && await colourNear(50, 50) && await colourNear(-50, -50) && await count(-2, 2, -200, 200) < 60, '1/x: no vertical line across the pole');
  await setFn(0, 'sqrt(x)');
  ok(await colourNear(50, 50) && await colourNear(200, 100) && await count(-300, -5, -200, 200) === 0, 'sqrt(x): nothing left of 0');
  r = await readout(-100, 0);
  ok(/f1\(x\) = undefined$/.test(r), `where a function has no value the readout says "undefined" — it said "Error" (${r})`);
  await setFn(0, '200sin(50x)');
  ok(await count(-300, 300, 150, 210) > 500 && await count(-300, 300, -210, -150) > 500, 'a fast wave far taller than the picture is drawn to both edges');
  await setFn(0, '1/x');
  ok(!(await colourNear(0, 0)) && await colourNear(50, 50) && await colourNear(-50, -50), '1/x: no vertical line across the pole');
  await setFn(0, '2');
  await page.locator('.fn-swatch').first().click();
  ok(!(await colourNear(37, 100)), 'swatch hides the curve');
  await page.locator('.fn-swatch').first().click();
  ok(await colourNear(37, 100), 'and shows it again');
  const add = page.getByRole('button', { name: 'Add function' });
  for (let i = 0; i < 5; i++) await add.click();
  ok(await fin.count() === 6 && await add.isDisabled() && await add.getAttribute('title') === '6 functions at most' && await fin.nth(5).evaluate((e) => e === document.activeElement), 'six functions at most: the button is switched off and says why (it stayed live and did nothing); a new box takes the cursor');
  await page.locator('.fn-row').nth(5).getByRole('button', { name: 'Remove' }).click();
  ok(await fin.count() === 5 && await add.isEnabled(), 'one removed: the button is back');
  await setFn(1, '-1');
  ok(await colourNear(37, -50, [225, 29, 72]), 'second function in its own colour (#e11d48)');
  const png = readFileSync(await download(page, () => page.getByRole('button', { name: 'Save PNG' }).click()));
  const W = png.readUInt32BE(16), H = png.readUInt32BE(20), cw = await canvas.evaluate((c) => c.width);
  ok(png.subarray(1, 4).toString() === 'PNG' && W === cw && H > 200, `PNG export ${W}×${H}`);
  // ---- zooming keeps the point under the cursor; the wheel used to zoom about the centre
  await page.getByRole('button', { name: 'Reset view' }).click(); await setFn(0, 'x');
  const at = async (dx, dy) => nums(await readout(dx, dy));
  /** turn the wheel over the point 100 px right of and above the centre; wait for the zoom (the event travels on its own), then say what is under that point now */
  const wheelAt = async (dy) => { const before = (await at(0, 0)).x; await page.mouse.move(C.x + 100, C.y - 100); await page.mouse.wheel(0, dy); for (let k = 0; k < 60; k++) { await page.waitForTimeout(50); if (Math.abs((await at(0, 0)).x - before) > 1e-6) break; } return [await at(100, 100), (await at(0, 0)).x]; };
  let p0 = await at(100, 100), [p1, mid] = await wheelAt(-400);
  ok(Math.abs(p0.x - 2) < 0.03 && Math.abs(p0.y - 2) < 0.03 && Math.abs(p1.x - 2) < 0.03 && Math.abs(p1.y - 2) < 0.03 && Math.abs(mid - 2 * (1 - Math.exp(-0.6))) < 0.03, `the wheel zooms in on the point under the cursor: (2, 2) stays there and the centre moves to x = 0.9 (${JSON.stringify(p1)}, centre ${mid}; before: the centre stayed and the point slid to 1.28)`);
  [p1, mid] = await wheelAt(900);
  ok(Math.abs(p1.x - 2) < 0.09 && Math.abs(p1.y - 2) < 0.09 && mid < -1, `… and out again, past the first view (${JSON.stringify(p1)}, centre ${mid})`);
  await page.getByRole('button', { name: 'Reset view' }).click();
  // ---- keys, with the graph in focus
  await canvas.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
  p1 = await at(0, 0);
  ok(Math.abs(p1.x - 1.6) < 0.03 && Math.abs(p1.y - 0.8) < 0.03, `arrow keys move the view 40 px a press (${JSON.stringify(p1)})`);
  await page.keyboard.press('+'); const zin = await at(100, 0); await page.keyboard.press('-'); await page.keyboard.press('-'); const zout = await at(100, 0); await page.keyboard.press('0');
  p1 = await at(100, 0);
  ok(Math.abs(zin.x - (1.6 + 2 / 1.5)) < 0.03 && Math.abs(zout.x - (1.6 + 3)) < 0.05 && Math.abs(p1.x - 2) < 0.03, `+ and − zoom, 0 resets (${zin.x}, ${zout.x}, ${p1.x})`);
  // ---- deep zoom: pan to x = 3 and zoom in 150 times — after the 88th press the page froze for good
  await centre(); await page.mouse.move(C.x, C.y); await page.mouse.down(); await page.mouse.move(C.x - 150, C.y, { steps: 4 }); await page.mouse.up();
  const zoomIn = page.getByRole('button', { name: 'Zoom in' }), zoomOut = page.getByRole('button', { name: 'Zoom out' });
  let pressed = 0; try { for (let i = 0; i < 150; i++) { await zoomIn.click({ timeout: 5000 }); pressed++; } } catch { /* reported below */ }
  const alive = await Promise.race([page.evaluate(() => 1 + 1), new Promise((res) => setTimeout(() => res('frozen'), 5000))]);
  p0 = await at(0, 0); p1 = await at(200, 0);
  ok(pressed === 150 && alive === 2 && Math.abs(p0.x - 3) < 1e-6 && p1.x > p0.x && p1.x - p0.x < 1e-9, `150 zooms in at x = 3: the page lives, the zoom stopped where doubles end (200 px = ${(p1.x - p0.x).toExponential(2)} units), the readout still tells two points apart (${p0.x} / ${p1.x})`);
  await setFn(0, '(x - 3) * 1e12');
  ok(await count(-300, 300, -200, 200) > 300, 'a curve is still drawn at that depth');
  pressed = 0; try { for (let i = 0; i < 260; i++) { await zoomOut.click({ timeout: 5000 }); pressed++; } } catch { /* reported below */ }
  p0 = await at(0, 0); p1 = await at(100, 0);
  ok(pressed === 260 && Math.abs((p1.x - p0.x) - 1e14) < 1e12 && await page.evaluate(() => 2) === 2, `260 zooms out stop at 10⁻¹² px per unit: 100 px = ${(p1.x - p0.x).toExponential(2)} units`);
  await page.getByRole('button', { name: 'Reset view' }).click(); await setFn(0, '2');
  ok(await colourNear(37, 100), 'and Reset view brings the first picture back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone: pinch between two fingers
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/graph`); await ph.locator('canvas.graph-canvas').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && (await ph.locator('canvas.graph-canvas').boundingBox()).width > 300, 'phone: full-width graph, no horizontal scroll');
  { const pc = ph.locator('canvas.graph-canvas'), b = await pc.boundingBox(), M = { x: b.x + b.width / 2 + 50, y: b.y + b.height / 2 - 50 };
    const cdp = await ph.context().newCDPSession(ph), touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, force: 0.5, radiusX: 5, radiusY: 5 })) });
    await ph.locator('.fn-row').nth(1).getByRole('button', { name: 'Remove' }).click();
    const f0 = ph.locator('.fn-input').first(); await f0.fill('x'); await f0.dispatchEvent('input');
    // the point (1, 1) is 50 px right of and above the centre: it sits between the fingers and must stay there
    await touch('touchStart', [[M.x - 30, M.y, 1], [M.x + 30, M.y, 2]]);
    for (const d of [40, 50, 60, 75, 90]) await touch('touchMove', [[M.x - d, M.y, 1], [M.x + d, M.y, 2]]);
    await touch('touchEnd', []);
    const dprOf = await pc.evaluate((c) => c.width / c.clientWidth);
    const blue = (dx, dy) => pc.evaluate((c, [dx, dy, dpr]) => { const g = c.getContext('2d'); for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) { const d = g.getImageData(Math.round((c.clientWidth / 2 + dx + ox) * dpr), Math.round((c.clientHeight / 2 - dy + oy) * dpr), 1, 1).data; if (Math.abs(d[0] - 79) + Math.abs(d[1] - 70) + Math.abs(d[2] - 229) < 60) return true; } return false; }, [dx, dy, dprOf]);
    // after a ×3 pinch about (1, 1): the origin has moved to 100 px left of and below the centre; y = x still passes the pinch point
    ok(await blue(50, 50) && await blue(-100, -100) && await blue(0, 0) && !(await blue(50, -50)) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: a pinch zooms about the point between the fingers (it zoomed about the middle of the picture)');
    ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .fn-input, .tool-body .btn')].every((e) => e.getBoundingClientRect().height >= 40) && [...document.querySelectorAll('.fn-swatch')].every((e) => { const r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after'); return r.height + 2 * Math.abs(parseFloat(a.top)) >= 44; })), 'phone: boxes, buttons and the colour squares (with their margin) are touch targets');
    ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`); }
};
