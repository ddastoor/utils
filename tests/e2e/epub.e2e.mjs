// PDF → EPUB (#/epub, PC): a two-column paper (made by scripts/make-paper-pdf.mjs) and real scanned book pages with an
// OCR layer (pypdf's Vicksburg sample). The EPUB is unpacked in Node: structure, reading order, the parts of a page that
// stand side by side laid out one after another under "Page N, part K" (owner, 21 Nov 2026), running headers removed,
// de-hyphenation, figures, page breaks, scans kept as their pictures (owner: no OCR of any sort); every XHTML parses as
// XML; MuPDF can open the result.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
// the W3C's epubcheck (Java) — the reference validator — where installed: EPUBCHECK=/path/epubcheck.jar, or a release
// unpacked under /opt/epubcheck* (https://github.com/w3c/epubcheck/releases)
const epubcheckJar = process.env.EPUBCHECK || ['/opt/epubcheck', '/opt/epubcheck-dl'].flatMap((d) => (existsSync(d) ? readdirSync(d).map((x) => `${d}/${x}/epubcheck.jar`).concat(`${d}/epubcheck.jar`) : [])).find((x) => existsSync(x));
const epubcheck = (f) => {
  const report = `${f}.check.json`;
  try { execFileSync('java', ['-jar', epubcheckJar, f, '--json', report], { stdio: 'ignore' }); } catch { /* exit code 1 when it found errors */ }
  const j = JSON.parse(readFileSync(report, 'utf8')), say = (x) => `${x.ID} ${x.message}${x.locations?.[0] ? ` (${x.locations[0].path}:${x.locations[0].line})` : ''}`;
  const of = (...sev) => (j.messages || []).filter((x) => sev.includes(x.severity)).map(say);
  return { errors: of('ERROR', 'FATAL'), warnings: of('WARNING'), version: j.checker?.checkerVersion };
};
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
const jpegInfo = (b) => { for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) return null; const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3]; if (m >= 0xc0 && m <= 0xc2) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] }; i += 2 + len; } return null; };
// a JPEG's or a PNG's size and colour components (PNG colour type 0 grey, 2 RGB, 4 grey + alpha, 6 RGBA)
const imgInfo = (b) => (b[0] === 0x89 && b[1] === 0x50 ? { png: true, w: Buffer.from(b).readUInt32BE(16), h: Buffer.from(b).readUInt32BE(20), comps: ({ 0: 1, 2: 3, 4: 2, 6: 4, 3: 3 })[b[25]] } : jpegInfo(b));
export default async ({ base, page: newPage, ok, info, download, tmp, devices, released }) => {
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
    if (epubcheckJar) {
      const r = epubcheck(f); checked++;
      ok(r.errors.length === 0 && r.warnings.length === 0, `epubcheck ${r.version}: ${f.split('/').pop()} has no errors and no warnings${r.errors.length + r.warnings.length ? ` — ${[...r.errors, ...r.warnings].slice(0, 6).join(' | ')}` : ''}`);
    }
    return { f, buf, z, text, pages, body };
  };
  let checked = 0;
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
  ok(at('Page 1, part 1') >= 0 && at('Page 1, part 1') < at('Reading Order') && at('Page 1, part 2') > at('Reading Order') && at('Page 1, part 3') > at('Page 1, part 2'), 'the parts laid out one after another, marked “Page 1, part 1 / 2 / 3” (the title block, the left column, the right column)');
  ok(!/Column \d/.test(p1), 'no words of the old “Column K” labels');
  ok(at('1 Introduction') < at('Figure 1') && at('Figure 1') < at('Page 1, part 3') && at('Page 1, part 3') < at('2 Method'), 'reading order: left column (with its figure) before the right column');
  ok(/<h3>1 Introduction<\/h3>/.test(x1) && /<h3>2 Method<\/h3>/.test(x1), 'section headings found');
  ok(/experiment with twelve readers/.test(p1) && /e-reader/.test(p1), 'line-end hyphen removed (experi-ment), real hyphen kept (e-reader)');
  ok(!/Journal of Synthetic Testing/.test(p1) && !/ 1 $/.test(p1.trim()), 'running header and page number removed');
  ok(/<p><i>A\. Researcher and B\. Scientist<\/i><\/p>/.test(x1) && /<p>Figure 1: A cat reading a two-column paper\.<\/p>/.test(x1), 'author line (set in italics) and caption are their own paragraphs');
  // the owner's strict rule (21 Nov 2026): a picture of the PDF is kept exactly — the figure is the paper's own 451 × 300
  // picture (lossless in the PDF: its own pixels as PNG), in colour although greyscale pictures are chosen
  const img = /src="(images\/[^"]+)"/.exec(x1)?.[1], ji = imgInfo(e.z[`OEBPS/${img}`]);
  ok(img && ji?.png && ji.w === 451 && ji.h === 300 && ji.comps === 3, `the figure is the PDF's own picture, its own 451 × 300 pixels (${img} ${JSON.stringify(ji)})`);
  ok(/alt="figure" style="width:\d+(\.\d)?%"/.test(x1), 'the figure is as wide on the screen as it is in its column');
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
  const c1 = e.text(e.pages[0]), imgs = [...c1.matchAll(/src="(images\/[^"]+)"/g)].map((x) => imgInfo(e.z[`OEBPS/${x[1]}`]));
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
  // owner, 21 Nov 2026: "maintain original images as images … Don't do OCR of any sort" — the OCR layer is not used
  ok(e.pages.every((k) => (e.text(k).match(/<img /g) || []).length === 1 && /alt="page"/.test(e.text(k))), 'each scanned page is kept as its picture');
  ok(!/vicksburg|dangerous|quarters|siege/i.test(v), 'no word of the OCR layer in the book');
  ok(await page.getByText('image (scanned page — kept as its picture)').count() === 6, 'the page report says why: a scanned page, kept as its picture');
  // a scan without any text layer → the page as a picture
  const doc = new m.PDFDocument(), im = doc.addImage(new m.Image(readFileSync(new URL('../fixtures/images/page.png', import.meta.url).pathname)));
  doc.insertPage(-1, doc.addPage([0, 0, 400, 500], 0, doc.addObject({ XObject: { I: im } }), 'q 400 0 0 500 0 0 cm /I Do Q'));
  const scan = `${tmp}/scan.pdf`; writeFileSync(scan, doc.saveToBuffer('compress').asUint8Array());
  await load(scan);
  e = await make();
  ok(/class="fig full"/.test(e.text(e.pages[0])) && !/<p>(?!.*pgno)/.test(e.text(e.pages[0]).replace(/<p class="pgno">[^<]*<\/p>/, '')), 'page without text → full-page picture');
  ok(await page.getByText('image (no text layer)').count() === 1, 'page report says why (no text layer)');
  ok(await page.getByText(/scan\.epub: [\d.]+ KB · 1 page · 0 laid out in parts · 0 figures · 0 tables · 0 equations · 1 as pictures/).count() === 1, 'the summary counts in words that agree with the numbers (1 page, 0 figures)');
  // the Federal Register (public domain): three columns with gutters of 7.5 pt and a stamp up the margin
  await load(P('federal-register-3p.pdf'));
  e = await make();
  const f2 = e.text(e.pages[1]);
  ok(/Page 2, part 1<\/h4>\s*<p>Hatta International Airport in Jakarta/.test(f2) && /Page 2, part 3<\/h4>/.test(f2) && !/jbell|<h3>Hatta/.test(f2), 'Federal Register: three columns read one after the other (parts 1 – 3), the stamp in the margin left out, the body text not taken for headings');
  ok(!/<div class="fig">/.test(f2.split('Page 2, part 1')[0]), 'the running header that is left out does not come back as a picture of it');
  // the PDF's bookmarks are the contents; a page list; the PDF's language
  const md = new m.PDFDocument(), F1 = md.addSimpleFont(new m.Font('Helvetica'));
  for (let k = 1; k <= 3; k++) md.insertPage(-1, md.addPage([0, 0, 612, 792], 0, md.addObject({ Font: { F1 } }), `BT /F1 12 Tf 72 700 Td (Kapitel ${k} beginnt hier mit etwas Text.) Tj 0 -16 Td (Und noch eine Zeile Text auf Seite ${k}.) Tj ET`));
  { const it = md.outlineIterator(), uri = (page) => md.formatLinkURI({ type: 'Fit', page }); it.insert({ title: 'Einleitung', uri: uri(0), open: true }); it.insert({ title: 'Teil 2 & Schluss', uri: uri(2), open: true }); }
  md.getTrailer().get('Root').put('Lang', md.newString('de'));
  // a broken Unicode map gives U+FFFF, which XML does not allow (the page could not be read)
  const cm = md.addStream('/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /X def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n1 beginbfchar\n<42> <FFFF>\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n', {});
  const F3 = md.addObject({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding', ToUnicode: cm });
  md.insertPage(-1, md.addPage([0, 0, 612, 792], 0, md.addObject({ Font: { F3 } }), 'BT /F3 12 Tf 72 700 Td (Ein ABC Test mit einer kaputten Zeichentabelle.) Tj 0 -16 Td (Noch eine Zeile, damit die Seite Text hat.) Tj ET'));
  const marked = `${tmp}/marked.pdf`; writeFileSync(marked, md.saveToBuffer('compress').asUint8Array());
  await load(marked);
  e = await make();
  const nav = e.text('OEBPS/nav.xhtml');
  ok(/<li><a href="p0001\.xhtml">Einleitung<\/a><\/li><li><a href="p0003\.xhtml">Teil 2 &amp; Schluss<\/a><\/li>/.test(nav) && /epub:type="page-list"/.test(nav), 'the PDF\'s bookmarks are the contents; a page list too');
  ok(/<dc:language>de<\/dc:language>/.test(e.text('OEBPS/content.opf')) && /lang="de"/.test(e.text(e.pages[0])), 'the PDF\'s language (/Lang de) is the EPUB\'s');
  const p4 = e.text(e.pages[3]);
  ok(!p4.includes('\uFFFF') && /Ein AC Test mit einer kaputten Zeichentabelle/.test(p4), 'U+FFFF from a broken Unicode map is left out, the rest of the line kept');
  ok(await page.evaluate((x) => !new DOMParser().parseFromString(x, 'application/xhtml+xml').querySelector('parsererror'), p4) && await page.locator('.epub-preview section').count() === 3, 'that page is XML, and the preview shows the first three pages');
  // a PDF without pages
  const empty = `${tmp}/empty.pdf`; writeFileSync(empty, new m.PDFDocument().saveToBuffer('').asUint8Array());
  await page.locator('input[type=file]').first().setInputFiles(empty);
  await page.getByText('empty.pdf has no pages.').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Make EPUB' }).click();
  ok(await page.locator('.toast', { hasText: 'This PDF has no pages.' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false) && await page.locator('.epub-preview').count() === 0, 'a PDF without pages: said, nothing made (and the last result is gone)');
  ok(page.errors.filter((x) => !/This PDF has no pages/.test(x)).length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // a long PDF: progress, the page stays responsive; a PDF chosen meanwhile ends the conversion; so does leaving
  const { makeLong } = await import('../lib/pdfannot.mjs'), long = await makeLong(tmp, 300);
  const q = await newPage();
  await q.addInitScript(() => { const c = URL.createObjectURL.bind(URL), r = URL.revokeObjectURL.bind(URL); window.__urls = new Set(); URL.createObjectURL = (b) => { const u = c(b); window.__urls.add(u); return u; }; URL.revokeObjectURL = (u) => { window.__urls.delete(u); r(u); }; });
  await q.goto(base + '#/epub');
  const qload = async (f, re) => { await q.locator('input[type=file]').first().setInputFiles(f); await q.getByText(re).waitFor({ timeout: 30000 }); };
  await qload(P('two-column-paper.pdf'), 'two-column-paper.pdf: 2 pages');
  await q.getByRole('button', { name: 'Make EPUB' }).click(); await q.getByRole('button', { name: 'Download .epub' }).waitFor({ timeout: 120000 });
  const firstUrls = await q.evaluate(() => [...window.__urls].length);
  await qload(long, 'long-300.pdf: 300 pages');
  ok(firstUrls >= 1 && await q.evaluate(() => [...window.__urls].length) === 0, `the preview's pictures are let go when another PDF is chosen (${firstUrls} → 0)`);
  await q.evaluate(() => { window.__gap = 0; let last = performance.now(); const beat = () => { const now = performance.now(); window.__gap = Math.max(window.__gap, now - last); last = now; window.__raf = requestAnimationFrame(beat); }; window.__raf = requestAnimationFrame(beat); });
  await q.getByRole('button', { name: 'Make EPUB' }).click();
  const reading = await q.getByText(/Reading the text: page \d+ of 300…/).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  await q.getByText(/Page [3-9] of 300…/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const gap = await q.evaluate(() => window.__gap);
  ok(reading, 'progress while it reads the text of the pages');
  // (reading the text of 300 pages held the page for 3.6 s before: it was one loop without a pause)
  info(`longest pause between two frames while it works: ${Math.round(gap)} ms`);
  ok(gap < 1000, `the page stays responsive while it works (longest pause between two frames: ${Math.round(gap)} ms)`);
  let qd = 0; q.on('download', () => qd++);
  await qload(P('crazyones.pdf'), 'crazyones.pdf: 1 page');
  await q.waitForTimeout(4000);
  ok(await q.getByRole('button', { name: 'Download .epub' }).count() === 0 && await q.locator('.progress:not([hidden])').count() === 0, 'a PDF chosen meanwhile ends the conversion: no result of the long one, no progress left');
  await q.getByRole('button', { name: 'Make EPUB' }).click(); await q.getByRole('button', { name: 'Download .epub' }).waitFor({ timeout: 60000 });
  ok(await q.getByText(/^crazyones\.epub: [\d.]+ KB · 1 page · /).count() === 1, 'the next conversion is of the new PDF (one page), under its name');
  await qload(long, 'long-300.pdf: 300 pages');
  await q.getByRole('button', { name: 'Make EPUB' }).click();
  await q.getByText(/Page \d+ of 300…/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await q.goto(base + '#/');
  await q.waitForTimeout(3000);
  const liveAfter = await q.evaluate(() => globalThis.__supertoolsLive?.());
  ok(qd === 0 && q.errors.length === 0 && await q.evaluate(() => [...window.__urls].length) === 0, `leaving the tab during a conversion: it ends quietly, the pictures are let go (${JSON.stringify(liveAfter)}; ${q.errors.join(' | ')})`);
  // leaving the tab lets go of what it made: its results' blob URLs (they kept the files in memory until the page reloaded)
  { const had = await page.evaluate((id) => [...window.__blobs.values()].filter((b) => b.at.startsWith(`#/${id}`) && !b.download && !/javascript/.test(b.type)).length, 'epub');
    const kept = await released(page, 'epub');
    ok(kept.length === 0, `leaving the tab: ${had} blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/epub');
  ok(await phone.getByText('available on desktop browsers only').count() === 1, 'phone: PC-only notice');
};
