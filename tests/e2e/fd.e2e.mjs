// FD / RD (#/fd): fixed deposit with quarterly / monthly / half-yearly / yearly compounding and simple interest;
// recurring deposit (bank method: each instalment compounds quarterly for its remaining time); effective yield.
import { calc, inr } from '../lib/calc.mjs';
const grow = (a, r, n, t) => (n ? a * (1 + r / n) ** (n * t) : a * (1 + r * t));
const rd = (m, R, Y, n) => { let v = 0; const M = Math.round(Y * 12); for (let k = 0; k < M; k++) v += grow(m, R / 100, n, (M - k) / 12); return v; };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/fd`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('Maturity value') === '₹1,41,478', `₹1 L @ 7 % × 5 y quarterly = ₹1,41,478 (SBI figure) (${await c.big('Maturity value')})`);
  for (const [comp, n, label] of [['12', 12, 'monthly'], ['2', 2, 'half-yearly'], ['1', 1, 'yearly'], ['0', 0, 'simple']]) {
    await c.pick('Compounding', comp);
    ok(await c.big('Maturity value') === inr(Math.round(grow(100000, 0.07, n, 5))), `${label}: ${inr(Math.round(grow(100000, 0.07, n, 5)))} (${await c.big('Maturity value')})`);
  }
  await c.pick('Compounding', '4');
  ok(await c.row('Effective annual yield') === '7.186%', `effective yield of 7 % quarterly = (1 + 0.07/4)^4 − 1 = 7.186 % (${await c.row('Effective annual yield')})`);
  await c.set('Amount (FD) / monthly instalment (RD)', 250000); await c.set('Interest rate', 6.8); await c.set('Tenure', 2.25);
  ok(await c.big('Maturity value') === inr(Math.round(grow(250000, 0.068, 4, 2.25))), `fractional tenure 2.25 y (${await c.big('Maturity value')})`);
  await c.seg('Deposit', 'Recurring deposit'); await c.set('Amount (FD) / monthly instalment (RD)', 5000); await c.set('Interest rate', 7); await c.set('Tenure', 5);
  ok(await c.big('Maturity value') === inr(Math.round(rd(5000, 7, 5, 4))) && await c.big('Invested') === '₹3,00,000', `RD ₹5,000/month × 5 y @ 7 % → ${inr(Math.round(rd(5000, 7, 5, 4)))} (${await c.big('Maturity value')})`);
  await c.set('Interest rate', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'missing rate → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/fd`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
