// Prime / LCM / GCD (#/primes): factorisations with exponents, next prime, primality up to 2⁶⁴ − 1 (the largest
// 64-bit prime, Carmichael numbers, a semiprime of two 10-digit primes), GCD/LCM of several numbers, an exact LCM
// beyond 64 bits, and the 64-bit limit.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/primes`);
  const inp = page.getByLabel('Numbers (one or more)');
  const set = async (s) => { await inp.fill(s); await inp.dispatchEvent('input'); };
  const big = async (l) => ((await page.locator('.big-result').filter({ hasText: l }).count()) ? (await page.locator('.big-result').filter({ hasText: l }).locator('.big-value').textContent()) : null);
  const info = async (n) => page.evaluate((n) => { const s = [...document.querySelectorAll('.kv > *')]; const i = s.findIndex((e) => e.textContent === n); return i >= 0 ? s[i + 1].textContent : null; }, String(n));
  await page.locator('.big-value').first().waitFor();
  ok(await big('GCD') === '1' && await big('LCM') === '360360', 'default 360, 84, 1001: GCD 1, LCM 360360');
  ok(await info(360) === '2^3 × 3^2 × 5  ·  next prime 367' && await info(84) === '2^2 × 3 × 7  ·  next prime 89' && await info(1001) === '7 × 11 × 13  ·  next prime 1009', 'factorisations and next primes');
  await set('48 180 72'); ok(await big('GCD') === '12' && await big('LCM') === '720', 'GCD(48, 180, 72) = 12, LCM = 720');
  await set('97'); ok(await info(97) === 'Prime ✓' && await big('GCD') === null, 'one number: 97 is prime, no GCD/LCM');
  await set('1'); ok(/neither prime nor composite/.test(await info(1)), '1 is neither');
  await set('2'); ok(await info(2) === 'Prime ✓', '2 is prime');
  const P64 = 18446744073709551557n;
  await set(String(P64)); ok(await info(P64) === 'Prime ✓', 'largest 64-bit prime 2⁶⁴ − 59');
  const M = 2n ** 64n - 1n;
  await set(String(M)); ok(await info(M) === '3 × 5 × 17 × 257 × 641 × 65537 × 6700417  ·  next prime above 2⁶⁴ (out of range)', `2⁶⁴ − 1 factorised; next prime out of range (${await info(M)})`);
  await set('9223372036854775808'); ok(await info(9223372036854775808n) === '2^63  ·  next prime 9223372036854775837', `2⁶³: next prime 2⁶³ + 29 (was negative) (${await info(9223372036854775808n)})`);
  for (const c of [561, 41041, 3215031751]) { await set(String(c)); ok(!/Prime ✓/.test(await info(c)), `Carmichael number ${c} is not prime`); }
  const p = 1000000007n, q = 998244353n;
  await set(String(p * q)); ok((await info(p * q)).startsWith('998244353 × 1000000007'), 'semiprime of two big primes factorised (Pollard rho)');
  await set('2147483647 2305843009213693951'); ok(await info(2147483647) === 'Prime ✓' && await info(2305843009213693951n) === 'Prime ✓', 'Mersenne primes 2³¹ − 1 and 2⁶¹ − 1');
  await set('9223372036854775807, 10, 4');
  ok(await big('LCM') === String((2n ** 63n - 1n) * 20n), `LCM beyond 64 bits is exact (${await big('LCM')}), was 0`);
  await set('1_000_003 1000003'); ok(await info(1000003) === 'Prime ✓' && await big('GCD') === '1000003', '_ separators');
  await set('18446744073709551616'); ok(/64-bit/.test(await page.locator('.note-warn').textContent()), 'above 2⁶⁴ − 1 → 64-bit limit message');
  await set('0 -5 abc 12'); ok(await info(12) === '2^2 × 3  ·  next prime 13' && await page.locator('.kv strong').count() === 1, '0, negatives and junk ignored');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/primes`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
