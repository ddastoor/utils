// BMI (#/bmi): metric and imperial, Asian/Indian vs WHO cut-offs at their boundaries, healthy range.
import { calc } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/bmi`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('BMI') === '23.5' && await c.big('Category') === 'Overweight', 'default 170 cm / 68 kg → 23.5, Overweight by Indian cut-offs');
  ok(await c.row('Healthy weight range') === '53.5 – 66.5 kg', 'healthy range 18.5–23 at 1.70 m');
  await c.seg('Cut-offs', 'WHO international');
  ok(await c.big('Category') === 'Normal' && await c.row('Healthy weight range') === '53.5 – 72.3 kg', 'WHO: Normal, range up to 25');
  const cat = async (kg) => { await c.set('Weight (kg or lb)', kg); return [await c.big('BMI'), await c.big('Category')]; };
  await c.set('Height (cm or inches)', 160);
  ok((await cat(46))[1] === 'Underweight', '46 kg at 160 cm: underweight (18.0)');
  ok((await cat(76.8))[1] === 'Obese', '76.8 kg at 160 cm: BMI 30.0, obese (WHO)');
  await c.seg('Cut-offs', 'Asian / Indian');
  ok((await cat(64))[1] === 'Obese', '64 kg at 160 cm: BMI 25.0, obese by Indian cut-off');
  await c.seg('Units', 'Imperial'); await c.set('Height (cm or inches)', 67); await c.set('Weight (kg or lb)', 150);
  ok(await c.big('BMI') === '23.5', `imperial 5′7″ 150 lb → 23.5 (${await c.big('BMI')})`);
  await c.set('Weight (kg or lb)', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'missing weight → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/bmi`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
