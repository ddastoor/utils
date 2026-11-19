#!/usr/bin/env python3
"""Reference for Body Fat, Ideal Weight and Sleep Cycle → tests/fixtures/body/reference.json

  * body fat — the US Navy equations (Hodgdon & Beckett 1984, in centimetres) in mpmath at 40 digits:
        men    495 / (1.0324  − 0.19077·log10(waist − neck)       + 0.15456·log10(height)) − 450
        women  495 / (1.29579 − 0.35004·log10(waist + hip − neck) + 0.22100·log10(height)) − 450
    with the figure as it is shown (one decimal, half up on the exact value) and its class on the ACE chart.
  * ideal weight — Devine, Robinson, Miller and Hamwi as exact fractions of the typed height (inches over 5 feet),
    in kg and in lb, shown with one decimal; and the healthy BMI ranges (the lightest and the heaviest tenth of a
    kilogram or pound whose BMI, shown with one decimal, is Normal) for the Asian-Indian and the WHO cut-offs.
  * sleep — bed times and wake times with Python's datetime.

    pip install mpmath
    python3 scripts/make-body-reference.py
"""
import json, os, random
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP, ROUND_CEILING
from fractions import Fraction as F
from mpmath import mp, mpf, log10

mp.dps = 40
random.seed(20261120)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'body', 'reference.json')

def one_decimal(x):
    """x (mpf or Fraction) with one decimal, half up, as text without a trailing .0 dropped"""
    d = Decimal(mp.nstr(x, 35)) if isinstance(x, mpf) else Decimal(x.numerator) / Decimal(x.denominator)
    return str(d.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))

# ---------------------------------------------------------------- body fat
CHART = {1: (2, [6, 14, 18, 25]), 0: (10, [14, 21, 25, 32])}
NAMES = ['Essential fat', 'Athletic', 'Fit', 'Average', 'Obese']
def navy(male, h, neck, waist, hip):
    h, neck, waist, hip = mpf(h), mpf(neck), mpf(waist), mpf(hip)
    if male: return 495 / (mpf('1.0324') - mpf('0.19077') * log10(waist - neck) + mpf('0.15456') * log10(h)) - 450
    return 495 / (mpf('1.29579') - mpf('0.35004') * log10(waist + hip - neck) + mpf('0.22100') * log10(h)) - 450
def category(shown, male):
    essential, cuts = CHART[male]
    return 'Below essential fat' if shown < essential else NAMES[sum(1 for c in cuts if shown >= c)]

bodyfat = []  # [male, height, neck, waist, hip, per cent (17 digits), as shown, class or null when no body has it]
def add_bf(male, h, neck, waist, hip):
    if male and not F(waist) > F(neck): return
    p = navy(male, h, neck, waist, hip); shown = one_decimal(p); ok = 0 < float(shown) < 75
    bodyfat.append([male, float(h), float(neck), float(waist), float(hip), float(mp.nstr(p, 17)), shown, category(Decimal(shown), male) if ok else None])
for male, h, neck, waist, hip in [(1, '175', '38', '85', '95'), (0, '175', '38', '85', '95'), (1, '178', '50', '96', '0'), (0, '165', '32', '70', '95'), (1, '195', '42', '62', '0'), (1, '175', '38', '250', '0'), (0, '160', '30', '60', '85')]:
    add_bf(male, h, neck, waist, hip)
while len(bodyfat) < 700:
    male = random.randint(0, 1)
    h = random.choice([str(random.randint(140, 210)), f'{random.uniform(100, 250):.1f}'])
    neck = random.choice([str(random.randint(28, 50)), f'{random.uniform(20, 80):.1f}'])
    waist = random.choice([str(random.randint(60, 130)), f'{random.uniform(40, 250):.1f}'])
    hip = random.choice([str(random.randint(75, 130)), f'{random.uniform(50, 250):.1f}'])
    add_bf(male, h, neck, waist, hip)

# ---------------------------------------------------------------- ideal weight
IN, LB = F('2.54'), F('0.45359237')
FORMULAS = {1: [(50, F('2.3')), (52, F('1.9')), (F('56.2'), F('1.41')), (48, F('2.7'))], 0: [(F('45.5'), F('2.3')), (49, F('1.7')), (F('53.1'), F('1.36')), (F('45.5'), F('2.2'))]}
def healthy(metres, lo_cut, hi_cut, per):
    """tenths of a unit (per kg each): shown BMI >= lo_cut means BMI >= lo_cut - 0.05; shown < hi_cut means BMI < hi_cut - 0.05"""
    h2 = metres * metres
    lo = -((-(lo_cut - F('0.05')) * h2 / per * 10) // 1)          # the first tenth at or above
    hi = -((-(hi_cut - F('0.05')) * h2 / per * 10) // 1) - 1      # the last tenth strictly below
    return [str(Decimal(int(lo)) / 10), str(Decimal(int(hi)) / 10)]
def ideal(male, metres, per):
    inches = metres * 100 / IN - 60
    return None if inches < 0 else [one_decimal((base + F(k) * inches) / per) for base, k in FORMULAS[male]]

def healthy_by_trying(metres, lo_cut, hi_cut, per):
    shown = lambda t: F((F(t, 10) * per / (metres * metres) * 10 + F(1, 2)).__floor__(), 10)
    ok = [t for t in range(10, 40000) if lo_cut <= shown(t) < hi_cut]
    return [str(Decimal(ok[0]) / 10), str(Decimal(ok[-1]) / 10)]
for cm in ('100', '152.4', '170', '183.5', '250'):  # the closed form above against trying every tenth
    for per in (F(1), LB):
        for hi_cut in (23, 25):
            assert healthy(F(cm) / 100, F('18.5'), hi_cut, per) == healthy_by_trying(F(cm) / 100, F('18.5'), hi_cut, per), (cm, per, hi_cut)

idealweight = []  # [male, 'kg', cm] or [male, 'lb', feet, inches] then [Devine, Robinson, Miller, Hamwi] or null, Asian range, WHO range
heights = ['170', '152.4', '152.39', '152.41', '100', '250', '153.67', '165.1', '140', '180.34', '199.9', '160'] + [str(random.randint(100, 250)) for _ in range(60)] + [f'{random.uniform(100, 250):.1f}' for _ in range(60)]
for cm in heights:
    for male in (1, 0):
        m = F(cm) / 100
        idealweight.append([male, 'kg', float(cm), ideal(male, m, 1), healthy(m, F('18.5'), 23, 1), healthy(m, F('18.5'), 25, 1)])
for ft, inch in [(5, 7), (5, 0), (4, 11), (4, 11.9), (6, 2), (0, 67), (5, 0.5), (6, 0), (3, 4), (8, 2)] + [(random.randint(4, 6), random.choice([random.randint(0, 11), round(random.uniform(0, 11.9), 1)])) for _ in range(50)]:
    for male in (1, 0):
        m = (F(ft) * 12 + F(str(inch))) * IN / 100
        if not (F(100) <= m * 100 <= F(250)): continue
        idealweight.append([male, 'lb', ft, inch, ideal(male, m, LB), healthy(m, F('18.5'), 23, LB), healthy(m, F('18.5'), 25, LB)])

# ---------------------------------------------------------------- sleep
sleep = []  # [mode, 'hh:mm', minutes to fall asleep, [[cycles, 'hh:mm', day offset], …]]
for _ in range(400):
    mode = random.choice(['wake', 'bed']); t = datetime(2026, 6, 15, random.randint(0, 23), random.choice([0, 15, 30, 45, random.randint(0, 59)]))
    fall = random.choice([0, 5, 10, 15, 20, 30, 45, 90, 180, random.randint(0, 180)])
    rows = []
    for cycles in (6, 5, 4, 3):
        at = t - timedelta(minutes=90 * cycles + fall) if mode == 'wake' else t + timedelta(minutes=90 * cycles + fall)
        rows.append([cycles, at.strftime('%H:%M'), (at.date() - t.date()).days])
    sleep.append([mode, t.strftime('%H:%M'), fall, rows])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'bodyfat': bodyfat, 'idealweight': idealweight, 'sleep': sleep}, f, separators=(',', ':'), allow_nan=False)
print(len(bodyfat), 'body-fat cases,', sum(1 for b in bodyfat if b[7] is None), 'of them outside what a body has;', len(idealweight), 'heights;', len(sleep), 'sleep cases;', os.path.getsize(OUT), 'bytes')
