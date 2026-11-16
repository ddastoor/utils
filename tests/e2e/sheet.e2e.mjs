// CSV / Excel (#/sheet, PC): real .xlsx/.xls/.xlsb/.ods files, CSV with detected separators, filters, exports read back.
import { readFileSync, writeFileSync } from 'node:fs';
const S = (n) => new URL(`../fixtures/sheets/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, tmp, devices }) => {
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
  ok(c.startsWith('﻿Name,City,Amount,PIN\n"Rao, Asha",Pune,1234.5,007\n'), 'CSV export: comma separated, quoted, with BOM');
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
  // errors
  await fileIn.setInputFiles(S('password.xlsx'));
  await page.getByText('password-protected').first().waitFor();
  ok(true, 'password-protected workbook explained');
  const real = page.errors.filter((e) => !/password-protected/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/sheet');
  ok(await phone.getByText('available on desktop browsers only').count() === 1, 'phone: PC-only notice');
};
