// mathcore.wasm GST invoice maths (integer paise, half-up per line) and GSTIN validation (GSTN mod-36 check character).
export default async (t, { load, wasm }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const mc = bindMathcore(await wasm('mathcore'));
  // intra-state: CGST + SGST, half the rate each
  const a = mc.invoice([[2, 500, 0, 18], [1, 999.99, 10, 12]], true, true);
  t.eq(a.lines[0], { taxable: 1000, cgst: 90, sgst: 90, igst: 0 }, '2 × ₹500 @18 %: ₹90 CGST + ₹90 SGST');
  t.eq(a.lines[1], { taxable: 899.99, cgst: 54, sgst: 54, igst: 0 }, '₹999.99 −10 % (₹100.00) = ₹899.99; 6 % = ₹53.9994 → ₹54.00 each');
  t.eq([a.taxable, a.cgst, a.sgst, a.igst, a.total], [1899.99, 144, 144, 0, 2187.99], 'totals');
  t.eq([a.roundoff, a.grand], [0.01, 2188], 'rounded to the rupee (+₹0.01)');
  // inter-state: IGST
  const b = mc.invoice([[1, 999.99, 10, 12], [3, 333.33, 0, 0.25]], false, false);
  t.eq(b.lines[0].igst, 108, '12 % of ₹899.99 = ₹107.9988 → ₹108.00 IGST');
  t.eq(b.lines[1], { taxable: 999.99, cgst: 0, sgst: 0, igst: 2.5 }, '0.25 % rate is exact (₹2.499975 → ₹2.50)');
  t.eq([b.roundoff, b.grand], [0, b.total], 'no round-off when switched off');
  // fractional quantities, 0 % rate, 40 % slab, no float drift on many lines
  const c = mc.invoice([[2.5, 120.4, 0, 5], [1, 100, 0, 0], [1, 1000, 0, 40]], true, false);
  t.eq(c.lines[0].taxable, 301, '2.5 kg × ₹120.40 = ₹301.00');
  t.eq(c.lines[1].cgst + c.lines[1].sgst, 0, '0 % rated line has no tax');
  t.eq(c.lines[2].cgst, 200, '40 % slab: ₹200 CGST');
  const many = mc.invoice(Array.from({ length: 1000 }, () => [1, 0.1, 0, 18]), true, false);
  t.eq(many.taxable, 100, '1000 × ₹0.10 = exactly ₹100.00 (no floating-point drift)');
  t.eq(mc.invoice([], true, true).grand, 0, 'empty invoice');
  // GSTIN
  t.ok(mc.gstinValid('27AAPFU0939F1ZV'), 'GSTN sample 27AAPFU0939F1ZV is valid');
  t.ok(mc.gstinValid(' 27aapfu0939f1zv '), 'case and spaces ignored');
  t.ok(!mc.gstinValid('27AAPFU0939F1ZW'), 'wrong check character');
  t.ok(!mc.gstinValid('27AAPFU0939F1Z'), 'too short');
  t.ok(!mc.gstinValid('00AAPFU0939F1ZV'), 'state code 00');
  t.ok(!mc.gstinValid('27AAP1U0939F1ZV'), 'PAN part must be 5 letters, 4 digits, 1 letter');
  t.ok(!mc.gstinValid('27AAPFU0939F1Z!'), 'symbols rejected');
};
