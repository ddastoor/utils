// The Matrix Calculator: exact arithmetic on what was typed (src/lib/matrix.ts on src/lib/exact.ts) and mathcore's
// double-precision routines for large matrices — against tests/fixtures/matrix/reference.json: Python's fractions
// (determinants also by the Leibniz sum, inverses multiplied back) and NumPy (scripts/make-matrix-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore, fmtNum } = await load('/src/wasm/mathcore.ts');
  const X = await load('/src/lib/matrix.ts'), E = await load('/src/lib/exact.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/matrix/reference.json'), 'utf8'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const text = (rows) => rows.map((r) => r.join(' ')).join('\n');
  const frac = (q) => (q.d === 1n ? String(q.n) : `${q.n}/${q.d}`);
  const S = (M) => (M === null ? null : M.map((row) => row.map(frac)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ================================================================== 220 matrices, exactly
  let bad = [], counts = { inv: 0, singular: 0, rect: 0 };
  for (const c of ref.cases) {
    const A = X.readMatrix(text(c.A), 'A'), B = X.readMatrix(text(c.B), 'B'), C = X.readMatrix(text(c.C), 'B'), at = JSON.stringify(c.A).slice(0, 80), sq = c.det !== null;
    if (!same(S(X.addM(A, B, 1)), c.sum) || !same(S(X.addM(A, B, -1)), c.diff)) bad.push(`${at}: A ± B`);
    if (!same(S(X.mulM(A, C)), c.prod)) bad.push(`${at}: A × C`);
    if (!same(S(X.transposeM(A)), c.T)) bad.push(`${at}: transpose`);
    if (X.rankM(A) !== c.rank) bad.push(`${at}: rank ${X.rankM(A)}, not ${c.rank}`);
    if (!sq) { counts.rect++; for (const f of [() => X.detM(A), () => X.inverseM(A), () => X.traceM(A), () => X.powM(A, 2)]) if (!/needs a square matrix — A is \d+ × \d+\.$/.test(why(f))) bad.push(`${at}: a ${A.length} × ${A[0].length} matrix must be refused: "${why(f)}"`); continue; }
    if (frac(X.detM(A)) !== c.det || frac(X.traceM(A)) !== c.trace) bad.push(`${at}: det ${frac(X.detM(A))} / trace ${frac(X.traceM(A))}, not ${c.det} / ${c.trace}`);
    const inv = X.inverseM(A); c.inv === null ? counts.singular++ : counts.inv++;
    if (!same(S(inv), c.inv)) bad.push(`${at}: inverse ${JSON.stringify(S(inv)).slice(0, 80)}, not ${JSON.stringify(c.inv).slice(0, 80)}`);
    if ((c.inv === null) !== (c.det === '0')) bad.push(`${at}: reference disagrees with itself`);
    if (!same(S(X.powM(A, c.p)), c.pow)) bad.push(`${at}: A^${c.p}`);
  }
  t.ok(ref.cases.length === 220 && counts.inv > 100 && counts.singular > 25 && counts.rect > 25 && !bad.length, `${ref.cases.length} matrices up to 5 × 5 of whole numbers, decimals, fractions and powers of ten: sum, difference, product, transpose, trace, determinant, rank, inverse and power as exact fractions (${counts.inv} inverses, ${counts.singular} singular matrices told apart exactly, ${counts.rect} that are not square refused for det, inverse, trace and power) ${bad.slice(0, 3).join(' | ')}`);
  // ---- by hand
  const R = (s) => X.readMatrix(s, 'A'), show = (M, fr = false) => X.matrixText(M, fr, (x) => fmtNum(x, 12)).replace(/\t/g, ' ').replace(/\n/g, ' / ');
  t.eq(frac(X.detM(R('2 1 0\n1 3 1\n0 1 4'))), '18', 'det of the sample is 18');
  t.eq(show(X.inverseM(R('4 7\n2 6'))), '0.6 −0.7 / −0.2 0.4', 'the inverse of [[4, 7], [2, 6]]');
  t.eq(show(X.inverseM(R('2 1 0\n1 3 1\n0 1 4')), true), '11/18 −2/9 1/18 / −2/9 4/9 −1/9 / 1/18 −1/9 5/18', 'the inverse of the sample in fractions');
  t.ok(frac(X.detM(R('0.1 0.2\n0.3 0.6'))) === '0' && X.inverseM(R('0.1 0.2\n0.3 0.6')) === null && X.rankM(R('0.1 0.2\n0.3 0.6')) === 1, 'a singular matrix of decimals: determinant exactly 0, no inverse, rank 1');
  t.ok(frac(X.detM(R('1e-15 0\n0 1e-15'))) === '1/1000000000000000000000000000000' && X.rankM(R('1e-15 0\n0 1e-15')) === 2 && show(X.inverseM(R('1e-15 0\n0 1e-15')), true) === '1000000000000000 0 / 0 1000000000000000', 'a matrix of 10⁻¹⁵: determinant 10⁻³⁰, rank 2, an inverse — it was "singular" with rank 0');
  t.eq(show(X.transposeM(R('1e-13 2e-13\n3e-13 4e-13'))), '1e-13 3e-13 / 2e-13 4e-13', 'small numbers are shown — everything under 10⁻¹² was written as 0');
  t.eq(show(X.powM(R('2 0\n0 2'), 1000)).slice(0, 17), '1.071508607e301 0', '(2I)¹⁰⁰⁰ = 2¹⁰⁰⁰ I (ten digits and an exponent, as everywhere in the app)');
  t.eq(show(X.powM(R('1 1\n1 0'), 90)), '4.66004661e18 2.880067194e18 / 2.880067194e18 1.779979416e18', 'Fibonacci numbers by the 90th power — exact inside, ten digits shown');
  t.eq(frac(X.powM(R('1 1\n1 0'), 90)[0][1]), '2880067194370816120', '… every digit of F(90)');
  t.eq(show(X.powM(R('3 1\n1 3'), 0)), '1 0 / 0 1', 'A⁰ is the identity');
  // ---- reading
  for (const [src, want] of [['1 2\n3 4', '1 2 / 3 4'], ['1, 2\n3, 4', '1 2 / 3 4'], ['1\t2\n3\t4', '1 2 / 3 4'], ['1 2; 3 4', '1 2 / 3 4'], ['[1, 2; 3, 4]', '1 2 / 3 4'], ['[1 2]\n[3 4]', '1 2 / 3 4'], ['((1, 2), (3, 4))'.replace('), (', ')\n('), '1 2 / 3 4'],
    ['| 1 2 |\n| 3 4 |', '1 2 / 3 4'], ['−3 1\n1 –3', '−3 1 / 1 −3'], ['1/2 1/3\n1/4 1/5', '0.5 0.333333333333 / 0.25 0.2'], ['1.5e2 .5\n-0 +7', '150 0.5 / 0 7'], ['\n\n1 2\n\n3 4\n\n', '1 2 / 3 4'], ['5', '5'], ['1 2 3', '1 2 3'], ['1;2;3', '1 / 2 / 3']])
    t.eq(show(R(src)), want, `"${src.replace(/\n/g, '⏎').replace(/\t/g, '⇥')}" is read`);
  for (const [src, reason] of [['', 'Matrix A is empty.'], ['  \n ', 'Matrix A is empty.'], ['[ ]', 'Matrix A is empty.'], ['1 2\n3 x', 'Matrix A, row 2: "x" is not a number.'], ['1 2\n3 4 5', 'Matrix A: row 2 has 3 numbers and row 1 has 2 — every row needs the same count.'],
    ['1 2\n3', 'Matrix A: row 2 has 1 number and row 1 has 2 — every row needs the same count.'], ['1 1/0', 'Matrix A, row 1: "1/0" is not a number (a division by 0).'], ['1 2/3/4', 'Matrix A, row 1: "2/3/4" is not a number.'], ['1 Infinity', 'Matrix A, row 1: "Infinity" is not a number.'],
    [Array.from({ length: 61 }, () => '1').join('\n'), 'Matrix A is 61 × 1 — at most 60 × 60.']])
    t.eq(why(() => R(src)), reason, `"${src.slice(0, 20).replace(/\n/g, '⏎')}" is refused with the reason`);
  // ---- shapes
  const A23 = R('1 2 3\n4 5 6'), B22 = X.readMatrix('1 2\n3 4', 'B');
  t.eq(why(() => X.addM(A23, B22, 1)), 'To add, both matrices need the same shape — A is 2 × 3 and B is 2 × 2.', 'A + B with different shapes names both ("Same size needed.")');
  t.eq(why(() => X.addM(A23, B22, -1)), 'To subtract, both matrices need the same shape — A is 2 × 3 and B is 2 × 2.', 'A − B');
  t.eq(why(() => X.mulM(A23, B22)), 'A × B needs as many columns in A as rows in B — A is 2 × 3 and B is 2 × 2.', 'A × B');
  t.eq(show(X.mulM(B22, A23)), '9 12 15 / 19 26 33', 'a 2 × 2 times a 2 × 3');
  for (const [s, want] of [['2', 2], ['0', 0], ['1000', 1000], [' 7 ', 7]]) t.eq(X.readPower(s), want, `power "${s}"`);
  for (const s of ['', '-1', '2.5', '1001', 'x', '1e400']) t.eq(why(() => X.readPower(s)), 'n: a whole number from 0 to 1000.', `power "${s}" is refused (2.5 was cut to 2)`);
  t.ok(X.exactOk(R('1 2\n3 4')) && X.exactOk(R('1 2\n3 4'), 1000) && !X.exactOk(Array.from({ length: 25 }, () => Array.from({ length: 25 }, () => E.ONE))) && !X.exactOk(Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => E.ONE)), 500), 'exact up to 400 cells, and powers while the work stays small');

  // ================================================================== large matrices: mathcore in double precision
  bad = [];
  const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  for (const g of ref.big) {
    const n = g.A.length;
    if (m.rank(g.A) !== g.rank) bad.push(`${n} × ${n}: rank ${m.rank(g.A)}, not ${g.rank}`);
    if (g.singular) { if (m.inverse(g.A) !== null) bad.push(`${n} × ${n}: a singular matrix got an inverse`); if (Math.abs(m.det(g.A)) > 1e-3) bad.push(`${n} × ${n}: det ${m.det(g.A)} of a singular matrix`); continue; }
    const det = m.det(g.A); if (Math.sign(det) !== g.sign || !close(Math.log(Math.abs(det)), g.logdet, 1e-10)) bad.push(`${n} × ${n}: det ${det}, not ${g.sign}·e^${g.logdet}`);
    const inv = m.inverse(g.A), prod = m.matmul(g.A, g.B), p3 = m.matpow(g.A, 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!close(inv[i][j], g.inv[i][j], 1e-10) || !close(prod[i][j], g.prod[i][j], 1e-12) || !close(p3[i][j], g.pow3[i][j], 1e-11 * Math.abs(g.pow3[i][j]) + 1e-9)) { bad.push(`${n} × ${n}: entry ${i}, ${j}`); i = n; break; }
  }
  t.ok(ref.big.length === 4 && !bad.length, `matrices of 25 – 40 rows in double precision: determinant, rank, inverse, product and cube as NumPy has them; a singular 30 × 30 has rank 28 and no inverse ${bad.slice(0, 3).join(' | ')}`);
  t.ok(Math.abs(m.det([[1e-15, 0], [0, 1e-15]]) - 1e-30) < 1e-44 && m.rank([[1e-15, 0], [0, 1e-15]]) === 2 && Math.abs(m.inverse([[1e-15, 0], [0, 1e-15]])?.[0][0] - 1e15) < 1, 'the engine measures "nothing" against the size of the entries: 10⁻¹⁵ on the diagonal is not singular');
  t.ok(m.rank([[1, 2], [2, 4]]) === 1 && m.inverse([[1, 2], [2, 4]]) === null && m.det([[1, 2], [2, 4]]) === 0, '… and [[1, 2], [2, 4]] is');
};
