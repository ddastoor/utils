// PPF (#/ppf): a yearly deposit before 5 April, compounded yearly — against the closed form in mpmath
// (tests/fixtures/finance2/reference.json); the ₹500 – ₹1.5 lakh limits; whole years; phone layout.
import { readFileSync } from 'node:fs';
import { calc, num, inr } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/finance2/reference.json', import.meta.url), 'utf8'));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/ppf`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const A = 'Yearly deposit (₹500 – ₹1.5 lakh)', R = 'Interest rate (current notified rate)';
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');
  ok(await c.big('Maturity value') === '₹40,68,209' && await c.big('Total deposited') === '₹22,50,000' && await c.big('Interest earned') === '₹18,18,209' && !(await note()), `₹1.5 lakh a year at 7.1 % for 15 years: ₹40,68,209 (the published figure) — ${await c.big('Maturity value')}`);
  let bad = [];
  for (const [a, r, n, bal] of ref.ppf.filter((_, i) => i % 4 === 0)) {
    await c.set(A, a); await c.set(R, r); await c.set('Years', n);
    const got = [await c.big('Maturity value'), await c.big('Interest earned'), await c.big('Total deposited')], atMaturity = n >= 15 && n % 5 === 0;
    if (Math.abs(num(got[0]) - bal) > 0.51 || got[2] !== inr(a * n) || num(got[1]) !== num(got[0]) - a * n || !!(await note()) === atMaturity) bad.push(`₹${a} × ${n} y at ${r} %: ${got} ≠ ${Math.round(bal)} (note: ${await note()})`);
  }
  ok(!bad.length, `48 accounts of the reference: maturity value to the rupee, interest = maturity − deposits as shown, a note when the years are not a maturity ${bad.slice(0, 3).join(' | ')}`);
  await c.set(A, 150000); await c.set(R, 7.1); await c.set('Years', 7);
  ok(await note() === 'A PPF account matures after 15 years and can then be extended 5 years at a time — this is the balance after 7 years.', `seven years is before maturity, and said (${await note()})`);
  await c.set('Years', 20); ok(!(await note()) && await c.big('Total deposited') === '₹30,00,000', 'twenty years: one extension');
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await c.set('Years', 15.6); await refused('15.6 years (the balance was for 16 years, the deposits for 15.6)', 'Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).');
  await c.set('Years', 0); await refused('0 years', 'Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).');
  await c.set('Years', -5); await refused('−5 years (it showed "Interest earned ₹7,50,000")', 'Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).');
  await c.set('Years', 1000000000); await refused('a thousand million years', 'Years: a whole number from 1 to 50 (the account runs 15 years, then in blocks of 5).');
  await c.set('Years', 15); await c.set(A, 150001); await refused('a rupee over the limit', 'The PPF limit is ₹1,50,000 per financial year.');
  await c.set(A, 499); await refused('under the minimum deposit (it was accepted)', 'A PPF account needs at least ₹500 a year.');
  await c.set(A, -5000); await refused('a negative deposit', 'A PPF account needs at least ₹500 a year.');
  await c.set(A, 150000); await c.set(R, -1); await refused('a negative rate', 'The interest rate cannot be negative.');
  await c.set(R, ''); await refused('an empty rate', 'Fill in all the numbers.');
  await c.set(R, 7.1);
  ok(await c.big('Maturity value') === '₹40,68,209' && await c.row('Tax status') === 'EEE — deposit (80C), interest and maturity tax-free', 'after the refusals the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/ppf`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: no horizontal scroll; 44 px boxes');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
