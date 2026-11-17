// python.wasm (CPython 3.14.8, our build) + python314.zip, run through the same WASI host and in-memory filesystem the
// browser worker uses (src/lib/terminal/wasi.ts).
//   1. Against NATIVE CPython 3.14.8: tests/fixtures/python/reference.json (scripts/make-python-reference.py) holds
//      what the native interpreter prints for the programs in tests/fixtures/python/cases/*.py — the language, the
//      standard library, tracebacks of uncaught errors, input, files, asyncio, local time in 20 zones. Our build
//      must print the same, byte for byte, on stdout and stderr, and exit with the same status.
//   2. What native CPython cannot tell us: the changes we made to it (lru_cache in Python, recursion limit 2000,
//      hashlib.pbkdf2_hmac against RFC 6070, the recursion guard), local time against the zoneinfo module inside the
//      same interpreter (the browser's Intl against tzdata) for 51 zones, the host options the worker relies on
//      (line-wise stdin, per-call hook, abort reason), the modules that are missing (exactly the listed ones), the
//      hints the page gives (src/lib/python-hints.ts), limits and speed.
import { readFileSync, statSync } from 'node:fs';
export default async (t, { load }) => {
  const { runWasi, ProcExit } = await load('src/lib/terminal/wasi.ts');
  const { VFS } = await load('src/lib/terminal/vfs.ts');
  const { hint, ABSENT } = await load('src/lib/python-hints.ts');
  const mod = await WebAssembly.compile(readFileSync('src/wasm/bin/python.wasm')), zip = new Uint8Array(readFileSync('src/wasm/bin/python314.zip'));
  const ABBR = JSON.parse(readFileSync('src/lib/tzabbr.json', 'utf8')), REF = JSON.parse(readFileSync('tests/fixtures/python/reference.json', 'utf8'));
  const enc = new TextEncoder(), dec = new TextDecoder();
  const py = (code, { stdin = '', files = {}, maxOutput, tz = 'UTC', args = [], host = {} } = {}) => {
    const vfs = new VFS(); vfs.mkdirp('/lib'); vfs.mkdirp('/home/user'); vfs.mkdirp('/tmp'); vfs.writeFile('/lib/python314.zip', zip);
    for (const [k, v] of Object.entries(files)) vfs.writeFile(`/home/user/${k}`, typeof v === 'string' ? enc.encode(v) : v);
    vfs.writeFile('/home/user/main.py', enc.encode(code));
    let out = '', err = '', rc = 0, js = ''; const dO = new TextDecoder(), dE = new TextDecoder();
    try {
      rc = runWasi(mod, { args: ['python', '-u', 'main.py', ...args], vfs, cwd: '/home/user', timeZone: tz, timeZoneNames: ABBR[tz], stdinLines: true,
        env: { PYTHONHOME: '/', PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', HOME: '/home/user', PWD: '/home/user', LANG: 'C.UTF-8', COLUMNS: '80' },
        stdin: enc.encode(stdin), stdout: (b) => { out += dO.decode(b, { stream: true }); }, stderr: (b) => { err += dE.decode(b, { stream: true }); }, maxOutput: maxOutput ?? 1 << 26, timeLimit: 120000, ...host });
    } catch (e) { if (e instanceof ProcExit) rc = e.code; else { js = String(e); rc = -1; } }
    return { out, err, code: rc, vfs, js };
  };
  const where = (a, b) => {
    const A = a.split('\n'), B = b.split('\n');
    for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) {
      let j = 0; while (j < (A[i] || '').length && A[i][j] === (B[i] || '')[j]) j++;
      return `line ${i + 1}, column ${j + 1}: ours ${JSON.stringify((A[i] ?? '<nothing>').slice(Math.max(0, j - 30), j + 60))} — native ${JSON.stringify((B[i] ?? '<nothing>').slice(Math.max(0, j - 30), j + 60))}`;
    }
    return '';
  };

  // ------------------------------------------------------------------ 1. against native CPython
  t.eq(REF.python, '3.14.8', 'the reference was made by the same CPython version as the build');
  t.ok(REF.cases.length >= 69, `${REF.cases.length} reference programs`);
  for (const c of REF.cases) {
    const r = py(c.code, { stdin: c.stdin || '', files: c.files || {}, tz: c.tz || 'UTC' });
    const bad = [r.js, r.out !== c.out && `stdout ${where(r.out, c.out)}`, c.err !== null && r.err !== c.err && `stderr ${where(r.err, c.err)}`, r.code !== c.rc && `exit status ${r.code}, native ${c.rc}`].filter(Boolean);
    t.ok(!bad.length, `${c.file} › ${c.name}: prints what native CPython prints${c.err === null ? ' (stdout, status)' : ''} ${bad.join(' ; ')}`);
  }

  // ------------------------------------------------------------------ 2a. basics, known answers
  let r = py('import sys; print(sys.version_info[:3], sys.platform, sys.maxsize == 2 ** 31 - 1)');
  t.eq([r.out, r.code], ['(3, 14, 8) wasi True\n', 0], 'CPython 3.14.8 on wasi (32-bit), exits 0 (no hang at shutdown)');
  r = py('from zoneinfo import ZoneInfo\nfrom datetime import datetime\nprint(datetime(2026, 6, 1, 12, tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo("Asia/Kolkata")).isoformat(), datetime(2026, 7, 1, tzinfo=ZoneInfo("Europe/London")).utcoffset(), ZoneInfo("Asia/Calcutta").utcoffset(datetime(2026, 1, 1)))');
  t.eq(r.out, '2026-06-01T17:30:00+05:30 1:00:00 5:30:00\n', 'zoneinfo with the bundled tzdata (Kolkata +5:30, London summer time, the old name Asia/Calcutta)');
  r = py('input()'); t.ok(r.code === 1 && /EOFError/.test(r.err), 'input() with no stdin → EOFError');
  r = py('print(1 +)'); t.ok(r.code === 1 && /SyntaxError/.test(r.err), 'syntax error');
  r = py('data = open("in.csv").read().splitlines()\nwith open("out.txt", "w") as f: f.write(str(len(data)))\nimport os\nos.makedirs("sub", exist_ok=True)\nopen("sub/x.bin", "wb").write(bytes(range(5)))\nprint(sorted(os.listdir(".")))', { files: { 'in.csv': 'a\nb\nc\n' } });
  t.ok(r.out === "['in.csv', 'main.py', 'out.txt', 'sub']\n" && dec.decode(r.vfs.readFile('/home/user/out.txt')) === '3' && r.vfs.readFile('/home/user/sub/x.bin').length === 5, 'reads given files, writes files and folders');
  r = py('import threading\ntry:\n    threading.Thread(target=print).start()\nexcept RuntimeError as e: print("no threads:", e)'); t.eq(r.out, "no threads: can't start new thread\n", 'threads refused cleanly');
  r = py('import socket, urllib.request\nfor f in (lambda: socket.socket(), lambda: urllib.request.urlopen("http://example.com"), lambda: socket.getaddrinfo("example.com", 80)):\n    try: f()\n    except OSError as e: print(type(e).__name__, "there is no network here" in str(e))');
  t.eq(r.out, 'OSError True\nURLError True\ngaierror True\n', 'no network: sockets, urllib and name lookups say so with an OSError');
  r = py('import time; t = time.time(); time.sleep(0.2); print(time.time() - t >= 0.19, time.time() > 1.78e9, time.monotonic() > 0, time.perf_counter() >= 0)'); t.eq(r.out, 'True True True True\n', 'time.sleep and the clocks');
  r = py('while True: print("x" * 1000)', { maxOutput: 100000 }); t.eq(r.code, 141, 'endless output stopped by the output limit');
  let t0 = performance.now(); r = py('print(sum(i * i for i in range(3_000_000)))'); let ms = performance.now() - t0;
  t.ok(r.out === '8999995500000500000\n' && ms < 20000, `3 million iterations (${Math.round(ms)} ms including start-up)`);
  const size = statSync('src/wasm/bin/python.wasm').size + statSync('src/wasm/bin/python314.zip').size;
  t.ok(size > 12.2e6 && size < 13.4e6, `the page says "the first run loads about 13 MB": interpreter + library are ${(size / 1e6).toFixed(1)} MB`);

  // ------------------------------------------------------------------ 2b. what we changed in CPython
  r = py('import sys, functools\nprint(sys.getrecursionlimit(), type(functools.lru_cache(len)).__name__)');
  t.eq(r.out, '2000 function\n', 'a program starts with a recursion limit of 2000, and lru_cache is the Python wrapper');
  r = py('from functools import cache\n@cache\ndef fib(n): return n if n < 2 else fib(n - 1) + fib(n - 2)\nprint(fib(900) % 10 ** 12, fib.cache_info())');
  t.eq(r.out, '246652938800 CacheInfo(hits=898, misses=901, maxsize=None, currsize=901)\n', `memoised recursion 900 deep (as deep as desktop Python goes) ${r.err.trim().split('\n').pop()}`);
  r = py('import sys, functools\nsys.setrecursionlimit(10 ** 6)\n@functools.lru_cache(maxsize=None)\ndef d(n): return 0 if n == 0 else 1 + d(n - 1)\nprint(d(60000))');
  t.eq(r.out, '60000\n', `a cached function 60,000 levels deep with a raised limit — it nests no C calls ${r.err.trim().split('\n').pop()}`);
  r = py('def f(n): return f(n + 1)\ntry: f(0)\nexcept RecursionError as e: print(e)');
  t.eq(r.out, 'maximum recursion depth exceeded\n', 'endless plain recursion: the ordinary RecursionError');
  r = py('import hashlib\nfor a in [(b"password", b"salt", 1, 20), (b"password", b"salt", 2, 20), (b"password", b"salt", 4096, 20), (b"passwordPASSWORDpassword", b"saltSALTsaltSALTsaltSALTsaltSALTsalt", 4096, 25), (b"pass\\0word", b"sa\\0lt", 4096, 16)]: print(hashlib.pbkdf2_hmac("sha1", *a).hex())\nprint("pbkdf2_hmac" in hashlib.__all__, hasattr(hashlib, "scrypt"))');
  t.eq(r.out, '0c60c80f961f0e71f3a9b524af6012062fe037a6\nea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957\n4b007901b765489abead49d926f721d065a429c1\n3d2eec4fe41c849b80c8d83662c0e44a8b291a964cf2f07038\n56fa6aa75548099dcc37d7f03425e0c3\nTrue False\n', 'hashlib.pbkdf2_hmac (put back in pure Python): the five quick test vectors of RFC 6070; scrypt stays absent');
  t0 = performance.now(); r = py('import hashlib\nprint(hashlib.pbkdf2_hmac("sha256", b"password", b"salt", 100000).hex())'); ms = performance.now() - t0;
  t.ok(r.out === '0394a2ede332c9a13eb82e9b24631604c31df978b4e2f0fbd2c549944f9d79a5\n' && ms < 30000, `pbkdf2_hmac, SHA-256, 100,000 iterations: right, in ${Math.round(ms)} ms`);

  // nested calls: a known depth works, endless nesting ends in RecursionError — never in a JavaScript stack overflow
  r = py(`import sys, json, functools, pickle, copy, re
sys.setrecursionlimit(1_000_000)
def check(name, fn):
    try: print(name, "->", fn())
    except RecursionError: print(name, "-> RecursionError")
    except Exception as e: print(name, "->", type(e).__name__, e)
def nest(n):
    x = []
    for _ in range(n): x = [x]
    return x
def plain(n): return 0 if n == 0 else 1 + plain(n - 1)
def keyed(n):
    if n == 0: return 0
    box = []
    sorted([1], key=lambda _: box.append(keyed(n - 1)) or 0)
    return box[0] + 1
class R:
    def __init__(self, n): self.n = n
    def __repr__(self): return "r" if self.n == 0 else repr(R(self.n - 1))
    def __eq__(self, o): return self.n == 0 or R(self.n - 1) == o
    def __format__(self, spec): return "f" if self.n == 0 else format(R(self.n - 1), spec)
    def __getattr__(self, k): return getattr(self, k + "x")
def gen(n):
    if n: yield from gen(n - 1)
    else: yield 1
for name, fn in [
    ("plain 50000", lambda: plain(50000)),
    ("sorted key 100", lambda: keyed(100)), ("sorted key endless", lambda: keyed(10**6)),
    ("__repr__ 250", lambda: repr(R(250))), ("__repr__ endless", lambda: repr(R(10**6))),
    ("__eq__ 250", lambda: R(250) == 1), ("__eq__ endless", lambda: R(10**6) == 1),
    ("__format__ 200", lambda: format(R(200), "")), ("__format__ endless", lambda: format(R(10**6), "")),
    ("__getattr__ endless", lambda: R(0).missing),
    ("json.loads 900", lambda: len(json.loads("[" * 900 + "]" * 900))), ("json.loads 100000", lambda: len(json.loads("[" * 100000 + "]" * 100000))),
    ("json.dumps 800", lambda: len(json.dumps(nest(800)))), ("json.dumps 100000", lambda: len(json.dumps(nest(100000)))),
    ("repr 800", lambda: len(repr(nest(800)))), ("repr 100000", lambda: len(repr(nest(100000)))),
    ("== 800", lambda: nest(800) == nest(800)), ("== 100000", lambda: nest(100000) == nest(100000)),
    ("pickle 350", lambda: len(pickle.loads(pickle.dumps(nest(350))))), ("pickle 100000", lambda: len(pickle.dumps(nest(100000)))),
    ("compile 450", lambda: type(compile("+".join(["a"] * 450), "x", "eval")).__name__), ("compile 100000", lambda: type(compile("+".join(["a"] * 100000), "x", "eval")).__name__),
    ("deepcopy 2000", lambda: len(copy.deepcopy(nest(2000)))),
    ("generators 2000", lambda: list(gen(2000))),
    ("re groups 300", lambda: bool(re.compile("(" * 300 + "a" + ")" * 300).match("a"))),
]: check(name, fn)
print("still alive")
`);
  const WANT = ['plain 50000 -> 50000', 'sorted key 100 -> 100', 'sorted key endless -> RecursionError', '__repr__ 250 -> r', '__repr__ endless -> RecursionError', '__eq__ 250 -> True', '__eq__ endless -> RecursionError',
    '__format__ 200 -> f', '__format__ endless -> RecursionError', '__getattr__ endless -> RecursionError', 'json.loads 900 -> 1', 'json.loads 100000 -> RecursionError', 'json.dumps 800 -> 1602', 'json.dumps 100000 -> RecursionError',
    'repr 800 -> 1602', 'repr 100000 -> RecursionError', '== 800 -> True', '== 100000 -> RecursionError', 'pickle 350 -> 1', 'pickle 100000 -> RecursionError', 'compile 450 -> code', 'compile 100000 -> RecursionError',
    'deepcopy 2000 -> 1', 'generators 2000 -> [1]', 're groups 300 -> True', 'still alive'];
  const got = r.out.trimEnd().split('\n');
  for (let i = 0; i < WANT.length; i++) t.eq(got[i], WANT[i], `nested calls: ${WANT[i].replace(' -> ', ' → ')} ${r.js}`);
  r = py('class Node:\n    def __init__(self, nxt): self.next = nxt\n    def __repr__(self): return "N" + repr(self.next)\nn = None\nfor _ in range(600): n = Node(n)\nprint(len(repr(n)))');
  t.ok(r.code === 1 && /RecursionError: Stack overflow \(used \d+ kB\)/.test(r.err) && !r.js, `an uncaught overflow of nested C calls is Python's own RecursionError (${r.err.trim().split('\n').pop()})`);

  // ------------------------------------------------------------------ 2c. local time: the browser's Intl against the tzdata inside the build
  const ZONES = ['Asia/Kolkata', 'Asia/Calcutta', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/St_Johns',
    'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'Europe/Istanbul', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Cairo', 'Asia/Dubai', 'Asia/Tehran', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Dhaka',
    'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Australia/Adelaide', 'Pacific/Auckland', 'UTC',
    'Africa/Casablanca', 'Africa/Windhoek', 'America/Caracas', 'America/Santiago', 'Antarctica/Troll', 'Asia/Almaty', 'Asia/Colombo', 'Asia/Kabul', 'Asia/Pyongyang', 'Asia/Yangon', 'Atlantic/Azores',
    'Australia/Lord_Howe', 'Europe/Kyiv', 'Europe/Lisbon', 'Europe/Minsk', 'Pacific/Apia', 'Pacific/Chatham', 'Pacific/Kiritimati', 'America/Nuuk'];
  // the truth: inside the zone file's list of transitions, the file's own offset / flag / name (what a C library
  // reads); after its end, where a yearly rule takes over, what the zoneinfo module works out from that rule
  const CONSIST = `import time, datetime, sys, bisect
from zoneinfo import ZoneInfo, _common
z = ZoneInfo(sys.argv[1]); bad = []; n = 0
with _common.load_tzdata(sys.argv[1]) as f: idx, trans, utcoff, isdst, abbr, rule = _common.load_data(f)
for ts in range(0, 2_100_000_000, int(sys.argv[2])):
    lt = time.localtime(ts); d = datetime.datetime.fromtimestamp(ts, z); n += 1
    i = bisect.bisect_right(trans, ts) - 1
    truth = (utcoff[idx[i]], abbr[idx[i]], isdst[idx[i]]) if 0 <= i < len(trans) - 1 else (int(d.utcoffset().total_seconds()), d.tzname(), int(bool(d.dst())))
    a = (lt.tm_gmtoff, lt.tm_zone, lt.tm_isdst, tuple(lt[:6]), int(time.mktime(lt)))
    b = truth + ((d.year, d.month, d.day, d.hour, d.minute, d.second), ts)
    if a != b: bad.append((ts, a, b))
print(n, len(bad), bad[:2])
`;
  // (Moscow kept its summer offset as standard time in 2011, Karachi's "+05" became "PKT" in 1971, Istanbul stayed
  // on +03 in 2016, Argentina's daylight time of 1999 had the standard offset: tzabbr.json lists such periods.
  // Not in the list: zones whose rules differ between the tzdata in the build and this Node's ICU, e.g. Havana.)
  for (const zone of ZONES) {
    r = py(CONSIST, { tz: zone, args: [zone, '3654321'] });
    t.eq(r.out, '575 0 []\n', `${zone}: time.localtime / mktime (offsets from the host's Intl, daylight flag and names by tzabbr.json) agree with the tzdata inside the build on 575 moments from 1970 to 2036 ${r.err.trim().split('\n').pop()}`);
  }
  const lt = 'import time\nprint(time.tzname, time.timezone, time.strftime("%Z %z", time.localtime(1750000000)), time.strftime("%Z", time.localtime(1765000000)))';
  t.eq(py(lt, { tz: 'Asia/Calcutta' }).out, py(lt, { tz: 'Asia/Kolkata' }).out, 'the name browsers report for India (Asia/Calcutta) gives the same local time as Asia/Kolkata');
  t.eq(py(lt, { tz: 'Europe/Dublin' }).out, "('GMT', 'IST') 0 IST +0100 GMT\n", 'Europe/Dublin: IST in summer, GMT in winter (which tzdata counts as the daylight one; time.tzname goes by January and July, as in CPython)');
  t.eq(py(lt, { tz: 'Asia/Dubai' }).out, "('+04', '+04') -14400 +04 +0400 +04\n", 'Asia/Dubai: tzdata\'s "+04", not Intl\'s "GST"');
  r = py(lt, { tz: 'Asia/Dubai', host: { timeZoneNames: undefined } });
  t.ok(/^\('[\w+]+', '[\w+]+'\) -14400 /.test(r.out), `without the table of names the host still answers, with Intl's abbreviation (${r.out.trim()})`);
  t.eq(py(lt, { tz: 'Not/AZone' }).out, "('UTC', 'UTC') 0 UTC +0000 UTC\n", 'an unknown zone falls back to UTC');
  t.ok(Object.keys(ABBR).length > 550 && ABBR['Asia/Kolkata'] === '19800/0=IST' && /^-14400\/1=EDT -18000\/0=EST/.test(ABBR['America/New_York']), `tzabbr.json: ${Object.keys(ABBR).length} zones`);

  // ------------------------------------------------------------------ 2d. host options the worker relies on
  const reads = []; let calls = 0;
  r = py('a = input("A? ")\nb = input()\nimport sys\nrest = sys.stdin.read()\nprint([a, b, rest])', { stdin: 'x\ny\nz1\nz2', host: { onStdinRead: (b) => reads.push(dec.decode(b)), onCall: () => { calls++; } } });
  t.eq([r.out, reads.slice(0, 4), reads[reads.length - 1]], ["A? ['x', 'y', 'z1\\nz2']\n", ['x\n', 'y\n', 'z1\n', 'z2'], ''], 'stdin is handed over one line per read (what each input() took is known), the end as an empty read; the program sees all of it');
  t.ok(calls > 20, `the per-call hook runs at every system call (${calls} calls for a small program)`);
  let why = ''; r = py('while True: print("x" * 1000)', { maxOutput: 50000, host: { onAbort: (w) => { why = w; } } });
  t.eq([r.code, why], [141, 'output'], 'the host says why it stopped a program (output limit)');
  why = ''; r = py('while True: open("f", "w").close()', { host: { timeLimit: 300, onAbort: (w) => { why = w; } } });
  t.eq([r.code, why], [124, 'time'], 'and when the time limit ends it');
  r = py('import sys\nsys.stdout.buffer.write(b"\\xe0\\xa4"); sys.stdout.buffer.write(b"\\xa8\\n")');
  t.eq(r.out, 'न\n', 'a UTF-8 character split across two writes');

  // ------------------------------------------------------------------ 2e. modules that are not there, and the page's hints
  r = py(`import sys, importlib, io, contextlib
bad = []
for n in sorted(n for n in sys.stdlib_module_names if not n.startswith("_") and n not in ("this", "antigravity")):
    try:
        with contextlib.redirect_stdout(io.StringIO()): importlib.import_module(n)
    except ImportError: bad.append(n)
print(" ".join(bad))
`);
  t.eq(r.out.trim().split(' ').sort(), Object.keys(ABSENT).sort(), `the standard modules that cannot be imported are exactly the ${Object.keys(ABSENT).length} the page has an explanation for`);
  r = py('import tarfile, io\nfor m in ("w:bz2", "w:xz"):\n    try: tarfile.open(fileobj=io.BytesIO(), mode=m)\n    except tarfile.CompressionError as e: print(e)');
  t.eq(r.out, 'bz2 module is not available\nlzma module is not available\n', '.tar.bz2 and .tar.xz say plainly that their module is missing');
  const tail = (code, o) => { const x = py(code, o); return hint(x.err); };
  t.ok(/“numpy” is not part of Python's standard library, and this tab cannot install packages \(no pip\)\..*as numpy\.py/.test(tail('import numpy.linalg')), 'hint: a package that is not there');
  t.ok(/“_mine” .* as _mine\.py/.test(tail('import _mine')), 'hint: a module of one\'s own keeps its name');
  for (const [m, re] of [['sqlite3', /its C library/], ['bz2', /its C library/], ['lzma', /its C library/], ['ctypes', /its C library/], ['curses', /its C library/], ['ssl', /network connections/], ['tkinter', /desktop window/], ['turtle', /desktop window/], ['termios', /Unix system/], ['mmap', /Unix system/], ['winreg', /Windows only/], ['venv', /cannot be installed/], ['compression.zstd', /its C library/], ['multiprocessing.synchronize', /more than one thread or process/]])
    t.ok(/part of Python, but it cannot be used here/.test(tail(`import ${m}`)) && re.test(tail(`import ${m}`)), `hint: import ${m} → ${tail(`import ${m}`).slice(0, 110)}`);
  t.ok(/more input than the Input box holds/.test(tail('input("x? ")')), 'hint: input() with nothing left to read');
  t.ok(/more memory than a browser tab can give/.test(tail('x = [0] * 10 ** 9')), 'hint: MemoryError');
  t.ok(/Threads cannot start here/.test(tail('import threading\nthreading.Thread(target=print).start()')), 'hint: threads');
  t.ok(/cannot start other programs here/.test(tail('import subprocess\nsubprocess.run(["ls"])')) && /cannot start other programs here/.test(tail('import os\nos.system("ls")')), 'hint: other programs (subprocess, os.system)');
  t.ok(/nested more deeply than a browser tab allows/.test(tail('class N:\n    def __repr__(self): return repr(N())\nrepr(N())')), 'hint: nesting depth');
  t.eq([tail('1 / 0'), tail('print("fine")'), tail('raise ValueError("ModuleNotFoundError: No module named \'x\' is only quoted here")'), hint(''), hint('MemoryErrorish: no'), hint('EOFErrors happen')], ['', '', '', '', '', ''], 'no hint where Python\'s own words are enough');
};
