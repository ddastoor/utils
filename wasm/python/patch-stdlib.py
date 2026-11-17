#!/usr/bin/env python3
"""Changes to CPython's own standard library for the browser build (run by build.sh on the copy that goes into
python314.zip). Each one must find its text exactly once, so that a new CPython version cannot slip past unnoticed.

1. functools.lru_cache / functools.cache: use the pure-Python wrapper that functools.py already contains instead of
   the C one. A call through the C wrapper nests C calls (wrapper -> function -> wrapper ...), and a browser's stack
   holds only about 240 such levels before RecursionError (see stack-guard.patch) — the classic memoised recursion
   `@cache def fib(n)` stopped at fib(241), where desktop Python reaches the recursion limit (1000). Calls through
   the Python wrapper are plain Python calls: no C nesting, so the only limit is sys.getrecursionlimit(), as on a
   desktop. Cost: a cached call takes a few hundred nanoseconds more.

2. hashlib.pbkdf2_hmac: CPython takes it from OpenSSL only (its Python fallback was removed in 3.12), and this build
   has no OpenSSL — the function did not exist. The fallback of CPython 3.11's Lib/hashlib.py (PSF licence) is put
   back, with OpenSSL's error messages. About 2 microseconds per iteration on a desktop.
"""
import sys, pathlib

root = pathlib.Path(sys.argv[1])

def change(rel, old, new):
    p = root / rel
    s = p.read_text(encoding="utf-8")
    if s.count(old) != 1:
        sys.exit(f"patch-stdlib: expected exactly one place to change in {rel}, found {s.count(old)}")
    p.write_text(s.replace(old, new), encoding="utf-8")

change("functools.py", """try:
    from _functools import _lru_cache_wrapper
except ImportError:
    pass
""", """# SuperTools (wasm/python/patch-stdlib.py): the Python wrapper above is used; the C one nests C calls
""")
# an argument that cannot be hashed: the C wrapper hashes the key itself ("unhashable type: 'list'"); a dict lookup
# with the same key words it differently in 3.14 ("cannot use 'tuple' as a dict key (...)") — keep the C wording
change("functools.py", """    elif len(key) == 1 and type(key[0]) in fasttypes:
        return key[0]
    return key
""", """    elif len(key) == 1 and type(key[0]) in fasttypes:
        return key[0]
    hash(key)       # SuperTools: as the C wrapper does (same error for an unhashable argument)
    return key
""")
print("patch-stdlib: functools.lru_cache uses its Python wrapper")

change("hashlib.py", """    from _hashlib import pbkdf2_hmac
    __all__ += ('pbkdf2_hmac',)
except ImportError:
    pass
""", """    from _hashlib import pbkdf2_hmac
    __all__ += ('pbkdf2_hmac',)
except ImportError:
    # SuperTools (wasm/python/patch-stdlib.py): the pure-Python fallback of CPython 3.11
    _trans_5C = bytes((x ^ 0x5C) for x in range(256))
    _trans_36 = bytes((x ^ 0x36) for x in range(256))

    def pbkdf2_hmac(hash_name, password, salt, iterations, dklen=None):
        \"\"\"Password based key derivation function 2 (PKCS #5 v2.0) with HMAC as
        pseudorandom function.\"\"\"
        if not isinstance(hash_name, str):
            raise TypeError(f"pbkdf2_hmac() argument 'hash_name' must be str, not {type(hash_name).__name__}")
        def data(x):
            try:
                return bytes(memoryview(x))
            except TypeError:
                raise TypeError(f"a bytes-like object is required, not '{type(x).__name__}'") from None
        password = data(password)
        salt = data(salt)
        # Fast inline HMAC implementation
        inner = new(hash_name)
        outer = new(hash_name)
        blocksize = getattr(inner, 'block_size', 64)
        if len(password) > blocksize:
            password = new(hash_name, password).digest()
        password = password + b'\\x00' * (blocksize - len(password))
        inner.update(password.translate(_trans_36))
        outer.update(password.translate(_trans_5C))

        def prf(msg, inner=inner, outer=outer):
            # PBKDF2_HMAC uses the password as key. We can re-use the same
            # digest objects and just update copies to skip initialization.
            icpy = inner.copy()
            ocpy = outer.copy()
            icpy.update(msg)
            ocpy.update(icpy.digest())
            return ocpy.digest()

        if iterations < 1:
            raise ValueError("iteration value must be greater than 0.")
        if dklen is None:
            dklen = outer.digest_size
        if dklen < 1:
            raise ValueError("key length must be greater than 0.")

        dkey = b''
        loop = 1
        from_bytes = int.from_bytes
        while len(dkey) < dklen:
            prev = prf(salt + loop.to_bytes(4))
            # endianness doesn't matter here as long to / from use the same
            rkey = from_bytes(prev)
            for i in range(iterations - 1):
                prev = prf(prev)
                # rkey = rkey ^ prev
                rkey ^= from_bytes(prev)
            loop += 1
            dkey += rkey.to_bytes(inner.digest_size)

        return dkey[:dklen]

    __all__ += ('pbkdf2_hmac',)
""")
print("patch-stdlib: hashlib.pbkdf2_hmac has its Python fallback again")
