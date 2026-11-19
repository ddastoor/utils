#!/usr/bin/env python3
"""Reference for Tip & Bill Splitter, Fuel Cost and GPA → tests/fixtures/smallcalc/reference.json

Exact arithmetic on the typed numbers (Python's decimal and fractions):
  * tip — the bill in whole paise (half up), the tip in whole paise (half up), each share rounded UP to the paisa,
    the rupee or ten rupees, and what the shares add up to;
  * fuel — distance × trips / mileage litres, × price, ÷ people; price / mileage a kilometre;
  * gpa — the credit-weighted mean of the grade points as a fraction, and written with two decimals (half up);
    the CBSE / AICTE percentage is the mean × 9.5.

    python3 scripts/make-smallcalc-reference.py
"""
import json, os, random
from decimal import Decimal, ROUND_HALF_UP, ROUND_CEILING
from fractions import Fraction

random.seed(20261119)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'smallcalc', 'reference.json')
hu = lambda d: int(d.quantize(Decimal(1), rounding=ROUND_HALF_UP))

tip = []  # [bill, tip %, people, rounding, tip, total, each, collected] — the last four in paise
BILLS = ['2400', '1000', '999.99', '1', '0.01', '0.05', '100.5', '1234.56', '1234.565', '1.005', '87.35', '4999', '10000000', '9999999999999.99']
BILLS += [f'{random.randint(1, 10 ** random.randint(2, 6))}.{random.randint(0, 99):02d}' for _ in range(30)]
for bill in BILLS:
    for pct in random.sample(['0', '5', '7.5', '10', '12.5', '15', '18', '20', '33.33', '100', '1000'], 4):
        for people in random.sample([1, 2, 3, 4, 5, 6, 7, 9, 11, 13, 20, 100], 4):
            for rnd in ('no', '1', '10'):
                B = hu(Decimal(bill) * 100); T = hu(Decimal(B) * Decimal(pct) / 100); total = B + T
                step = 1 if rnd == 'no' else int(rnd) * 100
                each = int((Decimal(total) / (people * step)).to_integral_value(rounding=ROUND_CEILING)) * step
                tip.append([bill, pct, people, rnd, T, total, each, each * people])

fuel = []  # [distance, mileage, price, trips, people, km, litres, cost, per person, per km]
for dist in ('350', '1234', '0.5', '12.7', '100', '2500', '1000000000'):
    for eff in ('15', '18.5', '4.2', '25', '60', '0.5', '1000000'):
        for price in ('105', '96.72', '0', '89.5', '10000000'):
            trips, people = random.choice((1, 2)), random.choice((1, 2, 3, 4, 5, 7))
            km = Fraction(dist) * trips; litres = km / Fraction(eff); cost = litres * Fraction(price)
            fuel.append([dist, eff, price, trips, people, float(km), float(litres), float(cost), float(cost / people), float(Fraction(price) / Fraction(eff))])

def two(fr):  # a non-negative fraction with two decimals, half up, as text without trailing zeros
    n = (fr * 100 + Fraction(1, 2)).__floor__()
    s = f'{n // 100}.{n % 100:02d}'.rstrip('0').rstrip('.')
    return s
gpa = []  # [scale, [[grade, credits] …], mean, mean with two decimals, percentage with two decimals (10-point), total credits]
G10 = ['10', '9', '8', '7', '6', '5', '4', '0', '9.5', '8.5', '7.25', '6.75', '8.67', '8.68', '9.33']
G4 = ['4', '3.7', '3.3', '3', '2.7', '2.3', '2', '1.7', '1', '0', '3.85', '3.33']
CR = ['1', '2', '3', '4', '5', '6', '1.5', '0.5', '20', '22', '24', '0']
for _ in range(400):
    scale = random.choice((10, 4)); rows = [[random.choice(G10 if scale == 10 else G4), random.choice(CR)] for _ in range(random.randint(1, 10))]
    cs = sum(Fraction(c) for _, c in rows)
    if cs == 0: gpa.append([scale, rows, None, None, None, 0.0]); continue
    mean = sum(Fraction(g) * Fraction(c) for g, c in rows) / cs
    gpa.append([scale, rows, float(mean), two(mean), two(mean * Fraction('9.5')) if scale == 10 else None, float(cs)])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f: json.dump({'made_with': 'Python decimal and fractions', 'tip': tip, 'fuel': fuel, 'gpa': gpa}, f, separators=(',', ':'))
print(len(tip), 'bills,', len(fuel), 'trips,', len(gpa), 'grade sheets;', os.path.getsize(OUT), 'bytes')
