// Unit Converter (#/units): exact definitions (inch, pound, acre, gallon, binary prefixes), temperature, fuel economy
// inverses, swap, the table of every unit, empty input.
import { calc } from '../lib/calc.mjs';
const n = (s) => +s.replace(/,/g, '').split(' ')[0];
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/units`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const res = async () => (await page.locator('.big-value').first().textContent()).trim();
  const conv = async (cat, v, from, to) => { await c.pick('Quantity', cat); await c.pick('From', from); await c.pick('To', to); await c.set('Value', v); return res(); };
  ok(await res() === '0.62137119 mile', `default 1 km → 0.62137119 mile (${await res()})`);
  for (const [cat, v, f, t, want, why] of [
    ['length', 1, 'inch', 'cm', 2.54, 'inch = 2.54 cm exactly'], ['length', 1, 'mile', 'foot', 5280, 'mile = 5280 ft'], ['length', 1, 'nautical mile', 'm', 1852, 'nautical mile = 1852 m'],
    ['mass', 1, 'pound', 'g', 453.59237, 'pound = 453.59237 g'], ['mass', 10, 'g', 'tola', 0.85735352, '10 g ≈ 0.857 tola (11.6638 g)'], ['mass', 1, 'stone', 'pound', 14, 'stone = 14 lb'],
    ['temperature', 100, '°C', '°F', 212, 'boiling point'], ['temperature', -40, '°C', '°F', -40, '−40 is the same'], ['temperature', 0, 'K', '°F', -459.67, 'absolute zero'], ['temperature', 98.6, '°F', '°C', 37, 'body temperature'],
    ['area', 1, 'acre', 'hectare', 0.40468564, 'acre in hectares'], ['area', 1, 'hectare', 'gaj (sq yd)', 11959.90046, 'hectare in gaj'],
    ['volume', 1, 'gallon (US)', 'litre', 3.78541, 'US gallon'], ['volume', 1, 'gallon (UK)', 'litre', 4.54609, 'imperial gallon'],
    ['speed', 100, 'km/h', 'm/s', 27.77777778, '100 km/h'], ['speed', 1, 'knot', 'km/h', 1.8519984, 'knot'],
    ['data', 1, 'GiB (1024³)', 'MB (1000²)', 1073.741824, 'GiB vs MB'], ['data', 1, 'byte', 'bit', 8, 'byte = 8 bits'],
    ['time', 1, 'day', 'minute', 1440, 'day in minutes'], ['pressure', 1, 'atm', 'kPa', 101.325, 'atmosphere'], ['energy', 1, 'kWh (unit)', 'kcal', 860.42065, 'kWh in kcal'],
    ['power', 1, 'hp (metric)', 'W', 735.49875, 'metric horsepower'],
    ['fuel', 15, 'km/l', 'l/100km', 6.66666667, 'km/l ↔ l/100 km is an inverse'], ['fuel', 30, 'mpg (US)', 'km/l', 12.75432, 'mpg (US) → km/l'], ['fuel', 5, 'l/100km', 'mpg (UK)', 56.4962, '5 l/100 km in UK mpg'],
  ]) { const r = n(await conv(cat, v, f, t)); ok(Math.abs(r - want) <= Math.abs(want) * 2e-6 + 1e-8, `${why}: ${v} ${f} = ${r} ${t}`); }
  await conv('temperature', 25, '°C', 'K');
  await page.getByRole('button', { name: 'Swap' }).click();
  ok(await res() === '-248.15 °C' || await res() === '−248.15 °C', `swap: 25 K → °C (${await res()})`);
  await c.pick('Quantity', 'data');
  const rows = await c.rows();
  ok(Object.keys(rows).length === 10 && rows['KiB (1024)'] && rows['TiB (1024⁴)'], `table lists every unit of the category (${Object.keys(rows).length})`);
  await c.set('Value', '');
  ok(!(await page.locator('.big-value').count()), 'empty value: no result');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/units`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
