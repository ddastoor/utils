// Helpers for the document-generator suites: read a generated PDF in Node — its text, fonts, images (JPEG ones counted
// apart), links, and (with zbarimg, `apt install zbar-tools`) the QR code drawn on its first page.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from './child.mjs';
export async function pdfDoc(path) {
  const m = await import('mupdf');
  const buf = readFileSync(path), d = m.Document.openDocument(buf, 'application/pdf').asPDF();
  const pages = [], fonts = new Set(), links = []; let images = 0, jpegs = 0;
  for (let i = 0; i < d.countPages(); i++) {
    const p = d.loadPage(i), [x0, y0, x1, y1] = p.getBounds();
    pages.push({ w: Math.round(x1 - x0), h: Math.round(y1 - y0), text: p.toStructuredText('').asText() });
    for (const l of p.getLinks()) links.push(l.getURI());
  }
  for (let k = 1; k < d.countObjects(); k++) {
    const o = d.newIndirect(k), r = o.resolve();
    if (o.isStream() && o.get('Subtype').toString() === '/Image') { images++; if (/DCTDecode/.test(String(o.get('Filter')))) jpegs++; }
    if (r.isDictionary() && r.get('Type').toString() === '/Font') fonts.add(String(r.get('BaseFont')));
  }
  return { pages, text: pages.map((p) => p.text).join('\n'), fonts: [...fonts], images, jpegs, links, bytes: buf.length, title: d.getMetaData('info:Title') };
}
/** The text of the QR code on the first page (MuPDF draws it at 3×, zbarimg reads it); null without zbarimg. */
export async function pdfQr(path) {
  const m = await import('mupdf'), d = m.Document.openDocument(readFileSync(path), 'application/pdf');
  const png = `${path}.qr.png`; writeFileSync(png, d.loadPage(0).toPixmap(m.Matrix.scale(3, 3), m.ColorSpace.DeviceRGB, false, true).asPNG());
  const r = spawnSync('zbarimg', ['--raw', '-q', png], { encoding: 'utf8' });
  return r.error ? null : r.stdout.trim();
}
