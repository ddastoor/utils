// Passphrase Generator (#/passphrase): words from the EFF large list only, word count, separators, capitals, the extra
// digit, entropy = words × log2(7776) (+ log2 10), spread over the list.
import { readFileSync } from 'node:fs';
const LIST = new Set(readFileSync(new URL('../../public/data/eff_large_wordlist.txt', import.meta.url), 'utf8').split(/\s+/).filter((w) => /^[a-z-]+$/.test(w)));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/passphrase`);
  const ps = () => page.$$eval('code.pw', (c) => c.map((e) => e.textContent));
  const slider = page.locator('input[type=range]'), setN = async (n) => { await slider.fill(String(n)); await slider.dispatchEvent('input'); };
  const sep = (n) => page.getByRole('radio', { name: n, exact: true }).click();
  const tog = (l) => page.locator('label.switch').filter({ hasText: l }).click();
  await page.locator('code.pw').first().waitFor();
  ok(LIST.size === 7776, 'EFF list has 7,776 words');
  let p = await ps();
  ok(p.length === 5 && p.every((x) => x.split('-').length === 6 && x.split('-').every((w) => LIST.has(w))), 'default: 6 EFF words joined by -');
  ok((await page.locator('.pill').textContent()).includes(`~${Math.round(6 * Math.log2(7776))} bits`), '6 × log2(7776) ≈ 78 bits');
  await setN(3); await sep('space'); p = await ps(); ok(p.every((x) => x.split(' ').length === 3), '3 words, space separator');
  await setN(12); await sep('underscore _'); p = await ps(); ok(p.every((x) => x.split('_').length === 12), '12 words, underscore');
  await sep('dot .'); await tog('Capitalise words'); p = await ps();
  ok(p.every((x) => x.split('.').every((w) => /^[A-Z]/.test(w) && LIST.has(w.toLowerCase()))), 'capitalised, dot separator');
  await tog('Capitalise words'); await sep('hyphen -'); await setN(6); await tog('Add a digit'); p = await ps();
  ok(p.every((x) => { const ws = x.split('-'); return ws.filter((w) => /\d$/.test(w)).length === 1 && ws.every((w) => LIST.has(w.replace(/\d$/, ''))); }), 'exactly one word gets a digit');
  ok((await page.locator('.pill').textContent()).includes(`~${Math.round(6 * Math.log2(7776) + Math.log2(10))} bits`), 'digit adds log2(10) bits');
  await tog('Add a digit'); await sep('none'); p = await ps(); ok(p.every((x) => /^[a-z-]+$/.test(x) && !x.includes(' ')), 'no separator');
  await sep('hyphen -'); await setN(12); const seen = new Set();
  for (let i = 0; i < 40; i++) { await page.getByRole('button', { name: 'Generate again' }).click(); (await ps()).forEach((x) => x.split('-').forEach((w) => seen.add(w))); }
  ok(seen.size > 1900, `2,400 draws reach ${seen.size} different words (expected ≈ 2,050 for a uniform pick from 7,776)`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/passphrase`); await ph.locator('code.pw').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
