// NPS (#/nps): monthly contributions to the age of 60, the share that must buy an annuity (40 % for government
// subscribers, 20 % for everyone else since December 2025), the monthly pension — against the closed form in mpmath
// (tests/fixtures/finance2/reference.json); what is refused; phone layout.
import { readFileSync } from 'node:fs';
import { calc, num, inr } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/finance2/reference.json', import.meta.url), 'utf8'));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/nps`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const set = async (amt, age, r, ann, ar) => { await c.set('Monthly contribution', amt); await c.set('Current age', age); await c.set('Expected return', r); await c.set('Annuity purchase', ann); await c.set('Annuity rate', ar); };
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');
  { const r = await c.rows();
    ok(await c.big('Corpus at 60') === '₹2,27,93,253' && await c.big('Monthly pension') === '₹45,587' && r['Lump sum'] === '₹1,36,75,952' && r['Used to buy annuity'] === '₹91,17,301' && r['Total invested'] === '₹36,00,000' && r.Contributions === '360 monthly (30 years)' && !(await note()),
      `₹10,000 a month from 30 at 10 %: ₹2,27,93,253 at 60; 40 % in an annuity at 6 % pays ₹45,587 a month (${await c.big('Corpus at 60')}, ${JSON.stringify(r)})`);
    ok(num(r['Lump sum']) + num(r['Used to buy annuity']) === num(await c.big('Corpus at 60')), 'lump sum + annuity = the corpus, as shown'); }
  let bad = [];
  for (const [A, age, R, ap, ar, corpus, pension, lump, invested] of ref.nps.filter((_, i) => i % 2 === 0)) {
    await set(A, age, R, ap, ar);
    const r = await c.rows(), near = (got, want) => Math.abs(num(got) - want) <= 1;
    if (!near(await c.big('Corpus at 60'), corpus) || !near(await c.big('Monthly pension'), pension) || !near(r['Lump sum'], lump) || !near(r['Total invested'], invested) || num(r['Lump sum']) + num(r['Used to buy annuity']) !== num(await c.big('Corpus at 60'))) bad.push(`₹${A} from ${age} at ${R} %, ${ap} % annuity at ${ar} %: ${await c.big('Corpus at 60')} / ${JSON.stringify(r)} ≠ ${[corpus, pension, lump].map(Math.round)}`);
  }
  ok(!bad.length, `45 accounts of the reference (annuity shares from 20 % to 100 %): corpus, pension, lump sum, invested ${bad.slice(0, 2).join(' | ')}`);
  // ---- the least annuity share depends on who subscribes
  await set(10000, 30, 10, 20, 6);
  ok(await c.row('Lump sum') === '₹1,82,34,603' && await c.row('Used to buy annuity') === '₹45,58,650' && !(await c.warn()), `a private subscriber may keep 80 % as a lump sum since December 2025 (20 % was quietly raised to 40 %) — ${await c.row('Lump sum')}`);
  await c.set('Annuity purchase', 10);
  ok(await c.warn() === 'At least 20 % of the corpus must buy an annuity (non-government subscribers, since December 2025).', `10 % is refused with the rule (${await c.warn()})`);
  await c.seg('Subscriber', 'Government'); await c.set('Annuity purchase', 30);
  ok(await c.warn() === 'At least 40 % of the corpus must buy an annuity (government subscribers).', `a government subscriber with 30 % (${await c.warn()})`);
  await c.set('Annuity purchase', 40); ok(await c.row('Lump sum') === '₹1,36,75,952', 'with 40 % the answer is back');
  await c.seg('Subscriber', 'Private / all citizens'); await set(500, 59, 6, 40, 6);
  ok(await c.big('Corpus at 60') === '₹6,199' && await note() === 'A corpus of up to ₹8 lakh may be taken out in full by non-government subscribers — no annuity is required.', `a small corpus: the note about taking it all out (${await note()})`);
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await set(10000, 60, 10, 40, 6); await refused('already 60 (it showed a corpus of ₹0)', 'Current age: a whole number of years from 18 to 59 (this calculator runs to the age of 60).');
  await c.set('Current age', 30.5); await refused('an age of 30.5', 'Current age: a whole number of years from 18 to 59 (this calculator runs to the age of 60).');
  await set(10000, 30, 10, 150, 6); await refused('150 % for the annuity (the lump sum was negative)', 'The annuity cannot take more than 100 % of the corpus.');
  await set(-10000, 30, 10, 40, 6); await refused('a negative contribution', 'The monthly contribution must be more than 0.');
  await set(10000, 30, -10, 40, 6); await refused('a negative return', 'The expected return cannot be negative.');
  await set(10000, 30, 10, 40, -6); await refused('a negative annuity rate', 'The annuity rate cannot be negative.');
  await set(10000, 30, 10, 40, ''); await refused('an empty annuity rate', 'Fill in all the numbers.');
  await set(10000, 30, 10, 40, 6);
  ok(await c.big('Corpus at 60') === '₹2,27,93,253' && /December 2025/.test(await page.locator('.tool-body').innerText()), 'after the refusals the answer is back; the note names the rule and its date');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/nps`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body input, .tool-body .seg-btn')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: no horizontal scroll; 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
