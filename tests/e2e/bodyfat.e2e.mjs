// Body Fat (#/bodyfat): US Navy circumference formulas (metric), ACE categories, fat / lean mass, impossible input.
import { calc } from '../lib/calc.mjs';
const navy = (male, h, neck, waist, hip) => (male ? 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450 : 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(h)) - 450);
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/bodyfat`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const m = navy(true, 175, 38, 85, 95);
  ok(await c.big('Body fat') === `${m.toFixed(1)}%`, `man 175/38/85 cm → ${m.toFixed(1)} % (${await c.big('Body fat')})`);
  ok(await c.big('Category (ACE)') === (m < 14 ? 'Athletic' : m < 18 ? 'Fit' : m < 25 ? 'Average' : 'Obese'), `ACE category ${await c.big('Category (ACE)')}`);
  ok(await c.row('Fat mass') === `${((75 * m) / 100).toFixed(1)} kg` && await c.row('Lean mass') === `${(75 * (1 - m / 100)).toFixed(1)} kg`, 'fat and lean mass from weight');
  await c.seg('Sex', 'Female'); await c.set('Height', 162); await c.set('Neck', 33); await c.set('Waist (at navel)', 76); await c.set('Hip (women)', 98);
  const f = navy(false, 162, 33, 76, 98);
  ok(await c.big('Body fat') === `${f.toFixed(1)}%`, `woman 162/33/76/98 cm → ${f.toFixed(1)} % (${await c.big('Body fat')})`);
  await c.seg('Sex', 'Male'); await c.set('Waist (at navel)', 30);
  ok(/waist must be larger than neck/.test(await c.warn()), 'waist smaller than neck refused');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/bodyfat`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
