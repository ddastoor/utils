// Color Converter (#/color, PC only): HEX ⇄ RGB ⇄ HSL ⇄ OKLCH with opacity. References: Python's colorsys and an
// independent OKLCH implementation (260 colours), and Chrome's own CSS engine — every text this tab prints is painted
// on a canvas and must give the same pixel, and every notation typed into a box must be read as Chrome reads it.
// Also: any CSS colour in any box, wrong input marked, colours outside sRGB fitted with a note, exact round trips.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { REF, setValue, notes, until } from './_devdata.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/color`);
  const F = { hex: page.getByLabel('HEX', { exact: true }), rgb: page.getByLabel('RGB', { exact: true }), hsl: page.getByLabel('HSL', { exact: true }), ok: page.getByLabel('OKLCH', { exact: true }) };
  await F.hex.waitFor();
  const all = async () => ({ hex: await F.hex.inputValue(), rgb: await F.rgb.inputValue(), hsl: await F.hsl.inputValue(), ok: await F.ok.inputValue() });
  const bad = (f) => F[f].evaluate((e) => e.classList.contains('bad'));
  /** What Chrome's CSS engine makes of a colour text: the pixel it paints, as #rrggbb or #rrggbbaa. */
  const chrome = (css) => page.evaluate((c) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#010203'; x.fillStyle = c; const one = x.fillStyle; x.fillStyle = '#030201'; x.fillStyle = c; if (one !== x.fillStyle) return null; // a text that is not a colour leaves the old fill
    x.clearRect(0, 0, 1, 1); x.fillRect(0, 0, 1, 1); const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data;
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') + (a < 255 ? a.toString(16).padStart(2, '0') : '');
  }, css);
  const near = (a, b, tol = 1) => a && b && a.length === b.length && a.slice(1).match(/../g).every((h, i) => Math.abs(parseInt(h, 16) - parseInt(b.slice(1).match(/../g)[i], 16)) <= tol);
  ok(JSON.stringify(await all()) === JSON.stringify({ hex: '#4f46e5', rgb: 'rgb(79, 70, 229)', hsl: 'hsl(243.4 75.4% 58.6%)', ok: 'oklch(51.06% 0.23005 276.97)' }) && await page.locator('input[type=color]').inputValue() === '#4f46e5', 'the default colour in four notations, and in the picker');
  // reference colours: our numbers = Python's; Chrome paints our texts as the same colour
  let py = 0, px = 0, exact = 0, n = 0;
  for (const [i, r] of REF.color.entries()) {
    if (i % 4 && i > 12) continue; n++;
    await setValue(F.hex, r.hex); const v = await all();
    const h = /^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/.exec(v.hsl).slice(1).map(Number), o = /^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/.exec(v.ok).slice(1).map(Number);
    const grey = r.hsl[1] < 0.05, hueOk = (a, b, tol) => Math.abs(a - b) <= tol || Math.abs(a - b) >= 360 - tol;
    if (v.rgb === `rgb(${r.rgb.join(', ')})` && (grey || hueOk(h[0], r.hsl[0], 0.051)) && Math.abs(h[1] - r.hsl[1]) <= 0.051 && Math.abs(h[2] - r.hsl[2]) <= 0.051 && Math.abs(o[0] - r.oklch[0]) <= 0.0051 && Math.abs(o[1] - r.oklch[1]) <= 0.00001 && (r.oklch[1] < 1e-5 || hueOk(o[2], r.oklch[2], 0.0051))) py++;
    else if (py === n - 1) ok(false, `${r.hex}: ${JSON.stringify(v)} vs Python hsl ${r.hsl} oklch ${r.oklch}`);
    const c = [await chrome(v.rgb), await chrome(v.hsl), await chrome(v.ok)];
    if (c.every((x) => near(x, r.hex))) px++; else if (px === n - 1) ok(false, `${r.hex}: Chrome paints ${JSON.stringify(v)} as ${c}`);
    if (c.every((x) => x === r.hex)) exact++;
  }
  ok(py === n, `${n} colours: RGB, HSL (Python's colorsys) and OKLCH (an independent implementation) agree to the printed digits (${py})`);
  ok(px === n && exact >= n * 0.9, `Chrome's CSS engine paints every rgb() / hsl() / oklch() text printed here as the same colour (${px}/${n} within one step, ${exact} exactly)`);
  // round trips through the boxes
  let rt = 0; for (const r of REF.color.slice(20, 60)) { await setValue(F.hex, r.hex); const v = await all(); await setValue(F.hsl, v.hsl); const a = await F.hex.inputValue(); await setValue(F.ok, v.ok); const b = await F.hex.inputValue(); await setValue(F.rgb, v.rgb); if (a === r.hex && b === r.hex && await F.hex.inputValue() === r.hex) rt++; }
  ok(rt === 40, `40 colours: pasting the HSL, OKLCH and RGB texts back gives the same hex (${rt}) — rounding to whole numbers used to change the colour`);
  // every box reads any CSS colour, as Chrome reads it
  const CASES = [['hex', '#f00'], ['hex', 'f00'], ['hex', '#FF0000'], ['hex', 'red'], ['hex', 'rebeccapurple'], ['hex', '#ff000080'], ['hex', '#1234'], ['hex', 'transparent'], ['rgb', 'rgb(255, 0, 0)'], ['rgb', 'rgb(100% 0% 0%)'], ['rgb', 'rgb(1e2, 0, 0)'], ['rgb', 'rgb(300, -20, 0)'],
    ['rgb', 'rgba(0, 128, 255, 0.5)'], ['rgb', 'rgb(0 128 255 / 50%)'], ['rgb', '#4f46e5'], ['rgb', 'hsl(120 100% 50%)'], ['rgb', 'teal'], ['hsl', 'hsl(0.5turn 100% 50%)'], ['hsl', 'hsl(120deg, 100%, 25%)'], ['hsl', 'hsl(480 150% 50%)'], ['hsl', 'hsl(-120 50% 50%)'], ['hsl', 'hsl(243 75 59)'],
    ['hsl', 'hsl(3.14159rad 100% 50%)'], ['hsl', 'hsl(200grad 100% 50%)'], ['hsl', 'hsla(120, 100%, 50%, 0.3)'], ['hsl', 'hwb(120 0% 0%)'], ['hsl', 'hwb(0 50% 50%)'], ['hsl', 'hwb(200 20% 30%)'], ['ok', 'oklch(0.628 0.258 29.2)'], ['ok', 'oklch(62.8% 0.258 29.2)'], ['ok', 'oklch(50% 0 0)'], ['ok', 'oklch(70% 0.1 180)'],
    ['ok', 'oklch(60% 0.15 50 / 0.4)'], ['ok', 'oklab(62.8% 0.2249 0.1264)'], ['ok', 'oklch(0 0 0)'], ['ok', 'oklch(1 0 0)'], ['ok', 'oklab(0.5 -0.05 0.1)'], ['hex', 'DarkSlateGray'], ['hex', 'RGB(10 20 30)']];
  let agree = 0;
  for (const [f, text] of CASES) { await setValue(F[f], text); const mine = await F.hex.inputValue() || (await all()).rgb, want = await chrome(/^[0-9a-f]{3,8}$/i.test(text) ? `#${text}` : text); const got = f === 'hex' ? await chrome((await all()).rgb) : mine; if (!await bad(f) && near(got, want, f === 'ok' ? 2 : 1)) agree++; else ok(false, `${text} typed into ${f}: this tab ${got}, Chrome ${want}`); }
  ok(agree === CASES.length, `${CASES.length} notations (short and 8-digit hex, names, rgb with percentages / exponents / out-of-range values, hsl with turn / rad / grad / negative hue, hwb, oklch with L as 0–1 or %, oklab, alpha) are read as Chrome reads them (${agree})`);
  await setValue(F.rgb, '79, 70, 229'); ok(await F.hex.inputValue() === '#4f46e5', 'three bare numbers in the RGB box are RGB');
  await setValue(F.hsl, '0 100% 50%'); ok(await F.hex.inputValue() === '#ff0000', 'three bare values in the HSL box are HSL');
  await setValue(F.ok, '51.06% 0.23005 276.97'); ok(await F.hex.inputValue() === '#4f46e5', 'and in the OKLCH box, OKLCH');
  // alpha
  await setValue(F.hex, '#ff000080'); let v = await all();
  ok(v.rgb === 'rgba(255, 0, 0, 0.502)' && v.hsl === 'hsl(0 100% 50% / 0.502)' && v.ok === 'oklch(62.8% 0.25768 29.23 / 0.502)' && await page.getByLabel('Opacity').inputValue() === '50', '8-digit hex: the alpha is kept in every notation and on the slider (it used to be dropped)');
  ok(/repeating-conic-gradient/.test(await page.locator('.swatch').evaluate((e) => e.style.background)), 'a see-through colour is shown over a checkerboard');
  await page.getByLabel('Opacity').fill('25'); v = await all(); ok(v.hex === '#ff000040' && v.rgb === 'rgba(255, 0, 0, 0.25)', 'the Opacity slider sets the alpha');
  const acc = await page.locator('.card').filter({ hasText: 'Accessibility' }).locator('.kv span').allTextContents();
  ok(acc.join('|') === 'Contrast vs white|1.56 : 1|Contrast vs black|1.22 : 1', // red at 25 % over white is rgb(255, 191, 191); over black rgb(64, 0, 0)
    `contrast is worked out for the colour as it looks over white / black (${acc.join('|')})`);
  await page.locator('input[type=color]').fill('#00ff00'); v = await all(); ok(v.hex === '#00ff0040' && v.hsl === 'hsl(120 100% 50% / 0.25)', 'the picker changes the colour and keeps the opacity');
  await page.getByLabel('Opacity').fill('100'); ok((await all()).hex === '#00ff00', 'opaque again: 6-digit hex');
  await setValue(F.hex, '#767676'); ok(/Contrast vs white\s*4\.54 : 1/.test(await page.locator('.card').filter({ hasText: 'Accessibility' }).textContent()), '#767676 on white is 4.54 : 1 (the WCAG AA border)');
  // wrong input
  for (const [f, text] of [['hex', '#12'], ['hex', 'zzz'], ['rgb', '255'], ['rgb', '255, 0'], ['rgb', 'rgb(1,2)'], ['hsl', 'hsl(1 2)'], ['ok', 'oklch(50%)'], ['rgb', 'rgb(a,b,c)']]) {
    await setValue(F.hex, '#4f46e5'); await setValue(F[f], text);
    ok(await bad(f) && /Not a colour yet\. Each box takes any CSS colour/.test(await notes(page, '.note-warn')) && (f === 'hex' || await F.hex.inputValue() === '#4f46e5'), `${JSON.stringify(text)} in ${f.toUpperCase()}: marked, explained, the colour is not changed`);
  }
  await setValue(F.rgb, 'rgb(1, 2, 3)'); ok(!await bad('rgb') && await page.locator('.note-warn').count() === 0 && await F.hex.inputValue() === '#010203', 'a valid colour clears the mark and the message');
  await setValue(F.hex, ''); ok(!await bad('hex') && await page.locator('.note-warn').count() === 0, 'an empty box is not an error');
  // outside sRGB
  await setValue(F.ok, 'oklch(90% 0.4 150)');
  ok(/outside sRGB.*chroma reduced \(0\.4 → 0\.2199\)/.test(await notes(page)) && await F.rgb.inputValue() === 'rgb(65, 255, 135)', `a colour outside sRGB is brought inside it with a note — no "rgb(-1065, 214, -288)" (${await F.rgb.inputValue()})`);
  await setValue(F.ok, 'oklch(62.8% 0.258 29.2)'); ok(await page.locator('.card .note').count() === 0, 'a colour that is inside sRGB up to rounding gets no note');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'color');
};
