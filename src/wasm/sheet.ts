// Wrapper for sheet.wasm (Rust, built by us: calamine + rust_xlsxwriter + csv). JSON crosses the boundary.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/sheet.wasm?url';

export type Cell = string | number | boolean | null;
export interface Sheet { name: string; rows: Cell[][]; error?: string; hidden?: boolean }
export interface Book { sheets: Sheet[]; delimiter?: string }

export function bindSheet(e: any) {
  const dec = new TextDecoder(), enc = new TextEncoder();
  const call = (bytes: Uint8Array, f: (p: number, n: number) => number) => {
    const p = e.sheet_alloc(bytes.length); new Uint8Array(e.memory.buffer, p, bytes.length).set(bytes);
    try {
      const r = f(p, bytes.length), out = new Uint8Array(e.memory.buffer, e.sheet_out_ptr(), e.sheet_out_len()).slice();
      if (r < 0) throw new Error(JSON.parse(dec.decode(out)).error);
      return out;
    } finally { e.sheet_free(p, bytes.length); }
  };
  return {
    /** .xlsx / .xlsm / .xlsb / .xls / .ods → sheets (dates as ISO text). */
    read: (file: Uint8Array): Book => JSON.parse(dec.decode(call(file, (p, n) => e.sheet_read(p, n)))),
    /** CSV / TSV text → one sheet of strings; delimiter '' = detect. */
    csv: (text: Uint8Array, delimiter = ''): Book => JSON.parse(dec.decode(call(text, (p, n) => e.csv_read(p, n, delimiter ? delimiter.charCodeAt(0) : 0)))),
    /** Sheets → .xlsx. numbers: numeric-looking text becomes numbers; header: bold frozen first row with a filter. */
    xlsx: (book: Book, o: { numbers?: boolean; header?: boolean } = {}): Uint8Array => call(enc.encode(JSON.stringify({ sheets: book.sheets, numbers: !!o.numbers, header: !!o.header })), (p, n) => e.xlsx_write(p, n)),
    /** Rows → CSV text (RFC 4180 quoting). */
    csvWrite: (rows: Cell[][], delimiter = ','): string => dec.decode(call(enc.encode(JSON.stringify(rows)), (p, n) => e.csv_write(p, n, delimiter.charCodeAt(0)))),
  };
}
let inst: Promise<ReturnType<typeof bindSheet>> | null = null;
export const sheetEngine = () => (inst ||= instantiateWasi(wasmUrl).then((x) => bindSheet(x.exports)));
