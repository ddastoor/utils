#!/usr/bin/env python3
"""Reference for the Fraction Calculator → tests/fixtures/fraction/reference.json

  * expressions — random expressions in the tab's own writing (fractions, mixed numbers, decimals, powers of ten,
    + − × ÷, whole powers, brackets) built here as trees and worked out with Python's fractions; an expression whose
    numbers pass 38 digits on the way is marked "big" (the tab keeps 128-bit whole numbers), a division by zero "zero".
  * decimals — n/d written out exactly: all digits where the decimal ends, the repeating part in brackets where it
    does not (found by long division, remembering the remainders), "…" after 20 – 40 digits when the period is longer
    than 30.

    python3 scripts/make-fraction-reference.py
"""
import json, os, random
from fractions import Fraction as F

random.seed(20261125)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'fraction', 'reference.json')
LIMIT = 2 ** 127 - 1
class Big(Exception): pass
class Zero(Exception): pass
def chk(x):
    if abs(x.numerator) > LIMIT or x.denominator > LIMIT: raise Big()
    return x

def leaf():
    k = random.randint(0, 9)
    if k < 3: n, d = random.randint(0, 30), random.randint(1, 30); return f'{n}/{d}', F(n, d), 'frac'
    if k < 5: w, n, d = random.randint(1, 9), random.randint(1, 9), random.randint(2, 12); return f'{w} {n}/{d}', F(w) + F(n, d), 'mixed'
    if k < 7: n = random.randint(0, 99); return str(n), F(n), 'int'
    if k < 9: t = f'{random.uniform(0, 20):.{random.randint(1, 3)}f}'; return t, F(t), 'dec'
    m, e = random.randint(1, 99), random.randint(-3, 3); return f'{m}e{e}', F(m) * F(10) ** e, 'dec'
def tree(depth):
    """returns (text, value, kind) — kind tells whether the text needs brackets as an operand"""
    if depth == 0 or random.random() < 0.25: return leaf()
    op = random.choice(['+', '-', '×', '÷', '^', 'neg', '()'])
    if op == '()': t, v, _ = tree(depth - 1); return f'({t})', v, 'atom'
    if op == 'neg': t, v, k = tree(depth - 1); return (f'-({t})' if k not in ('int', 'dec', 'atom') else f'-{t}'), chk(-v), 'neg'
    if op == '^':
        t, v, k = tree(depth - 1); e = random.choice([0, 1, 2, 3, -1, -2, 5])
        base = t if k in ('int', 'dec', 'atom') else f'({t})'
        if v == 0 and e < 0: raise Zero()
        r = F(1)
        for _ in range(abs(e)): r = chk(r * (v if e >= 0 else 1 / v))
        return f'{base}^{e}', r, 'pow'
    lt, lv, lk = tree(depth - 1); rt, rv, rk = tree(depth - 1)
    if op in '×÷':
        if lk in ('sum', 'neg'): lt = f'({lt})'
        if rk in ('sum', 'neg', 'prod', 'mixed'): rt = f'({rt})'
        if lk == 'mixed': lt = f'({lt})'
        if op == '÷' and rv == 0: raise Zero()
        # the products the engine forms on the way: cross-reduced, so the reduced result decides
        return f'{lt} {op} {rt}', chk(lv * rv if op == '×' else lv / rv), 'prod'
    if rk in ('sum', 'neg'): rt = f'({rt})'
    den = lv.denominator * rv.denominator
    if abs(lv.numerator * rv.denominator) > LIMIT or abs(rv.numerator * lv.denominator) > LIMIT or den > LIMIT: raise Big()
    return f'{lt} {op} {rt}', chk(lv + rv if op == '+' else lv - rv), 'sum'
expressions = []  # [text, numerator, denominator] or [text, 'big' | 'zero']
fr = lambda v: [str(v.numerator), str(v.denominator)]
for text, v in [('3/4 + 5/6 × 2 1/2', F(17, 6)), ('6/8', F(3, 4)), ('-2 1/2', F(-5, 2)), ('1/3 ÷ 2/3', F(1, 2)), ('0.1 + 0.2', F(3, 10)), ('2/3^2', F(2, 9)), ('(2/3)^2', F(4, 9)), ('2^-1', F(1, 2)), ('1/2/3', F(1, 6)), ('22/7 - 3.14', F(1, 350)),
                ('7/3 - 2 1/3', F(0)), ('2 1/2 ^ 2', F(25, 4)), ('-1/2 ^ 2', F(-1, 4)), ('(1/2)^100', F(1, 2 ** 100)), ('2^64', F(2 ** 64)), ('9223372036854775807 + 1', F(2 ** 63)), ('1e3', F(1000)), ('1.5e-3', F(3, 2000)), ('0^0', F(1)), ('2^126', F(2 ** 126)),
                ('1/3 + 1/7 + 1/11 + 1/13 + 1/17 + 1/19 + 1/23 + 1/29 + 1/31 + 1/37 + 1/41 + 1/43 + 1/47 + 1/53', sum(F(1, p) for p in [3, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53]))]: expressions.append([text] + fr(v))
for text, kind in [('1/0', 'zero'), ('0^-1', 'zero'), ('5 ÷ (1/2 - 0.5)', 'zero'), ('2^1000', 'big'), ('2^127', 'big'), ('170141183460469231731687303715884105727 + 1', 'big'), ('(1/3)^81', 'big')]: expressions.append([text, kind])
counts = {'ok': 0, 'big': 0, 'zero': 0}
while len(expressions) < 700:
    try: t, v, _ = tree(random.randint(1, 4)); expressions.append([t] + fr(v)); counts['ok'] += 1
    except Big: counts['big'] += 1   # how the engine forms its intermediate numbers is its own business: left out
    except Zero: counts['zero'] += 1
    except ZeroDivisionError: counts['zero'] += 1

def decimal(n, d, max_period=30):
    neg = (n < 0) != (d < 0) and n != 0; n, d = abs(n), abs(d); whole, rem = divmod(n, d)
    if rem == 0: return ('−' if neg else '') + str(whole)
    rest, twos, fives = d, 0, 0
    while rest % 2 == 0: rest //= 2; twos += 1
    while rest % 5 == 0: rest //= 5; fives += 1
    lead = max(twos, fives); out = []; seen = {}
    head = ('−' if neg else '') + str(whole) + '.'
    while rem and rem not in seen and len(out) < lead + max_period + 2:
        seen[rem] = len(out); rem *= 10; out.append(str(rem // d)); rem %= d
    if lead > 60: return head + ''.join(out[:40]) + '…' if len(out) >= 40 else None
    if rem == 0: return head + ''.join(out)
    if rem in seen and len(out) - seen[rem] <= max_period: s = seen[rem]; return head + ''.join(out[:s]) + '(' + ''.join(out[s:]) + ')'
    digits = []; rem = n % d
    for _ in range(lead + max(20, 40 - lead)): rem *= 10; digits.append(str(rem // d)); rem %= d
    return head + ''.join(digits) + '…'
decimals = []  # [numerator, denominator, text]
for n, d in [(1, 3), (1, 6), (1, 7), (3, 8), (17, 6), (1, 350), (-5, 2), (1, 97), (1, 81), (22, 7), (1, 2 ** 20), (1, 3 * 2 ** 10), (5, 1), (0, 9), (-1, 3), (1, 999999), (1, 17), (1, 19), (1, 23), (1, 29), (1, 31), (1, 49), (10 ** 20, 3), (1, 1024), (7, 12), (1, 28)]: decimals.append([str(n), str(d), decimal(n, d)])
while len(decimals) < 400:
    n, d = random.randint(-500, 5000), random.choice([random.randint(1, 200), random.randint(1, 10 ** 6), 2 ** random.randint(1, 30) * 5 ** random.randint(0, 12), random.choice([3, 7, 9, 11, 13, 37, 41, 101, 271]) * 2 ** random.randint(0, 6)])
    t = decimal(n, d)
    if t is not None: decimals.append([str(n), str(d), t])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f: json.dump({'expressions': expressions, 'decimals': decimals}, f, separators=(',', ':'), allow_nan=False, ensure_ascii=False)
print(len(expressions), 'expressions (generated:', counts, ');', len(decimals), 'decimals;', os.path.getsize(OUT), 'bytes')
