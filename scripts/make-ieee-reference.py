#!/usr/bin/env python3
"""Reference answers for the IEEE-754 Inspector (tests/unit/bitsweb.test.mjs).

For each decimal text: the correctly rounded float32 and float64 bit patterns (round half to even), computed with
exact rational arithmetic (fractions.Fraction) — no floating point on the way, so no double rounding — plus the
exact decimal value of the stored double (decimal.Decimal).
Run by hand:  python3 scripts/make-ieee-reference.py  → tests/fixtures/ieee/reference.json
"""
import json, pathlib, random, struct
from decimal import Decimal
from fractions import Fraction


def bits(text: str, mant: int, emin: int, emax: int, width: int) -> int:
    """mant = fraction bits (23 / 52); emin = smallest normal exponent (-126 / -1022); emax = largest (127 / 1023)."""
    x = Fraction(Decimal(text)); sign = x < 0 or text.strip().startswith('-'); x = abs(x)
    top = 1 << (width - 1)
    if x == 0: return top if sign else 0
    e = max(x.numerator.bit_length() - x.denominator.bit_length(), emin)
    while e > emin and Fraction(2) ** e > x: e -= 1
    while Fraction(2) ** (e + 1) <= x: e += 1
    e = max(e, emin)
    ulp = Fraction(2) ** (e - mant)
    q = x / ulp; lo = q.numerator // q.denominator; rem = q - lo
    m = lo + (1 if rem > Fraction(1, 2) or (rem == Fraction(1, 2) and lo % 2 == 1) else 0)
    if m == 1 << (mant + 1): m >>= 1; e += 1                # rounding carried into the next binade
    if e > emax: b = ((1 << (width - 1 - mant)) - 1) << mant  # overflow → infinity
    elif m < 1 << mant: b = m                                   # subnormal (or zero): exponent field 0
    else: b = ((e - emin + 1) << mant) | (m - (1 << mant))
    return b | (top if sign else 0)


def exact(b64: int) -> str:
    v = struct.unpack('>d', struct.pack('>Q', b64))[0]
    if v != v or v in (float('inf'), float('-inf')): return 'NaN' if v != v else ('Infinity' if v > 0 else '-Infinity')
    if v == 0: return '-0' if b64 >> 63 else '0'
    s = format(Decimal(v), 'f')
    return s.rstrip('0').rstrip('.') if '.' in s else s


rnd = random.Random(20261117)
texts = ['0', '-0', '1', '-1', '0.1', '0.2', '0.3', '0.5', '1.5', '2.5', '3.14159', '16777216', '16777217', '16777218', '16777219', '9007199254740993', '9007199254740992', '0.30000000000000004',
         '1e-45', '7e-46', '7.006492321624085e-46', '7.006492321624086e-46', '1.401298464324817e-45', '1.1754943508222875e-38', '1.17549435e-38', '1.1754942e-38', '3.4028234663852886e38', '3.4028235e38', '3.40282356e38', '3.4028235677973366e38',
         '3.4028235677973367e38', '3.5e38', '1e39', '1e-50', '5e-324', '2.4703282292062327e-324', '2.4703282292062328e-324', '4.9406564584124654e-324', '2.2250738585072014e-308', '2.2250738585072011e-308', '1.7976931348623157e308',
         '1.7976931348623158e308', '1.7976931348623159e308', '1.797693134862315807e308', '1e309', '1e-400', '123456789', '0.000001', '1e21', '1e22', '1e23', '8.5', '100', '255', '65535.5', '4294967296', '-2.5e-3', '6.02214076e23', '1.602176634e-19',
         # float32 ties: exactly half-way between neighbours, and one digit to either side
         '1.000000059604644775390625', '1.0000000596046447753906251', '1.0000000596046447753906249', '1.00000017881393432617187500', '1.000000178813934326171875001', '1.000000178813934326171874999',
         '16777217.0000000000000000001', '16777216.9999999999999', '33554434', '33554435', '33554437', '0.100000001490116119384765625', '0.10000000894069671630859375', '0.100000008940696716308593751']
for _ in range(220):
    k = rnd.randrange(6)
    if k == 0: texts.append(repr(rnd.random() * 10 ** rnd.randrange(-50, 50) * rnd.choice([1, -1])))
    elif k == 1: texts.append(f'{rnd.randrange(10**rnd.randrange(1, 30))}.{rnd.randrange(10**rnd.randrange(1, 30))}')
    elif k == 2: texts.append(f'{rnd.randrange(1, 10)}.{rnd.randrange(10**12):012d}e{rnd.randrange(-320, 310)}')
    elif k == 3:   # a float32 tie: the midpoint of two neighbouring floats, exactly and nudged
        b = rnd.randrange(1, 0x7f7fffff); lo = Fraction(struct.unpack('>f', struct.pack('>I', b))[0]); hi = Fraction(struct.unpack('>f', struct.pack('>I', b + 1))[0])
        from decimal import localcontext
        with localcontext() as c:
            c.prec = 400; mid = Decimal((lo + hi).numerator) / Decimal((lo + hi).denominator * 2); s = format(mid, 'f')
        texts += [s, s + '1' if '.' in s else s + '.0000001']
    elif k == 4: texts.append(str(rnd.randrange(2**24, 2**26)))
    else: texts.append(f'{rnd.choice(["", "-"])}{rnd.randrange(1000)}e{rnd.randrange(-48, 40)}')
rows = []
for t in dict.fromkeys(texts):
    b32, b64 = bits(t, 23, -126, 127, 32), bits(t, 52, -1022, 1023, 64)
    f32 = struct.unpack('>f', struct.pack('>I', b32))[0]
    rows.append({'text': t, 'f32': f'{b32:08X}', 'f64': f'{b64:016X}', 'exact64': exact(b64), 'exact32': exact(struct.unpack('>Q', struct.pack('>d', f32))[0])})
# self-check of the rational arithmetic against the platform's correctly rounded strtod (doubles only)
bad = [r['text'] for r in rows if struct.unpack('>Q', struct.pack('>d', float(r['text'])))[0] != int(r['f64'], 16)]
assert not bad, bad[:5]
out = pathlib.Path(__file__).resolve().parent.parent / 'tests/fixtures/ieee/reference.json'
out.write_text(json.dumps({'note': 'made by scripts/make-ieee-reference.py (exact rational rounding)', 'rows': rows}, separators=(',', ':')) + '\n')
def via_double(text):  # what rounding to a double first, then to float32, gives (the mistake the tab used to make)
    d = float(text)
    try: return struct.unpack('>I', struct.pack('>f', d))[0]
    except OverflowError: return 0xff800000 if d < 0 else 0x7f800000
naive = [r['text'] for r in rows if via_double(r['text']) != int(r['f32'], 16)]
print(len(rows), 'rows →', out, out.stat().st_size, 'bytes;', len(naive), 'where rounding through a double gives another float32, e.g.', naive[:3])
