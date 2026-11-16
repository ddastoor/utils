// Emoji & Symbols (#/emoji): the full emoji set grouped, search by name, symbols tab with code points, rupee search,
// nothing-found, tap to copy.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/emoji`);
  const q = page.getByPlaceholder(/Search emoji or symbols/), cells = page.locator('.emoji-cell');
  await cells.first().waitFor();
  const total = await cells.count();
  ok(total > 1800, `full emoji set shown (${total})`);
  ok(await page.locator('.card h2, .card .card-title').filter({ hasText: 'Smileys & Emotion' }).count() + await page.getByText('Smileys & Emotion').count() > 0, 'grouped (Smileys & Emotion …)');
  const search = async (t) => { await q.fill(t); await q.dispatchEvent('input'); return page.$$eval('.emoji-cell', (c) => c.map((e) => [e.textContent, e.title])); };
  let r = await search('heart');
  ok(r.length > 20 && r.every(([, t]) => t.includes('heart')) && r.some(([e]) => e === '❤️'), `"heart" → ${r.length} emoji, all named heart, incl ❤️`);
  r = await search('flag india'); ok(r.some(([e]) => e === '🇮🇳') && r.length <= 2, `"flag india" finds 🇮🇳 (names have capitals; search was case-sensitive) (${r.map(([e]) => e).join(' ')})`);
  r = await search('India FLAG'); ok(r.some(([e]) => e === '🇮🇳'), 'any case, any word order');
  r = await search('folded hands'); ok(r.some(([e]) => e.startsWith('🙏')), '🙏 folded hands');
  r = await search('zzzzqqq'); ok(r.length === 0 && await page.getByText('Nothing found.').isVisible(), 'nothing found');
  await page.getByRole('radio', { name: 'Symbols', exact: true }).click();
  r = await search(''); ok(r.some(([c, t]) => c === '₹' && t === 'U+20B9') && r.some(([c]) => c === '√') && r.length > 150, `symbols with code points (₹ U+20B9; ${r.length})`);
  r = await search('rupee'); ok(r.length === 1 && r[0][0] === '₹', 'search "rupee" → ₹');
  r = await search('arrow'); ok(r.length > 20 && r.some(([c]) => c === '→'), 'search "arrow" → the Arrows group');
  await search('rupee'); await page.locator('.emoji-cell').first().click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === '₹', 'tap copies ₹');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/emoji`); await ph.locator('.emoji-cell').first().waitFor();
  const cw = await ph.locator('.emoji-cell').first().evaluate((e) => e.getBoundingClientRect().width);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && cw >= 36, `phone: no horizontal scroll, cells ${cw.toFixed(0)} px wide`);
};
