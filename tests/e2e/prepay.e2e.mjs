// Loan Prepayment (#/prepay): month-by-month amortisation re-implemented here (prepayment applied after that month's
// EMI); keep EMI (shorter loan) vs keep tenure (lower EMI); one-time vs yearly; invariants.
import { calc, num, inr } from '../lib/calc.mjs';
const EMI = (P, R, n) => { const r = R / 1200; return r ? (P * r * (1 + r) ** n) / ((1 + r) ** n - 1) : P / n; };
function sim(P, R, n, pp, when, yearly, keepTenure) {
  const r = R / 1200, emi = EMI(P, R, n); let bal = P, interest = 0, ne = emi, m = 0;
  while (bal > 0.5 && m < 1200) {
    const i = bal * r; interest += i; let pr = ne - i; if (pr > bal) pr = bal; bal -= pr; m++;
    const due = yearly ? m >= when && (m - when) % 12 === 0 : m === when;
    if (due && bal > 0) { bal = Math.max(0, bal - pp); if (keepTenure && n - m > 0) ne = EMI(bal, R, n - m); }
  }
  return { emi, base: emi * n - P, interest, months: m, newEmi: ne };
}
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/prepay`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const d = sim(2500000, 8.5, 240, 200000, 12, false, false);
  ok(await c.row('Original EMI') === '₹21,696', 'original EMI ₹21,696');
  ok(await c.big('Interest saved') === inr(Math.round(d.base - d.interest)), `₹2 L once after 12 months saves ${inr(Math.round(d.base - d.interest))} (${await c.big('Interest saved')})`);
  ok(await c.row('Months to close') === `${d.months} (was 240)`, `closes in ${d.months} months (${await c.row('Months to close')})`);
  ok(await c.big('Loan ends') === `${Math.floor((240 - d.months) / 12)}y ${(240 - d.months) % 12}m earlier`, `ends ${await c.big('Loan ends')}`);
  await c.seg('Prepayment', 'Every year');
  const y = sim(2500000, 8.5, 240, 200000, 12, true, false);
  ok(await c.big('Interest saved') === inr(Math.round(y.base - y.interest)) && num(await c.big('Interest saved')) > d.base - d.interest, `yearly ₹2 L saves more: ${await c.big('Interest saved')}`);
  await c.seg('After prepaying, keep', 'Same tenure (lower EMI)');
  const t = sim(2500000, 8.5, 240, 200000, 12, true, true);
  ok(await c.big('New EMI') === inr(Math.round(t.newEmi)) && t.newEmi < t.emi, `same tenure: EMI falls to ${await c.big('New EMI')}`);
  ok(num(await c.big('Interest saved')) < y.base - y.interest, 'keeping the tenure saves less interest than keeping the EMI');
  await c.seg('Prepayment', 'One time'); await c.seg('After prepaying, keep', 'Same EMI (shorter tenure)');
  await c.set('Outstanding principal', 1000000); await c.set('Interest rate', 9); await c.set('Remaining tenure', 10); await c.set('Prepayment amount', 2000000); await c.set('Prepay after', 6);
  ok(/^\d+ \(was 120\)$/.test(await c.row('Months to close')) && parseInt(await c.row('Months to close')) === 6, `prepaying more than the balance closes the loan at month 6 (${await c.row('Months to close')})`);
  await c.set('Prepayment amount', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'missing prepayment → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/prepay`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
