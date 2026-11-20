// PDFs with things on their pages that page tools must keep (for the Merge, Split and Organize suites): six pages of
// vicksburg-ocr.pdf with a comment (page 1), a highlight and a web link (page 2), a link from page 3 to page 5 and an
// outline (Start → 1, Chapter → 5 › Section → 6); and form.pdf with its field filled in. `readBack` lists what a PDF
// holds, as MuPDF reads it.
import { readFileSync, writeFileSync } from 'node:fs';

const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;

export async function makeAnnotated(tmp) {
  const m = await import('mupdf');
  const open = (b) => m.Document.openDocument(b, 'application/pdf').asPDF();
  const a = open(readFileSync(P('vicksburg-ocr.pdf'))), uri = (page) => a.formatLinkURI({ type: 'Fit', page });
  { const c = a.loadPage(0).createAnnotation('Text'); c.setContents('note A'); c.setRect([50, 700, 70, 720]); c.update(); }
  { const p = a.loadPage(1), hl = p.createAnnotation('Highlight'); hl.setQuadPoints([[72, 700, 200, 700, 72, 690, 200, 690]]); hl.update(); p.createLink([72, 600, 300, 620], 'https://example.org/a'); }
  a.loadPage(2).createLink([72, 500, 300, 520], uri(4));
  { const it = a.outlineIterator(); it.insert({ title: 'Start', uri: uri(0), open: true }); it.insert({ title: 'Chapter', uri: uri(4), open: true }); it.prev(); it.down(); it.insert({ title: 'Section', uri: uri(5), open: true }); }
  const annotated = `${tmp}/annotated.pdf`;
  writeFileSync(annotated, a.saveToBuffer('compress').asUint8Array());
  const f = open(readFileSync(P('form.pdf'))), w = f.loadPage(0).getWidgets()[0];
  w.setTextValue('Alice'); w.update();
  const form = `${tmp}/filled-form.pdf`;
  writeFileSync(form, f.saveToBuffer('compress').asUint8Array());
  return { annotated, form };
}

/** Per page: comments (contents), web links, internal links (target page index), fields (name=value); the outline
 *  (title, page); how many fields the form lists. */
export async function readBack(path) {
  const m = await import('mupdf');
  const d = m.Document.openDocument(readFileSync(path), 'application/pdf').asPDF();
  const pages = [];
  for (let i = 0; i < d.countPages(); i++) {
    const p = d.loadPage(i);
    pages.push({
      notes: p.getAnnotations().map((x) => x.getContents()).filter(Boolean),
      kinds: p.getAnnotations().map((x) => x.getType()),
      web: p.getLinks().filter((l) => l.isExternal()).map((l) => l.getURI()),
      goto: p.getLinks().filter((l) => !l.isExternal()).map((l) => d.resolveLink(l)),
      fields: p.getWidgets().map((w) => `${w.getName()}=${w.getValue()}`),
    });
  }
  const flat = (items) => (items || []).flatMap((o) => [[o.title, o.page], ...flat(o.down)]);
  const af = d.getTrailer().get('Root').get('AcroForm');
  return { pages, outline: flat(d.loadOutline()), listed: af.isDictionary() && af.get('Fields').isArray() ? af.get('Fields').length : 0 };
}

/** crazyones.pdf with a signature field that holds a signature dictionary (as a signed PDF has; the bytes of the
 *  signature itself are a stand-in — only the structure is read), saved with `password` when given. */
export async function makeSigned(tmp, password) {
  const m = await import('mupdf');
  const d = m.Document.openDocument(readFileSync(P('crazyones.pdf')), 'application/pdf').asPDF();
  const page = d.findPage(0);
  const sigv = d.addObject({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached', ByteRange: [0, 100, 200, 300], Contents: d.newByteString(new Uint8Array(64)), M: '(D:20261120120000Z)' });
  const field = d.addObject({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: d.newString('Signature1'), F: 132, Rect: [50, 50, 250, 100], P: page, V: sigv });
  const annots = d.newArray(); annots.push(field); page.put('Annots', annots);
  const fields = d.newArray(); fields.push(field);
  d.getTrailer().get('Root').put('AcroForm', d.addObject({ Fields: fields, SigFlags: 3 }));
  const out = `${tmp}/signed${password ? '-locked' : ''}.pdf`;
  writeFileSync(out, d.saveToBuffer(password ? `encrypt=aes-256,user-password=${password},owner-password=${password}x` : 'compress').asUint8Array());
  return out;
}
