// EPF (#/epf): the account as the EPFO keeps it — 12 % from the member, 12 % from the employer less the pension-scheme
// share, interest on each month's opening balance credited once a year, yearly raises — against mpmath
// (tests/fixtures/finance2/reference.json); what is refused; phone layout.
import { readFileSync } from 'node:fs';
import { calc, num, inr } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/finance2/reference.json', import.meta.url), 'utf8'));
const EPS = "Employer's share into the pension scheme (EPS, not in the corpus)";
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/epf`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const set = async (basic, age, ret, bal, inc, r) => { await c.set('Monthly basic + DA', basic); await c.set('Current age', age); await c.set('Retirement age', ret); await c.set('Current EPF balance', bal); await c.set('Yearly salary increase', inc); await c.set('EPF interest rate', r); };
  { const r = await c.rows();
    ok(await c.big('EPF corpus at retirement') === '₹2,56,34,372' && await c.big('Your + employer contributions') === '₹94,48,216' && r['Your 12 %'] === '₹49,34,024' && r["Employer's share into EPF"] === '₹45,14,192' && r['Interest earned'] === '₹1,61,86,156' && r[EPS] === '₹4,19,832' && r.Years === '28',
      `₹50,000 basic from 30 to 58 with 6 % raises at 8.25 %: ₹2,56,34,372 (interest credited yearly on monthly opening balances; monthly compounding had shown about ₹2.7 crore) — ${await c.big('EPF corpus at retirement')}, ${JSON.stringify(r)}`); }
  let bad = [];
  for (const [basic, age, ret, opening, inc, R, corpus, own, er, eps, interest] of ref.epf.filter((_, i) => i % 4 === 0)) {
    await set(basic, age, ret, opening, inc, R);
    const r = await c.rows(), near = (got, want) => Math.abs(num(got) - want) <= 1, shown = num(await c.big('EPF corpus at retirement'));
    if (!near(shown, corpus) || !near(r['Your 12 %'], own) || !near(r["Employer's share into EPF"], er) || !near(r[EPS], eps) || r.Years !== String(ret - age) || num(await c.big('Your + employer contributions')) !== num(r['Your 12 %']) + num(r["Employer's share into EPF"])
      || num(r['Interest earned']) !== shown - num(r['Your 12 %']) - num(r["Employer's share into EPF"]) - Math.round(opening)) bad.push(`₹${basic}, ${age} → ${ret}, opening ₹${opening}, +${inc} %, ${R} %: ${shown} / ${JSON.stringify(r)} ≠ ${[corpus, own, er, eps, interest].map(Math.round)}`);
  }
  ok(!bad.length, `36 accounts of the reference: corpus, both contributions and the pension share to the rupee; the corpus shown is opening + contributions + interest as shown ${bad.slice(0, 2).join(' | ')}`);
  await set(15000, 30, 31, 0, 0, 8.25);
  ok(await c.row('Your 12 %') === '₹21,600' && await c.row("Employer's share into EPF") === '₹6,606' && await c.row(EPS) === '₹14,994' && await c.row('Interest earned') === '₹1,067', `one year at the wage ceiling of ₹15,000: ₹1,800 + ₹550.50 a month, ₹1,249.50 to the pension scheme, ₹1,067 interest (${JSON.stringify(await c.rows())})`);
  await set(50000, 30, 58, '', '', 8.25);
  ok(/^₹[\d,]+$/.test(await c.big('EPF corpus at retirement')) && !(await c.warn()), 'empty boxes for the balance and the raise count as 0');
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await set(50000, 30, 30, 0, 6, 8.25); await refused('retiring at the present age (it showed a corpus of ₹0)', 'Retirement age: a whole number of years above 30, at most 75.');
  await c.set('Retirement age', 25); await refused('retiring before', 'Retirement age: a whole number of years above 30, at most 75.');
  await c.set('Retirement age', 1000000000); await refused('retiring at a thousand million (the engine would loop for it)', 'Retirement age: a whole number of years above 30, at most 75.');
  await set(50000, 30.5, 58, 0, 6, 8.25); await refused('an age of 30.5 (the years shown were 27.5, the corpus for 27)', 'Current age: a whole number of years from 15 to 74.');
  await set(-50000, 30, 58, 0, 6, 8.25); await refused('a negative salary', 'The monthly basic + DA must be more than 0.');
  await set(50000, 30, 58, -5, 6, 8.25); await refused('a negative balance', 'The current EPF balance cannot be negative.');
  await set(50000, 30, 58, 0, -6, 8.25); await refused('a falling salary', 'The yearly salary increase cannot be negative.');
  await set(50000, 30, 58, 0, 6, -1); await refused('a negative rate', 'The EPF interest rate cannot be negative.');
  await set(50000, 30, 58, 0, 6, ''); await refused('an empty rate', 'Fill in all the numbers.');
  await set(50000, 30, 58, 0, 6, 8.25);
  ok(await c.big('EPF corpus at retirement') === '₹2,56,34,372' && /credited once a year/.test(await page.locator('.tool-body').innerText()), 'after the refusals the answer is back; the note says how the interest is credited');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/epf`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: no horizontal scroll (also with the long EPS row); 44 px boxes');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
