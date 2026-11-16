// SQLite Playground (#/sqlite, PC only): a database made here with Python's sqlite3 is opened and queried, and the
// results equal Python's for aggregate, join, window and JSON queries; several statements in one run; errors stop the
// run with a message; Ctrl+Enter; CSV and Excel import (types inferred); the downloaded database is read back by Python;
// result export; non-database file refused; the worker ends when the tab is left; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download } = ctx;
  const db = join(tmp, 'shop.db');
  execFileSync('python3', ['-c', `import sqlite3,random
random.seed(7); c=sqlite3.connect(r"${db}")
c.executescript("create table customers(id integer primary key, name text, city text); create table orders(id integer primary key, cid int, total real, placed text, meta text);")
for i in range(1,201): c.execute("insert into customers values(?,?,?)",(i,f"Customer {i}",random.choice(["Pune","Mumbai","Delhi","Chennai","Kochi"])))
for i in range(1,3001): c.execute("insert into orders values(?,?,?,?,?)",(i,random.randint(1,200),round(random.uniform(10,2000),2),f"2026-{random.randint(1,11):02d}-{random.randint(1,28):02d}",'{"channel":"%s"}'%random.choice(["web","app","store"])))
c.commit()`]);
  const Q = ['SELECT city, count(*) AS n, round(avg(total), 2) AS avg_total FROM orders JOIN customers c ON c.id = cid GROUP BY city ORDER BY city',
    "SELECT json_extract(meta, '$.channel') AS ch, count(*) FROM orders GROUP BY ch ORDER BY ch",
    'SELECT id, total, rank() OVER (ORDER BY total DESC) AS r FROM orders ORDER BY r, id LIMIT 5',
    "SELECT strftime('%m', placed) AS m, round(sum(total), 2) FROM orders GROUP BY m ORDER BY m"];
  const py = (q) => JSON.parse(execFileSync('python3', ['-c', 'import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute(sys.argv[2]).fetchall()))', db, q]).toString());
  const page = await newPage(); await page.goto(`${base}#/sqlite`);
  const ed = page.locator('textarea'); await ed.waitFor();
  ok(await page.evaluate(() => globalThis.__supertoolsLive?.().workers ?? 0) === 0, 'no worker before a database is used');
  await page.locator('.drop input[type=file]').first().setInputFiles(db); await page.locator('.note-ok', { hasText: 'Opened shop.db' }).waitFor({ timeout: 20000 });
  ok(/customers/.test(await page.locator('.sql-schema').textContent()) && /200 rows/.test(await page.locator('.sql-schema').textContent()) && /3000 rows/.test(await page.locator('.sql-schema').textContent()), 'schema panel lists both tables with row counts');
  const run = async (q, key = false) => { await ed.fill(q); if (key) { await ed.press('Control+Enter'); } else await page.getByRole('button', { name: 'Run', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.sql-result, .note-err, .tool-body .card .muted')); await page.waitForTimeout(250);
    return page.$$eval('.sql-result', (ts) => ts.map((t) => [...t.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent)))); };
  let bad = [];
  for (const q of Q) { const [got] = await run(q); const want = py(q).map((r) => r.map((v) => (v === null ? 'NULL' : String(v)))); if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(q.slice(0, 40)); }
  ok(!bad.length, `4 queries (join + group, JSON functions, window function, strftime) = Python sqlite3 ${bad.join(' | ')}`);
  let r = await run("CREATE TABLE t(a); INSERT INTO t VALUES (1),(2),(3); UPDATE t SET a = a * 10 WHERE a > 1; SELECT sum(a) FROM t;", true);
  ok(r.length === 1 && r[0][0][0] === '51' && /3 rows changed/.test(await page.locator('.tool-body').textContent()) && /2 rows changed/.test(await page.locator('.tool-body').textContent()), 'four statements in one run (Ctrl+Enter): changes counted, final SELECT = 51');
  await run("SELECT 1; SELEC oops; SELECT 2;"); ok(/Statement 2: .*syntax error/.test(await page.locator('.note-err').textContent()) && await page.locator('.sql-result').count() === 1, 'a syntax error stops the run at that statement');
  await run("SELECT 'a;b' AS s, 2 -- trailing ; comment\n;"); ok((await page.locator('.sql-result td').first().textContent()) === 'a;b', 'semicolons inside strings and comments do not split statements');
  r = await run('SELECT * FROM orders'); ok(/3,000 rows \(first 2000 shown\)/.test(await page.locator('.tool-body').textContent()) && r[0].length === 2000, 'large result: 3,000 rows, first 2,000 shown');
  const csvR = await download(page, () => page.getByRole('button', { name: 'CSV', exact: true }).click()); const lines = readFileSync(csvR, 'utf8').replace(/^﻿/, '').split('\r\n');
  ok(lines[0] === 'id,cid,total,placed,meta' && lines.length === 2001 && lines[1].includes('"{""channel""'), 'result CSV with header and quoted JSON');
  const csv = join(tmp, 'pincodes.csv'); writeFileSync(csv, 'pin,city,lat,note\n411001,Pune,18.52,"camp, central"\n400001,Mumbai,18.94,\n110001,Delhi,28.63,ndmc\n');
  await page.locator('input[aria-label="Table name for import"]').fill('pins'); await page.locator('.drop input[type=file]').nth(1).setInputFiles(csv); await page.locator('.note-ok', { hasText: 'Imported' }).waitFor();
  ok(/Imported 3 rows into "pins" \(INTEGER, TEXT, REAL, TEXT\)/.test(await page.locator('.note-ok').textContent()), `CSV import with types (${await page.locator('.note-ok').textContent()})`);
  r = await run("SELECT typeof(pin), pin + 1, note IS NULL FROM pins ORDER BY pin"); ok(JSON.stringify(r[0]) === '[["integer","110002","0"],["integer","400002","1"],["integer","411002","0"]]', 'imported numbers are numbers, empty cells NULL');
  const out = await download(page, () => page.getByRole('button', { name: 'Download database' }).click());
  ok(JSON.stringify(JSON.parse(execFileSync('python3', ['-c', 'import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); print(json.dumps([c.execute("select count(*) from orders").fetchone()[0], c.execute("select sum(a) from t").fetchone()[0], c.execute("select city from pins where pin=411001").fetchone()[0]]))', out]).toString())) === '[3000,51,"Pune"]', 'downloaded database opens in Python with all changes');
  const junk = join(tmp, 'notadb.db'); writeFileSync(junk, 'hello world, not sqlite'.repeat(50));
  await page.locator('.drop input[type=file]').first().setInputFiles(junk); await page.waitForTimeout(800); ok(/not a database|Not a SQLite/i.test(await page.locator('.toast').last().textContent()), 'a non-database file is refused');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/not a database|Not a SQLite/i.test(e)));
  await page.getByRole('button', { name: 'Sample database' }).click(); await page.waitForTimeout(800);
  ok(/Pune/.test(await page.locator('.sql-result').first().textContent()) && /customers/.test(await page.locator('.sql-schema').textContent()), 'sample database + sample query');
  await page.goto(`${base}#/ascii`); await page.waitForTimeout(200); ok(await page.evaluate(() => globalThis.__supertoolsLive().workers) === 0, 'worker terminated when the tab is left');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'sqlite');
};
