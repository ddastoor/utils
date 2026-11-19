// Unit Converter (#/units). Every factor is held to GNU Units in tests/unit/units.test.mjs (3,222 conversions); here:
// the page — definitions that are exact numbers (knot, inch, gallon, acre …) come out as those numbers, small and
// large results keep their digits, the table of every unit, first units per quantity, Swap, what is copied, the
// notes (below absolute zero, a fuel economy of 0), an empty value, the Indian and metric kitchen units, phone.
import { calc } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';
const n = (s) => +s.replace(/,/g, '').replace('−', '-').split(' ')[0];
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/units`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const res = async () => (await page.locator('.big-value').first().textContent()).trim();
  const conv = async (cat, v, from, to) => { await c.pick('Quantity', cat); await c.pick('From', from); await c.pick('To', to); await c.set('Value', v); return res(); };
  ok(await res() === '0.6213711922 mile' && (await page.locator('.big-label').first().textContent()).trim() === '1 km =', `at first: 1 km = 0.6213711922 mile (${await res()})`);
  // exact by definition: the result is that number, digit for digit
  for (const [cat, v, f, t, want, why] of [
    ['length', 1, 'inch', 'cm', '2.54 cm', 'the inch'], ['length', 1, 'mile', 'foot', '5,280 foot', 'a mile in feet'], ['length', 1, 'nautical mile', 'm', '1,852 m', 'the nautical mile'],
    ['speed', 1, 'knot', 'km/h', '1.852 km/h', 'a knot is exactly 1.852 km/h (it was 1.8519984)'], ['speed', 60, 'mph', 'ft/s', '88 ft/s', '60 mph'],
    ['mass', 1, 'pound', 'g', '453.59237 g', 'the pound'], ['mass', 1, 'stone', 'pound', '14 pound', 'a stone'], ['mass', 1, 'tola', 'g', '11.6638038 g', 'a tola (180 grains)'], ['mass', 5, 'quintal (100 kg)', 'tonne', '0.5 tonne', 'quintals'],
    ['temperature', 100, '°C', '°F', '212 °F', 'boiling point'], ['temperature', -40, '°C', '°F', '-40 °F', '−40 is the same'], ['temperature', 0, 'K', '°F', '-459.67 °F', 'absolute zero'], ['temperature', 98.6, '°F', '°C', '37 °C', 'body temperature'],
    ['area', 1, 'acre', 'ft²', '43,560 ft²', 'an acre'], ['area', 1, 'acre', 'cent (435.6 ft²)', '100 cent (435.6 ft²)', 'an acre is 100 cents'], ['area', 1, 'acre', 'guntha (1,089 ft²)', '40 guntha (1,089 ft²)', 'and 40 guntha'], ['area', 1, 'hectare', 'acre', '2.471053815 acre', 'a hectare'],
    ['volume', 1, 'gallon (US)', 'litre', '3.785411784 litre', 'the US gallon (it was 3.78541)'], ['volume', 1, 'gallon (US)', 'in³', '231 in³', '231 cubic inches'], ['volume', 1, 'gallon (UK)', 'litre', '4.54609 litre', 'the imperial gallon'], ['volume', 1, 'ft³', 'litre', '28.31684659 litre', 'a cubic foot (it was 28.3168)'],
    ['volume', 2, 'tbsp (15 ml)', 'ml', '30 ml', 'the kitchen tablespoon is 15 ml'], ['volume', 1, 'cup (250 ml)', 'tsp (5 ml)', '50 tsp (5 ml)', 'a 250 ml cup'], ['volume', 1, 'tbsp (US)', 'ml', '14.78676478 ml', 'the US tablespoon'],
    ['data', 1, 'GiB (1024³)', 'MB (1000²)', '1,073.741824 MB (1000²)', 'GiB in MB'], ['data', 1, 'TiB (1024⁴)', 'bit', '8,796,093,022,208 bit', 'a tebibyte in bits, every digit'],
    ['time', 1, 'day', 'minute', '1,440 minute', 'a day'], ['pressure', 1, 'atm', 'kPa', '101.325 kPa', 'an atmosphere'], ['pressure', 1, 'atm', 'torr', '760 torr', '760 torr'], ['pressure', 2, 'kgf/cm²', 'psi', '28.44668661 psi', 'tyre pressure in kgf/cm²'],
    ['energy', 1, 'kWh (unit)', 'kJ', '3,600 kJ', 'a unit of electricity'], ['energy', 1, 'BTU', 'J', '1,055.055853 J', 'a BTU (it was 1055.06)'], ['power', 1, 'hp (metric)', 'W', '735.49875 W', 'metric horsepower'],
    ['angle', 180, 'degree', 'radian', '3.141592654 radian', 'π'], ['angle', 1, 'turn', 'degree', '360 degree', 'a turn'],
    ['fuel', 20, 'km/l', 'l/100km', '5 l/100km', 'km/l and l/100 km'], ['fuel', 5, 'l/100km', 'mpg (UK)', '56.49618727 mpg (UK)', '5 l/100 km in UK mpg'], ['fuel', 30, 'mpg (US)', 'km/l', '12.75431122 km/l', '30 mpg (US)'],
  ]) { const r = await conv(cat, v, f, t); ok(r === want, `${why}: ${v} ${f} = ${want} (${r})`); }
  // small and large results keep their digits
  ok(await conv('length', 1, 'mm', 'mile') === '6.213711922 × 10⁻⁷ mile', `1 mm in miles (it was 0.00000062): ${await res()}`);
  ok(await conv('data', 1, 'byte', 'TiB (1024⁴)') === '9.094947018 × 10⁻¹³ TiB (1024⁴)', `1 byte in TiB (it was 0): ${await res()}`);
  ok(await conv('energy', 1, 'kWh (unit)', 'eV') === '2.246943267 × 10²⁵ eV', `1 kWh in eV: ${await res()}`);
  let rows = await c.rows();
  ok(Object.values(rows).every((v) => v !== '0' && v !== '—') && rows['J'] === '3,600,000', `no row of the table is rounded to 0 (${Object.values(rows).slice(0, 4).join(' | ')})`);
  // the table, first units, swap
  await c.pick('Quantity', 'data'); rows = await c.rows();
  ok(Object.keys(rows).length === 10 && rows['KiB (1024)'] && rows['TiB (1024⁴)'], `table lists every unit of the category (${Object.keys(rows).length})`);
  const firsts = {}; for (const cat of ['length', 'mass', 'temperature', 'area', 'volume', 'speed', 'data', 'time', 'pressure', 'energy', 'power', 'angle', 'fuel']) { await c.pick('Quantity', cat); firsts[cat] = `${await page.locator('.field', { hasText: 'From' }).locator('select').inputValue()}→${await page.locator('.field', { hasText: /^To/ }).locator('select').inputValue()}`; }
  ok(firsts.length === 'km→mile' && firsts.temperature === '°C→°F' && firsts.mass === 'kg→pound' && firsts.volume === 'litre→gallon (US)' && firsts.fuel === 'km/l→l/100km' && firsts.angle === 'degree→radian' && Object.values(firsts).every((v) => { const [a, b] = v.split('→'); return a && b && a !== b; }), `every quantity starts with two different, likely units (${JSON.stringify(firsts)})`);
  await conv('temperature', 25, '°C', 'K'); ok(await res() === '298.15 K', '25 °C = 298.15 K');
  await page.getByRole('button', { name: 'Swap' }).click(); ok(await res() === '-248.15 °C', `Swap: 25 K in °C (${await res()})`);
  // notes
  ok(/25 K/.test(await page.locator('.big-label').first().textContent()) && !(await page.locator('.note-warn').count()), 'no note for a possible temperature');
  await c.set('Value', -300); await c.pick('From', '°C'); await c.pick('To', 'K');
  ok(/-300 °C is below absolute zero \(−273\.15 °C, 0 K\)/.test(await page.locator('.note-warn').first().textContent()) && await res() === '-26.85 K', `below absolute zero: said so (${await page.locator('.note-warn').first().textContent()})`);
  await conv('fuel', 0, 'km/l', 'l/100km'); ok(/fuel economy is a number above 0/.test(await page.locator('.note-warn').first().textContent()) && await res() === '— l/100km', `a fuel economy of 0 has no l/100 km (${await res()})`);
  await c.set('Value', 18); ok(!(await page.locator('.note-warn').count()) && await res() === '5.555555556 l/100km', '18 km/l = 5.555555556 l/100 km');
  // what a click copies
  await hookClipboard(page);
  await conv('length', 1, 'mile', 'm'); await page.locator('.big-result').first().click(); await page.waitForTimeout(80);
  await conv('data', 1, 'byte', 'TiB (1024⁴)'); await page.locator('.big-result').first().click(); await page.waitForTimeout(80);
  ok(JSON.stringify(await copied(page)) === '["1609.344","9.094947018e-13"]', `a click on the result copies the plain number — no thousands separators (${JSON.stringify(await copied(page))})`);
  // values: a fraction, an exponent, nothing
  ok(await conv('length', 0.5, 'km', 'm') === '500 m' && await conv('length', '1e3', 'm', 'km') === '1 km' && await conv('mass', -2.5, 'kg', 'g') === '-2,500 g', 'fractions, 1e3 and negative values');
  await c.set('Value', '');
  ok(!(await page.locator('.big-value').count()) && !(await page.locator('.kv > span').count()), 'empty value: no result');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/units`); await ph.locator('.big-value').first().waitFor();
  await calc(ph).pick('Quantity', 'area');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && await ph.locator('.kv > span').count() === 28, 'phone: no horizontal scroll, also with the long unit names of Area (14 rows)');
};
