// Exact arithmetic on the numbers people type: a decimal such as 1.21 or 2.5e-3 is a fraction of two whole numbers, and
// the browser's BigInt keeps whole numbers of any length. Used where a rounding error changes the kind of the answer:
// (x − 1.1)² = 0 has one root, not two a hair apart; 0.1x + 0.2y = 0.3 and 0.3x + 0.6y = 0.9 are the same line. No DOM.

/** n / d with d > 0 and no common factor */
export interface Q { n: bigint; d: bigint }
const abs = (x: bigint) => (x < 0n ? -x : x);
function gcd(a: bigint, b: bigint): bigint { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; }
export function q(n: bigint, d = 1n): Q {
  if (d === 0n) throw new Error('division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
export const ZERO = q(0n), ONE = q(1n);
/** "1.21", "-2.2", ".5", "3.", "1e-3", "+4E2" → the exact fraction; null for anything else (also an empty box) */
export function parseDec(text: string): Q | null {
  const t = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(text ?? '').trim());
  if (!t || !(t[2] || t[3])) return null;
  const e = Number(t[4] ?? 0) - (t[3]?.length ?? 0);
  if (Math.abs(e) > 5000) return null;
  const n = BigInt((t[2] ?? '') + (t[3] ?? '')) * (t[1] === '-' ? -1n : 1n);
  return e >= 0 ? q(n * 10n ** BigInt(e)) : q(n, 10n ** BigInt(-e));
}
export const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
export const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
export const neg = (a: Q) => ({ n: -a.n, d: a.d });
export const int = (k: number | bigint) => q(BigInt(k));
export const sign = (a: Q) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
export const isZero = (a: Q) => a.n === 0n;
export const cmp = (a: Q, b: Q) => sign(sub(a, b));
const bits = (x: bigint) => abs(x).toString(2).length;
/** a double is a fraction too: the exact value of x */
export function fromNumber(x: number): Q {
  if (!Number.isFinite(x)) throw new Error('not a number');
  let e = 0, m = x;
  while (!Number.isInteger(m)) { m *= 2; e++; } // exact: doubling a double loses nothing
  return q(BigInt(m), 2n ** BigInt(e));
}
/** the double nearest to n / d (one rounding; ±Infinity beyond the range of a double) */
export function toNumber(a: Q): number {
  if (a.n === 0n) return 0;
  const s = BigInt(Math.max(0, 66 - (bits(a.n) - bits(a.d)))), num = abs(a.n) << s;
  let quot = num / a.d;
  if (num % a.d) quot |= 1n; // a sticky bit: what the division left over still counts in the rounding
  const drop = bits(quot) - 64; // 64 bits and the sticky bit round as the whole number would
  if (drop > 0) quot = (quot >> BigInt(drop)) | (quot & ((1n << BigInt(drop)) - 1n) ? 1n : 0n);
  let v = Number(quot), e = Math.max(0, drop) - Number(s);
  while (e > 1000) { v *= 2 ** 1000; e -= 1000; }
  while (e < -1000) { v *= 2 ** -1000; e += 1000; }
  v *= 2 ** e;
  return a.n < 0n ? -v : v;
}
/** floor of the square root of a whole number ≥ 0 */
export function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((bits(n) + 1) >> 1);
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}
/** the square root of a fraction ≥ 0 when it is itself a fraction (9/4 → 3/2), else null */
export function sqrtExact(a: Q): Q | null {
  if (a.n < 0n) return null;
  const rn = isqrt(a.n), rd = isqrt(a.d);
  return rn * rn === a.n && rd * rd === a.d ? q(rn, rd) : null;
}
/** the square root of a fraction ≥ 0 as a fraction, good to `extra` bits beyond those of a double */
export function sqrtNear(a: Q, extra = 128): Q {
  if (a.n <= 0n) return ZERO;
  const k = BigInt(Math.max(0, extra + 64 - ((bits(a.n) + bits(a.d)) >> 1)));
  return q(isqrt((a.n * a.d) << (2n * k)), a.d << k); // √(n/d) = √(n·d) / d
}
/** "7/3", "-1/2", "5" */
export const fracText = (a: Q) => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`).replace('-', '−');
/** a whole polynomial value: coefficients highest power first */
export function horner(c: Q[], x: Q): Q { let v = ZERO; for (const k of c) v = add(mul(v, x), k); return v; }
