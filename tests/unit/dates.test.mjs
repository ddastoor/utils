// The Date Calculator's arithmetic (src/lib/dates.ts, and mathcore's weekday count) against Python's datetime and
// calendar modules (scripts/make-dates-reference.py → tests/fixtures/dates/reference.json): 1,700 spans (days,
// weekdays counted one by one, years-months-days found by trying), 4,191 additions of months, 594 additions of
// mixed spans, 500 birthdays — over the years 1 to 9999.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const D = await load('src/lib/dates.ts');
  const { bindMathcore } = await load('src/wasm/mathcore.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/dates/reference.json'), 'utf8'));
  const P = (s) => D.parseD(s);

  // 1. spans
  { const bad = { days: [], wd: [], ymd: [], back: [] }; let nwd = 0;
    for (const [a, b, days, wd, [y, mo, d]] of ref.spans) {
      const A = P(a), B = P(b);
      if (D.daysBetween(A, B) !== days) bad.days.push(`${a} → ${b}: ${D.daysBetween(A, B)}, Python ${days}`);
      const g = D.ymd(A, B); if (g.y !== y || g.m !== mo || g.d !== d) bad.ymd.push(`${a} → ${b}: ${g.y}y ${g.m}m ${g.d}d, Python ${y}y ${mo}m ${d}d`);
      const h = D.ymd(B, A); if (h.y !== y || h.m !== mo || h.d !== d) bad.back.push(`${b} → ${a}`);
      if (wd !== null) { nwd++; const got = m.weekdays(Math.round(A.getTime() / D.DAY), Math.round(B.getTime() / D.DAY) - 1); if (got !== wd) bad.wd.push(`${a} → ${b}: ${got}, counted ${wd}`); }
    }
    t.ok(!bad.days.length, `${ref.spans.length} spans: the days between two dates as Python's date subtraction ${bad.days.slice(0, 3).join('; ')}`);
    t.ok(!bad.wd.length, `${nwd} spans: Monday-to-Friday days as counted one by one (also before 1970 and in the year 1) ${bad.wd.slice(0, 3).join('; ')}`);
    t.ok(!bad.ymd.length, `${ref.spans.length} spans: years, months and days as found by trying month after month ${bad.ymd.slice(0, 3).join('; ')}`);
    t.ok(!bad.back.length, `and the same with the dates the other way round ${bad.back.slice(0, 3).join('; ')}`);
    let consistent = 0; for (const [a, b] of ref.spans) { const A = P(a), B = P(b), g = D.ymd(A, B); if (D.isoD(D.addDays(D.addMonths(A, 12 * g.y + g.m), g.d)) === b) consistent++; }
    t.eq(consistent, ref.spans.length, 'the span added to the earlier date gives the later one'); }

  // 2. adding months, mixed spans, birthdays
  { const bad = []; for (const [d, n, want] of ref.months) { const got = D.isoD(D.addMonths(P(d), n)); if (got !== want) bad.push(`${d} ${n >= 0 ? '+' : '−'} ${Math.abs(n)} months = ${got}, Python ${want}`); }
    t.ok(!bad.length, `${ref.months.length} additions of months, the day held back to the month's end ${bad.slice(0, 3).join('; ')}`); }
  { const bad = []; for (const [d, sign, y, mo, w, dd, want] of ref.adds) { let got; try { got = D.isoD(D.addSpan(P(d), sign, y, mo, w, dd)); } catch (e) { got = e.message; } if (got !== want) bad.push(`${d} ${sign > 0 ? '+' : '−'} ${y}y ${mo}m ${w}w ${dd}d = ${got}, Python ${want}`); }
    t.ok(!bad.length, `${ref.adds.length} additions and subtractions of years, months, weeks and days ${bad.slice(0, 3).join('; ')}`); }
  { const bad = []; for (const [born, on, want] of ref.birthdays) { const got = D.isoD(D.nextBirthday(P(born), P(on))); if (got !== want) bad.push(`born ${born}, on ${on}: ${got}, Python ${want}`); }
    t.ok(!bad.length, `${ref.birthdays.length} next birthdays (29 February on the 28th in other years) ${bad.slice(0, 3).join('; ')}`); }

  // 3. reading and writing dates
  t.eq(['2026-11-19', '0001-01-01', '0099-12-31', '9999-12-31', '2024-02-29', '1582-10-10'].map((s) => D.isoD(P(s))), ['2026-11-19', '0001-01-01', '0099-12-31', '9999-12-31', '2024-02-29', '1582-10-10'], 'dates are read and written back, also in the first hundred years (Date.UTC reads the year 99 as 1999)');
  t.eq([P('0099-12-31').getUTCFullYear(), D.daysBetween(P('0099-12-31'), P('0100-01-01')), D.daysBetween(P('0001-01-01'), P('1970-01-01'))], [99, 1, 719162], 'the year 99 is the year 99; day 1 of the calendar is 719,162 days before 1970');
  t.eq(['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '0000-01-01', '', 'abc', '2026-1-5', '26-01-05', '+010000-01-01', '2026-11-19T10:00'].map((s) => P(s)), Array(12).fill(null), 'what is not a date is not read (30 February, a 13th month, the year 0, other spellings)');
  t.eq([D.inRange(P('9999-12-31')), D.inRange(D.addDays(P('9999-12-31'), 1)), D.inRange(D.addDays(P('0001-01-01'), -1)), D.inRange(new Date(NaN))], [true, false, false, false], 'the range a date box can hold');
  t.eq([D.fmtD(P('2026-11-19')), D.fmtD(P('2024-02-29')), D.fmtD(P('0001-01-01'))], ['Thursday, 19 November 2026', 'Thursday, 29 February 2024', 'Monday, 1 January 1'], 'dates in words, with the weekday');
  // today is the date where the reader is
  t.eq([D.localToday(new Date(2026, 10, 20, 1, 30)), D.localToday(new Date(2026, 0, 1, 0, 0)), D.localToday(new Date(2026, 11, 31, 23, 59))], ['2026-11-20', '2026-01-01', '2026-12-31'], 'today is taken from the local clock (at 01:30 in India the UTC date is still the day before)');

  // 4. refusals and wording
  for (const [args, msg] of [[[1, 1.5, 0, 0, 0], /Years: a whole number/], [[1, 0, 0.5, 0, 0], /Months: a whole number/], [[1, 0, 0, 0, 2.25], /Days: a whole number/], [[1, 9000, 0, 0, 0], /further than this calendar reaches/], [[-1, 3000, 0, 0, 0], /further than this calendar reaches/], [[1, 0, 0, 0, 1e9], /further than this calendar reaches/]]) {
    let said = ''; try { D.addSpan(P('2026-11-19'), ...args); } catch (e) { said = e.message; } t.ok(msg.test(said), `add ${JSON.stringify(args.slice(1))}: ${said}`);
  }
  t.eq([D.plural(1, 'day'), D.plural(0, 'day'), D.plural(2, 'week'), D.plural(1234567, 'day'), D.plural(1, 'year')], ['1 day', '0 days', '2 weeks', '12,34,567 days', '1 year'], 'one day, two days');
  t.eq([D.ymd(P('2026-01-31'), P('2026-02-28')), D.ymd(P('2024-01-31'), P('2024-02-29')), D.ymd(P('2026-01-31'), P('2026-03-01')), D.ymd(P('2026-01-01'), D.addDays(P('2026-01-31'), 1)), D.ymd(P('2024-02-29'), P('2025-02-28')), D.ymd(P('2026-05-05'), P('2026-05-05'))],
    [{ y: 0, m: 1, d: 0 }, { y: 0, m: 1, d: 0 }, { y: 0, m: 1, d: 1 }, { y: 0, m: 1, d: 0 }, { y: 1, m: 0, d: 0 }, { y: 0, m: 0, d: 0 }], 'month ends: 31 Jan → 28 Feb is one month (the opposite of adding one), 1 – 31 Jan with the end counted is one month');
};
