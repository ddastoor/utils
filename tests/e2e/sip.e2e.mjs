// SIP (#/sip): monthly SIP (instalment at the start of each month, monthly rate = annual / 12 — the AMFI / Groww
// convention), yearly step-up, lump sum — what the tab shows against the month-by-month reference
// (tests/fixtures/finance/reference.json: mpmath, cross-checked with numpy-financial); what is refused and why; phone.
import { calc, num, inr, financeRef } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';

export default async ({ base, page: newPage, ok, devices }) => {
  const ref = await financeRef();
  const page = await newPage(); await page.goto(`${base}#/sip`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const stepBox = page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Annual step-up \(SIP\)$/ }) });
  const unit = () => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Amount$/ }) }).locator('.unit').textContent();
  const shown = async () => [await c.big('Maturity value'), await c.big('Invested'), await c.big('Gains')];
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');

  // ---- the first view
  ok((await shown()).join() === '₹50,45,760,₹18,00,000,₹32,45,760', `₹10,000 a month at 12 % for 15 years: ₹50,45,760 from ₹18,00,000 (${await shown()})`);
  ok(await c.row('Wealth multiple') === '2.8×' && await c.row('Instalments') === '180 monthly (15 years)', `wealth multiple and the number of instalments (${JSON.stringify(await c.rows())})`);
  ok(await unit() === '₹ a month' && await stepBox.isVisible() && !(await note()) && !(await c.warn()), 'the amount is "₹ a month", the step-up box is there, no notes');

  // ---- plans of the reference: whole years and odd months, with and without a step-up
  const pick = ref.sip.filter(([a, r, n, s, inv, val]) => r >= -5 && r <= 24 && n >= 11 && val < 1e15 && [0, 10, 12.5].includes(s)).filter((_, i) => i % 6 === 0);
  let bad = [];
  for (const [a, r, n, s, inv, val] of pick) {
    await c.set('Amount', a); await c.set('Expected return', r); await c.set('Period', n / 12); await c.set('Annual step-up (SIP)', s);
    const got = await shown(), V = Math.round(val), I = Math.round(inv), want = [inr(V), inr(I), inr(V - I)];
    const near = (x, y) => Math.abs(num(x) - num(y)) <= 1; // a rupee: the engine's value and the reference's may round to either side of a half
    if (!near(got[0], want[0]) || !near(got[1], want[1]) || num(got[2]) !== num(got[0]) - num(got[1]) || await c.row('Instalments') !== `${n.toLocaleString('en-IN')} monthly${n >= 12 ? ` (${Math.floor(n / 12)} year${n >= 24 ? 's' : ''}${n % 12 ? ` ${n % 12} month${n % 12 > 1 ? 's' : ''}` : ''})` : ''}` || await note()) bad.push(`₹${a} at ${r} % × ${n} months, step-up ${s} %: ${got} ≠ ${want} (${await c.row('Instalments')}) ${await note()}`);
  }
  ok(pick.length >= 60 && !bad.length, `${pick.length} plans of the reference: maturity value and invested to the rupee, gains = the difference of the two as shown, instalments counted ${bad.slice(0, 3).join(' | ')}`);

  // ---- a loss
  await c.set('Amount', 10000); await c.set('Expected return', -5); await c.set('Period', 15); await c.set('Annual step-up (SIP)', 0);
  { const [, , , , inv, val] = ref.sip.find((x) => x[0] === 10000 && x[1] === -5 && x[2] === 180 && x[3] === 0), s = await shown();
    ok(s[0] === inr(Math.round(val)) && s[2] === `−${inr(Math.round(inv) - Math.round(val))}` && await c.row('Wealth multiple') === '0.7×', `a return of −5 %: ${s[0]} from ${s[1]}, gains ${s[2]}, ${await c.row('Wealth multiple')}`); }
  await c.set('Expected return', 0);
  ok((await shown()).join() === '₹18,00,000,₹18,00,000,₹0' && await c.row('Wealth multiple') === '1×', `no return: what was paid in (${await shown()})`);

  // ---- a period that is not whole months
  await c.set('Expected return', 12); await c.set('Period', 15.04);
  ok((await shown())[0] === '₹50,45,760' && await note() === 'Instalments are monthly, so the period is counted as 15 years.', `15.04 years: counted as 15 years, and said (${await note()})`);
  await c.set('Period', 2.3);
  ok(await c.row('Instalments') === '28 monthly (2 years 4 months)' && /counted as 2 years 4 months/.test(await note()), `2.3 years: 28 instalments (${await c.row('Instalments')})`);
  await c.set('Period', 0.5);
  ok(await c.row('Instalments') === '6 monthly' && !(await note()), 'half a year: 6 instalments, no note');

  // ---- an empty step-up box is no step-up
  await c.set('Period', 15); await c.set('Annual step-up (SIP)', '');
  ok((await shown())[0] === '₹50,45,760' && !(await c.warn()), 'an empty step-up box counts as 0 %');

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(), text = await page.locator('.tool-body').innerText(); ok(w === want && !(await page.locator('.big-result').count()) && !/NaN|undefined|—×/.test(text), `${label} → "${want}" (${w || text.slice(-80)})`); };
  const reset = async () => { await c.set('Amount', 10000); await c.set('Expected return', 12); await c.set('Period', 15); await c.set('Annual step-up (SIP)', 0); };
  await c.set('Period', 0); await refused('a period of 0 (it showed ₹0 and "—×")', 'The period must be more than 0.');
  await c.set('Period', -5); await refused('a negative period', 'The period must be more than 0.');
  await c.set('Period', 0.01); await refused('0.01 years', 'The period must be at least 1 month.');
  await c.set('Period', 300); await refused('300 years (a 23-digit maturity value)', 'The period is too long — at most 100 years (1,200 months).');
  { const t0 = Date.now(); await c.set('Period', 30000000); await refused('3 × 10⁷ years', 'The period is too long — at most 100 years (1,200 months).'); const ms = Date.now() - t0; ok(ms < 1000, `… at once (${ms} ms; the tab froze for 1.6 s)`); }
  await reset(); await c.set('Amount', 0); await refused('a monthly amount of 0', 'The monthly amount must be more than 0.');
  await c.set('Amount', -1000); await refused('a negative monthly amount (it showed a maturity value of −₹5,04,576)', 'The monthly amount must be more than 0.');
  await reset(); await c.set('Expected return', -100); await refused('a return of −100 %', 'The expected return must be above −100 % a year (at −100 % everything is lost).');
  await c.set('Expected return', -1300); await refused('a return of −1,300 % (a maturity value of −₹769)', 'The expected return must be above −100 % a year (at −100 % everything is lost).');
  await c.set('Expected return', 1200); await refused('a return of 1,200 %', 'The expected return is too high — at most 1,000 % a year.');
  await reset(); await c.set('Annual step-up (SIP)', -150); await refused('a step-up of −150 % (instalments that changed sign)', 'The yearly step-up cannot be negative.');
  await reset(); await c.set('Expected return', 1000); await c.set('Period', 100); await refused('1,000 % for a century', 'The result is beyond ₹10,000 lakh crore — more than this calculator can show. Check the rate and the period.');
  await reset(); await c.set('Expected return', ''); await refused('an empty return', 'Fill in all the numbers.');
  await reset();
  ok((await shown())[0] === '₹50,45,760', 'after the refusals the default plan is back');
  await c.set('Period', 100);
  ok(await c.row('Instalments') === '1,200 monthly (100 years)' && /^₹[\d,]+$/.test((await shown())[0]), `100 years is the longest period (${await shown()})`);

  // ---- lump sum
  await reset(); await c.seg('Investment', 'Lumpsum'); await c.set('Amount', 100000);
  ok(await unit() === '₹' && await stepBox.isHidden() && await c.row('Instalments') === null, 'lump sum: the amount is "₹", no step-up box, no instalments');
  ok((await shown()).join() === `${inr(Math.round(100000 * 1.12 ** 15))},₹1,00,000,${inr(Math.round(100000 * 1.12 ** 15) - 100000)}` && await c.row('Wealth multiple') === '5.47×', `₹1 lakh at 12 % for 15 years (${await shown()}, ${await c.row('Wealth multiple')})`);
  bad = [];
  const lumps = ref.lump.filter(([a, r, y, v]) => a === 10000 && r > -99 && v < 1e15);
  for (const [a, r, y, v] of lumps) {
    await c.set('Amount', a); await c.set('Expected return', r); await c.set('Period', y);
    const got = await shown();
    if (got[0] !== inr(Math.round(v)) || got[1] !== inr(a) || num(got[2]) !== Math.round(v) - a || await note()) bad.push(`₹${a} at ${r} % × ${y} y: ${got} ≠ ${inr(Math.round(v))}`);
  }
  ok(lumps.length >= 30 && !bad.length, `${lumps.length} lump sums of the reference, half a year to a century ${bad.slice(0, 3).join(' | ')}`);
  await c.set('Amount', 10000); await c.set('Expected return', 12); await c.set('Period', -5); await refused('a lump sum for −5 years (it showed ₹5,674)', 'The period must be more than 0.');
  await c.set('Period', 5000); await refused('a lump sum for 5,000 years', 'The period is too long — at most 100 years.');
  await c.set('Period', 15); await c.set('Expected return', -150); await refused('a lump sum at −150 %', 'The expected return must be above −100 % a year (at −100 % everything is lost).');
  await c.set('Expected return', 12); await c.set('Amount', 0); await refused('a lump sum of 0', 'The amount must be more than 0.');
  await c.set('Amount', 10000); await c.seg('Investment', 'Monthly SIP');
  ok((await shown())[0] === '₹50,45,760' && await stepBox.isVisible() && await unit() === '₹ a month', 'back to the monthly SIP: the step-up box and "₹ a month" are back');

  // ---- copy
  await hookClipboard(page); await page.locator('.big-result').first().click();
  ok((await copied(page)).join() === '₹50,45,760', `a click on the maturity value copies it (${await copied(page)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/sip`); await ph.locator('.big-value').first().waitFor(); const pc = calc(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  await pc.seg('Investment', 'Lumpsum');
  ok(await pc.big('Maturity value') === inr(Math.round(10000 * 1.12 ** 15)) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.seg-btn')].every((b) => b.getBoundingClientRect().height >= 44)), 'phone: lump sum works; the choice is a 44 px touch target');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
