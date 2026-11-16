// Roman Numerals (#/roman): both directions, subtractive forms, the 1–3999 limits, invalid numerals.
import { calc } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/roman`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const L = 'Number (1–3999) or Roman numeral';
  ok(await c.big('Roman') === 'MMXXVI', 'default 2026 → MMXXVI');
  for (const [n, r] of [[1, 'I'], [4, 'IV'], [9, 'IX'], [14, 'XIV'], [40, 'XL'], [90, 'XC'], [400, 'CD'], [944, 'CMXLIV'], [1994, 'MCMXCIV'], [3999, 'MMMCMXCIX']]) {
    await c.set(L, n); ok(await c.big('Roman') === r, `${n} → ${r}`);
    await c.set(L, r); ok(await c.big('Number') === String(n), `${r} → ${n}`);
  }
  await c.set(L, 'mcmlxxxiv'); ok(await c.big('Number') === '1984', 'lower case accepted');
  for (const bad of ['0', '4000']) { await c.set(L, bad); ok(/1–3999/.test(await c.warn()), `${bad} out of range`); }
  for (const bad of ['IIII', 'VX', 'IC', 'ABC', 'MMMM']) { await c.set(L, bad); ok(/Not a valid Roman numeral/.test(await c.warn()), `${bad} refused`); }
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/roman`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
