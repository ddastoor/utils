// The Unit Converter's table (src/lib/units.ts) against GNU Units 2.23, a program with its own definitions
// (scripts/make-units-reference.py → tests/fixtures/units/reference.json): every ordered pair of units of every
// category for several values. Plus the definitions written out, the display and what is copied.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, root }) => {
  const { UNITS, convert, convertAll, belowAbsoluteZero, fmtUnit, plainUnit } = await load('src/lib/units.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/units/reference.json'), 'utf8'));

  // 1. GNU Units: every pair
  const byCat = new Map();
  for (const [cat, from, to, x, want] of ref.cases) {
    const g = byCat.get(cat) || { n: 0, bad: [], units: new Set() }; byCat.set(cat, g); g.n++; g.units.add(from);
    const got = convert(cat, from, to, x), w = Number(want);
    // temperatures are differences from an offset: a hair of absolute error near 0 is all a double can do
    const ok = cat === 'temperature' ? Math.abs(got - w) <= 1e-11 * Math.max(1, Math.abs(w)) : Math.abs(got - w) <= 1e-13 * Math.abs(w);
    if (!ok) g.bad.push(`${x} ${from} = ${got} ${to}, GNU Units says ${want}`);
  }
  for (const [cat, g] of byCat) t.ok(!g.bad.length, `${UNITS[cat].label}: ${g.n} conversions between ${g.units.size} units as GNU Units ${ref.gnu_units} gives them${g.bad.length ? ` — ${g.bad.length} differ: ${g.bad.slice(0, 3).join('; ')}` : ''}`);
  t.eq([...byCat.keys()].sort(), Object.keys(UNITS).sort(), 'every category of the tab is in the reference');
  for (const [cat, g] of byCat) t.eq([...g.units].sort(), Object.keys(UNITS[cat].units).sort(), `${UNITS[cat].label}: every unit of the tab is in the reference`);
  t.ok(ref.cases.length > 3000, `${ref.cases.length} reference conversions`);

  // 2. the definitions, written out (what the factors were rounded from before)
  for (const [cat, x, from, to, want, why] of [
    ['length', 1, 'inch', 'mm', 25.4, 'the inch is 25.4 mm'], ['length', 1, 'mile', 'foot', 5280, 'a mile is 5,280 feet'], ['length', 1, 'yard', 'inch', 36, 'a yard is 36 inches'], ['length', 1, 'nautical mile', 'm', 1852, 'a nautical mile is 1,852 m'],
    ['speed', 1, 'knot', 'km/h', 1.852, 'a knot is 1.852 km/h (it was 1.8519984)'], ['speed', 60, 'mph', 'ft/s', 88, '60 mph is 88 ft/s'], ['speed', 36, 'km/h', 'm/s', 10, '36 km/h is 10 m/s'],
    ['mass', 1, 'pound', 'ounce', 16, 'a pound is 16 ounces'], ['mass', 1, 'stone', 'pound', 14, 'a stone is 14 pounds'], ['mass', 1, 'tola', 'g', 11.6638038, 'a tola is 180 grains = 11.6638038 g'], ['mass', 1, 'carat', 'mg', 200, 'a carat is 200 mg'], ['mass', 1, 'quintal (100 kg)', 'kg', 100, 'a quintal is 100 kg'],
    ['volume', 1, 'gallon (US)', 'in³', 231, 'the US gallon is 231 cubic inches'], ['volume', 1, 'gallon (US)', 'fl oz (US)', 128, '128 US fluid ounces'], ['volume', 1, 'cup (US)', 'tbsp (US)', 16, 'a US cup is 16 tablespoons'], ['volume', 1, 'tbsp (US)', 'tsp (US)', 3, '3 teaspoons'],
    ['volume', 1, 'gallon (UK)', 'pint (UK)', 8, '8 imperial pints'], ['volume', 1, 'pint (UK)', 'fl oz (UK)', 20, 'an imperial pint is 20 fluid ounces'], ['volume', 1, 'ft³', 'in³', 1728, 'a cubic foot is 1,728 cubic inches'], ['volume', 1, 'cup (250 ml)', 'tbsp (15 ml)', 250 / 15, 'the metric cup and spoon'], ['volume', 1, 'tbsp (15 ml)', 'tsp (5 ml)', 3, 'metric: 3 teaspoons'],
    ['area', 1, 'acre', 'ft²', 43560, 'an acre is 43,560 square feet'], ['area', 1, 'acre', 'cent (435.6 ft²)', 100, 'an acre is 100 cents'], ['area', 1, 'acre', 'guntha (1,089 ft²)', 40, 'an acre is 40 guntha'], ['area', 1, 'ground (2,400 ft²)', 'ft²', 2400, 'a ground is 2,400 square feet'], ['area', 1, 'bigha (UP, 27,000 ft²)', 'ft²', 27000, 'the bigha of UP'],
    ['area', 1, 'mile²', 'acre', 640, 'a square mile is 640 acres'], ['area', 1, 'hectare', 'm²', 10000, 'a hectare'], ['area', 1, 'gaj (sq yd)', 'ft²', 9, 'a gaj is 9 square feet'],
    ['pressure', 1, 'atm', 'torr', 760, 'an atmosphere is 760 torr'], ['pressure', 1, 'kgf/cm²', 'kPa', 98.0665, 'kgf/cm²'], ['pressure', 1, 'bar', 'kPa', 100, 'a bar'], ['pressure', 32, 'psi', 'kPa', 220.63223338138755, 'a tyre at 32 psi'],
    ['energy', 1, 'kWh (unit)', 'kJ', 3600, 'a unit of electricity is 3,600 kJ'], ['energy', 1, 'kcal', 'kJ', 4.184, 'the thermochemical calorie'], ['energy', 1, 'BTU', 'J', 1055.05585262, 'the International Table BTU (it was 1055.06)'],
    ['power', 1, 'hp (metric)', 'W', 735.49875, 'metric horsepower'], ['power', 1, 'hp (mech)', 'W', 745.6998715822702, '550 ft·lbf/s'],
    ['data', 1, 'GiB (1024³)', 'byte', 1073741824, 'a gibibyte'], ['data', 1, 'TB (1000⁴)', 'GiB (1024³)', 931.3225746154785, 'a "1 TB" disk in GiB'], ['data', 1, 'byte', 'bit', 8, '8 bits'],
    ['time', 1, 'week', 'hour', 168, 'a week'], ['time', 1, 'year (365.2425 d)', 'day', 365.2425, 'the Gregorian year'], ['time', 12, 'month (avg)', 'year (365.2425 d)', 1, '12 average months'],
    ['angle', 180, 'degree', 'radian', Math.PI, 'π radians'], ['angle', 1, 'turn', 'gradian', 400, '400 gradians'], ['angle', 1, 'degree', 'arcsecond', 3600, '3,600 arc seconds'],
    ['temperature', 100, '°C', '°F', 212, 'water boils'], ['temperature', -40, '°F', '°C', -40, '−40 is the same'], ['temperature', 0, 'K', '°C', -273.15, 'absolute zero'], ['temperature', 98.6, '°F', '°C', 37, 'body temperature'], ['temperature', 300, 'K', '°F', 80.33, '300 K'],
    ['fuel', 20, 'km/l', 'l/100km', 5, '20 km/l is 5 l/100 km'], ['fuel', 5, 'l/100km', 'km/l', 20, 'and back'], ['fuel', 1, 'mpg (US)', 'km/l', 1.609344 / 3.785411784, 'miles per US gallon'], ['fuel', 1, 'mpg (UK)', 'km/l', 1.609344 / 4.54609, 'miles per imperial gallon'], ['fuel', 30, 'mpg (UK)', 'mpg (US)', 30 * 3.785411784 / 4.54609, 'UK and US mpg'],
  ]) { const got = convert(cat, from, to, x); t.ok(Math.abs(got - want) <= 1e-12 * Math.max(1, Math.abs(want)), `${why}: ${x} ${from} = ${fmtUnit(got)} ${to}`); }
  // a unit into itself is the number itself; there and back comes home
  { let same = 0, back = 0, n = 0; for (const [cat, c] of Object.entries(UNITS)) for (const a of Object.keys(c.units)) { n++; if (convert(cat, a, a, 123.456) === 123.456) same++; let ok = true; for (const b of Object.keys(c.units)) { const r = convert(cat, b, a, convert(cat, a, b, 123.456)); if (Math.abs(r - 123.456) > 1e-10) ok = false; } if (ok) back++; }
    t.eq([same, back], [n, n], `${n} units: into itself unchanged, to every other unit and back the same`); }
  t.eq(convertAll('data', 'byte', 1024).map(([u]) => u), Object.keys(UNITS.data.units), 'the table lists every unit of the category, in order');
  t.eq([convert('fuel', 'km/l', 'l/100km', 0), convert('fuel', 'l/100km', 'km/l', 0), convert('fuel', 'km/l', 'mpg (US)', -5)].map((v) => Number.isNaN(v)), [true, true, true], 'a fuel economy of 0 or less has no counterpart');
  t.eq([belowAbsoluteZero('temperature', '°C', -300), belowAbsoluteZero('temperature', 'K', -1), belowAbsoluteZero('temperature', '°F', -500), belowAbsoluteZero('temperature', '°C', -273.15), belowAbsoluteZero('temperature', 'K', 0), belowAbsoluteZero('length', 'm', -5)], [true, true, true, false, false, false], 'below absolute zero is noticed; absolute zero itself is a temperature');

  // 3. the display: ten digits, never rounded to nothing
  t.eq([convert('length', 'km', 'mile', 1), convert('length', 'mm', 'mile', 1), convert('mass', 'mg', 'tonne', 1), convert('data', 'byte', 'TiB (1024⁴)', 1), convert('energy', 'eV', 'kWh (unit)', 1), convert('data', 'TiB (1024⁴)', 'bit', 1)].map(fmtUnit),
    ['0.6213711922', '6.213711922 × 10⁻⁷', '1 × 10⁻⁹', '9.094947018 × 10⁻¹³', '4.45049065 × 10⁻²⁶', '8,796,093,022,208'], 'small results keep their digits (1 mm in miles was "0.00000062", 1 byte in TiB was "0")');
  t.eq([2.5400000000000005, 36.99999999999999, 0.30000000000000004, 1609.344, 1e15, 123456789012345, 0.000001, 0.00000099, -0.5, 0, NaN, Infinity, 1234567890.5, 2147483648.0000005].map(fmtUnit), ['2.54', '37', '0.3', '1,609.344', '1 × 10¹⁵', '123,456,789,012,345', '0.000001', '9.9 × 10⁻⁷', '-0.5', '0', '—', '—', '1,234,567,890.5', '2,147,483,648'], 'binary noise is not shown; digits are grouped; large numbers keep the digits before the point; no value, no number');
  t.eq([1609.344, 0.6213711922373339, 9.094947017729282e-13, 8796093022208, 2.5400000000000005, 0, NaN].map(plainUnit), ['1609.344', '0.6213711922', '9.094947018e-13', '8796093022208', '2.54', '0', ''], 'what is copied: the number without separators, e-notation for the very small');
  { let ok = 0, n = 0; for (const [cat, from, to, x] of ref.cases.filter((_, i) => i % 7 === 0)) { const r = convert(cat, from, to, x), p = plainUnit(r); n++; if (Math.abs(Number(p) - r) <= 6e-10 * Math.abs(r)) ok++; } t.eq(ok, n, `${n} copied numbers read back as the result (10 digits)`); }
};
