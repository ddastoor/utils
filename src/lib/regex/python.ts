// The two Python flavours: Python's own re module, and the regex module (mrab-regex, PyPI "regex" — built into the same
// interpreter), in the CPython 3.14 the Python tab runs (our WebAssembly build, §5.1m). A fresh interpreter for each
// request (≈ 0.1 – 0.2 s), the request as JSON on its stdin, the answer as JSON on its stdout: compile errors,
// finditer's matches (Python's rule for empty matches), sub with its own template syntax — all the module's. Offsets
// are code points; the page turns them into its own.
import { runWasi, ProcExit } from '../terminal/wasi';
import { VFS } from '../terminal/vfs';
import { codePointIndex, COUNTED, fromOffsets, PatternError, SHOWN, type EngineOut, type EngineReq } from './common';

const SCRIPT = String.raw`
import json, sys
q = json.load(sys.stdin)
if q.get('module') == 'regex':
    import regex as re
    F = {'i': re.I, 'm': re.M, 's': re.S, 'x': re.X, 'a': re.A, 'V': re.V1, 'f': re.F, 'b': re.B, 'e': re.E, 'p': re.P, 'r': re.R, 'w': re.W}
    version = 'regex ' + re.__version__ + ' · Python ' + sys.version.split()[0]
else:
    import re
    F = {'i': re.I, 'm': re.M, 's': re.S, 'x': re.X, 'a': re.A}
    version = 'Python ' + sys.version.split()[0]
fl = 0
for c in q['flags']:
    fl |= F[c]
out = {'version': version}
try:
    rx = re.compile(q['pattern'], fl)
except re.error as e:
    out['error'] = str(e)
else:
    names = [''] * rx.groups
    for k, v in rx.groupindex.items():
        names[v - 1] = k
    ms, total = [], 0
    for m in rx.finditer(q['text']):
        if len(ms) < q['shown']:
            o = []
            for i in range(rx.groups + 1):
                o.extend(m.span(i))
            ms.append(o)
        total += 1
        if total >= q['counted']:
            break
    out.update(names=names, total=total, matches=ms)
    if q['rep'] is not None:
        try:
            out['replaced'] = rx.sub(q['rep'], q['text'], count=0 if q['all'] else 1)
        except (re.error, IndexError, ValueError) as e:
            out['repError'] = str(e)
sys.stdout.write(json.dumps(out))
`;

const enc = new TextEncoder();

/** `mod`: python.wasm compiled; `zip`: python314.zip (the standard library); `module`: re or regex. */
export function runPython(mod: WebAssembly.Module, zip: Uint8Array, q: EngineReq, module: 're' | 'regex' = 're'): EngineOut {
  const vfs = new VFS(); vfs.mkdirp('/lib'); vfs.mkdirp('/tmp'); vfs.writeFile('/lib/python314.zip', zip);
  let out = '', err = '';
  const dO = new TextDecoder(), dE = new TextDecoder();
  const req = { module, pattern: q.pattern, flags: q.flags, text: q.text, rep: q.replacement, all: q.all, shown: SHOWN, counted: COUNTED };
  let rc = 0;
  try {
    rc = runWasi(mod, {
      args: ['python', '-S', '-c', SCRIPT], vfs, cwd: '/tmp',
      env: { PYTHONHOME: '/', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1', PYTHONHASHSEED: '0' },
      stdin: enc.encode(JSON.stringify(req)), stdout: (b) => { out += dO.decode(b, { stream: true }); }, stderr: (b) => { err += dE.decode(b, { stream: true }); },
      maxOutput: 1 << 28, timeLimit: 600_000,
    });
  } catch (e) { if (e instanceof ProcExit) rc = e.code; else throw e; }
  let a: any;
  try { a = JSON.parse(out); } catch { throw new Error(`Python stopped (exit status ${rc}): ${err.trim().split('\n').pop() || 'no answer'}`); }
  if (a.error) throw new PatternError(a.error);
  const map = codePointIndex(q.text);
  return {
    total: a.total, names: a.names, version: a.version,
    matches: a.matches.map((o: number[]) => fromOffsets(q.text, o, map)),
    replaced: a.replaced ?? null, repError: a.repError,
  };
}
