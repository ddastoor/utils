// Inflation (#/inflation): future cost and what today's money will be worth, purchasing power, years to double —
// against mpmath (tests/fixtures/finance2/reference.json); deflation; what is refused; phone layout.
import { readFileSync } from 'node:fs';
import { calc, num } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/finance2/reference.json', import.meta.url), 'utf8'));
const WORTH = "Today's money is worth (in future)", n1 = (x) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(x);
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/inflation`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const set = async (a, r, y) => { await c.set('Amount today', a); await c.set('Inflation rate', r); await c.set('Years', y); };
  { const r = await c.rows(); ok(await c.big('Future cost of the same things') === '₹3,20,714' && await c.big(WORTH) === '₹31,180' && r['Purchasing power lost'] === '68.8%' && r['Prices multiply by'] === '3.21×' && r['Years for prices to double'] === '11.9', `₹1 lakh at 6 % for 20 years: ₹3,20,714; worth ₹31,180; prices double in 11.9 years (${JSON.stringify(r)})`); }
  let bad = [];
  for (const [A, R, Y, future, worth, doubling] of ref.inflation.filter(([A, R, Y, f, w]) => f !== null && f < 1e15 && w < 1e15 && A >= 1000).filter((_, i) => i % 3 === 0)) {
    await set(A, R, Y);
    const r = await c.rows(), near = (got, want) => Math.abs(num(got) - want) <= 0.51, key = R < 0 ? 'Years for prices to halve' : 'Years for prices to double';
    if (!near(await c.big('Future cost of the same things'), future) || !near(await c.big(WORTH), worth) || (doubling === null ? r[key] !== 'Never — prices stay as they are' : Math.abs(num(r[key]) - doubling) > 0.051) || !((R < 0 ? 'Purchasing power gained' : 'Purchasing power lost') in r)) bad.push(`₹${A} at ${R} % for ${Y} y: ${await c.big('Future cost of the same things')} / ${JSON.stringify(r)} ≠ ${[future, worth, doubling]}`);
  }
  ok(!bad.length, `cases of the reference from −50 % to 1,000 % and half a year to a century ${bad.slice(0, 2).join(' | ')}`);
  await set(100000, 0, 20);
  ok(await c.big('Future cost of the same things') === '₹1,00,000' && await c.row('Years for prices to double') === 'Never — prices stay as they are' && await c.row('Purchasing power lost') === '0%', `no inflation: prices never double (it showed a dash) — ${JSON.stringify(await c.rows())}`);
  await set(100000, -2, 20);
  { const r = await c.rows(); ok(await c.big('Future cost of the same things') === '₹66,761' && r['Purchasing power gained'] === '49.8%' && r['Years for prices to halve'] === '34.3', `deflation of 2 %: things get cheaper, money gains 49.8 %, prices halve in 34.3 years (it showed "Purchasing power lost −49.8%" and doubling in "−34.3" years) — ${JSON.stringify(r)}`); }
  await set(100000, 6, 2.5);
  ok(await c.big('Future cost of the same things') === '₹1,15,682', `two and a half years (${await c.big('Future cost of the same things')})`);
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await set(100000, 6, 0); await refused('no years', 'The number of years must be more than 0.');
  await c.set('Years', -5); await refused('−5 years', 'The number of years must be more than 0.');
  await c.set('Years', 5000); await refused('5,000 years (a screen full of digits)', 'The number of years is too long — at most 100 years.');
  await set(100000, -100, 20); await refused('inflation of −100 % (it showed ₹0 and "—")', 'The inflation rate must be above −100 % a year.');
  await set(100000, -150, 20); await refused('−150 %', 'The inflation rate must be above −100 % a year.');
  await set(-100000, 6, 20); await refused('a negative amount', 'The amount must be more than 0.');
  await set(100000, 1000, 100); await refused('1,000 % for a century', 'The result is beyond ₹10,000 lakh crore — more than this calculator can show. Check the rate and the period.');
  await set(100000, '', 20); await refused('an empty rate', 'Fill in all the numbers.');
  await set(100000, 6, 20);
  ok(await c.big('Future cost of the same things') === '₹3,20,714' && !/NaN|undefined|Infinity/.test(await page.locator('.calc-result').innerText()), 'after the refusals the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/inflation`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: no horizontal scroll; 44 px boxes');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
