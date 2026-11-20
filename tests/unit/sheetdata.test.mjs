// src/lib/sheetdata.ts — what the CSV / Excel tab does around sheet.wasm: numbers as Excel shows them, JSON in and out
// (exact numbers, unique keys), the kind of a text file. (The HTML and Excel 2003 XML readers need a DOM: the e2e suite.)
export default async (t, { load }) => {
  const S = await load('/src/lib/sheetdata.ts');
  // numbers as Excel's "General" shows them: 15 significant digits
  const N = [[0.1 + 0.2, '0.3'], [1 / 3, '0.333333333333333'], [1e21, '1E+21'], [1.25e-7, '1.25E-7'], [2 ** 53, '9007199254740992'], [-0.5, '-0.5'], [123456789012345680000, '1.23456789012346E+20'], [42, '42'], [-0, '0'], [1.5e300, '1.5E+300'], [100.25, '100.25']];
  for (const [v, want] of N) t.eq(S.fmtNumber(v), want, `${v} is shown as ${want}`);
  t.eq([S.cellText(true), S.cellText(false), S.cellText(null), S.cellText(undefined), S.cellText('x ')], ['TRUE', 'FALSE', '', '', 'x '], 'TRUE / FALSE, nothing for an empty cell, text as it is');
  t.eq(S.rowsAsText([[0.1 + 0.2, true, null, 'a']]), [['0.3', 'TRUE', '', 'a']], 'CSV and TSV get the cells as shown (true was written "true", 0.3 as 0.30000000000000004)');
  // does a double hold the decimal as written
  for (const [src, v, want] of [['1.50', 1.5, true], ['0.1', 0.1, true], ['12345678901234567890', 12345678901234567000, false], ['9007199254740993', 9007199254740992, false], ['1e400', Infinity, false], ['-0', -0, true], ['3.141592653589793238', Math.PI, false], ['1E2', 100, true], ['0.000', 0, true]]) t.eq(S.sameNumber(src, v), want, `${src} ${want ? 'is' : 'is not'} held by the double ${v}`);
  // JSON in
  const b = S.jsonToBook('[{"id": 12345678901234567890, "n": 1.50, "tags": ["a"]}, {"id": 2, "x": null, "n": 0.1}]', 'list');
  const ctx = (() => { let seen = false; JSON.parse('1', (k, v, c) => { seen = !!c?.source; return v; }); return seen; })();
  if (ctx) t.eq(b.sheets[0].rows, [['id', 'n', 'tags', 'x'], ['12345678901234567890', 1.5, '["a"]', null], [2, 0.1, null, null]], 'objects → columns in the order keys appear; an ID a double cannot hold stays text (it was 12345678901234567000)');
  else t.ok(true, 'this Node cannot show JSON.parse the source of a number: the exact-ID check runs in the browser suite');
  t.eq(S.jsonToBook('[[1, "a"], [2, null]]').sheets[0].rows, [[1, 'a'], [2, null]], 'an array of arrays: rows as they are');
  t.eq(S.jsonToBook('{"rows": [{"a": 1}]}').sheets[0].rows, [['a'], [1]], '{ rows: [...] }');
  t.eq(S.jsonToBook('[1, "two", true]').sheets[0].rows, [[1], ['two'], [true]], 'an array of plain values: one column');
  t.throws(() => S.jsonToBook('{"a": '), 'broken JSON is refused');
  // JSON out
  const J = (rows, header, numbers, types) => JSON.parse(S.rowsToJson(rows, header, numbers, types));
  t.eq(J([['Value', 'Value', '', 'Value_2'], [1, 2, 3, 4]], true), [{ Value: 1, Value_2: 2, C: 3, Value_2_2: 4 }], 'repeated headings become Value, Value_2 …; an empty heading its letter (a repeated heading overwrote the column before)');
  t.eq(J([['a'], [1, 2, 3]], true), [{ a: 1, B: 2, C: 3 }], 'cells beyond the header are kept under their letters (they were dropped)');
  t.eq(J([['id', 'code', 'amt', 'big'], ['1', '007', '1.5', '12345678901234567890']], true, true, ['INTEGER', 'TEXT', 'REAL', 'INTEGER']), [{ id: 1, code: '007', amt: 1.5, big: '12345678901234567890' }], 'numbers written as text → JSON numbers by column type; codes stay text, whole numbers beyond 2^53 too');
  t.eq(J([['id'], ['1']], true, false, ['INTEGER']), [{ id: '1' }], 'without the option: text stays text');
  t.eq(J([[1, 'a'], [2, 'b']], false), [[1, 'a'], [2, 'b']], 'without a header: arrays');
  t.eq(J([], true), [], 'no rows: an empty list');
  // the kind of a text file
  for (const [text, want] of [['<html><body><table><tr><td>1</td></tr></table>', 'html'], ['\ufeff  <TABLE border=1>', 'html'], ['<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">', 'xml2003'], ['<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">', 'xml2003'], ['[{"a":1}]', 'json'], ['  {"rows": []}', 'json'], ['a,b\n1,2', 'text'], ['<note>not a table</note>', 'text']]) t.eq(S.sniffText(text), want, `${JSON.stringify(text.slice(0, 30))} → ${want}`);
  t.eq([S.colName(0), S.colName(25), S.colName(26), S.colName(701), S.colName(16383)], ['A', 'Z', 'AA', 'ZZ', 'XFD'], 'column letters up to Excel\'s last, XFD');
};
