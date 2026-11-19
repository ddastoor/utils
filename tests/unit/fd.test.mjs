// FD / RD: mathcore's m_fd and the tab's reading of its input (src/lib/finance.ts) against
// tests/fixtures/finance/reference.json — compound interest in mpmath at 60 digits; quarterly recurring deposits were
// also checked there against the formula Indian banks publish (scripts/make-finance-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const F = await load('/src/lib/finance.ts');
  const { fmtN } = await load('/src/lib/form.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/finance/reference.json'), 'utf8'));
  const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const TOO_LARGE = 'The result is beyond ₹10,000 lakh crore — more than this calculator can show. Check the rate and the period.';
  const COMP = { 0: 'simple', 1: 'yearly', 2: 'half-yearly', 4: 'quarterly', 12: 'monthly' };

  // ---- 1,100 fixed deposits: 0 % to 100 %, a quarter of a year to a century, five ways of compounding
  let worst = 0, bad = [], shown = 0, refused = 0;
  for (const [a, r, y, c, value] of ref.fd) {
    const at = `₹${a} at ${r} % for ${y} years, ${COMP[c]}`, e = rel(m.fd(a, r, y, c, false).value, value);
    if (e > worst) worst = e; if (e > 1e-14) bad.push(`${at}: engine ${m.fd(a, r, y, c, false).value} ≠ ${value}`);
    const msg = why(() => { const p = F.fdPlan(m, 'fd', a, r, y, c); if (p.months !== null || p.rounded || p.invested !== a || rel(p.value, value) > 1e-13 || Math.abs(p.interest - (value - a)) > 1e-12 * value + 1e-6) bad.push(`${at}: plan ${JSON.stringify(p)}`); });
    if (value > F.MAX_RESULT) { refused++; if (msg !== TOO_LARGE) bad.push(`${at}: ${value} was not refused (${msg})`); } else { shown++; if (msg) bad.push(`${at}: refused — ${msg}`); }
  }
  t.ok(ref.fd.length === 1100 && !bad.length, `${ref.fd.length} fixed deposits agree to 14 digits — also (1 + 9.5 % / 12) to the 1,200th power, where the rounding of the monthly factor had cost three digits (worst ${worst.toExponential(1)}); ${shown} shown, ${refused} beyond ₹10,000 lakh crore refused ${bad.slice(0, 3).join(' | ')}`);

  // ---- 1,000 recurring deposits: 1 to 1,200 monthly instalments
  worst = 0; bad = []; shown = 0; refused = 0;
  for (const [a, r, n, c, value] of ref.rd) {
    const at = `₹${a} a month at ${r} % for ${n} months, ${COMP[c]}`, g = m.fd(a, r, n / 12, c, true), e = rel(g.value, value);
    if (e > worst) worst = e; if (e > 1e-13 || rel(g.invested, a * n) > 1e-15) bad.push(`${at}: engine ${g.invested} / ${g.value} ≠ ${a * n} / ${value}`);
    const msg = why(() => { const p = F.fdPlan(m, 'rd', a, r, n / 12, c); if (p.months !== n || p.rounded || rel(p.invested, a * n) > 1e-15 || rel(p.value, value) > 1e-12) bad.push(`${at}: plan ${JSON.stringify(p)}`); });
    if (value > F.MAX_RESULT) { refused++; if (msg !== TOO_LARGE) bad.push(`${at}: ${value} was not refused (${msg})`); } else { shown++; if (msg) bad.push(`${at}: refused — ${msg}`); }
  }
  t.ok(ref.rd.length === 1000 && !bad.length, `${ref.rd.length} recurring deposits agree to 13 digits (worst ${worst.toExponential(1)}); ${shown} shown, ${refused} refused ${bad.slice(0, 3).join(' | ')}`);

  // ---- the effective annual yield
  bad = [];
  for (const [r, c, y, text] of ref.yield) { const p = F.fdPlan(m, 'fd', 100000, r, 5, c); if (Math.abs(p.yield - y) > 1e-10 * Math.max(1, y)) bad.push(`${r} % ${COMP[c]}: ${p.yield} ≠ ${y}`);
    if (fmtN(p.yield, 3) !== text) bad.push(`${r} % ${COMP[c]}: shown as ${fmtN(p.yield, 3)}, not ${text}`); }
  t.ok(ref.yield.length === 76 && !bad.length, `${ref.yield.length} effective yields ((1 + r/n)ⁿ − 1), and each as the tab writes it with three decimals (7 % half-yearly: 7.1225 → 7.123) ${bad.slice(0, 3).join(' | ')}`);
  t.eq(F.fdPlan(m, 'fd', 100000, 7, 5, 0).yield, null, 'simple interest has no compounding yield');
  t.eq(F.fdPlan(m, 'fd', 100000, 0, 5, 4).yield, 0, 'a rate of 0 %: a yield of 0');

  // ---- known figures
  t.eq(Math.round(m.fd(100000, 7, 5, 4, false).value), 141478, '₹1 lakh at 7 % for 5 years, quarterly: ₹1,41,478 (the banks\' figure)');
  t.eq(Math.round(m.fd(100000, 7, 5, 0, false).value), 135000, 'simple interest: ₹1,35,000');
  t.eq(Math.round(m.fd(100000, 7, 5, 1, false).value), 140255, 'yearly: ₹1,40,255');
  t.eq(m.fd(100000, 7, 0, 4, false).value, 100000, 'no time: the deposit itself');
  { const g = m.fd(5000, 7, 5, 4, true), i = 0.07 / 4, bank = 5000 * ((1 + i) ** 20 - 1) / (1 - (1 + i) ** (-1 / 3));
    t.ok(g.invested === 300000 && rel(g.value, bank) < 1e-13 && Math.round(g.value) === 359664, `RD of ₹5,000 for 5 years at 7 %: ₹3,59,664 — the banks' formula R·((1+i)ⁿ − 1) / (1 − (1+i)^(−1/3)) gives ${Math.round(bank)}`); }
  { const g = m.fd(1000, 12, 1 / 12, 0, true); t.near(g.value, 1010, 1e-9, 'one instalment for one month at 12 % simple: ₹1,010'); }
  t.near(m.fd(250000, 6.8, 2.25, 4, false).value, 250000 * (1 + 0.068 / 4) ** 9, 1e-6, 'two and a quarter years: nine quarters');

  // ---- a tenure is never a loop of a thousand million turns
  { const t0 = performance.now(), g = m.fd(5000, 7, 3e7, 0, true), ms = performance.now() - t0;
    t.ok(ms < 200 && g.invested === 5000 * 12000, `an RD of 3 × 10⁷ years: the engine stops at 12,000 months (1.8 s in the tab) — ${ms.toFixed(0)} ms`); }
  t.eq(m.fd(5000, 7, -2, 4, true).invested, 0, 'an RD of −2 years: nothing paid in (the tab showed "Invested −₹1,20,000")');

  // ---- the tab's reading of its input
  const plan = (kind, a, r, y, c = 4) => F.fdPlan(m, kind, a, r, y, c);
  for (const [y, months, rounded] of [[1.04, 12, true], [2.3, 28, true], [0.25, 3, false], [0.5, 6, false], [5, 60, false], [100, 1200, false], [0.05, 1, true]]) {
    const p = plan('rd', 5000, 7, y); t.ok(p.months === months && p.rounded === rounded && p.invested === 5000 * months, `RD of ${y} years → ${months} instalments${rounded ? ', said to be rounded' : ''}`);
  }
  { const p = plan('fd', 100000, 7, 0.01); t.ok(p.months === null && !p.rounded && p.value > 100000 && p.value < 100100, 'an FD of a hundredth of a year is taken as it is'); }
  { const p = plan('fd', 100000.5, 7, 5); t.ok(p.invested === 100000.5 && rel(p.interest, p.value - 100000.5) < 1e-12, 'a deposit with paise'); }
  t.eq(why(() => plan('fd', 0, 7, 5)), 'The deposit must be more than 0.', 'a deposit of 0');
  t.eq(why(() => plan('fd', -1000, 7, 5)), 'The deposit must be more than 0.', 'a negative deposit (the tab showed a maturity value of −₹1,415)');
  t.eq(why(() => plan('rd', 0, 7, 5)), 'The monthly instalment must be more than 0.', 'an instalment of 0');
  t.eq(why(() => plan('fd', 2e13, 7, 5)), 'The deposit is too large — this calculator goes up to ₹10 lakh crore.', 'too large a deposit');
  t.eq(why(() => plan('fd', 100000, -5, 5)), 'The interest rate cannot be negative.', 'a negative rate');
  t.eq(why(() => plan('rd', 5000, -500, 5)), 'The interest rate cannot be negative.', 'an RD at −500 % (the tab showed dashes)');
  t.eq(why(() => plan('fd', 100000, 1001, 5)), 'The interest rate is too high — at most 1,000 % a year.', 'a rate above 1,000 %');
  t.eq(why(() => plan('fd', 100000, 7, 0)), 'The tenure must be more than 0.', 'an FD for no time');
  t.eq(why(() => plan('fd', 100000, 7, -2)), 'The tenure must be more than 0.', 'an FD for −2 years (the tab showed ₹87,041)');
  t.eq(why(() => plan('fd', 100000, 7, 5000)), 'The tenure is too long — at most 100 years.', 'an FD for 5,000 years');
  t.eq(why(() => plan('rd', 5000, 7, 0)), 'The tenure must be more than 0.', 'an RD for no time');
  t.eq(why(() => plan('rd', 5000, 7, -2)), 'The tenure must be more than 0.', 'an RD for −2 years');
  t.eq(why(() => plan('rd', 5000, 7, 0.04)), 'The tenure must be at least 1 month.', 'an RD of 0.04 years');
  t.eq(why(() => plan('rd', 5000, 7, 3e7)), 'The tenure is too long — at most 100 years (1,200 months).', 'an RD of 3 × 10⁷ years');
  t.eq(why(() => plan('fd', 100000, 100, 100)), TOO_LARGE, '100 % for a century');
};
