// The calculators' shared number formatting (src/lib/form.ts): rupees with Indian grouping and both digits of the
// paise, numbers to a few decimals — rounded as the number is written, not as its binary double happens to lie.
// Expected texts are written out by hand (decimal arithmetic on paper); the tie cases were checked with Python's decimal.
export default async (t, { load }) => {
  const { fmtINR, fmtN, fmtIntl, roundDec } = await load('/src/lib/form.ts');

  // ---- ties at the rounding digit: the doubles nearest to these lie below them, and Intl / toFixed round them down
  for (const [x, d, want] of [[7.1225, 3, 7.123], [15.5625, 3, 15.563], [1.005, 2, 1.01], [2.675, 2, 2.68], [1.115, 2, 1.12], [8.345, 2, 8.35], [0.285, 2, 0.29], [1.45, 1, 1.5], [0.5, 0, 1], [2.5, 0, 3], [1234.5645, 3, 1234.565],
    [-7.1225, 3, -7.123], [-1.005, 2, -1.01], [-2.5, 0, -3], [-0.5, 0, -1]]) t.eq(roundDec(x, d), want, `roundDec(${x}, ${d}) is ${want} — half away from zero on the decimal`);
  // ---- binary noise is not a tie
  t.eq(roundDec(7.122500000000002, 3), 7.123, '7.1225 with noise above');
  t.eq(roundDec(7.122499999999998, 3), 7.123, '7.1225 with noise below (15 digits read it as 7.1225)');
  t.eq(roundDec(7.12249, 3), 7.122, 'a number really below the tie stays below');
  t.eq(roundDec(0.1 + 0.2, 2), 0.3, '0.30000000000000004');
  t.eq(roundDec(1.0049999, 2), 1, '1.0049999 is 1.00');
  // ---- what is already exact, or beyond the digits of a double, is left alone
  for (const x of [0, 1, -3, 9007199254740993, 1e15, 1.5e15, 1e21, 123456789012345680000, Infinity, -Infinity]) t.eq(roundDec(x, 2), x, `roundDec(${x}, 2) is unchanged`);
  t.ok(Number.isNaN(roundDec(NaN, 2)), 'not a number stays so');
  t.eq(roundDec(123456789012.345, 2), 123456789012.35, 'twelve digits before the point');
  t.eq(roundDec(1e-7, 3), 0, 'a ten-millionth to three decimals is 0');
  t.eq(roundDec(1.23456e-5, 7), 0.0000123, 'small numbers written with an exponent');
  t.eq(roundDec(999.9996, 3), 1000, 'a carry through every digit');

  // ---- numbers
  for (const [x, d, want] of [[7.1225, 3, '7.123'], [15.5625, 3, '15.563'], [2.8032, 2, '2.8'], [5.4736, 2, '5.47'], [1399.3, 6, '1,399.3'], [1234567.891, 2, '1,234,567.89'], [0, 2, '0'], [33.3333333333, 6, '33.333333'], [1.005, 2, '1.01'], [-1.005, 2, '-1.01']])
    t.eq(fmtN(x, d), want, `fmtN(${x}, ${d})`);
  t.eq(fmtN(NaN), '—', 'no number: a dash'); t.eq(fmtN(Infinity), '—', 'infinite: a dash');
  t.eq(fmtIntl(1234567.005), '1,234,567.01', 'fmtIntl rounds the same way');

  // ---- rupees: Indian grouping, whole rupees bare, paise with both digits
  for (const [x, want] of [[0, '₹0'], [1, '₹1'], [12.1, '₹12.10'], [12.34, '₹12.34'], [100.5, '₹100.50'], [1000, '₹1,000'], [100000, '₹1,00,000'], [2500000, '₹25,00,000'], [1234567.89, '₹12,34,567.89'], [10000000, '₹1,00,00,000'],
    [1e13, '₹1,00,00,00,00,00,000'], [0.01, '₹0.01'], [0.1, '₹0.10'], [1.005, '₹1.01'], [2.675, '₹2.68'], [0.004, '₹0'], [0.005, '₹0.01'], [99.999, '₹100'], [99.994, '₹99.99'],
    [-1234.5, '−₹1,234.50'], [-0.004, '₹0'], [-0, '₹0'], [-1, '−₹1'], [-1.005, '−₹1.01']]) t.eq(fmtINR(x), want, `fmtINR(${Object.is(x, -0) ? '-0' : x})`);
  // sixteen digits: every one is kept (reading the amount with 15 digits made ₹1,00,12,50,00,00,000 of the second)
  t.eq(fmtINR(9999999999999.99), '₹99,99,99,99,99,999.99', '₹10 lakh crore less a paisa');
  t.eq(fmtINR(10012499999999.99), '₹1,00,12,49,99,99,999.99', 'sixteen digits of rupees and paise');
  t.eq(roundDec(10012499999999.99, 2), 10012499999999.99, '… roundDec leaves them alone');
  t.eq(roundDec(999999999999.995, 2), 1000000000000, 'fifteen digits are still read as written');
  t.eq(fmtINR(1234.5, false), '1,234.50', 'without the rupee sign');
  t.eq(fmtINR(NaN), '—', 'no amount: a dash'); t.eq(fmtINR(Infinity), '—', 'infinite: a dash');
};
