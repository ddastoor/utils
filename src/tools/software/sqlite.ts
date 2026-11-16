// SQLite Playground: the official SQLite wasm build in a worker (src/workers/sqlite.worker.ts). Open a .db/.sqlite file,
// import CSV / TSV / Excel (sheet.wasm reads them), run SQL, export results and the database.
import { h, card, field, textarea, input, clear, note, button, filePicker, readBytes, downloadBlob, baseName, type Mount } from '../../ui';
import { sql } from '../../lib/sqlite-client';
import { debounce } from './devui';

const SAMPLE = `CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT, joined DATE);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), placed DATE, total REAL);
INSERT INTO customers VALUES (1,'Asha Rao','Pune','2024-02-11'),(2,'Ravi Kumar','Mumbai','2024-05-03'),(3,'Meera Iyer','Chennai','2025-01-20'),(4,'Kabir Singh','Delhi','2025-07-08');
INSERT INTO orders VALUES (101,1,'2026-10-01',450.5),(102,1,'2026-10-15',120),(103,2,'2026-10-20',980),(104,3,'2026-11-02',60),(105,4,'2026-11-10',1500),(106,2,'2026-11-12',75.25);`;
export const sqlite: Mount = (root) => {
  let open = false, last: any[] = [];
  const SAMPLE_Q = 'SELECT c.city, count(*) AS orders, round(sum(o.total), 2) AS revenue\nFROM orders o JOIN customers c ON c.id = o.customer_id\nGROUP BY c.city\nORDER BY revenue DESC;';
  const ed = textarea({ rows: 8, mono: true, value: SAMPLE_Q });
  const out = h('div'), schemaBox = h('div', { class: 'sql-schema' }), status = h('div');
  const tname = input({ value: 'data', attrs: { class: 'input mono', 'aria-label': 'Table name for import' } });
  const refreshSchema = async () => {
    const s = await sql<any[]>('schema');
    clear(schemaBox).append(...(s.length ? s.map((o) => h('details', { open: s.length < 6 }, h('summary', null, h('b', null, o.name), h('span', { class: 'muted' }, ` ${o.type}${o.count != null ? ` · ${o.count} rows` : ''}`)),
      h('div', { class: 'mono sql-cols' }, o.columns.map((c: any) => h('div', null, `${c.name} ${c.type || ''}${c.pk ? ' 🔑' : ''}`))),
      o.type === 'table' ? button(`SELECT * FROM ${o.name}`, () => { ed.value = `SELECT * FROM "${o.name}" LIMIT 100;`; run(); }, { small: true }) : '')) : [note('The database is empty. Create a table, open a file or import a CSV.', 'info')]));
  };
  const ensure = async () => { if (!open) { await sql('open'); open = true; } };
  const show = (bytes: Uint8Array | null, name: string, extra = '') => { clear(status).append(note(`${name}${extra}`, 'ok')); };
  const run = async () => {
    await ensure();
    const res: any[] = await sql('exec', ed.value); last = res;
    clear(out).append(...res.map((r, i) => r.error ? note(`Statement ${i + 1}: ${r.error}`, 'err') : card(null,
      h('div', { class: 'muted mono sql-head' }, `${r.sql.length > 90 ? `${r.sql.slice(0, 90)}…` : r.sql}`),
      r.columns.length ? [h('div', { class: 'scroll-x sql-result' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, r.columns.map((c: string) => h('th', null, c)))), h('tbody', null, r.rows.map((row: any[]) => h('tr', null, row.map((v) => h('td', { class: v === null ? 'muted' : typeof v === 'number' ? 'num' : null }, v === null ? 'NULL' : String(v)))))))),
        h('div', { class: 'muted' }, `${r.total.toLocaleString('en-IN')} row${r.total === 1 ? '' : 's'}${r.total > r.rows.length ? ` (first ${r.rows.length} shown)` : ''} · ${r.ms.toFixed(1)} ms`),
        h('div', { class: 'row' }, button('CSV', () => saveRes(r, 'csv'), { small: true, icon: 'Download' }), button('JSON', () => saveRes(r, 'json'), { small: true, icon: 'Download' }))]
        : h('div', { class: 'muted' }, `OK · ${r.changes} row${r.changes === 1 ? '' : 's'} changed · ${r.ms.toFixed(1)} ms`))));
    await refreshSchema();
  };
  const saveRes = (r: any, kind: string) => {
    const cell = (v: any) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const text = kind === 'csv' ? `﻿${[r.columns.map(cell).join(','), ...r.rows.map((x: any[]) => x.map(cell).join(','))].join('\r\n')}` : JSON.stringify(r.rows.map((x: any[]) => Object.fromEntries(r.columns.map((c: string, i: number) => [c, x[i]]))), null, 2);
    downloadBlob(new Blob([text], { type: kind === 'csv' ? 'text/csv' : 'application/json' }), `result.${kind}`);
  };
  ed.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
  void debounce; void last;
  root.append(card(null, h('div', { class: 'row' },
    button('Sample database', async () => { await sql('open'); open = true; await sql('exec', SAMPLE); show(null, 'Sample database: customers and orders'); ed.value = SAMPLE_Q; await run(); }, { icon: 'Database' }),
    button('New empty', async () => { await sql('open'); open = true; clear(out); show(null, 'New empty database'); await refreshSchema(); }, { icon: 'FilePlus' }),
    button('Download database', async () => { await ensure(); const b = await sql<Uint8Array>('exportDb'); downloadBlob(new Blob([b as BlobPart], { type: 'application/vnd.sqlite3' }), 'database.sqlite'); }, { icon: 'Download' })),
    filePicker({ accept: '.db,.sqlite,.sqlite3,.db3', label: 'Open a SQLite file', onFiles: async ([f]) => { const b = await readBytes(f); await sql('open', b); open = true; show(b, `Opened ${f.name}`, ` (${(b.length / 1024).toFixed(0)} KB)`); clear(out); await refreshSchema(); } }),
    filePicker({ accept: '.csv,.tsv,.txt,.xlsx,.xls,.ods', label: 'Import CSV / Excel as a table', onFiles: async ([f]) => {
      await ensure(); const { sheetEngine } = await import('../../wasm/sheet'); const se = await sheetEngine(); const b = await readBytes(f);
      const book = /\.(xlsx|xls|ods|xlsb)$/i.test(f.name) ? se.read(b) : se.csv(b);
      const name = (tname.value.trim() || baseName(f.name)).replace(/[^\w]+/g, '_');
      const r = await sql<any>('importRows', name, book.sheets[0].rows);
      show(null, `Imported ${r.rows.toLocaleString('en-IN')} rows into "${r.table}" (${r.types.join(', ')})`); ed.value = `SELECT * FROM "${r.table}" LIMIT 100;`; await run();
    } }), field('Table name for imports', tname), status),
  h('div', { class: 'sql-layout' }, card('Tables', schemaBox), card('SQL', ed, h('div', { class: 'row' }, button('Run', run, { variant: 'primary', icon: 'Play' }), h('span', { class: 'muted' }, 'Ctrl+Enter'))),),
  out, note('SQLite runs in this browser tab (official WebAssembly build); files are opened in memory and never uploaded.', 'info'));
  clear(schemaBox).append(note('Open a database, import a file, or start with the sample.', 'info'));
};
