// Markdown Table (#/mdtable, PC only): the output parsed by Python-Markdown's table extension gives back the same cells
// and alignments; columns padded to equal width (Unicode-aware); pipes escaped; editing cells, adding/removing rows and
// columns; importing CSV, Excel/Sheets tab-separated and an existing Markdown table; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
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
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'mdtable');
};
