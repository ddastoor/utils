// Inflation (#/inflation): future cost and present value with annual compounding; purchasing power lost.
import { calc, inr } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/inflation`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('Future cost of the same things') === '₹3,20,714' && await c.big("Today's money is worth (in future)") === '₹31,180', 'default ₹1 L, 6 %, 20 y → ₹3,20,714 / ₹31,180');
  ok(await c.row('Purchasing power lost') === '68.8%', `purchasing power lost 68.8 % (${await c.row('Purchasing power lost')})`);
  for (const [a, r, y] of [[50000, 4, 10], [1000000, 7.5, 25], [100, 2, 1]]) {
    await c.set('Amount today', a); await c.set('Inflation rate', r); await c.set('Years', y);
    const f = (1 + r / 100) ** y;
    ok(await c.big('Future cost of the same things') === inr(Math.round(a * f)) && await c.big("Today's money is worth (in future)") === inr(Math.round(a / f)), `₹${a}, ${r} %, ${y} y → ${inr(Math.round(a * f))}`);
  }
  await c.set('Inflation rate', 0);
  ok(await c.big('Future cost of the same things') === '₹100' && await c.row('Purchasing power lost') === '0%', '0 % inflation changes nothing');
  await c.set('Years', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'missing years → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/inflation`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
