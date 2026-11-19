// Loan Prepayment, PPF, EPF, NPS and Inflation: mathcore (m_prepay, m_ppf, m_epf, m_nps, growth) and the tabs' reading
// of their input (src/lib/finance.ts) against tests/fixtures/finance2/reference.json — each model in mpmath at 60
// digits, with closed forms and numpy-financial as cross-checks (scripts/make-finance2-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const F = await load('/src/lib/finance.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/finance2/reference.json'), 'utf8'));
  const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const near = (got, want, scale) => Math.abs(got - want) <= Math.max(1e-6, scale * 1e-11); // a millionth of a rupee, or eleven digits of the loan

  // ---- 520 prepayments: once or yearly, the instalment kept or the tenure kept
  let bad = [];
  for (const [P, R, n, pp, when, yearly, keep, emi, base, interest, months, last, prepaid, ended] of ref.prepay) {
    const x = m.prepay(P, R, n, pp, when, !!yearly, !!keep), at = `₹${P} at ${R} % × ${n}, ₹${pp} after ${when}${yearly ? ' and yearly' : ''}, keep ${keep ? 'tenure' : 'EMI'}`;
    if (rel(x.emi, emi) > 1e-13 || !near(x.baseInterest, base, P) || !near(x.interest, interest, P) || x.monthsTaken !== months || !near(x.newEmi, last, P) || !near(x.prepaid, prepaid, P) || x.paidOff !== !!ended) bad.push(`${at}: ${JSON.stringify(x)} ≠ ${[emi, base, interest, months, last, prepaid, ended]}`);
    const p = F.prepayPlan(m, P, R, n / 12, pp, when, !!yearly, !!keep);
    if (p.months !== n || p.monthsSaved !== n - months || !near(p.saved, base - interest, P) || p.saved < -1e-6 || p.prepaid > pp * (yearly ? Math.ceil(n / 12) : 1) + 1e-6) bad.push(`${at}: plan ${JSON.stringify(p)}`);
  }
  t.ok(ref.prepay.length === 520 && !bad.length, `${ref.prepay.length} prepayments: the instalment, the interest with and without, the months, the instalment at the end, what was prepaid and whether a prepayment closed the loan ${bad.slice(0, 2).join(' | ')}`);
  // the figures of the three known examples are those of the reference's own month-by-month simulation
  { const p = F.prepayPlan(m, 2500000, 8.5, 20, 200000, 12, false, false);
    t.ok(Math.round(p.emi) === 21696 && p.months === 240 && p.monthsTaken === 200 && p.monthsSaved === 40 && Math.round(p.saved) === 668337 && p.prepaid === 200000 && !p.paidOff, `the example: ₹2 lakh after a year on ₹25 lakh at 8.5 % for 20 years ends ${p.monthsSaved} months sooner and saves ₹${Math.round(p.saved)}`); }
  { const p = F.prepayPlan(m, 2500000, 8.5, 20, 200000, 12, false, true); t.ok(p.monthsTaken === 240 && p.monthsSaved === 0 && p.newEmi < p.emi && Math.round(p.newEmi) === 19925 && Math.round(p.saved) === 203763, `… or lowers the instalment to ₹${Math.round(p.newEmi)} and saves ₹${Math.round(p.saved)}`); }
  { const p = F.prepayPlan(m, 2500000, 8.5, 20, 200000, 0, false, false), q = F.prepayPlan(m, 2500000, 8.5, 20, 200000, 1, false, false); t.ok(p.saved > q.saved && p.prepaid === 200000, 'prepaying now, before the next instalment, saves more than after it (0 months was quietly taken as 1)'); }
  { const p = F.prepayPlan(m, 500000, 9, 5, 9000000, 6, false, false); t.ok(p.paidOff && p.monthsTaken === 6 && p.prepaid < 500000 && p.prepaid > 400000, `a prepayment larger than the loan pays it off: only the ₹${Math.round(p.prepaid)} still owed is counted`); }
  { const p = F.prepayPlan(m, 500000, 0, 5, 100000, 12, false, false); t.ok(p.interest === 0 && p.saved === 0 && p.monthsSaved === 12, 'a loan without interest: nothing to save but time'); }
  for (const [args, reason] of [[[0, 8.5, 20, 200000, 12], 'The outstanding principal must be more than 0.'], [[2500000, -1, 20, 200000, 12], 'The interest rate cannot be negative.'], [[2500000, 8.5, 0, 200000, 12], 'The remaining tenure must be more than 0.'],
    [[2500000, 8.5, 150, 200000, 12], 'The remaining tenure is too long — at most 100 years (1,200 months).'], [[2500000, 8.5, 20, 0, 12], 'The prepayment must be more than 0.'], [[2500000, 8.5, 20, -5, 12], 'The prepayment must be more than 0.'],
    [[2500000, 8.5, 20, 200000, -1], 'Prepay after: a whole number of months, 0 or more (0 = before the next instalment).'], [[2500000, 8.5, 20, 200000, 2.5], 'Prepay after: a whole number of months, 0 or more (0 = before the next instalment).'],
    [[2500000, 8.5, 20, 200000, 240], 'Prepay after: the loan has only 240 months left — choose a month before its last.'], [[2500000, 8.5, 20, 200000, 500], 'Prepay after: the loan has only 240 months left — choose a month before its last.']])
    t.eq(why(() => F.prepayPlan(m, ...args, false, false)), reason, `prepayPlan(${args}) is refused`);

  // ---- PPF
  bad = [];
  for (const [A, R, n, bal] of ref.ppf) { const p = F.ppfPlan(m, A, R, n); if (rel(p.balance, bal) > 1e-13 || p.invested !== A * n || p.years !== n || p.atMaturity !== (n >= 15 && n % 5 === 0)) bad.push(`₹${A} × ${n} y at ${R} %: ${p.balance} ≠ ${bal}`); }
  t.ok(ref.ppf.length === 192 && !bad.length, `${ref.ppf.length} PPF accounts agree with the closed form A·((1+r)ⁿ − 1)/r·(1+r) to 13 digits ${bad.slice(0, 3).join(' | ')}`);
  { const p = F.ppfPlan(m, 150000, 7.1, 15); t.ok(Math.round(p.balance) === 4068209 && p.invested === 2250000 && Math.round(p.interest) === 1818209 && p.atMaturity, `₹1.5 lakh a year for 15 years at 7.1 %: ₹${Math.round(p.balance)}`); }
  for (const [args, reason] of [[[499, 7.1, 15], 'A PPF account needs at least ₹500 a year.'], [[0, 7.1, 15], 'A PPF account needs at least ₹500 a year.'], [[-5000, 7.1, 15], 'A PPF account needs at least ₹500 a year.'], [[150001, 7.1, 15], 'The PPF limit is ₹1,50,000 per financial year.'],
    [[150000, -1, 15], 'The interest rate cannot be negative.'], [[150000, 7.1, 0], 'Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).'], [[150000, 7.1, 15.6], 'Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).'],
    [[150000, 7.1, -3], 'Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).'], [[150000, 7.1, 1e9], 'Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).']])
    t.eq(why(() => F.ppfPlan(m, ...args)), reason, `ppfPlan(${args}) is refused`);
  t.ok(!F.ppfPlan(m, 150000, 7.1, 7).atMaturity && F.ppfPlan(m, 150000, 7.1, 20).atMaturity && !F.ppfPlan(m, 150000, 7.1, 10).atMaturity, 'seven or ten years are before maturity, twenty is an extension');

  // ---- EPF, as the EPFO keeps the account
  bad = [];
  for (const [basic, age, ret, opening, inc, R, corpus, own, er, eps, interest] of ref.epf) {
    const p = F.epfPlan(m, basic, age, ret, opening, inc, R);
    if (rel(p.corpus, corpus) > 1e-12 || rel(p.own, own) > 1e-13 || rel(p.employer, er) > 1e-13 || rel(p.eps, eps) > 1e-13 || Math.abs(p.interest - interest) > Math.max(1e-6, corpus * 1e-12) || p.years !== ret - age) bad.push(`₹${basic}, ${age} → ${ret}, opening ₹${opening}, +${inc} %, ${R} %: ${JSON.stringify(p)} ≠ ${[corpus, own, er, eps, interest]}`);
    if (Math.abs(p.corpus - (p.opening + p.own + p.employer + p.interest)) > Math.max(1e-6, corpus * 1e-12)) bad.push(`₹${basic} ${age}→${ret}: the corpus is not opening + contributions + interest`);
  }
  t.ok(ref.epf.length === 144 && !bad.length, `${ref.epf.length} EPF accounts: corpus, the member's and the employer's contributions, the pension-scheme share and the interest — and the corpus is their sum ${bad.slice(0, 2).join(' | ')}`);
  { const p = F.epfPlan(m, 15000, 30, 31, 0, 0, 8.25); // one year at the wage ceiling: the EPFO's own arithmetic by hand
    const month = 1800 + (1800 - 1249.5), interest = month * (0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11) * 8.25 / 1200;
    t.ok(p.own === 21600 && rel(p.employer, 12 * 550.5) < 1e-12 && rel(p.eps, 12 * 1249.5) < 1e-12 && rel(p.interest, interest) < 1e-12 && rel(p.corpus, 12 * month + interest) < 1e-12, `one year on ₹15,000: ₹1,800 + ₹550.50 a month, interest on the opening balance of each month = ₹${interest.toFixed(2)} (monthly compounding on the month's own contribution gave ₹${(m.sip(month, 8.25, 1, 0, false).value - 12 * month).toFixed(2)})`); }
  { const p = F.epfPlan(m, 50000, 30, 58, 0, 6, 8.25); t.ok(p.years === 28 && Math.round(p.eps) === 419832 && Math.round(p.corpus) === 25634372 && Math.round(p.own) === 4934024 && Math.round(p.employer) === 4514192 && Math.round(p.interest) === 16186156, `the example: ₹${Math.round(p.corpus)} at 58, ₹${Math.round(p.eps)} of the employer's money in the pension scheme`); }
  t.eq(F.epfPlan(m, 50000, 30, 58, NaN, NaN, 8.25).corpus, F.epfPlan(m, 50000, 30, 58, 0, 0, 8.25).corpus, 'empty boxes for the balance and the raise are 0');
  for (const [args, reason] of [[[0, 30, 58, 0, 6, 8.25], 'The monthly basic + DA must be more than 0.'], [[50000, 30.5, 58, 0, 6, 8.25], 'Current age: a whole number of years from 15 to 74.'], [[50000, 10, 58, 0, 6, 8.25], 'Current age: a whole number of years from 15 to 74.'],
    [[50000, 30, 30, 0, 6, 8.25], 'Retirement age: a whole number of years above 30, at most 75.'], [[50000, 30, 25, 0, 6, 8.25], 'Retirement age: a whole number of years above 30, at most 75.'], [[50000, 30, 1e9, 0, 6, 8.25], 'Retirement age: a whole number of years above 30, at most 75.'],
    [[50000, 30, 58, -1, 6, 8.25], 'The current EPF balance cannot be negative.'], [[50000, 30, 58, 0, -6, 8.25], 'The yearly salary increase cannot be negative.'], [[50000, 30, 58, 0, 101, 8.25], 'The yearly salary increase is too high — at most 100 %.'], [[50000, 30, 58, 0, 6, -1], 'The EPF interest rate cannot be negative.']])
    t.eq(why(() => F.epfPlan(m, ...args)), reason, `epfPlan(${args}) is refused`);

  // ---- NPS
  bad = [];
  for (const [A, age, R, ap, ar, corpus, pension, lump, invested] of ref.nps) {
    const p = F.npsPlan(m, A, age, R, 'other', ap, ar);
    if (rel(p.corpus, corpus) > 1e-13 || rel(p.pension, pension) > 1e-13 || Math.abs(p.lump - lump) > corpus * 1e-13 + 1e-6 || p.invested !== invested || p.months !== (60 - age) * 12 || Math.abs(p.lump + p.annuity - p.corpus) > corpus * 1e-13) bad.push(`₹${A} from ${age} at ${R} %, ${ap} % annuity at ${ar} %: ${JSON.stringify(p)} ≠ ${[corpus, pension, lump]}`);
  }
  t.ok(ref.nps.length === 90 && !bad.length, `${ref.nps.length} NPS accounts: the corpus at 60 (closed form, checked with numpy-financial), the lump sum, the pension the annuity buys ${bad.slice(0, 2).join(' | ')}`);
  { const p = F.npsPlan(m, 10000, 30, 10, 'other', 40, 6); t.ok(Math.round(p.corpus) === 22793253 && Math.round(p.pension) === 45587 && Math.round(p.lump) === 13675952 && p.invested === 3600000, `the example: ₹${Math.round(p.corpus)} at 60, ₹${Math.round(p.pension)} a month`); }
  t.ok(F.npsPlan(m, 10000, 30, 10, 'other', 20, 6).lump > F.npsPlan(m, 10000, 30, 10, 'other', 40, 6).lump, 'a non-government subscriber may keep 80 % as a lump sum (since December 2025)');
  t.eq(why(() => F.npsPlan(m, 10000, 30, 10, 'other', 10, 6)), 'At least 20 % of the corpus must buy an annuity (non-government subscribers, since December 2025).', '10 % for an annuity (it was quietly raised to 40 %)');
  t.eq(why(() => F.npsPlan(m, 10000, 30, 10, 'gov', 30, 6)), 'At least 40 % of the corpus must buy an annuity (government subscribers).', 'a government subscriber with 30 %');
  t.ok(F.npsPlan(m, 10000, 30, 10, 'gov', 40, 6).annuity > 0, '… 40 % is taken');
  for (const [args, reason] of [[[0, 30, 10, 'other', 40, 6], 'The monthly contribution must be more than 0.'], [[10000, 60, 10, 'other', 40, 6], 'Current age: a whole number of years from 18 to 59 (this calculator runs to the age of 60).'], [[10000, 17, 10, 'other', 40, 6], 'Current age: a whole number of years from 18 to 59 (this calculator runs to the age of 60).'],
    [[10000, 30.5, 10, 'other', 40, 6], 'Current age: a whole number of years from 18 to 59 (this calculator runs to the age of 60).'], [[10000, 30, -1, 'other', 40, 6], 'The expected return cannot be negative.'], [[10000, 30, 10, 'other', 150, 6], 'The annuity cannot take more than 100 % of the corpus.'],
    [[10000, 30, 10, 'other', 40, -6], 'The annuity rate cannot be negative.'], [[10000, 30, 10, 'other', 40, 101], 'The annuity rate is too high — at most 100 % a year.']])
    t.eq(why(() => F.npsPlan(m, ...args)), reason, `npsPlan(${args}) is refused`);

  // ---- inflation
  bad = []; let refused = 0;
  for (const [A, R, Y, future, worth, doubling] of ref.inflation) {
    const msg = why(() => {
      const p = F.inflation(m, A, R, Y);
      if (rel(p.future, future) > 1e-14 || rel(p.worth, worth) > 1e-14 || (doubling === null ? p.doubling !== null : rel(p.doubling, doubling) > 1e-13) || Math.abs(p.lostPct - (1 - A / future) * 100) > 1e-9) bad.push(`₹${A} at ${R} % for ${Y} y: ${JSON.stringify(p)} ≠ ${[future, worth, doubling]}`);
    });
    if (future === null || future > F.MAX_RESULT || worth > F.MAX_RESULT) { refused++; if (!/beyond ₹10,000 lakh crore/.test(msg)) bad.push(`₹${A} at ${R} % for ${Y} y: ${future} was not refused (${msg})`); } else if (msg) bad.push(`₹${A} at ${R} % for ${Y} y: refused — ${msg}`);
  }
  t.ok(ref.inflation.length === 240 && !bad.length && refused > 5, `${ref.inflation.length} cases of inflation (and deflation): future cost, what today's money will be worth, years to double or halve; ${refused} beyond the limit refused ${bad.slice(0, 2).join(' | ')}`);
  { const p = F.inflation(m, 100000, 6, 20); t.ok(Math.round(p.future) === 320714 && Math.round(p.worth) === 31180 && Math.abs(p.lostPct - 68.82) < 0.01 && Math.abs(p.doubling - 11.896) < 0.001, `the example: ₹1 lakh at 6 % for 20 years costs ₹${Math.round(p.future)}; prices double in ${p.doubling.toFixed(1)} years`); }
  t.eq(F.inflation(m, 100000, 0, 20).doubling, null, 'without inflation prices never double');
  { const p = F.inflation(m, 100000, -2, 20); t.ok(p.future < 100000 && p.worth > 100000 && p.lostPct < 0 && p.doubling > 34 && p.doubling < 35, `deflation of 2 %: prices halve in ${p.doubling.toFixed(1)} years`); }
  for (const [args, reason] of [[[0, 6, 20], 'The amount must be more than 0.'], [[100000, -100, 20], 'The inflation rate must be above −100 % a year.'], [[100000, 1001, 20], 'The inflation rate is too high — at most 1,000 % a year.'], [[100000, 6, 0], 'The number of years must be more than 0.'], [[100000, 6, -5], 'The number of years must be more than 0.'], [[100000, 6, 101], 'The number of years is too long — at most 100 years.']])
    t.eq(why(() => F.inflation(m, ...args)), reason, `inflation(${args}) is refused`);
};
