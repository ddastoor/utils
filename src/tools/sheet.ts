// CSV / Excel viewer & converter (PC). Engine: sheet.wasm — our Rust build of calamine (reads .xlsx .xlsm .xlsb .xls
// .ods), rust_xlsxwriter (writes .xlsx) and csv (RFC 4180, delimiter detection). JSON in/out via the browser's JSON.
import { h, card, field, stack, note, actions, button, segmented, toggle, input, select, filePicker, clear, toast, errMsg, downloadBlob, baseName, type Mount } from '../ui';
import { sheetEngine, type Book, type Cell } from '../wasm/sheet';

const MAX_ROWS = 1000; // rows drawn in the table (all rows are exported)
const colName = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const show = (v: Cell) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v);

/** JSON (array of objects or array of arrays) → one sheet. */
export function jsonToBook(text: string, name = 'JSON'): Book {
  const data = JSON.parse(text), arr = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [data];
  const cell = (v: any): Cell => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : v);
  if (arr.every((r: any) => Array.isArray(r))) return { sheets: [{ name, rows: arr.map((r: any[]) => r.map(cell)) }] };
  const keys: string[] = [];
  for (const r of arr) if (r && typeof r === 'object') for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return { sheets: [{ name, rows: [keys, ...arr.map((r: any) => keys.map((k) => cell(r?.[k])))] }] };
}
/** Rows → JSON text: objects keyed by the first row when it is a header, else arrays. */
export function rowsToJson(rows: Cell[][], header: boolean): string {
  if (!header || !rows.length) return JSON.stringify(rows, null, 2);
  const keys = rows[0].map((k, i) => (show(k).trim() || colName(i)));
  return JSON.stringify(rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? null]))), null, 2);
}

export const mount: Mount = async (root) => {
  const sh = await sheetEngine();
  let book: Book | null = null, idx = 0, name = 'data', header = true, numbers = true, filter = '', raw: Uint8Array | null = null, delim = '';
  const info = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const tabs = h('div', { class: 'row sheet-tabs' });
  const table = h('div', { class: 'sheet-wrap' });
  const editor = h('div', { class: 'stack', hidden: true });
  const delimBox = field('Separator', select([['', 'Detect automatically'], [',', 'Comma ,'], [';', 'Semicolon ;'], ['\t', 'Tab'], ['|', 'Pipe |']], '', (v) => { delim = v; if (raw) parseCsv(); }));

  const render = () => {
    if (!book) return;
    const s = book.sheets[idx], all = s.rows;
    const width = all.reduce((m, r) => Math.max(m, r.length), 0);
    const f = filter.trim().toLowerCase();
    const body = f ? all.filter((r, i) => (header && i === 0) || r.some((c) => show(c).toLowerCase().includes(f))) : all;
    const shown = body.slice(0, MAX_ROWS + (header ? 1 : 0));
    const t = h('table', { class: 'sheet-table' });
    t.append(h('thead', null, h('tr', null, h('th', { class: 'rn' }, ''), ...Array.from({ length: width }, (_, c) => h('th', null, colName(c))))));
    const tb = h('tbody');
    shown.forEach((r, i) => {
      const n = all.indexOf(r) + 1, hdr = header && n === 1;
      tb.append(h('tr', { class: hdr ? 'hdr' : null }, h('td', { class: 'rn' }, String(n)), ...Array.from({ length: width }, (_, c) => { const v = r[c]; return h('td', { class: typeof v === 'number' ? 'num' : null }, show(v ?? null)); })));
    });
    t.append(tb);
    clear(table).append(t);
    info.textContent = `${s.name}: ${all.length.toLocaleString()} rows × ${width} columns${f ? ` · ${body.length - (header ? 1 : 0)} matching` : ''}${body.length > shown.length ? ` · showing the first ${MAX_ROWS.toLocaleString()} (exports include every row)` : ''}${s.error ? ` · ${s.error}` : ''}`;
  };
  const drawTabs = () => {
    clear(tabs);
    if (!book || book.sheets.length < 2) return;
    tabs.append(segmented(book.sheets.map((s, i) => [String(i), `${s.name}${s.hidden ? ' (hidden)' : ''}`] as [string, string]), String(idx), (v) => { idx = +v; render(); }));
  };
  const parseCsv = () => { book = sh.csv(raw!, delim); delimBox.hidden = false; info.textContent = ''; drawTabs(); render(); };
  const open = async (f: File) => {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer()), ext = (f.name.split('.').pop() || '').toLowerCase();
      name = baseName(f.name); idx = 0; raw = null; delimBox.hidden = true;
      if (ext === 'json') book = jsonToBook(new TextDecoder().decode(bytes), name);
      else if (['csv', 'tsv', 'txt', 'tab'].includes(ext) || !(bytes[0] === 0x50 && bytes[1] === 0x4b) && !(bytes[0] === 0xd0 && bytes[1] === 0xcf)) { raw = bytes; book = sh.csv(bytes, ext === 'tsv' || ext === 'tab' ? '\t' : delim); delimBox.hidden = false; }
      else book = sh.read(bytes);
      if (!book.sheets.length) throw new Error('No sheets in this file.');
      idx = Math.max(0, book.sheets.findIndex((s) => !s.hidden && s.rows.length));
      editor.hidden = false; drawTabs(); render();
      toast(`Opened ${f.name}`, 'ok');
    } catch (e) { toast(errMsg(e), 'err'); info.textContent = errMsg(e); }
  };
  const cur = () => { if (!book) throw new Error('Open a file first.'); return book.sheets[idx]; };
  const save = (data: BlobPart, type: string, file: string) => downloadBlob(new Blob([data], { type }), file);
  const sheetFile = (ext: string) => `${name}${book && book.sheets.length > 1 ? `-${cur().name}` : ''}.${ext}`.replace(/[\\/:*?"<>|]+/g, '_');

  const search = input({ type: 'search', placeholder: 'Filter rows…', onInput: (v) => { filter = v; render(); } });
  editor.append(
    card(null, stack(tabs, h('div', { class: 'row sheet-bar' }, search, delimBox), info, table)),
    card('Options', stack(toggle('First row is a header (JSON keys, bold frozen row in .xlsx)', header, (v) => { header = v; render(); }),
      toggle('Turn numbers stored as text into real numbers in .xlsx (keeps codes with leading zeros as text)', numbers, (v) => (numbers = v)))),
    actions(
      button('CSV', () => save('﻿' + sh.csvWrite(cur().rows, ','), 'text/csv;charset=utf-8', sheetFile('csv')), { icon: 'Download', title: 'This sheet as CSV (UTF-8 with BOM so Excel shows accents and ₹ correctly)' }),
      button('TSV', () => save(sh.csvWrite(cur().rows, '\t'), 'text/tab-separated-values;charset=utf-8', sheetFile('tsv')), { icon: 'Download', title: 'This sheet as tab-separated text' }),
      button('JSON', () => save(rowsToJson(cur().rows, header), 'application/json', sheetFile('json')), { icon: 'Braces', title: 'This sheet as JSON' }),
      button('Excel .xlsx', () => { if (!book) throw new Error('Open a file first.'); save(sh.xlsx(book, { numbers, header }) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${name}.xlsx`); }, { icon: 'Sheet', variant: 'primary', title: 'Every sheet as an Excel workbook' })));
  root.append(card(null, filePicker({ accept: '.csv,.tsv,.txt,.tab,.json,.xlsx,.xlsm,.xlsb,.xls,.ods,text/csv,application/json', label: 'Open a spreadsheet', hint: 'CSV, TSV, Excel (.xlsx .xlsm .xlsb .xls), LibreOffice (.ods) or JSON — or drop it here', onFiles: ([f]) => open(f) }),
    note('Files are read in this browser; nothing is uploaded. Formulas show their last calculated values.')), editor);
};
