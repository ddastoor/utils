// BMI (#/bmi): metric and imperial against exact fractions (tests/fixtures/health/reference.json), Asian-Indian and
// WHO cut-offs at their boundaries, a healthy range that agrees with the class shown, what is refused, phone layout.
import { readFileSync } from 'node:fs';
import { calc } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/health/reference.json', import.meta.url), 'utf8'));
const n1 = (x) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(x);
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/bmi`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const field = (label) => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) });
  const shown = async () => [await c.big('BMI'), await c.big('Category')];

  // ---- the first view
  ok((await shown()).join() === '23.5,Overweight' && await c.row('Healthy weight range') === '53.4 – 66.3 kg' && await c.row('Your weight is') === '1.7 kg above it', `170 cm, 68 kg: 23.5, overweight by the Indian cut-offs, 1.7 kg above 53.4 – 66.3 kg (${await shown()}; ${JSON.stringify(await c.rows())})`);
  ok(await c.row('Cut-offs used') === '<18.5 under · <23 normal · <25 over · ≥25 obese', 'the cut-offs are named');
  ok(await field('Height (cm)').isVisible() && await field('Weight (kg)').isVisible() && await field('Height (feet)').isHidden() && await field('and inches').isHidden() && await field('Weight (lb)').isHidden(), 'metric: centimetres and kilograms; the boxes for feet, inches and pounds are hidden');
  await c.seg('Cut-offs', 'WHO international');
  ok((await shown())[1] === 'Normal' && await c.row('Healthy weight range') === '53.4 – 72.1 kg' && await c.row('Your weight is') === 'within that range', `WHO: Normal, within 53.4 – 72.1 kg (${JSON.stringify(await c.rows())})`);

  // ---- the healthy range and the class agree: the ends are Normal, a tenth beyond is not
  await c.seg('Cut-offs', 'Asian / Indian');
  await c.set('Weight (kg)', 66.3); ok((await shown()).join() === '22.9,Normal' && await c.row('Your weight is') === 'within that range', `66.3 kg, the upper end: Normal (${await shown()})`);
  await c.set('Weight (kg)', 66.4); ok((await shown()).join() === '23.0,Overweight' && await c.row('Your weight is') === '0.1 kg above it', `66.4 kg: 23.0, overweight, 0.1 kg above (${await shown()})`);
  await c.set('Weight (kg)', 66.5); ok((await shown())[1] === 'Overweight', '66.5 kg — which the tab used to give as the top of the healthy range — is overweight');
  await c.set('Weight (kg)', 53.4); ok((await shown()).join() === '18.5,Normal' && await c.row('Your weight is') === 'within that range', `53.4 kg, the lower end: Normal (${await shown()})`);
  await c.set('Weight (kg)', 53.3); ok((await shown()).join() === '18.4,Underweight' && await c.row('Your weight is') === '0.1 kg below it', `53.3 kg: underweight, 0.1 kg below (${await shown()})`);

  // ---- people of the reference, in centimetres and kilograms
  let bad = [];
  const metric = ref.bmi.filter(([sys, h, w]) => sys === 'm' && +h >= 100 && +h <= 220 && +w >= 20 && +w <= 200).filter((_, i) => i % 9 === 0);
  for (const [, h, w, , s, asian, who] of metric) {
    await c.set('Height (cm)', h); await c.set('Weight (kg)', w);
    await c.seg('Cut-offs', 'Asian / Indian'); const a = await shown(); await c.seg('Cut-offs', 'WHO international'); const b = await shown();
    if (a[0] !== s.toFixed(1) || a[1] !== asian || b[1] !== who) bad.push(`${h} cm ${w} kg: ${a} / ${b[1]}, not ${s.toFixed(1)} ${asian} / ${who}`);
  }
  ok(metric.length >= 50 && !bad.length, `${metric.length} people in cm and kg: BMI with one decimal and the class by both sets of cut-offs ${bad.slice(0, 3).join(' | ')}`);
  bad = [];
  for (const [, h, loA, hiA, loW, hiW] of ref.ranges.filter(([sys, h]) => sys === 'm' && +h >= 140 && +h <= 200)) {
    await c.set('Height (cm)', h); await c.set('Weight (kg)', 60);
    await c.seg('Cut-offs', 'Asian / Indian'); const a = await c.row('Healthy weight range'); await c.seg('Cut-offs', 'WHO international'); const b = await c.row('Healthy weight range');
    if (a !== `${n1(loA)} – ${n1(hiA)} kg` || b !== `${n1(loW)} – ${n1(hiW)} kg`) bad.push(`${h} cm: ${a} / ${b}, not ${loA} – ${hiA} / ${loW} – ${hiW}`);
  }
  ok(!bad.length, `the healthy range of every height from 140 to 200 cm, as found by trying every tenth of a kilogram ${bad.slice(0, 3).join(' | ')}`);
  await c.set('Height (cm)', 160); await c.set('Weight (kg)', 76.8);
  ok((await shown()).join() === '30.0,Obese', `76.8 kg at 160 cm: 30.0 with its decimal, obese (${await shown()})`);
  await c.seg('Cut-offs', 'Asian / Indian'); await c.set('Weight (kg)', 64);
  ok((await shown()).join() === '25.0,Obese', '64 kg at 160 cm: 25.0, obese by the Indian cut-off');

  // ---- feet, inches and pounds
  await c.seg('Units', 'Imperial');
  ok(await field('Height (feet)').isVisible() && await field('and inches').isVisible() && await field('Weight (lb)').isVisible() && await field('Height (cm)').isHidden() && await field('Weight (kg)').isHidden(), 'imperial: feet, inches and pounds (it asked for the height in inches alone and kept 170 in the box)');
  ok((await shown()).join() === '23.5,Overweight' && /^\d+(\.\d)? – \d+(\.\d)? lb$/.test(await c.row('Healthy weight range')), `5 ft 7 in, 150 lb: 23.5; the healthy range in pounds (it was in kg) — ${await c.row('Healthy weight range')}`);
  bad = [];
  const imperial = ref.bmi.filter(([sys, h, w]) => sys === 'i' && h[0] >= 4 && h[0] <= 7 && +w >= 80 && +w <= 400).filter((_, i) => i % 5 === 0);
  for (const [, h, w, , s, asian, who] of imperial) {
    await c.set('Height (feet)', h[0]); await c.set('and inches', h[1]); await c.set('Weight (lb)', w);
    await c.seg('Cut-offs', 'Asian / Indian'); const a = await shown(); await c.seg('Cut-offs', 'WHO international'); const b = await shown();
    if (a[0] !== s.toFixed(1) || a[1] !== asian || b[1] !== who) bad.push(`${h[0]} ft ${h[1]} in ${w} lb: ${a} / ${b[1]}, not ${s.toFixed(1)} ${asian} / ${who}`);
  }
  ok(imperial.length >= 30 && !bad.length, `${imperial.length} people in feet, inches and pounds ${bad.slice(0, 3).join(' | ')}`);
  await c.set('Height (feet)', 5); await c.set('and inches', 9); await c.set('Weight (lb)', 160);
  ok((await shown()).join() === '23.6,Normal' && await c.row('Healthy weight range') === '125 – 168.9 lb', `5 ft 9 in, 160 lb: 23.6 (the CDC's table), healthy 125 – 168.9 lb (${await c.row('Healthy weight range')})`);
  await c.set('Height (feet)', 0); await c.set('and inches', 69);
  ok((await shown())[0] === '23.6', '69 inches without feet is the same height');
  await c.set('Height (feet)', 5); await c.set('and inches', '');
  ok((await shown())[0] === '31.2' && !(await c.warn()), `5 ft with the inches box empty is 5 ft 0 in (${await shown()})`);

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await c.set('Height (feet)', 170); await refused('170 feet', 'The height must be between 50 and 300 cm (1 ft 8 in to 9 ft 10 in).');
  await c.set('Height (feet)', 5); await c.set('Weight (lb)', 0); await refused('0 lb', 'The weight must be between 4 and 1,500 lb.');
  await c.set('Weight (lb)', ''); await refused('an empty weight', 'Fill in all the numbers.');
  await c.seg('Units', 'Metric');
  ok((await shown())[0] === '25.0' && !(await c.warn()), 'back to metric: the metric boxes kept their own numbers');
  await c.set('Height (cm)', 0); await refused('a height of 0 (it showed "BMI — · Obese")', 'The height must be between 50 and 300 cm.');
  await c.set('Height (cm)', 1.7); await refused('1.7 typed as centimetres', 'The height must be between 50 and 300 cm.');
  await c.set('Height (cm)', 170); await c.set('Weight (kg)', -68); await refused('a negative weight (it was "Underweight")', 'The weight must be between 2 and 700 kg.');
  await c.set('Weight (kg)', ''); await refused('an empty weight', 'Fill in all the numbers.');
  await c.set('Weight (kg)', 68); await c.seg('Cut-offs', 'Asian / Indian');
  ok((await shown()).join() === '23.5,Overweight' && !/NaN|undefined|—/.test(await page.locator('.calc-result').innerText()), 'after the refusals the answer is back');
  ok(/screening number for adults/.test(await page.locator('.tool-body').innerText()), 'the note says what BMI is and is not');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/bmi`); await ph.locator('.big-value').first().waitFor(); const pc = calc(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  await pc.seg('Units', 'Imperial');
  ok(await pc.big('BMI') === '23.5' && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.tool-body .seg-btn, .tool-body input')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().height >= 44)), 'phone: imperial works; boxes and choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
