#!/usr/bin/env python3
"""Writes the reference for the SQLite Playground's tests (tests/fixtures/sqlite/):

  reference.json   what NATIVE SQLite (Python's sqlite3 module) answers for the scripts below — per statement the
                   column names, every value with its type (1 and 1.0 differ, big integers as digits, blobs as hex),
                   the number of rows changed, or the error message. tests/unit/sqlite.test.mjs runs each script as
                   ONE text through src/lib/sqlite-engine.ts (the official SQLite wasm build) and expects the same,
                   statement by statement — which also checks that the script is split where SQLite's parser ends
                   each statement.
  *.db, *.csv      files for the browser suite: databases written by native SQLite (write-ahead-log mode, full-text
                   and R-tree tables, odd names, every storage class), a damaged and a non-database file, CSVs.

    python3 scripts/make-sqlite-reference.py        (Python 3.11+ with SQLite 3.45 or newer)
"""
import json, math, os, sqlite3, shutil, tempfile

DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures', 'sqlite')
os.makedirs(DEST, exist_ok=True)


def typed(v):
    if v is None or isinstance(v, str):
        return v
    if isinstance(v, bool):
        return {'i': str(int(v))}
    if isinstance(v, int):
        return {'i': str(v)}
    if isinstance(v, float):
        return {'r': 'nan' if math.isnan(v) else 'inf' if v == math.inf else '-inf' if v == -math.inf else repr(v)}
    return {'b': bytes(v).hex()}


CASES = [
    ('storage classes and how values are written', [
        "SELECT 1, 1.0, '1', x'01', NULL, typeof(1), typeof(1.0), typeof('1'), typeof(x'01'), typeof(NULL)",
        "SELECT 9223372036854775807, -9223372036854775808, 9007199254740993, -9007199254740993, 9223372036854775807 + 1, 9223372036854775808",
        "SELECT 0.1 + 0.2, 1e300, 1e-300, 1.5e300 * 1e10, -1e999, 5e-324, 1.7976931348623157e308, 100.0, 1e15, 1e16, 123456789012345678.0, -0.0, 2.5e-5",
        "SELECT 10 / 4, 10 / 4.0, 10 % 4, -7 / 2, -7 % 2, 7 / 0, 7.0 / 0, 7 % 0, 1 << 62, ~5, 6 & 3, 6 | 3, -(-9223372036854775807 - 1)",
        "SELECT '' AS empty, ' ' AS space, 'a' || 'b', 'it''s', \"double\" FROM (SELECT 1 AS \"double\")",
        "SELECT x'', x'00ff10', zeroblob(3), length(x'00ff10'), hex(x'00ff10'), unhex('00FF'), typeof(zeroblob(0)), length(randomblob(16)), x'0102030405060708090a0b0c0d0e0f1011121314'",
        "SELECT CAST('12abc' AS INTEGER), CAST('abc' AS INTEGER), CAST(3.99 AS INTEGER), CAST(-3.99 AS INTEGER), CAST('1e3' AS REAL), CAST(5 AS TEXT), CAST(5.0 AS TEXT), CAST(x'414243' AS TEXT), CAST('é' AS BLOB), CAST(1e30 AS INTEGER), CAST('9223372036854775808' AS INTEGER), CAST(' 12 ' AS NUMERIC), CAST('0x10' AS INTEGER)",
        "SELECT 1 = 1.0, '1' = 1, 1 < '1', x'41' > 'A', NULL = NULL, NULL IS NULL, 1 IS NOT 2, 'a' < 'B', 'a' < 'b' COLLATE NOCASE, 'A' = 'a' COLLATE NOCASE, 2 BETWEEN 1 AND 3, 5 IN (1, 5), NULL IN (1, NULL), 3 NOT IN (1, 2)",
    ]),
    ('column affinity and STRICT tables', [
        "CREATE TABLE a (i INTEGER, r REAL, t TEXT, n NUMERIC, b BLOB, x)",
        "INSERT INTO a VALUES ('12', '12', 12, '12.50', '12', '12'), (1.0, 1, 1.0, '1e3', 1.0, 1.0), ('abc', 'abc', x'4142', 'abc', 'abc', 'abc'), (9007199254740993, 9007199254740993, 9007199254740993, '9007199254740993', NULL, 9007199254740993), ('007', '007', 7, '007', '007', '007'), (3.0, 3, 3.5, 3.0, 3.0, 3.0)",
        "SELECT i, typeof(i), r, typeof(r), t, typeof(t), n, typeof(n), b, typeof(b), x, typeof(x) FROM a",
        "CREATE TABLE s (id INTEGER PRIMARY KEY, name TEXT NOT NULL, amount REAL, any ANY) STRICT",
        "INSERT INTO s VALUES (1, 'a', 2, 'x'), (2, 'b', 2.5, 7)",
        "SELECT id, name, amount, typeof(amount), \"any\", typeof(\"any\") FROM s",
        "INSERT INTO s VALUES (3, 'c', 'not a number', NULL)",
    ]),
    ('text functions', [
        "SELECT length('नमस्ते'), length('😀'), octet_length('😀'), upper('straße é'), lower('ÀB'), substr('नमस्ते दुनिया', 2, 4), substr('abcdef', -3), substr('abcdef', 2), instr('banana', 'nan'), replace('a-b-c', '-', '+'), trim('  x  ') || '|', ltrim('xxyx', 'x'), rtrim('abc...', '.'), unicode('₹'), char(8377, 65, 128512)",
        "SELECT printf('%5d|%-5d|%05.1f|%x|%X|%c|%s|%%|%10.3e|%,d|%q|%Q|%w', 42, 42, 3.14159, 255, 255, 'A', NULL, 12345.678, 1234567, 'it''s', 'it''s', 'a\"b'), format('%.2f', 2.675), format('%d', '12abc'), format('%s', 1.0), format('%!.15g', 0.1), format('%lld', 9223372036854775807)",
        "SELECT 'abc' LIKE 'A%', 'abc' LIKE 'a_c', 'a%c' LIKE 'a\\%c' ESCAPE '\\', 'ÉCOLE' LIKE 'école', 'abc' GLOB 'a*', 'abc' GLOB 'A*', 'abc' GLOB '[a-c]??', 'a' REGEXP 'a'",
        "SELECT quote('it''s'), quote(1.5), quote(NULL), quote(x'00ff'), hex('नम'), concat('a', 1, NULL, 2.5), concat_ws('-', 'a', NULL, 'b'), 'x' || 1 || 2.0 || NULL, coalesce(NULL, NULL, 'c'), ifnull(NULL, 5), nullif(1, 1), iif(1 > 2, 'y', 'n'), likely(1), typeof(concat())",
        "SELECT group_concat(w, '/'), string_agg(w, ', '), min(w), max(w), count(*), count(DISTINCT lower(w)) FROM (SELECT 'pear' AS w UNION ALL SELECT 'Apple' UNION ALL SELECT 'apple' UNION ALL SELECT 'fig')",
        "SELECT w FROM (SELECT 'pear' AS w UNION ALL SELECT 'Apple' UNION ALL SELECT 'apple' UNION ALL SELECT 'fig' UNION ALL SELECT 'Éclair' UNION ALL SELECT '10' UNION ALL SELECT '9') ORDER BY w",
        "SELECT w FROM (SELECT 'pear' AS w UNION ALL SELECT 'Apple' UNION ALL SELECT 'apple' UNION ALL SELECT 'fig') ORDER BY w COLLATE NOCASE DESC, w",
        "SELECT unistr('caf\\u00e9 \\+01F600'), unistr_quote('a' || char(10) || 'b'), soundex('Robert') IS NOT NULL OR 1",
    ]),
    ('numbers and maths', [
        "SELECT abs(-5), abs(-5.5), round(2.5), round(-2.5), round(2.675, 2), round(1234.5678, -2), round(5), sign(-3), max(1, 2.0, '3'), min(1, 2.0, '3'), total(NULL), sum(NULL), 5 / 2 * 2.0, 2 + 3 * 4, (2 + 3) * 4, -2 * -3, 7 - -2, +5",
        "SELECT round(sqrt(2), 12), round(pow(2, 0.5), 12), power(2, 10), round(exp(1), 12), round(ln(10), 12), round(log10(1000), 12), round(log(2, 8), 12), round(log2(8), 12), round(pi(), 12), round(sin(1), 12), round(cos(1), 12), round(atan2(1, 2), 12), round(degrees(pi()), 9), round(radians(180), 12), ceil(2.1), ceiling(-2.1), floor(-2.5), trunc(-2.7), mod(7, 3), mod(7.5, 2)",
        "SELECT sum(x), total(x), avg(x), min(x), max(x), count(x), count(*), group_concat(x), median(x), percentile(x, 25) FROM (SELECT 1 AS x UNION ALL SELECT 2.5 UNION ALL SELECT NULL UNION ALL SELECT 4 UNION ALL SELECT 10)",
        "SELECT sum(9223372036854775807) + 0, typeof(sum(1)), typeof(sum(1.0)), typeof(total(1)), typeof(avg(2)), 9223372036854775807 * 2, 4611686018427387904 + 4611686018427387904, 3000000000 * 3000000000, typeof(3000000000 * 3000000000)",
        "SELECT sum(x) FROM (SELECT 9223372036854775807 AS x UNION ALL SELECT 1)",
        "SELECT 0x10, 0xFFFFFFFFFFFFFFFF, 1_000_000, 1e3, .5, 5., 1.e2, typeof(1e3), typeof(0x10)",
        "SELECT sqrt(-1), ln(0), ln(-1), 1e308 * 10, -1e308 * 10, pow(0, 0), acos(2), typeof(1e308 * 10), 0.0 / 0.0, typeof(0.0 / 0.0)",
    ]),
    ('dates and times', [
        "SELECT date('2026-11-17'), date('2026-11-17', '+1 month'), date('2026-01-31', '+1 month'), date('2024-02-29', '+1 year'), date('2026-11-17', 'start of month', '+1 month', '-1 day'), date('2026-11-17', 'weekday 0'), date('2026-11-17', '-7 days', 'start of year'), time('18:30'), time('18:30:15.789'), datetime('2026-11-17 18:30', '+90 minutes'), datetime('2026-11-17T18:30:00Z'), datetime('2026-11-17 18:30:00+05:30')",
        "SELECT strftime('%Y-%m-%d %H:%M:%S %j %w %W %u %s', '2026-11-17 18:30:15'), strftime('%d/%m/%Y', '2026-01-26'), strftime('%f', '2026-01-01 00:00:01.5'), strftime('%e|%k|%l|%p|%P|%R|%T|%F|%G-W%V|%U', '2026-11-07 06:05:04'), julianday('2026-11-17 12:00'), unixepoch('2026-11-17 00:00:00'), unixepoch('2026-11-17 00:00:00.5', 'subsec'), datetime(1750000000, 'unixepoch'), datetime(2461000.5), date(1750000000, 'unixepoch', '+05:30'), date('2026-02-30'), date('garbage'), date('2026-13-01')",
        "SELECT timediff('2026-11-17', '2000-02-29'), timediff('2026-01-01 00:00', '2026-01-01 12:30:15.5'), julianday('2026-11-17') - julianday('2026-01-01'), CAST(julianday('2027-10-29') - julianday('2026-11-16') AS INTEGER), strftime('%Y', '0001-01-01'), date('9999-12-31', '+1 day'), date('2026-11-17', '+1 months', '+1 years', '-1 days'), datetime('2026-03-29 01:30', 'utc') IS NOT NULL",
    ]),
    ('aggregates, GROUP BY, window functions', [
        "CREATE TABLE sales (id INTEGER PRIMARY KEY, city TEXT, month TEXT, amount REAL, qty INT)",
        "INSERT INTO sales (city, month, amount, qty) VALUES ('Pune', '2026-01', 1200.5, 3), ('Pune', '2026-02', 800, 2), ('Mumbai', '2026-01', 2500, 5), ('Mumbai', '2026-02', 2700.25, 6), ('Chennai', '2026-01', 400, 1), ('Chennai', '2026-02', NULL, 0), ('Delhi', '2026-02', 950, 2)",
        "SELECT city, count(*) AS n, count(amount), sum(amount), round(avg(amount), 2), min(amount), max(qty), total(qty) FROM sales GROUP BY city HAVING count(*) > 1 ORDER BY sum(amount) DESC NULLS LAST",
        "SELECT month, group_concat(city, ', ' ORDER BY city), sum(qty) FILTER (WHERE amount > 500), json_group_array(qty ORDER BY qty DESC) FROM sales GROUP BY month ORDER BY month",
        "SELECT city, month, amount, sum(amount) OVER (PARTITION BY city ORDER BY month) AS running, rank() OVER (ORDER BY amount DESC NULLS LAST) AS rk, dense_rank() OVER (ORDER BY qty DESC) AS dr, row_number() OVER (PARTITION BY month ORDER BY amount DESC NULLS LAST) AS rn, lag(amount) OVER (PARTITION BY city ORDER BY month) AS prev, lead(qty, 1, -1) OVER (ORDER BY id) AS nxt, ntile(3) OVER (ORDER BY id) AS third, first_value(city) OVER w, round(avg(amount) OVER (ORDER BY id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING), 3), percent_rank() OVER (ORDER BY qty), round(cume_dist() OVER (ORDER BY qty), 4) FROM sales WINDOW w AS (PARTITION BY month ORDER BY amount DESC NULLS LAST) ORDER BY id",
        "SELECT DISTINCT city FROM sales ORDER BY 1 DESC LIMIT 2 OFFSET 1",
        "SELECT city, amount FROM sales ORDER BY amount IS NULL, amount DESC, city LIMIT 3",
        "SELECT count(*), sum(amount), avg(qty), max(city), min(month), group_concat(DISTINCT month) FROM sales WHERE city = 'Nowhere'",
        "SELECT CASE WHEN amount IS NULL THEN 'none' WHEN amount >= 2000 THEN 'big' WHEN amount >= 900 THEN 'mid' ELSE 'small' END AS size, count(*) FROM sales GROUP BY 1 ORDER BY 2 DESC, 1",
    ]),
    ('joins, subqueries, compound queries, CTEs', [
        "CREATE TABLE c (id INTEGER PRIMARY KEY, name TEXT, city TEXT); CREATE TABLE o (id INTEGER PRIMARY KEY, cid INT, total REAL)",
        "INSERT INTO c VALUES (1, 'Asha', 'Pune'), (2, 'Ravi', 'Mumbai'), (3, 'Meera', NULL), (4, 'Kabir', 'Delhi')",
        "INSERT INTO o VALUES (101, 1, 450.5), (102, 1, 120), (103, 2, 980), (104, 9, 60), (105, NULL, 10)",
        "SELECT c.name, o.id, o.total FROM c JOIN o ON o.cid = c.id ORDER BY o.id",
        "SELECT c.name, count(o.id), coalesce(sum(o.total), 0) FROM c LEFT JOIN o ON o.cid = c.id GROUP BY c.id ORDER BY c.id",
        "SELECT c.name, o.id FROM c RIGHT JOIN o ON o.cid = c.id ORDER BY o.id",
        "SELECT c.id, o.id FROM c FULL OUTER JOIN o ON o.cid = c.id ORDER BY c.id NULLS LAST, o.id",
        "SELECT count(*) FROM c CROSS JOIN o",
        "SELECT name FROM c WHERE id IN (SELECT cid FROM o WHERE total > 100) ORDER BY name",
        "SELECT name, (SELECT max(total) FROM o WHERE o.cid = c.id) AS best FROM c WHERE EXISTS (SELECT 1 FROM o WHERE o.cid = c.id) ORDER BY best DESC",
        "SELECT name FROM c WHERE city IS NULL UNION SELECT 'z' UNION ALL SELECT name FROM c WHERE id < 3 ORDER BY 1",
        "SELECT id FROM c INTERSECT SELECT cid FROM o",
        "SELECT id FROM c EXCEPT SELECT cid FROM o ORDER BY 1 DESC",
        "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10), f(i, a, b) AS (SELECT 1, 0, 1 UNION ALL SELECT i + 1, b, a + b FROM f WHERE i < 90) SELECT (SELECT sum(x) FROM n), (SELECT group_concat(x) FROM n WHERE x % 2), (SELECT b FROM f ORDER BY i DESC LIMIT 1)",
        "WITH t AS MATERIALIZED (SELECT cid, sum(total) AS s FROM o GROUP BY cid) SELECT c.name, t.s FROM t JOIN c ON c.id = t.cid ORDER BY t.s",
        "VALUES (1, 'a'), (2, 'b'), (3, NULL)",
        "SELECT * FROM (VALUES (3, 'c'), (1, 'a')) AS v(n, s) ORDER BY n",
        "SELECT a.name, b.name FROM c a, c b WHERE a.id < b.id AND a.city IS NOT b.city ORDER BY 1, 2 LIMIT 4",
    ]),
    ('data changes: counts, UPSERT, RETURNING, triggers, foreign keys, transactions', [
        "PRAGMA foreign_keys = ON",
        "CREATE TABLE p (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, n INT DEFAULT 0, at TEXT DEFAULT '2026-01-01', CHECK (n >= 0))",
        "CREATE TABLE ch (id INTEGER PRIMARY KEY, pid INT REFERENCES p(id) ON DELETE CASCADE, v TEXT)",
        "CREATE TABLE log (what TEXT)",
        "CREATE TRIGGER t1 AFTER UPDATE OF n ON p BEGIN INSERT INTO log VALUES (old.name || ': ' || old.n || ' -> ' || new.n); END",
        "INSERT INTO p (name, n) VALUES ('a', 1), ('b', 2), ('c', 3)",
        "INSERT INTO p (name) VALUES ('d') RETURNING id, name, n, at",
        "INSERT INTO p (name, n) VALUES ('a', 10) ON CONFLICT (name) DO UPDATE SET n = n + excluded.n RETURNING *",
        "INSERT OR IGNORE INTO p (name) VALUES ('b'), ('e')",
        "REPLACE INTO p (id, name, n) VALUES (2, 'b2', 20)",
        "UPDATE p SET n = n * 2 WHERE n > 2",
        "UPDATE p SET n = n WHERE 0",
        "INSERT INTO ch VALUES (1, 1, 'x'), (2, 1, 'y'), (3, 3, 'z')",
        "DELETE FROM p WHERE id = 1",
        "SELECT (SELECT count(*) FROM ch), (SELECT group_concat(what, '; ') FROM log), (SELECT seq FROM sqlite_sequence WHERE name = 'p'), changes(), last_insert_rowid()",
        "BEGIN",
        "DELETE FROM p",
        "SELECT count(*) FROM p",
        "ROLLBACK",
        "SELECT id, name, n FROM p ORDER BY id",
        "SAVEPOINT s1; INSERT INTO p (name) VALUES ('tmp'); ROLLBACK TO s1; RELEASE s1",
        "UPDATE p SET n = n + 1 RETURNING id, n",
        "DELETE FROM p WHERE id > 100",
        "WITH big AS (SELECT id FROM p WHERE n > 5) DELETE FROM p WHERE id IN (SELECT id FROM big)",
        "INSERT INTO ch VALUES (9, 999, 'orphan')",
    ]),
    ('constraint errors', [
        "CREATE TABLE u (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, n INT CHECK (n > 0))",
        "INSERT INTO u VALUES (1, 'a', 1)",
        "INSERT INTO u VALUES (2, 'a', 1)",
    ]),
    ('NOT NULL error', ["CREATE TABLE u (id INTEGER PRIMARY KEY, name TEXT NOT NULL)", "INSERT INTO u (id) VALUES (1)"]),
    ('CHECK error', ["CREATE TABLE u (n INT CHECK (n > 0))", "INSERT INTO u VALUES (5), (-1)"]),
    ('syntax error after good statements', ["SELECT 1", "SELECT 2;", "SELEC 3", "SELECT 4"]),
    ('unknown table', ["SELECT * FROM nowhere"]),
    ('unknown column', ["CREATE TABLE t (a)", "SELECT b FROM t"]),
    ('unknown function', ["SELECT nosuchfunction(1)"]),
    ('wrong number of arguments', ["SELECT substr()"]),
    ('incomplete statement', ["SELECT (1 + "]),
    ('unterminated string', ["SELECT 'abc"]),
    ('table exists', ["CREATE TABLE t (a)", "CREATE TABLE t (b)"]),
    ('too many values', ["CREATE TABLE t (a, b)", "INSERT INTO t VALUES (1, 2, 3)"]),
    ('ambiguous column', ["CREATE TABLE a (id); CREATE TABLE b (id)", "SELECT id FROM a, b"]),
    ('misuse of aggregate', ["SELECT sum(1) + max(sum(2))"]),
    ('division of text', ["SELECT 'abc' / 2, 'abc' + 1, '3 apples' * 2, '0x10' + 0, NULL + 1, '1e2' + 0, ' 5 ' + 0, '5abc' = 5"]),
    ('JSON', [
        "SELECT json('{\"a\": [1, 2.50, \"x\", null, true], \"b\": {\"c\": 9007199254740993}}'), json_extract('{\"a\": [1, 2.5, \"x\"]}', '$.a[1]', '$.a[2]', '$.a[9]'), '{\"a\": {\"b\": [10, 20]}}' -> 'a' -> 'b' ->> 1, '{\"a\": \"text\"}' ->> 'a', '{\"a\": \"text\"}' -> 'a', json_type('{\"a\": 1.5}', '$.a'), json_valid('{'), json_array_length('[1, [2, 3]]'), json_quote('it''s \"q\"')",
        "SELECT json_object('name', 'Asha', 'age', 31, 'tags', json_array('a', 'b'), 'n', NULL, 'f', 1.0), json_array(1, 2.5, 'x', NULL, json('[1]')), json_insert('{\"a\": 1}', '$.b', 2), json_set('{\"a\": 1}', '$.a', 'x'), json_replace('{\"a\": 1}', '$.z', 0), json_remove('{\"a\": 1, \"b\": 2}', '$.a'), json_patch('{\"a\": 1, \"b\": 2}', '{\"b\": null, \"c\": 3}'), json_pretty('{\"a\":[1,2]}')",
        "SELECT key, value, type, atom, fullkey FROM json_each('{\"a\": 1, \"b\": [2, 3], \"c\": \"x\", \"d\": null, \"e\": 1.5}')",
        "SELECT fullkey, type, value FROM json_tree('{\"a\": {\"b\": [1, {\"c\": true}]}}') WHERE type NOT IN ('object', 'array') ORDER BY id",
        "SELECT json_group_array(x), json_group_object('k' || x, x * x) FROM (SELECT 1 AS x UNION ALL SELECT 2 UNION ALL SELECT 3)",
        "SELECT json_extract('{\"big\": 12345678901234567890, \"f\": 1e400, \"s\": \"\\u00e9\\ud83d\\ude00\"}', '$.big', '$.s'), typeof(json_extract('{\"n\": 5}', '$.n')), typeof(json_extract('{\"n\": 5.0}', '$.n')), json('[1,2,') IS NULL",
    ]),
    ('full-text search and R-tree', [
        "CREATE VIRTUAL TABLE docs USING fts5(title, body)",
        "INSERT INTO docs VALUES ('Chai recipes', 'Masala chai with ginger and cardamom'), ('Coffee guide', 'Filter coffee from Chennai, strong and sweet'), ('Tea gardens', 'Darjeeling and Assam tea gardens; chai stalls everywhere')",
        "SELECT title FROM docs WHERE docs MATCH 'chai' ORDER BY rank",
        "SELECT title, snippet(docs, 1, '[', ']', '…', 4) FROM docs WHERE docs MATCH 'body: gardens OR coffee' ORDER BY rowid",
        "SELECT count(*) FROM docs WHERE docs MATCH 'cha*', (SELECT count(*) FROM docs WHERE docs MATCH '\"filter coffee\"'), (SELECT highlight(docs, 0, '<', '>') FROM docs WHERE docs MATCH 'title: tea')",
        "CREATE VIRTUAL TABLE boxes USING rtree(id, minx, maxx, miny, maxy)",
        "INSERT INTO boxes VALUES (1, 0, 10, 0, 10), (2, 5, 15, 5, 15), (3, 100, 110, 100, 110)",
        "SELECT id FROM boxes WHERE minx <= 12 AND maxx >= 8 AND miny <= 12 AND maxy >= 8 ORDER BY id",
        "SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'shadow' AND name LIKE 'docs%' ORDER BY name",
    ]),
    ('views, indexes, generated columns, pragmas, schema changes', [
        "CREATE TABLE item (id INTEGER PRIMARY KEY, name TEXT, price REAL, qty INT, total REAL GENERATED ALWAYS AS (price * qty) VIRTUAL, code TEXT AS (upper(substr(name, 1, 3))) STORED)",
        "INSERT INTO item (name, price, qty) VALUES ('tea', 120.5, 2), ('mug', 250, 1), ('jam', 90, 4)",
        "CREATE INDEX item_name ON item (name COLLATE NOCASE); CREATE UNIQUE INDEX item_code ON item (code); CREATE INDEX item_expr ON item (price * qty) WHERE qty > 1",
        "CREATE VIEW costly AS SELECT name, total FROM item WHERE total > 240 ORDER BY total DESC",
        "SELECT * FROM costly",
        "SELECT * FROM item",
        "SELECT name, type, pk, \"notnull\", dflt_value, hidden FROM pragma_table_xinfo('item')",
        "SELECT name, \"unique\", origin, partial FROM pragma_index_list('item') ORDER BY name",
        "SELECT type, name, tbl_name FROM sqlite_schema ORDER BY name",
        "ALTER TABLE item ADD COLUMN note TEXT DEFAULT 'none'; ALTER TABLE item RENAME COLUMN qty TO quantity; ALTER TABLE item RENAME TO items",
        "SELECT name, quantity, note, total FROM items ORDER BY id",
        "DROP VIEW costly; ALTER TABLE items DROP COLUMN note",
        "SELECT group_concat(name) FROM pragma_table_info('items')",
        "PRAGMA user_version = 7; PRAGMA user_version",
        "PRAGMA integrity_check",
        "EXPLAIN QUERY PLAN SELECT * FROM items WHERE name = 'tea'",
        "CREATE TEMP TABLE scratch (x); INSERT INTO scratch VALUES (1); SELECT count(*) FROM temp.scratch",
        "SELECT name FROM pragma_function_list WHERE name IN ('json_extract', 'sqrt', 'fts5', 'rtreecheck', 'unhex', 'median') GROUP BY name ORDER BY name",
    ]),
    ('one text with comments, strings holding semicolons, a trigger body and blank statements', [
        "-- a comment; with a semicolon\nCREATE TABLE t (a TEXT, b INT)",
        "/* block ; comment\n   over lines */ INSERT INTO t VALUES ('x;y', 1), ('it''s; fine', 2), ('--not a comment', 3), ('/* nor this */', 4)",
        ";;  ;",
        "CREATE TRIGGER tr AFTER INSERT ON t BEGIN UPDATE t SET b = b + 100 WHERE a = new.a; SELECT 1; END",
        "INSERT INTO t VALUES ('new', 5)",
        "SELECT a, b FROM t ORDER BY rowid -- trailing comment",
        "SELECT 'last'  /* no semicolon at the end */",
    ]),
    ('names that need quoting', [
        "CREATE TABLE \"we\"\"ird\" (\"a b\" INT, \"select\" TEXT, \"नाम\" TEXT, [bracket col] INT, `tick` INT)",
        "INSERT INTO \"we\"\"ird\" VALUES (1, 's', 'आशा', 2, 3)",
        "SELECT \"a b\", \"select\", \"नाम\", [bracket col], `tick`, \"a b\" + 1 AS \"sum, with comma\", 'x' AS \"\" FROM \"we\"\"ird\"",
        "SELECT 1 AS a, 2 AS a, 3 AS A, 4 AS \"a:1\"",
        "CREATE TABLE sqlitedata (z); CREATE TABLE \"back\\slash\" (y); INSERT INTO sqlitedata VALUES (1)",
        "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    ]),
]

out = []
for name, statements in CASES:
    con = sqlite3.connect(':memory:', isolation_level=None)
    res = []
    for sql in statements:
        entry = {'sql': sql}
        try:
            # a "statement" of the list may itself hold several (to test splitting): run them one by one, as the
            # sqlite3 shell would, and record the last one that returns rows plus the changes of the last one
            parts, buf = [], ''
            for ch in sql:
                buf += ch
                if ch == ';' and sqlite3.complete_statement(buf):
                    parts.append(buf); buf = ''
            if buf.strip():
                parts.append(buf)
            entry['parts'] = []
            for part in parts:
                cur = con.execute(part)
                if cur.description is None and not part.strip().strip(';').strip():
                    continue
                first = part.lstrip().split(None, 1)[0].upper().rstrip(';') if part.strip() else ''
                p = {'columns': [d[0] for d in cur.description] if cur.description else [], 'rows': [[typed(v) for v in row] for row in cur.fetchall()]}
                if first in ('INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'WITH') and cur.rowcount >= 0:
                    p['changed'] = cur.rowcount
                entry['parts'].append(p)
        except sqlite3.Error as e:
            entry['error'] = str(e)
            res.append(entry)
            break
        res.append(entry)
    out.append({'name': name, 'statements': res})
    con.close()
with open(os.path.join(DEST, 'reference.json'), 'w', encoding='utf-8') as f:
    json.dump({'sqlite': sqlite3.sqlite_version, 'cases': out}, f, ensure_ascii=False, indent=0)
    f.write('\n')
n = sum(len(c['statements']) for c in out)
print(len(out), 'scripts,', n, 'statements →', os.path.normpath(os.path.join(DEST, 'reference.json')), os.path.getsize(os.path.join(DEST, 'reference.json')), 'bytes; SQLite', sqlite3.sqlite_version)
for c in out:
    for s in c['statements']:
        if 'error' in s and not any(k in c['name'] for k in ('error', 'unknown', 'wrong', 'incomplete', 'unterminated', 'exists', 'too many', 'ambiguous', 'misuse', 'changes', 'STRICT')):
            print('  unexpected error in', repr(c['name']), '|', s['sql'][:70], '→', s['error'])

# ---------------------------------------------------------------- files for the browser suite
def db(name, script, wal=False):
    path = os.path.join(DEST, name)
    for ext in ('', '-wal', '-shm'):
        if os.path.exists(path + ext):
            os.remove(path + ext)
    con = sqlite3.connect(path)
    if wal:
        con.execute('PRAGMA journal_mode = WAL')
    con.executescript(script)
    con.commit(); con.close()
    return path

db('plain.db', """CREATE TABLE t (a, b, c, d);
INSERT INTO t VALUES (1, '', x'00ff10', 1.0), (9223372036854775807, NULL, NULL, 0.1), (-9007199254740993, 'é😀', zeroblob(3), 1e300), (9007199254740993, 'line1' || char(10) || 'line2', x'', 2.5), (0, '<b>x</b>', NULL, 0.0);
CREATE TABLE big (n INTEGER PRIMARY KEY, sq INT, label TEXT);
WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 5000) INSERT INTO big SELECT n, n * n, 'row ' || n FROM s;
CREATE INDEX big_sq ON big (sq); CREATE VIEW small AS SELECT * FROM big WHERE n <= 3;""")
db('wal.db', "CREATE TABLE t (a); INSERT INTO t VALUES (1), (2);", wal=True)
db('fts.db', """CREATE VIRTUAL TABLE notes USING fts5(title, body); INSERT INTO notes VALUES ('Chai', 'masala chai with ginger'), ('Coffee', 'filter coffee');
CREATE VIRTUAL TABLE old USING fts4(x); INSERT INTO old VALUES ('legacy full-text table');
CREATE VIRTUAL TABLE boxes USING rtree(id, x0, x1); INSERT INTO boxes VALUES (1, 0, 10);
CREATE TABLE plain (k TEXT); INSERT INTO plain VALUES ('ok');""")
db('quote.db', """CREATE TABLE "we""ird" (x); INSERT INTO "we""ird" VALUES (1);
CREATE TABLE "back\\slash" (y); CREATE TABLE "has space" (q); INSERT INTO "has space" VALUES (7); CREATE TABLE "select" (w);
CREATE TABLE sqlitedata (z); INSERT INTO sqlitedata VALUES (1); CREATE TABLE "नाम सूची" ("पहला नाम" TEXT); INSERT INTO "नाम सूची" VALUES ('आशा');
CREATE VIEW v AS SELECT 1 AS one; CREATE VIEW broken AS SELECT * FROM "has space" WHERE q > 0; DROP TABLE "has space"; CREATE TABLE "has space" (other);""")
data = open(os.path.join(DEST, 'plain.db'), 'rb').read()
open(os.path.join(DEST, 'trunc.db'), 'wb').write(data[:len(data) // 3])
open(os.path.join(DEST, 'junk.db'), 'w').write('this is not a database\n' * 20)
open(os.path.join(DEST, 'binary.db'), 'wb').write(bytes(range(256)) * 8)
open(os.path.join(DEST, 'empty.db'), 'wb').write(b'')
CSV = {
    'lead.csv': 'pin,phone,id,amount,name\n011001,09876543210,1234567890123456789,10.5,A\n400001,09123456789,1234567890123456788,7,B\n',
    'dup.csv': 'a,b,a\n1,2,3\n', 'dup2.csv': 'Name,name\n1,2\n', 'headeronly.csv': 'a,b,c\n', 'empty.csv': '',
    'bom.csv': '﻿id,full name,note\r\n1,"Rao, Asha","said ""hi"""\r\n2,"multi\nline",\r\n',
    'emptyhead.csv': 'a,,c,col2\n1,2,3,4\n', 'ragged.csv': 'a,b\n1,2,3,4\n5\n', 'semi.csv': 'a;b;c\n1,5;2;x\n2,5;3;y\n',
    'nums.csv': 'v\n1e999\n-0\n1.5\n', 'bigint.csv': 'v\n9007199254740993\n123456789012345\n', 'tabs.tsv': 'city\train_mm\tnote\nMumbai\t2422\twet\nPune\t722\t\n',
    'devanagari.csv': 'नाम,शहर,अंक\nआशा,पुणे,91\nरवि,मुंबई,78\n',
}
for name, text in CSV.items():
    with open(os.path.join(DEST, name), 'w', encoding='utf-8', newline='') as f:
        f.write(text)
print('files:', ', '.join(sorted(os.listdir(DEST))))
