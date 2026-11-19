// The Equation Solver's reading of what was typed. Coefficients are taken as the decimals they are (src/lib/exact.ts),
// so the *kind* of answer is decided exactly — one repeated root or two, real or complex, one solution, none or
// infinitely many — and each number shown is the nearest double to the true value. No DOM.
import { type Q, ZERO, parseDec, add, sub, mul, div, neg, int, sign, isZero, cmp, toNumber, fromNumber, sqrtExact, sqrtNear, fracText, horner } from './exact';

export interface Root { re: number; im: number; /** the root as a fraction, when it is one */ exact?: string }
const real = (x: Q): Root => ({ re: toNumber(x) + 0, im: 0, ...(x.d === 1n ? {} : { exact: fracText(x) }) });
function coef(text: string, name: string): Q {
  const v = parseDec(text);
  if (!v) throw new Error(String(text ?? '').trim() ? `Coefficient ${name}: "${String(text).trim()}" is not a number.` : `Coefficient ${name} is empty — use 0 for a term that is missing.`);
  return v;
}
/** a fraction as a short decimal where it is one (1/4 → 0.25), else as the fraction */
export function exactText(x: Q): string {
  let d = x.d, k = 0;
  while (d % 10n === 0n) { d /= 10n; k++; }
  while (d % 2n === 0n) { d /= 2n; k++; }
  while (d % 5n === 0n) { d /= 5n; k++; }
  if (d !== 1n || k > 20 || String(x.n).length > 25) return x.d === 1n ? fracText(x) : fracText(x);
  const scaled = (x.n * 10n ** BigInt(k)) / x.d, neg = scaled < 0n, digits = String(neg ? -scaled : scaled).padStart(k + 1, '0');
  const text = k ? `${digits.slice(0, -k)}.${digits.slice(-k)}`.replace(/\.?0+$/, '') : digits;
  return (neg ? '−' : '') + text;
}

// ------------------------------------------------------------------ quadratic
export interface Quadratic { kind: 'two' | 'double' | 'complex'; roots: [Root, Root]; /** b² − 4ac, exactly */ disc: string; vertex: [number, number] }
/** ax² + bx + c = 0 from the typed coefficients. Real roots ascending; a complex pair with +i first. */
export function quadratic(aText: string, bText: string, cText: string): Quadratic {
  const a = coef(aText, 'a'), b = coef(bText, 'b'), c = coef(cText, 'c');
  if (isZero(a)) throw new Error(isZero(b) ? 'a and b are both 0 — there is no x left in the equation.' : `a is 0, so this is not a quadratic: bx + c = 0 has the one solution x = ${exactText(div(neg(c), b))}.`);
  const D = sub(mul(b, b), mul(int(4), mul(a, c))), twoA = mul(int(2), a), mid = div(neg(b), twoA);
  const vertex: [number, number] = [toNumber(mid) + 0, toNumber(sub(c, div(mul(b, b), mul(int(4), a)))) + 0], disc = exactText(D);
  if (isZero(D)) return { kind: 'double', roots: [real(mid), real(mid)], disc, vertex };
  if (sign(D) < 0) { const im = toNumber(div(sqrtExact(neg(D)) ?? sqrtNear(neg(D)), twoA.n < 0n ? neg(twoA) : twoA)), re = toNumber(mid) + 0; return { kind: 'complex', roots: [{ re, im }, { re, im: -im }], disc, vertex }; }
  const s = sqrtExact(D);
  let x1: Q, x2: Q;
  if (s) { x1 = div(sub(neg(b), s), twoA); x2 = div(add(neg(b), s), twoA); }
  else { // the root without cancellation first, the other from x1·x2 = c/a
    const S = sqrtNear(D), far = div(sign(b) >= 0 ? sub(neg(b), S) : add(neg(b), S), twoA);
    x1 = far; x2 = isZero(c) ? ZERO : div(c, mul(a, far));
  }
  if (cmp(x1, x2) > 0) [x1, x2] = [x2, x1];
  return { kind: 'two', roots: s ? [real(x1), real(x2)] : [{ re: toNumber(x1) + 0, im: 0 }, { re: toNumber(x2) + 0, im: 0 }], disc, vertex };
}

// ------------------------------------------------------------------ cubic
export interface Cubic { kind: 'three' | 'double' | 'triple' | 'complex'; roots: [Root, Root, Root] }
/** ax³ + bx² + cx + d = 0. `estimate` gives a real root of the double-precision equation (mathcore's m_cubic); it is
 *  brought to the true root by Newton's step on the exact polynomial, and the two other roots come from the exact
 *  quadratic that is left. Real roots ascending, then a complex pair with +i first. */
export function cubic(aText: string, bText: string, cText: string, dText: string, estimate: (a: number, b: number, c: number, d: number) => number): Cubic {
  const a = coef(aText, 'a'), b = coef(bText, 'b'), c = coef(cText, 'c'), d = coef(dText, 'd');
  if (isZero(a)) throw new Error('a is 0, so this is not a cubic — the Quadratic tab solves bx² + cx + d = 0.');
  const I = int, m = mul;
  // the discriminant 18abcd − 4b³d + b²c² − 4ac³ − 27a²d², exactly
  const disc = sub(sub(add(sub(m(I(18), m(m(a, b), m(c, d))), m(I(4), m(m(b, m(b, b)), d))), m(m(b, b), m(c, c))), m(I(4), m(a, m(c, m(c, c))))), m(I(27), m(m(a, a), m(d, d))));
  const sorted = (xs: Q[]) => xs.sort(cmp).map(real) as [Root, Root, Root];
  if (isZero(disc)) {
    const p = sub(m(b, b), m(I(3), m(a, c)));
    if (isZero(p)) { const t = div(neg(b), m(I(3), a)); return { kind: 'triple', roots: sorted([t, t, t]) }; }
    const twice = div(sub(m(I(9), m(a, d)), m(b, c)), m(I(2), p)), once = div(sub(sub(m(I(4), m(a, m(b, c))), m(I(9), m(m(a, a), d))), m(b, m(b, b))), m(a, p));
    return { kind: 'double', roots: sorted([twice, twice, once]) };
  }
  const poly = [a, b, c, d], deriv = [m(I(3), a), m(I(2), b), c];
  /** Newton's step with the polynomial worked out exactly: from a root of the rounded equation to the nearest double
   *  of the true one — and, one exact step further, to a fraction good to twice the digits (`fine`) */
  const polish = (x: number): { r: Q; fine: Q } => {
    let r = fromNumber(Number.isFinite(x) ? x : 0);
    const step = (at: Q) => { const f = horner(poly, at), g = horner(deriv, at); return isZero(f) || isZero(g) ? at : sub(at, div(f, g)); };
    for (let k = 0; k < 6; k++) { const next = fromNumber(toNumber(step(r))); if (cmp(next, r) === 0) break; r = next; }
    return { r, fine: step(r) };
  };
  const first = polish(estimate(toNumber(a), toNumber(b), toNumber(c), toNumber(d))), r = first.fine;
  // the quadratic that is left, x² + Bx + C. From the top: B = b/a + r, C = c/a + r·B; from the bottom, where r is the
  // large root (Kahan): C = −d/(a·r), B = (C − c/a)/r — the way that does not subtract two nearly equal numbers
  const abs = (x: Q) => (sign(x) < 0 ? neg(x) : x), fromBottom = !isZero(r) && !isZero(d) && cmp(abs(m(a, m(r, m(r, r)))), abs(d)) > 0;
  const C = fromBottom ? neg(div(d, m(a, r))) : add(div(c, a), m(r, add(div(b, a), r))), B = fromBottom ? div(sub(C, div(c, a)), r) : add(div(b, a), r);
  const D2 = sub(m(B, B), m(I(4), C)), half = div(neg(B), I(2));
  if (sign(disc) < 0) { // one real root and a complex pair
    const im = toNumber(div(sqrtNear(sign(D2) < 0 ? neg(D2) : ZERO), I(2))), re = toNumber(half) + 0;
    return { kind: 'complex', roots: [{ re: toNumber(first.r) + 0, im: 0 }, { re, im }, { re, im: -im }] };
  }
  const S = sqrtNear(sign(D2) > 0 ? D2 : ZERO), others = [div(sub(neg(B), S), I(2)), div(add(neg(B), S), I(2))].map((x) => polish(toNumber(x)).r);
  const all = [first.r, ...others].sort(cmp);
  return { kind: 'three', roots: all.map((x) => ({ re: toNumber(x) + 0, im: 0 })) as [Root, Root, Root] };
}

// ------------------------------------------------------------------ simultaneous linear equations
export type Linear = { kind: 'one'; x: Root[] } | { kind: 'none' } | { kind: 'many'; rank: number };
/** A·x = b by elimination on fractions: exactly one solution, none (the equations contradict each other), or
 *  infinitely many (they are not independent). `cells[r]` = the n coefficients of row r and its right-hand side. */
export function linear(cells: string[][]): Linear {
  const n = cells.length;
  const M = cells.map((row, r) => row.map((text, c) => {
    const v = parseDec(text);
    if (!v) throw new Error(String(text ?? '').trim() ? `Equation ${r + 1}: "${String(text).trim()}" is not a number.` : `Equation ${r + 1}: ${c === n ? 'the right-hand side' : `the coefficient of ${'xyzw'[c]}`} is empty — use 0 for a term that is missing.`);
    return v;
  }));
  let rank = 0;
  for (let col = 0; col < n && rank < n; col++) {
    const piv = M.findIndex((row, r) => r >= rank && !isZero(row[col]));
    if (piv < 0) continue;
    [M[rank], M[piv]] = [M[piv], M[rank]];
    const p = M[rank][col];
    M[rank] = M[rank].map((v) => div(v, p));
    M.forEach((row, r) => { if (r !== rank && !isZero(row[col])) { const f = row[col]; M[r] = row.map((v, k) => sub(v, mul(f, M[rank][k]))); } });
    rank++;
  }
  if (M.some((row) => row.slice(0, n).every(isZero) && !isZero(row[n]))) return { kind: 'none' };
  if (rank < n) return { kind: 'many', rank };
  return { kind: 'one', x: M.map((row) => real(row[n])) };
}

// ------------------------------------------------------------------ writing a complex number
/** "2", "−1 + 2i", "−2i", "1.5 − i": `num` writes a real number */
export function complexText(z: Root, num: (x: number) => string): string {
  const minus = (s: string) => s.replace(/^-/, '−');
  if (z.im === 0) return minus(num(z.re));
  const im = num(Math.abs(z.im)), i = im === '1' ? 'i' : `${im}i`;
  if (z.re === 0) return (z.im < 0 ? '−' : '') + i;
  return `${minus(num(z.re))} ${z.im < 0 ? '−' : '+'} ${i}`;
}
