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
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'transfer');
};
