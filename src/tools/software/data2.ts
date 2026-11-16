// Software › data tabs, part 2: XML formatter + XPath (browser-native DOMParser / XPath — compiled C++ in the browser),
// JSON → types (output formatting), JSON diff (our Rust devcore-jsondiff: RFC 6902), Markdown table, mock data
// (randomness from our libsodium crypto.wasm).
import { h, card, field, input, textarea, select, segmented, toggle, slider, clear, note, copy, button, outputBox, filePicker, downloadBlob, type Mount } from '../../ui';
import { devcore, type Devcore } from '../../wasm/devcore';
import { sodium, type Sodium } from '../../wasm/crypto';
import { mathcore } from '../../wasm/mathcore';
import { kvRows, show, table, debounce } from './devui';

// ================================================================== XML formatter / XPath
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');
/** Pretty-print a parsed XML node tree. `indent` = '' → minified. */
export function xmlFormat(doc: Document, indent = '  ', keepComments = true): string {
  const nl = indent ? '\n' : '';
  const out: string[] = [];
  const walk = (n: Node, d: number) => {
    const pad = indent.repeat(d);
    if (n.nodeType === 1) {
      const el = n as Element, attrs = [...el.attributes].map((a) => ` ${a.name}="${escAttr(a.value)}"`).join('');
      const kids = [...el.childNodes].filter((c) => !(c.nodeType === 3 && !c.nodeValue!.trim()) && (keepComments || c.nodeType !== 8));
      if (!kids.length) { out.push(`${pad}<${el.tagName}${attrs}/>`); return; }
      if (kids.length === 1 && (kids[0].nodeType === 3 || kids[0].nodeType === 4)) { out.push(`${pad}<${el.tagName}${attrs}>${kids[0].nodeType === 4 ? `<![CDATA[${kids[0].nodeValue}]]>` : escText(indent ? kids[0].nodeValue!.trim() : kids[0].nodeValue!)}</${el.tagName}>`); return; }
      out.push(`${pad}<${el.tagName}${attrs}>`); kids.forEach((c) => walk(c, d + 1)); out.push(`${pad}</${el.tagName}>`);
    } else if (n.nodeType === 3) out.push(pad + escText(indent ? n.nodeValue!.trim() : n.nodeValue!));
    else if (n.nodeType === 4) out.push(`${pad}<![CDATA[${n.nodeValue}]]>`);
    else if (n.nodeType === 8) out.push(`${pad}<!--${n.nodeValue}-->`);
    else if (n.nodeType === 7) out.push(`${pad}<?${(n as ProcessingInstruction).target} ${n.nodeValue}?>`);
    else if (n.nodeType === 10) out.push(`<!DOCTYPE ${(n as DocumentType).name}>`);
  };
  doc.childNodes.forEach((c) => walk(c, 0));
  return out.join(nl);
}
export function xmlParse(src: string): Document {
  const doc = new DOMParser().parseFromString(src, 'application/xml'), err = doc.querySelector('parsererror');
  if (err) { const t = err.textContent || ''; const m = /line (\d+) at column (\d+): (.*)/.exec(t); throw new Error(m ? `Line ${m[1]}, column ${m[2]}: ${m[3].trim()}` : t.trim().split('\n')[0] || 'Not well-formed XML'); }
  return doc;
}
export const xml: Mount = (root) => {
  let ind = '  ', comments = true;
  const src = textarea({ rows: 12, mono: true, value: '<?xml version="1.0" encoding="UTF-8"?><catalog xmlns:p="urn:price"><!-- spice list --><item id="1" type="spice"><name>Cardamom</name><p:price currency="INR">120</p:price></item><item id="2" type="spice"><name>Saffron &amp; more</name><p:price currency="INR">950</p:price></item><item id="3" type="tea"><name>Assam</name><p:price currency="INR">340</p:price></item></catalog>' });
  const out = outputBox({ rows: 14, mono: true }), status = h('div');
  const xp = input({ value: '//item[@type="spice"]/name', attrs: { class: 'input mono', 'aria-label': 'XPath' } }), xres = h('div');
  const run = () => {
    clear(status); clear(xres);
    let doc: Document;
    try { doc = xmlParse(src.value); } catch (e: any) { out.value = ''; status.append(note(e.message, 'warn')); return; }
    out.value = xmlFormat(doc, ind, comments);
    status.append(note(`Well-formed XML · root <${doc.documentElement.tagName}> · ${doc.getElementsByTagName('*').length} elements`, 'ok'));
    if (!xp.value.trim()) return;
    const ns: Record<string, string> = {}; for (const el of doc.getElementsByTagName('*')) for (const a of el.attributes) if (a.name.startsWith('xmlns:')) ns[a.name.slice(6)] = a.value;
    try {
      const r = doc.evaluate(xp.value, doc, (p) => ns[p || ''] ?? null, XPathResult.ANY_TYPE, null);
      if (r.resultType === XPathResult.NUMBER_TYPE) xres.append(kvRows([['Number', String(r.numberValue)]]));
      else if (r.resultType === XPathResult.STRING_TYPE) xres.append(kvRows([['String', r.stringValue]]));
      else if (r.resultType === XPathResult.BOOLEAN_TYPE) xres.append(kvRows([['Boolean', String(r.booleanValue)]]));
      else { const nodes: Node[] = []; let n: Node | null; while ((n = r.iterateNext())) nodes.push(n); xres.append(h('div', { class: 'muted' }, `${nodes.length} node${nodes.length === 1 ? '' : 's'}`), table(['#', 'Node', 'Text'], nodes.slice(0, 500).map((x, i) => [String(i + 1), x.nodeType === 2 ? `@${(x as Attr).name}="${(x as Attr).value}"` : x.nodeType === 1 ? `<${(x as Element).tagName}>` : x.nodeName, (x.textContent || '').slice(0, 200)]))); }
    } catch (e: any) { xres.append(note(`XPath error: ${e.message.replace(/^.*?: /, '')}`, 'warn')); }
  };
  src.addEventListener('input', debounce(run, 150)); xp.addEventListener('input', debounce(run, 150));
  root.append(card('XML', src, filePicker({ accept: '.xml,.svg,.xsd,.xsl,.rss,.atom,.plist,.csproj,.config,text/xml', label: 'Open an XML file', onFiles: async ([f]) => { src.value = await f.text(); run(); } }), status),
    card(null, h('div', { class: 'row' }, segmented([['  ', '2 spaces'], ['    ', '4 spaces'], ['\t', 'Tab'], ['', 'Minify']], '  ', (v) => { ind = v; run(); }), toggle('Keep comments', true, (v) => { comments = v; run(); }))),
    card('Formatted', out, h('div', { class: 'row' }, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' }), button('Download', () => downloadBlob(new Blob([out.value], { type: 'application/xml' }), 'formatted.xml'), { small: true, icon: 'Download' }))),
    card('XPath', xp, h('div', { class: 'chips' }, ['//name', 'count(//item)', 'sum(//p:price)', '//item[2]/@id', 'string(//item[last()]/name)', '//*[@currency="INR"]'].map((v) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => { xp.value = v; run(); } }, v))), xres));
  run();
};

// ================================================================== JSON → types
type T = { kind: 'string' | 'int' | 'float' | 'bool' | 'null' | 'any' } | { kind: 'array'; of: T } | { kind: 'object'; name: string; fields: Map<string, { t: T; optional: boolean }> } | { kind: 'union'; of: T[] };
const pascal = (s: string) => s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase()).replace(/^(\d)/, 'N$1') || 'Item';
const singular = (s: string) => s.replace(/ies$/, 'y').replace(/(ss|sh|ch|x)es$/, '$1').replace(/([^s])s$/, '$1');
function infer(v: any, name: string): T {
  if (v === null) return { kind: 'null' };
  if (Array.isArray(v)) return { kind: 'array', of: v.length ? v.map((x) => infer(x, singular(name))).reduce(merge) : { kind: 'any' } };
  if (typeof v === 'object') return { kind: 'object', name: pascal(name), fields: new Map(Object.entries(v).map(([k, x]) => [k, { t: infer(x, k), optional: false }])) };
  return { kind: typeof v === 'string' ? 'string' : typeof v === 'boolean' ? 'bool' : Number.isInteger(v) ? 'int' : 'float' } as T;
}
function merge(a: T, b: T): T {
  if (a.kind === b.kind && a.kind !== 'object' && a.kind !== 'array' && a.kind !== 'union') return a;
  if ((a.kind === 'int' && b.kind === 'float') || (a.kind === 'float' && b.kind === 'int')) return { kind: 'float' };
  if (a.kind === 'any') return b; if (b.kind === 'any') return a;
  if (a.kind === 'array' && b.kind === 'array') return { kind: 'array', of: merge(a.of, b.of) };
  if (a.kind === 'object' && b.kind === 'object') {
    const f = new Map<string, { t: T; optional: boolean }>();
    for (const k of new Set([...a.fields.keys(), ...b.fields.keys()])) { const x = a.fields.get(k), y = b.fields.get(k); f.set(k, x && y ? { t: merge(x.t, y.t), optional: x.optional || y.optional } : { t: (x || y)!.t, optional: true }); }
    return { kind: 'object', name: a.name, fields: f };
  }
  const parts = [...(a.kind === 'union' ? a.of : [a]), ...(b.kind === 'union' ? b.of : [b])];
  const uniq: T[] = []; for (const p of parts) { const i = uniq.findIndex((u) => u.kind === p.kind); if (i < 0) uniq.push(p); else uniq[i] = merge(uniq[i], p); }
  return uniq.length === 1 ? uniq[0] : { kind: 'union', of: uniq };
}
const nullable = (t: T): [T, boolean] => (t.kind === 'null' ? [{ kind: 'any' }, true] : t.kind === 'union' && t.of.some((x) => x.kind === 'null') ? [t.of.filter((x) => x.kind !== 'null').length === 1 ? t.of.find((x) => x.kind !== 'null')! : { kind: 'union', of: t.of.filter((x) => x.kind !== 'null') }, true] : [t, false]);
function collect(t: T, acc: Array<T & { kind: 'object' }>, seen = new Set<string>()) {
  if (t.kind === 'object') { let n = t.name, i = 2; while (seen.has(n) && !acc.some((o) => o === t)) n = `${t.name}${i++}`; if (!acc.includes(t)) { t.name = n; seen.add(n); acc.push(t); } t.fields.forEach((f) => collect(f.t, acc, seen)); }
  else if (t.kind === 'array') collect(t.of, acc, seen); else if (t.kind === 'union') t.of.forEach((x) => collect(x, acc, seen));
}
const ident = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
const snake = (k: string) => { const s = k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toLowerCase().replace(/^_|_$/g, ''); return /^\d/.test(s) ? `f_${s}` : ['type', 'struct', 'fn', 'match', 'move', 'ref', 'self', 'mod', 'use', 'impl', 'trait', 'in', 'loop', 'where', 'class', 'def', 'from', 'import', 'pass', 'global'].includes(s) ? `${s}_` : s || 'field'; };
const camel = (k: string) => { const p = pascal(k); return p[0].toLowerCase() + p.slice(1); };
export function toTypes(json: string, lang: string, rootName = 'Root'): string {
  const v = JSON.parse(json); let t = infer(v, rootName);
  if (t.kind !== 'object') t = { kind: 'object', name: pascal(rootName), fields: new Map([['value', { t, optional: false }]]) };
  const objs: Array<T & { kind: 'object' }> = []; collect(t, objs);
  const ty = (x: T): string => {
    const [b, nul] = nullable(x);
    const base = ((): string => {
      switch (lang) {
        case 'ts': return b.kind === 'string' ? 'string' : b.kind === 'int' || b.kind === 'float' ? 'number' : b.kind === 'bool' ? 'boolean' : b.kind === 'object' ? b.name : b.kind === 'array' ? `${/[|]/.test(ty(b.of)) ? `(${ty(b.of)})` : ty(b.of)}[]` : b.kind === 'union' ? b.of.map(ty).join(' | ') : 'unknown';
        case 'go': return b.kind === 'string' ? 'string' : b.kind === 'int' ? 'int64' : b.kind === 'float' ? 'float64' : b.kind === 'bool' ? 'bool' : b.kind === 'object' ? b.name : b.kind === 'array' ? `[]${ty(b.of)}` : 'interface{}';
        case 'rust': return b.kind === 'string' ? 'String' : b.kind === 'int' ? 'i64' : b.kind === 'float' ? 'f64' : b.kind === 'bool' ? 'bool' : b.kind === 'object' ? b.name : b.kind === 'array' ? `Vec<${ty(b.of)}>` : 'serde_json::Value';
        case 'java': return b.kind === 'string' ? 'String' : b.kind === 'int' ? 'Long' : b.kind === 'float' ? 'Double' : b.kind === 'bool' ? 'Boolean' : b.kind === 'object' ? b.name : b.kind === 'array' ? `List<${ty(b.of)}>` : 'Object';
        default: return b.kind === 'string' ? 'str' : b.kind === 'int' ? 'int' : b.kind === 'float' ? 'float' : b.kind === 'bool' ? 'bool' : b.kind === 'object' ? b.name : b.kind === 'array' ? `list[${ty(b.of)}]` : b.kind === 'union' ? b.of.map(ty).join(' | ') : 'Any';
      }
    })();
    if (!nul) return base;
    return lang === 'ts' ? `${base === 'unknown' ? 'null' : `${base} | null`}` : lang === 'go' ? (base.startsWith('[]') || base === 'interface{}' ? base : `*${base}`) : lang === 'rust' ? `Option<${base}>` : lang === 'java' ? base : `${base} | None`;
  };
  const out: string[] = [];
  if (lang === 'go') out.push('// Generated by SuperTools JSON → Types', '');
  if (lang === 'rust') out.push('use serde::{Deserialize, Serialize};', '');
  if (lang === 'java') out.push('import java.util.List;', '');
  if (lang === 'py') out.push('from __future__ import annotations', '', 'from dataclasses import dataclass', 'from typing import Any', '');
  const order = lang === 'py' ? [...objs].reverse() : objs;
  for (const o of order) {
    const F = [...o.fields.entries()];
    if (lang === 'ts') out.push(`export interface ${o.name} {`, ...F.map(([k, f]) => `  ${ident(k)}${f.optional ? '?' : ''}: ${ty(f.t)};`), '}', '');
    else if (lang === 'go') out.push(`type ${o.name} struct {`, ...F.map(([k, f]) => `\t${pascal(k)} ${f.optional && !ty(f.t).startsWith('*') && !ty(f.t).startsWith('[]') && ty(f.t) !== 'interface{}' ? '*' : ''}${ty(f.t)} \`json:"${k}${f.optional ? ',omitempty' : ''}"\``), '}', '');
    else if (lang === 'rust') out.push('#[derive(Debug, Clone, Serialize, Deserialize)]', `pub struct ${o.name} {`, ...F.flatMap(([k, f]) => [...(snake(k) !== k ? [`    #[serde(rename = ${JSON.stringify(k)})]`] : []), ...(f.optional ? ['    #[serde(default, skip_serializing_if = "Option::is_none")]'] : []), `    pub ${snake(k)}: ${f.optional && !ty(f.t).startsWith('Option<') ? `Option<${ty(f.t)}>` : ty(f.t)},`]), '}', '');
    else if (lang === 'java') out.push(`public record ${o.name}(`, F.map(([k, f]) => `    ${ty(f.t)} ${camel(k)}`).join(',\n'), ') {}', '');
    else out.push('@dataclass', `class ${o.name}:`, ...(F.length ? F.map(([k, f]) => `    ${snake(k)}: ${ty(f.t)}${f.optional ? ' | None = None' : ''}`) : ['    pass']), '', '');
  }
  return out.join('\n').trimEnd() + '\n';
}
export const json2types: Mount = (root) => {
  let lang = 'ts';
  const src = textarea({ rows: 12, mono: true, value: JSON.stringify({ id: 101, customer: { name: 'Asha Rao', email: 'asha@example.in', vip: true }, items: [{ sku: 'TEA-1', qty: 2, price: 120.5 }, { sku: 'SPC-9', qty: 1, price: 950, note: 'gift wrap' }], deliveredAt: null, tags: ['online', 'repeat'] }, null, 2) });
  const name = input({ value: 'Order', attrs: { class: 'input mono', 'aria-label': 'Root type name' } }), out = outputBox({ rows: 18, mono: true }), status = h('div');
  const run = () => { clear(status); try { out.value = toTypes(src.value, lang, name.value.trim() || 'Root'); } catch (e: any) { out.value = ''; status.append(note(`Invalid JSON: ${e.message}`, 'warn')); } };
  [src, name].forEach((x) => x.addEventListener('input', debounce(run, 150)));
  root.append(card('JSON sample', src, field('Root type name', name)), card(null, segmented([['ts', 'TypeScript'], ['go', 'Go'], ['rust', 'Rust (serde)'], ['java', 'Java records'], ['py', 'Python dataclasses']], lang, (v) => { lang = v; run(); })),
    card('Types', out, status, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' })), note('Fields missing from some array items become optional; null makes a field nullable; whole numbers become integers.', 'info'));
  run();
};

// ================================================================== JSON diff
const ptrGet = (doc: any, p: string) => p.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~')).reduce((o, k) => (o == null ? undefined : o[k]), doc);
export const jsondiff: Mount = (root) => {
  let dc: Devcore | null = null;
  const a = textarea({ rows: 12, mono: true, value: JSON.stringify({ name: 'Asha', age: 30, city: 'Pune', skills: ['sql', 'go'], address: { pin: '411001', street: 'FC Road' } }, null, 2) });
  const b = textarea({ rows: 12, mono: true, value: JSON.stringify({ name: 'Asha Rao', city: 'Pune', skills: ['sql', 'go', 'rust'], address: { pin: '411004', street: 'FC Road' }, verified: true }, null, 2) });
  const out = h('div'), patchBox = outputBox({ rows: 8, mono: true });
  const run = async () => {
    dc ||= await devcore('jsondiff');
    show(out, () => {
      const r = dc!.json('jsondiff', { a: a.value, b: b.value }); patchBox.value = JSON.stringify(r.patch, null, 2);
      if (r.equal) return note('The two documents are equal (key order and whitespace ignored).', 'ok');
      const left = JSON.parse(a.value), fmt = (v: any) => (v === undefined ? '' : JSON.stringify(v));
      const rows = r.patch.map((o: any) => { const cls = o.op === 'add' ? 'jd-add' : o.op === 'remove' ? 'jd-del' : 'jd-chg'; return h('tr', { class: cls }, h('td', { class: 'mono' }, o.path || '/'), h('td', null, o.op === 'add' ? 'added' : o.op === 'remove' ? 'removed' : 'changed'), h('td', { class: 'mono' }, fmt(o.op === 'add' ? undefined : ptrGet(left, o.path))), h('td', { class: 'mono' }, fmt(o.value))); });
      return [note(`${r.count} difference${r.count === 1 ? '' : 's'}`, 'info'), h('div', { class: 'scroll-x' }, h('table', { class: 'tbl jd-tbl' }, h('thead', null, h('tr', null, ['Path', 'Change', 'Left', 'Right'].map((x) => h('th', null, x)))), h('tbody', null, rows)))];
    });
  };
  [a, b].forEach((x) => x.addEventListener('input', debounce(run, 200)));
  root.append(h('div', { class: 'grid2' }, card('Left (old)', a, filePicker({ accept: '.json', label: 'Open JSON', onFiles: async ([f]) => { a.value = await f.text(); run(); } })), card('Right (new)', b, filePicker({ accept: '.json', label: 'Open JSON', onFiles: async ([f]) => { b.value = await f.text(); run(); } }))),
    card('Differences', out), card('As a JSON Patch (RFC 6902)', patchBox, button('Copy patch', () => copy(patchBox.value), { small: true, icon: 'Copy' })));
  run();
};

// ================================================================== Markdown table
export function mdTable(rows: string[][], align: string[]): string {
  const n = Math.max(...rows.map((r) => r.length), 1), cell = (s: string) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  const R = rows.map((r) => Array.from({ length: n }, (_, i) => cell(r[i] ?? '')));
  const w = Array.from({ length: n }, (_, i) => Math.max(3, ...R.map((r) => [...r[i]].length)));
  const pad = (s: string, i: number) => { const d = w[i] - [...s].length; return align[i] === 'right' ? ' '.repeat(d) + s : align[i] === 'center' ? ' '.repeat(Math.floor(d / 2)) + s + ' '.repeat(Math.ceil(d / 2)) : s + ' '.repeat(d); };
  const sep = w.map((x, i) => (align[i] === 'center' ? `:${'-'.repeat(x - 2)}:` : align[i] === 'right' ? `${'-'.repeat(x - 1)}:` : align[i] === 'left' ? `:${'-'.repeat(x - 1)}` : '-'.repeat(x)));
  const line = (c: string[]) => `| ${c.join(' | ')} |`;
  return [line(R[0].map(pad)), line(sep), ...R.slice(1).map((r) => line(r.map(pad)))].join('\n');
}
export function parseMdTable(md: string): { rows: string[][]; align: string[] } | null {
  const ls = md.trim().split(/\r?\n/).filter((l) => l.trim().startsWith('|') || l.includes('|'));
  if (ls.length < 2 || !/^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(ls[1])) return null;
  const split = (l: string) => { const t = l.trim().replace(/^\|/, '').replace(/\|$/, ''); const out: string[] = []; let cur = ''; for (let i = 0; i < t.length; i++) { if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; } else if (t[i] === '|') { out.push(cur.trim()); cur = ''; } else cur += t[i]; } out.push(cur.trim()); return out.map((c) => c.replace(/<br\s*\/?>/g, '\n')); };
  const align = split(ls[1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : 'none'));
  return { rows: [split(ls[0]), ...ls.slice(2).map(split)], align };
}
export const mdtable: Mount = (root) => {
  let rows: string[][] = [['Item', 'Qty', 'Price (₹)'], ['Chai', '2', '40'], ['Samosa', '3', '45'], ['Lassi', '1', '60']], align = ['left', 'right', 'right'];
  const grid = h('div', { class: 'scroll-x' }), out = outputBox({ rows: 8, mono: true }), paste = textarea({ rows: 4, mono: true, placeholder: 'Paste CSV, tab-separated cells (from Excel / Sheets) or a Markdown table' }), status = h('div');
  const emit = () => { out.value = mdTable(rows, align); };
  const draw = () => {
    const n = Math.max(...rows.map((r) => r.length));
    rows = rows.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? '')); while (align.length < n) align.push('none'); align = align.slice(0, n);
    clear(grid).append(h('table', { class: 'tbl md-grid' }, h('thead', null, h('tr', null, ...align.map((a, i) => h('th', null, select([['none', '—'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], a as any, (v) => { align[i] = v; emit(); }), button('', () => { if (n === 1) throw new Error('Keep at least one column'); rows.forEach((r) => r.splice(i, 1)); align.splice(i, 1); draw(); }, { small: true, icon: 'X', title: `Delete column ${i + 1}` }))), h('th', null))),
      h('tbody', null, rows.map((r, ri) => h('tr', { class: ri === 0 ? 'hdr' : null }, ...r.map((c, ci) => h('td', null, h('input', { class: 'input md-cell', value: c, 'aria-label': `Row ${ri + 1} column ${ci + 1}`, oninput: (e: Event) => { r[ci] = (e.target as HTMLInputElement).value; emit(); } }))),
        h('td', null, ri ? button('', () => { rows.splice(ri, 1); draw(); }, { small: true, icon: 'X', title: `Delete row ${ri + 1}` }) : null))))));
    emit();
  };
  const importText = async () => {
    clear(status); const t = paste.value; if (!t.trim()) return;
    const md = parseMdTable(t);
    if (md) { rows = md.rows; align = md.align; draw(); status.append(note(`Read a Markdown table: ${rows.length} rows`, 'ok')); return; }
    const { sheetEngine } = await import('../../wasm/sheet');
    const sh = await sheetEngine(); const book = sh.csv(new TextEncoder().encode(t), t.includes('\t') ? '\t' : '');
    rows = book.sheets[0].rows.map((r) => r.map((c) => (c == null ? '' : String(c)))); align = rows[0].map(() => 'none'); draw();
    status.append(note(`Read ${rows.length} rows (${book.delimiter === '\t' ? 'tab' : book.delimiter === ',' ? 'comma' : `"${book.delimiter}"`}-separated)`, 'ok'));
  };
  root.append(card('Table', grid, h('div', { class: 'row' }, button('Add row', () => { rows.push(rows[0].map(() => '')); draw(); }, { small: true, icon: 'Plus' }), button('Add column', () => { rows.forEach((r, i) => r.push(i ? '' : `Column ${r.length + 1}`)); draw(); }, { small: true, icon: 'Plus' }))),
    card('Import', paste, button('Import', importText, { small: true, icon: 'Upload' }), status), card('Markdown', out, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' })));
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
export const mockdata: Mount = async (root) => {
  const na: Sodium = await sodium(), mc = await mathcore();
  const fields: MockField[] = [{ name: 'id', type: 'id', a: '1', b: '' }, { name: 'name', type: 'name', a: '', b: '' }, { name: 'email', type: 'email', a: '', b: '' }, { name: 'phone', type: 'phone', a: '', b: '' }, { name: 'city', type: 'city', a: '', b: '' }, { name: 'age', type: 'int', a: '18', b: '65' }, { name: 'joined', type: 'date', a: '2020-01-01', b: '2026-11-16' }, { name: 'plan', type: 'pick', a: 'free,pro,team', b: '' }];
  let fmt = 'json', count = 10;
  const list = h('div', { class: 'stack' }), out = outputBox({ rows: 16, mono: true }), table_ = input({ value: 'customers', attrs: { class: 'input mono', 'aria-label': 'SQL table name' } });
  const R = (n: number) => na.uniform(n), pickA = <X>(a: readonly X[]) => a[R(a.length)];
  const digits = (n: number) => Array.from({ length: n }, () => R(10)).join('');
  const L = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + R(26))).join('');
  const gstin = (state: string) => { const pan = `${L(3)}P${L(1)}${digits(4)}${L(1)}`, base = `${STATE_CODE[state] || '27'}${pan}1Z`; for (const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (mc.gstinValid(base + c)) return base + c; return base + '0'; };
  let rows: Record<string, any>[] = [];
  const gen = () => { rows = []; make(); render(); };
  const make = () => {
    for (let i = 0; i < count; i++) {
      const fn = pickA(FIRST), ln = pickA(LAST), [city, state, pin] = pickA(CITIES), row: Record<string, any> = {};
      for (const f of fields) {
        const lo = +f.a, hi = +f.b;
        row[f.name] = ((): any => { switch (f.type) {
          case 'id': return (+f.a || 1) + i; case 'uuid': return na.uuid(4); case 'first': return fn; case 'last': return ln; case 'name': return `${fn} ${ln}`;
          case 'email': return `${fn}.${ln}${R(100)}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + `@${pickA(['example.com', 'example.in', 'mail.test'])}`;
          case 'phone': return `+91 ${6 + R(4)}${digits(4)} ${digits(5)}`; case 'city': return city; case 'state': return state; case 'pincode': return `${pin}${digits(3)}`;
          case 'address': return `${1 + R(400)}, ${pickA(STREET)}, ${city} ${pin}${digits(3)}`; case 'company': return `${pickA(COMPANY)} ${pickA(SUFFIX)}`;
          case 'int': { const a = Number.isFinite(lo) && f.a !== '' ? Math.ceil(lo) : 0, b = Number.isFinite(hi) && f.b !== '' ? Math.floor(hi) : 1000; return b >= a ? a + R(b - a + 1) : a; }
          case 'float': { const a = f.a !== '' ? lo : 0, b = f.b !== '' ? hi : 1000; return Math.round((a + (R(1_000_000) / 1_000_000) * (b - a)) * 100) / 100; }
          case 'bool': return R(2) === 1;
          case 'date': case 'datetime': { const a = Date.parse(f.a || '2020-01-01'), b = Date.parse(f.b || '2026-12-31'); const t = a + Math.floor((R(1_000_000) / 1_000_000) * Math.max(0, b - a)); const iso = new Date(f.type === 'date' ? Math.floor(t / 86400000) * 86400000 : Math.floor(t / 1000) * 1000).toISOString(); return f.type === 'date' ? iso.slice(0, 10) : iso.replace('.000Z', 'Z'); }
          case 'pan': return `${L(3)}P${ln[0].toUpperCase()}${digits(4)}${L(1)}`; case 'gstin': return gstin(state); case 'ifsc': return `${pickA(BANKS)}0${digits(6)}`;
          case 'words': return Array.from({ length: Math.max(1, +f.a || 5) }, () => pickA(WORDS)).join(' ');
          case 'pick': { const opts = f.a.split(',').map((x) => x.trim()).filter(Boolean); return opts.length ? pickA(opts) : null; }
          default: return null;
        } })();
      }
      rows.push(row);
    }
  };
  /** Changing only the output format or table name re-formats the same rows (it used to make new random data). */
  const render = () => {
    const names = fields.map((f) => f.name);
    const csvCell = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const sqlVal = (v: any) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `'${String(v).replace(/'/g, "''")}'`);
    out.value = fmt === 'json' ? JSON.stringify(rows, null, 2) : fmt === 'ndjson' ? rows.map((r) => JSON.stringify(r)).join('\n') : fmt === 'csv' ? [names.map(csvCell).join(','), ...rows.map((r) => names.map((n) => csvCell(r[n])).join(','))].join('\n')
      : rows.map((r) => `INSERT INTO ${table_.value || 'data'} (${names.join(', ')}) VALUES (${names.map((n) => sqlVal(r[n])).join(', ')});`).join('\n');
  };
  const draw = () => clear(list).append(...fields.map((f, i) => h('div', { class: 'row mock-row' },
    h('input', { class: 'input mono', value: f.name, 'aria-label': `Field ${i + 1} name`, oninput: (e: Event) => { f.name = (e.target as HTMLInputElement).value; gen(); } }),
    select(MOCK_TYPES, f.type, (v) => { f.type = v; draw(); gen(); }),
    ['int', 'float', 'date', 'datetime', 'pick', 'id', 'words'].includes(f.type) ? h('input', { class: 'input mono', value: f.a, placeholder: f.type === 'pick' ? 'a, b, c' : f.type === 'id' ? 'start' : f.type === 'words' ? 'how many' : 'from', 'aria-label': `Field ${i + 1} from`, oninput: (e: Event) => { f.a = (e.target as HTMLInputElement).value; gen(); } }) : '',
    ['int', 'float', 'date', 'datetime'].includes(f.type) ? h('input', { class: 'input mono', value: f.b, placeholder: 'to', 'aria-label': `Field ${i + 1} to`, oninput: (e: Event) => { f.b = (e.target as HTMLInputElement).value; gen(); } }) : '',
    button('', () => { fields.splice(i, 1); draw(); gen(); }, { small: true, icon: 'X', title: `Remove field ${i + 1}` }))));
  table_.addEventListener('input', render);
  root.append(card('Fields', list, button('Add field', () => { fields.push({ name: `field${fields.length + 1}`, type: 'words', a: '3', b: '' }); draw(); gen(); }, { small: true, icon: 'Plus' })),
    card(null, slider({ label: 'Rows', min: 1, max: 1000, value: count, onInput: (v) => { count = v; gen(); } }), field('Format', segmented([['json', 'JSON'], ['ndjson', 'NDJSON'], ['csv', 'CSV'], ['sql', 'SQL INSERT']], fmt, (v) => { fmt = v; render(); })), field('SQL table name', table_)),
    card('Data', out, h('div', { class: 'row' }, button('Generate again', gen, { small: true, icon: 'RefreshCw' }), button('Copy', () => copy(out.value), { small: true, icon: 'Copy' }), button('Download', () => downloadBlob(new Blob([out.value], { type: 'text/plain' }), `mock.${fmt === 'sql' ? 'sql' : fmt === 'csv' ? 'csv' : fmt === 'ndjson' ? 'ndjson' : 'json'}`), { small: true, icon: 'Download' }))),
    note('Fake data for testing only. PAN, IFSC and phone numbers only have the right format; GSTINs have a valid checksum but belong to no one.', 'info'));
  draw(); gen();
};
