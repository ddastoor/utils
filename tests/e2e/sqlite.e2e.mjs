// SQLite Playground (#/sqlite, PC only). The reference is the NATIVE SQLite (Python's sqlite3 module): a database made
// by it is opened and queried in the tab and the cells equal Python's, value for value; the database downloaded from
// the tab is read back by it. Then everything the page does around the engine: several statements in one run, where
// an error is, "rows changed", values shown with their type (big integers exact, reals as SQLite writes them, NULL,
// blobs), 3,000 rows (2,000 on screen, all of them in the CSV and JSON), imports (CSV, TSV, a two-sheet workbook;
// leading zeros and long ids kept), files that are refused (the open database stays), write-ahead-log and full-text
// files, names that need quoting, undo of a replaced database, the time limit, the open-transaction note, the busy
// guard, nothing loaded before first use, the worker ended on leaving, the phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from '../lib/child.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const FX = (name) => fileURLToPath(new URL(`../fixtures/sqlite/${name}`, import.meta.url));
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const db = join(tmp, 'shop.db');
  execFileSync('python3', ['-c', `import sqlite3,random
random.seed(7); c=sqlite3.connect(r"${db}")
c.executescript("create table customers(id integer primary key, name text, city text); create table orders(id integer primary key, cid int, total real, placed text, meta text, note text);")
for i in range(1,201): c.execute("insert into customers values(?,?,?)",(i,f"Customer {i}",random.choice(["Pune","Mumbai","Delhi","Chennai","Kochi"])))
for i in range(1,3001): c.execute("insert into orders values(?,?,?,?,?,?)",(i,random.randint(1,200),round(random.uniform(10,2000),2),f"2026-{random.randint(1,11):02d}-{random.randint(1,28):02d}",'{"channel":"%s"}'%random.choice(["web","app","store"]),random.choice([None,"","gift, wrapped",'say "hi"',"two\\nlines"])))
c.commit()`]);
  /** Python's answer with the type of every value: null, ["i", "123"], ["r", 1.5], ["t", "text"], ["b", "hex"]. */
  const py = (file, q) => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
def ty(v):
    if v is None: return None
    if isinstance(v, int): return ["i", str(v)]
    if isinstance(v, float): return ["r", v]
    if isinstance(v, bytes): return ["b", v.hex()]
    return ["t", v]
c=sqlite3.connect(sys.argv[1]); cur=c.execute(sys.argv[2]); print(json.dumps({"cols":[d[0] for d in cur.description],"rows":[[ty(v) for v in r] for r in cur.fetchall()]}))`, file, q], { maxBuffer: 1 << 26 }).toString());
  /** Is the cell on the page (its text and class) Python's value? */
  const sameCell = (cell, v) => v === null ? cell.t === 'NULL' && cell.c.includes('muted')
    : v[0] === 'i' ? cell.t === v[1] && cell.c.includes('num')
    : v[0] === 'r' ? cell.c.includes('num') && /[.eI]/.test(cell.t) && Number(cell.t.replace(/^(-?)Inf$/, '$1Infinity')) === v[1]
    : v[0] === 'b' ? cell.t === `x'${v[1].slice(0, 32)}${v[1].length > 32 ? '…' : ''}' (${v[1].length / 2} byte${v[1].length === 2 ? '' : 's'})`
    : cell.t === v[1] && !cell.c.includes('num');

  const page = await newPage({ viewport: { width: 1366, height: 900 } }); const reqs = []; page.on('request', (r) => reqs.push(r.url()));
  await page.goto(`${base}#/sqlite`);
  const ed = page.locator('textarea[aria-label="SQL"]'); await ed.waitFor();
  const live = () => page.evaluate(() => globalThis.__superutilsLive());
  const status = () => page.locator('.sql-status').textContent();
  const waitStatus = (re, timeout = 30000) => page.waitForFunction((src) => new RegExp(src[0], src[1]).test(document.querySelector('.sql-status').textContent) && !document.querySelector('.sql-busy'), [re.source, re.flags], { timeout }).then(() => true, () => false);
  const tables = () => page.$$eval('.sql-result', (ts) => ts.map((t) => ({ cols: [...t.querySelectorAll('thead th')].map((c) => c.textContent), rows: [...t.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => ({ t: c.textContent, c: c.className }))) })));
  const texts = (sel) => page.locator(sel).allTextContents();
  /** Type SQL, run it (button or Ctrl+Enter), wait until the results of THIS run are on the page. */
  const run = async (q, o = {}) => {
    await ed.fill(q);
    await page.evaluate(() => document.querySelector('.sql-out').replaceChildren(Object.assign(document.createElement('i'), { id: 'stale' })));
    if (o.key) await ed.press('Control+Enter'); else await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#stale') && !document.querySelector('.sql-busy'), null, { timeout: o.timeout || 30000 });
    return tables();
  };
  const openFile = (file) => page.locator('.drop input[type=file]').first().setInputFiles(file);
  const importFile = (file) => page.locator('.drop input[type=file]').nth(1).setInputFiles(file);
  const schemaText = () => page.locator('.sql-schema').textContent();

  // ---- nothing is loaded before the tab is used
  ok((await live()).workers === 0 && !reqs.some((u) => /sqlite3[^/]*\.wasm|sheet-[^/]*\.wasm/.test(u)), 'no worker and no engine file before a database is used');

  // ---- a database made by the native SQLite
  await openFile(db);
  ok(await waitStatus(/Opened shop\.db \(\d+(\.\d+)? KB\): 2 tables\./), `opening a file says what was opened (${await status()})`);
  ok((await live()).workers === 1 && reqs.some((u) => /sqlite3[^/]*\.wasm/.test(u)) && reqs.filter((u) => /\.wasm/.test(u)).every((u) => new URL(u).origin === new URL(base).origin), 'SQLite was loaded then, from this site, into one worker');
  ok(/customers table · 200 rows/.test(await schemaText()) && /orders table · 3,000 rows/.test(await schemaText()) && /id INTEGER 🔑/.test(await schemaText()), `the Tables panel lists both tables with their row counts, columns and the key (${(await schemaText()).slice(0, 80)})`);
  {
    const Q = ['SELECT city, count(*) AS n, round(avg(total), 2) AS avg_total FROM orders JOIN customers c ON c.id = cid GROUP BY city ORDER BY city',
      "SELECT json_extract(meta, '$.channel') AS ch, count(*), min(total), max(total) FROM orders GROUP BY ch ORDER BY ch",
      'SELECT id, total, rank() OVER (ORDER BY total DESC) AS r, total / 3 AS third FROM orders ORDER BY r, id LIMIT 25',
      "SELECT strftime('%m', placed) AS m, round(sum(total), 2), count(DISTINCT cid) FROM orders GROUP BY m ORDER BY m",
      'SELECT note, count(*) FROM orders GROUP BY note ORDER BY note',
      "SELECT id, note, note IS NULL, note = '', length(note), typeof(note) FROM orders WHERE id <= 40 ORDER BY id",
      'SELECT c.name, (SELECT count(*) FROM orders o WHERE o.cid = c.id) AS orders, (SELECT max(total) FROM orders o WHERE o.cid = c.id) AS best FROM customers c WHERE c.id % 17 = 0 ORDER BY c.id',
      "WITH RECURSIVE f(n, a, b) AS (SELECT 1, 0, 1 UNION ALL SELECT n + 1, b, a + b FROM f WHERE n < 90) SELECT n, a, a * 1.0, typeof(a), CAST(a AS TEXT), -a, hex(x'00ff') FROM f WHERE n % 9 = 0",
      "SELECT 9223372036854775807, -9223372036854775808, 9007199254740993, 1.0, 0.1 + 0.2, 1e15, 2.5e-7, 123456789.125, NULL, '', ' padded ', 'नमस्ते 😀', x'', x'00ff10', zeroblob(20), 1 = 1, 7 / 2, 7 / 2.0, 7 % 3",
      'SELECT total, CAST(total AS INT), round(total), total * 1000, sum(total) OVER (ORDER BY id) FROM orders ORDER BY id LIMIT 30',
      "SELECT lower(name), upper(city), substr(name, 10), replace(city, 'u', 'ü'), city || ' ' || id, printf('%05d|%8.3f|%s', id, id / 7.0, city), instr(name, ' ') FROM customers ORDER BY id LIMIT 20",
      "SELECT date(placed, '+1 month', 'start of month'), julianday(placed) - julianday('2026-01-01'), strftime('%Y-%W-%w', placed), unixepoch(placed) FROM orders ORDER BY id LIMIT 20"];
    const bad = []; let cells = 0;
    for (const q of Q) {
      const [got] = await run(q), want = py(db, q);
      if (!got || JSON.stringify(got.cols) !== JSON.stringify(want.cols) || got.rows.length !== want.rows.length) { bad.push(`${q.slice(0, 50)}: ${got ? `${got.cols.length} columns × ${got.rows.length} rows` : 'no result'} (Python ${want.cols.length} × ${want.rows.length})`); continue; }
      want.rows.forEach((row, y) => row.forEach((v, x) => { cells++; if (!sameCell(got.rows[y][x], v)) bad.push(`${q.slice(0, 40)} row ${y + 1} ${want.cols[x]}: page ${JSON.stringify(got.rows[y][x])}, Python ${JSON.stringify(v)}`); }));
    }
    ok(!bad.length && cells > 900, `${Q.length} queries (joins, groups, JSON, windows, recursion, dates, text, every kind of value): ${cells} cells equal Python's sqlite3 in value and type ${bad.slice(0, 3).join(' ‖ ')}`);
  }

  // ---- a script: statements, changes, where an error is
  let r = await run("CREATE TABLE t(a); INSERT INTO t VALUES (1),(2),(3); UPDATE t SET a = a * 10 WHERE a > 1; DELETE FROM t WHERE a = 99; SELECT sum(a) FROM t;", { key: true });
  let foots = await texts('.sql-foot');
  ok(r.length === 1 && r[0].rows[0][0].t === '51' && foots.length === 5 && /^OK · \d/.test(foots[0]) && /^OK · 3 rows changed/.test(foots[1]) && /^OK · 2 rows changed/.test(foots[2]) && /^OK · 0 rows changed/.test(foots[3]) && /^1 row · /.test(foots[4]), `five statements in one run (Ctrl+Enter): 3, 2 and 0 rows changed, the SELECT gives 51 (${foots.map((f) => f.split(' · ').slice(0, 2).join(' · ')).join(' | ')})`);
  ok(JSON.stringify(await texts('.sql-head')) === JSON.stringify(['CREATE TABLE t(a)', 'INSERT INTO t VALUES (1),(2),(3)', 'UPDATE t SET a = a * 10 WHERE a > 1', 'DELETE FROM t WHERE a = 99', 'SELECT sum(a) FROM t']), 'every result is headed by its statement');
  ok((await texts('.sql-schema summary')).includes('t table · 3 rows'), `the Tables panel shows the new table (${(await texts('.sql-schema summary')).join(' | ')})`);
  r = await run('SELECT 1;\n\n  SELECT 2;\nSELEC oops;\nSELECT 4;');
  let errT = await page.locator('.sql-out .note-err').textContent();
  ok(r.length === 2 && /Statement 3 \(line 4, column 1\): near "SELEC": syntax error\./.test(errT) && /SELEC oops;\s*SELECT 4/.test(errT) && /Nothing after it was run\./.test(errT), `a syntax error: the two statements before it ran, the message says which statement and where (${errT.slice(0, 90)})`);
  r = await run('INSERT INTO t VALUES (7); SELECT * FROM t WHERE nope = 1; INSERT INTO t VALUES (8)');
  errT = await page.locator('.sql-out .note-err').textContent();
  ok(/Statement 2 \(line 1, column 49\): no such column: nope\./.test(errT) && (await run('SELECT count(*) FROM t'))[0].rows[0][0].t === '4', `an unknown column is pointed at; the statement before it took effect, the one after it did not (${errT.slice(0, 70)})`);
  r = await run("SELECT 'a;b' AS s, 2 -- trailing ; comment\n; /* block; */ SELECT ';' || char(59)");
  ok(r.length === 2 && r[0].rows[0][0].t === 'a;b' && r[1].rows[0][0].t === ';;', 'semicolons inside strings and comments do not split statements');
  await run('.tables');
  ok(/near "\.": syntax error — lines that start with a dot .* are commands of the sqlite3 command-line program, not SQL/.test(await page.locator('.sql-out .note-err').textContent()), 'a dot command of the sqlite3 shell gets an explanation');
  await run('   -- only a comment\n  ');
  ok(/Nothing to run: the box holds no SQL statement/.test(await page.locator('.sql-out').textContent()) && !(await page.locator('.sql-out .note-err').count()), 'an empty box: "nothing to run", not an error');

  // ---- 3,000 rows: 2,000 on screen, all of them in the files
  r = await run('SELECT * FROM orders ORDER BY id');
  ok(r[0].rows.length === 2000 && /^3,000 rows \(the first 2,000 are shown\) · /.test((await texts('.sql-foot'))[0]), `a large result: 3,000 rows, the first 2,000 shown (${(await texts('.sql-foot'))[0].slice(0, 60)})`);
  {
    const want = py(db, 'SELECT * FROM orders ORDER BY id');
    const csvFile = await download(page, () => page.getByRole('button', { name: 'CSV', exact: true }).click()), csv = readFileSync(csvFile, 'utf8');
    const back = JSON.parse(execFileSync('python3', ['-c', 'import csv,sys,json; print(json.dumps(list(csv.reader(open(sys.argv[1], encoding="utf-8-sig", newline="")))))', csvFile], { maxBuffer: 1 << 26 }).toString());
    const cellText = (v) => v === null ? '' : v[0] === 'r' ? String(v[1]) : v[1];
    const diff = want.rows.findIndex((row, i) => row.some((v, j) => (v && v[0] === 'r' ? Number(back[i + 1][j]) !== v[1] : back[i + 1][j] !== cellText(v))));
    ok(csv.charCodeAt(0) === 0xfeff && back.length === 3001 && JSON.stringify(back[0]) === JSON.stringify(want.cols) && diff < 0, `the CSV holds all 3,000 rows (Python's csv module reads them back: commas, quotes and line breaks inside cells intact) ${diff >= 0 ? `first difference in row ${diff + 1}: ${JSON.stringify(back[diff + 1])}` : ''}`);
    const json = JSON.parse(readFileSync(await download(page, () => page.getByRole('button', { name: 'JSON', exact: true }).click()), 'utf8'));
    const jd = want.rows.findIndex((row, i) => row.some((v, j) => { const g = json[i][want.cols[j]]; return v === null ? g !== null : v[0] === 'r' ? g !== v[1] : v[0] === 'i' ? String(g) !== v[1] : g !== v[1]; }));
    ok(json.length === 3000 && jd < 0, `the JSON holds all 3,000 rows as objects with the same values ${jd >= 0 ? JSON.stringify(json[jd]) : ''}`);
  }

  // ---- imports
  await page.locator('input[aria-label="Table name for imports"]').fill('');
  await importFile(FX('lead.csv'));
  ok(await waitStatus(/Imported 2 rows into “lead” \(pin TEXT, phone TEXT, id INTEGER, amount REAL, name TEXT\)\./), `CSV import says what it made (${await status()})`);
  r = await tables();
  ok(r.length === 1 && JSON.stringify(r[0].rows.map((x) => x.map((c) => c.t))) === JSON.stringify([['011001', '09876543210', '1234567890123456789', '10.5', 'A'], ['400001', '09123456789', '1234567890123456788', '7.0', 'B']]) && (await ed.inputValue()) === 'SELECT * FROM "lead" LIMIT 100;', 'the imported rows are shown at once: PIN codes and phone numbers keep their leading zeros, the 19-digit id is exact');
  r = await run('SELECT typeof(pin), typeof(phone), typeof(id), typeof(amount), id + 1 FROM lead LIMIT 1');
  ok(r[0].rows[0].map((c) => c.t).join() === 'text,text,integer,real,1234567890123456790', 'their types in the table: text, text, integer, real (arithmetic on the id is exact)');
  await page.locator('input[aria-label="Table name for imports"]').fill('lead');
  await importFile(FX('dup.csv'));
  ok(await waitStatus(/Imported 1 row into “lead_2” \(a INTEGER, b INTEGER, a_2 INTEGER\)\./), `a table name that is taken and column names that repeat get a number (${await status()})`);
  await page.locator('input[aria-label="Table name for imports"]').fill('नाम सूची');
  await importFile(FX('devanagari.csv'));
  ok(await waitStatus(/Imported 2 rows into “नाम सूची” \(नाम TEXT, शहर TEXT, अंक INTEGER\)\./) && (await tables())[0].rows[0].map((c) => c.t).join() === 'आशा,पुणे,91', `Devanagari table and column names (${await status()})`);
  await page.locator('input[aria-label="Table name for imports"]').fill('');
  await importFile(FX('tabs.tsv'));
  ok(await waitStatus(/Imported 2 rows into “tabs” \(city TEXT, rain_mm INTEGER, note TEXT\)\./) && (await tables())[0].rows[1].map((c) => c.t).join() === 'Pune,722,NULL', `tab-separated values; an empty cell is NULL (${await status()})`);
  await importFile(FX('bom.csv'));
  ok(await waitStatus(/Imported 2 rows into “bom” \(id INTEGER, full name TEXT, note TEXT\)\./) && (await tables())[0].rows.map((x) => x.map((c) => c.t).join('|')).join(' / ') === '1|Rao, Asha|said "hi" / 2|multi\nline|NULL', `a BOM, CRLF, quoted commas and a line break inside a cell (${await status()})`);
  {
    const xlsx = join(tmp, 'ledger.xlsx');
    execFileSync('python3', ['-c', `import openpyxl, sys, datetime
wb = openpyxl.Workbook(); a = wb.active; a.title = "Sales"
a.append(["item", "qty", "price", "sold on", "code"]); a.append(["Chai", 2, 12.5, datetime.date(2026, 11, 3), "007"]); a.append(["Samosa", 10, 15, datetime.date(2026, 11, 4), "042"]); a.append([None, None, None, None, None]); a.append(["Jalebi", None, 99.99, None, "100"])
b = wb.create_sheet("Stock"); b.append(["item", "left"]); b.append(["Chai", 40]); b.append(["Samosa", 0])
wb.create_sheet("Empty")
wb.save(sys.argv[1])`, xlsx]);
    await importFile(xlsx);
    ok(await waitStatus(/Imported 4 rows into “ledger_Sales” \(item TEXT, qty INTEGER, price REAL, sold on TEXT, code TEXT\); 2 rows into “ledger_Stock” \(item TEXT, left INTEGER\)\./), `a workbook: one table per sheet that has rows, named after the file and the sheet (${await status()})`);
    r = await run('SELECT item, qty, price, "sold on", code, typeof(qty), typeof(price) FROM ledger_Sales ORDER BY rowid');
    ok(JSON.stringify(r[0].rows.map((x) => x.map((c) => c.t))) === JSON.stringify([['Chai', '2', '12.5', '2026-11-03', '007', 'integer', 'real'], ['Samosa', '10', '15.0', '2026-11-04', '042', 'integer', 'real'], ['NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'null', 'null'], ['Jalebi', 'NULL', '99.99', 'NULL', '100', 'null', 'real']]), `its cells: numbers, a date as text, codes with leading zeros, an empty row and empty cells as NULL (${JSON.stringify(r[0].rows[1].map((c) => c.t))})`);
  }
  for (const [file, re] of [['empty.csv', /empty\.csv is empty\./], ['headeronly.csv', /Imported 0 rows into “headeronly”/]]) { await importFile(FX(file)); ok(await waitStatus(re), `${file}: ${await status()}`); }
  ok(!page.errors.length, `imports raise no page error ${page.errors.join(' | ')}`);

  // ---- the downloaded database, read by the native SQLite
  {
    const file = await download(page, () => page.getByRole('button', { name: 'Download database' }).click());
    ok(await waitStatus(/Saved shop\.db \(\d/) && /shop\.db$/.test(file), `the download keeps the opened file's name (${await status()})`);
    const got = (q) => JSON.stringify(py(file, q).rows.map((x) => x.map((v) => (v === null ? null : v[1]))));
    ok(got('SELECT count(*), round(sum(total), 2) FROM orders') === JSON.stringify(py(db, 'SELECT count(*), round(sum(total), 2) FROM orders').rows.map((x) => x.map((v) => v[1]))) && got('SELECT sum(a) FROM t') === '[["58"]]' && got('SELECT pin, id, amount, typeof(id) FROM lead ORDER BY rowid') === '[["011001","1234567890123456789",10.5,"integer"],["400001","1234567890123456788",7.0,"integer"]]'.replace('7.0', '7') && got('SELECT "शहर" FROM "नाम सूची" ORDER BY rowid') === '[["पुणे"],["मुंबई"]]' && got('PRAGMA integrity_check') === '[["ok"]]',
      `Python's sqlite3 opens it: the original tables, the table made here, the imports (exact id, leading zeros, Devanagari names); integrity_check is ok (${got('SELECT sum(a) FROM t')})`);
  }

  // ---- files that are refused leave the open database alone
  for (const [file, re] of [['junk.db', /junk\.db: That is not a SQLite database file \(it looks like text — use “Import CSV \/ Excel as a table” for a CSV file\)\. The database that was open is still open\./], ['trunc.db', /trunc\.db: That file is damaged or incomplete \(SQLite: .+\)\. The database that was open is still open\./], ['empty.db', /empty\.db: That file is empty\. The database that was open is still open\./], ['binary.db', /binary\.db: That is not a SQLite database file\b.*still open/], ['ledger.xlsx', /ledger\.xlsx: That is not a SQLite database file \(it looks like a workbook or a zip archive — use “Import CSV \/ Excel as a table” for a workbook\)/]]) {
    await openFile(file === 'ledger.xlsx' ? join(tmp, file) : FX(file));
    ok(await waitStatus(re) && (await page.locator('.sql-status .note-err').count()) === 1, `${file} is refused with the reason, in the status line (${(await status()).slice(0, 110)})`);
  }
  ok((await run('SELECT count(*) FROM orders'))[0].rows[0][0].t === '3000' && /lead_2 table/.test(await schemaText()), 'after five refused files the database is as it was');
  ok(!page.errors.length, `refused files raise no page error ${page.errors.join(' | ')}`);

  // ---- other files
  await openFile(FX('plain.db'));
  ok(await waitStatus(/Opened plain\.db \(\d+ KB\): 2 tables, 1 view\. /) && (await page.getByRole('button', { name: /^Bring back the previous database/ }).count()) === 1, `opening another file counts tables and views and offers the previous database back (${(await status()).slice(0, 70)})`);
  r = await run('SELECT a, b, c, d FROM t ORDER BY rowid');
  {
    const want = py(FX('plain.db'), 'SELECT a, b, c, d FROM t ORDER BY rowid'), miss = [];
    want.rows.forEach((row, y) => row.forEach((v, x) => { if (!sameCell(r[0].rows[y][x], v)) miss.push(`${y},${x}: ${JSON.stringify(r[0].rows[y][x])} vs ${JSON.stringify(v)}`); }));
    ok(!miss.length && r[0].rows[1][0].t === '9223372036854775807' && r[0].rows[2][0].t === '-9007199254740993' && r[0].rows[0][3].t === '1.0' && r[0].rows[2][3].t === '1.0e+300' && r[0].rows[0][1].t === '' && r[0].rows[0][2].t === "x'00ff10' (3 bytes)" && r[0].rows[3][2].t === "x'' (0 bytes)", `values on screen: integers beyond 2^53 exact, 1.0 is not 1, empty text is not NULL, blobs by their bytes ${miss.slice(0, 2).join(' ‖ ')}`);
  }
  await page.locator('.sql-schema details', { hasText: 'small' }).getByRole('button', { name: 'Show rows' }).click();
  await page.waitForFunction(() => !document.querySelector('.sql-busy') && document.querySelectorAll('.sql-result tbody tr').length === 3);
  ok((await ed.inputValue()) === 'SELECT * FROM "small" LIMIT 100;' && (await tables())[0].rows[2].map((c) => c.t).join() === '3,9,row 3', '"Show rows" on a view writes the query and runs it');
  ok((await page.getByRole('button', { name: 'Bring back the previous database (shop.db)' }).count()) === 1, 'after two runs in the new database the way back to the previous one is still on the page (it used to vanish with the first Run)');
  await page.getByRole('button', { name: /^Bring back the previous database/ }).click();
  ok(await waitStatus(/The previous database \(shop\.db\) is back\./) && /orders table · 3,000 rows/.test(await schemaText()) && (await run('SELECT sum(a) FROM t'))[0].rows[0][0].t === '58', 'the previous database comes back with everything that was done in it');
  await openFile(FX('wal.db'));
  ok(await waitStatus(/Opened wal\.db .*1 table\. This database was in write-ahead-log mode: changes that were only in its -wal file are not part of the file you opened\./) && (await page.locator('.sql-status .note-warn').count()) === 1 && (await run('INSERT INTO t VALUES (3); SELECT count(*) FROM t'))[0].rows[0][0].t === '3', `a write-ahead-log database opens with a warning and can be changed (${(await status()).slice(0, 60)})`);
  await openFile(FX('fts.db'));
  await waitStatus(/Opened fts\.db/);
  r = await run("SELECT title, highlight(notes, 1, '[', ']') FROM notes WHERE notes MATCH 'gin*'; SELECT id FROM boxes WHERE x0 <= 5 AND x1 >= 5");
  ok(r.length === 2 && r[0].rows[0].map((c) => c.t).join() === 'Chai,masala chai with [ginger]' && r[1].rows[0][0].t === '1', 'full-text search (FTS5) and R-tree tables of a file work');
  ok(/old virtual table\s*Cannot be read here: needs the module “fts4”, which this build of SQLite does not have — its rows can be read from the table “old_content”\./.test(await schemaText()) && !/notes_data|boxes_node/.test(await schemaText()) && (await run('SELECT c0x FROM old_content'))[0].rows[0][0].t === 'legacy full-text table', 'a full-text table of the old kind (fts4) is listed with the reason and where its rows are; the storage tables of FTS5 / R-tree are not listed');
  await openFile(FX('quote.db'));
  await waitStatus(/Opened quote\.db/);
  ok(/broken view\s*Cannot be read here: .*no such column: q/.test(await schemaText()), `a view that no longer works is listed and says why (${(await schemaText()).slice(-90)})`);
  {
    const st = await schemaText();
    ok(['we"ird table · 1 row', 'back\\slash table · 0 rows', 'has space table · 0 rows', 'select table · 0 rows', 'sqlitedata table · 1 row', 'नाम सूची table · 1 row', 'v view · 1 row'].every((x) => st.includes(x)), `names with a quote, a backslash, a space, a keyword and Devanagari are each in the Tables panel with their row count (${st.slice(0, 60)})`);
  }
  ok((await page.locator('.sql-schema details[open]').count()) === 0, 'with eight tables and views the list is folded');
  await page.locator('.sql-schema details', { hasText: 'we"ird' }).locator('summary').click();
  await page.locator('.sql-schema details', { hasText: 'we"ird' }).getByRole('button', { name: 'Show rows' }).click();
  await page.waitForFunction(() => !document.querySelector('.sql-busy') && document.querySelectorAll('.sql-result tbody tr').length === 1);
  ok((await ed.inputValue()) === 'SELECT * FROM "we""ird" LIMIT 100;' && !(await page.locator('.sql-out .note-err').count()), '"Show rows" quotes a name with a quote in it');

  // ---- replacing a database can be undone once; the sample
  await page.getByRole('button', { name: 'New empty' }).click();
  ok(await waitStatus(/New empty database\./) && /The database is empty/.test(await schemaText()) && (await page.getByRole('button', { name: /^Bring back the previous database/ }).count()) === 1, '"New empty" empties the tab and offers the previous database back');
  await page.getByRole('button', { name: /^Bring back the previous database/ }).click();
  ok(await waitStatus(/The previous database \(quote\.db\) is back\./) && (await schemaText()).includes('we"ird'), 'and it comes back');
  await page.getByRole('button', { name: 'New empty' }).click(); await waitStatus(/New empty database\./);
  await page.getByRole('button', { name: 'New empty' }).click();
  ok(await waitStatus(/New empty database\./) && (await page.getByRole('button', { name: /^Bring back the previous database/ }).count()) === 0, 'replacing an empty database offers nothing to bring back');
  await page.getByRole('button', { name: 'Sample database' }).click();
  await page.waitForFunction(() => !document.querySelector('.sql-busy') && document.querySelectorAll('.sql-result tbody tr').length === 4);
  r = await tables();
  ok(/Sample database: 2 tables\./.test(await status()) && r[0].cols.join() === 'city,orders,revenue' && r[0].rows.map((x) => x.map((c) => c.t).join()).join(' / ') === 'Delhi,1,1500.0 / Mumbai,2,1055.25 / Pune,2,570.5 / Chennai,1,60.0', `the sample database with its sample query (${r[0].rows.map((x) => x.map((c) => c.t).join()).join(' / ')})`);

  // ---- an open transaction is pointed out
  await run('BEGIN; INSERT INTO customers VALUES (9, \'Temp\', \'Goa\', \'2026-11-18\')');
  ok(/A transaction is open \(BEGIN without COMMIT\)/.test(await page.locator('.sql-out .note-warn').textContent()), 'BEGIN without COMMIT: the run ends with a note that a transaction is open');
  {
    const file = await download(page, () => page.getByRole('button', { name: 'Download database' }).click());
    ok(await waitStatus(/Saved sample\.sqlite .*A transaction is open: the file holds its changes although they are not committed\./) && /sample\.sqlite$/.test(file), `downloading now says that the file holds uncommitted changes (${(await status()).slice(0, 60)})`);
  }
  await page.locator('.sql-out .note-warn').getByRole('button', { name: 'ROLLBACK' }).click();
  await page.waitForFunction(() => !document.querySelector('.sql-busy') && !document.querySelector('.sql-out .note-warn'));
  ok((await run('SELECT count(*) FROM customers'))[0].rows[0][0].t === '4', 'the ROLLBACK button undoes the changes and the note goes');

  // ---- a statement that never ends is stopped at the time limit; the tab is busy meanwhile
  await page.locator('select[aria-label="Time limit for a run"]').selectOption('10');
  await ed.fill('CREATE TABLE keepme (x); INSERT INTO keepme VALUES (1); WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c; SELECT 2');
  await page.evaluate(() => document.querySelector('.sql-out').replaceChildren(Object.assign(document.createElement('i'), { id: 'stale' })));
  const t0 = Date.now(); await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Sample database' }).click();
  ok(/SQLite is still busy with the last request/.test(await status()) && (await page.locator('.sql-busy').count()) === 1, 'while a statement runs, another action is told to wait (it is not queued behind it)');
  await page.waitForFunction(() => !document.querySelector('#stale') && !document.querySelector('.sql-busy'), null, { timeout: 40000 });
  const took = Date.now() - t0; errT = await page.locator('.sql-out .note-err').textContent();
  ok(took >= 9500 && took < 20000 && /Statement 3 \(line 1, column 57\): stopped after 10 s — the statement was still running \(the time limit is next to Run\)\./.test(errT) && /The database is as it was before that statement\./.test(errT) && (await texts('.sql-head')).length === 3, `an endless statement is stopped after the chosen 10 s (${took} ms): ${errT.slice(0, 100)}`);
  ok((await run('SELECT x FROM keepme'))[0].rows[0][0].t === '1' && (await run('SELECT count(*) FROM customers'))[0].rows[0][0].t === '4', 'the statements before it took effect and the database works on');

  // ---- leaving the tab ends the worker; coming back starts clean
  await page.goto(`${base}#/ascii`); await page.waitForTimeout(250);
  const l2 = await live();
  ok(l2.workers === 0 && l2.resources.length === 0, `the worker and the engines are released when the tab is left (${JSON.stringify(l2)})`);
  await page.goto(`${base}#/sqlite`); await page.locator('textarea[aria-label="SQL"]').waitFor();
  ok(/Open a database, import a file, or start with the sample/.test(await schemaText()) && (await run('SELECT sqlite_version() AS v, 1 + 1'))[0].rows[0][1].t === '2', 'coming back: an empty tab, and a query runs in a fresh database');
  info(`SQLite ${(await tables())[0].rows[0][0].t} in the tab`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'sqlite');
};
