// SQL Formatter (#/sqlfmt, PC only).
// What the tab shows is read by three tools that share no code with it (tests/lib/sqlfmt_check.py):
//   · the NATIVE SQLite (Python's sqlite3) runs the whole SQLite corpus as typed and as the tab formatted it:
//     same rows, same column names, same errors, same database afterwards;
//   · sqlglot parses every dialect's corpus (PostgreSQL, MySQL, SQLite, SQL Server, Oracle) before and after:
//     the same statements;
//   · sqlparse finds the same tokens and the same comments.
// For three layouts each (default, lower case on one line, tabs). Then the tab itself: the sample, every control,
// what the text was read as, warnings, files in and out, copy, a large script, the phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue, until, notes, hookClipboard, copied } from './_devdata.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const C = JSON.parse(readFileSync(new URL('../fixtures/sqlfmt/corpus.json', import.meta.url), 'utf8'));
const L = JSON.parse(readFileSync(new URL('../fixtures/sqlfmt/layout.json', import.meta.url), 'utf8'));
const CHECK = fileURLToPath(new URL('../lib/sqlfmt_check.py', import.meta.url));
const LABEL = { sqlite: 'SQLite', postgres: 'PostgreSQL', mysql: 'MySQL / MariaDB', tsql: 'SQL Server', oracle: 'Oracle', standard: 'Standard SQL', auto: 'Auto-detect' };

export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/sqlfmt`);
  const src = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1); await src.waitFor();
  const dialect = page.locator('select');
  /** Puts `sql` in the box and waits until the result belongs to it: the note says what it was read as. */
  const fmt = async (sql) => {
    await page.evaluate(() => { document.querySelectorAll('textarea')[1].value = '\u0000'; });
    await setValue(src, sql);
    await until(page, () => document.querySelectorAll('textarea')[1].value !== '\u0000');
    return out.inputValue();
  };
  const radio = (name) => page.getByRole('radio', { name, exact: true }).click();
  const sw = (text) => page.locator('label.switch', { hasText: text }).click();
  const settle = () => page.waitForTimeout(120);

  // ---- the sample, as the tab opens
  await until(page, () => document.querySelectorAll('textarea')[1].value.includes('SELECT'));
  ok((await out.inputValue()) === "SELECT\n  o.id,\n  c.name,\n  sum(i.qty * i.price) AS total\nFROM\n  orders o\n  JOIN customers c ON c.id = o.customer_id\n  LEFT JOIN items i ON i.order_id = o.id\nWHERE\n  o.created_at >= '2026-01-01'\n  AND c.city IN ('Pune', 'Mumbai')\nGROUP BY\n  o.id,\n  c.name\nHAVING\n  sum(i.qty) > 2\nORDER BY\n  total DESC\nLIMIT\n  10;\nUPDATE\n  stock\nSET\n  qty = qty - 1\nWHERE\n  sku = 'A-1';", 'the sample query is formatted when the tab opens');
  ok(/Read as Standard SQL \(detected/.test(await notes(page)), 'the note says what the text was read as');
  ok(await fmt('select a, b from t where x = 1 and y > 2 order by a') === 'SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y > 2\nORDER BY\n  a', 'known layout');

  // ---- the corpus through the tab, read by the native SQLite, sqlglot and sqlparse
  {
    // The statements of a dialect go through the tab as one script, each behind a comment that marks its place:
    // comments come out as they went in, so the result can be cut into the statements again.
    const mark = (i) => `-- ~~ statement ${i} ~~`;
    const cases = []; let cut = 0;
    const LAYOUTS = [['default', async () => {}], ['lower case, one line', async () => { await radio('lower'); await sw('One line'); }], ['tabs, as typed', async () => { await sw('One line'); await radio('As typed'); await radio('Tab'); }]];
    for (const [name, set] of LAYOUTS) {
      await set(); await settle();
      for (const d of ['sqlite', 'postgres', 'mysql', 'tsql', 'oracle']) {
        await dialect.selectOption(d);
        // (a line break in front of every “;”: a statement may end in a “--” comment)
        const f = await fmt(C[d].map((sql, i) => `${mark(i)}\n${sql}\n;\n`).join(''));
        const parts = f.split(/^-- ~~ statement \d+ ~~$/m).slice(1).map((x) => x.trim().replace(/;$/, '').trim());
        if (parts.length === C[d].length) cut++;
        parts.forEach((x, i) => cases.push({ d, o: name, sql: C[d][i], f: x }));
      }
    }
    await radio('UPPER'); await radio('2 spaces'); await dialect.selectOption('auto'); await settle();
    ok(cut === 15 && cases.length === 3 * 141 && cases.every((c) => c.f.length > c.sql.length * 0.6), 'the tab formatted the corpus of 5 dialects in 3 layouts (141 statements each time), and the result can be cut into its statements again at the marker comments');
    ok(cases.slice(0, 141).every((c, i) => c.f === [...L.corpus.sqlite, ...L.corpus.postgres, ...L.corpus.mysql, ...L.corpus.tsql, ...L.corpus.oracle][i]), 'in the default layout every statement comes out as the engine alone lays it out (the recorded layout)');
    const one = cases.slice(141, 282), tabs = cases.slice(282);
    ok(one.filter((c) => !c.f.includes('\n')).length > 110 && one.every((c) => !/\b(SELECT|FROM|WHERE)\b/.test(c.f.replace(/'[^']*'|"[^"]*"|\[[^\]]*\]|`[^`]*`|--[^\n]*|\/\*[\s\S]*?\*\//g, ''))), 'lower case on one line: most statements are a single line, none holds an upper-case SELECT / FROM / WHERE');
    ok(tabs.filter((c) => /\n\t\S/.test(c.f)).length > 100 && tabs.every((c) => !/\n {2}\S/.test(c.f.replace(/'[^']*'|\/\*[\s\S]*?\*\/|\$\w*\$[\s\S]*?\$\w*\$/g, ''))), 'tabs: lines are indented with tabs, never with spaces');
    let r = null;
    try { r = JSON.parse(execFileSync('python3', [CHECK], { input: JSON.stringify({ setup: C.sqlite_setup, cases }), maxBuffer: 1 << 26 }).toString()); } catch (e) { info(`python3 could not run the checker — the three independent readers were skipped (${String(e.message).slice(0, 120)})`); }
    if (r) {
      ok(r.bad.length === 0, `no reader finds a difference ${r.bad.slice(0, 3).join(' | ').slice(0, 900)}`);
      ok(r.ran['sqlite statements'] >= 3 * 53 && r.ran['sqlite with rows'] >= 3 * 35, `the native SQLite ${r.have.sqlite} ran ${r.ran['sqlite statements']} statements as typed and as formatted (${r.ran['sqlite with rows']} return rows): same rows, column names, errors and database`);
      if (r.have.sqlglot) ok(r.ran['sqlglot statements'] >= 3 * 130 && r.ran['sqlglot skipped'] <= 3 * 20, `sqlglot ${r.have.sqlglot} parsed ${r.ran['sqlglot statements']} statements of the 5 dialects to the same trees (${r.ran['sqlglot skipped']} it cannot parse at all)`);
      else info('sqlglot is not installed (pip install sqlglot) — its check was skipped');
      if (r.have.sqlparse) ok(r.ran['sqlparse statements'] >= 3 * 115, `sqlparse ${r.have.sqlparse} found the same tokens and comments in ${r.ran['sqlparse statements']} statements (${r.ran['sqlparse skipped']} hold text its one-for-all lexer misreads: backslashes in strings, $$, q'[…]', #)`);
      else info('sqlparse is not installed (pip install sqlparse) — its check was skipped');
    }
  }

  // ---- the controls
  const q = "select o.id, c.name as \"Customer Name\", sum(i.qty * i.price) total from orders o join customers c on c.id = o.customer_id left join items i on i.order_id = o.id where c.city in ('Pune', 'mumbai') -- city filter\n group by o.id, c.name having sum(i.qty) > 2 order by total desc limit 10";
  const f1 = await fmt(q);
  ok(f1.includes("'mumbai'") && f1.includes('"Customer Name"') && f1.includes('-- city filter\nGROUP BY'), 'strings, quoted names and comments are kept as written; the comment keeps its line');
  ok(await fmt(f1) === f1, 'formatting the result again changes nothing');
  await radio('4 spaces'); await settle(); ok((await out.inputValue()).includes('\n    o.id,'), '4-space indent');
  await radio('Tab'); await settle(); ok((await out.inputValue()).includes('\n\to.id,'), 'tab indent');
  await radio('2 spaces');
  await radio('lower'); await settle(); ok(/^select\n {2}o\.id,/.test(await out.inputValue()) && /\nfrom\n/.test(await out.inputValue()), 'keywords in lower case');
  await setValue(src, 'Select A From T Where B Is Null'); await radio('As typed'); await settle(); ok(await out.inputValue() === 'Select\n  A\nFrom\n  T\nWhere\n  B Is Null', 'keywords as typed');
  await radio('UPPER'); await settle(); ok(await out.inputValue() === 'SELECT\n  A\nFROM\n  T\nWHERE\n  B IS NULL', 'keywords in upper case; names untouched');
  await sw('One line'); await settle();
  ok(await fmt('select a from t where b = 1; select 2 -- two\n; select 3') === 'SELECT a FROM t WHERE b = 1;\nSELECT 2 -- two\n;\nSELECT 3', 'one line per statement; a “--” comment still ends its line');
  await sw('One line'); await settle();
  ok(/;\nUPDATE/.test(await fmt('select 1; update t set a = 2')), 'no blank line between statements');
  await radio('1'); await settle(); ok(/;\n\nUPDATE/.test(await out.inputValue()), 'one blank line between statements');
  await radio('2'); await settle(); ok(/;\n\n\nUPDATE/.test(await out.inputValue()), 'two blank lines');
  await radio('0'); await settle();

  // ---- names that are keywords elsewhere
  ok(await fmt('select status, type, key, level, date, end, first from events where status = 1 order by key') === 'SELECT\n  status,\n  type,\n  key,\n  level,\n  date,\n  end,\n  first\nFROM\n  events\nWHERE\n  status = 1\nORDER BY\n  key', 'columns called status, type, key, level, date, end, first keep their case');

  // ---- dialects: detected, chosen, and what difference they make
  const readAs = async () => (/Read as ([^.(]+?)( \(detected|\.)/.exec(await notes(page)) || [])[1];
  await fmt('select top 5 [my col] from dbo.t with (nolock)'); ok(await readAs() === 'SQL Server', 'SQL Server is detected');
  await fmt("select id::text, data ->> 'a' from t"); ok(await readAs() === 'PostgreSQL', 'PostgreSQL is detected');
  await fmt("select `a`, 'it\\'s' from `t` limit 5, 10"); ok(await readAs() === 'MySQL / MariaDB', 'MySQL is detected');
  await fmt('pragma table_info(t)'); ok(await readAs() === 'SQLite', 'SQLite is detected');
  await fmt('select nvl(a, 0) from dual where rownum <= 5'); ok(await readAs() === 'Oracle', 'Oracle is detected');
  await fmt('select a from t'); ok(await readAs() === 'Standard SQL' && /detected — choose the dialect above/.test(await notes(page)), 'plain SQL is read as standard SQL, and the note says it was detected');
  const tricky = "select 'a\\' -- b' from t";
  await dialect.selectOption('mysql'); ok(await fmt(tricky) === "SELECT\n  'a\\' -- b'\nFROM\n  t" && await readAs() === 'MySQL / MariaDB' && !/detected/.test(await notes(page)), "MySQL chosen: 'a\\' -- b' is one string");
  await dialect.selectOption('postgres'); await settle(); ok(await out.inputValue() === "SELECT\n  'a\\' -- b' from t" && await readAs() === 'PostgreSQL', 'PostgreSQL chosen: the string ends at the backslash and the rest is a comment');
  await dialect.selectOption('tsql'); ok(await fmt('select [from], [my col] from [order by]') === 'SELECT\n  [from],\n  [my col]\nFROM\n  [order by]', 'SQL Server: [bracketed names] are left alone');
  ok((await dialect.locator('option').allTextContents()).join() === Object.values({ a: LABEL.auto, b: LABEL.standard, c: LABEL.postgres, d: LABEL.mysql, e: LABEL.sqlite, f: LABEL.tsql, g: LABEL.oracle }).join(), 'the dialects on offer: auto-detect, standard SQL, PostgreSQL, MySQL / MariaDB, SQLite, SQL Server, Oracle');
  await dialect.selectOption('auto');

  // ---- scripts, blocks
  ok(await fmt("DECLARE @x INT = 5\nSET @x += 1\nSELECT @x\nGO\nEXEC p @a = 1") === 'DECLARE @x INT = 5\nSET @x += 1\nSELECT\n  @x\nGO\nEXEC p @a = 1', 'a SQL Server script without semicolons');
  ok(await fmt("create trigger tr after insert on orders begin update c set n = 1 where id = new.cid; insert into log values (new.id); end") === 'CREATE TRIGGER tr AFTER INSERT ON orders\nBEGIN\n  UPDATE\n    c\n  SET\n    n = 1\n  WHERE\n    id = new.cid;\n  INSERT INTO\n    log\n  VALUES\n    (new.id);\nEND', 'a trigger: its statements indented between BEGIN and END');

  // ---- what cannot be right is said
  await fmt("select 1;\nselect 'abc\nfrom t"); ok(/The text in quotes that starts on line 2 is never closed\./.test(await notes(page, '.note-warn')) && (await out.inputValue()).endsWith("'abc\nfrom t"), 'a string that never ends: a warning, and the text is kept to its end');
  await fmt('select (a + b\nfrom t'); ok(/The bracket opened on line 1 is never closed\./.test(await notes(page, '.note-warn')), 'a bracket that is never closed');
  await fmt('select 1 /* note'); ok(/The comment that starts on line 1 is never closed/.test(await notes(page, '.note-warn')), 'a comment that never ends');
  await fmt('select 1'); ok(await page.locator('.note-warn').count() === 0, 'no warning for sound SQL');
  await setValue(src, '   '); await until(page, () => /Paste SQL to format/.test(document.body.textContent));
  ok(await out.inputValue() === '' && /Paste SQL to format/.test(await notes(page)), 'nothing typed: a hint, an empty result');
  const copyBtn = page.locator('button', { hasText: 'Copy' });   // (the box has a copy icon of its own)
  await copyBtn.click(); await until(page, () => /Nothing to copy yet/.test(document.querySelector('.toasts')?.textContent ?? ''));
  ok(/Nothing to copy yet/.test(await page.locator('.toasts').textContent()), 'Copy with nothing to copy says so');

  // ---- files in, files out, copy
  const f = join(tmp, 'report q.sql'); writeFileSync(f, 'SELECT * FROM t -- all\n;select 2');
  await page.locator('.drop input[type=file]').setInputFiles(f);
  await until(page, () => document.querySelectorAll('textarea')[1].value.includes('SELECT\n  2'));
  ok(await out.inputValue() === 'SELECT\n  *\nFROM\n  t -- all\n;\nSELECT\n  2', `a .sql file is opened and formatted ${JSON.stringify(await out.inputValue())}`);
  const d = await download(page, () => page.getByRole('button', { name: 'Download .sql' }).click());
  ok(readFileSync(d, 'utf8') === 'SELECT\n  *\nFROM\n  t -- all\n;\nSELECT\n  2' && basename(d).endsWith('report q.formatted.sql'), `the download holds the formatted text and is named after the file (${basename(d).replace(/^\d+-/, '')})`);
  await hookClipboard(page); await copyBtn.click(); await page.waitForTimeout(100);
  ok((await copied(page)).at(-1) === 'SELECT\n  *\nFROM\n  t -- all\n;\nSELECT\n  2', 'Copy gives the formatted text');

  // ---- a large script: all of it is formatted, the box shows the first million characters
  const big = Array.from({ length: 30000 }, (_, i) => `insert into log (id, at, msg) values (${i}, '2026-11-19', 'entry number ${i}')`).join(';\n');
  const t0 = Date.now(); const shown = await fmt(big), ms = Date.now() - t0;
  ok(shown.length === 1_000_000 && /The first 10,00,000 characters are shown; Copy and Download give all [\d,]+\./.test(await notes(page)), `a ${(big.length / 1e6).toFixed(1)} MB script (30,000 statements) is formatted in ${ms} ms; the box shows the first 10,00,000 characters and says so`);
  await copyBtn.click(); await page.waitForTimeout(200);
  const all = (await copied(page)).at(-1);
  ok(all.length > 2_500_000 && all.endsWith("(29999, '2026-11-19', 'entry number 29999')") && all.split(';\n').length === 30000, 'Copy gives all 30,000 statements');
  await page.locator('.outbox button').click(); await page.waitForTimeout(200);
  ok((await copied(page)).at(-1) === all, '… and so does the copy icon in the box (it used to give only what the box shows)');

  const errs = page.errors.filter((e) => !/Nothing to copy yet/.test(e));   // the empty Copy above: shown as a toast and logged
  ok(!errs.length, `no page errors ${errs.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'sqlfmt');
};
