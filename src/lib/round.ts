// Decimal rounding for what the calculators show (no DOM: also used by the engines' glue and the unit suites).

/** x to d decimals as the number is written with 15 digits, half away from zero: 7.1225 → 7.123 and 1.005 → 1.01,
 *  though the doubles nearest to them lie a hair below (Intl and toFixed round the binary value: 7.122, 1.00).
 *  A number whose d decimals need more than 15 digits (₹99,99,99,99,99,999.99) is left as it is: there the 15-digit
 *  reading would cut real digits, and a double has no room for a hidden tie. */
export function roundDec(x: number, d: number): number {
  if (!Number.isFinite(x) || Number.isInteger(x) || Math.abs(x) * 10 ** d >= 1e15) return x;
  const [m, e] = Number(Math.abs(x).toPrecision(15)).toExponential().split('e');
  return Math.sign(x) * Math.round(Number(`${m}e${Number(e) + d}`)) / 10 ** d;
}
