// PPF (#/ppf): yearly deposit before 5 April compounding annually; published reference value; ₹1.5 L limit.
import { calc, inr } from '../lib/calc.mjs';
const ppf = (a, r, y) => { let b = 0; for (let i = 0; i < y; i++) b = (b + a) * (1 + r / 100); return b; };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/ppf`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('Maturity value') === '₹40,68,209', `₹1.5 L/yr @ 7.1 % × 15 y = ₹40,68,209 (published figure) (${await c.big('Maturity value')})`);
  ok(await c.big('Total deposited') === '₹22,50,000' && await c.big('Interest earned') === '₹18,18,209', 'deposited ₹22.5 L, interest ₹18,18,209');
  for (const [a, r, y] of [[50000, 7.1, 15], [12000, 8, 20], [500, 7.1, 15], [150000, 7.1, 25]]) {
    await c.set('Yearly deposit (₹500 – ₹1.5 lakh)', a); await c.set('Interest rate (current notified rate)', r); await c.set('Years', y);
    ok(await c.big('Maturity value') === inr(Math.round(ppf(a, r, y))), `₹${a}/yr @ ${r} % × ${y} y → ${inr(Math.round(ppf(a, r, y)))} (${await c.big('Maturity value')})`);
  }
  ok(/EEE/.test(await c.row('Tax status')), 'tax status EEE');
  await c.set('Yearly deposit (₹500 – ₹1.5 lakh)', 150001);
  ok(/limit is ₹1,50,000/.test(await c.warn()), 'above ₹1.5 L refused');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/ppf`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
