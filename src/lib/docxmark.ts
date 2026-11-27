// The Watermark tab's mark in a Word document (to-do #17): Word's own watermark — the shape Word puts into the headers
// with Design → Watermark — in every header that shows on a page, so the document stays a Word document, editable, and
// Word, LibreOffice and Google Docs show the mark on every page.
//
// A .docx is a zip of XML parts: 7-Zip (7z-wasm, on the site already) takes it apart and puts it together again; the
// browser's DOMParser and XMLSerializer read and write the XML (docs/WASM-AUDIT.md, Watermark). What changes:
//  • every section gets a header part of its own for each header that shows on its pages — the default one, the first
//    page's when "Different first page" is on, the even pages' when "Different odd and even pages" is on. A section that
//    used the one before it (Word's "Link to previous") gets a copy of that header, so each section's mark is placed
//    for its own page shape; nothing else in the headers changes;
//  • in each, at the start of its first paragraph, the mark as VML shapes, as Word writes a watermark: text as a text
//    path (font, colour, opacity, the shadow — Word's own, not blurred), a logo as a picture (its opacity in the
//    picture's transparency); behind the text, placed from the page's edges (src/lib/wmlayout.ts) and turned;
//  • a mark of one shape is named as Word names its watermarks (PowerPlusWaterMarkObject, WordPictureWatermark: Design
//    → Watermark → Remove takes it away); tiles are shapes of their own (LibreOffice shows one watermark-named shape a
//    header); an earlier watermark is taken out first.
// Found with LibreOffice (tests/e2e): it keeps one shape of a w:pict, so each shape is a run of its own; it sizes a text
// watermark by its width alone.
import { extractArchive, createArchive } from './sevenzip-client';
import { placeMarks, type Place, type Unit } from './wmlayout';
import { docFont, measureText, unitOf, logoUnit, pngOf, SHADOW, type DocMark } from './docmark';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const STRICT_W = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const V_NS = 'urn:schemas-microsoft-com:vml', O_NS = 'urn:schemas-microsoft-com:office:office', W10_NS = 'urn:schemas-microsoft-com:office:word';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const REL = (t: string) => `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${t}`;
const HEADER_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
const FOOTER_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
const PREFIXES = /^(PowerPlusWaterMarkObject|WordPictureWatermark|SuperUtilsWatermark)/;
// Word's shape types for a watermark: a plain text path (136) and a picture frame (75), as Word writes them
const TEXT_TYPE = '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>';
const PICTURE_TYPE = '<v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f"><v:stroke joinstyle="miter"/><v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/><v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/><v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/><v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/></v:formulas><v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/><o:lock v:ext="edit" aspectratio="t"/></v:shapetype>';
const EMPTY_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr></w:p></w:hdr>`;
const EMPTY_FOOTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr></w:p></w:ftr>`;
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pt = (n: number) => `${+n.toFixed(2)}pt`;
const parse = (xml: string, what: string) => {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  if (d.getElementsByTagName('parsererror').length) throw new Error(`The document's ${what} could not be read: the file is damaged.`);
  return d;
};
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const write = (d: Document) => new TextEncoder().encode(DECL + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, ''));
const on = (el: Element | null) => !!el && !/^(0|false|off)$/i.test(el.getAttributeNS(W_NS, 'val') ?? '');
/** A part's path from a relationship's target, relative to the folder of the part that has the relationship */
function resolve(from: string, target: string) {
  if (target.startsWith('/')) return target.slice(1);
  const out = from.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); }
  return out.join('/');
}
const relsOf = (part: string) => { const i = part.lastIndexOf('/'); return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`; };

/** `headers`: the header parts that got the mark; `cover`: the first page was left without it (to-do #34) */
export interface DocxResult { bytes: Uint8Array; sections: number; headers: number; replaced: number; signed: boolean; cover: boolean }

/** The .docx `file` with the mark in every header that shows on a page — the first page's too, unless `o.cover` is false.
 *  `label`: the tab's font label. */
export async function markDocx(file: Blob, name: string, o: DocMark, label: string, onProgress?: (pct: number) => void): Promise<DocxResult> {
  let entries: Array<{ path: string; data: Uint8Array }>;
  try { entries = await extractArchive(file, name, '', null, (p) => onProgress?.(p * 0.4)); }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/PASSWORD/.test(m)) throw new Error('This Word document is protected with a password: open it in Word, take the password off (File → Info → Protect Document), save it, and add the watermark then.');
    throw new Error('This is not a Word document (.docx) — the file could not be opened.');
  }
  const files = new Map(entries.map((e) => [e.path.replace(/\\/g, '/'), e.data]));
  const has = (n: string) => [...files.keys()].some((k) => k.toLowerCase() === n.toLowerCase());
  if (!files.has('[Content_Types].xml')) {
    if (has('EncryptedPackage')) throw new Error('This Word document is protected with a password: open it in Word, take the password off (File → Info → Protect Document), save it, and add the watermark then.');
    if (has('WordDocument')) throw new Error('This is a Word document in the old format (.doc): open it in Word and save it as a Word Document (.docx) first.');
    throw new Error('This is not a Word document (.docx).');
  }
  // the main part, from the package's relationships
  const rootRels = files.get('_rels/.rels');
  const mainRel = rootRels ? [...parse(text(rootRels), 'package relationships').getElementsByTagNameNS(REL_NS, 'Relationship')].find((r) => /\/officeDocument$/.test(r.getAttribute('Type') ?? '')) : null;
  const main = mainRel ? resolve('', mainRel.getAttribute('Target') ?? '') : 'word/document.xml';
  const mainXml = files.get(main);
  if (!mainXml) throw new Error('This is not a Word document (.docx): it has no document part.');
  const doc = parse(text(mainXml), 'text');
  if (doc.documentElement.namespaceURI === STRICT_W) throw new Error('This document is saved as "Strict Open XML": open it in Word and save it as an ordinary Word Document (.docx) first.');
  if (doc.documentElement.namespaceURI !== W_NS) throw new Error('This is not a Word document (.docx): its main part is not a Word document.');
  const mainRelsPath = relsOf(main);
  const rels = files.get(mainRelsPath) ? parse(text(files.get(mainRelsPath)!), 'relationships') : parse(`<Relationships xmlns="${REL_NS}"/>`, 'relationships');
  const relEls = () => [...rels.getElementsByTagNameNS(REL_NS, 'Relationship')];
  const target = (id: string) => { const r = relEls().find((x) => x.getAttribute('Id') === id); return r ? resolve(main, r.getAttribute('Target') ?? '') : null; };
  const settingsRel = relEls().find((r) => /\/settings$/.test(r.getAttribute('Type') ?? ''));
  const settingsPath = settingsRel ? resolve(main, settingsRel.getAttribute('Target') ?? '') : null;
  const evenOdd = settingsPath && files.get(settingsPath) ? on(parse(text(files.get(settingsPath)!), 'settings').getElementsByTagNameNS(W_NS, 'evenAndOddHeaders')[0] ?? null) : false;
  const ct = parse(text(files.get('[Content_Types].xml')!), 'content types');

  // the sections, in order: a w:sectPr in a paragraph's properties, and the body's last one (not the old properties of a
  // tracked change)
  const sects = [...doc.getElementsByTagNameNS(W_NS, 'sectPr')].filter((s) => {
    const p = s.parentElement;
    if (!p || !(p.localName === 'body' || (p.localName === 'pPr' && p.parentElement?.localName === 'p'))) return false;
    for (let a: Element | null = s.parentElement; a; a = a.parentElement) if (a.localName === 'pPrChange' || a.localName === 'sectPrChange') return false;
    return true;
  });
  if (!sects.length) throw new Error('This Word document has no section properties: open it in Word and save it again.');

  // the mark's box per unit, and its picture
  const font = docFont(label);
  let unit: Unit, logoPath = '';
  if (o.kind === 'logo') {
    if (!o.logo) throw new Error('Choose a logo image.');
    unit = logoUnit(o.logo);
    const faded = { ...o.logo, data: new Uint8ClampedArray(o.logo.data) }; // its opacity in its transparency
    for (let i = 3; i < faded.data.length; i += 4) faded.data[i] = Math.round(faded.data[i] * o.opacity);
    let k = 1; while (has(`word/media/superutils-watermark${k}.png`)) k++;
    logoPath = `word/media/superutils-watermark${k}.png`;
    files.set(logoPath, await pngOf(faded));
    if (![...ct.getElementsByTagNameNS(CT_NS, 'Default')].some((d) => (d.getAttribute('Extension') ?? '').toLowerCase() === 'png')) {
      const d = ct.createElementNS(CT_NS, 'Default'); d.setAttribute('Extension', 'png'); d.setAttribute('ContentType', 'image/png');
      ct.documentElement.insertBefore(d, ct.documentElement.firstChild);
    }
  } else unit = unitOf(measureText(o.text, `"${font.word}", ${o.font}`));

  // which header part each section shows for each kind of page — its own, or the one before it uses
  const child = (s: Element, name: string) => [...s.children].find((c) => c.namespaceURI === W_NS && c.localName === name) ?? null; // not the old properties of a tracked change
  const kinds = (s: Element) => ['default', ...(on(child(s, 'titlePg')) ? ['first'] : []), ...(evenOdd ? ['even'] : [])];
  const original = new Map<string, string>(); // a header part's XML as it was (copies are made from it)
  const claimed = new Set<string>();
  const jobs: Array<{ part: string; W: number; H: number; mark: boolean }> = [];
  let inherited: Record<string, string | null> = { default: null, first: null, even: null };
  const nextFree = (kind: 'header' | 'footer') => { let k = 1; while (has(`word/${kind}${k}.xml`)) k++; return `word/${kind}${k}.xml`; };
  let relNo = 1;
  const nextRel = () => { const ids = new Set(relEls().map((r) => r.getAttribute('Id'))); while (ids.has(`rIdSuWm${relNo}`)) relNo++; return `rIdSuWm${relNo++}`; };
  /** a new header or footer part: its relationship from the main part and its content type */
  const addRel = (kind: 'header' | 'footer', part: string) => {
    const id = nextRel(), rel = rels.createElementNS(REL_NS, 'Relationship');
    rel.setAttribute('Id', id); rel.setAttribute('Type', REL(kind)); rel.setAttribute('Target', part.slice(main.lastIndexOf('/') + 1));
    rels.documentElement.appendChild(rel);
    const ov = ct.createElementNS(CT_NS, 'Override'); ov.setAttribute('PartName', `/${part}`); ov.setAttribute('ContentType', kind === 'header' ? HEADER_CT : FOOTER_CT);
    ct.documentElement.appendChild(ov);
    return id;
  };
  /** the section's reference of `type` to the relationship `id` (references come first in a section's properties) */
  const setRef = (s: Element, refs: Record<string, Element>, kind: 'header' | 'footer', type: string, id: string) => {
    if (refs[type]) { refs[type].setAttributeNS(R_NS, 'r:id', id); return; }
    const ref = doc.createElementNS(W_NS, `w:${kind}Reference`);
    ref.setAttributeNS(W_NS, 'w:type', type); ref.setAttributeNS(R_NS, 'r:id', id);
    s.insertBefore(ref, s.firstChild);
    refs[type] = ref;
  };
  const refsOf = (s: Element, kind: 'header' | 'footer' = 'header') => {
    const m: Record<string, Element> = {};
    for (const r of [...s.children].filter((c) => c.namespaceURI === W_NS && c.localName === `${kind}Reference`)) m[r.getAttributeNS(W_NS, 'type') || 'default'] = r;
    return m;
  };
  /** a header part of the section's own for `type`: a copy of `from` as it was (with its relationships), or an empty one */
  const ownCopy = (s: Element, own: Record<string, Element>, type: string, from: string | null) => {
    const part = nextFree('header');
    const xml = from ? (original.get(from) ?? text(files.get(from)!)) : EMPTY_HEADER;
    if (from && !original.has(from)) original.set(from, xml);
    files.set(part, new TextEncoder().encode(xml)); original.set(part, xml); claimed.add(part);
    if (from && files.has(relsOf(from))) files.set(relsOf(part), files.get(relsOf(from))!);
    setRef(s, own, 'header', type, addRel('header', part));
    return part;
  };
  const coverOff = o.cover === false;
  for (const [si, s] of sects.entries()) {
    const pg = s.getElementsByTagNameNS(W_NS, 'pgSz')[0];
    const W = (+(pg?.getAttributeNS(W_NS, 'w') ?? '') || 12240) / 20, H = (+(pg?.getAttributeNS(W_NS, 'h') ?? '') || 15840) / 20;
    const own = refsOf(s);
    const before = { ...inherited };
    for (const t of ['default', 'first', 'even']) { const id = own[t]?.getAttributeNS(R_NS, 'id'); if (id) inherited[t] = target(id); }
    // the document's first page, its cover, without the mark (to-do #34): its own first-page header — Word's "Different
    // first page", switched on where it was off. Later sections keep what they showed (`inherited` holds the original).
    const cover = coverOff && si === 0, madeCover = cover && !on(child(s, 'titlePg'));
    if (madeCover) setTitlePg(s);
    for (const t of kinds(s)) {
      const mine = own[t] ? target(own[t].getAttributeNS(R_NS, 'id') ?? '') : null;
      if (cover && t === 'first') {
        if (madeCover) { // page 1 showed the default header: a copy of it is the cover's (a first-page header not in use stays out)
          const def = own.default ? target(own.default.getAttributeNS(R_NS, 'id') ?? '') : null;
          if (def && files.has(def)) jobs.push({ part: ownCopy(s, own, 'first', def), W, H, mark: false });
          else if (own.first) { own.first.remove(); delete own.first; } // page 1 had no header
        } else if (mine && files.has(mine)) jobs.push({ part: claimed.has(mine) ? ownCopy(s, own, 'first', mine) : (claimed.add(mine), mine), W, H, mark: false });
        continue; // (no first-page header of its own: the first section's cover shows none)
      }
      if (mine && files.has(mine) && !claimed.has(mine)) { claimed.add(mine); if (!original.has(mine)) original.set(mine, text(files.get(mine)!)); jobs.push({ part: mine, W, H, mark: true }); continue; }
      // a part of its own: a copy of the header it showed (as it was), or an empty header
      const from = mine && files.has(mine) ? mine : before[t] && files.has(before[t]!) ? before[t]! : null;
      const part = ownCopy(s, own, t, from);
      inherited[t] = part;
      jobs.push({ part, W, H, mark: true });
    }
    if (madeCover) coverFooter(s, sects.slice(si + 1));
  }

  /** The cover's footer when "Different first page" was switched on for it: the footer page 1 showed — a copy of the
   *  section's default footer, or none — and the later sections that took their first-page footer from this section
   *  keep the one they had (pinned by a reference of their own). */
  function coverFooter(s: Element, later: Element[]) {
    const f = refsOf(s, 'footer');
    const oldId = f.first?.getAttributeNS(R_NS, 'id') ?? null;
    const def = f.default ? target(f.default.getAttributeNS(R_NS, 'id') ?? '') : null;
    if (def && files.has(def)) {
      const part = nextFree('footer');
      files.set(part, files.get(def)!);
      if (files.has(relsOf(def))) files.set(relsOf(part), files.get(relsOf(def))!);
      setRef(s, f, 'footer', 'first', addRel('footer', part));
    } else if (f.first) f.first.remove(); // page 1 had no footer: a first-page footer not in use stays out of it
    else return; // section 1 had no first-page footer and has none now: nothing changes for the later ones
    // the later sections that take their first-page footer from section 1 (up to one with its own), where one of them
    // shows a first page: they keep the footer they had — the one not in use in section 1, or none
    const chain: Element[] = [];
    for (const s2 of later) { if (refsOf(s2, 'footer').first) break; chain.push(s2); }
    if (!chain.some((s2) => on(child(s2, 'titlePg')))) return;
    let id = oldId;
    if (!id) { const part = nextFree('footer'); files.set(part, new TextEncoder().encode(EMPTY_FOOTER)); id = addRel('footer', part); }
    for (const s2 of chain) setRef(s2, refsOf(s2, 'footer'), 'footer', 'first', id);
  }
  /** "Different first page" on: Word's w:titlePg, in its place among the section's properties */
  function setTitlePg(s: Element) {
    let tp = child(s, 'titlePg');
    if (tp) { tp.removeAttributeNS(W_NS, 'val'); return; }
    tp = doc.createElementNS(W_NS, 'w:titlePg');
    const next = [...s.children].find((c) => c.namespaceURI === W_NS && ['textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'].includes(c.localName));
    s.insertBefore(tp, next ?? null);
  }

  // the mark into each of those headers (the cover's: only an earlier watermark taken out)
  let spid = 7001, shapeNo = 1, replaced = 0;
  for (const { part, W, H, mark } of jobs) {
    const hd = parse(text(files.get(part)!), 'header'), root = hd.documentElement;
    // an earlier watermark: its shapes out (their runs, when nothing else is in them)
    const earlier = [...hd.getElementsByTagNameNS(V_NS, 'shape')].filter((x) => PREFIXES.test(x.getAttribute('id') ?? ''));
    for (const sh of earlier) {
      replaced++;
      const pict = sh.closest('pict'), run = pict?.parentElement;
      sh.remove();
      if (pict && ![...pict.children].some((c) => c.localName === 'shape' || c.localName === 'rect' || c.localName === 'group')) {
        pict.remove();
        if (run && run.localName === 'r' && ![...run.children].some((c) => c.localName !== 'rPr')) run.remove();
      }
    }
    if (!mark) { if (earlier.length) files.set(part, write(hd)); continue; }
    for (const [p, ns] of [['v', V_NS], ['o', O_NS], ['w10', W10_NS], ['r', R_NS]]) if (root.lookupNamespaceURI(p) !== ns) root.setAttributeNS(XMLNS, `xmlns:${p}`, ns);
    let rid = '';
    if (logoPath) {
      const hrPath = relsOf(part), hr = files.get(hrPath) ? parse(text(files.get(hrPath)!), 'relationships') : parse(`<Relationships xmlns="${REL_NS}"/>`, 'relationships');
      const ids = new Set([...hr.getElementsByTagNameNS(REL_NS, 'Relationship')].map((r) => r.getAttribute('Id')));
      let k = 1; while (ids.has(`rIdSuWm${k}`)) k++;
      rid = `rIdSuWm${k}`;
      const rel = hr.createElementNS(REL_NS, 'Relationship');
      rel.setAttribute('Id', rid); rel.setAttribute('Type', REL('image')); rel.setAttribute('Target', resolveRel(part, logoPath));
      hr.documentElement.appendChild(rel);
      files.set(hrPath, write(hr));
    }
    const places = placeMarks(W, H, o, unit);
    const single = places.length === 1;
    const runs = places.map((p, i) => runXml(p, W, H, i === 0, o, font.word, rid, single ? (o.kind === 'logo' ? 'WordPictureWatermark' : 'PowerPlusWaterMarkObject') : 'SuperUtilsWatermark', shapeNo++, spid++, i));
    const frag = parse(`<x xmlns:w="${W_NS}" xmlns:v="${V_NS}" xmlns:o="${O_NS}" xmlns:w10="${W10_NS}" xmlns:r="${R_NS}">${runs.join('')}</x>`, 'watermark').documentElement;
    // the first paragraph of the header itself (not one in a table), else a new one at its top
    let para = [...root.children].find((c) => c.namespaceURI === W_NS && c.localName === 'p')
      ?? [...root.children].filter((c) => c.localName === 'sdt').map((sdt) => [...(sdt.getElementsByTagNameNS(W_NS, 'sdtContent')[0]?.children ?? [])].find((c) => c.localName === 'p')).find(Boolean);
    if (!para) { para = hd.createElementNS(W_NS, 'w:p'); root.insertBefore(para, root.firstChild); }
    const pPr = [...para.children].find((c) => c.localName === 'pPr');
    let at: Node | null = pPr ? pPr.nextSibling : para.firstChild;
    for (const r of [...frag.children]) { para.insertBefore(hd.importNode(r, true), at); }
    files.set(part, write(hd));
  }
  files.set(main, write(doc));
  files.set(mainRelsPath, write(rels));
  files.set('[Content_Types].xml', write(ct));
  const signed = [...files.keys()].some((k) => k.startsWith('_xmlsignatures/'));
  // the package again: [Content_Types].xml first, as Word writes it
  const order = ['[Content_Types].xml', ...[...files.keys()].filter((k) => k !== '[Content_Types].xml')];
  const bytes = await createArchive(order.map((p) => ({ path: p, file: new File([files.get(p)! as BlobPart], p.split('/').pop()!) })), { format: 'zip', level: 6, password: '', encryptNames: false, exact: true }, (p) => onProgress?.(0.6 + p * 0.4));
  return { bytes, sections: sects.length, headers: jobs.filter((j) => j.mark).length, replaced, signed, cover: coverOff };
}

/** A relationship's target from `from`'s folder to `to` */
function resolveRel(from: string, to: string) {
  const a = from.split('/').slice(0, -1), b = to.split('/');
  let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

/** One shape of the mark, as a run of its own (LibreOffice keeps one shape of a w:pict) */
function runXml(p: Place, W: number, H: number, first: boolean, o: DocMark, wordFont: string, rid: string, prefix: string, n: number, spid: number, i: number) {
  const rot = +((((p.rot % 360) + 360) % 360).toFixed(2));
  // a mark in the page's middle (across, down or both) is centred there as Word centres its own watermark: LibreOffice
  // sizes a text watermark by its width alone and would grow it down from a top given in points
  const midX = Math.abs(p.cx - W / 2) < 0.01, midY = Math.abs(p.cy - H / 2) < 0.01;
  const style = [`position:absolute`, `margin-left:${midX ? '0' : pt(p.cx - p.w / 2)}`, `margin-top:${midY ? '0' : pt(p.cy - p.h / 2)}`, `width:${pt(p.w)}`, `height:${pt(p.h)}`,
    ...(rot ? [`rotation:${rot}`] : []), `z-index:${-251657216 + i}`, ...(midX ? ['mso-position-horizontal:center'] : []), 'mso-position-horizontal-relative:page',
    ...(midY ? ['mso-position-vertical:center'] : []), 'mso-position-vertical-relative:page'].join(';');
  const wrap = '<w10:wrap anchorx="page" anchory="page"/>';
  let shape: string;
  if (o.kind === 'logo') {
    shape = `<v:shape id="${prefix}${n}" o:spid="_x0000_s${spid}" type="#_x0000_t75" style="${style}" o:allowincell="f"><v:imagedata r:id="${rid}" o:title=""/>${wrap}</v:shape>`;
  } else {
    const shadow = o.shadow ? `<v:shadow on="t" color="black" opacity="${+(SHADOW.alpha * o.opacity).toFixed(3)}" offset="${pt(SHADOW.off * p.k)},${pt(SHADOW.off * p.k)}"/>` : '';
    shape = `<v:shape id="${prefix}${n}" o:spid="_x0000_s${spid}" type="#_x0000_t136" style="${style}" o:allowincell="f" fillcolor="${esc(o.color)}" stroked="f"><v:fill opacity="${+o.opacity.toFixed(3)}"/>${shadow}<v:textpath style="${esc(`font-family:"${wordFont}";font-size:1pt`)}" string="${esc(o.text)}"/>${wrap}</v:shape>`;
  }
  return `<w:r><w:rPr><w:noProof/></w:rPr><w:pict>${first ? (o.kind === 'logo' ? PICTURE_TYPE : TEXT_TYPE) : ''}${shape}</w:pict></w:r>`;
}
