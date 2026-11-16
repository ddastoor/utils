// Matrix Calculator (#/matrix): +, −, ×, det, inverse (A·A⁻¹ = I), transpose, rank, trace, powers, against an
// independent JS implementation; size/shape errors and a singular matrix reported in the result.
const parse = (t) => t.trim().split('\n').map((r) => r.split('\t').map(Number));
const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, a, k) => s + a * B[k][j], 0)));
function det(M) { const A = M.map((r) => [...r]), n = A.length; let d = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (!A[p][c]) return 0; if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; d = -d; } d *= A[c][c]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; } } return d; }
const near = (A, B, tol = 1e-6) => A.length === B.length && A.every((r, i) => r.length === B[i].length && r.every((x, j) => Math.abs(x - B[i][j]) <= tol * (1 + Math.abs(B[i][j]))));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/matrix`);
  const A = page.getByLabel('Matrix A (rows on lines)'), B = page.getByLabel('Matrix B'), out = page.locator('.mat-out');
  const op = async (name) => { await page.getByRole('button', { name, exact: true }).click(); return (await out.textContent()).trim(); };
  const setM = async (el, M) => el.fill(M.map((r) => r.join(' ')).join('\n'));
  await A.waitFor();
  const a = [[2, 1, 0], [1, 3, 1], [0, 1, 4]], I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  ok(near(parse(await op('A × B')), a), 'default A × I = A');
  ok(await op('det(A)') === '18', 'det(A) = 18');
  const inv = parse(await op('A⁻¹'));
  ok(near(mul(a, inv), I, 1e-7), 'A · A⁻¹ = I');
  ok(await op('trace(A)') === '9' && await op('rank(A)') === '3', 'trace 9, rank 3');
  const M = [[1, 2, -3], [4, 0.5, 6], [-7, 8, 9.25]], N = [[0, 1, 2], [3, -4, 5], [6, 7, -8]];
  await setM(A, M); await setM(B, N);
  ok(near(parse(await op('A + B')), M.map((r, i) => r.map((x, j) => x + N[i][j]))), 'A + B');
  ok(near(parse(await op('A − B')), M.map((r, i) => r.map((x, j) => x - N[i][j]))), 'A − B');
  ok(near(parse(await op('A × B')), mul(M, N)), 'A × B');
  ok(Math.abs(+await op('det(A)') - det(M)) < 1e-6, `det(A) = ${det(M)}`);
  ok(near(mul(M, parse(await op('A⁻¹'))), I, 1e-7), 'A · A⁻¹ = I (non-symmetric)');
  ok(near(parse(await op('Aᵀ')), M[0].map((_, j) => M.map((r) => r[j]))), 'transpose');
  await page.locator('.card input[type=number]').fill('5');
  ok(near(parse(await op('Aⁿ')), mul(M, mul(M, mul(M, mul(M, M))))), 'A⁵');
  await page.locator('.card input[type=number]').fill('0');
  ok(near(parse(await op('Aⁿ')), I), 'A⁰ = I');
  const R = [[1, 2, 3, 4], [2, 4, 6, 8], [1, 0, 1, 0]];
  await setM(A, R);
  ok(await op('rank(A)') === '2' && near(parse(await op('Aᵀ')), R[0].map((_, j) => R.map((r) => r[j]))), 'rank of a 3 × 4 matrix with a dependent row = 2; transpose 4 × 3');
  ok(/Needs a square matrix/.test(await op('det(A)')), 'det of a non-square matrix refused');
  await setM(A, [[1, 2], [2, 4]]);
  ok(/singular/.test(await op('A⁻¹')) && await op('det(A)') === '0', 'singular matrix: det 0, no inverse');
  await setM(B, [[1, 2, 3]]);
  ok(/⚠/.test(await op('A × B')) && /⚠/.test(await op('A + B')), 'shape mismatch for × and + reported');
  await A.fill('1 2\n3');
  ok(/same number of values/.test(await op('det(A)')), 'ragged rows refused');
  await setM(A, [[1, 2], [3, 4]]); await page.locator('.card input[type=number]').fill('5000');
  ok(/between 0 and 1000/.test(await op('Aⁿ')), 'power out of range');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/matrix`); await ph.getByLabel('Matrix B').waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
