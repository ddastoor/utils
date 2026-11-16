// NPS (#/nps): monthly contributions to 60 (start of month), ≥ 40 % to an annuity, monthly pension.
import { calc, num, inr } from '../lib/calc.mjs';
const nps = (m, age, r, ap, ar) => { let c = 0; const n = Math.max(0, (60 - age) * 12); for (let k = 0; k < n; k++) c = (c + m) * (1 + r / 1200); const a = (c * Math.max(40, ap)) / 100; return { c, pension: (a * ar) / 1200, lump: c - a }; };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/nps`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const d = nps(10000, 30, 10, 40, 6);
  ok(await c.big('Corpus at 60') === inr(Math.round(d.c)) && await c.big('Monthly pension') === inr(Math.round(d.pension)), `default → corpus ${inr(Math.round(d.c))}, pension ${inr(Math.round(d.pension))}`);
  ok(await c.row('Lump sum (tax-free up to 60%)') === inr(Math.round(d.lump)), '60 % lump sum');
  await c.set('Annuity purchase (min 40%)', 100);
  const f = nps(10000, 30, 10, 100, 6);
  ok(await c.big('Monthly pension') === inr(Math.round(f.pension)) && await c.row('Lump sum (tax-free up to 60%)') === '₹0', 'all of it to the annuity: no lump sum, larger pension');
  await c.set('Annuity purchase (min 40%)', 20);
  ok(await c.big('Monthly pension') === inr(Math.round(d.pension)), 'less than 40 % is raised to the legal minimum of 40 %');
  await c.set('Annuity purchase (min 40%)', 40); await c.set('Current age', 45); await c.set('Monthly contribution', 25000); await c.set('Expected return', 9);
  const g = nps(25000, 45, 9, 40, 6);
  ok(await c.big('Corpus at 60') === inr(Math.round(g.c)), `₹25,000/month from 45 @ 9 % → ${await c.big('Corpus at 60')}`);
  ok(Math.abs(num(await c.big('Monthly pension')) - (num(await c.big('Corpus at 60')) * 0.4 * 0.06) / 12) <= 2, 'pension = 40 % of corpus × 6 % ÷ 12');
  ok(!/-/.test(await c.row('Lump sum (tax-free up to 60%)')), 'no "₹-0"');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/nps`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
