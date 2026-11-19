// EMI (#/emi): what the tab shows against the month-by-month reference (tests/fixtures/finance/reference.json, mpmath +
// numpy-financial), the schedule cell by cell, tenure in years or months, what is refused and why, phone layout.
import { calc, num, inr, financeRef } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';

export default async ({ base, page: newPage, ok, devices }) => {
  const ref = await financeRef();
  const page = await newPage(); await page.goto(`${base}#/emi`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const body = () => page.locator('.tool-body').innerText();
  const unit = () => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Tenure$/ }) }).locator('.unit').textContent();
  const loan = async (p, r, n, months = false) => { await c.seg('Tenure in', months ? 'Months' : 'Years'); await c.set('Loan amount', p); await c.set('Interest rate', r); await c.set('Tenure', n); };
  const legend = async () => (await page.locator('.legend').innerText()).replace(/\s+/g, ' ').trim();

  // ---- the first view
  ok(await c.big('Monthly EMI') === '₹21,696' && await c.big('Total interest') === '₹27,06,939' && await c.big('Total payment') === '₹52,06,939', `default ₹25 lakh at 8.5 % for 20 years: ₹21,696 a month, ₹27,06,939 interest, ₹52,06,939 in all (${await c.big('Monthly EMI')}, ${await c.big('Total interest')}, ${await c.big('Total payment')})`);
  ok(await c.row('Instalments') === '240 monthly (20 years)', `the number of instalments is said (${await c.row('Instalments')})`);
  ok(await legend() === 'Principal 48.0% Interest 52.0%', `legend (${await legend()})`);
  { const w = await page.locator('.bar span').evaluateAll((e) => e.map((x) => parseFloat(x.style.width)));
    ok(Math.abs(w[0] - 48.0128) < 0.01 && Math.abs(w[0] + w[1] - 100) < 0.001, `the bar is split 48 : 52 (${w})`); }
  ok(await unit() === 'years' && !(await c.warn()) && !(await page.locator('.calc-note').count()), 'tenure in years, no warning, no note');

  // ---- loans of the reference: instalment to the rupee, totals on the exact instalment
  const pick = ref.emi.filter(([p, r, n]) => p <= 2e8 && r >= 1 && r <= 36 && n >= 12 && n % 12 === 0 && n <= 360).filter((_, i) => i % 5 === 0);
  let bad = [];
  for (const [p, r, n, emi] of pick) {
    await loan(p, r, n / 12);
    const got = [await c.big('Monthly EMI'), await c.big('Total interest'), await c.big('Total payment')], want = [inr(Math.round(emi)), inr(Math.round(emi * n - p)), inr(Math.round(emi * n))];
    // the totals are sums of n instalments: a last-digit difference of the doubles may move a half rupee
    if (got[0] !== want[0] || Math.abs(num(got[1]) - num(want[1])) > 1 || Math.abs(num(got[2]) - num(want[2])) > 1) bad.push(`${p} @ ${r} % × ${n}: ${got} ≠ ${want}`);
  }
  ok(pick.length >= 20 && !bad.length, `${pick.length} loans of the reference: EMI to the rupee, interest and total within a rupee ${bad.slice(0, 3).join(' | ')}`);

  // ---- tenure in months: the unit beside the box follows, the number stays
  await loan(300000, 12, 18, true);
  ok(await unit() === 'months', `"Tenure in: Months" → the box says months (${await unit()})`);
  ok(await c.big('Monthly EMI') === inr(Math.round(ref.emi_full.find((x) => x.n === 18).emi)) && await c.row('Instalments') === '18 monthly (1 year 6 months)', `₹3 lakh at 12 % for 18 months: ${await c.big('Monthly EMI')}, ${await c.row('Instalments')}`);
  await c.seg('Tenure in', 'Years');
  ok(await unit() === 'years' && await c.row('Instalments') === '216 monthly (18 years)', `back to years: the 18 in the box is 18 years (${await c.row('Instalments')})`);
  await c.seg('Tenure in', 'Months'); await c.set('Tenure', 7); await c.set('Loan amount', 40000); await c.set('Interest rate', 36);
  ok(await c.row('Instalments') === '7 monthly' && await c.big('Monthly EMI') === inr(Math.round(ref.emi_full.find((x) => x.n === 7).emi)), `7 months: ${await c.row('Instalments')}, ${await c.big('Monthly EMI')}`);

  // ---- no interest
  await loan(300000, 0, 18, true);
  ok(await c.big('Monthly EMI') === '₹16,667' && await c.big('Total interest') === '₹0' && await c.big('Total payment') === '₹3,00,000' && await legend() === 'Principal 100.0% Interest 0.0%', `0 %: the loan divided by the months (${await c.big('Monthly EMI')}, ${await legend()})`);

  // ---- the schedule, every cell, against the reference
  const table = () => page.locator('.tbl tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.textContent.trim())));
  for (const [p, r, n, months] of [[1000000, 8.5, 60, false], [300000, 12, 18, true], [80000, 14, 12, true], [500000, 0, 36, true], [7500000, 7.1, 360, true]]) {
    const full = ref.emi_full.find((x) => x.p === p && x.r === r && x.n === n);
    await loan(p, r, months ? n : n / 12, months);
    if (!(await page.locator('details').evaluate((d) => d.open))) await page.getByText('Year-by-year schedule').click();
    const rows = await table(), part = n % 12;
    const want = full.rows.map((y, i) => [`Year ${i + 1}${part && i === full.rows.length - 1 ? ` (${part} months)` : ''}`, ...y.map((v) => inr(Math.abs(v) < 0.005 ? 0 : v))]);
    const off = want.findIndex((w, i) => !rows[i] || w[0] !== rows[i][0] || w.slice(1).some((x, k) => Math.abs(num(x) - num(rows[i][k + 1])) > 0.011));
    ok(rows.length === want.length && off < 0, `schedule of ${p} @ ${r} % × ${n} months: ${rows.length} rows, every cell within a paisa${off >= 0 ? ` — row ${off + 1}: ${rows[off]} ≠ ${want[off]}` : ''}`);
    ok(rows[rows.length - 1][3] === '₹0', `… and it ends at ₹0 (${rows[rows.length - 1][3]})`);
    const sum = (k) => rows.reduce((a, row) => a + num(row[k]), 0);
    ok(Math.abs(sum(1) - p) < 0.01 * rows.length && Math.abs(sum(2) - num(await c.big('Total interest'))) < 1 + 0.01 * rows.length, `… principal adds up to the loan, interest to the total interest (${sum(1).toFixed(2)}, ${sum(2).toFixed(2)})`);
    ok(rows.every((row) => row.slice(1).every((x) => /^₹[\d,]+(\.\d\d)?$/.test(x))), '… amounts are whole rupees or rupees with both digits of the paise');
  }
  { await loan(300000, 12, 18, true); const rows = await table(); ok(rows.length === 2 && rows[1][0] === 'Year 2 (6 months)', `a last year of 6 months is labelled so (${rows.map((x) => x[0])})`); }
  // the schedule stays open while the numbers change (it folded on every keystroke)
  await c.set('Interest rate', 9);
  ok(await page.locator('details').evaluate((d) => d.open), 'the opened schedule stays open when a number changes');
  await c.set('Loan amount', ''); await c.set('Loan amount', 250000);
  ok(await page.locator('details').count() === 1, 'after an empty box the schedule is back');

  // ---- a tenure that is not whole months
  await loan(2500000, 8.5, 20.04);
  ok(await c.big('Monthly EMI') === '₹21,696' && /^Instalments are monthly, so the tenure is counted as 20 years\.$/.test((await page.locator('.calc-note').innerText()).trim()), `20.04 years: counted as 20 years, and said (${await page.locator('.calc-note').allInnerTexts()})`);
  await c.set('Tenure', 2.3);
  ok(await c.row('Instalments') === '28 monthly (2 years 4 months)' && /counted as 2 years 4 months/.test(await page.locator('.calc-note').innerText()), `2.3 years: 28 instalments (${await c.row('Instalments')})`);
  await c.set('Tenure', 1.5);
  ok(await c.row('Instalments') === '18 monthly (1 year 6 months)' && !(await page.locator('.calc-note').count()), '1.5 years is 18 months exactly: no note');
  await c.seg('Tenure in', 'Months'); await c.set('Tenure', 18.5);
  ok(await c.row('Instalments') === '19 monthly (1 year 7 months)' && await page.locator('.calc-note').count() === 1, `18.5 months: 19 instalments, said (${await c.row('Instalments')})`);

  // ---- refused, with the reason — and never a number, a NaN or a raw error
  const refused = async (label, want) => { const w = await c.warn(), text = await body(); ok(w === want && !(await page.locator('.big-result').count()) && !/NaN|undefined|Invalid/.test(text), `${label} → "${want}" (${w || text.slice(-80)})`); };
  await loan(0, 8.5, 20); await refused('a loan of 0 (the legend read "Principal NaN%")', 'The loan amount must be more than 0.');
  await c.set('Loan amount', -100000); await refused('a negative loan (it had a negative EMI)', 'The loan amount must be more than 0.');
  await c.set('Loan amount', 2e13); await refused('₹20 lakh crore', 'The loan amount is too large — this calculator goes up to ₹10 lakh crore.');
  await c.set('Loan amount', 2500000); await c.set('Interest rate', -5); await refused('a negative rate ("Principal 172.4% Interest -72.4%")', 'The interest rate cannot be negative.');
  await c.set('Interest rate', 1200); await refused('1,200 % a year', 'The interest rate is too high — at most 1,000 % a year.');
  await c.set('Interest rate', 8.5); await c.set('Tenure', 0); await refused('a tenure of 0', 'The tenure must be more than 0.');
  await c.set('Tenure', -3); await refused('a tenure of −3 years ("Invalid typed array length: -6")', 'The tenure must be more than 0.');
  await c.set('Tenure', 0.04); await refused('0.04 years', 'The tenure must be at least 1 month.');
  await c.set('Tenure', 150); await refused('150 years (the schedule stopped at year 100)', 'The tenure is too long — at most 100 years (1,200 months).');
  await c.set('Tenure', 357913942); await refused('357,913,942 years (it was worked out as 8 months)', 'The tenure is too long — at most 100 years (1,200 months).');
  await c.seg('Tenure in', 'Months'); await c.set('Tenure', 1201); await refused('1,201 months', 'The tenure is too long — at most 100 years (1,200 months).');
  await c.set('Tenure', ''); await refused('an empty tenure', 'Fill in all the numbers.');
  await c.set('Tenure', 1200);
  ok(await c.big('Monthly EMI') === '₹17,712' && await c.row('Instalments') === '1,200 monthly (100 years)' && await page.locator('.tbl tbody tr').count() === 100, `100 years is the longest tenure: ${await c.big('Monthly EMI')}, 100 rows`);

  // ---- the ends of the range still have answers
  await loan(2500000, 0.0000000000001, 20);
  ok(await c.big('Monthly EMI') === '₹10,417' && await c.big('Total interest') === '₹0', `a rate of 10⁻¹³ %: ₹10,417 (it showed —) (${await c.big('Monthly EMI')})`);
  await loan(1000000, 1000, 100);
  ok(await c.big('Monthly EMI') === '₹8,33,333' && await c.big('Total payment') === '₹1,00,00,00,000', `1,000 % for 100 years: interest only, ₹8,33,333 a month (${await c.big('Monthly EMI')}, ${await c.big('Total payment')})`);
  await loan(1e13, 8.5, 20);
  ok(await c.big('Monthly EMI') === inr(Math.round(1e13 * 0.00867823233365534)), `₹10 lakh crore: ${await c.big('Monthly EMI')}`);
  await loan(1, 8.5, 1, true);
  ok(await c.big('Monthly EMI') === '₹1' && await c.row('Instalments') === '1 monthly', `₹1 for one month (${await c.big('Monthly EMI')}, ${await c.row('Instalments')})`);

  // ---- a click copies the figure
  await loan(2500000, 8.5, 20); await hookClipboard(page);
  await page.locator('.big-result').first().click();
  ok((await copied(page)).join() === '₹21,696', `a click on the EMI copies it (${await copied(page)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/emi`); await ph.locator('.big-value').first().waitFor(); const pc = calc(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  await ph.getByText('Year-by-year schedule').click();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.locator('.tbl tbody tr').count() === 20, 'phone: the opened schedule (20 rows) does not widen the page');
  await pc.seg('Tenure in', 'Months');
  ok(await pc.row('Instalments') === '20 monthly (1 year 8 months)' && await ph.evaluate(() => [...document.querySelectorAll('.seg-btn')].every((b) => b.getBoundingClientRect().height >= 44)), 'phone: the choice of years or months is a 44 px touch target and works');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
