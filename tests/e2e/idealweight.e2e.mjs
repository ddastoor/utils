// Ideal Weight (#/idealweight): Devine, Robinson, Miller, Hamwi (per inch over 5 ft) and the Asian BMI range.
import { calc } from '../lib/calc.mjs';
const f1 = (x) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(x);
const ideal = (male, cm) => { const i = Math.max(0, cm / 2.54 - 60); return male ? [50 + 2.3 * i, 52 + 1.9 * i, 56.2 + 1.41 * i, 48 + 2.7 * i] : [45.5 + 2.3 * i, 49 + 1.7 * i, 53.1 + 1.36 * i, 45.5 + 2.2 * i]; };
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/idealweight`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const names = ['Devine (1974)', 'Robinson (1983)', 'Miller (1983)', 'Hamwi (1964)'];
  for (const [sex, cm] of [['Male', 170], ['Male', 185], ['Female', 158], ['Female', 172]]) {
    await c.seg('Sex', sex); await c.set('Height', cm);
    const w = ideal(sex === 'Male', cm), rows = await c.rows();
    ok(names.every((n, k) => rows[n] === `${f1(w[k])} kg`), `${sex} ${cm} cm: ${names.map((n) => rows[n]).join(', ')}`);
    const hm = cm / 100;
    ok(await c.big('Healthy BMI range (Asian 18.5–23)') === `${f1(18.5 * hm * hm)} – ${f1(23 * hm * hm)} kg`, `${cm} cm healthy range`);
  }
  await c.set('Height', 140);
  const rows = await c.rows();
  ok(rows['Devine (1974)'] === '45.5 kg', 'below 5 ft the formulas use their base value');
  await c.set('Height', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'missing height → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/idealweight`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
