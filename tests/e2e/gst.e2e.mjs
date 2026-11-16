// GST (#/gst): add / remove GST at every slab, CGST+SGST vs IGST split, odd amounts, invalid input, phone.
import { calc, num, inr } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/gst`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('Total (incl. GST)') === '₹1,180' && await c.big('GST amount') === '₹180', 'default ₹1,000 + 18 % = ₹1,180');
  ok(await c.row('CGST (9%)') === '₹90' && await c.row('SGST (9%)') === '₹90', 'within state: CGST 9 % + SGST 9 %');
  await c.seg('Supply', 'Inter-state (IGST)');
  ok(await c.row('IGST (18%)') === '₹180', 'inter-state: IGST 18 %');
  for (const [amt, rate] of [[2499, '5'], [99999.99, '28'], [12345, '12'], [800, '3'], [100000, '0.25'], [5000, '40']]) {
    await c.set('Amount', amt); await c.seg('GST rate', `${rate}%`);
    const tax = amt * +rate / 100;
    ok(await c.big('GST amount') === inr(Math.round(tax * 100) / 100) && await c.big('Total (incl. GST)') === inr(Math.round((amt + tax) * 100) / 100), `₹${amt} + ${rate} % → tax ${inr(Math.round(tax * 100) / 100)} (${await c.big('GST amount')})`);
  }
  await c.seg('Amount is', 'Including GST (remove)'); await c.set('Amount', 1180); await c.seg('GST rate', '18%');
  ok(await c.big('Base (excl. GST)') === '₹1,000' && await c.big('GST amount') === '₹180', 'remove GST: ₹1,180 incl. 18 % → base ₹1,000');
  await c.set('Amount', 999); await c.seg('GST rate', '5%');
  ok(await c.big('Base (excl. GST)') === inr(Math.round(999 / 1.05 * 100) / 100), `remove 5 % from ₹999 → ${await c.big('Base (excl. GST)')}`);
  await c.seg('Supply', 'Within state (CGST+SGST)');
  ok(Math.abs(num(await c.row('CGST (2.5%)')) * 2 - num(await c.big('GST amount'))) < 0.02, 'CGST is half the GST');
  await c.set('Amount', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'empty amount → asks for a number');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/gst`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
