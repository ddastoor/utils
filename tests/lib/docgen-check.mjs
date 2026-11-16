// Helpers for the document-generator suites: read a generated PDF in Node.
import { readFileSync } from 'node:fs';
export async function pdfDoc(path) {
  const m = await import('mupdf');
  const buf = readFileSync(path), d = m.Document.openDocument(buf, 'application/pdf').asPDF();
  const pages = [], fonts = new Set(); let images = 0;
  for (let i = 0; i < d.countPages(); i++) { const p = d.loadPage(i), [x0, y0, x1, y1] = p.getBounds(); pages.push({ w: Math.round(x1 - x0), h: Math.round(y1 - y0), text: p.toStructuredText('').asText() }); }
  for (let k = 1; k < d.countObjects(); k++) {
    const o = d.newIndirect(k), r = o.resolve();
    if (o.isStream() && o.get('Subtype').toString() === '/Image') images++;
    if (r.isDictionary() && r.get('Type').toString() === '/Font') fonts.add(String(r.get('BaseFont')));
  }
  return { pages, text: pages.map((p) => p.text).join('\n'), fonts: [...fonts], images, bytes: buf.length, title: d.getMetaData('info:Title') };
}
