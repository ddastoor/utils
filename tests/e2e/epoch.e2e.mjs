// Epoch Converter (#/epoch): seconds and milliseconds auto-detected, 0, negative, 2038, ISO/UTC strings, local time in
// the browser's zone (IST), relative time, date picker → timestamp, empty and invalid input, the live clock.
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' }); await page.goto(`${base}#/epoch`);
  const ts = page.getByLabel('Timestamp (seconds or ms)'), dt = page.getByLabel('…or pick a date & time');
  const kv = (l) => page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent === l); return i >= 0 ? s[i + 1].textContent : null; }, l);
  const set = async (v) => { await ts.fill(String(v)); await ts.dispatchEvent('input'); };
  await ts.waitFor();
  const n1 = +(await page.locator('.big-value').textContent()); await page.waitForTimeout(1300); const n2 = +(await page.locator('.big-value').textContent());
  ok(Math.abs(n1 - Date.now() / 1000) < 5 && n2 > n1, `live Unix time ticks (${n1} → ${n2})`);
  for (const [v, iso] of [[0, '1970-01-01T00:00:00.000Z'], [1700000000, '2023-11-14T22:13:20.000Z'], [1700000000123, '2023-11-14T22:13:20.123Z'], [-86400, '1969-12-31T00:00:00.000Z'], [2147483647, '2038-01-19T03:14:07.000Z'], [4102444800, '2100-01-01T00:00:00.000Z']]) {
    await set(v); ok(await kv('ISO 8601') === iso, `${v} → ${iso} (${await kv('ISO 8601')})`);
  }
  await set(1700000000);
  ok(await kv('Seconds') === '1700000000' && await kv('Milliseconds') === '1700000000000' && await kv('UTC') === 'Tue, 14 Nov 2023 22:13:20 GMT', 'seconds, milliseconds, UTC string');
  ok(/15 November 2023.*3:43:20.*(IST|GMT\+5:30)/i.test(await kv('Local')), `local time in IST (${await kv('Local')})`);
  ok(/years? ago/.test(await kv('Relative')), `relative (${await kv('Relative')})`);
  await set(Math.floor(Date.now() / 1000) + 3 * 86400 + 600); ok(/in 3 days/.test(await kv('Relative')), `future relative (${await kv('Relative')})`);
  await dt.fill('2026-11-16T10:00'); await dt.dispatchEvent('input');
  ok(await ts.inputValue() === String(Date.UTC(2026, 10, 16, 4, 30) / 1000) && await kv('ISO 8601') === '2026-11-16T04:30:00.000Z', 'date picker (10:00 IST) → timestamp of 04:30 UTC');
  await set(''); ok(await page.locator('.card').filter({ hasText: 'Converted' }).locator('.kv > span').count() === 0, 'empty box: nothing shown (was 1 Jan 1970)');
  await set('abc'); ok(await page.locator('.kv > span').first().textContent() === 'Invalid', 'text → Invalid');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'epoch');
};
