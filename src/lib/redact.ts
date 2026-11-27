// PDF Redact (potentials #61): numbers, codes and words taken out of a PDF for good — not a box drawn over them. No DOM:
// the unit suite runs it in Node on the real MuPDF.
//  - find: each page's text with every character's box (MuPDF's structured text) → the Number Detective's scan
//    (devcore-ids.wasm `ids:scan`: Aadhaar, VID, PAN, GSTIN, cards, phones, e-mail, UPI, IFSC, account numbers, dates of
//    birth, the reader's words) → a hit per match, a box per line it covers;
//  - redact, in two passes of MuPDF's own redaction: (1) the text — a band through the middle of each hit's line, so a
//    character is removed only when it stands in that line (MuPDF removes every character whose box, taller than its ink,
//    touches a redaction: boxes of lines set solid overlap, and the line above went with the first try) — for a box drawn by
//    hand, a band through each run of the characters whose middle it covers (`boxRuns`); (2) the cover — the
//    hit's whole box: the pixels of any picture under it made black, vector drawings inside it removed, a black box drawn;
//  - hidden places: comments and form fields baked into the pages before the search (their text is then page text);
//    afterwards the document's information and XMP metadata, attachments, scripts, page thumbnails and the tag tree are
//    removed, and a bookmark that names a redacted value is renamed;
//  - check: the saved file opened again, its pages read and scanned once more — a redacted value still there is said.
import { mupdf } from './pdf';
import type { MDoc } from './pdfui';

export type Rect = [number, number, number, number];
/** A place to redact: what it is (a kind of the Number Detective, `words`, `qr`, `box` drawn by the reader, or text read by
 *  OCR in a picture), its value, the page (0-based) and a box for each line it covers, in MuPDF's page space. */
export interface Hit { id: string; page: number; kind: string; value: string; text: string; rects: Rect[]; source: 'text' | 'ocr' | 'qr' | 'box'; on: boolean }

/** The kinds the tab offers, with their names. */
export const KINDS: Array<[string, string]> = [
  ['aadhaar', 'Aadhaar and VID'], ['pan', 'PAN'], ['phone', 'Phone numbers'], ['email', 'E-mail addresses'], ['account', 'Bank account numbers'],
  ['card', 'Card numbers'], ['upi', 'UPI IDs'], ['ifsc', 'IFSC codes'], ['gstin', 'GSTIN'], ['dob', 'Dates of birth'],
];
export const KIND_NAME: Record<string, string> = {
  aadhaar: 'Aadhaar number', vid: 'Aadhaar VID', aadhaar_masked: 'Masked Aadhaar', pan: 'PAN', gstin: 'GSTIN', card: 'Card number', phone: 'Phone number',
  email: 'E-mail address', upi: 'UPI ID', ifsc: 'IFSC', account: 'Account number', dob: 'Date of birth', words: 'Your words', qr: 'QR code or barcode', box: 'Box you drew', ocr: 'Read in a picture',
};

export interface PageText { text: string; quads: Array<number[] | null>; line: Int32Array }
/** A page's text and, for each UTF-16 unit, the box of its character (null for the line and block breaks put in). */
export function pageText(page: any): PageText {
  let text = ''; const quads: Array<number[] | null> = []; const line: number[] = []; let ln = -1;
  const brk = () => { if (text && !text.endsWith('\n')) { text += '\n'; quads.push(null); line.push(-1); } };
  page.toStructuredText('preserve-whitespace,preserve-spans').walk({
    beginTextBlock: brk,
    beginLine: () => { brk(); ln++; },
    onChar: (c: string, _o: any, _f: any, _s: number, q: number[]) => { for (let i = 0; i < c.length; i++) { text += c[i]; quads.push(q); line.push(ln); } },
  });
  return { text, quads, line: Int32Array.from(line) };
}

/** The boxes of the characters s … e, one rectangle a line (their bounding box). */
export function rectsOf(pt: PageText, s: number, e: number): Rect[] {
  const by = new Map<number, Rect>();
  for (let i = s; i < e; i++) {
    const q = pt.quads[i]; if (!q) continue;
    const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
    const r: Rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const cur = by.get(pt.line[i]);
    by.set(pt.line[i], cur ? [Math.min(cur[0], r[0]), Math.min(cur[1], r[1]), Math.max(cur[2], r[2]), Math.max(cur[3], r[3])] : r);
  }
  return [...by.values()];
}

export type Scan = (text: string) => Array<{ s: number; e: number; kind: string; value: string }>;
let nid = 0;
/** Every hit on a page's text. */
export function findOnPage(page: any, index: number, scan: Scan): Hit[] {
  const pt = pageText(page);
  return scan(pt.text).map((f) => ({ id: `h${++nid}`, page: index, kind: f.kind, value: f.value, text: pt.text.slice(f.s, f.e).replace(/\s+/g, ' '), rects: rectsOf(pt, f.s, f.e), source: 'text' as const, on: true }))
    .filter((h) => h.rects.length);
}

/** What a page holds: its characters, the share of it pictures cover — a scanned page is pictures without text. */
export function pageKind(page: any): { chars: number; picture: number; scanned: boolean } {
  const [x0, y0, x1, y1] = page.getBounds(); const area = Math.max(1, (x1 - x0) * (y1 - y0));
  let chars = 0, pic = 0;
  page.toStructuredText('preserve-images').walk({
    onChar: (c: string) => { if (c.trim()) chars++; },
    onImageBlock: (b: number[]) => { pic += Math.max(0, Math.min(b[2], x1) - Math.max(b[0], x0)) * Math.max(0, Math.min(b[3], y1) - Math.max(b[1], y0)); },
  });
  const picture = Math.min(1, pic / area);
  return { chars, picture, scanned: chars < 20 && picture > 0.4 };
}

/** Comments and form fields made part of the pages (their text is then found and removed like the rest). */
export function bakeAll(doc: MDoc): { annots: number; widgets: number } {
  let annots = 0, widgets = 0;
  for (let i = 0; i < doc.countPages(); i++) { const p: any = doc.loadPage(i); annots += p.getAnnotations().length; widgets += p.getWidgets().length; }
  if (annots || widgets) doc.bake(true, true);
  return { annots, widgets };
}

/** A box drawn by hand, as the characters it covers: those whose middle third it reaches (a character's box runs from the
 *  font's ascent to its descent — on lines set solid it reaches into the lines next to it, and MuPDF removes every character
 *  whose box touches a redaction: the whole box drawn over one line took letters of the lines above and below, which then
 *  stood missing beside the black box). One rectangle a line of each run; their `band` is redacted. */
export function boxRuns(pt: PageText, r: Rect): Rect[] {
  const out: Rect[] = []; let s = -1;
  const flush = (e: number) => { if (s >= 0) out.push(...rectsOf(pt, s, e)); s = -1; };
  for (let i = 0; i < pt.quads.length; i++) {
    const q = pt.quads[i];
    if (!q) { flush(i); continue; }
    const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), third = (y1 - y0) / 3;
    if (x1 > r[0] && x0 < r[2] && y1 - third > r[1] && y0 + third < r[3]) { if (s < 0) s = i; } else flush(i);
  }
  flush(pt.quads.length);
  return out;
}

/** The band of a line box that only that line's characters reach: its middle third, a hair in from both ends. */
export function band(r: Rect): Rect {
  const h = r[3] - r[1], m = (r[1] + r[3]) / 2, inset = Math.min(h * 0.08, (r[2] - r[0]) / 4);
  return [r[0] + inset, m - h / 6, r[2] - inset, m + h / 6];
}

export interface Done { pages: number; hits: number; scrubbed: string[]; bookmarks: number }
/** Redacts the hits that are on, page by page (see the head of this file), and removes the hidden places. */
export async function redact(doc: MDoc, hits: Hit[], o: { scrub: boolean }): Promise<Done> {
  const m: any = await mupdf();
  const P = m.PDFPage;
  const on = hits.filter((h) => h.on && h.rects.length);
  const pages = [...new Set(on.map((h) => h.page))].sort((a, b) => a - b);
  for (const i of pages) {
    const page: any = doc.loadPage(i), mine = on.filter((h) => h.page === i);
    // (1) the text: a band through each line for text found in the page's text and for the characters a box drawn by hand
    //     covers; the whole box for text read in a picture (an invisible text layer under it goes too)
    let pt: PageText | null = null;
    for (const h of mine) for (const r of h.rects) {
      const rs = h.source === 'text' ? [band(r)] : h.source === 'box' ? boxRuns((pt ||= pageText(page)), r).map(band) : [r];
      for (const x of rs) { const a = page.createAnnotation('Redact'); a.setRect(x); }
    }
    page.applyRedactions(false, P.REDACT_IMAGE_NONE, P.REDACT_LINE_ART_NONE, P.REDACT_TEXT_REMOVE);
    // (2) the cover: pictures' pixels, vector drawings inside, a black box — the text around stays
    for (const h of mine) for (const r of h.rects) { const a = page.createAnnotation('Redact'); a.setRect(r); }
    page.applyRedactions(true, P.REDACT_IMAGE_PIXELS, P.REDACT_LINE_ART_REMOVE_IF_COVERED, P.REDACT_TEXT_NONE);
  }
  const scrubbed: string[] = []; let bookmarks = 0;
  if (o.scrub) {
    const root = doc.getTrailer().get('Root'), info = doc.getTrailer().get('Info');
    if (info.isDictionary()) { let n = 0; info.forEach(() => n++); if (n) scrubbed.push('the document’s information (title, author, subject …)'); doc.getTrailer().delete('Info'); }
    if (root.get('Metadata').isStream()) { root.delete('Metadata'); scrubbed.push('its XMP metadata'); }
    const names = root.get('Names');
    if (names.isDictionary()) {
      if (names.get('EmbeddedFiles').isDictionary()) { names.delete('EmbeddedFiles'); scrubbed.push('attached files'); }
      if (names.get('JavaScript').isDictionary()) { names.delete('JavaScript'); scrubbed.push('scripts'); }
    }
    if (root.get('OpenAction').isDictionary() && root.get('OpenAction').get('S').asName?.() === 'JavaScript') { root.delete('OpenAction'); if (!scrubbed.includes('scripts')) scrubbed.push('scripts'); }
    if (root.get('AA').isDictionary()) { root.delete('AA'); if (!scrubbed.includes('scripts')) scrubbed.push('scripts'); }
    if (root.get('StructTreeRoot').isDictionary()) { root.delete('StructTreeRoot'); root.delete('MarkInfo'); scrubbed.push('the tags for screen readers (they can hold the text)'); }
    let thumbs = 0, pieces = 0;
    for (let i = 0; i < doc.countPages(); i++) {
      const o2 = doc.loadPage(i).getObject();
      if (!o2.get('Thumb').isNull()) { o2.delete('Thumb'); thumbs++; }
      if (!o2.get('PieceInfo').isNull() || o2.get('Metadata').isStream()) { o2.delete('PieceInfo'); o2.delete('Metadata'); pieces++; }
    }
    if (thumbs) scrubbed.push('page thumbnails (pictures of the pages as they were)');
    if (pieces) scrubbed.push('editors’ private page data');
  }
  // a bookmark that names a redacted value is renamed (always: it would show the value in every reader's side panel)
  const values = new Set(on.filter((h) => h.source !== 'box').map((h) => norm(h.value)).filter((v) => v.length >= 4));
  const walk = (it: any, depth: number) => {
    for (let n = 0; it && it.isDictionary() && n < 10000; n++) {
      const t = it.get('Title');
      if (t.isString() && [...values].some((v) => norm(t.asString()).includes(v))) { it.put('Title', doc.newString('(redacted)')); bookmarks++; }
      if (depth < 32) walk(it.get('First'), depth + 1);
      it = it.get('Next');
    }
  };
  const outl = doc.getTrailer().get('Root').get('Outlines');
  if (outl.isDictionary()) walk(outl.get('First'), 0);
  return { pages: pages.length, hits: on.length, scrubbed, bookmarks };
}
/** A value for comparing: letters and digits only, lower case (2341 2341 2346 = 234123412346). */
export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}@.]/gu, '');

/** The file as written: in full (no incremental update keeps the old pages), unreferenced objects dropped. */
export const saveRedacted = (doc: MDoc) => doc.saveToBuffer('compress,garbage=deduplicate,encrypt=none').asUint8Array().slice();

/** The saved file read again: each redacted value still found in a page's text, in the metadata, a bookmark, a comment. */
export async function check(bytes: Uint8Array, hits: Hit[], scan: Scan): Promise<Array<{ value: string; where: string }>> {
  const m: any = await mupdf();
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF();
  const values = new Map<string, string>();
  for (const h of hits) if (h.on && h.source !== 'box' && h.source !== 'qr') values.set(norm(h.value), h.text);
  const left: Array<{ value: string; where: string }> = [];
  const seen = new Set<string>();
  const say = (v: string, where: string) => { const k = v + where; if (!seen.has(k)) { seen.add(k); left.push({ value: values.get(v) || v, where }); } };
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i), pt = pageText(page), flat = norm(pt.text);
    for (const v of values.keys()) if (flat.includes(v)) say(v, `page ${i + 1}`);
    for (const f of scan(pt.text)) if (values.has(norm(f.value))) say(norm(f.value), `page ${i + 1}`);
    for (const a of page.getAnnotations()) { const c = norm(a.getContents?.() || ''); for (const v of values.keys()) if (c.includes(v)) say(v, `a comment on page ${i + 1}`); }
  }
  const info = doc.getTrailer().get('Info');
  if (info.isDictionary()) info.forEach((val: any, key: any) => { if (val.isString()) { const s = norm(val.asString()); for (const v of values.keys()) if (s.includes(v)) say(v, `the document’s ${String(key)}`); } });
  const xmp = doc.getTrailer().get('Root').get('Metadata');
  if (xmp.isStream()) { const s = norm(new TextDecoder().decode(xmp.readStream().asUint8Array())); for (const v of values.keys()) if (s.includes(v)) say(v, 'the XMP metadata'); }
  const walk = (it: any, depth: number) => { for (let n = 0; it && it.isDictionary() && n < 10000; n++) { const t = it.get('Title'); if (t.isString()) { const s = norm(t.asString()); for (const v of values.keys()) if (s.includes(v)) say(v, 'a bookmark'); } if (depth < 32) walk(it.get('First'), depth + 1); it = it.get('Next'); } };
  const outl = doc.getTrailer().get('Root').get('Outlines');
  if (outl.isDictionary()) walk(outl.get('First'), 0);
  return left;
}
