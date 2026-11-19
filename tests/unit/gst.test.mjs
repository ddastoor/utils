// GST: mathcore's m_gst (whole paise, 128-bit products on a double) and the tab's reading of its input
// (src/lib/finance.ts) against tests/fixtures/finance/reference.json — Python's decimal with ROUND_HALF_UP on the typed
// text of each amount (scripts/make-finance-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const F = await load('/src/lib/finance.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/finance/reference.json'), 'utf8'));
  const P = (x) => Math.round(x * 100); // rupees of the wrapper → paise
  const MODES = [[false, false, 'before tax, IGST'], [false, true, 'before tax, CGST + SGST'], [true, false, 'with tax, IGST'], [true, true, 'with tax, CGST + SGST']];

  // ---- 1,126 amount × rate pairs in the four modes: every figure to the paisa
  let n = 0, bad = [];
  for (const [amount, rate, ...want] of ref.gst) {
    MODES.forEach(([inclusive, intra, name], k) => {
      const g = m.gst(parseFloat(amount), parseFloat(rate), inclusive, intra), [base, c, ig, total] = want[k]; n++;
      if (!g || P(g.base) !== base || P(g.cgst) !== c || P(g.sgst) !== c || P(g.igst) !== ig || P(g.total) !== total) bad.push(`₹${amount} at ${rate} % (${name}): ${g && [P(g.base), P(g.cgst), P(g.igst), P(g.total)]} ≠ ${want[k]}`);
    });
  }
  t.ok(n === 4504 && !bad.length, `${n} splits agree with decimal arithmetic to the paisa ${bad.slice(0, 4).join(' | ')}`);

  // ---- what every split must satisfy, whatever the numbers (2,000 random amounts and rates of up to three decimals)
  let s = 12345; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  bad = []; let unreachable = 0, backwards = 0;
  for (let i = 0; i < 2000; i++) {
    const amount = Math.round(rnd() * 10 ** (1 + Math.floor(rnd() * 9)) * 100) / 100 * (rnd() < 0.1 ? -1 : 1), rate = [0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40, Math.round(rnd() * 100000) / 1000][Math.floor(rnd() * 10)];
    for (const [inclusive, intra, name] of MODES) {
      const g = m.gst(amount, rate, inclusive, intra), a = P(amount), at = `₹${amount} at ${rate} % (${name})`;
      if (P(g.base) + P(g.cgst) + P(g.sgst) + P(g.igst) !== P(g.total)) bad.push(`${at}: base + tax ≠ total`);
      if (P(inclusive ? g.total : g.base) !== a) bad.push(`${at}: the typed amount is not ${inclusive ? 'the total' : 'the base'}`);
      if (P(g.cgst) !== P(g.sgst) || (intra ? P(g.igst) !== 0 : P(g.cgst) !== 0)) bad.push(`${at}: CGST ≠ SGST, or the wrong tax`);
      const tax = P(g.cgst) + P(g.sgst) + P(g.igst);
      if (Math.sign(tax) * Math.sign(a) < 0) bad.push(`${at}: the tax has the other sign`);
      // the exact tax is within half a paisa of each rounded tax
      const exact = inclusive ? a * rate / (100 + rate) : a * rate / 100;
      if (Math.abs(tax - exact) > (intra ? 1 : 0.5) + 1e-6) bad.push(`${at}: tax ${tax} paise, exact ${exact}`);
      if (inclusive) { // adding the tax to the base found must give the amount back — or miss it by a paisa where no base can
        backwards++;
        const f = m.gst(g.base, rate, false, intra);
        if (P(f.total) !== a) { unreachable++; if (Math.abs(P(f.total) - a) > (intra ? 2 : 1)) bad.push(`${at}: adding tax to the base gives ${f.total}`); }
      }
    }
  }
  t.ok(!bad.length, `8,000 random splits: base + tax = total, the typed amount is kept, CGST = SGST, each tax within half a paisa of the exact one ${bad.slice(0, 4).join(' | ')}`);
  t.ok(unreachable > 0 && unreachable < backwards * 0.2, `removing and adding back: ${backwards - unreachable} of ${backwards} amounts come back to the paisa; ${unreachable} cannot (no base gives that total), and miss by one paisa a tax at most`);

  // ---- the cases the tab got wrong with binary fractions
  const show = (g) => [g.base, g.cgst, g.sgst, g.igst, g.total].join(' ');
  t.eq(show(m.gst(100.5, 5, false, true)), '100.5 2.51 2.51 0 105.52', '₹100.50 + 5 % within a state: 2.51 + 2.51 = 5.02 (the tab showed GST 5.03 beside CGST 2.51 and SGST 2.51)');
  t.eq(show(m.gst(100.5, 5, false, false)), '100.5 0 0 5.03 105.53', '₹100.50 + 5 % IGST: 5.025 is 5.03');
  t.eq(show(m.gst(0.15, 18, false, true)), '0.15 0.01 0.01 0 0.17', '₹0.15 + 18 %: 0.01 + 0.01 (the tab showed GST 0.03)');
  t.eq(show(m.gst(100, 18, true, true)), '84.74 7.63 7.63 0 100', '₹100 including 18 %, within a state: 7.63 + 7.63 = 15.26 and a base of 84.74 (the tab showed GST 15.25 beside 7.63 + 7.63)');
  t.eq(show(m.gst(100, 18, true, false)), '84.75 0 0 15.25 100', '₹100 including 18 % IGST: 84.75 + 15.25');
  t.eq(show(m.gst(99.99, 28, true, true)), '78.11 10.94 10.94 0 99.99', '₹99.99 including 28 %');
  t.eq(show(m.gst(999, 0.25, true, true)), '996.5 1.25 1.25 0 999', '₹999 including 0.25 %');
  t.eq(show(m.gst(1180, 18, true, true)), '1000 90 90 0 1180', '₹1,180 including 18 %: ₹1,000 + 90 + 90');
  t.eq(show(m.gst(-1180, 18, true, true)), '-1000 -90 -90 0 -1180', 'a credit of ₹1,180: the mirror image');
  t.eq(show(m.gst(-100.5, 5, false, false)), '-100.5 0 0 -5.03 -105.53', 'a negative amount rounds away from zero as well');
  t.eq(show(m.gst(0, 18, false, true)), '0 0 0 0 0', 'nothing');
  t.eq(show(m.gst(1000, 0, false, true)), '1000 0 0 0 1000', 'a rate of 0 %');
  t.eq(show(m.gst(1000, 100, true, false)), '500 0 0 500 1000', '100 % included: half is tax');
  // ---- an amount is read as it is written (the double nearest 1.005 lies below it)
  t.eq(m.gst(1.005, 0, false, false).base, 1.01, '₹1.005 is 101 paise');
  t.eq(m.gst(2.675, 0, false, false).base, 2.68, '₹2.675 is 268 paise');
  t.eq(m.gst(1234.565, 12, false, false).total, 1382.72, '₹1,234.565 + 12 %: 1,234.57 + 148.15 = 1,382.72 (the tab showed 1,382.71)');
  t.eq(m.gst(1234.5649, 0, false, false).base, 1234.56, '₹1,234.5649 is 1,234.56');
  { const g = m.gst(1e13, 18, false, true); t.ok(g.total === 1.18e13 && g.cgst === 9e11, `₹10 lakh crore: ${show(g)}`); }
  t.eq(m.gst(1.01e13, 18, false, true), null, 'beyond ₹10 lakh crore: no answer from the engine');
  t.eq(m.gst(1000, -1, false, true), null, 'a negative rate: none');
  t.eq(m.gst(1000, 100.5, false, true), null, 'a rate above 100 %: none');
  t.eq(m.gst(NaN, 18, false, true), null, 'not a number: none');
  // ---- the same reading in the invoice engine (a line of 1 × ₹1.005 was ₹1.00: of the amounts x.xx5 up to ₹200, 1,147 of
  //      20,000 were rounded down by rupees × 100 + 0.5 in doubles)
  { const inv = m.invoice([[3, 33.335, 0, 18], [1, 1.005, 0, 5], [7, 14.285, 10, 12]], false, false);
    t.ok(inv.lines[0].taxable === 100.01 && inv.lines[0].igst === 18, `3 × ₹33.335: taxable ${inv.lines[0].taxable}, IGST ${inv.lines[0].igst}`);
    t.ok(inv.lines[1].taxable === 1.01 && inv.lines[1].igst === 0.05, `1 × ₹1.005: taxable ${inv.lines[1].taxable}, IGST ${inv.lines[1].igst}`);
    // 7 × 14.285 = 99.995 → 100.00 (the product in doubles is 99.99499999999999); 10 % off: 9.9995 → 10.00; 90.00 at 12 % = 10.80
    t.ok(inv.lines[2].taxable === 90 && inv.lines[2].igst === 10.8, `7 × ₹14.285 less 10 %: taxable ${inv.lines[2].taxable}, IGST ${inv.lines[2].igst}`); }

  // ---- the tab's reading of its input
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  { const g = F.gstSplit(m, 1000, 18, false, true); t.ok(g.tax === 180 && g.rate === 18 && !g.rounded && g.cgst === 90 && g.total === 1180, `₹1,000 + 18 %: ${JSON.stringify(g)}`); }
  { const g = F.gstSplit(m, 1234.565, 12, false, false); t.ok(g.rounded && g.base === 1234.57, 'an amount with three decimals is said to be rounded'); }
  { const g = F.gstSplit(m, 1234.565, 12, true, false); t.ok(g.rounded && g.total === 1234.57, '… also when it includes the tax'); }
  t.ok(!F.gstSplit(m, 0.1 + 0.2, 18, false, true).rounded && !F.gstSplit(m, 99999.99, 28, true, true).rounded && !F.gstSplit(m, 1e13, 5, false, false).rounded, 'amounts in whole paise are not');
  { const g = F.gstSplit(m, 1000, 0.12345, false, false); t.ok(g.rate === 0.123 && g.igst === 1.23, `a rate with five decimals is taken with three (${g.rate} %, IGST ${g.igst})`); }
  { const g = F.gstSplit(m, 1000, 0.125, false, true); t.ok(g.rate === 0.125 && g.cgst === 0.63 && g.tax === 1.26, `0.125 % within a state: two halves of 0.0625 % (${g.cgst} + ${g.sgst})`); }
  t.eq(why(() => F.gstSplit(m, 2e13, 18, false, true)), 'The amount is too large — this calculator goes up to ₹10 lakh crore.', 'too large');
  t.eq(why(() => F.gstSplit(m, -2e13, 18, false, true)), 'The amount is too large — this calculator goes up to ₹10 lakh crore.', 'too large a credit');
  t.eq(why(() => F.gstSplit(m, 1000, -5, false, true)), 'The GST rate cannot be negative.', 'a negative rate');
  t.eq(why(() => F.gstSplit(m, 1000, 101, false, true)), 'The GST rate is too high — at most 100 %.', 'a rate above 100 %');
};
