// FD / RD (#/fd): fixed deposit with quarterly / monthly / half-yearly / yearly compounding and simple interest;
// recurring deposit (bank method: each instalment compounds for its remaining time); effective yield — what the tab
// shows against compound interest in mpmath (tests/fixtures/finance/reference.json); what is refused and why; phone.
import { calc, num, inr, financeRef } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';

const AMOUNT = 'Amount (FD) / monthly instalment (RD)';
export default async ({ base, page: newPage, ok, devices }) => {
  const ref = await financeRef();
  const page = await newPage(); await page.goto(`${base}#/fd`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const unit = () => page.locator('.field').filter({ hasText: 'Amount (FD)' }).locator('.unit').textContent();
  const shown = async () => [await c.big('Maturity value'), await c.big('Interest earned'), await c.big('Invested')];
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');
  const fd = async (a, r, y, comp) => { await c.set(AMOUNT, a); await c.set('Interest rate', r); await c.set('Tenure', y); if (comp !== undefined) await c.pick('Compounding', String(comp)); };

  // ---- the first view
  ok((await shown()).join() === '₹1,41,478,₹41,478,₹1,00,000', `₹1 lakh at 7 % for 5 years, quarterly: ₹1,41,478 (the banks' figure) (${await shown()})`);
  ok(await c.row('Effective annual yield') === '7.186%' && await c.row('Instalments') === null && await unit() === '₹' && !(await note()), `effective yield of 7 % quarterly = (1 + 0.07/4)⁴ − 1 = 7.186 % (${await c.row('Effective annual yield')})`);
  for (const [comp, want, label, y] of [['12', '₹1,41,763', 'monthly', '7.229%'], ['2', '₹1,41,060', 'half-yearly', '7.123%' /* 1.035² − 1 is 7.1225 % exactly; it was shown as 7.122 % */], ['1', '₹1,40,255', 'yearly', '7%'], ['0', '₹1,35,000', 'simple interest', '7% (simple)']]) {
    await c.pick('Compounding', comp);
    ok(await c.big('Maturity value') === want && await c.row('Effective annual yield') === y, `${label}: ${want}, yield ${y} (${await c.big('Maturity value')}, ${await c.row('Effective annual yield')})`);
  }

  // ---- fixed deposits of the reference
  const pickFd = ref.fd.filter(([a, r, y, k, v]) => a === 100000 && v < 1e15 && r <= 15).filter((_, i) => i % 7 === 0);
  let bad = [];
  for (const [a, r, y, k, v] of pickFd) {
    await fd(a, r, y, k);
    const got = await shown(), V = Math.round(v);
    if (got[0] !== inr(V) || got[2] !== inr(a) || num(got[1]) !== V - a || await note()) bad.push(`₹${a} at ${r} % × ${y} y, compounding ${k}: ${got} ≠ ${inr(V)}`);
  }
  ok(pickFd.length >= 50 && !bad.length, `${pickFd.length} fixed deposits of the reference: maturity value to the rupee, interest = maturity − deposit ${bad.slice(0, 3).join(' | ')}`);
  bad = [];
  const yields = ref.yield.filter(([r]) => r > 0 && r <= 15);
  for (const [r, k, , text] of yields) { // text: three decimals by exact decimal arithmetic, half up
    await fd(100000, r, 5, k);
    if (await c.row('Effective annual yield') !== `${text}%`) bad.push(`${r} % × ${k}: ${await c.row('Effective annual yield')} ≠ ${text}%`);
  }
  ok(yields.length >= 60 && !bad.length, `the effective yield of ${yields.length} rates and compoundings, rounded as decimals — 7 % half-yearly is 7.1225 % → 7.123 % ${bad.slice(0, 3).join(' | ')}`);
  await fd(250000, 6.8, 2.25, 4);
  ok(await c.big('Maturity value') === inr(Math.round(250000 * (1 + 0.068 / 4) ** 9)) && !(await note()), `two and a quarter years are nine quarters (${await c.big('Maturity value')})`);
  await fd(100000.5, 7, 5, 4);
  { const s = await shown(); ok(num(s[0]) - num(s[2]) === num(s[1]), `a deposit with paise: the three figures add up as shown (${s})`); }

  // ---- recurring deposit
  await c.seg('Deposit', 'Recurring deposit'); await fd(5000, 7, 5, 4);
  ok((await shown()).join() === '₹3,59,664,₹59,664,₹3,00,000' && await c.row('Instalments') === '60 monthly (5 years)' && await unit() === '₹ a month', `RD of ₹5,000 a month for 5 years at 7 %: ₹3,59,664 from ₹3,00,000 (${await shown()}, ${await c.row('Instalments')})`);
  const pickRd = ref.rd.filter(([a, r, n, k, v]) => a === 5000 && v < 1e15 && r <= 15).filter((_, i) => i % 6 === 0);
  bad = [];
  for (const [a, r, n, k, v] of pickRd) {
    await fd(a, r, n / 12, k);
    const got = await shown(), V = Math.round(v);
    if (Math.abs(num(got[0]) - V) > 1 || got[2] !== inr(a * n) || num(got[1]) !== num(got[0]) - a * n || !(await c.row('Instalments')).startsWith(`${n.toLocaleString('en-IN')} monthly`) || await note()) bad.push(`₹${a} a month at ${r} % × ${n} months, compounding ${k}: ${got} ≠ ${inr(V)} (${await c.row('Instalments')})`);
  }
  ok(pickRd.length >= 50 && !bad.length, `${pickRd.length} recurring deposits of the reference, 1 to 1,200 instalments ${bad.slice(0, 3).join(' | ')}`);
  await fd(5000, 7, 1.04, 4);
  ok(await c.row('Instalments') === '12 monthly (1 year)' && await note() === 'Instalments are monthly, so the tenure is counted as 1 year.', `an RD of 1.04 years: 12 instalments, and said (${await note()})`);
  await c.set('Tenure', 2.3);
  ok(await c.row('Instalments') === '28 monthly (2 years 4 months)' && await c.big('Invested') === '₹1,40,000' && /counted as 2 years 4 months/.test(await note()), `2.3 years: 28 instalments (${await c.row('Instalments')})`);
  await c.set('Tenure', 0.25);
  ok(await c.row('Instalments') === '3 monthly' && !(await note()), 'a quarter of a year: 3 instalments, no note');

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(), text = await page.locator('.tool-body').innerText(); ok(w === want && !(await page.locator('.big-result').count()) && !/NaN|undefined/.test(text), `${label} → "${want}" (${w || text.slice(-80)})`); };
  await fd(5000, 7, 0, 4); await refused('an RD for no time', 'The tenure must be more than 0.');
  await c.set('Tenure', -2); await refused('an RD for −2 years (it showed "Invested −₹1,20,000")', 'The tenure must be more than 0.');
  await c.set('Tenure', 0.04); await refused('an RD of 0.04 years', 'The tenure must be at least 1 month.');
  { const t0 = Date.now(); await c.set('Tenure', 30000000); await refused('an RD of 3 × 10⁷ years', 'The tenure is too long — at most 100 years (1,200 months).'); const ms = Date.now() - t0; ok(ms < 1000, `… at once (${ms} ms; the tab froze for 1.8 s)`); }
  await fd(5000, -500, 5, 4); await refused('an RD at −500 % (it showed dashes)', 'The interest rate cannot be negative.');
  await fd(0, 7, 5, 4); await refused('an instalment of 0', 'The monthly instalment must be more than 0.');
  await c.seg('Deposit', 'Fixed deposit');
  await fd(100000, 7, 0, 4); await refused('an FD for no time', 'The tenure must be more than 0.');
  await c.set('Tenure', -2); await refused('an FD for −2 years (it showed ₹87,041)', 'The tenure must be more than 0.');
  await c.set('Tenure', 5000); await refused('an FD for 5,000 years (a screen full of digits)', 'The tenure is too long — at most 100 years.');
  await fd(100000, -5, 5, 4); await refused('a negative rate', 'The interest rate cannot be negative.');
  await c.set('Interest rate', 1200); await refused('1,200 % a year', 'The interest rate is too high — at most 1,000 % a year.');
  await fd(-1000, 7, 5, 4); await refused('a negative deposit (a maturity value of −₹1,415)', 'The deposit must be more than 0.');
  await c.set(AMOUNT, 2e13); await refused('₹20 lakh crore', 'The deposit is too large — this calculator goes up to ₹10 lakh crore.');
  await fd(100000, 100, 100, 4); await refused('100 % for a century', 'The result is beyond ₹10,000 lakh crore — more than this calculator can show. Check the rate and the period.');
  await fd(100000, '', 5, 4); await refused('an empty rate', 'Fill in all the numbers.');
  await fd(100000, 7, 100, 4);
  ok(await c.big('Maturity value') === inr(Math.round(ref.fd.find((x) => x[0] === 100000 && x[1] === 7 && x[2] === 100 && x[3] === 4)[4])), `100 years is the longest tenure (${await c.big('Maturity value')})`);
  await fd(100000, 0, 5, 4);
  ok((await shown()).join() === '₹1,00,000,₹0,₹1,00,000' && await c.row('Effective annual yield') === '0%', `a rate of 0 %: the deposit comes back (${await shown()})`);

  // ---- copy
  await fd(100000, 7, 5, 4); await hookClipboard(page); await page.locator('.big-result').first().click();
  ok((await copied(page)).join() === '₹1,41,478', `a click on the maturity value copies it (${await copied(page)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/fd`); await ph.locator('.big-value').first().waitFor(); const pc = calc(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  await pc.seg('Deposit', 'Recurring deposit'); await pc.set(AMOUNT, 5000);
  ok(await pc.big('Maturity value') === '₹3,59,664' && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.seg-btn')].every((b) => b.getBoundingClientRect().height >= 44)), 'phone: the recurring deposit works; the choice is a 44 px touch target');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
