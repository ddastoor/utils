#!/usr/bin/env python3
"""Reference answers for the Date Calculator (src/lib/dates.ts), by Python's datetime and calendar modules.

    python3 scripts/make-dates-reference.py        → tests/fixtures/dates/reference.json
  spans     [from, to, days between, weekdays Mon–Fri from `from` up to the day before `to` (counted day by day),
             [years, months, days] — the largest number of whole months that fits, found by trying, then the days left]
  months    [date, n, date + n months with the day held back to the month's last day]
  adds      [date, sign, years, months, weeks, days, result]  (months first, then days)
  birthdays [born, on, next birthday on or after `on`]        (29 February → 28 February in other years)
"""
import json, random, calendar
from datetime import date, timedelta
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / 'tests/fixtures/dates/reference.json'
rng = random.Random(20261119)

def add_months(d, n):
    t = d.year * 12 + d.month - 1 + n
    y, m = divmod(t, 12)
    if not 1 <= y <= 9999: return None
    return date(y, m + 1, min(d.day, calendar.monthrange(y, m + 1)[1]))
def ymd(a, b):          # by trying: no formula shared with the tab
    n = 0
    while True:
        nxt = add_months(a, n + 1)
        if nxt is None or nxt > b: break
        n += 1
    return [n // 12, n % 12, (b - add_months(a, n)).days]
def weekdays(a, b):     # Monday … Friday in [a, b)
    return sum(1 for i in range((b - a).days) if (a + timedelta(i)).weekday() < 5)
def rdate(lo=1, hi=9999):
    y = rng.randint(lo, hi); m = rng.randint(1, 12); return date(y, m, rng.randint(1, calendar.monthrange(y, m)[1]))
iso = lambda d: d.isoformat()

edge = [date(2024, 2, 29), date(2023, 2, 28), date(2024, 2, 28), date(2000, 2, 29), date(1900, 2, 28), date(2100, 2, 28), date(2026, 1, 31), date(2026, 3, 31), date(2026, 12, 31), date(2027, 1, 1), date(1, 1, 1), date(99, 12, 31), date(100, 1, 1),
        date(1582, 10, 4), date(1582, 10, 15), date(1752, 9, 2), date(1969, 12, 31), date(1970, 1, 1), date(9999, 12, 31), date(2026, 11, 19), date(2026, 5, 30), date(2026, 8, 31), date(2025, 1, 30), date(2028, 2, 29)]
spans = []
for a in edge:
    for b in edge:
        if a <= b and (b - a).days < 4000: spans.append((a, b))
while len(spans) < 1500:
    a = rdate(1, 9990); span = rng.choice([rng.randint(0, 45), rng.randint(0, 800), rng.randint(0, 3000)])
    b = a + timedelta(span)
    spans.append((a, b))
for _ in range(200):          # long spans: days and ymd only (counting weekdays day by day would take long)
    a, b = sorted([rdate(), rdate()]); spans.append((a, b))
out = {'spans': [], 'months': [], 'adds': [], 'birthdays': []}
for a, b in spans:
    out['spans'].append([iso(a), iso(b), (b - a).days, weekdays(a, b) if (b - a).days <= 4000 else None, ymd(a, b)])
for d in edge + [rdate(2, 9990) for _ in range(300)]:
    for n in [1, -1, 2, 11, 12, -12, 13, 25, -37, 48, 1200, -1200, rng.randint(-500, 500)]:
        r = add_months(d, n)
        if r: out['months'].append([iso(d), n, iso(r)])
for _ in range(600):
    d = rng.choice(edge) if rng.random() < 0.3 else rdate(50, 9900); sign = rng.choice([1, -1])
    y, m, w, dd = rng.choice([0, 0, 1, 5, 40]), rng.choice([0, 0, 1, 6, 11, 14, 30]), rng.choice([0, 0, 2, 52]), rng.choice([0, 1, 30, 45, 365, 1000])
    mid = add_months(d, sign * (12 * y + m))
    if mid is None: continue
    try: r = mid + timedelta(sign * (7 * w + dd))
    except OverflowError: continue
    out['adds'].append([iso(d), sign, y, m, w, dd, iso(r)])
for _ in range(500):
    born = rng.choice([date(2000, 2, 29), date(1996, 2, 29), date(2024, 2, 29)]) if rng.random() < 0.25 else rdate(1900, 2026)
    on = born + timedelta(rng.randint(0, 40000))
    if on.year > 9998: continue
    def bday(y): return date(y, born.month, min(born.day, calendar.monthrange(y, born.month)[1]))
    nxt = bday(on.year)
    if nxt < on: nxt = bday(on.year + 1)
    out['birthdays'].append([iso(born), iso(on), iso(nxt)])
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text('{\n' + ',\n'.join(f' "{k}": [\n' + ',\n'.join('  ' + json.dumps(r) for r in v) + '\n ]' for k, v in out.items()) + '\n}\n')
print({k: len(v) for k, v in out.items()}, '→', OUT.name)
