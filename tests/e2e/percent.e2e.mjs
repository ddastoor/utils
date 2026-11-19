// Percentage (#/percent): the six questions against exact fractions of the typed numbers
// (tests/fixtures/finance/reference.json, Python's fractions); small and large answers, signs, reasons where there is
// no answer, what a click copies, phone layout.
import { financeRef } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';

const TITLES = { of: 'What is A% of B?', share: 'A is what % of B?', change: '% change from A to B', up: 'A increased by B%', down: 'A decreased by B% (discount)', whole: 'A is B% of what?' };
export default async ({ base, page: newPage, ok, devices }) => {
  const ref = await financeRef();
  const page = await newPage(); await page.goto(`${base}#/percent`);
  await page.locator('.pct-out').first().waitFor();
  const card = (op) => page.locator('.card').filter({ has: page.getByText(TITLES[op], { exact: true }) });
  const ask = async (op, a, b) => { const k = card(op); await k.getByLabel('A').fill(String(a)); await k.getByLabel('B').fill(String(b)); return (await k.locator('.pct-out').textContent()).trim(); };
  const why = async (op) => { const w = card(op).locator('.pct-why'); return (await w.isVisible()) ? (await w.textContent()).trim() : ''; };

  // ---- the first view: six questions, each with an example worked out
  { const got = {}; for (const op of Object.keys(TITLES)) got[op] = (await card(op).locator('.pct-out').textContent()).trim();
    ok(JSON.stringify(got) === JSON.stringify({ of: '360', share: '75%', change: '+25%', up: '590', down: '1,399.3', whole: '150' }), `the six examples: 15 % of 2,400 = 360, 45 of 60 = 75 %, 80 → 100 = +25 %, 500 + 18 % = 590, 1,999 − 30 % = 1,399.3, 30 is 20 % of 150 (${JSON.stringify(got)})`);
    ok(await page.locator('.pct-why:visible').count() === 0, 'no reasons shown while every question has an answer'); }

  // ---- the reference: answers of ordinary size, written with ten digits
  const fmt = (v, op) => `${op === 'change' && v > 0 ? '+' : ''}${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 10 }).format(v).replace('-', '−')}${op === 'share' || op === 'change' ? '%' : ''}`;
  const tie = (v) => { const s = Math.abs(v).toPrecision(13).replace(/[.e].*$/, (m) => m).replace('.', '').replace(/e.*$/, ''); return /^(\d{10})(49|50)/.test(s.replace(/^0+/, '')); }; // the 11th digit decides the 10th: leave the knife's edge to the unit suite
  const OPS = ref.percent_ops, pairs = ref.percent.filter(([a, b]) => !/e/.test(a) && !/e/.test(b)).filter((_, i) => i % 5 === 0);
  let n = 0, bad = [];
  for (const [a, b, ...want] of pairs) {
    for (let k = n % 3; k < 6; k += 3) { // two of the six questions for each pair, in turn
      const op = OPS[k], w = want[k];
      if (w === null || w === 0 || Math.abs(w) < 1e-6 || Math.abs(w) >= 1e9 || tie(w)) continue;
      const got = await ask(op, a, b); n++;
      if (got !== fmt(w, op) || await why(op)) bad.push(`${op}(${a}, ${b}): "${got}" ≠ "${fmt(w, op)}"`);
    }
  }
  ok(n >= 150 && !bad.length, `${n} answers of the reference appear as the exact fraction rounded to ten digits ${bad.slice(0, 4).join(' | ')}`);

  // ---- what was wrong
  const cases = [
    ['of', 0.0001, 0.001, '1 × 10⁻⁹', 'it was shown as 0'], ['share', 1, 3000000000, '3.333333333 × 10⁻⁸%', 'it was 0%'], ['whole', '1e-9', 50, '2 × 10⁻⁹', 'it was 0'],
    ['change', -50, -25, '+50%', 'it was "+-50%"'], ['change', -50, 50, '+200%', 'it was "+-200%"'], ['change', -25, -50, '−100%', 'a fall'], ['change', 50, 50, '0%', 'it was "+0%"'],
    ['change', 100, 99.9999999, '−1 × 10⁻⁷%', 'it was "-0%"'], ['change', 99.9999999, 100, '+1.000000001 × 10⁻⁷%', 'the doubles give 1.000000083'], ['of', 0, -5, '0', 'it was "-0"'],
    ['of', 33.3333333, 3, '0.999999999', 'six decimals made it 1'], ['share', 1, 3, '33.33333333%', 'ten digits'], ['of', '1e10', '1e15', '1 × 10²³', 'not 24 digits in a row'],
    ['change', 100, 80, '−20%', 'a real minus sign'], ['up', 0.1, 0.2, '0.1002', ''], ['of', 1.1, 1.1, '0.0121', ''], ['down', 100, 150, '−50', ''], ['share', 123456789, 1000, '12,345,678.9%', ''], ['of', 12.5, 80, '10', ''], ['of', 150, 40, '60', ''],
  ];
  for (const [op, a, b, want, was] of cases) { const got = await ask(op, a, b); ok(got === want && !(await why(op)), `${TITLES[op]} A = ${a}, B = ${b} → ${want}${was ? ` (${was})` : ''} — got ${got}`); }

  // ---- no answer: a dash and the reason
  for (const [op, a, b, reason] of [['share', 5, 0, 'B is 0 — no number is a percentage of zero.'], ['share', 0, 0, 'B is 0 — nothing is a percentage of zero.'], ['change', 0, 10, 'A is 0 — a change from zero has no percentage.'], ['change', 0, 0, 'From 0 to 0 nothing changes — and from 0 there is no percentage.'],
    ['whole', 30, 0, 'B is 0 — 0 % of a number is never 30.'], ['whole', 0, 0, 'B is 0 — 0 % of every number is 0, so the whole can be anything.'], ['of', '1e200', '1e200', 'The result is too large.']]) {
    const got = await ask(op, a, b); ok(got === '—' && await why(op) === reason, `${TITLES[op]} A = ${a}, B = ${b} → — with "${reason}" (${got}, "${await why(op)}")`);
  }
  ok(await ask('share', 5, 10) === '50%' && !(await why('share')), 'the reason goes away with the next answer');
  for (const [a, b] of [['', 10], [10, ''], ['', '']]) { const got = await ask('of', a, b); ok(got === '—' && !(await why('of')), `an empty box (A "${a}", B "${b}"): a dash, no reason`); }
  ok(!/NaN|undefined|Infinity|∞/.test(await page.locator('.tool-body').innerText()), 'never NaN or Infinity on the page');

  // ---- a click copies the answer as plain digits; no answer, nothing copied
  await hookClipboard(page);
  await ask('down', 1999, 30); await card('down').locator('.big-result').click();
  await ask('change', 100, 80); await card('change').locator('.big-result').click();
  await ask('of', 0.0001, 0.001); await card('of').locator('.big-result').click();
  await ask('share', 5, 0); await card('share').locator('.big-result').click();
  ok(JSON.stringify(await copied(page)) === JSON.stringify(['1399.3', '-20%', '1e-9']), `copied: 1399.3 (no comma), -20% (keyboard minus), 1e-9; the dash is not copied (${JSON.stringify(await copied(page))})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/percent`); await ph.locator('.pct-out').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  { const k = ph.locator('.card').filter({ has: ph.getByText(TITLES.change, { exact: true }) }); await k.getByLabel('A').fill('99.9999999'); await k.getByLabel('B').fill('100');
    ok((await k.locator('.pct-out').textContent()).trim() === '+1.000000001 × 10⁻⁷%' && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: a long answer fits'); }
  { const k = ph.locator('.card').filter({ has: ph.getByText(TITLES.whole, { exact: true }) }); await k.getByLabel('B').fill('0');
    ok(await k.locator('.pct-why').isVisible() && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.pct-row .big-result, .pct-row input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: the reason shows; boxes and answers are 44 px touch targets'); }
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
