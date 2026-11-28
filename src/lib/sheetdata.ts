// What the CSV / Excel tab reads and writes around sheet.wasm (src/wasm/sheet.ts): the text encoding of a CSV, JSON in
// and out, numbers as Excel shows them, and the "Excel" files that are web pages (HTML tables) or Excel 2003 XML —
// read with the browser's own parser (DOMParser, compiled C++); laying a table out on a grid is glue. No DOM here
// except in the two functions that take a Document, so the unit suite can run the rest in Node.
import type { Book, Cell, Sheet, bindSheet } from '../wasm/sheet';
import { textOf } from './textfile';

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
export const colName = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/** A number as Excel shows it in "General": 15 significant digits, so a stored 0.30000000000000004 is 0.3; whole
 *  numbers up to 2^53 digit for digit; very large and very small ones with an exponent (1E+21). */
export function fmtNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v) && Math.abs(v) <= 2 ** 53) return String(v);
  const r = Number(v.toPrecision(15));
  // beyond 15 digits the zeros would be no digits at all: 1.23456789012346E+20, not 123456789012346000000
  if (Math.abs(r) >= 1e15) { const [m, e] = r.toExponential(14).split('e'); return `${m.replace(/\.?0+$/, '')}E${+e < 0 ? '-' : '+'}${Math.abs(+e)}`; }
  return String(r).replace(/e\+?/, 'E+').replace('E+-', 'E-');
}
/** A cell as text: numbers as Excel shows them, TRUE / FALSE, nothing for an empty cell. */
export const cellText = (v: Cell | undefined): string => (v === null || v === undefined ? '' : typeof v === 'number' ? fmtNumber(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v);

/** The text of a CSV / TSV file: by its byte-order mark (UTF-8, UTF-16 LE / BE), else UTF-8 when it is valid UTF-8,
 *  else Windows-1252 (what Excel on Windows saves as "CSV"). `how` names what was not plain UTF-8. Refuses a file that
 *  is not text (NUL bytes without a UTF-16 mark). */
export function decodeText(bytes: Uint8Array): { text: string; how: string } {
  const r = textOf(bytes);
  if (!r) throw new Error('This file is not text: it is no CSV, TSV or JSON, and no spreadsheet this tab can read.');
  return r;
}

/** What a file that is not a zip (xlsx, ods) or an OLE container (xls) holds, by its first characters. */
export function sniffText(text: string): 'html' | 'xml2003' | 'json' | 'text' {
  const head = text.slice(0, 65536).replace(/^\ufeff/, '').trimStart();
  if (/^</.test(head)) {
    if (/<Workbook\b[^>]*urn:schemas-microsoft-com:office:spreadsheet/i.test(head) || /<\?mso-application\s+progid="Excel\.Sheet"/i.test(head)) return 'xml2003';
    if (/<table\b/i.test(head) || /<html\b/i.test(head)) return 'html';
  }
  if (/^[[{]/.test(head)) return 'json';
  return 'text';
}

/** A spreadsheet file → its sheets, as the CSV / Excel tab reads it (and SliceDiceGrapher): a zip or OLE file by sheet.wasm (xlsx, xlsm,
 *  xlsb, xls, ods); text decoded (`decodeText`) and read as a web page's tables, Excel 2003 XML, JSON or CSV / TSV (sheet.wasm; a .tsv or
 *  .tab file by tabs, else the separator detected). `csv` is the CSV's text (to read it again with another separator), `how` its encoding.
 *  The browser's DOMParser for the web pages and the XML. */
export function readSpreadsheet(bytes: Uint8Array, fileName: string, sh: ReturnType<typeof bindSheet>, delim?: string): { book: Book; csv: string | null; how: string; delim: string } {
  const ext = (fileName.split('.').pop() || '').toLowerCase(), zipOrOle = (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);
  const base = fileName.replace(/\.[^.]+$/, '');
  if (!bytes.length) throw new Error(`${fileName} is empty.`);
  if (zipOrOle && ext !== 'csv' && ext !== 'json') return { book: sh.read(bytes), csv: null, how: '', delim: '' };
  const d = decodeText(bytes), kind = sniffText(d.text);
  if (kind === 'html') {
    const sheets = htmlTables(new DOMParser().parseFromString(d.text, 'text/html'));
    if (!sheets.length) throw new Error(`${fileName} is a web page without a table.`);
    return { book: { sheets }, csv: null, how: d.how, delim: '' };
  }
  if (kind === 'xml2003') {
    const doc = new DOMParser().parseFromString(d.text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error(`${fileName} is Excel 2003 XML that is not well-formed.`);
    return { book: { sheets: spreadsheetML(doc) }, csv: null, how: d.how, delim: '' };
  }
  if (ext === 'json' || (kind === 'json' && !['csv', 'tsv', 'txt', 'tab'].includes(ext))) {
    try { return { book: jsonToBook(d.text, base), csv: null, how: d.how, delim: '' }; }
    catch (e) { if (ext === 'json') throw new Error(`${fileName} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const sep = delim ?? (ext === 'tsv' || ext === 'tab' ? '\t' : '');
  const book = sh.csv(new TextEncoder().encode(d.text), sep);
  if (book.sheets[0]) book.sheets[0].name = base;                 // the sheet of a CSV is named after the file (in the .xlsx too)
  return { book, csv: d.text, how: d.how, delim: sep };
}

/** JSON → one sheet: an array of objects (one column per key, in the order keys appear), an array of arrays, or
 *  { rows: [...] }. Numbers a double cannot hold as written (IDs of 17 digits) stay text — where the browser lets
 *  JSON.parse see the number's source. */
export function jsonToBook(text: string, name = 'JSON'): Book {
  const exact = (key: string, v: any, ctx?: { source?: string }) => (typeof v === 'number' && ctx?.source !== undefined && !sameNumber(ctx.source, v) ? ctx.source : v);
  const data = JSON.parse(text, exact as any), arr = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [data];
  const cell = (v: any): Cell => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : v);
  if (arr.length && arr.every((r: any) => Array.isArray(r))) return { sheets: [{ name, rows: arr.map((r: any[]) => r.map(cell)) }] };
  const keys: string[] = [], seen = new Set<string>();
  for (const r of arr) if (r && typeof r === 'object' && !Array.isArray(r)) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
  if (!keys.length) return { sheets: [{ name, rows: arr.map((r: any) => [cell(r)]) }] };
  return { sheets: [{ name, rows: [keys, ...arr.map((r: any) => keys.map((k) => cell(r && typeof r === 'object' ? r[k] : undefined)))] }] };
}
/** The decimal number a text writes, as sign, significant digits and the power of ten of the last one ("1.50" and
 *  "15e-1" are the same) — or null when it is no plain decimal. */
function decimalKey(src: string): string | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(src.trim()); if (!m) return null;
  const frac = m[3] || '', all = (m[2] + frac).replace(/^0+/, ''), digits = all.replace(/0+$/, '');
  return digits ? `${m[1]}${digits}e${+(m[4] || 0) - frac.length + (all.length - digits.length)}` : '0';
}
/** Does the double `v` give back the decimal number written as `src` (1.50 → 1.5 yes; 12345678901234567890 no)? */
export function sameNumber(src: string, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  const want = decimalKey(src);
  return want === null || decimalKey(v.toExponential().replace('e+', 'e')) === want;
}

/** Rows → JSON: objects keyed by the first row when it is a header (keys made unique: Value, Value_2; an empty
 *  heading or a column beyond the header gets its letter), else arrays. `types` (from sheet.wasm: INTEGER / REAL /
 *  TEXT per column) turns numbers written as text into JSON numbers when `numbers` — whole columns only, and only
 *  where JavaScript holds them exactly. */
export function rowsToJson(rows: Cell[][], header: boolean, numbers = false, types?: string[]): string {
  const conv = (v: Cell, c: number): Cell => {
    if (!numbers || typeof v !== 'string' || !types?.[c] || types[c] === 'TEXT' || !v.trim()) return v;
    const n = Number(v.trim());
    return Number.isFinite(n) && (types[c] === 'REAL' || Number.isSafeInteger(n)) ? n : v;
  };
  if (!header || !rows.length) return JSON.stringify(rows.map((r) => r.map(conv)), null, 2);
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0), used = new Set<string>();
  const keys = Array.from({ length: width }, (_, i) => {
    const base = cellText(rows[0][i]).trim() || colName(i);
    let k = base, n = 1;
    while (used.has(k)) k = `${base}_${++n}`;
    used.add(k);
    return k;
  });
  return JSON.stringify(rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, conv(r[i] ?? null, i)]))), null, 2);
}

/** Rows → the cells as text for CSV / TSV: numbers as Excel shows them, TRUE / FALSE. */
export const rowsAsText = (rows: Cell[][]): string[][] => rows.map((r) => r.map(cellText));

const clean = (s: string | null | undefined) => (s || '').replace(/[\s\u00a0]+/g, ' ').trim();
/** Every <table> of an HTML page (the "Excel" files of many banks and web apps) → a sheet: cells by the HTML table
 *  model — colspan and rowspan fill the grid, the text of a cell with its spaces tidied; a number stays text (as in
 *  a CSV) so the .xlsx option decides. */
export function htmlTables(doc: Document): Sheet[] {
  const out: Sheet[] = [];
  doc.querySelectorAll('table').forEach((t) => {
    if (t.querySelector('table')) return;                       // a table that only lays out other tables
    const grid: Cell[][] = [];
    const rows = [...t.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr')] as HTMLTableRowElement[];
    rows.forEach((tr, r) => {
      grid[r] ||= [];
      let c = 0;
      for (const td of [...tr.children].filter((x) => /^(TD|TH)$/.test(x.tagName)) as HTMLTableCellElement[]) {
        while (grid[r][c] !== undefined) c++;
        const cs = Math.min(1000, Math.max(1, td.colSpan || 1)), rs = Math.min(65534, Math.max(1, td.rowSpan || 1));
        const v = clean(td.textContent);
        for (let dr = 0; dr < rs && r + dr < rows.length; dr++) { grid[r + dr] ||= []; for (let dc = 0; dc < cs; dc++) grid[r + dr][c + dc] = dr || dc ? null : v || null; }
        c += cs;
      }
    });
    const rowsOut = grid.map((r) => { const a = Array.from({ length: r.length }, (_, i) => r[i] ?? null); while (a.length && a[a.length - 1] === null) a.pop(); return a; });
    if (rowsOut.some((r) => r.length)) out.push({ name: `Table ${out.length + 1}`, rows: rowsOut });
  });
  return out;
}

/** Excel 2003 XML (SpreadsheetML): Worksheet → Table → Row → Cell → Data, with ss:Index and ss:MergeAcross / MergeDown;
 *  numbers and booleans by their ss:Type, dates (ss:Type="DateTime") as ISO text as the other files give them. */
export function spreadsheetML(doc: Document): Sheet[] {
  const SS = 'urn:schemas-microsoft-com:office:spreadsheet', at = (e: Element, n: string) => e.getAttributeNS(SS, n) ?? e.getAttribute(`ss:${n}`);
  const out: Sheet[] = [];
  for (const ws of [...doc.getElementsByTagNameNS(SS, 'Worksheet')]) {
    const grid: Cell[][] = [];
    let r = -1;
    for (const row of [...ws.getElementsByTagNameNS(SS, 'Row')]) {
      const ri = at(row, 'Index'); r = ri ? +ri - 1 : r + 1;
      grid[r] ||= [];
      let c = -1;
      for (const cell of [...row.getElementsByTagNameNS(SS, 'Cell')]) {
        const ci = at(cell, 'Index'); c = ci ? +ci - 1 : c + 1;
        while (grid[r][c] !== undefined && !ci) c++;
        const d = cell.getElementsByTagNameNS(SS, 'Data')[0], type = d ? at(d, 'Type') : null, raw = d?.textContent ?? '';
        const v: Cell = !d ? null : type === 'Number' ? (Number.isFinite(+raw) ? +raw : raw) : type === 'Boolean' ? raw.trim() === '1' : type === 'DateTime' ? raw.replace(/T00:00:00(\.000)?$/, '').replace('T', ' ').replace(/\.000$/, '') : raw;
        const across = +(at(cell, 'MergeAcross') || 0), down = +(at(cell, 'MergeDown') || 0);
        for (let dr = 0; dr <= down; dr++) { grid[r + dr] ||= []; for (let dc = 0; dc <= across; dc++) grid[r + dr][c + dc] = dr || dc ? null : v; }
        c += across;
      }
    }
    const rows = Array.from({ length: grid.length }, (_, i) => { const g = grid[i] || [], a = Array.from({ length: g.length }, (_, k) => g[k] ?? null); while (a.length && a[a.length - 1] === null) a.pop(); return a; });
    out.push({ name: at(ws, 'Name') || `Sheet${out.length + 1}`, rows });
  }
  return out;
}
