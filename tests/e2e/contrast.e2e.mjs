// Contrast Checker (#/contrast, PC only): ratios for many colour pairs against the WCAG 2.2 formula computed here
// (sRGB → linear → relative luminance, (L1 + 0.05) / (L2 + 0.05)), truncated not rounded (#777 on white = 4.47 fails AA,
// #767676 = 4.54 passes), 40 random pairs, pass/fail rows, a suggested fix for every failing pair (it really passes —
// white or black when nothing more colourful does), see-through colours judged as they appear (text over the
// background, background over white), rgb() / hsl() / named colours, swap, invalid input, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/contrast`);
  const fg = page.locator('input[aria-label="Text colour"]'), bg = page.locator('input[aria-label="Background colour"]'); await fg.waitFor();
  const shown = async () => +(await page.locator('.contrast-ratio').textContent()).split(' ')[0];
  const passes = () => page.$$eval('.tbl tr td', (t) => t.map((x) => x.textContent.includes('Pass')));
  const pairs = [['#000000', '#ffffff'], ['#777777', '#ffffff'], ['#767676', '#ffffff'], ['#ff0000', '#ffffff'], ['#1f2937', '#ffffff'], ['#ff9933', '#138808'], ['#4f46e5', '#eef0f4'], ['#ffffff', '#ffffff'], ['#0000ff', '#ffff00']];
  const bad = [];
  for (const [a, b] of pairs) {
    await fg.fill(a); await bg.fill(b); const r = ratio(a, b), s = await shown(), p = await passes();
    if (s !== Math.floor(r * 100) / 100) bad.push(`${a}/${b}: ${s} vs ${r}`);
    if (JSON.stringify(p) !== JSON.stringify([r >= 4.5, r >= 7, r >= 3, r >= 4.5, r >= 3])) bad.push(`${a}/${b} pass/fail`);
  }
  ok(!bad.length, `${pairs.length} pairs: ratio (truncated) and the five WCAG rows match the formula ${bad.join('; ')}`);
  await fg.fill('#000000'); await bg.fill('#ffffff'); ok(await page.locator('.contrast-ratio').textContent() === '21.00 : 1', 'black on white = 21.00 : 1');
  await fg.fill('#777777'); ok(await shown() === 4.47 && !(await passes())[0], '#777 on white = 4.47 — fails AA (not rounded up to 4.5)');
  const sugg = await page.$$eval('.link-btn', (b) => b.map((x) => x.textContent.split(' ').pop()));
  ok(sugg.length === 2 && ratio(sugg[0], '#ffffff') >= 4.5 && ratio('#777777', sugg[1]) >= 4.5, `suggested text ${sugg[0]} and background ${sugg[1]} both pass 4.5`);
  await page.locator('.link-btn').first().click(); ok(await fg.inputValue() === sugg[0] && (await passes())[0] && await page.locator('.link-btn').count() === 0, 'applying a suggestion passes AA');
  await fg.fill('#336699'); await bg.fill('#f0f0f0'); await page.getByRole('button', { name: 'Swap' }).click();
  ok(await fg.inputValue() === '#f0f0f0' && await bg.inputValue() === '#336699' && await shown() === Math.floor(ratio('#336699', '#f0f0f0') * 100) / 100, 'Swap keeps the ratio');
  ok(await page.locator('.contrast-preview').evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor].join()) === 'rgb(240, 240, 240),rgb(51, 102, 153)', 'preview uses the colours');
  // 40 random pairs against the formula; every failing pair gets two suggestions and both really reach 4.5
  const hexOf = () => `#${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')}`, badR = []; let failing = 0, noFix = 0, weak = 0;
  for (let i = 0; i < 40; i++) {
    const a = hexOf(), b = hexOf(); await fg.fill(a); await bg.fill(b); const r = ratio(a, b), s2 = await shown();
    if (s2 !== Math.floor(r * 100 + 1e-9) / 100) badR.push(`${a}/${b}: ${s2} vs ${r}`);
    if (r < 4.5) { failing++; const sg = await page.$$eval('.link-btn', (x) => x.map((y) => y.textContent.split(' ').pop())); if (sg.length !== 2) noFix++; else if (ratio(sg[0], b) < 4.5 || ratio(a, sg[1]) < 4.5) weak++; }
    else if (await page.locator('.link-btn').count()) badR.push(`${a}/${b}: suggestion shown though it passes`);
  }
  ok(!badR.length, `40 random pairs: shown ratio = WCAG formula, truncated ${badR.slice(0, 3).join('; ')}`);
  ok(failing > 5 && noFix === 0 && weak === 0, `${failing} failing pairs: each gets a text and a background suggestion, and all of them reach 4.5 (${noFix} without, ${weak} too weak) — saturated colours used to get none`);
  await fg.fill('#026041'); await bg.fill('#208312'); const sg2 = await page.$$eval('.link-btn', (x) => x.map((y) => y.textContent.split(' ').pop()));
  ok(sg2.length === 2 && ratio(sg2[0], '#208312') >= 4.5 && ratio('#026041', sg2[1]) >= 4.5, `dark green on green: suggestions ${sg2.join(' / ')} pass`);
  // the same boundary as the truncation rule, from both sides
  for (const [c, want, aa] of [['#767676', 4.54, true], ['#777777', 4.47, false], ['#949494', 3.03, false], ['#959595', 2.99, false], ['#595959', 7, true], ['#5a5a5a', 6.89, true]]) { await fg.fill(c); await bg.fill('#ffffff'); const p2 = await passes(); ok(await shown() === want && p2[0] === aa && p2[2] === (want >= 3) && p2[1] === (want >= 7), `${c} on white = ${want.toFixed(2)} (AA ${aa ? 'pass' : 'fail'}, large ${want >= 3 ? 'pass' : 'fail'}, AAA ${want >= 7 ? 'pass' : 'fail'})`); }
  // see-through colours are judged as they appear
  await fg.fill('#00000080'); await bg.fill('#ffffff');
  ok(await shown() === Math.floor(ratio('#7f7f7f', '#ffffff') * 100) / 100 && /The text is 50 % opaque: over this background it looks like #7f7f7f/.test(await page.locator('.tool-body').textContent()), `50 % black on white is judged as #7f7f7f (${await shown()}) — it used to read 21`);
  await fg.fill('#00000000'); ok(await shown() === 1, 'fully transparent text = 1.00 : 1');
  await fg.fill('#000'); await bg.fill('#ff000080'); ok(await shown() === Math.floor(ratio('#000000', '#ff7f7f') * 100) / 100 && /The background is 50 % opaque: over a white page it looks like #ff7f7f/.test(await page.locator('.tool-body').textContent()), 'a 50 % red background is judged over a white page (#ff7f7f)');
  await fg.fill('#0008'); await bg.fill('#fff'); ok(await shown() === Math.floor(ratio('#777777', '#ffffff') * 100) / 100, '4-digit hex #0008 (53 % black) is read');
  ok(await page.locator('.contrast-preview').evaluate((e) => getComputedStyle(e).color) === 'rgba(0, 0, 0, 0.533)', 'the preview shows the see-through text as typed');
  // other ways to write a colour
  for (const [t, hx] of [['rgb(31, 41, 55)', '#1f2937'], ['rgb(31 41 55)', '#1f2937'], ['hsl(0, 100%, 50%)', '#ff0000'], ['navy', '#000080'], ['RebeccaPurple', '#663399'], ['1f2937', '#1f2937'], ['  #1F2937 ', '#1f2937']]) { await bg.fill('#ffffff'); await fg.fill(t); ok(!(await fg.evaluate((e) => e.classList.contains('bad'))) && await shown() === Math.floor(ratio(hx, '#ffffff') * 100 + 1e-9) / 100 && await page.locator('input[aria-label="Text colour picker"]').inputValue() === hx, `"${t.trim()}" is read as ${hx}`); }
  for (const t of ['#12', 'notacolour', 'rgb(1,2)', '#12345', '']) { await fg.fill('#000000'); const before = await shown(); await fg.fill(t); ok(await fg.evaluate((e) => e.classList.contains('bad')) && await shown() === before, `"${t}" is marked and the last good result stays`); }
  ok(/Not a colour/.test(await (async () => { await fg.fill('zzz'); return fg.getAttribute('title'); })()), 'the reason is given as a tooltip');
  await page.locator('input[aria-label="Text colour picker"]').evaluate((e) => { e.value = '#336699'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  ok(await fg.inputValue() === '#336699' && !(await fg.evaluate((e) => e.classList.contains('bad'))), 'the colour picker fills the text box and clears the error');
  await bg.fill('#336699'); await fg.fill('#12'); ok(await fg.evaluate((e) => e.classList.contains('bad')), 'invalid hex marked');
  await fg.fill('#abc'); ok(await shown() === Math.floor(ratio('#aabbcc', '#336699') * 100) / 100, 'short hex #abc accepted');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'contrast');
};
