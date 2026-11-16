// Pregnancy Due Date (#/duedate): Naegele's rule (LMP + 280 days), cycle-length adjustment, gestational age today,
// trimester boundaries, validation.
import { calc } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/duedate`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const fmtD = (t) => page.evaluate((t) => new Date(t).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }), t);
  const L = 'First day of last period (LMP)', D = 864e5;
  ok(/^10 weeks 0 days — First trimester$/.test(await c.big('Today')), `default LMP 70 days ago → 10 weeks 0 days (${await c.big('Today')})`);
  await c.set(L, '2026-01-01');
  const lmp = Date.UTC(2026, 0, 1);
  ok(await c.big('Estimated due date') === await fmtD(lmp + 280 * D), `LMP 1 Jan 2026 → due ${await c.big('Estimated due date')} (8 Oct 2026)`);
  ok(/8 October,? 2026/.test(await c.big('Estimated due date')), 'due 8 October 2026');
  ok(await c.row('Estimated conception') === await fmtD(lmp + 14 * D) && await c.row('End of first trimester') === await fmtD(lmp + 97 * D) && await c.row('End of second trimester') === await fmtD(lmp + 195 * D), 'conception day 14, trimesters end at 13w6d and 27w6d');
  await c.set('Cycle length', 35);
  ok(await c.big('Estimated due date') === await fmtD(lmp + 287 * D), 'a 35-day cycle moves the due date 7 days later');
  const todayUTC = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  for (const [ago, want] of [[100, '14 weeks 2 days — Second trimester'], [97, '13 weeks 6 days — First trimester'], [196, '28 weeks 0 days — Third trimester'], [0, '0 weeks 0 days — First trimester']]) {
    await c.set('Cycle length', 28); await c.set(L, new Date(Date.parse(todayUTC) - ago * D).toISOString().slice(0, 10));
    ok(await c.big('Today') === want, `LMP ${ago} days ago → ${await c.big('Today')}`);
  }
  await c.set(L, new Date(Date.parse(todayUTC) + 5 * D).toISOString().slice(0, 10));
  ok(await c.big('Today') === '—', 'LMP in the future → no gestational age');
  await c.set('Cycle length', 60);
  ok(/20–45 days/.test(await c.warn()), 'impossible cycle length refused');
  await c.set('Cycle length', 28); await c.set(L, '');
  ok(/Pick the first day/.test(await c.warn()), 'empty LMP refused (was "Invalid Date")');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/duedate`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
