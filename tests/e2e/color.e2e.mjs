// Color Converter (#/color): HEX (3/6/8 digits) ⇄ RGB ⇄ HSL ⇄ OKLCH with known values (CSS Color 4), WCAG contrast
// against white/black computed here, out-of-range RGB clamped, invalid HEX flagged, the colour picker in sync.
import { pcOnlyOnPhone } from './_pconly.mjs';
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/color`);
  const f = (l) => page.getByLabel(l, { exact: true });
  const all = async () => Object.fromEntries(await Promise.all(['HEX', 'RGB', 'HSL', 'OKLCH'].map(async (k) => [k, await f(k).inputValue()])));
  const type = async (l, v) => { await f(l).fill(v); await f(l).dispatchEvent('input'); };
  const kv = (l) => page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent === l); return i >= 0 ? s[i + 1].textContent : null; }, l);
  await f('HEX').waitFor();
  let v = await all();
  ok(v.HEX === '#4f46e5' && v.RGB === 'rgb(79, 70, 229)' && v.HSL === 'hsl(243 75% 59%)', `default ${JSON.stringify(v)}`);
  ok(await kv('Contrast vs white') === `${cr([79, 70, 229], [255, 255, 255]).toFixed(2)} : 1` && await kv('Contrast vs black') === `${cr([79, 70, 229], [0, 0, 0]).toFixed(2)} : 1`, `WCAG contrast (${await kv('Contrast vs white')})`);
  for (const [hex, rgb, hsl, ok_] of [['#ff0000', 'rgb(255, 0, 0)', 'hsl(0 100% 50%)', 'oklch(62.8% 0.258 29.2)'], ['#ffffff', 'rgb(255, 255, 255)', 'hsl(0 0% 100%)', 'oklch(100.0% 0.000'], ['#000000', 'rgb(0, 0, 0)', 'hsl(0 0% 0%)', 'oklch(0.0% 0.000'], ['#00ff00', 'rgb(0, 255, 0)', 'hsl(120 100% 50%)', 'oklch(86.6% 0.295 142.5)'], ['#0000ff', 'rgb(0, 0, 255)', 'hsl(240 100% 50%)', 'oklch(45.2% 0.313 264.1)']]) {
    await type('HEX', hex); v = await all();
    ok(v.RGB === rgb && v.HSL === hsl && v.OKLCH.startsWith(ok_), `${hex} → ${v.RGB}, ${v.HSL}, ${v.OKLCH}`);
  }
  ok(await kv('Contrast vs white') === '8.59 : 1', 'blue on white 8.59 : 1 (WCAG reference)');
  await type('HEX', '#abc'); ok((await all()).RGB === 'rgb(170, 187, 204)', '3-digit HEX');
  await type('HEX', '#11223380'); ok((await all()).RGB === 'rgb(17, 34, 51)', '8-digit HEX (alpha ignored)');
  await type('HEX', '#12345'); ok(await f('HEX').evaluate((e) => e.classList.contains('bad')) && (await all()).RGB === 'rgb(17, 34, 51)', 'invalid HEX flagged, others unchanged');
  await type('RGB', 'rgb(255, 165, 0)'); ok((await all()).HEX === '#ffa500' && (await all()).HSL === 'hsl(39 100% 50%)', 'RGB → HEX/HSL (orange)');
  await type('RGB', 'rgb(300, -20, 128)'); v = await all(); ok(v.HEX === '#ff0080' && v.HSL === 'hsl(330 100% 50%)', `out-of-range RGB clamped (${v.HEX}, ${v.HSL})`);
  await type('HSL', 'hsl(210 50% 40%)'); ok((await all()).HEX === '#336699', 'HSL → HEX (#336699)');
  await type('OKLCH', 'oklch(62.8% 0.258 29.2)'); ok((await all()).HEX === '#ff0000', 'OKLCH → HEX (red)');
  ok(await page.locator('input[type=color]').inputValue() === '#ff0000', 'picker follows');
  await page.locator('input[type=color]').evaluate((e) => { e.value = '#008080'; e.dispatchEvent(new Event('input')); });
  ok((await all()).RGB === 'rgb(0, 128, 128)', 'picker → fields (teal)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'color');
};
