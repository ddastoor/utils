// The Fraction Calculator's words: tidying what was typed for the engine (mathcore's m_frac_eval — exact fractions on
// 128-bit whole numbers), and writing the answer: fraction, mixed number, and the decimal with its repeating part in
// brackets. No DOM.
import type { Mathcore } from '../wasm/mathcore';

const VULGAR: Record<string, string> = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅐': '1/7', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅑': '1/9', '⅒': '1/10' };
/** ½ → 1/2 (2½ → 2 1/2), the fraction slashes ⁄ ∕ and the ratio colon → /, odd spaces → a space */
export function tidyFraction(text: string): string {
  return String(text ?? '').replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]/g, (c) => ` ${VULGAR[c]} `).replace(/[⁄∕:]/g, '/').replace(/[   \t]/g, ' ').replace(/\s+/g, ' ').trim();
}
const abs = (x: bigint) => (x < 0n ? -x : x), minus = (s: string) => s.replace(/^-/, '−');

/** The decimal of n/d, exactly: all digits when it ends (3/8 = 0.375), the repeating part in brackets when it does
 *  not (1/6 = 0.1(6), 1/7 = 0.(142857)); with a period longer than `maxPeriod` digits, the first digits and "…". */
export function decimalText(n: bigint, d: bigint, maxPeriod = 30): string {
  const neg = n < 0n !== d < 0n && n !== 0n; n = abs(n); d = abs(d);
  { let x = n, y = d; while (y) [x, y] = [y, x % y]; if (x > 1n) { n /= x; d /= x; } } // in lowest terms: the powers of 2 and 5 that count are those that are left
  const whole = n / d; let rem = n % d;
  if (rem === 0n) return (neg ? '−' : '') + String(whole);
  // the part before the repetition is as long as the larger power of 2 or 5 in the denominator
  let rest = d, twos = 0, fives = 0;
  while (rest % 2n === 0n) { rest /= 2n; twos++; }
  while (rest % 5n === 0n) { rest /= 5n; fives++; }
  const lead = Math.max(twos, fives), digits = (count: number) => { let s = ''; for (let k = 0; k < count; k++) { rem *= 10n; s += String(rem / d); rem %= d; } return s; };
  const head = `${neg ? '−' : ''}${whole}.`;
  if (lead > 60) return `${head}${digits(40)}…`;
  const before = digits(lead);
  if (rest === 1n) return head + before;
  // the period: the smallest k with 10^k ≡ 1 (mod rest)
  let period = 0, p = 1n % rest;
  for (let k = 1; k <= maxPeriod; k++) { p = (p * 10n) % rest; if (p === 1n) { period = k; break; } }
  return period ? `${head}${before}(${digits(period)})` : `${head}${before}${digits(Math.max(20, 40 - lead))}…`;
}

export interface FractionAnswer { fraction: string; mixed: string; decimal: string; n: bigint; d: bigint }
/** Works the expression out. Throws an Error with a sentence for the reader. */
export function fractionAnswer(m: Mathcore, text: string): FractionAnswer {
  const src = tidyFraction(text);
  if (!src) throw new Error('Type fractions and signs — for example 3/4 + 1 1/2, or 2/3 × 5.');
  let q: { n: bigint; d: bigint };
  try { q = m.fraction(src); } catch (e: any) {
    const msg = String(e?.message ?? e), rest = String(e?.rest ?? '');
    if (msg === 'Could not read the expression') throw new Error(rest ? `Could not read "${rest}".` : 'The expression stops too soon — a number is missing at the end.');
    if (msg === 'Numbers too large for exact arithmetic') throw new Error('The numbers grow beyond 38 digits — too large to keep exact here.');
    if (msg === 'Division by zero') throw new Error('A division by zero.');
    if (msg === 'A bracket is not closed') throw new Error('A bracket is not closed.');
    if (msg === 'A closing bracket has no opening one') throw new Error('A closing bracket has no opening one.');
    if (msg === 'Only whole-number powers keep fractions exact') throw new Error('Only whole-number powers (up to 1,000) keep fractions exact.');
    throw new Error(msg);
  }
  const frac = q.d === 1n ? String(q.n) : `${q.n}/${q.d}`, whole = q.n / q.d, rem = abs(q.n) % q.d;
  return { n: q.n, d: q.d, fraction: minus(frac), mixed: minus(q.d === 1n || whole === 0n ? frac : `${whole} ${rem}/${q.d}`), decimal: decimalText(q.n, q.d) };
}
