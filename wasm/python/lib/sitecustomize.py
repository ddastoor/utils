"""SuperUtils: runs when the interpreter starts (wasm/python/lib, added to python314.zip by build.sh).

Two jobs:
1. The first time a program imports asyncio, give it an event loop that works without sockets and threads
   (_superutils_asyncio). Nothing is imported here until then, so starting Python costs nothing extra.
2. The recursion limit starts at 2000, not 1000. In this build functools.lru_cache / cache is the Python wrapper
   (wasm/python/patch-stdlib.py), which adds one Python frame to every level of a cached recursive function; with
   2000 such a function reaches the depth it reaches on a desktop (just under 1000). Plain Python recursion uses no
   C stack in CPython 3.14, so the higher limit costs nothing; sys.setrecursionlimit() works as always."""
import sys

sys.setrecursionlimit(2000)

class _AsyncioHook:
    def find_spec(self, name, path=None, target=None):
        if name != "asyncio": return None
        sys.meta_path.remove(self)                              # once; the lookup below must not come back here
        import importlib.util
        spec = importlib.util.find_spec("asyncio")
        if spec is None or spec.loader is None: return spec
        real = spec.loader
        class Loader:
            def create_module(self, spec): return real.create_module(spec) if hasattr(real, "create_module") else None
            def exec_module(self, module):
                real.exec_module(module)
                import _superutils_asyncio
                _superutils_asyncio.install(module)
            def __getattr__(self, name): return getattr(real, name)   # get_code, get_source, is_package, …
        spec.loader = Loader()
        return spec

sys.meta_path.insert(0, _AsyncioHook())
