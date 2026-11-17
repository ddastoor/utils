#!/usr/bin/env python3
"""Reference answers for the Protobuf / MsgPack / CBOR tab (tests/unit/devcore.test.mjs).

Seeded random values are ENCODED and DECODED by independent libraries (cbor2, msgpack, google.protobuf); this script
only lays the decoded Python objects out the way the tab prints them.
  CBOR         cbor2.dumps (plain and canonical = shortest floats) → cbor2.loads → RFC 8949 diagnostic layout
  MessagePack  msgpack.packb (float32 and float64) → msgpack.unpackb → JSON-like layout
  protobuf     hand-encoded wire format of random message trees whose fields cannot be read two ways; each blob must
               parse with google.protobuf and give the same skeleton (field numbers, nesting) as the expected text
Run by hand:  python3 scripts/make-bin-reference.py  → tests/fixtures/bin/reference.json
Needs: pip install cbor2 msgpack protobuf numpy
"""
import io, json, math, pathlib, random, re, struct
from datetime import datetime, timezone
from collections.abc import Mapping
from decimal import Decimal

import cbor2, msgpack, numpy as np
from google.protobuf import empty_pb2, text_format

rnd = random.Random(20261117)


def shape(text: str, a: float) -> str:
    """Digits as given (shortest round-trip), laid out like the tab: fixed from 1e-6 up to 1e21, else d.ddde±x; always a '.'."""
    d = Decimal(text)
    if a != 0 and (a >= 1e21 or a < 1e-6):
        sign, digits, exp = d.as_tuple()
        ds = ''.join(map(str, digits)).rstrip('0') or '0'
        e = len(digits) - 1 + exp
        return f"{'-' if sign else ''}{ds[0]}.{ds[1:] or '0'}e{'+' if e >= 0 else '-'}{abs(e)}"
    s = format(d, 'f')
    return s if '.' in s else s + '.0'


def fnum(f: float) -> str:
    if f != f: return 'NaN'
    if math.isinf(f): return 'Infinity' if f > 0 else '-Infinity'
    return shape(repr(f), abs(f))


def fnum32(f) -> str:  # shortest digits that read back as the same float32
    f = np.float32(f)
    if np.isnan(f): return 'NaN'
    if np.isinf(f): return 'Infinity' if f > 0 else '-Infinity'
    return shape(np.format_float_scientific(f, unique=True, trim='-'), abs(float(f)))


def quote(s: str) -> str:
    o = '"'
    for c in s:
        n = ord(c)
        if c == '"': o += '\\"'
        elif c == '\\': o += '\\\\'
        elif c == '\n': o += '\\n'
        elif c == '\r': o += '\\r'
        elif c == '\t': o += '\\t'
        elif n < 32 or 0x7f <= n < 0xa0 or n in (0x2028, 0x2029): o += f'\\u{n:04x}'
        else: o += c
    return o + '"'


def seq(items, d, open_, close):
    if not items: return open_ + close
    pad, end = '  ' * (d + 1), '  ' * d
    return open_ + '\n' + ',\n'.join(pad + x for x in items) + '\n' + end + close


# ---------------------------------------------------------------- CBOR
def cbor_text(v, d=0):
    if v is None: return 'null'
    if v is cbor2.undefined: return 'undefined'
    if v is True: return 'true'
    if v is False: return 'false'
    if isinstance(v, int): return str(v)
    if isinstance(v, float): return fnum(v)
    if isinstance(v, bytes): return f"h'{v.hex()}'"
    if isinstance(v, str): return quote(v)
    if isinstance(v, cbor2.CBORSimpleValue): return f'simple({v.value})'
    if isinstance(v, cbor2.CBORTag): return f'{v.tag}({cbor_text(v.value, d + 1)})'
    if isinstance(v, (list, tuple)): return seq([cbor_text(x, d + 1) for x in v], d, '[', ']')
    if isinstance(v, Mapping): return seq([f'{cbor_text(k, d + 1)}: {cbor_text(x, d + 1)}' for k, x in v.items()], d, '{', '}')
    raise TypeError(type(v))


WORDS = ['', 'a', 'Asha', 'नमस्ते', 'café', 'line\nbreak', 'tab\there', 'quote"d', 'back\\slash', '😀', 'x' * 30, '\u007f', 'nul\u0000']


def cbor_value(depth=0):
    k = rnd.randrange(16 if depth < 3 else 11)
    if k == 0: return rnd.choice([0, 1, 23, 24, 255, 256, 65535, 65536, 2**32 - 1, 2**32, 2**63, 2**64 - 1])
    if k == 1: return -rnd.choice([1, 24, 25, 256, 257, 65536, 2**32, 2**32 + 1, 2**63, 2**64])
    if k == 2: return rnd.choice([2**64, 2**70 + 12345, 2**127, -(2**64) - 1, -(2**90), 10**40, -(10**30)])  # bignums (tags 2 / 3)
    if k == 3: return rnd.choice([0.0, -0.0, 1.0, 1.5, -4.1, 0.1, 100000.0, 3.4028234663852886e38, 1e300, 5e-324, 1e-7, 1e21, 123456789.125, 65504.0, 5.960464477539063e-8, float('inf'), float('-inf')])
    if k == 4: return rnd.random() * 10 ** rnd.randrange(-12, 25) * rnd.choice([1, -1])
    if k == 5: return rnd.choice(WORDS)
    if k == 6: return bytes(rnd.randrange(256) for _ in range(rnd.choice([0, 1, 4, 23, 24, 40])))
    if k == 7: return rnd.choice([True, False, None, cbor2.undefined])
    if k == 8: return cbor2.CBORSimpleValue(rnd.choice([0, 16, 19, 32, 100, 255]))
    if k == 9: return rnd.randrange(-1000, 1000)
    if k == 10: return cbor2.CBORTag(rnd.choice([6, 99, 1234, 65535, 2**33]), rnd.choice(['2013-03-21T20:04:00Z', 'http://x.example', 7, b'\x01\x02']))  # tags cbor2 does not convert
    if k in (11, 12): return [cbor_value(depth + 1) for _ in range(rnd.randrange(0, 5))]
    if k in (13, 14):
        out = {}
        for _ in range(rnd.randrange(0, 4)): out[rnd.choice([rnd.choice(WORDS[1:5]) + str(rnd.randrange(99)), rnd.randrange(-50, 500)])] = cbor_value(depth + 1)
        return out
    return cbor2.CBORTag(rnd.choice([6, 99, 1234]), cbor_value(depth + 1))


cbor_rows = []
for i in range(160):
    v = cbor_value()
    blob = cbor2.dumps(v, canonical=(i % 2 == 1))
    if i % 7 == 0: blob += cbor2.dumps(cbor_value())  # a sequence of two items
    items = []
    stream = io.BytesIO(blob); dec = cbor2.CBORDecoder(stream)
    while stream.tell() < len(blob): items.append(dec.decode())
    cbor_rows.append({'hex': blob.hex(), 'text': ''.join(('\n' if n else '') + cbor_text(x) + '\n' for n, x in enumerate(items)), 'count': len(items)})


# ---------------------------------------------------------------- MessagePack
def stamp(sec, ns):
    t = datetime.fromtimestamp(sec, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')
    frac = '' if ns == 0 else f'.{ns // 1_000_000:03d}' if ns % 1_000_000 == 0 else f'.{ns // 1000:06d}' if ns % 1000 == 0 else f'.{ns:09d}'
    return f'{t}{frac}Z'


def blob_text(kind, b):
    shown = b[:256].hex() + ('…' if len(b) > 256 else '')  # the tab cuts long byte strings
    return f'<{kind} 0 bytes>' if not b and kind == 'bin' else f'<{kind}, 0 bytes>' if not b else f"<{kind}{',' if kind != 'bin' else ''} {len(b)} byte{'' if len(b) == 1 else 's'}: {shown}>"


class F32(float):  # a float that was packed as float32
    pass


def mp_text(v, d=0):
    if v is None: return 'null'
    if v is True: return 'true'
    if v is False: return 'false'
    if isinstance(v, int): return str(v)
    if isinstance(v, F32): return fnum32(float(v))
    if isinstance(v, float): return fnum(v)
    if isinstance(v, bytes): return blob_text('bin', v)
    if isinstance(v, str): return quote(v)
    if isinstance(v, msgpack.Timestamp): return f'<timestamp {stamp(v.seconds, v.nanoseconds)}>'
    if isinstance(v, msgpack.ExtType): return blob_text(f'ext type {v.code}', v.data)
    if isinstance(v, (list, tuple)): return seq([mp_text(x, d + 1) for x in v], d, '[', ']')
    if isinstance(v, dict): return seq([f'{mp_text(k, d + 1)}: {mp_text(x, d + 1)}' for k, x in v.items()], d, '{', '}')
    raise TypeError(type(v))


def mp_value(depth=0, single=False):
    k = rnd.randrange(15 if depth < 3 else 10)
    if k == 0: return rnd.choice([0, 1, 127, 128, 255, 256, 65535, 65536, 2**32 - 1, 2**32, 2**63, 2**64 - 1])
    if k == 1: return -rnd.choice([1, 32, 33, 128, 129, 32768, 32769, 2**31, 2**31 + 1, 2**63])
    if k == 2:
        f = rnd.choice([0.0, -0.0, 1.0, 1.5, -2.75, 0.1, 1e300, 5e-324, 1e-7, 1e21, 3.14159, float('inf'), float('-inf')])
        with np.errstate(over='ignore'): return F32(float(np.float32(f))) if single else f
    if k == 3:
        f = rnd.random() * 10 ** rnd.randrange(-12, 25) * rnd.choice([1, -1])
        return F32(float(np.float32(f))) if single else f
    if k == 4: return rnd.choice(WORDS) + ('y' * rnd.choice([0, 0, 0, 40, 300] if depth == 0 else [0, 0, 0, 40]))
    if k == 5: return bytes(rnd.randrange(256) for _ in range(rnd.choice([0, 1, 4, 40, 300] if depth == 0 else [0, 1, 4, 40])))
    if k == 6: return rnd.choice([True, False, None])
    if k == 7: return msgpack.ExtType(rnd.choice([0, 1, 5, 42, 127]), bytes(rnd.randrange(256) for _ in range(rnd.choice([0, 1, 2, 4, 8, 16, 3, 20]))))
    if k == 8: return msgpack.Timestamp(rnd.choice([0, 1, 1514862336, 2**32 - 1, 2**32, 2**34 - 1, 2**34, -1, -86400 * 365, 253402300799]), rnd.choice([0, 0, 500_000_000, 123_000, 1, 999_999_999]))
    if k == 9: return rnd.randrange(-1000, 1000)
    if k in (10, 11, 12): return [mp_value(depth + 1, single) for _ in range(rnd.choice([0, 1, 2, 3, 3, 15, 16] if depth else [0, 1, 2, 15, 16, 17]))]
    out = {}
    for _ in range(rnd.choice([0, 1, 2, 3, 16] if depth == 0 else [0, 1, 2, 3])): out[rnd.choice([rnd.choice(WORDS[1:5]) + str(rnd.randrange(9999)), rnd.randrange(-50, 5000)])] = mp_value(depth + 1, single)
    return out


def mp_unmark(v):  # plain objects for packb
    if isinstance(v, F32): return float(v)
    if isinstance(v, list): return [mp_unmark(x) for x in v]
    if isinstance(v, dict): return {k: mp_unmark(x) for k, x in v.items()}
    return v


mp_rows = []
for i in range(160):
    single = i % 3 == 2
    vals = [mp_value(0, single) for _ in range(2 if i % 7 == 0 else 1)]
    blob = b''.join(msgpack.packb(mp_unmark(v), use_single_float=single, use_bin_type=True, datetime=False) for v in vals)
    back = list(msgpack.Unpacker(io.BytesIO(blob), raw=False, strict_map_key=False, timestamp=0))
    assert len(back) == len(vals) and all(mp_text(a) == mp_text(b) or single for a, b in zip(back, vals)), 'msgpack round trip'
    mp_rows.append({'hex': blob.hex(), 'text': ''.join(('\n' if n else '') + mp_text(x) + '\n' for n, x in enumerate(vals)), 'count': len(vals)})


# ---------------------------------------------------------------- protobuf
def varint(n):
    o = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        o.append(b | (0x80 if n else 0))
        if not n: return bytes(o)


def key(field, wire): return varint((field << 3) | wire)


SAFE_START = "fgnovwFGNOVW./67>?^_&'"  # low three bits 6 or 7 = no such wire type: such text is never a message


def pb_message(depth=0):
    """→ (bytes, lines). Every nested message holds a small varint (a control byte: not text) and a string (≥ 3 chars)."""
    blob, lines, pad = b'', [], '  ' * depth
    fields = rnd.randrange(1, 6)
    kinds = [rnd.randrange(7) for _ in range(fields)]
    if depth > 0: kinds = [0, 3] + kinds
    for n, k in enumerate(kinds):
        f = rnd.choice([1, 2, 3, 15, 16, 2047, 2048, 536870911]) if rnd.random() < 0.5 else rnd.randrange(1, 40)
        if k == 0:
            v = rnd.choice([1, 2, 5, 8]) if depth > 0 and n == 0 else rnd.choice([0, 1, 127, 128, 150, 300, 2**31 - 1, 2**32, 2**63 - 1, 2**63, 2**64 - 1, rnd.randrange(2**64)])
            blob += key(f, 0) + varint(v)
            lines.append(f'{pad}{f}: {v}' + (f'  # int64 {v - 2**64}' if v > 2**63 - 1 else ''))
        elif k == 1:
            raw = struct.pack('<d', rnd.choice([0.5, -1.0, 1e300, 0.1, 5e-324, 123456.789])) if rnd.random() < 0.6 else bytes(rnd.randrange(256) for _ in range(8))
            v = struct.unpack('<Q', raw)[0]
            blob += key(f, 1) + raw
            lines.append(f'{pad}{f}: 0x{v:016x}  # fixed64 {v}, double {fnum(struct.unpack("<d", raw)[0])}')
        elif k == 2:
            raw = struct.pack('<f', rnd.choice([0.5, -1.0, 3.25, 0.1, 1e-45, 3.4028235e38])) if rnd.random() < 0.6 else bytes(rnd.randrange(256) for _ in range(4))
            v = struct.unpack('<I', raw)[0]
            blob += key(f, 5) + raw
            lines.append(f'{pad}{f}: 0x{v:08x}  # fixed32 {v}, float {fnum32(struct.unpack("<f", raw)[0])}')
        elif k == 3:
            s = rnd.choice(SAFE_START) + rnd.choice(['oo bar', 'नमस्ते', 'é ü ₹', 'x' * rnd.randrange(2, 200), 'name@example.in', 'two\nlines', '"quoted"'])
            b = s.encode()
            blob += key(f, 2) + varint(len(b)) + b
            lines.append(f'{pad}{f}: {quote(s)}')
        elif k == 4:
            b = b'\xff' + bytes(rnd.randrange(256) for _ in range(rnd.choice([0, 1, 7, 30, 300]))) + b'\x80'  # not UTF-8, not a message, not whole varints
            blob += key(f, 2) + varint(len(b)) + b
            shown = b[:256].hex() + ('…' if len(b) > 256 else '')
            lines.append(f'{pad}{f}: 0x{shown}  # {len(b)} bytes' + (' (first 256 shown)' if len(b) > 256 else ''))
        elif k == 5 and depth < 4:
            inner, il = pb_message(depth + 1)
            if rnd.random() < 0.25:  # a group (wire types 3 and 4)
                blob += key(f, 3) + inner + key(f, 4)
                lines += [f'{pad}{f} {{  # group'] + il + [f'{pad}}}']
            else:
                blob += key(f, 2) + varint(len(inner)) + inner
                lines += [f'{pad}{f} {{'] + il + [f'{pad}}}']
        else:
            blob += key(f, 2) + varint(0)
            lines.append(f'{pad}{f}: ""')
    return blob, lines


def skeleton(text):  # field numbers and braces, in order
    out = []
    for line in text.splitlines():
        t = line.strip()
        if not t: continue
        m = re.match(r'(\d+) \{', t)
        tok = '}' if t.startswith('}') else m.group(1) + '{' if m else re.match(r'(\d+):', t).group(1)
        if tok == '}' and out and out[-1].endswith('{'): out[-1] = out[-1][:-1]  # Google prints an empty field as "N { }", the tab as N: ""
        else: out.append(tok)
    return out


pb_rows = []
while len(pb_rows) < 160:
    blob, lines = pb_message()
    text = '\n'.join(lines) + '\n'
    m = empty_pb2.Empty(); m.ParseFromString(blob)  # must be a well-formed message for Google's parser
    theirs = text_format.MessageToString(m, print_unknown_fields=True)
    if skeleton(theirs) != skeleton(text): raise SystemExit(f'skeleton differs for {blob.hex()}\n{theirs}\n---\n{text}')
    pb_rows.append({'hex': blob.hex(), 'text': text, 'count': sum(1 for line in lines if not line.startswith(' ') and line != '}')})

out = pathlib.Path(__file__).resolve().parent.parent / 'tests/fixtures/bin/reference.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({'note': 'made by scripts/make-bin-reference.py (cbor2, msgpack, google.protobuf)', 'cbor': cbor_rows, 'msgpack': mp_rows, 'protobuf': pb_rows}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(len(cbor_rows), 'CBOR,', len(mp_rows), 'MessagePack,', len(pb_rows), 'protobuf →', out, out.stat().st_size, 'bytes')
