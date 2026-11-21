# regex._regex in our build. The regex module's C extension (mrab-regex) is compiled into python.wasm as the built-in
# module _regex: a WebAssembly program cannot load an extension module from a file, and CPython's makesetup cannot give a
# built-in module a dotted name. The package imports its engine as regex._regex ("from regex import _regex"); this file
# (zipped as regex/_regex.py) hands it the built-in module under that name.
import sys
import _regex

sys.modules[__name__] = _regex
