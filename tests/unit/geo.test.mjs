// The Coordinates tab's engine and reader: geo.wasm (Karney's geodesic.c on WGS-84, wasm/geo) and src/lib/coords.ts
// against tests/fixtures/geo/reference.json — Karney's Python implementation, cross-checked there with Vincenty's
// formula in mpmath; the haversine formula in mpmath; coordinates written from exact fractions
// (scripts/make-geo-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindGeo } = await load('/src/wasm/geo.ts');
  const C = await load('/src/lib/coords.ts');
  const g = bindGeo(await wasm('geo'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/geo/reference.json'), 'utf8'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const apart = (a, b) => Math.abs(((a - b + 540) % 360) - 180); // degrees between two directions

  // ================================================================== geodesics
  t.eq(g.version(), 20200, 'geodesic.c 2.2.0');
  let bad = [], worst = { m: 0, az: 0, mid: 0, sphere: 0 }, checked = 0;
  for (const [name, lat1, lon1, lat2, lon2, metres, azi1, azi2, midLat, midLon, sphere, byVincenty] of ref.geodesics) {
    const x = g.inverse(lat1, lon1, lat2, lon2), at = `${name} (${lat1}, ${lon1} → ${lat2}, ${lon2})`, near = metres > 19.9e6;
    const dm = Math.abs(x.metres - metres); worst.m = Math.max(worst.m, dm); checked += byVincenty;
    if (dm > 2e-8) bad.push(`${at}: ${x.metres} m ≠ ${metres}`);
    if (metres > 0 && !near) { // a direction is compared as the distance it makes on the ground
      const off = Math.max(apart(x.bearing, azi1), apart(x.finalBearing, azi2)) * (Math.PI / 180) * Math.min(metres, 6.4e6); worst.az = Math.max(worst.az, off);
      if (off > 1e-7) bad.push(`${at}: bearings ${x.bearing} / ${x.finalBearing} ≠ ${azi1} / ${azi2}`);
      const dMid = Math.max(Math.abs(x.mid[0] - midLat), apart(x.mid[1], midLon) * Math.cos(midLat * Math.PI / 180)) * 111e3; worst.mid = Math.max(worst.mid, dMid);
      if (dMid > 1e-6) bad.push(`${at}: half-way ${x.mid} ≠ ${midLat}, ${midLon}`);
    }
    if (!(x.bearing >= 0 && x.bearing < 360 && x.finalBearing >= 0 && x.finalBearing < 360)) bad.push(`${at}: a bearing outside 0 … 360 (${x.bearing}, ${x.finalBearing})`);
    const ds = Math.abs(x.sphereMetres - sphere); worst.sphere = Math.max(worst.sphere, near ? 0 : ds);
    if (ds > (near ? 0.5 : 1e-6)) bad.push(`${at}: on the sphere ${x.sphereMetres} m ≠ ${sphere}`);
  }
  t.ok(ref.geodesics.length === 437 && checked >= 350 && !bad.length, `${ref.geodesics.length} pairs of points (${checked} of them confirmed by Vincenty's formula): the distance on WGS-84 within ${(worst.m * 1e9).toFixed(1)} nanometres of Karney's own program, both bearings (${(worst.az * 1e9).toFixed(1)} nm on the ground), the half-way point, the sphere's distance ${bad.slice(0, 3).join(' | ')}`);
  // ---- known lines
  const line = (a, b, c, d) => { const x = g.inverse(a, b, c, d); return `${(x.metres / 1000).toFixed(3)} km ${x.bearing.toFixed(2)}° ${x.finalBearing.toFixed(2)}° | ${(x.sphereMetres / 1000).toFixed(3)} km`; };
  t.eq(line(28.6139, 77.209, 19.076, 72.8777), '1153.241 km 203.59° 201.82° | 1148.096 km'.replace('1153.241 km 203.59° 201.82°', ref.geodesics[0].slice(5, 8).map((v, i) => (i ? `${v.toFixed(2)}°` : `${(v / 1000).toFixed(3)} km`)).join(' ')), 'Delhi → Mumbai: the ellipsoid and the sphere (5 km apart)');
  { const x = g.inverse(40.64, -73.78, 1.36, 103.99); t.ok(Math.abs(x.metres - 15347512.94) < 0.01, `JFK → Singapore Changi, the example in geodesic.h: 15,347,512.94 m (${x.metres.toFixed(3)})`); }
  { const x = g.inverse(0, 0, 0, 90); t.ok(Math.abs(x.metres - 2 * Math.PI * 6378137 / 4) < 1e-6 && x.bearing === 90 && x.finalBearing === 90, 'a quarter of the equator: a quarter of 2π × 6,378,137 m, due east'); }
  { const x = g.inverse(90, 0, -90, 0); t.ok(Math.abs(x.metres - 20003931.4586) < 1e-3 && x.bearing === 180, `pole to pole: half a meridian, 20,003,931.459 m (${x.metres.toFixed(4)}); the sphere says ${(x.sphereMetres / 1000).toFixed(2)} km`); }
  { const x = g.inverse(0, 0, 0, 180); t.ok(Math.abs(x.metres - 20003931.4586) < 1e-3 && (x.bearing === 0 || x.bearing === 180), `opposite points on the equator: over a pole (20,003.93 km), not along the equator (20,037.51 km) — ${x.metres.toFixed(3)}, bearing ${x.bearing}`); }
  { const x = g.inverse(28.6139, 77.209, 28.6139, 77.209); t.ok(x.metres === 0 && x.sphereMetres === 0, 'the same place: 0'); }
  { const x = g.inverse(-17.7134, 178.065, -13.8333, -171.7667), y = g.inverse(-17.7134, 178.065, -13.8333, 188.2333 - 360); t.ok(x.metres === y.metres && x.metres < 1.3e6 && x.bearing > 0 && x.bearing < 90, `across the date line the short way: ${(x.metres / 1000).toFixed(1)} km, heading east`); }
  { const a = g.inverse(10, 20, 30, 40), b = g.inverse(30, 40, 10, 20); t.ok(Math.abs(a.metres - b.metres) < 1e-8 && apart(a.bearing, b.finalBearing + 180) < 1e-11 && apart(a.finalBearing, b.bearing + 180) < 1e-11, 'there and back: the same distance, the bearings turned round'); }

  // ================================================================== writing coordinates
  bad = [];
  for (const [dec, axis, six, dms, ddm] of ref.written) {
    const v = parseFloat(dec);
    if (C.toDecimal(v) !== six || C.toDMS(v, axis) !== dms || C.toDDM(v, axis) !== ddm) bad.push(`${dec} (${axis}): ${C.toDecimal(v)} | ${C.toDMS(v, axis)} | ${C.toDDM(v, axis)} ≠ ${six} | ${dms} | ${ddm}`);
    // … and reading them back
    const back = [C.parseCoord(C.toDMS(v, axis), axis), C.parseCoord(C.toDDM(v, axis), axis), C.parseCoord(C.toDecimal(v), axis)], tol = [0.0051 / 3600, 0.000051 / 60, 5.1e-7];
    back.forEach((b, i) => { if (!(Math.abs(b - v) <= tol[i])) bad.push(`${dec}: written form ${i} reads back as ${b}`); });
  }
  t.ok(ref.written.length === 628 && !bad.length, `${ref.written.length} coordinates: six decimals, degrees-minutes-seconds and degrees with decimal minutes exactly as rounding the typed decimal half up gives them, and each form read back ${bad.slice(0, 3).join(' | ')}`);
  t.eq([28.9999999, 77.99999999, 59.9999999999 / 60, 179.9999999].map((v) => C.toDMS(v, 'lon')).join(' | '), '29° 0′ 0.00″ E | 78° 0′ 0.00″ E | 1° 0′ 0.00″ E | 180° 0′ 0.00″ E', 'seconds that round to 60 carry over — never "28° 59′ 60.00″"');
  t.eq([C.toDecimal(-1e-7), C.toDMS(-1e-7, 'lat'), C.toDDM(-1e-9, 'lon'), C.toDecimal(-0)].join(' | '), '0.000000 | 0° 0′ 0.00″ N | 0° 0.0000′ E | 0.000000', 'a value that rounds to nothing is written without a minus or a southern letter');
  t.eq(C.toDecimal(12.3456785), '12.345679', 'six decimals round the number as written (12.3456785 → …679)');

  // ================================================================== reading coordinates
  bad = [];
  for (const [text, axis, value, six] of ref.typed) {
    let got; try { got = C.parseCoord(text, axis); } catch (e) { bad.push(`${text}: ${e.message}`); continue; }
    if (Math.abs(got - value) > 1e-13 * Math.max(1, Math.abs(value)) || C.toDecimal(got) !== six) bad.push(`${text}: ${got} ≠ ${value}`);
  }
  t.ok(ref.typed.length === 400 && !bad.length, `${ref.typed.length} typed forms (28° 36′ 50″ N, 28 36 50 N, N28°36'50", 28° 36.834′ N, 28d36m50s N, -28:36:50): the value of the exact fraction ${bad.slice(0, 3).join(' | ')}`);
  const reads = [
    ['28.6139', 'lat', 28.6139], ['-33.8688', 'lat', -33.8688], ['−12.5', 'lat', -12.5], ['–12.5', 'lat', -12.5], ['+28.6', 'lat', 28.6], ['.5', 'lat', 0.5], ['28.', 'lat', 28], ['28,6139', 'lat', 28.6139], ['-0', 'lat', 0],
    ['28.6 degrees', 'lat', 28.6], ['28.6 deg N', 'lat', 28.6], ['28 deg 36 min 50 sec', 'lat', 28 + 36 / 60 + 50 / 3600], ['28deg 36min 50sec south', 'lat', -(28 + 36 / 60 + 50 / 3600)], ['28 Degrees 36 Minutes North', 'lat', 28.6],
    ['28° 36′ 50″ N', 'lat', 28 + 36 / 60 + 50 / 3600], ["28°36'50\"N", 'lat', 28 + 36 / 60 + 50 / 3600], ['28º36´50', 'lat', 28 + 36 / 60 + 50 / 3600], ['28°36’50”', 'lat', 28 + 36 / 60 + 50 / 3600], ["28° 36' 50''", 'lat', 28 + 36 / 60 + 50 / 3600],
    ['33 52 7.68 S', 'lat', -33.8688], ['70 40 9 W', 'lon', -(70 + 40 / 60 + 9 / 3600)], ['28 36 50S', 'lat', -(28 + 36 / 60 + 50 / 3600)], ['s 28 36 50', 'lat', -(28 + 36 / 60 + 50 / 3600)], ['28s', 'lat', -28], ['28 n', 'lat', 28],
    ['N 28° 36.834′', 'lat', 28 + 36.834 / 60], ['12° 30', 'lat', 12.5], ['12 30′', 'lat', 12.5], ['12°', 'lat', 12], ['28:36:50', 'lat', 28 + 36 / 60 + 50 / 3600], ['28d36m50s N', 'lat', 28 + 36 / 60 + 50 / 3600], ['28d 36m 50.5s', 'lat', 28 + 36 / 60 + 50.5 / 3600],
    ['28d', 'lat', 28], ['28.5d S', 'lat', -28.5], ['West 77.2', 'lon', -77.2], ['77.2 west', 'lon', -77.2], ['77.2090 E', 'lon', 77.209], ['e77.2090', 'lon', 77.209], ['180', 'lon', 180], ['-180', 'lon', -180], ['180 W', 'lon', -180], ['90 S', 'lat', -90], ['  28.6139  ', 'lat', 28.6139],
    ['89 59 59.99', 'lat', 89 + 59 / 60 + 59.99 / 3600], ['28,77', 'lat', 28.77], ['0', 'lon', 0], ['000.500', 'lon', 0.5],
  ];
  bad = reads.filter(([text, axis, want]) => { let got; try { got = C.parseCoord(text, axis); } catch (e) { got = e.message; } return !(typeof got === 'number' && Math.abs(got - want) < 1e-12 && !Object.is(got, -0)); }).map(([text, axis]) => `${text} → ${why(() => { throw new Error(String(C.parseCoord(text, axis))); })}`);
  t.ok(!bad.length, `${reads.length} ways of writing a coordinate are read: minus signs of every kind, a decimal comma, degree words (the S of "degrees" made 28.6° a southern latitude), marks of every keyboard, letters before or after ${bad.join(' | ')}`);
  for (const [text, axis, reason] of [
    ['', 'lat', 'Enter the latitude — 28.6139 or 28° 36′ 50″ N.'], ['   ', 'lon', 'Enter the longitude — 77.2090 or 77° 12′ 32″ E.'],
    ['abc', 'lat', 'Cannot read "abc" as a latitude — write it like 28.6139 or 28° 36′ 50″ N.'], ['north', 'lat', 'Cannot read "north" as a latitude — write it like 28.6139 or 28° 36′ 50″ N.'], ['1e1', 'lat', 'Cannot read "1e1" as a latitude — write it like 28.6139 or 28° 36′ 50″ N.'],
    ['12′ 30', 'lat', 'Cannot read "12′ 30" as a latitude — write it like 28.6139 or 28° 36′ 50″ N.'], ["28°36''", 'lat', 'Cannot read "28°36\'\'" as a latitude — write it like 28.6139 or 28° 36′ 50″ N.'], ['28 36 50 10', 'lat', 'Cannot read "28 36 50 10" as a latitude — write it like 28.6139 or 28° 36′ 50″ N.'],
    ['1.2.3', 'lon', 'Cannot read "1.2.3" as a longitude — write it like 77.2090 or 77° 12′ 32″ E.'], ['--5', 'lon', 'Cannot read "--5" as a longitude — write it like 77.2090 or 77° 12′ 32″ E.'], ['2836', 'lat', 'Latitude: 2836° is outside the range — a latitude goes from 90° S (−90) to 90° N.'],
    ['95', 'lat', 'Latitude: 95° is outside the range — a latitude goes from 90° S (−90) to 90° N.'], ['90.0000001', 'lat', 'Latitude: 90.0000001° is outside the range — a latitude goes from 90° S (−90) to 90° N.'], ['90 0 0.01 N', 'lat', 'Latitude: 90.000002778° is outside the range — a latitude goes from 90° S (−90) to 90° N.'],
    ['181', 'lon', 'Longitude: 181° is outside the range — a longitude goes from 180° W (−180) to 180° E.'], ['-200', 'lon', 'Longitude: 200° is outside the range — a longitude goes from 180° W (−180) to 180° E.'],
    ['28.6 E', 'lat', 'The latitude takes N or S, not E — E and W belong to the longitude.'], ['77.2 N', 'lon', 'The longitude takes E or W, not N — N and S belong to the latitude.'], ['-28.6 S', 'lat', 'Latitude: a minus sign and the letter S together — use one of them.'],
    ['N 28 S', 'lat', 'Latitude: two direction letters (N and S) — one is enough.'], ['28 60', 'lat', 'Latitude: the minutes must be below 60 (60 was given).'], ['28° 75′ 80″ N', 'lat', 'Latitude: the minutes must be below 60 (75 was given).'],
    ['28 59 60', 'lat', 'Latitude: the seconds must be below 60 (60 was given).'], ['28.5 30', 'lat', 'Latitude: degrees with a decimal part cannot be followed by minutes.'], ['28 30.5 20', 'lat', 'Latitude: minutes with a decimal part cannot be followed by seconds.'],
    ['28.6139, 77.2090', 'lat', 'This box takes the latitude alone, and it holds two numbers — put the second (77.2090) into the longitude box.'], ['28.6139, 77.2090', 'lon', 'This box takes the longitude alone, and it holds two numbers — put the first (28.6139) into the latitude box.'],
    ['28.6139 77.2090', 'lat', 'This box takes the latitude alone, and it holds two numbers — put the second (77.2090) into the longitude box.'],
  ]) t.eq(why(() => C.parseCoord(text, axis)), reason, `"${text}" as a ${axis === 'lat' ? 'latitude' : 'longitude'} is refused with the reason`);
  // ---- a pair in one box
  for (const [text, want] of [['28.6139, 77.2090', ['28.6139', '77.2090']], ['28.6139,77.2090', ['28.6139', '77.2090']], ['28.6139; 77.2090', ['28.6139', '77.2090']], ['28.6139\t77.2090', ['28.6139', '77.2090']], ['-33.8688 151.2093', ['-33.8688', '151.2093']],
    ['28,6139, 77,2090', ['28,6139', '77,2090']], ['28.6139° N, 77.2090° E', ['28.6139° N', '77.2090° E']], ['28°36′50″N 77°12′32″E', ['28°36\'50"N', '77°12\'32"E']], ['N 28.6 E 77.2', ['N 28.6', 'E 77.2']], ['33 52 7.68 S, 151 12 33.48 E', ['33 52 7.68 S', '151 12 33.48 E']],
    ['28, 77', ['28', '77']], ['28.6139', null], ['28,6139', null], ['28,77', null], ['28 36 50 N', null], ['28 36', null], ['77° 12′ 32″ E', null], ['100.5, 20', null], ['20, 200', null], ['abc, def', null], ['', null], ['28.6139,', null]])
    t.eq(JSON.stringify(C.splitPair(text)), JSON.stringify(want), `splitPair("${text}")`);
  // ---- bearings
  t.eq(Array.from({ length: 17 }, (_, i) => C.compassPoint(i * 22.5)).join(' '), 'N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW N', 'the sixteen compass points');
  t.eq([0, 11.24, 11.26, 203.59, 348.74, 348.76, 359.96, -10, 360, 720.04].map(C.bearingText).join(' | '), '0.0° (N) | 11.2° (N) | 11.3° (NNE) | 203.6° (SSW) | 348.7° (NNW) | 348.8° (N) | 0.0° (N) | 350.0° (N) | 0.0° (N) | 0.0° (N)', 'a bearing with one decimal and its compass point; 359.96° is 0.0°, never 360.0°');
  t.ok(C.antipodal(30, 10, -30, -170) && C.antipodal(0, 0, 0, 180) && C.antipodal(0, -90, 0, 90) && C.antipodal(90, 0, -90, 77) && !C.antipodal(30, 10, -30, 170) && !C.antipodal(30, 10, 30, -170) && !C.antipodal(90, 0, 90, 180), 'exactly opposite points are recognised (the poles whatever their longitudes)');
};
