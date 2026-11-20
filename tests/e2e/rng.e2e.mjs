// Random Number (#/rng): range (inclusive, decimals rounded inwards, negatives), count clamped to 1..1000, no-repeats
// (a full permutation when count = range size), sort, error messages (max < min, too many unique, range > 2³²),
// the full 32-bit range, χ² uniformity, copy, phone layout.
import { phoneLayout } from './_phone.mjs';
import { chiUniform } from './_stats.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/rng`);
  const out = page.locator('.rng-out'); await out.waitFor({ timeout: 15000 });
  const f = (l) => page.locator('label.field', { hasText: l }).locator('input');
  const tog = (l) => page.locator('label.switch').filter({ hasText: l }).click();
  const gen = async (min, max, n) => {
    if (min != null) await f('Min').fill(String(min)); if (max != null) await f('Max').fill(String(max)); if (n != null) await f('How many').fill(String(n));
    await page.getByRole('button', { name: 'Generate', exact: true }).click(); return out.textContent();
  };
  const nums = (s) => s.split(', ').map(Number);
  let v = nums(await out.textContent()); ok(v.length === 1 && Number.isInteger(v[0]) && v[0] >= 1 && v[0] <= 100, `opens with one number in 1–100 (${v})`);
  v = nums(await gen(1, 10, 1000)); ok(v.length === 1000 && v.every((x) => Number.isInteger(x) && x >= 1 && x <= 10), '1000 numbers in 1–10');
  let c = chiUniform(Array.from({ length: 10 }, (_, i) => v.filter((x) => x === i + 1).length)); ok(c.pass, `1–10 uniform: ${c.text}`);
  // many draws: collect 10,000 values of 1–6 in ten clicks
  const big = []; for (let i = 0; i < 10; i++) big.push(...nums(await gen(1, 6, 1000)));
  c = chiUniform([1, 2, 3, 4, 5, 6].map((k) => big.filter((x) => x === k).length)); ok(c.pass, `1–6 over 10,000 draws: ${c.text}`);
  v = nums(await gen(-5, 5, 1000)); ok(v.every((x) => x >= -5 && x <= 5) && v.includes(-5) && v.includes(5) && v.includes(0), 'negative range −5…5 inclusive of both ends');
  v = nums(await gen(1.5, 4.5, 500)); ok(v.every((x) => x >= 2 && x <= 4) && new Set(v).size === 3, 'decimal bounds round inwards (1.5…4.5 → 2…4)');
  v = nums(await gen(7, 7, 5)); ok(v.join() === '7,7,7,7,7', 'min = max → that number');
  ok(await gen(10, 1, 1) === 'Max must be ≥ min', 'max < min → message');
  v = nums(await gen(1, 100, 5000)); ok(v.length === 1000, 'count above 1000 is capped at 1000');
  v = nums(await gen(1, 100, 0)); ok(v.length === 1, 'count 0 → 1 number');
  await tog('No repeats');
  v = nums(await gen(1, 10, 10)); ok([...v].sort((a, b) => a - b).join() === '1,2,3,4,5,6,7,8,9,10', `no repeats, count = range → a permutation of 1–10 (${v})`);
  ok(v.join() !== '1,2,3,4,5,6,7,8,9,10' || nums(await gen(1, 10, 10)).join() !== '1,2,3,4,5,6,7,8,9,10', 'the permutation is shuffled (not sorted)');
  ok(await gen(1, 10, 11) === 'Only 10 unique numbers exist in that range', 'too many unique → message');
  let firstPos = Array(10).fill(0); for (let i = 0; i < 300; i++) firstPos[nums(await gen(null, null, 10))[0] - 1]++;
  c = chiUniform(firstPos); ok(c.pass, `no-repeat draws: first number uniform over 300 shuffles: ${c.text}`);
  v = nums(await gen(1, 1000000, 1000)); ok(new Set(v).size === 1000 && v.every((x) => x >= 1 && x <= 1e6), '1000 unique numbers from 1–1,000,000 (sparse draw)');
  v = nums(await gen(1, 2000, 1000)); ok(new Set(v).size === 1000 && v.every((x) => x >= 1 && x <= 2000), '1000 unique from 1–2000 (dense draw)');
  await tog('Sort'); v = nums(await gen(1, 50, 20)); ok(v.every((x, i) => !i || x > v[i - 1]), `sorted ascending and unique (${v})`);
  await tog('No repeats'); v = nums(await gen(1, 3, 30)); ok(v.every((x, i) => !i || x >= v[i - 1]) && v.length === 30, 'sorted with repeats (non-decreasing)');
  await tog('Sort');
  v = nums(await gen(0, 4294967295, 1000)); ok(v.every((x) => Number.isInteger(x) && x >= 0 && x <= 4294967295) && v.some((x) => x > 2 ** 31) && v.some((x) => x < 2 ** 31), 'full 32-bit range 0…4,294,967,295 (both halves)');
  v = nums(await gen(-2147483648, 2147483647, 1000)); ok(v.every((x) => x >= -2147483648 && x <= 2147483647) && v.some((x) => x < 0) && v.some((x) => x > 0), 'signed 32-bit range −2³¹…2³¹ − 1');
  v = nums(await gen(0, 4294967296, 1000)); ok(v.every((x) => Number.isInteger(x) && x >= 0 && x <= 4294967296), 'a range of 2³² + 1 numbers works (it said "Range too large")');
  v = nums(await gen(1000000000, 9999999999, 1000));
  ok(v.length === 1000 && v.every((x) => Number.isInteger(x) && String(x).length === 10), `ten-digit numbers (1,000,000,000 … 9,999,999,999)`);
  c = chiUniform([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => v.filter((x) => String(x)[0] === String(d)).length)); ok(c.pass, `ten-digit numbers: the first digit uniform over 1–9: ${c.text}`);
  c = chiUniform(Array.from({ length: 10 }, (_, d) => v.filter((x) => x % 10 === d).length)); ok(c.pass, `ten-digit numbers: the last digit uniform: ${c.text}`);
  v = nums(await gen(0, 9007199254740991, 1000)); ok(v.every((x) => Number.isSafeInteger(x) && x >= 0) && v.some((x) => x > 2 ** 52), 'the whole range 0 … 2⁵³ − 1 (exact integers, upper half reached)');
  ok(/^Range too large/.test(await gen(-1, 9007199254740991, 1)), 'more than 2⁵³ numbers → message');
  ok(/^Use whole numbers between/.test(await gen(1, 1e17, 1)), 'beyond 2⁵³ − 1 → message (no inexact numbers)');
  await tog('No repeats'); v = nums(await gen(1, 1e15, 1000)); ok(new Set(v).size === 1000, '1000 unique numbers from a range of 10¹⁵'); await tog('No repeats');
  ok(await gen(1.2, 1.8, 1) === 'There is no whole number from 1.2 to 1.8', 'no whole number between the two → said');
  await f('Min').fill(''); ok(await gen(null, 10, 1) === 'Enter the smallest number', 'empty Min → asked for (it used 0)');
  await f('Min').fill('1'); await f('Max').fill(''); ok(await gen(null, null, 1) === 'Enter the largest number', 'empty Max → asked for');
  v = nums(await gen(1e12, 1e12 + 9, 200)); ok(v.every((x) => x >= 1e12 && x <= 1e12 + 9) && new Set(v).size === 10, 'large offsets keep exact integers (10¹²…10¹² + 9)');
  const shown = await gen(1, 100, 5); await page.getByRole('button', { name: 'Copy', exact: true }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === shown, 'Copy copies the result');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'rng', { ready: '.rng-out', buttons: ['Generate'], before: async (ph) => {
    await ph.locator('label.field', { hasText: 'Max' }).locator('input').fill('4294967295'); await ph.locator('label.field', { hasText: 'How many' }).locator('input').fill('1000');
    await ph.getByRole('button', { name: 'Generate', exact: true }).click();
  } });
};
