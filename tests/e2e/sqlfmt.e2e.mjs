// SQL Formatter (#/sqlfmt, PC only): known formatting of a query (clauses on their own lines, indented columns,
// upper-case keywords), formatting keeps every token (compared with the input, whitespace/case-insensitively), is
// idempotent, sqlite3 runs the formatted SQL with the same result as the original, options (indent, tab, lower case,
// one line, blank lines), strings and comments untouched, file open, download, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/sqlfmt`);
  const src = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1); await src.waitFor();
  const fmt = async (s) => { await src.fill(s); await page.waitForTimeout(250); return out.inputValue(); };
  ok(await fmt('select a, b from t where x = 1 and y > 2 order by a') === 'SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y > 2\nORDER BY\n  a', 'known layout');
  const q = "select o.id, c.name as \"Customer Name\", sum(i.qty * i.price) total from orders o join customers c on c.id = o.customer_id left join items i on i.order_id = o.id where c.city in ('Pune', 'mumbai') -- city filter\n group by o.id, c.name having sum(i.qty) > 2 order by total desc limit 10";
  const f1 = await fmt(q); const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, '').toLowerCase();
  ok(norm(f1) === norm(q), 'no token lost or changed (ignoring layout and keyword case)');
  ok(f1.includes("'mumbai'") && f1.includes('"Customer Name"') && f1.includes('-- city filter'), 'strings, quoted names and comments kept as written');
  ok(await fmt(f1) === f1, 'formatting is idempotent');
  try {
    const db = join(tmp, 's.db'), mk = "create table orders(id, customer_id); create table customers(id, name, city); create table items(order_id, qty, price); insert into customers values (1,'Asha','Pune'),(2,'Ravi','mumbai'); insert into orders values (10,1),(11,2),(12,1); insert into items values (10,2,5.5),(10,1,3),(11,4,1),(12,1,9);";
    const run = (sql) => execFileSync('python3', ['-c', 'import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute(sys.stdin.read()).fetchall()))', db], { input: sql }).toString();
    execFileSync('python3', ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.commit()', db], { input: mk });
    const a = run(q), b = run(f1);
    ok(a === b && a.length > 0, `SQLite (Python sqlite3) gives the same rows for the original and the formatted query (${a.trim()})`);
  } catch { info('Python sqlite3 failed — execution check skipped'); }
  await page.getByRole('radio', { name: '4 spaces' }).click(); ok((await out.inputValue()).includes('\n    o.id,'), '4-space indent');
  await page.getByRole('radio', { name: 'Tab' }).click(); ok((await out.inputValue()).includes('\n\to.id,'), 'tab indent');
  await page.locator('label.switch', { hasText: 'UPPER-CASE' }).click(); await page.waitForTimeout(200); ok(/\nfrom\n/.test(await out.inputValue()), 'keywords not upper-cased when switched off');
  await page.locator('label.switch', { hasText: 'One line' }).click(); await page.waitForTimeout(200); ok(!(await fmt('select a from t where b = 1')).includes('\n'), 'one line');
  await page.locator('label.switch', { hasText: 'One line' }).click(); await page.locator('label.switch', { hasText: 'UPPER-CASE' }).click();
  await page.getByRole('radio', { name: '2 spaces' }).click(); await page.getByRole('radio', { name: '1', exact: true }).click();
  ok(/;\n\nUPDATE/.test(await fmt('select 1; update t set a = 2')), 'one blank line between statements');
  const f = join(tmp, 'q.sql'); writeFileSync(f, 'SELECT * FROM t'); await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(250);
  ok(await out.inputValue() === 'SELECT\n  *\nFROM\n  t', '.sql file opened');
  const d = await download(page, () => page.getByRole('button', { name: 'Download .sql' }).click()); ok(readFileSync(d, 'utf8') === 'SELECT\n  *\nFROM\n  t', 'download .sql');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'sqlfmt');
};
