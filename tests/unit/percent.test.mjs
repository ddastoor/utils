// Percentage: the six questions (src/lib/percent.ts) against exact fractions of the typed numbers
// (tests/fixtures/finance/reference.json, Python's fractions — scripts/make-finance-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, root }) => {
  const { percent, pctAnswer } = await load('/src/lib/percent.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/finance/reference.json'), 'utf8'));
  const OPS = ref.percent_ops;
  t.eq(OPS.join(), 'of,share,change,up,down,whole', 'the six questions');
  const ulp = (x) => { const b = new Float64Array([Math.abs(x)]), i = new BigInt64Array(b.buffer); i[0] += 1n; return b[0] - Math.abs(x); };

  // ---- 841 pairs × 6 questions: the nearest double to the exact answer wherever the decimals fit in whole numbers
  let n = 0, same = 0, close = 0, bad = [];
  for (const [a, b, ...want] of ref.percent) {
    OPS.forEach((op, k) => {
      const r = percent(op, Number(a), Number(b)), w = want[k]; n++;
      if (w === null) { if (!('why' in r) || !r.why) bad.push(`${op}(${a}, ${b}): no answer exists, got ${JSON.stringify(r)}`); return; }
      if ('why' in r) { bad.push(`${op}(${a}, ${b}): refused (${r.why}), the answer is ${w}`); return; }
      if (Object.is(r.value, -0)) bad.push(`${op}(${a}, ${b}): −0`);
      if (r.value === w) same++; else if (Math.abs(r.value - w) <= 2 * ulp(w)) close++; else bad.push(`${op}(${a}, ${b}) = ${r.value}, exact ${w}`);
    });
  }
  t.ok(n === 841 * 6 && !bad.length, `${n} answers: ${same} are the nearest double to the exact fraction, ${close} within two units of the last digit (numbers too large for whole-number arithmetic) ${bad.slice(0, 4).join(' | ')}`);
  t.ok(same > n * 0.9 && close < n * 0.06, `nearly all are exact (${same} / ${close})`);

  // ---- the cases the tab got wrong
  const show = (op, a, b) => pctAnswer(op, a, b);
  t.eq(show('of', 0.0001, 0.001).text, '1 × 10⁻⁹', '0.0001 % of 0.001 is a thousand-millionth (it was shown as 0)');
  t.eq(show('share', 1, 3e9).text, '3.333333333 × 10⁻⁸%', '1 as a percentage of 3,000,000,000 (it was shown as 0%)');
  t.eq(show('whole', 1e-9, 50).text, '2 × 10⁻⁹', '10⁻⁹ is 50 % of 2 × 10⁻⁹ (it was shown as 0)');
  t.eq(show('change', -50, -25).text, '+50%', 'from −50 to −25 is a rise of 50 % of 50 (it was shown as "+-50%")');
  t.eq(show('change', -50, 50).text, '+200%', 'from −50 to 50: +200 % (it was "+-200%")');
  t.eq(show('change', -25, -50).text, '−100%', 'from −25 to −50: −100 %');
  t.eq(show('change', 50, 50).text, '0%', 'no change is 0 %, without a sign (it was "+0%")');
  t.eq(show('change', 100, 99.9999999).text, '−1 × 10⁻⁷%', 'a fall of a ten-millionth of a percent (it was "-0%")');
  t.eq(show('change', 99.9999999, 100).text, '+1.000000001 × 10⁻⁷%', 'the difference of two decimals is taken exactly (the doubles give 1.000000083 × 10⁻⁷)');
  t.eq(show('of', 0, -5).text, '0', '0 % of −5 is 0 (it was "-0")');
  t.eq(show('of', 33.3333333, 3).text, '0.999999999', '33.3333333 % of 3 (six decimals had made it 1)');
  t.eq(show('share', 1, 3).text, '33.33333333%', 'a third: ten digits');
  t.eq(show('of', 1e10, 1e15).text, '1 × 10²³', 'large answers as a power of ten');
  t.eq(show('down', 1999, 30).text, '1,399.3', '30 % off 1,999');
  t.eq(show('down', 1999, 30).plain, '1399.3', '… copied without the comma');
  t.eq(show('change', 80, 100).plain, '25%', 'a copied percentage keeps its sign of percent');
  t.eq(show('change', 100, 80).text, '−20%', 'a fall is written with a minus sign');
  t.eq(show('change', 100, 80).plain, '-20%', '… and copied with the keyboard\'s');
  // ---- decimals that binary fractions spoil
  for (const [op, a, b, want] of [['of', 7, 100, 7], ['of', 0.07, 100, 0.07], ['of', 1.1, 1.1, 0.0121], ['of', 12.5, 80, 10], ['up', 0.1, 0.2, 0.1002], ['up', 500, 18, 590], ['up', 1.1, 10, 1.21], ['down', 100, 100, 0], ['down', 100, 150, -50],
    ['share', 45, 60, 75], ['share', 0.1, 0.3, 100 / 3], ['share', 0.07, 0.7, 10], ['whole', 30, 20, 150], ['whole', 0.3, 0.1, 300], ['change', 80, 100, 25], ['change', 0.1, 0.3, 200], ['change', 1.1, 1.21, 10], ['up', 0.07, 0.07, 0.070049], ['of', 99.99, 99.99, 99.980001]])
    t.eq(percent(op, a, b).value, want, `${op}(${a}, ${b}) is exactly ${want}`);

  // ---- no answer, with the reason
  t.eq(show('share', 5, 0).why, 'B is 0 — no number is a percentage of zero.', '5 as a percentage of 0');
  t.eq(show('share', 0, 0).why, 'B is 0 — nothing is a percentage of zero.', '0 as a percentage of 0');
  t.eq(show('change', 0, 10).why, 'A is 0 — a change from zero has no percentage.', 'a change from 0');
  t.eq(show('change', 0, 0).why, 'From 0 to 0 nothing changes — and from 0 there is no percentage.', 'from 0 to 0');
  t.eq(show('whole', 30, 0).why, 'B is 0 — 0 % of a number is never 30.', '30 is 0 % of nothing');
  t.eq(show('whole', 0, 0).why, 'B is 0 — 0 % of every number is 0, so the whole can be anything.', '0 is 0 % of anything');
  for (const [op, a, b] of [['share', 5, 0], ['change', 0, 10], ['whole', 30, 0]]) { const r = show(op, a, b); t.ok(r.text === '—' && r.plain === '', `${op}(${a}, ${b}): a dash, nothing to copy`); }
  t.eq(show('of', 1e200, 1e200).why, 'The result is too large.', '10²⁰⁰ % of 10²⁰⁰');
  // ---- nothing typed
  for (const [a, b] of [[NaN, 5], [5, NaN], [NaN, NaN], [Infinity, 5]]) { const r = show('of', a, b); t.ok(r.text === '—' && !r.why && !r.plain, `of(${a}, ${b}): a dash without a reason`); }
  // ---- numbers written with an exponent, and numbers no whole-number arithmetic can hold
  t.eq(percent('of', 1e-9, 1e-9).value, 1e-20, 'numbers written with an exponent');
  t.eq(percent('share', 1e21, 2e21).value, 50, '10²¹ of 2 × 10²¹');
  t.eq(percent('change', 1e21, 2e21).value, 100, '… doubled');
  t.eq(percent('of', 123456789.123, 123456789.123).value, 123456789.123 * 123456789.123 / 100, 'eighteen digits: plain doubles');
  t.eq(percent('of', 5e-324, 50).value, 0, 'the smallest double halves to 0 without an error');
};
