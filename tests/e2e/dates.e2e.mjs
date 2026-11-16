// Date Calculator (#/dates): days between dates (incl. leap years, end date counted, weekdays by brute force), the
// years-months-days split (never negative; month ends), add/subtract with month-end clamping, age and next birthday.
import { calc } from '../lib/calc.mjs';
const U = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const days = (a, b) => Math.abs(U(b) - U(a)) / 864e5;
const weekdays = (a, b, incl) => { let n = 0; const [s, e] = [Math.min(U(a), U(b)), Math.max(U(a), U(b))]; for (let t = s; incl ? t <= e : t < e; t += 864e5) { const w = new Date(t).getUTCDay(); if (w && w < 6) n++; } return n; };
const addM = (s, n) => { const [y, m, d] = s.split('-').map(Number), t = y * 12 + m - 1 + n, Y = Math.floor(t / 12), M = t - Y * 12, last = new Date(Date.UTC(Y, M + 1, 0)).getUTCDate(); return iso(Date.UTC(Y, M, Math.min(d, last))); };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/dates`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const mode = (m) => page.getByRole('radio', { name: m, exact: true }).click();
  const diff = async (a, b) => { await c.set('From', a); await c.set('To', b); return [await c.big('Days'), await c.big('Years, months, days')]; };

  for (const [a, b, ymd] of [['2026-01-31', '2026-03-01', '0y 1m 1d'], ['2024-01-31', '2024-03-01', '0y 1m 1d'], ['2024-02-28', '2024-03-01', '0y 0m 2d'], ['2025-02-28', '2025-03-01', '0y 0m 1d'], ['1990-01-01', '2026-11-16', '36y 10m 15d'], ['2026-03-31', '2026-04-30', '0y 1m 0d'], ['2026-05-31', '2026-06-30', '0y 1m 0d'], ['2026-03-30', '2026-04-29', '0y 0m 30d'], ['2020-02-29', '2024-02-29', '4y 0m 0d'], ['2026-11-16', '2026-11-16', '0y 0m 0d']]) {
    const [d, y] = await diff(a, b);
    ok(+d.replace(/,/g, '') === days(a, b) && y === ymd, `${a} → ${b}: ${days(a, b)} days, ${ymd} (${d}, ${y})`);
    ok(+(await c.row('Weekdays (Mon–Fri)')).replace(/,/g, '') === weekdays(a, b, false), `${a} → ${b}: weekdays ${weekdays(a, b, false)} by brute force`);
  }
  const [d1, y1] = await diff('2026-12-25', '2026-01-01');
  ok(d1 === '358' && y1 === '0y 11m 24d', `dates in either order (${d1}, ${y1})`);
  ok(await c.row('Weeks') === '51 weeks 1 days' && await c.row('Hours') === '8,592', 'weeks and hours');
  await c.seg('Count end date', 'Yes (+1 day)');
  ok(await c.big('Days') === '359' && +(await c.row('Weekdays (Mon–Fri)')).replace(/,/g, '') === weekdays('2026-01-01', '2026-12-25', true), 'counting the end date adds one day');

  await mode('Add / subtract');
  const add = async (start, op, y, m, w, d) => { await c.set('Start date', start); await c.seg('Operation', op); await c.set('Years', y); await c.set('Months', m); await c.set('Weeks', w); await c.set('Days', d); return c.row('ISO date'); };
  for (const [args, want, why] of [
    [['2026-01-31', 'Add', 0, 1, 0, 0], '2026-02-28', '31 Jan + 1 month = 28 Feb (month end, not 3 Mar)'],
    [['2024-01-31', 'Add', 0, 1, 0, 0], '2024-02-29', 'leap year: 31 Jan + 1 month = 29 Feb'],
    [['2024-02-29', 'Add', 1, 0, 0, 0], '2025-02-28', '29 Feb + 1 year = 28 Feb'],
    [['2026-03-31', 'Subtract', 0, 1, 0, 0], '2026-02-28', '31 Mar − 1 month = 28 Feb'],
    [['2026-11-16', 'Add', 0, 0, 0, 100], iso(U('2026-11-16') + 100 * 864e5), '+100 days'],
    [['2026-01-05', 'Subtract', 0, 0, 0, 10], '2025-12-26', '−10 days across the year'],
    [['2026-11-16', 'Add', 0, 0, 2, 3], '2026-12-03', '+2 weeks 3 days'],
    [['2026-08-31', 'Add', 1, 6, 0, 1], iso(U(addM('2026-08-31', 18)) + 864e5), '+1 year 6 months 1 day (months first, then days)'],
  ]) { const got = await add(...args); ok(got === want, `${why}: ${got}`); }
  ok(/^Wednesday,? 1 March,? 2028$/.test(await c.big('Result')), `long date with weekday (${await c.big('Result')})`);

  await mode('Age');
  await c.set('Date of birth', '2000-02-29'); await c.set('Age on', '2026-11-16');
  ok(await c.big('Age') === '26 years 8 months 18 days', `born 29 Feb 2000, on 16 Nov 2026 → ${await c.big('Age')}`);
  ok(/28 February,? 2027 \(in 104 days\)/.test(await c.row('Next birthday')), `next birthday 28 Feb 2027 in 104 days (${await c.row('Next birthday')})`);
  ok(await c.row('Total days') === (days('2000-02-29', '2026-11-16')).toLocaleString('en-US'), 'total days');
  await c.set('Date of birth', '1990-11-16');
  ok(await c.big('Age') === '36 years 0 months 0 days' && /\(today\)/.test(await c.row('Next birthday')), 'birthday today');
  await c.set('Age on', '1980-01-01');
  ok(/before the birth date/.test(await c.warn()), 'age before birth refused');
  await c.set('Date of birth', '');
  ok(/Pick both dates/.test(await c.warn()), 'empty date of birth refused');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/dates`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
