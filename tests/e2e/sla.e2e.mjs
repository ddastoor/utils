// SLA / Uptime (#/sla, PC only): allowed downtime for 99 / 99.9 / 99.99 / 99.999 % against published figures
// (e.g. 99.9 % = 8 h 45 min 57 s per year with a 365.2425-day year, 43 min 49.7 s per month), nines, downtime → availability,
// series / parallel composition, invalid input, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const fmt = (sec) => { if (sec <= 0) return '0 s'; const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return [d && `${d} d`, h && `${h} h`, m && `${m} min`, (s || (!d && !h && !m)) && `${+s.toFixed(s < 10 && !d && !h && !m ? 2 : 1)} s`].filter(Boolean).join(' '); };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/sla`);
  const pct = page.locator('input[aria-label="Availability %"]'); await pct.waitFor();
  const kv = (i) => page.evaluate((i) => { const k = document.querySelectorAll('.kv')[i]; const s = [...k.children].map((e) => e.textContent); const o = {}; for (let j = 0; j + 1 < s.length; j += 2) o[s[j]] = s[j + 1]; return o; }, i);
  const P = { 'Per day': 86400, 'Per week': 604800, 'Per month (30.44 days)': 2629746, 'Per quarter': 7889238, 'Per year (365.24 days)': 31556952 };
  const bad = [];
  for (const p of ['99', '99.5', '99.9', '99.95', '99.99', '99.999', '90', '100', '0']) { await pct.fill(p); const r = await kv(0); for (const [k, s] of Object.entries(P)) if (r[k] !== fmt(s * (1 - p / 100))) bad.push(`${p} ${k}: ${r[k]} ≠ ${fmt(s * (1 - p / 100))}`); }
  ok(!bad.length, `downtime per period for 9 targets ${bad.slice(0, 4).join('; ')}`);
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
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'sla');
};
