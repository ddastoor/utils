// The Unit Converter's table and arithmetic (src/tools/calculators.ts `units`). A conversion is one multiplication
// and one division by constants (or the temperature / fuel-economy formulas) — glue arithmetic, kept in TypeScript
// under the compute rule (CLAUDE.md §7). Every factor is the exact definition (international yard and pound 1959,
// US gallon = 231 in³, imperial gallon = 4.54609 l, SI 2019), written so that it can be checked by eye:
// tests/unit/units.test.mjs holds all of them to GNU Units.

/** a factor to the category's base unit, or [to base, from base] where the relation is not a factor */
export type Unit = number | [(x: number) => number, (x: number) => number];
const US_GALLON = 3.785411784, UK_GALLON = 4.54609, FT = 0.3048, IN = 0.0254, LB = 0.45359237, MILE = 1609.344;

export const UNITS: Record<string, { label: string; units: Record<string, Unit> }> = {
  length: { label: 'Length', units: { 'mm': 1e-3, 'cm': 1e-2, 'm': 1, 'km': 1e3, 'inch': IN, 'foot': FT, 'yard': 0.9144, 'mile': MILE, 'nautical mile': 1852 } },
  mass: { label: 'Weight / mass', units: { 'mg': 1e-6, 'g': 1e-3, 'kg': 1, 'quintal (100 kg)': 100, 'tonne': 1000, 'ounce': LB / 16, 'pound': LB, 'stone': 14 * LB, 'carat': 2e-4, 'tola': 0.0116638038 } },
  temperature: { label: 'Temperature', units: {
    '°C': [(c) => c, (c) => c], '°F': [(f) => ((f - 32) * 5) / 9, (c) => (c * 9) / 5 + 32], 'K': [(k) => k - 273.15, (c) => c + 273.15] } },
  area: { label: 'Area', units: { 'm²': 1, 'cm²': 1e-4, 'km²': 1e6, 'ft²': FT * FT, 'in²': IN * IN, 'yd²': 0.83612736, 'acre': 4046.8564224, 'hectare': 1e4, 'mile²': MILE * MILE, 'gaj (sq yd)': 0.83612736,
    'cent (435.6 ft²)': 40.468564224, 'guntha (1,089 ft²)': 101.17141056, 'ground (2,400 ft²)': 222.967296, 'bigha (UP, 27,000 ft²)': 2508.38208 } },
  volume: { label: 'Volume', units: { 'ml': 1e-3, 'litre': 1, 'm³': 1000, 'tsp (5 ml)': 0.005, 'tbsp (15 ml)': 0.015, 'cup (250 ml)': 0.25,
    'tsp (US)': US_GALLON / 768, 'tbsp (US)': US_GALLON / 256, 'fl oz (US)': US_GALLON / 128, 'cup (US)': US_GALLON / 16, 'pint (US)': US_GALLON / 8, 'gallon (US)': US_GALLON,
    'fl oz (UK)': UK_GALLON / 160, 'pint (UK)': UK_GALLON / 8, 'gallon (UK)': UK_GALLON, 'in³': 0.016387064, 'ft³': 28.316846592 } },
  speed: { label: 'Speed', units: { 'm/s': 1, 'km/h': 1 / 3.6, 'mph': 0.44704, 'knot': 1852 / 3600, 'ft/s': FT } },
  data: { label: 'Data size', units: { 'bit': 0.125, 'byte': 1, 'KB (1000)': 1e3, 'MB (1000²)': 1e6, 'GB (1000³)': 1e9, 'TB (1000⁴)': 1e12, 'KiB (1024)': 1024, 'MiB (1024²)': 1048576, 'GiB (1024³)': 1073741824, 'TiB (1024⁴)': 1099511627776 } },
  time: { label: 'Time', units: { 'ms': 1e-3, 'second': 1, 'minute': 60, 'hour': 3600, 'day': 86400, 'week': 604800, 'month (avg)': 2629746, 'year (365.2425 d)': 31556952 } },
  pressure: { label: 'Pressure', units: { 'Pa': 1, 'kPa': 1e3, 'bar': 1e5, 'atm': 101325, 'psi': 6894.757293168361, 'kgf/cm²': 98066.5, 'mmHg': 133.322387415, 'torr': 101325 / 760 } },
  energy: { label: 'Energy', units: { 'J': 1, 'kJ': 1e3, 'cal': 4.184, 'kcal': 4184, 'Wh': 3600, 'kWh (unit)': 3.6e6, 'BTU': 1055.05585262, 'eV': 1.602176634e-19 } },
  power: { label: 'Power', units: { 'W': 1, 'kW': 1e3, 'hp (metric)': 735.49875, 'hp (mech)': 745.6998715822702 } },
  angle: { label: 'Angle', units: { 'degree': 1, 'radian': 180 / Math.PI, 'gradian': 0.9, 'turn': 360, 'arcminute': 1 / 60, 'arcsecond': 1 / 3600 } },
  // base km/l; l/100 km is its reciprocal (so 0 has no counterpart)
  fuel: { label: 'Fuel economy', units: { 'km/l': [(x) => x, (x) => x], 'l/100km': [(x) => 100 / x, (x) => 100 / x],
    'mpg (US)': [(x) => (x * MILE) / 1000 / US_GALLON, (x) => (x * US_GALLON * 1000) / MILE], 'mpg (UK)': [(x) => (x * MILE) / 1000 / UK_GALLON, (x) => (x * UK_GALLON * 1000) / MILE] } },
};

const toBase = (cat: string, u: string, x: number) => { const f = UNITS[cat].units[u]; return typeof f === 'number' ? x * f : f[0](x); };
const fromBase = (cat: string, u: string, x: number) => { const f = UNITS[cat].units[u]; return typeof f === 'number' ? x / f : f[1](x); };
/** x `from` in `to`. Fuel economy of 0 or less has no counterpart (NaN). */
export function convert(cat: string, from: string, to: string, x: number): number {
  if (cat === 'fuel' && !(x > 0)) return from === to ? x : NaN;
  return from === to ? x : fromBase(cat, to, toBase(cat, from, x));
}
/** every unit of the category for x `from` */
export const convertAll = (cat: string, from: string, x: number): Array<[string, number]> => Object.keys(UNITS[cat].units).map((u) => [u, convert(cat, from, u, x)]);
/** below absolute zero? (for a note; the arithmetic goes on) */
export const belowAbsoluteZero = (cat: string, from: string, x: number) => cat === 'temperature' && toBase(cat, from, x) < -273.15 - 1e-9;

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const grouped = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 10 }), groupedLong = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 15 });
/** A result for the eye: 10 significant digits (the noise of binary fractions is beyond them), digits grouped;
 *  whole numbers with all their digits, and 15 digits from a thousand million on, where the part before the point
 *  needs them; very small and very large values as 9.094947018 × 10⁻¹³ — never rounded to 0. */
export function fmtUnit(x: number): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e15 || a < 1e-6) {
    const [m, e] = x.toExponential(9).split('e');
    return `${String(parseFloat(m))} × 10${String(parseInt(e, 10)).replace(/./g, (c) => SUP[c])}`;
  }
  return (a >= 1e9 ? groupedLong : grouped).format(x);
}
/** the same number for the clipboard: no grouping, e-notation where fmtUnit writes a power of ten */
export function plainUnit(x: number): string {
  if (!Number.isFinite(x)) return '';
  const a = Math.abs(x);
  return x === 0 ? '0' : a >= 1e15 || a < 1e-6 ? String(parseFloat(x.toExponential(9))) : String(parseFloat(x.toPrecision(a >= 1e9 ? 15 : 10)));
}
