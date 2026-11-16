// Time Zone Converter (#/timezone): offsets (incl. +05:30, +05:45), daylight saving in winter vs summer, converted
// times checked against instants computed here, and the clock-change edge cases (repeated and skipped hours).
import { calc } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ locale: 'en-US', timezoneId: 'Asia/Kolkata' }); await page.goto(`${base}#/timezone`); const c = calc(page);
  await page.locator('.kv').waitFor();
  const at = async (date, time, from) => { await c.pick('From zone', from); await c.set('Date', date); await c.set('Time', time); return c.rows(); };
  const fmt = (t, z) => page.evaluate(([t, z]) => new Intl.DateTimeFormat('en-IN', { timeZone: z, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(t)), [t, z]);
  const row = (rows, zone) => Object.entries(rows).find(([k]) => k.startsWith(`${zone} (`));

  let r = await at('2026-11-16', '09:30', 'Asia/Kolkata');
  const t = Date.UTC(2026, 10, 16, 4, 0);
  for (const [z, off] of [['Asia/Kolkata', '+05:30'], ['UTC', '+00:00'], ['Asia/Kathmandu', '+05:45'], ['America/New_York', '−05:00'], ['Europe/London', '+00:00'], ['Australia/Sydney', '+11:00'], ['Asia/Tokyo', '+09:00']]) {
    const [k, v] = row(r, z.replace(/_/g, ' '));
    ok(k.endsWith(`(UTC${off})`) && v === await fmt(t, z), `9:30 am IST on 16 Nov → ${z} ${v} (UTC${off})`);
  }
  r = await at('2026-07-01', '09:30', 'Asia/Kolkata');
  ok(row(r, 'America/New York')[0].endsWith('(UTC−04:00)') && row(r, 'Europe/London')[0].endsWith('(UTC+01:00)') && row(r, 'Australia/Sydney')[0].endsWith('(UTC+10:00)'), 'summer time: New York −4, London +1, Sydney +10 in July');
  r = await at('2026-07-04', '18:00', 'America/New_York');
  ok(row(r, 'Asia/Kolkata')[1] === await fmt(Date.UTC(2026, 6, 4, 22, 0), 'Asia/Kolkata'), `6 pm New York (EDT) → ${row(r, 'Asia/Kolkata')[1]} IST`);
  // the day after clocks go forward in New York (8 Mar 2026), 03:30 EDT = 07:30 UTC
  r = await at('2026-03-08', '03:30', 'America/New_York');
  ok(row(r, 'UTC')[1] === await fmt(Date.UTC(2026, 2, 8, 7, 30), 'UTC') && !r.Note, `03:30 just after the spring change → 07:30 UTC (${row(r, 'UTC')[1]})`);
  r = await at('2026-03-08', '02:30', 'America/New_York');
  ok(row(r, 'UTC')[1] === await fmt(Date.UTC(2026, 2, 8, 7, 30), 'UTC') && /does not exist/.test(r.Note || ''), `02:30 does not exist that day → read as 03:30 EDT (${r.Note})`);
  r = await at('2026-11-01', '01:30', 'America/New_York');
  ok(row(r, 'UTC')[1] === await fmt(Date.UTC(2026, 10, 1, 5, 30), 'UTC') && /happens twice/.test(r.Note || ''), `01:30 on 1 Nov happens twice → the first (EDT, 05:30 UTC) (${r.Note})`);
  r = await at('2026-10-25', '01:30', 'Europe/London');
  ok(row(r, 'UTC')[1] === await fmt(Date.UTC(2026, 9, 25, 0, 30), 'UTC'), 'London 01:30 on the autumn change → first occurrence (BST)');
  await c.set('Time', '');
  ok(/Pick a date and time/.test(await c.warn()), 'missing time refused');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/timezone`); await ph.locator('.kv').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
