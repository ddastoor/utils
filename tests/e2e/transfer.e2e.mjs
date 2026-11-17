// Data Transfer (#/transfer, PC only): 4.7 GB at 100 Mbit/s = 376 s (6 min 16 s); binary units (1 GiB at 1 Gbit/s =
// 8.59 s); MB/s speeds; protocol overhead; speed needed for a deadline; zero / empty input; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/transfer`);
  const size = page.locator('input[aria-label=Size]'), rate = page.locator('input[aria-label=Speed]'), time = page.locator('input[aria-label=Time]'); await size.waitFor();
  const kv = (i) => page.evaluate((i) => { const k = document.querySelectorAll('.kv')[i]; if (!k) return {}; const s = [...k.children].map((e) => e.textContent); const o = {}; for (let j = 0; j + 1 < s.length; j += 2) o[s[j]] = s[j + 1]; return o; }, i);
  const sel = (i, v) => page.locator('select').nth(i).selectOption(v);
  let r = await kv(0); ok(r['Transfer time'] === '6 min 16 s' && r.Seconds === '376', `4.7 GB at 100 Mbit/s = 376 s (${r['Transfer time']})`);
  ok(r['Effective speed'] === '12.5 MB/s' && r['Per day at this speed'] === '1,080 GB', 'effective 12.5 MB/s, 1,080 GB per day');
  await size.fill('1'); await sel(0, 'GiB'); await rate.fill('1'); await sel(1, 'Gbit/s'); r = await kv(0);
  ok(r.Seconds === (1024 ** 3 * 8 / 1e9).toLocaleString('en-IN', { maximumFractionDigits: 2 }), `1 GiB at 1 Gbit/s = 8.59 s (${r.Seconds})`);
  await size.fill('2'); await sel(0, 'TB'); await rate.fill('250'); await sel(1, 'MB/s'); r = await kv(0); ok(r['Transfer time'] === '2 h 13 min 20 s', `2 TB at 250 MB/s = 8,000 s (${r['Transfer time']})`);
  await page.locator('input[type=range]').fill('20'); await page.locator('input[type=range]').dispatchEvent('input'); r = await kv(0); ok(r.Seconds === '10,000', `20 % overhead → 10,000 s (${r.Seconds})`);
  await page.locator('input[type=range]').fill('0'); await page.locator('input[type=range]').dispatchEvent('input');
  await size.fill('4.7'); await sel(0, 'GB'); await time.fill('10'); await sel(2, '60'); r = await kv(1);
  ok(r['Speed needed'] === `${(4.7e9 * 8 / 600 / 1e6).toLocaleString('en-IN', { maximumFractionDigits: 3 })} Mbit/s` && r['= MB/s'] === '7.833 MB/s', `4.7 GB in 10 min needs 62.667 Mbit/s (${r['Speed needed']})`);
  await rate.fill('0'); ok(/above zero/.test(await page.locator('.note-warn').first().textContent()), 'zero speed refused');
  await time.fill(''); ok(/time above zero/.test(await page.locator('.note-warn').last().textContent()), 'empty time refused');
  await page.locator('.chip-btn', { hasText: 'CD 700 MB' }).click(); ok(await size.inputValue() === '700' && await page.locator('select').nth(0).inputValue() === 'MB', 'chip: CD 700 MB');
  // ---- bug hunt, Nov 2026: results that rounded to "60 s", "0 s", "0 MB/s" or "Infinity d"
  const set = async (sz, su2, rt, ru2, ov = 0) => { await size.fill(sz); await sel(0, su2); await rate.fill(rt); await sel(1, ru2); await page.locator('input[type=range]').fill(String(ov)); await page.locator('input[type=range]').dispatchEvent('input'); return kv(0); };
  await time.fill('10');
  r = await set('14.995', 'GB', '1', 'Gbit/s'); ok(r['Transfer time'] === '2 min' && r.Seconds === '119.96', `119.96 s reads "2 min" (it read "1 min 60 s"): ${r['Transfer time']}`);
  r = await set('7.4995', 'GB', '1', 'Gbit/s'); ok(r['Transfer time'] === '1 min', `59.996 s reads "1 min" (it read "60 s"): ${r['Transfer time']}`);
  r = await set('1', 'KB', '1', 'Gbit/s'); ok(r['Transfer time'] === '8 µs' && r.Seconds === '0.00000800', `1 KB at 1 Gbit/s = 8 µs (it read "0 s", Seconds "0"): ${r['Transfer time']}, ${r.Seconds}`);
  r = await set('1', 'B', '1', 'bit/s'); ok(r['Transfer time'] === '8 s' && r['Effective speed'] === '0.125 B/s' && r['Per day at this speed'] === '10.8 kB', `1 bit/s is shown as 0.125 B/s and 10.8 kB a day (it read "0 MB/s", "0 GB"): ${r['Effective speed']}, ${r['Per day at this speed']}`);
  r = await set('1', 'TB', '1', 'kbit/s'); ok(r['Transfer time'] === '253 years 186 d' && r['Effective speed'] === '125 B/s', `1 TB at 1 kbit/s = ${r['Transfer time']} (it read "92592 d 14 h 13 min 20 s")`);
  r = await set('1', 'TiB', '1', 'MiB/s'); ok(r['Transfer time'] === '12 d 3 h 16 min 16 s' && r.Seconds === '10,48,576', '1 TiB at 1 MiB/s = 2^20 s = 12 d 3 h 16 min 16 s');
  r = await set('25', 'GB', '50', 'Mbit/s', 10); ok(r['Transfer time'] === '1 h 14 min 4.4 s' && r['Effective speed'] === '5.625 MB/s' && r['Per day at this speed'] === '486 GB', '25 GB at 50 Mbit/s with 10 % overhead = 1 h 14 min 4.4 s, 5.625 MB/s effective');
  r = await set('1', 'GB', '100', 'GB/s'); ok(r['Effective speed'] === '100 GB/s' && r['Per day at this speed'] === '8,640 TB', `fast links scale up too (${r['Effective speed']}, ${r['Per day at this speed']})`);
  // every size unit and every speed unit against the definitions (1 MB = 10^6 bytes, 1 MiB = 2^20; speeds in bits)
  const SU = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 }, RU = { 'bit/s': 1, 'kbit/s': 1e3, 'Mbit/s': 1e6, 'Gbit/s': 1e9, 'MB/s': 8e6, 'GB/s': 8e9, 'MiB/s': 8 * 1024 ** 2 }, ubad = [];
  for (const [su3, sv] of Object.entries(SU)) { r = await set('3', su3, '2', 'Mbit/s'); const want = (3 * sv * 8) / 2e6; if (want >= 0.01 && r.Seconds !== want.toLocaleString('en-IN', { maximumFractionDigits: 2 })) ubad.push(`3 ${su3}: ${r.Seconds}`); }
  for (const [ru3, rv] of Object.entries(RU)) { r = await set('5', 'GB', '4', ru3); const want = (5e9 * 8) / (4 * rv); if (r.Seconds !== want.toLocaleString('en-IN', { maximumFractionDigits: 2 })) ubad.push(`4 ${ru3}: ${r.Seconds}`); }
  ok(!ubad.length, `9 size units and 7 speed units give the seconds their definitions give ${ubad.join(' | ')}`);
  // deadline card: tiny and huge needs keep readable units
  await set('1', 'KB', '1', 'Mbit/s'); await time.fill('10'); await sel(2, '3600'); r = await kv(1); ok(r['Speed needed'] === '0.222 bit/s' && r['= MB/s'] === '0.028 B/s', `1 KB in 10 hours needs ${r['Speed needed']} (it read "0 Mbit/s")`);
  await set('1', 'TB', '1', 'Mbit/s'); await time.fill('1'); await sel(2, '1'); r = await kv(1); ok(r['Speed needed'] === '8,000 Gbit/s' && r['= MB/s'] === '1,000 GB/s', `1 TB in one second needs ${r['Speed needed']}`);
  await set('4.7', 'GB', '100', 'Mbit/s', 20); await time.fill('10'); await sel(2, '60'); r = await kv(1); ok(r['Speed needed'] === '78.333 Mbit/s', '20 % overhead raises the speed needed for a deadline (62.667 → 78.333 Mbit/s)');
  // nothing typed, negative, zero
  await size.fill(''); ok(/Enter a size and a speed/.test(await page.locator('.note-warn').first().textContent()) && /Enter a size first/.test(await page.locator('.note-warn').last().textContent()), 'an empty size asks for one (it was treated as 0: "0 s")');
  await size.fill('-1'); ok(/Enter a size and a speed/.test(await page.locator('.note-warn').first().textContent()), 'a negative size is refused');
  await size.fill('0'); r = await kv(0); ok(r['Transfer time'] === '0 s', 'size 0 → 0 s');
  await size.fill('1'); await time.fill('0'); ok(/time above zero/.test(await page.locator('.note-warn').last().textContent()), 'a zero deadline is refused');
  const chipBad = []; for (const c of await page.locator('.chip-btn').allTextContents()) { await page.locator('.chip-btn', { hasText: c }).click(); if (!/\d/.test((await kv(0))['Transfer time'] || '')) chipBad.push(c); } ok(!chipBad.length, 'every size preset gives a result');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'transfer');
};
