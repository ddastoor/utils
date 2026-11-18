// SQLite in a worker: the official SQLite wasm build (@sqlite.org/sqlite-wasm) driven by src/lib/sqlite-engine.ts.
// The database lives in this worker's memory; leaving the tab terminates the worker and frees it.
// CSV for exported results is written by sheet.wasm (RFC 4180 quoting), loaded here on the first CSV export.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url';
import { makeEngine } from '../lib/sqlite-engine';
import { sheetEngine } from '../wasm/sheet';

// SQLite's JavaScript layer writes a console warning for every statement that fails; the tab shows the error itself
(globalThis as any).sqlite3ApiConfig = { warn: () => {}, error: () => {}, log: () => {}, debug: () => {} };
let engine: ReturnType<typeof makeEngine> | null = null, sheet: Awaited<ReturnType<typeof sheetEngine>> | null = null;
const init = async () => (engine ||= makeEngine(await (sqlite3InitModule as any)({ locateFile: () => wasmUrl, print: () => {}, printErr: () => {} }), { csvWrite: (rows) => sheet!.csvWrite(rows) }));
const ops: Record<string, (...a: any[]) => any> = {
  open: async (bytes?: Uint8Array) => (await init()).open(bytes),
  exec: async (sql: string, opt?: any) => (await init()).exec(sql, opt),
  schema: async () => (await init()).schema(),
  importSheet: async (table: string, rows: any[][], types: string[]) => (await init()).importSheet(table, rows, types),
  exportDb: async () => (await init()).exportDb(),
  inTransaction: async () => (await init()).inTransaction(),
  async exportResult(index: number, kind: 'csv' | 'json') {
    const e = await init();
    if (kind === 'csv') sheet ||= await sheetEngine();
    return new Blob(e.exportResult(index, kind), { type: kind === 'csv' ? 'text/csv' : 'application/json' });
  },
};
self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try { const result = await ops[op](...args); (self as any).postMessage({ id, result }, result instanceof Uint8Array ? [result.buffer] : []); }
  catch (err: any) { (self as any).postMessage({ id, error: String(err?.message || err).replace(/^SQLITE_\w+: sqlite3 result code \d+: /, '') }); }
};
