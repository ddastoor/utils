// Pregnancy Due Date (#/duedate): Naegele's rule (first day of the last period + 280 days), the cycle-length shift,
// weeks of pregnancy today, trimester boundaries — against Python's datetime (tests/fixtures/health/reference.json),
// under a fixed clock; "today" is the reader's local date; what is refused; phone layout.
import { readFileSync } from 'node:fs';
import { calc } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/health/reference.json', import.meta.url), 'utf8'));
const L = 'First day of last period (LMP)';
const long = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = (n, w) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`, wd = (n) => `${plural(Math.floor(n / 7), 'week')} ${plural(n % 7, 'day')}`;
export default async ({ base, page: newPage, ok, devices }) => {
  // 19 November 2026, 10:00 in India — the day the reference calls today
  const page = await newPage({ timezoneId: 'Asia/Kolkata' }); await page.clock.install({ time: new Date('2026-11-19T04:30:00Z') }); await page.goto(`${base}#/duedate`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const lmpBox = page.locator('.field').filter({ hasText: 'First day of last period' }).locator('input');

  // ---- the first view: a period 70 days ago
  ok(await lmpBox.inputValue() === '2026-09-10' && await c.big('Today') === '10 weeks 0 days — First trimester' && await c.big('Estimated due date') === long('2027-06-17'), `the example: a period 70 days ago (10 Sep) → 10 weeks 0 days, due ${await c.big('Estimated due date')}`);
  ok(await c.row('To go') === '210 days (30 weeks 0 days)', `days to go are said (${await c.row('To go')})`);

  // ---- pregnancies of the reference whose "today" is 19 November 2026
  const pick = ref.due.filter(([lmp, , today]) => today === '2026-11-19' && lmp > '2000').filter((_, i) => i % 3 === 0);
  let bad = [];
  for (const [lmp, cycle, , due, conception, first, second, days, toGo] of pick) {
    await c.set('Cycle length', cycle); await c.set(L, lmp);
    const tri = days === null ? null : days < 98 ? 'First trimester' : days < 196 ? 'Second trimester' : 'Third trimester';
    const today = days === null ? 'That day is still to come' : toGo < -14 ? `The due date was ${plural(-toGo, 'day')} ago` : `${wd(days)} — ${tri}`;
    const go = days === null || toGo < -14 ? null : toGo > 0 ? `${plural(toGo, 'day')} (${wd(toGo)})` : toGo === 0 ? 'Due today' : `${plural(-toGo, 'day')} past the due date`;
    const got = [await c.big('Estimated due date'), await c.big('Today'), await c.row('To go'), await c.row('Estimated conception'), await c.row('End of first trimester'), await c.row('End of second trimester')];
    const want = [long(due), today, go, long(conception), long(first), long(second)];
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`LMP ${lmp}, cycle ${cycle}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  }
  ok(pick.length >= 40 && !bad.length, `${pick.length} pregnancies of the reference: due date, weeks today, days to go, conception and the ends of the trimesters ${bad.slice(0, 2).join(' | ')}`);

  // ---- known dates
  await c.set('Cycle length', 28); await c.set(L, '2026-01-01');
  ok(await c.big('Estimated due date') === 'Thursday 8 October 2026' || /8 October,? 2026/.test(await c.big('Estimated due date')), `LMP 1 January 2026 → due 8 October 2026 (${await c.big('Estimated due date')})`);
  ok(await c.big('Today') === 'The due date was 42 days ago' && await c.row('To go') === null, `six weeks after the due date: "${await c.big('Today')}" (it showed a dash)`);
  await c.set('Cycle length', 35);
  ok(/15 October,? 2026/.test(await c.big('Estimated due date')), 'a 35-day cycle moves the due date 7 days later');
  await c.set('Cycle length', 28);
  for (const [lmp, want, go] of [['2026-08-11', '14 weeks 2 days — Second trimester', '180 days (25 weeks 5 days)'], ['2026-08-14', '13 weeks 6 days — First trimester', '183 days (26 weeks 1 day)'], ['2026-05-07', '28 weeks 0 days — Third trimester', '84 days (12 weeks 0 days)'],
    ['2026-11-19', '0 weeks 0 days — First trimester', '280 days (40 weeks 0 days)'], ['2026-02-12', '40 weeks 0 days — Third trimester', 'Due today'], ['2026-02-05', '41 weeks 0 days — Third trimester', '7 days past the due date'], ['2026-11-18', '0 weeks 1 day — First trimester', '279 days (39 weeks 6 days)']]) {
    await c.set(L, lmp); ok(await c.big('Today') === want && await c.row('To go') === go, `LMP ${lmp} → ${want}; ${go} (${await c.big('Today')}; ${await c.row('To go')})`);
  }
  await c.set(L, '2026-11-24');
  ok(await c.big('Today') === 'That day is still to come' && await c.row('To go') === null && /31 August,? 2027/.test(await c.big('Estimated due date')), `a period that has not started yet: the due date is still worked out (${await c.big('Today')})`);
  await c.set(L, '2026-11-17'); await c.set('Cycle length', 35);
  ok(await c.big('Today') === '0 weeks 0 days — First trimester', 'in the first days of a long cycle the count stays at 0');
  await c.set('Cycle length', '');
  ok(/24 August,? 2027/.test(await c.big('Estimated due date')) && !(await c.warn()), `an empty cycle box is the usual 28 days: 17 November + 280 days (${await c.big('Estimated due date')})`);

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await c.set('Cycle length', 60); await refused('a cycle of 60 days', 'Cycle length: a whole number of days from 20 to 45 (28 is usual).');
  await c.set('Cycle length', 28.5); await refused('a cycle of 28.5 days', 'Cycle length: a whole number of days from 20 to 45 (28 is usual).');
  await c.set('Cycle length', 0); await refused('a cycle of 0 (it was silently 28)', 'Cycle length: a whole number of days from 20 to 45 (28 is usual).');
  await c.set('Cycle length', 28); await c.set(L, ''); await refused('no date', 'Pick the first day of the last period.');
  await c.set(L, '9999-06-01'); await refused('a due date beyond the calendar', 'First day of last period: a date from the year 1 to 9998, please.');
  await c.set(L, '2026-09-10');
  ok(await c.big('Today') === '10 weeks 0 days — First trimester' && !/Invalid|NaN|undefined/.test(await page.locator('.tool-body').innerText()), 'after the refusals the answer is back; never "Invalid Date"');
  ok(/Naegele/.test(await page.locator('.tool-body').innerText()), 'the note names the rule and its limits');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- today is the reader's date: 2 o'clock at night in India is still the day before in UTC
  const night = await newPage({ timezoneId: 'Asia/Kolkata' }); await night.clock.install({ time: new Date('2026-11-18T20:30:00Z') }); await night.goto(`${base}#/duedate`); await night.locator('.big-value').first().waitFor();
  ok(await night.locator('.field').filter({ hasText: 'First day of last period' }).locator('input').inputValue() === '2026-09-10' && (await calc(night).big('Today')) === '10 weeks 0 days — First trimester', 'at 02:00 on 19 November in India the example starts from 10 September (it started a day early, from the date in UTC)');
  const la = await newPage({ timezoneId: 'America/Los_Angeles' }); await la.clock.install({ time: new Date('2026-11-20T03:00:00Z') }); await la.goto(`${base}#/duedate`); await la.locator('.big-value').first().waitFor();
  ok(await la.locator('.field').filter({ hasText: 'First day of last period' }).locator('input').inputValue() === '2026-09-10', 'at 7 pm on 19 November in Los Angeles it is still the 19th (UTC is already on the 20th)');

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/duedate`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: the date and the cycle box are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
