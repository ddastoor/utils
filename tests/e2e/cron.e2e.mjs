// Cron Explainer (#/cron, PC only): with the clock fixed at Mon 16 Nov 2026 10:07:30 UTC, the listed runs must equal an
// independent minute-by-minute search (Vixie rule: day-of-month OR day-of-week), time zones (09:00 IST = 03:30 UTC,
// New York across DST), seconds field, L / # / names / @aliases, field table, run count, invalid input, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const T0 = Date.UTC(2026, 10, 16, 10, 7, 30);
const brute = (f, n, from = T0) => { const out = []; let t = Math.floor(from / 60000) * 60000 + 60000; while (out.length < n) { const d = new Date(t); if (f(d)) out.push(new Date(t).toISOString().replace('.000Z', 'Z')); t += 60000; } return out; };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ timezoneId: 'Asia/Kolkata' }); await page.clock.install({ time: T0 }); await page.goto(`${base}#/cron`);
  const ex = page.locator('input[aria-label="Cron expression"]'); await ex.waitFor();
  const sel = (i) => page.locator('select').nth(i);
  const runs = () => page.$$eval('.cron-next tbody tr', (r) => r.map((e) => e.children[1].textContent));
  const set = async (v, tz = 'UTC', n = '10') => { await sel(0).selectOption(tz); await sel(1).selectOption(n); await ex.fill(v); await page.waitForTimeout(250); return runs(); };
  ok(await sel(0).inputValue() === 'Asia/Kolkata', 'time zone defaults to this device (Asia/Kolkata)');
  const U = (d) => [d.getUTCMinutes(), d.getUTCHours(), d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCDay()];
  const cases = [
    ['*/15 9-17 * * 1-5', (d) => { const [m, h, , , w] = U(d); return m % 15 === 0 && h >= 9 && h <= 17 && w >= 1 && w <= 5; }],
    ['0 0 1,15 * *', (d) => { const [m, h, dd] = U(d); return m === 0 && h === 0 && (dd === 1 || dd === 15); }],
    ['0 12 13 * 5', (d) => { const [m, h, dd, , w] = U(d); return m === 0 && h === 12 && (dd === 13 || w === 5); }],
    ['5 4 * 2 SUN', (d) => { const [m, h, , mo, w] = U(d); return m === 5 && h === 4 && mo === 2 && w === 0; }],
    ['30 18 * * fri', (d) => { const [m, h, , , w] = U(d); return m === 30 && h === 18 && w === 5; }],
    ['0 22 * * 7', (d) => { const [m, h, , , w] = U(d); return m === 0 && h === 22 && w === 0; }],
    ['1-5/2 3 * jan-mar *', (d) => { const [m, h, , mo] = U(d); return [1, 3, 5].includes(m) && h === 3 && mo <= 3; }],
  ];
  for (const [e, f] of cases) { const got = await set(e); const want = brute(f, 10); ok(JSON.stringify(got) === JSON.stringify(want), `"${e}": next 10 runs match a brute-force search (${got[0]} …)`); }
  let r = await set('0 9 * * *', 'Asia/Kolkata', '5'); ok(JSON.stringify(r) === JSON.stringify(brute((d) => d.getUTCHours() === 3 && d.getUTCMinutes() === 30, 5)), `09:00 in Asia/Kolkata = 03:30 UTC (${r[0]})`);
  ok(/^Tue, 17 Nov,? 2026,? 09:00/.test(await page.locator('.cron-next tbody tr td').first().textContent()), `local column in IST (${await page.locator('.cron-next tbody tr td').first().textContent()})`);
  ok(/in 17 h/.test(await page.locator('.cron-next tbody tr td').nth(2).textContent()), 'relative time to the next run');
  r = await set('0 9 * * *', 'America/New_York', '5'); ok(r[0] === '2026-11-16T14:00:00Z', `09:00 New York in November (EST, UTC−5) = 14:00 UTC (${r[0]})`);
  r = await set('0 0 L * *', 'UTC', '5'); ok(JSON.stringify(r) === JSON.stringify(['2026-11-30T00:00:00Z', '2026-12-31T00:00:00Z', '2027-01-31T00:00:00Z', '2027-02-28T00:00:00Z', '2027-03-31T00:00:00Z']), `L = last day of each month (${r})`);
  r = await set('0 10 * * 1#1', 'UTC', '5'); ok(r.every((x) => { const d = new Date(x); return d.getUTCDay() === 1 && d.getUTCDate() <= 7; }) && r[0] === '2026-12-07T10:00:00Z', `1#1 = first Monday (${r[0]})`);
  r = await set('@weekly', 'UTC', '5'); ok(r.every((x) => new Date(x).getUTCDay() === 0 && x.endsWith('T00:00:00Z')), '@weekly = Sundays 00:00');
  r = await set('*/20 * * * * *', 'UTC', '5'); ok(JSON.stringify(r) === JSON.stringify(['2026-11-16T10:07:40Z', '2026-11-16T10:08:00Z', '2026-11-16T10:08:20Z', '2026-11-16T10:08:40Z', '2026-11-16T10:09:00Z']), `six fields: */20 seconds (${r})`);
  ok(await page.locator('.cron-next tbody tr').count() === 5, 'run count follows the selector');
  r = await set('0 0 29 2 *', 'UTC', '5'); ok(r.slice(0, 2).join() === '2028-02-29T00:00:00Z,2032-02-29T00:00:00Z', '29 Feb only in leap years');
  await set('15 3 * * *', 'UTC', '5');
  const fields = await page.$$eval('.tool-body .card table:not(.cron-next) tbody tr', (r) => r.map((e) => [...e.children].map((c) => c.textContent).slice(0, 2).join('=')));
  ok(fields.join() === 'Minute=15,Hour=3,Day of month=*,Month=*,Day of week=*', `field table (${fields})`);
  ok((await page.locator('.cron-desc').textContent()).length > 5, `description: "${await page.locator('.cron-desc').textContent()}"`);
  for (const bad of ['61 * * * *', '* * *', '* * 32 * *', 'hello', '*/0 * * * *']) { await ex.fill(bad); await page.waitForTimeout(250); ok(await page.locator('.tool-body .note-warn').count() === 1 && await page.locator('.cron-next').count() === 0, `"${bad}" → error message`); }
  await page.locator('.chip-btn', { hasText: '9 am weekdays' }).click(); ok(await ex.inputValue() === '0 9 * * 1-5' && await page.locator('.cron-next tbody tr').count() === 5, 'preset chip');
  // ---- bug hunt, Nov 2026
  const nextRows = () => page.$$eval('.cron-next tbody tr', (r) => r.map((e) => e.children[1].textContent));
  const timed = async (expr) => { const t0 = Date.now(); await ex.fill(expr); await page.waitForFunction((e) => document.querySelector('input[aria-label="Cron expression"]').value === e && (document.querySelector('.tool-body .note-warn') || document.querySelector('.cron-next') ) && !document.querySelector('.cron-pending'), expr); await page.waitForTimeout(260); return Date.now() - t0; };
  // schedules that can never happen: said at once (the search used to run to the year 5000 and freeze the page for 1–5 s, then show an empty table)
  const never = [];
  for (const e of ['0 0 30 2 *', '0 0 31 4,6,9,11 *', '* * 31 2,4,6,9,11 *', '0 0 0 30 2 * *', '0 0 0 1 1 * 2020']) { const ms = await timed(e); const txt = await page.locator('.tool-body').innerText(); if (!/This schedule never runs/.test(txt) || await page.locator('.cron-next').count() || ms > 1500) never.push(`${e}: ${ms} ms`); }
  ok(!never.length, `five schedules that never come (30 February, 31 April, a past year) say "never runs" within moments ${never.join(' | ')}`);
  // a schedule inside the daylight-saving gap every year: 25 runs used to take 11 s
  await page.locator('select').nth(0).selectOption('America/New_York'); await page.locator('select').nth(1).selectOption('25');
  const gapMs = await timed('30 2 * 3 0#2'); const gapRows = await nextRows();
  ok(gapRows.length === 25 && gapMs < 3000 && gapRows.every((r) => /-03-(0[89]|1[0-4])T0[67]:[03]0:00Z$/.test(r)), `second Sunday of March 02:30 New York (the hour that does not exist): 25 runs in ${gapMs} ms (used to be 11 s) — ${gapRows[0]}`);
  await page.locator('select').nth(1).selectOption('10'); await page.locator('select').nth(0).selectOption('UTC');
  // the "every 30 s" example really is every 30 seconds
  await page.locator('.chip-btn', { hasText: 'every 30 s' }).click(); await page.waitForTimeout(300); let rs = (await nextRows()).map((x) => Date.parse(x));
  ok(await ex.inputValue() === '*/30 * * * * *' && rs.length === 10 && rs.every((t, i) => !i || t - rs[i - 1] === 30000), 'the "every 30 s" example runs every 30 seconds (it was "0 */30 * * * *" = every 30 minutes)');
  const chipBad = []; for (const c of await page.locator('.chip-btn').allTextContents()) { await page.locator('.chip-btn', { hasText: c }).first().click(); await page.waitForTimeout(250); if (!(await page.locator('.cron-next tbody tr').count()) || await page.locator('.tool-body .note-warn').count()) chipBad.push(c); }
  ok(!chipBad.length, `every example chip gives runs ${chipBad.join(' | ')}`);
  // a schedule that ends: fewer runs than asked, with a note
  const y = new Date().getUTCFullYear() + 2; await ex.fill(`0 0 12 1 1 * ${y}`); await page.waitForTimeout(400);
  ok((await nextRows()).join() === `${y}-01-01T12:00:00Z` && /Next 1 run \(UTC\)/.test(await page.locator('.tool-body').innerText()) && /Only 1 run left/.test(await page.locator('.tool-body').innerText()), 'a one-off schedule (7 fields with a year): "Next 1 run" and a note that it ends');
  // time zones with daylight saving: 9:00 local on both sides of a change; 6 zones give the right UTC hour
  await page.locator('select').nth(1).selectOption('25');
  const zoneBad = [];
  for (const z of ['Asia/Kolkata', 'Europe/London', 'America/New_York', 'Australia/Sydney', 'Asia/Tokyo', 'America/Los_Angeles']) {
    await page.locator('select').nth(0).selectOption(z); await ex.fill('0 9 * * *'); await page.waitForTimeout(350);
    for (const iso of await nextRows()) { const local = new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)); if (local !== '09:00') zoneBad.push(`${z} ${iso} = ${local}`); }
  }
  ok(!zoneBad.length, `"0 9 * * *" is 09:00 wall-clock time in six zones for the next 25 days ${zoneBad.slice(0, 3).join(' | ')}`);
  await page.locator('select').nth(0).selectOption('UTC'); await page.locator('select').nth(1).selectOption('10');
  // more syntax: names, ranges with steps, lists, L, W, #, @ shortcuts — each compared with an independent search here
  const field = (f, lo, hi, names) => { const out = new Set(); for (let part of f.split(',')) { let step = 1; if (part.includes('/')) { [part, step] = part.split('/'); step = +step; } let a, b; if (part === '*') [a, b] = [lo, hi]; else if (part.includes('-')) [a, b] = part.split('-').map((x) => names?.[x.toUpperCase()] ?? +x); else { a = names?.[part.toUpperCase()] ?? +part; b = part.includes('/') || step > 1 ? hi : a; } for (let v = a; v <= b; v += step) out.add(v); } return out; };
  const MON = Object.fromEntries('JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ').map((m, i) => [m, i + 1])), DOW = Object.fromEntries('SUN MON TUE WED THU FRI SAT'.split(' ').map((m, i) => [m, i]));
  const refRuns = (expr, from, n) => { const [mi, ho, dom, mo, dow] = expr.split(' '); const M = field(mi, 0, 59), H = field(ho, 0, 23), D = field(dom, 1, 31), MO = field(mo, 1, 12, MON), W = new Set([...field(dow, 0, 7, DOW)].map((x) => x % 7)); const out = []; let t = Math.floor(from / 60000) * 60000 + 60000;
    while (out.length < n) { const d = new Date(t); const domOk = D.has(d.getUTCDate()), dowOk = W.has(d.getUTCDay()), dayOk = dom === '*' ? dowOk : dow === '*' ? domOk : domOk || dowOk; if (M.has(d.getUTCMinutes()) && H.has(d.getUTCHours()) && MO.has(d.getUTCMonth() + 1) && dayOk) out.push(new Date(t).toISOString().replace('.000Z', 'Z')); t += 60000; } return out; };
  const synBad = [];
  for (const e of ['*/7 * * * *', '5,35 8-18/2 * * MON-FRI', '0 0 1,15 * *', '0 12 * JAN,JUL *', '30 6 * * SUN', '0 0 13 * 5', '*/20 9-17 * * 1-5', '15 14 1 * *', '0 22 * * 1-5', '23 0-20/2 * * *', '5 4 * * 0', '0 0,12 1 */2 *', '0 4 8-14 * *', '0 0 1 1 *', '59 23 31 12 *', '0 0 * * 7', '10-20/5 * * * *', '0 0 29 2 *']) {
    await ex.fill(e); await page.waitForTimeout(300); const got = await nextRows(), now = await page.evaluate(() => Date.now()); const wantR = refRuns(e, now, 10);
    if (JSON.stringify(got) !== JSON.stringify(wantR)) synBad.push(`${e}: ${got[0]} … vs ${wantR[0]} …`);
  }
  ok(!synBad.length, `18 expressions (steps, ranges, lists, month and weekday names, day-of-month OR weekday, 29 February) give the same next 10 runs as a minute-by-minute search written here ${synBad.slice(0, 3).join(' | ')}`);
  for (const [e, re] of [['@hourly', /:00:00Z$/], ['@daily', /T00:00:00Z$/], ['@weekly', /T00:00:00Z$/], ['@monthly', /-01T00:00:00Z$/], ['@yearly', /-01-01T00:00:00Z$/]]) { await ex.fill(e); await page.waitForTimeout(300); const r2 = await nextRows(); if (!r2.length || !r2.every((x) => re.test(x))) synBad.push(e); }
  ok(!synBad.length, `@hourly, @daily, @weekly, @monthly, @yearly ${synBad.join(' | ')}`);
  await ex.fill('0 0 L * *'); await page.waitForTimeout(300); rs = await nextRows(); ok(rs.length === 10 && rs.every((x) => { const d = new Date(x); return new Date(d.getTime() + 86400000).getUTCDate() === 1; }), 'L = the last day of each month (28–31)');
  await ex.fill('0 10 * * 1#1'); await page.waitForTimeout(300); rs = await nextRows(); ok(rs.every((x) => { const d = new Date(x); return d.getUTCDay() === 1 && d.getUTCDate() <= 7; }), '1#1 = the first Monday of each month');
  await ex.fill('0 9 15W * *'); await page.waitForTimeout(300); rs = await nextRows(); ok(rs.length === 10 && rs.every((x) => { const d = new Date(x); return d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && Math.abs(d.getUTCDate() - 15) <= 2; }), '15W = the weekday nearest the 15th');
  await ex.fill(''); await page.waitForTimeout(300); ok(/Enter a cron expression/.test(await page.locator('.tool-body .note-info').first().textContent()), 'empty box → prompt');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'cron');
};
