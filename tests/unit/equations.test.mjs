// The Equation Solver: exact fractions on the browser's BigInt (src/lib/exact.ts), the reading of quadratics, cubics
// and linear systems built on them (src/lib/equations.ts) and mathcore's root finders — against
// tests/fixtures/equations/reference.json: Python's fractions and mpmath at 80 digits
// (scripts/make-equations-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore, fmtNum } = await load('/src/wasm/mathcore.ts');
  const X = await load('/src/lib/exact.ts'), E = await load('/src/lib/equations.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/equations/reference.json'), 'utf8'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const ulps = (a, b) => (a === b ? 0 : Math.abs(a - b) / (Math.max(Math.abs(a), Math.abs(b)) * 2 ** -52));
  const same = (got, want, tol = 1) => (want === null ? !Number.isFinite(got) : ulps(got, want) <= tol);
  const est = (a, b, c, d) => m.cubic(a, b, c, d)[0].re;

  // ================================================================== exact fractions
  let bad = [];
  for (const [n, d, v] of ref.fractions) { const got = X.toNumber(X.q(BigInt(n), BigInt(d))); if (got !== v) bad.push(`${n.slice(0, 30)} / ${d.slice(0, 30)}: ${got} ≠ ${v}`); }
  t.ok(ref.fractions.length >= 390 && !bad.length, `${ref.fractions.length} fractions of up to 360 digits: the nearest double, bit for bit — halfway cases, tiny and huge ones ${bad.slice(0, 2).join(' | ')}`);
  bad = [];
  for (const [n, d, exact, v] of ref.roots) {
    const a = X.q(BigInt(n), BigInt(d)), r = X.sqrtExact(a), near = X.toNumber(X.sqrtNear(a));
    if ((r ? `${r.n}/${r.d}` : null) !== exact || ulps(near, v) > 1) bad.push(`√(${n}/${d}): ${r && `${r.n}/${r.d}`} / ${near}, not ${exact} / ${v}`);
  }
  t.ok(ref.roots.length === 200 && !bad.length, `${ref.roots.length} square roots of fractions: the exact root where there is one, else its nearest double ${bad.slice(0, 2).join(' | ')}`);
  for (const [text, n, d] of [['1.21', 121n, 100n], ['-2.2', -11n, 5n], ['.5', 1n, 2n], ['3.', 3n, 1n], ['1e-3', 1n, 1000n], ['+4E2', 400n, 1n], ['0', 0n, 1n], ['-0.0', 0n, 1n], ['007', 7n, 1n], [' 2.50 ', 5n, 2n], ['1.5e+1', 15n, 1n]])
    { const v = X.parseDec(text); t.ok(v && v.n === n && v.d === d, `"${text}" is ${n}/${d}`); }
  t.ok(['', ' ', '.', 'e5', '1e', '1.2.3', 'abc', '1,5', '0x10', 'Infinity', 'NaN', '1e99999', '--1', '1 2'].every((s) => X.parseDec(s) === null), 'what is not a decimal number is not read');
  { const a = X.parseDec('0.1'), b = X.parseDec('0.2'); t.ok(X.cmp(X.add(a, b), X.parseDec('0.3')) === 0 && X.fracText(X.div(a, X.parseDec('-0.3'))) === '−1/3' && X.fracText(X.mul(a, X.int(10))) === '1', '0.1 + 0.2 is 0.3 exactly; 0.1 ÷ −0.3 = −1/3'); }
  bad = [];
  for (const v of [0, 1, -1, 0.1, 1 / 3, 1e300, 5e-324, 2 ** 53 + 2, -123.456, 1.7976931348623157e308, 2.2250738585072014e-308, Math.PI]) if (X.toNumber(X.fromNumber(v)) !== v) bad.push(String(v));
  t.ok(!bad.length, `a double is a fraction too, and comes back as itself ${bad.join(' ')}`);
  t.eq([0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, 10n ** 40n, 10n ** 40n - 1n].map((n) => String(X.isqrt(n))).join(' '), '0 1 1 1 2 3 4 4 100000000000000000000 99999999999999999999', 'whole square roots');
  t.eq(['0.25', '-7', '1e-5', '2.5e3', '0.1'].map((s) => E.exactText(X.parseDec(s))).join(' ') + ' ' + E.exactText(X.q(1n, 3n)) + ' ' + E.exactText(X.q(-22n, 7n)), '0.25 −7 0.00001 2500 0.1 1/3 −22/7', 'a fraction is written as a decimal where it is one');

  // ================================================================== quadratics
  bad = []; const kinds = {};
  for (const [a, b, c, kind, r, vx, vy] of ref.quadratics) {
    const q = E.quadratic(a, b, c), at = `${a}x² + ${b}x + ${c}`; kinds[kind] = (kinds[kind] || 0) + 1;
    if (q.kind !== kind) { bad.push(`${at}: ${q.kind}, not ${kind}`); continue; }
    const got = [q.roots[0].re, q.roots[0].im, q.roots[1].re, q.roots[1].im];
    if (!got.every((g, i) => same(g, r[i], 2)) || !same(q.vertex[0], vx) || !same(q.vertex[1], vy)) bad.push(`${at}: ${got} / ${q.vertex}, not ${r} / ${vx}, ${vy}`);
    if (kind !== 'complex' && !(q.roots[0].re <= q.roots[1].re)) bad.push(`${at}: roots not ascending`);
  }
  t.ok(ref.quadratics.length === 400 && !bad.length, `${ref.quadratics.length} quadratics (${JSON.stringify(kinds)}): the kind of the answer by the exact discriminant — a square such as (x − 1.1)² has one root — and every root and the vertex within 2 steps of a double of the true value, from 10⁻³²⁰ to 10²⁰⁰ ${bad.slice(0, 3).join(' | ')}`);
  const qshow = (a, b, c) => { const q = E.quadratic(a, b, c); return `${q.kind}: ${q.roots.map((z) => E.complexText(z, fmtNum) + (z.exact ? ` [${z.exact}]` : '')).join(', ')}; D = ${q.disc}`; };
  t.eq(qshow('1', '-3', '2'), 'two: 1, 2; D = 1', 'x² − 3x + 2');
  t.eq(qshow('1', '-2.2', '1.21'), 'double: 1.1 [11/10], 1.1 [11/10]; D = 0', '(x − 1.1)²: one root — the tab showed 1.1000000149 and 1.0999999851');
  t.eq(qshow('6', '-5', '1'), 'two: 0.333333333333 [1/3], 0.5 [1/2]; D = 1', '6x² − 5x + 1: the fractions 1/3 and 1/2');
  t.eq(qshow('1', '2', '5'), 'complex: −1 + 2i, −1 − 2i; D = −16', 'x² + 2x + 5');
  t.eq(qshow('1', '0', '1'), 'complex: i, −i; D = −4', 'x² + 1: i and −i');
  t.eq(qshow('1', '0', '-2'), 'two: -1.41421356237, 1.41421356237; D = 8'.replace('-1.4', '−1.4'), 'x² − 2');
  t.eq(qshow('1e200', '1e200', '1e200'), 'complex: −0.5 + 0.866025403784i, −0.5 − 0.866025403784i; D = −3' + '0'.repeat(400), 'coefficients of 10²⁰⁰ — the tab showed "−0.5 + Errori"');
  t.eq(qshow('1', '1e160', '1').split(';')[0], 'two: −1e160, −1e-160', 'x² + 10¹⁶⁰x + 1 — the tab showed 0 and "Error"');
  t.eq(qshow('1', '-1e8', '1').split(';')[0], 'two: 1e-8, 100000000', 'the small root without cancellation');
  for (const [args, reason] of [[['0', '2', '-4'], 'a is 0, so this is not a quadratic: bx + c = 0 has the one solution x = 2.'], [['0', '0', '5'], 'a and b are both 0 — there is no x left in the equation.'], [['0', '3', '1'], 'a is 0, so this is not a quadratic: bx + c = 0 has the one solution x = −1/3.'],
    [['', '2', '1'], 'Coefficient a is empty — use 0 for a term that is missing.'], [['1', 'two', '1'], 'Coefficient b: "two" is not a number.'], [['1', '2', '1,5'], 'Coefficient c: "1,5" is not a number.']])
    t.eq(why(() => E.quadratic(...args)), reason, `quadratic(${args.map((x) => `"${x}"`)}) is refused`);

  // ================================================================== cubics
  bad = []; const ck = {};
  for (const [a, b, c, d, kind, r] of ref.cubics) {
    const q = E.cubic(a, b, c, d, est), at = `${a}x³ + ${b}x² + ${c}x + ${d}`; ck[kind] = (ck[kind] || 0) + 1;
    if (q.kind !== kind) { bad.push(`${at}: ${q.kind}, not ${kind}`); continue; }
    // repeated roots are exact; simple ones within a few steps of a double (the two that share the left-over quadratic a little more when they lie close)
    const scale = Math.max(...r.map(([re, im]) => Math.hypot(re, im))), tol = kind === 'triple' || kind === 'double' ? 1 : 16;
    q.roots.forEach((z, i) => { if (!(ulps(z.re, r[i][0]) <= tol || Math.abs(z.re - r[i][0]) <= 1e-13 * scale) || !(ulps(z.im, r[i][1]) <= tol || Math.abs(z.im - r[i][1]) <= 1e-13 * scale)) bad.push(`${at}: root ${i + 1} = ${z.re} ${z.im}, not ${r[i]}`); });
  }
  t.ok(ref.cubics.length === 300 && !bad.length, `${ref.cubics.length} cubics (${JSON.stringify(ck)}): the kind by the exact discriminant; repeated roots exact, the others to 13 digits and better — roots a millionth apart, of 10⁻⁸ beside 10⁸, complex pairs ${bad.slice(0, 3).join(' | ')}`);
  const cshow = (...co) => { const q = E.cubic(...co, est); return `${q.kind}: ${q.roots.map((z) => E.complexText(z, fmtNum)).join(', ')}`; };
  t.eq(cshow('1', '-6', '11', '-6'), 'three: 1, 2, 3', 'x³ − 6x² + 11x − 6');
  t.eq(cshow('1', '-3.3', '3.63', '-1.331'), 'triple: 1.1, 1.1, 1.1', '(x − 1.1)³');
  t.eq(cshow('1', '-0.3', '0.03', '-0.001'), 'triple: 0.1, 0.1, 0.1', '(x − 0.1)³ — the tab showed 0.100001201554, 0.0999993992228, 0.0999993992228');
  t.eq(cshow('1', '-1000002', '2000001', '-1000000'), 'double: 1, 1, 1000000', '(x − 1)²(x − 10⁶) — the tab showed 1 ± 0.00278966872477i');
  t.eq(cshow('1', '1e8', '1', '1'), 'complex: −100000000, −4.99999995e-9 + 0.000099999999875i, −4.99999995e-9 − 0.000099999999875i', 'x³ + 10⁸x² + x + 1 — the tab showed two real roots of 3.7 × 10⁻⁹');
  t.eq(cshow('1', '0', '0', '-1'), 'complex: 1, −0.5 + 0.866025403784i, −0.5 − 0.866025403784i', 'x³ = 1');
  t.eq(cshow('1', '0', '0', '0'), 'triple: 0, 0, 0', 'x³ = 0');
  t.eq(cshow('2', '0', '-3', '1'), 'double: −1.36602540378, 0.366025403784, 1'.replace('double', 'three'), '2x³ − 3x + 1 = (x − 1)(2x² + 2x − 1)');
  for (const [args, reason] of [[['0', '1', '2', '3'], 'a is 0, so this is not a cubic — the Quadratic tab solves bx² + cx + d = 0.'], [['1', '', '2', '3'], 'Coefficient b is empty — use 0 for a term that is missing.'], [['1', '2', '3', 'x'], 'Coefficient d: "x" is not a number.']])
    t.eq(why(() => E.cubic(...args, est)), reason, `cubic(${args.map((x) => `"${x}"`)}) is refused`);
  // the engine alone, in double precision (what the exact layer starts from)
  bad = [];
  for (const [a, b, c, d, kind, r] of ref.cubics) {
    if (kind === 'triple' || kind === 'double') continue;
    const x = est(+a, +b, +c, +d), nearest = Math.min(...r.filter(([, im]) => im === 0).map(([re]) => Math.abs(re - x) / Math.max(1e-300, Math.abs(re))));
    if (!(nearest < 1e-6)) bad.push(`${a} ${b} ${c} ${d}: ${x} is no real root (${JSON.stringify(r)})`);
  }
  t.ok(!bad.length, `mathcore's cubic (Kahan's iteration): its real root is a real root for every cubic of the reference with distinct roots ${bad.slice(0, 2).join(' | ')}`);
  { const z = m.cubic(1, -1000002, 2000001, -1000000); t.ok(z.every((w) => w.im === 0) && z.map((w) => Math.round(w.re)).sort((p, q) => p - q).join(' ') === '1 1 1000000', '… and (x − 1)²(x − 10⁶) has three real roots in double precision too'); }
  { const z = m.quadratic(1e200, 1e200, 1e200); t.ok(z[0].re === -0.5 && Math.abs(z[0].im - Math.sqrt(3) / 2) < 1e-15, 'mathcore\'s quadratic scales its coefficients: no overflow at 10²⁰⁰'); }

  // ================================================================== linear systems
  bad = []; const lk = {};
  for (const [rows, kind, xs, extra] of ref.linears) {
    const s = E.linear(rows), at = JSON.stringify(rows).slice(0, 120); lk[kind] = (lk[kind] || 0) + 1;
    if (s.kind !== kind) { bad.push(`${at}: ${s.kind}, not ${kind}`); continue; }
    if (kind === 'many' && s.rank !== extra) bad.push(`${at}: rank ${s.rank}, not ${extra}`);
    if (kind === 'one') s.x.forEach((v, i) => { const frac = extra[i].replace('-', '−'); if (!same(v.re, xs[i]) || (v.exact ?? fmtFrac(v.re)) !== frac) bad.push(`${at}: ${'xyzw'[i]} = ${v.re} [${v.exact}], not ${xs[i]} [${extra[i]}]`); });
  }
  function fmtFrac(x) { return String(BigInt(Math.round(x))).replace('-', '−'); }
  t.ok(ref.linears.length === 300 && !bad.length, `${ref.linears.length} systems of 2 – 4 equations (${JSON.stringify(lk)}): one solution as the exact fractions and their nearest doubles; contradicting equations told from dependent ones, with the rank ${bad.slice(0, 3).join(' | ')}`);
  const lshow = (rows) => { const s = E.linear(rows); return s.kind === 'one' ? s.x.map((v) => fmtNum(v.re) + (v.exact ? ` [${v.exact}]` : '')).join(', ') : s.kind === 'many' ? `many (rank ${s.rank})` : 'none'; };
  t.eq(lshow([['2', '3', '8'], ['1', '-1', '-1']]), '1, 2', '2x + 3y = 8, x − y = −1');
  t.eq(lshow([['0.1', '0.2', '0.3'], ['0.3', '0.6', '0.9']]), 'many (rank 1)', 'the same line twice, in decimals: infinitely many solutions');
  t.eq(lshow([['0.1', '0.2', '0.3'], ['0.3', '0.6', '1']]), 'none', 'parallel lines: no solution — the tab said "No unique solution" for both');
  t.eq(lshow([['1e-20', '2e-20', '5e-20'], ['3e-20', '4e-20', '6e-20']]), '-4, 4.5 [9/2]', 'an ordinary system in units of 10⁻²⁰ — the tab called it unsolvable');
  t.eq(lshow([['1', '1', '2'], ['1', '1.0000000000001', '2.0000000000001']]), '1, 1', 'two nearly equal equations still have their one solution — the tab called it unsolvable');
  t.eq(lshow([['3', '1', '10'], ['1', '3', '10']]), '2.5 [5/2], 2.5 [5/2]', 'fractions beside the decimals');
  t.eq(lshow([['0', '0', '0'], ['0', '0', '0']]), 'many (rank 0)', 'nothing is asked: everything solves it');
  for (const [rows, reason] of [[[['2', '', '8'], ['1', '-1', '-1']], 'Equation 1: the coefficient of y is empty — use 0 for a term that is missing.'], [[['2', '3', '8'], ['1', '-1', '']], 'Equation 2: the right-hand side is empty — use 0 for a term that is missing.'], [[['2', 'three', '8'], ['1', '-1', '-1']], 'Equation 1: "three" is not a number.']])
    t.eq(why(() => E.linear(rows)), reason, 'an empty or unreadable cell is named');

  // ================================================================== equations in x (the engine's search)
  bad = [];
  for (const [src, lo, hi, want] of ref.equations) {
    const ex = m.compile(src), got = ex.roots(lo, hi); ex.free();
    if (got.length !== want.length || got.some((g, i) => Math.abs(g - want[i]) > 1e-9 * Math.max(1, Math.abs(want[i])))) bad.push(`${src} on [${lo}, ${hi}]: ${got}, not ${want}`);
  }
  t.ok(ref.equations.length === 20 && !bad.length, `${ref.equations.length} equations in x: every root in the range to nine digits, none at a pole or a jump ${bad.slice(0, 3).join(' | ')}`);
  // ---- writing complex numbers
  t.eq([[2, 0], [-1, 2], [-1, -2], [0, 2], [0, -2], [0, 1], [0, -1], [1.5, -1], [-0.5, 0.866025403784], [0, 0]].map(([re, im]) => E.complexText({ re, im }, fmtNum)).join(' | '), '2 | −1 + 2i | −1 − 2i | 2i | −2i | i | −i | 1.5 − i | −0.5 + 0.866025403784i | 0', 'complex numbers as they are written — "− 2i" had a stray space, 1i its 1');
};
