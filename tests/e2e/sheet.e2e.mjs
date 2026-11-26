// CSV / Excel (#/sheet, PC): real .xlsx/.xls/.xlsb/.ods files, CSV with detected separators, filters, exports read back.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from '../lib/child.mjs';
import { basename, join } from 'node:path';
const S = (n) => fileURLToPath(new URL(`../fixtures/sheets/${n}`, import.meta.url));
export default async ({ base, page: newPage, ok, info: note, download, tmp, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/sheet');
  const fileIn = page.locator('input[type=file]').first(), info = page.locator('.sheet-wrap').locator('..').locator('[aria-live="polite"]');
  const cells = (r) => page.locator('.sheet-table tbody tr').nth(r).locator('td').allTextContents();
  for (const f of ['base.xlsx', 'base.xls', 'base.xlsb', 'base.ods']) {
    await fileIn.setInputFiles(S(f));
    await page.getByText(`Opened ${f}`, { exact: true }).first().waitFor();
    const r = await cells(1);
    ok(JSON.stringify(r.slice(1, 9)) === JSON.stringify(['String', '1', '1.1', 'TRUE', 'FALSE', '2010-10-10', '2010-10-10 10:10:10', '10:10:10']), `${f}: values shown (${r.slice(1, 9).join(' | ')})`);
  }
  ok(await page.getByRole('radio', { name: 'Merged Cells' }).count() === 1, 'sheet tabs');
  // multi-sheet with hidden sheets
  await fileIn.setInputFiles(S('any_sheets.xlsx'));
  await page.getByText('Opened any_sheets.xlsx', { exact: true }).first().waitFor();
  ok(await page.getByRole('radio', { name: 'Hidden (hidden)', exact: true }).count() === 1, 'hidden sheets marked');
  ok(/Visible: 5 rows × 2 columns/.test(await info.textContent()), `size shown (${await info.textContent()})`);
  // CSV with semicolons, filter, exports
  const csv = `${tmp}/people.csv`; writeFileSync(csv, 'Name;City;Amount;PIN\n"Rao, Asha";Pune;1234.5;007\nRavi;Delhi;99;110001\nMeera;Pune;12;411001\n');
  await fileIn.setInputFiles(csv);
  await page.getByText('Opened people.csv', { exact: true }).first().waitFor();
  ok(JSON.stringify((await cells(1)).slice(1)) === JSON.stringify(['Rao, Asha', 'Pune', '1234.5', '007']), 'semicolon CSV detected; quoted comma kept');
  await page.getByPlaceholder('Filter rows…').fill('pune');
  ok(await page.locator('.sheet-table tbody tr').count() === 3 && /2 matching/.test(await info.textContent()), 'filter keeps the header and matching rows');
  await page.getByPlaceholder('Filter rows…').fill('');
  const jf = await download(page, () => page.getByRole('button', { name: 'JSON', exact: true }).click()), j = JSON.parse(readFileSync(jf, 'utf8'));
  ok(j.length === 3 && j[0].Name === 'Rao, Asha' && j[2].PIN === '411001', 'JSON export: objects keyed by the header row');
  const cf = await download(page, () => page.getByRole('button', { name: 'CSV', exact: true }).click()), c = readFileSync(cf, 'utf8');
  ok(c.startsWith('\ufeffName,City,Amount,PIN\n"Rao, Asha",Pune,1234.5,007\n'), 'CSV export: comma separated, quoted, with BOM');
  const xf = await download(page, () => page.getByRole('button', { name: 'Excel .xlsx' }).click());
  ok(readFileSync(xf).subarray(0, 2).toString() === 'PK', 'xlsx export is a zip');
  await fileIn.setInputFiles(xf);
  await page.getByText(/^Opened .*people\.xlsx$/).first().waitFor();
  const back = await cells(1);
  ok(JSON.stringify(back.slice(1)) === JSON.stringify(['Rao, Asha', 'Pune', '1234.5', '007']) && await page.locator('.sheet-table tbody tr').nth(1).locator('td.num').count() === 1, 'xlsx re-opened: number became a number, 007 stayed text');
  // JSON in → TSV out
  const jin = `${tmp}/list.json`; writeFileSync(jin, JSON.stringify([{ id: 1, tags: ['a', 'b'] }, { id: 2, name: 'x' }]));
  await fileIn.setInputFiles(jin);
  await page.getByText('Opened list.json', { exact: true }).first().waitFor();
  const tf = await download(page, () => page.getByRole('button', { name: 'TSV', exact: true }).click());
  ok(readFileSync(tf, 'utf8') === 'id\ttags\tname\n1\t"[""a"",""b""]"\t\n2\t\tx\n', 'JSON objects → columns (union of keys) → TSV');
  // "Excel" files that are web pages (as banks save them): every table, its spans on the grid (the HTML table model)
  // (the name by basename: a Windows path has backslashes — split('/') kept the whole path, and the suite waited 30 s for
  // "Opened D:\a\…\bank.xls" on the Windows runner; what the tab said instead is reported, not a crash)
  const opened = async (f, name = basename(f)) => {
    await fileIn.setInputFiles(f);
    if (await page.getByText(`Opened ${name}`, { exact: true }).last().waitFor({ timeout: 30000 }).then(() => true, () => false)) return true;
    ok(false, `${name} opens (the tab said: ${(await page.locator('.toast').allTextContents()).join(' | ') || await info.textContent()})`); return false;
  };
  const grid = () => page.evaluate(() => [...document.querySelectorAll('.sheet-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent)));
  const trim = (rows) => rows.map((r) => { const a = [...r]; while (a.length && a[a.length - 1] === '') a.pop(); return a; });
  await opened(S('bank.xls'));
  ok(JSON.stringify(trim(await grid())) === JSON.stringify([['Account statement — Asha Rao'], ['Date', 'Narration', 'Amount (₹)', 'Balance'], ['01/11/2026', 'UPI/CHAI STALL', '-45.00', '1,23,455.00'], ['02/11/2026', 'Salary & bonus', '50,000.00'], ['03/11/2026', 'NEFT to Ravi', '-2,500.50', '1,70,954.50']]) && await page.locator('.sheet-tabs [role=radio]').count() === 0, `a bank's .xls that is a web page: its table (the layout table around it left out), colspan and rowspan on the grid, spaces tidied (${JSON.stringify(trim(await grid())).slice(0, 160)})`);
  // the same statement as Windows programs save it: CR LF line ends (the repository keeps LF — .gitattributes)
  const crlf = join(tmp, 'bank-crlf.xls'); writeFileSync(crlf, readFileSync(S('bank.xls'), 'utf8').replace(/\n/g, '\r\n'));
  const lf = JSON.stringify(trim(await grid()));
  await opened(crlf);
  ok(JSON.stringify(trim(await grid())) === lf, 'a web-page "Excel" file with CR LF line ends (saved on Windows) gives the same sheet');
  // Excel 2003 XML (SpreadsheetML): sheets, ss:Index, MergeAcross, types
  await opened(S('xml2003.xml'));
  ok(JSON.stringify(trim(await grid())) === JSON.stringify([['Item', 'Qty', 'Paid', 'When'], ['Tea', '3', 'TRUE', '2026-11-20'], ['Coffee', '2.5', 'FALSE', '2026-11-21 10:30:00'], [], ['Total', '', '', '5.5']]) && await page.getByRole('radio', { name: 'Notes' }).count() === 1, `Excel 2003 XML: two sheets, row 5 by ss:Index, the merged Total, numbers, booleans and dates (${JSON.stringify(trim(await grid()))})`);
  // the encodings Excel saves text in
  await opened(S('cp1252.csv'));
  ok(JSON.stringify(trim(await grid())) === JSON.stringify([['Name', 'Price', 'Note'], ['café', '3,50', 'crème brûlée'], ['Jürgen', '12', 'a; b']]) && /separator: semicolon \(detected\) · read as Windows-1252/.test(await info.textContent()), `Windows-1252 CSV with semicolons: café, not caf\uFFFD (${await info.textContent()})`);
  await page.locator('select').first().selectOption(',');
  ok((await grid())[1][0] === 'café;3' && /separator: comma ·/.test(await info.textContent()), 'the separator can be chosen');
  await opened(S('utf16.txt'));
  ok(JSON.stringify(trim(await grid())) === JSON.stringify([['Name', 'City', 'Amount'], ['Zoë', 'München', '12.5'], ['Rao, Asha', 'Pune', '7']]) && /separator: tab \(detected\) · read as UTF-16/.test(await info.textContent()) && await page.locator('select').first().inputValue() === '', `Excel's "Unicode Text" (UTF-16) is read, and the next file detects its own separator (${await info.textContent()})`);
  // what Excel shows: error values, durations past 24 hours, 15 digits
  await opened(S('kinds.xlsx'));
  const kg = await grid(), kv = Object.fromEntries(kg.slice(1).map((r) => [r[0], r[1]]));
  ok(kg.slice(1, 8).map((r) => r[1]).join(' ') === '#DIV/0! #N/A #NAME? #NULL! #NUM! #REF! #VALUE!', `error values as Excel writes them (${kg.slice(1, 8).map((r) => r[1]).join(' ')})`);
  ok(kg.slice(8, 11).map((r) => r[1]).join(' ') === '30:00:00 2:30:15 255:10:10' && kv.sum === '0.3' && kv.large === '1E+21', `durations past 24 hours, 0.1 + 0.2 shown as 0.3 (${kg.slice(8, 13).map((r) => r[1]).join(' ')})`);
  const kc = readFileSync(await download(page, () => page.getByRole('button', { name: 'CSV', exact: true }).click()), 'utf8');
  ok(/\nsum,0\.3\r?\n/.test(kc) && /\nbool,TRUE\r?\n/.test(kc) && /\nduration,30:00:00\r?\n/.test(kc), 'CSV export: the cells as shown (0.3, TRUE), as Excel writes its CSV');
  // JSON in with an ID no double holds; JSON out with repeated headings
  const ids = `${tmp}/ids.json`; writeFileSync(ids, '[{"id": 12345678901234567890, "v": 1}, {"id": 2, "v": 2}]');
  await opened(ids);
  ok((await grid())[1][0] === '12345678901234567890', `an ID of 20 digits stays exact (${(await grid())[1][0]})`);
  const dup = `${tmp}/dup.csv`; writeFileSync(dup, 'Value,Value,Code,When\n1,2,007,2026-11-20\n3,4,010,2026-11-21\n');
  await opened(dup);
  const dj = JSON.parse(readFileSync(await download(page, () => page.getByRole('button', { name: 'JSON', exact: true }).click()), 'utf8'));
  ok(JSON.stringify(dj[0]) === JSON.stringify({ Value: 1, Value_2: 2, Code: '007', When: '2026-11-20' }), `JSON: repeated headings kept apart (Value, Value_2), numbers as numbers, codes as text (${JSON.stringify(dj[0])})`);
  // .xlsx: dates written as text become dates (read back by openpyxl, where installed)
  const dx = await download(page, () => page.getByRole('button', { name: 'Excel .xlsx' }).click());
  const py = spawnSync('python3', ['-c', 'import openpyxl,sys; ws=openpyxl.load_workbook(sys.argv[1]).active; print(type(ws["D2"].value).__name__, ws["D2"].number_format, type(ws["C2"].value).__name__, ws["A2"].value)', dx], { encoding: 'utf8' });
  if (py.status === 0) ok(py.stdout.trim() === 'datetime yyyy-mm-dd str 1', `.xlsx: the date is an Excel date, the code text, the number a number (openpyxl: ${py.stdout.trim()})`);
  else note(`openpyxl not installed — date check skipped (${py.stderr.trim().split('\n').pop()})`);
  // Excel's limits: said in words
  const long = `${tmp}/long.csv`; writeFileSync(long, `a,b\nx,${'z'.repeat(40000)}\n`);
  await opened(long);
  await page.getByRole('button', { name: 'Excel .xlsx' }).click();
  ok(await page.locator('.toast', { hasText: 'Cell B2 of “long” holds 40000 characters; an Excel cell holds at most 32,767' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'a cell Excel cannot hold: named, with the limit');
  // a file that is not text
  const pdf = `${tmp}/report.csv`; writeFileSync(pdf, readFileSync(new URL('../fixtures/pdf/crazyones.pdf', import.meta.url)));
  await fileIn.setInputFiles(pdf);
  ok(await page.locator('.toast', { hasText: 'This file is not text' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'a PDF named .csv: refused in words (it was shown as garbage)');
  // a big sheet: the newest file wins; filtering is quick and the row numbers stay right
  const bigf = `${tmp}/big.csv`; writeFileSync(bigf, 'id,name\n' + Array.from({ length: 300000 }, (_, i) => `${i},row ${i}`).join('\n'));
  const small = `${tmp}/small.csv`; writeFileSync(small, 'x,y\n1,2\n');
  await fileIn.setInputFiles(bigf); await fileIn.setInputFiles(small);
  await page.getByText('Opened small.csv', { exact: true }).last().waitFor({ timeout: 30000 }); await page.waitForTimeout(3000);
  ok(/^small: 2 rows/.test(await info.textContent()) && await page.getByText('Opened big.csv', { exact: true }).count() === 0, `a big file chosen just before a small one: the small one is shown (${await info.textContent()})`);
  await opened(bigf);
  const t0 = Date.now();
  await page.getByPlaceholder('Filter rows…').fill('row 299998');
  await page.waitForFunction(() => /· 1 matching/.test(document.querySelector('[aria-live="polite"]')?.textContent || ''), null, { timeout: 15000 });
  const fr = await grid(), rn = await page.locator('.sheet-table tbody tr').nth(1).locator('td').first().textContent();
  ok(fr.length === 2 && fr[1][1] === 'row 299998' && rn === '300000', `a filter over 300,000 rows: the match with its row number — line 300,000 of the file (${rn}; ${Date.now() - t0} ms)`);
  // errors
  await fileIn.setInputFiles(S('password.xlsx'));
  await page.getByText('password-protected').first().waitFor();
  ok(true, 'password-protected workbook explained');
  const real = page.errors.filter((e) => !/password-protected|This file is not text|an Excel cell holds at most/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/sheet');
  ok(await phone.getByText('available on desktop browsers only').count() === 1, 'phone: PC-only notice');
};
