#!/usr/bin/env python3
"""Reference for the health calculators (BMI, Calories, Pregnancy Due Date) → tests/fixtures/health/reference.json

  * BMI — exact fractions of the typed numbers (1 in = 0.0254 m, 1 lb = 0.45359237 kg, both exact by definition),
    written with one decimal by decimal rounding (half up), and classed by that number with the WHO cut-offs
    (18.5 / 25 / 30) and the Asian-Indian ones (18.5 / 23 / 25). The "healthy weight range" is found by trying every
    tenth of a kilogram (or pound): the lightest and the heaviest weight that the same rule calls Normal.
  * Calories — the Mifflin–St Jeor equation (Mifflin et al., Am J Clin Nutr 1990;51:241–7) in exact decimals:
    10·kg + 6.25·cm − 5·years + 5 (men) or − 161 (women), times the activity factor.
  * Due date — Python's datetime: first day of the last period + 280 days, shifted by (cycle − 28); conception at
    day 14, the trimesters end at 13 weeks 6 days and 27 weeks 6 days.

    python3 scripts/make-health-reference.py
"""
import json, os, random
from datetime import date, timedelta
from decimal import Decimal
from fractions import Fraction

random.seed(20261119)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'health', 'reference.json')
IN, LB = Fraction('0.0254'), Fraction('0.45359237')
CUTS = {'asian': (Fraction('18.5'), 23, 25), 'who': (Fraction('18.5'), 25, 30)}
NAMES = ['Underweight', 'Normal', 'Overweight', 'Obese']

def shown(fr):
    """a positive fraction with one decimal, half up — exactly: floor(10·x + 1/2) / 10"""
    return Fraction((fr * 10 + Fraction(1, 2)).__floor__(), 10)
def category(s, cuts): return NAMES[0 if s < cuts[0] else 1 if s < cuts[1] else 2 if s < cuts[2] else 3]
def healthy(metres, per, cuts):
    """lightest and heaviest weight in tenths of the unit (per = kilograms in one unit) that is classed Normal"""
    ok = [t for t in range(10, 40000) if cuts[0] <= shown(Fraction(t, 10) * per / (metres * metres)) < cuts[1]]
    return [ok[0] / 10, ok[-1] / 10]

bmi, ranges = [], []  # bmi: [system, height, weight, BMI, as shown, class (Asian-Indian), class (WHO)]; ranges: [system, height, lo and hi (Asian-Indian), lo and hi (WHO)]
heights = ['50', '100', '120.5', '140', '147', '150', '152.4', '155', '158', '160', '162.5', '165', '167', '170', '172', '175', '177.8', '180', '183', '185', '190', '195', '200', '210', '220', '250', '300']
weights = ['2', '20', '35', '40', '45.5', '46', '47.4', '50', '53.5', '55', '58.9', '60', '62', '64', '66.4', '66.5', '68', '70', '72.2', '72.3', '75', '76.8', '80', '85', '90', '100', '120', '150', '200', '400', '700']
for h in heights:
    m = Fraction(h) / 100
    ranges.append(['m', h] + healthy(m, 1, CUTS['asian']) + healthy(m, 1, CUTS['who']))
    for w in weights:
        b = Fraction(w) / (m * m); s = shown(b)
        bmi.append(['m', h, w, float(b), float(s), category(s, CUTS['asian']), category(s, CUTS['who'])])
for ft, inch in [(1, 8), (4, 0), (4, 10), (5, 0), (5, 2), (5, 4), (5, 5.5), (5, 7), (5, 9), (5, 11), (6, 0), (6, 2), (6, 6), (7, 0), (0, 67), (9, 10)]:
    m = (Fraction(ft) * 12 + Fraction(str(inch))) * IN
    ranges.append(['i', [ft, inch]] + healthy(m, LB, CUTS['asian']) + healthy(m, LB, CUTS['who']))
    for lb in ['4', '80', '100', '110', '125', '128', '140', '150', '159.5', '160', '169', '175', '185', '200', '220', '250', '300', '400', '1500']:
        b = Fraction(lb) * LB / (m * m); s = shown(b)
        bmi.append(['i', [ft, inch], lb, float(b), float(s), category(s, CUTS['asian']), category(s, CUTS['who'])])

ACT = ['1.2', '1.375', '1.55', '1.725', '1.9']
cal = []
for male in (1, 0):
    for age in (15, 18, 30, 45, 75, 110):
        for cm in ('100', '150', '158', '165.5', '170', '180', '250'):
            for kg in ('20', '45', '55.5', '62', '70', '85', '400'):
                bmr = 10 * Decimal(kg) + Decimal('6.25') * Decimal(cm) - 5 * age + (5 if male else -161)
                act = random.choice(ACT)
                cal.append([male, age, float(cm), float(kg), float(act), float(bmr), float(bmr * Decimal(act))])

due = []
d0 = date(2026, 11, 19)
lmps = [date(2026, 1, 1), date(2026, 2, 28), date(2024, 2, 29), date(2025, 12, 31), date(2026, 5, 23), date(2026, 9, 10), date(2026, 11, 19), date(2026, 11, 25), date(2023, 3, 15), date(1999, 12, 31), date(1, 1, 1), date(9998, 3, 1)]
lmps += [d0 - timedelta(days=random.randint(0, 320)) for _ in range(24)]
for lmp in lmps:
    for cycle in (20, 26, 28, 35, 45):
        adj = cycle - 28
        for today in {d0, lmp + timedelta(days=random.randint(0, 300)), lmp + timedelta(days=97 + adj), lmp + timedelta(days=98 + adj), lmp + timedelta(days=195 + adj), lmp + timedelta(days=196 + adj), lmp - timedelta(days=3) if lmp > date(1, 1, 5) else lmp}:
            since = (today - lmp).days
            days = None if since < 0 else max(0, since - adj)
            dd = lmp + timedelta(days=280 + adj)
            due.append([lmp.isoformat(), cycle, today.isoformat(), dd.isoformat(), (lmp + timedelta(days=14 + adj)).isoformat(), (lmp + timedelta(days=97 + adj)).isoformat(), (lmp + timedelta(days=195 + adj)).isoformat(), days, (dd - today).days])
iso = lambda d: f'{d.year:04d}-{d.month:02d}-{d.day:02d}'
due = [[iso(date.fromisoformat(r[0])), r[1], r[2]] + r[3:] for r in due]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f: json.dump({'made_with': 'Python fractions, decimal and datetime', 'bmi': bmi, 'ranges': ranges, 'calories': cal, 'due': due}, f, separators=(',', ':'))
print(len(bmi), 'BMIs,', len(ranges), 'healthy ranges,', len(cal), 'calorie cases,', len(due), 'due dates;', os.path.getsize(OUT), 'bytes')
