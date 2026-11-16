// PDF → EPUB (#/epub, PC): a two-column paper (made by scripts/make-paper-pdf.mjs) and real scanned book pages with an
// OCR layer (pypdf's Vicksburg sample). The EPUB is unpacked in Node: structure, reading order, column labels, running
// headers removed, de-hyphenation, figures, page breaks; every XHTML parses as XML; MuPDF can open the result.
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
const jpegInfo = (b) => { for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) return null; const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3]; if (m >= 0xc0 && m <= 0xc2) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] }; i += 2 + len; } return null; };
export default async ({ base, page: newPage, ok, info, download, tmp, devices }) => {
  const page = await newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(base + '#/epub');
  const make = async () => {
    await page.getByRole('button', { name: 'Make EPUB' }).click();
    await page.getByRole('button', { name: 'Download .epub' }).waitFor({ timeout: 120000 });
    const f = await download(page, () => page.getByRole('button', { name: 'Download .epub' }).click());
    const buf = readFileSync(f), z = unzipSync(new Uint8Array(buf));
    const text = (k) => strFromU8(z[k]);
    const pages = Object.keys(z).filter((k) => /^OEBPS\/p\d+\.xhtml$/.test(k)).sort();
    const body = (k) => text(k).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    return { f, buf, z, text, pages, body };
  };
  const load = async (f) => { await page.locator('input[type=file]').first().setInputFiles(f); await page.waitForFunction(() => /\d+ pages?$/.test([...document.querySelectorAll('.muted.small')].map((e) => e.textContent).join('|').split('|').find((t) => / page/.test(t)) || '')); };
  await load(P('two-column-paper.pdf'));
  ok(await page.getByLabel('Title').inputValue() === 'two-column-paper', 'title defaults to the file name');
  let e = await make();
  // package structure
  ok(e.buf.subarray(30, 38).toString() === 'mimetype' && e.buf.readUInt16LE(8) === 0 && e.buf.subarray(38, 58).toString() === 'application/epub+zip', 'mimetype is the first entry, stored uncompressed');
  ok(/full-path="OEBPS\/content\.opf"/.test(e.text('META-INF/container.xml')), 'container points to the package');
  const opf = e.text('OEBPS/content.opf');
  ok(/version="3\.0"/.test(opf) && /properties="nav"/.test(opf) && /toc\.ncx/.test(opf) && (opf.match(/<itemref /g) || []).length === 2, 'EPUB 3 package: nav, NCX, one spine item per PDF page');
  ok(/dcterms:modified/.test(opf) && /urn:uuid:/.test(opf), 'modified date and unique identifier');
  const bad = await page.evaluate((docs) => docs.filter((d) => new DOMParser().parseFromString(d, 'application/xhtml+xml').querySelector('parsererror')).length, [...e.pages, 'OEBPS/nav.xhtml'].map((k) => e.text(k)));
  ok(bad === 0, 'every XHTML file is well-formed XML');
  // page 1: title, columns in order, figure, caption, labels, de-hyphenation, no running header
  const p1 = e.body(e.pages[0]), x1 = e.text(e.pages[0]);
  const at = (s) => p1.indexOf(s);
  ok(/<h2>Reading Order in Two-Column Documents<\/h2>/.test(x1), 'title becomes a heading');
  ok(at('Page 1 · Column 1') > 0 && at('Page 1 · Column 2') > at('Page 1 · Column 1'), 'columns labelled “Page 1 · Column 1/2”');
  ok(at('1 Introduction') < at('Figure 1') && at('Figure 1') < at('Column 2') && at('Column 2') < at('2 Method'), 'reading order: left column (with its figure) before the right column');
  ok(/<h3>1 Introduction<\/h3>/.test(x1) && /<h3>2 Method<\/h3>/.test(x1), 'section headings found');
  ok(/experiment with twelve readers/.test(p1) && /e-reader/.test(p1), 'line-end hyphen removed (experi-ment), real hyphen kept (e-reader)');
  ok(!/Journal of Synthetic Testing/.test(p1) && !/ 1 $/.test(p1.trim()), 'running header and page number removed');
  ok(/<p>A\. Researcher and B\. Scientist<\/p>/.test(x1) && /<p>Figure 1: A cat reading a two-column paper\.<\/p>/.test(x1), 'author line and caption are their own paragraphs');
  const img = /src="(images\/[^"]+)"/.exec(x1)?.[1], ji = jpegInfo(e.z[`OEBPS/${img}`]);
  ok(img && ji && ji.w > 400 && ji.w <= 1236 && ji.comps === 1, `figure saved as a greyscale JPEG ≤ 1236 px (${JSON.stringify(ji)})`);
  ok(/3 Results[\s\S]*4 Conclusion/.test(e.body(e.pages[1])), 'page 2 in order');
  ok(/page-break-before: always/.test(e.text('OEBPS/style.css')), 'each PDF page starts a new page');
  // MuPDF can read our EPUB
  const m = await import('mupdf'), d = m.Document.openDocument(e.buf, 'application/epub+zip'); d.layout(400, 600, 11);
  let all = ''; for (let i = 0; i < d.countPages(); i++) all += d.loadPage(i).toStructuredText('').asText();
  ok(d.countPages() >= 2 && /1 Introduction/.test(all) && /4 Conclusion/.test(all), `MuPDF opens the EPUB (${d.countPages()} pages)`);
  // columns as pictures, Scribe width, colour
  await page.getByRole('radio', { name: 'Columns as pictures' }).click();
  await page.getByRole('radio', { name: 'Scribe (1860 px)' }).click();
  await page.getByText('Greyscale pictures').click();
  e = await make();
  const c1 = e.text(e.pages[0]), imgs = [...c1.matchAll(/src="(images\/[^"]+)"/g)].map((x) => jpegInfo(e.z[`OEBPS/${x[1]}`]));
  ok(imgs.length >= 3 && !/<p>(?!.*pgno)[^<]*Introduction/.test(c1), `columns as pictures (${imgs.length} images, no text)`);
  ok(imgs.some((i) => i.w > 800) && imgs.every((i) => i.w <= 1860 && i.comps === 3), 'Scribe width, colour JPEGs');
  // page range
  await page.getByRole('radio', { name: 'Reflow text (recommended)' }).click();
  await page.getByPlaceholder('All pages (or e.g. 1-20)').fill('2');
  e = await make();
  ok(e.pages.length === 1 && /3 Results/.test(e.body(e.pages[0])), 'page range: only page 2');
  await page.getByPlaceholder('All pages (or e.g. 1-20)').fill('');
  // scanned book pages with an OCR text layer
  await load(P('vicksburg-ocr.pdf'));
  e = await make();
  const v = e.pages.map((k) => e.body(k)).join(' ');
  info(`vicksburg: ${e.pages.length} pages, ${v.length} chars`);
  ok(e.pages.length === 6, 'six pages');
  ok(!/SIEGE\s+OF\s+VICKSBU/i.test(v), 'running header (incl. OCR misspellings) removed');
  ok(/dangerous for use/.test(v) && /improve our quarters/.test(v), 'OCR text de-hyphenated (dan-gerous, im-prove)');
  // a scan without any text layer → the page as a picture
  const doc = new m.PDFDocument(), im = doc.addImage(new m.Image(readFileSync(new URL('../fixtures/images/page.png', import.meta.url).pathname)));
  doc.insertPage(-1, doc.addPage([0, 0, 400, 500], 0, doc.addObject({ XObject: { I: im } }), 'q 400 0 0 500 0 0 cm /I Do Q'));
  const scan = `${tmp}/scan.pdf`; writeFileSync(scan, doc.saveToBuffer('compress').asUint8Array());
  await load(scan);
  e = await make();
  ok(/class="fig full"/.test(e.text(e.pages[0])) && !/<p>(?!.*pgno)/.test(e.text(e.pages[0]).replace(/<p class="pgno">[^<]*<\/p>/, '')), 'page without text → full-page picture');
  ok(await page.getByText('image (no text layer)').count() === 1, 'page report says why (no text layer)');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/epub');
  ok(await phone.getByText('available on desktop browsers only').count() === 1, 'phone: PC-only notice');
};
