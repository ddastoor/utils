// Tip & Bill Splitter (#/tip): tip, total, each share rounded up (paisa / rupee / ₹10), what is collected and what is
// left over — against exact decimal arithmetic (tests/fixtures/smallcalc/reference.json); what is refused; phone.
import { readFileSync } from 'node:fs';
import { calc, num, inr } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/smallcalc/reference.json', import.meta.url), 'utf8'));
const ROUND = { no: 'No', 1: 'To ₹1', 10: 'To ₹10' };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/tip`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const set = async (bill, tip, people, rnd) => { await c.set('Bill amount', bill); await c.set('Tip', tip); await c.set('People', people); if (rnd) await c.seg('Round per person', ROUND[rnd]); };
  const shown = async () => ({ each: await c.big('Each person pays'), total: await c.big('Total with tip'), ...(await c.rows()) });

  // ---- the first view
  { const s = await shown(); ok(s.each === '₹660' && s.total === '₹2,640' && s['Tip amount'] === '₹240' && s.Collected === '₹2,640' && !('Left over' in s), `₹2,400 + 10 % among 4: ₹660 each, nothing left over (${JSON.stringify(s)})`); }

  // ---- bills of the reference
  const pick = ref.tip.filter(([bill]) => +bill <= 1e7).filter((_, i) => i % 29 === 0);
  let bad = [];
  for (const [bill, pct, people, rnd, tip, total, each, collected] of pick) {
    await set(bill, pct, people, rnd);
    const s = await shown(), extra = collected - total, p = (x) => Math.round(num(x) * 100);
    if (s.each !== inr(each / 100) || s.total !== inr(total / 100) || s['Tip amount'] !== inr(tip / 100) || s.Collected !== inr(collected / 100) || (extra ? s['Left over'] !== `${inr(extra / 100)} more than the bill (each share is rounded up)` : 'Left over' in s)) bad.push(`₹${bill} + ${pct} % ÷ ${people} (${rnd}): ${JSON.stringify(s)} ≠ ${[each, total, tip, collected, extra].map((x) => x / 100)}`);
    if (p(s.each) * people !== p(s.Collected)) bad.push(`₹${bill} ÷ ${people}: ${s.each} × ${people} is not ${s.Collected}`); // the figures on the screen add up
  }
  ok(pick.length >= 60 && !bad.length, `${pick.length} bills of the reference: every figure to the paisa, and the share shown × people is the collection shown ${bad.slice(0, 3).join(' | ')}`);

  // ---- a bill that does not divide
  await set(1000, 15, 3, 'no');
  { const s = await shown(); ok(s.each === '₹383.34' && s.total === '₹1,150' && s.Collected === '₹1,150.02' && s['Left over'] === '₹0.02 more than the bill (each share is rounded up)', `₹1,150 among 3: ₹383.34 each covers the bill, 2 paise over (it showed ₹383.33 and "Collected ₹1,150": a paisa short) — ${JSON.stringify(s)}`); }
  await c.seg('Round per person', 'To ₹1');
  { const s = await shown(); ok(s.each === '₹384' && s.Collected === '₹1,152' && /^₹2 more than the bill/.test(s['Left over']), `to the rupee: ₹384 each, ₹2 over (${JSON.stringify(s)})`); }
  await c.seg('Round per person', 'To ₹10');
  { const s = await shown(); ok(s.each === '₹390' && s.Collected === '₹1,170' && /^₹20 more than the bill/.test(s['Left over']), 'to ₹10: ₹390 each, ₹20 over'); }
  await set(1000, 0, 1, 'no');
  { const s = await shown(); ok(s.each === '₹1,000' && s['Tip amount'] === '₹0' && !('Left over' in s), 'no tip, one person'); }
  await set(100.5, 12.5, 2);
  { const s = await shown(); ok(s.total === '₹113.06' && s['Tip amount'] === '₹12.56' && s.each === '₹56.53', `paise with both digits; half a paisa of tip is rounded up: ₹100.50 + 12.5 % = ₹113.06 (${JSON.stringify(s)})`); }

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await set(2400, 10, 0); await refused('nobody to pay (0 people was quietly taken as 1)', 'The number of people must be a whole number, 1 or more.');
  await c.set('People', 2.5); await refused('two and a half people (each paid 1/2.5 of the bill)', 'The number of people must be a whole number, 1 or more.');
  await c.set('People', -3); await refused('−3 people', 'The number of people must be a whole number, 1 or more.');
  await set(-2400, 10, 4); await refused('a negative bill (everyone "paid" −₹660)', 'The bill must be more than 0.');
  await c.set('Bill amount', 0); await refused('a bill of 0', 'The bill must be more than 0.');
  await set(2400, -10, 4); await refused('a negative tip', 'The tip cannot be negative.');
  await c.set('Tip', ''); await refused('an empty tip', 'Fill in all the numbers.');
  await set(2400, 10, 4);
  ok((await shown()).each === '₹660' && !/NaN|undefined|—/.test(await page.locator('.calc-result').innerText()), 'after the refusals the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/tip`); await ph.locator('.big-value').first().waitFor(); const pc = calc(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  await pc.set('People', 7); await pc.seg('Round per person', 'To ₹10');
  ok(await pc.big('Each person pays') === '₹380' && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body .seg-btn, .tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: seven people, rounded to ₹10; 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
