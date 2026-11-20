// Software › data tabs, part 2: XML formatter + XPath (our Rust devcore-xml lays the text out without changing a
// character of it; the browser's DOMParser checks well-formedness and runs XPath), JSON → types (our Rust devcore-j2t),
// JSON diff (our Rust devcore-jsondiff: RFC 6902), Markdown table, mock data (randomness from our libsodium crypto.wasm).
import { h, card, field, input, textarea, select, segmented, toggle, slider, clear, note, copy, button, outputBox, filePicker, downloadBlob, readBytes, type Mount } from '../../ui';
import { devcore, type Devcore } from '../../wasm/devcore';
import { sodium, type Sodium } from '../../wasm/crypto';
import { mathcore } from '../../wasm/mathcore';
import { kvRows, show, table, debounce } from './devui';

const utf8 = new TextEncoder(), fromUtf8 = new TextDecoder();
const N = (n: number) => n.toLocaleString('en-IN');
const plural = (n: number, w: string) => `${N(n)} ${w}${n === 1 ? '' : 's'}`;
/** A problem reported by the JSON engines ({ message, line, column }) as a sentence. */
const jsonWhy = (e: any) => { try { const m = JSON.parse(String(e?.message ?? e)); if (m && typeof m.message === 'string') return `${m.message} — line ${m.line}, column ${m.column}`; } catch { /* plain text */ } return String(e?.message ?? e); };

// ================================================================== XML formatter / XPath
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
let errNs: string | null | undefined;
/** The namespace the browser puts its <parsererror> report in (Chrome and Safari: XHTML; Firefox: its own). A document
 *  that merely contains an element called parsererror is not an error. */
const parserErrorNs = () => (errNs !== undefined ? errNs : (errNs = new DOMParser().parseFromString('<', 'application/xml').getElementsByTagName('parsererror')[0]?.namespaceURI ?? null));
export function xmlParse(src: string): Document {
  const doc = new DOMParser().parseFromString(src.replace(/^\ufeff/, ''), 'application/xml');
  const ns = parserErrorNs(), err = ns ? doc.getElementsByTagNameNS(ns, 'parsererror')[0] : null;
  if (err) {
    const t = (err.textContent || '').replace(/Below is a rendering of the page up to the first error\.?\s*$/, '');
    const m = /line (\d+) at column (\d+): (.*)/.exec(t), f = /XML Parsing Error: (.*)[\s\S]*?Line Number (\d+), Column (\d+)/.exec(t);
    throw new Error(m ? `Line ${m[1]}, column ${m[2]}: ${m[3].trim()}` : f ? `Line ${f[2]}, column ${f[3]}: ${f[1].trim()}` : t.trim().split('\n')[0] || 'Not well-formed XML');
  }
  return doc;
}
/** An XML file says how it is encoded — a byte-order mark, or encoding="…" in its declaration. (Reading every file as
 *  UTF-8 turned ISO-8859-1 and UTF-16 files into �.) */
export function decodeXml(b: Uint8Array): { text: string; encoding: string } {
  let enc = 'utf-8';
  if (b[0] === 0xff && b[1] === 0xfe) enc = 'utf-16le';
  else if (b[0] === 0xfe && b[1] === 0xff) enc = 'utf-16be';
  else if (b[0] === 0x3c && b[1] === 0 && b[2] === 0x3f && b[3] === 0) enc = 'utf-16le';
  else if (b[0] === 0 && b[1] === 0x3c && b[2] === 0 && b[3] === 0x3f) enc = 'utf-16be';
  else if (!(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)) {
    const head = String.fromCharCode(...b.subarray(0, 200)), m = /^<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/.exec(head);
    if (m && !/^utf-?16$/i.test(m[1])) enc = m[1].toLowerCase();
  }
  try { return { text: new TextDecoder(enc).decode(b), encoding: enc }; } catch { return { text: new TextDecoder().decode(b), encoding: 'utf-8' }; } // an encoding the browser does not know: UTF-8
}
/** The text is saved as UTF-8, so a declaration that names another encoding is corrected. */
export const utf8Declaration = (xml: string) => xml.replace(/^(\ufeff?<\?xml[^>]*\bencoding\s*=\s*)(["'])([^"']*)\2/, (m, a, q, e) => (/^utf-?8$/i.test(e) ? m : `${a}${q}UTF-8${q}`));
export const xml: Mount = (root) => {
  let ind = '2', comments = true, dc: Devcore | null = null, seq = 0, readAs = '';
  const src = textarea({ rows: 12, mono: true, value: '<?xml version="1.0" encoding="UTF-8"?><catalog xmlns:p="urn:price"><!-- spice list --><item id="1" type="spice"><name>Cardamom</name><p:price currency="INR">120</p:price></item><item id="2" type="spice"><name>Saffron &amp; more</name><p:price currency="INR">950</p:price></item><item id="3" type="tea"><name>Assam</name><p:price currency="INR">340</p:price></item></catalog>' });
  const out = outputBox({ rows: 14, mono: true, label: 'Formatted XML' }), status = h('div');
  const xp = input({ value: '//item[@type="spice"]/name', attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': 'XPath' } }), xres = h('div');
  const run = async () => {
    const id = ++seq; dc ||= await devcore('xml'); if (id !== seq) return;
    clear(status); clear(xres);
    if (!src.value.trim()) { out.value = ''; status.append(note('Paste XML or open a file.', 'info')); return; }
    let doc: Document;
    try { doc = xmlParse(src.value); } catch (e: any) { out.value = ''; status.append(note(e.message, 'warn')); return; }
    // the formatter moves white space between tags only: declaration, DOCTYPE, entities, CDATA and text stay as typed
    try { out.value = fromUtf8.decode(dc.raw(`xmlfmt:${ind}:${comments ? 1 : 0}`, utf8.encode(src.value))); } catch (e: any) { out.value = ''; status.append(note(`Cannot format: ${e.message}`, 'warn')); return; }
    const all = doc.getElementsByTagName('*');
    status.append(note(`Well-formed XML · root <${doc.documentElement.tagName}> · ${plural(all.length, 'element')}${readAs && readAs !== 'utf-8' ? ` · the file was read as ${readAs.toUpperCase()}; Download saves UTF-8 and corrects the declaration` : ''}`, 'ok'));
    if (!xp.value.trim()) return;
    // prefixes: every xmlns:p in the document, xml: (always bound), and d: for the default namespace
    const ns: Record<string, string> = { xml: XML_NS }; let def = '';
    for (const el of all) for (const a of el.attributes) { if (a.name.startsWith('xmlns:') && !(a.name.slice(6) in ns)) ns[a.name.slice(6)] = a.value; else if (a.name === 'xmlns' && a.value && !def) def = a.value; }
    if (def && !('d' in ns)) ns.d = def;
    try {
      const r = doc.evaluate(xp.value, doc, (p) => ns[p || ''] ?? null, XPathResult.ANY_TYPE, null);
      if (r.resultType === XPathResult.NUMBER_TYPE) xres.append(kvRows([['Number', String(r.numberValue)]]));
      else if (r.resultType === XPathResult.STRING_TYPE) xres.append(kvRows([['String', r.stringValue || '(empty)']]));
      else if (r.resultType === XPathResult.BOOLEAN_TYPE) xres.append(kvRows([['Boolean', String(r.booleanValue)]]));
      else {
        const nodes: Node[] = []; let n: Node | null; while ((n = r.iterateNext())) nodes.push(n);
        xres.append(h('div', { class: 'muted' }, `${plural(nodes.length, 'node')}${nodes.length > 500 ? ' (the first 500 are listed)' : ''}`));
        if (nodes.length) xres.append(table(['#', 'Node', 'Text'], nodes.slice(0, 500).map((x, i) => [String(i + 1), x.nodeType === 2 ? `@${(x as Attr).name}="${(x as Attr).value}"` : x.nodeType === 1 ? `<${(x as Element).tagName}>` : x.nodeName, (x.textContent || '').slice(0, 200)])));
        else if (def) xres.append(note(`This document has a default namespace (xmlns="${def}"), so plain names such as //item match nothing. Write //d:item — this tab binds the prefix d: to that namespace — or //*[local-name()="item"].`, 'info'));
      }
    } catch (e: any) { xres.append(note(`XPath error: ${String(e.message).replace(/^.*?: /, '')}`, 'warn')); }
  };
  const runD = debounce(() => { void run(); }, 150);
  src.addEventListener('input', () => { readAs = ''; runD(); }); xp.addEventListener('input', runD);
  root.append(card('XML', src, filePicker({ accept: '.xml,.svg,.xsd,.xsl,.xslt,.rss,.atom,.plist,.csproj,.config,.kml,.gpx,.xhtml,text/xml,application/xml', label: 'Open an XML file', onFiles: async ([f]) => { const d = decodeXml(await readBytes(f)); src.value = d.text; readAs = d.encoding; await run(); } }), status),
    card(null, h('div', { class: 'row' }, segmented([['2', '2 spaces'], ['4', '4 spaces'], ['-1', 'Tab'], ['0', 'Minify']], ind, (v) => { ind = v; void run(); }), toggle('Keep comments', true, (v) => { comments = v; void run(); }))),
    card('Formatted', out, h('div', { class: 'row' }, button('Download', () => { if (!out.value) throw new Error('Nothing to save — fix the XML first'); downloadBlob(new Blob([utf8Declaration(out.value)], { type: 'application/xml' }), 'formatted.xml'); }, { small: true, icon: 'Download' }))),
    card('XPath', xp, h('div', { class: 'chips' }, ['//name', 'count(//item)', 'sum(//p:price)', '//item[2]/@id', 'string(//item[last()]/name)', '//*[@currency="INR"]'].map((v) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => { xp.value = v; void run(); } }, v))), xres));
  void run();
};

// ================================================================== JSON → types
const J2T_EXT: Record<string, string> = { ts: 'ts', go: 'go', rust: 'rs', java: 'java', py: 'py' };
export const json2types: Mount = (root) => {
  let lang = 'ts', dc: Devcore | null = null, seq = 0, rootType = 'Root';
  const src = textarea({ rows: 12, mono: true, value: JSON.stringify({ id: 101, customer: { name: 'Asha Rao', email: 'asha@example.in', vip: true }, items: [{ sku: 'TEA-1', qty: 2, price: 120.5 }, { sku: 'SPC-9', qty: 1, price: 950, note: 'gift wrap' }], deliveredAt: null, tags: ['online', 'repeat'] }, null, 2) });
  const name = input({ value: 'Order', attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': 'Root type name' } }), out = outputBox({ rows: 18, mono: true, label: 'Types' }), status = h('div');
  // the generator is our Rust engine (wasm/devcore/src/j2t.rs); tests compile its output with tsc, go, rustc, javac and python
  const run = async () => {
    const id = ++seq; dc ||= await devcore('j2t'); if (id !== seq) return;
    clear(status);
    if (!src.value.trim()) { out.value = ''; status.append(note('Paste a JSON sample.', 'info')); return; }
    try {
      const r = dc.bytesJson<{ out: string; types: number; root: string; notes: string[] }>(`j2t:${lang}:${name.value.trim() || 'Root'}`, utf8.encode(src.value));
      out.value = r.out; rootType = r.root;
      r.notes.forEach((x) => status.append(note(x, 'warn')));
    } catch (e: any) { out.value = ''; status.append(note(`Invalid JSON: ${jsonWhy(e)}`, 'warn')); }
  };
  const runD = debounce(() => { void run(); }, 150);
  [src, name].forEach((x) => x.addEventListener('input', runD));
  root.append(card('JSON sample', src, filePicker({ compact: true, accept: '.json,application/json', label: 'Open a JSON file', onFiles: async ([f]) => { src.value = await f.text(); await run(); } }), field('Root type name', name)),
    card(null, segmented([['ts', 'TypeScript'], ['go', 'Go'], ['rust', 'Rust (serde)'], ['java', 'Java records'], ['py', 'Python dataclasses']], lang, (v) => { lang = v; void run(); })),
    card('Types', out, status, button('Download', () => { if (!out.value) throw new Error('Nothing to save yet'); downloadBlob(new Blob([out.value], { type: 'text/plain' }), `${lang === 'java' ? rootType : 'types'}.${J2T_EXT[lang]}`); }, { small: true, icon: 'Download' })),
    note('Fields missing from some array items become optional; null makes a field nullable; whole numbers become integers. Go and Rust map every key exactly; Java and Python keep a key as the field name when it is a valid name.', 'info'));
  void run();
};

// ================================================================== JSON diff
interface DiffRow { op: 'add' | 'remove' | 'replace'; path: string; left: string | null; right: string | null }
const DIFF_ROWS = 2000, DIFF_CELL = 400;
export const jsondiff: Mount = (root) => {
  let dc: Devcore | null = null, seq = 0;
  const a = textarea({ rows: 12, mono: true, value: JSON.stringify({ name: 'Asha', age: 30, city: 'Pune', skills: ['sql', 'go'], address: { pin: '411001', street: 'FC Road' } }, null, 2) });
  const b = textarea({ rows: 12, mono: true, value: JSON.stringify({ name: 'Asha Rao', city: 'Pune', skills: ['sql', 'go', 'rust'], address: { pin: '411004', street: 'FC Road' }, verified: true }, null, 2) });
  a.setAttribute('aria-label', 'Left JSON'); b.setAttribute('aria-label', 'Right JSON');
  const out = h('div'), patchBox = outputBox({ rows: 8, mono: true, label: 'JSON Patch' });
  const cut = (v: string | null) => (v === null ? '' : v.length > DIFF_CELL ? `${v.slice(0, DIFF_CELL)}… (${N(v.length)} characters)` : v);
  const run = async () => {
    const id = ++seq; dc ||= await devcore('jsondiff'); if (id !== seq) return;
    patchBox.value = '';
    show(out, () => {
      // the engine compares the texts themselves: 12345678901234567890 is not rounded, and 1, 1.0 and 1e0 are equal
      const r = dc!.json<{ equal: boolean; count: number; patch: string; rows: DiffRow[]; notes: string[] }>('jsondiff', { a: a.value, b: b.value });
      patchBox.value = r.patch;
      const notes = r.notes.map((x) => note(x, 'warn'));
      if (r.equal) return [note('The two documents are equal (key order and white space are ignored; numbers are compared by value, so 1 = 1.0).', 'ok'), ...notes];
      const rows = r.rows.slice(0, DIFF_ROWS).map((o) => h('tr', { class: o.op === 'add' ? 'jd-add' : o.op === 'remove' ? 'jd-del' : 'jd-chg' }, h('td', { class: 'mono' }, o.path || '(whole document)'), h('td', null, o.op === 'add' ? 'added' : o.op === 'remove' ? 'removed' : 'changed'), h('td', { class: 'mono' }, cut(o.left)), h('td', { class: 'mono' }, cut(o.right))));
      return [note(`${plural(r.count, 'difference')}${r.count > DIFF_ROWS ? ` — the first ${N(DIFF_ROWS)} are listed; the patch below has all of them` : ''}`, 'info'), ...notes,
        h('div', { class: 'scroll-x' }, h('table', { class: 'tbl jd-tbl' }, h('thead', null, h('tr', null, ['Path', 'Change', 'Left', 'Right'].map((x) => h('th', null, x)))), h('tbody', null, rows)))];
    });
  };
  const runD = debounce(() => { void run(); }, 200);
  [a, b].forEach((x) => x.addEventListener('input', runD));
  const open = (ta: HTMLTextAreaElement) => filePicker({ compact: true, accept: '.json,application/json', label: 'Open JSON', onFiles: async ([f]) => { ta.value = await f.text(); await run(); } });
  root.append(h('div', { class: 'grid2' }, card('Left (old)', a, open(a)), card('Right (new)', b, open(b))),
    h('div', { class: 'row' }, button('Swap left and right', () => { const t = a.value; a.value = b.value; b.value = t; return run(); }, { small: true, icon: 'ArrowLeftRight' })),
    card('Differences', out), card('As a JSON Patch (RFC 6902)', patchBox, button('Download patch', () => { if (!patchBox.value) throw new Error('Nothing to save yet'); downloadBlob(new Blob([patchBox.value], { type: 'application/json-patch+json' }), 'changes.patch.json'); }, { small: true, icon: 'Download' })));
  void run();
};

// ================================================================== Markdown table
/** How many columns a text takes in a fixed-width font: CJK, full-width forms and emoji are two wide, a character
 *  with its combining marks is one. */
export function textWidth(s: string): number {
  if (/^[\x20-\x7e]*$/.test(s)) return s.length;
  const seg = typeof Intl !== 'undefined' && (Intl as any).Segmenter ? [...new (Intl as any).Segmenter().segment(s)].map((x: any) => x.segment as string) : [...s];
  let w = 0;
  for (const g of seg) w += /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}|[\u{1f1e6}-\u{1f1ff}]|[\u{20000}-\u{3fffd}]/u.test(g) ? 2 : 1;
  return w;
}
export function mdTable(rows: string[][], align: string[]): string {
  const n = Math.max(...rows.map((r) => r.length), 1), cell = (s: string) => (s ?? '').replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>');
  const R = rows.map((r) => Array.from({ length: n }, (_, i) => cell(r[i] ?? '')));
  const w = Array.from({ length: n }, (_, i) => Math.max(3, ...R.map((r) => textWidth(r[i]))));
  const pad = (s: string, i: number) => { const d = w[i] - textWidth(s); return align[i] === 'right' ? ' '.repeat(d) + s : align[i] === 'center' ? ' '.repeat(Math.floor(d / 2)) + s + ' '.repeat(Math.ceil(d / 2)) : s + ' '.repeat(d); };
  const sep = w.map((x, i) => (align[i] === 'center' ? `:${'-'.repeat(x - 2)}:` : align[i] === 'right' ? `${'-'.repeat(x - 1)}:` : align[i] === 'left' ? `:${'-'.repeat(x - 1)}` : '-'.repeat(x)));
  const line = (c: string[]) => `| ${c.join(' | ')} |`;
  return [line(R[0].map(pad)), line(sep), ...R.slice(1).map((r) => line(r.map(pad)))].join('\n');
}
/** The first Markdown table in `md`: a header line, the |---|:--:| line under it, and the rows up to the first blank
 *  line (text before and after the table is not part of it). */
export function parseMdTable(md: string): { rows: string[][]; align: string[] } | null {
  const ls = md.split(/\r?\n/), isSep = (l: string) => l.includes('-') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);
  const at = ls.findIndex((l, i) => i > 0 && isSep(l) && ls[i - 1].trim() !== '' && (ls[i - 1].includes('|') || l.includes('|'))); // without a pipe in either line it is a heading underlined with ---
  if (at < 1) return null;
  let end = at + 1; while (end < ls.length && ls[end].trim() !== '') end++;
  const split = (l: string) => { const t = l.trim().replace(/^\|/, '').replace(/\|$/, ''); const out: string[] = []; let cur = ''; for (let i = 0; i < t.length; i++) { if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; } else if (t[i] === '|') { out.push(cur.trim()); cur = ''; } else cur += t[i]; } out.push(cur.trim()); return out.map((c) => c.replace(/<br\s*\/?>/gi, '\n')); };
  const align = split(ls[at]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : 'none'));
  return { rows: [split(ls[at - 1]), ...ls.slice(at + 1, end).map(split)], align };
}
const GRID_ROWS = 200;
export const mdtable: Mount = (root) => {
  let rows: string[][] = [['Item', 'Qty', 'Price (₹)'], ['Chai', '2', '40'], ['Samosa', '3', '45'], ['Lassi', '1', '60']], align = ['left', 'right', 'right'];
  const grid = h('div', { class: 'scroll-x' }), gridNote = h('div'), out = outputBox({ rows: 8, mono: true, label: 'Markdown' }), paste = textarea({ rows: 4, mono: true, placeholder: 'Paste CSV, tab-separated cells (from Excel / Sheets) or a Markdown table' }), status = h('div');
  const emit = () => { out.value = mdTable(rows, align); };
  // a line break inside a cell is written <br> in the editor boxes too (a one-line box cannot hold a line break)
  const toBox = (c: string) => c.replace(/\r\n|\r|\n/g, '<br>'), fromBox = (v: string) => v.replace(/<br\s*\/?>/gi, '\n');
  const draw = () => {
    const n = Math.max(...rows.map((r) => r.length), 1);
    rows = rows.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? '')); while (align.length < n) align.push('none'); align = align.slice(0, n);
    clear(gridNote); if (rows.length > GRID_ROWS) gridNote.append(note(`The editor shows the first ${N(GRID_ROWS)} of ${N(rows.length)} rows; the Markdown below has all of them.`, 'info'));
    clear(grid).append(h('table', { class: 'tbl md-grid' }, h('thead', null, h('tr', null, ...align.map((a, i) => h('th', null, select([['none', '—'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], a as any, (v) => { align[i] = v; emit(); }, `Column ${i + 1} alignment`), button('', () => { if (n === 1) throw new Error('Keep at least one column'); rows.forEach((r) => r.splice(i, 1)); align.splice(i, 1); draw(); }, { small: true, icon: 'X', title: `Delete column ${i + 1}` }))), h('th', null))),
      h('tbody', null, rows.slice(0, GRID_ROWS).map((r, ri) => h('tr', { class: ri === 0 ? 'hdr' : null }, ...r.map((c, ci) => h('td', null, h('input', { class: 'input md-cell', value: toBox(c), 'aria-label': `Row ${ri + 1} column ${ci + 1}`, oninput: (e: Event) => { r[ci] = fromBox((e.target as HTMLInputElement).value); emit(); } }))),
        h('td', null, ri ? button('', () => { rows.splice(ri, 1); draw(); }, { small: true, icon: 'X', title: `Delete row ${ri + 1}` }) : null))))));
    emit();
  };
  const importText = async () => {
    clear(status); const t = paste.value; if (!t.trim()) { status.append(note('Nothing to import — paste a table first.', 'info')); return; }
    const md = parseMdTable(t);
    if (md) { rows = md.rows; align = md.align; draw(); status.append(note(`Read a Markdown table: ${plural(rows.length, 'row')}`, 'ok')); return; }
    const { sheetEngine } = await import('../../wasm/sheet');
    // the sheet engine finds the separator itself (a tab inside a quoted cell of a comma file is not a separator)
    const sh = await sheetEngine(); const book = sh.csv(utf8.encode(t), '');
    const got = book.sheets[0].rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
    if (!got.length) { status.append(note('No cells found in that text.', 'warn')); return; }
    rows = got; align = rows[0].map(() => 'none'); draw();
    status.append(note(`Read ${plural(rows.length, 'row')} (${book.delimiter === '\t' ? 'tab' : book.delimiter === ',' ? 'comma' : `"${book.delimiter}"`}-separated)`, 'ok'));
  };
  root.append(card('Table', grid, gridNote, h('div', { class: 'row' }, button('Add row', () => { rows.push(rows[0].map(() => '')); draw(); }, { small: true, icon: 'Plus' }), button('Add column', () => { rows.forEach((r, i) => r.push(i ? '' : `Column ${r.length + 1}`)); draw(); }, { small: true, icon: 'Plus' }))),
    card('Import', paste, button('Import', importText, { small: true, icon: 'Upload' }), status), card('Markdown', out, button('Download', () => downloadBlob(new Blob([`${out.value}\n`], { type: 'text/markdown' }), 'table.md'), { small: true, icon: 'Download' })));
  draw();
};

// ================================================================== Mock data
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ishaan', 'Kabir', 'Rohan', 'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Ira', 'Meera', 'Priya', 'Kavya', 'Anika', 'Riya', 'Zara', 'Fatima', 'Imran', 'Harpreet', 'Gurpreet', 'Joseph', 'Mary', 'Lakshmi', 'Venkat', 'Suresh', 'Deepa', 'Neha', 'Rahul', 'Amit', 'Pooja', 'Sneha', 'Karthik', 'Divya', 'Arun', 'Nisha'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Gupta', 'Singh', 'Kaur', 'Khan', 'Das', 'Banerjee', 'Mukherjee', 'Joshi', 'Kulkarni', 'Deshpande', 'Menon', 'Pillai', 'Chopra', 'Mehta', 'Shah', 'Agarwal', 'Bose', 'Fernandes', 'D’Souza', 'Naidu', 'Hegde', 'Pandey', 'Mishra'];
const CITIES: Array<[string, string, string]> = [['Mumbai', 'Maharashtra', '400'], ['Pune', 'Maharashtra', '411'], ['Delhi', 'Delhi', '110'], ['Bengaluru', 'Karnataka', '560'], ['Chennai', 'Tamil Nadu', '600'], ['Hyderabad', 'Telangana', '500'], ['Kolkata', 'West Bengal', '700'], ['Ahmedabad', 'Gujarat', '380'], ['Jaipur', 'Rajasthan', '302'], ['Lucknow', 'Uttar Pradesh', '226'], ['Kochi', 'Kerala', '682'], ['Chandigarh', 'Chandigarh', '160'], ['Bhopal', 'Madhya Pradesh', '462'], ['Indore', 'Madhya Pradesh', '452'], ['Patna', 'Bihar', '800'], ['Nagpur', 'Maharashtra', '440'], ['Surat', 'Gujarat', '395'], ['Coimbatore', 'Tamil Nadu', '641'], ['Guwahati', 'Assam', '781'], ['Bhubaneswar', 'Odisha', '751']];
const STATE_CODE: Record<string, string> = { Maharashtra: '27', Delhi: '07', Karnataka: '29', 'Tamil Nadu': '33', Telangana: '36', 'West Bengal': '19', Gujarat: '24', Rajasthan: '08', 'Uttar Pradesh': '09', Kerala: '32', Chandigarh: '04', 'Madhya Pradesh': '23', Bihar: '10', Assam: '18', Odisha: '21' };
const COMPANY = ['Tata', 'Infosys', 'Wipro', 'Reliance', 'Mahindra', 'Bajaj', 'Godrej', 'Zomato', 'Swiggy', 'Flipkart', 'Paytm', 'Ola', 'Zoho', 'Freshworks', 'Razorpay'], SUFFIX = ['Pvt Ltd', 'Ltd', 'Technologies', 'Solutions', 'Industries', 'Services'];
const STREET = ['MG Road', 'Station Road', 'Nehru Nagar', 'Gandhi Chowk', 'Park Street', 'Linking Road', 'Anna Salai', 'FC Road', 'Brigade Road', 'Civil Lines', 'Sector 17', 'Banjara Hills'];
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat'.split(' ');
const BANKS = ['SBIN', 'HDFC', 'ICIC', 'UTIB', 'PUNB', 'KKBK', 'BARB', 'CNRB'];
export const MOCK_TYPES: Array<[string, string]> = [['id', 'Auto-increment id'], ['uuid', 'UUID v4'], ['first', 'First name'], ['last', 'Last name'], ['name', 'Full name'], ['email', 'Email'], ['phone', 'Mobile (+91)'], ['city', 'City'], ['state', 'State'], ['pincode', 'PIN code'], ['address', 'Street address'], ['company', 'Company'], ['int', 'Integer'], ['float', 'Decimal'], ['bool', 'True/false'], ['date', 'Date'], ['datetime', 'Date & time'], ['pan', 'PAN (format)'], ['gstin', 'GSTIN (valid checksum)'], ['ifsc', 'IFSC (format)'], ['words', 'Lorem words'], ['pick', 'One of a list']];
interface MockField { name: string; type: string; a: string; b: string }
const MAX_SAFE = Number.MAX_SAFE_INTEGER, WORDS_MAX = 100;
/** A day typed as 2026-11-16, 16/11/2026, 16-11-2026 or 16.11.2026 (day first, as in India), optionally with a time →
 *  milliseconds UTC; null when it is not a real date. */
export function mockDate(t: string): number | null {
  const s = t.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?Z?$/.exec(s), y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else { m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s); if (!m) return null; d = +m[1]; mo = +m[2]; y = +m[3]; }
  const hh = +(m[4] || 0), mi = +(m[5] || 0), ss = +(m[6] || 0), ms = Date.UTC(y, mo - 1, d, hh, mi, ss), back = new Date(ms);
  return y >= 1 && back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d && hh < 24 && mi < 60 && ss < 60 ? ms : null;
}
/** What is wrong with a field's settings (shown under the fields), and the values to use instead. */
export function mockRange(f: MockField): { lo: number; hi: number; problem?: string } {
  const num = (t: string, dflt: number) => (t.trim() === '' ? dflt : Number(t.trim().replace(/,/g, '')));
  if (f.type === 'int' || f.type === 'float') {
    let lo = num(f.a, 0), hi = num(f.b, NaN), problem: string | undefined;
    if (!Number.isFinite(lo)) { problem = `“${f.a}” is not a number — 0 is used`; lo = 0; }
    if (f.b.trim() === '') hi = lo + 1000; else if (!Number.isFinite(hi)) { problem = `“${f.b}” is not a number — ${lo + 1000} is used`; hi = lo + 1000; }
    if (f.type === 'int') { lo = Math.ceil(lo); hi = Math.floor(hi); if (Math.abs(lo) > MAX_SAFE || Math.abs(hi) > MAX_SAFE) { problem = 'whole numbers beyond ±9,007,199,254,740,991 cannot be exact — the range is cut there'; lo = Math.max(-MAX_SAFE, Math.min(MAX_SAFE, lo)); hi = Math.max(-MAX_SAFE, Math.min(MAX_SAFE, hi)); } }
    if (hi < lo) { problem = `“from” is above “to” — they are swapped`; [lo, hi] = [hi, lo]; if (f.type === 'int') { lo = Math.ceil(lo); hi = Math.floor(hi); } }
    return { lo, hi, problem };
  }
  if (f.type === 'date' || f.type === 'datetime') {
    let lo = f.a.trim() ? mockDate(f.a) : Date.UTC(2020, 0, 1), hi = f.b.trim() ? mockDate(f.b) : Date.UTC(2026, 11, 31), problem: string | undefined;
    if (lo === null) { problem = `“${f.a}” is not a date (write 2026-11-16 or 16/11/2026) — 2020-01-01 is used`; lo = Date.UTC(2020, 0, 1); }
    if (hi === null) { problem = `“${f.b}” is not a date (write 2026-11-16 or 16/11/2026) — 2026-12-31 is used`; hi = Date.UTC(2026, 11, 31); }
    if (hi < lo) { problem = '“from” is after “to” — they are swapped'; [lo, hi] = [hi, lo]; }
    return { lo, hi, problem };
  }
  if (f.type === 'id') { const v = num(f.a, 1); return Number.isFinite(v) && Number.isInteger(v) && Math.abs(v) < MAX_SAFE - 1e6 ? { lo: v, hi: v } : { lo: 1, hi: 1, problem: `the start “${f.a}” is not a whole number — 1 is used` }; }
  if (f.type === 'words') { const v = num(f.a, 5); return Number.isInteger(v) && v >= 1 && v <= WORDS_MAX ? { lo: v, hi: v } : { lo: Number.isFinite(v) ? Math.max(1, Math.min(WORDS_MAX, Math.round(v))) : 5, hi: 0, problem: `the number of words is 1–${WORDS_MAX}` }; }
  return { lo: 0, hi: 0 };
}
const SQL_WORDS = new Set('add all alter and any as asc between by case check column constraint create cross default delete desc distinct drop else end except exists false for foreign from full group having in index inner insert intersect into is join key left like limit not null offset on or order outer primary references right select set table then to true union unique update user using values when where with'.split(' '));
/** A table or column name as SQL takes it: plain names stay bare, anything else goes in double quotes (standard SQL). */
export const sqlName = (n: string) => n.split('.').map((p) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) && !SQL_WORDS.has(p.toLowerCase()) ? p : `"${p.replace(/"/g, '""')}"`)).join('.');
/** Unique, non-empty column names: an empty name becomes fieldN, a repeated one gets _2, _3… */
export function mockNames(names: string[]): { names: string[]; renamed: string[] } {
  const used = new Set<string>(), renamed: string[] = [];
  const out = names.map((raw, i) => { let n = raw.trim() || `field${i + 1}`, k = 2; const base = n; while (used.has(n)) n = `${base}_${k++}`; if (n !== raw.trim()) renamed.push(raw.trim() ? `${raw.trim()} → ${n}` : `(empty) → ${n}`); used.add(n); return n; });
  return { names: out, renamed };
}
export const mockdata: Mount = async (root) => {
  const na: Sodium = await sodium(), mc = await mathcore();
  const fields: MockField[] = [{ name: 'id', type: 'id', a: '1', b: '' }, { name: 'name', type: 'name', a: '', b: '' }, { name: 'email', type: 'email', a: '', b: '' }, { name: 'phone', type: 'phone', a: '', b: '' }, { name: 'city', type: 'city', a: '', b: '' }, { name: 'age', type: 'int', a: '18', b: '65' }, { name: 'joined', type: 'date', a: '2020-01-01', b: '2026-11-16' }, { name: 'plan', type: 'pick', a: 'free,pro,team', b: '' }];
  let fmt = 'json', count = 10;
  const list = h('div', { class: 'stack' }), problems = h('div'), out = outputBox({ rows: 16, mono: true, label: 'Data' }), table_ = input({ value: 'customers', attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': 'SQL table name' } });
  const R = (n: number) => na.uniform(n), pickA = <X>(a: readonly X[]) => a[R(a.length)];
  /** A whole number 0 ≤ x < span for spans up to 2^53 (libsodium's uniform covers 32 bits: two draws, no modulo bias). */
  const below = (span: number): number => {
    if (span <= 0x100000000) return span <= 1 ? 0 : span === 0x100000000 ? na.uniform(0x80000000) * 2 + na.uniform(2) : R(span);
    const limit = Math.floor(2 ** 53 / span) * span;
    for (;;) { const x = R(0x200000) * 0x100000000 + (na.uniform(0x80000000) * 2 + na.uniform(2)); if (x < limit) return x % span; }
  };
  const unit = () => below(2 ** 53) / 2 ** 53; // 0 ≤ x < 1 with 53 random bits
  const digits = (n: number) => Array.from({ length: n }, () => R(10)).join('');
  const L = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + R(26))).join('');
  const gstin = (state: string) => { const pan = `${L(3)}P${L(1)}${digits(4)}${L(1)}`, base = `${STATE_CODE[state] || '27'}${pan}1Z`; for (const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (mc.gstinValid(base + c)) return base + c; return base + '0'; };
  let rows: any[][] = []; // one array per row, in field order (a field may be called __proto__ or twice the same)
  const gen = () => { make(); render(); };
  const make = () => {
    clear(problems); rows = [];
    const ranges = fields.map(mockRange);
    ranges.forEach((r, i) => { if (r.problem) problems.append(note(`Field ${i + 1} (${fields[i].name.trim() || 'no name'}): ${r.problem}.`, 'warn')); });
    for (let i = 0; i < count; i++) {
      const fn = pickA(FIRST), ln = pickA(LAST), [city, state, pin] = pickA(CITIES);
      rows.push(fields.map((f, fi): any => {
        const { lo, hi } = ranges[fi];
        switch (f.type) {
          case 'id': return lo + i; case 'uuid': return na.uuid(4); case 'first': return fn; case 'last': return ln; case 'name': return `${fn} ${ln}`;
          case 'email': return `${fn}.${ln}${R(100)}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + `@${pickA(['example.com', 'example.in', 'mail.test'])}`;
          case 'phone': return `+91 ${6 + R(4)}${digits(4)} ${digits(5)}`; case 'city': return city; case 'state': return state; case 'pincode': return `${pin}${digits(3)}`;
          case 'address': return `${1 + R(400)}, ${pickA(STREET)}, ${city} ${pin}${digits(3)}`; case 'company': return `${pickA(COMPANY)} ${pickA(SUFFIX)}`;
          case 'int': { const span = hi - lo + 1; return span > MAX_SAFE ? Math.round(lo + unit() * (hi - lo)) : lo + below(span); }
          case 'float': return Math.round((lo + unit() * (hi - lo)) * 100) / 100;
          case 'bool': return R(2) === 1;
          case 'date': { const days = Math.floor((hi - lo) / 86400000); return new Date(Math.floor(lo / 86400000) * 86400000 + below(days + 1) * 86400000).toISOString().slice(0, 10); }
          case 'datetime': { const secs = Math.floor((hi - lo) / 1000); return new Date(Math.floor(lo / 1000) * 1000 + below(secs + 1) * 1000).toISOString().replace('.000Z', 'Z'); }
          case 'pan': return `${L(3)}P${ln[0].toUpperCase()}${digits(4)}${L(1)}`; case 'gstin': return gstin(state); case 'ifsc': return `${pickA(BANKS)}0${digits(6)}`;
          case 'words': return Array.from({ length: lo }, () => pickA(WORDS)).join(' ');
          case 'pick': { const opts = f.a.split(',').map((x) => x.trim()).filter(Boolean); return opts.length ? pickA(opts) : null; }
          default: return null;
        }
      }));
    }
  };
  /** Changing only the output format, a field name or the table name re-formats the same rows (no new random data). */
  const render = () => {
    const { names, renamed } = mockNames(fields.map((f) => f.name));
    problems.querySelectorAll('.mock-names').forEach((x) => x.remove());
    if (renamed.length) problems.append(h('div', { class: 'mock-names' }, note(`Every column needs its own name: ${renamed.join(', ')}.`, 'warn')));
    if (!fields.length) { out.value = ''; return; }
    const csvCell = (v: any) => { const s = v == null ? '' : String(v); return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const sqlVal = (v: any) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `'${String(v).replace(/'/g, "''")}'`);
    const obj = (r: any[], sep: string, colon: string) => names.map((n, i) => `${JSON.stringify(n)}${colon}${JSON.stringify(r[i] ?? null)}`).join(sep);
    out.value = fmt === 'json' ? `[\n${rows.map((r) => `  {\n    ${obj(r, ',\n    ', ': ')}\n  }`).join(',\n')}\n]` : fmt === 'ndjson' ? rows.map((r) => `{${obj(r, ',', ':')}}`).join('\n')
      : fmt === 'csv' ? [names.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n')
        : rows.map((r) => `INSERT INTO ${sqlName(table_.value.trim() || 'data')} (${names.map(sqlName).join(', ')}) VALUES (${r.map(sqlVal).join(', ')});`).join('\n');
  };
  const draw = () => {
    clear(list).append(...fields.map((f, i) => h('div', { class: 'row mock-row' },
      h('input', { class: 'input mono', value: f.name, 'aria-label': `Field ${i + 1} name`, spellcheck: 'false', oninput: (e: Event) => { f.name = (e.target as HTMLInputElement).value; render(); } }),
      select(MOCK_TYPES, f.type, (v) => { f.type = v; if (v === 'words') { f.a = '5'; f.b = ''; } else if (v === 'id') { f.a = '1'; f.b = ''; } else if (v === 'pick') { f.a = 'a, b, c'; f.b = ''; } else { f.a = ''; f.b = ''; } draw(); gen(); }, `Field ${i + 1} type`),
      ['int', 'float', 'date', 'datetime', 'pick', 'id', 'words'].includes(f.type) ? h('input', { class: 'input mono', value: f.a, placeholder: f.type === 'pick' ? 'a, b, c' : f.type === 'id' ? 'start' : f.type === 'words' ? 'how many' : f.type.startsWith('date') ? 'from (2020-01-01)' : 'from', 'aria-label': `Field ${i + 1} from`, oninput: (e: Event) => { f.a = (e.target as HTMLInputElement).value; gen(); } }) : '',
      ['int', 'float', 'date', 'datetime'].includes(f.type) ? h('input', { class: 'input mono', value: f.b, placeholder: f.type.startsWith('date') ? 'to (31/12/2026)' : 'to', 'aria-label': `Field ${i + 1} to`, oninput: (e: Event) => { f.b = (e.target as HTMLInputElement).value; gen(); } }) : '',
      button('', () => { fields.splice(i, 1); draw(); gen(); }, { small: true, icon: 'X', title: `Remove field ${i + 1}` }))));
    if (!fields.length) list.append(note('No fields — add one to make data.', 'info'));
  };
  table_.addEventListener('input', render);
  root.append(card('Fields', list, problems, button('Add field', () => { fields.push({ name: `field${fields.length + 1}`, type: 'words', a: '3', b: '' }); draw(); gen(); }, { small: true, icon: 'Plus' })),
    card(null, slider({ label: 'Rows', min: 1, max: 1000, value: count, onInput: (v) => { count = v; gen(); } }), field('Format', segmented([['json', 'JSON'], ['ndjson', 'NDJSON'], ['csv', 'CSV'], ['sql', 'SQL INSERT']], fmt, (v) => { fmt = v; render(); })), field('SQL table name', table_)),
    card('Data', out, h('div', { class: 'row' }, button('Generate again', gen, { small: true, icon: 'RefreshCw' }), button('Download', () => { if (!out.value) throw new Error('Nothing to save — add a field first'); downloadBlob(new Blob([out.value], { type: 'text/plain' }), `mock.${fmt === 'sql' ? 'sql' : fmt === 'csv' ? 'csv' : fmt === 'ndjson' ? 'ndjson' : 'json'}`); }, { small: true, icon: 'Download' }))),
    note('Fake data for testing only. PAN, IFSC and phone numbers only have the right format; GSTINs have a valid checksum but belong to no one. Dates can be typed as 2026-11-16 or 16/11/2026.', 'info'));
  draw(); gen();
};
