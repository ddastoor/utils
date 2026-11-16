// python.wasm (CPython 3.14.8, our build) + python314.zip, run through the same WASI host and in-memory filesystem the
// browser worker uses (src/lib/terminal/wasi.ts): version, stdlib modules (incl. zlib, decimal, zoneinfo + tzdata,
// hashlib, pyexpat, unicodedata, sqlite3 absent), input(), exit codes, tracebacks, files in and out, threads refused,
// sockets absent, clean exit (the zig libc thread-list fix), output limit, speed.
import { readFileSync } from 'node:fs';
export default async (t, { load }) => {
  const { runWasi, ProcExit, Abort } = await load('src/lib/terminal/wasi.ts');
  const { VFS } = await load('src/lib/terminal/vfs.ts');
  const mod = await WebAssembly.compile(readFileSync('src/wasm/bin/python.wasm')), zip = new Uint8Array(readFileSync('src/wasm/bin/python314.zip'));
  const enc = new TextEncoder(), dec = new TextDecoder();
  const py = (code, { stdin = '', files = {}, maxOutput } = {}) => {
    const vfs = new VFS(); vfs.mkdirp('/lib'); vfs.mkdirp('/home/user'); vfs.writeFile('/lib/python314.zip', zip);
    for (const [k, v] of Object.entries(files)) vfs.writeFile(`/home/user/${k}`, typeof v === 'string' ? enc.encode(v) : v);
    vfs.writeFile('/home/user/main.py', enc.encode(code));
    let out = '', err = '', code_ = 0;
    try { code_ = runWasi(mod, { args: ['python', '-u', 'main.py'], vfs, cwd: '/home/user', env: { PYTHONHOME: '/', PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', HOME: '/home/user', PWD: '/home/user' }, stdin: enc.encode(stdin), stdout: (b) => (out += dec.decode(b)), stderr: (b) => (err += dec.decode(b)), maxOutput, timeLimit: 60000 }); }
    catch (e) { if (e instanceof ProcExit || e instanceof Abort) code_ = e.code; else throw e; }
    return { out, err, code: code_, vfs };
  };
  let r = py('import sys; print(sys.version_info[:3], sys.platform)');
  t.eq([r.out, r.code], ['(3, 14, 8) wasi\n', 0], 'CPython 3.14.8 on wasi, exits 0 (no hang at shutdown)');
  r = py(`import zlib, decimal, fractions, statistics, hashlib, unicodedata, json, re, csv, io, gzip, zipfile, math, datetime, collections, itertools, dataclasses, enum, typing, xml.etree.ElementTree as ET, base64, struct, heapq, bisect, random, string, textwrap, difflib, pprint, uuid
print(zlib.crc32(b"abc"), decimal.Decimal("0.1") + decimal.Decimal("0.2"), fractions.Fraction(1, 3) + fractions.Fraction(1, 6), statistics.median([3, 1, 2]))
print(hashlib.sha256(b"abc").hexdigest()[:16], hashlib.md5(b"").hexdigest()[:8], unicodedata.name("₹"), json.dumps({"a": [1, 2]}), re.sub(r"\\d", "#", "a1b2"))
b = io.BytesIO(); z = zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED); z.writestr("x", "hi" * 50); z.close(); print(zipfile.ZipFile(b).read("x")[:4], gzip.decompress(gzip.compress(b"ok")))
print(ET.fromstring("<a><b>t</b></a>").find("b").text, math.comb(50, 25), 2 ** 100, base64.b64encode(b"hi").decode(), len(str(uuid.uuid4())))`);
  t.eq(r.out.split('\n').slice(0, 4), ['891568578 0.3 1/2 2', 'ba7816bf8f01cfea d41d8cd9 INDIAN RUPEE SIGN {"a": [1, 2]} a#b#', "b'hihi' b'ok'", 't 126410606437752 1267650600228229401496703205376 aGk= 36'], `standard library modules (${r.err.trim().split('\n').pop()})`);
  r = py('from zoneinfo import ZoneInfo\nfrom datetime import datetime\nprint(datetime(2026, 6, 1, 12, tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo("Asia/Kolkata")).isoformat(), datetime(2026, 7, 1, tzinfo=ZoneInfo("Europe/London")).utcoffset())');
  t.eq(r.out, '2026-06-01T17:30:00+05:30 1:00:00\n', 'zoneinfo with the bundled tzdata (Kolkata +5:30, London summer time)');
  r = py('a = input("Name? ")\nb = input()\nprint(f"[{a}|{b}]")\nimport sys\nprint(repr(sys.stdin.read()))', { stdin: 'Asha\nRavi\nrest\nof it' });
  t.eq(r.out, "Name? [Asha|Ravi]\n'rest\\nof it'\n", 'input() and sys.stdin');
  r = py('input()'); t.ok(r.code === 1 && /EOFError/.test(r.err), 'input() with no stdin → EOFError');
  r = py('def f(n):\n    return 10 / n\nprint("before")\nf(0)');
  t.ok(r.code === 1 && r.out === 'before\n' && /File "\/home\/user\/main.py", line 2, in f\n    return 10 \/ n/.test(r.err) && /ZeroDivisionError: division by zero/.test(r.err), 'traceback with file, line and source');
  r = py('import sys; sys.exit(3)'); t.eq(r.code, 3, 'sys.exit(3) → exit status 3');
  r = py('raise SystemExit("bye")'); t.ok(r.code === 1 && r.err.trim() === 'bye', 'SystemExit("bye") prints the message');
  r = py('print(1 +)'); t.ok(r.code === 1 && /SyntaxError/.test(r.err), 'syntax error');
  r = py('import math\nprint(math.fsum([0.1] * 10), round(2.675, 2), f"{1234567.891:,.2f}", 7 // -2, -7 % 3, 0.1 + 0.2 == 0.3)');
  t.eq(r.out, '1.0 2.67 1,234,567.89 -4 2 False\n', 'float/integer semantics match CPython');
  r = py('data = open("in.csv").read().splitlines()\nwith open("out.txt", "w") as f: f.write(str(len(data)))\nimport os\nos.makedirs("sub", exist_ok=True)\nopen("sub/x.bin", "wb").write(bytes(range(5)))\nprint(sorted(os.listdir(".")))', { files: { 'in.csv': 'a,b\n1,2\n3,4' } });
  t.ok(r.out === "['in.csv', 'main.py', 'out.txt', 'sub']\n" && dec.decode(r.vfs.readFile('/home/user/out.txt')) === '3' && r.vfs.readFile('/home/user/sub/x.bin').length === 5, 'reads given files, writes files and folders');
  r = py('import threading\ntry:\n    threading.Thread(target=print).start()\nexcept RuntimeError as e: print("no threads:", e)'); t.eq(r.out, "no threads: can't start new thread\n", 'threads refused cleanly');
  r = py('try:\n    import socket; socket.socket()\nexcept Exception as e: print(type(e).__name__)'); t.ok(/Error/.test(r.out), `no sockets (${r.out.trim()})`);
  r = py('import time; t = time.time(); time.sleep(0.2); print(time.time() - t >= 0.19)'); t.eq(r.out, 'True\n', 'time.sleep / time.time');
  r = py('import sys\nsys.setrecursionlimit(100000)\ndef f(n): return 0 if n == 0 else 1 + f(n - 1)\nprint(f(5000))'); t.eq(r.out, '5000\n', 'deep recursion (5000 frames)');
  r = py('while True: print("x" * 1000)', { maxOutput: 100000 }); t.eq(r.code, 141, 'endless output stopped by the output limit');
  const t0 = performance.now(); r = py('print(sum(i * i for i in range(3_000_000)))'); const ms = performance.now() - t0;
  t.ok(r.out === '8999995500000500000\n' && ms < 20000, `3 million iterations (${Math.round(ms)} ms including start-up)`);
};
