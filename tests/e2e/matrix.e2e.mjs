// Matrix Calculator (#/matrix): +, −, ×, det, inverse, transpose, rank, trace and powers on exact fractions of what
// was typed — against tests/fixtures/matrix/reference.json (Python's fractions; scripts/make-matrix-reference.py);
// fractions or decimals; large matrices in rounded arithmetic (NumPy); every refusal names the matrix, the row and
// the shapes; copy; phone layout.
import { readFileSync } from 'node:fs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/matrix/reference.json', import.meta.url), 'utf8'));
const grid = (M) => M.map((r) => r.map((v) => v.replace('-', '−')).join('\t')).join('\n');
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/matrix`);
  const A = page.getByLabel('Matrix A (rows on lines)'), B = page.getByLabel('Matrix B'), out = page.locator('.mat-out'), about = page.locator('.mat-about');
  const op = async (name) => { await page.getByRole('button', { name, exact: true }).click(); return (await out.textContent()).trim(); };
  const text = (M) => M.map((r) => r.join(' ')).join('\n');
  const as = (mode) => page.getByRole('radio', { name: mode, exact: true }).click();
  await A.waitFor();

  // ---- the sample
  ok(await op('A × B') === '2\t1\t0\n1\t3\t1\n0\t1\t4' && await about.textContent() === 'A × B (3 × 3)', `A × I = A, and the result says what it is (${await about.textContent()})`);
  ok(await op('det(A)') === '18' && await op('trace(A)') === '9' && await op('rank(A)') === '3', 'det 18, trace 9, rank 3');
  ok(await op('A⁻¹') === '0.611111111111\t−0.222222222222\t0.0555555555556\n−0.222222222222\t0.444444444444\t−0.111111111111\n0.0555555555556\t−0.111111111111\t0.277777777778', `the inverse in decimals (${(await out.textContent()).slice(0, 60)})`);
  await as('Fractions');
  ok((await out.textContent()).trim() === '11/18\t−2/9\t1/18\n−2/9\t4/9\t−1/9\n1/18\t−1/9\t5/18', `… and, at a press, in fractions: 11/18, −2/9, 1/18 … (${(await out.textContent()).slice(0, 40)})`);
  await hookClipboard(page); await page.getByRole('button', { name: 'Copy', exact: true }).click();
  ok((await copied(page))[0] === '11/18\t-2/9\t1/18\n-2/9\t4/9\t-1/9\n1/18\t-1/9\t5/18', 'Copy gives the grid with plain minus signs, ready for a spreadsheet');

  // ---- matrices of the reference, in fractions
  let bad = [], n = 0;
  for (const c of ref.cases.filter((_, i) => i < 16 || i % 6 === 0)) {
    const at = JSON.stringify(c.A).slice(0, 70), sq = c.det !== null; n++;
    await A.fill(text(c.A)); await B.fill(text(c.B));
    if (await op('A + B') !== grid(c.sum) || await op('A − B') !== grid(c.diff)) bad.push(`${at}: A ± B → ${(await out.textContent()).slice(0, 60)}`);
    if (await op('Aᵀ') !== grid(c.T)) bad.push(`${at}: transpose`);
    if (await op('rank(A)') !== String(c.rank)) bad.push(`${at}: rank ${await out.textContent()}, not ${c.rank}`);
    await B.fill(text(c.C));
    if (await op('A × B') !== grid(c.prod)) bad.push(`${at}: A × B → ${(await out.textContent()).slice(0, 60)}, not ${grid(c.prod).slice(0, 60)}`);
    if (!sq) { for (const name of ['det(A)', 'A⁻¹', 'trace(A)', 'Aⁿ']) if (!/^⚠ .* needs a square matrix — A is \d+ × \d+\.$/.test(await op(name))) bad.push(`${at}: ${name} of a matrix that is not square → ${await out.textContent()}`); continue; }
    if (await op('det(A)') !== c.det.replace('-', '−') || await op('trace(A)') !== c.trace.replace('-', '−')) bad.push(`${at}: det / trace ${await out.textContent()}, not ${c.det} / ${c.trace}`);
    const inv = await op('A⁻¹');
    if (c.inv === null ? inv !== '⚠ A has no inverse: its determinant is 0.' : inv !== grid(c.inv)) bad.push(`${at}: inverse → ${inv.slice(0, 80)}`);
    await page.getByLabel('Power n').fill(String(c.p));
    if (await op('Aⁿ') !== grid(c.pow)) bad.push(`${at}: A^${c.p} → ${(await out.textContent()).slice(0, 60)}`);
  }
  ok(n >= 50 && !bad.length, `${n} matrices of the reference — whole numbers, decimals, typed fractions, up to 5 × 5: every operation, as the exact fractions ${bad.slice(0, 3).join(' | ')}`);
  await as('Decimals');

  // ---- what was wrong
  await A.fill('0.1 0.2\n0.3 0.6');
  ok(await op('det(A)') === '0' && await op('A⁻¹') === '⚠ A has no inverse: its determinant is 0.' && await op('rank(A)') === '1', 'a singular matrix typed in decimals: determinant exactly 0, no inverse — and why — rank 1');
  await A.fill('1e-15 0\n0 1e-15');
  ok(await op('det(A)') === '1e-30' && await op('rank(A)') === '2' && await op('A⁻¹') === '1000000000000000\t0\n0\t1000000000000000', `a matrix of 10⁻¹⁵: determinant 10⁻³⁰, rank 2 and an inverse — it was "singular", det 0, rank 0 (${await out.textContent()})`);
  await A.fill('1e-13 2e-13\n3e-13 4e-13');
  ok(await op('Aᵀ') === '1e-13\t3e-13\n2e-13\t4e-13', `small numbers are shown — the result wrote every number under 10⁻¹² as 0 (${await out.textContent()})`);
  await A.fill('1/2 1/3\n1/4 1/5');
  ok(await op('det(A)') === '0.0166666666667' && (await as('Fractions'), (await out.textContent()).trim() === '1/60') && await op('A⁻¹') === '12\t−20\n−15\t30', `fractions can be typed: det of [[½, ⅓], [¼, ⅕]] is 1/60, its inverse [[12, −20], [−15, 30]] (${await out.textContent()})`);
  await as('Decimals');
  for (const [src, label] of [['[1, 2; 3, 4]', 'one line with semicolons and brackets'], ['[1 2]\n[3 4]', 'bracketed rows'], ['1,2\n3,4', 'commas'], ['| 1 2 |\n| 3 4 |', 'bars']]) { await A.fill(src); ok(await op('det(A)') === '−2', `${label}: "${src.replace(/\n/g, '⏎')}" is the matrix [[1, 2], [3, 4]] (${await out.textContent()})`); }
  await A.fill('−3 1\n1 −3');
  ok(await op('det(A)') === '8', `a real minus sign is read — it gave "Each row needs the same number of values" (${await out.textContent()})`);
  await A.fill('1 1\n1 0'); await page.getByLabel('Power n').fill('90'); await as('Fractions');
  ok(await op('Aⁿ') === '4660046610375530309\t2880067194370816120\n2880067194370816120\t1779979416004714189', `the 90th power of [[1, 1], [1, 0]]: Fibonacci numbers to the last digit (${(await out.textContent()).slice(0, 40)})`);
  await as('Decimals');
  // ---- refused, with the reason
  const refused = async (a, b, name, want, label) => { await A.fill(a); if (b !== null) await B.fill(b); const got = await op(name); ok(got === `⚠ ${want}`, `${label} → "${want}" (${got})`); };
  await refused('1 2 3\n4 5 6', '1 2\n3 4', 'A + B', 'To add, both matrices need the same shape — A is 2 × 3 and B is 2 × 2.', 'A + B of different shapes names both (it said "Same size needed.")');
  await refused('1 2 3\n4 5 6', '1 2\n3 4', 'A × B', 'A × B needs as many columns in A as rows in B — A is 2 × 3 and B is 2 × 2.', 'A × B that does not fit');
  await refused('1 2\n3 x', null, 'det(A)', 'Matrix A, row 2: "x" is not a number.', 'a letter in a cell (it said "Each row needs the same number of values.")');
  await refused('1 2\n3 4 5', null, 'det(A)', 'Matrix A: row 2 has 3 numbers and row 1 has 2 — every row needs the same count.', 'a row too long');
  await refused('', null, 'det(A)', 'Matrix A is empty.', 'an empty box');
  await refused('1 2\n3 4', '', 'A + B', 'Matrix B is empty.', 'an empty second box');
  await refused('1 2 3\n4 5 6', null, 'det(A)', 'The determinant needs a square matrix — A is 2 × 3.', 'the determinant of a 2 × 3 matrix');
  await A.fill('2 0\n0 2');
  for (const [nv, label] of [['2.5', '2.5 (it was cut to 2)'], ['-1', '−1'], ['1001', '1001'], ['', 'an empty box']]) { await page.getByLabel('Power n').fill(nv); ok(await op('Aⁿ') === '⚠ n: a whole number from 0 to 1000.', `power ${label} is refused`); }
  await page.getByLabel('Power n').fill('1000');
  ok(/^1\.071508607e301\t0\n0\t1\.071508607e301$/.test(await op('Aⁿ')) && await about.textContent() === 'A^1000 (2 × 2)', `(2I)¹⁰⁰⁰ (${(await out.textContent()).slice(0, 30)})`);

  // ---- a large matrix: rounded arithmetic, and said
  { const g = ref.big[0], nn = g.A.length; await A.fill(g.A.map((r) => r.join(' ')).join('\n')); await B.fill(g.B.map((r) => r.join(' ')).join('\n'));
    const det = Number((await op('det(A)')).replace('−', '-')), note = await about.textContent();
    ok(Math.sign(det) === g.sign && Math.abs(Math.log(Math.abs(det)) - g.logdet) < 1e-8 && note === 'det(A) — in rounded arithmetic (double precision): the matrix is too large for exact fractions', `a ${nn} × ${nn} matrix: the determinant as NumPy has it, and the tab says that it rounded (${det}; ${note})`);
    const inv = (await op('A⁻¹')).split('\n').map((r) => r.split('\t').map((v) => Number(v.replace('−', '-'))));
    ok(inv.length === nn && inv.every((r, i) => r.every((v, j) => Math.abs(v - g.inv[i][j]) <= 1e-9 * Math.max(1, Math.abs(g.inv[i][j])))) && await op('rank(A)') === String(g.rank), 'its inverse and rank too');
    const sing = ref.big[3]; await A.fill(sing.A.map((r) => r.join(' ')).join('\n'));
    ok(await op('rank(A)') === String(sing.rank) && await op('A⁻¹') === '⚠ A has no inverse (in rounded arithmetic its determinant is 0).', `a singular 30 × 30: rank ${sing.rank}, no inverse`); }
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/matrix`); await ph.getByLabel('Matrix A (rows on lines)').waitFor();
  await ph.getByRole('button', { name: 'A⁻¹', exact: true }).click();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && (await ph.locator('.mat-out').textContent()).includes('0.611111111111'), 'phone: the inverse is worked out, no horizontal scroll of the page');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .btn, .tool-body .seg-btn')].every((e) => e.getBoundingClientRect().height >= 40)), 'phone: buttons are touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
