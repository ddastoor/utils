// SliceDiceGrapher (potentials #75): src/lib/slicedice.ts — numbers and dates as sheets write them, a grid read into typed columns, the
// presets, and every pivot run on Perspective 5.10's engine in Node (the same WebAssembly the tab runs in its worker) and held to pandas'
// answers (tests/fixtures/slicedice/reference.json — python3 scripts/make-slicedice-fixtures.py): sums, counts, averages,
// distinct counts, minimum and maximum, by one and two levels, split by a column, dates by month, quarter, year and month of the year,
// filters; then what the values show (% of the total, of the parent, of the row, of the column, running totals), the order and the top N,
// the histogram's bins and the box plot's quartiles, the graphs' options and the numbers' format; and a range pasted from Excel, LibreOffice
// Calc, Google Sheets and as plain text (the clipboard's HTML read by parse5 here, by the browser's DOMParser in the tab).
import { readFileSync } from 'node:fs';

const FIX = new URL('../fixtures/slicedice/', import.meta.url);
const REF = JSON.parse(readFileSync(new URL('reference.json', FIX), 'utf8'));

export default async (t, { load, wasm }) => {
  const L = await load('/src/lib/slicedice.ts');
  const { bindSheet } = await load('/src/wasm/sheet.ts');
  const sheet = bindSheet(await wasm('sheet'));
  const { default: perspective } = await import('@perspective-dev/client');
  const near = (a, b, tol = 1e-9) => a === b || (a !== null && b !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)));

  // ---------------------------------------------------------------- numbers as sheets write them
  const num = (s) => { const n = L.readNumber(s); return n && [n.v, n.currency, n.percent, n.decimals, n.indian]; };
  const NUMS = [
    ['1,23,456.00', [123456, '', false, 2, true]], ['123,456.78', [123456.78, '', false, 2, false]], ['₹ 1,500/-', [1500, '₹', false, 0, false]],
    ['(1,234)', [-1234, '', false, 0, false]], ['1,234 Dr', [-1234, '', false, 0, false]], ['1,234.50 Cr', [1234.5, '', false, 2, false]],
    ['−5', [-5, '', false, 0, false]], ['12.5 %', [0.125, '', true, 1, false]], ['50%', [0.5, '', true, 0, false]], ['1.2E+05', [120000, '', false, 0, false]],
    ['Rs. 450', [450, '₹', false, 0, false]], ['INR 2,00,000', [200000, '₹', false, 0, true]], ['$1,234.50', [1234.5, '$', false, 2, false]],
    ['-₹500', [-500, '₹', false, 0, false]], ['₹-500', [-500, '₹', false, 0, false]], ['€ 12,50', null], ['0.5', [0.5, '', false, 1, false]], ['.75', [0.75, '', false, 2, false]],
    ['9845012345', null], ['₹9845012345', [9845012345, '₹', false, 0, false]], ['007', null], ['1,2,3', null], ['N/A', null], ['', null], ['12-11-2026', null], ['Q3', null],
  ];
  const badN = NUMS.filter(([s, want]) => JSON.stringify(num(s)) !== JSON.stringify(want));
  t.ok(!badN.length, `${NUMS.length} numbers as sheets write them: Indian and international grouping, ₹ / Rs. / INR / $, brackets, Dr / Cr, a minus sign of either kind, %, an exponent — and identifiers left as text (${badN.map(([s]) => `${s} → ${JSON.stringify(num(s))}`).join('; ')})`);

  // ---------------------------------------------------------------- dates as sheets write them
  const U = (y, m, d) => Date.UTC(y, m - 1, d);
  const DATES = [
    ['28/11/2026', U(2026, 11, 28)], ['28-11-26', U(2026, 11, 28)], ['28.11.2026', U(2026, 11, 28)], ['2026-11-28', U(2026, 11, 28)], ['2026-11-28 10:30:00', U(2026, 11, 28)],
    ['2026-11-28T10:30:00Z', U(2026, 11, 28)], ['28 Nov 2026', U(2026, 11, 28)], ['28-Nov-26', U(2026, 11, 28)], ['28th November 2026', U(2026, 11, 28)],
    ['Nov 28, 2026', U(2026, 11, 28)], ['November 28 2026', U(2026, 11, 28)], ['Nov 2026', U(2026, 11, 1)], ['Nov-26', U(2026, 11, 1)], ['Sept 2026', U(2026, 9, 1)],
    ['31/02/2026', null], ['11/28/2026', null], ['Total', null], ['2026', null], ['Novem 2026', null], ['5/6/2026', U(2026, 6, 5)],
  ];
  const badD = DATES.filter(([s, want]) => L.readDate(s) !== want);
  t.ok(!badD.length, `${DATES.length} dates: day first by default, ISO with a time, month names in any length, a month and a year alone (its 1st) — and what is no date (${badD.map(([s]) => `${s} → ${L.readDate(s)}`).join('; ')})`);
  t.eq([L.readDate('11/28/2026', 'mdy'), L.readDate('5/6/2026', 'mdy')], [U(2026, 11, 28), U(2026, 5, 6)], 'month first when a column says so');

  // ---------------------------------------------------------------- the sheet read into columns
  const book = sheet.csv(new TextEncoder().encode(readFileSync(new URL('sales.csv', FIX), 'utf8')));
  const grid = book.sheets[0].rows;
  t.ok(L.looksLikeHeader(grid), 'the CSV\'s first row is its header');
  const d = L.readGrid(grid);
  t.eq([d.rows, d.header, d.cols.map((c) => `${c.name}:${c.kind}`)], [REF.rows, true, ['Date:date', 'Region:text', 'City:text', 'Product:text', 'Units:number', 'Price:number', 'Sales:number', 'Discount:number']], 'the sales sheet: 240 rows (the "Total" row left out), eight columns of the right kinds');
  t.ok(d.notes.some((n) => /“Total”.*left out/.test(n)), `the total row is named and left out (${d.notes.join(' / ')})`);
  const col = (n) => d.cols.find((c) => c.name === n);
  t.eq([col('Sales').fmt, col('Price').fmt, col('Discount').fmt], [{ currency: '₹', percent: false, decimals: 2, indian: true }, { currency: '₹', percent: false, decimals: 2, indian: true }, { currency: '', percent: true, decimals: 1, indian: false }], 'the columns\' formats: rupees with Indian grouping, a percentage');
  const sum = col('Sales').values.reduce((a, v) => a + v, 0);
  t.ok(near(sum, REF.total_sales, 1e-12) && col('Units').values.reduce((a, v) => a + v, 0) === REF.total_units, `every amount read as written (₹${sum.toFixed(2)})`);
  t.eq(L.readGrid(grid, true, true).rows, REF.rows + 1, '"Keep the total row" keeps it');
  // the same data from the workbook: real numbers and dates
  const wb = sheet.read(new Uint8Array(readFileSync(new URL('sales.xlsx', FIX))));
  const dx = L.readGrid(wb.sheets[0].rows);
  t.eq([dx.rows, dx.cols.map((c) => c.kind)], [REF.rows, ['date', 'text', 'text', 'text', 'number', 'number', 'number', 'number']], 'the workbook: the same columns (its dates as dates)');
  t.ok(dx.cols[0].values.every((v, i) => v === d.cols[0].values[i]) && dx.cols[6].values.every((v, i) => near(v, d.cols[6].values[i], 1e-12)), 'the workbook\'s dates and amounts are the CSV\'s');
  // month first, names, odd cells
  const us = L.readGrid([['When', 'Amount'], ['11/28/2026', '10'], ['12/25/2026', '20'], ['1/5/2026', '5']]);
  t.eq([us.cols[0].kind, us.cols[0].mdy, us.cols[0].values], ['date', true, [U(2026, 11, 28), U(2026, 12, 25), U(2026, 1, 5)]], 'a column whose dates can only be month first is read month first');
  const named = L.readGrid([['Name', '', 'Name', 'Score'], ['a', 'x', 'p', '1'], ['b', 'y', 'q', 'n/a'], ['c', 'z', 'r', '3'], ['d', 'w', 's', '4'], ['e', 'v', 't', '5']]);
  t.eq(named.cols.map((c) => c.name), ['Name', 'Column B', 'Name (2)', 'Score'], 'an empty heading is its letter; a repeated one numbered');
  t.eq([named.cols[3].kind, named.cols[3].odd, named.cols[3].values], ['number', 1, [1, null, 3, 4, 5]], 'four in five numbers: a number column, the odd cell left out and counted');
  t.ok(!L.looksLikeHeader([['10', '20'], ['30', '40']]), 'a first row of numbers is no header');
  const re = L.retype(col('Region'), grid.slice(1, -1).map((r) => r[1]), 'number');
  t.eq([re.kind, re.odd], ['number', REF.rows], 'a text column forced to numbers: what cannot be read is counted');

  // ---------------------------------------------------------------- a pasted range
  const { parse } = await import('parse5');
  const tree = (n) => ({ tag: n.nodeName.toLowerCase(), attrs: Object.fromEntries((n.attrs || []).map((a) => [a.name.toLowerCase(), a.value])), kids: (n.childNodes || []).flatMap((k) => (k.nodeName === '#text' ? [k.value] : k.nodeName.startsWith('#') ? [] : [tree(k)])) });
  const pasted = (file) => L.pasteTables(tree(parse(readFileSync(new URL(file, FIX), 'utf8'))));
  const R30 = REF.rows30, day = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const sameAs = (dd, rows, o = {}) => {
    const c = (n) => dd.cols.find((x) => x.name === n);
    const bad = [];
    rows.forEach((r, i) => {
      if (c('Date').values[i] !== day(r.date)) bad.push(`row ${i + 1} date ${c('Date').values[i]}`);
      for (const [k, n] of [['units', 'Units'], ['price', 'Price'], ['sales', 'Sales'], ['discount', 'Discount']]) if (!(o.skip?.(i, k)) && !near(c(n).values[i], r[k], 1e-12)) bad.push(`row ${i + 1} ${n} ${c(n).values[i]} ≠ ${r[k]}`);
      for (const [k, n] of [['region', 'Region'], ['city', 'City'], ['product', 'Product']]) if (c(n).values[i] !== r[k]) bad.push(`row ${i + 1} ${n}`);
    });
    return bad;
  };
  for (const [file, from] of [['paste-excel.html', 'Excel'], ['paste-libre.html', 'LibreOffice Calc'], ['paste-gsheets.html', 'Google Sheets']]) {
    const p = pasted(file), dd = L.readGrid(p.grid, undefined, false, p.exact);
    const bad = sameAs(dd, R30);
    t.ok(p.from === from && dd.rows === 30 && dd.header && !bad.length && dd.cols.map((x) => x.kind).join() === 'date,text,text,text,number,number,number,number',
      `${file}: read as copied from ${from} (${p.from}) — 30 rows under the header, every date, unit, price, sale and discount as in the sheet (${bad.slice(0, 4).join('; ')})`);
    t.eq([dd.cols[6].fmt.currency, dd.cols[7].fmt.percent], ['₹', true], `${file}: the sales in rupees, the discount a percentage — the formats from the text shown`);
  }
  const tsv = sheet.csv(new TextEncoder().encode(readFileSync(new URL('paste.tsv', FIX), 'utf8')), '\t').sheets[0].rows;
  const dt = L.readGrid(tsv), badT = sameAs(dt, R30);
  t.ok(dt.rows === 30 && !badT.length, `the clipboard's plain text (tab-separated, read by sheet.wasm): the same 30 rows (${badT.slice(0, 4).join('; ')})`);
  const pu = pasted('paste-excel-us.html'), du = L.readGrid(pu.grid, undefined, false, pu.exact), badU = sameAs(du, R30.slice(0, 12));
  t.ok(pu.from === 'Excel' && du.rows === 13 && !badU.length, `an American Excel's range: dates shown month first (4/7/2026) taken from the day numbers behind them, sales shown in whole dollars and the discount in whole percent taken at their exact values (${badU.slice(0, 4).join('; ')})`);
  t.eq([du.cols[6].values[12], du.cols[6].odd, du.cols[6].fmt.currency], [0, 0, '$'], 'its accounting zero ("$ -") is a sale of 0, not a cell that is no number');
  const web = L.pasteTables(tree(parse('<p>x</p><table><tr><td><table><tr><th>Name</th><th colspan="2">Score</th></tr><tr><td rowspan="2">Asha</td><td>10</td><td>12</td></tr><tr><td>11</td><td>13</td></tr><tr><td>Ravi</td><td>9</td><td>8<br>(late)</td></tr></table></td></tr></table><table><tr><td>a</td></tr></table>')));
  t.eq([web.from, web.grid], ['a web page', [['Name', 'Score', null], ['Asha', '10', '12'], [null, '11', '13'], ['Ravi', '9', '8 (late)']]], 'a web page\'s table: the largest of its tables (a table that only lays out another left out), colspan and rowspan on the grid, a line break a space');
  const sg = L.sampleGrid(), ds = L.readGrid(sg);
  t.ok(JSON.stringify(sg) === JSON.stringify(L.sampleGrid()) && ds.rows === 360 && ds.cols.map((x) => x.kind).join() === 'date,text,text,text,number,number,number,number' && ds.cols[6].fmt.currency === '₹' && L.presetsFor(ds).length >= 12,
    `the sample: the same 360 sales every time, read like a pasted sheet (${L.presetsFor(ds).length} presets)`);

  // ---------------------------------------------------------------- the presets
  const presets = L.presetsFor(d);
  t.eq(presets.map((p) => p.id), ['total-by', 'trend', 'cat-time', 'share', 'top10', 'count', 'avg', 'two-level', 'yoy', 'histogram', 'scatter', 'pareto', 'box'], `the presets the sales sheet suggests (${presets.map((p) => p.title).join(' · ')})`);
  t.eq([presets[0].title, presets[1].title, presets[4].title], ['Total Sales by Region', 'Sales by month', 'Top 10 City by Sales'], 'they lead with the amount (Sales, not Units or a unit price) and the dates by month (two years)');

  // ---------------------------------------------------------------- the pivots on Perspective's engine, against pandas
  const { schema, columns } = L.tableOf(d);
  const table = await perspective.table(schema);
  await table.update(columns);
  const MONTH = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
  const refKey = (v, f) => {
    if (v === null || v === undefined) return '';
    if (f?.grain === 'month_of_year') return String(MONTH[String(v).replace(/^\d+\s+/, '')]);
    if (f?.grain === 'year') return typeof v === 'number' ? String(new Date(v).getUTCFullYear()) : String(v).slice(0, 4);
    if (f?.grain) return typeof v === 'number' ? new Date(v).toISOString().slice(0, 10) : String(v).slice(0, 10);
    return String(v);
  };
  const FILTERS = {
    'north and south only': [{ field: 'Region', op: 'in', value: ['North', 'South'] }],
    'sales of 5000 and more': [{ field: 'Sales', op: '>=', value: 5000 }],
    'first half of 2026': [{ field: 'Date', op: '>=', value: U(2026, 1, 1) }, { field: 'Date', op: '<=', value: U(2026, 6, 30) }],
  };
  const specOf = (c, more = {}) => ({ rows: c.rows, cols: c.cols, values: c.values.map((v) => ({ ...v, field: v.field === 'Rows' ? L.ROWS : v.field })), filters: FILTERS[c.name] ?? [], order: 'label', top: 0, subtotals: true, totals: true, ...more });
  for (const c of REF.cases) {
    const p = await L.runPivot(table, specOf(c), d);
    let n = 0;
    const bad = [];
    for (const r of p.rows) {
      const path = r.path.map((v, k) => refKey(v, c.rows[k])).join('/');
      r.cells.forEach((v, ci) => {
        const col = p.cols[ci], split = col.split === null ? '' : refKey(col.split, c.cols);
        const want = c.cells[`${path}|${split}|${col.value}`];
        if (want === undefined && v === null) return;
        n++;
        if (!near(v, want ?? null)) bad.push(`${path}|${split}|${col.value}: ${v} ≠ ${want}`);
      });
      if (c.cols) r.total.forEach((v, vi) => { const want = c.cells[`${path}|*|${vi}`]; n++; if (!near(v, want ?? null)) bad.push(`${path} total ${vi}: ${v} ≠ ${want}`); });
    }
    const expected = Object.keys(c.cells).filter((k) => c.cells[k] !== null).length;
    t.ok(!bad.length && n >= expected, `${c.name}: every cell as pandas has it (${n} of ${expected}) ${bad.slice(0, 4).join('; ')}`);
  }

  // ---------------------------------------------------------------- what the values show, the order, the top N
  const caseOf = (name) => REF.cases.find((c) => c.name === name);
  const byRegion = caseOf('sum by region'), twoLevel = caseOf('sum by region and product'), split = caseOf('sum by region split by product'), months = caseOf('sales by month');
  const regions = ['East', 'North', 'South', 'West'];
  let p = await L.runPivot(table, specOf(byRegion, { values: [{ field: 'Sales', agg: 'sum', show: 'pct_total' }] }), d);
  t.ok(regions.every((r) => near(p.rows.find((x) => x.labels[0] === r).cells[0], byRegion.cells[`${r}||0`] / byRegion.cells['||0'])) && near(p.rows.at(-1).cells[0], 1), '% of the grand total: each region\'s share, the total 100 %');
  p = await L.runPivot(table, specOf(twoLevel, { values: [{ field: 'Sales', agg: 'sum', show: 'pct_parent' }] }), d);
  const tea = p.rows.find((x) => x.labels.join('/') === 'South/Tea');
  t.ok(near(tea.cells[0], twoLevel.cells['South/Tea||0'] / twoLevel.cells['South||0']) && near(p.rows.find((x) => x.labels.join('/') === 'South').cells[0], twoLevel.cells['South||0'] / twoLevel.cells['||0']), '% of the group above: a product of its region, a region of the total');
  p = await L.runPivot(table, specOf(split, { values: [{ field: 'Sales', agg: 'sum', show: 'pct_row' }] }), d);
  const ci = p.cols.findIndex((c) => c.split === 'Honey');
  t.ok(near(p.rows.find((x) => x.labels[0] === 'West').cells[ci], split.cells['West|Honey|0'] / split.cells['West|*|0']), '% of the row: a product of its region\'s total');
  p = await L.runPivot(table, specOf(split, { values: [{ field: 'Sales', agg: 'sum', show: 'pct_col' }] }), d);
  t.ok(near(p.rows.find((x) => x.labels[0] === 'West').cells[ci], split.cells['West|Honey|0'] / split.cells['|Honey|0']), '% of the column: a region of the product\'s total');
  p = await L.runPivot(table, specOf(months, { values: [{ field: 'Sales', agg: 'sum', show: 'running' }], totals: false }), d);
  const keys = Object.keys(months.cells).filter((k) => /^\d{4}-\d\d-\d\d\|\|0$/.test(k)).sort();
  let acc = 0;
  t.ok(p.rows.length === keys.length && keys.every((k, i) => near(p.rows[i].cells[0], (acc += months.cells[k]))), `a running total down the months, the last the whole sum (${p.rows.length} months)`);
  t.ok(p.rows.every((r) => r.kind !== 'total'), 'the total row hidden when asked');
  p = await L.runPivot(table, specOf(byRegion, { order: 'value-desc' }), d);
  const want = regions.slice().sort((a, b) => byRegion.cells[`${b}||0`] - byRegion.cells[`${a}||0`]);
  t.eq(p.rows.filter((r) => r.kind === 'leaf').map((r) => r.labels[0]), want, 'largest first');
  p = await L.runPivot(table, specOf(byRegion, { order: 'label-desc' }), d);
  t.eq(p.rows.filter((r) => r.kind === 'leaf').map((r) => r.labels[0]), [...regions].reverse(), 'Z to A');
  const prod = caseOf('min and max sales by product');
  p = await L.runPivot(table, { ...specOf(prod), values: [{ field: 'Sales', agg: 'sum', show: 'value' }], order: 'value-desc', top: 3 }, d);
  const sums = Object.fromEntries(['Tea', 'Coffee', 'Juice', 'Snacks', 'Biscuits', 'Honey'].map((x) => [x, REF.cases[1].cells ? 0 : 0]));
  for (const k of Object.keys(twoLevel.cells)) { const m = k.match(/^[A-Za-z]+\/([A-Za-z]+)\|\|0$/); if (m) sums[m[1]] += twoLevel.cells[k]; }
  const top3 = Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
  t.eq(p.rows.filter((r) => r.kind === 'leaf').map((r) => r.labels[0]), top3, `the top 3 products (${top3.join(', ')}), with a note`);
  t.ok(p.note.some((n) => /top 3 of 6/.test(n)) && near(p.rows.at(-1).cells[0], REF.total_sales), 'the total stays the total of all of them, and says so');
  p = await L.runPivot(table, specOf(twoLevel, { subtotals: false }), d);
  t.ok(p.rows.every((r) => r.kind !== 'sub') && p.rows.filter((r) => r.kind === 'leaf').length === Object.keys(twoLevel.cells).filter((k) => /^[A-Za-z]+\/[A-Za-z]+\|\|0$/.test(k)).length, 'subtotals off: only the leaves and the total');

  // ---------------------------------------------------------------- labels, the grid, Excel's values
  p = await L.runPivot(table, specOf(caseOf('sales by quarter')), d);
  t.eq(p.rows.slice(0, 3).map((r) => r.labels[0]), ['Q1 2025', 'Q2 2025', 'Q3 2025'], 'quarters named as people say them');
  p = await L.runPivot(table, specOf(caseOf('year against year')), d);
  t.eq([p.rows.slice(0, 2).map((r) => r.labels[0]), p.cols.map((c) => c.splitLabel)], [['January', 'February'], ['2025', '2026']], 'months of the year in their order, years as the split');
  const g = L.pivotGrid(await L.runPivot(table, specOf(split), d), d);
  t.eq([g[0].slice(0, 3), g[1].slice(0, 2), g.at(-1)[0]], [['', 'Biscuits', 'Coffee'], ['Region', 'Sum of Sales'], 'Total'], 'the pivot as a grid: the split\'s values over the values, a row a region, the total');
  t.ok(/^₹[\d,]+\.\d\d$/.test(g[2][1]), `cells written in the column's own format (${g[2][1]})`);
  const raw = L.pivotGrid(await L.runPivot(table, specOf(byRegion), d), d, true);
  t.ok(typeof raw[1][1] === 'number' && near(raw.at(-1)[1], REF.total_sales), 'the grid for Excel keeps the numbers as numbers');

  // ---------------------------------------------------------------- the histogram and the box plot
  const base = specOf({ rows: [], cols: null, values: [], name: '' });
  const bins = await L.histogramOf(table, 'Sales', base, d);
  const inBin = bins.from.map((f) => REF.sales.filter((v) => v >= f - 1e-9 && v < f + bins.step - 1e-9).length);
  t.ok(bins.counts.reduce((a, b) => a + b, 0) === REF.rows && JSON.stringify(inBin) === JSON.stringify(bins.counts), `the histogram: ${bins.counts.length} bins of ${bins.step}, each row in the bin of its value (${bins.counts.join(' ')})`);
  t.ok(bins.from[0] <= REF.sales_min && bins.from.at(-1) + bins.step > REF.sales_max, 'the bins hold the smallest and the largest value');
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const mc = bindMathcore(await wasm('mathcore'));
  const boxes = await L.boxesOf(table, 'Sales', { ...base, rows: [{ name: 'Product' }] }, d, (xs) => mc.stats(xs));
  t.ok(boxes.cats.length === 6 && boxes.cats.every((c, i) => { const s = REF.spread[c]; return near(boxes.stats[i][0], s.min) && near(boxes.stats[i][4], s.max) && near(boxes.stats[i][1], s.linear[0]) && near(boxes.stats[i][2], s.linear[1]) && near(boxes.stats[i][3], s.linear[2]); }),
    `the box plot: each product's smallest, first quartile, median, third quartile and largest sale — NumPy's (${boxes.cats.join(', ')})`);
  const pts = await L.pointsOf(table, 'Units', 'Sales', base, d);
  t.ok(pts.x.length === REF.rows && pts.y.length === REF.rows && near(pts.y.reduce((a, b) => a + b, 0), REF.total_sales), 'the scatter: every row a point');

  // ---------------------------------------------------------------- the tables a card shows and saves
  {
    const two = L.tableOfPivot(await L.runPivot(table, specOf(twoLevel), d));
    const lab = L.shownLabels(two);
    t.eq([two.heads.map((r) => r.map((c) => `${c.text}${c.span > 1 ? `×${c.span}` : ''}`)), two.lead, lab.slice(0, 3), lab.at(-1)], [[['Region', 'Product', 'Sum of Sales', 'Sum of Units']], 2, [['East', ''], ['', 'Biscuits'], ['', 'Coffee']], ['Total', '']],
      'a pivot of two levels as a table: one header row, a group\'s label once (its subtotal row), then its products, the total last');
    const csv = L.csvRows(two);
    t.eq([csv[0], csv[1].slice(0, 2), csv[2].slice(0, 2), csv.at(-1)[0], csv[2][2], csv[2][3]], [['Region', 'Product', 'Sum of Sales', 'Sum of Units'], ['East', 'Subtotal'], ['East', 'Biscuits'], 'Total', String(+twoLevel.cells['East/Biscuits||0'].toPrecision(15)), String(twoLevel.cells['East/Biscuits||1'])],
      'its CSV: every row with its labels in full (a subtotal named), the numbers plain');
    const sp1 = L.tableOfPivot(await L.runPivot(table, specOf(split), d));
    t.eq(sp1.heads.map((r) => r.map((c) => `${c.text}${c.span > 1 ? `×${c.span}` : ''}`)), [['Sum of Sales', 'Product×6'], ['Region', 'Biscuits', 'Coffee', 'Honey', 'Juice', 'Snacks', 'Tea']], 'split by product, one value: its name over the region, the products under the split\'s name (as Excel lays it out)');
    const sp2 = L.tableOfPivot(await L.runPivot(table, specOf(split, { values: [{ field: 'Sales', agg: 'sum', show: 'value' }, { field: 'Units', agg: 'sum', show: 'value' }] }), d));
    t.eq(sp2.heads.map((r) => r.map((c) => `${c.text}${c.span > 1 ? `×${c.span}` : ''}`).slice(0, 4)), [['Product', 'Biscuits×2', 'Coffee×2', 'Honey×2'], ['Region', 'Sum of Sales', 'Sum of Units', 'Sum of Sales']], '… two values: each product over its two values');
    const share = L.tableOfPivot(await L.runPivot(table, specOf(byRegion, { values: [{ field: 'Sales', agg: 'sum', show: 'pct_total' }, { field: 'Sales', agg: 'sum', show: 'value' }] }), d));
    const xr = L.xlsxRows(share), cs = L.csvRows(share);
    t.eq([xr[0][0], xr[1][1].format, xr[1][2].format, xr.at(-1)[0], xr.at(-1)[2].bold, /%$/.test(cs[1][1]), xr[1][1].shown.endsWith(' %')], [{ text: 'Region', bold: true }, '0.0%', '[$₹-4009]#,##,##0.00', { text: 'Total', bold: true }, true, true, true],
      'for Excel: the header in bold, a share as 0.0 % and rupees as [$₹-4009]#,##,##0.00, the total row in bold; in the CSV a share with %');
    t.eq([L.excelFormat({ currency: '$', percent: false, decimals: 2, indian: false }), L.excelFormat({ currency: '', percent: false, decimals: 0, indian: false }), L.excelFormat({ currency: '€', percent: false, decimals: 1, indian: false }), L.excelFormat({ currency: '', percent: true, decimals: 4, indian: false })],
      ['[$$-409]#,##0.00', '#,##0', '"€"#,##0.0', '0.00%'], 'Excel\'s formats of dollars, plain numbers, euros, percentages');
    const bt = L.tableOfBins(bins), bxT = L.tableOfBoxes(await L.boxesOf(table, 'Sales', { ...base, rows: [{ name: 'Product' }] }, d, (xs) => mc.stats(xs)), 'Product');
    t.ok(bt.rows.length === bins.counts.length && bt.rows.every((r, i) => r.values[0] === bins.counts[i]) && bxT.rows.length === 6 && bxT.heads[0][3].text === 'Median Sales', 'the histogram\'s bins and the box plot\'s five numbers as tables');
  }

  // ---------------------------------------------------------------- the graphs' options
  const pr = await L.runPivot(table, specOf(byRegion), d);
  const col_ = L.chartOption('column', pr, { title: 'x', dark: false });
  t.eq([col_.xAxis.data, col_.series[0].data.map((v) => +v.toFixed(2))], [regions, regions.map((r) => +byRegion.cells[`${r}||0`].toFixed(2))], 'columns: a region a column, its sum');
  const pie = L.chartOption('donut', pr, { title: 'x', dark: true });
  t.eq([pie.series[0].type, pie.series[0].radius, pie.series[0].data.map((x) => x.name)], ['pie', ['42%', '70%'], regions], 'a donut of the regions');
  const tm = L.chartOption('treemap', await L.runPivot(table, specOf(twoLevel), d), { title: 'x', dark: false });
  t.ok(tm.series[0].data.length === 4 && near(tm.series[0].data.reduce((a, x) => a + x.value, 0), REF.total_sales, 1e-9) && tm.series[0].data.every((x) => x.children?.length), 'a treemap: regions holding their products, sizes adding up to the total');
  const wf = L.chartOption('waterfall', pr, { title: 'x', dark: false });
  t.ok(near(wf.series[3].data.at(-1), REF.total_sales, 1e-9) && wf.xAxis.data.at(-1) === 'Total', 'a waterfall ends on the total');
  const pa = L.chartOption('pareto', pr, { title: 'x', dark: false });
  t.ok(pa.series[1].data.at(-1) === 100 && pa.series[0].data.every((v, i, a) => !i || a[i - 1] >= v), 'a Pareto: largest first, the cumulative share ending at 100 %');
  const sp = await L.runPivot(table, specOf(split), d);
  const c100 = L.chartOption('column-100', sp, { title: 'x', dark: false });
  t.ok(c100.xAxis.data.every((_, i) => near(c100.series.reduce((a, s) => a + (s.data[i] ?? 0), 0), 100, 1e-6)), 'columns at 100 %: each region\'s products add up to 100');
  const hm = L.chartOption('heatmap', sp, { title: 'x', dark: false });
  t.eq([hm.series[0].data.length, hm.xAxis.data.length, hm.yAxis.data.length], [4 * 6, 6, 4], 'a heatmap: a cell a region and product');
  const st = L.chartOption('column-stacked', sp, { title: 'x', dark: false });
  t.ok(st.series.length === 6 && st.series.every((s) => s.stack === 'all'), 'stacked columns: a series a product');
  const hi = L.chartOption('histogram', null, { title: 'x', dark: false, extra: { bins } });
  t.eq(hi.series[0].data, bins.counts, 'the histogram\'s bars are the bins\' counts');
  t.ok(col_.aria?.enabled === true, 'every graph is described for screen readers (ECharts\' aria)');

  // ---------------------------------------------------------------- numbers written
  const F = (v, f) => L.fmtNumber(v, { currency: '', percent: false, decimals: 0, indian: false, ...f });
  t.eq([F(123456.789, { currency: '₹', decimals: 2, indian: true }), F(-5, { currency: '₹', decimals: 2, indian: true }), F(0.125, { percent: true, decimals: 1 }), F(1234567), F(1234567, { indian: true }), F(-0.0001, { decimals: 2 }), F(null)],
    ['₹1,23,456.79', '−₹5.00', '12.5 %', '1,234,567', '12,34,567', '0.00', ''], 'numbers in their columns\' format: rupees in lakhs, a percentage, a real minus sign, no "−0.00"');
  t.eq([L.niceStep(1000, 20), L.niceStep(37, 20), L.niceStep(0.9, 20), L.niceStep(0)], [50, 2, 0.05, 1], 'nice steps for an axis or bins');
  await table.delete();
};
