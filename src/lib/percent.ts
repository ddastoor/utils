// The six questions of the Percentage tab. The numbers people type are decimals, and the answers are read to ten
// digits — so the arithmetic is done on the decimals: every number becomes a whole number × a power of ten, the answer
// one whole number divided by another, and that single division is rounded once. "% change from 99.9999999 to 100" is
// 0.0000001000000001 %, not the 0.0000001000000083 % that subtracting the two doubles gives. Where the whole numbers
// outgrow a double (2^53) the plain double arithmetic is used.
import { fmtUnit, plainUnit } from './units';

export type PctOp = 'of' | 'share' | 'change' | 'up' | 'down' | 'whole';

interface Dec { n: number; e: number } // the value is n × 10^e; n a whole number below 2^53 without trailing zeros
function dec(x: number): Dec | null {
  if (!Number.isFinite(x)) return null;
  if (x === 0) return { n: 0, e: 0 };
  const [m, ex = '0'] = String(Math.abs(x)).split('e'), [whole, frac = ''] = m.split('.'); // the number as it is written
  const digits = (whole + frac).replace(/^0+/, ''), cut = digits.replace(/0+$/, ''), n = Number(cut);
  return Number.isSafeInteger(n) ? { n: Math.sign(x) * n, e: Number(ex) - frac.length + (digits.length - cut.length) } : null;
}
/** a product of whole numbers, or null when it outgrows 2^53 */
function mul(...xs: Array<number | null>): number | null { let p = 1; for (const x of xs) { if (x === null) return null; p *= x; if (!Number.isSafeInteger(p)) return null; } return p; }
/** 10^k as a whole number below 2^53 (k = 0 … 15), else null */
const p10 = (k: number) => (k >= 0 && k <= 15 ? 10 ** k : null);
/** N / D × 10^E with one rounding: the power of ten goes into the numerator or the denominator, whichever stays exact
 *  (a power of ten alone is an exact double up to 10^22). null when neither does. */
function ratio(N: number | null, D: number | null, E: number): number | null {
  if (N === null || D === null) return null;
  if (N === 0) return 0;
  if (E >= 0) { const num = mul(N, p10(E)); return num === null ? null : num / D; }
  const den = mul(D, p10(-E)) ?? (Math.abs(D) === 1 && -E <= 22 ? D * 10 ** -E : null);
  return den === null ? null : N / den;
}

/** The answer, or `why` there is none. Empty or infinite input: NaN. */
export function percent(op: PctOp, a: number, b: number): { value: number } | { why: string } {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { value: NaN };
  if (op === 'share' && b === 0) return { why: a === 0 ? 'B is 0 — nothing is a percentage of zero.' : 'B is 0 — no number is a percentage of zero.' };
  if (op === 'change' && a === 0) return { why: b === 0 ? 'From 0 to 0 nothing changes — and from 0 there is no percentage.' : 'A is 0 — a change from zero has no percentage.' };
  if (op === 'whole' && b === 0) return { why: a === 0 ? 'B is 0 — 0 % of every number is 0, so the whole can be anything.' : 'B is 0 — 0 % of a number is never ' + plainUnit(a) + '.' };
  const A = dec(a), B = dec(b);
  let exact: number | null = null;
  if (A && B) {
    if (op === 'of') exact = ratio(mul(A.n, B.n), 1, A.e + B.e - 2);                       // a·b / 100
    else if (op === 'share' || op === 'whole') exact = ratio(A.n, B.n, A.e - B.e + 2);     // a·100 / b
    else if (op === 'change') {                                                            // (b − a)·100 / |a|
      const e = Math.min(A.e, B.e), an = mul(A.n, p10(A.e - e)), bn = mul(B.n, p10(B.e - e));
      exact = an === null || bn === null ? null : ratio(bn - an, Math.abs(an), 2);
    } else {                                                                               // a·(100 ± b) / 100
      const e = Math.min(B.e, 0), hundred = mul(100, p10(-e)), bn = mul(B.n, p10(B.e - e));
      exact = hundred === null || bn === null ? null : ratio(mul(A.n, op === 'up' ? hundred + bn : hundred - bn), 1, A.e + e - 2);
    }
  }
  const plain = op === 'of' ? (a * b) / 100 : op === 'share' || op === 'whole' ? (a * 100) / b : op === 'change' ? ((b - a) * 100) / Math.abs(a) : op === 'up' ? (a * (100 + b)) / 100 : (a * (100 - b)) / 100;
  const value = (exact ?? plain) + 0; // + 0: never −0
  return Number.isFinite(value) ? { value } : { why: 'The result is too large.' };
}

/** What the tab shows for a question: the answer for the eye (ten digits, grouped, − for minus, + before an increase,
 *  % where the answer is a percentage), the same for the clipboard (plain digits), and the reason when there is none. */
export function pctAnswer(op: PctOp, a: number, b: number): { text: string; plain: string; why: string } {
  const r = percent(op, a, b);
  if ('why' in r) return { text: '—', plain: '', why: r.why };
  if (Number.isNaN(r.value)) return { text: '—', plain: '', why: '' };
  const unit = op === 'share' || op === 'change' ? '%' : '';
  return { text: `${op === 'change' && r.value > 0 ? '+' : ''}${fmtUnit(r.value).replace(/-/g, '−')}${unit}`, plain: `${plainUnit(r.value)}${unit}`, why: '' };
}
