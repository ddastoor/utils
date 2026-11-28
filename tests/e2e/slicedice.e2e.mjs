// SliceDiceGrapher (#/slicedice, PC + phones; potentials #75 with Chart Maker #25) end to end on tests/fixtures/slicedice
// (scripts/make-slicedice-fixtures.py): a range pasted as Excel, LibreOffice Calc and Google Sheets put it on the clipboard (their HTML,
// with the values behind the text), as an American Excel does (dates month first), as plain text, and through the real clipboard and the
// Paste button; the sales workbook and CSV opened. The board's pivots are held to sums worked out here from the rows the generator wrote
// and to pandas' answers (reference.json); the editor builds a pivot with a filter; every download is read back — PNG pictures by their
// size and pixels, the SVG, the CSV, the Excel file by openpyxl (number formats, bold totals), the zip by Python's zipfile. Then: a column
// read as another kind, no header row, the board kept when the tab is left and opened again, the engines let go, leaving mid-reading,
// errors said, WCAG 2.2 A / AA in both themes, the phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';

const F = (n) => fileURLToPath(new URL(`../fixtures/slicedice/${n}`, import.meta.url));
const REF = JSON.parse(readFileSync(F('reference.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const num = (s) => { const t = String(s).replace(/[₹$,\s]/g, '').replace(/−/g, '-'); return /%$/.test(t) ? +t.slice(0, -1) / 100 : +t; };
const near = (a, b, tol = 0.006) => Math.abs(a - b) <= tol;
const py = (code, ...args) => spawnSync('python3', ['-c', code, ...args], { encoding: 'utf8' });
/** a PNG's width, height and colour type from its header */
const pngHead = (b) => (b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] } : null);

export default async ({ base, page: newPage, ok, tmp, devices, download, released }) => {
  const cardOf = (page, title) => page.locator('.sd-card', { has: page.locator('.sd-title', { hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
  const pasteInto = (page, html, text) => page.evaluate(({ html, text }) => {
    const dt = new DataTransfer();
    if (html) dt.setData('text/html', html);
    if (text) dt.setData('text/plain', text);
    const ta = document.querySelector('.sd-paste');
    ta.focus();
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { html, text });
  const line = (page) => page.locator('.sd-line').innerText();
  const boardReady = (page, n = 3) => page.waitForFunction((k) => document.querySelectorAll('.sd-card').length >= k && document.querySelectorAll('.sd-card .sd-chart canvas').length >= 1, n, { timeout: 120000 });
  /** a card's table as [label, …values] rows (its pivot opened) */
  const tableOf = async (card) => {
    const det = card.locator('details.sd-pv');
    if (!(await det.evaluate((d) => d.open))) await det.locator('summary').click();
    await card.locator('.sd-table tbody tr').first().waitFor({ timeout: 60000 });
    return card.locator('.sd-table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  };
  // the sums of the 30 pasted rows, by region, worked out here from the rows the generator wrote
  const by30 = {};
  for (const r of REF.rows30) by30[r.region] = (by30[r.region] ?? 0) + r.sales;
  const total30 = Object.values(by30).reduce((a, b) => a + b, 0);
  const checkRegions = (rows, want, total, what) => {
    const bad = Object.entries(want).filter(([k, v]) => { const r = rows.find((x) => x[0] === k); return !r || !near(num(r[1]), v); });
    const tot = rows.find((x) => x[0] === 'Total');
    ok(!bad.length && tot && near(num(tot[1]), total), `${what}: the sum of Sales by region and the total as worked out from the rows (${bad.map(([k]) => k).join(', ') || rows.map((r) => r.join(' ')).join(' / ')})`);
  };

  // ---------------------------------------------------------------- nothing at open; a range from Excel
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/slicedice');
  await page.locator('.sd-paste').waitFor();
  await page.waitForTimeout(400);
  const early = asked.filter((u) => /\.wasm(\?|$)|perspective|charts-|\/vendor\//.test(u));
  ok(!early.length, `nothing heavy fetched as the tab opens — the pivot engine, the graphs and sheet.wasm come with the first data ${early.join(' ')}`);
  const xl = readFileSync(F('paste-excel.html'), 'utf8'), tsv = readFileSync(F('paste.tsv'), 'utf8');
  await pasteInto(page, xl, tsv);
  await boardReady(page);
  ok(/^Pasted from Excel: 30 rows × 8 columns$/.test(await line(page)), `a range pasted from Excel: read with its values (${await line(page)})`);
  const kinds = await page.locator('.sd-cols tbody tr').evaluateAll((trs) => trs.map((tr) => `${tr.querySelector('th').textContent}:${tr.querySelector('select').value}`));
  ok(kinds.join() === 'Date:date,Region:text,City:text,Product:text,Units:number,Price:number,Sales:number,Discount:number', `its columns read as dates, text and numbers (${kinds.join(', ')})`);
  const about = await page.locator('.sd-cols tbody tr').evaluateAll((trs) => trs.map((tr) => tr.querySelector('.sd-about').textContent));
  ok(/^amounts in ₹/.test(about[6]) && /^percentages/.test(about[7]) && /^dates, \d+ \w{3} 2025 to \d+ \w{3} 2026/.test(about[0]), `what is in them: rupees, percentages, the dates' span (${about[6]} / ${about[7]} / ${about[0]})`);
  const asked2 = asked.filter((u) => /perspective-server.*\.wasm|perspective-js.*\.wasm/.test(u));
  ok(asked2.length === 2, `the pivot engine fetched with the data: its server and client WebAssembly (${asked2.length})`);
  const titles = await page.locator('.sd-card .sd-title').allInnerTexts();
  ok(titles[0] === 'Total Sales by Region' && titles.includes('Sales by month') && titles.includes('Share of Sales by Region') && titles.length >= 10, `the presets of the sales columns (${titles.length}: ${titles.slice(0, 5).join(' · ')} …)`);
  checkRegions(await tableOf(cardOf(page, 'Total Sales by Region')), by30, total30, 'Excel’s 30 rows');
  const aria = await cardOf(page, 'Total Sales by Region').locator('.sd-chart').getAttribute('aria-label');
  ok(/Total Sales by Region/.test(aria) && /East is/.test(aria), `the graph is described for screen readers by ECharts (${aria.slice(0, 90)})`);

  // the same range from LibreOffice Calc, Google Sheets, plain text and an American Excel
  for (const [file, from] of [['paste-libre.html', 'LibreOffice Calc'], ['paste-gsheets.html', 'Google Sheets']]) {
    await pasteInto(page, readFileSync(F(file), 'utf8'), tsv);
    await page.waitForFunction((f) => (document.querySelector('.sd-line')?.textContent || '').startsWith(`Pasted from ${f}`), from, { timeout: 60000 });
    await boardReady(page);
    checkRegions(await tableOf(cardOf(page, 'Total Sales by Region')), by30, total30, `${from}’s 30 rows (${await line(page)})`);
  }
  await pasteInto(page, null, tsv);
  await page.waitForFunction(() => /^Pasted text \(tab-separated\)/.test(document.querySelector('.sd-line')?.textContent || ''), null, { timeout: 60000 });
  await boardReady(page);
  checkRegions(await tableOf(cardOf(page, 'Total Sales by Region')), by30, total30, `the plain text's 30 rows (${await line(page)})`);
  await pasteInto(page, readFileSync(F('paste-excel-us.html'), 'utf8'), null);
  await page.waitForFunction(() => (document.querySelector('.sd-line')?.textContent || '').startsWith('Pasted from Excel: 13 rows'), null, { timeout: 60000 });
  const usAbout = await page.locator('.sd-cols tbody tr').first().locator('.sd-about').textContent();
  const d12 = REF.rows30.slice(0, 13).map((r) => Date.parse(r.date)), lo = new Date(Math.min(...d12)), hi = new Date(Math.max(...d12));
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const span = `dates, ${lo.getUTCDate()} ${M[lo.getUTCMonth()]} ${lo.getUTCFullYear()} to `;
  ok(usAbout.startsWith(span) && !/month first/.test(usAbout), `an American Excel's dates (4/7/2026) read by the day numbers behind them: ${usAbout} — expected ${span}…`);

  // ---------------------------------------------------------------- files
  await page.locator('input[type=file]').setInputFiles(F('sales.xlsx'));
  await page.waitForFunction(() => (document.querySelector('.sd-line')?.textContent || '').startsWith('sales.xlsx: 240 rows'), null, { timeout: 60000 });
  await boardReady(page);
  const ref = REF.cases.find((c) => c.name === 'sum by region');
  const regions = Object.fromEntries(Object.entries(ref.cells).filter(([k]) => k.endsWith('||0') && k !== '||0').map(([k, v]) => [k.split('|')[0], v]));
  checkRegions(await tableOf(cardOf(page, 'Total Sales by Region')), regions, ref.cells['||0'], 'the workbook (240 rows) against pandas');
  await page.locator('input[type=file]').setInputFiles(F('sales.csv'));
  await page.waitForFunction(() => (document.querySelector('.sd-line')?.textContent || '').startsWith('sales.csv: 240 rows'), null, { timeout: 60000 });
  const notes = await page.locator('.sd-data .note').allInnerTexts();
  ok(notes.some((n) => /“Total”.*left out/.test(n)), `the CSV's last row "Total" left out and said (${notes.join(' / ')})`);
  await boardReady(page);
  checkRegions(await tableOf(cardOf(page, 'Total Sales by Region')), regions, ref.cells['||0'], 'the CSV against pandas');

  // a card's kind of graph changed
  const c1 = cardOf(page, 'Total Sales by Region');
  await c1.locator('select').first().selectOption('pie');
  await page.waitForFunction(() => /Pie chart/.test(document.querySelector('.sd-card .sd-chart')?.getAttribute('aria-label') || ''), null, { timeout: 30000 });
  ok(true, 'a card drawn again as a pie when its kind is changed');

  // ---------------------------------------------------------------- downloads of a card
  const head = async (p) => pngHead(readFileSync(p));
  let p = await download(page, () => c1.getByRole('button', { name: 'PNG', exact: true }).click());
  const h1 = await head(p);
  ok(h1 && h1.w === 2000 && h1.h === 1520, `the graph as a PNG at 2× (${JSON.stringify(h1)}; a pie is drawn 1000 × 760)`);
  const corner = py('import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGBA"); print(im.getpixel((2, 2)), im.getpixel((im.width // 2, im.height // 2)))', p);
  ok(corner.status !== 0 || /^\(255, 255, 255, 255\)/.test(corner.stdout), `… on white (${corner.stdout.trim()})`);
  await page.getByRole('radio', { name: '4×' }).click();
  await page.getByRole('radio', { name: 'See-through' }).click();
  p = await download(page, () => c1.getByRole('button', { name: 'PNG', exact: true }).click());
  const h4 = await head(p), t4 = py('import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGBA"); print(im.getpixel((2, 2))[3])', p);
  ok(h4 && h4.w === 4000 && h4.h === 3040 && h4.type === 6 && (t4.status !== 0 || t4.stdout.trim() === '0'), `at 4×, see-through: 4000 × 3040 with an alpha channel, the corner clear (${JSON.stringify(h4)} ${t4.stdout.trim()})`);
  await page.getByRole('radio', { name: '2×' }).click();
  await page.getByRole('radio', { name: 'White' }).click();
  p = await download(page, () => c1.getByRole('button', { name: 'SVG', exact: true }).click());
  const svg = readFileSync(p, 'utf8');
  ok(/^<\?xml/.test(svg) && /<svg[^>]+width="1000"[^>]+height="760"/.test(svg) && svg.includes('Total Sales by Region') && svg.includes('East'), 'the graph as an SVG drawing: its size, its title and its labels as text');
  p = await download(page, () => c1.getByRole('button', { name: 'Pivot PNG', exact: true }).click());
  const hp = await head(p);
  ok(hp && hp.w > 300 && hp.h > 200, `the pivot as a picture (${JSON.stringify(hp)})`);
  p = await download(page, () => c1.getByRole('button', { name: 'CSV', exact: true }).click());
  const csv = readFileSync(p, 'utf8');
  const csvRows = csv.replace(/^﻿/, '').trim().split(/\r?\n/).map((l) => l.split(','));
  ok(csv.startsWith('﻿') && csvRows[0].join() === 'Region,Sum of Sales' && csvRows.length === 6 && near(+csvRows.find((r) => r[0] === 'East')[1], regions.East, 1e-6), `the pivot as CSV: the byte-order mark, the header, the regions and the total, numbers plain (${csvRows.map((r) => r.join(' ')).join(' / ')})`);
  p = await download(page, () => c1.getByRole('button', { name: 'Excel', exact: true }).click());
  const op = py(`import sys, json, openpyxl
ws = openpyxl.load_workbook(sys.argv[1]).active
print(json.dumps({ 'a1': ws['A1'].value, 'b1bold': ws['B1'].font.b, 'a2': ws['A2'].value, 'b2': ws['B2'].value, 'fmt': ws['B2'].number_format, 'last': [ws.cell(ws.max_row, 1).value, ws.cell(ws.max_row, 1).font.b, ws.cell(ws.max_row, 2).value] }))`, p);
  if (op.status === 0) {
    const x = JSON.parse(op.stdout);
    ok(x.a1 === 'Region' && x.b1bold && x.fmt === '[$₹-4009]#,##,##0.00' && near(x.b2, regions[x.a2] ?? NaN, 1e-6) && x.last[0] === 'Total' && x.last[1] && near(x.last[2], ref.cells['||0'], 1e-6),
      `the pivot as Excel, read by openpyxl: the header in bold, the sums as numbers in rupees, the total row in bold (${op.stdout.trim()})`);
  } else ok(/No module named/.test(op.stderr), `openpyxl: ${op.stderr.slice(0, 200)}`);

  // ---------------------------------------------------------------- the editor: rows, a value, a filter
  const ed = page.locator('section.card', { hasText: 'Make your own pivot and graph' });
  await ed.getByLabel('Start from a preset', { exact: true }).selectOption('blank');
  await ed.getByLabel('Row level 1', { exact: true }).selectOption('Region');
  await ed.getByRole('button', { name: 'Add a value' }).click();
  await ed.getByLabel('Value 1', { exact: true }).selectOption('Sales');
  await ed.getByLabel('Value 2', { exact: true }).selectOption('·Rows');
  await ed.getByRole('button', { name: 'Add a filter' }).click();
  await ed.getByLabel('Filter 1 on', { exact: true }).selectOption('Region');
  const checks = ed.locator('.sd-checks');
  await checks.getByLabel('North').check(); await checks.getByLabel('South').check();
  await page.waitForTimeout(800);
  await page.waitForFunction(() => document.querySelectorAll('.sd-ed .sd-table tbody tr').length === 3, null, { timeout: 30000 });
  const fr = await page.locator('.sd-ed .sd-table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  const cnt = REF.cases.find((c) => c.name === 'rows by region');
  const nsOk = ['North', 'South'].every((r) => { const row = fr.find((x) => x[0] === r); return row && near(num(row[1]), regions[r]) && num(row[2]) === cnt.cells[`${r}||0`]; });
  ok(nsOk && fr[2][0] === 'Total', `your own pivot: Region, the sum of Sales and the number of rows, North and South only — as pandas has it (${fr.map((r) => r.join(' ')).join(' / ')})`);
  const edTitle = await ed.getByLabel('Title of the graph', { exact: true }).inputValue();
  ok(edTitle === 'Sum of Sales and 1 more by Region', `its title follows what it shows (${edTitle})`);
  const before = await page.locator('.sd-card').count();
  await ed.getByRole('button', { name: 'Add to the board' }).click();
  await page.waitForFunction((n) => document.querySelectorAll('.sd-card').length === n + 1, before);
  ok(true, 'added to the board');

  // ---------------------------------------------------------------- Download all
  p = await download(page, () => page.getByRole('button', { name: 'Download all (.zip)' }).click());
  const z = py(`import sys, json, zipfile, openpyxl, io
z = zipfile.ZipFile(sys.argv[1]); names = z.namelist()
wb = openpyxl.load_workbook(io.BytesIO(z.read('tables.xlsx')))
print(json.dumps({ 'names': names, 'sheets': wb.sheetnames, 'bad': z.testzip() }))`, p);
  if (z.status === 0) {
    const x = JSON.parse(z.stdout), n = before + 1;
    ok(x.bad === null && x.names.filter((f) => /\.svg$/.test(f)).length === n && x.names.filter((f) => /\.png$/.test(f)).length === 2 * n && x.names.includes('01 Total Sales by Region.png') && x.names.includes('01 Total Sales by Region (pivot).csv') && x.sheets.length === n,
      `Download all: a zip of ${n} graphs as PNG and SVG, their tables as PNG and CSV, and an Excel workbook of the ${x.sheets.length} tables (${x.names.slice(0, 4).join(', ')} …)`);
  } else ok(/No module named/.test(z.stderr), `zipfile: ${z.stderr.slice(0, 200)}`);

  // ---------------------------------------------------------------- a column read as another kind; no header row
  await page.locator('.sd-colsbox summary').click();
  await page.getByLabel('Read “Units” as').selectOption('text');
  await page.waitForFunction(() => [...document.querySelectorAll('.sd-cols tbody tr')].some((tr) => tr.querySelector('th').textContent === 'Units' && /^text, /.test(tr.querySelector('.sd-about').textContent)), null, { timeout: 30000 });
  await boardReady(page);
  const t2 = await page.locator('.sd-card .sd-title').allInnerTexts();
  ok(!t2.includes('Units against Sales') && t2.includes('Sum of Sales and 1 more by Region'), `Units read as text: no scatter of it among the presets, your own graph kept (${t2.length} graphs)`);
  await page.getByText('The first row holds the column names').click();
  await page.waitForFunction(() => document.querySelector('.sd-cols tbody tr th')?.textContent === 'Column A', null, { timeout: 30000 });
  ok(/241 rows/.test(await line(page)), `without a header row the columns are named by their letters and every row is data (${await line(page)})`);

  // ---------------------------------------------------------------- leaving the tab and coming back; the engines let go
  await page.locator('input[type=file]').setInputFiles(F('sales.csv'));
  await page.waitForFunction(() => (document.querySelector('.sd-line')?.textContent || '').startsWith('sales.csv: 240 rows'), null, { timeout: 60000 });
  await boardReady(page);
  await cardOf(page, 'Total Sales by Region').locator('button[title^="Remove"]').click();
  const kept = await page.locator('.sd-card .sd-title').allInnerTexts();
  await page.evaluate(() => { location.hash = '#/sheet'; });
  await page.locator('.drop').first().waitFor();
  await page.waitForTimeout(500);
  const live = await page.evaluate(() => globalThis.__superutilsLive());
  ok(live.workers === 0 && !live.resources.includes('slicedice-engine'), `leaving the tab ends the pivot engine's worker and lets its client go (${JSON.stringify(live)})`);
  await page.evaluate(() => { location.hash = '#/slicedice'; });
  await boardReady(page);
  const back = await page.locator('.sd-card .sd-title').allInnerTexts();
  ok(JSON.stringify(back) === JSON.stringify(kept) && /^sales\.csv: 240 rows/.test(await line(page)), `back in the tab: the data and the board as they were, the removed graph still gone (${back.length} graphs)`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---------------------------------------------------------------- the real clipboard and the Paste button; what is not a range
  const cp = await newPage({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await cp.goto(base + '#/slicedice'); await cp.locator('.sd-paste').waitFor();
  await cp.evaluate(async ({ html, text }) => { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]); }, { html: readFileSync(F('paste-libre.html'), 'utf8'), text: tsv });
  await cp.getByRole('button', { name: 'Paste', exact: true }).click();
  await cp.waitForFunction(() => (document.querySelector('.sd-line')?.textContent || '').startsWith('Pasted from LibreOffice Calc: 30 rows'), null, { timeout: 60000 });
  await boardReady(cp);
  checkRegions(await tableOf(cardOf(cp, 'Total Sales by Region')), by30, total30, 'the Paste button on the real clipboard (LibreOffice Calc)');
  await cp.evaluate(async () => { await navigator.clipboard.writeText('just one cell'); });
  await cp.getByRole('button', { name: 'Paste', exact: true }).click();
  await cp.waitForTimeout(800);
  const toastText = await cp.locator('.toast').last().innerText().catch(() => '');
  ok(/single row or cell/.test(toastText) && /^Pasted from LibreOffice Calc/.test(await line(cp)), `one cell on the clipboard: said, the data kept (${toastText})`);
  await pasteInto(cp, '<p>no table here</p>', '');
  await cp.waitForTimeout(500);
  ok(/clipboard holds no table/.test(await cp.locator('.sd-status').innerText()), 'a clipboard without a table: said');
  // a bigger sheet: 20,000 rows of typed text
  const big = ['Date\tRegion\tSales', ...Array.from({ length: 20000 }, (_, i) => `${String(1 + (i % 28)).padStart(2, '0')}/${String(1 + (i % 12)).padStart(2, '0')}/2026\t${['North', 'South', 'East', 'West'][i % 4]}\t${(i % 97) * 10.5}`)].join('\n');
  const t0 = Date.now();
  await pasteInto(cp, null, big);
  await cp.waitForFunction(() => (document.querySelector('.sd-line')?.textContent || '').startsWith('Pasted text (tab-separated): 20,000 rows'), null, { timeout: 120000 });
  await boardReady(cp, 2);
  const secs = (Date.now() - t0) / 1000;
  const bigRows = await tableOf(cardOf(cp, 'Total Sales by Region'));
  const want = { North: 0, South: 0, East: 0, West: 0 };
  for (let i = 0; i < 20000; i++) want[['North', 'South', 'East', 'West'][i % 4]] += (i % 97) * 10.5;
  ok(Object.entries(want).every(([k, v]) => near(num(bigRows.find((r) => r[0] === k)?.[1] ?? 'NaN'), v)) && secs < 60, `20,000 rows pasted as text: the board in ${secs.toFixed(1)} s, the sums right`);
  ok(!cp.errors.length, `clipboard page: no page errors ${cp.errors.slice(0, 3).join(' | ')}`);

  // ---------------------------------------------------------------- leaving while the engines load
  const lv = await newPage();
  await lv.goto(base + '#/slicedice'); await lv.locator('.sd-paste').waitFor();
  await pasteInto(lv, xl, tsv);
  await lv.waitForTimeout(150);
  await lv.evaluate(() => { location.hash = '#/sheet'; }); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while the engines load: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---------------------------------------------------------------- WCAG 2.2 A / AA with the board and the editor, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/slicedice');
    await ax.locator('.sd-paste').waitFor();
    await ax.getByRole('button', { name: 'Try the sample' }).click();
    await boardReady(ax);
    await ax.locator('.sd-colsbox summary').click();
    await cardOf(ax, 'Total Sales by Region').locator('details.sd-pv summary').click();
    await ax.waitForTimeout(600);
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, with the board and the editor: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---------------------------------------------------------------- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'slicedice', { ready: '.sd-paste', buttons: ['Paste', 'Try the sample'], before: async (q) => { await q.getByRole('button', { name: 'Try the sample' }).click(); await boardReady(q); } });
  const bar = await ph.getByRole('button', { name: 'Download all (.zip)' }).boundingBox();
  const vh = await ph.evaluate(() => innerHeight);
  ok(bar && bar.height >= 44 && bar.y + bar.height <= vh + 1 && bar.y > vh - 120, `phone: Download all in the bar at the foot of the screen (${bar && Math.round(bar.y)} of ${vh})`);
  const small = await ph.locator('.sd-card').first().locator('button, select').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.getAttribute('aria-label') || e.textContent));
  ok(!small.length, `phone: a card's controls are 44 px tall (${small.join(', ')})`);
  const blobs = await released(ph, 'slicedice');
  ok(!blobs.length, `phone: nothing kept in blob URLs after leaving (${blobs.map((b) => b.from).join(', ')})`);
};
