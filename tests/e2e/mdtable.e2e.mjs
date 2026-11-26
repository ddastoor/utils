// Markdown Table (#/mdtable, PC only): the output parsed by Python-Markdown's table extension gives back the same cells
// and alignments; columns padded to equal width (Unicode-aware); pipes escaped; editing cells, adding/removing rows and
// columns; importing CSV, Excel/Sheets tab-separated and an existing Markdown table; a tab inside a quoted comma cell,
// semicolons, line breaks in cells (<br>), a table inside other text, CJK / emoji widths, the output read by cmark-gfm
// (the Markdown Editor tab), 3,000 rows, download; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from '../lib/child.mjs';
import { readFileSync } from 'node:fs';
const parse = (md) => JSON.parse(execFileSync('python3', ['-c', `import sys, json, markdown, html.parser
h = markdown.markdown(sys.stdin.read(), extensions=["tables"])
class P(html.parser.HTMLParser):
    rows=[]; cur=None; al=[]; cell=None
    def handle_starttag(s,t,a):
        if t=="tr": s.cur=[]
        if t in("td","th"): s.cell=""; d=dict(a); st=d.get("style","") or ""; s.al.append(d.get("align") or (st.split(":")[1].strip().rstrip(";") if "text-align" in st else "none")) if not s.rows else None
    def handle_endtag(s,t):
        if t in("td","th"): s.cur.append(s.cell); s.cell=None
        if t=="tr": s.rows.append(s.cur)
    def handle_data(s,d):
        if s.cell is not None: s.cell+=d
p=P(); p.feed(h); print(json.dumps({"rows":p.rows,"align":p.al}))`], { input: md }).toString());
export default async (ctx) => {
  const { base, page: newPage, ok, info } = ctx;
  try { execFileSync('python3', ['-c', 'import markdown']); } catch { info('python markdown missing — pip install --user markdown'); return; }
  const page = await newPage(); await page.goto(`${base}#/mdtable`);
  const out = page.locator('textarea').nth(1); await page.waitForFunction(() => document.querySelectorAll('textarea')[1]?.value.length > 0);
  let md = await out.inputValue(), p = parse(md);
  ok(JSON.stringify(p.rows) === JSON.stringify([['Item', 'Qty', 'Price (₹)'], ['Chai', '2', '40'], ['Samosa', '3', '45'], ['Lassi', '1', '60']]) && JSON.stringify(p.align) === '["left","right","right"]', `sample parses back (${JSON.stringify(p)})`);
  const lines = md.split('\n'); ok(lines.every((l) => [...l].length === [...lines[0]].length), 'all lines padded to the same width (₹ counted as one character)');
  await page.locator('input[aria-label="Row 2 column 1"]').fill('Masala | chai'); md = await out.inputValue(); p = parse(md);
  ok(p.rows[1][0] === 'Masala | chai' && md.includes('Masala \\| chai'), 'a pipe in a cell is escaped and survives');
  await page.locator('thead select').nth(0).selectOption('center'); p = parse(await out.inputValue()); ok(p.align[0] === 'center', 'alignment change');
  await page.getByRole('button', { name: 'Add column' }).click(); await page.locator('input[aria-label="Row 3 column 4"]').fill('veg');
  await page.getByRole('button', { name: 'Add row' }).click(); await page.locator('input[aria-label="Row 5 column 1"]').fill('Dosa');
  p = parse(await out.inputValue()); ok(p.rows.length === 5 && p.rows[0][3] === 'Column 4' && p.rows[2][3] === 'veg' && p.rows[4][0] === 'Dosa', 'add column and row');
  await page.getByRole('button', { name: 'Delete row 3' }).click(); await page.getByRole('button', { name: 'Delete column 2' }).click();
  p = parse(await out.inputValue()); ok(p.rows.length === 4 && p.rows[0].join() === 'Item,Price (₹),Column 4', 'delete row and column');
  const imp = async (t) => { await page.locator('textarea').nth(0).fill(t); await page.getByRole('button', { name: 'Import', exact: true }).click(); await page.waitForTimeout(400); return parse(await out.inputValue()); };
  p = await imp('name,city,"note, with comma"\nAsha,Pune,"said ""hi"""\nRavi,Delhi,'); ok(JSON.stringify(p.rows) === JSON.stringify([['name', 'city', 'note, with comma'], ['Asha', 'Pune', 'said "hi"'], ['Ravi', 'Delhi', '']]), `CSV import with quotes (${JSON.stringify(p.rows)})`);
  p = await imp('A\tB\n1\t2\n3\t4'); ok(JSON.stringify(p.rows) === '[["A","B"],["1","2"],["3","4"]]', 'tab-separated paste (Excel / Google Sheets)');
  p = await imp('| x | y |\n|:-:|--:|\n| 1 | 2 |'); ok(JSON.stringify(p.rows) === '[["x","y"],["1","2"]]' && JSON.stringify(p.align) === '["center","right"]', 'existing Markdown table imported with alignment');
  // ---- imports that used to go wrong
  const note = async () => (await page.locator('.note').allTextContents()).join(' | ');
  const boxes = () => page.$$eval('.md-cell', (e) => e.map((x) => x.value));
  p = await imp('name,note\n"A","x\ty"\n"B","z"'); ok(JSON.stringify(await boxes()) === '["name","note","A","x\\ty","B","z"]' && /Read 3 rows \(comma-separated\)/.test(await note()), `a comma file with a tab inside a quoted cell is still comma-separated (${JSON.stringify(await boxes())})`);
  p = await imp('a;b;c\n1;2;3'); ok(JSON.stringify(p.rows) === '[["a","b","c"],["1","2","3"]]' && /";"-separated/.test(await note()), 'semicolon-separated values');
  await imp('only'); ok(/Read 1 row \(/.test(await note()), '"1 row", not "1 rows"');
  await imp('name,note\n"Asha","line1\nline2"\n"Ravi","a|b"'); md = await out.inputValue();
  ok(md.includes('| Asha | line1<br>line2 |') && md.includes('| Ravi | a\\|b           |') && (await boxes())[3] === 'line1<br>line2', 'a line break inside a cell is written <br> in the table and in the editor box (the box used to drop it)');
  await page.locator('input[aria-label="Row 2 column 2"]').fill('p<br>q|r<BR/>s'); ok((await out.inputValue()).includes('| Asha | p<br>q\\|r<br>s |'), 'editing a cell with <br> keeps the line breaks');
  p = await imp('Intro line\n\n| h1 | h2 |\n|----|:--:|\n| 1 | 2 |\n\nfooter | with pipe');
  ok(JSON.stringify(p.rows) === '[["h1","h2"],["1","2"]]' && JSON.stringify(p.align) === '["none","center"]' && /Read a Markdown table: 2 rows/.test(await note()), 'a Markdown table inside other text: only the table is taken (the footer line used to become a row)');
  await imp('title\n-----\nsome text, more'); ok((await boxes())[0] === 'title' && (await boxes()).includes('-----') && /comma-separated/.test(await note()), 'a heading underlined with --- is not taken for a Markdown table');
  await page.locator('textarea').nth(0).fill('   '); await page.getByRole('button', { name: 'Import', exact: true }).click(); ok(await page.waitForFunction(() => /Nothing to import — paste a table first/.test(document.body.textContent), null, { timeout: 5000 }).then(() => true, () => false), 'an empty import is said to be empty');
  await imp('名前,都市\n山田太郎,東京\nAsha 😀,Pune'); md = await out.inputValue();
  const width = (l) => [...new Intl.Segmenter().segment(l)].reduce((n, g) => n + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]|\p{Extended_Pictographic}/u.test(g.segment) ? 2 : 1), 0);
  ok(md === '| 名前     | 都市 |\n| -------- | ---- |\n| 山田太郎 | 東京 |\n| Asha 😀  | Pune |' && new Set(md.split('\n').map(width)).size === 1, 'Japanese and emoji cells: every line has the same display width (wide characters count as two)');
  // the app's own GFM engine (cmark-gfm, the Markdown Editor tab) reads the output as the same table
  const rows5 = [['Item | Qty', 'Price (₹)', 'Note'], ['Masala chai', '40', 'a\\b'], ['x | y', '', 'पुणे'], ['', 'C:\\dir\\', '**bold**']];
  await imp(rows5.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')); await page.locator('thead select').nth(1).selectOption('right'); await page.locator('thead select').nth(2).selectOption('center');
  md = await out.inputValue();
  const mdPage = await newPage(); await mdPage.goto(`${base}#/markdown`); await mdPage.getByLabel('Markdown text').fill(md); await mdPage.locator('.md-preview table').waitFor();
  await mdPage.waitForFunction(() => document.querySelectorAll('.md-preview tr').length === 4);
  const seen = await mdPage.$$eval('.md-preview tr', (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent)));
  const aligns = await mdPage.$$eval('.md-preview th', (ths) => ths.map((c) => c.style.textAlign || c.getAttribute('align') || 'none'));
  ok(JSON.stringify(seen) === JSON.stringify([['Item | Qty', 'Price (₹)', 'Note'], ['Masala chai', '40', 'a\\b'], ['x | y', '', 'पुणे'], ['', 'C:\\dir\\', 'bold']]) && aligns.join() === 'none,right,center', `cmark-gfm (the Markdown Editor tab) reads the output as the same cells and alignments (${JSON.stringify(seen)} ${aligns})`);
  await mdPage.context().close();
  // a big paste: the editor shows a part, the Markdown has everything
  const big = Array.from({ length: 3000 }, (_, i) => `r${i},a,b,c,d,e,f,g`).join('\n'); const t0 = Date.now();
  await page.locator('textarea').nth(0).evaluate((e, v) => { e.value = v; }, big); await page.getByRole('button', { name: 'Import', exact: true }).click();
  ok(await page.waitForFunction(() => /Read 3,000 rows/.test(document.body.textContent), null, { timeout: 20000 }).then(() => true, () => false) && await page.locator('.md-cell').count() === 1600 && (await out.inputValue()).split('\n').length === 3001 && /The editor shows the first 200 of 3,000 rows; the Markdown below has all of them/.test(await note()), `3,000 rows × 8 columns in ${Date.now() - t0} ms: 200 rows in the editor, all 3,000 in the Markdown`);
  const t1 = Date.now(); await page.locator('input[aria-label="Row 2 column 1"]').fill('edited'); ok((await out.inputValue()).split('\n')[2].startsWith('| edited') && Date.now() - t1 < 6000, `editing a cell of the big table does not redraw 24,000 boxes (${Date.now() - t1} ms)`);
  const f = await ctx.download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(f.endsWith('table.md') && readFileSync(f, 'utf8') === `${await out.inputValue()}\n`, 'Download saves table.md');
  // a sheet of 5,000 rows in Hindi with emoji: every keystroke in a cell laid the whole table out again, measuring every
  // cell's width (426 ms a key, then a 2.1 s task); widths are remembered now and a big table follows when typing pauses
  const hindi = ['Name,City,Note,Amount,Code', ...Array.from({ length: 5000 }, (_, i) => `Café ${i},नमस्ते पुणे,ok 😀 ${i},${i * 3},X${i}`)].join('\n');
  await page.locator('textarea').nth(0).evaluate((e, v) => { e.value = v; }, hindi); await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForFunction(() => /Read 5,001 rows/.test(document.body.textContent), null, { timeout: 30000 });
  const typing = await page.evaluate(async () => {
    const longs = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); }); po.observe({ type: 'longtask' });
    const c = document.querySelector('input[aria-label="Row 2 column 1"]'), keys = [];
    for (const ch of 'Asha') { const t0 = performance.now(); c.value += ch; c.dispatchEvent(new Event('input', { bubbles: true })); keys.push(performance.now() - t0); await new Promise((r) => setTimeout(r, 60)); }
    await new Promise((r) => setTimeout(r, 1500)); po.disconnect();
    return { key: Math.round(Math.max(...keys)), longest: Math.max(0, ...longs), line: document.querySelectorAll('textarea')[1].value.split('\n')[2] };
  });
  ok(typing.key < 50 && typing.longest < 500 && typing.line.startsWith('| Café 0Asha '), `typing in a cell of a 5,000-row Hindi table: ${typing.key} ms a key, longest task ${typing.longest} ms, the Markdown follows ("${typing.line.slice(0, 24)}")`);
  await page.locator('input[aria-label="Row 3 column 1"]').evaluate((c) => { c.value += 'Z'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  const fz = readFileSync(await ctx.download(page, () => page.getByRole('button', { name: 'Download' }).click()), 'utf8');
  ok(fz.split('\n')[3].startsWith('| Café 1Z '), 'Download right after a keystroke has it (the table was waiting for the pause)');
  // 160,000 rows: the column count and widths came from Math.max(...) over every row, which overflowed the call stack
  const huge = ['k,v', ...Array.from({ length: 160000 }, (_, i) => `${i},v${i}`)].join('\n');
  await page.locator('textarea').nth(0).evaluate((e, v) => { e.value = v; }, huge); await page.getByRole('button', { name: 'Import', exact: true }).click();
  const hugeOk = await page.waitForFunction(() => /Read (1,60,001|160,001) rows/.test(document.body.textContent), null, { timeout: 60000 }).then(() => true, () => false);
  const lastLine = await out.evaluate((t) => { const v = t.value; return v.slice(v.lastIndexOf('\n') + 1); });
  ok(hugeOk && /^\| 159999 \| v159999 \|$/.test(lastLine) && !page.errors.filter((e) => !/Keep at least one column/.test(e)).length, `a 160,000-row CSV: read and laid out ("${lastLine}"; errors: ${page.errors.join(' | ').slice(0, 80)})`);
  await imp('a\n1'); await page.getByRole('button', { name: 'Delete column 1' }).click();
  ok(await page.waitForFunction(() => /Keep at least one column/.test(document.querySelector('.toasts')?.textContent || ''), null, { timeout: 5000 }).then(() => true, () => false) && (await boxes()).join() === 'a,1', 'the last column cannot be deleted');
  ok(!page.errors.filter((e) => !/Keep at least one column/.test(e)).length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'mdtable');
};
