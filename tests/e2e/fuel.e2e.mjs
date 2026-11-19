// Fuel Cost (#/fuel): litres, cost, round trip, split, cost per km — against exact fractions
// (tests/fixtures/smallcalc/reference.json); what is refused; phone layout.
import { readFileSync } from 'node:fs';
import { calc, num, inr } from '../lib/calc.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/smallcalc/reference.json', import.meta.url), 'utf8'));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/fuel`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const set = async (dist, eff, price, trips, people) => { await c.set('Distance', dist); await c.set('Mileage', eff); await c.set('Fuel price', price); if (trips) await c.seg('Trip', trips === 2 ? 'Round trip' : 'One way'); if (people !== undefined) await c.set('Split between', people); };
  const shown = async () => ({ cost: await c.big('Fuel cost'), fuel: await c.big('Fuel needed'), ...(await c.rows()) });

  // ---- the first view
  { const s = await shown(); ok(s.cost === '₹2,450' && s.fuel === '23.3 litres' && s['Cost per km'] === '₹7' && s['Per person'] === '₹2,450' && s['Total distance'] === '350 km', `350 km at 15 km/l and ₹105 a litre: ₹2,450, 23.3 litres, ₹7 a km (${JSON.stringify(s)})`); }
  await c.seg('Trip', 'Round trip'); await c.set('Split between', 4);
  { const s = await shown(); ok(s.cost === '₹4,900' && s['Per person'] === '₹1,225' && s['Total distance'] === '700 km' && s.fuel === '46.7 litres', 'there and back among four: ₹4,900, ₹1,225 each, 700 km'); }

  // ---- trips of the reference (amounts to the paisa; a last-digit difference of the doubles may move a half paisa)
  const pick = ref.fuel.filter(([dist, eff, price]) => +dist <= 2500 && +eff >= 4 && +eff <= 60 && +price < 1000).filter((_, i) => i % 2 === 0);
  let bad = [];
  for (const [dist, eff, price, trips, people, km, litres, cost, per, perKm] of pick) {
    await set(dist, eff, price, trips, people);
    const s = await shown(), near = (got, want) => Math.abs(num(got) - want) <= 0.0051;
    if (!near(s.cost, cost) || !near(s['Per person'], per) || !near(s['Cost per km'], perKm) || Math.abs(num(s['Total distance']) - km) > 0.051 || Math.abs(num(s.fuel) - litres) > (litres < 1 ? 0.00051 : 0.051)) bad.push(`${dist} km × ${trips} at ${eff} km/l, ₹${price}: ${JSON.stringify(s)} ≠ ${[cost, litres, per, perKm, km]}`);
  }
  ok(pick.length >= 20 && !bad.length, `${pick.length} trips of the reference: cost, litres, per person, per km, distance ${bad.slice(0, 3).join(' | ')}`);
  await set(1234, 18.5, 96.72, 1, 1);
  { const s = await shown(), cost = 1234 / 18.5 * 96.72; ok(s.cost === inr(Math.round(cost * 100) / 100) && s.fuel === '66.7 litres' && s['Cost per km'] === '₹5.23', `1,234 km at 18.5 km/l, ₹96.72 a litre → ${s.cost}, ${s.fuel}, ${s['Cost per km']}`); }

  // ---- words and small amounts
  await set(15, 15, 105, 1, 1);
  ok((await shown()).fuel === '1 litre', `one litre is "1 litre" (it was "1 litres") — ${(await shown()).fuel}`);
  await set(0.5, 60, 105, 1, 1);
  ok((await shown()).fuel === '0.008 litres' && (await shown()).cost === '₹0.88', `half a kilometre on a scooter: 0.008 litres, 88 paise (it showed "0 litres") — ${JSON.stringify(await shown())}`);
  await set(12.7, 15, 105, 1, 1);
  ok((await shown())['Total distance'] === '12.7 km', `a distance with a decimal keeps it (it showed 13 km) — ${(await shown())['Total distance']}`);
  await set(350, 15, 105, 1, '');
  ok((await shown())['Per person'] === '₹2,450' && !(await c.warn()), 'an empty "split between" box is one person');
  await set(350, 15, 0, 1, 1);
  ok((await shown()).cost === '₹0', 'a price of 0 costs nothing');

  // ---- refused, with the reason
  const refused = async (label, want) => { const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await set(350, 0, 105, 1, 1); await refused('a mileage of 0 (it showed "Fuel cost —" and "—  litres")', 'The mileage must be more than 0 km/l.');
  await c.set('Mileage', -15); await refused('a negative mileage (a negative cost)', 'The mileage must be more than 0 km/l.');
  await set(0, 15, 105); await refused('a distance of 0', 'The distance must be more than 0.');
  await c.set('Distance', -350); await refused('a negative distance', 'The distance must be more than 0.');
  await set(350, 15, -105); await refused('a negative price', 'The fuel price cannot be negative.');
  await set(350, 15, 105, 1, 0); await refused('nobody to split between (0 was quietly taken as 1)', 'The number of people must be a whole number, 1 or more.');
  await c.set('Split between', 2.5); await refused('two and a half people', 'The number of people must be a whole number, 1 or more.');
  await set(350, '', 105, 1, 1); await refused('an empty mileage', 'Fill in all the numbers.');
  await set(350, 15, 105, 1, 1);
  ok((await shown()).cost === '₹2,450' && !/NaN|undefined|—/.test(await page.locator('.calc-result').innerText()), 'after the refusals the answer is back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/fuel`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body .seg-btn, .tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: boxes and choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
