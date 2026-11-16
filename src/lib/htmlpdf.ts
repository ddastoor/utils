// HTML + CSS → PDF with MuPDF's own layout engine (C → wasm, HarfBuzz shaping): the page is wrapped in an in-memory
// EPUB together with self-hosted Noto Sans TTFs (Latin, Greek, Cyrillic, Devanagari, ₹) and images, laid out at the page size, written
// as PDF pages, then fonts are subset. Used by GST Invoice, Rent Receipt and Resume Builder.
import { zipSync, strToU8 } from 'fflate';
import { mupdf, savePdf, stampPage, textWidth, pdfString } from './pdf';
import { onLeave } from '../lifecycle';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const PAGE: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

const FONT_FILES = { r: 'NotoSans_400Regular', b: 'NotoSans_700Bold', i: 'NotoSans_400Regular_Italic' } as const;
const fontCache = new Map<string, Promise<Uint8Array>>();
const font = (k: keyof typeof FONT_FILES) => {
  let p = fontCache.get(k);
  if (!p) { onLeave('doc-fonts', () => fontCache.clear()); p = fetch(new URL(`vendor/fonts/${FONT_FILES[k]}.ttf`, document.baseURI).href).then((r) => { if (!r.ok) throw new Error('Could not load the document fonts.'); return r.arrayBuffer(); }).then((b) => new Uint8Array(b)); fontCache.set(k, p); p.catch(() => fontCache.delete(k)); }
  return p;
};

export interface HtmlPdfOptions { size?: keyof typeof PAGE; margin?: number; title?: string; pageNumbers?: boolean; files?: Record<string, Uint8Array> }

/** Lay out `body` (XHTML fragment) with `css`. Images referenced as img/<name> come from `files`. An array of
 *  bodies starts each part on a new page (each is its own EPUB chapter: MuPDF ignores CSS page breaks). */
export async function htmlToPdf(bodyIn: string | string[], css: string, o: HtmlPdfOptions = {}): Promise<Uint8Array> {
  const parts = Array.isArray(bodyIn) ? bodyIn : [bodyIn], body = parts.join('');
  const m = await mupdf();
  const [W, H] = PAGE[o.size || 'a4'], mg = o.margin ?? 36;
  const italic = /<(em|i)\b|font-style:\s*italic/.test(body + css);
  const keys: Array<keyof typeof FONT_FILES> = ['r', 'b', ...(italic ? ['i' as const] : [])];
  const fonts = Object.fromEntries(await Promise.all(keys.map(async (k) => [`OEBPS/fonts/${k}.ttf`, await font(k)])));
  const faces = `@font-face { font-family: Doc; src: url(fonts/r.ttf); } @font-face { font-family: Doc; font-weight: bold; src: url(fonts/b.ttf); }
${italic ? '@font-face { font-family: Doc; font-style: italic; src: url(fonts/i.ttf); }' : ''}
html, body { margin: 0; padding: 0; } body { font-family: Doc; }\n`;
  const xhtml = (b: string) => `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(o.title || 'Document')}</title><link rel="stylesheet" href="s.css"/></head><body>${b}</body></html>`;
  const files: Record<string, any> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/c.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">doc</dc:identifier><dc:title>doc</dc:title><dc:language>en</dc:language></metadata><manifest>${parts.map((_, i) => `<item id="d${i}" href="d${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${parts.map((_, i) => `<itemref idref="d${i}"/>`).join('')}</spine></package>`),
    'OEBPS/s.css': strToU8(faces + css), ...fonts,
  };
  parts.forEach((b, i) => (files[`OEBPS/d${i}.xhtml`] = strToU8(xhtml(b))));
  for (const [k, v] of Object.entries(o.files || {})) files[`OEBPS/img/${k}`] = [v, { level: 0 }];
  const doc = m.Document.openDocument(zipSync(files), 'application/epub+zip');
  doc.layout(W - 2 * mg, H - 2 * mg, 10);
  const buf = new m.Buffer(), w = new m.DocumentWriter(buf, 'pdf', 'compress');
  for (let i = 0; i < doc.countPages(); i++) { const dev = w.beginPage([0, 0, W, H]); doc.loadPage(i).run(dev, m.Matrix.translate(mg, mg)); w.endPage(); }
  w.close();
  // subset the embedded fonts, add page numbers and the title
  const pdf = m.Document.openDocument(buf.asUint8Array().slice(), 'application/pdf').asPDF()!;
  const n = pdf.countPages();
  if (o.pageNumbers && n > 1) for (let i = 0; i < n; i++) {
    const t = `Page ${i + 1} of ${n}`, tw = await textWidth(t, 8);
    await stampPage(pdf, i, (PW) => `BT /STF 8 Tf 0.45 g ${((PW - tw) / 2).toFixed(2)} ${(mg / 2 - 3).toFixed(2)} Td ${pdfString(t)} Tj ET`, { font: true });
  }
  if (o.title) try { (pdf as any).setMetaData('info:Title', o.title); } catch { /* optional */ }
  try { pdf.subsetFonts(); } catch { /* keep full fonts */ }
  return savePdf(pdf);
}

/** Render pages of a PDF to canvases (for previews). */
export async function pdfPreview(bytes: Uint8Array, width: number, max = 4): Promise<HTMLCanvasElement[]> {
  const m = await mupdf(), doc = m.Document.openDocument(bytes, 'application/pdf'), out: HTMLCanvasElement[] = [];
  for (let i = 0; i < Math.min(max, doc.countPages()); i++) {
    const p = doc.loadPage(i), b = p.getBounds(), s = width / (b[2] - b[0]);
    const pix = p.toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceRGB, true, true);
    const c = document.createElement('canvas'); c.width = pix.getWidth(); c.height = pix.getHeight();
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pix.getPixels()), c.width, c.height), 0, 0);
    out.push(c);
  }
  return out;
}
