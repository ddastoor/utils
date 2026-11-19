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
  ok(await c.row('Weeks') === '51 weeks 1 day' && await c.row('Hours') === '8,592', `weeks and hours (${await c.row('Weeks')})`);
  ok(/"From" is the later date/.test(await page.locator('.calc-result .note').first().textContent()) && /Thursday, 1 January 2026/.test(await c.row('From')) && /Friday, 25 December 2026/.test(await c.row('To')), 'dates the other way round: said so, and both shown in words in their order');
  await c.seg('Count end date', 'Yes (+1 day)');
  ok(await c.big('Days') === '359' && +(await c.row('Weekdays (Mon–Fri)')).replace(/,/g, '') === weekdays('2026-01-01', '2026-12-25', true), 'counting the end date adds one day');
  ok(await c.big('Years, months, days') === '0y 11m 25d', `and the years-months-days count it too (it stayed at 24 days): ${await c.big('Years, months, days')}`);
  await c.set('From', '2026-01-01'); await c.set('To', '2026-01-31');
  ok(await c.big('Days') === '31' && await c.big('Years, months, days') === '0y 1m 0d' && await c.row('Weeks') === '4 weeks 3 days', '1 to 31 January with the end date counted: 31 days, one month');
  await c.seg('Count end date', 'No'); ok(await c.big('Days') === '30' && await c.big('Years, months, days') === '0y 0m 30d' && !(await page.locator('.calc-result .note').count()), 'without it: 30 days');
  // the first hundred years (Date.UTC reads the year 99 as 1999) and the ends of the calendar
  await c.set('From', '0099-12-31'); await c.set('To', '0100-01-01'); ok(await c.big('Days') === '1' && /31 December 99$/.test(await c.row('From')), `31 Dec 99 → 1 Jan 100 is one day (${await c.big('Days')}; ${await c.row('From')})`);
  await c.set('From', '0001-01-01'); await c.set('To', '9999-12-31'); ok(await c.big('Days') === '3,652,058' && await c.big('Years, months, days') === '9998y 11m 30d', `the whole calendar: ${await c.big('Days')} days`);
  ok(await page.locator('input[type=date]').first().getAttribute('min') === '0001-01-01' && await page.locator('input[type=date]').first().getAttribute('max') === '9999-12-31', 'the date boxes hold the years 1 to 9999');

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
  ok(/^Wednesday,? 1 March,? 2028$/.test(await c.big('Result')) && await c.row('That is') === '548 days later', `long date with weekday (${await c.big('Result')}; ${await c.row('That is')})`);
  await add('2026-11-19', 'Add', 0, 0, 0, 0); ok(await c.row('That is') === 'the same day', 'nothing added: the same day');
  await add('2026-11-19', 'Subtract', 0, 0, 0, 1); ok(await c.row('That is') === '1 day earlier', 'one day earlier (not "1 days")');
  await add('2026-01-31', 'Add', 0, 1.5, 0, 0); ok(/Months: a whole number, please \(1\.5 is not one\)/.test(await c.warn()), `one and a half months is refused (${await c.warn()})`);
  await add('2026-01-31', 'Add', 9000, 0, 0, 0); ok(/further than this calendar reaches/.test(await c.warn()), 'a result beyond the year 9999 is refused, not shown as "Invalid Date"');
  await c.set('Years', ''); await c.set('Months', ''); await c.set('Weeks', ''); await c.set('Days', 10); ok(await c.row('ISO date') === '2026-02-10', 'empty boxes count as 0');
  await add('0050-06-15', 'Add', 0, 0, 0, 1); ok(await c.row('ISO date') === '0050-06-16', `a date in the year 50 stays in the year 50 (${await c.row('ISO date')})`);

  await mode('Age');
  await c.set('Date of birth', '2000-02-29'); await c.set('Age on', '2026-11-16');
  ok(await c.big('Age') === '26 years 8 months 18 days', `born 29 Feb 2000, on 16 Nov 2026 → ${await c.big('Age')}`);
  ok(/28 February,? 2027 \(in 104 days[;)]/.test(await c.row('Next birthday')), `next birthday 28 Feb 2027 in 104 days (${await c.row('Next birthday')})`);
  ok(await c.row('Total days') === (days('2000-02-29', '2026-11-16')).toLocaleString('en-US'), 'total days');
  await c.set('Date of birth', '1990-11-16');
  ok(await c.big('Age') === '36 years 0 months 0 days' && /\(today\)/.test(await c.row('Next birthday')) && await c.row('Turning') === '36', 'birthday today');
  await c.set('Date of birth', '2025-10-15'); ok(await c.big('Age') === '1 year 1 month 1 day', `one year, one month, one day — not "1 years" (${await c.big('Age')})`);
  ok(await c.row('Total months') === '13 and 1 day' && await c.row('Turning') === '2', `total months and the age the next birthday brings (${await c.row('Total months')}, ${await c.row('Turning')})`);
  await c.set('Date of birth', '2000-02-29'); ok(/29 February is kept on the 28th in other years/.test(await c.row('Next birthday')), 'a 29 February birthday: the tab says which day it counts');
  await c.set('Age on', '1980-01-01');
  ok(/before the birth date/.test(await c.warn()), 'age before birth refused');
  await c.set('Date of birth', '');
  ok(/Pick both dates/.test(await c.warn()), 'empty date of birth refused');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  // today's date is the reader's date: 01:30 on 20 November in India is still the 19th in UTC
  const ist = await newPage({ timezoneId: 'Asia/Kolkata' }); await ist.clock.install({ time: new Date('2026-11-19T20:00:00Z') }); await ist.goto(`${base}#/dates`); await ist.locator('.big-value').first().waitFor();
  ok(await ist.locator('input[type=date]').nth(1).inputValue() === '2026-11-20', `at 01:30 in India "To" starts as the 20th (${await ist.locator('input[type=date]').nth(1).inputValue()})`);
  const la = await newPage({ timezoneId: 'America/Los_Angeles' }); await la.clock.install({ time: new Date('2026-11-20T03:00:00Z') }); await la.goto(`${base}#/dates`); await la.locator('.big-value').first().waitFor();
  ok(await la.locator('input[type=date]').nth(1).inputValue() === '2026-11-19', 'at 19:00 in Los Angeles it is still the 19th there');
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/dates`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
