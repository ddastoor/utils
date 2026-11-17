// SLA / Uptime (#/sla, PC only): allowed downtime for 99 / 99.9 / 99.99 / 99.999 % against published figures
// (e.g. 99.9 % = 8 h 45 min 57 s per year with a 365.2425-day year, 43 min 49.7 s per month), nines, downtime → availability,
// series / parallel composition, invalid input, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
// reference written here: the whole duration is rounded to a tenth of a second (a hundredth below 10 s) BEFORE it is
// split into days / hours / minutes — the first version of this reference repeated the page's own bug ("2 h 23 min 60 s")
const fmt = (sec) => {
  if (!(sec > 0)) return '0 s';
  if (sec < 0.1) return sec < 1e-3 ? `${+(sec * 1e6).toPrecision(3)} µs` : `${+(sec * 1000).toPrecision(3)} ms`;
  const tenths = sec < 10 ? Math.round(sec * 100) / 10 : Math.round(sec * 10); let whole = Math.floor(tenths / 10); const frac = +(tenths / 10 - whole).toFixed(2);
  const y = Math.floor(whole / 31556952); whole -= y * 31556952; const d = Math.floor(whole / 86400), h = Math.floor((whole % 86400) / 3600), m = Math.floor((whole % 3600) / 60), s2 = +((whole % 60) + frac).toFixed(2);
  if (y) return [`${y} year${y === 1 ? '' : 's'}`, d && `${d} d`, y < 100 && h && `${h} h`].filter(Boolean).join(' ');
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`, (s2 || (!d && !h && !m)) && `${s2} s`].filter(Boolean).join(' ');
};
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/sla`);
  const pct = page.locator('input[aria-label="Availability %"]'); await pct.waitFor();
  const kv = (i) => page.evaluate((i) => { const k = document.querySelectorAll('.kv')[i]; const s = [...k.children].map((e) => e.textContent); const o = {}; for (let j = 0; j + 1 < s.length; j += 2) o[s[j]] = s[j + 1]; return o; }, i);
  const P = { 'Per day': 86400, 'Per week': 604800, 'Per month (30.44 days)': 2629746, 'Per quarter': 7889238, 'Per year (365.24 days)': 31556952 };
  const bad = [];
  for (const p of ['99', '99.5', '99.9', '99.95', '99.99', '99.999', '90', '100', '0']) { await pct.fill(p); const r = await kv(0); for (const [k, s] of Object.entries(P)) if (r[k] !== fmt(s * (1 - p / 100))) bad.push(`${p} ${k}: ${r[k]} ≠ ${fmt(s * (1 - p / 100))}`); }
  ok(!bad.length, `downtime per period for 9 targets ${bad.slice(0, 4).join('; ')}`);
  // exact values that used to show a "60": 90 % of a day is 2 h 24 min, 99.930556 % of a day is 1 min
  const exact = []; for (const [p, k, want] of [['90', 'Per day', '2 h 24 min'], ['90', 'Per week', '16 h 48 min'], ['75', 'Per day', '6 h'], ['50', 'Per week', '3 d 12 h'], ['0', 'Per day', '1 d'], ['0', 'Per year (365.24 days)', '1 year'], ['99.999', 'Per day', '0.86 s'], ['99.99999', 'Per day', '8.64 ms'], ['99.9999999', 'Per day', '86.4 µs'], ['100', 'Per year (365.24 days)', '0 s']]) { await pct.fill(p); const got = (await kv(0))[k]; if (got !== want) exact.push(`${p} % ${k}: ${got} (want ${want})`); }
  ok(!exact.length, `whole results read as whole units ("2 h 24 min", not "2 h 23 min 60 s"), tiny ones in ms / µs (not "0 s") ${exact.join(' | ')}`);
  await pct.fill('99.9'); let r = await kv(0);
  ok(r['Per year (365.24 days)'] === '8 h 45 min 57 s' && r['Per month (30.44 days)'] === '43 min 49.7 s' && r['Per day'] === '1 min 26.4 s' && r.Nines === '3.00', `99.9 %: 31,556.952 s = 8 h 45 min 57 s/year (Gregorian 365.2425-day year), 43 min 49.7 s/month, 1 min 26.4 s/day (${r['Per year (365.24 days)']})`);
  await pct.fill('99.999'); r = await kv(0); ok(r['Per year (365.24 days)'] === '5 min 15.6 s' && r.Nines === '5.00', `five nines = 5 min 15.6 s per year (${r['Per year (365.24 days)']})`);
  await pct.fill('101'); ok(/between 0 and 100/.test(await page.locator('.note-warn').first().textContent()), '101 % refused');
  await pct.fill('99.9');
  const down = page.locator('input[aria-label=Downtime]');
  await down.fill('43.8'); r = await kv(1); ok(r.Availability === `${(100 * (1 - 43.8 * 60 / 2629746)).toFixed(4).replace(/\.?0+$/, '')} %`, `43.8 min down in a month → ${r.Availability}`);
  await page.locator('select').nth(0).selectOption({ label: 'seconds' }); await page.locator('select').nth(1).selectOption({ label: 'Per day' }); await down.fill('864');
  r = await kv(1); ok(r.Availability === '99 %', `864 s down in a day = 99 % (${r.Availability})`);
  await page.locator('input[aria-label=Components]').fill('99.9, 99.9'); r = await kv(2);
  ok(r['All needed (in series)'] === '99.8001 %' && r['Any one is enough (redundant, in parallel)'] === '99.9999 %', `two 99.9 % parts: series 99.8001 %, parallel 99.9999 % (${r['All needed (in series)']}, ${r['Any one is enough (redundant, in parallel)']})`);
  await page.locator('input[aria-label=Components]').fill('99.9, abc'); ok(/List the components/.test(await page.locator('.note-warn').last().textContent()), 'bad component list refused');
  await page.locator('.chip-btn', { hasText: 'four nines' }).click(); ok(await pct.inputValue() === '99.99', 'chip: four nines');
  // ---- bug hunt, Nov 2026: downtime → availability keeps enough digits; odd input; components with % signs
  const dn = page.locator('input[aria-label=Downtime]'), setDown = async (v, unit, per) => { await dn.fill(v); await page.locator('select').nth(0).selectOption({ label: unit }); await page.locator('select').nth(1).selectOption({ label: per }); return (await kv(1)).Availability; };
  ok(await setDown('1', 'seconds', 'Per year (365.24 days)') === '99.999997 %', 'one second a year is 99.999997 % (it used to round to "100 %")');
  ok(await setDown('0.001', 'seconds', 'Per year (365.24 days)') === '99.999999997 %' && await setDown('0', 'minutes', 'Per day') === '100 %', 'a millisecond a year still is not 100 %; zero downtime is');
  ok(await setDown('8.76', 'hours', 'Per year (365.24 days)') === '99.9001 %' && await setDown('43.83', 'minutes', 'Per month (30.44 days)') === '99.9 %' && await setDown('1440', 'minutes', 'Per day') === '0 %', '8.76 h/year = 99.9001 %, 43.83 min/month = 99.9 %, a whole day = 0 %');
  await setDown('1441', 'minutes', 'Per day'); ok(/longer than the period/.test(await page.locator('.note-warn').first().textContent()), 'more downtime than the period → 0 % with a note');
  for (const v of ['', '-5']) { await dn.fill(v); if (!/Enter the downtime/.test(await page.locator('.tool-body').innerText())) ok(false, `downtime "${v}" should ask for a value`); }
  ok(true, 'empty or negative downtime asks for a value');
  await dn.fill('30');
  const comps = page.locator('input[aria-label=Components]'), comb = async (v) => { await comps.fill(v); return kv(2); };
  let c3 = await comb('99.9%, 99.95%; 99.99'); ok(c3['All needed (in series)'] === '99.840065 %', `components written with % signs and a semicolon are read (${c3['All needed (in series)']})`);
  c3 = await comb('99, 99'); ok(c3['All needed (in series)'] === '98.01 %' && c3['Any one is enough (redundant, in parallel)'] === '99.99 %', 'two 99 % parts: 98.01 % in series, 99.99 % in parallel');
  c3 = await comb('99.9 99.9 99.9 99.9 99.9 99.9 99.9 99.9 99.9 99.9'); ok(c3['All needed (in series)'] === `${(0.999 ** 10 * 100).toFixed(6).replace(/\.?0+$/, '')} %`, `ten 99.9 % parts in series = ${c3['All needed (in series)']}`);
  c3 = await comb('100, 0'); ok(c3['All needed (in series)'] === '0 %' && c3['Any one is enough (redundant, in parallel)'] === '100 %' && c3['Parallel downtime per year'] === '0 s' && c3['Series downtime per year'] === '1 year', '100 % and 0 %: series 0 %, parallel 100 %');
  for (const v of ['99.9, abc', '101', '-1', ' ']) { await comps.fill(v); if (!/List the components/.test(await page.locator('.tool-body').innerText())) ok(false, `components "${v}" should be refused`); }
  ok(true, 'components that are not percentages are refused');
  for (const [v, nines] of [['90', '1.00'], ['99', '2.00'], ['99.5', '2.30'], ['99.999', '5.00'], ['100', '∞'], ['0', '0.00']]) { await pct.fill(v); if ((await kv(0)).Nines !== nines) ok(false, `nines of ${v}`); }
  ok(true, 'nines: 90 % = 1, 99.5 % = 2.30, 100 % = ∞');
  for (const v of ['', '100.1', '-1']) { await pct.fill(v); if (!/between 0 and 100/.test(await page.locator('.note-warn').first().textContent())) ok(false, `availability "${v}"`); }
  ok(true, 'availability outside 0–100 is refused');
  const chipB = []; for (const c of await page.locator('.chip-btn').allTextContents()) { await page.locator('.chip-btn', { hasText: c }).first().click(); if (!/\d/.test((await kv(0))['Per year (365.24 days)'])) chipB.push(c); } ok(!chipB.length, 'every target chip gives a result');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'sla');
};
