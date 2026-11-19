#!/usr/bin/env python3
"""Reference for Loan Prepayment, PPF, EPF, NPS and Inflation → tests/fixtures/finance2/reference.json

Each model worked in mpmath at 60 digits, by another route than the app's engine where there is one:
  * prepayment — the loan month by month: interest on what is owed, the instalment, a part-prepayment after `when`
    instalments (once, or every 12 months from then on), with the instalment kept (the loan ends sooner) or worked
    out anew for the months that are left. One-time prepayments with the tenure kept are also checked here against
    the closed form (the balance after `when` instalments, less the prepayment, spread over the rest).
  * PPF — the closed form of a yearly deposit at the start of each year: A·((1+r)^n − 1)/r·(1+r).
  * EPF — as the EPFO keeps the account: 12 % from the member, 12 % from the employer less 8.33 % of pay up to
    Rs 15,000 for the pension scheme; interest each month on the balance the month opened with, credited once a year;
    pay rises yearly.
  * NPS — the closed form of monthly contributions at the start of each month to the age of 60 (numpy-financial's
    fv as a cross-check), the annuity share and the monthly pension it buys.
  * inflation — (1 + r)^years, and the years for prices to double (or halve).

    pip install mpmath numpy-financial
    python3 scripts/make-finance2-reference.py
"""
import json, os, random
from mpmath import mp, mpf, log
import numpy_financial as npf

mp.dps = 60
random.seed(20261119)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'finance2', 'reference.json')
f17 = lambda x: float(mp.nstr(x, 17))
TINY = mpf('0.005')

def emi(P, r, n): return P / n if r == 0 else P * r * (1 + r) ** n / ((1 + r) ** n - 1)
def prepay(P, R, n, pp, when, yearly, keep):
    P, r, pp = mpf(P), mpf(R) / 1200, mpf(pp)
    e0 = emi(P, r, n); bal, interest, m, prepaid, ne, ended = P, mpf(0), 0, mpf(0), e0, 0
    while True:
        due = (m >= when and (m - when) % 12 == 0) if yearly else m == when
        if due and bal > TINY:
            x = min(pp, bal); bal -= x; prepaid += x
            if bal <= TINY: ended = 1
            elif keep and n - m > 0: ne = emi(bal, r, n - m)
        if bal <= TINY or m >= n: break
        i = bal * r; interest += i
        bal -= min(ne - i, bal); m += 1
    return e0, e0 * n - P, interest, m, ne, prepaid, ended

prepay_cases, closed = [], 0  # [P, rate, months, prepayment, when, yearly, keep, emi, interest without, interest with, months taken, last instalment, prepaid, paid off by a prepayment]
seen = set()
while len(prepay_cases) < 520:
    P = random.choice(['2500000', '500000', '7500000.5', '120000']); R = random.choice(['0', '7.5', '8.5', '9.25', '12', '24'])
    n = random.choice([12, 36, 60, 120, 180, 240, 360]); pp = random.choice(['10000', '50000', '200000', '1000000', '9000000'])
    when = random.choice([0, 1, 5, 6, 11, 12, 13, 24, 59, 60, 119, n - 1]); yearly, keep = random.randint(0, 1), random.randint(0, 1)
    key = (P, R, n, pp, when, yearly, keep)
    if when >= n or key in seen: continue
    seen.add(key)
    e0, base, interest, m, ne, prepaid, ended = prepay(*key)
    if not yearly and keep and not ended:  # the closed form
        r = mpf(R) / 1200; Pm = mpf(P)
        owed = Pm * (1 - mpf(when) / n) if r == 0 else Pm * ((1 + r) ** n - (1 + r) ** when) / ((1 + r) ** n - 1)
        assert abs(ne - emi(owed - mpf(pp), r, n - when)) < mpf(10) ** -40 and m == n, key
        closed += 1
    prepay_cases.append([float(P), float(R), n, float(pp), when, yearly, keep, f17(e0), f17(base), f17(interest), m, f17(ne), f17(prepaid), ended])

ppf = []  # [yearly deposit, rate, years, balance]
for A in ('500', '12500', '100000', '150000'):
    for R in ('0', '5', '7.1', '7.9', '8.7', '12'):
        for n in (1, 5, 7, 15, 20, 25, 30, 50):
            r = mpf(R) / 100; a = mpf(A)
            ppf.append([float(A), float(R), n, f17(a * n if r == 0 else a * ((1 + r) ** n - 1) / r * (1 + r))])

def epf(basic, age, ret, opening, inc, R):
    b, bal, own, er_sum, eps_sum, interest = mpf(basic), mpf(opening), mpf(0), mpf(0), mpf(0), mpf(0)
    for _ in range(ret - age):
        accrued = mpf(0)
        for _ in range(12):
            accrued += bal * mpf(R) / 1200
            emp = b * mpf('0.12'); eps = min(b, mpf(15000)) * mpf('0.0833'); er = emp - eps
            bal += emp + er; own += emp; er_sum += er; eps_sum += eps
        bal += accrued; interest += accrued
        b *= 1 + mpf(inc) / 100
    return bal, own, er_sum, eps_sum, interest
epf_cases = []  # [basic, age, retirement age, opening balance, raise %, rate, corpus, member's, employer's EPF share, EPS share, interest]
for basic in ('50000', '15000', '9000', '125000.5'):
    for age, ret in ((30, 58), (22, 60), (45, 58), (57, 58), (15, 75), (40, 41)):
        for opening in ('0', '250000'):
            for inc in ('0', '6', '10.5'):
                R = random.choice(['8.25', '8.1', '8.5', '0', '12'])
                epf_cases.append([float(basic), age, ret, float(opening), float(inc), float(R)] + [f17(x) for x in epf(basic, age, ret, opening, inc, R)])

nps_cases, fv_checked = [], 0  # [monthly, age, return, annuity %, annuity rate, corpus, monthly pension, lump sum, invested]
for A in ('10000', '500', '50000.5'):
    for age in (18, 25, 30, 45, 59):
        for R in ('0', '6', '8', '10', '12', '14'):
            ap, ar = random.choice(['20', '40', '50', '75', '100']), random.choice(['0', '5', '6', '6.5', '7.25'])
            n, i, a = (60 - age) * 12, mpf(R) / 1200, mpf(A)
            c = a * n if i == 0 else a * ((1 + i) ** n - 1) / i * (1 + i)
            if i > 0: assert abs(npf.fv(float(i), n, -float(A), 0, when='begin') / float(c) - 1) < 1e-9; fv_checked += 1
            ann = c * mpf(ap) / 100
            nps_cases.append([float(A), age, float(R), float(ap), float(ar), f17(c), f17(ann * mpf(ar) / 1200), f17(c - ann), float(A) * n])

infl = []  # [amount, rate, years, future cost, what today's money is worth, years to double (or halve); null at 0 %]
for A in ('100000', '1', '2500000.5'):
    for R in ('-50', '-2', '0', '0.5', '4', '6', '7.5', '10', '100', '1000'):
        for Y in ('0.5', '1', '5', '10', '20', '30', '50', '100'):
            f = (1 + mpf(R) / 100) ** mpf(Y); a = mpf(A)
            fut = a * f
            infl.append([float(A), float(R), float(Y), f17(fut) if fut < mpf('1e300') else None, f17(a / f), None if mpf(R) == 0 else f17(log(2 if mpf(R) > 0 else mpf('0.5')) / log(1 + mpf(R) / 100))])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'made_with': f'mpmath {__import__("mpmath").__version__} (60 digits), numpy-financial {npf.__version__}', 'cross_checks': {'prepay_closed_form': closed, 'nps_vs_numpy_financial_fv': fv_checked},
               'prepay': prepay_cases, 'ppf': ppf, 'epf': epf_cases, 'nps': nps_cases, 'inflation': infl}, f, separators=(',', ':'), allow_nan=False)
print(len(prepay_cases), 'prepayments (', closed, 'also by the closed form ),', len(ppf), 'PPF,', len(epf_cases), 'EPF,', len(nps_cases), 'NPS,', len(infl), 'inflation;', os.path.getsize(OUT), 'bytes')
