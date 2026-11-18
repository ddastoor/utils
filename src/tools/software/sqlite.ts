// SQLite Playground (PC only): the official SQLite wasm build in a worker (src/workers/sqlite.worker.ts), driven by
// src/lib/sqlite-engine.ts. Open a .db / .sqlite file, import CSV / TSV / Excel as tables (sheet.wasm reads them and
// says which column type loses nothing), run SQL, export results (all rows) and the database.
// Every action reports in the status line — nothing is left to a raw error toast — and replacing a database that
// holds something can be undone once ("Bring back the previous database").
import { h, card, field, textarea, input, select, clear, note, button, filePicker, readBytes, downloadBlob, baseName, fmtBytes, type Mount } from '../../ui';
import { sql } from '../../lib/sqlite-client';
import { quoteId, type Cell, type RunResult, type SchemaObject } from '../../lib/sqlite-engine';

const SAMPLE = `CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT, joined DATE);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), placed DATE, total REAL);
INSERT INTO customers VALUES (1,'Asha Rao','Pune','2024-02-11'),(2,'Ravi Kumar','Mumbai','2024-05-03'),(3,'Meera Iyer','Chennai','2025-01-20'),(4,'Kabir Singh','Delhi','2025-07-08');
INSERT INTO orders VALUES (101,1,'2026-10-01',450.5),(102,1,'2026-10-15',120),(103,2,'2026-10-20',980),(104,3,'2026-11-02',60),(105,4,'2026-11-10',1500),(106,2,'2026-11-12',75.25);`;
const SAMPLE_Q = 'SELECT c.city, count(*) AS orders, round(sum(o.total), 2) AS revenue\nFROM orders o JOIN customers c ON c.id = o.customer_id\nGROUP BY c.city\nORDER BY revenue DESC;';
const n = (x: number) => x.toLocaleString('en-IN');
const plural = (x: number, word: string) => `${n(x)} ${word}${x === 1 ? '' : 's'}`;

export const sqlite: Mount = (root) => {
  let opened = false, busy = false, fileName = 'database.sqlite';
  let undo: { bytes: Uint8Array; name: string } | null = null;
  const ed = textarea({ rows: 8, mono: true, value: SAMPLE_Q });
  ed.setAttribute('aria-label', 'SQL'); ed.spellcheck = false;
  const out = h('div', { class: 'sql-out' }), schemaBox = h('div', { class: 'sql-schema' }), status = h('div', { class: 'sql-status', 'aria-live': 'polite' });
  const tname = input({ placeholder: 'the file’s name', attrs: { class: 'input mono', 'aria-label': 'Table name for imports' } });
  const limit = select<string>([['10', '10 seconds'], ['30', '30 seconds'], ['120', '2 minutes'], ['600', '10 minutes']], '30');
  limit.setAttribute('aria-label', 'Time limit for a run');
  const say = (text: string | Node | Array<string | Node>, kind: 'ok' | 'err' | 'info' | 'warn' = 'ok') => { clear(status).append(note(text as any, kind)); };
  /** One action at a time; whatever goes wrong is said in the status line. */
  const guard = async (fn: () => Promise<void>) => {
    if (busy) { say('SQLite is still busy with the last request — wait for it to finish (a statement is stopped at the time limit).', 'warn'); return; }
    busy = true; root.classList.add('sql-busy');
    try { await fn(); } catch (e: any) { say(String(e?.message || e), 'err'); } finally { busy = false; root.classList.remove('sql-busy'); }
  };
  const ensure = async () => { if (!opened) { await sql('open'); opened = true; } };

  const refreshSchema = async () => {
    const s = await sql<SchemaObject[]>('schema');
    const full = (o: SchemaObject) => (o.schema === 'main' ? quoteId(o.name) : `${quoteId(o.schema)}.${quoteId(o.name)}`);
    clear(schemaBox).append(...(s.length ? s.map((o) => h('details', { open: s.length < 6 },
      h('summary', null, h('b', null, o.schema === 'main' ? o.name : `${o.schema}.${o.name}`), h('span', { class: 'muted' }, ` ${o.type === 'virtual' ? 'virtual table' : o.type}${o.count != null ? ` · ${plural(o.count, 'row')}` : ''}`)),
      o.error ? h('div', { class: 'sql-cols sql-bad' }, `Cannot be read here: ${o.error}.`) : h('div', { class: 'mono sql-cols' }, o.columns.map((c) => h('div', null, `${c.name} ${c.type || ''}${c.pk ? ' 🔑' : ''}`))),
      o.indexes.length ? h('div', { class: 'sql-cols' }, `${o.indexes.length === 1 ? 'Index' : 'Indexes'}: ${o.indexes.join(', ')}`) : null,
      o.triggers.length ? h('div', { class: 'sql-cols' }, `${o.triggers.length === 1 ? 'Trigger' : 'Triggers'}: ${o.triggers.join(', ')}`) : null,
      o.error ? null : button('Show rows', () => { ed.value = `SELECT * FROM ${full(o)} LIMIT 100;`; return run(); }, { small: true, title: `SELECT * FROM ${full(o)} LIMIT 100` })))
      : [note('The database is empty. Create a table, open a file or import a CSV.', 'info')]));
    return s;
  };

  const cell = (v: Cell) => {
    if (v === null) return h('td', { class: 'muted' }, 'NULL');
    if (typeof v === 'number') return h('td', { class: 'num' }, String(v));
    if (typeof v === 'string') return h('td', null, v.length > 1000 ? `${v.slice(0, 1000)}… (${n(v.length)} characters)` : v);
    if ('i' in v) return h('td', { class: 'num' }, v.i);
    if ('r' in v) return h('td', { class: 'num' }, v.r);
    return h('td', { class: 'muted mono' }, `x'${v.b}${v.n > 16 ? '…' : ''}' (${plural(v.n, 'byte')})`);
  };
  const save = (i: number, kind: 'csv' | 'json') => guard(async () => { downloadBlob(await sql<Blob>('exportResult', i, kind), `result.${kind}`); });
  const txnNote = () => note(['A transaction is open (BEGIN without COMMIT): its changes are not final. ',
    button('COMMIT', () => { ed.value = 'COMMIT;'; return run(); }, { small: true }), ' keeps them, ',
    button('ROLLBACK', () => { ed.value = 'ROLLBACK;'; return run(); }, { small: true }), ' undoes them.'], 'warn');

  /** Runs what is in the box and shows the results (inside a guard). */
  const runNow = async () => {
    await ensure();
    const res = await sql<RunResult>('exec', ed.value, { timeLimitMs: +limit.value * 1000 });
    clear(out);
    if (!res.results.length && !res.error) out.append(note('Nothing to run: the box holds no SQL statement.', 'info'));
    res.results.forEach((r, i) => out.append(card(null,
      h('div', { class: 'muted mono sql-head' }, r.sql.length > 160 ? `${r.sql.slice(0, 160)}…` : r.sql),
      r.columns.length ? [
        h('div', { class: 'scroll-x sql-result' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, r.columns.map((c) => h('th', null, c)))), h('tbody', null, r.rows.map((row) => h('tr', null, row.map(cell)))))),
        h('div', { class: 'muted sql-foot' }, `${plural(r.total, 'row')}${r.total > r.rows.length ? ` (the first ${n(r.rows.length)} are shown)` : ''}${r.dml ? ` · ${plural(r.changed, 'row')} changed` : ''} · ${r.ms.toFixed(1)} ms${r.total > r.kept ? ` · CSV and JSON hold the first ${n(r.kept)} rows` : ''}`),
        h('div', { class: 'row' }, button('CSV', () => save(i, 'csv'), { small: true, icon: 'Download', title: r.total > r.rows.length ? `All ${n(r.kept)} rows as CSV` : 'This result as CSV' }), button('JSON', () => save(i, 'json'), { small: true, icon: 'Download', title: r.total > r.rows.length ? `All ${n(r.kept)} rows as JSON` : 'This result as JSON' }))]
        : h('div', { class: 'muted sql-foot' }, `OK${r.dml ? ` · ${plural(r.changed, 'row')} changed` : ''} · ${r.ms.toFixed(1)} ms`))));
    if (res.error) {
      const e = res.error;
      out.append(note([h('b', null, `Statement ${e.statement} (line ${e.line}, column ${e.column}): `), e.message, '.', h('div', { class: 'mono sql-head' }, e.sql.length > 200 ? `${e.sql.slice(0, 200)}…` : e.sql),
        e.stopped ? ' The database is as it was before that statement.' : ' Nothing after it was run.'], 'err'));
    }
    if (res.txn) out.append(txnNote());
    await refreshSchema();
  };
  const run = () => guard(async () => { clear(status); await runNow(); });

  /** Replace the database, keeping the old one (if it holds anything) for one "bring it back". */
  const replace = async (what: string, load: () => Promise<{ note?: string } | void>, name: string) => {
    let keep: typeof undo = null;
    if (opened) {
      const had = await sql<SchemaObject[]>('schema');
      if (had.length) keep = { bytes: await sql<Uint8Array>('exportDb'), name: fileName };
    }
    const r = await load(); opened = true; fileName = name; undo = keep; drawUndo();
    clear(out);
    const s = await refreshSchema(), views = s.filter((o) => o.type === 'view').length;
    say([`${what}${s.length ? `: ${plural(s.length - views, 'table')}${views ? `, ${plural(views, 'view')}` : ''}` : ''}. `, r && r.note ? `${r.note} ` : '', keep ? 'The database that was open before can be brought back (button above).' : ''], r && r.note ? 'warn' : 'ok');
  };
  /** The way back stays on the page until it is used or the next replacement takes its place — not only until the next Run. */
  const undoBox = h('span');
  const drawUndo = () => {
    clear(undoBox);
    if (undo) undoBox.append(button(`Bring back the previous database (${undo.name})`, () => guard(async () => {
      const u = undo!; undo = null; drawUndo(); await sql('open', u.bytes); fileName = u.name; clear(out); await refreshSchema(); say(`The previous database (${u.name}) is back.`);
    }), { small: true, icon: 'Undo2' }));
  };

  const importFile = (f: File) => guard(async () => {
    await ensure();
    const { sheetEngine } = await import('../../wasm/sheet');
    const se = await sheetEngine(), bytes = await readBytes(f);
    if (!bytes.length) throw new Error(`${f.name} is empty.`);
    const workbook = /\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(f.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);
    const book = workbook ? se.read(bytes) : se.csv(bytes);
    const sheets = book.sheets.filter((s) => s.rows.some((r) => r.length));
    if (!sheets.length) throw new Error(`${f.name} has no rows.`);
    const want = tname.value.trim() || baseName(f.name), lines: string[] = [];
    let last = '';
    for (const s of sheets) {
      const first = s.rows.findIndex((r) => r.length);          // a sheet may start a few rows down
      const r = await sql<{ table: string; renamed: boolean; columns: string[]; types: string[]; rows: number }>('importSheet', sheets.length > 1 ? `${want}_${s.name}` : want, s.rows.slice(first), first ? undefined : s.types);
      lines.push(`${plural(r.rows, 'row')} into “${r.table}” (${r.columns.map((c, i) => `${c} ${r.types[i]}`).join(', ')})`);
      last = r.table;
    }
    ed.value = `SELECT * FROM ${quoteId(last)} LIMIT 100;`;
    await runNow();
    say(`Imported ${lines.join('; ')}. Empty cells are NULL; codes such as 011001 and numbers too long to keep exactly stay text.`);
  });

  ed.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void run(); } });
  root.append(card(null, h('div', { class: 'row' },
    button('Sample database', () => guard(async () => { await replace('Sample database', async () => { await sql('open'); await sql('exec', SAMPLE); ed.value = SAMPLE_Q; }, 'sample.sqlite'); await runNow(); }), { icon: 'Database' }),
    button('New empty', () => guard(() => replace('New empty database', async () => { await sql('open'); }, 'database.sqlite')), { icon: 'FilePlus' }),
    button('Download database', () => guard(async () => {
      await ensure(); const b = await sql<Uint8Array>('exportDb'), open = await sql<boolean>('inTransaction');
      downloadBlob(new Blob([b as BlobPart], { type: 'application/vnd.sqlite3' }), /\.(db|sqlite3?|db3)$/i.test(fileName) ? fileName : `${baseName(fileName)}.sqlite`);
      say(`Saved ${fileName} (${fmtBytes(b.length)}).${open ? ' A transaction is open: the file holds its changes although they are not committed.' : ''}`, open ? 'warn' : 'ok');
    }), { icon: 'Download' }), undoBox),
    filePicker({ accept: '.db,.sqlite,.sqlite3,.db3', label: 'Open a SQLite file', onFiles: ([f]) => guard(async () => {
      const b = await readBytes(f);
      try { await replace(`Opened ${f.name} (${fmtBytes(b.length)})`, () => sql('open', b), f.name); } catch (e: any) { throw new Error(`${f.name}: ${e.message} ${opened ? 'The database that was open is still open.' : ''}`); }
    }) }),
    filePicker({ accept: '.csv,.tsv,.txt,.xlsx,.xlsm,.xlsb,.xls,.ods', label: 'Import CSV / Excel as a table', onFiles: ([f]) => importFile(f) }),
    field('Table name for imports', tname), status),
  h('div', { class: 'sql-layout' }, card('Tables', schemaBox), card('SQL', ed, h('div', { class: 'row' }, button('Run', run, { variant: 'primary', icon: 'Play' }), h('span', { class: 'muted' }, 'Ctrl+Enter'), h('label', { class: 'row sql-limit' }, h('span', { class: 'muted' }, 'Stop a statement after'), limit)))),
  out, note('SQLite runs in this browser tab (the official WebAssembly build, with full-text search, JSON, maths and R-tree); files are opened in memory and never uploaded. Nothing is saved until you download the database.', 'info'));
  clear(schemaBox).append(note('Open a database, import a file, or start with the sample.', 'info'));
};
