// SQLite Playground engine (src/lib/sqlite-engine.ts) on the official SQLite WebAssembly build, run under Node.
// Reference: the NATIVE SQLite (Python's sqlite3 module) — tests/fixtures/sqlite/reference.json holds, for 32 scripts
// and 160 statements, every result with the type of every value, the rows each data change reports and the text of
// every error (scripts/make-sqlite-reference.py). Then what the tab adds: files (opened, refused, damaged,
// write-ahead-log), statements found by SQLite's own parser, where an error is, limits, the time limit, schema,
// imports (types decided by sheet.wasm), exports (CSV by sheet.wasm, JSON), the database file read back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
export default async (t, { load, wasm, root }) => {
  const req = createRequire(join(root, 'package.json'));
  globalThis.sqlite3ApiConfig = { warn: () => {}, error: () => {}, log: () => {}, debug: () => {} };   // as the worker sets it: SQLite's own console chatter off
  const S = await (await import(req.resolve('@sqlite.org/sqlite-wasm'))).default({ print: () => {}, printErr: () => {} });
  const { makeEngine, quoteId, plain } = await load('/src/lib/sqlite-engine.ts');
  const { bindSheet } = await load('/src/wasm/sheet.ts');
  const sheet = bindSheet(await wasm('sheet'));
  const E = (bytes) => { const e = makeEngine(S, { csvWrite: (rows) => sheet.csvWrite(rows) }); const info = e.open(bytes); return Object.assign(e, { info }); };
  const fx = (name) => new Uint8Array(readFileSync(join(root, 'tests/fixtures/sqlite', name)));
  const err = (f) => { try { f(); return null; } catch (e) { return plain(e); } };
  const REF = JSON.parse(readFileSync(join(root, 'tests/fixtures/sqlite/reference.json'), 'utf8'));
  t.ok(/^3\.\d+\.\d+$/.test(REF.sqlite) && /^3\.\d+\.\d+$/.test(E().info.version), `reference: native SQLite ${REF.sqlite}; the tab: SQLite ${E().info.version}`);

  // ---- the native SQLite's answers
  {
    /** One value of ours against one of the reference: same type, same value (reals compared as numbers). */
    const same = (mine, ref) => {
      if (ref === null || typeof ref === 'string') return mine === ref;
      if ('i' in ref) return typeof mine === 'number' ? String(mine) === ref.i : !!mine && mine.i === ref.i;
      if ('r' in ref) { if (!mine || typeof mine !== 'object' || !('r' in mine)) return false; const a = Number(mine.r.replace(/^(-?)Inf$/, '$1Infinity')), b = ref.r === 'inf' ? Infinity : ref.r === '-inf' ? -Infinity : Number(ref.r); return a === b; }   // -0.0 is written 0.0 by SQLite itself (CAST(-0.0 AS TEXT)), so 0 and -0 are the same here
      return !!mine && typeof mine === 'object' && 'b' in mine && mine.n === ref.b.length / 2 && ref.b.startsWith(mine.b) && mine.b.length === Math.min(32, ref.b.length);
    };
    const show = (v) => JSON.stringify(v).slice(0, 200);
    let statements = 0, values = 0, errors = 0;
    for (const c of REF.cases) {
      const e = E(), bad = [];
      for (const s of c.statements) {
        const r = e.exec(s.sql, { limit: 100000 }); statements++;
        const parts = s.parts || [];
        if (s.error !== undefined) {
          errors++;
          if (!r.error) bad.push(`${s.sql.slice(0, 60)}: no error, native says ${s.error}`);
          else if (r.error.message !== s.error) bad.push(`${s.sql.slice(0, 60)}: error ${JSON.stringify(r.error.message)}, native ${JSON.stringify(s.error)}`);
        } else if (r.error) { bad.push(`${s.sql.slice(0, 60)}: error ${r.error.message}`); break; }
        if (r.results.length !== parts.length) { bad.push(`${s.sql.slice(0, 60)}: ${r.results.length} results, native ${parts.length}`); continue; }
        parts.forEach((p, i) => {
          const g = r.results[i];
          if (JSON.stringify(g.columns) !== JSON.stringify(p.columns)) bad.push(`${g.sql.slice(0, 50)}: columns ${show(g.columns)}, native ${show(p.columns)}`);
          if (g.rows.length !== p.rows.length || g.total !== p.rows.length) bad.push(`${g.sql.slice(0, 50)}: ${g.rows.length} rows (total ${g.total}), native ${p.rows.length}`);
          else p.rows.forEach((row, y) => row.forEach((v, x) => { values++; if (!same(g.rows[y][x], v)) bad.push(`${g.sql.slice(0, 50)}: row ${y + 1} column ${g.columns[x]}: ${show(g.rows[y][x])}, native ${show(v)}`); }));
          if ('changed' in p && !(g.dml && g.changed === p.changed)) bad.push(`${g.sql.slice(0, 50)}: ${g.dml ? g.changed : 'not counted as a data change'}, native reports ${p.changed} changed rows`);
        });
        if (s.error !== undefined) break;
      }
      e.close();
      t.ok(!bad.length, `${c.name}: ${c.statements.length} statement${c.statements.length === 1 ? '' : 's'} as the native SQLite answers${bad.length ? ` — ${bad.length} differ: ${bad.slice(0, 3).join(' ‖ ')}` : ''}`);
    }
    t.ok(statements >= 150 && values > 600 && errors >= 20, `${statements} statements, ${values} values compared by type and value, ${errors} error messages`);
  }

  // ---- values keep their type and are exact
  {
    const e = E(), row = (sql) => e.exec(sql).results[0].rows[0];
    t.eq(row("SELECT 1, 1.0, '1', NULL, x'31', 9007199254740993, -9223372036854775808, 9007199254740991, 1e300, 0.1 + 0.2, 9e999, -9e999, ''"),
      [1, { r: '1.0' }, '1', null, { b: '31', n: 1 }, { i: '9007199254740993' }, { i: '-9223372036854775808' }, 9007199254740991, { r: '1.0e+300' }, { r: '0.30000000000000004' }, { r: 'Inf' }, { r: '-Inf' }, ''],
      'integer, real, text, NULL, blob are told apart; integers beyond 2^53 are exact; reals are written as SQLite writes them; empty text is not NULL');
    t.eq(row('SELECT zeroblob(40), x\'\', randomblob(5000)').map((v) => [v.b.length, v.n]), [[32, 40], [0, 0], [32, 5000]], 'a blob: its first 16 bytes and its length');
    t.eq(row("SELECT 'नमस्ते 😀', 'a' || char(10) || 'b', char(9731), length('a' || char(0) || 'b'), 'x' || char(0) || 'y'"), ['नमस्ते 😀', 'a\nb', '☃', 1, 'x\u0000y'], 'Unicode, line breaks and a NUL inside text survive (SQLite\'s own length() stops at the NUL, the value does not)');
    e.close();
  }

  // ---- a script: statements are found by SQLite's own parser
  {
    const e = E();
    let r = e.exec("CREATE TABLE t (a, b); -- a comment; with a semicolon\nINSERT INTO t VALUES (1, 'x;y'), (2, '--not a comment'); /* block; comment */ ;;\n  SELECT a, b FROM t ORDER BY a;\nCREATE TRIGGER tr AFTER INSERT ON t BEGIN UPDATE t SET b = 'trg' WHERE a = new.a; DELETE FROM t WHERE a = -1; END;\nINSERT INTO t VALUES (3, 'z'); SELECT b FROM t WHERE a = 3");
    t.eq([r.error, r.results.length, r.results.map((x) => x.sql.split(/[ (]/)[0] + ' ' + x.sql.split(' ')[1])], [undefined, 6, ['CREATE TABLE', 'INSERT INTO', 'SELECT a,', 'CREATE TRIGGER', 'INSERT INTO', 'SELECT b']], 'six statements: semicolons in strings, comments and a trigger body do not split one; blank statements are skipped');
    t.eq([r.results[2].rows, r.results[5].rows], [[[1, 'x;y'], [2, '--not a comment']], [['trg']]], 'their results');
    t.eq(r.results[2].sql, 'SELECT a, b FROM t ORDER BY a', 'a statement is shown without the comments and semicolons before it');
    t.eq(r.results.map((x) => [x.dml, x.changed, x.readonly]), [[false, 0, false], [true, 2, false], [false, 0, true], [false, 0, false], [true, 1, false], [false, 0, true]], 'rows changed: 2, then 1 — the trigger\'s own UPDATE is not added (as sqlite3_changes() and other tools count); CREATE counts nothing');
    r = e.exec('UPDATE t SET b = 1 WHERE a = 99; DELETE FROM t WHERE a = 99; CREATE TABLE u (x); SELECT 5');
    t.eq(r.results.map((x) => [x.dml, x.changed]), [[true, 0], [true, 0], [false, 0], [false, 0]], 'a change that matched nothing reports 0 rows (not the count of the statement before it)');
    r = e.exec("INSERT INTO u VALUES (1), (2), (3) RETURNING x * 10 AS ten; WITH n(v) AS (VALUES (7), (8)) INSERT INTO u SELECT v FROM n; REPLACE INTO u (rowid, x) VALUES (1, 'r'); UPDATE u SET x = x; DELETE FROM u WHERE rowid > 3; CREATE TABLE w AS SELECT * FROM u");
    t.eq(r.results.map((x) => [x.dml, x.changed, x.total]), [[true, 3, 3], [true, 2, 0], [true, 1, 0], [true, 5, 0], [true, 2, 0], [false, 0, 0]], 'INSERT … RETURNING (rows and a count), WITH … INSERT, REPLACE, UPDATE of every row, DELETE; CREATE TABLE AS is not counted');
    // where an error is
    r = e.exec("SELECT 1;\n\n  SELECT 2;\nSELEC 3;\nSELECT 4");
    t.eq([r.results.map((x) => x.rows[0][0]), r.error && [r.error.statement, r.error.line, r.error.column, r.error.message, r.error.sql]], [[1, 2], [3, 4, 1, 'near "SELEC": syntax error', 'SELEC 3;\nSELECT 4']], 'a syntax error: the statements before it ran, it is the 3rd, on line 4 column 1; nothing after it runs');
    r = e.exec('SELECT 1; SELECT * FROM t WHERE nope = 1; SELECT 3');
    t.eq([r.results.length, r.error.statement, r.error.line, r.error.column, r.error.message], [1, 2, 1, 33, 'no such column: nope'], 'an unknown column: SQLite points at the name inside the statement');
    r = e.exec("CREATE TABLE k (id INTEGER PRIMARY KEY);\nINSERT INTO k VALUES (1);\n   INSERT INTO k VALUES (1);\nSELECT 'not reached'");
    t.eq([r.results.length, r.error.statement, r.error.line, r.error.column, r.error.message], [2, 3, 3, 4, 'UNIQUE constraint failed: k.id'], 'an error while running (a constraint): the statement and where it starts');
    r = e.exec('.tables');
    t.ok(/near "\.": syntax error — lines that start with a dot .* are commands of the sqlite3 command-line program, not SQL/.test(r.error.message), `a dot command gets an explanation (${r.error.message})`);
    r = e.exec('SELECT 1 +'); t.eq([r.error.message, r.results.length], ['incomplete input', 0], 'an unfinished statement');
    t.eq([e.exec('').results.length, e.exec('  ;; -- nothing\n/* at all */ ').results.length, e.exec('').error], [0, 0, undefined], 'an empty script, or one with only comments: nothing to run, no error');
    // transactions
    t.eq([e.exec('BEGIN; INSERT INTO k VALUES (50)').txn, e.inTransaction(), e.exec('SELECT count(*) FROM k').results[0].rows[0][0], e.exec('ROLLBACK').txn, e.exec('SELECT count(*) FROM k').results[0].rows[0][0]], [true, true, 2, false, 1], 'BEGIN without COMMIT: the run says a transaction is open; ROLLBACK undoes it');
    t.eq([e.exec('BEGIN; INSERT INTO k VALUES (60); COMMIT').txn, e.exec('SELECT count(*) FROM k').results[0].rows[0][0]], [false, 2], 'BEGIN … COMMIT in one run');
    r = e.exec('BEGIN; INSERT INTO k VALUES (70); INSERT INTO k VALUES (70); COMMIT');
    t.eq([r.error.message, r.txn, e.exec('ROLLBACK; SELECT count(*) FROM k').results[1].rows[0][0]], ['UNIQUE constraint failed: k.id', true, 2], 'an error inside a transaction leaves it open (as SQLite does) and says so');
    e.close();
  }

  // ---- limits: rows on screen, rows kept, the time limit
  {
    const e = E();
    const gen = (n) => `WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < ${n}) SELECT n, 'row ' || n FROM s`;
    let r = e.exec(gen(5000)).results[0];
    t.eq([r.rows.length, r.total, r.kept, r.rows[1999]], [2000, 5000, 5000, [2000, 'row 2000']], '5,000 rows: 2,000 for the screen, all 5,000 kept for export, the count is the real one');
    r = e.exec(gen(5000), { limit: 10, keep: 100 }).results[0];
    t.eq([r.rows.length, r.total, r.kept], [10, 5000, 100], 'the limits can be set');
    t.eq(JSON.parse(e.exportResult(0, 'json').join('')).length, 100, 'an export holds the kept rows');
    const t0 = Date.now(); r = e.exec('CREATE TABLE keepme (x); INSERT INTO keepme VALUES (1); WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c; SELECT 2', { timeLimitMs: 300 });
    const ms = Date.now() - t0;
    t.ok(r.error && r.error.stopped && /stopped after 0 s — the statement was still running/.test(r.error.message) && r.error.statement === 3 && r.results.length === 2 && ms >= 280 && ms < 3000, `a statement that never ends is stopped at the time limit (${ms} ms): ${r.error?.message}`);
    t.eq([e.exec('SELECT x FROM keepme').results[0].rows, e.exec(gen(10), { timeLimitMs: 300 }).results[0].total], [[[1]], 10], 'the database is intact afterwards and the next statement runs');
    r = e.exec('BEGIN; INSERT INTO keepme VALUES (2); WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c', { timeLimitMs: 200 });
    t.eq([r.error.stopped, r.txn, e.exec('ROLLBACK; SELECT count(*) FROM keepme').results[1].rows[0][0]], [true, true, 1], 'stopped inside a transaction: the transaction is still open and can be rolled back');
    e.close();
  }

  // ---- files
  {
    const e = E(fx('plain.db'));
    t.eq([e.info.note, e.exec('SELECT count(*), sum(n), max(sq) FROM big').results[0].rows[0], e.exec('SELECT * FROM small').results[0].rows], ['', [5000, 12502500, 25000000], [[1, 1, 'row 1'], [2, 4, 'row 2'], [3, 9, 'row 3']]], 'a database made by the native SQLite opens: 5,000 rows, a view');
    t.eq(e.exec('SELECT a, b, c, d, typeof(a), typeof(d) FROM t ORDER BY rowid').results[0].rows, [[1, '', { b: '00ff10', n: 3 }, { r: '1.0' }, 'integer', 'real'], [{ i: '9223372036854775807' }, null, null, { r: '0.1' }, 'integer', 'real'], [{ i: '-9007199254740993' }, 'é😀', { b: '000000', n: 3 }, { r: '1.0e+300' }, 'integer', 'real'], [{ i: '9007199254740993' }, 'line1\nline2', { b: '', n: 0 }, { r: '2.5' }, 'integer', 'real'], [0, '<b>x</b>', null, { r: '0.0' }, 'integer', 'real']], 'its values come out with their types: big integers exact, blobs, empty text beside NULL');
    // a file that is refused leaves the open database as it was
    for (const [name, re] of [['junk.db', /not a SQLite database file \(it looks like text — use “Import CSV/], ['binary.db', /not a SQLite database file/], ['empty.db', /That file is empty/], ['trunc.db', /damaged or incomplete \(SQLite: /]]) {
      const m = err(() => e.open(fx(name)));
      t.ok(re.test(m || ''), `${name} is refused with the reason (${m})`);
    }
    t.ok(/looks like a workbook or a zip archive/.test(err(() => e.open(new Uint8Array([0x50, 0x4b, 3, 4, ...new Array(200).fill(0)])))), 'a workbook / zip is recognised and pointed to the import');
    t.eq(e.exec('SELECT count(*) FROM big').results[0].rows[0][0], 5000, 'after five refused files the database that was open is still there');
    const w = E(fx('wal.db'));
    t.ok(/write-ahead-log mode/.test(w.info.note) && JSON.stringify(w.exec('SELECT a FROM t ORDER BY a').results[0].rows) === '[[1],[2]]' && !w.exec("INSERT INTO t VALUES (3); SELECT count(*) FROM t").error, `a write-ahead-log database opens, with a note, and can be changed (${w.info.note.slice(0, 50)}…)`);
    const f = E(fx('fts.db'));
    t.eq([f.exec("SELECT title FROM notes WHERE notes MATCH 'ginger'").results[0].rows, f.exec('SELECT id FROM boxes WHERE x0 <= 5 AND x1 >= 5').results[0].rows, f.exec('SELECT k FROM plain').results[0].rows], [[['Chai']], [[1]], [['ok']]], 'full-text (FTS5) and R-tree tables of a file work');
    const sch = f.schema();
    t.eq(sch.map((o) => [o.name, o.type, o.count ?? o.error]), [['old_content', 'table', 1], ['old_docsize', 'table', 1], ['old_segdir', 'table', 1], ['old_segments', 'table', 0], ['old_stat', 'table', 1], ['plain', 'table', 1], ['boxes', 'virtual', 1], ['notes', 'virtual', 2], ['old', 'virtual', 'needs the module “fts4”, which this build of SQLite does not have — its rows can be read from the table “old_content”']],
      'schema of that file: the storage tables of FTS5 and R-tree are hidden; a full-text table of the old kind (fts4, not in this build) is listed with the reason and where its rows are, and those tables are shown');
    t.eq(f.exec('SELECT c0x FROM old_content').results[0].rows, [['legacy full-text table']], 'and its text can indeed be read there');
    e.close(); w.close(); f.close();
  }

  // ---- schema
  {
    const q = E(fx('quote.db'));
    const sch = q.schema();
    t.eq(sch.map((o) => [o.name, o.type, o.count, o.columns.map((c) => c.name).join(',')]), [['back\\slash', 'table', 0, 'y'], ['has space', 'table', 0, 'other'], ['select', 'table', 0, 'w'], ['sqlitedata', 'table', 1, 'z'], ['we"ird', 'table', 1, 'x'], ['नाम सूची', 'table', 1, 'पहला नाम'], ['broken', 'view', null, ''], ['v', 'view', 1, 'one']], 'names with quotes, backslashes, spaces, a keyword, Devanagari; a table whose name merely starts with "sqlite" is listed');
    t.ok(/no such column: q/.test(sch.find((o) => o.name === 'broken').error), `a view that no longer works is listed with SQLite's reason (${sch.find((o) => o.name === 'broken').error})`);
    t.eq(sch.map((o) => q.exec(`SELECT count(*) FROM ${quoteId(o.name)}`).error?.message).filter(Boolean).length, 1, 'every listed name, quoted by quoteId(), can be queried (but the broken view)');
    const e = E();
    const made = e.exec("CREATE TABLE p (id INTEGER PRIMARY KEY, name TEXT NOT NULL, w REAL DEFAULT 1.5, both TEXT GENERATED ALWAYS AS (name || id) VIRTUAL, st INT GENERATED ALWAYS AS (id * 2) STORED, misc); CREATE TABLE c (a, b, PRIMARY KEY (b, a)) WITHOUT ROWID; CREATE INDEX p_name ON p (name); CREATE UNIQUE INDEX p_w ON p (w); CREATE TRIGGER p_ai AFTER INSERT ON p BEGIN SELECT 1; END; CREATE VIEW pv AS SELECT id FROM p; CREATE VIRTUAL TABLE ft USING fts5(body); INSERT INTO p (name, w) VALUES ('a', 1), ('b', 2); ATTACH ':memory:' AS aux; CREATE TABLE aux.other (z); CREATE TEMP TABLE scratch (s)");
    t.eq([made.error, made.results.length], [undefined, 11], 'the schema script ran (11 statements)');
    const s2 = e.schema(), P = s2.find((o) => o.name === 'p');
    t.eq(s2.map((o) => `${o.schema}.${o.name}:${o.type}`), ['main.c:table', 'main.p:table', 'main.ft:virtual', 'main.pv:view', 'aux.other:table', 'temp.scratch:table'], 'tables, then virtual tables, then views; attached and temporary databases after main');
    t.eq([P.columns.map((c) => [c.name, c.type, c.pk, c.hidden]), P.indexes.sort(), P.triggers, P.count], [[['id', 'INTEGER', 1, 0], ['name', 'TEXT', 0, 0], ['w', 'REAL', 0, 0], ['both', 'TEXT', 0, 2], ['st', 'INT', 0, 3], ['misc', '', 0, 0]], ['p_name', 'p_w'], ['p_ai'], 2], 'columns with their declared type, the primary key, generated columns marked; indexes and triggers of the table');
    t.eq(s2.find((o) => o.name === 'c').columns.map((c) => [c.name, c.pk]), [['a', 2], ['b', 1]], 'the order of a composite primary key');
    q.close(); e.close();
  }

  // ---- imports: CSV / TSV files read by sheet.wasm, which also says what each column can be stored as
  {
    const e = E();
    const imp = (file, table = file.replace(/\..*/, '')) => { const s = sheet.csv(fx(file)).sheets[0]; return e.importSheet(table, s.rows, s.types); };
    const rows = (tbl, cols = '*') => e.exec(`SELECT ${cols} FROM ${quoteId(tbl)} ORDER BY rowid`).results[0].rows;
    let r = imp('lead.csv');
    t.eq([r.columns, r.types, r.rows, rows('lead'), rows('lead', 'typeof(pin), typeof(id), typeof(amount)')[0]], [['pin', 'phone', 'id', 'amount', 'name'], ['TEXT', 'TEXT', 'INTEGER', 'REAL', 'TEXT'], 2, [['011001', '09876543210', { i: '1234567890123456789' }, { r: '10.5' }, 'A'], ['400001', '09123456789', { i: '1234567890123456788' }, { r: '7.0' }, 'B']], ['text', 'integer', 'real']],
      'PIN codes and phone numbers keep their leading zeros (TEXT), a 19-digit id is an exact INTEGER, amounts are REAL');
    t.eq([imp('dup.csv').columns, imp('dup2.csv').columns, imp('emptyhead.csv').columns], [['a', 'b', 'a_2'], ['Name', 'name_2'], ['a', 'col2', 'c', 'col2_2']], 'column names that repeat (in any letter case) or are empty get a usable name');
    t.eq([imp('headeronly.csv').rows, rows('headeronly'), err(() => imp('empty.csv'))], [0, [], 'That file has no rows.'], 'a file with only a header makes an empty table; an empty file is refused');
    imp('bom.csv');
    t.eq(rows('bom', '*'), [[1, 'Rao, Asha', 'said "hi"'], [2, 'multi\nline', null]], 'a BOM, CRLF lines, quoted commas, doubled quotes and a line break inside a cell; an empty cell is NULL');
    t.eq(e.exec('SELECT name FROM pragma_table_info(\'bom\')').results[0].rows.flat(), ['id', 'full name', 'note'], 'the BOM is not part of the first column name');
    t.eq([imp('ragged.csv').columns, rows('ragged')], [['a', 'b', 'col3', 'col4'], [[1, 2, 3, 4], [5, null, null, null]]], 'rows of different lengths: the table is as wide as the widest row');
    t.eq([imp('semi.csv').types, rows('semi')], [['TEXT', 'INTEGER', 'TEXT'], [['1,5', 2, 'x'], ['2,5', 3, 'y']]], 'semicolon-separated values (the separator is detected); "1,5" stays text');
    t.eq([imp('nums.csv').types, rows('nums')], [['TEXT'], [['1e999'], ['-0'], ['1.5']]], 'a column with a number no REAL can hold stays TEXT, exactly as written');
    t.eq([imp('bigint.csv').types, rows('bigint')], [['INTEGER'], [[{ i: '9007199254740993' }], [123456789012345]]], 'an integer beyond 2^53 is stored exactly');
    t.eq([imp('tabs.tsv').types, rows('tabs')], [['TEXT', 'INTEGER', 'TEXT'], [['Mumbai', 2422, 'wet'], ['Pune', 722, null]]], 'tab-separated values');
    t.eq([imp('devanagari.csv').columns, rows('devanagari')], [['नाम', 'शहर', 'अंक'], [['आशा', 'पुणे', 91], ['रवि', 'मुंबई', 78]]], 'Devanagari headers and cells');
    // table names
    t.eq([imp('tabs.tsv', 'tabs').table, imp('tabs.tsv', 'TABS').table, imp('tabs.tsv', 'sqlite_master').table, imp('tabs.tsv', '  ').table, imp('tabs.tsv', 'my "table"; DROP TABLE lead; --').table], ['tabs_2', 'TABS_3', 'data_sqlite_master', 'data', 'my "table"; DROP TABLE lead; --'], 'a taken name gets a number, a reserved or empty one a prefix, and a name full of SQL is only a name');
    t.eq([rows('my "table"; DROP TABLE lead; --').length, rows('lead').length], [2, 2], 'that table exists and nothing was dropped');
    t.eq([e.importSheet('mixed', [['flag', 'n', 'x'], [true, 1, 'a'], [false, 2.5, null], ['', '', '']], ['INTEGER', 'REAL', 'TEXT']).rows, rows('mixed')], [3, [[1, { r: '1.0' }, 'a'], [0, { r: '2.5' }, null], [null, null, null]]], 'values from a workbook: booleans, numbers, empty cells');
    t.eq([e.importSheet('odd', [['a', 'b'], ['not a number', '12'], ['0x1F', '1e999'], [' 7 ', '99999999999999999999']], ['INTEGER', 'INTEGER']).rows, rows('odd')], [3, [['not a number', 12], ['0x1F', { r: 'Inf' }], [7, { r: '1.0e+20' }]]], 'a column called INTEGER that holds something else: no cell is lost, wrapped round or turned into NULL — text stays text ("0x1F" is not read as 31), and what SQLite itself takes for a number in such a column becomes one');
    t.eq([e.importSheet('huge', [['v'], ['100000000000000000000'], ['1e20'], [1e20], [2 ** 63], [-(2 ** 63)], [9007199254740993], ['-0.5'], [1e-320]], ['REAL']).rows, rows('huge', 'v, typeof(v)')], [8, [[{ r: '1.0e+20' }, 'real'], [{ r: '1.0e+20' }, 'real'], [{ r: '1.0e+20' }, 'real'], [{ r: '9.2233720368547758e+18' }, 'real'], [{ r: '-9.2233720368547758e+18' }, 'real'], [{ r: '9007199254740992.0' }, 'real'], [{ r: '-0.5' }, 'real'], [{ r: '9.9998886718268301e-321' }, 'real']]], 'REAL cells beyond the 64-bit integer range (1e20, 2^63) arrive as that number — they used to wrap round to an unrelated integer');
    e.close();
  }

  // ---- exports
  {
    const e = E();
    e.exec("CREATE TABLE x (id, name, amount, data, big, note); INSERT INTO x VALUES (1, 'Rao, Asha', 10.5, x'00ff', 9007199254740993, 'said \"hi\"'), (2, 'multi' || char(10) || 'line', 1e300, NULL, -1, ''), (3, NULL, 9e999, x'', 0, ' padded ')");
    e.exec('SELECT 0; SELECT * FROM x ORDER BY id; SELECT 1 AS a, 2 AS a, 3 AS "a_2", NULL AS "we""ird"');
    const csv = e.exportResult(1, 'csv').join('');
    t.eq(csv, '﻿id,name,amount,data,big,note\n1,"Rao, Asha",10.5,X\'00ff\',9007199254740993,"said ""hi"""\n2,"multi\nline",1.0e+300,,-1,\n3,,Inf,X\'\',0, padded \n', 'CSV: a BOM (Excel reads UTF-8), RFC 4180 quoting, reals as SQLite writes them, exact big integers, blobs as X\'…\', NULL as an empty cell');
    const back = sheet.csv(new TextEncoder().encode(csv)).sheets[0].rows;
    t.eq([back.length, back[1][1], back[2][1], back[1][5]], [4, 'Rao, Asha', 'multi\nline', 'said "hi"'], 'that CSV reads back cell for cell');
    const json = e.exportResult(1, 'json').join('');
    t.eq(json, '[\n  {"id": 1, "name": "Rao, Asha", "amount": 10.5, "data": "X\'00ff\'", "big": 9007199254740993, "note": "said \\"hi\\""},\n  {"id": 2, "name": "multi\\nline", "amount": 1.0e+300, "data": null, "big": -1, "note": ""},\n  {"id": 3, "name": null, "amount": null, "data": "X\'\'", "big": 0, "note": " padded "}\n]\n', 'JSON: one object per row, numbers written exactly (the big integer keeps all its digits), a real JSON cannot hold (Inf) is null');
    t.eq(JSON.parse(json).map((o) => o.id), [1, 2, 3], 'it parses');
    t.eq([e.exportResult(2, 'json').join(''), e.exportResult(2, 'csv').join('')], ['[\n  {"a": 1, "a_2": 2, "a_2_2": 3, "we\\"ird": null}\n]\n', '﻿a,a,a_2,"we""ird"\n1,2,3,\n'], 'columns with the same name: JSON keys are made unique, the CSV header is as SQLite gives it');
    t.eq([e.exportResult(0, 'json').join(''), err(() => e.exportResult(7, 'csv'))], ['[\n  {"0": 0}\n]\n', 'That result is gone — run the statement again.'], 'a result by its number; a number that does not exist');
    e.exec('SELECT 1 WHERE 0');
    t.eq([e.exportResult(0, 'json').join(''), e.exportResult(0, 'csv').join('')], [']\n'.replace(']', '[]'), '﻿1\n'], 'a result without rows: an empty list / only the header');
    // 50,000 rows go through in pieces
    e.exec("WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 50000) SELECT n, 'r' || n AS label FROM s");
    const big = e.exportResult(0, 'csv'), lines = big.join('').split('\n');
    t.eq([big.length > 3, lines.length, lines[1], lines[50000]], [true, 50002, '1,r1', '50000,r50000'], '50,000 rows exported in pieces: every line is there, in order');
    t.eq(JSON.parse(e.exportResult(0, 'json').join('')).length, 50000, 'and as JSON');
    // the database file
    const bytes = e.exportDb();
    t.eq([new TextDecoder().decode(bytes.subarray(0, 15)), bytes.length % 512], ['SQLite format 3', 0], 'the downloaded database is a SQLite file');
    const again = E(bytes);
    t.eq(again.exec('SELECT * FROM x ORDER BY id').results[0].rows, e.exec('SELECT * FROM x ORDER BY id').results[0].rows, 'opened again it holds the same rows, value for value');
    again.close(); e.close();
    t.ok(/No database is open/.test(err(() => e.exec('SELECT 1'))), 'after close() the engine says that no database is open');
  }
  t.eq([quoteId('a'), quoteId('we"ird'), quoteId(''), plain(new Error('SQLITE_ERROR: sqlite3 result code 1: no such table: t')), plain('x')], ['"a"', '"we""ird"', '""', 'no such table: t', 'x'], 'quoteId and plain');
};
