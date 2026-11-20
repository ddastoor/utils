// CSV / Excel viewer & converter (PC). Engine: sheet.wasm — our Rust build of calamine (reads .xlsx .xlsm .xlsb .xls
// .ods), rust_xlsxwriter (writes .xlsx) and csv (RFC 4180, delimiter detection). Around it (src/lib/sheetdata.ts): the
// text encoding of a CSV, JSON in and out, numbers as Excel shows them, and "Excel" files that are web pages or Excel
// 2003 XML (the browser's DOMParser). The newest file wins; nothing is uploaded.
import { h, card, field, stack, note, actions, button, toggle, input, select, segmented, filePicker, clear, toast, errMsg, downloadBlob, baseName, type Mount } from '../ui';
import { sheetEngine, type Book } from '../wasm/sheet';
import { colName, cellText, decodeText, sniffText, jsonToBook, rowsToJson, rowsAsText, htmlTables, spreadsheetML } from '../lib/sheetdata';

const MAX_ROWS = 1000; // rows drawn in the table (all rows are exported)
const DELIMS: Record<string, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };

export const mount: Mount = async (root) => {
  let sh!: Awaited<ReturnType<typeof sheetEngine>>; // loaded with the first file (1.4 MB)
  let book: Book | null = null, idx = 0, name = 'data', header = true, numbers = true, filter = '', csvText: string | null = null, delim = '', how = '', seq = 0, live = true;
  let filterTimer: ReturnType<typeof setTimeout> | undefined;
  const info = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const tabs = h('div', { class: 'row sheet-tabs' });
  const table = h('div', { class: 'sheet-wrap' });
  const editor = h('div', { class: 'stack', hidden: true });
  const delimSel = select([['', 'Detect automatically'], [',', 'Comma ,'], [';', 'Semicolon ;'], ['\t', 'Tab'], ['|', 'Pipe |']], '', (v) => { delim = v; if (csvText !== null) parseCsv(); }) as HTMLSelectElement;
  const delimBox = field('Separator', delimSel);

  const render = () => {
    if (!book) return;
    const s = book.sheets[idx], all = s.rows;
    const width = all.reduce((m, r) => Math.max(m, r.length), 0);
    const f = filter.trim().toLowerCase();
    // the rows to show, with their numbers (the header stays at the top while filtering)
    const pick: number[] = [];
    for (let i = 0; i < all.length && pick.length < MAX_ROWS + (header ? 1 : 0); i++) if (!f || (header && i === 0) || all[i].some((c) => cellText(c).toLowerCase().includes(f))) pick.push(i);
    let matching = -1;
    if (f) { matching = 0; for (let i = header ? 1 : 0; i < all.length; i++) if (all[i].some((c) => cellText(c).toLowerCase().includes(f))) matching++; }
    const t = h('table', { class: 'sheet-table' });
    t.append(h('thead', null, h('tr', null, h('th', { class: 'rn' }, ''), ...Array.from({ length: width }, (_, c) => h('th', null, colName(c))))));
    const tb = h('tbody');
    for (const i of pick) {
      const r = all[i], hdr = header && i === 0;
      tb.append(h('tr', { class: hdr ? 'hdr' : null }, h('td', { class: 'rn' }, String(i + 1)), ...Array.from({ length: width }, (_, c) => { const v = r[c]; return h('td', { class: typeof v === 'number' ? 'num' : null }, cellText(v)); })));
    }
    t.append(tb);
    clear(table).append(t);
    const total = f ? matching : all.length - (header ? 1 : 0), drawn = pick.length - (header && pick[0] === 0 ? 1 : 0);
    const sep = csvText !== null && book.delimiter ? ` · separator: ${DELIMS[book.delimiter] || JSON.stringify(book.delimiter)}${delim ? '' : ' (detected)'}` : '';
    info.textContent = `${s.name}: ${all.length.toLocaleString('en-IN')} rows × ${width} columns${f ? ` · ${matching.toLocaleString('en-IN')} matching` : ''}${total > drawn ? ` · showing the first ${drawn.toLocaleString('en-IN')} (exports include every row)` : ''}${sep}${how ? ` · read as ${how}` : ''}${s.error ? ` · ${s.error}` : ''}`;
  };
  const drawTabs = () => {
    clear(tabs);
    if (!book || book.sheets.length < 2) return;
    tabs.append(segmented(book.sheets.map((s, i) => [String(i), `${s.name}${s.hidden ? ' (hidden)' : ''}`] as [string, string]), String(idx), (v) => { idx = +v; render(); }));
  };
  const parseCsv = () => {
    book = sh.csv(new TextEncoder().encode(csvText!), delim);
    book.sheets[0].name = name;                     // the sheet of a CSV is named after the file (in the .xlsx too)
    delimBox.hidden = false; drawTabs(); render();
  };
  const open = async (f: File) => {
    const my = ++seq;
    try {
      const engine = await sheetEngine(), bytes = new Uint8Array(await f.arrayBuffer());
      if (my !== seq || !live) return;                // a newer file was chosen meanwhile, or the tab was left
      sh = engine;
      const ext = (f.name.split('.').pop() || '').toLowerCase(), zipOrOle = (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);
      let next: Book, text: string | null = null, enc = '';
      if (!bytes.length) throw new Error(`${f.name} is empty.`);
      if (zipOrOle && ext !== 'csv' && ext !== 'json') next = sh.read(bytes);
      else {
        const d = decodeText(bytes), kind = sniffText(d.text); enc = d.how;
        if (kind === 'html') {
          const sheets = htmlTables(new DOMParser().parseFromString(d.text, 'text/html'));
          if (!sheets.length) throw new Error(`${f.name} is a web page without a table.`);
          next = { sheets };
        } else if (kind === 'xml2003') {
          const doc = new DOMParser().parseFromString(d.text, 'application/xml');
          if (doc.querySelector('parsererror')) throw new Error(`${f.name} is Excel 2003 XML that is not well-formed.`);
          next = { sheets: spreadsheetML(doc) };
        } else if (ext === 'json' || (kind === 'json' && !['csv', 'tsv', 'txt', 'tab'].includes(ext))) {
          try { next = jsonToBook(d.text, baseName(f.name)); }
          catch (e) { if (ext === 'json') throw new Error(`${f.name} is not valid JSON: ${errMsg(e)}`); text = d.text; next = { sheets: [] }; }
        } else text = d.text;
      }
      name = baseName(f.name); idx = 0; how = enc; csvText = text; delimBox.hidden = true;
      if (text !== null) {
        delim = ext === 'tsv' || ext === 'tab' ? '\t' : ''; delimSel.value = delim;  // a new file: its own separator
        parseCsv();
      } else book = next!;
      if (!book!.sheets.length) throw new Error('No sheets in this file.');
      idx = Math.max(0, book!.sheets.findIndex((s) => !s.hidden && s.rows.length));
      editor.hidden = false; drawTabs(); render();
      toast(`Opened ${f.name}`, 'ok');
    } catch (e) { if (my === seq && live) { toast(errMsg(e), 'err'); info.textContent = errMsg(e); } }
  };
  const cur = () => { if (!book) throw new Error('Open a file first.'); return book.sheets[idx]; };
  const save = (data: BlobPart, type: string, file: string) => downloadBlob(new Blob([data], { type }), file);
  const sheetFile = (ext: string) => `${name}${book && book.sheets.length > 1 ? `-${cur().name}` : ''}.${ext}`.replace(/[\\/:*?"<>|]+/g, '_');

  const search = input({ type: 'search', placeholder: 'Filter rows…', onInput: (v) => {
    filter = v; clearTimeout(filterTimer);
    // a big sheet is filtered when the typing pauses
    if (book && book.sheets[idx].rows.length > 20000) filterTimer = setTimeout(render, 250); else render();
  } });
  editor.append(
    card(null, stack(tabs, h('div', { class: 'row sheet-bar' }, search, delimBox), info, table)),
    card('Options', stack(toggle('First row is a header (JSON keys, bold frozen row in .xlsx)', header, (v) => { header = v; render(); }),
      toggle('Numbers and dates written as text become real numbers and dates in .xlsx and JSON (codes with leading zeros, a + or more digits than a number holds stay text)', numbers, (v) => (numbers = v)))),
    actions(
      button('CSV', () => save('﻿' + sh.csvWrite(rowsAsText(cur().rows), ','), 'text/csv;charset=utf-8', sheetFile('csv')), { icon: 'Download', title: 'This sheet as CSV (UTF-8 with BOM so Excel shows accents and ₹ correctly)' }),
      button('TSV', () => save(sh.csvWrite(rowsAsText(cur().rows), '\t'), 'text/tab-separated-values;charset=utf-8', sheetFile('tsv')), { icon: 'Download', title: 'This sheet as tab-separated text' }),
      button('JSON', () => save(rowsToJson(cur().rows, header, numbers, cur().types), 'application/json', sheetFile('json')), { icon: 'Braces', title: 'This sheet as JSON' }),
      button('Excel .xlsx', () => { if (!book) throw new Error('Open a file first.'); save(sh.xlsx(book, { numbers, header }) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${name}.xlsx`); }, { icon: 'Sheet', variant: 'primary', title: 'Every sheet as an Excel workbook' })));
  root.append(card(null, filePicker({ accept: '.csv,.tsv,.txt,.tab,.json,.xlsx,.xlsm,.xlsb,.xls,.ods,.xml,.htm,.html,text/csv,application/json', label: 'Open a spreadsheet', hint: 'CSV, TSV, Excel (.xlsx .xlsm .xlsb .xls, also the web-page and 2003 XML kinds), LibreOffice (.ods) or JSON — or drop it here', onFiles: ([f]) => open(f) }),
    note('Files are read in this browser; nothing is uploaded. Formulas show their last calculated values.')), editor);
  return () => { live = false; seq++; clearTimeout(filterTimer); };
};
