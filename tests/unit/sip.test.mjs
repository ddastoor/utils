// SIP / lump sum: mathcore's m_sip and the tab's reading of its input (src/lib/finance.ts) against
// tests/fixtures/finance/reference.json — the instalments carried forward month by month in mpmath at 60 digits,
// cross-checked with numpy-financial's fv (scripts/make-finance-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const F = await load('/src/lib/finance.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/finance/reference.json'), 'utf8'));
  const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const TOO_LARGE = 'The result is beyond ₹10,000 lakh crore — more than this calculator can show. Check the rate and the period.';

  // ---- 1,430 monthly plans: ₹10,000 and ₹1,23,456.78 a month, −50 % to 1,000 % a year, 1 to 1,200 months, step-ups to 100 %
  let worst = 0, bad = [], shown = 0, refused = 0;
  for (const [a, r, n, s, invested, value] of ref.sip) {
    const at = `₹${a} a month at ${r} % for ${n} months, step-up ${s} %`;
    // the engine, wherever a double can hold the answer
    if (value !== null && invested !== null) {
      const g = m.sip(a, r, n / 12, s, false), e = Math.max(rel(g.value, value), rel(g.invested, invested));
      if (e > worst) worst = e; if (e > 1e-13) bad.push(`${at}: engine ${g.invested} / ${g.value} ≠ ${invested} / ${value}`);
    }
    // the tab: an answer up to ₹10,000 lakh crore, a refusal beyond
    const big = value === null || invested === null || value > F.MAX_RESULT || invested > F.MAX_RESULT, msg = why(() => {
      const p = F.sipPlan(m, 'sip', a, r, n / 12, s);
      if (p.months !== n || p.rounded || rel(p.value, value) > 1e-12 || rel(p.invested, invested) > 1e-12 || Math.abs(p.gains - (value - invested)) > 1e-12 * value + 1e-6) bad.push(`${at}: plan ${JSON.stringify(p)}`);
    });
    if (big) { refused++; if (msg !== TOO_LARGE) bad.push(`${at}: a result of ${value} was not refused (${msg})`); } else { shown++; if (msg) bad.push(`${at}: refused — ${msg}`); }
  }
  t.ok(ref.sip.length === 1430 && !bad.length, `${ref.sip.length} monthly plans agree with the month-by-month reference to 13 digits (worst ${worst.toExponential(1)}); ${shown} shown, ${refused} beyond ₹10,000 lakh crore refused ${bad.slice(0, 3).join(' | ')}`);
  t.ok(shown > 900 && refused > 100, `both kinds are well represented (${shown} / ${refused})`);

  // ---- 180 lump sums, half a year to a century
  bad = [];
  for (const [a, r, y, value] of ref.lump) {
    const at = `₹${a} at ${r} % for ${y} years`;
    if (value !== null && rel(m.sip(a, r, y, 0, true).value, value) > 1e-15) bad.push(`${at}: engine ${m.sip(a, r, y, 0, true).value} ≠ ${value}`);
    const msg = why(() => { const p = F.sipPlan(m, 'lump', a, r, y, 0); if (p.months !== null || p.rounded || p.invested !== a || rel(p.value, value) > 1e-13 || rel(p.multiple, value / a) > 1e-12) bad.push(`${at}: plan ${JSON.stringify(p)}`); });
    if ((value === null || value > F.MAX_RESULT) !== (msg === TOO_LARGE) || (msg && msg !== TOO_LARGE)) bad.push(`${at}: ${value} → "${msg}"`);
  }
  t.ok(ref.lump.length === 180 && !bad.length, `${ref.lump.length} lump sums agree to the last digit of a double — also at −99 % for a century, where 1 − 0.99 raised to the 100th power had kept 13 — and those beyond the limit are refused ${bad.slice(0, 3).join(' | ')}`);

  // ---- known figures, and the closed form where there is one
  { const p = F.sipPlan(m, 'sip', 10000, 12, 15, 0);
    t.ok(Math.round(p.value) === 5045760 && p.invested === 1800000 && p.months === 180 && Math.round(p.gains) === 3245760, `₹10,000 a month at 12 % for 15 years: ₹50,45,760 from ₹18,00,000 (${Math.round(p.value)})`);
    t.near(p.multiple, 2.8032, 1e-4, 'wealth multiple 2.80'); }
  for (const [a, r, n] of [[5000, 10, 120], [2500, 15, 300], [25000, 8, 60], [100, 12, 12], [1000, 7.3, 37]]) {
    const i = r / 1200, closed = a * ((1 + i) ** n - 1) / i * (1 + i);
    t.ok(rel(m.sip(a, r, n / 12, 0, false).value, closed) < 1e-12, `₹${a} × ${n} months at ${r} %: the annuity-due formula P·((1+i)ⁿ − 1)/i·(1+i) = ${Math.round(closed)}`);
  }
  t.eq(m.sip(1000, 0, 2, 0, false).value, 24000, 'no return: what was paid in');
  { const a = m.sip(10000, 12, 10, 10, false), [, , , , inv, val] = ref.sip.find((x) => x[0] === 10000 && x[1] === 12 && x[2] === 120 && x[3] === 10);
    t.ok(Math.round(a.invested) === 1912491 && Math.round(a.invested) === Math.round(inv) && Math.round(a.value) === Math.round(val), `10 % yearly step-up over 10 years: ₹${Math.round(a.invested)} → ₹${Math.round(a.value)} (reference ₹${Math.round(val)})`); }
  { const a = m.sip(10000, 12, 1, 50, false), b = m.sip(10000, 12, 1, 0, false); t.ok(a.value === b.value && a.invested === 120000, 'a step-up changes nothing in the first twelve months'); }
  { const a = m.sip(1000, 0, 3, 100, false); t.eq(a.invested, 12000 + 24000 + 48000, 'a 100 % step-up doubles the instalment each year'); }
  t.near(m.sip(100000, 12, 15, 0, true).value, 100000 * 1.12 ** 15, 1e-6, 'lump sum: ₹1 lakh at 12 % for 15 years');
  t.near(m.sip(10000, 12, 2.5, 0, true).value, 10000 * 1.12 ** 2.5, 1e-9, 'a lump sum for two and a half years');
  t.eq(m.sip(10000, -100, 3, 0, true).value, 0, 'a lump sum at −100 %: nothing left');

  // ---- a period is whole months, and never a loop of a thousand million turns
  { const t0 = performance.now(), g = m.sip(10000, 12, 3e7, 0, false), ms = performance.now() - t0;
    t.ok(ms < 200 && g.invested === 10000 * 12000, `3 × 10⁷ years: the engine stops at 12,000 months (it ran 3.6 × 10⁸ turns: 1.6 s in the tab) — ${ms.toFixed(0)} ms`); }
  t.eq(m.sip(10000, 12, -5, 0, false).invested, 0, 'a negative period: nothing');
  t.eq(m.sip(10000, 12, 1e300, 0, false).invested, 10000 * 12000, 'a period no integer can hold');
  t.eq(m.sip(10000, 12, NaN, 0, false).invested, 0, 'not a number: nothing');

  // ---- the tab's reading of its input
  const plan = (mode, a, r, y, s = 0) => F.sipPlan(m, mode, a, r, y, s);
  for (const [y, months, rounded] of [[15.04, 180, true], [1.5, 18, false], [0.1, 1, true], [2.3, 28, true], [1 / 12, 1, false], [100, 1200, false], [13 / 12, 13, false]]) {
    const p = plan('sip', 10000, 12, y); t.ok(p.months === months && p.rounded === rounded, `${y} years → ${months} instalments${rounded ? ', said to be rounded' : ''}`);
  }
  { const p = plan('lump', 10000, 12, 2.5); t.ok(p.months === null && !p.rounded && rel(p.value, 10000 * 1.12 ** 2.5) < 1e-13, 'a lump sum keeps a period of two and a half years as it is'); }
  { const p = plan('sip', 10000, -5, 15); t.ok(p.value < p.invested && p.gains < 0 && p.multiple < 1 && p.value > 0, `a return of −5 %: a loss, ${Math.round(p.gains)}`); }
  { const p = plan('sip', 10000, -99.99, 15); t.ok(p.value > 0 && p.multiple < 0.1, 'a return of −99.99 % is still taken'); }
  t.ok(plan('lump', 10000, 12, 3, -50).value === plan('lump', 10000, 12, 3, 0).value, 'a lump sum does not look at the step-up box');
  t.eq(why(() => plan('sip', 0, 12, 15)), 'The monthly amount must be more than 0.', 'a monthly amount of 0 (the tab showed "—×")');
  t.eq(why(() => plan('sip', -1000, 12, 15)), 'The monthly amount must be more than 0.', 'a negative monthly amount');
  t.eq(why(() => plan('lump', 0, 12, 15)), 'The amount must be more than 0.', 'a lump sum of 0');
  t.eq(why(() => plan('sip', 2e13, 12, 15)), 'The monthly amount is too large — this calculator goes up to ₹10 lakh crore.', 'too large an amount');
  t.eq(why(() => plan('sip', 10000, -100, 15)), 'The expected return must be above −100 % a year (at −100 % everything is lost).', 'a return of −100 %');
  t.eq(why(() => plan('sip', 10000, -1300, 15)), 'The expected return must be above −100 % a year (at −100 % everything is lost).', 'a return of −1,300 % (the tab showed a maturity value of −₹769)');
  t.eq(why(() => plan('lump', 10000, -150, 15)), 'The expected return must be above −100 % a year (at −100 % everything is lost).', 'a lump sum at −150 %');
  t.eq(why(() => plan('sip', 10000, 1001, 15)), 'The expected return is too high — at most 1,000 % a year.', 'a return above 1,000 %');
  t.eq(why(() => plan('sip', 10000, 12, 0)), 'The period must be more than 0.', 'a period of 0');
  t.eq(why(() => plan('sip', 10000, 12, -5)), 'The period must be more than 0.', 'a negative period');
  t.eq(why(() => plan('sip', 10000, 12, 0.01)), 'The period must be at least 1 month.', '0.01 years');
  t.eq(why(() => plan('sip', 10000, 12, 300)), 'The period is too long — at most 100 years (1,200 months).', '300 years');
  t.eq(why(() => plan('sip', 10000, 12, 3e7)), 'The period is too long — at most 100 years (1,200 months).', '3 × 10⁷ years');
  t.eq(why(() => plan('lump', 10000, 12, 0)), 'The period must be more than 0.', 'a lump sum for no time');
  t.eq(why(() => plan('lump', 10000, 12, -5)), 'The period must be more than 0.', 'a lump sum for −5 years (the tab showed ₹5,674)');
  t.eq(why(() => plan('lump', 10000, 12, 5000)), 'The period is too long — at most 100 years.', 'a lump sum for 5,000 years');
  t.eq(why(() => plan('sip', 10000, 12, 15, -10)), 'The yearly step-up cannot be negative.', 'a negative step-up (−150 % gave instalments that changed sign)');
  t.eq(why(() => plan('sip', 10000, 12, 15, 1500)), 'The yearly step-up is too high — at most 1,000 %.', 'a step-up of 1,500 %');
  t.eq(why(() => plan('sip', 10000, 1000, 100)), TOO_LARGE, '1,000 % for a century');
  t.eq(why(() => plan('sip', 1e13, 12, 40)), TOO_LARGE, '₹10 lakh crore a month for 40 years');
};
