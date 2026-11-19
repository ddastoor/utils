#!/usr/bin/env python3
"""Reference for the Number Base Converter and Roman Numerals → tests/fixtures/numerals/reference.json

  * bases — Python's own reading of a number in a base, int(text, base) (signs, a 0x / 0o / 0b prefix only in the
    base it stands for, '_' between digits), and numpy.base_repr for writing it in another: some 480 numbers from one bit
    to 6,000 bits, typed in bases 2 to 36 in upper, lower and mixed case.
  * roman — the `roman` library (Mark Pilgrim's, `pip install roman`): every number from 1 to 3,999 both ways, and
    3,000 strings of Roman letters for what is, and what is not, a numeral in standard form. The lenient reading —
    I, X, C and M up to four times in a row, as on clock faces and buildings — is the grammar below, evaluated by
    adding up the letters.

    python3 scripts/make-numerals-reference.py
"""
import json, os, random, re
from importlib.metadata import version
import numpy, roman

random.seed(20261119)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'numerals', 'reference.json')
DIG = '0123456789abcdefghijklmnopqrstuvwxyz'
TO = [2, 8, 10, 16, 36]

def spell(n, base):
    s = numpy.base_repr(abs(n), base).lower()
    style = random.random()
    return s.upper() if style < 0.4 else ''.join(c.upper() if random.random() < 0.5 else c for c in s) if style < 0.6 else s
def answers(n, extra):
    to = TO + [extra] if abs(n) < 1 << 300 else random.sample(TO, 2) + [extra]   # long numbers: three bases, to keep the file small
    return {str(b): ('-' if n < 0 else '') + numpy.base_repr(abs(n), b) for b in to}

bases = []  # [typed text, its base, {base: the number written in that base (upper case)}]
for bits in [1, 2, 7, 8, 9, 16, 31, 32, 33, 53, 63, 64, 65, 96, 128, 129, 256, 512, 1000, 2048, 4096, 6000]:
    for _ in range(24 if bits <= 256 else 5):
        n = random.getrandbits(bits) | (1 << (bits - 1)) if random.random() < 0.8 else random.getrandbits(bits)
        if random.random() < 0.15: n = -n
        frm, extra = random.choice([2, 8, 10, 16, 36] + list(range(2, 37))), random.randint(2, 36)
        text = ('-' if n < 0 else '') + spell(n, frm)
        assert int(text, frm) == n
        bases.append([text, frm, answers(n, extra)])
# what people type around a number: Python's int() reads these the same way
for text, frm in [('0b1', 16), ('0B1', 16), ('0b', 16), ('0x1f', 36), ('0o17', 36), ('0b11', 2), ('0B11', 2), ('0x1f', 16), ('0X1F', 16), ('0o17', 8), ('0O17', 8), ('-0x1f', 16), ('+0b101', 2), ('+255', 10), ('-255', 10), ('1_000_000', 10),
                  ('dead_beef', 16), ('0xdead_beef', 16), ('007', 10), ('-0', 10), ('0', 2), ('z', 36), ('Zz', 36), ('1e3', 16), ('0b1', 12), ('0o7', 25), ('0x10', 34), ('00000000', 2), ('0b0', 2), ('  42', 10), ('42  ', 10)]:
    bases.append([text, frm, answers(int(text, frm), random.randint(2, 36))])

LOOSE = re.compile(r'^(M{0,4})(CM|CD|D?C{0,4})(XC|XL|L?X{0,4})(IX|IV|V?I{0,4})$')
VAL = dict(I=1, V=5, X=10, L=50, C=100, D=500, M=1000)
def loose(s):
    if not s or not LOOSE.match(s): return 0
    v = [VAL[c] for c in s]
    return sum(-x if i + 1 < len(v) and v[i + 1] > x else x for i, x in enumerate(v))
def strict(s):
    try: n = roman.fromRoman(s)
    except Exception: return 0
    return n if n <= 3999 else 0   # the standard notation ends at MMMCMXCIX; the library goes on to MMMMCMXCIX

numerals = [roman.toRoman(n) for n in range(1, 4000)]
assert all(strict(r) == n + 1 and loose(r) == n + 1 for n, r in enumerate(numerals))
words = {'IIII', 'VIIII', 'XXXX', 'LXXXX', 'CCCC', 'DCCCC', 'MMMM', 'MDCCCCX', 'MCMLXXXXVIIII', 'IIIII', 'VV', 'LL', 'DD', 'IC', 'IL', 'VX', 'XM', 'XD', 'IM', 'IIX', 'XXC', 'IXI', 'IVI', 'XCX', 'CMC', 'CDC', 'IXX', 'MMMMM', 'MMMMCMXCIX', 'MMMM', 'MMMMI',
         'ABC', 'N', 'IIV', 'VIV', 'IXV', 'XLX', 'LXL', 'DCD', 'MCMC', 'XIIII', 'XVIIII', 'CCCCLXXXXVIIII', 'IVIV', ''}
while len(words) < 3000:
    words.add(''.join(random.choice('IVXLCDM') for _ in range(random.randint(1, 9))))
strings = [[w, strict(w), loose(w)] for w in sorted(words)]  # [letters, value in standard form or 0, value in the lenient reading or 0]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'made_with': f'Python int(), numpy {numpy.__version__} base_repr, roman {version("roman")}', 'bases': bases, 'roman': numerals, 'strings': strings}, f, separators=(',', ':'))
print(len(bases), 'numbers in bases,', len(numerals), 'numerals,', len(strings), 'strings (', sum(1 for s in strings if s[1]), 'standard,', sum(1 for s in strings if s[2] and not s[1]), 'lenient only );', os.path.getsize(OUT), 'bytes')
