// Equation Solver (#/equation): any equation in x (roots in a range; identities, poles, too many, other letters),
// quadratics, cubics and simultaneous linear equations solved from the decimals as typed — against
// tests/fixtures/equations/reference.json (Python's fractions and mpmath; scripts/make-equations-reference.py):
// the kind of every answer, each root to the twelve digits shown, fractions beside decimals; every refusal with its
// reason; live answers; phone layout.
import { readFileSync } from 'node:fs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/equations/reference.json', import.meta.url), 'utf8'));
/** equal to the digits the tab shows: twelve, or ten with an exponent for the very large and the very small */
const close = (a, b, tol) => { if (b === null) return !Number.isFinite(a); const t = tol ?? (Math.abs(b) >= 1e15 || (b !== 0 && Math.abs(b) < 1e-9) ? 2e-9 : 2e-11); return Math.abs(a - b) <= t * Math.max(Math.abs(a), Math.abs(b)) || Math.abs(a - b) < 1e-300; };
/** "−1 + 2i", "2i", "−i", "1.5", "1e-8" → [re, im] */
const complex = (text) => {
  const s = text.replace(/−/g, '-').replace(/\s/g, '');
  if (!s.endsWith('i')) return [Number(s), 0];
  const t = /^(.*?)([+-]?)([\d.e+-]*)i$/.exec(s), cut = /^(.*[\d.])([+-])((?:\d|\.)[\d.]*(?:e[+-]?\d+)?)?i$/.exec(s);
  if (cut) return [Number(cut[1]), (cut[2] === '-' ? -1 : 1) * (cut[3] === undefined ? 1 : Number(cut[3]))];
  return [0, (t[1] + t[2] === '-' ? -1 : 1) * (t[3] === '' ? 1 : Number(t[3]))];
};
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/equation`);
  const mode = (m) => page.getByRole('radio', { name: m, exact: true }).click();
  const tiles = () => page.evaluate(() => [...document.querySelectorAll('.big-result')].map((b) => ({ label: b.querySelector('.big-label').textContent.trim(), value: b.querySelector('.big-value').textContent.trim(), sub: b.querySelector('.big-sub')?.textContent.trim() ?? '' })));
  const vals = async () => (await tiles()).map((x) => x.value);
  const warn = async () => (await page.locator('.note-warn').allTextContents()).map((s) => s.trim()).join(' | ');
  const notes = async () => (await page.locator('.card .note').allTextContents()).map((s) => s.trim()).join(' | ');
  const row = (label) => page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent.trim() === l); return i >= 0 ? s[i + 1].textContent.trim() : null; }, label);
  const fieldIn = (l) => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: l }) }).locator('input').first();
  const any = async (eq, lo = -100, hi = 100) => { await fieldIn('Search from').fill(String(lo)); await fieldIn(/^to$/).fill(String(hi)); await fieldIn('Equation in x').fill(eq); return (await vals()).map((v) => Number(v.replace('−', '-'))); };
  await page.locator('.big-value').first().waitFor();

  // ================================================================== any equation
  { const t = await tiles();
    ok(t.map((x) => `${x.label} = ${x.value}`).join(', ') === 'x₁ = −1, x₂ = −0.6180339887, x₃ = 1.618033989' && await page.locator('.card h3, .card .card-title').filter({ hasText: 'Real solutions (3)' }).count() === 1, `the sample is solved as the tab opens — it waited for a press on Solve: x³ − 2x = 1 has −1 and (1 ± √5)/2 (${JSON.stringify(t)})`); }
  await hookClipboard(page); await page.locator('.big-result').nth(2).click();
  ok((await copied(page))[0] === '1.61803398875', `a click copies the root with all twelve digits (${(await copied(page))[0]})`);
  let bad = [];
  for (const [src, lo, hi, want] of ref.equations) { const got = await any(src, lo, hi); if (got.length !== want.length || got.some((g, i) => !close(g, want[i], 2e-9))) bad.push(`${src} on [${lo}, ${hi}]: ${got}, not ${want}`); }
  ok(!bad.length, `${ref.equations.length} equations of the reference: every root in the range, none at a pole (1/x, tan) or a jump (floor) ${bad.slice(0, 2).join(' | ')}`);
  let r = await any('sin(x) = 0.5', 0, 10);
  ok(r.length === 4 && [1, 5, 13, 17].every((k, i) => close(r[i], (k * Math.PI) / 6, 1e-9)), `sin x = ½ on [0, 10] → π/6, 5π/6, 13π/6, 17π/6 (${r})`);
  await page.getByRole('radio', { name: 'Degrees', exact: true }).click(); r = await any('sin(x) = 0.5', 0, 360);
  ok(r.length === 2 && close(r[0], 30, 1e-9) && close(r[1], 150, 1e-9), `in degrees: 30 and 150 (${r})`);
  await page.getByRole('radio', { name: 'Radians', exact: true }).click();
  r = await any('(x - 1/3)^2');
  ok(r.length === 1 && close(r[0], 1 / 3, 1e-6) && (await tiles())[0].label === 'x', `a touching root, (x − ⅓)² = 0 (${r})`);
  r = await any('e^x = 3x');
  ok(r.length === 2 && r.every((x) => Math.abs(Math.exp(x) - 3 * x) < 1e-7), `eˣ = 3x has two roots (${r})`);
  await any('x^2 = -1');
  ok(await warn() === 'No real solution between −100 and 100.'.replace('−', '-'), `x² = −1: no real solution, and the range is named (${await warn()})`);
  await any('tan(x) = 1e9', 1.5, 1.6); ok((await vals()).length <= 1 && await page.evaluate(() => 1) === 1, 'a root a billionth beside a pole: the page does not hang, and nothing is invented');
  // ---- what is not an equation with one answer
  await any('x = x');
  ok(await warn() === 'Both sides are equal for every x that was tried: every x in the range solves it.' && !(await vals()).length, `x = x: every x solves it — the tab listed "50 solutions": −100, −99.99, −99.98 … (${await warn()})`);
  await any('2 = 2'); ok(await warn() === 'There is no x in the equation, and it is true as it stands: every x solves it.', `2 = 2 (${await warn()})`);
  await any('2 = 3'); ok(await warn() === 'There is no x in the equation, and it is false as it stands: no x solves it.', `2 = 3 (${await warn()})`);
  await any('x + y = 2'); ok(await warn() === 'Only x can be the unknown: "y" has no value. (Several unknowns: "Simultaneous".)' && !(await vals()).length, `x + y = 2: y is not quietly taken as 0 (${await warn()})`);
  await any('x = 1 = 2'); ok(await warn() === 'One = sign, please: left side = right side.', 'two = signs');
  await any('x^^2'); ok(await warn() !== '' && !(await vals()).length, `an equation that cannot be read → the reason (${await warn()})`);
  await any(''); ok(await warn() === 'Type an equation, e.g. x^2 = 2.', 'an empty box');
  await any('x^2 = 2', 5, 5); ok(await warn() === 'The search range needs two numbers, "from" below "to".', 'an empty range');
  // ---- more solutions than fit; a range too wide for the steps
  r = await any('sin(x) = 0');
  ok(r.length === 50 && close(r[0], -31 * Math.PI, 1e-9) && close(r[49], 18 * Math.PI, 1e-9) && /^The first 50 solutions from -100 upwards are shown — there may be more: narrow the range\.$/.test(await notes()), `sin x = 0 on ±100 has 63 roots: fifty are shown and the rest announced — twenty were shown without a word (${r.length}; ${await notes()})`);
  r = await any('sin(x) = 0', -1e6, 1e6);
  ok(/The range is searched in 20,000 steps of 100: solutions closer together than that can be missed/.test(await notes()), `a range of two million: the tab says how coarse its steps are (${(await notes()).slice(0, 160)})`);
  r = await any('x^2 = 2');
  ok(r.length === 2 && !(await notes()), 'back to an ordinary equation: no notes');
  await fieldIn('Equation in x').fill('x^2 = 9'); await fieldIn('Equation in x').press('Enter');
  ok((await vals()).join(' ') === '−3 3', 'Enter solves too');

  // ================================================================== quadratic
  await mode('Quadratic');
  const co = async (...v) => { const names = ['a', 'b', 'c', 'd']; for (let i = 0; i < v.length; i++) await fieldIn(new RegExp(`^${names[i]}$`)).fill(String(v[i])); };
  ok((await vals()).join(' ') === '1 2' && await row('Kind') === 'Two different real roots' && await row('Discriminant b² − 4ac') === '1' && await row('Vertex') === '(1.5, −0.25)', `x² − 3x + 2: roots 1 and 2, discriminant 1, vertex (1.5, −0.25) (${await vals()}, ${await row('Vertex')})`);
  bad = [];
  const KIND2 = { two: 'Two different real roots', double: 'One real root, twice (the parabola touches the axis)', complex: 'Two complex roots (the parabola does not reach the axis)' };
  for (const [a, b, c, kind, want] of ref.quadratics.filter((_, i) => i < 24 || i % 12 === 0)) {
    await co(a, b, c);
    const t = await tiles(), got = t.map((x) => complex(x.value)), at = `${a}x² + ${b}x + ${c}`;
    if (await row('Kind') !== KIND2[kind]) { bad.push(`${at}: ${await row('Kind')} (${await warn()}), not ${kind}`); continue; }
    const exp = kind === 'double' ? [[want[0], want[1]]] : [[want[0], want[1]], [want[2], want[3]]];
    if (got.length !== exp.length || !got.every((g, i) => close(g[0], exp[i][0]) && close(g[1], exp[i][1])) || t[0].label !== (kind === 'double' ? 'x₁ = x₂' : 'x₁')) bad.push(`${at}: ${JSON.stringify(t)}, not ${want}`);
  }
  ok(!bad.length, `56 quadratics of the reference: the kind of the answer and each root to the twelve digits shown ${bad.slice(0, 2).join(' | ')}`);
  await co('1', '-2.2', '1.21');
  { const t = await tiles(); ok(t.length === 1 && t[0].label === 'x₁ = x₂' && t[0].value === '1.1' && t[0].sub === '= 11/10' && await row('Discriminant b² − 4ac') === '0', `(x − 1.1)², typed 1, −2.2, 1.21: the one root 1.1 — the tab showed 1.1000000149 and 1.0999999851 (${JSON.stringify(t)})`); }
  await co('6', '-5', '1');
  { const t = await tiles(); ok(t.map((x) => `${x.value} ${x.sub}`).join(' | ') === '0.333333333333 = 1/3 | 0.5 = 1/2', `6x² − 5x + 1: the fractions beside the decimals (${JSON.stringify(t)})`); }
  await co('1', '0', '4'); ok((await vals()).join(' | ') === '2i | −2i', `x² + 4 → 2i and −2i, written without a stray space (${await vals()})`);
  await co('1', '2', '5'); ok((await vals()).join(' | ') === '−1 + 2i | −1 − 2i' && await row('Discriminant b² − 4ac') === '−16', 'x² + 2x + 5 → −1 ± 2i');
  await co('1e200', '1e200', '1e200'); ok((await vals()).join(' | ') === '−0.5 + 0.866025403784i | −0.5 − 0.866025403784i' && await row('Discriminant b² − 4ac') === '−3e400'.replace('3e400', '∞') || /0\.866025403784i/.test((await vals()).join()), `coefficients of 10²⁰⁰: −½ ± (√3/2)i — the tab showed "−0.5 + Errori" (${await vals()}; D = ${await row('Discriminant b² − 4ac')})`);
  await co('1', '1e160', '1'); ok((await vals()).join(' | ') === '−1e160 | −1e-160', `x² + 10¹⁶⁰x + 1 — the tab showed 0 and "Error" (${await vals()})`);
  await co('0', '2', '-4'); ok(await warn() === 'a is 0, so this is not a quadratic: bx + c = 0 has the one solution x = 2.' && !(await vals()).length, `a = 0: said, with the solution of what is left (${await warn()})`);
  await co('', '2', '-4'); ok(await warn() === 'Coefficient a is empty — use 0 for a term that is missing.', 'an empty coefficient is named');
  await co('1', '-3', '2'); ok((await vals()).join(' ') === '1 2' && !(await warn()), 'and the answer is back');

  // ================================================================== cubic
  await mode('Cubic');
  ok((await vals()).join(' ') === '1 2 3' && await row('Kind') === 'Three different real roots', `x³ − 6x² + 11x − 6: 1, 2, 3 (${await vals()})`);
  const KIND3 = { three: 'Three different real roots', double: 'Two real roots, one of them twice', triple: 'One real root, three times', complex: 'One real root and two complex ones' };
  bad = [];
  for (const [a, b, c, d, kind, want] of ref.cubics.filter((_, i) => i < 35 || i % 12 === 0)) {
    await co(a, b, c, d);
    const t = await tiles(), got = t.map((x) => complex(x.value)), at = `${a}x³ + ${b}x² + ${c}x + ${d}`;
    if (await row('Kind') !== KIND3[kind]) { bad.push(`${at}: ${await row('Kind')} (${await warn()}), not ${kind}`); continue; }
    const exp = kind === 'triple' ? [want[0]] : kind === 'double' ? (want[0][0] === want[1][0] ? [want[0], want[2]] : [want[0], want[1]]) : want;
    const scale = Math.max(...want.map(([re, im]) => Math.hypot(re, im)));
    if (got.length !== exp.length || !got.every((g, i) => (close(g[0], exp[i][0]) || Math.abs(g[0] - exp[i][0]) < 1e-11 * scale) && (close(g[1], exp[i][1]) || Math.abs(g[1] - exp[i][1]) < 1e-11 * scale))) bad.push(`${at}: ${JSON.stringify(t.map((x) => x.value))}, not ${JSON.stringify(want)}`);
  }
  ok(!bad.length, `57 cubics of the reference: kind and roots ${bad.slice(0, 2).join(' | ')}`);
  await co('1', '-0.3', '0.03', '-0.001');
  { const t = await tiles(); ok(t.length === 1 && t[0].label === 'x₁ = x₂ = x₃' && t[0].value === '0.1' && t[0].sub === '= 1/10', `(x − 0.1)³: the one root 0.1 — the tab showed 0.100001201554, 0.0999993992228, 0.0999993992228 (${JSON.stringify(t)})`); }
  await co('1', '-1000002', '2000001', '-1000000');
  { const t = await tiles(); ok(t.map((x) => `${x.label}: ${x.value}`).join(', ') === 'x₁ = x₂: 1, x₃: 1000000', `(x − 1)²(x − 10⁶): 1 twice and 1,000,000 — the tab showed 1 ± 0.00278966872477i (${JSON.stringify(t)})`); }
  await co('1', '1e8', '1', '1');
  ok((await vals()).join(' | ') === '−100000000 | −4.99999995e-9 + 0.000099999999875i | −4.99999995e-9 − 0.000099999999875i', `x³ + 10⁸x² + x + 1: one real root and a complex pair — the tab showed three real roots (${await vals()})`);
  await co('1', '0', '0', '-1'); ok((await vals()).join(' | ') === '1 | −0.5 + 0.866025403784i | −0.5 − 0.866025403784i', 'x³ = 1');
  await co('0', '1', '2', '3'); ok(await warn() === 'a is 0, so this is not a cubic — the Quadratic tab solves bx² + cx + d = 0.', `a = 0 (${await warn()})`);
  await co('2', '-4', '-22', '24'); ok((await vals()).join(' ') === '−3 1 4', '2x³ − 4x² − 22x + 24 → −3, 1, 4');

  // ================================================================== simultaneous
  await mode('Simultaneous (linear)');
  const cell = page.locator('.eq-cell');
  const sys = async (rows) => { const n = rows.length; await page.getByRole('radio', { name: `${n} unknowns`, exact: true }).click(); const flat = rows.flat(); for (let i = 0; i < flat.length; i++) await cell.nth(i).fill(String(flat[i])); };
  { const t = await tiles(); ok(t.map((x) => `${x.label} = ${x.value}`).join(', ') === 'x = 1, y = 2', `2x + 3y = 8, x − y = −1 → x = 1, y = 2 (${JSON.stringify(t)})`); }
  bad = []; const seen = {};
  for (const [rows, kind, xs, extra] of ref.linears.filter((_, i) => i < 15 || i % 9 === 0)) {
    await sys(rows); seen[`${rows.length}${kind}`] = 1;
    const t = await tiles(), w = await warn(), at = JSON.stringify(rows).slice(0, 100), n = rows.length;
    if (kind === 'none') { if (w !== 'No solution: the equations contradict each other.') bad.push(`${at}: "${w}", not "no solution"`); }
    else if (kind === 'many') { if (w !== `Infinitely many solutions: the equations are not independent — only ${extra} of the ${n} ${extra === 1 ? 'says' : 'say'} something new.`) bad.push(`${at}: "${w}", not infinitely many with rank ${extra}`); }
    else if (t.length !== n || !t.every((x, i) => x.label === 'xyzw'[i] && close(Number(x.value.replace('−', '-')), xs[i]) && (extra[i].includes('/') ? x.sub === `= ${extra[i].replace('-', '−')}` : x.sub === ''))) bad.push(`${at}: ${JSON.stringify(t)} "${w}", not ${xs} [${extra}]`);
  }
  ok(Object.keys(seen).length >= 7 && !bad.length, `47 systems of the reference with 2, 3 and 4 unknowns: the solution to twelve digits with its fractions, "no solution" told from "infinitely many" — the tab said "No unique solution" for both (${Object.keys(seen).join(' ')}) ${bad.slice(0, 2).join(' | ')}`);
  await sys([['1e-20', '2e-20', '5e-20'], ['3e-20', '4e-20', '6e-20']]);
  { const t = await tiles(); ok(t.map((x) => `${x.value} ${x.sub}`.trim()).join(' | ') === '−4 | 4.5 = 9/2', `an ordinary system in units of 10⁻²⁰ has its solution — the tab called it unsolvable (${JSON.stringify(t)})`); }
  await sys([['1', '1', '2'], ['1', '1.0000000000001', '2.0000000000001']]);
  ok((await vals()).join(' ') === '1 1', `two nearly equal equations still have their one solution — the tab called them unsolvable (${await vals()})`);
  // the grid keeps what was typed when its size changes (a fresh page: nothing typed before)
  { const g = await newPage(); await g.goto(`${base}#/equation`); await g.getByRole('radio', { name: 'Simultaneous (linear)', exact: true }).click();
    const gc = g.locator('.eq-cell'), all = async (k) => (await Promise.all(Array.from({ length: k }, (_, i) => gc.nth(i).inputValue()))).join(' ');
    await g.getByRole('radio', { name: '3 unknowns', exact: true }).click();
    ok(await all(12) === '1 1 1 6 0 2 5 -4 2 5 -1 27' && (await g.locator('.big-value').allTextContents()).join(' ') === '5 3 −2', `untouched, each size shows its own sample: three unknowns → (5, 3, −2) (${await all(12)})`);
    await g.getByRole('radio', { name: '2 unknowns', exact: true }).click();
    for (const [i, v] of [[0, '7'], [1, '8'], [2, '9'], [3, '4'], [4, '5'], [5, '6']]) await gc.nth(i).fill(v);
    await g.getByRole('radio', { name: '3 unknowns', exact: true }).click();
    ok(await all(12) === '7 8 0 9 4 5 0 6 0 0 0 0', `a third unknown is added: the numbers already typed stay where they belong — they were replaced by the sample — and the new cells hold 0 (${await all(12)})`);
    await g.getByRole('radio', { name: '2 unknowns', exact: true }).click();
    ok(await all(6) === '7 8 9 4 5 6' && (await g.locator('.big-value').allTextContents()).join(' ') === '−1 2', `… and back: 7x + 8y = 9, 4x + 5y = 6 → (−1, 2) (${await all(6)})`);
    ok(!g.errors.length, `no page errors ${g.errors.join(' | ')}`); await g.close(); }
  await sys([['7', '8', '9'], ['4', '5', '6']]);
  await cell.nth(1).fill('');
  ok(await warn() === 'Equation 1: the coefficient of y is empty — use 0 for a term that is missing.' && !(await vals()).length, `an empty cell is named (${await warn()})`);
  await cell.nth(1).fill('8'); ok((await vals()).length === 2 && !(await warn()), 'filled in again: the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ================================================================== phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/equation`); await ph.locator('.big-value').first().waitFor();
  await ph.getByRole('radio', { name: 'Simultaneous (linear)', exact: true }).click(); await ph.getByRole('radio', { name: '4 unknowns', exact: true }).click();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.locator('.big-result').count() === 4, 'phone: four unknowns, no horizontal scroll of the page; the sample system is solved');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .seg-btn, .tool-body .btn, .tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: boxes and choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
