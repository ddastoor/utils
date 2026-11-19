// Prime / LCM / GCD: mathcore's 64-bit prime test, factorisation, next prime and gcd against SymPy and Python's math
// (tests/fixtures/primes/reference.json, scripts/make-primes-reference.py), and the reading of the box
// (src/lib/primes.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const P = await load('/src/lib/primes.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/primes/reference.json'), 'utf8'));

  let bad = [], t0 = Date.now(), primes = 0;
  for (const [n, factors, isPrime, next] of ref.numbers) {
    const N = BigInt(n), f = m.factor(N).map(String), np = m.nextPrime(N);
    if (f.join(' ') !== factors.join(' ')) bad.push(`${n}: ${f.join(' × ')}, not ${factors.join(' × ')}`);
    if (m.isPrime(N) !== isPrime) bad.push(`${n}: prime? ${m.isPrime(N)}, not ${isPrime}`);
    if ((np ? String(np) : null) !== next) bad.push(`${n}: next prime ${np}, not ${next}`);
    if (isPrime) primes++;
  }
  const ms = Date.now() - t0;
  t.ok(ref.numbers.length === 420 && primes > 60 && !bad.length && ms < 20000, `${ref.numbers.length} numbers up to 2⁶⁴ − 1 — products of two primes near 2³², prime powers, Carmichael numbers and strong pseudoprimes, the last primes before 2⁶⁴: factors, primality and the next prime as SymPy has them, in ${ms} ms ${bad.slice(0, 3).join(' | ')}`);
  bad = [];
  const MAX = 2n ** 64n - 1n;
  for (const [ns, gcd, lcm] of ref.lists) {
    const N = ns.map(BigInt), g = N.reduce((a, b) => m.gcd(a, b)), l = N.reduce((a, b) => (a / (a > MAX ? m.gcd(b, a % b) : m.gcd(a, b))) * b);
    if (String(g) !== gcd || String(l) !== lcm) bad.push(`${ns}: gcd ${g}, lcm ${l}, not ${gcd}, ${lcm}`);
  }
  t.ok(ref.lists.length >= 100 && !bad.length, `${ref.lists.length} lists of 2 – 6 numbers: GCD and LCM as Python's math has them — the LCM also where it passes 64 bits ${bad.slice(0, 2).join(' | ')}`);
  t.ok(m.isPrime(18446744073709551557n) && !m.isPrime(18446744073709551556n) && m.nextPrime(18446744073709551557n) === 0n && m.factor(1n).length === 0 && !m.isPrime(1n) && m.nextPrime(1n) === 2n, 'the largest 64-bit prime has no successor within 64 bits; 1 has no factors, and 2 follows it');

  // ---- reading the box
  const rd = (s) => { const r = P.readWholeNumbers(s); return `${r.ns.join(' ')} | ${r.skipped.join(' ')} | ${r.tooLarge.join(' ')}`; };
  t.eq(rd('360, 84; 1001\n7\t+5 1_000'), '360 84 1001 7 5 1000 |  | ', 'separators; a plus sign; underscores between digits');
  t.eq(rd('12 -18 0 12.5 abc 1e3 0x10 12abc 007 −5 5_'), '12 7 | -18 0 12.5 abc 1e3 0x10 12abc -5 5_ | ', 'what is not a whole number from 1 up is left out and named — negative numbers, 0, decimals and words vanished without a word, and 0x10 was read as 16');
  t.eq(rd('18446744073709551615 18446744073709551616 99999999999999999999999'), '18446744073709551615 |  | 18446744073709551616 99999999999999999999999', 'beyond 64 bits: named as too large');
  t.eq(rd(''), ' |  | ', 'an empty box');
  t.eq([[2n, 2n, 2n, 3n, 3n, 5n], [7n], [2n, 3n], [], [5n, 5n]].map(P.factorText).join(' ; '), '2^3 × 3^2 × 5 ; 7 ; 2 × 3 ;  ; 5^2', 'factors as they are written');
};
