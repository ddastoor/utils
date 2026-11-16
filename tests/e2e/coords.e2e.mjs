// Coordinates (#/coords): haversine distance (mean Earth radius 6371.0088 km) and initial bearing against an
// independent JS implementation; DMS ↔ decimal; hemispheres; range checks; one point only.
import { calc, num } from '../lib/calc.mjs';
function hav(a1, o1, a2, o2) { const R = 6371.0088, d = Math.PI / 180, dA = (a2 - a1) * d, dO = (o2 - o1) * d; const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * d) * Math.cos(a2 * d) * Math.sin(dO / 2) ** 2; const y = Math.sin(dO) * Math.cos(a2 * d), x = Math.cos(a1 * d) * Math.sin(a2 * d) - Math.sin(a1 * d) * Math.cos(a2 * d) * Math.cos(dO); return { km: 2 * R * Math.asin(Math.sqrt(h)), brg: ((Math.atan2(y, x) / d) + 360) % 360 }; }
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/coords`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const set = async (a, b, x, y) => { await c.set('Point A latitude', a); await c.set('Point A longitude', b); await c.set('Point B latitude (optional)', x); await c.set('Point B longitude (optional)', y); };
  for (const [name, p] of [['Delhi → Mumbai', [28.6139, 77.209, 19.076, 72.8777]], ['London → New York', [51.5074, -0.1278, 40.7128, -74.006]], ['Sydney → Santiago', [-33.8688, 151.2093, -33.4489, -70.6693]], ['Pole to pole', [90, 0, -90, 0]]]) {
    await set(...p.map(String));
    const h = hav(...p), km = num(await c.big('Distance (great circle)')), brg = num(await c.big('Initial bearing'));
    ok(Math.abs(km - h.km) < 0.01 && (Math.abs(brg - h.brg) < 0.06 || name === 'Pole to pole'), `${name}: ${h.km.toFixed(2)} km, ${h.brg.toFixed(1)}° (${km} km, ${brg}°)`);
  }
  ok(Math.abs(num(await c.row('Miles')) - 20015.1 * 0.621371) < 1, 'miles conversion');
  await set('28° 36′ 50″ N', '77° 12′ 32″ E', '', '');
  ok(await c.row('A (decimal)') === '28.613889, 77.208889', `DMS → decimal (${await c.row('A (decimal)')})`);
  ok(!(await page.locator('.big-result').count()), 'one point only: no distance shown');
  await set('-33.8688', '151.2093', '', '');
  ok(await c.row('A (DMS)') === '33° 52′ 7.68″ S, 151° 12′ 33.48″ E', `decimal → DMS with hemispheres (${await c.row('A (DMS)')})`);
  await set('33 52 7.68 S', '70 40 9 W', '', '');
  ok(await c.row('A (decimal)') === '-33.868800, -70.669167', `S/W make negative (${await c.row('A (decimal)')})`);
  await set('95', '10', '', '');
  ok(/Latitude out of range/.test(await c.warn()), 'latitude > 90 refused');
  await set('10', '181', '', '');
  ok(/Longitude out of range/.test(await c.warn()), 'longitude > 180 refused');
  await set('north', '10', '', '');
  ok(/Can't read/.test(await c.warn()), 'text refused');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/coords`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
