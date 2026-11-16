// Calories (#/calories): Mifflin–St Jeor BMR for men and women, activity multipliers, loss / gain targets.
import { calc, num } from '../lib/calc.mjs';
const bmr = (male, w, h, a) => 10 * w + 6.25 * h - 5 * a + (male ? 5 : -161);
const f0 = (x) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(x);
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/calories`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('BMR') === '1,618 kcal/day' && await c.big('Maintenance (TDEE)') === '2,224 kcal/day', 'default man 30 y, 170 cm, 70 kg: BMR 1,618, light activity 2,224');
  for (const [act, mult] of [['1.2', 1.2], ['1.55', 1.55], ['1.725', 1.725]]) {
    await c.pick('Activity', act);
    ok(await c.big('Maintenance (TDEE)') === `${f0(1617.5 * mult)} kcal/day`, `activity × ${mult} → ${f0(1617.5 * mult)}`);
  }
  await c.seg('Sex', 'Female'); await c.set('Age', 45); await c.set('Height', 158); await c.set('Weight', 62); await c.pick('Activity', '1.375');
  const b = bmr(false, 62, 158, 45);
  ok(await c.big('BMR') === `${f0(b)} kcal/day` && await c.big('Maintenance (TDEE)') === `${f0(b * 1.375)} kcal/day`, `woman 45 y, 158 cm, 62 kg: BMR ${f0(b)}`);
  const rows = await c.rows(), tdee = b * 1.375;
  ok(num(rows['Weight loss (−0.5 kg/wk)']) === Math.round(tdee - 550) || Math.abs(num(rows['Weight loss (−0.5 kg/wk)']) - (tdee - 550)) <= 1, 'loss target = TDEE − 550');
  await c.set('Age', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'missing age → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/calories`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
