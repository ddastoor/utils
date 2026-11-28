// sheet.wasm (Rust: calamine + rust_xlsxwriter + csv, built by us): real .xlsx/.xls/.xlsb/.ods files (python-calamine
// test data) give the same cells; CSV detection and quoting; xlsx round trip; clear errors.
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from '../lib/child.mjs';
export default async (t, { load, wasm, root }) => {
  const { bindSheet } = await load('/src/wasm/sheet.ts');
  const sh = bindSheet(await wasm('sheet'));
  const F = (n) => new Uint8Array(readFileSync(`${root}/tests/fixtures/sheets/${n}`));
  const want = ['String', 1, 1.1, true, false, '2010-10-10', '2010-10-10 10:10:10', '10:10:10'];
  for (const f of ['base.xlsx', 'base.xls', 'base.xlsb', 'base.ods']) {
    const b = sh.read(F(f)), r = b.sheets[0].rows[1];
    t.eq(b.sheets[0].name, 'Sheet1', `${f}: first sheet name`);
    t.eq(r.slice(0, 8), want, `${f}: text, numbers, booleans, date, date-time, time`);
    t.ok(b.sheets.some((s) => s.name === 'Merged Cells'), `${f}: all sheets listed`);
  }
  t.eq(sh.read(F('base.ods')).sheets[0].rows[1][9], '255:10:10', 'ods duration over 24 h → 255:10:10');
  const any = sh.read(F('any_sheets.xlsx'));
  t.eq(any.sheets.map((s) => [s.name, !!s.hidden]), [['Visible', false], ['Hidden', true], ['VeryHidden', true], ['Chart', false]], 'hidden sheets flagged');
  t.eq(any.sheets[0].rows.slice(0, 3), [[1, 2], [3, 4], [5, 6]], 'numbers');
  t.throws(() => sh.read(F('password.xlsx')), 'encrypted workbook → error');
  try { sh.read(F('password.xlsx')); } catch (e) { t.ok(/password-protected/.test(e.message), 'encrypted workbook explained'); }
  try { sh.read(F('empty_file.xlsx')); } catch (e) { t.ok(/empty/.test(e.message), 'empty file explained'); }
  try { sh.read(new TextEncoder().encode('just text')); } catch (e) { t.ok(/Cannot read/.test(e.message), 'non-spreadsheet refused'); }
  // CSV
  const enc = (s) => new TextEncoder().encode(s);
  t.eq(sh.csv(enc('a,b,c\n1,2,3\n')).sheets[0].rows, [['a', 'b', 'c'], ['1', '2', '3']], 'comma CSV');
  const semi = sh.csv(enc('name;city;amount\n"Rao, Asha";Pune;1.234,50\n'));
  t.eq([semi.delimiter, semi.sheets[0].rows[1]], [';', ['Rao, Asha', 'Pune', '1.234,50']], 'semicolon detected (comma inside quotes ignored)');
  t.eq(sh.csv(enc('x\ty\n1\t2\n')).delimiter, '\t', 'tab detected');
  t.eq(sh.csv(enc('a|b\nc|d\n')).delimiter, '|', 'pipe detected');
  t.eq(sh.csv(enc('﻿h1,h2\n"multi\nline","say ""hi"""\n')).sheets[0].rows, [['h1', 'h2'], ['multi\nline', 'say "hi"']], 'BOM, quoted newline and escaped quotes');
  t.eq(sh.csv(enc('a,b\n1\n2,3,4\n')).sheets[0].rows, [['a', 'b'], ['1'], ['2', '3', '4']], 'ragged rows kept');
  t.eq(sh.csv(enc('नाम,शहर\nआशा,पुणे\n')).sheets[0].rows[1], ['आशा', 'पुणे'], 'UTF-8 (Devanagari)');
  t.eq(sh.csvWrite([['a', 'b,c'], ['x "y"', null], [1, true]]), 'a,"b,c"\n"x ""y""",\n1,true\n', 'CSV writing quotes when needed');
  t.eq(sh.csvWrite([['a', 'b']], '\t'), 'a\tb\n', 'TSV writing');
  // xlsx round trip
  const book = { sheets: [{ name: 'Data', rows: [['Name', 'Amount', 'PIN'], ['Asha', '1234.5', '007'], ['Ravi', 99, '411001']] }, { name: 'Bad:/Name?', rows: [[true]] }] };
  const x = sh.xlsx(book, { numbers: true, header: true }), back = sh.read(x);
  t.ok(x[0] === 0x50 && x[1] === 0x4b, 'xlsx is a zip');
  t.eq(back.sheets.map((s) => s.name), ['Data', 'BadName'], 'sheet names kept (invalid characters removed)');
  t.eq(back.sheets[0].rows, [['Name', 'Amount', 'PIN'], ['Asha', 1234.5, '007'], ['Ravi', 99, 411001]], 'numbers converted; leading-zero codes stay text');
  t.eq(sh.read(sh.xlsx(book)).sheets[0].rows[1], ['Asha', '1234.5', '007'], 'without conversion everything stays as typed');
  const big = { sheets: [{ name: 'Big', rows: Array.from({ length: 20000 }, (_, i) => [i, `row ${i}`, i * 1.5]) }] };
  t.eq(sh.read(sh.xlsx(big)).sheets[0].rows[19999], [19999, 'row 19999', 29998.5], '20,000-row round trip');

  // ---- column types for a database import: only what loses nothing (every row but the header decides)
  const types = (csv) => sh.csv(enc(csv)).sheets[0].types;
  t.eq(types(`id,pin,phone,amount,big,mix,dec,exp,empty,date,neg,flt17,long
1,011001,+919876543210,10.5,1234567890123456789,5,0.5,1e3,,2026-11-17,-5,0.30000000000000004,3.141592653589793238
2,400001,9876543210,7,9007199254740993,x,.5,2.5E-3,,2026-01-01,0,1.0,2.5
`), ['INTEGER', 'TEXT', 'TEXT', 'REAL', 'INTEGER', 'TEXT', 'REAL', 'REAL', 'TEXT', 'TEXT', 'INTEGER', 'REAL', 'TEXT'],
  'whole numbers INTEGER (also beyond 2^53), decimals REAL; PIN codes with a leading zero, +91… numbers, mixed columns, dates, empty columns and decimals longer than a double stay TEXT');
  const one = (v) => types(`h\n"${v}"\n`)[0];        // quoted, so that "1,5" is one cell
  const INT = ['0', '7', '-7', '9223372036854775807', '-9223372036854775808', ' 12 ', '1000000'];
  const REAL = ['1.5', '-0.25', '.5', '5.', '0.0', '-0', '1e3', '1E3', '1e+5', '12e-1', '2.5e-3', '1.7976931348623157e308', '5e-324', '0.1', '100.0', '9007199254740992.0', '1e22'];
  const TEXT = ['007', '00', '-07', '+5', '+1.5', '00.5', '9223372036854775808', '99999999999999999999', '9007199254740993.0', '0.1234567890123456789', '1e999', '1e-999', '1,5', '1 000', '1_000', '0x10', 'NaN', 'inf', 'Infinity', '-', '.', 'e5', '1e', '1e+', '1.2.3', '१२', '12abc', '1-2', '2026-11-17', '12:30', '₹5', '5%', 'true', '1e1000000'];
  t.eq(INT.map(one), INT.map(() => 'INTEGER'), `INTEGER: ${INT.join('  ')}`);
  t.eq(REAL.map(one), REAL.map(() => 'REAL'), `REAL: ${REAL.join('  ')}`);
  t.eq(TEXT.map(one), TEXT.map(() => 'TEXT'), `TEXT: ${TEXT.join('  ')}`);
  for (const v of REAL) t.ok(Number(v) === Number(v) && Number.isFinite(Number(v)), `REAL "${v}" is a finite number in JavaScript too`);
  t.eq(types('a,b\n1\n2,3,4\n'), ['INTEGER', 'INTEGER', 'INTEGER'], 'ragged rows: as many types as the longest row has cells');
  t.eq([types('a,b,c\n'), types(''), types('a\n\n \n')], [['TEXT', 'TEXT', 'TEXT'], [], ['TEXT']], 'a header alone, an empty file, empty cells only: TEXT');
  t.eq(types('n\n1\n2.5\n3\n'), ['REAL'], 'whole numbers and decimals in one column: REAL');
  t.eq(types('n\n1\n\n3\n'), ['INTEGER'], 'empty cells do not change the type');
  const typed = sh.read(sh.xlsx({ sheets: [{ name: 'T', rows: [['n', 'f', 's', 'b', 'mixed', 'bigf'], [1, 1.5, 'a', true, 1, 1e300], [2, 2, 'b', false, 'x', 2]] }] }, { numbers: false })).sheets[0];
  t.eq(typed.types, ['INTEGER', 'REAL', 'TEXT', 'INTEGER', 'TEXT', 'REAL'], 'typed cells of a workbook: whole numbers and booleans INTEGER, other numbers REAL, anything mixed with text TEXT');
  t.eq(sh.read(F('base.xlsx')).sheets[0].types.length, sh.read(F('base.xlsx')).sheets[0].rows.reduce((a, r) => Math.max(a, r.length), 0), 'a real workbook: one type per column');
  // ---- what LibreOffice Calc shows for every cell of real workbooks (tests/fixtures/sheets/reference.json, made by
  // scripts/make-sheet-fixtures.py with soffice --convert-to csv): numbers to 15 digits, error values, durations,
  // booleans (LibreOffice writes an .xls's as 1 / 0), times (it adds AM / PM and keeps hundredths)
  const REF = JSON.parse(readFileSync(`${root}/tests/fixtures/sheets/reference.json`, 'utf8')).files;
  const { cellText, colName, decodeText } = await load('/src/lib/sheetdata.ts');
  const secs = (s) => { const m = /^(-?)(\d+):(\d\d):(\d\d)(?:[.,]\d+)?(?:\s*([AP]M))?$/.exec(s); if (!m) return null; let h = +m[2]; if (m[5] === 'PM' && h < 12) h += 12; if (m[5] === 'AM' && h === 12) h = 0; return (m[1] ? -1 : 1) * (h * 3600 + +m[3] * 60 + +m[4]); };
  const same = (ours, lo) => {
    const a = cellText(ours ?? null);
    if (a === lo) return true;
    if (typeof ours === 'boolean') return lo === (ours ? '1' : '0');
    if (typeof ours === 'number') { const n = Number(lo); return lo !== '' && Number.isFinite(n) && Math.abs(n - ours) <= Math.abs(ours) * 1e-14; }
    const sa = secs(a), sb = secs(lo);
    return sa !== null && sa === sb;
  };
  for (const f of ['kinds.xlsx', 'base.xlsx', 'base.xls', 'base.ods']) {
    const b = sh.read(F(f));
    for (const [name, rows] of Object.entries(REF[f])) {
      const s = b.sheets.find((x) => x.name === name);
      if (!s) { t.ok(false, `${f}: sheet ${name} is read`); continue; }
      const bad = [];
      rows.forEach((r, i) => r.forEach((lo, c) => { if (!same(s.rows[i]?.[c], lo)) bad.push(`${colName(c)}${i + 1}: ours ${JSON.stringify(s.rows[i]?.[c])} / LibreOffice ${JSON.stringify(lo)}`); }));
      t.eq(bad, [], `${f} › ${name}: every cell as LibreOffice shows it`);
    }
  }
  const k = sh.read(F('kinds.xlsx')).sheets[0].rows;
  t.eq(k.slice(1, 8).map((r) => r[1]), ['#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!', '#REF!', '#VALUE!'], 'Excel\'s error values as Excel writes them (they were #DIV0, #NA, #NAME …)');
  t.eq(k.slice(8, 11).map((r) => r[1]), ['30:00:00', '2:30:15', '255:10:10'], 'durations: the hours go on past 24 (30 hours was shown as 06:00:00)');
  t.eq(sh.read(F('base.xlsx')).sheets[0].rows[1][9], '255:10:10', 'base.xlsx: the duration of 255 hours (was 1900-01-10 15:10:10)');
  t.eq(k.slice(11, 17).map((r) => cellText(r[1])), ['0.3', '1E+21', '1.25E-7', '9007199254740992', '1234567890123456', '0.333333333333333'], 'numbers shown as Excel shows them: 15 digits (0.1 + 0.2 is 0.3), exponents for the very large and small');
  // ---- the text encodings Excel saves CSV in (the reference is Python's csv module with the known encoding)
  for (const [f, how] of [['cp1252.csv', 'Windows-1252'], ['utf16.txt', 'UTF-16']]) {
    const d = decodeText(F(f)), b = sh.csv(enc(d.text));
    t.eq([d.how, b.sheets[0].rows], [how, REF[f].CSV], `${f}: read as ${how}, every cell as Python reads it`);
  }
  t.eq(decodeText(enc('\uFEFFa,b')).text, 'a,b', 'UTF-8 with a byte-order mark: the mark is dropped');
  t.throws(() => decodeText(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 1, 2])), 'a binary file is refused');
  // ---- numbers and dates written as text → .xlsx: only where nothing is lost
  const conv = (v) => sh.read(sh.xlsx({ sheets: [{ name: 'C', rows: [['h'], [v]] }] }, { numbers: true, header: true })).sheets[0].rows[1][0];
  for (const [v, want] of [['42', 42], ['-12', -12], [' 42 ', 42], ['1.50', 1.5], ['0.1', 0.1], ['1e5', 100000], ['9007199254740992', 9007199254740992], ['-0.25', -0.25]]) t.eq(conv(v), want, `"${v}" becomes the number ${want}`);
  for (const v of ['007', '+919876543210', '+5', '1234567890123456789', '9007199254740993', '0.1234567890123456789', '1,5', '₹5', 'NaN', 'inf', '-007']) t.eq(conv(v), v, `"${v}" stays text (a code, a + or more digits than a number holds; a phone number with + was 919876543210)`);
  for (const [v, want] of [['2026-11-20', '2026-11-20'], ['2026-11-20 10:30:15', '2026-11-20 10:30:15'], ['2026-11-20T10:30', '2026-11-20 10:30:00'], ['10:30:15', '10:30:15'], ['10:30', '10:30:00']]) t.eq(conv(v), want, `"${v}" becomes a date / time (read back as ${want})`);
  for (const v of ['2026-13-01', '2026-02-30', '31/12/2026', '25:00:00', '10:61', '1:2', '2026-11-20 25:00', '2026-1-5']) t.eq(conv(v), v, `"${v}" stays text`);
  // ---- Excel's limits, said in words; sheet names Excel accepts
  const xerr = (b) => { try { sh.xlsx(b); return ''; } catch (e) { return e.message; } };
  t.ok(/^Cell C2 of “L” holds 40000 characters; an Excel cell holds at most 32,767/.test(xerr({ sheets: [{ name: 'L', rows: [['a'], ['x', 'y', 'z'.repeat(40000)]] }] })), 'a cell over 32,767 characters: named in A1 notation');
  t.ok(/has 16385 columns; an Excel sheet holds at most 16,384/.test(xerr({ sheets: [{ name: 'W', rows: [Array(16385).fill('a')] }] })), 'more than 16,384 columns: said');
  t.ok(/has 1048577 rows; an Excel sheet holds at most 1,048,576/.test(xerr({ sheets: [{ name: 'R', rows: Array.from({ length: 1048577 }, () => []) }] })), 'more than 1,048,576 rows: said');
  const names = sh.read(sh.xlsx({ sheets: ['Data', 'data', '', 'History', "'quoted'", 'a/b:c', 'x'.repeat(40), 'x'.repeat(40)].map((name) => ({ name, rows: [['v']] })) })).sheets.map((s) => s.name);
  t.eq(names, ['Data', 'data (2)', 'Sheet3', 'Sheet4', 'quoted', 'abc', 'x'.repeat(31), 'x'.repeat(27) + ' (2)'], 'sheet names Excel accepts: unique without regard to case, no apostrophe at the ends, not History, 31 characters');
  // ---- numbers in a format and text in bold (SliceDiceGrapher's pivots): read back by openpyxl
  { const wbx = sh.xlsx({ sheets: [{ name: 'P', rows: [['Region', 'Sales', 'Share'], [{ text: 'East', bold: true }, { num: 123456.5, format: '[$₹-4009]#,##,##0.00', bold: true, shown: '₹1,23,456.50' }, { num: 0.125, format: '0.0%' }], ['North', { num: 7, format: '#,##0' }, null]] }] }, { header: true });
    t.eq(sh.read(wbx).sheets[0].rows.slice(1), [['East', 123456.5, 0.125], ['North', 7]], 'a number in a format keeps its value');
    const dir = mkdtempSync(join(tmpdir(), 'sheet-fmt-')), f = join(dir, 'p.xlsx');
    writeFileSync(f, wbx);
    try {
      const out = execFileSync('python3', ['-c', 'import sys, openpyxl\nws = openpyxl.load_workbook(sys.argv[1]).active\nfor c in ("A2", "B2", "C2", "A3", "B3"): print(c, ws[c].value, ws[c].number_format, ws[c].font.b)', f], { encoding: 'utf8' }).trim().split(/\r?\n/);
      t.eq(out, ['A2 East General True', 'B2 123456.5 [$₹-4009]#,##,##0.00 True', 'C2 0.125 0.0% False', 'A3 North General False', 'B3 7 #,##0 False'], 'openpyxl reads the formats and the bold cells as written');
    } catch (e) { t.ok(/openpyxl|No module/.test(String(e)) ? (console.log('  (openpyxl not installed: the formats not read back)'), true) : false, `openpyxl: ${e}`); }
  }
  // ---- the separator, read as CSV (quotes and line breaks count as text)
  t.eq(sh.csv(enc('"Name, full","Age, years"\nAsha,30\nRavi,41\n')).delimiter, ',', 'commas inside the quoted header: comma');
  t.eq(sh.csv(enc('Report of 20 Nov 2026\nName;Price\nTea;1,50\nCoffee;2,75\n')).delimiter, ';', 'a title line, then semicolons with decimal commas: semicolon');
  t.eq(sh.csv(enc('"a;b"|c\n"d;e"|f\n')).delimiter, '|', 'semicolons inside quotes: pipe');
  t.eq(sh.csv(enc('one\ntwo\nthree\n')).sheets[0].rows, [['one'], ['two'], ['three']], 'a single column');
  { const t0 = performance.now(), big = 'id,code,amount\n' + Array.from({ length: 200000 }, (_, i) => `${i},${String(i).padStart(6, '0')},${i / 4}`).join('\n');
    t.ok(JSON.stringify(types(big)) === '["INTEGER","TEXT","REAL"]' && performance.now() - t0 < 5000, `200,000 rows typed in ${Math.round(performance.now() - t0)} ms`); }
};
