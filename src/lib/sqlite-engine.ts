// The SQLite Playground's engine: what the tab does with a database, on top of the official SQLite WebAssembly
// build (`S` = the object its init function gives). No DOM and no worker in here — the worker
// (src/workers/sqlite.worker.ts) and the unit tests (under Node) drive the same code.
//   open()        a new empty database, or a file's bytes (checked first; a write-ahead-log file is switched to the
//                 rollback journal in the copy; the database that was open stays open when the file is refused)
//   exec()        runs a script statement by statement with SQLite's own parser deciding where each one ends;
//                 values keep their type (1 and 1.0 differ, integers beyond 2^53 stay exact, blobs are blobs) and
//                 reals are shown in SQLite's own writing, as the sqlite3 command line shows them;
//                 a time limit ends a runaway statement without losing the database
//   schema()      tables, views and virtual tables with their columns, row counts, indexes and triggers
//   importSheet() rows of a CSV / workbook sheet as a new table (types decided by sheet.wasm, see col_types there)
//   exportResult()  a result of the last run as CSV or JSON — all of its rows, not only the ones on screen
//   exportDb()    the database file

/** A value as the page shows it: NULL, a whole number, text, a big whole number, a real (as text), a blob (hex of its first bytes). */
export type Cell = null | number | string | { i: string } | { r: string } | { b: string; n: number };
export interface StmtResult { sql: string; columns: string[]; rows: Cell[][]; total: number; kept: number; changed: number; ms: number; readonly: boolean }
export interface RunResult {
  results: StmtResult[];
  /** the statement that failed (1-based, counted over the statements that exist) and where in the script it starts */
  error?: { message: string; statement: number; line: number; column: number; sql: string; stopped?: boolean };
  /** a transaction is open after the run (BEGIN without COMMIT / ROLLBACK) */
  txn: boolean;
}
export interface SchemaObject { schema: string; name: string; type: 'table' | 'view' | 'virtual'; columns: Array<{ name: string; type: string; pk: number; hidden: number }>; count: number | null; error?: string; indexes: string[]; triggers: string[] }

/** A REAL: its value and the text SQLite itself writes for it ("1.0", "0.30000000000000004", "1.0e+300", "Inf"). */
class Real { constructor(public v: number, public t: string) {} }
type Raw = null | number | bigint | string | Uint8Array | Real;

const HEX = '0123456789abcdef';
/** The first bytes of a blob for the screen (a whole blob for a file is written by SQLite's hex(), see exportResult). */
const peek = (b: Uint8Array) => { let s = ''; for (let i = 0; i < Math.min(16, b.length); i++) s += HEX[b[i] >> 4] + HEX[b[i] & 15]; return s; };
const wire = (v: Raw): Cell => v === null || typeof v === 'number' || typeof v === 'string' ? v : typeof v === 'bigint' ? { i: v.toString() } : v instanceof Real ? { r: v.t } : { b: peek(v), n: v.length };
/** SQL identifier in double quotes. */
export const quoteId = (s: string) => `"${s.replace(/"/g, '""')}"`;
/** SQLite's message without the wrapper's prefix ("SQLITE_ERROR: sqlite3 result code 1: "). */
export const plain = (e: any) => String(e?.message ?? e).replace(/^SQLITE_\w+: sqlite3 result code \d+: /, '');
/** A statement as shown above its result: without the comments, blank lines and stray semicolons before it. */
const lead = (s: string) => {
  for (;;) {
    const t = s.replace(/^[\s;]+/, '');
    const u = t.startsWith('--') ? t.slice(t.indexOf('\n') < 0 ? t.length : t.indexOf('\n') + 1) : t.startsWith('/*') ? t.slice(t.indexOf('*/') < 0 ? t.length : t.indexOf('*/') + 2) : t;
    if (u === s) return s.trimEnd();
    s = u;
  }
};

export function makeEngine(S: any, o: { csvWrite?: (rows: Array<Array<string | null>>) => string } = {}) {
  const c = S.capi, w = S.wasm;
  let db: any = null;
  let stored: Array<{ columns: string[]; raw: Raw[][] }> = [];
  const need = () => { if (!db) throw new Error('No database is open.'); return db; };
  const all = (sql: string, bind?: any[]): any[][] => need().exec({ sql, bind, rowMode: 'array', returnValue: 'resultRows' });

  function open(bytes?: Uint8Array) {
    let note = '';
    if (bytes) {
      if (!bytes.length) throw new Error('That file is empty.');
      const magic = 'SQLite format 3\0';
      const head = bytes.subarray(0, 512);
      if (bytes.length < 100 || [...magic].some((ch, i) => head[i] !== ch.charCodeAt(0))) {
        const zip = head[0] === 0x50 && head[1] === 0x4b, text = head.every((b) => b === 9 || b === 10 || b === 13 || b >= 32);
        throw new Error(`That is not a SQLite database file${zip ? ' (it looks like a workbook or a zip archive — use “Import CSV / Excel as a table” for a workbook)' : text ? ' (it looks like text — use “Import CSV / Excel as a table” for a CSV file)' : ', or it is encrypted'}.`);
      }
      if (bytes[18] === 2 || bytes[19] === 2) {       // write-ahead log: an in-memory copy cannot use it
        bytes = bytes.slice(); bytes[18] = bytes[19] = 1;
        note = 'This database was in write-ahead-log mode: changes that were only in its -wal file are not part of the file you opened.';
      }
    }
    const next = new S.oo1.DB(':memory:', 'c');
    try {
      if (bytes) {
        const p = w.allocFromTypedArray(bytes);
        const rc = c.sqlite3_deserialize(next.pointer, 'main', p, bytes.length, bytes.length, c.SQLITE_DESERIALIZE_FREEONCLOSE | c.SQLITE_DESERIALIZE_RESIZEABLE);
        if (rc) throw new Error('SQLite could not load the file.');
        next.exec('SELECT count(*) FROM sqlite_schema');      // reads the first page and the schema: fails here for a damaged file
      }
    } catch (e: any) {
      next.close();
      const m = plain(e);
      throw new Error(/malformed|not a database/.test(m) ? `That file is damaged or incomplete (SQLite: ${m}).` : m);
    }
    db?.close(); db = next; stored = [];
    return { version: S.version.libVersion as string, note };
  }

  function exec(sql: string, opt: { limit?: number; keep?: number; timeLimitMs?: number } = {}): RunResult {
    const d = need(), limit = opt.limit ?? 2000, keep = opt.keep ?? 1_000_000, max = opt.timeLimitMs ?? 0;
    const results: StmtResult[] = [], kept: typeof stored = [];
    let error: RunResult['error'];
    const started = performance.now();
    let stopped = false;
    if (max > 0) c.sqlite3_progress_handler(d.pointer, 20000, () => (performance.now() - started > max ? ((stopped = true), 1) : 0), 0);
    const changes = () => Number(c.sqlite3_total_changes64(d.pointer));
    const stack = w.scopedAllocPush();
    try {
      const [pSql, len] = w.scopedAllocCString(sql, true), ppStmt = w.scopedAllocPtr(), pzTail = w.scopedAllocPtr();
      const heap = () => w.heap8u(), dec = new TextDecoder();
      const text = (a: number, b: number) => dec.decode(heap().slice(a, b));
      const fail = (message: string, at: number, piece: string) => {
        const before = text(Number(pSql), at), lines = before.split('\n');
        error = { message, statement: results.length + 1, line: lines.length, column: lines[lines.length - 1].length + 1, sql: lead(piece), stopped: stopped || undefined };
      };
      let p = Number(pSql), left = len;
      while (left > 0 && w.peek8(p)) {
        const rc = c.sqlite3_prepare_v3(d.pointer, p, left, 0, ppStmt, pzTail);
        if (rc) {
          const off = Math.max(0, c.sqlite3_error_offset(d.pointer)), rest = text(p, p + left);
          let msg = c.sqlite3_errmsg(d.pointer) as string;
          if (/^near "\."/.test(msg) && /^\s*\./.test(lead(rest))) msg += ' — lines that start with a dot (.tables, .schema, .import …) are commands of the sqlite3 command-line program, not SQL';
          fail(msg, p + off, rest.slice(0, 400));
          break;
        }
        const st = w.peekPtr(ppStmt), tail = Number(w.peekPtr(pzTail)), piece = text(p, tail);
        const start = p + (piece.length - piece.trimStart().length);
        if (tail <= p) break;                                // cannot happen: SQLite always moves on
        left -= tail - p; p = tail;
        if (!st) continue;                                   // white space, comments, an empty statement
        const t0 = performance.now(), n = c.sqlite3_column_count(st), before = changes(), readonly = !!c.sqlite3_stmt_readonly(st);
        const columns: string[] = []; for (let i = 0; i < n; i++) columns.push(c.sqlite3_column_name(st, i));
        const rows: Cell[][] = [], raw: Raw[][] = [];
        let total = 0, step = 0, msg = '';
        try {
          while ((step = c.sqlite3_step(st)) === c.SQLITE_ROW) {
            if (total < keep) {
              const r: Raw[] = new Array(n);
              for (let i = 0; i < n; i++) {
                const ty = c.sqlite3_column_type(st, i);
                if (ty === c.SQLITE_INTEGER) { const v = c.sqlite3_column_int64(st, i) as bigint; r[i] = v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v; }
                else if (ty === c.SQLITE_FLOAT) r[i] = new Real(c.sqlite3_column_double(st, i), c.sqlite3_column_text(st, i));
                else if (ty === c.SQLITE_TEXT) r[i] = c.sqlite3_column_text(st, i);
                else if (ty === c.SQLITE_BLOB) r[i] = c.sqlite3_column_js(st, i) as Uint8Array;
                else r[i] = null;
              }
              raw.push(r); if (total < limit) rows.push(r.map(wire));
            }
            total++;
          }
          if (step !== c.SQLITE_DONE) msg = c.sqlite3_errmsg(d.pointer) as string;
        } finally { c.sqlite3_finalize(st); }
        if (step !== c.SQLITE_DONE) { fail(stopped ? `stopped after ${Math.round(max / 1000)} s — the statement was still running (the time limit is next to Run)` : msg, start, piece); break; }
        results.push({ sql: lead(piece), columns, rows, total, kept: raw.length, changed: changes() - before, ms: performance.now() - t0, readonly });
        kept.push({ columns, raw });
      }
    } finally {
      w.scopedAllocPop(stack);
      if (max > 0) c.sqlite3_progress_handler(d.pointer, 0, 0, 0);
    }
    stored = kept;
    return { results, error, txn: !c.sqlite3_get_autocommit(d.pointer) };
  }

  function schema(): SchemaObject[] {
    const list = all('SELECT schema, name, type FROM pragma_table_list') as Array<[string, string, string]>;
    const extra = new Map<string, { indexes: string[]; triggers: string[] }>();
    for (const [type, name, tbl] of all("SELECT type, name, tbl_name FROM sqlite_schema WHERE type IN ('index', 'trigger')") as Array<[string, string, string]>) {
      if (name.startsWith('sqlite_autoindex_')) continue;
      const e = extra.get(tbl) || { indexes: [], triggers: [] }; extra.set(tbl, e); (type === 'index' ? e.indexes : e.triggers).push(name);
    }
    const out: SchemaObject[] = [];
    for (const [sch, name, type] of list) {
      if (type === 'shadow' || name.startsWith('sqlite_') || !['table', 'view', 'virtual'].includes(type)) continue;
      const x: SchemaObject = { schema: sch, name, type: type as SchemaObject['type'], columns: [], count: null, indexes: (sch === 'main' && extra.get(name)?.indexes) || [], triggers: (sch === 'main' && extra.get(name)?.triggers) || [] };
      try {
        x.columns = (all('SELECT name, type, pk, hidden FROM pragma_table_xinfo(?, ?)', [name, sch]) as Array<[string, string, number, number]>).filter((r) => r[3] !== 1).map(([n, t, pk, hidden]) => ({ name: n, type: t, pk, hidden }));
        x.count = Number(all(`SELECT count(*) FROM ${quoteId(sch)}.${quoteId(name)}`)[0][0]);
      } catch (e: any) {
        const m = plain(e), mod = /no such module: (\S+)/.exec(m);
        x.error = mod ? `needs the module “${mod[1]}”, which this build of SQLite does not have` : m;
      }
      out.push(x);
    }
    const rank = { table: 0, virtual: 1, view: 2 };
    return out.sort((a, b) => (a.schema === b.schema ? rank[a.type] - rank[b.type] || a.name.localeCompare(b.name) : a.schema === 'main' ? -1 : b.schema === 'main' ? 1 : a.schema.localeCompare(b.schema)));
  }

  /** rows[0] = the header. Returns the names actually used (made unique) and the types. */
  function importSheet(table: string, rows: any[][], types: string[] = []) {
    const d = need();
    const width = rows.reduce((a, r) => Math.max(a, r.length), 0);
    if (!rows.length || !width) throw new Error('That file has no rows.');
    const taken = new Set<string>();
    const unique = (want: string, used: Set<string>) => { let n = want, k = 2; while (used.has(n.toLowerCase())) n = `${want}_${k++}`; used.add(n.toLowerCase()); return n; };
    const columns = Array.from({ length: width }, (_, i) => unique(String(rows[0][i] ?? '').trim() || `col${i + 1}`, taken));
    const existing = new Set((all('SELECT name FROM sqlite_schema') as string[][]).map((r) => r[0].toLowerCase()));
    let want = table.trim().replace(/[\u0000-\u001f]+/g, ' ') || 'data';
    if (/^sqlite_/i.test(want)) want = `data_${want}`;      // names starting with sqlite_ are reserved
    const name = unique(want, existing);
    const ty = columns.map((_, i) => (types[i] === 'INTEGER' || types[i] === 'REAL' ? types[i] : 'TEXT'));
    const value = (v: any, t: string) => {
      if (v == null || v === '') return null;
      if (t === 'TEXT') return typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'number') return v;
      const s = String(v).trim(); if (!s) return null;
      return t === 'INTEGER' && s.replace('-', '').length > 15 ? BigInt(s) : Number(s);
    };
    d.savepoint(() => {
      d.exec(`CREATE TABLE ${quoteId(name)} (${columns.map((col, i) => `${quoteId(col)} ${ty[i]}`).join(', ')})`);
      const st = d.prepare(`INSERT INTO ${quoteId(name)} VALUES (${columns.map(() => '?').join(', ')})`);
      try { for (let r = 1; r < rows.length; r++) { const row = rows[r]; st.bind(ty.map((t, i) => value(row[i], t))).stepReset(); } } finally { st.finalize(); }
    });
    return { table: name, renamed: name !== table, columns, types: ty, rows: rows.length - 1 };
  }

  /** A result of the last exec() as CSV or JSON, in pieces (strings) that together are the file. */
  function exportResult(index: number, kind: 'csv' | 'json'): string[] {
    const r = stored[index]; if (!r) throw new Error('That result is gone — run the statement again.');
    const parts: string[] = [];
    const hexStmt = need().prepare('SELECT lower(hex(?))');
    const blob = (b: Uint8Array) => (b.length ? `X'${hexStmt.bind([b]).step() ? hexStmt.get(0) : ''}'` : "X''");
    const hexOf = (b: Uint8Array) => { try { return blob(b); } finally { hexStmt.reset(); } };
    try {
    if (kind === 'csv') {
      if (!o.csvWrite) throw new Error('No CSV writer.');
      const text = (v: Raw): string | null => v === null ? null : typeof v === 'string' ? v : v instanceof Real ? v.t : v instanceof Uint8Array ? hexOf(v) : String(v);
      parts.push('﻿', o.csvWrite([r.columns]));
      for (let i = 0; i < r.raw.length; i += 20000) parts.push(o.csvWrite(r.raw.slice(i, i + 20000).map((row) => row.map(text))));
      return parts;
    }
    // JSON: one object per row; numbers are written exactly (integers beyond 2^53 too), a real that JSON cannot hold is null
    const used = new Set<string>(), keys = r.columns.map((n) => { let k = n, i = 2; while (used.has(k)) k = `${n}_${i++}`; used.add(k); return JSON.stringify(k); });
    const json = (v: Raw) => v === null ? 'null' : typeof v === 'string' ? JSON.stringify(v) : v instanceof Real ? (Number.isFinite(v.v) ? v.t : 'null') : v instanceof Uint8Array ? `"${hexOf(v)}"` : String(v);
    parts.push('[');
    for (let i = 0; i < r.raw.length; i += 20000) parts.push(r.raw.slice(i, i + 20000).map((row, k) => `${i + k ? ',' : ''}\n  {${row.map((v, j) => `${keys[j]}: ${json(v)}`).join(', ')}}`).join(''));
    parts.push(r.raw.length ? '\n]\n' : ']\n');
    return parts;
    } finally { hexStmt.finalize(); }
  }

  return {
    open, exec, schema, importSheet, exportResult,
    exportDb: (): Uint8Array => c.sqlite3_js_db_export(need().pointer),
    inTransaction: () => !!db && !c.sqlite3_get_autocommit(db.pointer),
    close: () => { db?.close(); db = null; stored = []; },
  };
}
