// XML Formatter / XPath (#/xml, PC only): formatted and minified output is well-formed and canonically equal to the input
// (Python's C14N with whitespace-only text removed), indent options, comments kept/dropped, entities and CDATA preserved,
// XPath node / number / string / boolean results with namespace prefixes, syntax errors with line and column, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
const c14n = (x) => execFileSync('python3', ['-c', `import sys, xml.etree.ElementTree as ET
def strip(e):
    if e.text is not None and not e.text.strip(): e.text = None
    if e.tail is not None and not e.tail.strip(): e.tail = None
    for c in e: strip(c)
r = ET.fromstring(sys.stdin.buffer.read()); strip(r); print(ET.canonicalize(ET.tostring(r), strip_text=True, with_comments=False))`], { input: x }).toString();
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/xml`);
  const src = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1), xp = page.locator('input[aria-label=XPath]'); await src.waitFor();
  const orig = await src.inputValue(); let f = await out.inputValue();
  ok(f.startsWith('<catalog xmlns:p="urn:price">\n  <!-- spice list -->\n  <item id="1" type="spice">\n    <name>Cardamom</name>') || f.includes('\n  <item id="1" type="spice">\n    <name>Cardamom</name>'), `indented 2 spaces:\n${f.slice(0, 160)}`);
  ok(c14n(f) === c14n(orig.replace(/<\?xml[^>]*\?>/, '')), 'formatted = original (canonical XML, Python C14N)');
  ok(f.includes('Saffron &amp; more'), 'entity kept escaped');
  await page.getByRole('radio', { name: 'Minify' }).click(); f = await out.inputValue(); ok(!f.includes('\n') && c14n(f) === c14n(orig.replace(/<\?xml[^>]*\?>/, '')), 'minified: one line, same canonical XML');
  await page.getByRole('radio', { name: 'Tab' }).click(); ok((await out.inputValue()).includes('\n\t<item'), 'tab indent');
  await page.locator('label.switch', { hasText: 'Keep comments' }).click(); ok(!(await out.inputValue()).includes('<!--'), 'comments dropped');
  await page.getByRole('radio', { name: '2 spaces' }).click();
  const res = () => page.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('.card-title')?.textContent === 'XPath'); const t = c.querySelector('table'); return { muted: c.querySelector('.muted')?.textContent, rows: t ? [...t.querySelectorAll('tbody tr')].map((r) => [...r.children].map((x) => x.textContent)) : null, kv: [...c.querySelectorAll('.kv span')].map((x) => x.textContent) }; });
  let r = await res(); ok(r.muted === '2 nodes' && r.rows.map((x) => x[2]).join() === 'Cardamom,Saffron & more', `//item[@type="spice"]/name → 2 nodes (${JSON.stringify(r.rows)})`);
  await xp.fill('count(//item)'); await page.waitForTimeout(250); r = await res(); ok(r.kv.join() === 'Number,3', 'count(//item) = 3');
  await xp.fill('sum(//p:price)'); await page.waitForTimeout(250); r = await res(); ok(r.kv.join() === 'Number,1410', 'sum(//p:price) = 1410 (namespace prefix resolved)');
  await xp.fill('string(//item[last()]/name)'); await page.waitForTimeout(250); r = await res(); ok(r.kv.join() === 'String,Assam', 'string(...) = Assam');
  await xp.fill('//item[2]/@id'); await page.waitForTimeout(250); r = await res(); ok(r.rows?.[0][1] === '@id="2"', 'attribute node');
  await xp.fill('boolean(//item[@type="coffee"])'); await page.waitForTimeout(250); r = await res(); ok(r.kv.join() === 'Boolean,false', 'boolean');
  await xp.fill('//item['); await page.waitForTimeout(250); ok(/XPath error/.test(await page.locator('.note-warn').last().textContent()), 'bad XPath → message');
  await src.fill('<a>\n  <b>text</b>\n  <c><![CDATA[x < y && z]]></c>\n</a>'); await page.waitForTimeout(250); ok((await out.inputValue()).includes('<c><![CDATA[x < y && z]]></c>'), 'CDATA preserved');
  await src.fill('<a>\n  <b>text</c>\n</a>'); await page.waitForTimeout(250); ok(/Line 2, column \d+/.test(await page.locator('.note-warn').first().textContent()), `syntax error with line/column (${await page.locator('.note-warn').first().textContent()})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'xml');
};
