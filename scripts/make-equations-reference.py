#!/usr/bin/env python3
"""Reference for the Equation Solver → tests/fixtures/equations/reference.json

Everything from the typed decimals, exactly (Python's fractions) and in mpmath at 80 digits:
  * fractions — n/d → the nearest double (Python's int / int division is correctly rounded), square roots.
  * quadratics — the kind of the answer by the exact discriminant; roots by the quadratic formula at 80 digits.
  * cubics — built from chosen roots (so the true roots are known: repeated ones, close ones, badly scaled ones, a
    complex pair) by multiplying out exactly, and random coefficients solved by mpmath's polyroots; the kind by the
    exact discriminant.
  * linear systems of 2 – 4 unknowns — Gauss–Jordan elimination on fractions: one solution (as fractions), none, or
    infinitely many (with the rank).
  * equations in x — the roots in a range, by formula or mpmath's findroot.

    pip install mpmath
    python3 scripts/make-equations-reference.py
"""
import json, os, random
from fractions import Fraction as F
from decimal import Decimal
from mpmath import mp, mpf, sqrt as msqrt, polyroots, findroot, pi, cos, exp, log, mpc

mp.dps = 80
random.seed(20261122)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'equations', 'reference.json')
def dec(fr):
    """a fraction whose denominator is a power of ten, as the decimal a person would type"""
    d = Decimal(fr.numerator) / Decimal(fr.denominator)
    assert F(str(d)) == fr, fr
    s = format(d, 'f')
    return s.rstrip('0').rstrip('.') if '.' in s else s
def fl(x):
    """the nearest double, or None where the value is beyond the range of a double"""
    try: v = float(x) if isinstance(x, F) else float(mpf(x))
    except OverflowError: return None
    return None if v in (float('inf'), float('-inf')) else v
def mpq(fr): return mpf(fr.numerator) / mpf(fr.denominator)

# ---------------------------------------------------------------- fractions → doubles
fractions = []  # [numerator, denominator, nearest double]
for _ in range(400):
    kind = random.randint(0, 3)
    n = random.randint(-10 ** random.randint(1, 60), 10 ** random.randint(1, 60)); d = random.randint(1, 10 ** random.randint(1, 60))
    if kind == 0: n, d = random.randint(1, 2 ** 53) * 2 + 1, 2 ** random.randint(1, 60) * 4  # halfway cases
    if kind == 1: d = 10 ** random.randint(0, 340)
    if kind == 2: n = n * 10 ** random.randint(0, 300)
    try: v = n / d
    except OverflowError: continue
    fractions.append([str(n), str(d), v])
roots = []  # [numerator, denominator, exact root as "n/d" or null, nearest double of the square root]
for _ in range(200):
    a = F(random.randint(0, 10 ** random.randint(1, 30)), random.randint(1, 10 ** random.randint(1, 30)))
    if random.random() < 0.4: a = a * a
    r = msqrt(mpq(a)); rn, rd = int(msqrt(a.numerator)), int(msqrt(a.denominator))
    exact = F(rn, rd) if rn * rn == a.numerator and rd * rd == a.denominator else None
    roots.append([str(a.numerator), str(a.denominator), None if exact is None else f'{exact.numerator}/{exact.denominator}', float(r)])

# ---------------------------------------------------------------- quadratics
quadratics = []  # [a, b, c (as typed), kind, [re1, im1, re2, im2], vertex x, vertex y]
def add_quad(a, b, c):
    A, B, C = F(a), F(b), F(c)
    if A == 0: return
    D = B * B - 4 * A * C; mid = -B / (2 * A); vy = C - B * B / (4 * A)
    if D == 0: kind, r = 'double', [fl(mid), 0.0, fl(mid), 0.0]
    elif D > 0:
        with mp.workdps(1500):  # the two terms of −b ± √D can agree in their first 600 digits (x² + 10¹⁶⁰x + 1)
            s = msqrt(mpq(D)); x = sorted([(-mpq(B) - s) / (2 * mpq(A)), (-mpq(B) + s) / (2 * mpq(A))])
            kind, r = 'two', [float(x[0]), 0.0, float(x[1]), 0.0]
    else:
        im = msqrt(mpq(-D)) / abs(2 * mpq(A)); kind, r = 'complex', [fl(mid), float(im), fl(mid), -float(im)]
    quadratics.append([a, b, c, kind, r, fl(mid), fl(vy)])
for q in [('1', '-3', '2'), ('1', '-2.2', '1.21'), ('1', '-0.2', '0.01'), ('100', '-60', '9'), ('1', '2', '5'), ('1', '-1e8', '1'), ('1e200', '1e200', '1e200'), ('1', '1e160', '1'), ('1e-200', '1', '1e-200'),
          ('6', '-5', '1'), ('1', '0', '-2'), ('1', '0', '0'), ('2', '0', '8'), ('-1', '0', '4'), ('0.5', '0.5', '0.125'), ('1', '-2', '1.0000000000000002'), ('1', '-2', '0.9999999999999998'), ('3', '7', '0'), ('1', '1', '1'),
          ('1', '-200000.0002', '10000000020.00000001'), ('4', '12', '9'), ('1', '-1e-160', '1e-320'), ('1e150', '3e150', '2e150'), ('0.1', '0.3', '0.2')]: add_quad(*q)
while len(quadratics) < 400:
    k = random.randint(0, 3)
    if k == 0:  # from two decimal roots (often equal): a(x - r)(x - s)
        r = F(random.randint(-9999, 9999), 10 ** random.randint(0, 3)); s = r if random.random() < 0.5 else F(random.randint(-9999, 9999), 10 ** random.randint(0, 3)); a = F(random.choice([1, 1, 2, -3, 10, 25]), random.choice([1, 1, 2, 4, 10]))
        add_quad(dec(a), dec(-a * (r + s)), dec(a * r * s))
    elif k == 1: add_quad(*(str(random.randint(-99, 99) or 1) for _ in range(3)))
    elif k == 2: add_quad(*(f'{random.uniform(-100, 100):.{random.randint(0, 6)}f}' for _ in range(3)))
    else: add_quad(*(f'{random.uniform(-9, 9):.3f}e{random.randint(-40, 40)}' for _ in range(3)))

# ---------------------------------------------------------------- cubics
cubics = []  # [a, b, c, d (as typed), kind, [re, im] × 3 — real roots ascending, then the pair with +i first]
def disc3(a, b, c, d): return 18 * a * b * c * d - 4 * b ** 3 * d + b * b * c * c - 4 * a * c ** 3 - 27 * a * a * d * d
def add_cubic(a, b, c, d, known=None):
    A, B, C, D = F(a), F(b), F(c), F(d)
    if A == 0: return
    dd = disc3(A, B, C, D)
    if known is not None: rs = [mpc(x) if isinstance(x, (complex, mpc)) else mpq(x) if isinstance(x, F) else mpf(x) for x in known]
    else: rs = polyroots([mpq(A), mpq(B), mpq(C), mpq(D)], maxsteps=2000, extraprec=2000)
    reals = sorted(mpf(x.real) for x in rs if abs(mpc(x).imag) < mpf(10) ** -30 * (1 + abs(x)))
    cplx = [mpc(x) for x in rs if abs(mpc(x).imag) >= mpf(10) ** -30 * (1 + abs(x))]
    if dd == 0:
        p = B * B - 3 * A * C; kind = 'triple' if p == 0 else 'double'
        assert len(cplx) == 0 or known is None
        if known is None:  # repeated roots by formula
            if p == 0: reals = [mpq(-B / (3 * A))] * 3
            else: tw, on = (9 * A * D - B * C) / (2 * p), (4 * A * B * C - 9 * A * A * D - B ** 3) / (A * p); reals = sorted([mpq(tw), mpq(tw), mpq(on)])
            cplx = []
    else: kind = 'three' if dd > 0 else 'complex'
    assert (len(reals), len(cplx)) == ((3, 0) if kind != 'complex' else (1, 2)), (a, b, c, d, kind, rs)
    cplx.sort(key=lambda z: -z.imag)
    cubics.append([a, b, c, d, kind, [[float(x), 0.0] for x in reals] + [[float(z.real), float(z.imag)] for z in cplx]])
def from_roots(a, r1, r2, r3):
    a, r1, r2, r3 = F(a), F(r1), F(r2), F(r3)
    add_cubic(dec(a), dec(-a * (r1 + r2 + r3)), dec(a * (r1 * r2 + r1 * r3 + r2 * r3)), dec(-a * r1 * r2 * r3), known=[r1, r2, r3])
def from_pair(a, r, p, q):  # a (x - r)(x^2 + p x + q), p^2 < 4q
    a, r, p, q = F(a), F(r), F(p), F(q); im = msqrt(mpq(4 * q - p * p)) / 2
    add_cubic(dec(a), dec(a * (p - r)), dec(a * (q - p * r)), dec(-a * q * r), known=[r, mpc(mpq(-p / 2), im), mpc(mpq(-p / 2), -im)])
for args in [('1', '1', '2', '3'), ('1', '1.1', '1.1', '1.1'), ('1', '0.1', '0.1', '0.2'), ('1', '1', '1', '1000000'), ('1', '0.1', '0.1', '0.1'), ('2', '-0.5', '-0.5', '3'), ('1', '0', '0', '0'), ('1', '1', '1.000001', '2'),
             ('1', '1e-8', '1', '1e8'), ('-4', '0.25', '0.25', '-7.5'), ('1', '1000000', '1000000', '0.000001'), ('1', '3.14159', '3.14159', '3.14159'), ('10', '-2', '0', '2'), ('1', '1', '1.0000000001', '1.0000000002')]: from_roots(*args)
for args in [('1', '1', '0', '1'), ('1', '-100000000', '0', '0.00000001'), ('1', '2', '-2', '5'), ('3', '0.5', '0.2', '0.02'), ('1', '0', '0', '1e-10'), ('1', '1000', '1', '1')]: from_pair(*args)
for c in [('1', '-6', '11', '-6'), ('1', '0', '0', '-1'), ('1', '1e8', '1', '1'), ('1', '0', '-1e12', '1'), ('1e100', '-6e100', '11e100', '-6e100'), ('1', '0', '0', '8'), ('2', '0', '-3', '1'), ('1', '0', '-3', '2'), ('1', '3', '3', '1'), ('1', '0', '1', '0'),
          ('1', '-3.3', '3.63', '-1.331'), ('1', '-0.3', '0.03', '-0.001'), ('1', '-1000002', '2000001', '-1000000'), ('0.001', '0', '0', '-1000'), ('1', '0', '-7', '6')]: add_cubic(*c)
while len(cubics) < 300:
    k = random.randint(0, 4)
    rr = lambda: F(random.randint(-999, 999), 10 ** random.randint(0, 2))
    if k == 0: r = rr(); from_roots(random.choice(['1', '2', '-0.5']), r, r if random.random() < 0.7 else rr(), r if random.random() < 0.4 else rr())
    elif k == 1: from_roots('1', rr(), rr(), rr())
    elif k == 2: p = rr(); from_pair(random.choice(['1', '-2', '0.25']), rr(), p, p * p / 4 + F(random.randint(1, 9999), 100))
    elif k == 3: add_cubic(*(str(random.randint(-20, 20) or 1) for _ in range(4)))
    else: add_cubic(*(f'{random.uniform(-50, 50):.{random.randint(0, 4)}f}' for _ in range(4)))

# ---------------------------------------------------------------- linear systems
linears = []  # [rows of typed cells (n coefficients + the right-hand side), kind, solution doubles, solution fractions or the rank]
def solve(rows):
    n = len(rows); M = [[F(x) for x in row] for row in rows]; rank = 0
    for col in range(n):
        piv = next((r for r in range(rank, n) if M[r][col] != 0), None)
        if piv is None: continue
        M[rank], M[piv] = M[piv], M[rank]; M[rank] = [v / M[rank][col] for v in M[rank]]
        for r in range(n):
            if r != rank and M[r][col] != 0: M[r] = [v - M[r][col] * w for v, w in zip(M[r], M[rank])]
        rank += 1
    if any(all(v == 0 for v in row[:n]) and row[n] != 0 for row in M): return 'none', None, None
    if rank < n: return 'many', None, rank
    return 'one', [float(row[n]) for row in M], [f'{row[n].numerator}/{row[n].denominator}' if row[n].denominator != 1 else str(row[n].numerator) for row in M]
def add_lin(rows):
    kind, xs, extra = solve(rows); linears.append([rows, kind, xs, extra])
for rows in [[['2', '3', '8'], ['1', '-1', '-1']], [['1', '1', '1', '6'], ['0', '2', '5', '-4'], ['2', '5', '-1', '27']], [['0.1', '0.2', '0.3'], ['0.3', '0.6', '0.9']], [['0.1', '0.2', '0.3'], ['0.3', '0.6', '1']],
             [['1e-20', '2e-20', '5e-20'], ['3e-20', '4e-20', '6e-20']], [['1', '1', '2'], ['1', '1.0000000000001', '2.0000000000001']], [['0', '1', '2'], ['1', '0', '3']], [['0', '0', '0'], ['0', '0', '0']], [['0', '0', '1'], ['0', '0', '0']],
             [['1', '0.5', '0.333', '0.25', '1'], ['0.5', '0.333', '0.25', '0.2', '1'], ['0.333', '0.25', '0.2', '0.167', '1'], ['0.25', '0.2', '0.167', '0.143', '1']], [['0.1', '0.2', '0.3', '1'], ['0.4', '0.5', '0.6', '2'], ['0.7', '0.8', '0.9', '3']],
             [['0.1', '0.2', '0.3', '1'], ['0.4', '0.5', '0.6', '2'], ['0.7', '0.8', '0.9', '4']], [['3', '0', '7'], ['0', '0', '0']], [['1e200', '1', '1e200'], ['1', '1', '2']], [['2', '4', '-6'], ['1', '2', '-3']]]: add_lin(rows)
while len(linears) < 300:
    n = random.randint(2, 4); num = lambda: random.choice([str(random.randint(-9, 9)), f'{random.uniform(-20, 20):.{random.randint(1, 3)}f}', f'{random.randint(-99, 99)}e{random.randint(-3, 3)}'])
    rows = [[num() for _ in range(n + 1)] for _ in range(n)]
    if random.random() < 0.3:  # make one row a combination of two others: dependent, and with luck contradictory
        i, j, k = random.sample(range(n), 3) if n >= 3 else (0, 1, 1)
        f1, f2 = F(random.randint(-3, 3)), F(random.randint(-3, 3)) if n >= 3 else F(0)
        combo = [f1 * F(a) + (f2 * F(b) if n >= 3 else 0) for a, b in zip(rows[j], rows[k])]
        if random.random() < 0.5: combo[n] += random.choice([0, 1])
        try: rows[i] = [dec(v) for v in combo]
        except AssertionError: continue
    add_lin(rows)

# ---------------------------------------------------------------- equations in x
equations = [  # [equation, from, to, roots ascending]
    ['x^3 - 2x = 1', -100, 100, [-1.0, float((1 - msqrt(5)) / 2), float((1 + msqrt(5)) / 2)]], ['x^2 = 2', -100, 100, [-float(msqrt(2)), float(msqrt(2))]], ['cos(x) = x', -100, 100, [float(findroot(lambda x: cos(x) - x, 0.7))]],
    ['x^x = 2', 0.1, 100, [float(findroot(lambda x: x ** x - 2, 1.5))]], ['sqrt(x) = 2', -100, 100, [4.0]], ['ln(x) = 0', -100, 100, [1.0]], ['(x-1)^2 = 0', -100, 100, [1.0]], ['abs(x) = 3', -100, 100, [-3.0, 3.0]], ['2x + 1 = 7', -100, 100, [3.0]],
    ['x^2 + 1 = 0', -100, 100, []], ['1/x = 0', -100, 100, []], ['floor(x) = 0.5', -100, 100, []], ['exp(x) = 0', -100, 100, []], ['tan(x) = 1', -3, 3, [float(pi / 4 - pi), float(pi / 4)]], ['sin(x) = 0.5', 0, 7, [float(pi / 6), float(5 * pi / 6), float(13 * pi / 6)]],
    ['exp(x) = 5', -100, 100, [float(log(5))]], ['x = 5', 5, 10, [5.0]], ['x = 5', 0, 5, [5.0]], ['x^5 - x - 1', -100, 100, [float(findroot(lambda x: x ** 5 - x - 1, 1.2))]], ['1/(x-1) = 2', -100, 100, [1.5]],
]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'fractions': fractions, 'roots': roots, 'quadratics': quadratics, 'cubics': cubics, 'linears': linears, 'equations': equations}, f, separators=(',', ':'), allow_nan=False)
from collections import Counter
print(len(fractions), 'fractions;', len(roots), 'square roots;', len(quadratics), 'quadratics', dict(Counter(q[3] for q in quadratics)), ';', len(cubics), 'cubics', dict(Counter(c[4] for c in cubics)), ';', len(linears), 'systems', dict(Counter(l[1] for l in linears)), ';', len(equations), 'equations;', os.path.getsize(OUT), 'bytes')
