#!/usr/bin/env python3
"""Changes to CPython's own standard library for the browser build (run by build.sh on the copy that goes into
python314.zip). Each one must find its text exactly once, so that a new CPython version cannot slip past unnoticed.

1. functools.lru_cache / functools.cache: use the pure-Python wrapper that functools.py already contains instead of
   the C one. A call through the C wrapper nests C calls (wrapper -> function -> wrapper ...), and a browser's stack
   holds only about 240 such levels before RecursionError (see stack-guard.patch) — the classic memoised recursion
   `@cache def fib(n)` stopped at fib(241), where desktop Python reaches the recursion limit (1000). Calls through
   the Python wrapper are plain Python calls: no C nesting, so the only limit is sys.getrecursionlimit(), as on a
   desktop. Cost: a cached call takes a few hundred nanoseconds more.
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
print("patch-stdlib: functools.lru_cache uses its Python wrapper")
