// SIP (#/sip): monthly SIP (instalment at the start of each month, monthly rate = annual / 12 — the AMFI / Groww
// convention), yearly step-up, lumpsum; independent JS re-implementation; invalid input; phone.
import { calc, num, inr } from '../lib/calc.mjs';
const sip = (P, R, Y, step = 0) => { const i = R / 1200; let v = 0, inv = 0, m = P; for (let k = 0; k < Y * 12; k++) { if (k && k % 12 === 0) m *= 1 + step / 100; v = (v + m) * (1 + i); inv += m; } return { v, inv }; };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/sip`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('Maturity value') === '₹50,45,760', `₹10,000/month @ 12 % for 15 y = ₹50,45,760 (${await c.big('Maturity value')})`);
  ok(await c.big('Invested') === '₹18,00,000', 'invested ₹18 L');
  for (const [P, R, Y] of [[5000, 10, 10], [2500, 15, 25], [25000, 8, 5], [100, 12, 1]]) {
    await c.set('Amount', P); await c.set('Expected return', R); await c.set('Period', Y);
    const { v, inv } = sip(P, R, Y);
    ok(await c.big('Maturity value') === inr(Math.round(v)) && await c.big('Invested') === inr(inv), `₹${P} × ${Y} y @ ${R} % → ${inr(Math.round(v))} (${await c.big('Maturity value')})`);
    ok(num(await c.big('Gains')) === Math.round(v) - Math.round(inv), 'gains = maturity − invested');
  }
  await c.set('Amount', 10000); await c.set('Expected return', 12); await c.set('Period', 10); await c.set('Annual step-up (SIP)', 10);
  const st = sip(10000, 12, 10, 10);
  ok(await c.big('Maturity value') === inr(Math.round(st.v)) && await c.big('Invested') === inr(Math.round(st.inv)), `10 % yearly step-up → ${inr(Math.round(st.v))} (${await c.big('Maturity value')})`);
  await c.set('Annual step-up (SIP)', 0); await c.seg('Investment', 'Lumpsum'); await c.set('Amount', 100000); await c.set('Period', 15);
  ok(await c.big('Maturity value') === inr(Math.round(100000 * 1.12 ** 15)), `lumpsum ₹1 L @ 12 % × 15 y → ${await c.big('Maturity value')}`);
  ok(/^5\.47×$/.test(await c.row('Wealth multiple')), `wealth multiple 5.47× (${await c.row('Wealth multiple')})`);
  await c.set('Expected return', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'missing return → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/sip`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
