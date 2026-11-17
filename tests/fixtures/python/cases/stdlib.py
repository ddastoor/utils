# Programs for scripts/make-python-reference.py — the standard library. Same format as core.py.

# ==== json
import json, decimal, math
data = {"name": "Asha", "tags": ["a", "é", "नम", "😀"], "n": 12345678901234567890, "f": 0.1, "big": 1e400, "none": None, "t": True, "nested": {"k": [1, [2, [3]]], "empty": {}, "s": "q\"uote\\ \n\t "}}
print(json.dumps(data))
print(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
print(json.dumps({"b": [1, 2], "a": {"z": 1, "y": None}}, indent=2, sort_keys=True))
print(json.loads('{"a": 1.0, "b": 1e3, "c": 12345678901234567890123, "d": -0.0, "e": "\\u00e9\\ud83d\\ude00", "f": [true, false, null], "a": 2}'))
print(json.loads("[1.10, 2.5]", parse_float=decimal.Decimal), json.loads("NaN") != json.loads("NaN"), json.loads("-Infinity"), json.dumps(float("nan")), json.dumps({1: "int key", 2.5: "float key", None: "none", True: "bool"}), json.dumps((1, 2)), json.dumps("\x7f\x00"))
for bad in ('{"a": 1,}', "[1 2]", '{"a"}', "", "{'a': 1}", '"unterminated', "[1,]", "01", "nul", '{"a":1} x'):
    try: json.loads(bad)
    except json.JSONDecodeError as e: print(repr(bad), "->", e.msg, e.lineno, e.colno, e.pos)
try: json.dumps({"s": {1, 2}})
except TypeError as e: print(e)
class Enc(json.JSONEncoder):
    def default(self, o): return sorted(o) if isinstance(o, set) else super().default(o)
print(json.dumps({"s": {3, 1, 2}}, cls=Enc), json.loads('{"x": 1}', object_hook=lambda d: sorted(d.items())), json.loads("[1, 2]", parse_int=float), json.dumps([math.inf], allow_nan=True))

# ==== statistics-random
import statistics as st, random
d = [2.5, 3.1, 4.7, 4.7, 5.0, 6.2, 7.9, 8.8, 9.4, 12.6]
print(st.mean(d), st.median(d), st.mode(d), st.multimode([1, 1, 2, 2, 3]), st.median_low([1, 2, 3, 4]), st.median_high([1, 2, 3, 4]), st.fmean(d), st.geometric_mean([1, 10, 100]), st.harmonic_mean([40, 60]))
print(round(st.stdev(d), 10), round(st.pstdev(d), 10), round(st.variance(d), 10), round(st.pvariance(d), 10), [round(q, 6) for q in st.quantiles(d, n=4)], [round(q, 6) for q in st.quantiles(d, n=10, method="inclusive")])
print(round(st.correlation(d, [x * 2 + 1 for x in d]), 10), round(st.covariance(d, d[::-1]), 8), tuple(round(v, 8) for v in st.linear_regression(d, [3 * x - 2 for x in d])), st.mean([1, 2, 3, 4]), st.mean([st.Fraction(1, 3), st.Fraction(2, 3)]), st.median([]) if False else "-")
nd = st.NormalDist(100, 15)
print(round(nd.cdf(115), 9), round(nd.pdf(100), 9), round(nd.inv_cdf(0.975), 6), round(nd.zscore(130), 6), nd + 10, round(st.NormalDist.from_samples(d).stdev, 9))
try: st.mean([])
except st.StatisticsError as e: print("StatisticsError:", e)
random.seed(20261117)
print(random.random(), random.randint(1, 6), random.randrange(0, 100, 5), random.choice("abcdef"), random.sample(range(100), 5), random.choices("abc", weights=[5, 1, 1], k=8), round(random.uniform(1, 2), 12), random.getrandbits(70), random.randbytes(4))
l = list(range(10)); random.shuffle(l); r2 = random.Random("string seed")
print(l, round(random.gauss(0, 1), 9), round(random.triangular(0, 10, 3), 9), round(random.expovariate(2), 9), round(random.betavariate(2, 5), 9), r2.random(), r2.randint(1, 10 ** 30), random.Random(42).random(), random.Random(b"x").random())

# ==== re
import re
text = "Asha <asha@example.in> wrote on 2026-11-17 at 18:30; Ravi <ravi.k@mail.co.in> on 2025-01-05. ₹1,23,456.50 and $99.99; नमस्ते दुनिया"
print(re.findall(r"[\w.]+@[\w.]+", text), re.search(r"(\d{4})-(\d\d)-(\d\d)", text).groups(), re.sub(r"(\d{4})-(\d\d)-(\d\d)", r"\3/\2/\1", text)[30:60], re.split(r"[;.]\s+", text, maxsplit=2)[1])
m = re.search(r"(?P<user>[\w.]+)@(?P<host>[\w.]+)", text); print(m.group("user"), m["host"], m.span(), m.start("host"), m.groupdict(), m.expand(r"\g<host>:\1"), m.group(0, 2))
print([x.group() for x in re.finditer(r"\b\w{5}\b", text)], re.findall(r"[₹$]([\d,]+\.\d\d)", text), re.findall(r"[ऀ-ॿ]+", text), re.fullmatch(r"\d+", "123") is not None, re.match(r"\d+", "x1"), len(re.findall(r"\w+", text)), len(re.findall(r"\w+", text, re.ASCII)))
print(re.sub(r"\s+", " ", "a \t\n  b"), re.sub(r"(?i)asha", lambda m: m.group().upper(), text)[:25], re.subn("a", "A", "banana", count=2), re.escape("a.b*c[d]"), re.split(r"(,)", "a,b,c"), re.split(r"\W+", "one, two;three"), re.findall(r"(a)(b)?", "ab a"))
print(re.findall(r"^\w+", "one\ntwo\nthree", re.M), re.findall(r"a.c", "a\nc abc", re.S), re.findall(r"""  (\d+)  \s*  # digits
  ([a-z]+)   # unit""", "10 kg, 5m", re.X), re.findall(r"(?<=₹)\d+", "₹500 $20"), re.findall(r"\d+(?!\d|%)", "50% 60 70%"), re.findall(r"(\w)\1", "aabbcd"), re.sub(r"(?P<a>\w)(?P<b>\w)", r"\g<b>\g<a>", "abcd"), re.findall(r"a{2,3}?", "aaaaa"), re.findall(r"(?:ab)+", "ababab ab"))
print(re.compile(r"(\d+)").pattern, re.compile("x", re.I | re.M).flags & (re.I | re.M) == re.I | re.M, bool(re.match(r"\p", "p") if False else True), re.findall(r"\bfoo\b", "foo food foo."), re.findall(r"[^\W\d_]+", "abc123_def"), re.findall(r"\N{BULLET}|₹|\x41", "•₹A"), re.search(r"(a+)+b", "a" * 20 + "b").end())
for bad in (r"(", r"[a-", r"*a", r"(?P<x>a)(?P<x>b)", r"\1(a)", r"a{2,1}"):
    try: re.compile(bad)
    except re.error as e: print(repr(bad), "->", e.msg, e.pos)

# ==== datetime-calendar
import datetime as dt, calendar
d = dt.date(2026, 11, 17); t = dt.datetime(2026, 1, 26, 9, 30, 15, 123456)
print(d, d.isoformat(), d.strftime("%A %d %B %Y, week %W/%U, day %j, %a %b %y"), d.weekday(), d.isoweekday(), d.isocalendar(), d.toordinal(), d.replace(day=1), d + dt.timedelta(days=45), d - dt.date(2000, 2, 29), (d - dt.date(2026, 1, 1)).days)
print(t, t.isoformat(), t.isoformat(timespec="minutes"), t.strftime("%d/%m/%Y %I:%M:%S %p %f"), t.date(), t.time(), t.replace(microsecond=0) + dt.timedelta(hours=20, minutes=45), t.timestamp() if False else "-", dt.datetime.combine(d, dt.time(23, 59)), t.ctime())
td = dt.timedelta(days=3, hours=25, minutes=61, seconds=3661, milliseconds=1500)
print(td, td.days, td.seconds, td.total_seconds(), td * 2, td / 3, td // dt.timedelta(hours=1), td % dt.timedelta(days=1), -td, abs(-td), dt.timedelta(0), dt.timedelta(microseconds=-1), dt.timedelta.max.days, str(dt.timedelta(seconds=59.999999)))
print(dt.date.fromisoformat("2024-02-29"), dt.datetime.fromisoformat("2026-11-17T18:30:00+05:30"), dt.datetime.fromisoformat("2026-11-17 18:30:00.5Z"), dt.datetime.strptime("17 Nov 2026 6:30PM", "%d %b %Y %I:%M%p"), dt.datetime.strptime("2026-W47-2", "%G-W%V-%u").date(), dt.date.fromordinal(738000), dt.date.fromisocalendar(2026, 1, 1), dt.time.fromisoformat("18:30:15.250"))
ist = dt.timezone(dt.timedelta(hours=5, minutes=30), "IST"); u = dt.datetime(2026, 6, 1, 12, 0, tzinfo=dt.timezone.utc)
print(u.astimezone(ist), u.astimezone(ist).tzname(), u.astimezone(ist).utcoffset(), u.timestamp(), dt.datetime.fromtimestamp(1750000000, dt.timezone.utc), dt.datetime.fromtimestamp(0, ist), u == u.astimezone(ist), (u.astimezone(ist) - u).total_seconds(), u.strftime("%z %Z %s") if False else u.strftime("%z %Z"), dt.datetime(1, 1, 1).isoformat(), dt.datetime.max, dt.date.min)
for bad in ((2026, 2, 29), (2026, 13, 1), (0, 1, 1)):
    try: dt.date(*bad)
    except ValueError as e: print(bad, "->", e)
try: dt.date.fromisoformat("17/11/2026")
except ValueError as e: print(e)
print(calendar.month(2026, 11)); print(calendar.isleap(2024), calendar.isleap(1900), calendar.leapdays(2000, 2027), calendar.monthrange(2024, 2), calendar.weekday(1947, 8, 15), list(calendar.day_abbr), calendar.month_name[8], calendar.timegm((2026, 1, 1, 0, 0, 0)), calendar.Calendar(6).monthdayscalendar(2026, 2)[0])

# ==== zoneinfo
import datetime as dt
from zoneinfo import ZoneInfo
m = dt.datetime(2026, 12, 1, 18, 30, tzinfo=ZoneInfo("Asia/Kolkata"))
for z in ("Asia/Kolkata", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney", "Asia/Kathmandu", "Asia/Dubai", "America/Sao_Paulo", "Pacific/Auckland", "UTC", "Africa/Johannesburg", "Asia/Singapore"):
    x = m.astimezone(ZoneInfo(z)); print(f"{z:<22}{x.isoformat()} {x.tzname():<6} {x.utcoffset()} {x.dst()}")
ny = ZoneInfo("America/New_York")
gap, fold0, fold1 = dt.datetime(2026, 3, 8, 2, 30, tzinfo=ny), dt.datetime(2026, 11, 1, 1, 30, tzinfo=ny), dt.datetime(2026, 11, 1, 1, 30, fold=1, tzinfo=ny)
print(gap.utcoffset(), gap.astimezone(dt.timezone.utc), fold0.tzname(), fold1.tzname(), fold1 - fold0, fold0.astimezone(dt.timezone.utc), fold1.astimezone(dt.timezone.utc), (dt.datetime(2026, 3, 8, 12, tzinfo=ny) - dt.datetime(2026, 3, 7, 12, tzinfo=ny)), str(ny), ZoneInfo("Asia/Kolkata").key)
print(dt.datetime(1945, 8, 15, 12, tzinfo=ZoneInfo("Asia/Kolkata")).utcoffset(), dt.datetime(1900, 1, 1, tzinfo=ZoneInfo("Asia/Kolkata")).tzname(), dt.datetime(2040, 7, 1, tzinfo=ZoneInfo("Europe/Paris")).tzname(), dt.datetime(1970, 1, 1, tzinfo=ZoneInfo("Europe/London")).utcoffset())
try: ZoneInfo("Mars/Olympus")
except Exception as e: print(type(e).__name__, e)

# ==== itertools-functools-operator
import itertools as it, functools as ft, operator as op
print(list(it.chain("ab", [1])), list(it.islice(it.count(10, 3), 4)), list(it.accumulate([1, 2, 3, 4], op.mul)), list(it.accumulate([3, 1, 4, 1, 5], max)), list(it.pairwise("abcd")), list(it.batched(range(7), 3)), list(it.zip_longest("ab", "xyz", fillvalue="-")), list(it.starmap(pow, [(2, 3), (3, 2)])))
print(list(it.permutations("abc", 2)), list(it.combinations(range(4), 2)), list(it.combinations_with_replacement("ab", 2)), list(it.product("ab", repeat=2)), len(list(it.product(range(3), repeat=4))), list(it.compress("abcdef", [1, 0, 1, 0, 1])), list(it.dropwhile(lambda x: x < 3, [1, 2, 3, 1])), list(it.takewhile(lambda x: x < 3, [1, 2, 3, 1])), list(it.filterfalse(str.isdigit, "a1b2")))
print([(k, "".join(g)) for k, g in it.groupby("aaabbbccd")], [(k, list(g)) for k, g in it.groupby(sorted(["apple", "avocado", "banana", "blueberry", "cherry"]), key=lambda s: s[0])], list(it.islice(it.cycle("ab"), 5)), list(it.repeat("x", 3)), [list(x) for x in it.tee(range(3), 2)], next(it.dropwhile(lambda x: x % 7, it.count(50))))
@ft.lru_cache(maxsize=32)
def collatz(n): return 0 if n == 1 else 1 + collatz(n // 2 if n % 2 == 0 else 3 * n + 1)
print([collatz(n) for n in (1, 7, 27, 97)], collatz.cache_info().maxsize, collatz.cache_info().currsize, collatz.cache_parameters(), ft.reduce(op.add, map(int, "12345")), ft.partial(pow, 2)(10), ft.cmp_to_key(lambda a, b: len(a) - len(b))("x") < ft.cmp_to_key(lambda a, b: len(a) - len(b))("yy"))
collatz.cache_clear()
@ft.cache
def paths(r, c): return 1 if r == 0 or c == 0 else paths(r - 1, c) + paths(r, c - 1)
print(paths(16, 16), paths.cache_info(), paths.__wrapped__(1, 1), paths.__name__, sorted(["bb", "a", "ccc"], key=ft.cmp_to_key(lambda a, b: len(b) - len(a))), op.itemgetter(1, 0)("ab"), op.attrgetter("real")(3 + 4j), op.methodcaller("upper")("x"), op.index(True), op.concat([1], [2]), op.truediv(1, 4), op.contains("abc", "b"), op.countOf([1, 2, 1], 1))

# ==== collections-heapq-bisect
import collections as c, heapq, bisect, array, queue, copy
cnt = c.Counter("mississippi"); cnt.update("miss"); print(cnt.most_common(3), cnt["z"], sorted(cnt.elements())[:6], cnt.total(), sorted((cnt - c.Counter("ssss")).items()), sorted((c.Counter(a=1) + c.Counter(a=2, b=1)).items()), c.Counter([1, 1, 2]) == c.Counter({1: 2, 2: 1}))
dd = c.defaultdict(list)
for w in ["apple", "avocado", "banana", "blueberry", "cherry"]: dd[w[0]].append(w)
od = c.OrderedDict(a=1, b=2, c=3); od.move_to_end("a"); od.popitem(last=False)
dq = c.deque(range(5), maxlen=5); dq.rotate(2); dq.appendleft(9); dq.extend([7, 8])
P = c.namedtuple("P", "x y z", defaults=[0])
cm = c.ChainMap({"a": 1}, {"a": 2, "b": 3})
print(dict(dd), list(od.items()), dq, dq.maxlen, P(1, 2), P(1, 2)._replace(z=5), P._fields, P(1, 2, 3)._asdict(), cm["a"], cm["b"], list(cm), dict(cm.new_child({"c": 4})), c.deque("abc", 2))
h = [5, 1, 8, 3, 9, 2]; heapq.heapify(h); heapq.heappush(h, 0)
print([heapq.heappop(h) for _ in range(3)], heapq.nlargest(2, h), heapq.nsmallest(2, [(3, "c"), (1, "a"), (2, "b")]), list(heapq.merge([1, 4, 7], [2, 5], [3])), heapq.heappushpop(h, 100), heapq.heapreplace(h, -1))
s = [10, 20, 20, 30, 40]; bisect.insort(s, 25)
print(s, bisect.bisect_left(s, 20), bisect.bisect_right(s, 20), bisect.bisect(s, 99), bisect.bisect_left([("a", 1), ("c", 3)], "b", key=lambda t: t[0]))
a = array.array("d", [1.5, 2.5]); a.append(3.5); b = array.array("B", b"hi"); q = queue.PriorityQueue(); [q.put(x) for x in (3, 1, 2)]; lq = queue.LifoQueue(); lq.put(1); lq.put(2)
x = [1, [2, 3], {"k": [4]}]; x.append(x); y = copy.deepcopy(x); sh = copy.copy(x)
print(a, a.tolist(), b.tobytes(), a.itemsize, b.typecode, [q.get() for _ in range(3)], lq.get(), q.empty(), y[1] is not x[1], y[3] is y, sh[1] is x[1], y[2], len(y))

# ==== csv-io
import csv, io
rows = [["name", "city", "note"], ["Asha", "Pune", 'says "hi"'], ["Ravi, Jr.", "नई दिल्ली", "line1\nline2"], ["", " spaced ", None], [1, 2.5, True]]
b = io.StringIO(); csv.writer(b).writerows(rows); print(repr(b.getvalue()))
print(list(csv.reader(io.StringIO(b.getvalue()))))
b = io.StringIO(); w = csv.writer(b, delimiter=";", quoting=csv.QUOTE_NONNUMERIC, lineterminator="\n"); w.writerows(rows[:2] + rows[4:]); print(repr(b.getvalue()))
b = io.StringIO(); w = csv.DictWriter(b, ["id", "name"], extrasaction="ignore", restval="?", lineterminator="\n"); w.writeheader(); w.writerow({"id": 1, "name": "a", "x": 9}); w.writerow({"id": 2}); print(repr(b.getvalue()))
print(list(csv.DictReader(io.StringIO("a,b,c\n1,2\n3,4,5,6\n"), restkey="more", restval="-")), list(csv.reader(["a\tb", "'q,1'\tc"], delimiter="\t", quotechar="'")), list(csv.reader(io.StringIO('a,"b ""q"" c",d\r\n"multi\nline",x\r\n'))), csv.Sniffer().sniff("a;b;c\n1;2;3\n").delimiter, csv.Sniffer().has_header("name,age\nasha,31\nravi,27\n"))
try: list(csv.reader(io.StringIO('a,"unterminated\n'), strict=True))
except csv.Error as e: print("csv.Error:", e)
s = io.StringIO("first\nsecond\nthird"); print(s.readline(), s.read(3), s.tell(), s.seek(0), s.readlines(), io.BytesIO(b"abc").read(2), io.BytesIO(b"\x00" * 4).getbuffer().nbytes, io.TextIOWrapper(io.BytesIO("é\r\nx".encode()), encoding="utf-8", newline="").read().encode())

# ==== files-and-paths | files={"data.txt": "alpha\nbeta\ngamma\n", "nums.csv": "n\n1\n2\n3\n"}
import os, pathlib, shutil, glob, fnmatch, tempfile, stat, filecmp
p = pathlib.Path("out"); p.mkdir(); (p / "deep" / "er").mkdir(parents=True); (p / "a.txt").write_text("héllo\n", encoding="utf-8"); (p / "deep" / "b.bin").write_bytes(bytes(range(10))); (p / "deep" / "er" / "नोट.md").write_text("# नमस्ते\n", encoding="utf-8")
print(sorted(os.listdir(".")), sorted(str(x) for x in p.rglob("*")), [(r, sorted(d), sorted(f)) for r, d, f in sorted(os.walk("out"))], sorted(glob.glob("**/*.t*", recursive=True)), fnmatch.filter(["a.py", "b.txt", "c.PY"], "*.py"), fnmatch.fnmatchcase("c.PY", "*.py"))
q = pathlib.Path("out/deep/b.bin"); print(q.name, q.stem, q.suffix, q.parent, q.parts, q.exists(), q.is_file(), q.parent.is_dir(), q.stat().st_size, q.read_bytes()[-3:], q.with_suffix(".dat"), q.relative_to("out"), pathlib.PurePosixPath("/a/b/../c").as_posix(), os.path.normpath("/a/b/../c//d/"), os.path.splitext("x.tar.gz"), os.path.join("a", "/b", "c"), os.path.commonpath(["/a/b/c", "/a/b/d"]))
with open("data.txt") as f: lines = f.readlines()
with open("data.txt", "a") as f: f.write("delta\n")
with open("data.txt", "r+") as f: f.seek(0); f.write("ALPHA"); f.seek(0, 2); end = f.tell()
with open("data.txt", "rb") as f: f.seek(-6, 2); tail = f.read()
print(lines, end, tail, open("data.txt").read().split(), os.path.getsize("data.txt"), open("nums.csv").read().count("\n"), sum(int(x) for x in open("nums.csv").read().split()[1:]))
shutil.copy("data.txt", "out/copy.txt"); shutil.copytree("out/deep", "out/deep2"); os.rename("out/a.txt", "out/renamed.txt"); os.remove("out/copy.txt"); shutil.rmtree("out/deep"); os.replace("nums.csv", "out/nums.csv")
print(sorted(str(x) for x in p.rglob("*")), filecmp.cmp("data.txt", "data.txt"), os.path.isdir("out/deep"), os.path.exists("nums.csv"), shutil.which("definitely-not-a-program"))
with tempfile.TemporaryDirectory() as td:
    t = pathlib.Path(td, "t.txt"); t.write_text("tmp"); inside = t.read_text(); existed = os.path.isdir(td)
with tempfile.NamedTemporaryFile("w+", suffix=".txt") as f: f.write("x" * 100); f.flush(); f.seek(0); n = len(f.read())
print(inside, existed, os.path.exists(td), n, tempfile.gettempdir() != "", isinstance(os.getcwd(), str), os.path.isabs(os.getcwd()), os.sep, os.linesep == "\n", os.curdir, os.path.expanduser("~") == os.environ["HOME"])
for bad, fn in (("missing.txt", open), ("out", open), ("out/nums.csv/x", open), ("out", os.rmdir), ("missing", os.listdir), ("data.txt", os.listdir), ("out/nope/deeper", os.mkdir)):
    try: fn(bad)
    except OSError as e: print(type(e).__name__, e.strerror, "|", e.filename)
try: open("data.txt", "x")
except FileExistsError as e: print(type(e).__name__, e.strerror)
with open("lines.txt", "w", newline="") as f: f.write("a\r\nb\rc\n")
print(open("lines.txt").read().encode(), open("lines.txt", newline="").read().encode(), open("lines.txt", "rb").read(), open("data.txt", encoding="ascii", errors="replace").read()[:5], os.stat("lines.txt").st_size, stat.S_ISREG(os.stat("lines.txt").st_mode), stat.S_ISDIR(os.stat("out").st_mode))
os.truncate("lines.txt", 2); f = open("lines.txt", "ab"); f.write(b"!"); f.close(); print(open("lines.txt", "rb").read(), os.path.getmtime("lines.txt") > 1.7e9)

# ==== binary-data
import struct, base64, binascii, hashlib, hmac, zlib, gzip, codecs, array, io
print(struct.pack(">IhB3s", 1, -2, 255, b"abc"), struct.unpack("<HHd", bytes(range(12))), struct.calcsize("<ihq"), struct.pack("!f", 1.5).hex(), struct.unpack(">2s2x?", b"hi\0\0\1"), list(struct.iter_unpack("<H", b"\1\0\2\0")), struct.pack("<e", 0.5))
d = "नमस्ते, wörld ☕".encode()
print(base64.b64encode(d), base64.urlsafe_b64encode(b"\xfb\xff"), base64.b64decode("aGk="), base64.b32encode(b"hi"), base64.b16encode(b"hi"), base64.b85encode(b"hello"), base64.a85encode(b"hello"), base64.b64decode(b"aGk", validate=False) if False else "-", binascii.hexlify(b"\x01\xff", "-"), binascii.crc32(b"hello"), binascii.unhexlify("00ff"))
try: base64.b64decode("a", validate=True)
except binascii.Error as e: print("binascii.Error:", e)
print(hashlib.md5(b"abc").hexdigest(), hashlib.sha1(b"abc").hexdigest(), hashlib.sha256(d).hexdigest(), hashlib.sha512(b"").hexdigest()[:32], hashlib.sha3_256(b"abc").hexdigest(), hashlib.blake2b(b"abc", digest_size=16).hexdigest(), hashlib.blake2s(b"abc", key=b"k").hexdigest()[:16], hashlib.shake_128(b"abc").hexdigest(8), hashlib.sha224(b"abc").hexdigest()[:16], hashlib.sha384(b"abc").hexdigest()[:16])
h = hashlib.sha256(); h.update(b"ab"); h.update(b"c"); print(h.hexdigest() == hashlib.sha256(b"abc").hexdigest(), h.digest_size, h.block_size, h.name, hashlib.pbkdf2_hmac("sha256", b"password", b"salt", 1000).hex()[:32], hmac.new(b"key", b"msg", "sha256").hexdigest(), hmac.compare_digest("a", "a"), hashlib.pbkdf2_hmac("sha1", b"password", b"salt", 2, 20).hex(), hashlib.pbkdf2_hmac("sha512", bytearray(b"p" * 200), memoryview(b"s"), 3, 70).hex()[-20:], hashlib.new("sha256", b"abc").hexdigest()[:8], sorted(hashlib.algorithms_guaranteed)[:4], hashlib.file_digest(io.BytesIO(b"abc"), "md5").hexdigest())
raw = b"The quick brown fox jumps over the lazy dog. " * 200
z = zlib.compress(raw, 9); g = gzip.compress(raw, mtime=0); co = zlib.compressobj(6, zlib.DEFLATED, -15); rawdef = co.compress(raw) + co.flush()
print(len(raw), len(z) < 200, zlib.decompress(z) == raw, zlib.crc32(raw), zlib.adler32(raw), gzip.decompress(g) == raw, g[:4].hex(), zlib.decompress(rawdef, -15) == raw, zlib.decompressobj().decompress(z, 10), zlib.crc32(b"b", zlib.crc32(b"a")) == zlib.crc32(b"ab"))
for bad in (("sha256", b"p", b"s", 0), ("sha256", b"p", b"s", 1, 0), ("sha256", "text", b"s", 1)):
    try: hashlib.pbkdf2_hmac(*bad)
    except Exception as e: print(type(e).__name__, e)
try: zlib.decompress(b"not zlib")
except zlib.error as e: print("zlib.error:", e)
print(codecs.encode("Hello", "rot13"), codecs.decode(b"\xef\xbb\xbfhi", "utf-8-sig"), codecs.BOM_UTF16_LE, "ñ".encode("cp1252"), b"\x80".decode("cp1252"), "€".encode("iso-8859-15"), codecs.lookup("UTF8").name, "日本".encode("shift_jis"), "日本".encode("euc-jp").decode("euc-jp"), "中文".encode("gbk"), "한".encode("euc-kr"), "abc".encode("utf-7"), "é".encode("idna") if False else "-", "bücher.example".encode("idna"), codecs.getincrementaldecoder("utf-8")().decode(b"\xe0\xa4", False) == "")
print(int.from_bytes(hashlib.sha256(b"x").digest()[:8], "big"), bytes.fromhex("48 65 6c 6c 6f").decode(), bytes(b ^ 0x20 for b in b"Hello"), bytearray(b"abc").zfill(5), b"%d-%s-%x" % (5, b"x", 255), b"abc".translate(bytes.maketrans(b"a", b"z")), (1234).to_bytes(4, "little").hex(), array.array("H", [1, 2]).tobytes(), memoryview(b"abcdef")[::2].tobytes(), memoryview(array.array("i", [1, 2, 3])).tolist())

# ==== archives
import zipfile, tarfile, io, gzip
b = io.BytesIO()
with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(zipfile.ZipInfo("a.txt", (2026, 1, 26, 9, 0, 0)), "alpha " * 100); z.writestr(zipfile.ZipInfo("dir/नोट.txt", (2026, 1, 26, 9, 0, 0)), "नमस्ते"); z.writestr(zipfile.ZipInfo("stored.bin", (2026, 1, 26, 9, 0, 0)), bytes(range(256)), zipfile.ZIP_STORED)
with zipfile.ZipFile(io.BytesIO(b.getvalue())) as z:
    print(z.namelist(), [(i.filename, i.file_size, i.compress_type, i.date_time, hex(i.CRC)) for i in z.infolist()], z.read("dir/नोट.txt").decode(), z.testzip(), z.getinfo("a.txt").compress_size < 60, zipfile.is_zipfile(io.BytesIO(b.getvalue())), zipfile.is_zipfile(io.BytesIO(b"nope")), zipfile.Path(z, "dir/").is_dir())
try: zipfile.ZipFile(io.BytesIO(b"this is not a zip file at all"))
except zipfile.BadZipFile as e: print("BadZipFile:", e)
t = io.BytesIO()
with tarfile.open(fileobj=t, mode="w:gz") as tar:
    for name, data in (("x/one.txt", b"1" * 10), ("x/two.txt", "दो".encode())):
        ti = tarfile.TarInfo(name); ti.size = len(data); ti.mtime = 1700000000; ti.mode = 0o644; tar.addfile(ti, io.BytesIO(data))
t.seek(0)
with tarfile.open(fileobj=t) as tar:
    print(tar.getnames(), [(m.name, m.size, m.mtime, oct(m.mode), m.isfile()) for m in tar.getmembers()], tar.extractfile("x/two.txt").read().decode())
with zipfile.ZipFile("made.zip", "w") as z: z.write("made.zip") if False else z.writestr("hello.txt", "hi")
with zipfile.ZipFile("made.zip") as z: z.extractall("unzipped")
print(open("unzipped/hello.txt").read(), gzip.open(io.BytesIO(gzip.compress(b"line1\nline2\n")), "rt").readlines())

# ==== text-tools
import difflib, pprint, reprlib, textwrap, unicodedata, html, shlex, string, keyword, tokenize, io, ast, dis, inspect
a = "the quick brown fox\njumps over\nthe lazy dog\n".splitlines(True); b = "the quick red fox\njumps over\nthe very lazy dog\nagain\n".splitlines(True)
print("".join(difflib.unified_diff(a, b, "old.txt", "new.txt")), end="")
print(list(difflib.ndiff(["a\n", "b\n"], ["a\n", "c\n"])), round(difflib.SequenceMatcher(None, "kitten", "sitting").ratio(), 6), difflib.get_close_matches("appel", ["ape", "apple", "peach", "puppy"]), difflib.SequenceMatcher(None, "abcd", "bcde").get_matching_blocks()[0])
pprint.pprint({"name": "Asha", "langs": ["python", "javascript", "rust", "go", "typescript", "kotlin"], "nested": {"a": {"b": {"c": [1, 2, 3]}}, "z": None}, "t": (1, 2), 1: "int key"}, width=60)
pprint.pprint([list(range(25)), "x" * 70], width=50, compact=True); print(pprint.pformat({"b": 1, "a": 2}, sort_dicts=False), reprlib.repr(list(range(100))), reprlib.repr("x" * 100))
for ch in "aé₹न😀Ⅷ‍ ":
    print(repr(ch), unicodedata.name(ch, "?"), unicodedata.category(ch), unicodedata.east_asian_width(ch), unicodedata.numeric(ch, None), unicodedata.combining(ch), end=" | ")
print(); print(unicodedata.normalize("NFD", "é").encode(), unicodedata.normalize("NFC", "é").encode(), unicodedata.normalize("NFKC", "ﬁ①㎏"), unicodedata.lookup("INDIAN RUPEE SIGN"), unicodedata.unidata_version, unicodedata.is_normalized("NFC", "é"), unicodedata.decimal("५"), unicodedata.bidirectional("א"), unicodedata.mirrored("("))
print(html.escape('<a href="x">T&C\'s</a>'), html.unescape("&lt;p&gt;caf&eacute; &#8377; &#x1F600; &amp;amp; &notanentity;"), shlex.split("cmd -o 'two words' \"q\\\"x\" a\\ b"), shlex.quote("it's here"), shlex.join(["a b", "c"]), string.ascii_letters[:5], string.punctuation, keyword.iskeyword("match"), keyword.issoftkeyword("match"), len(keyword.kwlist))
print([(tokenize.tok_name[t.type], t.string) for t in tokenize.generate_tokens(io.StringIO("x = f(1, 'a') # c\n").readline)][:9])
print(ast.dump(ast.parse("x = [i * 2 for i in range(3) if i]").body[0].value), ast.literal_eval("{'a': [1, 2.5, (None, True)], 'b': {1, 2} or 0}") if False else ast.literal_eval("{'a': [1, 2.5, (None, True)], 3: b'x'}"), ast.unparse(ast.parse("def f(a,b=2,*c,**d):return a+b if a else(b)")))
def sample(a, b: int = 2, *args, key, **kw) -> str:
    "Docstring here."
    return a
print(inspect.signature(sample), inspect.getdoc(sample), list(inspect.signature(sample).parameters), inspect.isfunction(sample), inspect.getsource(sample).splitlines()[0], inspect.signature(sample).bind(1, key=2).arguments, [i.opname for i in dis.get_instructions("a + 1")][:4])
try: ast.literal_eval("__import__('os')")
except ValueError as e: print("ValueError:", str(e)[:40])

# ==== xml-html
import xml.etree.ElementTree as ET, xml.dom.minidom, html.parser, xml.sax.saxutils
src = """<?xml version="1.0" encoding="UTF-8"?>
<library xmlns:x="urn:x" name="City &amp; Central"><book id="1" x:lang="hi"><title>गोदान</title><price cur="INR">350.50</price></book><book id="2"><title>Malgudi <i>Days</i></title><price cur="INR">199</price></book><!-- note --><empty/></library>"""
root = ET.fromstring(src)
print(root.tag, root.attrib, [b.get("id") for b in root.iter("book")], root.find("book/title").text, root.findtext("book[@id='2']/price"), [e.tag for e in root], sum(float(p.text) for p in root.iter("price")), root.find("book").get("{urn:x}lang"), "".join(root.find("book[2]/title").itertext()), len(root.findall(".//*")))
root.find("book").set("read", "yes"); ET.SubElement(root, "book", id="3").text = "new & <shiny>"; root.remove(root.find("empty")); ET.indent(root)
print(ET.tostring(root, encoding="unicode"))
print(ET.tostring(ET.fromstring("<a><b>x</b><c/></a>")), ET.tostring(ET.fromstring("<a>é</a>"), encoding="utf-8", xml_declaration=True))
for bad in ("<a><b></a>", "<a>", "text", "<a x=1/>", "<a>&nbsp;</a>", ""):
    try: ET.fromstring(bad)
    except ET.ParseError as e: print(repr(bad), "->", e, e.position)
print(xml.dom.minidom.parseString("<a x='1'><b>t</b><c/></a>").toprettyxml(indent="  "), end="")
class Links(html.parser.HTMLParser):
    def __init__(self): super().__init__(); self.out = []
    def handle_starttag(self, tag, attrs): self.out.append((tag, dict(attrs)))
    def handle_data(self, data):
        if data.strip(): self.out.append(data.strip())
p = Links(); p.feed('<p class="x">Hi <a href="/a?b=1&amp;c=2">link</a><br/><img src=x alt="a b">&copy; caf&eacute;</p>'); print(p.out, xml.sax.saxutils.escape("a<b&c"), xml.sax.saxutils.quoteattr('say "hi"'))

# ==== urls-ids-mail
import urllib.parse as up, ipaddress, uuid, email.utils, email.message, mimetypes, http, secrets, datetime
u = up.urlparse("https://user:pw@example.in:8443/a/b%20c/index.html;p?q=1&q=2&r=x%26y&e=#frag-नम")
print(u.scheme, u.netloc, u.hostname, u.port, u.username, u.path, u.params, u.query, u.fragment, up.parse_qs(u.query, keep_blank_values=True), up.parse_qsl("a=1&b=&c"), up.urlsplit("//host/p").netloc)
print(up.quote("a b/c?d=é&₹"), up.quote("a b/c", safe=""), up.quote_plus("a b+c"), up.unquote("%E0%A4%A8%E0%A4%AE%20%zz+x"), up.unquote_plus("a+b%2Bc"), up.urlencode({"q": "chai & samosa", "n": [1, 2], "u": "नम"}, doseq=True), up.urljoin("https://a.in/x/y/z.html", "../w?k=1"), up.urljoin("https://a.in/x/", "//b.in/p"), up.urlunparse(("https", "h.in", "/p", "", "a=1", "f")), up.urldefrag("http://a/b#c").url)
n = ipaddress.ip_network("192.168.10.0/26"); a = ipaddress.ip_address("2001:db8::1")
print(n.num_addresses, n.netmask, n.broadcast_address, list(n.hosts())[:2], ipaddress.ip_address("192.168.10.70") in n, [str(s) for s in n.subnets(new_prefix=28)][:2], a.exploded, a.is_private, a.version, ipaddress.ip_interface("10.1.2.3/8").network, ipaddress.ip_address("127.0.0.1").is_loopback, int(ipaddress.ip_address("1.2.3.4")), ipaddress.ip_network("10.0.0.0/8").supernet_of(ipaddress.ip_network("10.1.0.0/16")), ipaddress.collapse_addresses([ipaddress.ip_network("10.0.0.0/25"), ipaddress.ip_network("10.0.0.128/25")]).__next__())
try: ipaddress.ip_address("300.1.1.1")
except ValueError as e: print("ValueError:", e)
x = uuid.uuid5(uuid.NAMESPACE_DNS, "example.in"); v4 = uuid.uuid4(); v7 = uuid.uuid7()
print(x, uuid.uuid3(uuid.NAMESPACE_URL, "https://example.in"), x.version, x.variant, x.hex, x.int % 1000, x.urn, uuid.UUID("{12345678-1234-5678-1234-567812345678}").bytes[:4], v4.version, len(str(v4)), v7.version, uuid.UUID(int=0), uuid.NAMESPACE_DNS)
m = email.message.EmailMessage(); m["From"] = "Asha <asha@example.in>"; m["To"] = "ravi@example.in, meera@example.in"; m["Subject"] = "Chai at ५ बजे ☕"; m["Date"] = email.utils.format_datetime(datetime.datetime(2026, 1, 26, 9, 30, tzinfo=datetime.timezone(datetime.timedelta(hours=5, minutes=30)))); m.set_content("Hello,\nSee you at the stall.\n"); m.add_attachment(b"\x00\x01", maintype="application", subtype="octet-stream", filename="d.bin")
print(m["Subject"], m["Date"], m.get_content_type(), [p.get_content_type() for p in m.walk()], m.get_body().get_content(), email.utils.parseaddr("Asha K <asha@example.in>"), email.utils.getaddresses([m["To"]]), email.utils.parsedate_to_datetime("Mon, 26 Jan 2026 09:30:00 +0530").isoformat(), email.utils.formataddr(("रवि", "r@x.in")), "Subject: =?utf-8?" in m.as_string())
print(mimetypes.guess_type("report.pdf"), mimetypes.guess_type("photo.JPG"), mimetypes.guess_type("a.tar.gz"), mimetypes.guess_extension("text/html"), http.HTTPStatus(404).phrase, http.HTTPStatus.IM_A_TEAPOT.value, int(http.HTTPStatus.OK), len(secrets.token_hex(16)), len(secrets.token_urlsafe(16)) >= 22, secrets.randbelow(10) in range(10), secrets.compare_digest("a", "a"))

# ==== logging-argparse | err=skip
import logging, argparse, sys, io, contextlib, getopt, gettext, locale, platform, os
logging.basicConfig(stream=sys.stdout, level=logging.DEBUG, format="%(levelname)s:%(name)s:%(funcName)s:%(message)s")
log = logging.getLogger("app.db")
def work(): log.debug("x=%d", 5); log.info("ready %s", {"a": 1}); log.warning("careful"); log.error("failed: %s", "why")
work()
try: 1 / 0
except ZeroDivisionError: log.exception("boom")
logging.getLogger("app").setLevel(logging.ERROR); log.info("hidden"); log.critical("shown"); print(log.getEffectiveLevel(), logging.getLevelName(30), log.parent.name, log.isEnabledFor(logging.INFO))
b = io.StringIO(); h = logging.StreamHandler(b); h.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%Y")); h.addFilter(lambda r: "skip" not in r.getMessage()); l2 = logging.getLogger("other"); l2.propagate = False; l2.addHandler(h); l2.warning("kept"); l2.warning("skip me"); print(b.getvalue().split()[1:], len(b.getvalue().split()[0]))
p = argparse.ArgumentParser(prog="tool", description="Does things.", epilog="Bye.")
p.add_argument("path", nargs="+", help="files to read"); p.add_argument("-n", "--count", type=int, default=1, help="how many (default %(default)s)"); p.add_argument("-v", "--verbose", action="store_true"); p.add_argument("--mode", choices=["fast", "slow"], default="fast"); p.add_argument("--tag", action="append")
sub = p.add_subparsers(dest="cmd") if False else None
print(p.parse_args(["a.txt", "b.txt", "-n", "3", "--tag", "x", "--tag=y", "-v"]), p.parse_args(["x"]).mode, p.format_usage().strip())
p.print_help()
for bad in (["-n", "x", "f"], [], ["f", "--mode", "medium"], ["f", "--nope"]):
    e = io.StringIO()
    with contextlib.redirect_stderr(e):
        try: p.parse_args(bad)
        except SystemExit as x: print(bad, "-> exit", x.code, "|", e.getvalue().strip().splitlines()[-1])
print(getopt.getopt(["-a", "-b", "v", "--long=1", "rest"], "ab:", ["long="]), gettext.gettext("untranslated"), gettext.ngettext("%d file", "%d files", 2) % 2, platform.python_implementation(), platform.python_version(), os.name, sys.version_info.major)

# ==== unittest-doctest
import unittest, doctest, io, re, sys
def add(a, b):
    """
    >>> add(2, 3)
    5
    >>> add("a", "b")
    'ab'
    >>> add(1, "x")
    Traceback (most recent call last):
        ...
    TypeError: unsupported operand type(s) for +: 'int' and 'str'
    >>> add(0.1, 0.2)
    0.3
    """
    return a + b
class T(unittest.TestCase):
    def setUp(self): self.v = [1, 2, 3]
    def test_ok(self): self.assertEqual(sum(self.v), 6); self.assertIn(2, self.v); self.assertAlmostEqual(0.1 + 0.2, 0.3)
    def test_fail(self): self.assertEqual(add(2, 2), 5, "sums differ")
    def test_error(self): raise RuntimeError("broken test")
    @unittest.skip("not today")
    def test_skip(self): pass
    @unittest.expectedFailure
    def test_xfail(self): self.assertTrue(False)
    def test_raises(self):
        with self.assertRaisesRegex(ValueError, "invalid literal"): int("x")
    def test_sub(self):
        for i in (1, 2, 3):
            with self.subTest(i=i): self.assertLess(i, 3)
b = io.StringIO(); res = unittest.TextTestRunner(stream=b, verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(T))
print(re.sub(r"in \d+\.\d+s", "in N s", b.getvalue()))
print(res.testsRun, len(res.failures), len(res.errors), len(res.skipped), len(res.expectedFailures), res.wasSuccessful())
b = io.StringIO(); r = doctest.run_docstring_examples(add, {"add": add}, verbose=False, name="add") ; print(doctest.testmod(verbose=False))

# ==== asyncio
import asyncio, time
async def work(name, delay, log):
    await asyncio.sleep(delay); log.append(name); return f"{name}:{delay}"
async def producer(q):
    for i in range(4): await q.put(i * i); await asyncio.sleep(0.005)
    await q.put(None)
async def consumer(q):
    got = []
    while (x := await q.get()) is not None: got.append(x)
    return got
async def ticker(n):
    for i in range(n):
        yield i
        await asyncio.sleep(0)
async def main():
    log = []; t0 = time.perf_counter()
    print(await asyncio.gather(work("a", 0.15, log), work("b", 0.05, log), work("c", 0.1, log)), log, 0.14 < time.perf_counter() - t0 < 1.0)
    q = asyncio.Queue(); print((await asyncio.gather(producer(q), consumer(q)))[1])
    try:
        async with asyncio.timeout(0.02): await asyncio.sleep(1)
    except TimeoutError: print("timeout")
    try: await asyncio.wait_for(asyncio.sleep(1), 0.01)
    except asyncio.TimeoutError: print("wait_for timeout")
    async with asyncio.TaskGroup() as tg: t1 = tg.create_task(work("x", 0.01, log)); t2 = tg.create_task(work("y", 0.0, log))
    print(t1.result(), t2.result(), [i async for i in ticker(4)], await asyncio.to_thread(sum, [1, 2, 3]))
    ev = asyncio.Event(); lock = asyncio.Lock(); sem = asyncio.Semaphore(2); order = []
    async def waiter(): await ev.wait(); order.append("woke")
    async def locked(n):
        async with lock: order.append(n); await asyncio.sleep(0)
    w = asyncio.create_task(waiter()); await asyncio.gather(locked(1), locked(2)); ev.set(); await w
    async with sem: order.append(sem.locked())
    t = asyncio.create_task(asyncio.sleep(10)); await asyncio.sleep(0); t.cancel()
    try: await t
    except asyncio.CancelledError: order.append("cancelled")
    try:
        async with asyncio.TaskGroup() as tg: tg.create_task(work("z", 0, log)); tg.create_task(asyncio.sleep(0.01)); raise ValueError("in group")
    except* ValueError as eg: order.append(str(eg.exceptions[0]))
    done, pending = await asyncio.wait([asyncio.create_task(work("p", 0.01, log)), asyncio.create_task(work("q", 0.3, log))], timeout=0.1)
    for p in pending: p.cancel()
    res = [r async for r in (await x for x in asyncio.as_completed([work("s", 0.03, log), work("f", 0.01, log)]))] if False else [await c for c in asyncio.as_completed([work("s", 0.03, log), work("f", 0.01, log)])]
    loop = asyncio.get_running_loop(); fut = loop.create_future(); loop.call_later(0.01, fut.set_result, "later"); loop.call_soon(order.append, "soon")
    print(order, len(done), len(pending), res, await fut, order[-1], asyncio.current_task().get_name(), asyncio.iscoroutinefunction(main))
asyncio.run(main())
print(asyncio.run(work("again", 0, [])))

# ==== pickle-shelve-misc
import pickle, shelve, copyreg, marshal, types, weakref, gc, contextlib, io, sys, time, timeit, operator, numbers, graphlib, sched, heapq, string, secrets, getpass, enum
class Pt:
    def __init__(self, x, y): self.x, self.y = x, y
    def __eq__(self, o): return (self.x, self.y) == (o.x, o.y)
data = {"a": [1, 2.5, "x", None, True, b"b", (1, 2), {3, 4}, frozenset([5])], "p": Pt(1, 2), "n": 10 ** 30, "nested": [[[]]]}
for proto in range(0, pickle.HIGHEST_PROTOCOL + 1):
    assert pickle.loads(pickle.dumps(data, proto)) == data
print(pickle.HIGHEST_PROTOCOL, pickle.DEFAULT_PROTOCOL, pickle.dumps([1, "a", None], 2).hex(), pickle.dumps({"k": (1.5, True)}, 5).hex(), len(pickle.dumps(data)), marshal.loads(marshal.dumps([1, "x", 2.5])))
try: pickle.loads(b"garbage")
except pickle.UnpicklingError as e: print("UnpicklingError:", e)
try: pickle.dumps(lambda: 0)
except Exception as e: print(type(e).__name__)
with shelve.open("store") as db: db["list"] = [1, 2, 3]; db["pt"] = Pt(3, 4); db["नाम"] = "आशा"
with shelve.open("store") as db: print(sorted(db), db["list"], db["pt"].y, db["नाम"], len(db), "missing" in db)
class Node: pass
n = Node(); r = weakref.ref(n); wd = weakref.WeakValueDictionary({"k": n}); alive = r() is n; del n; gc.collect()
ts = graphlib.TopologicalSorter({"pie": {"dough", "filling"}, "dough": {"flour"}, "filling": {"fruit", "sugar"}}); order = list(ts.static_order())
with contextlib.redirect_stdout(io.StringIO()) as buf: print("captured")
with contextlib.suppress(KeyError): {}["x"]
@contextlib.contextmanager
def tag(name):
    out.append(f"<{name}>"); yield name; out.append(f"</{name}>")
out = []
with tag("b") as t, contextlib.ExitStack() as st: st.callback(out.append, "cb"); out.append(t)
s = sched.scheduler(time.monotonic, time.sleep); ran = []; s.enter(0.02, 1, ran.append, ("second",)); s.enter(0.01, 1, ran.append, ("first",)); s.run()
print(alive, r() is None, len(wd), order.index("flour") < order.index("dough") < order.index("pie"), repr(buf.getvalue()), out, ran, isinstance(3, numbers.Integral), isinstance(2.5, numbers.Real), types.SimpleNamespace(a=1), type(len).__name__, callable(timeit.timeit), timeit.timeit("1 + 1", number=1000) >= 0, sys.intern("x") is "x")
try: graphlib.TopologicalSorter({"a": {"b"}, "b": {"a"}}).prepare()
except graphlib.CycleError as e: print("CycleError:", e.args[0])

# ==== pydoc-help
import pydoc, sys
help("if")
print(pydoc.render_doc(len, renderer=pydoc.plaintext).strip())
print(pydoc.render_doc(str.split, renderer=pydoc.plaintext).strip().splitlines()[0])
help(divmod)
class Thing:
    "A documented thing."
    def run(self, speed: int = 1) -> str:
        "Runs."
help(Thing)

# ==== algorithms
import itertools, functools, heapq, sys
def sieve(n):
    s = bytearray([1]) * (n + 1); s[:2] = b"\0\0"
    for i in range(2, int(n ** 0.5) + 1):
        if s[i]: s[i * i::i] = bytearray(len(range(i * i, n + 1, i)))
    return [i for i, v in enumerate(s) if v]
p = sieve(200000); print(len(p), p[-3:], sum(p) % 10 ** 9)
def queens(n, row=0, cols=0, d1=0, d2=0):
    if row == n: return 1
    return sum(queens(n, row + 1, cols | b, (d1 | b) << 1, (d2 | b) >> 1) for b in (1 << c for c in range(n)) if not (cols | d1 | d2) & b)
print([queens(n) for n in range(1, 9)])
def dijkstra(g, s):
    dist = {s: 0}; pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 1e18): continue
        for v, w in g.get(u, ()):
            if d + w < dist.get(v, 1e18): dist[v] = d + w; heapq.heappush(pq, (d + w, v))
    return dist
g = {"A": [("B", 7), ("C", 9), ("F", 14)], "B": [("C", 10), ("D", 15)], "C": [("D", 11), ("F", 2)], "D": [("E", 6)], "F": [("E", 9)]}
print(sorted(dijkstra(g, "A").items()))
def lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i, x in enumerate(a):
        for j, y in enumerate(b): dp[i + 1][j + 1] = dp[i][j] + 1 if x == y else max(dp[i][j + 1], dp[i + 1][j])
    return dp[-1][-1]
print(lcs("AGGTABQWERTYUIOP" * 20, "GXTXAYBQWERTZUIOP" * 20), sorted(itertools.permutations("abcd"))[10], functools.reduce(lambda a, b: a * b % 1000000007, range(1, 5001)))
def fibs():
    a, b = 0, 1
    while True: yield a; a, b = b, a + b
print(list(itertools.islice(fibs(), 15)), len(str(next(itertools.islice(fibs(), 5000, None)))), sum(int(c) for c in str(2 ** 10000)), bin(2 ** 127 - 1).count("1"), "".join(sorted("the quick brown fox jumps over the lazy dog".replace(" ", "")))[:10])
def hanoi(n, a="A", b="B", c="C"): return hanoi(n - 1, a, c, b) + [(a, c)] + hanoi(n - 1, b, a, c) if n else []
m = [[1, 2, 3], [4, 5, 6], [7, 8, 10]]
print(len(hanoi(12)), hanoi(2), [list(r) for r in zip(*m)], [[sum(a * b for a, b in zip(r, c)) for c in zip(*m)] for r in m], sorted({w: len(w) for w in "to be or not to be that is the question".split()}.items(), key=lambda kv: (-kv[1], kv[0]))[:3], sys.getrecursionlimit() >= 1000)

# ==== lru-cache-semantics
import functools, copy, pickle, shutil, os
calls = []
@functools.lru_cache(maxsize=3)
def sq(x): calls.append(x); return x * x
for v in (1, 2, 3, 1, 4, 2, 5, 1, 3): sq(v)
print(calls, sq.cache_info(), sq.cache_parameters())
sq.cache_clear(); print(sq.cache_info(), sq(2), sq(2.0), sq.cache_info())
@functools.lru_cache(maxsize=None, typed=True)
def ty(x, *, k=0): return (type(x).__name__, x, k)
print(ty(1), ty(1.0), ty(True), ty(1, k=1), ty(x=1), ty.cache_info())
@functools.lru_cache(maxsize=0)
def nocache(x): return x
nocache(1); nocache(1); print(nocache.cache_info())
@functools.lru_cache
def bare(x):
    "doc"
    return x
print(bare(5), bare.__name__, bare.__doc__, bare.__wrapped__(6), bare.cache_parameters())
try: bare([1])
except TypeError as e: print("TypeError:", e)
try: functools.lru_cache("x")
except TypeError as e: print("TypeError:", e)
class K:
    def __init__(self, n): self.n = n
    @functools.lru_cache(maxsize=None)
    def twice(self, v): return self.n * v
    @functools.cache
    def one(self): return self.n
a, b = K(2), K(3)
print(a.twice(5), b.twice(5), a.twice(5), K.twice.cache_info(), a.one(), b.one(), K.one.cache_info().currsize)
@functools.cache
def fib(n): return n if n < 2 else fib(n - 1) + fib(n - 2)
print(fib(400), fib.cache_info())
def boom(x): raise ValueError(x)
cb = functools.lru_cache(boom)
for _ in range(2):
    try: cb(1)
    except ValueError: pass
print(cb.cache_info(), sorted(n for n in dir(sq) if n.startswith("cache")), copy.copy(sq) is sq, copy.deepcopy(sq) is sq, pickle.loads(pickle.dumps(fib)) is fib, shutil.get_terminal_size(), os.cpu_count() >= 1, len(os.urandom(8)))
