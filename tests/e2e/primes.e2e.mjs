// Prime / LCM / GCD (#/primes): prime test, factors and the next prime for 64-bit numbers, GCD and LCM of a list —
// against SymPy and Python's math (tests/fixtures/primes/reference.json, scripts/make-primes-reference.py); what is
// left out of the box is said; copy; phone layout.
import { readFileSync } from 'node:fs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/primes/reference.json', import.meta.url), 'utf8'));
const group = (f) => { const g = []; for (const p of f) { const l = g[g.length - 1]; if (l && l[0] === p) l[1]++; else g.push([p, 1]); } return g.map(([p, k]) => (k > 1 ? `${p}^${k}` : p)).join(' × '); };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/primes`);
  const inp = page.getByLabel('Numbers', { exact: true });
  const big = () => page.locator('.big-result').evaluateAll((bs) => Object.fromEntries(bs.map((b) => [b.querySelector('.big-label').textContent.trim(), b.querySelector('.big-value').textContent.trim()])));
  const rows = () => page.locator('.kv').first().evaluate((k) => { const s = [...k.children].map((c) => c.textContent.trim()); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; }).catch(() => ({}));
  const notes = async () => (await page.locator('.tool-body .note').allTextContents()).map((s) => s.trim()).join(' | ');
  await page.locator('.big-value').first().waitFor();
  { const b = await big(), r = await rows();
    ok(b['GCD / HCF'] === '1' && b.LCM === '360360' && r['360'] === '2^3 × 3^2 × 5  ·  next prime 367' && r['84'] === '2^2 × 3 × 7  ·  next prime 89' && r['1001'] === '7 × 11 × 13  ·  next prime 1009', `360, 84, 1001: GCD 1, LCM 360360, each taken apart (${JSON.stringify(b)}, ${JSON.stringify(r)})`); }
  await hookClipboard(page); await page.locator('.big-result').nth(1).click();
  ok((await copied(page))[0] === '360360', 'a click copies the LCM — the two tiles could not be copied');

  // ---- numbers of the reference, ten at a time
  let bad = [];
  const sample = ref.numbers.filter((_, i) => i % 3 === 0);
  for (let i = 0; i < sample.length; i += 10) {
    const chunk = sample.slice(i, i + 10); await inp.fill(chunk.map((r) => r[0]).join(', '));
    const r = await rows();
    for (const [n, factors, isPrime, next] of chunk) {
      const after = `next prime ${next ?? 'above 2⁶⁴ (out of range)'}`, want = n === '1' ? `1 (neither prime nor composite)  ·  ${after}` : isPrime ? `Prime ✓  ·  ${after}` : `${group(factors)}  ·  ${after}`;
      if (r[n] !== want) bad.push(`${n}: "${r[n]}", not "${want}"`);
    }
  }
  ok(sample.length === 140 && !bad.length, `${sample.length} numbers of the reference up to 2⁶⁴ − 1: prime or its factors, and the next prime — also after a prime (it was shown for composite numbers only) ${bad.slice(0, 3).join(' | ')}`);
  bad = [];
  for (const [ns, gcd, lcm] of ref.lists.filter((_, i) => i % 4 === 0)) { await inp.fill(ns.join(' ')); const b = await big(); if (b['GCD / HCF'] !== gcd || b.LCM !== lcm) bad.push(`${ns}: ${JSON.stringify(b)}, not ${gcd} / ${lcm}`); }
  ok(!bad.length, `31 lists of the reference: GCD and LCM, the LCM also beyond 64 bits ${bad.slice(0, 2).join(' | ')}`);

  // ---- known numbers
  await inp.fill('48 180 72'); { const b = await big(); ok(b['GCD / HCF'] === '12' && b.LCM === '720', 'GCD(48, 180, 72) = 12, LCM = 720'); }
  await inp.fill('97'); ok((await rows())['97'] === 'Prime ✓  ·  next prime 101' && !(await page.locator('.big-result').count()), 'one number: 97 is prime, 101 follows; no GCD / LCM');
  await inp.fill('2'); ok((await rows())['2'] === 'Prime ✓  ·  next prime 3', '2 is prime');
  await inp.fill('18446744073709551615'); ok((await rows())['18446744073709551615'] === '3 × 5 × 17 × 257 × 641 × 65537 × 6700417  ·  next prime above 2⁶⁴ (out of range)', '2⁶⁴ − 1 taken apart');
  await inp.fill('9223372036854775808'); ok((await rows())['9223372036854775808'] === '2^63  ·  next prime 9223372036854775837', '2⁶³: the next prime is 2⁶³ + 29');
  for (const c of [561, 41041, 3215031751]) { await inp.fill(String(c)); ok(!/Prime ✓/.test((await rows())[String(c)]) && / × /.test((await rows())[String(c)]), `the Carmichael number ${c} is not prime (${(await rows())[String(c)]})`); }
  await inp.fill(String(1000000007n * 998244353n)); ok(((await rows())[String(1000000007n * 998244353n)] || '').startsWith('998244353 × 1000000007'), 'a product of two primes of 30 bits is taken apart');
  await inp.fill('2147483647 2305843009213693951'); { const r = await rows(); ok(/^Prime ✓/.test(r['2147483647']) && /^Prime ✓/.test(r['2305843009213693951']), 'the Mersenne primes 2³¹ − 1 and 2⁶¹ − 1'); }
  await inp.fill('9223372036854775807, 10, 4'); ok((await big()).LCM === String((2n ** 63n - 1n) * 20n), `an LCM beyond 64 bits is exact (${(await big()).LCM})`);
  await inp.fill('1_000_003 1000003'); ok((await big())['GCD / HCF'] === '1000003', 'the same number twice: it is its own GCD');
  // ---- what was wrong
  await inp.fill('12 -18 0 12.5 abc 0x10');
  ok(Object.keys(await rows()).join(' ') === '12' && await notes() === 'Left out — whole numbers from 1 up only: -18, 0, 12.5, abc, 0x10', `what is not a whole number from 1 up is named — −18, 0, 12.5 and "abc" vanished without a word, 0x10 was taken as 16 (${await notes()})`);
  await inp.fill('-12');
  ok(/No whole number from 1 up among what was typed\./.test(await notes()) && /Left out — whole numbers from 1 up only: -12/.test(await notes()), `only a negative number: said — the page stayed empty (${await notes()})`);
  await inp.fill('');
  ok(await notes() === 'Type one or more whole numbers — separated by commas or spaces.' && !(await page.locator('.note-warn').count()), 'an empty box: a hint');
  await inp.fill('7 18446744073709551616');
  ok(await notes() === 'Left out — beyond 18,446,744,073,709,551,615 (64 bits): 18446744073709551616' && (await rows())['7'] === 'Prime ✓  ·  next prime 11', `a number beyond 64 bits is left out and named; the others are still worked out — one such number blanked the whole answer (${await notes()})`);
  await inp.fill('18446744073709551557');
  ok((await rows())['18446744073709551557'] === 'Prime ✓  ·  next prime above 2⁶⁴ (out of range)', 'the largest 64-bit prime');
  await inp.fill('1'); ok((await rows())['1'] === '1 (neither prime nor composite)  ·  next prime 2', '1');
  await inp.fill('1_000_000 +7'); ok((await rows())['1000000'] === '2^6 × 5^6  ·  next prime 1000003' && (await rows())['7'] === 'Prime ✓  ·  next prime 11', 'underscores between digits and a plus sign are read');
  await inp.fill(Array.from({ length: 25 }, (_, i) => 100 + i).join(' '));
  ok(Object.keys(await rows()).length === 20 && /^The first 20 of 25 numbers are taken apart here; GCD and LCM are of all of them\.$/.test(await notes()) && (await big()).LCM === String(Array.from({ length: 25 }, (_, i) => BigInt(100 + i)).reduce((a, b) => { const g = (x, y) => (y ? g(y, x % y) : x); return a / g(a, b) * b; })), `25 numbers: twenty are taken apart, and the tab says so — five were dropped without a word (${await notes()})`);
  await inp.fill('600851475143, 4294967291, 18446744030759878681');
  { const r = await rows(); ok(r['600851475143'] === '71 × 839 × 1471 × 6857  ·  next prime 600851475149' && r['18446744030759878681'] === '4294967291^2  ·  next prime 18446744030759878687'.replace('18446744030759878687', ref.numbers.find((x) => x[0] === '18446744030759878681')?.[3] ?? '?'), `a square of a prime near 2³² (${r['18446744030759878681']})`); }
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/primes`); await ph.locator('.big-value').first().waitFor();
  await ph.getByLabel('Numbers', { exact: true }).fill('18446744073709551615 18446744073709551614 18446744073709551613');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: an LCM of 58 digits does not push the page sideways');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
