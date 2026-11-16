// Contrast Checker (#/contrast, PC only): ratios for many colour pairs against the WCAG 2.2 formula computed here
// (sRGB → linear → relative luminance, (L1 + 0.05) / (L2 + 0.05)), truncated not rounded (#777 on white = 4.47 fails AA,
// #767676 = 4.54 passes), pass/fail rows, suggested fixes really pass, swap, invalid hex, phone note.
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
  await fg.fill('#12'); ok(await fg.evaluate((e) => e.classList.contains('bad')), 'invalid hex marked');
  await fg.fill('#abc'); ok(await shown() === Math.floor(ratio('#aabbcc', '#336699') * 100) / 100, 'short hex #abc accepted');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'contrast');
};
