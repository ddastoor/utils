// Loan Prepayment (#/prepay): the loan month by month with a part-prepayment — once or every year, the instalment kept
// (the loan ends sooner) or the tenure kept (a lower instalment) — against the reference's own simulation in mpmath
// (tests/fixtures/finance2/reference.json); what is refused and why; phone layout.
import { readFileSync } from 'node:fs';
import { calc, num, inr } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/finance2/reference.json', import.meta.url), 'utf8'));
const span = (m) => { const y = Math.floor(m / 12), r = m % 12, s = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`; return [y ? s(y, 'year') : '', r || !y ? s(r, 'month') : ''].filter(Boolean).join(' '); };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/prepay`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const set = async (P, R, years, pp, when, yearly, keep) => {
    await c.set('Outstanding principal', P); await c.set('Interest rate', R); await c.set('Remaining tenure', years); await c.set('Prepayment amount', pp); await c.set('Prepay after', when);
    if (yearly !== undefined) await c.seg('Prepayment', yearly ? 'Every year' : 'One time'); if (keep !== undefined) await c.seg('After prepaying, keep', keep ? 'Same tenure (lower EMI)' : 'Same EMI (shorter tenure)');
  };
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');

  // ---- the first view
  { const r = await c.rows();
    ok(await c.big('Interest saved') === '₹6,68,336' && await c.big('Loan ends') === '3 years 4 months earlier' && r['Original EMI'] === '₹21,696' && r['Months to close'] === '200 (was 240)' && r['Prepaid in all'] === '₹2,00,000', `₹2 lakh after a year on ₹25 lakh at 8.5 % for 20 years: ends 3 years 4 months sooner, saves ₹6,68,336 — the two interests as shown, ₹27,06,939 − ₹20,38,603 (${await c.big('Interest saved')}, ${await c.big('Loan ends')}, ${JSON.stringify(r)})`);
    ok(num(r['Interest without prepayment']) - num(r['Interest with prepayment']) === num(await c.big('Interest saved')), 'interest saved is the difference of the two interests as shown'); }
  await c.seg('After prepaying, keep', 'Same tenure (lower EMI)');
  ok(await c.big('New EMI') === '₹19,925' && await c.big('Interest saved') === '₹2,03,763' && await c.row('Months to close') === '240 (was 240)', `… or the instalment falls to ₹19,925 (${await c.big('New EMI')})`);

  // ---- prepayments of the reference
  const pick = ref.prepay.filter(([P, , n]) => P >= 120000 && n % 12 === 0).filter((_, i) => i % 9 === 0);
  let bad = [];
  for (const [P, R, n, pp, when, yearly, keep, emi, baseI, interest, months, last, prepaid, ended] of pick) {
    await set(P, R, n / 12, pp, when, !!yearly, !!keep);
    const r = await c.rows(), near = (got, want) => Math.abs(num(got) - want) <= 1, second = keep && !ended ? ['New EMI', (v) => near(v, last)] : ['Loan ends', (v) => v === (n - months ? `${span(n - months)} earlier` : 'No earlier')];
    const big2 = await c.big(second[0]).catch(() => null);
    if (!near(await c.big('Interest saved'), baseI - interest) || big2 === null || !second[1](big2) || !near(r['Original EMI'], emi) || !near(r['Interest with prepayment'], interest) || !near(r['Prepaid in all'], prepaid) || r['Months to close'] !== `${months} (was ${n})` || !!(await note()) !== !!ended)
      bad.push(`₹${P} at ${R} % × ${n}, ₹${pp} after ${when}${yearly ? ' yearly' : ''}, keep ${keep ? 'tenure' : 'EMI'}: ${await c.big('Interest saved')} / ${big2} / ${JSON.stringify(r)} / "${await note()}" ≠ ${[baseI - interest, months, last, prepaid, ended]}`);
  }
  ok(pick.length >= 40 && !bad.length, `${pick.length} prepayments of the reference: interest saved, months, the new instalment, what was prepaid — and the note when a prepayment closes the loan ${bad.slice(0, 2).join(' | ')}`);

  // ---- prepaying now; a prepayment larger than the loan; yearly
  await set(2500000, 8.5, 20, 200000, 0, false, false);
  ok(await c.big('Interest saved') === '₹7,34,480' && await c.row('Interest with prepayment') === '₹19,72,459' && await c.row('Months to close') === '197 (was 240)' && !(await c.warn()), `prepaying now — "after 0 months" — saves ₹7,34,480 (₹27,06,939 − ₹19,72,459) and ends the loan 43 months sooner, more than after a year: ${await c.big('Interest saved')}, ${await c.row('Months to close')}`);
  await set(500000, 9, 5, 9000000, 6);
  ok(await c.big('Loan ends') === '4 years 6 months earlier' && num(await c.row('Prepaid in all')) < 500000 && await note() === 'The prepayment pays the loan off: only what was still owed is counted.', `₹90 lakh against a ₹5 lakh loan: it is paid off, and only what was owed is counted (${await c.row('Prepaid in all')}; ${await note()})`);
  await set(2500000, 8.5, 20, 200000, 12, true, false);
  ok(await c.row('Months to close') === '95 (was 240)' && await c.row('Prepaid in all') === '₹14,00,000' && await c.big('Interest saved') === '₹17,62,464' && !(await note()), `₹2 lakh every year: seven prepayments, closed in 95 months, ₹17,62,464 saved (${await c.row('Months to close')}, ${await c.row('Prepaid in all')}, ${await c.big('Interest saved')})`);
  await set(500000, 0, 5, 100000, 12, false, false);
  ok(await c.big('Interest saved') === '₹0' && await c.big('Loan ends') === '1 year earlier', 'a loan without interest: nothing to save but time');

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await set(2500000, 8.5, 20, 200000, 240); await refused('prepaying after the last instalment (it showed "Interest saved ₹0")', 'Prepay after: the loan has only 240 months left — choose a month before its last.');
  await c.set('Prepay after', 2.5); await refused('after two and a half months', 'Prepay after: a whole number of months, 0 or more (0 = before the next instalment).');
  await c.set('Prepay after', -1); await refused('after −1 months', 'Prepay after: a whole number of months, 0 or more (0 = before the next instalment).');
  await set(2500000, 8.5, 20, 0, 12); await refused('a prepayment of 0', 'The prepayment must be more than 0.');
  await set(2500000, 8.5, 0, 200000, 12); await refused('no tenure left (it showed dashes)', 'The remaining tenure must be more than 0.');
  await set(-2500000, 8.5, 20, 200000, 12); await refused('a negative loan', 'The outstanding principal must be more than 0.');
  await set(2500000, -8.5, 20, 200000, 12); await refused('a negative rate', 'The interest rate cannot be negative.');
  await set(2500000, 8.5, 20, 200000, ''); await refused('an empty month', 'Fill in all the numbers.');
  await set(2500000, 8.5, 20, 200000, 12);
  ok(await c.big('Interest saved') === '₹6,68,336' && !/NaN|undefined|—/.test(await page.locator('.calc-result').innerText()), 'after the refusals the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/prepay`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .seg-btn, .tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: boxes and choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
