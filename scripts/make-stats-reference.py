#!/usr/bin/env python3
"""Reference for the Statistics tab → tests/fixtures/stats/reference.json

Every figure from the exact values of the doubles (Python's fractions), rounded once: sum, mean, median, quartiles
(linear interpolation at (n − 1)·q: Excel's QUARTILE.INC, NumPy's default, statistics.quantiles(method='inclusive')),
both variances, both standard deviations and the population skewness m3 / m2^1.5 (mpmath at 60 digits for the roots),
geometric and harmonic mean (0 with a zero among the values, none with a negative one — as Python's statistics module),
the modes (the most frequent values, when something repeats), and the least-squares line with Pearson's r.
For some data sets Python's own statistics module is asked as well and must agree.

    pip install mpmath
    python3 scripts/make-stats-reference.py
"""
import json, os, random, statistics
from collections import Counter
from fractions import Fraction as F
from mpmath import mp, mpf, sqrt, log, exp

mp.dps = 60
random.seed(20261123)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'stats', 'reference.json')
mpq = lambda fr: mpf(fr.numerator) / mpf(fr.denominator)
def fl(x):
    """the nearest double; None where there is no value or it is beyond a double (the variance of 1e300 …)"""
    if x is None: return None
    try: v = float(x) if isinstance(x, F) else float(mpf(x))
    except OverflowError: return None
    return None if v in (float('inf'), float('-inf')) else v
def quantile(s, q):
    pos = (len(s) - 1) * F(q); lo = pos.__floor__(); hi = -((-pos).__floor__())
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)
def describe(texts):
    xs = sorted(F(float(t)) for t in texts); n = len(xs); total = sum(xs); mean = total / n
    ss = sum((x - mean) ** 2 for x in xs); m3 = sum((x - mean) ** 3 for x in xs) / n; varp = ss / n
    q1, q3 = quantile(xs, '1/4'), quantile(xs, '3/4')
    if xs[0] > 0: geo, har = exp(sum(log(mpq(x)) for x in xs) / n), n / sum(1 / x for x in xs)
    elif xs[0] == 0: geo, har = F(0), F(0)
    else: geo = har = None
    counts = Counter(xs); best = max(counts.values())
    return {'count': n, 'sum': fl(total), 'mean': fl(mean), 'median': fl(quantile(xs, '1/2')), 'min': fl(xs[0]), 'max': fl(xs[-1]), 'range': fl(xs[-1] - xs[0]), 'q1': fl(q1), 'q3': fl(q3), 'iqr': fl(q3 - q1),
            'varP': fl(varp), 'varS': fl(ss / (n - 1)) if n > 1 else None, 'sdP': fl(sqrt(mpq(varp))), 'sdS': fl(sqrt(mpq(ss / (n - 1)))) if n > 1 else None, 'geomean': fl(geo), 'harmmean': fl(har),
            'skew': fl(mpq(m3) / mpq(varp) ** mpf('1.5')) if varp > 0 else None, 'modes': [float(v) for v in sorted(counts) if counts[v] == best] if best > 1 else []}
num = lambda lo, hi, d: f'{random.uniform(lo, hi):.{d}f}'
sets = [['12', '15', '15', '18', '21', '24', '24', '24', '30'], ['5'], ['2', '4'], ['1e16', '1', '-1e16'], ['1000000001', '1000000002', '1000000003'], ['0.1', '0.2', '0.3'], ['1', '1', '2', '2', '3'], ['1', '2', '3'], ['0', '1', '2'], ['-1', '1', '2'],
        ['3', '3', '3', '3'], ['1e300', '1e300', '-1e300'], ['1e-300', '2e-300', '3e-300'], ['2', '8'], ['1', '2', '3', '4'], ['1', '2', '3', '4', '100'], ['-5', '-3', '-3', '0', '2.5'], ['0.1', '0.1', '0.1'], ['1e15', '1e15', '3', '-2e15'], ['7', '7']]
while len(sets) < 320:
    n = random.choice([1, 2, 3, 4, 5, 7, 10, 25, 60, 200]); k = random.randint(0, 6)
    if k == 0: s = [str(random.randint(-50, 50)) for _ in range(n)]
    elif k == 1: s = [num(0.01, 1000, random.randint(0, 4)) for _ in range(n)]
    elif k == 2: s = [str(1_000_000_000 + random.randint(0, 9)) for _ in range(n)]                      # a large offset
    elif k == 3: s = [f'{random.uniform(-9, 9):.3f}e{random.randint(-8, 12)}' for _ in range(n)]         # mixed magnitudes
    elif k == 4: s = [str(random.choice([1, 2, 2, 3, 5, 8])) for _ in range(n)]                          # many repeats
    elif k == 5: s = [num(-1, 1, 6) for _ in range(n)]
    else: s = [str(random.randint(0, 6)) for _ in range(n)]                                             # zeros among them
    sets.append(s)
summaries = [[s, describe(s)] for s in sets]
# Python's own statistics module on plain data sets
checked = 0
for s, d in summaries:
    xs = [float(t) for t in s]
    if len(xs) < 2 or max(abs(x) for x in xs) > 1e12 or len(set(xs)) < 2: continue
    q = statistics.quantiles(xs, n=4, method='inclusive')
    for mine, theirs in ((d['mean'], statistics.fmean(xs)), (d['median'], statistics.median(xs)), (d['varP'], statistics.pvariance(xs)), (d['varS'], statistics.variance(xs)), (d['sdS'], statistics.stdev(xs)), (d['q1'], q[0]), (d['q3'], q[2])):
        assert abs(mine - theirs) <= 1e-12 * max(1e-300, abs(mine), abs(theirs)) + 1e-12 * max(abs(x) for x in xs) * 1e-3, (s[:5], mine, theirs)
    if min(xs) > 0: assert abs(d['geomean'] - statistics.geometric_mean(xs)) <= 1e-12 * d['geomean'] and abs(d['harmmean'] - statistics.harmonic_mean(xs)) <= 1e-12 * d['harmmean']
    checked += 1

def line(pairs):
    xs, ys = [F(float(a)) for a, _ in pairs], [F(float(b)) for _, b in pairs]; n = len(xs); mx, my = sum(xs) / n, sum(ys) / n
    sxy, sxx, syy = sum((x - mx) * (y - my) for x, y in zip(xs, ys)), sum((x - mx) ** 2 for x in xs), sum((y - my) ** 2 for y in ys)
    slope = sxy / sxx if sxx else None
    return {'slope': fl(slope), 'intercept': fl(my - slope * mx) if sxx else None, 'r': fl(mpq(sxy) / sqrt(mpq(sxx) * mpq(syy))) if sxx and syy else None}
pairsets = [[['1', '2'], ['2', '4'], ['3', '7']], [['1', '2'], ['2', '4']], [['1', '5'], ['1', '7'], ['1', '9']], [['1', '4'], ['2', '4'], ['3', '4']], [['2019', '10.5'], ['2020', '11'], ['2021', '12.25'], ['2022', '12.5'], ['2023', '14']],
            [['1', '1'], ['2', '2'], ['3', '3']], [['1', '3'], ['2', '2'], ['3', '1']], [['0', '0'], ['0', '0']], [['1e9', '1'], ['1000000001', '2'], ['1000000002', '2.5']], [['1', '2']]]
while len(pairsets) < 160:
    n = random.choice([2, 3, 5, 10, 40]); a, b, noise = random.uniform(-5, 5), random.uniform(-100, 100), random.choice([0, 0.5, 20])
    x0 = random.choice([0, 0, 1000, 1e9])
    ps = []
    for _ in range(n):
        x = x0 + random.uniform(-10, 10); ps.append([f'{x:.3f}', f'{a * (x - x0) + b + random.gauss(0, noise):.4f}'])
    pairsets.append(ps)
lines = [[p, line(p)] for p in pairsets]
for p, d in lines:  # Python's own, where it has an answer
    xs, ys = [float(a) for a, _ in p], [float(b) for _, b in p]
    if d['r'] is not None and len(xs) >= 2:
        lr = statistics.linear_regression(xs, ys)
        assert abs(lr.slope - d['slope']) <= 1e-9 * max(1e-9, abs(d['slope'])) + 1e-7 and abs(statistics.correlation(xs, ys) - d['r']) <= 1e-9, (p[:3], lr, d)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'summaries': summaries, 'lines': lines}, f, separators=(',', ':'), allow_nan=False)
print(len(summaries), 'data sets,', checked, 'of them also by the statistics module;', len(lines), 'sets of pairs;', os.path.getsize(OUT), 'bytes')
