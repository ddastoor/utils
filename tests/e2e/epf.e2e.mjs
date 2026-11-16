// EPF (#/epf): 12 % employee + (12 % − EPS 8.33 % of basic capped at ₹15,000) employer, monthly credit, yearly raises;
// independent re-implementation, existing balance, invariants.
import { calc, num, inr } from '../lib/calc.mjs';
function epf(basic, age, ret, bal, inc, r) {
  let b = basic, contrib = 0;
  for (let y = 0; y < ret - age; y++) { for (let m = 0; m < 12; m++) { const emp = b * 0.12, er = b * 0.12 - Math.min(b, 15000) * 0.0833; bal += emp + er; contrib += emp + er; bal += (bal * r) / 1200; } b *= 1 + inc / 100; }
  return { bal, contrib };
}
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/epf`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const d = epf(50000, 30, 58, 0, 6, 8.25);
  ok(await c.big('EPF corpus at retirement') === inr(Math.round(d.bal)) && await c.big('Your + employer contributions') === inr(Math.round(d.contrib)), `default → ${inr(Math.round(d.bal))} (${await c.big('EPF corpus at retirement')})`);
  ok(await c.row('Years') === '28', '28 years to retirement');
  await c.set('Yearly salary increase', 0); await c.set('Current age', 57);
  ok(await c.big('Your + employer contributions') === inr(Math.round(12 * (6000 + 6000 - 1249.5))), 'one year at ₹50,000: ₹10,750.50 a month (EPS ₹1,249.50 goes to the pension)');
  await c.set('Monthly basic + DA', 12000);
  ok(await c.big('Your + employer contributions') === inr(Math.round(12 * (1440 + 1440 - 999.6))), 'basic below ₹15,000: EPS = 8.33 % of the basic');
  await c.set('Monthly basic + DA', 40000); await c.set('Current age', 35); await c.set('Current EPF balance', 500000); await c.set('Yearly salary increase', 8); await c.set('EPF interest rate', 8.1);
  const e = epf(40000, 35, 58, 500000, 8, 8.1);
  ok(await c.big('EPF corpus at retirement') === inr(Math.round(e.bal)), `with ₹5 L balance and 8 % raises → ${await c.big('EPF corpus at retirement')}`);
  ok(Math.abs(num(await c.row('Interest earned')) - (e.bal - e.contrib - 500000)) <= 1, 'interest = corpus − contributions − opening balance');
  await c.set('Current age', 60);
  ok(await c.row('Years') === '0' && await c.big('EPF corpus at retirement') === '₹5,00,000', 'already past retirement: balance unchanged');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/epf`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
