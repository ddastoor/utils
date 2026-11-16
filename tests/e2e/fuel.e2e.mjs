// Fuel Cost (#/fuel): litres, cost, round trip, split, cost per km.
import { calc } from '../lib/calc.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/fuel`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  ok(await c.big('Fuel cost') === '₹2,450' && await c.big('Fuel needed') === '23.3 litres', 'default 350 km at 15 km/l, ₹105/l = ₹2,450, 23.3 l');
  ok(await c.row('Cost per km') === '₹7', 'cost per km ₹7');
  await c.seg('Trip', 'Round trip'); await c.set('Split between', 4);
  ok(await c.big('Fuel cost') === '₹4,900' && await c.row('Per person') === '₹1,225' && await c.row('Total distance') === '700 km', 'round trip ₹4,900, ₹1,225 each for 4');
  await c.seg('Trip', 'One way'); await c.set('Distance', 1234); await c.set('Mileage', 18.5); await c.set('Fuel price', 96.72); await c.set('Split between', 1);
  const l = 1234 / 18.5, cost = l * 96.72;
  ok(await c.big('Fuel needed') === `${l.toFixed(1)} litres` && await c.big('Fuel cost') === `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(cost)}`, `1,234 km at 18.5 km/l, ₹96.72/l → ${await c.big('Fuel cost')}`);
  await c.set('Mileage', '');
  ok(/Fill in all the numbers/.test(await c.warn()), 'missing mileage → asks for numbers');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/fuel`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
