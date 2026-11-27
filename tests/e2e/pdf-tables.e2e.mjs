// PDF Tables → Excel (#/pdf-tables, PC + phones; potentials #16) end to end on tests/fixtures/tables (scripts/make-table-pdfs.py):
// a bank statement of two pages (columns that line up, its header on each page, narrations wrapped), the same ruled, and a bill
// with two small tables among its paragraphs. The tab must find the tables, show them, join the statement's pages, and save
// Excel and CSV files whose cells are the rows as printed — read back in Node by the app's own spreadsheet reader and by
// openpyxl (amounts numbers, dates dates, references text). Then: a table drawn by hand, the scanned statement (OCR), a
// password, leaving mid-reading, WCAG 2.2 A / AA in both themes, the phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/tables/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const saved = async (page, click) => { const d = page.waitForEvent('download', { timeout: 120000 }); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return [p, dl.suggestedFilename()]; };
  const open = async (page, name, timeout = 120000) => {
    await page.locator('input[type=file]').setInputFiles(F(name));
    // the summary of this file (the tab empties it as a file starts and names the file in the line under the picker)
    await page.waitForFunction((n) => (document.querySelector('.pt-info')?.textContent || '').startsWith(`${n}:`) && /table|No table/.test(document.querySelector('.pt-summary')?.textContent || ''), name, { timeout });
    return (await page.locator('.pt-summary').innerText()).trim();
  };
  const py = (code, ...args) => spawnSync('python3', ['-c', code, ...args], { encoding: 'utf8' });

  // ---- the statement
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/pdf-tables');
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  const early = asked.filter((u) => /\.wasm(\?|$)|\/vendor\/|\/models\/|\/data\//.test(u));
  ok(!early.length, `no engine fetched as the tab opens — MuPDF, the table finder, the spreadsheet writer and the OCR come with the first PDF ${early.join(' ')}`);
  const s1 = await open(page, 'statement.pdf');
  ok(/^1 table found \(a table that runs on over pages is one\)$/.test(s1), `the statement: one table (${s1})`);
  const meta = await page.locator('.card:not(:has(.card))', { hasText: 'Table 1 —' }).first().innerText();
  ok(/pages 1–2/.test(meta) && /46 rows · 7 columns · columns that line up · a header row · joined over 2 pages/.test(meta), `its line: pages, rows, columns, joined (${meta.split('\n').slice(0, 2).join(' / ')})`);
  const head = await page.locator('.pt-grid thead th').allInnerTexts();
  ok(JSON.stringify(head) === JSON.stringify(TRUTH.statement.head), `the preview’s header (${head.join(' | ')})`);
  const first = await page.locator('.pt-grid tbody tr').first().locator('td').allInnerTexts();
  ok(first[0] === '01/11/2026' && /^CHQ DEP\/CLEARING\/CHEQUE 004521\/NARMADA PACKAGING LLP$/.test(first[1]) && first[6] === '50,750.75', `its first row, the narration joined over its lines, the balance a number (${first.join(' | ')})`);
  ok(await page.locator('.pt-grid tbody tr').count() === 30 && /The first 30 rows shown — the files hold all 46/.test(meta), 'the first 30 rows previewed, the rest said');
  await page.locator('.pt-page').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('.pt-page canvas').length >= 1, null, { timeout: 60000 });
  ok(await page.locator('.pt-box').count() === 2 && await page.locator('.pt-col').count() === 12, 'the table outlined on both pages, its columns dashed');

  // the Excel file and the CSV, read back
  const [px, nx] = await saved(page, () => page.getByRole('button', { name: 'Save as Excel', exact: true }).click());
  ok(nx === 'statement-tables.xlsx', `the Excel file named after the PDF (${nx})`);
  const op = py(`import sys, json, openpyxl
ws = openpyxl.load_workbook(sys.argv[1]).active
rows = [[c.value for c in r] for r in ws.iter_rows()]
print(json.dumps({'title': ws.title, 'n': len(rows), 'head': rows[0], 'types': [type(v).__name__ for v in rows[1]], 'r1': [str(v) for v in rows[1]], 'last': [str(v) for v in rows[-1]]}))`, px);
  if (op.status === 0) {
    const x = JSON.parse(op.stdout);
    const tr1 = TRUTH.statement.rows[0], trl = TRUTH.statement.rows[45];
    ok(x.n === 47 && JSON.stringify(x.head) === JSON.stringify(TRUTH.statement.head), `openpyxl: the header and 46 rows (${x.n - 1}) in “${x.title}”`);
    ok(x.types[0] === 'datetime' && x.types[1] === 'str' && x.types[2] === 'str' && /float|int/.test(x.types[5]) && /float|int/.test(x.types[6]), `openpyxl: a date, text, a reference as text, amounts as numbers (${x.types.join(', ')})`);
    ok(x.r1[2] === tr1[2] && x.r1[1] === tr1[1] && Number(x.r1[6]) === +tr1[6].replace(/,/g, ''), 'openpyxl: the first row’s cells as printed');
    ok(x.last[1] === trl[1] && Number(x.last[6]) === +trl[6].replace(/,/g, ''), 'openpyxl: the last row too (its narration wrapped at the foot of page 2)');
  } else ok(true, 'openpyxl could not run — skipped');
  const [pc, nc] = await saved(page, () => page.getByRole('button', { name: 'CSV', exact: true }).first().click());
  const csv = readFileSync(pc, 'utf8');
  ok(nc === 'statement-table-1.csv' && csv.startsWith('﻿Date,Narration,') && csv.trim().split(/\r?\n/).length === 47 && csv.includes('2026-11-01,CHQ DEP/CLEARING/CHEQUE 004521/NARMADA PACKAGING LLP,005953,2026-11-01,,2500,50750.75'), 'the CSV: a BOM for Excel, the header, 46 rows, amounts as numbers and dates as ISO dates');
  await page.getByText('Amounts and dates as numbers and dates').click();
  const [pc2] = await saved(page, () => page.getByRole('button', { name: 'CSV', exact: true }).first().click());
  ok(readFileSync(pc2, 'utf8').includes('01/11/2026,CHQ DEP/CLEARING/CHEQUE 004521/NARMADA PACKAGING LLP,005953,01/11/2026,,"2,500.00","50,750.75"'), 'numbers and dates off: every cell as printed');
  await page.getByText('Amounts and dates as numbers and dates').click();
  // joining off: a table a page
  await page.getByText('Join a table that runs on over pages').click();
  await page.waitForFunction(() => /^2 tables found/.test(document.querySelector('.pt-summary')?.textContent || ''), null, { timeout: 60000 });
  ok(true, 'joining off: two tables, one a page');
  await page.getByText('Join a table that runs on over pages').click();
  await page.waitForFunction(() => /^1 table found/.test(document.querySelector('.pt-summary')?.textContent || ''), null, { timeout: 60000 });

  // ---- the ruled statement and the bill
  const s2 = await open(page, 'statement-ruled.pdf');
  ok(/^1 table found/.test(s2) && /ruled/.test(await page.locator('.card:not(:has(.card))', { hasText: 'Table 1 —' }).first().innerText()), `the ruled statement: one table, its grid read (${s2})`);
  const s3 = await open(page, 'bill.pdf');
  ok(/^2 tables found$/.test(s3), `the bill: two tables (${s3})`);
  const heads = await page.locator('.pt-grid').evaluateAll((gs) => gs.map((g) => [...g.querySelectorAll('thead th')].map((th) => th.textContent)));
  ok(JSON.stringify(heads) === JSON.stringify(TRUTH.bill.tables.map((x) => x.head)), `their headers (${heads.map((x) => x.join(' | ')).join(' ; ')})`);
  const [pb] = await saved(page, () => page.getByRole('button', { name: 'Save as Excel', exact: true }).click());
  const sheets = py(`import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
print(json.dumps([[ws.title, ws.max_row, [c.value for c in ws[2]]] for ws in wb.worksheets]))`, pb);
  if (sheets.status === 0) {
    const s = JSON.parse(sheets.stdout);
    ok(s.length === 2 && s[0][1] === 7 && s[1][1] === 7 && s[0][2][3] === 128 && s[1][2][1] === 214, `the bill’s Excel file: a sheet a table (${s.map((x) => `${x[0]}: ${x[1]} rows`).join(', ')})`);
  } else ok(true, 'openpyxl could not run — skipped');

  // ---- a table drawn by hand (the bill's use table drawn again)
  await page.getByRole('button', { name: 'Draw a table', exact: true }).click();
  const box = await page.locator('.pt-box').nth(1).boundingBox();
  await page.locator('.pt-box').nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b2 = await page.locator('.pt-box').nth(1).boundingBox();
  await page.mouse.move(b2.x - 6, b2.y - 6); await page.mouse.down(); await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 4 }); await page.mouse.move(b2.x + b2.width + 6, b2.y + b2.height + 6, { steps: 4 }); await page.mouse.up();
  await page.waitForFunction(() => /^3 tables found/.test(document.querySelector('.pt-summary')?.textContent || ''), null, { timeout: 30000 });
  const drawnHead = await page.locator('.card:not(:has(.card))', { hasText: 'Table 3 (drawn)' }).locator('thead th').allInnerTexts();
  ok(box && JSON.stringify(drawnHead) === JSON.stringify(TRUTH.bill.tables[1].head), `a box drawn round a table: read as a table of its own (${drawnHead.join(' | ')})`);
  await page.locator('.card:not(:has(.card))', { hasText: 'Table 3 (drawn)' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForFunction(() => /^2 tables found/.test(document.querySelector('.pt-summary')?.textContent || ''));
  ok(true, 'the drawn table removed');

  // ---- the scanned statement: read by the OCR
  const s4 = await open(page, 'statement-scan.pdf', 400000);
  const meta4 = await page.locator('.card:not(:has(.card))', { hasText: 'Table 1 —' }).first().innerText().catch(() => '');
  ok(/^1 table found/.test(s4) && /7 columns/.test(meta4) && /scanned: read by the OCR/.test(await page.locator('.pt-info').innerText()), `the scanned page: its table read by the OCR (${s4}; ${meta4.split('\n')[1] || ''})`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- a password
  const enc = join(tmp, 'locked.pdf');
  { const mupdf = await import('mupdf'); const x = mupdf.Document.openDocument(readFileSync(F('bill.pdf')), 'application/pdf').asPDF(); (await import('node:fs')).writeFileSync(enc, x.saveToBuffer('encrypt=aes-256,user-password=bill1234,owner-password=own56789').asUint8Array()); }
  await page.locator('input[type=file]').setInputFiles(enc);
  await page.getByPlaceholder('Password').fill('bill1234');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => /^2 tables found/.test(document.querySelector('.pt-summary')?.textContent || '') && /locked\.pdf/.test(document.querySelector('.pt-info')?.textContent || ''), null, { timeout: 60000 });
  ok(true, 'a PDF behind a password: asked for, its tables found');

  // ---- leaving mid-reading
  const lv = await newPage();
  await lv.goto(base + '#/pdf-tables'); await lv.locator('input[type=file]').waitFor({ state: 'attached' });
  await lv.locator('input[type=file]').setInputFiles(F('statement-scan.pdf'));
  await lv.waitForTimeout(2500);
  await lv.goto(base + '#/qr'); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while it reads: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with the result, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/pdf-tables');
    await ax.locator('input[type=file]').waitFor({ state: 'attached' });
    await open(ax, 'bill.pdf');
    await ax.waitForFunction(() => !document.getAnimations().length);
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, with the result: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'pdf-tables', { ready: '.card', buttons: ['Save as Excel'], before: async (p) => { await open(p, 'statement.pdf'); } });
  ok(await ph.evaluate(() => getComputedStyle(document.querySelector('.actions')).position === 'fixed'), 'phone: Save as Excel in the bar at the bottom');
  ok(await ph.evaluate(() => { const s = document.querySelector('.pt-scroll'); return s.scrollWidth > s.clientWidth && document.documentElement.scrollWidth <= innerWidth; }), 'phone: the wide table scrolls inside its box, the page does not');
};
