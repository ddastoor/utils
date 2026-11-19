#!/usr/bin/env python3
"""Reference answers for the Scientific Calculator's expression engine (wasm/mathcore, m_expr_*).

Written by mpmath at 50 digits (pip install mpmath) and Python's exact integers — nothing here comes from the engine:
  functions   every function of the calculator over a grid of arguments, in degrees and in radians
  trees       1,500 random expressions, written once the way the calculator reads them (as few brackets as its
              grammar needs: -a^b, a^-b, a^b^c, a-b-c, a/b/c …) and once for Python with every bracket
  written     precedence, percent, side-by-side multiplication, postfix signs: the Python form is written by hand
Each case: [what is typed, "deg" | "rad", the value as a 17-digit decimal — or "nan" (no real result: a division by
zero, a root or logarithm of a negative number, a pole), "inf" / "-inf" (beyond the largest number)].

    python3 scripts/make-calc-reference.py        → tests/fixtures/calc/reference.json
"""
import json, math, random
from fractions import Fraction
from pathlib import Path
from mpmath import mp, mpf

mp.dps = 50
OUT = Path(__file__).resolve().parent.parent / 'tests/fixtures/calc/reference.json'

def val(f):
    try:
        v = f()
    except (ZeroDivisionError, ValueError, OverflowError):
        return 'nan'
    if isinstance(v, complex) or (hasattr(v, 'imag') and v.imag != 0):
        return 'nan'
    v = mpf(v.real if hasattr(v, 'real') else v)
    if mp.isnan(v): return 'nan'
    if mp.isinf(v) or abs(v) > mpf('1.7976931348623157e308'): return 'inf' if v > 0 else '-inf'
    return mp.nstr(v, 17, strip_zeros=False, min_fixed=-400, max_fixed=400) if v != 0 else '0'

def num(x):   # how a number is typed: 0.1, 12, 2.5e3
    return repr(x) if isinstance(x, float) else str(x)
def M(x):     # the exact value of what was typed
    return mpf(Fraction(str(x)).numerator) / mpf(Fraction(str(x)).denominator) if isinstance(x, float) else mpf(x)

cases = {'functions': [], 'trees': [], 'written': []}
add = lambda kind, expr, mode, f: cases[kind].append([expr, mode, val(f)])

# ---- functions -----------------------------------------------------------------------------------------------------
DEG = [0, 1, 15, 30, 45, 60, 89.9, 90, 120, 135, 150, 180, 210, 225, 270, 300, 359, 360, 405, 720, 1234.5, -30, -90, -450, 0.001, 1e-9, 36000090]
rad_of = lambda a: M(a) * mp.pi / 180
pole = lambda v: 'nan' if v in ('inf', '-inf') else v      # an exact pole is "not defined" for the calculator
for a in DEG:
    s, c = lambda a=a: mp.sin(rad_of(a)), lambda a=a: mp.cos(rad_of(a))
    exact0 = lambda f: (lambda: mpf(0) if abs(f()) < mpf(10) ** -40 else f())
    add('functions', f'sin({num(a)})', 'deg', exact0(s)); add('functions', f'cos({num(a)})', 'deg', exact0(c))
    for name, f in [('tan', lambda: exact0(s)() / exact0(c)()), ('sec', lambda: 1 / exact0(c)()), ('csc', lambda: 1 / exact0(s)()), ('cot', lambda: exact0(c)() / exact0(s)())]:
        cases['functions'].append([f'{name}({num(a)})', 'deg', pole(val(f))])
RAD = [0, 0.5, 1, 1.5, 2, 3, 3.14, 4, 6.28, 10, 100, -1, -2.5, 1e-9, 1e-20, 12345.678]
for x in RAD:
    for name, f in [('sin', mp.sin), ('cos', mp.cos), ('tan', mp.tan), ('sec', mp.sec), ('csc', mp.csc), ('cot', mp.cot)]:
        add('functions', f'{name}({num(x)})', 'rad', lambda f=f, x=x: f(M(x)))
# round angles in radians, written with π: exactly what they are in mathematics
for k, expr in [(mpf(1), 'pi'), (mpf(2), '2pi'), (mpf(100), '100pi'), (mpf(1) / 2, 'pi/2'), (mpf(3) / 2, '3pi/2'), (mpf(1) / 6, 'pi/6'), (mpf(1) / 4, 'pi/4'), (mpf(1) / 3, 'pi/3'), (mpf(-1), '-pi'), (mpf(7) / 2, '7pi/2')]:
    x = k * mp.pi
    z = lambda f: (lambda: mpf(0) if abs(f()) < mpf(10) ** -40 else f())
    add('functions', f'sin({expr})', 'rad', z(lambda x=x: mp.sin(x))); add('functions', f'cos({expr})', 'rad', z(lambda x=x: mp.cos(x)))
    cases['functions'].append([f'tan({expr})', 'rad', pole(val(lambda x=x: z(lambda: mp.sin(x))() / z(lambda: mp.cos(x))()))])
UNIT = [-2, -1, -0.5, -1e-9, 0, 1e-9, 0.25, 0.5, 0.7071, 1, 2]
for x in UNIT:
    for name, f in [('asin', mp.asin), ('acos', mp.acos), ('atan', mp.atan)]:
        add('functions', f'{name}({num(x)})', 'deg', lambda f=f, x=x: mp.degrees(f(M(x)))); add('functions', f'{name}({num(x)})', 'rad', lambda f=f, x=x: f(M(x)))
    add('functions', f'atanh({num(x)})', 'rad', lambda x=x: mp.atanh(M(x)) if abs(x) != 1 else mp.sqrt(-1))
REAL = [-1000, -10, -2.5, -1, -0.5, 0, 1e-12, 0.1, 0.5, 1, 1.5, 2, 2.718281828, 3, 10, 12.5, 100, 1000, 1e6, 1e10, 123456.789]
for x in REAL:
    for name, f in [('sinh', mp.sinh), ('cosh', mp.cosh), ('tanh', mp.tanh), ('asinh', mp.asinh), ('acosh', mp.acosh), ('exp', mp.exp), ('sqrt', mp.sqrt), ('cbrt', lambda v: mp.cbrt(v) if v >= 0 else -mp.cbrt(-v)),
                    ('abs', abs), ('floor', mp.floor), ('ceil', mp.ceil), ('trunc', lambda v: mp.floor(v) if v >= 0 else mp.ceil(v)), ('sign', mp.sign), ('round', lambda v: mp.floor(v + mpf(1) / 2) if v >= 0 else -mp.floor(-v + mpf(1) / 2))]:
        add('functions', f'{name}({num(x)})', 'rad', lambda f=f, x=x: f(M(x)))
    for name, f in [('ln', mp.log), ('log', mp.log10), ('log10', mp.log10), ('log2', lambda v: mp.log(v, 2))]:
        add('functions', f'{name}({num(x)})', 'rad', lambda f=f, x=x: f(M(x)) if x > 0 else mp.sqrt(-1))      # no logarithm of 0 or of a negative number
for x in [0, 1, 2, 3, 5, 10, 12, 20, 21, 25, 50, 100, 170, 171, 0.5, 1.5, 2.5, 4.2, -0.5, -1.5, -2.5, -1, -3]:
    add('functions', f'{num(x)}!' if x >= 0 else f'({num(x)})!', 'rad', lambda x=x: mp.factorial(M(x)) if not (x < 0 and x == int(x)) else mp.sqrt(-1))
    add('functions', f'fact({num(x)})', 'rad', lambda x=x: mp.factorial(M(x)) if not (x < 0 and x == int(x)) else mp.sqrt(-1))
    add('functions', f'gamma({num(x)})', 'rad', lambda x=x: mp.gamma(M(x)) if not (x <= 0 and x == int(x)) else mp.sqrt(-1))
for n in [0, 1, 2, 5, 10, 20, 30, 52, 60, 100, 170, 171, 200, 1000, 100000]:
    for k in [0, 1, 2, 3, 5, 10, 26, 50, 100]:
        add('functions', f'nCr({n},{k})', 'rad', lambda n=n, k=k: mpf(math.comb(n, k))); add('functions', f'nPr({n},{k})', 'rad', lambda n=n, k=k: mpf(math.perm(n, k)))
for a, b in [(8, 3), (-8, 3), (-8, -3), (27, 3), (16, 4), (-16, 4), (2, 2), (32, 5), (-32, 5), (10, 2.5), (5, 1), (5, -1), (0, 3), (8, 0), (1e12, 6)]:
    def rt(a=a, b=b):
        if b == 0: return mp.sqrt(-1)
        if a < 0: return -mp.root(-M(a), abs(int(b))) ** (1 if b > 0 else -1) if b == int(b) and int(b) % 2 else mp.sqrt(-1)
        return M(a) ** (1 / M(b))
    add('functions', f'root({num(a)},{num(b)})', 'rad', rt)
for a, b in [(8, 2), (125, 5), (1024, 2), (1000, 10), (81, 3), (2, 8), (10, 3), (0.5, 2), (7, 7), (1e12, 10), (243, 3), (4.5, 1.5)]:
    add('functions', f'log({num(a)},{num(b)})', 'rad', lambda a=a, b=b: mp.log(M(a), M(b)))
for a, b in [(7, 3), (-7, 3), (7, -3), (-7, -3), (7.5, 2), (10, 5), (0, 5), (5, 0), (1e15, 7), (0.3, 0.1)]:
    add('functions', f'mod({num(a)},{num(b)})', 'rad', lambda a=a, b=b: M(a) - M(b) * mp.floor(M(a) / M(b)))
    add('functions', f'min({num(a)},{num(b)})', 'rad', lambda a=a, b=b: min(M(a), M(b))); add('functions', f'max({num(a)},{num(b)})', 'rad', lambda a=a, b=b: max(M(a), M(b)))
    add('functions', f'hypot({num(a)},{num(b)})', 'rad', lambda a=a, b=b: mp.hypot(M(a), M(b)))
    add('functions', f'atan2({num(a)},{num(b)})', 'deg', lambda a=a, b=b: mp.degrees(mp.atan2(M(a), M(b))))
for a, b in [(12, 18), (17, 5), (0, 9), (9, 0), (0, 0), (100, 75), (123456789, 987654321), (-12, 18), (2 ** 40, 2 ** 20), (1000000007, 998244353)]:
    add('functions', f'gcd({a},{b})', 'rad', lambda a=a, b=b: mpf(math.gcd(a, b))); add('functions', f'lcm({a},{b})', 'rad', lambda a=a, b=b: mpf(abs(a * b) // math.gcd(a, b) if a and b else 0))
for x, n in [(2.675, 2), (2.665, 2), (1.005, 2), (0.125, 2), (-2.5, 0), (2.5, 0), (1234.5678, -2), (1234.5678, 2), (0.000123456, 6), (99.995, 2), (1e10 + 0.5, 0)]:
    def rnd(x=x, n=n):    # the decimal that was typed, rounded half away from zero
        q = Fraction(str(x)) * Fraction(10) ** n; fl = math.floor(abs(q) + Fraction(1, 2)); r = Fraction(fl if q >= 0 else -fl) / Fraction(10) ** n
        return mpf(r.numerator) / mpf(r.denominator)
    add('functions', f'round({num(x)},{n})', 'rad', rnd)

# ---- powers --------------------------------------------------------------------------------------------------------
for a in [0, 0.5, 1, 2, 2.5, 10, -1, -2, -8, -0.125, -32, -27]:
    for b, bs in [(2, '2'), (3, '3'), (-1, '-1'), (-2, '-2'), (0, '0'), (0.5, '0.5'), (Fraction(1, 3), '(1/3)'), (Fraction(2, 3), '(2/3)'), (Fraction(1, 5), '0.2'), (Fraction(3, 5), '0.6'), (Fraction(-1, 3), '(-1/3)'), (1.5, '1.5'), (10, '10'), (Fraction(1, 4), '0.25'), (Fraction(5, 7), '(5/7)')]:
        def pw(a=a, b=b):
            A, B = M(a), (mpf(b.numerator) / mpf(b.denominator) if isinstance(b, Fraction) else M(b))
            if A == 0 and B < 0: return mp.sqrt(-1)       # a division by zero
            if A < 0:
                q = Fraction(str(b)) if not isinstance(b, Fraction) else b
                if q.denominator == 1: return (-1) ** (int(q) % 2) * (-A) ** B
                if q.denominator % 2 == 1: return (-1 if q.numerator % 2 else 1) * (-A) ** B      # a real root exists
                return mp.sqrt(-1)
            return A ** B
        left = f'({num(a)})' if a < 0 else num(a)
        add('functions', f'{left}^{bs}', 'rad', pw)

# ---- random trees --------------------------------------------------------------------------------------------------
rng = random.Random(20261119)
NUMS = [0, 1, 2, 3, 4, 5, 7, 10, 12, 100, 0.1, 0.25, 0.5, 1.5, 2.5, 12.75, 1e3, 2e-2]
def tree(d):
    if d == 0 or rng.random() < 0.15: return ('n', rng.choice(NUMS))
    k = rng.random()
    if k < 0.62: return (rng.choice('+-*/'), tree(d - 1), tree(d - 1))
    if k < 0.74: return ('^', tree(d - 1), ('n', rng.choice([0, 1, 2, 3, -1, -2, 0.5])))
    if k < 0.88: return ('neg', tree(d - 1))
    if k < 0.94: return ('!', ('n', rng.choice([0, 1, 3, 4, 5, 6])))
    return (rng.choice(['sqrt', 'abs', 'floor', 'exp']), tree(d - 1))
# the calculator's grammar: sum < product < sign < power (right to left; its exponent may carry a sign) < postfix
def ours(t, need=0, right=False):
    k = t[0]
    if k == 'n':
        s = num(t[1]) if t[1] >= 0 else f'-{num(-t[1])}'
        return f'({s})' if t[1] < 0 and need >= 3 else s
    if k in '+-': s = f'{ours(t[1], 1)}{k}{ours(t[2], 2)}'; return f'({s})' if need > 1 else s
    if k in '*/': s = f'{ours(t[1], 2)}{"×" if k == "*" else "÷"}{ours(t[2], 3)}'; return f'({s})' if need > 2 else s
    if k == 'neg': s = f'-{ours(t[1], 3)}'; return f'({s})' if need > 3 else s
    if k == '^': s = f'{ours(t[1], 5)}^{ours(t[2], 3)}'; return f'({s})' if need > 4 else s
    if k == '!': return f'{ours(t[1], 5)}!'
    return f'{k}({ours(t[1])})'
def py(t):
    k = t[0]
    if k == 'n': return M(t[1])
    if k == '+': return py(t[1]) + py(t[2])
    if k == '-': return py(t[1]) - py(t[2])
    if k == '*': return py(t[1]) * py(t[2])
    if k == '/': return py(t[1]) / py(t[2])
    if k == 'neg': return -py(t[1])
    if k == '!': return mp.factorial(py(t[1]))
    if k == '^':
        a, b = py(t[1]), py(t[2])
        if a == 0 and b < 0: raise ZeroDivisionError
        if a < 0 and b != int(b): raise ValueError          # the exponents here are halves: no real root of a negative
        return a ** b
    if k == 'sqrt':
        v = py(t[1])
        if v < 0: raise ValueError
        return mp.sqrt(v)
    if k == 'exp':
        v = py(t[1])
        if v > 700: raise OverflowError
        return mp.exp(v)
    return {'abs': abs, 'floor': mp.floor}[k](py(t[1]))
seen = set()
while len(cases['trees']) < 1500:
    t = tree(rng.choice([2, 3, 3, 4, 5]))
    e = ours(t)
    if e in seen or len(e) > 90: continue
    seen.add(e)
    try:
        v = py(t)
        if abs(v) > mpf(10) ** 200 or (v != 0 and abs(v) < mpf(10) ** -200): continue
        r = val(lambda: v)
    except (ZeroDivisionError, ValueError):
        r = 'nan'                # a division by zero somewhere, or no real value: the calculator refuses
    except OverflowError:
        r = 'undefined'          # beyond the largest number: ∞, or refused
    cases['trees'].append([e, 'rad', r])

# ---- written by hand: what is typed, and the same in Python --------------------------------------------------------
E, PI = mp.e, mp.pi
W = [
    ('1+2×3', 7), ('(1+2)×3', 9), ('2×3+4×5', 26), ('10−4−3', 3), ('100÷10÷5', 2), ('2^3^2', 512), ('(2^3)^2', 64), ('-2^2', -4), ('(-2)^2', 4), ('2^-2', mpf(1) / 4), ('-2^-2', -mpf(1) / 4),
    ('2^3!', 64), ('3!^2', 36), ('3!!', 720), ('-3!', -6), ('2×-3', -6), ('2--3', 5), ('2+-3', -1), ('--3', 3), ('-+-3', 3), ('2^-3^2', mpf(2) ** -9), ('1e3', 1000), ('1E3', 1000), ('1e-3', mpf(1) / 1000), ('2e+3', 2000), ('1.5e2+1', 151), ('.5+.5', 1), ('5.', 5),
    # written side by side = multiplied
    ('2π', 2 * PI), ('2(3+4)', 14), ('(1+2)(3+4)', 21), ('2 sin(30)', 1), ('3sqrt(16)', 12), ('2√9', 6), ('√9+16', 19), ('√(9+16)', 5), ('√9!', mp.sqrt(362880)), ('2e', 2 * E), ('πe', PI * E), ('2ans', 14), ('ans^2', 49), ('(2)3', 6), ('2pi^2', 2 * PI ** 2),
    ('1/2π', PI / 2), ('6÷2(1+2)', 9), ('sin 30', mpf(1) / 2), ('sin 30 + 1', mpf(3) / 2), ('cos 60 × 2', 1), ('sin30', mpf(1) / 2), ('2sin30cos60', mpf(1) / 2), ('ln e', 1), ('ln e^2', 2), ('sqrt 16 + 9', 13), ('√√16', 2),
    # percent
    ('50%', mpf(1) / 2), ('200+10%', 220), ('200−10%', 180), ('200×10%', 20), ('200÷10%', 2000), ('10%+200', mpf('200.1')), ('200+10%+5%', 231), ('200−10%−5%', 171), ('100+5%×2', mpf('100.1')), ('(200+10%)×2', 440), ('2×(100−25%)', 150), ('10%×10%', mpf(1) / 100),
    ('10%+10%', mpf('0.11')), ('50%×30', 15), ('200+(10%)', mpf('200.1')), ('5!%', mpf('1.2')), ('150%', mpf('1.5')), ('100+12.5%', mpf('112.5')), ('-200+10%', -220), ('200+-10%', 180),
    # names in any case, signs in any spelling
    ('Sin(30)', mpf(1) / 2), ('SIN(30)+COS(60)', 1), ('PI', PI), ('Pi×2', 2 * PI), ('E', E), ('Ans+1', 8), ('ANS×2', 14), ('Sqrt(16)', 4), ('LOG(1000)', 3), ('Ln(E)', 1), ('ncr(5,2)', 10), ('NPR(5,2)', 20), ('nCr(5,2)', 10), ('Tau', 2 * PI), ('phi', (1 + mp.sqrt(5)) / 2),
    ('3×4', 12), ('3*4', 12), ('3·4', 12), ('12÷4', 3), ('12/4', 3), ('7−2', 5), ('7-2', 5), ('2**10', 1024), ('5²', 25), ('2³', 8), ('5²+2³', 33), ('∛27', 3), ('2∛8', 4), ('√2²', 2), ('π', PI), ('∞', mpf('inf')), ('−∞', mpf('-inf')), ('1÷∞', 0), ('5÷(1÷∞)', mp.sqrt(-1)),
    # whole numbers that need all their digits
    ('2^40', 2 ** 40), ('2^53−1', 2 ** 53 - 1), ('1234567×1234567', 1234567 ** 2), ('123456789012345+0', 123456789012345), ('99999999×99999999', 99999999 ** 2), ('20!', math.factorial(20)), ('18!', math.factorial(18)), ('3^33', 3 ** 33), ('7^18', 7 ** 18), ('10^15', 10 ** 15), ('12345678×87654321', 12345678 * 87654321),
    # the usual surprises of binary fractions
    ('0.1+0.2', mpf('0.3')), ('0.1×3', mpf('0.3')), ('1−0.9', mpf('0.1')), ('4.35×100', 435), ('1.1×1.1', mpf('1.21')), ('0.7+0.1', mpf('0.8')), ('3×1.1', mpf('3.3')), ('1÷3×3', 1), ('(√2)^2', 2), ('e^ln(5)', 5), ('10^log(7)', 7), ('sin(30)^2+cos(30)^2', 1), ('tan(45)', 1), ('asin(0.5)', 30), ('acos(0.5)', 60), ('atan(1)', 45),
]
for e, v in W:
    cases['written'].append([e, 'deg', val(lambda v=v: v if isinstance(v, mp.mpc) else mpf(v))])

OUT.parent.mkdir(parents=True, exist_ok=True)
lines = ['{', f' "mpmath": "{__import__("mpmath").__version__}", "ans": 7,']
for i, (k, rows) in enumerate(cases.items()):
    lines.append(f' "{k}": [')
    lines += [f'  {json.dumps(r, ensure_ascii=False)}{"," if j < len(rows) - 1 else ""}' for j, r in enumerate(rows)]
    lines.append(' ]' + (',' if i < len(cases) - 1 else ''))
lines += ['}', '']
OUT.write_text('\n'.join(lines), encoding='utf-8')
print({k: len(v) for k, v in cases.items()}, '→', OUT.relative_to(OUT.parent.parent.parent.parent))
