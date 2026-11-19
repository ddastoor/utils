#!/usr/bin/env python3
"""Reference for the Prime / LCM / GCD tab → tests/fixtures/primes/reference.json

SymPy's factorint, isprime and nextprime for 64-bit numbers chosen to be hard for a quick program: products of two
primes near 2³², squares and higher powers of primes, Carmichael numbers and strong pseudoprimes to small bases, the
largest primes below 2⁶⁴, numbers round powers of two — and random ones. GCD and LCM of random lists by Python's math.

    pip install sympy
    python3 scripts/make-primes-reference.py
"""
import json, math, os, random
from sympy import factorint, isprime, nextprime, prevprime, randprime

random.seed(20261126)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'primes', 'reference.json')
TOP = 2 ** 64 - 1
numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 97, 360, 84, 1001, 561, 1105, 1729, 2047, 3215031751, 2152302898747, 3474749660383, 341550071728321, 3825123056546413051, 318665857834031151167461 % (2 ** 64),
           TOP, TOP - 1, 18446744073709551557, 18446744073709551533, 18446744073709551556, 2 ** 63, 2 ** 63 - 1, 2 ** 61 - 1, 2 ** 32, 2 ** 32 + 1, 2 ** 32 - 1, 600851475143, 1000000007, 999999999999999989, 9007199254740993,
           4294967291 * 4294967279, 4294967291 ** 2, 2147483647 * 2147483629, 65537 ** 3, 3 ** 40, 7 ** 22, 2 * 3 * 5 * 7 * 11 * 13 * 17 * 19 * 23 * 29 * 31 * 37 * 41 * 43 * 47, 6700417 * 2753074036095 % (2 ** 64) or 1}
while len(numbers) < 420:
    k = random.randint(0, 6)
    if k == 0: n = random.randint(1, 10 ** 6)
    elif k == 1: n = random.randint(1, TOP)
    elif k == 2: n = randprime(2 ** 31, 2 ** 32) * randprime(2 ** 31, 2 ** 32)          # two large primes
    elif k == 3: n = randprime(2, 2 ** 21) ** 3
    elif k == 4: n = randprime(2 ** 62, 2 ** 64)
    elif k == 5: n = randprime(2, 1000) * randprime(2 ** 40, 2 ** 54)
    else: n = math.prod(randprime(2, 200) for _ in range(random.randint(2, 9)))
    if 1 <= n <= TOP: numbers.add(n)
rows = []  # [n, [prime factors ascending, repeated], is prime, next prime or null when it is beyond 2^64]
for n in sorted(numbers):
    f = factorint(n); flat = [str(p) for p in sorted(f) for _ in range(f[p])]
    nx = nextprime(n); rows.append([str(n), flat, bool(isprime(n)), str(nx) if nx <= TOP else None])
lists = []  # [numbers, gcd, lcm]
for _ in range(120):
    k = random.randint(2, 6); base = random.choice([1, 1, 6, 360, 2 ** 20, randprime(2, 10 ** 6)])
    ns = [base * random.randint(1, random.choice([50, 10 ** 6, 10 ** 12])) for _ in range(k)]
    ns = [n for n in ns if n <= TOP]
    if len(ns) >= 2: lists.append([[str(n) for n in ns], str(math.gcd(*ns)), str(math.lcm(*ns))])
lists.append([[str(TOP), str(TOP - 1), str(TOP - 2)], str(math.gcd(TOP, TOP - 1, TOP - 2)), str(math.lcm(TOP, TOP - 1, TOP - 2))])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f: json.dump({'numbers': rows, 'lists': lists}, f, separators=(',', ':'))
print(len(rows), 'numbers,', sum(1 for r in rows if r[2]), 'primes;', len(lists), 'lists;', os.path.getsize(OUT), 'bytes')
