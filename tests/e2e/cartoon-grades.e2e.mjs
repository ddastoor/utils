// Cartoonizer (#/cartoon), to-do #33 — how cartoony, in grades (owner, 27 Nov 2026: "In the Cartoonizer app, in the cartoon
// filter, have some kind of gradation selection as to less cartoony or more cartoony."). Measured here, on two photos,
// from the results the tab shows and the photo itself: from Subtle to Extreme the mean difference from the photo and the
// share of flat areas (neighbours of one colour) grow and the photo's edges kept (the correlation of their Sobel
// magnitudes) fall, grade after grade. Also: Medium is the filter's old defaults; a grade moves the sliders and Detail; a
// slider or Detail moved makes a mix of your own (no grade lit) and a grade picked again sets them back; the grades are
// the Cartoon filter's only; the full-size save of Extreme looks like its preview; a phone's grade buttons take a finger.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
// label, colours, ink lines, smoothing, Detail — as the to-do's grades were chosen (src/tools/cartoon.ts, GRADES)
const GRADES = [['Subtle', 32, 0.4, 1, 'Fine'], ['Light', 20, 0.7, 2, 'Fine'], ['Medium', 14, 0.9, 2, 'Fine'], ['Strong', 8, 1.3, 3, 'Medium'], ['Extreme', 5, 1.8, 5, 'Bold']]
  .map(([label, colors, lines, smooth, detail]) => ({ label, colors, lines, smooth, detail }));

/** In the page: the measures of the canvas against the photo `b64` (decoded by the browser at its own size) */
const measure = (page, b64) => page.evaluate(async (b64) => {
  const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
  const c = document.querySelector('canvas.ed-canvas'), W = c.width, H = c.height;
  if (bmp.width !== W || bmp.height !== H) return { error: `photo ${bmp.width}×${bmp.height}, result ${W}×${H}` };
  const o = new OffscreenCanvas(W, H).getContext('2d'); o.drawImage(bmp, 0, 0);
  const a = o.getImageData(0, 0, W, H).data, d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const L = (p, i) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  const sobel = (p) => { const m = new Float32Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const q = (xx, yy) => L(p, (yy * W + xx) * 4); m[y * W + x] = Math.hypot(q(x + 1, y - 1) + 2 * q(x + 1, y) + q(x + 1, y + 1) - q(x - 1, y - 1) - 2 * q(x - 1, y) - q(x - 1, y + 1), q(x - 1, y + 1) + 2 * q(x, y + 1) + q(x + 1, y + 1) - q(x - 1, y - 1) - 2 * q(x, y - 1) - q(x + 1, y - 1)); } return m; };
  const sa = sobel(a), sd = sobel(d); let ma = 0, md = 0; for (let i = 0; i < W * H; i++) { ma += sa[i]; md += sd[i]; } ma /= W * H; md /= W * H;
  let cov = 0, va = 0, vd = 0; for (let i = 0; i < W * H; i++) { const x = sa[i] - ma, y = sd[i] - md; cov += x * y; va += x * x; vd += y * y; }
  let diff = 0, flat = 0, pairs = 0;
  for (let i = 0; i < W * H; i++) for (let k = 0; k < 3; k++) diff += Math.abs(d[i * 4 + k] - a[i * 4 + k]);
  for (let y = 0; y < H; y++) for (let x = 0; x + 1 < W; x++) { const i = (y * W + x) * 4; pairs++; if (d[i] === d[i + 4] && d[i + 1] === d[i + 5] && d[i + 2] === d[i + 6]) flat++; }
  return { diff: diff / (W * H * 3), flat: flat / pairs, kept: cov / Math.sqrt(va * vd), W, H };
}, b64);

export default async ({ base, page: newPage, ok, info, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/cartoon');
  const n = () => page.evaluate(() => +(document.querySelector('canvas.ed-canvas')?.dataset.n || 0));
  const fresh = (before) => page.waitForFunction((b) => +(document.querySelector('canvas.ed-canvas')?.dataset.n || 0) > b, before, { timeout: 60000 });
  const grade = page.locator('.field', { hasText: 'How cartoony' }).locator('[role=radio]');
  const lit = async () => (await grade.evaluateAll((bs) => bs.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent)));
  const sliders = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.slider')].map((s) => [s.querySelector('.slider-head span')?.textContent, +s.querySelector('input').value])));
  const detail = () => page.locator('.field', { hasText: 'Detail' }).locator('[role=radio][aria-checked=true]').textContent();
  const note = () => page.locator('#cartoon-grade').textContent();
  const pick = async (label) => { const b = await n(); await grade.filter({ hasText: new RegExp(`^${label}$`) }).click(); await fresh(b); };

  const series = {};
  for (const photo of ['coffee.jpg', 'astronaut.png']) {
    const b0 = await n();
    await page.locator('input[type=file]').first().setInputFiles(F(photo));
    await fresh(b0);
    if (photo === 'coffee.jpg') {
      ok(await grade.count() === 5 && JSON.stringify(await grade.allTextContents()) === JSON.stringify(GRADES.map((g) => g.label)), `the Cartoon filter has five grades: ${(await grade.allTextContents()).join(' · ')}`);
      const s = await sliders();
      ok(JSON.stringify(await lit()) === '["Medium"]' && s.Colours === 14 && s['Ink lines'] === 0.9 && s.Smoothing === 2 && (await detail()) === 'Fine', `Medium is lit at first — the filter's old defaults (14 colours, ink lines 0.9, smoothing 2, Fine detail): ${await note()}`);
    }
    const b64 = readFileSync(F(photo)).toString('base64');
    const got = [];
    for (const g of GRADES) {
      await pick(g.label);
      const s = await sliders(), m = await measure(page, b64);
      if (photo === 'coffee.jpg') ok(JSON.stringify(await lit()) === JSON.stringify([g.label]) && s.Colours === g.colors && Math.abs(s['Ink lines'] - g.lines) < 1e-9 && s.Smoothing === g.smooth && (await detail()) === g.detail
        && (await note()) === `${g.colors} colours · ink lines ${g.lines} · smoothing ${g.smooth} · ${g.detail} detail`, `${g.label}: the sliders and Detail follow it — ${await note()}`);
      got.push(m);
    }
    series[photo] = got;
    const row = (k, f) => got.map((m) => f(m[k])).join(' → ');
    info(`${photo}: difference from the photo ${row('diff', (v) => v.toFixed(2))}; flat ${row('flat', (v) => `${(v * 100).toFixed(1)} %`)}; edges kept ${row('kept', (v) => v.toFixed(3))}`);
    const up = (k) => got.every((m, i) => i === 0 || m[k] > got[i - 1][k]), down = (k) => got.every((m, i) => i === 0 || m[k] < got[i - 1][k]);
    ok(!got.some((m) => m.error) && up('diff') && got[4].diff > 2 * got[0].diff, `${photo}: each grade further from the photo than the one before (${row('diff', (v) => v.toFixed(1))})`);
    ok(up('flat'), `${photo}: each grade flatter — more neighbours of one colour (${row('flat', (v) => `${(v * 100).toFixed(1)} %`)})`);
    ok(down('kept') && got[0].kept > 0.9, `${photo}: each grade keeps fewer of the photo's edges (${row('kept', (v) => v.toFixed(3))})`);
  }

  // a slider moved: a mix of your own; a grade picked again sets everything back
  await page.evaluate(() => { const r = [...document.querySelectorAll('.slider')].find((s) => s.querySelector('.slider-head span')?.textContent === 'Colours').querySelector('input'); r.value = '10'; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  ok((await lit()).length === 0 && /^Your own mix/.test(await note()), `a slider moved: no grade lit — "${await note()}"`);
  await pick('Strong');
  { const s = await sliders(); ok(JSON.stringify(await lit()) === '["Strong"]' && s.Colours === 8 && s['Ink lines'] === 1.3 && s.Smoothing === 3 && (await detail()) === 'Medium', 'Strong picked again: its settings back'); }
  // Detail moved alone: a mix of your own too; back to Medium detail: Strong again
  { const b = await n(); await page.locator('.field', { hasText: 'Detail' }).locator('[role=radio]', { hasText: /^Bold$/ }).click(); await fresh(b); }
  ok((await lit()).length === 0, 'Detail moved: no grade lit');
  { const b = await n(); await page.locator('.field', { hasText: 'Detail' }).locator('[role=radio]', { hasText: /^Medium$/ }).click(); await fresh(b); }
  ok(JSON.stringify(await lit()) === '["Strong"]', 'Detail back to Medium: Strong lit again (the settings say which grade they are)');
  // the grades are the Cartoon filter's only
  await page.locator('.fx-tile[data-fx="oil"]').click();
  ok(await page.locator('.field', { hasText: 'How cartoony' }).isHidden(), 'Oil paint: no grades');
  { const b = await n(); await page.locator('.fx-tile[data-fx="cartoon"]').click(); await fresh(b); }
  ok(await page.locator('.field', { hasText: 'How cartoony' }).isVisible() && JSON.stringify(await lit()) === '["Strong"]', 'back to Cartoon: the grades again, as they were');

  // Extreme saved at full size looks like its preview
  await pick('Extreme');
  const prev = await page.evaluate(() => { const c = document.querySelector('canvas.ed-canvas'); return { W: c.width, H: c.height, d: [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data] }; });
  const saved = await download(page, () => page.getByRole('button', { name: 'Save' }).click());
  const sv = await page.evaluate(async (b64) => { const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))])); const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d'); c.drawImage(bmp, 0, 0); return { W: bmp.width, H: bmp.height, d: [...c.getImageData(0, 0, bmp.width, bmp.height).data] }; }, readFileSync(saved).toString('base64'));
  { let diff = 0; for (let i = 0; i < prev.d.length; i += 4) for (let k = 0; k < 3; k++) diff += Math.abs(prev.d[i + k] - sv.d[i + k]);
    const mean = diff / (prev.W * prev.H * 3);
    ok(sv.W === prev.W && sv.H === prev.H && mean < 6, `Extreme saved at full size: as its preview (${sv.W}×${sv.H}, mean difference ${mean.toFixed(2)} — JPEG)`); }

  // a phone: the grade buttons take a finger, nothing scrolls sideways
  const ph = await newPage({ ...devices['iPhone 13'] });
  await ph.goto(base + '#/cartoon');
  await ph.locator('input[type=file]').first().setInputFiles(F('coffee.jpg'));
  await ph.waitForFunction(() => +(document.querySelector('canvas.ed-canvas')?.dataset.n || 0) > 0, null, { timeout: 60000 });
  const hs = await ph.locator('.field', { hasText: 'How cartoony' }).locator('[role=radio]').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok(hs.length === 5 && hs.every(([w, h]) => w >= 44 && h >= 44), `phone: the five grade buttons take a finger (${hs.map(([w, h]) => `${w}×${h}`).join(', ')})`);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no sideways scroll with the grades');
  ok(!page.errors.length && !ph.errors.length, `no page errors ${[...page.errors, ...ph.errors].slice(0, 3).join(' | ')}`);
};
