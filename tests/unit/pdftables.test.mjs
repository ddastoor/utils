// PDF Tables → Excel (src/lib/pdftables.ts on textcore.wasm's table.c), held to:
//   · known answers: what is a number or a date, how a cell's wrapped lines join, amounts and dates typed for Excel;
//   · the test PDFs (tests/fixtures/tables, scripts/make-table-pdfs.py) — every row of the statement as printed, on two pages
//     with its header repeated (columns that line up; and the same in a ruled grid), the bill's two small tables among its
//     paragraphs; a table drawn by hand; the statement's first page scanned and read by Tesseract;
//   · pdfplumber (an independent reader of ruled tables, Python) on the ruled statement: the same cells;
//   · the Excel file read back by openpyxl: amounts numbers, dates dates, reference numbers text.
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';

const F = (n) => fileURLToPath(new URL(`../fixtures/tables/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));

export default async (t, { load, wasm }) => {
  const T = await load('/src/lib/pdftables.ts');
  const { readRules } = await load('/src/lib/pdf2epub.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const { bindSheet } = await load('/src/wasm/sheet.ts');
  const { readingOf } = await load('/src/lib/ocr.ts');
  const tc = bindTextcore(await wasm('textcore')), sheet = bindSheet(await wasm('sheet'));
  const mupdf = await import('mupdf');
  const find = (w, n, r, force) => tc.tables(w, n, r, force);

  // ---- known answers
  for (const s of ['1,25,000.00', '64.75', '(1,234.00)', '1,234.00 Dr', '48,250.75 Cr', '₹ 2,032.71', 'Rs.500', '07/11/2026', '7-11-26', '186', '0.35'])
    t.ok(T.isNum(s), `a number or a date: ${s}`);
  for (const s of ['Narration', 'Value Date', 'ravi@okhdfcbank', 'Chq./Ref.', 'units']) t.ok(!T.isNum(s), `no number: ${s}`);
  const ty = [['1,25,000.00', 125000], ['64.75', 64.75], ['(1,234.00)', -1234], ['1,234.00 Dr', -1234], ['48,250.75 Cr', 48250.75], ['₹ 2,032.71', 2032.71], ['Rs. 500', 500],
    ['1,234.50-', -1234.5], ['07/11/2026', '2026-11-07'], ['7-11-26', '2026-11-07'], ['7 Nov 2026', '2026-11-07'], ['07-Nov-2026', '2026-11-07'], ['31/02/2026', '31/02/2026'],
    ['180286211622', '180286211622'], ['005953', '005953'], ['30019876543210', '30019876543210'], ['16 %', '16 %'], ['INTEREST CREDIT', 'INTEREST CREDIT'], ['', '']];
  for (const [s, want] of ty) t.eq(T.typed(s), want, `typed: “${s}” → ${JSON.stringify(want)}`);
  // a date's printed form as Excel's number format (separators escaped: a bare / is the computer's own date separator)
  const df = [['07/11/2026', 'dd\\/mm\\/yyyy'], ['7-11-26', 'd\\-mm\\-yy'], ['7 Nov 2026', 'd mmm yyyy'], ['07-Nov-2026', 'dd\\-mmm\\-yyyy'], ['7 November 2026', 'd mmmm yyyy'],
    ['01.11.2026', 'dd\\.mm\\.yyyy'], ['31/02/2026', null], ['64.75', null], ['2026-11-07', null], ['Narration', null]];
  for (const [s, want] of df) t.eq(T.dateFormat(s), want, `dateFormat: “${s}” → ${JSON.stringify(want)}`);
  t.eq(T.excelCell('07/11/2026'), { date: '2026-11-07', format: 'dd\\/mm\\/yyyy', shown: '07/11/2026' }, 'excelCell: a date with its printed form');
  t.eq(T.excelCell('1,25,000.00'), 125000, 'excelCell: an amount a number');
  t.eq(T.excelCell('005953'), '005953', 'excelCell: a reference text');
  const W = (text, x0, y0, x1, y1) => ({ text, box: [x0, y0, x1, y1], line: 0 });
  t.eq(T.cellText([W('NARMADA', 10, 20, 50, 28), W('CHQ', 10, 10, 30, 18), W('DEP/CLEARING/', 34, 10, 90, 18), W('PACKAGING', 54, 20, 90, 28)]), 'CHQ DEP/CLEARING/NARMADA PACKAGING', 'a cell’s lines: a space between words, nothing after a line ending in “/”');
  t.eq(T.cellText([W('KAVERI', 10, 10, 40, 18), W('FOODS', 44, 10, 70, 18), W('LTD', 10, 20, 30, 28)]), 'KAVERI FOODS LTD', 'a cell’s lines: a space after a word');
  // an account's details over a statement, as the OCR reads them (its gaps wider): lines of "label: value" whose second chunk
  // stands in the first one's column are no table (the browser's reading of statement-scan.pdf made one of them)
  const L = (y, ...ws) => ws.map(([text, x0, x1]) => W(text, x0, y, x1, y + 10));
  const details = [...L(100, ['Account', 50, 85], ['holder:', 88, 118], ['Ms', 121, 133], ['Asha', 136, 156], ['Deshpande,', 159, 205], ['14', 220, 230], ['Gangapur', 233, 270], ['Road,', 273, 295], ['Nashik', 298, 325], ['422013', 328, 355]),
    ...L(113, ['Account', 50, 85], ['number:', 88, 120], ['30019876543210', 123, 190], ['IFSC:', 220, 245], ['NARM0000123', 248, 305], ['Branch:', 325, 355], ['Nashik', 358, 385], ['Main', 388, 410]),
    ...L(126, ['Opening', 50, 85], ['balance:', 88, 122], ['48,250.75', 130, 172], ['Cr', 175, 185])];
  t.eq(T.pageTables(details, [], 0, find).length, 0, 'label: value lines whose chunks share a column: no table');
  const grid3 = [0, 1, 2].flatMap((r) => [W('01/11/2026', 50, 100 + 13 * r, 95, 110 + 13 * r), W('INTEREST', 120, 100 + 13 * r, 160, 110 + 13 * r), W('64.75', 250, 100 + 13 * r, 275, 110 + 13 * r)]);
  t.eq(T.pageTables(grid3, [], 0, find).length, 1, 'three rows whose chunks stand in three columns: a table');

  // ---- the test PDFs
  const read = (name, o = {}) => {
    const doc = mupdf.Document.openDocument(readFileSync(F(name)), 'application/pdf'), out = [];
    for (let i = 0; i < doc.countPages(); i++) {
      const p = doc.loadPage(i), rl = readRules(mupdf, p, doc.asPDF());
      out.push(...T.pageTables(T.pageWords(p), T.rulesOf(rl), i, find)); rl.release();
    }
    return o.join === false ? out : T.joinPages(out);
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const firstDiff = (got, want) => { for (let i = 0; i < Math.max(got.length, want.length); i++) if (!same(got[i], want[i])) return `row ${i + 1}: ${JSON.stringify(got[i])} ≠ ${JSON.stringify(want[i])}`; return ''; };
  const st = read('statement.pdf');
  t.ok(st.length === 1 && same(st[0].pages, [0, 1]) && st[0].kind === 'stream', `the statement: one table, joined over its two pages (${st.map((x) => `${x.kind} p${x.pages}`).join(', ')})`);
  t.ok(same(st[0].head, TRUTH.statement.head), `its header: ${JSON.stringify(st[0].head)}`);
  t.ok(st[0].rows.length === 46 && !firstDiff(st[0].rows, TRUTH.statement.rows), `its 46 rows as printed — narrations wrapped over lines joined${firstDiff(st[0].rows, TRUTH.statement.rows) ? ` — ${firstDiff(st[0].rows, TRUTH.statement.rows)}` : ''}`);
  t.ok(st[0].boxes.length === 2 && st[0].boxes.every((b) => b.cols.length === 8), 'its place on each page with its seven columns');
  const apart = read('statement.pdf', { join: false });
  t.ok(apart.length === 2 && apart[0].rows.length + apart[1].rows.length === 46 && same(apart[1].head, TRUTH.statement.head), 'not joined: a table a page, each with its header');
  const ru = read('statement-ruled.pdf');
  t.ok(ru.length === 1 && ru[0].kind === 'ruled' && same(ru[0].head, TRUTH['statement-ruled'].head) && !firstDiff(ru[0].rows, TRUTH['statement-ruled'].rows), `the ruled statement: the grid read, the same 46 rows${firstDiff(ru[0].rows, TRUTH['statement-ruled'].rows) ? ` — ${firstDiff(ru[0].rows, TRUTH['statement-ruled'].rows)}` : ''}`);
  const bill = read('bill.pdf');
  t.ok(bill.length === 2, `the bill: two tables among its paragraphs (${bill.length})`);
  TRUTH.bill.tables.forEach((tb, k) => t.ok(bill[k] && same(bill[k].head, tb.head) && !firstDiff(bill[k].rows, tb.rows), `the bill’s table ${k + 1}: header and rows as printed${bill[k] ? firstDiff(bill[k].rows, tb.rows) : ''}`));

  // a table drawn by hand: the words inside the box, one table whatever their lines
  {
    const doc = mupdf.Document.openDocument(readFileSync(F('bill.pdf')), 'application/pdf'), p = doc.loadPage(0);
    const words = T.pageWords(p), usage = bill[1].boxes[0].box, pad = 6;
    const inside = words.filter((w) => w.box[0] >= usage[0] - pad && w.box[2] <= usage[2] + pad && w.box[1] >= usage[1] - pad && w.box[3] <= usage[3] + pad);
    const drawn = T.pageTables(inside, [], 0, (w, n, r) => find(w, n, r, true));
    t.ok(drawn.length === 1 && same(drawn[0].head, TRUTH.bill.tables[1].head) && !firstDiff(drawn[0].rows, TRUTH.bill.tables[1].rows), 'a box drawn round the use table: that table');
    const two = words.filter((w) => w.box[1] > usage[1] - 40 && w.box[3] < usage[1] + 30);
    const forced = T.pageTables(two, [], 0, (w, n, r) => find(w, n, r, true));
    t.ok(forced.length === 1 && forced[0].rows.length >= 1, 'a box round two lines only: still read as a table (the reader drew it)');
  }

  // ---- pdfplumber, an independent reader of ruled tables
  const py = spawnSync('python3', ['-c', `import sys, json, pdfplumber
out = []
with pdfplumber.open(sys.argv[1]) as pdf:
  for p in pdf.pages:
    for tb in p.extract_tables():
      out.append(tb)
print(json.dumps(out))`, F('statement-ruled.pdf')], { encoding: 'utf8' });
  if (py.status === 0) {
    const theirs = JSON.parse(py.stdout).flat().map((r) => r.map((c) => (c || '').replace(/\s+/g, '')));
    const ours = [ru[0].head, ...ru[0].rows].map((r) => r.map((c) => c.replace(/\s+/g, '')));
    const theirsData = theirs.filter((r) => r.join('|') !== ours[0].join('|')), oursData = ours.slice(1);
    t.ok(theirsData.length === oursData.length && !firstDiff(oursData, theirsData), `pdfplumber reads the ruled statement’s cells as we do (${theirsData.length} rows)${firstDiff(oursData, theirsData) ? ` — ${firstDiff(oursData, theirsData)}` : ''}`);
  } else t.ok(true, `pdfplumber could not run — skipped (${(py.stderr || '').trim().split('\n').pop()})`);

  // ---- the Excel file, read back by openpyxl
  const rows = [st[0].head, ...st[0].rows.map((r) => r.map(T.excelCell))];
  const xlsx = sheet.xlsx({ sheets: [{ name: 'Statement', rows }] }, { dates: true, header: true });
  const dir = mkdtempSync(join(tmpdir(), 'pdftables-')), path = join(dir, 'statement.xlsx'); writeFileSync(path, xlsx);
  const op = spawnSync('python3', ['-c', `import sys, json, openpyxl
ws = openpyxl.load_workbook(sys.argv[1]).active
print(json.dumps([[type(c.value).__name__ for c in row] for row in ws.iter_rows(min_row=2, max_row=4)]))
print(json.dumps([[str(c.value) for c in row] for row in ws.iter_rows(min_row=2, max_row=2)]))
print(json.dumps([ws.cell(2, 1).number_format, ws.cell(2, 4).number_format]))`, path], { encoding: 'utf8' });
  if (op.status === 0) {
    const [types, vals, fmts] = op.stdout.trim().split('\n').map((l) => JSON.parse(l));
    t.ok(types[0][0] === 'datetime' && types[0][3] === 'datetime' && (types[0][5] === 'float' || types[0][5] === 'int'), `openpyxl: dates are dates, amounts numbers (${types[0].join(', ')})`);
    t.ok(vals[0][0] === '2026-11-01 00:00:00' && fmts.every((f) => f === 'dd\\/mm\\/yyyy'), `openpyxl: the date 1 November 2026, shown as printed (${vals[0][0]}, ${fmts.join(', ')})`);
    t.ok(types.every((r) => r[1] === 'str') && vals[0][2] === '005953' && vals[0][6] === '50750.75', `narrations and reference numbers stay text, the balance a number (${vals[0].join(' | ')})`);
  } else t.ok(true, 'openpyxl could not run — skipped');
  const back = sheet.read(xlsx).sheets[0].rows;
  t.ok(back.length === 47 && (back[1][4] === null || back[1][4] === '' || back[1][4] === undefined), 'read back by the app’s own reader: 46 rows under the header, empty cells empty');
  // LibreOffice shows the cells as a spreadsheet does: the dates as the PDF printed them, whatever the computer's date settings
  // (the CSV filter's 9th option: the cells as shown, in their number formats)
  const lo = spawnSync('soffice', ['--headless', `-env:UserInstallation=file://${join(dir, 'lo-profile').replace(/\\/g, '/')}`, '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,true,false,false', '--outdir', dir, path], { encoding: 'utf8', timeout: 120000 });
  if (lo.status === 0 && existsSync(join(dir, 'statement.csv'))) {
    const shown = readFileSync(join(dir, 'statement.csv'), 'utf8').split(/\r?\n/)[1].split(',');
    t.ok(shown[0] === '01/11/2026' && shown[3] === '01/11/2026', `LibreOffice shows the dates as printed (${shown.slice(0, 4).join(' | ')})`);
  } else t.ok(true, 'LibreOffice could not run — skipped');

  // ---- the scanned statement: read by Tesseract (the OCR tab's engine), its words' boxes in points
  const require = createRequire(import.meta.url);
  const { createWorker, OEM } = require('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int', import.meta.url)), gzip: true, cacheMethod: 'none' });
  const scan = mupdf.Document.openDocument(readFileSync(F('statement-scan.pdf')), 'application/pdf'), sc = 300 / 72;
  const pix = scan.loadPage(0).toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true);
  const ppm = Buffer.concat([Buffer.from(`P6\n${pix.getWidth()} ${pix.getHeight()}\n255\n`), Buffer.from(pix.getPixels())]);
  const r = readingOf((await worker.recognize(ppm, { tessedit_pageseg_mode: '3' }, { text: true, blocks: true })).data);
  await worker.terminate();
  const sct = T.pageTables(T.ocrWords(r, 1 / sc), [], 0, find);
  const want = TRUTH.statement.rows.slice(0, st[0].boxes[0].rows.length - 2);
  const got = sct[0]?.rows || [];
  let cells = 0, right = 0;
  want.forEach((row, i) => row.forEach((c, k) => { cells++; if ((got[i]?.[k] || '').replace(/\s+/g, '') === c.replace(/\s+/g, '')) right++; }));
  t.ok(sct.length === 1 && got.length === want.length && right >= 0.9 * cells, `the scanned first page: one table, ${got.length} of ${want.length} rows, ${right} of ${cells} cells as printed`);
  t.ok(sct[0] && sct[0].head.length === 7 && /Date/.test(sct[0].head[0]) && /Balance/.test(sct[0].head[6]), `its header, set apart by a rule, read with it (${JSON.stringify(sct[0]?.head)})`);
};
