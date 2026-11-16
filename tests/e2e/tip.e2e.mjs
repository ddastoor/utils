// Tip & Bill Splitter (#/tip): tip maths, split, rounding up per person, collected total, single payer.
import { calc } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/tip`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('Each person pays') === '₹660' && await c.big('Total with tip') === '₹2,640' && await c.row('Tip amount') === '₹240', 'default ₹2,400 + 10 % ÷ 4 = ₹660 each');
  await c.set('Bill amount', 1000); await c.set('Tip', 15); await c.set('People', 3);
  ok(await c.big('Each person pays') === '₹383.33' && await c.big('Total with tip') === '₹1,150', `₹1,000 + 15 % ÷ 3 = ₹383.33 (${await c.big('Each person pays')})`);
  await c.seg('Round per person', 'To ₹1');
  ok(await c.big('Each person pays') === '₹384' && await c.row('Collected') === '₹1,152', 'rounded up to ₹1: ₹384 each, ₹1,152 collected');
  await c.seg('Round per person', 'To ₹10');
  ok(await c.big('Each person pays') === '₹390' && await c.row('Collected') === '₹1,170', 'rounded up to ₹10: ₹390');
  await c.seg('Round per person', 'No'); await c.set('Tip', 0); await c.set('People', 1);
  ok(await c.big('Each person pays') === '₹1,000', 'no tip, one person');
  await c.set('People', 0);
  ok(await c.big('Each person pays') === '₹1,000', '0 people treated as 1');
  await c.set('Bill amount', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'empty bill → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/tip`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
