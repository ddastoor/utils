// Coordinates (#/coords): the shortest path on the WGS-84 ellipsoid (geo.wasm: Karney's geodesic.c) against Karney's
// Python implementation, cross-checked with Vincenty's formula in mpmath (tests/fixtures/geo/reference.json); the
// sphere's figure beside it; coordinates read in every usual writing and written back; a pair in one box; what is
// refused and why; phone layout.
import { readFileSync } from 'node:fs';
import { calc, num } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/geo/reference.json', import.meta.url), 'utf8'));
const metres = (s) => (/ km$/.test(s) ? num(s) * 1000 : / m$/.test(s) ? num(s) : NaN), apart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const WINDS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/coords`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const box = page.locator('.tool-body input.input');
  const set = async (...v) => { for (let i = 0; i < 4; i++) if (v[i] !== undefined) { await box.nth(i).fill(String(v[i])); } };
  const note = async () => (await page.locator('.calc-note').allInnerTexts()).map((x) => x.trim()).join(' | ');

  // ---- the first view: Delhi → Mumbai
  { const r = await c.rows();
    ok(await c.big('Distance') === '1,144.53 km' && await c.big('Initial bearing') === '203.6° (SSW)' && r.Miles === '711.18' && r['Nautical miles'] === '617.99' && r['Bearing on arrival'] === '201.8° (SSW)' && r['On a sphere (haversine)'] === '1,148.1 km',
      `Delhi → Mumbai: 1,144.53 km on the ellipsoid (the sphere's 1,148.1 km — what the tab used to show — is 3.6 km more), heading 203.6° (${await c.big('Distance')}, ${JSON.stringify(r)})`);
    ok(r['A (decimal)'] === '28.613900, 77.209000' && r['A (DMS)'] === '28° 36′ 50.04″ N, 77° 12′ 32.40″ E' && r['A (degrees, minutes)'] === '28° 36.8340′ N, 77° 12.5400′ E' && r['B (DMS)'] === '19° 4′ 33.60″ N, 72° 52′ 39.72″ E' && r['Half-way point'] === '23.861628, 74.963899', 'both points in three writings; the half-way point'); }
  await hookClipboard(page); await page.locator('.big-result').first().click();
  ok((await copied(page))[0] === '1,144.53 km', 'a click copies the distance');

  // ---- pairs of the reference: the named ones and a sample
  let bad = [], count = 0;
  for (const [name, lat1, lon1, lat2, lon2, m, azi1, azi2, midLat, midLon, sphere] of ref.geodesics.filter((_, i) => i < 17 || i % 12 === 0)) {
    await set(lat1, lon1, lat2, lon2); count++;
    const r = await c.rows(), d = metres(await c.big('Distance')), b = await c.big('Initial bearing'), at = `${name} (${lat1}, ${lon1} → ${lat2}, ${lon2})`, tol = m < 1000 ? 0.051 : 5.1;
    if (!(Math.abs(d - m) <= tol) || Math.abs(num(r.Miles) - m / 1609.344) > (m / 1609.344 < 10 ? 0.00051 : 0.0051) || Math.abs(num(r['Nautical miles']) - m / 1852) > (m / 1852 < 10 ? 0.00051 : 0.0051) || !(Math.abs(metres(r['On a sphere (haversine)']) - sphere) <= (sphere < 1000 ? 0.051 : 5.1))) bad.push(`${at}: ${await c.big('Distance')} / ${r.Miles} / ${r['Nautical miles']} / ${r['On a sphere (haversine)']}, not ${m} m (sphere ${sphere})`);
    if (m === 0) { if (b !== '—' || r['Bearing on arrival'] !== '—' || r['Half-way point'] !== '—') bad.push(`${at}: the same place has no bearing (${b})`); continue; }
    if (m > 19.9e6) continue; // nearly opposite points: the direction is checked in the unit suite against the engine, the notes below
    const wind = (text) => text.replace(/.*\(|\)/g, ''), deg = (text) => parseFloat(text);
    if (apart(deg(b), azi1) > 0.051 || apart(deg(r['Bearing on arrival']), azi2) > 0.051 || wind(b) !== WINDS[Math.round(deg(b) / 22.5) % 16] || !/^\d{1,3}\.\d° \([NSEW]{1,3}\)$/.test(b)) bad.push(`${at}: bearings ${b} / ${r['Bearing on arrival']}, not ${azi1} / ${azi2}`);
    const [la, lo] = r['Half-way point'].split(', ').map(Number);
    if (Math.abs(la - midLat) > 6e-7 || apart(lo, midLon) > 6e-7 / Math.max(0.01, Math.cos(midLat * Math.PI / 180))) bad.push(`${at}: half-way ${r['Half-way point']}, not ${midLat}, ${midLon}`);
  }
  ok(count >= 50 && !bad.length, `${count} pairs of the reference (cities, the poles, the date line, a hundred metres, random points): distance to 10 m (to 0.1 m under a kilometre), miles, nautical miles, both bearings with their compass points, the half-way point, the sphere's figure ${bad.slice(0, 2).join(' | ')}`);

  // ---- special pairs
  await set('28.6139', '77.2090', '28.6139', '77.2090');
  ok(await c.big('Distance') === '0 m' && await c.big('Initial bearing') === '—' && await note() === 'The two points are the same place.', `the same place: 0 m, no bearing (it said "0°"), and a note (${await note()})`);
  await set('0', '0', '0', '180');
  ok(await c.big('Distance') === '20,003.93 km' && await c.row('On a sphere (haversine)') === '20,015.11 km' && /^The two points are exactly opposite each other on the globe/.test(await note()), `opposite points on the equator: 20,003.93 km over a pole — the tab said 20,015.11 km, 11 km too many (${await c.big('Distance')}; ${await note()})`);
  await set('90', '0', '-90', '77');
  ok(await c.big('Distance') === '20,003.93 km' && /exactly opposite/.test(await note()), 'pole to pole: half a meridian, whatever the longitudes');
  await set('0', '0', '0.5', '179.5');
  ok(await c.big('Distance') === '19,936.29 km' && /^The points are almost opposite each other/.test(await note()), `almost opposite points — where Vincenty's formula gives up — have an answer, and a note (${await c.big('Distance')})`);
  await set('28.6139', '77.2090', '28.6148', '77.2090');
  ok(await c.big('Distance') === '99.7 m' && await c.row('Miles') === '0.062' && await c.big('Initial bearing') === '0.0° (N)' && !(await note()), `a hundred metres up the road: 99.7 m, 0.062 miles, due north (${await c.big('Distance')}, ${await c.row('Miles')})`);

  // ---- one point only; half a second point
  await set('28° 36′ 50″ N', '77° 12′ 32″ E', '', '');
  ok(await c.row('A (decimal)') === '28.613889, 77.208889' && !(await page.locator('.big-result').count()) && !(await c.warn()) && !('B (decimal)' in await c.rows()), `one point: its three writings, no distance (${await c.row('A (decimal)')})`);
  await set(undefined, undefined, '19.0760', '');
  ok(await c.warn() === 'Point B: the longitude is missing — fill in both boxes, or empty both for one point.', `half a second point is said, not passed over in silence (${await c.warn()})`);
  await set(undefined, undefined, '', '72.8777');
  ok(await c.warn() === 'Point B: the latitude is missing — fill in both boxes, or empty both for one point.', 'the other half');

  // ---- reading: what people type
  const reads = [['-33.8688', '151.2093', '-33.868800, 151.209300', '33° 52′ 7.68″ S, 151° 12′ 33.48″ E'], ['33 52 7.68 S', '70 40 9 W', '-33.868800, -70.669167', '33° 52′ 7.68″ S, 70° 40′ 9.00″ W'],
    ['−12.5', '−77.25', '-12.500000, -77.250000', '12° 30′ 0.00″ S, 77° 15′ 0.00″ W'], ['28.6 degrees', '77.2 deg E', '28.600000, 77.200000', '28° 36′ 0.00″ N, 77° 12′ 0.00″ E'],
    ['28,6139', '77,2090', '28.613900, 77.209000', '28° 36′ 50.04″ N, 77° 12′ 32.40″ E'], ['.5', '000.500', '0.500000, 0.500000', '0° 30′ 0.00″ N, 0° 30′ 0.00″ E'],
    ['28.9999999', '77.99999999', '29.000000, 78.000000', '29° 0′ 0.00″ N, 78° 0′ 0.00″ E'], ['N 28° 36.834′', 'e 77° 12.54′', '28.613900, 77.209000', '28° 36′ 50.04″ N, 77° 12′ 32.40″ E'],
    ['28d36m50s N', '77:12:32', '28.613889, 77.208889', '28° 36′ 50.00″ N, 77° 12′ 32.00″ E'], ['28º36´50 south', 'West 77.2', '-28.613889, -77.200000', '28° 36′ 50.00″ S, 77° 12′ 0.00″ W'],
    ['-0.0000001', '-180', '0.000000, -180.000000', '0° 0′ 0.00″ N, 180° 0′ 0.00″ W'], ['90', '180', '90.000000, 180.000000', '90° 0′ 0.00″ N, 180° 0′ 0.00″ E']];
  bad = [];
  for (const [lat, lon, dec, dms] of reads) { await set(lat, lon, '', ''); const r = await c.rows(); if (r['A (decimal)'] !== dec || r['A (DMS)'] !== dms) bad.push(`${lat} | ${lon} → ${r['A (decimal)']} | ${r['A (DMS)']} (${await c.warn()}), not ${dec} | ${dms}`); }
  ok(!bad.length, `${reads.length} ways of typing a point: a real minus sign (−12.5 came out as 12.5 N), the word "degrees" (its S made the latitude southern), a decimal comma, .5 (it was read as 5), seconds that round up (no "59′ 60.00″"), marks of every keyboard ${bad.join(' | ')}`);
  // typed forms of the reference
  bad = [];
  for (const [text, axis, , six] of ref.typed.filter((_, i) => i % 10 === 0)) {
    await set(axis === 'lat' ? text : '0', axis === 'lon' ? text : '0', '', '');
    const got = (await c.row('A (decimal)') || await c.warn()).split(', ')[axis === 'lat' ? 0 : 1];
    if (got !== six) bad.push(`${text} (${axis}) → ${got}, not ${six}`);
  }
  ok(!bad.length, `40 typed degrees-minutes-seconds forms of the reference give the decimal of the exact fraction ${bad.slice(0, 3).join(' | ')}`);

  // ---- a pair in one box
  await set('', '', '', ''); await box.nth(0).fill('12.9716, 77.5946');
  ok(await box.nth(0).inputValue() === '12.9716' && await box.nth(1).inputValue() === '77.5946' && await c.row('A (decimal)') === '12.971600, 77.594600', `"12.9716, 77.5946" — as a map app copies it — in the latitude box fills both boxes (it was read as 12° 58.3′ + 77.59/60: 14.264877) — ${await box.nth(0).inputValue()} | ${await box.nth(1).inputValue()}`);
  await box.nth(2).fill('13°04′57″N 80°16′15″E');
  ok(await c.row('B (decimal)') === '13.082500, 80.270833' && await c.big('Distance') === '290.56 km' && await c.big('Initial bearing') === '87.3° (E)', `a pair with letters into point B: Bengaluru → Chennai, 290.56 km (${await c.big('Distance')})`);
  await box.nth(3).fill('13.0825, 80.2708');
  ok(await c.warn() === 'Point B: This box takes the longitude alone, and it holds two numbers — put the first (13.0825) into the latitude box.', `a pair in a longitude box is not guessed at (${await c.warn()})`);

  // ---- refused, with the reason
  const refused = async (v, label, want) => { await set(...v); const w = await c.warn(); ok(w === want && !(await page.locator('.big-result').count()), `${label} → "${want}" (${w})`); };
  await refused(['95', '10', '', ''], 'a latitude of 95', 'Point A: Latitude: 95° is outside the range — a latitude goes from 90° S (−90) to 90° N.');
  await refused(['10', '181', '', ''], 'a longitude of 181', 'Point A: Longitude: 181° is outside the range — a longitude goes from 180° W (−180) to 180° E.');
  await refused(['28.6 E', '77.2', '', ''], 'E on a latitude (it was accepted)', 'Point A: The latitude takes N or S, not E — E and W belong to the longitude.');
  await refused(['-28.6 S', '77.2', '', ''], 'a minus sign and S together', 'Point A: Latitude: a minus sign and the letter S together — use one of them.');
  await refused(['28° 75′ 80″ N', '77.2', '', ''], '75 minutes (it was read as 29.27°)', 'Point A: Latitude: the minutes must be below 60 (75 was given).');
  await refused(['28 59 60', '77.2', '', ''], '60 seconds', 'Point A: Latitude: the seconds must be below 60 (60 was given).');
  await refused(['28.5 30', '77.2', '', ''], 'decimal degrees with minutes', 'Point A: Latitude: degrees with a decimal part cannot be followed by minutes.');
  await refused(['1e1', '77.2', '', ''], '1e1 (it was read as 1° 1′)', 'Point A: Cannot read "1e1" as a latitude — write it like 28.6139 or 28° 36′ 50″ N.');
  await refused(['north', '77.2', '', ''], 'a word', 'Point A: Cannot read "north" as a latitude — write it like 28.6139 or 28° 36′ 50″ N.');
  await refused(['', '77.2', '', ''], 'no latitude', 'Point A: Enter the latitude — 28.6139 or 28° 36′ 50″ N.');
  await refused(['28.6', '', '', ''], 'no longitude', 'Point A: Enter the longitude — 77.2090 or 77° 12′ 32″ E.');
  await refused(['28.6139', '77.2090', '19.0760', '72.8777 N'], 'N on the second longitude', 'Point B: The longitude takes E or W, not N — N and S belong to the latitude.');
  await set('28.6139', '77.2090', '19.0760', '72.8777');
  ok(await c.big('Distance') === '1,144.53 km' && /WGS-84 ellipsoid/.test(await page.locator('.tool-body').innerText()), 'after the refusals the answer is back; the note says how the distance is worked out');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/coords`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll (also with the long rows of both points)');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.tool-body input')].every((e) => e.getBoundingClientRect().height >= 44)), 'phone: boxes are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
