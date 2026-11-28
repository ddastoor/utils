# sqlite3, bz2 and lzma — in the build since 28 Nov 2026 (SQLite 3.54.1, bzip2 1.0.8 and liblzma 5.8.4 linked into python.wasm).
# The native CPython that makes the reference runs the same SQLite and liblzma with the same options (wasm/python/build.sh),
# so every answer — down to the size of a database file and the bytes a compressor writes — must be the same.

# ==== sqlite3: tables, parameters, types, functions
import sqlite3
cx = sqlite3.connect(":memory:")
print(sqlite3.sqlite_version, sqlite3.threadsafety)
cx.execute("create table people (id integer primary key, name text not null, born integer, weight real, photo blob)")
cx.executemany("insert into people (name, born, weight, photo) values (?, ?, ?, ?)",
               [("Asha", 1990, 52.5, b"\x00\x01"), ("Ravi", 1985, 70.25, None), ("Meera", 2001, None, b"")])
cx.execute("insert into people (name, born) values (:n, :b)", {"n": "Imran", "b": 1979})
for row in cx.execute("select id, name, born, weight, photo, typeof(photo) from people order by born"):
    print(row)
cx.row_factory = sqlite3.Row
r = cx.execute("select name, born from people where name = ?", ("Ravi",)).fetchone()
print(r.keys(), r["name"], r[1], dict(r))
cx.row_factory = None
print(cx.execute("select count(*), avg(born), group_concat(name, '|') from people").fetchone())
print(cx.execute("select json_object('a', 1, 'b', json_array(1, 2)), json_extract('{\"x\": [5, 6]}', '$.x[1]')").fetchone())
print(cx.execute("select round(sqrt(2), 6), pow(2, 10), ln(1), pi() > 3.14, 7 / 2, 7 / 2.0, -7 % 3").fetchone())
print(cx.execute("select name, rank() over (order by born desc) from people").fetchall())
cx.execute("create table kv (k text primary key, v integer)")
for _ in range(2):
    cx.execute("insert into kv values ('a', 1) on conflict(k) do update set v = v + 1")
print(cx.execute("insert into kv values ('b', 7) returning k, v").fetchall(), cx.execute("select * from kv order by k").fetchall())
print(cx.total_changes, cx.execute("select changes()").fetchone(), cx.in_transaction)
print(cx.execute("select upper('straße'), lower('ÉCOLE'), length('नमस्ते'), unicode('₹'), char(8377), hex('é')").fetchone())
print(cx.execute("select date('2026-11-28', '+1 month', 'start of month'), strftime('%j %w %Y', '2024-02-29'), julianday('2000-01-01')").fetchone())

# ==== sqlite3: errors, transactions, functions of one's own
import sqlite3
cx = sqlite3.connect(":memory:", autocommit=False)
cx.execute("create table t (x integer unique)")
cx.execute("insert into t values (1)")
try:
    cx.execute("insert into t values (1)")
except sqlite3.IntegrityError as e:
    print("IntegrityError:", e, e.sqlite_errorname, e.sqlite_errorcode)
try:
    cx.execute("selec 1")
except sqlite3.OperationalError as e:
    print("OperationalError:", e)
try:
    cx.execute("select * from nowhere")
except sqlite3.OperationalError as e:
    print("OperationalError:", e)
try:
    cx.execute("select ?", (1, 2))
except sqlite3.ProgrammingError as e:
    print("ProgrammingError:", e)
cx.commit()
cx.execute("insert into t values (2)")
print(cx.in_transaction)
cx.rollback()
print(cx.execute("select x from t").fetchall(), cx.in_transaction)
cx.create_function("double", 1, lambda v: v * 2, deterministic=True)
class Longest:
    def __init__(self): self.best = ""
    def step(self, v):
        if len(v) > len(self.best): self.best = v
    def finalize(self): return self.best
cx.create_aggregate("longest", 1, Longest)
cx.create_collation("backwards", lambda a, b: (a[::-1] > b[::-1]) - (a[::-1] < b[::-1]))
cx.execute("create table w (s text)")
cx.executemany("insert into w values (?)", [("apple",), ("kiwi",), ("banana",), ("fig",)])
print(cx.execute("select double(21), longest(s) from w").fetchone())
print([r[0] for r in cx.execute("select s from w order by s collate backwards")])
print(sqlite3.complete_statement("select 1;"), sqlite3.complete_statement("select 1"))
cx.commit()
print(list(cx.iterdump()))

# ==== sqlite3: a database file, backup and serialize
import sqlite3, os
cx = sqlite3.connect("data.db")
cx.execute("create table notes (id integer primary key, body text)")
with cx:
    cx.executemany("insert into notes (body) values (?)", [(f"note {i}",) for i in range(1, 1001)])
cx.close()
print(os.path.getsize("data.db"), open("data.db", "rb").read(16), sorted(os.listdir(".")))
cx = sqlite3.connect("data.db")
print(cx.execute("select count(*), max(body), sum(length(body)) from notes").fetchone())
print(cx.execute("pragma journal_mode").fetchone(), cx.execute("pragma journal_mode = wal").fetchone(), cx.execute("pragma integrity_check").fetchone())
with cx:
    cx.execute("update notes set body = upper(body) where id % 100 = 0")
    cx.execute("delete from notes where id > 900")
cx.execute("vacuum")
print(os.path.getsize("data.db"), cx.execute("select count(*), group_concat(body, ',') filter (where body like 'NOTE%') from notes").fetchone())
mem = sqlite3.connect(":memory:")
cx.backup(mem)
print(mem.execute("select count(*) from notes").fetchone())
blob = cx.serialize()
print(len(blob), blob[:16])
other = sqlite3.connect(":memory:")
other.deserialize(blob)
print(other.execute("select body from notes where id = 42").fetchone())
cx.close()
os.remove("data.db")
print(os.path.exists("data.db"), sorted(os.listdir(".")))
big = sqlite3.connect(":memory:")
print(big.execute("with recursive c(x) as (select 1 union all select x + 1 from c where x < 200000) select count(*), sum(x) from (select x from c order by x desc)").fetchone())

# ==== sqlite3: full-text search, R-tree, dbm and shelve
import sqlite3, dbm, shelve, os
cx = sqlite3.connect(":memory:")
cx.execute("create virtual table docs using fts5(title, body)")
cx.executemany("insert into docs values (?, ?)", [("Tea", "Assam and Darjeeling teas"), ("Spice", "cardamom, pepper and cloves"), ("Coffee", "Coorg coffee with cardamom")])
print(cx.execute("select title from docs where docs match 'cardamom' order by rank").fetchall())
print(cx.execute("select highlight(docs, 1, '[', ']') from docs where docs match 'coffee'").fetchall())
cx.execute("create virtual table v4 using fts4(t)")
cx.execute("insert into v4 values ('the quick brown fox')")
print(cx.execute("select t from v4 where t match 'quick OR slow'").fetchall())
cx.execute("create virtual table box using rtree(id, minx, maxx, miny, maxy)")
cx.execute("insert into box values (1, 0, 10, 0, 10), (2, 20, 30, 20, 30)")
print(cx.execute("select id from box where minx <= 5 and maxx >= 5 and miny <= 5 and maxy >= 5").fetchall())
print(cx.execute("select name from dbstat limit 1").fetchall() is not None)
with dbm.open("store", "c") as db:
    db["k"] = "v"
    db[b"n"] = b"\x00\xff"
with dbm.open("store") as db:
    print(sorted(db.keys()), db["k"], db[b"n"])
print(dbm.whichdb("store"))
with shelve.open("shelf") as sh:
    sh["list"] = [1, 2, {"three": 3}]
with shelve.open("shelf") as sh:
    print(sh["list"], sorted(sh))
print(sorted(os.listdir(".")))

# ==== sqlite3: local time | tz=Asia/Kolkata,America/New_York,Europe/London,Australia/Lord_Howe
import sqlite3
cx = sqlite3.connect(":memory:")
for t in (0, 1700000000, 1785000000, 1774746000):
    print(cx.execute("select datetime(?, 'unixepoch'), datetime(?, 'unixepoch', 'localtime')", (t, t)).fetchone())
print(cx.execute("select datetime('2026-03-29 01:30:00', 'utc'), datetime('2026-07-01 12:00:00', 'utc'), datetime('2026-12-25 09:00:00', 'utc')").fetchone())

# ==== bz2 and lzma: the bytes the C libraries write
import bz2, lzma, hashlib
data = ("The quick brown fox jumps over the lazy dog. " * 50).encode()
for level in (1, 9):
    b = bz2.compress(data, level)
    print("bz2", level, len(b), hashlib.sha256(b).hexdigest()[:16], bz2.decompress(b) == data)
print(bz2.compress(b"", 9).hex())
for preset in (0, 6, 9 | lzma.PRESET_EXTREME):
    x = lzma.compress(data, preset=preset)
    print("xz", preset, len(x), hashlib.sha256(x).hexdigest()[:16], lzma.decompress(x) == data)
a = lzma.compress(data, format=lzma.FORMAT_ALONE, preset=6)
print("alone", len(a), hashlib.sha256(a).hexdigest()[:16], lzma.decompress(a, format=lzma.FORMAT_ALONE) == data, lzma.decompress(a) == data)
filters = [{"id": lzma.FILTER_DELTA, "dist": 4}, {"id": lzma.FILTER_LZMA2, "preset": 9 | lzma.PRESET_EXTREME}]
raw = lzma.compress(data, format=lzma.FORMAT_RAW, filters=filters)
print("raw", len(raw), hashlib.sha256(raw).hexdigest()[:16], lzma.decompress(raw, format=lzma.FORMAT_RAW, filters=filters) == data)
for check in (lzma.CHECK_NONE, lzma.CHECK_CRC32, lzma.CHECK_CRC64, lzma.CHECK_SHA256):
    c = lzma.compress(data, check=check)
    print("check", check, len(c), lzma.is_check_supported(check), lzma.decompress(c) == data)
x86 = lzma.compress(bytes(range(256)) * 40, filters=[{"id": lzma.FILTER_X86}, {"id": lzma.FILTER_LZMA2}])
print("x86", len(x86), hashlib.sha256(x86).hexdigest()[:16], lzma.decompress(x86) == bytes(range(256)) * 40)
# made by the system's xz 5.4.5 (CRC64) and bzip2 1.0.8 programs, not by these libraries
print(lzma.decompress(bytes.fromhex("fd377a585a000004e6d6b4460200210116000000742fe5a30100106d61646520627920787a20352e342e350a00000000c8914acc1ef56c4300012911320a700e1fb6f37d010000000004595a")))
print(bz2.decompress(bytes.fromhex("425a68393141592653593236a515000008d98000104000100036e2d430200031434d30004419326986a3a91dc9d2933c5584961d11a05f1772453850903236a515")))
print(len(bz2.decompress(bz2.compress(b"one") + bz2.compress(b"two"))), lzma.decompress(lzma.compress(b"one") + lzma.compress(b"two")))
d = lzma.LZMADecompressor()
part = d.decompress(lzma.compress(data)[:60])
print(len(part), d.eof, d.needs_input, d.check)
for bad in (b"not compressed", b"BZh9" + bytes(20)):
    for mod in (bz2, lzma):
        try:
            mod.decompress(bad)
        except Exception as e:
            print(mod.__name__, type(e).__name__, e)

# ==== bz2 and lzma: files, tarfile, zipfile, shutil
import bz2, lzma, tarfile, zipfile, shutil, os
with bz2.open("t.txt.bz2", "wt", encoding="utf-8") as f:
    f.write("bz2 line ₹\n" * 3)
with bz2.open("t.txt.bz2", "rt", encoding="utf-8") as f:
    print(repr(f.read()), os.path.getsize("t.txt.bz2"))
with lzma.open("t.txt.xz", "wt", encoding="utf-8") as f:
    f.write("xz line\n" * 3)
with lzma.open("t.txt.xz", "rt", encoding="utf-8") as f:
    print(f.readline().strip(), os.path.getsize("t.txt.xz"))
os.mkdir("pack")
with open("pack/a.txt", "w") as f: f.write("A" * 1000)
with open("pack/b.txt", "w") as f: f.write("B" * 2000)
for mode in ("w:gz", "w:bz2", "w:xz"):
    name = "pack.tar." + mode[2:]
    with tarfile.open(name, mode) as t:
        t.add("pack")
    with tarfile.open(name) as t:
        print(mode, sorted(t.getnames()), t.extractfile("pack/b.txt").read() == b"B" * 2000)
for method in (zipfile.ZIP_DEFLATED, zipfile.ZIP_BZIP2, zipfile.ZIP_LZMA):
    with zipfile.ZipFile("p.zip", "w", method) as z:
        z.write("pack/a.txt"); z.write("pack/b.txt")
    with zipfile.ZipFile("p.zip") as z:
        print(method, z.testzip(), [i.compress_type for i in z.infolist()], z.read("pack/b.txt") == b"B" * 2000)
for fmt in ("bztar", "xztar"):
    print(fmt, os.path.basename(shutil.make_archive("arch", fmt, "pack")))
shutil.unpack_archive("arch.tar.xz", "out")
print(sorted(os.listdir("out")), open("out/a.txt").read() == "A" * 1000)
