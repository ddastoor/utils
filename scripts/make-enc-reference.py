#!/usr/bin/env python3
"""Reference answers for the Base32 / Base58 / Ascii85 tab (tests/unit/devcore.test.mjs).

Python's own base64 module encodes seeded random byte strings in every format the tab offers; Base58, Base58Check and
Crockford Base32 (not in the standard library) are written here straight from their specifications, independently of
the Rust code.  Run by hand:  python3 scripts/make-enc-reference.py  → tests/fixtures/enc/reference.json
"""
import base64, hashlib, json, random, pathlib

B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

def b58(b: bytes) -> str:
    n, out = int.from_bytes(b, 'big'), ''
    while n: n, r = divmod(n, 58); out = B58[r] + out
    return '1' * (len(b) - len(b.lstrip(b'\0'))) + out

def b58check(b: bytes) -> str:
    return b58(b + hashlib.sha256(hashlib.sha256(b).digest()).digest()[:4])

def crockford(b: bytes) -> str:  # 5 bits at a time from the left, the last group padded with zero bits, no '='
    bits = ''.join(f'{x:08b}' for x in b)
    bits += '0' * (-len(bits) % 5)
    return ''.join(CROCK[int(bits[i:i + 5], 2)] for i in range(0, len(bits), 5))

rnd = random.Random(20261117)
rows = []
sizes = list(range(0, 41)) + [48, 63, 64, 65, 100, 255, 256, 257]
for i, n in enumerate(sizes * 3):
    b = bytes(rnd.randrange(256) for _ in range(n))
    if i % 4 == 1: b = bytes(min(n, 1 + i % 7)) + b[min(n, 1 + i % 7):]          # leading zero bytes (Base58 "1"s, Ascii85 "z")
    if i % 9 == 2 and n >= 8: b = b[:4] + bytes(4) + b[8:]                        # an all-zero group in the middle
    if i % 11 == 3: b = bytes([0xff]) * n                                         # all ones (largest groups)
    rows.append({
        'hex': b.hex(),
        'base16': b.hex().upper(),
        'base32': base64.b32encode(b).decode(),
        'base32hex': base64.b32hexencode(b).decode(),
        'crockford': crockford(b),
        'base58': b58(b),
        'base58check': b58check(b),
        'ascii85': base64.a85encode(b).decode(),
        'z85': base64.z85encode(b).decode() if n % 4 == 0 else None,
        'base64': base64.b64encode(b).decode(),
        'base64url': base64.urlsafe_b64encode(b).decode().rstrip('='),
    })
out = pathlib.Path(__file__).resolve().parent.parent / 'tests/fixtures/enc/reference.json'
out.write_text(json.dumps({'note': 'made by scripts/make-enc-reference.py (Python base64 module + spec implementations of Base58 / Crockford)', 'rows': rows}, separators=(',', ':')) + '\n')
print(len(rows), 'rows →', out, out.stat().st_size, 'bytes')
