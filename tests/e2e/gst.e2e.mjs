// GST (#/gst): what the tab shows against decimal arithmetic on the typed amount (tests/fixtures/finance/reference.json,
// Python's decimal with ROUND_HALF_UP), in the four modes; the figures add up as shown; other rates; what is refused.
import { calc, num, inr, financeRef } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';

export default async ({ base, page: newPage, ok, devices }) => {
  const ref = await financeRef();
  const page = await newPage(); await page.goto(`${base}#/gst`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const SLABS = ['0.25', '3', '5', '12', '18', '28', '40'];
  const otherBox = page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Other rate$/ }) });
  const on = (label, option) => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${label}$`) }) }).getByRole('radio', { name: option, exact: true });
  const seg = async (label, option) => { if (await on(label, option).getAttribute('aria-checked') !== 'true') await c.seg(label, option); }; // a click on the chosen option changes nothing
  const set = async (amount, rate, inclusive, intra) => {
    await c.set('Amount', amount);
    if (SLABS.includes(String(rate))) await seg('GST rate', `${rate}%`); else { await seg('GST rate', 'Other'); await c.set('Other rate', rate); }
    await seg('Amount is', inclusive ? 'Including GST (remove)' : 'Before GST (add)'); await seg('Supply', intra ? 'Within state (CGST+SGST)' : 'Inter-state (IGST)');
  };
  const shown = async () => ({ total: await c.big('Total (incl. GST)'), tax: await c.big('GST amount'), base: await c.big('Base (excl. GST)'), rows: await c.rows() });
  const half = (r) => String(parseFloat((r / 2).toFixed(4)));

  // ---- the first view
  { const s = await shown();
    ok(s.total === '₹1,180' && s.tax === '₹180' && s.base === '₹1,000' && s.rows['CGST (9%)'] === '₹90' && s.rows['SGST (9%)'] === '₹90', `default ₹1,000 + 18 % within a state: ₹1,180 = ₹1,000 + 90 + 90 (${JSON.stringify(s)})`);
    ok(await otherBox.isHidden() && !(await page.locator('.calc-note').count()), 'the box for another rate is hidden until "Other" is chosen; no notes'); }
  await c.seg('Supply', 'Inter-state (IGST)');
  ok(await c.row('IGST (18%)') === '₹180' && Object.keys(await c.rows()).length === 1, 'inter-state: one line, IGST 18 %');

  // ---- the reference: every slab and four other rates, the four modes, amounts typed as in the fixture
  const MODES = [[false, false], [false, true], [true, false], [true, true]];
  const fixed = ref.gst.filter(([a, r]) => ['0.15', '1.005', '2.5', '10.25', '99.99', '100', '100.5', '999', '1234.56', '1234.565', '2.675', '49999.99', '123456789.01', '9999999999999.99', '-1180', '-100.5'].includes(a) && ['0.25', '5', '18', '28', '1.5', '0.125'].includes(r));
  const random = ref.gst.filter(([a]) => /^\d+\.\d\d$/.test(a) && a.length > 8).filter((_, i) => i % 14 === 0);
  let n = 0, bad = [], sums = [];
  for (const [amount, rate, ...want] of [...fixed, ...random]) {
    for (let k = (n % 2); k < 4; k += 2) { // two of the four modes for each pair, alternating
      const [inclusive, intra] = MODES[k], [b, cg, ig, tot] = want[k].map((p) => p / 100), r = parseFloat(rate);
      await set(amount, rate, inclusive, intra);
      const s = await shown(), at = `₹${amount} at ${rate} % (${inclusive ? 'with tax' : 'before tax'}, ${intra ? 'CGST + SGST' : 'IGST'})`;
      const rows = intra ? { [`CGST (${half(r)}%)`]: inr(cg), [`SGST (${half(r)}%)`]: inr(cg) } : { [`IGST (${parseFloat(rate)}%)`]: inr(ig) };
      if (s.total !== inr(tot) || s.base !== inr(b) || s.tax !== inr(intra ? 2 * cg : ig) || JSON.stringify(s.rows) !== JSON.stringify(rows)) bad.push(`${at}: ${JSON.stringify(s)} ≠ ${inr(tot)} ${inr(intra ? 2 * cg : ig)} ${inr(b)} ${JSON.stringify(rows)}`);
      // the figures on the screen add up, to the paisa, as they are printed
      const p = (x) => Math.round(num(x) * 100), parts = Object.values(s.rows).reduce((a, x) => a + p(x), 0);
      if (parts !== p(s.tax) || p(s.base) + p(s.tax) !== p(s.total)) sums.push(`${at}: ${Object.values(s.rows)} / ${s.tax} / ${s.base} / ${s.total}`);
    }
    n++;
  }
  ok(n >= 100 && !bad.length, `${n} amount × rate pairs of the reference (${2 * n} splits): total, GST, base and the tax lines as decimal arithmetic gives them ${bad.slice(0, 3).join(' | ')}`);
  ok(!sums.length, `… and on every one the lines add up to the GST shown, base + GST to the total ${sums.slice(0, 3).join(' | ')}`);

  // ---- the cases that did not add up
  await set(100.5, 5, false, true);
  { const s = await shown(); ok(s.tax === '₹5.02' && s.rows['CGST (2.5%)'] === '₹2.51' && s.rows['SGST (2.5%)'] === '₹2.51' && s.total === '₹105.52' && s.base === '₹100.50', `₹100.50 + 5 % within a state: 2.51 + 2.51 = ₹5.02 (it showed ₹5.03) (${JSON.stringify(s)})`); }
  await set(100, 18, true, true);
  { const s = await shown(); ok(s.total === '₹100' && s.tax === '₹15.26' && s.base === '₹84.74' && s.rows['CGST (9%)'] === '₹7.63', `₹100 including 18 %, within a state: ₹84.74 + 7.63 + 7.63 (it showed GST ₹15.25) (${JSON.stringify(s)})`); }
  await set(100, 18, true, false);
  { const s = await shown(); ok(s.total === '₹100' && s.tax === '₹15.25' && s.base === '₹84.75', `… and as IGST: ₹84.75 + 15.25 (${JSON.stringify(s)})`); }
  await set(1180, 18, true, true);
  { const s = await shown(); ok(s.base === '₹1,000' && s.tax === '₹180' && s.total === '₹1,180', 'remove 18 % from ₹1,180: ₹1,000'); }
  await set(12.1, 18, false, false);
  ok(await c.big('Base (excl. GST)') === '₹12.10' && await c.big('GST amount') === '₹2.18' && await c.big('Total (incl. GST)') === '₹14.28', `paise are written with both digits: ₹12.10 (${await c.big('Base (excl. GST)')})`);

  // ---- another rate
  await set(1000, 1.5, false, true);
  ok(await otherBox.isVisible() && await c.row('CGST (0.75%)') === '₹7.50' && await c.row('SGST (0.75%)') === '₹7.50' && await c.big('GST amount') === '₹15', `Other: 1.5 % → CGST 0.75 % + SGST 0.75 % (${JSON.stringify(await c.rows())})`);
  await c.set('Other rate', 0.125);
  ok(await c.row('CGST (0.0625%)') === '₹0.63' && await c.big('GST amount') === '₹1.26', `0.125 %: two halves of 0.0625 %, ₹0.63 each (${JSON.stringify(await c.rows())})`);
  await c.set('Other rate', 0.12345);
  ok(/^The rate is taken with three decimals: 0\.123 %\.$/.test((await page.locator('.calc-note').innerText()).trim()) && await c.big('GST amount') === '₹1.24', `0.12345 %: taken as 0.123 %, and said (${await page.locator('.calc-note').allInnerTexts()})`);
  await c.set('Other rate', 0);
  ok(await c.big('GST amount') === '₹0' && await c.big('Total (incl. GST)') === '₹1,000', 'a rate of 0 %');
  await c.set('Other rate', -1); ok(await c.warn() === 'The GST rate cannot be negative.', `a negative rate (${await c.warn()})`);
  await c.set('Other rate', 150); ok(await c.warn() === 'The GST rate is too high — at most 100 %.', `150 % (${await c.warn()})`);
  await c.set('Other rate', ''); ok(await c.warn() === 'Fill in all the numbers.', 'an empty rate');
  await c.seg('GST rate', '18%');
  ok(await otherBox.isHidden() && await c.big('GST amount') === '₹180' && !(await c.warn()), 'back on a slab the empty box is hidden and does not matter');
  await c.seg('GST rate', 'Other'); await c.set('Other rate', 7.5); await c.seg('Supply', 'Inter-state (IGST)');
  ok(await c.row('IGST (7.5%)') === '₹75', `7.5 % IGST (${JSON.stringify(await c.rows())})`);

  // ---- an amount with more than two decimals
  await set(1234.565, 12, false, false);
  ok(await c.big('Base (excl. GST)') === '₹1,234.57' && await c.big('GST amount') === '₹148.15' && await c.big('Total (incl. GST)') === '₹1,382.72' && /^The amount is taken to the paisa: ₹1,234\.57\.$/.test((await page.locator('.calc-note').innerText()).trim()), `₹1,234.565: taken as ₹1,234.57 and said; 1,234.57 + 148.15 = 1,382.72 (it showed 1,382.71) (${await c.big('Total (incl. GST)')})`);
  await set(1.005, 18, true, false);
  ok(await c.big('Total (incl. GST)') === '₹1.01' && await page.locator('.calc-note').count() === 1, '₹1.005 including tax: the total is ₹1.01');
  await set(1234.56, 12, false, false);
  ok(!(await page.locator('.calc-note').count()), 'an amount in whole paise: no note');

  // ---- credits, nothing, the largest amount, refusals
  await set(-1180, 18, true, true);
  { const s = await shown(); ok(s.total === '−₹1,180' && s.tax === '−₹180' && s.base === '−₹1,000' && s.rows['CGST (9%)'] === '−₹90', `a credit of ₹1,180 is the mirror image (${JSON.stringify(s)})`); }
  await set(0, 18, false, true);
  { const s = await shown(); ok(s.total === '₹0' && s.tax === '₹0' && s.base === '₹0' && s.rows['CGST (9%)'] === '₹0', 'an amount of 0'); }
  await set(1e13, 18, false, true);
  ok(await c.big('Total (incl. GST)') === '₹1,18,00,00,00,00,000' && await c.row('CGST (9%)') === inr(9e11), `₹10 lakh crore: ${await c.big('Total (incl. GST)')}, CGST ${await c.row('CGST (9%)')}`);
  await c.set('Amount', 1e18);
  ok(await c.warn() === 'The amount is too large — this calculator goes up to ₹10 lakh crore.' && !(await page.locator('.big-result').count()), `10¹⁸ rupees is refused (${await c.warn()})`);
  await c.set('Amount', '');
  ok(await c.warn() === 'Fill in all the numbers.', 'an empty amount asks for a number');
  ok(!/NaN|undefined/.test(await page.locator('.tool-body').innerText()), 'never a NaN on the page');

  // ---- copy
  await set(100.5, 5, false, true); await hookClipboard(page);
  await page.locator('.big-result').nth(1).click();
  ok((await copied(page)).join() === '₹5.02', `a click on the GST amount copies it (${await copied(page)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/gst`); await ph.locator('.big-value').first().waitFor(); const pc = calc(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll (eight rate buttons)');
  await pc.seg('GST rate', 'Other');
  ok(await ph.locator('.field').filter({ has: ph.locator('.field-label', { hasText: /^Other rate$/ }) }).isVisible() && await pc.row('CGST (0.75%)') === '₹7.50' && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: "Other" shows its box and works');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.seg-btn')].every((b) => b.getBoundingClientRect().height >= 44)), 'phone: every rate button is a 44 px touch target');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
