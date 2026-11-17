// Epoch Converter (#/epoch, PC only): seconds / milliseconds / microseconds / nanoseconds found from the size (or
// chosen), 120 instants against Python's datetime in three time zones (India +05:30, Newfoundland −03:30 / −02:30,
// Chatham +12:45 / +13:45), separators and fractions, ISO and day/month/year dates, the picker kept in step both
// ways, errors said in words, relative time on a fixed clock.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { REF, setValue, until } from './_devdata.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const NOW = Date.UTC(2026, 10, 17, 6, 30, 0); // 12:00 in India
  const openIn = async (zone) => { const p = await newPage({ timezoneId: zone, locale: 'en-IN' }); await p.clock.install({ time: new Date(NOW) }); await p.goto(`${base}#/epoch`); await p.getByLabel('Timestamp or date', { exact: true }).waitFor(); return p; };
  const kv = async (p) => { const t = await p.locator('.card').filter({ hasText: 'Converted' }).locator('.kv span').allTextContents(); const o = {}; for (let i = 0; i < t.length; i += 2) o[t[i]] = t[i + 1]; return o; };
  const note = async (p) => (await p.locator('.card').filter({ hasText: 'Converted' }).locator('.note').allTextContents()).join(' | ').trim();
  const page = await openIn('Asia/Kolkata');
  const ts = page.getByLabel('Timestamp or date', { exact: true }), dt = page.getByLabel('Date and time picker'), unit = page.locator('select');
  const type = async (p, s) => { await setValue(p.getByLabel('Timestamp or date', { exact: true }), s); return kv(p); };
  ok(await ts.inputValue() === String(NOW / 1000) && (await kv(page))['ISO 8601 (UTC)'] === '2026-11-17T06:30:00.000Z' && (await kv(page)).Relative === 'now' && /Read as seconds \(from the number of digits/.test(await note(page)), 'opens on the current time, read as seconds');
  ok(await page.locator('.big-value').textContent() === String(NOW / 1000), 'the big clock shows the current Unix time');
  await page.clock.runFor(3000); ok(+await page.locator('.big-value').textContent() >= NOW / 1000 + 3, 'and it ticks');
  await page.clock.pauseAt(new Date(NOW + 60000)); const N1 = NOW / 1000 + 60; // from here the page's clock stands still
  let k = await type(page, '1700000000');
  ok(JSON.stringify(k) === JSON.stringify({ Seconds: '1700000000', Milliseconds: '1700000000000', 'ISO 8601 (UTC)': '2023-11-14T22:13:20.000Z', 'ISO 8601 (Asia/Calcutta)': '2023-11-15T03:43:20+05:30', UTC: 'Tue, 14 Nov 2023 22:13:20 GMT', Local: 'Wednesday, 15 November 2023 at 3:43:20 am IST', Relative: '3 years ago' })
    || JSON.stringify(k) === JSON.stringify({ Seconds: '1700000000', Milliseconds: '1700000000000', 'ISO 8601 (UTC)': '2023-11-14T22:13:20.000Z', 'ISO 8601 (Asia/Kolkata)': '2023-11-15T03:43:20+05:30', UTC: 'Tue, 14 Nov 2023 22:13:20 GMT', Local: 'Wednesday, 15 November 2023 at 3:43:20 am IST', Relative: '3 years ago' }), `1700000000 in every form: ${JSON.stringify(k)}`);
  ok(await dt.inputValue() === '2023-11-15T03:43:20', 'the picker follows the typed timestamp (local time)');
  for (const [s, u] of [['1700000000000', 'milliseconds'], ['1700000000000000', 'microseconds'], ['1700000000000000000', 'nanoseconds']]) { k = await type(page, s); ok(k['ISO 8601 (UTC)'] === '2023-11-14T22:13:20.000Z' && new RegExp(`Read as ${u} `).test(await note(page)), `${s} is read as ${u}: the same instant`); }
  k = await type(page, '1700000000123456789'); ok(k.Milliseconds === '1700000000123' && k['Beyond milliseconds'] === '0.456789 ms more (a date holds whole milliseconds)', 'nanoseconds: nothing is rounded away — the digits beyond the millisecond are shown');
  for (const s of ['1,700,000,000', '1 700 000 000', '1_700_000_000', ' 1700000000 ', '1.7e9', '+1700000000']) ok((await type(page, s)).Milliseconds === '1700000000000', `${JSON.stringify(s)} is read as 1700000000`);
  ok((await type(page, '1700000000.5')).Milliseconds === '1700000000500' && (await type(page, '-1'))['ISO 8601 (UTC)'] === '1969-12-31T23:59:59.000Z' && (await type(page, '0'))['ISO 8601 (UTC)'] === '1970-01-01T00:00:00.000Z', 'a fraction of a second, a negative time, zero');
  // the reference instants, in three zones
  for (const zone of ['Asia/Kolkata', 'America/St_Johns', 'Pacific/Chatham']) {
    const p = zone === 'Asia/Kolkata' ? page : await openIn(zone); let good = 0, n = 0;
    for (const [i, r] of REF.epoch.instants.entries()) {
      if (i % 4 !== (zone.length % 4)) continue;
      const u = ['s', 'ms', 'us', 'ns'][i % 4 === 0 ? 0 : (i >> 2) % 4]; // rows with i % 4 == 0 may be too small for the automatic unit: seconds only
      n++; const v = await type(p, r[u]), iso = u === 's' ? r.isoSeconds : r.iso, local = Object.entries(v).find(([key]) => key.startsWith('ISO 8601 (') && !key.includes('UTC'))[1];
      const wantLocal = u === 's' ? r.local[zone].replace(/\.\d{3}/, '') : r.local[zone], rest = u === 'us' ? r.restUs : u === 'ns' ? r.restNs : '';
      if (v['ISO 8601 (UTC)'] === iso && local === wantLocal && (rest ? v['Beyond milliseconds']?.startsWith(`0.${rest} ms`) : !('Beyond milliseconds' in v))) good++;
      else if (good === n - 1) ok(false, `${zone}: ${r[u]} (${u}) → ${JSON.stringify(v)}; want ${iso} / ${wantLocal} / rest ${rest}`);
    }
    ok(good === n && n >= 25, `${zone}: ${n} instants give Python's UTC time and local time with its offset (${good})`);
    let d = 0, m = 0;
    for (const r of REF.epoch.dmy.filter((x) => x.zone === zone)) { m++; if ((await type(p, r.text)).Seconds === String(r.s) && (await type(p, r.dashes)).Seconds === String(r.sMinute)) d++; else ok(false, `${zone}: ${r.text} → ${JSON.stringify(await type(p, r.text))}, want ${r.s}`); }
    ok(d === m, `${zone}: ${m} dates typed as day/month/year hh:mm:ss (and dd-mm-yyyy hh:mm) give the instant Python's zoneinfo gives`);
    if (p !== page) await p.context().close();
  }
  // dates
  for (const [s, iso, how] of [['2023-11-14T22:13:20Z', '2023-11-14T22:13:20.000Z', 'with the time zone it names'], ['2023-11-14T22:13:20+05:30', '2023-11-14T16:43:20.000Z', 'with the time zone it names'], ['2023-11-14', '2023-11-14T00:00:00.000Z', 'a date alone is midnight UTC'],
    ['2023-11-14 22:13', '2023-11-14T16:43:00.000Z', 'your local time'], ['14/11/2023', '2023-11-13T18:30:00.000Z', 'day/month/year, your local time'], ['14-11-2023 10:15 pm', '2023-11-14T16:45:00.000Z', 'day/month/year, your local time'], ['Tue, 14 Nov 2023 22:13:20 GMT', '2023-11-14T22:13:20.000Z', 'with the time zone it names']]) {
    k = await type(page, s); ok(k['ISO 8601 (UTC)'] === iso && (await note(page)) === `Read as a date (${how}).`, `${s} → ${iso} — ${how}`);
  }
  for (const [s, re] of [['abc', /Not a timestamp or a date this tab can read\. Try 1700000000, 2023-11-14T22:13:20Z or 14\/11\/2023 22:13\./], ['31/02/2023', /31\/02\/2023 is not a real date \(read as day\/month\/year\)/], ['99999999999999999999999', /outside the range of dates/], ['1,,2', /Not a number/]]) {
    await type(page, s); ok(re.test(await note(page)) && await ts.evaluate((e) => e.classList.contains('bad')) && await page.locator('.card').filter({ hasText: 'Converted' }).locator('.kv').count() === 0, `${s}: ${(await note(page)).slice(0, 70)}`);
  }
  await type(page, ''); ok(await note(page) === '' && !await ts.evaluate((e) => e.classList.contains('bad')), 'an empty box is not an error');
  // unit by hand
  await type(page, '5'); await unit.selectOption('ms'); ok((await kv(page))['ISO 8601 (UTC)'] === '1970-01-01T00:00:00.005Z' && await note(page) === 'Read as milliseconds.', 'the unit can be chosen: 5 as milliseconds');
  await unit.selectOption('ns'); ok((await kv(page))['Beyond milliseconds'] === '0.000005 ms more (a date holds whole milliseconds)', '5 as nanoseconds');
  await unit.selectOption('auto');
  // picker
  await dt.fill('2024-02-29T12:30:45'); ok(await ts.inputValue() === '1709190045' && (await kv(page))['ISO 8601 (UTC)'] === '2024-02-29T07:00:45.000Z', 'the picker sets the timestamp (local time → UTC)');
  await dt.fill(''); ok(await ts.inputValue() === '1709190045' && !/NaN|Invalid/.test(await page.locator('.card').filter({ hasText: 'Converted' }).textContent()), 'clearing the picker changes nothing (it used to write "NaN")');
  await page.getByRole('button', { name: 'Use now' }).click(); ok(await ts.inputValue() === String(N1) && (await kv(page)).Relative === 'now', '"Use now" puts the current time in');
  for (const [d, rel] of [[60, 'in 1 minute'], [3599, 'in 1 hour'], [-86400 * 2, '2 days ago'], [86400 * 45, 'next month'], [-1, '1 second ago']]) ok((await type(page, String(N1 + d))).Relative === rel, `relative time: ${d} s from now is "${rel}"`);
  ok(await until(page, () => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'epoch');
};
