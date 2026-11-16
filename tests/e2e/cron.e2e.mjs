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
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'cron');
};
