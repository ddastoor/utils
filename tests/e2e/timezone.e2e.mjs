// Time Zone Converter (#/timezone): wall-clock readings → instants against Python's zoneinfo
// (tests/fixtures/tz/reference.json), offsets with half and quarter hours and with seconds, the clock-change cases
// (repeated and skipped hours, a skipped day), From / To zones, zone names, what is refused, phone layout.
import { readFileSync } from 'node:fs';
import { calc } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';

const ref = JSON.parse(readFileSync(new URL('../fixtures/tz/reference.json', import.meta.url), 'utf8'));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** an instant as the tab writes it for UTC — from the Date's own UTC fields, not from Intl */
const utcText = (ms) => { const d = new Date(ms), h = d.getUTCHours(); return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).padStart(4, '0')}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const label = (z) => z.replace(/_/g, ' ');

export default async ({ base, page: newPage, ok, info, devices }) => {
  const page = await newPage({ locale: 'en-US', timezoneId: 'Asia/Kolkata' }); await page.goto(`${base}#/timezone`); const c = calc(page);
  await page.locator('.kv').waitFor();
  const at = async (date, time, from, to) => { await c.pick('From zone', from); if (to) await c.pick('To zone', to); await c.set('Date', date); await c.set('Time', time); return c.rows(); };
  const row = (rows, zone) => Object.entries(rows).find(([k]) => k.startsWith(`${label(zone)} (`)) || ['', ''];
  const big = async () => [(await page.locator('.big-label').first().textContent()).trim(), (await page.locator('.big-value').first().textContent()).trim()];

  // ---- the first view: this device's zone → UTC
  { const zs = await page.locator('select').evaluateAll((s) => s.map((x) => x.value));
    ok(zs[0] === 'Asia/Kolkata' && zs[1] === 'UTC', `from this device's zone (Asia/Kolkata) to UTC (${zs})`);
    const [l, v] = await big(); ok(l === 'In UTC' && /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d\d [ap]m$/.test(v), `the answer in large type: "${l}" — ${v}`); }

  // ---- 9:30 in the morning in India
  let r = await at('2026-11-16', '09:30', 'Asia/Kolkata', 'America/New_York');
  const t = Date.UTC(2026, 10, 16, 4, 0);
  ok((await big()).join(' | ') === 'In America/New York | Sun, 15 Nov 2026, 11:00 pm', `9:30 am IST on 16 Nov 2026 is 11:00 pm the evening before in New York (${await big()})`);
  ok(r.Difference === 'America/New York is 10 hours 30 minutes behind Asia/Kolkata.', `the difference is said (${r.Difference})`);
  for (const [z, off, text] of [['Asia/Kolkata', '+05:30', 'Mon, 16 Nov 2026, 9:30 am'], ['UTC', '+00:00', utcText(t)], ['Asia/Kathmandu', '+05:45', 'Mon, 16 Nov 2026, 9:45 am'], ['America/New_York', '−05:00', 'Sun, 15 Nov 2026, 11:00 pm'], ['Europe/London', '+00:00', 'Mon, 16 Nov 2026, 4:00 am'], ['Australia/Sydney', '+11:00', 'Mon, 16 Nov 2026, 3:00 pm'], ['Asia/Tokyo', '+09:00', 'Mon, 16 Nov 2026, 1:00 pm'], ['Asia/Dubai', '+04:00', 'Mon, 16 Nov 2026, 8:00 am']]) {
    const [k, v] = row(r, z); ok(k === `${label(z)} (UTC${off})` && v === text, `… ${z}: ${text} (UTC${off}) — got ${k}: ${v}`);
  }
  ok(Object.keys(r).filter((k) => k.startsWith('Asia/Kolkata (')).length === 1 && Object.keys(r).filter((k) => k.startsWith('America/New York (')).length === 1, 'the two chosen zones are listed once each, with the other cities');
  r = await at('2026-07-01', '09:30', 'Asia/Kolkata', 'America/New_York');
  ok(row(r, 'America/New_York')[0].endsWith('(UTC−04:00)') && row(r, 'Europe/London')[0].endsWith('(UTC+01:00)') && row(r, 'Australia/Sydney')[0].endsWith('(UTC+10:00)') && r.Difference === 'America/New York is 9 hours 30 minutes behind Asia/Kolkata.', `summer time: New York −4, London +1, Sydney +10 in July; the difference follows (${r.Difference})`);
  r = await at('2026-12-31', '23:30', 'Asia/Kolkata', 'Asia/Tokyo');
  ok((await big())[1] === 'Fri, 1 Jan 2027, 3:00 am' && r.Difference === 'Asia/Tokyo is 3 hours 30 minutes ahead of Asia/Kolkata.', `across the new year the year is shown (${await big()}; ${r.Difference})`);
  r = await at('2026-11-16', '09:30', 'Asia/Kolkata', 'Asia/Colombo');
  ok(r.Difference === 'Asia/Colombo has the same time as Asia/Kolkata.', `the same time (${r.Difference})`);
  r = await at('2026-11-16', '09:30', 'Asia/Kolkata', 'Asia/Kolkata');
  ok(r.Difference === 'The two zones are the same.' && (await big())[1] === 'Mon, 16 Nov 2026, 9:30 am', 'from a zone to itself');

  // ---- readings of the reference: the instant in UTC, and whether the reading exists once, twice or not at all
  const zonesHere = new Set(await page.locator('select').first().evaluate((s) => [...s.options].map((o) => o.value)));
  const pick = ref.readings.filter(([zi, date]) => zonesHere.has(ref.zones[zi]) && date >= '2016').filter((_, i) => i % 17 === 0);
  let bad = [], newer = [];
  await c.pick('To zone', 'UTC');
  for (const [zi, date, time, sec, kind] of pick) {
    const zone = ref.zones[zi]; r = await at(date, time, zone);
    const got = [(await big())[1], /happens twice/.test(r.Note || '') ? 'twice' : /does not exist/.test(r.Note || '') ? 'skipped' : 'ok'], want = [utcText(sec * 1000), kind];
    if (got.join() !== want.join()) (date >= '2025' ? newer : bad).push(`${zone} ${date} ${time}: ${got} ≠ ${want}`);
  }
  ok(pick.length >= 100 && !bad.length, `${pick.length} readings around clock changes in ${new Set(pick.map((x) => x[0])).size} zones give the instants Python's zoneinfo gives, with the right note ${bad.slice(0, 3).join(' | ')}`);
  if (newer.length) info(`${newer.length} readings of 2025 – 2026 differ: this browser's zone database is older than tzdata ${ref.made_with.split(' ').pop()} — ${newer.slice(0, 2).join(' | ')}`);
  ok(newer.length <= pick.length * 0.03, `at most a few of the newest rules are unknown to this browser (${newer.length})`);

  // ---- clock changes, said in words
  r = await at('2026-03-08', '03:30', 'America/New_York');
  ok((await big())[1] === utcText(Date.UTC(2026, 2, 8, 7, 30)) && !r.Note, `03:30 just after the spring change → 07:30 UTC, no note (${(await big())[1]})`);
  r = await at('2026-03-08', '02:30', 'America/New_York');
  ok((await big())[1] === utcText(Date.UTC(2026, 2, 8, 7, 30)) && r.Note === 'This time does not exist in America/New York (clocks go forward); it is read as 3:30 am.', `02:30 does not exist that day → read as 3:30 am (${r.Note})`);
  r = await at('2026-11-01', '01:30', 'America/New_York');
  ok((await big())[1] === utcText(Date.UTC(2026, 10, 1, 5, 30)) && r.Note === 'This time happens twice in America/New York (clocks go back); the first one is used.', `01:30 on 1 Nov happens twice → the first (05:30 UTC) (${r.Note})`);
  r = await at('2026-04-05', '01:45', 'Australia/Lord_Howe');
  ok(/happens twice in Australia\/Lord Howe/.test(r.Note || '') && row(r, 'Australia/Lord_Howe')[0].endsWith('(UTC+11:00)'), `Lord Howe Island's half-hour change: 01:45 happens twice (${row(r, 'Australia/Lord_Howe')[0]})`);
  r = await at('2011-12-30', '12:00', 'Pacific/Apia');
  ok(r.Note === 'This time does not exist in Pacific/Apia (clocks go forward); it is read as Sat, 31 Dec 2011, 12:00 pm.', `Samoa skipped 30 December 2011: the note names the day it is read as (it said only "12:00 pm") — ${r.Note}`);

  // ---- old dates: offsets with seconds, and the first hundred years
  r = await at('1850-01-01', '12:00', 'Asia/Kolkata');
  ok(row(r, 'Asia/Kolkata')[0] === 'Asia/Kolkata (UTC+05:53:28)' && (await big())[1] === 'Tue, 1 Jan 1850, 6:06 am', `Kolkata in 1850: local mean time, UTC+05:53:28 (it was "UTC+05:53.46666666666664") — ${row(r, 'Asia/Kolkata')[0]}`);
  r = await at('0050-01-03', '12:00', 'UTC');
  ok((await big())[1] === 'Mon, 3 Jan 0050, 12:00 pm' && row(r, 'Asia/Kolkata')[0] === 'Asia/Kolkata (UTC+05:53:28)', `the year 50 is the year 50: a Monday, Kolkata on local mean time (it was worked out as 1950) — ${(await big())[1]}, ${row(r, 'Asia/Kolkata')[0]}`);
  r = await at('0001-01-02', '00:00', 'America/Los_Angeles');
  ok(row(r, 'America/Los_Angeles')[0] === 'America/Los Angeles (UTC−07:52:58)' && !(await c.warn()), `2 January 0001 in Los Angeles: UTC−07:52:58 (${row(r, 'America/Los_Angeles')[0]})`);
  r = await at('9999-12-30', '23:59', 'Pacific/Kiritimati');
  ok((await big())[1] === 'Thu, 30 Dec 9999, 9:59 am' && !(await c.warn()), `30 December 9999 (${(await big())[1]})`);

  // ---- refused
  for (const [d, why] of [['0001-01-01', 'the first day of the calendar'], ['9999-12-31', 'the last day']]) { await c.set('Date', d); ok(await c.warn() === 'Pick a date between 2 January 0001 and 30 December 9999.', `${d} (${why}: its neighbours in other zones lie outside the calendar) → ${await c.warn()}`); }
  await c.set('Date', '2026-11-16'); await c.set('Time', '');
  ok(await c.warn() === 'Pick a date and time.', 'a missing time');
  await c.set('Time', '09:30'); await c.set('Date', '');
  ok(await c.warn() === 'Pick a date and time.', 'a missing date');
  await c.set('Date', '2026-11-16');
  ok(!(await c.warn()) && !/NaN|Invalid|undefined/.test(await page.locator('.tool-body').innerText()), 'back to an answer; never NaN or "Invalid Date" on the page');

  // ---- zone names
  const names = await page.locator('select').first().evaluate((s) => [...s.options].map((o) => o.value));
  const old = names.filter((n) => /Calcutta|Katmandu|Saigon|Rangoon|Kiev|Asmera|\/Buenos_Aires$|Godthab|\/Indianapolis$|\/Louisville$|Faeroe|Enderbury|Ponape|Truk|Coral_Harbour/.test(n) && !/Argentina|Indiana\/|Kentucky\//.test(n));
  ok(!old.length && new Set(names).size === names.length && names.length > 400, `${names.length} zones, each once, none under a name tzdata has replaced (${old})`);
  ok(['Asia/Kolkata', 'Asia/Kathmandu', 'Europe/Kyiv', 'Asia/Ho_Chi_Minh', 'America/Argentina/Buenos_Aires', 'America/Nuuk', 'Europe/Bratislava', 'UTC', 'Pacific/Kiritimati'].every((n) => names.includes(n)), 'current names are there — and places like Bratislava, which tzdata merely links to a neighbour');
  ok(await page.locator('select').nth(1).evaluate((s) => s.options.length) === names.length, 'the "To zone" list is the same list');

  // ---- copy
  await hookClipboard(page); await at('2026-11-16', '09:30', 'Asia/Kolkata', 'America/New_York'); await page.locator('.big-result').first().click();
  ok((await copied(page)).join() === 'Sun, 15 Nov 2026, 11:00 pm', `a click copies the answer (${await copied(page)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- another device: New York; and a device on UTC
  const ny = await newPage({ locale: 'en-US', timezoneId: 'America/New_York' }); await ny.goto(`${base}#/timezone`); await ny.locator('.kv').waitFor();
  ok((await ny.locator('select').evaluateAll((s) => s.map((x) => x.value))).join() === 'America/New_York,UTC', 'on a device in New York: from America/New_York to UTC');
  const utc = await newPage({ locale: 'en-US', timezoneId: 'UTC' }); await utc.goto(`${base}#/timezone`); await utc.locator('.kv').waitFor();
  ok((await utc.locator('select').evaluateAll((s) => s.map((x) => x.value))).join() === 'UTC,Asia/Kolkata', 'on a device set to UTC: from UTC to Asia/Kolkata');

  // ---- phone
  const ph = await newPage({ ...devices['iPhone 13'], timezoneId: 'Asia/Kolkata' }); await ph.goto(`${base}#/timezone`); await ph.locator('.kv').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body select, .tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: date, time and both zone lists are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
