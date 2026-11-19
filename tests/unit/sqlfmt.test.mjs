// SQL Formatter engine (wasm/devcore/src/sqlfmt.rs → devcore-sqlfmt.wasm).
// A formatter may change two things: white space, and the case of keywords. Everything here checks that — against
// references that are not the formatter itself:
//   · an independent, simple reader of SQL text written in this file (`read`): quoted text, comments, words, signs.
//     Original and result must read the same, word for word; in "as typed" mode letter for letter.
//   · the SQLite engine (the official WebAssembly build): every statement of the SQLite corpus gives the same rows,
//     the same column names, the same error and leaves the same database, formatted or not, in every option set.
//   · 240 words that are both SQL keywords and everyday column names, in 48 statement shapes, in 6 dialects: used
//     as a name, a word keeps the case it was typed in.
//   (sqlglot and sqlparse — Python — read the results in the tab's e2e suite.)
// Then: the layout (tests/fixtures/sqlfmt/layout.json, a reviewed record), the tokens of each dialect, the faults of
// the sqlformat crate this engine replaced, statements without semicolons, blocks, dialect detection, warnings,
// stability (formatting a result again changes nothing), hostile input.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

/** An independent reading of SQL text: [kind, text] — q quoted text (kept exactly), c comment, w word, p sign. */
function read(sql, d) {
  const n = sql.length, out = [];
  let i = 0;
  const idc = (c) => c !== undefined && /[A-Za-z0-9_$\u0080-\uffff]/.test(c);
  const nest = d === 'postgres' || d === 'tsql' || d === 'standard';
  const quoted = (from, q, bs) => { let j = from + 1; while (j < n) { if (bs && sql[j] === '\\') { j += 2; continue; } if (sql[j] === q) { if (sql[j + 1] === q) { j += 2; continue; } return j + 1; } j++; } return n; };
  while (i < n) {
    const c = sql[i], c1 = sql[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    let e = -1, kind = 'q';
    if (c === '-' && c1 === '-' && (d !== 'mysql' || i + 2 >= n || sql.charCodeAt(i + 2) <= 32)) { e = sql.indexOf('\n', i); if (e < 0) e = n; kind = 'c'; }
    else if (c === '#' && d === 'mysql') { e = sql.indexOf('\n', i); if (e < 0) e = n; kind = 'c'; }
    else if (c === '/' && c1 === '*') {
      let depth = 1, j = i + 2;
      while (j < n && depth) { if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; } else if (nest && sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; } else j++; }
      e = j; kind = 'c';
    } else if (c === "'") {
      const p = sql[i - 1], solo = !idc(sql[i - 2]);
      if (d === 'oracle' && /[qQ]/.test(p ?? '') && (solo || (/[nN]/.test(sql[i - 2]) && !idc(sql[i - 3])))) {
        const o = sql[i + 1], cl = { '[': ']', '{': '}', '(': ')', '<': '>' }[o] ?? o, k = sql.indexOf(cl + "'", i + 2);
        e = k < 0 ? n : k + 2;
      } else e = quoted(i, "'", d === 'mysql' || (d === 'postgres' && /[eE]/.test(p ?? '') && solo));
    } else if (c === '"') e = quoted(i, '"', d === 'mysql');
    else if (c === '`') e = quoted(i, '`', false);
    else if (c === '[' && (d === 'tsql' || d === 'sqlite')) e = quoted(i, ']', false);
    else if (c === '$' && d === 'postgres' && !idc(sql[i - 1])) {
      const m = /^\$([A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*)?\$/.exec(sql.slice(i, i + 80));
      if (m) { const k = sql.indexOf(m[0], i + m[0].length); e = k < 0 ? n : k + m[0].length; }
    }
    if (e >= 0) { out.push([kind, kind === 'c' ? sql.slice(i, e).trimEnd() : sql.slice(i, e)]); i = e; continue; }
    if (idc(c)) { let j = i + 1; while (j < n && idc(sql[j])) j++; out.push(['w', sql.slice(i, j)]); i = j; continue; }
    out.push(['p', c]); i++;
  }
  return out;
}
/** Words of SQL: the only ones whose case a formatter may change. (Types too: INT, VARCHAR …) */
const KEYWORDS = new Set(`ABORT ACTION ADD AFTER AGAINST ALL ALTER ALWAYS ANALYZE AND ANY APPLY AS ASC AT ATTACH AUTOINCREMENT AUTO_INCREMENT BEFORE BEGIN BETWEEN BY CASCADE CASE CATCH CHANGE
CHARACTER CHARSET CHECK CLUSTERED COLLATE COLUMN COLUMNS COMMENT COMMIT CONCURRENTLY CONFLICT CONNECT CONSTRAINT COPY CREATE CROSS CURRENT CURRENT_TIMESTAMP DATA DATABASE DAY DECLARE DEFAULT
DEFERRED DELETE DESC DESCRIBE DISTINCT DIV DO DROP DUPLICATE EACH ELSE ELSEIF ELSIF ENCLOSED END ENGINE ESCAPE EXCEPT EXCEPTION EXCLUDE EXEC EXECUTE EXISTS EXPLAIN FALSE FETCH FIELDS FILTER
FIRST FOLLOWING FOR FORCE FOREIGN FROM FULL FULLTEXT FUNCTION GENERATED GLOB GO GRANT GROUP GROUPING HAVING HOUR IDENTITY IF IGNORE ILIKE IMMEDIATE IN INDEX INFILE INNER INSERT INTERSECT
INTERVAL INTO IS ISNULL JOIN KEY LANGUAGE LAST LATERAL LEFT LIKE LIMIT LINES LOAD LOCAL LOCKED LOOP MATCH MATCHED MATERIALIZED MERGE MINUS MOD MODIFY MONTH NAMES NATURAL NEXT NO NOCYCLE
NOT NOTHING NOTNULL NOWAIT NULL NULLS OF OFFSET ON ONLY OPTION OPTIONALLY OR ORDER ORDINALITY OUT OUTER OUTPUT OVER PARTITION PERCENT PIVOT PLAN PRAGMA PRECEDING PRIMARY PRIOR PROCEDURE
QUERY RANGE RECURSIVE REFERENCES REFRESH REGEXP RELEASE REPLACE RETURN RETURNING RETURNS REVOKE RIGHT RLIKE ROLLBACK ROLLUP ROW ROWS SAVEPOINT SCHEMA SELECT SEPARATOR SESSION SET SETS SHARE
SHOW SIBLINGS SIMILAR SKIP SOUNDS SOURCE START STDIN STORED STRAIGHT_JOIN STRICT SYMMETRIC SQL_CALC_FOUND_ROWS TABLE TABLES TABLESAMPLE TARGET TEMP TERMINATED THEN THROW TIES TIME TO TOP
TRANSACTION TRIGGER TRUE TRY TYPE UNBOUNDED UNION UNIQUE UNKNOWN UNSIGNED UPDATE USE USING VACUUM VALUES VIEW VIRTUAL WHEN WHERE WHILE WINDOW WITH WITHIN WITHOUT XOR YEAR ZONE
INT INTEGER SMALLINT BIGINT DECIMAL NUMERIC NUMBER FLOAT REAL DOUBLE BOOLEAN CHAR VARCHAR VARCHAR2 NVARCHAR TEXT CLOB BLOB DATE DATETIME DATETIME2 TIMESTAMP TIMESTAMPTZ JSON JSONB ENUM
BIGSERIAL ROWVERSION`.split(/\s+/));

export default async (t, { load, wasm, root }) => {
  const { bindDevcore } = await load('/src/wasm/devcore.ts');
  const dc = bindDevcore(await wasm('devcore-sqlfmt'));
  const fmt = (sql, o = {}) => dc.json('sqlfmt', { sql, dialect: 'auto', ...o });
  const text = (sql, o) => fmt(sql, o).text;
  const tokens = (sql, dialect) => dc.json('sqlfmt:tokens', { sql, dialect });
  const fx = (name) => JSON.parse(readFileSync(join(root, 'tests/fixtures/sqlfmt', name), 'utf8'));
  const C = fx('corpus.json'), L = fx('layout.json');
  const DIALECTS = ['sqlite', 'postgres', 'mysql', 'tsql', 'oracle'];
  const OPTS = [['default', {}], ['lower case', { keywords: 'lower' }], ['as typed', { keywords: 'keep' }], ['one line', { inline: true }], ['tab, 2 blank lines', { indent: 0, lines: 3 }], ['4 spaces', { indent: 4, lines: 2 }]];
  const short = (s) => JSON.stringify(s.length > 90 ? s.slice(0, 90) + '…' : s);

  /** Why `b` is not `a` with only white space and keyword case changed — or '' when it is. */
  const differs = (a, b, d, keep) => {
    const x = read(a, d), y = read(b, d);
    const cx = x.filter((k) => k[0] === 'c'), cy = y.filter((k) => k[0] === 'c'), tx = x.filter((k) => k[0] !== 'c'), ty = y.filter((k) => k[0] !== 'c');
    if (cx.length !== cy.length || cx.some((k, i) => k[1] !== cy[i][1])) return 'comments differ';
    if (tx.length !== ty.length) return `${tx.length} tokens became ${ty.length}`;
    for (let i = 0; i < tx.length; i++) {
      const [ka, sa] = tx[i], [kb, sb] = ty[i];
      if (ka !== kb) return `token ${i}: ${sa} became ${sb}`;
      if (sa === sb) continue;
      if (ka !== 'w' || keep || sa.toLowerCase() !== sb.toLowerCase()) return `token ${i}: ${sa} became ${sb}`;
      if (!KEYWORDS.has(sa.toUpperCase())) return `the case of “${sa}” changed, and it is no keyword`;
      if ((tx[i - 1]?.[1] === '.' || tx[i + 1]?.[1] === '.') && !/^\d/.test(tx[i - 1]?.[1] ?? '')) return `the case of “${sa}” changed next to a dot`;
    }
    return '';
  };

  // ---- 1. the corpus: every statement, every option set, as its own dialect and detected
  {
    let n = 0; const bad = [];
    for (const d of DIALECTS) for (const sql of C[d]) for (const [name, o] of OPTS) for (const dialect of [d, 'auto']) {
      n++;
      const r = fmt(sql, { ...o, dialect });
      // read with the rules the formatter used; a detected dialect reads these statements as theirs or as standard SQL
      const rd = r.dialect;
      if (r.kept) { bad.push(`${d} ${name}: left as it was ${short(sql)}`); continue; }
      const why = differs(sql, r.text, rd, o.keywords === 'keep');
      if (why) bad.push(`${d}/${rd} ${name}: ${why} in ${short(sql)}`);
      const again = fmt(r.text, { ...o, dialect: rd });
      if (again.text !== r.text) bad.push(`${d} ${name}: formatted again it changes ${short(sql)}`);
      if (/[ \t]\n/.test(r.text.replace(/'[^']*'/g, "''")) && !/\/\*|'|\$\$|\$\w*\$/.test(sql)) bad.push(`${d} ${name}: a line ends in white space ${short(sql)}`);
    }
    t.ok(!bad.length && n === 141 * 6 * 2, `${n} formattings of the 141-statement corpus (5 dialects × 6 option sets, dialect given and detected): an independent reader finds the same tokens and comments, only keywords changed case, none was left as it was, none changes when formatted again ${bad.slice(0, 5).join(' | ')}${bad.length > 5 ? ` (+${bad.length - 5})` : ''}`);
    // the reader itself notices what a broken formatter would do
    t.ok(differs('select a from t', 'SELECT a FROM t', 'standard') === '' && differs('select a from t', 'SELECT A FROM t', 'standard') !== '' && differs("select 'a  b'", "SELECT 'a b'", 'standard') !== ''
      && differs('select a -- x\nfrom t', 'SELECT a -- x from t', 'standard') !== '' && differs('select ab', 'SELECT a b', 'standard') !== '' && differs('select a b', 'SELECT ab', 'standard') !== ''
      && differs('select [a  b] from t', 'SELECT [a b] FROM t', 'tsql') !== '' && differs("select 'it\\'s  x'", "SELECT 'it\\'s x'", 'mysql') !== '' && differs('select status from t', 'SELECT STATUS FROM t', 'standard') !== ''
      && differs('select t.key from t', 'SELECT t.KEY FROM t', 'standard') !== '' && differs('select 1', 'Select 1', 'standard', true) !== '',
      'the reader notices: a name in another case, a changed string, a comment that swallowed code, a split word, two words run together, a keyword-like name upper-cased, any case change in “as typed” mode');
  }

  // ---- 2. SQLite runs the original and the formatted statement: same rows, same names, same errors, same database
  {
    const req = createRequire(join(root, 'package.json'));
    globalThis.sqlite3ApiConfig = { warn: () => {}, error: () => {}, log: () => {}, debug: () => {} };
    const S = await (await import(req.resolve('@sqlite.org/sqlite-wasm'))).default({ print: () => {}, printErr: () => {} });
    const run = (sql) => {
      const db = new S.oo1.DB(':memory:'), out = { rows: [], names: [], error: null };
      try {
        db.exec(C.sqlite_setup);
        try { db.exec({ sql, rowMode: 'array', resultRows: out.rows, columnNames: out.names }); } catch (e) { out.error = String(e.message).replace(/^\w+: /, ''); }
        out.tables = db.selectArrays("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(([name]) => [name, db.selectValue(`SELECT count(*) FROM "${name}"`), JSON.stringify(db.selectArrays(`SELECT * FROM "${name}" ORDER BY 1, 2, 3 LIMIT 50`))]);
        out.schema = db.selectArrays('SELECT type, name FROM sqlite_schema ORDER BY name');
      } finally { db.close(); }
      return out;
    };
    // SQLite names an expression without an alias by its text — white space, comments and all
    const squeeze = (s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '').toLowerCase();
    let n = 0, withRows = 0, failing = 0; const bad = [];
    for (const sql of C.sqlite) {
      const a = run(sql); if (a.rows.length) withRows++; if (a.error) failing++;
      for (const [name, o] of OPTS) {
        n++;
        const f = text(sql, { ...o, dialect: 'sqlite' }), b = run(f);
        const rows = JSON.stringify(a.rows, (_, v) => (typeof v === 'bigint' ? `${v}n` : v instanceof Uint8Array ? [...v] : v)) === JSON.stringify(b.rows, (_, v) => (typeof v === 'bigint' ? `${v}n` : v instanceof Uint8Array ? [...v] : v));
        // the name of a column is its alias or its own name — exactly; an expression without an alias is named by its text, which the layout changes
        const names = a.names.length === b.names.length && a.names.every((x, i) => (/^[A-Za-z_][\w$]*$/.test(x) ? x === b.names[i] : squeeze(x) === squeeze(b.names[i])));
        if (!rows || !names || a.error !== b.error || JSON.stringify(a.tables) !== JSON.stringify(b.tables) || JSON.stringify(a.schema) !== JSON.stringify(b.schema))
          bad.push(`${name}: ${!rows ? 'rows' : !names ? `names ${a.names} / ${b.names}` : a.error !== b.error ? `error ${a.error} / ${b.error}` : 'database'} differ for ${short(sql)}`);
      }
    }
    t.ok(!bad.length && n === 53 * 6 && withRows >= 35 && failing <= 2, `SQLite ${S.version.libVersion} runs the ${C.sqlite.length} SQLite statements as typed and formatted in ${OPTS.length} ways: same rows (${withRows} return rows), same column names, same errors, same tables afterwards ${bad.slice(0, 4).join(' | ')}`);
    // names that are keywords elsewhere, through the engine: the column names of the result tell
    const db = new S.oo1.DB(':memory:');
    db.exec('create table kv (key text, value text, status text, type text, level int, "end" int, date text, first text, comment text, "index" int, offset int, filter text)');
    db.exec("insert into kv values ('k', 'v', 's', 't', 1, 2, 'd', 'f', 'c', 3, 4, 'x')");
    const q = 'select key, value as status, type as key, level + 1 as level, date, first as last, comment, offset, filter from kv where status = \'s\' and type like \'t\' order by key, level desc';
    const names = (sql) => { const c = []; db.exec({ sql, columnNames: c, rowMode: 'array', resultRows: [] }); return c.join(); };
    t.eq(names(text(q, { dialect: 'sqlite' })), names(q), 'columns and aliases called key, status, type, level, date, last, comment, offset, filter come back from SQLite under the same names');
    t.eq(names(text(q, { dialect: 'sqlite' })), 'key,status,key,level,date,last,comment,offset,filter', '… the names as typed');
    db.close();
  }

  // ---- 3. keyword-like names keep their case
  {
    const NAMES = 'status type key level events month day year hour minute second week date time timestamp comment password action mode start end open first last next row rows range index view database session interval offset limit partition window match against ignore replace share lock work read write only names charset collation engine function procedure name value user role owner language data text json content title description state city country zone at filter over rank count sum min max avg total number position length size version source target path url host port domain schema plan query result rule policy option options public private temp temporary cache cycle increment enable disable force format header columns tables fields lines grants errors warnings snapshot begin commit rollback go use show call exec print return declare loop top percent ties nulls full left right any some both leading trailing copy load delimiter stdin csv binary char varchar int integer real float double decimal numeric boolean bit blob clob xml uuid money serial enum ordinality lateral recursive materialized concurrently pivot output merge matched abort fail conflict nothing do deferred immediate exclusive vacuum analyze explain pragma attach detach reindex truncate grant revoke rename add modify change after before instead each statement cascade restrict no generated always identity stored virtual unsigned signed zerofill precision varying national security definer invoker exception exclude sounds separator'.split(' ');
    const SHAPES = [
      (n) => `select ${n} from t`, (n) => `select a, ${n}, b from t`, (n) => `select t.${n} from t`, (n) => `select ${n}.id from ${n}`, (n) => `select a from t where ${n} = 1`,
      (n) => `select a from t where x = 1 and ${n} > 2`, (n) => `select a from t order by ${n}`, (n) => `select a from t order by ${n} desc`, (n) => `select a from t group by ${n}`,
      (n) => `select 1 as ${n}`, (n) => `select a as ${n}, b from t`, (n) => `select sum(${n}) from t`, (n) => `select max(a, ${n}) from t`, (n) => `insert into t (a, ${n}) values (1, 2)`,
      (n) => `insert into t (${n}) values (1)`, (n) => `update t set ${n} = 1 where id = 2`, (n) => `update t set a = 1, ${n} = ${n} + 1`, (n) => `create table t (${n} text, b int)`,
      (n) => `create table t (a int, ${n} text not null)`, (n) => `alter table t add ${n} text`, (n) => `alter table t add column ${n} text`, (n) => `alter table t drop column ${n}`,
      (n) => `alter table t rename column a to ${n}`, (n) => `create index i on t (${n})`, (n) => `create index i on t (a, ${n} desc)`, (n) => `select a from t join u on t.${n} = u.${n}`,
      (n) => `select a from t join u using (${n})`, (n) => `select case when ${n} = 1 then ${n} else 0 end from t`, (n) => `select a from t where ${n} is null`, (n) => `select a from t where ${n} in (1, 2)`,
      (n) => `select a from t where ${n} between 1 and 2`, (n) => `select a from t where ${n} like 'x%'`, (n) => `select coalesce(${n}, 0) from t`, (n) => `select a from t where b = ${n}`,
      (n) => `select ${n}, count(*) from t group by ${n} having count(*) > 1`, (n) => `select a, ${n}\nfrom t`, (n) => `select a\n, ${n}\nfrom t`, (n) => `delete from t where ${n} = 1`,
      (n) => `select t.a, u.${n} from t, u`, (n) => `select -${n}, ${n} * 2, ${n} || 'x' from t`, (n) => `select a from t where not ${n}`, (n) => `select distinct ${n} from t`,
      (n) => `select a from t where (${n})`, (n) => `select a from t where a = (select max(${n}) from u)`, (n) => `select a from t limit 5 offset 2; select ${n} from u`,
      (n) => `with x as (select ${n} from t) select ${n} from x`, (n) => `select a from t returning ${n}`, (n) => `insert into t values (1) returning ${n}, a`,
    ];
    const ALL = ['standard', ...DIALECTS];
    let n = 0; const bad = [];
    NAMES.forEach((name, i) => SHAPES.forEach((mk, k) => {
      // typed in a case no keyword is written in: every occurrence has to come back as typed
      const odd = [...name].map((c, j) => (j % 2 ? c.toUpperCase() : c)).join(''), sql = mk(odd), d = ALL[(i + k) % ALL.length], r = fmt(sql, { dialect: d });
      n++;
      if (r.kept || r.text.split(odd).length !== sql.split(odd).length) bad.push(`${d} “${name}” in ${short(mk(name))} → ${short(r.text)}`);
    }));
    t.ok(!bad.length && n === NAMES.length * SHAPES.length && n > 10000, `${n} statements use ${NAMES.length} keyword-like words as the names of columns and tables (${SHAPES.length} shapes, 6 dialects): the names keep the case they were typed in ${bad.slice(0, 4).join(' | ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`);
    // … and where they are keywords, they do change
    const up = (sql, word, d = 'standard') => text(sql, { dialect: d }).includes(word);
    t.ok(up('select a from t limit 5 offset 2', 'LIMIT\n  5 OFFSET 2') && up('select a from t order by a desc nulls first', 'DESC NULLS FIRST') && up('create table t (a int primary key)', 'INT PRIMARY KEY')
      && up('select sum(a) over (partition by b order by c rows between 1 preceding and current row) from t', '    ROWS BETWEEN 1 PRECEDING AND CURRENT ROW\n')
      && up('insert into t values (1) on conflict do nothing returning id', 'ON CONFLICT DO NOTHING\nRETURNING') && up('begin; commit', 'BEGIN;\nCOMMIT') && up("select date '2026-01-01', interval '1' day", "DATE '2026-01-01',\n  INTERVAL '1' DAY")
      && up('select a from t where b ilike c or d is not null', 'ILIKE c\n  OR d IS NOT NULL') && up('select count(*) filter (where a) from t', 'FILTER (WHERE a)') && up('alter table t rename column a to b', 'RENAME COLUMN a TO b')
      && up('select a::text, cast(b as integer) from t', 'a::TEXT,\n  cast(b AS INTEGER)') && up('drop table if exists t cascade', 'DROP TABLE IF EXISTS t CASCADE') && up('select x from t for update skip locked', 'FOR UPDATE SKIP LOCKED'),
      'the same words are upper-cased where they are keywords: LIMIT … OFFSET, DESC NULLS FIRST, types, window frames, ON CONFLICT DO NOTHING, BEGIN / COMMIT, DATE and INTERVAL literals, ILIKE, FILTER, RENAME COLUMN … TO, casts, CASCADE, FOR UPDATE SKIP LOCKED');
    t.eq(text('select left(a, 2), right(a, 2), replace(a, 1, 2), if(a, 1, 2), char(65), date(a), user(), count(*), coalesce(a, b) from t left join u on true', { dialect: 'mysql' }),
      'SELECT\n  left(a, 2),\n  right(a, 2),\n  replace(a, 1, 2),\n  if(a, 1, 2),\n  char(65),\n  date(a),\n  user(),\n  count(*),\n  coalesce(a, b)\nFROM\n  t\n  LEFT JOIN u ON TRUE', 'functions that share a name with a keyword (left, right, replace, if, char, date) stay as typed; LEFT JOIN is upper-cased');
    t.eq(text('select count (*), now (), f(a) from t where a in(1, 2) and exists(select 1)', { dialect: 'mysql' }), 'SELECT\n  count (*),\n  now (),\n  f(a)\nFROM\n  t\nWHERE\n  a IN (1, 2)\n  AND EXISTS (\n    SELECT\n      1\n  )',
      'the space between a function and its bracket stays as typed (MySQL reads “count (” and “count(” differently); IN and EXISTS get their space');
  }

  // ---- 4. the layout (a reviewed record: scripts/make-sqlfmt-layout.mjs)
  {
    let n = 0; const bad = [];
    for (const d of DIALECTS) C[d].forEach((sql, i) => { n++; if (text(sql, { dialect: d }) !== L.corpus[d][i]) bad.push(`${d} #${i}`); });
    t.ok(!bad.length && n === 141, `the layout of the ${n} corpus statements is the recorded one ${bad.slice(0, 8).join(', ')}`);
    const off = L.extra.filter((x) => { const r = fmt(x.sql, { dialect: x.d || 'auto', ...x.o }); return r.text !== x.out || r.dialect !== x.read; });
    t.ok(!off.length && L.extra.length >= 28, `… and of ${L.extra.length} more cases (options, scripts, templates, comments) ${off.slice(0, 3).map((x) => short(x.sql)).join(' | ')}`);
    t.eq(text('select a, b from t where x = 1 and y > 2 order by a'), 'SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y > 2\nORDER BY\n  a', 'clauses on their own lines, their content indented');
    t.eq(text('select a from t join u on u.id = t.id and u.x = 1 left outer join v using (k) where a = 1 or b = 2'), 'SELECT\n  a\nFROM\n  t\n  JOIN u ON u.id = t.id\n    AND u.x = 1\n  LEFT OUTER JOIN v USING (k)\nWHERE\n  a = 1\n  OR b = 2', 'joins start a line; the AND of a join condition goes one level deeper');
    t.eq(text('with a as (select 1 x), b as (select 2 y) select * from a, b'), 'WITH\n  a AS (\n    SELECT\n      1 x\n  ),\n  b AS (\n    SELECT\n      2 y\n  )\nSELECT\n  *\nFROM\n  a,\n  b', 'common table expressions');
    t.eq(text("select case when a = 1 then 'one' when a = 2 then 'two' else 'other' end as n, case a when 1 then 2 end from t"), "SELECT\n  CASE\n    WHEN a = 1 THEN 'one'\n    WHEN a = 2 THEN 'two'\n    ELSE 'other'\n  END AS n,\n  CASE a WHEN 1 THEN 2 END\nFROM\n  t", 'a long CASE is broken at WHEN / ELSE, a short one stays on its line');
    t.eq(text('select sum(x) over (partition by customer_id, region order by created_at desc rows between unbounded preceding and current row) from t'), 'SELECT\n  sum(x) OVER (\n    PARTITION BY customer_id, region\n    ORDER BY created_at DESC\n    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  )\nFROM\n  t', 'a long window: PARTITION BY, ORDER BY and the frame each on a line');
    t.eq(text('insert into t (a, b) values (1, 2), (3, 4) on conflict (a) do update set b = excluded.b where t.b is null returning *', { dialect: 'postgres' }), 'INSERT INTO\n  t (a, b)\nVALUES\n  (1, 2),\n  (3, 4)\nON CONFLICT (a) DO UPDATE\nSET\n  b = excluded.b\nWHERE\n  t.b IS NULL\nRETURNING\n  *', 'INSERT … ON CONFLICT … RETURNING');
    t.eq(text('merge into tgt t using src s on t.id = s.id when matched then update set v = s.v when not matched then insert (id, v) values (s.id, s.v)'), 'MERGE INTO\n  tgt t\nUSING\n  src s ON t.id = s.id\nWHEN MATCHED THEN UPDATE SET v = s.v\nWHEN NOT MATCHED THEN INSERT (id, v) VALUES (s.id, s.v)', 'MERGE: one line per WHEN');
    t.eq(text('alter table t add column a int not null default 0, drop column b, rename column c to d'), 'ALTER TABLE t\n  ADD COLUMN a INT NOT NULL DEFAULT 0,\n  DROP COLUMN b,\n  RENAME COLUMN c TO d', 'ALTER TABLE with several actions: one a line');
    t.eq(text('alter table t add column a int'), 'ALTER TABLE t ADD COLUMN a INT', '… with one action: one line');
    t.eq(text('create view v as select a from t; explain query plan select 1; create table n as select * from t'), 'CREATE VIEW v AS\nSELECT\n  a\nFROM\n  t;\nEXPLAIN QUERY PLAN\nSELECT\n  1;\nCREATE TABLE n AS\nSELECT\n  *\nFROM\n  t', 'the query of a view, of EXPLAIN and of CREATE TABLE … AS starts on its own line');
    t.eq(text('select * from t where id in (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30)'), 'SELECT\n  *\nFROM\n  t\nWHERE\n  id IN (\n    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,\n    21, 22, 23, 24, 25, 26, 27, 28, 29, 30\n  )', 'a long list of values is filled line by line, not one value a line');
    t.eq(text('select a from (select b from (select c from t) x) y'), 'SELECT\n  a\nFROM\n  (\n    SELECT\n      b\n    FROM\n      (\n        SELECT\n          c\n        FROM\n          t\n      ) x\n  ) y', 'nested subqueries');
    t.eq(text('(select 1) union all (select 2) order by 1'), '(\n  SELECT\n    1\n)\nUNION ALL\n(\n  SELECT\n    2\n)\nORDER BY\n  1', 'queries in brackets joined by UNION ALL');
    t.eq(text('select a from t; ;; select b from u;'), 'SELECT\n  a\nFROM\n  t;\n;\n;\nSELECT\n  b\nFROM\n  u;', 'empty statements stay');
    t.eq(text(''), '', 'nothing in, nothing out'); t.eq(text('  \n\t '), '', 'white space only');
    t.eq(text('select 1\n\n\n'), 'SELECT\n  1', 'no line break is added at the end, none is kept');
  }

  // ---- 5. options
  {
    const q = 'select a, b from t where c in (select d from u); delete from t';
    t.eq(text(q, { indent: 4 }), 'SELECT\n    a,\n    b\nFROM\n    t\nWHERE\n    c IN (\n        SELECT\n            d\n        FROM\n            u\n    );\nDELETE FROM\n    t', 'indent 4');
    t.eq(text(q, { indent: 0 }).split('\n')[7], '\t\tSELECT', 'indent with tabs');
    t.eq(text(q, { lines: 3 }).split(';')[1].slice(0, 9), '\n\n\nDELETE', 'two blank lines between statements');
    t.eq(text(q, { inline: true }), 'SELECT a, b FROM t WHERE c IN (SELECT d FROM u);\nDELETE FROM t', 'one line per statement');
    t.eq(text(q, { inline: true, lines: 2 }), 'SELECT a, b FROM t WHERE c IN (SELECT d FROM u);\n\nDELETE FROM t', '… with a blank line between them');
    t.eq(text('SELECT A FROM T WHERE B IS NULL', { keywords: 'lower' }), 'select\n  A\nfrom\n  T\nwhere\n  B is null', 'keywords in lower case; names untouched');
    t.eq(text('Select A From T Where B Is Null', { keywords: 'keep' }), 'Select\n  A\nFrom\n  T\nWhere\n  B Is Null', 'keywords as typed');
    t.eq(text('select 1', { uppercase: false }), 'select\n  1', 'the option of the old engine (uppercase: false) still means lower case');
    t.eq(text("select a -- note\nfrom t where b = 'x' -- why\n", { inline: true }), "SELECT a -- note\nFROM t WHERE b = 'x' -- why", 'one line per statement: a “--” comment still ends its line (the sqlformat crate put the rest of the query inside the comment)');
    t.eq(text('select a # note\nfrom t', { inline: true, dialect: 'mysql' }), 'SELECT a # note\nFROM t', '… and so does a MySQL “#” comment');
    t.eq(text("select 'a'\n'b', 'c' 'd'", { inline: true, dialect: 'postgres' }), "SELECT 'a'\n'b', 'c' 'd'", 'two string parts on two lines stay on two lines: in standard SQL only then are they one string');
  }

  // ---- 6. the tokens of each dialect
  {
    const tk = (sql, d) => tokens(sql, d).map((x) => x[1]);
    const kinds = (sql, d) => tokens(sql, d).map((x) => `${x[0]}:${x[1]}`).join(' ');
    t.eq(tk("select 'it''s', 'a\\', 'b'", 'standard'), ['select', "'it''s'", ',', "'a\\'", ',', "'b'"], 'standard SQL: a backslash is an ordinary character in a string');
    t.eq(tk("select 'it\\'s', \"a\\\"b\", 'c'", 'mysql'), ['select', "'it\\'s'", ',', '"a\\"b"', ',', "'c'"], 'MySQL: a backslash takes the next character with it, in single and in double quotes');
    t.eq(tk("select e'a\\'b', 'c\\', E'd'", 'postgres'), ['select', "e'a\\'b'", ',', "'c\\'", ',', "E'd'"], "PostgreSQL: only E'…' strings have backslash escapes");
    t.eq(tk("select $$a; 'b' -- c$$, $t$x $$ y$t$, $1, a$b$c", 'postgres'), ['select', "$$a; 'b' -- c$$", ',', '$t$x $$ y$t$', ',', '$1', ',', 'a$b$c'], 'PostgreSQL: dollar-quoted text is one token; $1 is a parameter; a$b$c is a name');
    t.eq(tk("select q'[it's]', q'{a}', nq'!b!', Q'<c>' from dual", 'oracle'), ['select', "q'[it's]'", ',', "q'{a}'", ',', "nq'!b!'", ',', "Q'<c>'", 'from', 'dual'], "Oracle: q'[ … ]' strings");
    t.eq(tk("select N'a', x'ff', B'01', U&'\\0041', _utf8mb4'z'", 'standard'), ['select', "N'a'", ',', "x'ff'", ',', "B'01'", ',', "U&'\\0041'", ',', '_utf8mb4', "'z'"], "prefixed strings: N'…', x'…', B'…', U&'…'");
    t.eq(tk('select [a b], [c]]d], "e""f", `g``h` from [x].[y]', 'tsql'), ['select', '[a b]', ',', '[c]]d]', ',', '"e""f"', ',', '`g``h`', 'from', '[x]', '.', '[y]'], 'SQL Server: [bracketed names], ]] inside');
    t.eq(tk("select a[1], b[2:3], array[1, 2], '{1}'::int[] from t", 'postgres'), ['select', 'a', '[', '1', ']', ',', 'b', '[', '2', ':', '3', ']', ',', 'array', '[', '1', ',', '2', ']', ',', "'{1}'", '::', 'int', '[', ']', 'from', 't'], 'PostgreSQL: [ ] are subscripts; a colon inside is a slice, not a parameter');
    t.eq(tk('select [from], a[1] from t', 'standard'), ['select', '[from]', ',', 'a', '[', '1', ']', 'from', 't'], 'undecided dialect: a bracket after white space is a name, one that touches a name is a subscript');
    t.eq(tk('select 1 -- a\n, 2 /* b /* c */ d */, 3', 'postgres'), ['select', '1', '-- a', ',', '2', '/* b /* c */ d */', ',', '3'], 'PostgreSQL: comments nest');
    t.eq(tk('select 2 /* b /* c */ d */', 'mysql'), ['select', '2', '/* b /* c */', 'd', '*', '/'], 'MySQL: they do not');
    t.eq(tk('select 1 # a\n, 2 -- b', 'mysql'), ['select', '1', '# a', ',', '2', '-- b'], 'MySQL: “#” comments');
    t.eq(kinds('select 5--5\n, 6', 'mysql'), 'Word:select Num:5 LineC:--5 Comma:, Num:6', 'MySQL “5--5” (5 − −5 there): kept as a comment — it is then left exactly as typed, where the other reading would rewrite a real comment as code');
    t.eq(tk('select 1e3, 1.5E-3, .5, 5., 0x1F, 0b101, 1_000, 1.5d, 2f, $12.50, 1..3', 'tsql'), ['select', '1e3', ',', '1.5E-3', ',', '.5', ',', '5.', ',', '0x1F', ',', '0b101', ',', '1_000', ',', '1.5d', ',', '2f', ',', '$12.50', ',', '1', '..', '3'], 'numbers: exponents, hex, binary, digit separators, suffixes, money; 1..3 is a range');
    t.eq(tk('select ?, ?1, :name, :1, @v, @@rowcount, $1, $name, %s, %(n)s, a % s from t', 'standard'), ['select', '?', ',', '?1', ',', ':name', ',', ':1', ',', '@v', ',', '@@rowcount', ',', '$1', ',', '$name', ',', '%s', ',', '%(n)s', ',', 'a', '%', 's', 'from', 't'], 'parameters: ? ?1 :name :1 @v @@v $1 $name %s %(n)s — and “a % s” is a remainder');
    t.eq(tk("select {{ a }}, {% if x %} b {% endif %}, ${c}, #{d}, :'e', :\"f\" from t", 'standard'), ['select', '{{ a }}', ',', '{% if x %}', 'b', '{% endif %}', ',', '${c}', ',', '#{d}', ',', ":'e'", ',', ':"f"', 'from', 't'], 'template text ({{ }}, {% %}, ${ }, #{ }) and psql variables are one token each');
    t.eq(tk('select a <=> b, a ->> b, a := b, a <> b, a != b, a >= b, a || b, a :: b', 'mysql'), ['select', 'a', '<=>', 'b', ',', 'a', '->>', 'b', ',', 'a', ':=', 'b', ',', 'a', '<>', 'b', ',', 'a', '!=', 'b', ',', 'a', '>=', 'b', ',', 'a', '||', 'b', ',', 'a', '::', 'b'], 'operators of several characters');
    t.eq(tk('select a #>> b, a @> b, a ?| b, a !~* b, a*-1, a=-1, a@-1, a <-> b, |/ 4', 'postgres'), ['select', 'a', '#>>', 'b', ',', 'a', '@>', 'b', ',', 'a', '?|', 'b', ',', 'a', '!~*', 'b', ',', 'a', '*', '-', '1', ',', 'a', '=', '-', '1', ',', 'a', '@-', '1', ',', 'a', '<->', 'b', ',', '|/', '4'], 'PostgreSQL operators by its own rule: “*-” is two operators, “@-” is one');
    t.eq(tk('select a from #tmp, ##g where @a = 1', 'tsql'), ['select', 'a', 'from', '#tmp', ',', '##g', 'where', '@a', '=', '1'], 'SQL Server: #temporary tables');
    t.eq(tk('select a from t, u where t.x = u.x (+) and <<lbl>> 1', 'oracle').filter((x) => /[+<]/.test(x)), ['(+)', '<<lbl>>'], 'Oracle: the outer-join mark (+) and <<labels>> are one token');
    t.eq(tk('sélect "naïve", नाम, 名前 from t', 'standard'), ['sélect', '"naïve"', ',', 'नाम', ',', '名前', 'from', 't'], 'names in any script');
    t.eq(tokens('\ufeffselect 1', 'standard').length, 2, 'a byte order mark at the start is skipped');
  }

  // ---- 7. what the tokens look like afterwards: nothing glued, nothing split
  {
    const one = (sql, d) => text(sql, { dialect: d, inline: true });
    t.eq(one('select 5 - -3, 5- -3, - -2, -(-2), a*-1, a=-1, +1, ~1, a - 1, a-1', 'standard'), 'SELECT 5 - -3, 5 - -3, - -2, -(-2), a * -1, a = -1, +1, ~1, a - 1, a - 1', 'a sign stays a sign: two minus signs never become “--”');
    t.eq(one("select a.b, a . b, t.*, a::int, count(*), f (x), 'a'||'b', x'ff', N'a', a[1], b [2]", 'postgres'), "SELECT a.b, a.b, t.*, a::INT, count(*), f (x), 'a' || 'b', x'ff', N'a', a[1], b [2]", 'dots and casts without spaces; prefixes stay on their strings; brackets as typed');
    t.eq(one('select @x:=@x+1, @@global.max, `a`.`b`, _utf8mb4\'x\', root@localhost from t', 'mysql'), "SELECT @x := @x + 1, @@global.max, `a`.`b`, _utf8mb4'x', root@localhost FROM t", 'MySQL variables, introducers, user@host');
    t.eq(one('select a from t where b = any(c) and d in(1) and e not in (2) and f=some(select 1)', 'standard'), 'SELECT a FROM t WHERE b = ANY (c) AND d IN (1) AND e NOT IN (2) AND f = SOME (SELECT 1)', 'ANY / IN / SOME get a space before the bracket');
    t.eq(one('select d.x (+), a(+) from d', 'oracle'), 'SELECT d.x (+), a(+) FROM d', 'Oracle (+) keeps the spacing it came with');
    t.eq(one('select db..t.c, a.b.c.d from db..t', 'tsql'), 'SELECT db..t.c, a.b.c.d FROM db..t', 'SQL Server db..table');
    t.eq(one('for i in 1 .. 3 loop null; end loop', 'oracle'), 'FOR i IN 1 .. 3 LOOP NULL; END LOOP', 'PL/SQL range');
    t.eq(one('select a<=>b, a//b, a<=>-1', 'tsql'), 'SELECT a <=> b, a // b, a <=> -1', 'operators the dialect does not know stay glued as typed (they may be one operator elsewhere)');
    t.eq(one("select {d '2026-01-01'}, {fn now()}", 'standard'), "SELECT {d '2026-01-01'}, {fn now()}", 'ODBC escapes');
    t.eq(one("select a from t where b = %s and c in (%s, %s) and d like %(pat)s limit %s", 'standard'), 'SELECT a FROM t WHERE b = %s AND c IN (%s, %s) AND d LIKE %(pat)s LIMIT %s', 'Python parameters stay whole');
  }

  // ---- 8. faults of the engine this one replaced (sqlformat 0.5.0)
  {
    t.eq(text('select [from], [my col], [select] from [order by]', { dialect: 'tsql' }), 'SELECT\n  [from],\n  [my col],\n  [select]\nFROM\n  [order by]', '[bracketed names] are left alone (the crate broke lines inside them and upper-cased their words)');
    t.eq(text('select 0x1F, 1_000, 1E+2, 1.5e-3', { inline: true }), 'SELECT 0x1F, 1_000, 1E+2, 1.5e-3', 'numbers stay whole (0x1F became “0 x1F”, 1_000 “1 _000”)');
    t.eq(text("select a from t where b like '%\\_%' escape '\\' and c = 'x  y'", { inline: true, dialect: 'tsql' }), "SELECT a FROM t WHERE b LIKE '%\\_%' ESCAPE '\\' AND c = 'x  y'", "'\\' is a whole string in standard SQL (the crate read on, into the text after it)");
    t.eq(text("select $$a  b; select$$, $x$ c   d $x$ from t", { inline: true, dialect: 'postgres' }), 'SELECT $$a  b; select$$, $x$ c   d $x$ FROM t', 'dollar-quoted text is not reformatted');
    t.eq(text('if @@trancount > 0 select * from #temp where a #> 1', { inline: true, dialect: 'tsql' }).replace(/\n/g, ' '), 'IF @@trancount > 0 SELECT * FROM #temp WHERE a #> 1', '@@variables and #temp names stay whole');
    t.eq(text("select a #> '{b}', a #>> '{c}' from t", { inline: true, dialect: 'postgres' }), "SELECT a #> '{b}', a #>> '{c}' FROM t", 'PostgreSQL #> is an operator, not the start of a comment');
    t.eq(text('select 1 /* a /* b */ c */ + 2', { inline: true, dialect: 'postgres' }), 'SELECT 1 /* a /* b */ c */ + 2', 'nested comments');
    t.eq(text('create or replace view v as select 1; grant select, insert on t to u; select a from t natural join u', { inline: true }), 'CREATE OR REPLACE VIEW v AS SELECT 1;\nGRANT SELECT, INSERT ON t TO u;\nSELECT a FROM t NATURAL JOIN u', 'CREATE OR REPLACE, GRANT and NATURAL JOIN are phrases');
    t.eq(text('grant select, insert on t to u'), 'GRANT SELECT, INSERT ON t TO u', '… GRANT is not laid out as a query');
    t.eq(text('select a, -- one\n b from t'), 'SELECT\n  a, -- one\n  b\nFROM\n  t', 'a comment after a comma stays on the line of what it describes');
    t.eq(text('select a -- one\n, b from t'), 'SELECT\n  a, -- one\n  b\nFROM\n  t', 'a comma that follows a comment moves in front of it (the crate left it alone on a line)');
    t.eq(text('select a --one\n, b from t', { dialect: 'mysql' }), 'SELECT\n  a --one\n  ,\n  b\nFROM\n  t', '… but not across “--one”: without the space MySQL reads that as code');
  }

  // ---- 9. statements and blocks
  {
    t.eq(text("DECLARE @x INT = 5\nSET @x += 1\nSELECT @x\nGO\nEXEC p @a = 1"), 'DECLARE @x INT = 5\nSET @x += 1\nSELECT\n  @x\nGO\nEXEC p @a = 1', 'a SQL Server script without semicolons: every statement on its own line, GO alone on its line');
    t.eq(fmt("DECLARE @x INT = 5\nSET @x += 1").dialect, 'tsql', '… read as SQL Server');
    t.eq(text('select 1 select 2 update t set a = 1 delete from t insert into t values (1)'), 'SELECT\n  1\nSELECT\n  2\nUPDATE\n  t\nSET\n  a = 1\nDELETE FROM\n  t\nINSERT INTO\n  t\nVALUES\n  (1)', 'statements that follow one another without a semicolon are told apart');
    t.eq(text('insert into t (a) select b from u union select c from v'), 'INSERT INTO\n  t (a)\nSELECT\n  b\nFROM\n  u\nUNION\nSELECT\n  c\nFROM\n  v', '… INSERT … SELECT and UNION SELECT are one statement');
    t.eq(text("create trigger tr after insert on orders for each row when new.total > 1000 begin update c set n = 'vip' where id = new.cid; insert into log values (new.id); end", { dialect: 'sqlite' }),
      "CREATE TRIGGER tr AFTER INSERT ON orders FOR EACH ROW WHEN new.total > 1000\nBEGIN\n  UPDATE\n    c\n  SET\n    n = 'vip'\n  WHERE\n    id = new.cid;\n  INSERT INTO\n    log\n  VALUES\n    (new.id);\nEND", 'a trigger: its statements indented between BEGIN and END');
    t.eq(text("create procedure p (in a int, out b varchar(10)) begin declare x int default 0; if a > 0 then set b = 'pos'; elseif a = 0 then set b = 'zero'; else set b = 'neg'; end if; while x < a do set x = x + 1; end while; end", { dialect: 'mysql' }),
      "CREATE PROCEDURE p (IN a INT, OUT b VARCHAR(10))\nBEGIN\n  DECLARE x INT DEFAULT 0;\n  IF a > 0 THEN\n    SET b = 'pos';\n  ELSEIF a = 0 THEN\n    SET b = 'zero';\n  ELSE\n    SET b = 'neg';\n  END IF;\n  WHILE x < a DO\n    SET x = x + 1;\n  END WHILE;\nEND", 'a MySQL procedure: IF / ELSEIF / ELSE / END IF and WHILE … DO … END WHILE');
    t.eq(text("begin try begin transaction; update t set a = 1; commit transaction; end try begin catch if @@trancount > 0 rollback transaction; throw; end catch", { dialect: 'tsql' }),
      'BEGIN TRY\n  BEGIN TRANSACTION;\n  UPDATE\n    t\n  SET\n    a = 1;\n  COMMIT TRANSACTION;\nEND TRY\nBEGIN CATCH\n  IF @@trancount > 0\n  ROLLBACK TRANSACTION;\n  THROW;\nEND CATCH', 'SQL Server TRY / CATCH; BEGIN TRANSACTION is a statement, not a block');
    t.eq(text('begin; update t set a = 1; commit; end'), 'BEGIN;\nUPDATE\n  t\nSET\n  a = 1;\nCOMMIT;\nEND', 'BEGIN; … COMMIT; is a transaction: nothing is indented');
    t.eq(text('select case when a then 1 end, b from t; select 2'), 'SELECT\n  CASE WHEN a THEN 1 END,\n  b\nFROM\n  t;\nSELECT\n  2', 'the END of a CASE closes no block');
    t.eq(text("create function f(i integer) returns integer language plpgsql as $f$ begin return i + 1; end; $f$", { dialect: 'postgres' }), 'CREATE FUNCTION f(i INTEGER) RETURNS INTEGER LANGUAGE plpgsql AS $f$ begin return i + 1; end; $f$', 'the body of a PostgreSQL function is a string: left as it is');
  }

  // ---- 10. which dialect
  {
    const D = [
      ['postgres', "select id::text, data ->> 'a' from t where tags @> array['x']"], ['postgres', 'select $$x$$'], ['postgres', "insert into t values ($1, $2) returning id"], ['postgres', "select * from t where a ilike 'x%' limit 5"],
      ['postgres', 'create table t (id bigserial primary key, d jsonb)'], ['postgres', "select e'a\\'b'"], ['postgres', 'select distinct on (a) a, b from t'],
      ['mysql', 'select `a` from `t` limit 5, 10'], ['mysql', "select 'it\\'s'"], ['mysql', 'create table t (id int unsigned auto_increment primary key) engine = innodb'], ['mysql', 'select a from t # note\nwhere b = 1'],
      ['mysql', 'insert into t (a) values (1) on duplicate key update a = 2'], ['mysql', 'select group_concat(a separator \',\') from t'], ['mysql', 'select @n := @n + 1 from t'],
      ['sqlite', 'pragma table_info(t)'], ['sqlite', 'create table t (id integer primary key autoincrement) without rowid'], ['sqlite', "select strftime('%Y', d), typeof(x) from t"], ['sqlite', 'insert or replace into t values (?1, ?2)'],
      ['sqlite', 'select [a b], `c` from sqlite_master'],
      ['tsql', 'select top 5 [a b] from dbo.t with (nolock)'], ['tsql', 'declare @x int = 1; set @x += 1; print @x'], ['tsql', 'select * from #tmp'], ['tsql', "select isnull(a, 0), getdate() from t"], ['tsql', 'select a from t cross apply f(t.id) x'],
      ['tsql', "exec sp_executesql N'select 1'"], ['tsql', 'select @@rowcount'],
      ['oracle', 'select nvl(a, 0) from dual where rownum <= 5'], ['oracle', "select q'[it's]' from dual"], ['oracle', 'select a from t, u where t.id = u.id (+)'], ['oracle', 'create table t (n varchar2(10), m number(5))'],
      ['oracle', 'select level from t connect by prior id = pid'], ['oracle', 'select a from t minus select a from u'],
      ['standard', 'select a, b from t where c = 1 order by a'], ['standard', "update t set a = 'x' where id = 5"], ['standard', 'create table t (id int primary key, name varchar(10))'], ['standard', ''],
    ];
    const off = D.filter(([d, sql]) => fmt(sql).dialect !== d).map(([d, sql]) => `${short(sql)} read as ${fmt(sql).dialect}, is ${d}`);
    t.ok(!off.length, `${D.length} statements are read as the dialect they are written in ${off.slice(0, 4).join(' | ')}`);
    t.ok(fmt("select 'C:\\dir\\' from `t`").dialect !== 'mysql' && text("select 'C:\\dir\\' from `t`", { inline: true }) === "SELECT 'C:\\dir\\' FROM `t`", 'backticks but a string that ends in a backslash: not read as MySQL (there the string would never end)');
    t.eq(text('select [from], `where` from "select"'), 'SELECT\n  [from],\n  `where`\nFROM\n  "select"', 'a detected dialect never costs a name: [from] stays [from]');
    t.eq(fmt('select 1', { dialect: 'oracle' }).dialect, 'oracle', 'a chosen dialect is used');
    // the dialect decides how the text is read
    t.eq(text("select 'a\\' -- b' from t", { inline: true, dialect: 'mysql' }), "SELECT 'a\\' -- b' FROM t", "MySQL: 'a\\' -- b' is one string");
    t.eq(text("select 'a\\' -- b' from t", { inline: true, dialect: 'postgres' }), "SELECT 'a\\' -- b' from t", "PostgreSQL: the string ends at the backslash, the rest of the line is a comment");
    t.eq(text('select a from t where [x] = 1', { inline: true, dialect: 'tsql' }), 'SELECT a FROM t WHERE [x] = 1', 'SQL Server: [x] is a name');
    t.eq(text('select a from t where b[x] = 1', { inline: true, dialect: 'postgres' }), 'SELECT a FROM t WHERE b[x] = 1', 'PostgreSQL: b[x] is a subscript');
  }

  // ---- 11. what cannot be right is said, and nothing is lost
  {
    const w = (sql, o) => fmt(sql, o).warn.join(' | ');
    t.eq(w("select 1;\nselect 'abc\nfrom t"), 'The text in quotes that starts on line 2 is never closed.', 'a string that never ends');
    t.eq(w('select 1 /* note\nfrom t'), 'The comment that starts on line 1 is never closed (*/ is missing).', 'a comment that never ends');
    t.eq(w('select "abc\nfrom t'), 'The quoted name that starts on line 1 is never closed.', 'a quoted name that never ends');
    t.eq(w('select (a + b\nfrom t'), 'The bracket opened on line 1 is never closed.', 'a bracket that is never closed');
    t.eq(w('select a + b)\nfrom t;\nselect 2)'), 'The closing bracket on line 1 has no opening bracket. | The closing bracket on line 3 has no opening bracket.', 'closing brackets without an opening one');
    t.eq(w('select 1'), '', 'no warning for sound text');
    const cut = "select a from t where x = 'unterminated   text  ";
    t.ok(fmt(cut).text.endsWith("'unterminated   text  ") && !fmt(cut).kept, 'the unfinished string is kept to the last blank');
    t.ok([...'()[]{}\'"`;,.-/*#$@:?%\\'].every((c) => { const r = fmt(c); return !r.kept && r.text.trim() === c; }), 'a lone sign of any kind comes back as it is');
  }

  // ---- 12. hostile and broken input: never a trap, never a fallback, always stable
  {
    let seed = 20261119; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const PIECES = ['-- note\n', '-- a', '/* b */', '/* c\n d */', '\n\n', '\n', '#x\n', 'select', 'from', 'where', '(', ')', ',', ';', "'", '"', '`', '[', ']', '--', '/*', '*/', '#', '$$', '$1', ':x', '@v', '@@v', '::', 'case', 'when', 'then', 'else', 'end', 'begin', 'if', 'loop', 'and', 'or', 'between', 'join', 'on', 'union', 'insert into', 'values', 'update', 'set', 'delete', 'create table', 'as', 'with', 'x', '1', '1.5e3', '.', '..', '+', '-', '*', '/', '%s', '{{ y }}', '\\', ' ', '\t', 'नाम', '😀', "q'[", "e'", "N'", '0x', '<<', '>>', '(+)', '?', '=', '<', '>', '!', '~', '|', '&', '^', 'over', 'partition by', 'order by', 'group by', 'limit', 'offset', 'returning', 'go', 'declare', 'exec', 'merge', 'using', 'matched', 'not', 'null', 'in', 'is', 'like', 'distinct', 'top', 'alter table', 'add', 'drop', 'index', 'view', 'trigger', 'for each row', 'explain', 'grant', 'to', 'cast', 'interval', 'date'];
    const ALL = DIALECTS.flatMap((d) => C[d]), DS = ['auto', 'standard', ...DIALECTS], OS = [{}, { inline: true }, { keywords: 'lower', indent: 0, lines: 3 }, { keywords: 'keep' }];
    let n = 0; const bad = [];
    const check = (sql) => {
      const dialect = DS[rnd(DS.length)], o = OS[rnd(OS.length)]; n++;
      let r; try { r = fmt(sql, { ...o, dialect }); } catch (e) { bad.push(`trap on ${short(sql)}`); return; }
      if (r.kept) { bad.push(`${dialect}: left as it was ${short(sql)}`); return; }
      const why = differs(sql, r.text, r.dialect, true);
      // (the reader follows MySQL for “--x”; where the two readings part, the text is unchanged anyway)
      if (why && o.keywords === 'keep' && !(r.dialect === 'mysql' && /--\S/.test(sql))) bad.push(`${r.dialect}: ${why} in ${short(sql)}`);
      if (fmt(r.text, { ...o, dialect: r.dialect }).text !== r.text) bad.push(`${r.dialect} ${JSON.stringify(o)}: not stable ${short(sql)}`);
    };
    for (const sql of ALL) { for (let k = 0; k < 4; k++) { const a = rnd(sql.length + 1); check(sql.slice(0, a)); check(sql.slice(a)); } check(sql + (rnd(2) ? ' ' : '\n') + ALL[rnd(ALL.length)]); }
    for (let k = 0; k < 2500; k++) { let s = ''; const len = 1 + rnd(25); for (let j = 0; j < len; j++) s += PIECES[rnd(PIECES.length)] + (rnd(3) ? ' ' : ''); check(s); }
    for (let k = 0; k < 300; k++) { let s = ''; const len = rnd(60); for (let j = 0; j < len; j++) s += String.fromCharCode(rnd(128)); check(s); }
    t.ok(!bad.length && n > 4000, `${n} broken texts (statements cut in two, two statements run together, random pieces of SQL, random characters) in random dialects and options: no trap, none left as it was, none unstable, and in “as typed” mode the reader finds every token unchanged ${bad.slice(0, 4).join(' | ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`);
    const deep = fmt('select ' + '('.repeat(20000) + '1');
    t.ok(!deep.kept && deep.text.length < 3_000_000 && fmt(deep.text).text === deep.text, `20,000 open brackets: ${(deep.text.length / 1e6).toFixed(1)} MB out, not hundreds (lines are indented at most 50 levels), stable`);
    t.ok(!fmt('case '.repeat(5000)).kept && !fmt('begin '.repeat(5000) + 'end '.repeat(5000)).kept && !fmt('select 1 ' + 'union select 1 '.repeat(3000)).kept && !fmt("'".repeat(9999)).kept && !fmt('$a$ '.repeat(20000)).kept && !fmt('{{ '.repeat(20000)).kept && !fmt("q'".repeat(20000), { dialect: 'standard' }).kept, '5,000 CASE, BEGIN … END, 3,000 UNION, 9,999 quotes, 20,000 unfinished $a$ / {{ / q\'');
    const big = ALL.join(';\n').repeat(40), t0 = Date.now(), r = fmt(big), ms = Date.now() - t0;
    t.ok(!r.kept && ms < 4000 && r.text.length > big.length * 0.8, `${(big.length / 1e6).toFixed(1)} MB of SQL (${ALL.length * 40} statements) in ${ms} ms`);
  }
};
