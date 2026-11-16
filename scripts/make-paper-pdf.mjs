// Test fixture for PDF → EPUB: tests/fixtures/pdf/two-column-paper.pdf — a 2-page "journal article" with a full-width
// title and abstract, a two-column body (a figure with caption in the left column, a word hyphenated at a line end),
// a running header and page numbers. Original text (CC0); figure = scikit-image's chelsea.png (CC0). Made with MuPDF.
//   node scripts/make-paper-pdf.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const m = await import('mupdf');
const P = (t) => `<p>${t}</p>`;
const lorem = (k) => ['Columns make long technical papers easier to print but harder to read on small screens.', 'An e-reader needs the text in reading order: first the left column from top to bottom, then the right one.',
  'Figures belong next to the paragraph that cites them, with their captions.', 'Page numbers and running headers repeat on every page and should not interrupt the text.',
  'Headings are set in a larger type than the body, which is how a converter can find them.'][k % 5];
const left1 = [P('<b>1 Introduction</b>'), P(`${lorem(0)} ${lorem(1)} We measured the effect in a small experi-<br/>ment with twelve readers. ${lorem(2)}`),
  '<div class="fig"><img src="cat.png"/><div class="cap">Figure 1: A cat reading a two-column paper.</div></div>', P(`${lorem(3)} ${lorem(4)} ${lorem(0)}`)].join('');
const right1 = [P(`${lorem(1)} ${lorem(2)} ${lorem(3)} ${lorem(4)}`), P('<b>2 Method</b>'), P(`${lorem(4)} ${lorem(0)} ${lorem(1)} ${lorem(2)} ${lorem(3)}`), P(`${lorem(2)} ${lorem(4)} ${lorem(1)}`)].join('');
const left2 = [P('<b>3 Results</b>'), P(`${lorem(3)} ${lorem(0)} ${lorem(2)} ${lorem(1)} ${lorem(4)} ${lorem(3)}`), P(`${lorem(1)} ${lorem(2)} ${lorem(0)} ${lorem(4)}`)].join('');
const right2 = [P('<b>4 Conclusion</b>'), P(`${lorem(4)} ${lorem(2)} ${lorem(1)} ${lorem(3)} The converter keeps both columns in order.`), P(`${lorem(0)} ${lorem(3)}`)].join('');
const cols = (a, b) => `<table class="cols"><tr><td>${a}</td><td class="gap"></td><td>${b}</td></tr></table>`;
const body = [`<h1>Reading Order in Two-Column Documents</h1><div class="auth">A. Researcher and B. Scientist</div><div class="abs"><b>Abstract.</b> ${lorem(0)} ${lorem(1)} ${lorem(4)}</div>${cols(left1, right1)}`, cols(left2, right2)];
const css = `body { font-family: serif; font-size: 9.5pt; margin: 0 } h1 { font-size: 17pt; text-align: center; margin: 0 0 4pt } .auth { text-align: center; font-style: italic; margin-bottom: 10pt }
.abs { margin: 0 30pt 14pt; font-size: 9pt } table.cols { width: 100%; border-collapse: collapse } td { vertical-align: top; width: 48% } td.gap { width: 4% }
p { margin: 0 0 6pt; text-align: justify } .fig { text-align: center; margin: 6pt 0 } .fig img { width: 92% } .cap { font-size: 8pt; margin-top: 3pt }`;
const xhtml = (b) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><link rel="stylesheet" href="s.css"/></head><body>${b}</body></html>`;
const files = { mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="O/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  'O/c.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>x</dc:title><dc:language>en</dc:language></metadata><manifest>${body.map((_, i) => `<item id="d${i}" href="d${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${body.map((_, i) => `<itemref idref="d${i}"/>`).join('')}</spine></package>`),
  'O/s.css': strToU8(css), 'O/cat.png': readFileSync(join(root, 'tests/fixtures/images/chelsea.png')) };
body.forEach((b, i) => (files[`O/d${i}.xhtml`] = strToU8(xhtml(b))));
const doc = m.Document.openDocument(zipSync(files), 'application/epub+zip');
const W = 595, H = 842, mg = 54;
doc.layout(W - 2 * mg, H - 2 * mg - 20, 9.5);
const buf = new m.Buffer(), w = new m.DocumentWriter(buf, 'pdf', 'compress');
for (let i = 0; i < doc.countPages(); i++) { const dev = w.beginPage([0, 0, W, H]); doc.loadPage(i).run(dev, m.Matrix.translate(mg, mg + 14)); w.endPage(); }
w.close();
// running header + page number as real text
const pdf = m.Document.openDocument(buf.asUint8Array().slice(), 'application/pdf').asPDF();
const font = pdf.addSimpleFont(new m.Font('Times-Italic'));
for (let i = 0; i < pdf.countPages(); i++) {
  const page = pdf.loadPage(i).getObject(), res = page.get('Resources'), fonts = res.get('Font').isDictionary() ? res.get('Font') : (res.put('Font', pdf.newDictionary()), res.get('Font'));
  fonts.put('RH', font);
  const ops = `q BT /RH 8 Tf 0.3 g ${mg} ${H - 34} Td (Journal of Synthetic Testing \\267 Vol. 3 \\267 2026) Tj ET BT /RH 9 Tf 0 g ${W / 2 - 3} 30 Td (${i + 1}) Tj ET Q`;
  // wrap the page's own content in q … Q: it leaves a transform active that would move our text
  const cur = page.get('Contents'), arr = pdf.newArray(); arr.push(pdf.addStream('q\n', {}));
  if (cur.isArray()) cur.forEach((v) => arr.push(v)); else arr.push(cur);
  arr.push(pdf.addStream('\nQ\n' + ops, {})); page.put('Contents', arr);
}
const out = pdf.saveToBuffer('compress,garbage').asUint8Array();
writeFileSync(join(root, 'tests/fixtures/pdf/two-column-paper.pdf'), out);
console.log(`two-column-paper.pdf: ${pdf.countPages()} pages, ${out.length} bytes`);
