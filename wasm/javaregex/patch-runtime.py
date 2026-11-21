#!/usr/bin/env python3
"""patch-runtime.py IN OUT — TeaVM's WebAssembly GC runtime (wasm-gc-module-runtime.js from teavm-core) without code
made from strings. TeaVM builds its JavaScript glue with `new Function(…)`: 32 arities of call / construct helpers, the
wrappers of exported methods, global look-ups by name, and the scripts of @JSBody methods. That is eval — refused by a
Content-Security-Policy without 'unsafe-eval' — and this site loads no code from strings. Each one is replaced by a
closure that does the same; the one @JSBody script TeaVM's own classes ask for (`return str;`) has its closure in a
table, any other is refused (Norm calls normalize through a JSO class, not a script). Every replacement must apply, and no `new Function` / `eval(` may be left: a TeaVM whose runtime changed
stops the build here. Licence of the file: Apache-2.0 (TeaVM)."""
import sys

PATCHES = [
    ('''function getGlobalName(name) {
  let result = globalsCache.get(name);
  if (typeof result === "undefined") {
    result = new Function("return " + name + ";");
    globalsCache.set(name, result);
  }
  return result();
}
function setGlobalName(name, value) {
  new Function("value", name + " = value;")(value);
}''', '''function getGlobalName(name) {
  return name.split(".").reduce((o, k) => o[k], globalThis);
}
function setGlobalName(name, value) {
  const path = name.split("."), last = path.pop();
  path.reduce((o, k) => o[k], globalThis)[last] = value;
}'''),
    ('''  function defineFunction(fn, vararg) {
    const params = [];
    const paramsForString = [];
    for (let i = 0; i < fn.length; ++i) {
      const name = "p" + i;
      params.push(name);
      paramsForString.push(name);
    }
    if (vararg) {
      const last = paramsForString.length - 1;
      paramsForString[last] = "..." + paramsForString[last];
    }
    const paramsAsString = paramsForString.join(", ");
    return new Function(
      "rethrowJavaAsJs",
      "fn",
      `return function(${paramsAsString}) {
    try {
        return fn(${params.join(", ")});
    } catch (e) {
        rethrowJavaAsJs(e);
    }
};`
    )(rethrowJavaAsJs, fn);
  }
  function renameConstructor(name, c) {
    return new Function(
      "constructor",
      `return function ${name}(marker, javaObject) {
    return constructor.call(this, marker, javaObject);
}
`
    )(c);
  }''', '''  function spread(args, n, vararg) {
    const out = args.slice(0, vararg ? n - 1 : n);
    while (out.length < (vararg ? n - 1 : n)) out.push(void 0);
    if (vararg) out.push(args.slice(n - 1));
    return out;
  }
  function defineFunction(fn, vararg) {
    const n = fn.length;
    return function(...args) {
      try {
        return fn(...spread(args, n, vararg));
      } catch (e) {
        rethrowJavaAsJs(e);
      }
    };
  }
  function renameConstructor(name, c) {
    const f = function(marker, javaObject) {
      return c.call(this, marker, javaObject);
    };
    Object.defineProperty(f, "name", { value: name });
    return f;
  }'''),
    ('''    defineMethod(cls, name, fn, vararg) {
      const params = [];
      const paramsForString = [];
      for (let i = 1; i < fn.length; ++i) {
        const p = "p" + i;
        params.push(p);
        paramsForString.push(p);
      }
      if (vararg) {
        const last = paramsForString.length - 1;
        paramsForString[last] = "..." + paramsForString[last];
      }
      const paramsAsString = paramsForString.join(", ");
      cls.prototype[name] = new Function(
        "rethrowJavaAsJs",
        "fn",
        `return function(${paramsAsString}) {
    try {
        return fn(${["this", ...params].join(", ")});
    } catch (e) {
        rethrowJavaAsJs(e);
    }
};`
      )(rethrowJavaAsJs, fn);
    },''', '''    defineMethod(cls, name, fn, vararg) {
      const n = fn.length - 1;
      cls.prototype[name] = function(...args) {
        try {
          return fn(this, ...spread(args, n, vararg));
        } catch (e) {
          rethrowJavaAsJs(e);
        }
      };
    },'''),
    ('''  const argumentList = [];
  for (let i = 0; i < 32; ++i) {
    const args = argumentList.length === 0 ? "" : argumentList.join(", ");
    const argsAndBody = [...argumentList, "body"].join(", ");
    imports.teavmJso["createFunction" + i] = new Function(
      "wrapCallFromJavaToJs",
      ...argumentList,
      "body",
      `return new Function('wrapCallFromJavaToJs', ${argsAndBody}).bind(this, wrapCallFromJavaToJs);`
    ).bind(null, wrapCallFromJavaToJs);
    imports.teavmJso["bindFunction" + i] = (f, ...bindArgs) => f.bind(null, ...bindArgs);
    imports.teavmJso["callFunction" + i] = new Function(
      "rethrowJsAsJava",
      "fn",
      ...argumentList,
      `try {
    return fn(${args});
} catch (e) {
    rethrowJsAsJava(e);
}`
    ).bind(null, rethrowJsAsJava);
    imports.teavmJso["callMethod" + i] = new Function(
      "rethrowJsAsJava",
      "getGlobalName",
      "instance",
      "method",
      ...argumentList,
      `try {
    return instance !== null
        ? instance[method](${args})
        : getGlobalName(method)(${args});
} catch (e) {
    rethrowJsAsJava(e);
}`
    ).bind(null, rethrowJsAsJava, getGlobalName);
    imports.teavmJso["construct" + i] = new Function(
      "rethrowJsAsJava",
      "constructor",
      ...argumentList,
      `try {
    return new constructor(${args});
} catch (e) {
    rethrowJsAsJava(e);
}`
    ).bind(null, rethrowJsAsJava);
    imports.teavmJso["arrayOf" + i] = new Function(
      ...argumentList,
      "return [" + args + "]"
    );
    argumentList.push("p" + (i + 1));
  }''', '''  // The @JSBody scripts of TeaVM's own classes that java-regex.wasm asks for (TeaVM makes them from strings), as
  // closures: the parameter names and the script, joined, to the function. Any other script is refused.
  const knownScripts = new Map([
    ["str\\u0000return str;", (str) => str],
  ]);
  for (let i = 0; i < 32; ++i) {
    imports.teavmJso["createFunction" + i] = (...a) => {
      const body = a.pop();
      const f = knownScripts.get(a.join(",") + "\\u0000" + body);
      if (f === void 0) {
        throw new Error(`a @JSBody script this runtime has no closure for: function(${a.join(", ")}) { ${body} }`);
      }
      return f;
    };
    imports.teavmJso["bindFunction" + i] = (f, ...bindArgs) => f.bind(null, ...bindArgs);
    imports.teavmJso["callFunction" + i] = (fn, ...args) => {
      try {
        return fn(...args);
      } catch (e) {
        rethrowJsAsJava(e);
      }
    };
    imports.teavmJso["callMethod" + i] = (instance, method, ...args) => {
      try {
        return instance !== null ? instance[method](...args) : getGlobalName(method)(...args);
      } catch (e) {
        rethrowJsAsJava(e);
      }
    };
    imports.teavmJso["construct" + i] = (constructor, ...args) => {
      try {
        return new constructor(...args);
      } catch (e) {
        rethrowJsAsJava(e);
      }
    };
    imports.teavmJso["arrayOf" + i] = (...args) => args;
  }'''),
]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    s = open(src, encoding='utf-8').read()
    for old, new in PATCHES:
        if s.count(old) != 1:
            sys.exit(f'patch-runtime.py: a patch does not apply ({s.count(old)} places): {old[:70]!r}')
        s = s.replace(old, new, 1)
    head = ('// TeaVM 0.16.0 — the WebAssembly GC runtime (teavm-core: org/teavm/backend/wasm/wasm-gc-module-runtime.js),\n'
            '// Apache-2.0, Copyright Alexey Andreev and the TeaVM contributors. Patched by wasm/javaregex/patch-runtime.py:\n'
            '// no code made from strings (no Function constructor), so that it runs under a Content-Security-Policy without\n'
            "// 'unsafe-eval'. Generated by wasm/javaregex/build.sh — do not edit.\n")
    out = head + s
    for bad in ('new Function', 'eval('):
        if bad in out:
            sys.exit(f'patch-runtime.py: "{bad}" is still in the runtime')
    open(dst, 'w', encoding='utf-8').write(out)


if __name__ == '__main__':
    main()
