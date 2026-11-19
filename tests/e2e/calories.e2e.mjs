// Calories (#/calories): Mifflin–St Jeor BMR for men and women, activity factors, loss and gain targets — against
// exact decimals (tests/fixtures/health/reference.json); targets that are too low are marked; what is refused; phone.
import { readFileSync } from 'node:fs';
import { calc } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/health/reference.json', import.meta.url), 'utf8'));
// whole kilocalories, half up on the decimal (the reference values are exact in binary to a thousandth at most)
const k = (x) => `${new Intl.NumberFormat('en-US').format(Math.floor(x + 0.5 + 1e-9))} kcal`;
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/calories`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const person = async (male, age, cm, kg, act) => { await c.seg('Sex', male ? 'Male' : 'Female'); await c.set('Age', age); await c.set('Height', cm); await c.set('Weight', kg); await c.pick('Activity', String(act)); };

  // ---- the first view
  ok(await c.big('BMR') === '1,618 kcal/day' && await c.big('Maintenance (TDEE)') === '2,224 kcal/day', `a man of 30, 170 cm, 70 kg, lightly active: 1,618 kcal at rest, 2,224 a day (${await c.big('BMR')}, ${await c.big('Maintenance (TDEE)')})`);
  { const r = await c.rows(); ok(r['Mild weight loss (−0.25 kg/wk)'] === '1,949 kcal' && r['Weight loss (−0.5 kg/wk)'] === '1,674 kcal' && r['Weight gain (+0.25 kg/wk)'] === '2,499 kcal' && r['Weight gain (+0.5 kg/wk)'] === '2,774 kcal' && r.Formula === 'Mifflin–St Jeor' && !(await page.locator('.calc-note').count()), `targets 275 and 550 kcal either side of maintenance, the formula named (${JSON.stringify(r)})`); }

  // ---- people of the reference
  const pick = ref.calories.filter(([, , cm, kg]) => cm >= 150 && kg >= 45 && kg <= 120).filter((_, i) => i % 6 === 0);
  let bad = [];
  for (const [male, age, cm, kg, act, bmr, tdee] of pick) {
    await person(male, age, cm, kg, act);
    const got = [await c.big('BMR'), await c.big('Maintenance (TDEE)'), await c.row('Weight loss (−0.5 kg/wk)')], low = tdee - 550 < (male ? 1500 : 1200);
    if (got[0] !== `${k(bmr)}/day` || got[1] !== `${k(tdee)}/day` || got[2] !== `${k(tdee - 550)}${low ? ' — too low' : ''}`) bad.push(`${male ? 'man' : 'woman'} ${age} y ${cm} cm ${kg} kg × ${act}: ${got}, not ${k(bmr)} / ${k(tdee)} / ${k(tdee - 550)}${low ? ' too low' : ''}`);
  }
  ok(pick.length >= 40 && !bad.length, `${pick.length} people of the reference: BMR, daily need and the loss target, to the kilocalorie ${bad.slice(0, 3).join(' | ')}`);
  await person(1, 30, 180, 80, 1.2);
  ok(await c.big('BMR') === '1,780 kcal/day' && await c.big('Maintenance (TDEE)') === '2,136 kcal/day', 'a man of 30, 180 cm, 80 kg: 800 + 1,125 − 150 + 5 = 1,780');
  await c.seg('Sex', 'Female');
  ok(await c.big('BMR') === '1,614 kcal/day', 'a woman of the same size: 166 kcal less');
  for (const [act, name] of [['1.2', 'sedentary'], ['1.375', 'light'], ['1.55', 'moderate'], ['1.725', 'active'], ['1.9', 'very active']]) { await c.pick('Activity', act); ok(await c.big('Maintenance (TDEE)') === `${k(1614 * +act)}/day`, `${name}: × ${act} → ${await c.big('Maintenance (TDEE)')}`); }

  // ---- a target under what is safe is marked, and said
  await person(0, 60, 150, 45, 1.2);
  { const r = await c.rows(), note = (await page.locator('.calc-note').allInnerTexts()).join(' ').trim();
    ok(/ — too low$/.test(r['Mild weight loss (−0.25 kg/wk)']) && / — too low$/.test(r['Weight loss (−0.5 kg/wk)']) && !/too low/.test(r['Weight gain (+0.25 kg/wk)']) && note === 'Eating less than about 1,200 kcal a day is not advised for women without a doctor\'s supervision — aim for a slower loss.', `a small woman of 60 (maintenance ${await c.big('Maintenance (TDEE)')}): the loss targets are marked "too low" and the note says why (it offered ${r['Weight loss (−0.5 kg/wk)']} as a plan) — ${note}`); }
  await c.seg('Sex', 'Male'); await c.set('Height', 160); await c.set('Weight', 50); await c.set('Age', 70);
  ok(/1,500 kcal a day is not advised for men/.test((await page.locator('.calc-note').allInnerTexts()).join(' ')), 'for men the line is drawn at 1,500 kcal');

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await person(1, 0, 170, 70, 1.375); await refused('an age of 0', 'The age must be between 15 and 110 years (the formula is for adults).');
  await c.set('Age', 8); await refused('a child of 8', 'The age must be between 15 and 110 years (the formula is for adults).');
  await c.set('Age', -30); await refused('a negative age', 'The age must be between 15 and 110 years (the formula is for adults).');
  await c.set('Age', 30); await c.set('Height', 1.7); await refused('1.7 typed as centimetres', 'The height must be between 100 and 250 cm.');
  await c.set('Height', 170); await c.set('Weight', 0); await refused('a weight of 0 (it showed a daily need all the same)', 'The weight must be between 20 and 400 kg.');
  await c.set('Weight', -70); await refused('a negative weight', 'The weight must be between 20 and 400 kg.');
  await c.set('Weight', ''); await refused('an empty weight', 'Fill in all the numbers.');
  await c.set('Weight', 70);
  ok(await c.big('BMR') === '1,618 kcal/day' && !/NaN|undefined/.test(await page.locator('.calc-result').innerText()), 'after the refusals the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/calories`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .seg-btn, .tool-body input, .tool-body select')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: boxes, the list and the choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
