// PDF → EPUB engine (src/lib/pdf2epub.ts) in Node on its own engines (MuPDF, textcore.wasm, imgproc.wasm; the JPEG
// encoder is a stand-in that records what it was given). Reading order held to poppler's pdftotext
// (tests/fixtures/epub/reference.json — `python3 scripts/make-epub-reference.py`) on a two-column paper, three pages of
// the Federal Register (three columns, gutters of 7.5 pt, a stamp in the margin) and an OCR'd scan; generated PDFs for
// bold run-in headings, broken Unicode maps, unreadable formulas, bookmarks, the language, stamps, sideways and huge
// pages; the W3C's epubcheck on the EPUBs where it is installed (EPUBCHECK=/path/epubcheck.jar, or under /opt/epubcheck*).
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
const REF = JSON.parse(readFileSync(new URL('../fixtures/epub/reference.json', import.meta.url), 'utf8')).files;
const JPEG = readFileSync(new URL('../fixtures/images/coffee.jpg', import.meta.url));
const jar = process.env.EPUBCHECK || ['/opt/epubcheck', '/opt/epubcheck-dl'].flatMap((d) => (existsSync(d) ? readdirSync(d).map((x) => `${d}/${x}/epubcheck.jar`).concat(`${d}/epubcheck.jar`) : [])).find((x) => existsSync(x));
const java = (() => { try { execFileSync('java', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

// words of a text, and how many of `ours` come in the order of `ref` (longest common subsequence)
const words = (s) => s.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
const lcs = (a, b) => { let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) { for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); [prev, cur] = [cur, prev]; } return prev[b.length]; };
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const pdfStr = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);

export default async (t, { load, wasm }) => {
  const E = await load('/src/lib/pdf2epub.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const m = await import('mupdf');
  const tc = bindTextcore(await wasm('textcore')), ip = bindImgproc(await wasm('imgproc'));
  const drawn = [];
  const engines = { m, tc, ip, jpeg: async (img, grey) => { let dark = 0; for (let i = 0; i < img.data.length; i += 4) if (img.data[i] + img.data[i + 1] + img.data[i + 2] < 300) dark++; drawn.push({ w: img.width, h: img.height, grey, dark }); return new Uint8Array(JPEG); } };
  const open = (b) => m.Document.openDocument(b, 'application/pdf').asPDF();
  const base = { mode: 'reflow', width: 1236, grey: true, removeHeaders: true, labels: true };
  const tmp = mkdtempSync(join(tmpdir(), 'pdf2epub-'));
  let n = 0;
  const convert = async (doc, o = {}) => {
    drawn.length = 0;
    const r = await E.pdfToEpub(doc, { ...base, ...o }, undefined, engines), z = unzipSync(r.epub), text = (k) => strFromU8(z[k]);
    const opf = text('OEBPS/content.opf'), spine = [...opf.matchAll(/<itemref idref="pg(\d+)"\/>/g)].map((x) => `OEBPS/p${x[1].padStart(4, '0')}.xhtml`);
    const pages = spine.map(text), plain = (x) => unesc(x.replace(/<p class="pgno">[^<]*<\/p>|<h4 class="col">[^<]*<\/h4>|<title>[^<]*<\/title>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
    const f = join(tmp, `e${++n}.epub`); writeFileSync(f, r.epub);
    return { ...r, z, text, opf, pages, plain, f, drawn: [...drawn], nav: text('OEBPS/nav.xhtml'), ncx: text('OEBPS/toc.ncx') };
  };
  const check = (e, what) => {
    // every text file is XML that XML 1.0 allows; and epubcheck has nothing to say
    const bad = Object.entries(e.z).filter(([k, v]) => /\.(xhtml|opf|ncx|xml)$/.test(k) && /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u.test(strFromU8(v)));
    t.eq(bad.map(([k]) => k), [], `${what}: no character XML forbids`);
    if (!jar || !java) return;
    const rep = join(tmp, `check${n}.json`);
    try { execFileSync('java', ['-jar', jar, e.f, '--json', rep], { stdio: 'ignore' }); } catch { /* exit 1 when it found something */ }
    const msgs = (JSON.parse(readFileSync(rep, 'utf8')).messages || []).filter((x) => x.severity !== 'USAGE' && x.severity !== 'INFO');
    t.eq(msgs.map((x) => `${x.severity} ${x.ID} ${x.message} ${x.locations?.[0]?.path || ''}`), [], `${what}: epubcheck finds no error and no warning`);
  };
  const order = (e, ref) => { const a = words(e.pages.map(e.plain).join(' ')), b = words(ref.join(' ')); const l = lcs(a, b); return { inOrder: l / a.length, found: l / b.length, a: a.length, b: b.length }; };

  // ── reading order against poppler ───────────────────────────────────────────────────────────────────────────────
  // (poppler reads this one wrong — the top of the right column before the left one's heading — so it is held to the
  // order its generator wrote, scripts/make-paper-pdf.mjs)
  const paper = await convert(open(readFileSync(P('two-column-paper.pdf'))));
  const marks = ['Reading Order in Two-Column Documents', 'A. Researcher and B. Scientist', 'Abstract. Columns make', '1 Introduction', 'We measured the effect in a small experiment with twelve readers', 'Figure 1: A cat reading', 'Column 2', '2 Method', '3 Results', '4 Conclusion', 'The converter keeps both columns in order.'];
  const all = paper.pages.join('\n'), at = marks.map((k) => all.indexOf(k));
  t.ok(at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1])), `two-column paper: title, authors, abstract, the left column (heading, text, figure, caption), the right column, page 2 in order (${at})`);
  t.ok(/<h4 class="col">Page 1 · Column 1<\/h4>[\s\S]*1 Introduction[\s\S]*Column 2<\/h4>[\s\S]*2 Method/.test(paper.pages[0]), 'two-column paper: the left column, then the right one, labelled');
  t.eq(paper.report.map((r) => r.columns), [2, 2], 'two-column paper: two columns on each page');
  check(paper, 'two-column paper');
  const fr = await convert(open(readFileSync(P('federal-register-3p.pdf'))));
  const of = order(fr, REF['federal-register-3p.pdf']);
  t.ok(of.inOrder > 0.9 && of.found > 0.85, `Federal Register: ${(100 * of.inOrder).toFixed(1)} % of the words in poppler's order (it was 55 % while gutters had to be 8 pt), ${(100 * of.found).toFixed(1)} % found`);
  t.eq(fr.report.slice(1).map((r) => r.columns), [3, 3], 'Federal Register pages 2 and 3: three columns — the stamp in the margin is not one');
  t.ok(!/jbell|DSKJLSW7X2PROD/.test(fr.pages.join('')), 'the stamp running up the margin is removed with the running headers');
  t.ok(/<h4 class="col">Page 2 · Column 1<\/h4>\s*<p>Hatta International Airport in Jakarta, Indonesia, resulting in 189 fatalities\./.test(fr.pages[1]), 'page 2 starts with the top of its first column');
  t.ok(!/VerDate|Federal Register \/ Vol\. 85/.test(fr.pages.slice(1).join('')), 'the running header and the printer\'s slug at the foot are removed');
  check(fr, 'Federal Register');
  const frKeep = await convert(open(readFileSync(P('federal-register-3p.pdf'))), { removeHeaders: false, pages: [1] });
  t.ok(/<p class="margin">jbell on DSKJLSW7X2PROD with PROPOSALS<\/p>\s*<\/section>/.test(frKeep.pages[0]) && frKeep.report[0].columns === 3, 'with running headers kept: the stamp is a note at the end of the page, the columns are still three');
  const vb = await convert(open(readFileSync(P('vicksburg-ocr.pdf'))));
  const ov = order(vb, REF['vicksburg-ocr.pdf']);
  t.ok(ov.inOrder > 0.95 && ov.found > 0.85, `OCR'd scan: ${(100 * ov.inOrder).toFixed(1)} % in poppler's order, ${(100 * ov.found).toFixed(1)} % found`);

  // ── generated PDFs ──────────────────────────────────────────────────────────────────────────────────────────────
  // pages: { box, rotate, content, fonts }; F1 Helvetica, F2 Helvetica-Bold
  const mk = (pages, also) => {
    const d = new m.PDFDocument(), F1 = d.addSimpleFont(new m.Font('Helvetica')), F2 = d.addSimpleFont(new m.Font('Helvetica-Bold'));
    for (const p of pages) d.insertPage(-1, d.addPage(p.box || [0, 0, 612, 792], p.rotate || 0, d.addObject({ Font: { F1, F2, ...(p.fonts?.(d) || {}) } }), p.content));
    also?.(d);
    return open(d.saveToBuffer('compress').asUint8Array());
  };
  const para = (x, y, lines, font = 'F1', size = 11, lead = 14) => `BT /${font} ${size} Tf ${x} ${y} Td ${lines.map((l, i) => `${i ? `0 -${lead} Td ` : ''}(${pdfStr(l)}) Tj`).join(' ')} ET`;
  const filler = (k, w = 9) => Array.from({ length: k }, (_, i) => Array.from({ length: w }, (_, j) => `w${i}x${j}`).join(' '));

  // a bold run-in heading is part of its paragraph; a bold line of its own is a heading
  const runin = mk([{ content: [
    para(72, 720, ['Results'], 'F2', 13),
    para(72, 690, filler(4)),
    'BT /F2 11 Tf 72 620 Td (Theorem 1.) Tj /F1 11 Tf ( Let x be a real number such that) Tj ET',
    para(72, 606, ['x is greater than zero and the proof follows at once.']),
  ].join('\n') }]);
  const er = await convert(runin);
  t.ok(/<h3>Results<\/h3>/.test(er.pages[0]), 'a bold line of its own is a heading');
  t.ok(/<p>Theorem 1\. Let x be a real number such that x is greater than zero and the proof follows at once\.<\/p>/.test(er.pages[0]) && !/<h\d>Theorem/.test(er.pages[0]), 'a line that only starts with a bold word stays in its paragraph (MuPDF gives a line the font of its first character)');
  t.ok(!/Theorem 1\.Let/.test(er.pages[0]), 'the space between a bold and a regular span is kept');

  // a ToUnicode map that gives control characters, U+FFFF and C1 controls: the XHTML stays XML
  const cmap = (pairs) => `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${pairs.length} beginbfchar\n${pairs.map(([c, u]) => `<${c}> <${u}>`).join('\n')}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
  const fontWith = (pairs) => (d) => ({ F3: d.addObject({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding', ToUnicode: d.addStream(cmap(pairs), {}) }) });
  // (MuPDF gives U+FFFF as it is — it made the page unreadable XML; it replaces U+0001 and U+0085 by the letter)
  const ctl = mk([{ fonts: fontWith([['41', '0001'], ['42', 'FFFF'], ['43', '0085'], ['44', '000B']]), content: [para(72, 720, filler(3)), para(72, 660, ['Hello ABCD world, this line goes on for a while.'], 'F3')].join('\n') }]);
  t.ok(E.readPage(ctl.loadPage(0), 612, 792).lines.some((l) => l.text.includes('\uFFFF')), 'MuPDF gives the U+FFFF of the broken map');
  const ec = await convert(ctl);
  t.ok(/Hello AC\s+world, this line goes on/.test(ec.plain(ec.pages[0])) && !ec.pages[0].includes('\uFFFF'), `text with characters XML forbids: they are left out, the rest is kept (${JSON.stringify(ec.plain(ec.pages[0]).slice(-60))})`);
  check(ec, 'control characters');
  t.eq(E.xmlText('a\u0001b\uFFFFc\u0085d\uD800e\u{1F600}\u000Bf\tg'), 'abcde\u{1F600}f\tg', 'xmlText drops what XML 1.0 forbids and the C1 controls, keeps emoji and tabs');

  // an unreadable formula (a font that maps to U+FFFD) is a picture in its place; text before and after stays text
  const fffd = (d) => fontWith([['41', 'FFFD'], ['42', 'FFFD']])(d);
  const formula = mk([{ fonts: fffd, content: [para(72, 720, filler(3)), para(150, 668, ['AB = BBA'], 'F3', 14), para(72, 640, filler(3).map((l) => l.replace(/w/g, 'v')))].join('\n') }]);
  const ef = await convert(formula);
  const fp = ef.pages[0];
  t.ok(/w0x0[\s\S]*<div class="fig"><img[^>]*\/><\/div>[\s\S]*v0x0/.test(fp) && !/�/.test(fp), 'an unreadable formula line: a picture between the paragraphs, no U+FFFD in the text');
  t.ok(ef.drawn.length === 1 && ef.drawn[0].dark > 50 && ef.drawn[0].h < ef.drawn[0].w, `the picture holds the formula (${JSON.stringify(ef.drawn)})`);
  const mostly = mk([{ fonts: fffd, content: [para(72, 720, Array(12).fill('ABABAB BABA ABBA BAB AB')).replace(/\/F1/, '/F3'), para(72, 540, ['A short readable line'])].join('\n') }]);
  const em = await convert(mostly);
  t.ok(em.drawn.length === 1 && !/A short readable line/.test(em.pages[0]), 'a column that is mostly unreadable: one picture of the whole column');
  check(ef, 'formula picture');

  // bookmarks: the contents (nested; a bookmark of a page left out goes to the next page that is in)
  const marked = mk([1, 2, 3].map((k) => ({ content: para(72, 720, [`Chapter page ${k}`, ...filler(3)]) })), (d) => {
    const it = d.outlineIterator(), uri = (page) => d.formatLinkURI({ type: 'Fit', page });
    it.insert({ title: 'Introduction', uri: uri(0), open: true }); it.insert({ title: 'Part <2> & more', uri: uri(2), open: true }); it.prev(); it.down(); it.insert({ title: 'Section 2.1', uri: uri(2), open: true });
  });
  const eo = await convert(marked);
  t.ok(/<nav epub:type="toc" id="toc"><h1>Contents<\/h1><ol><li><a href="p0001\.xhtml">Introduction<\/a><\/li><li><a href="p0003\.xhtml">Part &lt;2&gt; &amp; more<\/a><ol><li><a href="p0003\.xhtml">Section 2\.1<\/a><\/li><\/ol><\/li><\/ol><\/nav>/.test(eo.nav), 'the PDF\'s bookmarks are the contents, nested and escaped');
  t.ok(/<navPoint id="n2" playOrder="2"><navLabel><text>Part &lt;2&gt; &amp; more<\/text><\/navLabel><content src="p0003\.xhtml"\/><navPoint id="n3" playOrder="2">/.test(eo.ncx), 'the NCX nests them too (two bookmarks of one page share its play order)');
  t.ok(/<nav epub:type="page-list" hidden=""><ol><li><a href="p0001\.xhtml#page1">1<\/a><\/li><li><a href="p0002\.xhtml#page2">2<\/a><\/li><li><a href="p0003\.xhtml#page3">3<\/a><\/li><\/ol><\/nav>/.test(eo.nav), 'a page list of the PDF pages');
  check(eo, 'bookmarks');
  const eo2 = await convert(marked, { pages: [1, 2] });
  t.ok(/<li><a href="p0002\.xhtml">Introduction<\/a><\/li>/.test(eo2.nav), 'pages 2 – 3 only: the bookmark of page 1 goes to page 2');
  const plainList = await convert(mk([1, 2].map((k) => ({ content: para(72, 720, [`Plain page ${k}`]) + '\n' + para(72, 690, filler(3)) }))));
  t.ok(/<li><a href="p0001\.xhtml">Page 1<\/a><\/li><li><a href="p0002\.xhtml">Page 2<\/a><\/li>/.test(plainList.nav), 'no bookmarks: a list of the pages');

  // the language of the PDF
  const lang = (v) => mk([{ content: para(72, 720, filler(3)) }], (d) => d.getTrailer().get('Root').put('Lang', d.newString(v)));
  const ed = await convert(lang('de-DE'));
  t.ok(/<dc:language>de-DE<\/dc:language>/.test(ed.opf) && /lang="de-DE" xml:lang="de-DE"/.test(ed.pages[0]), 'the PDF\'s /Lang is the EPUB\'s language');
  t.ok(/<dc:language>en<\/dc:language>/.test((await convert(lang('not a tag!'))).opf), 'a /Lang that is no language tag: English');
  t.eq(E.pdfLang(open(readFileSync(P('crazyones.pdf')))), 'en', 'no /Lang: English');
  check(ed, 'German');

  // a stamp up the margin of a two-column page (as arXiv's) is no column
  const cols = (x, tag) => para(x, 700, Array.from({ length: 30 }, (_, i) => `${tag}${i} ${filler(1, 4)[0]}`), 'F1', 10, 13);
  const stamped = mk([{ content: [cols(72, 'left'), cols(320, 'right'), 'BT /F1 14 Tf 0 1 -1 0 40 260 Tm (arXiv:2611.01234v1 [cs.CL] 20 Nov 2026) Tj ET'].join('\n') }]);
  const es = await convert(stamped);
  t.ok(es.report[0].columns === 2 && /Column 1<\/h4>\s*<p>left0[\s\S]*left29[\s\S]*Column 2<\/h4>\s*<p>right0/.test(es.pages[0]) && !/arXiv/.test(es.pages[0]), 'a stamp up the margin: removed; the two columns are columns 1 and 2');

  // a page whose text runs sideways (/Rotate 90 over upright text): the page as a picture
  const sideways = mk([{ rotate: 90, content: para(72, 700, filler(20)) }]);
  const ew = await convert(sideways);
  t.ok(ew.report[0].how === 'image' && ew.report[0].note === 'text turned sideways' && ew.drawn[0].w === 1236, `text turned sideways: the page as a picture, as wide as the screen (${JSON.stringify(ew.report[0])})`);

  // a page with a MediaBox that does not start at 0, 0: the figure is cut from the right place
  const offset = mk([{ box: [100, 100, 712, 892], content: [para(172, 820, filler(4)), '0 g 200 300 300 200 re f', para(172, 250, filler(4))].join('\n') }]);
  const ex = await convert(offset);
  t.ok(ex.report[0].figures === 1 && ex.drawn.length === 1 && ex.drawn[0].dark > 0.6 * ex.drawn[0].w * ex.drawn[0].h, `a page whose MediaBox starts at 100, 100: the drawn box is the figure (${JSON.stringify(ex.drawn)})`);

  // an image-only page: a picture as wide as the screen; a page 200 inches high stays within 32 megapixels
  const scan = mk([{ content: '0.5 g 0 0 612 792 re f' }]);
  const ei = await convert(scan, { width: 1860 });
  t.ok(ei.report[0].how === 'image' && ei.drawn[0].w === 1860, `no text: the page as a picture (${ei.drawn[0].w} px)`);
  const tall = mk([{ box: [0, 0, 612, 14400], content: '0.5 g 0 0 612 14400 re f' }]);
  const et = await convert(tall, { width: 1860 });
  t.ok(et.drawn[0].w * et.drawn[0].h <= 32e6 && et.drawn[0].h <= 16384, `a page 200 inches high: ${et.drawn[0].w} × ${et.drawn[0].h} px`);

  // pictures are never wider than the screen; greyscale as chosen
  const sc = await convert(open(readFileSync(P('two-column-paper.pdf'))), { width: 1860, mode: 'columns', grey: false });
  t.ok(sc.drawn.length >= 3 && sc.drawn.every((d) => d.w <= 1860 && !d.grey) && sc.drawn.some((d) => d.w > 1500), `columns as pictures at 1860 px: ${sc.drawn.map((d) => d.w).join(', ')}`);

  // what cannot be made, and stopping
  let msg = '';
  try { await E.pdfToEpub(open(readFileSync(P('crazyones.pdf'))), { ...base, pages: [7] }, undefined, engines); } catch (e) { msg = e.message; }
  t.eq(msg, 'None of the chosen pages is in this PDF.', 'pages outside the PDF: said');
  let calls = 0, stopped = null;
  try { await E.pdfToEpub(open(readFileSync(P('vicksburg-ocr.pdf'))), { ...base, alive: () => ++calls < 4 }, undefined, engines); } catch (e) { stopped = e; }
  t.ok(stopped instanceof E.Stopped && calls === 4, `alive() false: the conversion ends with Stopped (${stopped?.name}, asked ${calls} times)`);
  const prog = [];
  await E.pdfToEpub(open(readFileSync(P('vicksburg-ocr.pdf'))), base, (d, of, phase) => prog.push(`${phase} ${d}/${of}`), engines);
  t.ok(prog[0] === 'read 0/6' && prog.includes('pages 0/6') && prog.at(-1) === 'pages 6/6', `progress: reading, then the pages (${prog.join(', ')})`);

  // a page number on its own (removed with the running headers) — and words that only look like Roman numerals
  for (const s of ['12', 'Page 12', '12 of 30', '– 12 –', 'xiv', 'XIV', 'iv', 'Page ix', ' 7 ']) t.ok(E.pageNumberLike.test(s), `"${s}" is a page number`);
  for (const s of ['ill', 'civil', 'Chapter 3', 'vivid', 'mill', '', 'iiii']) t.ok(!E.pageNumberLike.test(s), `"${s}" is no page number`);
};
