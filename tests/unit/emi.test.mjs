// EMI: the loan arithmetic of mathcore (m_emi, m_amortize_yearly) and the tab's reading of its input (src/lib/finance.ts)
// against tests/fixtures/finance/reference.json — the definition of a reducing-balance loan worked month by month in
// mpmath at 420 digits and cross-checked with numpy-financial (scripts/make-finance-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const F = await load('/src/lib/finance.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/finance/reference.json'), 'utf8'));
  const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));

  // ---- the instalment: 936 loans from ₹50,000 to ₹10 lakh crore, 0 % to 1,000 %, 1 to 1,200 months
  let worst = 0, bad = [];
  for (const [p, r, n, emi] of ref.emi) { const e = rel(m.emi(p, r, n), emi); if (e > worst) worst = e; if (e > 1e-13) bad.push(`${p} @ ${r} % × ${n}: ${m.emi(p, r, n)} ≠ ${emi}`); }
  t.ok(ref.emi.length === 936 && !bad.length, `instalment of ${ref.emi.length} loans agrees to 13 digits (worst ${worst.toExponential(1)}) ${bad.slice(0, 3).join(' | ')}`);

  // ---- the schedule: first, middle and last year of each of them
  // (an amount is right when it is right to a hundredth of a paisa, or to 12 digits where the loan is that large)
  const close = (got, want, p) => Math.abs(got - want) <= Math.max(1e-4, Math.abs(want) * 1e-12, p * 1e-13);
  bad = []; let rows = 0;
  for (const [p, r, n, , years, ...picks] of ref.emi) {
    const ys = m.amortizeYearly(p, r, n);
    if (ys.length !== years) { bad.push(`${p} @ ${r} % × ${n}: ${ys.length} years, not ${years}`); continue; }
    for (const [y, pp, ii, bal] of picks) {
      rows++;
      if (!close(ys[y].principal, pp, p) || !close(ys[y].interest, ii, p) || !close(ys[y].balance, bal, p)) bad.push(`${p} @ ${r} % × ${n}, year ${y + 1}: ${JSON.stringify(ys[y])} ≠ ${[pp, ii, bal]}`);
    }
  }
  t.ok(rows > 2000 && !bad.length, `${rows} schedule rows (principal, interest, balance) agree with the month-by-month reference ${bad.slice(0, 3).join(' | ')}`);

  // ---- every row of eight whole schedules
  for (const c of ref.emi_full) {
    const ys = m.amortizeYearly(c.p, c.r, c.n);
    const off = c.rows.findIndex((w, y) => !ys[y] || !close(ys[y].principal, w[0], c.p) || !close(ys[y].interest, w[1], c.p) || !close(ys[y].balance, w[2], c.p));
    t.ok(ys.length === c.rows.length && off < 0, `${c.p} @ ${c.r} % × ${c.n} months: all ${c.rows.length} years of the schedule${off >= 0 ? ` — year ${off + 1}: ${JSON.stringify(ys[off])} ≠ ${c.rows[off]}` : ''}`);
    t.ok(rel(m.emi(c.p, c.r, c.n), c.emi) < 1e-13, `${c.p} @ ${c.r} % × ${c.n}: instalment ${m.emi(c.p, c.r, c.n)}`);
  }

  // ---- what a schedule must add up to, whatever the loan
  bad = [];
  for (const [p, r, n] of ref.emi) {
    const ys = m.amortizeYearly(p, r, n), e = m.emi(p, r, n);
    const sp = ys.reduce((a, y) => a + y.principal, 0), si = ys.reduce((a, y) => a + y.interest, 0);
    if (rel(sp, p) > 1e-11) bad.push(`${p} @ ${r} × ${n}: principal parts add up to ${sp}`);
    if (Math.abs(si - (e * n - p)) > Math.max(1e-4, e * n * 1e-11)) bad.push(`${p} @ ${r} × ${n}: interest parts ${si} ≠ ${e * n - p}`);
    if (ys[ys.length - 1].balance !== 0) bad.push(`${p} @ ${r} × ${n}: ends at ${ys[ys.length - 1].balance}`);
    if (ys.some((y, i) => y.balance < 0 || y.principal < 0 || y.interest < -1e-9 * p || (i && y.balance > ys[i - 1].balance))) bad.push(`${p} @ ${r} × ${n}: a negative part or a balance that rises`);
  }
  t.ok(!bad.length, `every schedule: principal adds up to the loan, interest to total − loan, balance falls to exactly 0 ${bad.slice(0, 3).join(' | ')}`);

  // ---- known figures
  t.eq(Math.round(m.emi(2500000, 8.5, 240)), 21696, '₹25 lakh at 8.5 % for 20 years: ₹21,696 a month');
  t.eq(Math.round(m.emi(1000000, 10, 120)), 13215, '₹10 lakh at 10 % for 10 years: ₹13,215');
  t.eq(m.emi(120000, 0, 12), 10000, 'no interest: the loan divided by the months');
  t.near(m.emi(100000, 12, 1), 101000, 1e-9, 'one instalment: the loan and one month of interest');
  // ---- where the usual formula P·r·(1+r)^n / ((1+r)^n − 1) has no digits left
  t.ok(rel(m.emi(2500000, 1e-13, 240), 2500000 / 240) < 1e-12, `a rate of 10⁻¹³ %: the instalment is the loan / months, not NaN (${m.emi(2500000, 1e-13, 240)})`);
  t.ok(rel(m.emi(2500000, 1e-9, 240), 10416.666667712673) < 1e-12, `10⁻⁹ %: ${m.emi(2500000, 1e-9, 240)}`);
  t.ok(rel(m.emi(1e6, 1000, 1200), 1e6 * 10 / 12) < 1e-12, `1,000 % over a century, where (1 + r)^n overflows: interest only, loan × rate (${m.emi(1e6, 1000, 1200)})`);
  t.ok(rel(m.emi(1e6, 8.5, 1200000), 1e6 * 0.085 / 12) < 1e-12, 'a hundred thousand years: interest only, not NaN');
  { // the recurrence bal ← bal·(1 + r) − emi multiplies its own rounding by (1 + r) every month: at 100 % over 100 years
    // it ends anywhere; the closed form keeps the balance at the loan until the last years
    const ys = m.amortizeYearly(1e6, 100, 1200), full = ref.emi_full.find((c) => c.r === 100);
    t.ok(ys.length === 100 && rel(ys[49].balance, full.rows[49][2]) < 1e-12 && rel(ys[98].balance, full.rows[98][2]) < 1e-12, `100 % × 100 years: balance after year 50 ${ys[49].balance}, after year 99 ${ys[98].balance}`);
  }
  // ---- outside the domain
  for (const [p, r, n] of [[1e6, 8.5, 0], [1e6, 8.5, -6], [1e6, -1200, 12], [1e6, -5000, 12]]) t.ok(Number.isNaN(m.emi(p, r, n)), `emi(${p}, ${r}, ${n}) is not a number`);
  t.eq(m.amortizeYearly(1e6, 8.5, 0).length, 0, 'no months: no schedule');
  t.eq(m.amortizeYearly(1e6, 8.5, -6).length, 0, 'negative months: no schedule (it asked for an array of −6 numbers)');
  t.eq(m.amortizeYearly(1e6, 8.5, 12000).length, 100, 'a schedule has at most 100 years');

  // ---- the tab's reading of its input
  const plan = (p, r, n, u = 'y') => F.emiPlan(m, p, r, n, u);
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  { const e = plan(2500000, 8.5, 20);
    t.ok(e.months === 240 && !e.rounded && Math.round(e.emi) === 21696 && Math.round(e.total) === 5206939 && Math.round(e.interest) === 2706939 && e.years.length === 20, `default loan: ${e.months} months, EMI ${Math.round(e.emi)}, total ${Math.round(e.total)}, interest ${Math.round(e.interest)}`);
    t.near(e.principalShare, 48.0128, 1e-3, 'principal is 48.0 % of what is paid'); }
  { const e = plan(300000, 12, 18, 'm'); t.ok(e.months === 18 && !e.rounded && e.years.length === 2, '18 months typed as months: two years in the schedule'); }
  { const e = plan(300000, 0, 18, 'm'); t.ok(e.interest === 0 && e.principalShare === 100 && rel(e.emi, 300000 / 18) < 1e-15, 'no interest: principal is 100 %'); }
  for (const [n, u, months, rounded] of [[20.04, 'y', 240, true], [1.5, 'y', 18, false], [0.25, 'y', 3, false], [2.3, 'y', 28, true], [0.1, 'y', 1, true], [0.05, 'y', 1, true], [18.5, 'm', 19, true], [18.4, 'm', 18, true], [0.6, 'm', 1, true], [100, 'y', 1200, false], [1200, 'm', 1200, false], [1 / 12, 'y', 1, false], [(0.1 + 0.2) * 10, 'm', 3, false] /* 3.0000000000000004: whole */]) {
    const w = F.wholeMonths(n, u); t.ok(w.months === months && w.rounded === rounded, `${n} ${u === 'y' ? 'years' : 'months'} → ${months} months${rounded ? ', said to be rounded' : ''} (${JSON.stringify(w)})`);
  }
  t.eq(why(() => plan(0, 8.5, 20)), 'The loan amount must be more than 0.', 'a loan of 0');
  t.eq(why(() => plan(-100000, 8.5, 20)), 'The loan amount must be more than 0.', 'a negative loan');
  t.eq(why(() => plan(1.01e13, 8.5, 20)), 'The loan amount is too large — this calculator goes up to ₹10 lakh crore.', 'a loan beyond ₹10 lakh crore');
  t.ok(plan(1e13, 8.5, 20).emi > 0, '₹10 lakh crore itself is taken');
  t.eq(why(() => plan(2500000, -5, 20)), 'The interest rate cannot be negative.', 'a negative rate');
  t.eq(why(() => plan(2500000, 1000.5, 20)), 'The interest rate is too high — at most 1,000 % a year.', 'a rate above 1,000 %');
  t.ok(plan(2500000, 1000, 20).emi > 0, '1,000 % itself is taken');
  t.eq(why(() => plan(2500000, 8.5, 0)), 'The tenure must be more than 0.', 'a tenure of 0');
  t.eq(why(() => plan(2500000, 8.5, -3)), 'The tenure must be more than 0.', 'a negative tenure (the tab showed "Invalid typed array length: -6")');
  t.eq(why(() => plan(2500000, 8.5, 0.04)), 'The tenure must be at least 1 month.', '0.04 years is less than half a month');
  t.eq(why(() => plan(2500000, 8.5, 0.4, 'm')), 'The tenure must be at least 1 month.', '0.4 months');
  t.eq(why(() => plan(2500000, 8.5, 150)), 'The tenure is too long — at most 100 years (1,200 months).', '150 years (the schedule stopped at year 100 without a word)');
  t.eq(why(() => plan(2500000, 8.5, 357913942)), 'The tenure is too long — at most 100 years (1,200 months).', '357,913,942 years (× 12 wrapped round to 8 months in the engine)');
  t.eq(why(() => plan(2500000, 8.5, 1201, 'm')), 'The tenure is too long — at most 100 years (1,200 months).', '1,201 months');
  t.eq(why(() => plan(2500000, 8.5, Infinity)), 'The tenure is too long — at most 100 years (1,200 months).', 'an endless tenure');
  { const e = plan(1e13, 1000, 100); t.ok(rel(e.emi, 1e13 * 10 / 12) < 1e-12 && rel(e.total, 1e16) < 1e-12 && e.years.length === 100, `the largest loan at the highest rate for the longest time still has an answer (EMI ${e.emi}, total ${e.total})`); }
  for (const [mo, text] of [[1, '1 month'], [11, '11 months'], [12, '1 year'], [13, '1 year 1 month'], [18, '1 year 6 months'], [240, '20 years'], [245, '20 years 5 months'], [1200, '100 years']]) t.eq(F.span(mo), text, `span(${mo})`);
};
