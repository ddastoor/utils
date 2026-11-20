#!/usr/bin/env python3
"""Reference digests for the Hash / Checksum tab (tests/unit/hash.test.mjs) from implementations independent of
hash-wasm: Python's hashlib (OpenSSL: MD5, SHA-1, SHA-2, SHA-3, BLAKE2, RIPEMD-160), zlib (CRC-32, Adler-32),
pycryptodomex (Keccak-256), and the packages blake3 (the BLAKE3 team's Rust code), xxhash (Yann Collet's C code) and
crc32c (Intel / Mark Adler's C code). CRC-64/XZ is worked out bit by bit here and checked against what Python's lzma
module (liblzma) stores in an .xz file's check field.

    pip install pycryptodomex blake3 xxhash crc32c
    python3 scripts/make-hash-reference.py   →  tests/fixtures/hash/reference.json
"""
import hashlib, json, lzma, os, struct, zlib
import blake3, crc32c, xxhash
from Cryptodome.Hash import keccak

def gen(n, seed):  # the same bytes as gen() in tests/unit/hash.test.mjs
    x, out = seed, bytearray(n)
    for i in range(n):
        x = (x * 1103515245 + 12345) & 0x7FFFFFFF
        out[i] = (x >> 16) & 0xFF
    return bytes(out)

POLY = 0xC96C5795D7870F42  # ECMA-182, reflected
def crc64(b):
    c = 0xFFFFFFFFFFFFFFFF
    for x in b:
        c ^= x
        for _ in range(8):
            c = (c >> 1) ^ (POLY if c & 1 else 0)
    return c ^ 0xFFFFFFFFFFFFFFFF

def crc64_lzma(b):  # the check of a one-block .xz file: 8 bytes before the index
    x = lzma.compress(b, format=lzma.FORMAT_XZ, check=lzma.CHECK_CRC64)
    # stream footer 12 bytes; backward size → index size; the check stands just before the index
    back = (struct.unpack('<I', x[-8:-4])[0] + 1) * 4
    idx = len(x) - 12 - back
    return struct.unpack('<Q', x[idx - 8:idx])[0]

def kec(b):
    k = keccak.new(digest_bits=256); k.update(b); return k.hexdigest()

ALGS = {
    'MD5': lambda b: hashlib.md5(b).hexdigest(),
    'SHA-1': lambda b: hashlib.sha1(b).hexdigest(),
    'SHA-224': lambda b: hashlib.sha224(b).hexdigest(),
    'SHA-256': lambda b: hashlib.sha256(b).hexdigest(),
    'SHA-384': lambda b: hashlib.sha384(b).hexdigest(),
    'SHA-512': lambda b: hashlib.sha512(b).hexdigest(),
    'SHA3-224': lambda b: hashlib.sha3_224(b).hexdigest(),
    'SHA3-256': lambda b: hashlib.sha3_256(b).hexdigest(),
    'SHA3-384': lambda b: hashlib.sha3_384(b).hexdigest(),
    'SHA3-512': lambda b: hashlib.sha3_512(b).hexdigest(),
    'Keccak-256': kec,
    'BLAKE2b-256': lambda b: hashlib.blake2b(b, digest_size=32).hexdigest(),
    'BLAKE2b-512': lambda b: hashlib.blake2b(b).hexdigest(),
    'BLAKE2s-256': lambda b: hashlib.blake2s(b).hexdigest(),
    'BLAKE3': lambda b: blake3.blake3(b).hexdigest(),
    'RIPEMD-160': lambda b: hashlib.new('ripemd160', b).hexdigest(),
    'CRC-32': lambda b: '%08x' % zlib.crc32(b),
    'CRC-32C': lambda b: '%08x' % crc32c.crc32c(b),
    'CRC-64': lambda b: '%016x' % crc64(b),
    'Adler-32': lambda b: '%08x' % zlib.adler32(b),
    'xxHash64': lambda b: xxhash.xxh64(b).hexdigest(),
    'XXH3-64': lambda b: xxhash.xxh3_64(b).hexdigest(),
    'XXH128': lambda b: xxhash.xxh128(b).hexdigest(),
}

TEXTS = ['', 'a', 'abc', 'message digest', 'The quick brown fox jumps over the lazy dog',
         'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'नमस्ते 👋\n', '₹1,00,000 — ünïcödé', 'a' * 1000]
SIZES = [1, 3, 55, 56, 63, 64, 65, 111, 112, 127, 128, 129, 135, 136, 137, 143, 144, 168, 1023, 1024, 1025, 2048,
         2049, 4096, 65536, 65537, 1048576 + 3, 3 * 1048576 + 7]

cases = []
for t in TEXTS:
    b = t.encode('utf-8'); cases.append({'text': t, 'digests': {k: f(b) for k, f in ALGS.items()}})
for i, n in enumerate(SIZES):
    b = gen(n, 1000 + i); cases.append({'gen': [n, 1000 + i], 'digests': {k: f(b) for k, f in ALGS.items()}})
million = b'a' * 1000000
cases.append({'repeat': ['a', 1000000], 'digests': {k: f(million) for k, f in ALGS.items()}})
for c in cases[:12] + cases[-6:]:  # CRC-64: the bit-by-bit routine agrees with liblzma
    b = c['text'].encode() if 'text' in c else gen(*c['gen']) if 'gen' in c else million
    if b: assert crc64(b) == crc64_lzma(b), c  # an empty .xz stream has no block, so no check
out = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'hash', 'reference.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump({'made_by': 'scripts/make-hash-reference.py', 'versions': {'openssl': __import__('ssl').OPENSSL_VERSION, 'blake3': blake3.__version__ if hasattr(blake3, '__version__') else '?', 'xxhash': xxhash.VERSION}, 'cases': cases}, f, ensure_ascii=False, indent=0)
print(len(cases), 'cases →', out)
