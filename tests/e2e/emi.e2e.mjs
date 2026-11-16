// EMI (#/emi): known answers against the standard reducing-balance formula (independent JS), tenure in months,
// zero interest, schedule, invalid input, phone layout.
import { calc, num, inr } from '../lib/calc.mjs';
const EMI = (P, R, n) => { const r = R / 1200; return r ? (P * r * (1 + r) ** n) / ((1 + r) ** n - 1) : P / n; };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/emi`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('Monthly EMI') === '₹21,696', `default 25 L @ 8.5 % for 20 y = ₹21,696 (bank figure) (${await c.big('Monthly EMI')})`);
  for (const [P, R, Y] of [[500000, 10, 3], [1500000, 9.25, 15], [80000, 14, 1], [7500000, 7.1, 30]]) {
    await c.set('Loan amount', P); await c.set('Interest rate', R); await c.set('Tenure', Y);
    const e = EMI(P, R, Y * 12), want = inr(Math.round(e));
    ok(await c.big('Monthly EMI') === want, `${P} @ ${R} % × ${Y} y → ${want} (${await c.big('Monthly EMI')})`);
    ok(Math.abs(num(await c.big('Total interest')) - (e * Y * 12 - P)) <= 1 && Math.abs(num(await c.big('Total payment')) - e * Y * 12) <= 1, `${P}: total interest / payment consistent`);
  }
  await c.set('Loan amount', 300000); await c.set('Interest rate', 12); await c.set('Tenure', 18); await c.seg('Tenure in', 'Months');
  ok(await c.big('Monthly EMI') === inr(Math.round(EMI(300000, 12, 18))), `tenure in months: 18 months → ${await c.big('Monthly EMI')}`);
  await c.set('Interest rate', 0);
  ok(await c.big('Monthly EMI') === inr(Math.round(300000 / 18)) && await c.big('Total interest') === '₹0', `0 % interest → P / n (${await c.big('Monthly EMI')})`);
  await c.seg('Tenure in', 'Years'); await c.set('Interest rate', 8.5); await c.set('Tenure', 5); await c.set('Loan amount', 1000000);
  await page.getByText('Year-by-year schedule').click();
  const rows = await page.locator('.tbl tbody tr').count(), last = await page.locator('.tbl tbody tr').last().locator('td').last().textContent();
  ok(rows === 5 && num(last) < 1, `schedule: 5 yearly rows, balance ends at ₹0 (${rows}, ${last})`);
  const principal = await page.locator('.tbl tbody tr td:nth-child(2)').allTextContents();
  ok(Math.abs(principal.reduce((a, t) => a + num(t), 0) - 1000000) < 5, 'principal parts add up to the loan');
  await c.set('Loan amount', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'empty amount → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/emi`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
