// SQLite in a worker (official SQLite wasm build, @sqlite.org/sqlite-wasm — tier 2, §3a). The database lives in this
// worker's memory; leaving the tab terminates the worker and frees it.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url';

let S: any = null, db: any = null;
const init = async () => (S ||= await (sqlite3InitModule as any)({ locateFile: () => wasmUrl, print: () => {}, printErr: () => {} }));
const show = (v: any) => (v instanceof Uint8Array ? `<blob ${v.length} bytes>` : typeof v === 'bigint' ? v.toString() : v);
/** Split SQL into statements with sqlite3_complete (handles ; inside strings, comments and triggers). */
function statements(sql: string): string[] {
  const out: string[] = []; let cur = '';
  for (const ch of sql) { cur += ch; if (ch === ';' && S.capi.sqlite3_complete(cur)) { if (cur.replace(/;\s*$/, '').trim()) out.push(cur.trim()); cur = ''; } }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const ops: Record<string, (...a: any[]) => any> = {
  async open(bytes?: Uint8Array) {
    await init(); db?.close();
    db = new S.oo1.DB(':memory:', 'c');
    if (bytes?.length) {
      const p = S.wasm.allocFromTypedArray(bytes);
      const rc = S.capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.length, bytes.length, S.capi.SQLITE_DESERIALIZE_FREEONCLOSE | S.capi.SQLITE_DESERIALIZE_RESIZEABLE);
      if (rc) throw new Error(`Not a SQLite database (error ${rc})`);
      db.exec('PRAGMA schema_version'); // fails here for a non-database file
    }
    return { version: S.version.libVersion };
  },
  exec(sql: string, limit = 2000) {
    if (!db) throw new Error('No database open');
    const res: any[] = [];
    for (const st of statements(sql)) {
      const t0 = performance.now(), cols: string[] = [], rows: any[][] = [];
      let total = 0;
      try {
        db.exec({ sql: st, rowMode: 'array', columnNames: cols, callback: (r: any[]) => { if (total++ < limit) rows.push(r.map(show)); } });
      } catch (e: any) { res.push({ sql: st, error: String(e.message || e).replace(/^SQLITE_\w+: sqlite3 result code \d+: /, '') }); break; }
      res.push({ sql: st, columns: cols, rows, total, changes: db.changes(), ms: performance.now() - t0 });
    }
    return res;
  },
  schema() {
    if (!db) return [];
    const objs = db.exec({ sql: "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type DESC, name", rowMode: 'object', returnValue: 'resultRows' });
    return objs.map((o: any) => ({ ...o, columns: o.type === 'table' || o.type === 'view' ? db.exec({ sql: `PRAGMA table_info(${JSON.stringify(o.name)})`, rowMode: 'object', returnValue: 'resultRows' }).map((c: any) => ({ name: c.name, type: c.type, pk: c.pk })) : [], count: o.type === 'table' ? db.selectValue(`SELECT count(*) FROM ${JSON.stringify(o.name)}`) : null }));
  },
  /** rows[0] = header. Column types: INTEGER / REAL when every value is numeric, else TEXT. */
  importRows(table: string, rows: any[][]) {
    if (!db) throw new Error('No database open');
    const head = rows[0].map((h: any, i: number) => String(h ?? '').trim() || `col${i + 1}`), body = rows.slice(1);
    const isInt = (v: any) => typeof v === 'number' ? Number.isInteger(v) : /^-?\d{1,15}$/.test(String(v).trim()), isNum = (v: any) => typeof v === 'number' || /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(String(v).trim());
    const types = head.map((_: string, i: number) => { const vals = body.map((r) => r[i]).filter((v) => v !== '' && v != null); return vals.length && vals.every(isInt) ? 'INTEGER' : vals.length && vals.every(isNum) ? 'REAL' : 'TEXT'; });
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    db.exec(`CREATE TABLE ${q(table)} (${head.map((h: string, i: number) => `${q(h)} ${types[i]}`).join(', ')})`);
    const st = db.prepare(`INSERT INTO ${q(table)} VALUES (${head.map(() => '?').join(', ')})`);
    db.transaction(() => { for (const r of body) { st.bind(head.map((_: string, i: number) => { const v = r[i]; return v === '' || v == null ? null : types[i] === 'TEXT' ? String(v) : Number(v); })).stepReset(); } });
    st.finalize();
    return { table, columns: head.length, rows: body.length, types };
  },
  exportDb() { if (!db) throw new Error('No database open'); return S.capi.sqlite3_js_db_export(db.pointer); },
};
self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try { const result = await ops[op](...args); (self as any).postMessage({ id, result }, result instanceof Uint8Array ? [result.buffer] : []); }
  catch (err: any) { (self as any).postMessage({ id, error: String(err?.message || err) }); }
};
