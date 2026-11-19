#!/usr/bin/env python3
"""Reference for the Coordinates tab → tests/fixtures/geo/reference.json

  * geodesics on WGS-84 — Charles Karney's own Python implementation (the `geographiclib` package): distance, the
    azimuths at both ends and the point half-way (good to about 15 nanometres). For every pair that is not nearly
    antipodal the distance and the azimuths are also worked out here with **Vincenty's inverse formula in mpmath**
    (another method by another author; T. Vincenty, Survey Review 23 (176), 1975 — a series cut off after its
    fourth term, good to half a millimetre) and must agree within that half millimetre.
  * the sphere — the haversine formula on the mean radius 6,371,008.8 m in mpmath.
  * writing coordinates — degrees, minutes, seconds (two decimals) and degrees with decimal minutes (four decimals)
    from exact fractions of the typed decimal, rounded half up; and the decimal value of typed DMS forms.

    pip install geographiclib mpmath
    python3 scripts/make-geo-reference.py
"""
import json, os, random
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction as F
from geographiclib.geodesic import Geodesic
from mpmath import mp, mpf, sin, cos, tan, atan, atan2, sqrt, asin, radians, degrees, pi

mp.dps = 40
random.seed(20261121)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'geo', 'reference.json')
A, FL, MEAN_R = mpf(6378137), 1 / mpf('298.257223563'), mpf('6371008.8')
B = A * (1 - FL)

def vincenty(lat1, lon1, lat2, lon2):
    """metres, azimuth at 1, azimuth at 2 (degrees) — or None where the iteration does not settle (near antipodes)"""
    U1, U2, L = atan((1 - FL) * tan(radians(mpf(lat1)))), atan((1 - FL) * tan(radians(mpf(lat2)))), radians(mpf(lon2) - mpf(lon1))
    sU1, cU1, sU2, cU2 = sin(U1), cos(U1), sin(U2), cos(U2)
    lam = L
    for _ in range(2000):
        sl, cl = sin(lam), cos(lam)
        ss = sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2)
        if ss == 0: return mpf(0), None, None
        cs = sU1 * sU2 + cU1 * cU2 * cl; sig = atan2(ss, cs)
        sa = cU1 * cU2 * sl / ss; c2a = 1 - sa * sa
        c2m = cs - 2 * sU1 * sU2 / c2a if c2a != 0 else mpf(0)
        C = FL / 16 * c2a * (4 + FL * (4 - 3 * c2a))
        new = L + (1 - C) * FL * sa * (sig + C * ss * (c2m + C * cs * (-1 + 2 * c2m * c2m)))
        if abs(new - lam) < mpf(10) ** -32: lam = new; break
        lam = new
    else: return None
    if abs(lam) > pi: return None
    u2 = c2a * (A * A - B * B) / (B * B)
    AA = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
    BB = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
    ds = BB * ss * (c2m + BB / 4 * (cs * (-1 + 2 * c2m * c2m) - BB / 6 * c2m * (-3 + 4 * ss * ss) * (-3 + 4 * c2m * c2m)))
    s = B * AA * (sig - ds)
    sl, cl = sin(lam), cos(lam)
    return s, degrees(atan2(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl)), degrees(atan2(cU1 * sl, -sU1 * cU2 + cU1 * sU2 * cl))
def haversine(lat1, lon1, lat2, lon2):
    p1, p2, dl = radians(mpf(lat1)), radians(mpf(lat2)), radians(mpf(lon2) - mpf(lon1))
    h = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * MEAN_R * asin(sqrt(h))
f17 = lambda x: float(mp.nstr(x, 17))
turn = lambda a: a % 360

pairs = [  # name, lat1, lon1, lat2, lon2
    ('Delhi → Mumbai', '28.6139', '77.2090', '19.0760', '72.8777'), ('London → New York', '51.5074', '-0.1278', '40.7128', '-74.0060'),
    ('Sydney → Santiago', '-33.8688', '151.2093', '-33.4489', '-70.6693'), ('JFK → Changi', '40.64', '-73.78', '1.36', '103.99'),
    ('Chennai → Kolkata', '13.0827', '80.2707', '22.5726', '88.3639'), ('Across the date line', '-17.7134', '178.0650', '-13.8333', '-171.7667'),
    ('Along the equator', '0', '0', '0', '90'), ('Pole to pole', '90', '0', '-90', '0'), ('To the north pole', '28.6139', '77.2090', '90', '0'),
    ('A hundred metres', '28.6139', '77.2090', '28.6148', '77.2090'), ('One step east', '28.6139', '77.2090', '28.6139', '77.209001'),
    ('The same place', '28.6139', '77.2090', '28.6139', '77.2090'), ('Exactly opposite', '30', '10', '-30', '-170'), ('Opposite on the equator', '0', '0', '0', '180'),
    ('Almost opposite', '0', '0', '0.5', '179.5'), ('Almost opposite (Vincenty fails)', '0', '0', '0.25', '179.7'), ('Quito → Singapore', '-0.1807', '-78.4678', '1.3521', '103.8198'),
]
geodesics, by_vincenty, worst = [], 0, mpf(0)  # [name, lat1, lon1, lat2, lon2, metres, bearing, bearing on arrival, half-way lat, lon, metres on the sphere, checked by Vincenty]
def add(name, lat1, lon1, lat2, lon2):
    global by_vincenty, worst
    g = Geodesic.WGS84.Inverse(float(lat1), float(lon1), float(lat2), float(lon2))
    mid = Geodesic.WGS84.Direct(float(lat1), float(lon1), g['azi1'], g['s12'] / 2)
    v, checked = vincenty(lat1, lon1, lat2, lon2), 0
    if v is not None and v[1] is not None and g['s12'] < 19_900_000:
        d = abs(v[0] - mpf(g['s12'])); worst = max(worst, d)
        assert d < mpf('5e-4'), (name, v[0], g['s12'])
        # azimuths are compared as directions on the ground: half a millimetre at that distance
        for mine, theirs in ((v[1], g['azi1']), (v[2], g['azi2'])):
            off = abs((mine - mpf(theirs) + 180) % 360 - 180)
            assert radians(off) * min(mpf(g['s12']), A) < mpf('5e-4'), (name, mine, theirs)
        checked = 1; by_vincenty += 1
    geodesics.append([name, float(lat1), float(lon1), float(lat2), float(lon2), g['s12'], turn(g['azi1']), turn(g['azi2']), mid['lat2'], mid['lon2'], f17(haversine(lat1, lon1, lat2, lon2)), checked])
for p in pairs: add(*p)
for i in range(420):
    lat1, lat2 = (f'{random.uniform(-90, 90):.5f}' for _ in range(2)); lon1, lon2 = (f'{random.uniform(-180, 180):.5f}' for _ in range(2))
    if i % 5 == 0: lat2, lon2 = f'{float(lat1) + random.uniform(-0.01, 0.01):.6f}', f'{float(lon1) + random.uniform(-0.01, 0.01):.6f}'  # near by
    if not -90 <= float(lat2) <= 90 or not -180 <= float(lon2) <= 180: continue
    add(f'random {i}', lat1, lon1, lat2, lon2)

# ---------------------------------------------------------------- writing coordinates
def dms(dec, axis):
    v = F(dec); t = (abs(v) * 360000 + F(1, 2)).__floor__()  # hundredths of a second, half up
    d, m, s = t // 360000, t % 360000 // 6000, Decimal(t % 6000) / 100
    return f"{d}° {m}′ {s:.2f}″ {('S' if v < 0 and t else 'N') if axis == 'lat' else ('W' if v < 0 and t else 'E')}"
def ddm(dec, axis):
    v = F(dec); t = (abs(v) * 600000 + F(1, 2)).__floor__()   # ten-thousandths of a minute
    d, m = t // 600000, Decimal(t % 600000) / 10000
    return f"{d}° {m:.4f}′ {('S' if v < 0 and t else 'N') if axis == 'lat' else ('W' if v < 0 and t else 'E')}"
def six(dec):
    q = Decimal(dec).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
    return f'{(q if q != 0 else abs(q)):.6f}'
written = []  # [decimal as typed, axis, six decimals, DMS, degrees and decimal minutes]
values = ['28.6139', '-33.8688', '77.2090', '-70.669167', '0', '-0', '0.000001', '-0.0000001', '-0.0000014', '28.9999999', '77.99999999', '59.9999999999', '-89.99999999', '90', '-90', '180', '-180', '179.9999986',
          '0.5', '-0.5', '12.5', '45.999998611', '45.99999861', '1.0166666667', '33.868800', '-151.2093', '0.016666666', '0.9999999998']
for v in values: written.append([v, 'lat' if abs(F(v)) <= 90 else 'lon', six(v), dms(v, 'lat' if abs(F(v)) <= 90 else 'lon'), ddm(v, 'lat' if abs(F(v)) <= 90 else 'lon')])
for _ in range(600):
    axis = random.choice(['lat', 'lon']); top = 90 if axis == 'lat' else 180
    v = f'{random.uniform(-top, top):.{random.choice([0, 1, 3, 5, 6, 7, 9])}f}'
    written.append([v, axis, six(v), dms(v, axis), ddm(v, axis)])
# typed degrees-minutes-seconds → the decimal value (17 digits) and its six decimals
typed = []  # [text, axis, value, six decimals]
for _ in range(400):
    axis = random.choice(['lat', 'lon']); top = 90 if axis == 'lat' else 180
    d, m = random.randint(0, top - 1), random.randint(0, 59); s = f'{random.uniform(0, 59.99):.{random.choice([0, 1, 2, 3])}f}'
    neg = random.randint(0, 1); letter = ('S' if neg else 'N') if axis == 'lat' else ('W' if neg else 'E')
    kind = random.randint(0, 5)
    if kind == 0: text, val = f'{d}° {m}′ {s}″ {letter}', F(d) + F(m, 60) + F(s) / 3600
    elif kind == 1: text, val = f'{d} {m} {s} {letter}', F(d) + F(m, 60) + F(s) / 3600
    elif kind == 2: text, val = f"{letter}{d}°{m}'{s}\"", F(d) + F(m, 60) + F(s) / 3600
    elif kind == 3: mm = f'{m + random.random():.4f}'; text, val = f'{d}° {mm}′ {letter}', F(d) + F(mm) / 60
    elif kind == 4: text, val = f'{d}d{m}m{s}s {letter}', F(d) + F(m, 60) + F(s) / 3600
    else: text, val = f"{'-' if neg else ''}{d}:{m}:{s}", F(d) + F(m, 60) + F(s) / 3600
    val = -val if neg else val
    typed.append([text, axis, float(val), six(str(Decimal(val.numerator) / Decimal(val.denominator)))])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'geodesics': geodesics, 'written': written, 'typed': typed}, f, separators=(',', ':'), allow_nan=False, ensure_ascii=False)
print(len(geodesics), 'geodesics,', by_vincenty, 'of them also by Vincenty in mpmath (largest difference', mp.nstr(worst * 1e6, 3), 'micrometres);', len(written), 'written,', len(typed), 'typed;', os.path.getsize(OUT), 'bytes')
