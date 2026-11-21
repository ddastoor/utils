// XML Formatter / XPath (#/xml, PC only): formatted and minified output is well-formed and canonically equal to the input
// (Python's C14N with whitespace-only text removed), indent options, comments kept/dropped, entities and CDATA preserved,
// XPath node / number / string / boolean results with namespace prefixes, syntax errors with line and column; 74
// documents compared before / after by Chrome's XML parser; declaration, DOCTYPE, entities and text kept as typed;
// xml: and default-namespace prefixes in XPath; ISO-8859-1 and UTF-16 files; a 1.3 MB document; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { REF, setValue } from './_devdata.mjs';
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
  // ---- the formatter moves white space between tags and nothing else (devcore-xml); Chrome's XML parser is the judge
  const status = async () => (await page.locator('.card').first().locator('.note').allTextContents()).join(' | ');
  const put = async (text, indent) => { await setValue(src, text); if (indent) await page.getByRole('radio', { name: indent, exact: true }).click(); else await page.waitForTimeout(230); return out.inputValue(); };
  await page.locator('label.switch', { hasText: 'Keep comments' }).click(); // on again
  const same = (a, b) => page.evaluate(([x, y]) => {
    const WS = /^[ \t\r\n]*$/;
    const norm = (text) => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const walk = (el, keep) => { const sp = el.getAttribute('xml:space'); keep = sp === 'preserve' ? true : sp === 'default' ? false : keep; const kids = [...el.childNodes];
        const hasText = kids.some((k) => k.nodeType === 4 || (k.nodeType === 3 && !WS.test(k.nodeValue)));
        if (!keep && !hasText && kids.some((k) => k.nodeType !== 3)) kids.filter((k) => k.nodeType === 3).forEach((k) => k.remove());
        for (const k of el.children) walk(k, keep); };
      walk(doc.documentElement, false); return doc;
    };
    const p = norm(x), q = norm(y), top = (d) => [...d.childNodes].map((n) => `${n.nodeType}:${n.nodeType === 1 ? '' : n.nodeValue ?? `${n.name}|${n.publicId}|${n.systemId}`}`).join('\n');
    return p.documentElement.isEqualNode(q.documentElement) && top(p) === top(q);
  }, [a, b]);
  let eq = 0, mini = 0, n = 0; const INDENTS = ['4 spaces', 'Tab', 'Minify', '2 spaces'];
  for (const [i, d] of REF.xml.entries()) {
    n++; const f1 = await put(d.src, INDENTS[i % 4]);
    if (f1 && await same(d.src, f1)) eq++; else ok(false, `${d.name}: the formatted document is not the same document\n${d.src}\n${f1}`);
    if (i % 4 !== 2 || /\n/.test(d.src) || !/\n/.test(f1)) mini++;
  }
  ok(eq === n && n >= 70, `${n} documents (RSS, SVG, SOAP, a Maven POM, a plist with DOCTYPE, entities, mixed content, xml:space, processing instructions, Hindi names, random trees) at 4 spaces / tab / minified / 2 spaces: Chrome's XML parser sees the same document as before — same elements, attributes, text, comments, CDATA (${eq})`);
  ok(mini === n, 'the minified form of a one-line document is one line');
  await page.getByRole('radio', { name: '2 spaces', exact: true }).click();
  f = await put('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><!DOCTYPE note SYSTEM "note.dtd" [<!ENTITY w "World">]><note><to>&w; &amp; &#169;</to><e a="1&#10;2"/><x></x></note>');
  ok(f === '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<!DOCTYPE note SYSTEM "note.dtd" [<!ENTITY w "World">]>\n<note>\n  <to>&w; &amp; &#169;</to>\n  <e a="1&#10;2"/>\n  <x></x>\n</note>', `the declaration, the DOCTYPE with its internal subset, &w; &#169; &#10; and <x></x> are kept as typed (they used to be dropped, expanded or rewritten):\n${f}`);
  f = await put('<a><b> </b><c>  padded  </c><d> </d></a>'); ok(f === '<a>\n  <b> </b>\n  <c>  padded  </c>\n  <d> </d>\n</a>', 'text is never trimmed: a lone space, padding and a no-break space stay (they used to vanish)');
  f = await put('<p>Hello <b>bold</b> and <i>it</i>.</p>'); ok(f === '<p>Hello <b>bold</b> and <i>it</i>.</p>', 'mixed content (text between elements) is left as written — no line breaks are put into a sentence');
  f = await put('<log><parsererror>disk full</parsererror><ok/></log>'); ok(f === '<log>\n  <parsererror>disk full</parsererror>\n  <ok/>\n</log>' && /Well-formed XML · root <log> · 3 elements/.test(await status()), 'a document that has an element called <parsererror> is not an error');
  f = await put('<a/>'); ok(f === '<a/>' && /root <a> · 1 element$/.test(await status()), '"1 element", not "1 elements"');
  f = await put('\ufeff<?xml version="1.0"?><a><b/></a>'); ok(f === '<?xml version="1.0"?>\n<a>\n  <b/>\n</a>', 'a byte-order mark in pasted text');
  f = await put(''); ok(f === '' && /Paste XML or open a file/.test(await status()) && await page.locator('.note-warn').count() === 0, 'an empty box: a hint, not an error');
  f = await put('<a><b></a>'); ok(f === '' && /^Line 1, column \d+: /.test(await status()) && !/Below is a rendering/.test(await status()), `a mismatched tag: line, column and the reason only (${await status()})`);
  f = await put('<a>&nbsp;</a>'); ok(f === '' && /Line 1, column \d+/.test(await status()), 'an entity XML does not know (&nbsp;) is an error, as in every XML parser');
  // XPath
  const xr = async (q) => { await xp.fill(q); await page.waitForTimeout(240); return res(); };
  await put('<r xml:lang="en"><a xml:lang="hi">नमस्ते</a><b>hello</b></r>'); r = await xr('//*[@xml:lang="hi"]'); ok(r.muted === '1 node' && r.rows[0][2] === 'नमस्ते', 'the xml: prefix works in XPath (it used to be "unresolvable")');
  r = await xr('//*[lang("en")]'); ok(r.muted === '2 nodes', 'lang() follows xml:lang');
  await put('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A</title></entry><entry><title>B</title></entry></feed>'); r = await xr('//entry');
  ok(r.muted === '0 nodes' && /default namespace \(xmlns="http:\/\/www\.w3\.org\/2005\/Atom"\), so plain names such as \/\/item match nothing\. Write \/\/d:item/.test(await page.locator('.card').last().locator('.note').textContent()), 'a document with a default namespace: why //entry finds nothing, and what to write');
  r = await xr('//d:entry/d:title'); ok(r.muted === '2 nodes' && r.rows.map((x) => x[2]).join() === 'A,B', 'the d: prefix is bound to the default namespace');
  r = await xr('//*[local-name()="title"]'); ok(r.muted === '2 nodes', 'local-name() works as well');
  await put(`<r>${'<i/>'.repeat(700)}</r>`); r = await xr('//i'); ok(r.muted === '700 nodes (the first 500 are listed)' && r.rows.length === 500, 'a long result: all counted, 500 listed');
  r = await xr('string(//nothing)'); ok(r.kv.join() === 'String,(empty)', 'an empty string result is shown as such');
  // files in other encodings
  await page.locator('input[type=file]').setInputFiles({ name: 'l1.xml', mimeType: 'text/xml', buffer: Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a><b>caf\xe9 \xa3</b></a>', 'latin1') });
  ok(await page.waitForFunction(() => document.querySelectorAll('textarea')[1].value.includes('café £'), null, { timeout: 8000 }).then(() => true, () => false) && /the file was read as ISO-8859-1; Download saves UTF-8 and corrects the declaration/.test(await status()), 'an ISO-8859-1 file is read in its own encoding (é and £ used to become �)');
  const dl = await ctx.download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(dl.endsWith('formatted.xml') && readFileSync(dl, 'utf8') === '<?xml version="1.0" encoding="UTF-8"?>\n<a>\n  <b>café £</b>\n</a>', 'the download is UTF-8 and its declaration says so');
  await page.locator('input[type=file]').setInputFiles({ name: 'u16.xml', mimeType: 'text/xml', buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<?xml version="1.0" encoding="UTF-16"?><a><b>नमस्ते</b></a>', 'utf16le')]) });
  ok(await page.waitForFunction(() => document.querySelectorAll('textarea')[1].value.includes('नमस्ते'), null, { timeout: 8000 }).then(() => true, () => false) && /read as UTF-16LE/.test(await status()), 'a UTF-16 file with a byte-order mark is read');
  const bigXml = `<rows>${Array.from({ length: 20000 }, (_, i) => `<row id="${i}"><name>item ${i}</name><v>${i % 7}</v></row>`).join('')}</rows>`; const t0 = Date.now();
  await xp.fill('count(//row)'); f = await put(bigXml, 'Tab'); ok(f.split('\n').length === 80002 && (await res()).kv.join() === 'Number,20000', `60,001 elements (${(bigXml.length / 1e6).toFixed(1)} MB) formatted and counted in ${Date.now() - t0} ms`);
  await put('<a/>'); await page.getByRole('button', { name: 'Download' }).click();
  ok((await page.evaluate(() => globalThis.__superutilsLive())).resources.includes('devcore-xml'), 'the engine is devcore-xml.wasm');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await page.waitForFunction(() => globalThis.__superutilsLive().resources.length === 0, null, { timeout: 8000 }).then(() => true, () => false), 'released when the tab is left');
  await pcOnlyOnPhone(ctx, 'xml');
};
