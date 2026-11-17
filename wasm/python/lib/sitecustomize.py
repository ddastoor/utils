"""SuperTools: runs when the interpreter starts (wasm/python/lib, added to python314.zip by build.sh).

One job: the first time a program imports asyncio, give it an event loop that works without sockets and threads
(_supertools_asyncio). Nothing is imported here until then, so starting Python costs nothing extra."""
import sys

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
                import _supertools_asyncio
                _supertools_asyncio.install(module)
            def __getattr__(self, name): return getattr(real, name)   # get_code, get_source, is_package, …
        spec.loader = Loader()
        return spec

sys.meta_path.insert(0, _AsyncioHook())
