#!/usr/bin/env python3
"""Reference for the Matrix Calculator → tests/fixtures/matrix/reference.json

Small matrices of whole numbers, decimals and typed fractions, with every operation of the tab worked out on Python's
fractions (another program than the tab's: Gaussian elimination, the Leibniz sum for the determinants up to 4 × 4 as a
second way) — sums, differences, products, transpose, trace, determinant, rank, inverse (or none), powers. And three
larger matrices in double precision by NumPy, for the tab's rounded arithmetic.

    pip install numpy
    python3 scripts/make-matrix-reference.py
"""
import json, os, random
from fractions import Fraction as F
from itertools import permutations
import numpy as np

random.seed(20261124)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'matrix', 'reference.json')
fr = lambda x: f'{x.numerator}/{x.denominator}' if x.denominator != 1 else str(x.numerator)
val = lambda t: F(t.split('/')[0]) / F(t.split('/')[1]) if '/' in t else F(t)
def mat(texts): return [[val(t) for t in row] for row in texts]
def mul(A, B): return [[sum(A[i][k] * B[k][j] for k in range(len(B))) for j in range(len(B[0]))] for i in range(len(A))]
def eliminate(A):
    M = [row[:] for row in A]; rows, cols = len(M), len(M[0]); det, rank = F(1), 0
    for c in range(cols):
        if rank == rows: break
        p = next((r for r in range(rank, rows) if M[r][c] != 0), None)
        if p is None: continue
        if p != rank: M[p], M[rank] = M[rank], M[p]; det = -det
        det *= M[rank][c]
        for r in range(rank + 1, rows):
            f = M[r][c] / M[rank][c]; M[r] = [a - f * b for a, b in zip(M[r], M[rank])]
        rank += 1
    return (det if rows == cols and rank == rows else F(0)), rank
def leibniz(A):
    n = len(A); total = F(0)
    for perm in permutations(range(n)):
        sign = 1
        for i in range(n):
            for j in range(i + 1, n):
                if perm[i] > perm[j]: sign = -sign
        term = F(sign)
        for i in range(n): term *= A[i][perm[i]]
        total += term
    return total
def inverse(A):
    n = len(A); M = [row[:] + [F(int(i == j)) for j in range(n)] for i, row in enumerate(A)]
    for c in range(n):
        p = next((r for r in range(c, n) if M[r][c] != 0), None)
        if p is None: return None
        M[p], M[c] = M[c], M[p]; M[c] = [v / M[c][c] for v in M[c]]
        for r in range(n):
            if r != c and M[r][c] != 0: f = M[r][c]; M[r] = [a - f * b for a, b in zip(M[r], M[c])]
    return [row[n:] for row in M]
def power(A, p):
    R = [[F(int(i == j)) for j in range(len(A))] for i in range(len(A))]
    for _ in range(p): R = mul(R, A)
    return R
S = lambda M: None if M is None else [[fr(v) for v in row] for row in M]
def cell():
    k = random.randint(0, 9)
    if k < 5: return str(random.randint(-9, 9))
    if k < 8: return f'{random.uniform(-20, 20):.{random.randint(1, 3)}f}'
    if k == 8: return f'{random.randint(-9, 9)}/{random.randint(1, 9)}'
    return f'{random.randint(-99, 99)}e{random.randint(-3, 2)}'
cases = []  # {A, B (same shape as A), C (A × C fits), p, sum, diff, prod, T, trace, det, rank, inv, pow}
fixed = [([['2', '1', '0'], ['1', '3', '1'], ['0', '1', '4']], None), ([['1', '2'], ['3', '4']], None), ([['0.1', '0.2'], ['0.3', '0.6']], None), ([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']], None), ([['1e-15', '0'], ['0', '1e-15']], None),
         ([['1e-13', '2e-13'], ['3e-13', '4e-13']], None), ([['4', '7'], ['2', '6']], None), ([['1/2', '1/3'], ['1/4', '1/5']], None), ([['3']], None), ([['0']], None), ([['1', '2', '3'], ['4', '5', '6']], None), ([['1', '2'], ['3', '4'], ['5', '6']], None),
         ([['0', '1'], ['1', '0']], None), ([['2', '0'], ['0', '2']], None), ([['1', '1', '1', '1'], ['1', '2', '4', '8'], ['1', '3', '9', '27'], ['1', '4', '16', '64']], None), ([['0.5', '0.25'], ['0.125', '0.0625']], None)]
def add_case(At):
    rows, cols = len(At), len(At[0])
    Bt = [[cell() for _ in range(cols)] for _ in range(rows)]; k = random.randint(1, 4); Ct = [[cell() for _ in range(k)] for _ in range(cols)]
    A, B, C = mat(At), mat(Bt), mat(Ct); p = random.choice([0, 1, 2, 3, 5, 8])
    sq = rows == cols; det, rank = eliminate(A)
    if sq and rows <= 4: assert leibniz(A) == det, At
    inv = inverse(A) if sq else None
    if inv is not None: assert mul(A, inv) == [[F(int(i == j)) for j in range(rows)] for i in range(rows)]
    cases.append({'A': At, 'B': Bt, 'C': Ct, 'p': p, 'sum': S([[a + b for a, b in zip(r1, r2)] for r1, r2 in zip(A, B)]), 'diff': S([[a - b for a, b in zip(r1, r2)] for r1, r2 in zip(A, B)]), 'prod': S(mul(A, C)),
                  'T': S([list(col) for col in zip(*A)]), 'trace': fr(sum(A[i][i] for i in range(rows))) if sq else None, 'det': fr(det) if sq else None, 'rank': rank, 'inv': S(inv), 'pow': S(power(A, p)) if sq else None})
for At, _ in fixed: add_case(At)
while len(cases) < 220:
    rows = random.randint(1, 5); cols = rows if random.random() < 0.75 else random.randint(1, 5)
    At = [[cell() for _ in range(cols)] for _ in range(rows)]
    if rows > 1 and random.random() < 0.25:  # a dependent row: singular
        i, j = random.sample(range(rows), 2); f = F(random.randint(-3, 3))
        try: At[i] = [fr(f * val(t)) for t in At[j]]
        except Exception: pass
    add_case(At)
# larger matrices in double precision
big = []
for n in (25, 30, 40):
    A = np.array([[random.randint(-9, 9) + random.choice([0, 0, 0.5]) for _ in range(n)] for _ in range(n)], dtype=float) + np.eye(n) * 20
    Bm = np.array([[random.randint(-5, 5) for _ in range(n)] for _ in range(n)], dtype=float)
    sign, logdet = np.linalg.slogdet(A)
    big.append({'A': A.tolist(), 'B': Bm.tolist(), 'prod': (A @ Bm).tolist(), 'logdet': float(logdet), 'sign': float(sign), 'rank': int(np.linalg.matrix_rank(A)), 'inv': np.linalg.inv(A).tolist(), 'pow3': np.linalg.matrix_power(A, 3).tolist()})
sing = np.array([[float((i * 7 + j * 3) % 11) for j in range(30)] for i in range(30)]); sing[5] = sing[2] + sing[9]; sing[17] = 2 * sing[1]
big.append({'A': sing.tolist(), 'rank': int(np.linalg.matrix_rank(sing)), 'singular': True})
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f: json.dump({'cases': cases, 'big': big}, f, separators=(',', ':'), allow_nan=False)
print(len(cases), 'matrices,', sum(1 for c in cases if c['det'] is not None), 'square,', sum(1 for c in cases if c['det'] == '0'), 'singular;', len(big), 'large ones;', os.path.getsize(OUT), 'bytes')
