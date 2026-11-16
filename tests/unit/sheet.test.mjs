// sheet.wasm (Rust: calamine + rust_xlsxwriter + csv, built by us): real .xlsx/.xls/.xlsb/.ods files (python-calamine
// test data) give the same cells; CSV detection and quoting; xlsx round trip; clear errors.
import { readFileSync } from 'node:fs';
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
};
