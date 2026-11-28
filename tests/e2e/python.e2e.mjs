// Python Scratchpad (#/python, PC only), in Chromium.
//   Loading: nothing of Python before the first Run; a failed download is reported and the next Run tries again.
//   Samples: every sample prints what the host's native CPython prints for the same code and input.
//   Output pane: text appears while the program still computes (also without a single system call), a flood of
//   300,000 lines does not freeze the page (it took 92 s before the rewrite), only the end stays on screen while Copy
//   and Save give everything, a 3-million-character line, the 32 MB limit, Stop during a flood; \r progress bars and
//   \b spinners show their last state, colours are colours, a cleared screen is cleared.
//   Input: a line that answers a prompt is echoed as a terminal would; no echo for data read without a prompt; the
//   prompt that finds no more input gets a plain hint.
//   Hints: packages that are not there, standard modules that cannot work here, a module of one's own, threads,
//   memory, nesting depth, other programs.
//   Local time: the browser's zone (Kolkata, New York, London, Sydney, Dubai, UTC) against native CPython with TZ set.
//   Recursion in the browser: a cached function recurses as deep as plain Python (lru_cache is the Python one in our
//   build); eleven ways of nesting calls through C code work at a known depth and end in RecursionError — never in a
//   crashed tab — when they do not stop.
//   Files in and out (bytes checked, .zip of all, a changed input file, folders), keyboard (Tab, auto-indent, undo,
//   Ctrl+Enter), .py open / download, Clear, worker released on leave, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { hookClipboard, copied } from './_devdata.mjs';
import { execFileSync } from '../lib/child.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { unzipSync } = createRequire(import.meta.url)('fflate');

// (Windows: a text-mode stdout writes every "\n" as "\r\n" — turned back, which gives a program's own "\r\n" back too)
const native = (src, input = '', env = {}) => { try { const out = execFileSync('python3', ['-c', src], { input, env: { ...process.env, PYTHONUTF8: '1', TZ: 'UTC', ...env } }).toString(); return process.platform === 'win32' ? out.replace(/\r\n/g, '\n') : out; } catch { return null; } };

export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const open = async (opts) => {
    const page = await newPage(opts); page.reqs = [];
    page.on('request', (r) => page.reqs.push(r.url()));
    await page.goto(`${base}#/python`);
    await page.getByRole('textbox', { name: 'Python code' }).waitFor(); await page.waitForTimeout(300);
    return page;
  };
  /** What the output card shows, read in one go. */
  const read = (page) => page.evaluate(() => {
    const pre = document.querySelector('pre.py-out'), st = pre.previousElementSibling, [cut, body, cur] = pre.children;
    const t = (sel) => [...pre.querySelectorAll(sel)].map((e) => e.textContent).join('');
    return { text: body.textContent + cur.textContent, cut: cut.hidden ? '' : cut.textContent, err: t('.term-err'), echo: t('.term-in'), status: st.querySelector('.note-ok, .note-warn')?.textContent || '', hint: [...st.querySelectorAll('.note-info')].map((e) => e.textContent).join(' '), files: pre.nextElementSibling.textContent };
  });
  const start = async (page, src, stdin) => {
    await page.getByRole('textbox', { name: 'Python code' }).fill(src);
    if (stdin !== undefined) await page.getByRole('textbox', { name: 'Input' }).fill(stdin);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
  };
  const finish = async (page, timeout = 60000) => {
    await page.waitForFunction(() => !!document.querySelector('pre.py-out').previousElementSibling.querySelector('.note-ok, .note-warn'), null, { timeout });
    return read(page);
  };
  const run = async (page, src, stdin, timeout) => { await start(page, src, stdin); return finish(page, timeout); };

  // ---------------------------------------------------------------- loading
  const page = await open();
  ok(!page.reqs.some((u) => /python\.worker|python[-.][^/]*\.wasm|python314/.test(u)), 'nothing of Python is downloaded before the first Run');
  await start(page, 'print("first")');
  ok(/Starting Python \(the first run loads about 15\.4 MB\)/.test(await page.locator('.note-info').first().textContent().catch(() => '')), 'the first run says what it is loading');
  let r = await finish(page, 90000);
  ok(r.text === 'first\n' && /^Finished in [\d.]+ s\.$/.test(r.status), `first run (${r.status})`);
  ok(page.reqs.filter((u) => /python[-.][^/]*\.wasm|python314/.test(u)).length === 2, 'the first Run fetched the interpreter and its library, once each');

  // ---------------------------------------------------------------- samples against native CPython
  const chips = page.locator('.card .chips').first().locator('button'), n = await chips.count(), code = page.getByRole('textbox', { name: 'Python code' });
  let same = 0, checked = 0;
  for (let i = 0; i < n; i++) {
    const name = (await chips.nth(i).textContent()).trim(); await chips.nth(i).click();
    if (name === 'Hello') await page.getByRole('textbox', { name: 'Input' }).fill('Asha');
    await page.getByRole('button', { name: 'Run', exact: true }).click(); r = await finish(page);
    if (name === 'Speed test') { ok(/^17984 primes below 200 000 in [\d.]+ s\n$/.test(r.text), `speed test sample (${r.text.trim()})`); continue; }
    if (name === 'Write a file') { ok(/Wrote people.json/.test(r.text) && /2 files written/.test(r.files), 'write-a-file sample runs and offers its two files'); continue; }
    let want = native(await code.inputValue(), name === 'Hello' ? 'Asha' : '');
    if (want == null) { info(`native python3 failed for ${name}`); continue; }
    if (name === 'Hello') want = want.replace('What is your name? ', 'What is your name? Asha\n');       // the echoed answer
    checked++; if (r.text === want) same++; else info(`${name}: got ${JSON.stringify(r.text).slice(0, 200)} want ${JSON.stringify(want).slice(0, 200)}`);
  }
  ok(same === checked && checked >= 5, `${same}/${checked} samples print exactly what native CPython prints (the answer to input() echoed after its prompt)`);

  // ---------------------------------------------------------------- output while the program runs
  await start(page, 'import time\nfor i in range(4):\n    print("tick", i)\n    time.sleep(0.4)\n');
  await page.waitForFunction(() => document.querySelector('pre.py-out').textContent.includes('tick 1'), null, { timeout: 20000 });
  ok(!(await read(page)).text.includes('tick 3'), 'output appears while the program is still running');
  await finish(page);
  await start(page, 'print("one")\nprint("two")\nprint(sum(i * i for i in range(25_000_000)) % 1000)\n');
  await page.waitForTimeout(700); r = await read(page);
  ok(r.text === 'one\ntwo\n' && !r.status, `both lines printed before a long computation are on screen during it — it makes no system call that could carry them (${JSON.stringify(r.text)})`);
  r = await finish(page); ok(/^one\ntwo\n\d+\n$/.test(r.text), 'the computation then finishes');
  await start(page, 'for i in range(5000): print("row", i)\nprint(sum(i * i for i in range(25_000_000)) % 1000)\n');
  await page.waitForTimeout(900); r = await read(page);
  const rows = r.text.split('\n').length - 1;
  ok(!r.status && rows >= 4500, `a burst of 5,000 lines followed by a silent computation: ${rows} lines are on screen during it (the worker can hold back at most a millisecond of a flood)`);
  r = await finish(page); ok(r.text.split('\n').length - 1 === 5001, 'and all 5,001 lines at the end');
  await start(page, 'import time\nfor i in range(1, 6):\n    print(f"\\rstep {i} of 5", end="")\n    time.sleep(0.35)\nprint()\n');
  await page.waitForTimeout(900); r = await read(page);
  ok(/^step [2-4] of 5$/.test(r.text), `a progress line rewritten with \\r shows one line while it runs (${JSON.stringify(r.text)})`);
  r = await finish(page); ok(r.text === 'step 5 of 5\n', 'and its last state at the end');

  // ---------------------------------------------------------------- floods
  await hookClipboard(page);
  let t0 = Date.now(); r = await run(page, 'for i in range(300000): print(i)', undefined, 120000); let ms = Date.now() - t0;
  const FULL = 1988890;       // the characters of "0\n1\n … 299999\n"
  ok(ms < 20000 && r.text.endsWith('299998\n299999\n') && /^Finished/.test(r.status), `300,000 printed lines: done in ${(ms / 1000).toFixed(1)} s (${r.status}) — the page used to freeze for 90 s`);
  const hiddenN = +(/first ([\d,]+) characters/.exec(r.cut)?.[1] || '0').replace(/,/g, '');
  ok(r.text.length <= 620000 && hiddenN + r.text.length === FULL && /Copy or Save gives all of it/.test(r.cut), `only the end stays on screen (${r.text.length} characters), with a remark that ${hiddenN} earlier ones are not shown`);
  ok(/^\d+\n/.test(r.text), 'what stays on screen starts at a line start');
  ok(await page.evaluate(() => { const p = document.querySelector('pre.py-out'); return p.scrollHeight - p.scrollTop - p.clientHeight < 40; }), 'the pane has followed the output to its end');
  await page.getByRole('button', { name: 'Copy output' }).click(); await page.waitForTimeout(200);
  let all = (await copied(page)).pop();
  ok(all.length === FULL && all.startsWith('0\n1\n2\n') && all.endsWith('299999\n'), 'Copy output gives all of it');
  let d = await download(page, () => page.getByRole('button', { name: 'Save output' }).click());
  ok(readFileSync(d, 'utf8') === all, 'Save output writes the same text to output.txt');
  r = await run(page, 'print("x" * 3_000_000)\nprint("end")');
  ok(r.text.length < 200000 + 200 && r.text.startsWith('xxxx') && /28,00,000 more characters on this line are not shown here/.test(r.text) && r.text.endsWith('\nend\n') && !r.cut, `a line of 3 million characters is cut on screen with a remark, and what follows it stays (${r.text.length} characters shown)`);
  await page.getByRole('button', { name: 'Copy output' }).click(); await page.waitForTimeout(200); all = (await copied(page)).pop();
  ok(all.length === 3_000_005 && all.endsWith('x\nend\n'), 'and whole in the copy');
  r = await run(page, 'while True: print("y" * 100000)', undefined, 120000);
  ok(/Stopped: more than 32 MB of output\./.test(r.status) && /Exited with status 141/.test(r.status) && r.text.length < 700000, `endless output is stopped at 32 MB (${r.status})`);
  await start(page, 'i = 0\nwhile True:\n    i += 1\n    print("line", i)\n');
  await page.waitForTimeout(1500); t0 = Date.now(); await page.getByRole('button', { name: 'Stop' }).click();
  await page.locator('.note-warn', { hasText: 'Stopped.' }).waitFor({ timeout: 8000 }); ms = Date.now() - t0;
  r = await read(page);
  ok(ms < 4000 && /\nline \d+\n/.test(r.text), `Stop works in the middle of a flood (${ms} ms), what was printed stays`);
  r = await run(page, 'print("alive", 6 * 7)'); ok(r.text === 'alive 42\n' && !r.cut, 'the next run starts with an empty pane (fresh worker)');

  // ---------------------------------------------------------------- what a terminal would show
  r = await run(page, 'print("abc\\rX")\nprint("back\\b\\bXY")\nprint("hello world\\rbye\\033[K")\nprint("dos\\r\\nline")\nprint("a\\x00b\\x07c")\nfor s in "|/-\\\\|": print(s, end="\\b")\nprint()\n');
  ok(r.text === 'Xbc\nbaXY\nbye\ndos\nline\nabc\n|\n', `\\r, \\b, erase-to-end-of-line and control characters (${JSON.stringify(r.text)})`);
  r = await run(page, 'print("\\033[31mred\\033[0m plain \\033[1;4;32mbold green\\033[0m \\033[38;2;10;20;30;48;5;21mcustom\\033[0m")');
  const styles = await page.evaluate(() => [...document.querySelectorAll('pre.py-out span')].map((e) => { const s = getComputedStyle(e); return [e.textContent, s.color, s.fontWeight, s.textDecorationLine, s.backgroundColor].join('|'); }));
  ok(r.text === 'red plain bold green custom\n' && styles.some((s) => s.startsWith('red|rgb(224, 108, 117)|400')) && styles.some((s) => s.startsWith('bold green|rgb(152, 195, 121)|700|underline')) && styles.some((s) => s.startsWith('custom|rgb(10, 20, 30)|') && s.endsWith('rgb(0, 0, 255)')), `ANSI colours, bold and underline are drawn, not printed as codes (${styles.join(' ; ').slice(0, 200)})`);
  r = await run(page, 'print("frame 1")\nprint("\\033[2J\\033[H", end="")\nprint("frame 2")\nprint("\\033[H\\033[J", end="")\nprint("frame 3")');
  ok(r.text === 'frame 3\n', 'clearing the screen clears the pane');
  r = await run(page, 'import sys\nprint("out1")\nprint("err1", file=sys.stderr)\nprint("out2")\nprint("err2", file=sys.stderr)');
  ok(r.text === 'out1\nerr1\nout2\nerr2\n' && r.err === 'err1\nerr2\n', 'stdout and stderr appear in the order they were written, stderr in its own colour');
  r = await run(page, 'import sys\nsys.stdout.buffer.write("नमस्ते ☕ 😀 ".encode() + b"\\xff\\xe0\\xa4")\nsys.stdout.buffer.write(b"\\xa8 ok\\n")');
  ok(r.text === 'नमस्ते ☕ 😀 \ufffdन ok\n', `UTF-8 split across two writes is put together; a wrong byte shows as � (${JSON.stringify(r.text)})`);
  r = await run(page, 'def f(n):\n    return 10 / n\nprint("start")\nf(0)\n');
  ok(r.text.startsWith('start\nTraceback') && /line 2, in f/.test(r.err) && /ZeroDivisionError: division by zero\n$/.test(r.err) && /^Exited with status 1 after/.test(r.status) && !r.hint, 'a traceback in the error colour, exit status 1, no hint where Python\'s words are enough');
  r = await run(page, 'import sys\nprint("bye")\nsys.exit(3)'); ok(r.text === 'bye\n' && /Exited with status 3/.test(r.status), 'sys.exit(3)');
  r = await run(page, 'import os\nprint("x")\nos.abort()'); ok(/Python stopped itself \(abort\)\. Exited with status 134/.test(r.status), `os.abort() is named for what it is (${r.status})`);
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); r = await read(page);
  ok(r.text === '' && !r.status && !r.files, 'Clear empties the pane and the status');

  // ---------------------------------------------------------------- input
  r = await run(page, 'name = input("What is your name? ")\nage = input("Age? ")\nprint(f"{name} is {age}")', 'Asha\n31\n');
  ok(r.text === 'What is your name? Asha\nAge? 31\nAsha is 31\n' && r.echo === 'Asha\n31\n', 'each answer is shown after its prompt, in the colour of input');
  r = await run(page, 'a = input()\nb = input()\nprint(a + b)', 'x\ny');
  ok(r.text === 'xy\n' && !r.echo, 'input() without a prompt is not echoed');
  r = await run(page, 'import sys\nprint("lines:")\ndata = sys.stdin.read()\nprint(len(data.splitlines()), repr(data[-5:]))', 'a\nb\nc\nlast');
  ok(r.text === "lines:\n4 '\\nlast'\n" && !r.echo, 'data read from sys.stdin after a finished line is not echoed, and arrives whole');
  r = await run(page, 'import sys\nfor line in sys.stdin:\n    print(line.strip().upper())\nprint(sys.stdin.read() == "")', 'pune\nchennai\n');
  ok(r.text === 'PUNE\nCHENNAI\nTrue\n', 'for line in sys.stdin');
  r = await run(page, 'import sys\nb = sys.stdin.buffer.read(5)\nprint(b, sys.stdin.buffer.read())', 'ab\ncd\nef\n');
  ok(r.text === "b'ab\\ncd' b'\\nef\\n'\n", `binary reads across lines (${r.text.trim()})`);
  r = await run(page, 'a = input("a? ")\nb = input("b? ")', 'only one');
  ok(r.text.startsWith('a? only one\nb? \nTraceback') && /EOFError: EOF when reading a line/.test(r.err) && /asked for more input than the Input box holds/.test(r.hint), `input() that finds no more lines: the traceback starts on its own line and a hint says what to do (${r.hint})`);

  // ---------------------------------------------------------------- hints
  r = await run(page, 'import numpy as np');
  ok(/ModuleNotFoundError: No module named 'numpy'/.test(r.err) && /“numpy” is not part of Python's standard library, and this tab cannot install packages/.test(r.hint), 'a package that is not there');
  r = await run(page, 'import ctypes'); ok(/part of Python, but it cannot be used here: its C library/.test(r.hint), `ctypes (${r.hint})`);
  r = await run(page, 'import ssl'); ok(/cannot be used here: it needs network connections/.test(r.hint), 'ssl');
  r = await run(page, 'import turtle'); ok(/cannot be used here: it needs a desktop window/.test(r.hint), 'turtle');
  r = await run(page, 'from compression import zstd'); ok(/cannot be used here: its C library/.test(r.hint), `compression.zstd (${r.hint})`);
  // sqlite3, bz2 and lzma are in the build (28 Nov 2026): a database file written, read again by a second connection; both compressors
  r = await run(page, 'import sqlite3\ncx = sqlite3.connect("data.db")\ncx.execute("create table t (x)")\ncx.executemany("insert into t values (?)", [(i,) for i in range(1, 101)])\ncx.commit(); cx.close()\nprint(sqlite3.connect("data.db").execute("select count(*), sum(x), sqlite_version() from t").fetchone())');
  ok(r.text === "(100, 5050, '3.54.1')\n" && !r.err, `sqlite3: a database file written and read again (${r.text.trim() || r.err.trim().split('\n').pop()})`);
  r = await run(page, 'import bz2, lzma\nd = ("spam and eggs " * 500).encode()\nprint(len(d), bz2.decompress(bz2.compress(d)) == d, lzma.decompress(lzma.compress(d)) == d, len(lzma.compress(d)) < 200)');
  ok(r.text === '7000 True True True\n' && !r.err, `bz2 and lzma compress and decompress (${r.text.trim() || r.err.trim().split('\n').pop()})`);
  r = await run(page, 'import threading\nthreading.Thread(target=print).start()'); ok(/Threads cannot start here/.test(r.hint), `threads (${r.err.trim().split('\n').pop()})`);
  r = await run(page, 'x = [0] * 10**9'); ok(/MemoryError/.test(r.err) && /more memory than a browser tab can give Python/.test(r.hint), 'memory');
  r = await run(page, 'big = []\ntry:\n    while True: big.append(bytearray(64 << 20))\nexcept MemoryError:\n    n = len(big); del big\n    print("MemoryError after", n * 64, "MiB")\nprint("still alive")', undefined, 120000);
  ok(/^MemoryError after (1[5-9]|20)\d\d MiB\nstill alive\n$/.test(r.text) && /^Finished/.test(r.status), `filling the memory ends in a MemoryError the program can catch (${r.text.trim().replace('\n', ' / ')})`);
  r = await run(page, 'print("after the memory test")'); ok(r.text === 'after the memory test\n', 'the next run is not affected');
  r = await run(page, 'from functools import cache\n@cache\ndef fib(n): return n if n < 2 else fib(n - 1) + fib(n - 2)\nprint(fib(900))\nprint(fib.cache_info())');
  ok(r.text === '54877108839480000051413673948383714443800519309123592724494953427039811201064341234954387521525390615504949092187441218246679104731442473022013980160407007017175697317900483275246652938800\nCacheInfo(hits=898, misses=901, maxsize=None, currsize=901)\n', `memoised recursion 900 deep with @cache works as on a desktop (${r.err.trim().split('\n').pop() || 'ok'})`);
  r = await run(page, 'class Node:\n    def __init__(self, nxt): self.next = nxt\n    def __repr__(self): return "N" + repr(self.next)\nn = None\nfor _ in range(600): n = Node(n)\nprint(len(repr(n)))');
  ok(/RecursionError: Stack overflow/.test(r.err) && /nested more deeply than a browser tab allows/.test(r.hint) && /Exited with status 1/.test(r.status), `runaway recursion through C code is a RecursionError with a hint, not a crashed tab (${r.status})`);
  r = await run(page, 'import subprocess\nsubprocess.run(["ls"])'); ok(/cannot start other programs here/.test(r.hint), `subprocess (${r.err.trim().split('\n').pop()})`);
  r = await run(page, 'import urllib.request\ntry:\n    urllib.request.urlopen("http://example.com")\nexcept OSError as e:\n    print(type(e).__name__, "|", e)');
  ok(/there is no network here/.test(r.text) && /^Finished/.test(r.status), `the network: ${r.text.trim()}`);

  // ---------------------------------------------------------------- recursion in the browser
  r = await run(page, `import sys, json, functools, pickle, copy, re
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
@functools.lru_cache(None)
def cached(n): return 0 if n == 0 else 1 + cached(n - 1)
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
    ("lru_cache 50000", lambda: cached(50000)),
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
`, undefined, 120000);
  const WANT = ['plain 50000 -> 50000', 'lru_cache 50000 -> 50000', 'sorted key 100 -> 100', 'sorted key endless -> RecursionError', '__repr__ 250 -> r', '__repr__ endless -> RecursionError',
    '__eq__ 250 -> True', '__eq__ endless -> RecursionError', '__format__ 200 -> f', '__format__ endless -> RecursionError', '__getattr__ endless -> RecursionError', 'json.loads 900 -> 1', 'json.loads 100000 -> RecursionError',
    'json.dumps 800 -> 1602', 'json.dumps 100000 -> RecursionError', 'repr 800 -> 1602', 'repr 100000 -> RecursionError', '== 800 -> True', '== 100000 -> RecursionError', 'pickle 350 -> 1', 'pickle 100000 -> RecursionError',
    'compile 450 -> code', 'compile 100000 -> RecursionError', 'deepcopy 2000 -> 1', 'generators 2000 -> [1]', 're groups 300 -> True', 'still alive'];
  const gotLines = r.text.trimEnd().split('\n'), bad = WANT.filter((w, i) => gotLines[i] !== w).map((w) => `${w} ≠ ${gotLines[WANT.indexOf(w)]}`);
  ok(!bad.length && /^Finished/.test(r.status), `nested calls in Chromium: 15 depths that must work do, 11 endless ones end in RecursionError, and the program goes on (${bad.join(' ; ') || r.status})`);

  // ---------------------------------------------------------------- files in and out
  const fin = join(tmp, 'marks.csv'); writeFileSync(fin, 'name,marks\nAsha,91\nRavi,78\nMeera,85\n');
  const helper = join(tmp, 'helper.py'); writeFileSync(helper, 'def double(x):\n    return 2 * x\n');
  const data = page.locator('.drop input[type=file]').nth(1);
  await data.setInputFiles([fin, helper]); await page.waitForTimeout(200);
  ok(await page.getByRole('button', { name: 'marks.csv ✕' }).isVisible() && await page.getByRole('button', { name: 'helper.py ✕' }).isVisible(), 'input files listed');
  r = await run(page, 'import csv, os, helper\nrows = list(csv.DictReader(open("marks.csv")))\navg = sum(int(r["marks"]) for r in rows) / len(rows)\nprint(f"average {avg:.2f}", helper.double(21))\nwith open("result.txt", "w") as f:\n    f.write(f"{len(rows)} students, average {avg:.2f}\\n")\nopen("raw.bin", "wb").write(bytes(range(256)))\nos.makedirs("out/deep")\nopen("out/deep/नोट.txt", "w", encoding="utf-8").write("नमस्ते")\nopen("marks.csv", "a").write("Zoya,99\\n")\nprint(sorted(os.listdir(".")))');
  ok(r.text === "average 84.67 42\n['helper.py', 'main.py', 'marks.csv', 'out', 'raw.bin', 'result.txt']\n", `reads the given file and imports the given module (${r.text.trim()})`);
  ok(/4 files written:/.test(r.files) && /marks\.csv \(\d+ B\)/.test(r.files) && !/helper\.py/.test(r.files) && !/main\.py/.test(r.files), `written and changed files are offered, untouched ones are not (${r.files.slice(0, 120)})`);
  d = await download(page, () => page.getByRole('button', { name: /^result\.txt/ }).click()); ok(readFileSync(d, 'utf8') === '3 students, average 84.67\n', 'written text file downloaded');
  d = await download(page, () => page.getByRole('button', { name: /^raw\.bin \(256 B\)/ }).click()); const raw = readFileSync(d); ok(raw.length === 256 && raw[255] === 255 && raw[0] === 0, 'written binary file downloaded byte for byte');
  d = await download(page, () => page.getByRole('button', { name: 'All as .zip' }).click());
  const z = unzipSync(new Uint8Array(readFileSync(d))), names = Object.keys(z).sort();
  ok(names.join(',') === 'marks.csv,out/deep/नोट.txt,raw.bin,result.txt' && new TextDecoder().decode(z['out/deep/नोट.txt']) === 'नमस्ते' && new TextDecoder().decode(z['marks.csv']).endsWith('Meera,85\nZoya,99\n') && z['raw.bin'].length === 256, `"All as .zip" holds the four files with their folders (${names.join(', ')})`);
  const mainPy = join(tmp, 'main.py'); writeFileSync(mainPy, 'x = 1\n'); await data.setInputFiles(mainPy); await page.waitForTimeout(200);
  ok(await page.locator('.toast', { hasText: 'main.py is the name of the program itself' }).count() === 1 && !(await page.getByRole('button', { name: 'main.py ✕' }).count()), 'a data file called main.py is refused with a reason');
  await page.getByRole('button', { name: 'marks.csv ✕' }).click(); ok(!(await page.getByRole('button', { name: 'marks.csv ✕' }).count()), 'input file removed');
  r = await run(page, 'open("marks.csv")'); ok(/FileNotFoundError/.test(r.err), 'and gone for the next run');

  // ---------------------------------------------------------------- keyboard, .py open / download
  await code.fill('x = 1'); await code.focus(); await page.keyboard.press('End'); await page.keyboard.press('Tab');
  ok(await code.inputValue() === 'x = 1    ', 'Tab inserts four spaces');
  await page.keyboard.press('Control+z');
  ok(await code.inputValue() === 'x = 1', `Ctrl+Z takes the inserted spaces back (${JSON.stringify(await code.inputValue())})`);
  await page.keyboard.press('Tab'); await page.keyboard.type('# note'); ok(await code.inputValue() === 'x = 1    # note', 'typing goes on after the inserted spaces');
  await code.fill(''); await code.focus();
  await page.keyboard.type('for i in range(2):'); await page.keyboard.press('Enter'); await page.keyboard.type('if i:  # odd'); await page.keyboard.press('Enter'); await page.keyboard.type('print("one")'); await page.keyboard.press('Enter'); await page.keyboard.type('print("in loop", i)');
  ok(await code.inputValue() === 'for i in range(2):\n    if i:  # odd\n        print("one")\n        print("in loop", i)', `Enter keeps the indentation and adds a level after a line ending in ":" (${JSON.stringify(await code.inputValue())})`);
  await page.keyboard.press('Control+Enter'); r = await finish(page); ok(r.text === 'one\nin loop 1\n', 'Ctrl+Enter runs');
  await code.fill('print(1)'); await code.focus(); await page.keyboard.press('Enter');
  ok(await code.inputValue() === 'print(1)\n', 'Enter on a line without indentation is a plain line break');
  const fpy = join(tmp, 'mine.py'); writeFileSync(fpy, 'print("from file")\r\nprint("crlf")\r\n'); await page.locator('.drop input[type=file]').first().setInputFiles(fpy); await page.waitForTimeout(200);
  ok(await code.inputValue() === 'print("from file")\nprint("crlf")\n', '.py file opened, Windows line ends made plain');
  d = await download(page, () => page.getByRole('button', { name: 'Download .py' }).click()); ok(readFileSync(d, 'utf8') === 'print("from file")\nprint("crlf")\n', '.py download');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); await page.waitForTimeout(300);
  ok((await page.evaluate(() => globalThis.__superutilsLive())).workers === 0, 'worker released on leave');

  // ---------------------------------------------------------------- local time = the browser's
  const TZ_SRC = `import time, datetime
print(time.tzname, time.timezone, time.altzone, time.daylight)
for ts in (1750000000, 1765000000, 946684800, 1111111111):
    lt = time.localtime(ts)
    print(time.strftime("%Y-%m-%d %H:%M:%S %Z %z", lt), lt.tm_isdst, lt.tm_gmtoff, lt.tm_zone, datetime.datetime.fromtimestamp(ts).isoformat(), datetime.datetime.fromtimestamp(ts).astimezone().isoformat())
print(int(time.mktime((2025, 6, 15, 12, 0, 0, 0, 0, -1))), int(time.mktime((2025, 12, 15, 12, 0, 0, 0, 0, -1))), int(datetime.datetime(2025, 3, 9, 2, 30).timestamp()), int(datetime.datetime(2025, 11, 2, 1, 30).timestamp()))
print(datetime.datetime(2026, 1, 26, 9, 0).astimezone().strftime("%d %b %Y %H:%M %Z (UTC%z)"))
`;
  // the reference needs a C library that reads IANA names from TZ: Windows' does not (it takes "EST5EDT" forms only), so
  // on the Windows runner only Linux's runs make them (the tab's answers are the same in every browser; the wall clock
  // in each zone is still checked)
  if (process.platform === 'win32') info('native CPython on Windows cannot read TZ=Asia/Kolkata (the C runtime takes only "EST5EDT" forms): the six comparisons with it run on Linux');
  for (const zone of ['Asia/Kolkata', 'America/New_York', 'Europe/London', 'Australia/Sydney', 'Asia/Dubai', 'UTC']) {
    const p = await open({ timezoneId: zone });
    r = await run(p, TZ_SRC, undefined, 90000);
    if (process.platform !== 'win32') {
      const want = native(TZ_SRC, '', { TZ: zone });
      ok(want != null && r.text === want, `${zone}: tzname, offsets, daylight time, localtime, mktime and astimezone equal native CPython with TZ=${zone} (${r.text.split('\n')[0]})`);
    }
    r = await run(p, 'import datetime\nprint(datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))');
    const fmt = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: zone }).slice(0, 16);
    ok([fmt(Date.now()), fmt(Date.now() - 60000)].includes(r.text.trim()), `${zone}: datetime.now() is the wall clock there (${r.text.trim()})`);
    await p.close();
  }

  // ---------------------------------------------------------------- a download that fails
  const p2 = await newPage(); let down = true;
  await p2.context().route(/python314[^/]*\.zip/, (route) => (down ? route.abort() : route.continue()));
  await p2.goto(`${base}#/python`); await p2.getByRole('textbox', { name: 'Python code' }).waitFor();
  r = await run(p2, 'print("x")');
  ok(/Python could not be loaded .*Check the connection and run again/.test(r.status) && r.text === '', `a failed download is reported in plain words (${r.status})`);
  down = false;
  r = await run(p2, 'print("second try")', undefined, 90000);
  ok(r.text === 'second try\n' && /^Finished/.test(r.status), 'and the next Run loads it again and works');
  await pcOnlyOnPhone(ctx, 'python');
};
