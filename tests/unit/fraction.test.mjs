// The Fraction Calculator: mathcore's exact fractions on 128-bit whole numbers (m_frac_eval) and the wording round
// them (src/lib/fractions.ts) against tests/fixtures/fraction/reference.json — expressions built as trees and worked
// out with Python's fractions; decimals with their repeating part by long division
// (scripts/make-fraction-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const FR = await load('/src/lib/fractions.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/fraction/reference.json'), 'utf8'));
  const why = (s) => { try { FR.fractionAnswer(m, s); return ''; } catch (e) { return e.message; } };
  const ans = (s) => { const a = FR.fractionAnswer(m, s); return `${a.fraction} | ${a.mixed} | ${a.decimal}`; };

  // ---- 700 expressions
  let bad = [], kinds = { value: 0, big: 0, zero: 0 };
  for (const [text, n, d] of ref.expressions) {
    if (d === undefined) {
      kinds[n]++; const w = why(text);
      if (w !== (n === 'zero' ? 'A division by zero.' : 'The numbers grow beyond 38 digits — too large to keep exact here.')) bad.push(`${text}: "${w}", expected ${n}`);
      continue;
    }
    kinds.value++;
    let q; try { q = m.fraction(FR.tidyFraction(text)); } catch (e) { bad.push(`${text}: ${e.message}`); continue; }
    if (String(q.n) !== n || String(q.d) !== d) bad.push(`${text}: ${q.n}/${q.d}, not ${n}/${d}`);
  }
  t.ok(ref.expressions.length === 700 && kinds.value > 650 && !bad.length, `${ref.expressions.length} expressions — fractions, mixed numbers, decimals, powers of ten, + − × ÷, whole powers, brackets four deep: numerator and denominator as Python's fractions have them; ${kinds.zero} divisions by zero and ${kinds.big} numbers beyond 38 digits said ${bad.slice(0, 3).join(' | ')}`);
  // ---- 400 decimals
  bad = [];
  for (const [n, d, text] of ref.decimals) { const got = FR.decimalText(BigInt(n), BigInt(d)); if (got !== text) bad.push(`${n}/${d}: ${got}, not ${text}`); }
  t.ok(ref.decimals.length === 400 && !bad.length, `${ref.decimals.length} fractions as decimals: every digit where the decimal ends, the repeating digits in brackets where it does not ${bad.slice(0, 3).join(' | ')}`);
  t.eq([[1n, 3n], [1n, 6n], [1n, 7n], [3n, 8n], [-5n, 2n], [22n, 7n], [1n, 350n], [5n, 1n], [0n, 9n], [-1n, 3n], [1n, 81n], [1n, 97n]].map(([n, d]) => FR.decimalText(n, d)).join(' | '),
    '0.(3) | 0.1(6) | 0.(142857) | 0.375 | −2.5 | 3.(142857) | 0.00(285714) | 5 | 0 | −0.(3) | 0.(012345679) | 0.0103092783505154639175257731958762886597…', 'decimals as they are written — a period longer than 30 digits ends in …');

  // ---- by hand
  t.eq(ans('3/4 + 5/6 × 2 1/2'), '17/6 | 2 5/6 | 2.8(3)', 'the sample: 17/6 = 2 5/6 = 2.8333…');
  t.eq(ans('-2 1/2'), '−5/2 | −2 1/2 | −2.5', 'a negative mixed number, with a real minus sign');
  t.eq(ans('(1/2)^100'), '1/1267650600228229401496703205376 | 1/1267650600228229401496703205376 | 0.0000000000000000000000000000007888609052…', '(1/2)¹⁰⁰ is 1/2¹⁰⁰ — the tab said "Division by zero"');
  t.eq(ans('9223372036854775807 + 1'), '9223372036854775808 | 9223372036854775808 | 9223372036854775808', 'beyond 64 bits — "Numbers too large" before');
  t.eq(ans('2^126').split(' | ')[0], '85070591730234615865843651857942052864', '2¹²⁶, every digit');
  t.eq(ans('½ + ¼'), '3/4 | 3/4 | 0.75', 'the fraction characters ½ ¼');
  t.eq(ans('2½ × 2'), '5 | 5 | 5', '2½ is two and a half');
  t.eq(ans('4 : 2') + ' ; ' + ans('1 ⁄ 2') + ' ; ' + ans('1∕4'), '2 | 2 | 2 ; 1/2 | 1/2 | 0.5 ; 1/4 | 1/4 | 0.25', 'the ratio colon and the fraction slashes divide');
  t.eq(ans('1e3') + ' ; ' + ans('1.5e-3') + ' ; ' + ans('2E2/4'), '1000 | 1000 | 1000 ; 3/2000 | 3/2000 | 0.0015 ; 50 | 50 | 50', 'powers of ten');
  t.eq(ans('.5 + +1/2'), '1 | 1 | 1', '.5 and a plus sign in front');
  t.eq(ans('1/3 ÷ 2/3') + ' ; ' + ans('2/3^2') + ' ; ' + ans('(2/3)^2') + ' ; ' + ans('2 1/2 ^ 2'), '1/2 | 1/2 | 0.5 ; 2/9 | 2/9 | 0.(2) ; 4/9 | 4/9 | 0.(4) ; 25/4 | 6 1/4 | 6.25', 'what binds to what: a fraction without spaces is one number, a power comes first');
  t.eq(ans('100000000000/3'), '100000000000/3 | 33333333333 1/3 | 33333333333.(3)', 'a large mixed number');
  for (const [src, reason] of [['', 'Type fractions and signs — for example 3/4 + 1 1/2, or 2/3 × 5.'], ['   ', 'Type fractions and signs — for example 3/4 + 1 1/2, or 2/3 × 5.'], ['1/2 +', 'The expression stops too soon — a number is missing at the end.'], ['1//2', 'Could not read "/2".'], ['abc', 'Could not read "abc".'],
    ['1,5', 'Could not read ",5".'], ['2 3', 'Could not read "3".'], ['1 1/2 1/2', 'Could not read "1/2".'], ['(1/2', 'A bracket is not closed.'], ['1/2)', 'A closing bracket has no opening one.'], ['((1/2) + 3', 'A bracket is not closed.'], ['1/0', 'A division by zero.'], ['0^-1', 'A division by zero.'],
    ['2^0.5', 'Only whole-number powers (up to 1,000) keep fractions exact.'], ['2^(1/2)', 'Only whole-number powers (up to 1,000) keep fractions exact.'], ['2^1000', 'The numbers grow beyond 38 digits — too large to keep exact here.'], ['1/3 + x', 'Could not read "x".'], ['3 × × 2', 'Could not read "* 2".'.replace('* 2', '* 2')]])
    t.eq(why(src), reason, `"${src}" is refused with the reason`);
  t.eq(FR.tidyFraction('  1 ½ ×\t2  '), '1 1/2 × 2', 'tidying');
};
