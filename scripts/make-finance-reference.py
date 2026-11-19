#!/usr/bin/env python3
"""Reference answers for the finance calculators (EMI, SIP, FD / RD, GST, Percentage) → tests/fixtures/finance/reference.json

Independent of the app's engine (wasm/mathcore) in method, not only in code:
  * EMI — the definition of a reducing-balance loan, month by month (interest on what is owed, the rest repays),
    in mpmath at 420 digits (the recurrence multiplies its rounding by (1 + r) each month; at 1,000 % over 100 years
    that is 10^316). The engine uses closed forms in doubles. Cross-checked here against numpy-financial (pmt, ipmt,
    ppmt), the reference implementation of the spreadsheet functions.
  * SIP — the instalments carried forward month by month in mpmath; without a step-up also numpy-financial's fv.
  * FD / RD — compound interest in mpmath; quarterly recurring deposits also by the formula Indian banks publish,
    M = R·((1 + i)^n − 1) / (1 − (1 + i)^(−1/3)).
  * GST — Python's decimal module with ROUND_HALF_UP on the typed text of the amount (the engine works in 128-bit
    integers on a double).
  * Percentage — exact fractions of the typed text.

    pip install mpmath numpy-financial
    python3 scripts/make-finance-reference.py
"""
import json, os, random, sys
from decimal import Decimal, ROUND_HALF_UP, getcontext
from fractions import Fraction
from mpmath import mp, mpf
import numpy_financial as npf

random.seed(20261119)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'finance', 'reference.json')
def f17(x):
    """the nearest double; None where the value is beyond a double (the calculators must refuse those)"""
    v = x if isinstance(x, float) else float(mp.nstr(x, 17))
    return v if abs(v) < 1.7e308 else None


# ------------------------------------------------------------------ EMI
def loan(P, annual, n):
    """instalment and the schedule year by year: [principal, interest, balance]"""
    mp.dps = 420
    P, r = mpf(P), mpf(annual) / 1200
    emi = P / n if r == 0 else P * r * (1 + r) ** n / ((1 + r) ** n - 1)
    bal, years, pp, ii = P, [], mpf(0), mpf(0)
    for k in range(1, n + 1):
        i = bal * r
        ii += i; pp += emi - i; bal -= emi - i
        if k % 12 == 0 or k == n:
            years.append([pp, ii, bal]); pp, ii = mpf(0), mpf(0)
    assert abs(bal) < mpf(10) ** -60 * P, (P, annual, n, bal)
    return emi, years

emi_cases, npf_checked = [], 0
AMOUNTS = ['50000', '2500000', '123456789.5', '10000000000000']
RATES = ['0', '0.000000001', '0.01', '1', '6.5', '8.5', '9.25', '10.99', '14', '18', '36', '100', '1000']
MONTHS = [1, 2, 3, 6, 11, 12, 13, 18, 24, 60, 84, 120, 180, 240, 360, 600, 1199, 1200]
for P in AMOUNTS:
    for R in RATES:
        for n in MONTHS:
            emi, ys = loan(P, R, n)
            pick = sorted({0, len(ys) // 2, len(ys) - 1})
            # [loan, rate, months, instalment, years, [year index, principal, interest, balance] …]
            emi_cases.append([float(P), float(R), n, f17(emi), len(ys)] + [[y] + [f17(v) for v in ys[y]] for y in pick])
            if float(R) >= 0.01 and float(R) <= 36 and n <= 360:  # where the spreadsheet functions keep their digits (at a billionth of a percent they have none left: (1 + r)^n − 1)
                rr = float(R) / 1200
                assert abs(-npf.pmt(rr, n, float(P)) / float(emi) - 1) < 1e-9, (P, R, n)
                per = list(range(1, min(12, n) + 1))
                ip, pr = -npf.ipmt(rr, per, n, float(P)).sum(), -npf.ppmt(rr, per, n, float(P)).sum()
                tol = max(1e-6, float(P) * 1e-9)
                assert abs(ip - float(ys[0][1])) <= tol and abs(pr - float(ys[0][0])) <= tol, (P, R, n, ip, float(ys[0][1]))
                npf_checked += 1
# every row of a few whole schedules
emi_full = []
for P, R, n in [('2500000', '8.5', 240), ('1000000', '8.5', 60), ('300000', '12', 18), ('7500000', '7.1', 360), ('500000', '0', 36), ('80000', '14', 12), ('1000000', '100', 1200), ('40000', '36', 7)]:
    emi, ys = loan(P, R, n)
    emi_full.append({'p': float(P), 'r': float(R), 'n': n, 'emi': f17(emi), 'rows': [[f17(v) for v in y] for y in ys]})


# ------------------------------------------------------------------ SIP
def sip(amount, annual, months, step):
    mp.dps = 60
    i, v, inv, m = mpf(annual) / 1200, mpf(0), mpf(0), mpf(amount)
    for k in range(months):
        if k and k % 12 == 0: m *= 1 + mpf(step) / 100
        v = (v + m) * (1 + i); inv += m
    return inv, v

sip_cases, fv_checked = [], 0
for A in ['10000', '123456.78']:
    for R in ['-50', '-5', '0', '0.000001', '6', '8', '12', '15', '24', '100', '1000']:
        for n in [1, 2, 11, 12, 13, 24, 60, 120, 180, 240, 360, 480, 1200]:
            for S in ['0', '5', '10', '12.5', '100']:
                inv, v = sip(A, R, n, S)
                sip_cases.append([float(A), float(R), n, float(S), f17(inv), f17(v)])  # amount, return, months, step-up, invested, value
                if S == '0' and float(R) > 0.001 and float(R) <= 24 and n <= 480:
                    assert abs(npf.fv(float(R) / 1200, n, -float(A), 0, when='begin') / float(v) - 1) < 1e-9, (A, R, n)
                    fv_checked += 1
mp.dps = 60
lump_cases = [[float(A), float(R), float(Y), f17(mpf(A) * (1 + mpf(R) / 100) ** mpf(Y))]
              for A in ['1', '10000', '2500000.5'] for R in ['-99', '-50', '-5', '0', '6', '8', '12', '15', '100', '1000'] for Y in ['0.5', '1', '2.5', '10', '30', '100']]


# ------------------------------------------------------------------ FD / RD
def grow(P, r, n, t):
    return P * (1 + r * t) if n == 0 else P * (1 + r / n) ** (n * t)

mp.dps = 60
FD_RATES = ['0', '0.5', '3.5', '6.8', '7', '7.25', '8.05', '9.5', '15', '100']
fd_cases = [[float(A), float(R), float(Y), C, f17(grow(mpf(A), mpf(R) / 100, C, mpf(Y)))]  # amount, rate, years, compounding, value
            for A in ['100000', '2500000.5'] for R in FD_RATES for Y in ['0.25', '0.5', '1', '1.5', '2', '3', '5', '7.5', '10', '20', '100'] for C in [0, 1, 2, 4, 12]]
rd_cases, bank_checked = [], 0
for A in ['5000', '1234.5']:
    for R in FD_RATES:
        for n in [1, 3, 6, 12, 13, 24, 36, 60, 120, 1200]:
            for C in [0, 1, 2, 4, 12]:
                v = sum(grow(mpf(A), mpf(R) / 100, C, mpf(n - k) / 12) for k in range(n))
                rd_cases.append([float(A), float(R), n, C, f17(v)])  # instalment, rate, months, compounding, value
                if C == 4 and n % 3 == 0 and float(R) > 0:  # the banks' formula, whole quarters
                    i = mpf(R) / 400
                    bank = mpf(A) * ((1 + i) ** (n // 3) - 1) / (1 - (1 + i) ** (mpf(-1) / 3))
                    assert abs(bank / v - 1) < mpf(10) ** -40, (A, R, n)
                    bank_checked += 1
# [rate, compounding, yield, the yield with three decimals — exact decimal arithmetic, half up: 7 % half-yearly is 7.1225 % → 7.123]
def yield3(R, C):
    getcontext().prec = 80
    y = ((1 + Decimal(R) / 100 / C) ** C - 1) * 100
    t = format(y.quantize(Decimal('0.001'), rounding=ROUND_HALF_UP), 'f')  # plain digits: normalize() would write 10 as 1E+1
    return t.rstrip('0').rstrip('.') if '.' in t else t
yield_cases = [[float(R), C, f17(((1 + mpf(R) / 100 / C) ** C - 1) * 100), yield3(R, C)] for R in FD_RATES + ['5', '6', '6.5', '7.5', '8', '8.5', '9', '10', '12'] for C in [1, 2, 4, 12]]


# ------------------------------------------------------------------ GST
getcontext().prec = 60
PAISA = Decimal('0.01')
hu = lambda d: d.quantize(PAISA, rounding=ROUND_HALF_UP)  # half away from zero, also for negative amounts

def gst(amount, rate, inclusive, intra):
    a, g = hu(Decimal(amount)), Decimal(rate)
    den = (100 + g) if inclusive else Decimal(100)
    c = hu(a * g / (2 * den)) if intra else Decimal(0)
    ig = Decimal(0) if intra else hu(a * g / den)
    tax = 2 * c + ig
    base = a - tax if inclusive else a
    return [int(x * 100) for x in (base, c, ig, base + tax)]  # paise: base, CGST (= SGST), IGST, total

GST_AMOUNTS = ['0', '0.01', '0.02', '0.15', '0.5', '1', '1.005', '1.15', '2.5', '10.25', '99.99', '100', '100.5', '118', '999', '1000', '1180', '1234.56',
               '1234.565', '1234.5649', '2.675', '49999.99', '123456789.01', '987654321098.76', '9999999999999.99', '10000000000000', '-1180', '-100.5', '-0.15']
GST_RATES = ['0', '0.1', '0.125', '0.25', '1.5', '3', '5', '6', '7.5', '12', '18', '28', '40', '100']
RANDOM = [f'{random.randint(1, 10 ** random.randint(2, 9))}.{random.randint(0, 99):02d}' for _ in range(150)] + [f'{random.randint(1, 99999)}.{random.randint(0, 999):03d}' for _ in range(30)]
# [amount as typed, rate, before tax + IGST, before tax + CGST/SGST, with tax + IGST, with tax + CGST/SGST]
gst_cases = [[A, R] + [gst(A, R, inc, intra) for inc in (0, 1) for intra in (0, 1)]
             for A, rates in [(A, GST_RATES) for A in GST_AMOUNTS] + [(A, random.sample(GST_RATES, 4)) for A in RANDOM] for R in rates]


# ------------------------------------------------------------------ Percentage
def pct(op, a, b):
    a, b = Fraction(a), Fraction(b)
    if op == 'of': return a * b / 100
    if op == 'share': return None if b == 0 else a * 100 / b
    if op == 'change': return None if a == 0 else (b - a) * 100 / abs(a)
    if op == 'up': return a * (100 + b) / 100
    if op == 'down': return a * (100 - b) / 100
    if op == 'whole': return None if b == 0 else a * 100 / b

NUMS = ['0', '1', '3', '7', '12.5', '15', '18', '30', '33.3333333', '60', '80', '99.9999999', '100', '150', '1999', '2400',
        '0.1', '0.2', '0.07', '0.0001', '0.000000001', '1e10', '1e15', '3e9', '123456789.123', '-5', '-25', '-50', '-0.5']
OPS = ['of', 'share', 'change', 'up', 'down', 'whole']
# [A, B, then the answer of each question in the order of OPS; null where there is none]
pct_cases = [[a, b] + [None if (v := pct(op, a, b)) is None else float(v) for op in OPS] for a in NUMS for b in NUMS]

ref = {
    'made_with': f'mpmath {__import__("mpmath").__version__} (420 / 60 digits), numpy-financial {npf.__version__}, Python {sys.version.split()[0]} decimal + fractions',
    'cross_checks': {'emi_vs_numpy_financial': npf_checked, 'sip_vs_numpy_financial_fv': fv_checked, 'rd_vs_bank_formula': bank_checked},
    'emi': emi_cases, 'emi_full': emi_full, 'sip': sip_cases, 'lump': lump_cases, 'fd': fd_cases, 'rd': rd_cases, 'yield': yield_cases,
    'gst': gst_cases, 'percent_ops': OPS, 'percent': pct_cases,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(ref, f, separators=(',', ':'), allow_nan=False)
print({k: (len(v) if isinstance(v, list) else v) for k, v in ref.items()}, os.path.getsize(OUT), 'bytes')
