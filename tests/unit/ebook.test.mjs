// The EPUB Reader's engine (src/lib/ebook.ts) in Node on MuPDF, the engine the tab's worker runs. Held to the books of
// tests/fixtures/ebooks/ (`python3 scripts/make-ebooks.py`: an EPUB 3 novel, a long book, an EPUB 2, a MOBI, a
// FictionBook, a comic, a plain text and two books locked with DRM — every word of each written there, checked with the
// W3C's epubcheck and KindleUnpack): every word of a book on its pages, in order, at every size, font and theme; the
// contents on the right pages; the place kept when the book is laid out again; search with the words around each hit;
// links; the comic's pages in order; DRM and other formats refused in words.
import { readFileSync } from 'node:fs';

const F = (n) => new Uint8Array(readFileSync(new URL(`../fixtures/ebooks/${n}`, import.meta.url)));
const TRUTH = JSON.parse(readFileSync(new URL('../fixtures/ebooks/index.json', import.meta.url), 'utf8'));
const NM = (...p) => new Uint8Array(readFileSync(new URL(`../../node_modules/${p.join('/')}`, import.meta.url)));

export default async (t, { load }) => {
  const E = await load('/src/lib/ebook.ts');
  const m = await import('mupdf');
  m.setLog({ warning: () => {}, error: () => {} });
  const files = {
    literata: ['400Regular', '400Regular_Italic', '700Bold', '700Bold_Italic'].map((s) => NM('@expo-google-fonts', 'literata', s, `Literata_${s}.ttf`)),
    noto: [['400Regular', 'NotoSans_400Regular'], ['700Bold', 'NotoSans_700Bold'], ['400Regular_Italic', 'NotoSans_400Regular_Italic']].map(([d, f]) => NM('@expo-google-fonts', 'noto-sans', d, `${f}.ttf`)),
  };
  const missing = new Set();
  m.installLoadFontFunction(E.fontHook(m, files, missing));

  const LOOK = { font: 'literata', size: 18, line: 1.5, justify: true, theme: 'light', publisher: true };
  const open = (name, look = LOOK, w = 400, h = 640) => {
    const o = E.openFile(F(name), name), doc = E.openDoc(m, o);
    E.layOut(doc, o.kind, look, w, h);
    return { o, doc, info: E.info(doc, o, name) };
  };
  const words = (s) => (s.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const bookWords = (doc) => { const out = []; for (let i = 0; i < doc.countPages(); i++) out.push(...words(E.pageText(doc, i))); return out; };
  const sameWords = (got, want, msg) => {
    let k = 0;
    while (k < got.length && k < want.length && got[k] === want[k]) k++;
    t.ok(k === got.length && k === want.length, `${msg}: ${got.length} words against ${want.length}${k < Math.max(got.length, want.length) ? `; first difference at word ${k}: “${got.slice(k, k + 6).join(' ')}” against “${want.slice(k, k + 6).join(' ')}”` : ''}`);
  };
  const refused = (name, bytes, re, msg) => {
    try { E.openFile(bytes, name); t.ok(false, `${msg}: opened`); }
    catch (e) { t.ok(e instanceof E.Refused && re.test(e.message), `${msg} (${e.message})`); }
  };

  // ------------------------------------------------------------------------------------------ what a file is
  const kinds = { 'novel.epub': 'epub', 'long.epub': 'epub', 'old.epub': 'epub', 'book.mobi': 'mobi', 'tale.fb2': 'fb2', 'comic.cbz': 'cbz', 'plain.txt': 'txt' };
  for (const [n, k] of Object.entries(kinds)) t.eq(E.openFile(F(n), n).kind, k, `${n} is ${k}`);
  t.eq(E.openFile(F('novel.epub'), 'book.bin').kind, 'epub', 'an EPUB is known by its bytes, not its name');
  t.eq(E.openFile(F('book.mobi'), 'x.azw').kind, 'mobi', 'a MOBI named .azw');
  const mob = E.openFile(F('book.mobi'), 'book.mobi');
  t.eq([mob.title, mob.author], ['The Harbour Log', 'Ines Farrow'], 'MOBI: title and author from its EXTH header (MuPDF reads neither)');
  const cbz = E.openFile(F('comic.cbz'), 'comic.cbz');
  t.eq([cbz.title, cbz.author], ['Twelve Panels', 'Ann Artist'], 'comic: title and writer from ComicInfo.xml');
  refused('drm.epub', F('drm.epub'), /Adobe.*DRM|DRM.*Adobe/, 'an EPUB locked with Adobe’s DRM is refused');
  refused('drm.mobi', F('drm.mobi'), /Amazon.*DRM/, 'a MOBI with Mobipocket encryption is refused');
  refused('empty.epub', new Uint8Array(), /empty/, 'an empty file');
  refused('x.pdf', new TextEncoder().encode('%PDF-1.7\n'), /PDF.*PDF for Kindle/, 'a PDF is pointed elsewhere');
  refused('x.kfx', new Uint8Array([0x43, 0x4f, 0x4e, 0x54, 2, 0, 0, 0, 0, 0]), /KFX/, 'Amazon’s KFX');
  refused('pic.bin', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d, 0, 1, 2, 3]), /not an e-book/, 'a picture');
  try { E.openFile(new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0]), 'x.cbr'); t.ok(false, 'a RAR file: opened'); }
  catch (e) { t.ok(e instanceof E.NeedsUnpacking && e.format === 'RAR', 'a CBR (RAR) asks for 7-Zip'); }
  {
    const { zipSync, strToU8 } = await import('fflate');
    refused('w.docx', zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'word/document.xml': strToU8('<w/>') }), /Word document/, 'a Word document');
    refused('z.zip', zipSync({ 'readme.md': strToU8('hello') }), /without a book/, 'a zip without a book');
    const fz = E.openFile(zipSync({ 'tale.fb2': F('tale.fb2') }), 'tale.fb2.zip');
    t.eq([fz.kind, fz.bytes.length], ['fb2', F('tale.fb2').length], 'a FictionBook in a zip (.fb2.zip) is taken out');
    // font obfuscation is no DRM
    const src = (await import('fflate')).unzipSync(F('old.epub'));
    src['META-INF/encryption.xml'] = strToU8('<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><enc:CipherData><enc:CipherReference URI="OEBPS/f.ttf"/></enc:CipherData></enc:EncryptedData></encryption>');
    t.eq(E.openFile(zipSync(src), 'fonts.epub').kind, 'epub', 'an EPUB whose only encryption is font obfuscation opens');
    // a MOBI compressed with Amazon's Huffman scheme
    const hu = F('book.mobi').slice(), r0 = new DataView(hu.buffer).getUint32(78);
    hu[r0] = 0x44; hu[r0 + 1] = 0x48;
    refused('hu.mobi', hu, /Huffman/, 'a MOBI compressed with HUFF/CDIC');
  }

  // ------------------------------------------------------------------------------------------ plain text as a web page
  {
    const gut = 'THE TITLE\n\nCHAPTER I.\n\nIt was a bright cold day in April, and the clocks were striking thirteen.\nWinston Smith, his chin nuzzled into his breast in an effort to escape the\nvile wind, slipped quickly through the glass doors.\n\nShort line one\nShort line two\n\nChapter 2: The Next\n\nEnd & <done>.';
    const html = E.textToHtml(gut, 'x.txt');
    t.ok(/<h1 class="title">THE TITLE<\/h1>/.test(html), 'text: the first short line is the title');
    t.ok(/<h2>CHAPTER I\.<\/h2>/.test(html) && /<h2>Chapter 2: The Next<\/h2>/.test(html), 'text: chapter lines become headings');
    t.ok(html.includes('striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind'), 'text: lines broken by hand are joined (the text reflows)');
    t.ok(html.includes('Short line one<br/>Short line two'), 'text: short lines stay lines (a poem, a list)');
    t.ok(html.includes('End &amp; &lt;done&gt;.'), 'text: & and < are escaped');
    const d = m.Document.openDocument(new TextEncoder().encode(html), E.MAGIC.txt);
    d.layout(300, 400, 16);
    t.eq(E.contents(d).map((e) => e.title), ['THE TITLE', 'CHAPTER I.', 'Chapter 2: The Next'], 'text: the headings are the contents');
  }

  // ------------------------------------------------------------------------------------------ every word, in order
  const looks = [
    ['Literata 18', LOOK],
    ['serif 13, book’s line spacing', { ...LOOK, font: 'serif', size: 13, line: 0 }],
    ['sans 30, dark', { ...LOOK, font: 'sans', size: 30, theme: 'dark', line: 1.8 }],
    ['the book’s own fonts, publisher off, sepia, left', { ...LOOK, font: 'book', publisher: false, theme: 'sepia', justify: false, size: 22 }],
  ];
  for (const [name, truthWords] of [['novel.epub', TRUTH['novel.epub'].words], ['old.epub', TRUTH['old.epub'].words], ['book.mobi', TRUTH['book.mobi'].words], ['plain.txt', TRUTH['plain.txt'].words]]) {
    for (const [lname, look] of looks) {
      const { doc } = open(name, look);
      sameWords(bookWords(doc), truthWords.map((w) => w.normalize('NFC')), `${name}, ${lname}: every word on the pages, in order`);
    }
  }
  {
    // the FictionBook: its own words (the title-info's annotation is not shown, as in other readers)
    const { doc } = open('tale.fb2');
    const got = bookWords(doc).join(' ');
    t.ok(got.startsWith('the shore tale part one low water the sea keeps what it is given a saying'), `FictionBook: title, section, epigraph first (${got.slice(0, 80)})`);
    t.ok(got.includes('low water slow water the stones come up to breathe'), 'FictionBook: the poem');
    t.ok(got.includes('it held a map of the island drawn in pencil'), 'FictionBook: the footnote, at the end');
  }

  // ------------------------------------------------------------------------------------------ pages and sizes
  {
    const a = open('novel.epub', { ...LOOK, size: 14 }).info.pages, b = open('novel.epub', { ...LOOK, size: 26 }).info.pages;
    t.ok(b > a * 2, `a larger font makes more pages (${a} at 14 px, ${b} at 26 px)`);
    const l1 = open('novel.epub', { ...LOOK, line: 1.2 }).info.pages, l2 = open('novel.epub', { ...LOOK, line: 2 }).info.pages;
    t.ok(l2 > l1 * 1.3, `wider line spacing makes more pages (${l1} at 1.2, ${l2} at 2)`);
    const narrow = open('novel.epub', LOOK, 300, 640).info.pages;
    t.ok(narrow > open('novel.epub', LOOK, 600, 640).info.pages, 'a narrower page makes more pages');
    const { doc } = open('novel.epub', LOOK, 400, 640);
    t.eq(E.pageSize(doc, 5), [400, 640], 'a page is the size it was laid out at (CSS px)');
    const st = JSON.parse(doc.loadPage(5).toStructuredText('preserve-whitespace').asJSON());
    const xs = st.blocks.flatMap((bl) => (bl.lines || []).map((l) => l.bbox.x)), ys = st.blocks.flatMap((bl) => (bl.lines || []).map((l) => l.bbox.y));
    t.ok(Math.min(...xs) < 4 && Math.min(...ys) < 30, `the book’s margins are taken off: the reader draws its own (text from x ${Math.min(...xs).toFixed(1)}, y ${Math.min(...ys).toFixed(1)})`);
  }

  // ------------------------------------------------------------------------------------------ fonts
  {
    const fontsOn = (doc, i) => { const f = new Map(); doc.loadPage(i).toStructuredText('preserve-spans').walk({ onChar(c, o, font) { if (/\S/.test(c)) f.set(font.getName(), (f.get(font.getName()) || 0) + 1); } }); return f; };
    const pageWith = (doc, s) => { for (let i = 0; i < doc.countPages(); i++) if (E.pageText(doc, i).includes(s)) return i; return -1; };
    const lit = open('novel.epub', LOOK).doc;
    const p3 = fontsOn(lit, pageWith(lit, 'Chapter 1. The'));
    t.ok([...p3.keys()].every((k) => /^Literata/.test(k)), `Literata: the text is in Literata (${[...p3.keys()]})`);
    const code = fontsOn(lit, pageWith(lit, 'tide(hour)'));
    t.ok([...code.keys()].some((k) => /Mono/.test(k)), `the code block stays monospace (${[...code.keys()]})`);
    const letter = fontsOn(lit, pageWith(lit, 'Dear Mara'));
    t.ok(!letter.has('NotoSans-Italic') && !letter.has('Noto Sans Italic'), 'a chosen font replaces the book’s own fonts');
    const own = open('novel.epub', { ...LOOK, font: 'book' }).doc;
    const ownLetter = fontsOn(own, pageWith(own, 'Dear Mara'));
    t.ok([...ownLetter.keys()].some((k) => /Noto/.test(k)), `“The book’s own”: the paragraph in the book’s embedded font (${[...ownLetter.keys()]})`);
    const sans = open('novel.epub', { ...LOOK, font: 'sans' }).doc;
    t.ok([...fontsOn(sans, 3).keys()].every((k) => /Noto ?Sans/i.test(k)), `Sans: Noto Sans (${[...fontsOn(sans, 3).keys()]})`);
    const serif = open('novel.epub', { ...LOOK, font: 'serif' }).doc;
    t.ok([...fontsOn(serif, 3).keys()].every((k) => /Nimbus ?Roman|Times/i.test(k)), `Serif: MuPDF’s Times (${[...fontsOn(serif, 3).keys()]})`);
    const greek = E.pageText(lit, pageWith(lit, 'Greek grammar'));
    t.ok(greek.includes('Καλημέρα') && greek.includes('Маяк'), 'Greek and Cyrillic are drawn (Literata has both)');
    missing.clear();
    const ar = m.Document.openDocument(new TextEncoder().encode('<html><body><p>English and مرحبا and שלום.</p></body></html>'), 'text/html');
    ar.style(true, E.readerCSS('html', LOOK)); ar.layout(300, 400, 16); E.pageText(ar, 0);
    t.ok(missing.has('Arabic') && missing.has('Hebrew'), `scripts no font here can draw are told (${[...missing]})`);
  }

  // ------------------------------------------------------------------------------------------ themes
  {
    const draw = (theme, publisher = true) => { const { doc } = open('novel.epub', { ...LOOK, theme, publisher }); return { doc, page: (i) => E.drawPage(m, doc, i, 1, E.THEMES[theme].bg) }; };
    const px = (img, x, y) => Array.from(img.rgba.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4));
    const hex = (h) => E.rgb(h).map((v) => Math.round(v * 255));
    for (const theme of ['light', 'sepia', 'dark', 'black']) {
      const { page } = draw(theme), img = page(4);
      t.eq([img.w, img.h], [400, 640], `${theme}: the page is drawn at its size`);
      t.eq(px(img, 0, 0), [...hex(E.THEMES[theme].bg), 255], `${theme}: the page is the theme’s colour`);
      // the darkest (light themes) or lightest (dark themes) pixel is the theme's text colour
      const want = hex(E.THEMES[theme].fg), dark = theme === 'dark' || theme === 'black';
      let best = null, bestL = dark ? -1 : 999;
      for (let i = 0; i < img.rgba.length; i += 4) { const L = img.rgba[i] + img.rgba[i + 1] + img.rgba[i + 2]; if (dark ? L > bestL : L < bestL) { bestL = L; best = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]]; } }
      t.ok(best.every((v, k) => Math.abs(v - want[k]) <= (theme === 'light' ? 30 : 3)), `${theme}: the text is the theme’s colour (${best} against ${want})`);
    }
    // the book's red heading: kept in Light, the theme's colour in Dark
    const redIn = (img) => { let n = 0; for (let i = 0; i < img.rgba.length; i += 4) if (img.rgba[i] > 120 && img.rgba[i + 1] < 60 && img.rgba[i + 2] < 60) n++; return n; };
    const partPage = (doc) => E.contents(doc).find((e) => e.title.startsWith('Part One')).page;
    const L = draw('light'); t.ok(redIn(L.page(partPage(L.doc))) > 50, 'Light keeps the book’s own colours (a red heading)');
    const D = draw('dark'); t.eq(redIn(D.page(partPage(D.doc))), 0, 'Dark: every text in the theme’s colour');
    const P = draw('light', false); t.eq(redIn(P.page(partPage(P.doc))), 0, 'the book’s styles switched off: no red heading');
    const S = draw('sepia'); const img = S.page(4);
    t.eq(px(img, 399, 639), [...hex(E.THEMES.sepia.bg), 255], 'the page’s far corner is the theme’s colour too');
    const D2 = E.drawPage(m, D.doc, 4, 2, E.THEMES.dark.bg);
    t.eq([D2.w, D2.h], [800, 1280], 'drawn at twice the size for a screen of 2 device pixels a CSS pixel');
  }

  // ------------------------------------------------------------------------------------------ contents
  {
    const { doc, info } = open('novel.epub');
    const want = TRUTH['novel.epub'].contents;
    t.eq(info.contents.map((e) => [e.title, e.depth]), want.map((e) => [e.title, e.depth]), 'EPUB 3: the contents of its nav, nested');
    t.ok(info.contents.every((e, k) => e.page >= 0 && (!k || e.page >= info.contents[k - 1].page)), `the entries are on pages in order (${info.contents.map((e) => e.page)})`);
    for (const e of info.contents.filter((x) => /^(Part|Chapter|Notes)/.test(x.title))) t.ok(E.flat(E.pageText(doc, e.page)).startsWith(e.title), `“${e.title}” is at the top of its page ${e.page}`);
    t.eq([info.title, info.author], ['The Lighthouse Almanac', 'Ines Farrow'], 'EPUB: title and author');
    t.eq(E.chapterAt(info.contents, info.contents[3].page + 1).title, info.contents[3].title, 'the chapter of a page: the last entry on it or before');
    const old = open('old.epub').info;
    t.eq(old.contents.map((e) => [e.title, e.depth]), TRUTH['old.epub'].contents.map((e) => [e.title, e.depth]), 'EPUB 2: the NCX, nested');
    const fb = open('tale.fb2').info;
    t.eq(fb.contents.slice(0, 2).map((e) => e.title), ['Part One. Low Water', 'Part Two. High Water'], 'FictionBook: its sections');
    t.eq([fb.title, fb.author], ['The Shore Tale', 'Lena Holm'], 'FictionBook: title and author');
    const mb = open('book.mobi');
    t.eq(mb.info.contents.map((e) => e.title), TRUTH['book.mobi'].contents.map((e) => e.title), 'MOBI: contents from its headings');
    t.eq(mb.info.title, 'The Harbour Log', 'MOBI: the title shown');
    for (const e of mb.info.contents.slice(1)) t.ok(E.flat(E.pageText(mb.doc, e.page)).startsWith(e.title), `MOBI: “${e.title}” starts a page (its page break kept)`);
    const tx = open('plain.txt').info;
    t.eq(tx.contents.map((e) => e.title), ['THE QUIET SHORE', 'CHAPTER I.', 'CHAPTER II.'], 'plain text: the title and its chapter lines');
    t.eq(tx.title, 'THE QUIET SHORE', 'plain text: its title line');
  }

  // ------------------------------------------------------------------------------------------ the place kept
  {
    const A = open('novel.epub', { ...LOOK, size: 16 }).doc;
    const sizes = [[{ ...LOOK, size: 26 }, 400, 640], [{ ...LOOK, size: 12 }, 400, 640], [{ ...LOOK, size: 16, font: 'sans' }, 700, 480], [{ ...LOOK, size: 20, line: 2 }, 330, 600]];
    const pages = [3, 8, 15, 22, 30];
    for (const [look, w, h] of sizes) {
      const { doc: B } = open('novel.epub', look, w, h);
      for (const k of pages) {
        if (k >= A.countPages()) continue;
        const anchor = E.anchorOf(A, k);
        const guess = Math.round((k / A.countPages()) * B.countPages());
        const p = E.findAnchor(B, anchor, guess);
        const here = E.flat(E.pageText(B, p)) + ' ' + E.flat(E.pageText(B, p + 1 < B.countPages() ? p + 1 : p));
        t.ok(anchor && here.includes(anchor.slice(0, 30)), `size ${look.size}, ${w}×${h}: the words at the top of page ${k} (“${anchor.slice(0, 30)}…”) are on the new page ${p}`);
      }
    }
    t.eq(E.anchorOf(A, 0), '', 'the cover has no words: no anchor (the share of the book is used)');
    t.eq(E.findAnchor(A, '', 7), 7, 'without an anchor, the guess');
    t.eq(E.findAnchor(A, 'words that are in no book at all', 5), 5, 'an anchor found nowhere: the guess');
  }

  // ------------------------------------------------------------------------------------------ search
  {
    const { doc, info } = open('novel.epub');
    const all = (q) => { const out = []; for (let i = 0; i < doc.countPages(); i++) out.push(...E.searchPage(doc, i, q)); return out; };
    for (const [q, n] of Object.entries(TRUTH['novel.epub'].search)) t.eq(all(q).length, n, `search “${q}”: ${n} hits`);
    const z = all('ZEPHYRINE');
    t.eq(z.length, 4, 'search ignores case');
    t.ok(z.every((h) => h.match.toLowerCase() === 'zephyrine' && h.quads.length >= 1), 'each hit: the word marked in its line, and its boxes on the page');
    t.ok(z.some((h) => /schooner $/.test(h.before) && /^ had been seen/.test(h.after)), `the words around a hit (${z.map((h) => `${h.before}[${h.match}]${h.after}`).join(' | ')})`);
    t.eq(all('Καλημερα').length, 1, 'search ignores accents (Καλημερα finds Καλημέρα)');
    // a phrase over a line break
    const ch1 = info.contents.find((e) => e.title.startsWith('Chapter 1')).page + 1;
    const st = JSON.parse(doc.loadPage(ch1).toStructuredText('preserve-whitespace').asJSON());
    const lines = st.blocks.flatMap((b) => (b.lines || []).map((l) => l.text.trim())).filter(Boolean);
    const pair = lines.findIndex((l, k) => k + 1 < lines.length && /\w$/.test(l) && /^\w/.test(lines[k + 1]));
    const phrase = `${lines[pair].split(' ').pop()} ${lines[pair + 1].split(' ')[0]}`;
    t.ok(E.searchPage(doc, ch1, phrase).length >= 1, `a phrase found across a line break (“${phrase}”)`);
    const L = open('long.epub');
    let hits = [];
    const t0 = performance.now();
    for (let i = 0; i < L.doc.countPages(); i++) hits.push(...E.searchPage(L.doc, i, 'quillwort'));
    const chapters = hits.map((h) => E.chapterAt(L.info.contents, h.page).title);
    t.eq(chapters, TRUTH['long.epub'].quillwortChapters.map((k) => `Chapter ${k}`), `the long book: “quillwort” in chapters 3, 17 and 33 (${(performance.now() - t0).toFixed(0)} ms for ${L.doc.countPages()} pages)`);
  }

  // ------------------------------------------------------------------------------------------ links
  {
    const { doc, info } = open('novel.epub');
    const ch4 = info.contents.find((e) => e.title.startsWith('Chapter 4')).page, ch5 = info.contents.find((e) => e.title.startsWith('Chapter 5')).page;
    let links = [];
    for (let i = ch4; i < ch5; i++) links.push(...E.linksOf(doc, i).map((l) => ({ ...l, from: i })));
    const web = links.find((l) => l.uri);
    t.eq(web && web.uri, TRUTH['novel.epub'].web, 'a link to the web keeps its address');
    const inner = links.filter((l) => l.page !== undefined);
    const notes = info.contents.find((e) => e.title === 'Notes').page;
    t.ok(inner.some((l) => l.page === notes), `the footnote’s number leads to the notes (page ${notes}; ${inner.map((l) => l.page)})`);
    const charts = inner.find((l) => l.page !== notes);
    t.ok(charts && E.pageText(doc, charts.page).includes('The tides of a week'), 'a link to a place inside a chapter leads to that place’s page');
    t.ok(links.every((l) => l.rect[2] > l.rect[0] && l.rect[3] > l.rect[1]), 'every link has its box');
  }

  // ------------------------------------------------------------------------------------------ selecting text
  {
    const { doc } = open('novel.epub');
    const st = JSON.parse(doc.loadPage(4).toStructuredText('preserve-whitespace').asJSON());
    const ls = st.blocks.flatMap((b) => b.lines || []);
    const a = ls[1], b = ls[3];
    const sel = E.selectText(doc, 4, [a.bbox.x + 1, a.bbox.y + a.bbox.h / 2], [b.bbox.x + b.bbox.w - 1, b.bbox.y + b.bbox.h / 2]);
    t.ok(sel.text.includes(a.text.trim().split(' ')[1]) && sel.text.includes(b.text.trim().split(' ').slice(-1)[0]), `a selection gives the text between the two points (“${sel.text.slice(0, 60)}…”)`);
    t.ok(sel.quads.length >= 3, `…and the boxes to mark (${sel.quads.length})`);
    const w = E.wordAt(doc, 4, [a.bbox.x + 3, a.bbox.y + a.bbox.h / 2]);
    const word = w && E.selectText(doc, 4, w.a, w.b).text.trim();
    t.eq(word, a.text.trim().split(/\s+/)[0].replace(/[^\p{L}\p{N}’'-]+$/u, ""), "a long press takes the word under the finger (without its comma)");
    t.eq(E.wordAt(doc, 4, [395, 635]), null, 'no word under an empty corner');
  }

  // ------------------------------------------------------------------------------------------ the comic
  {
    const { doc, info } = open('comic.cbz');
    const truth = TRUTH['comic.cbz'];
    t.eq(info.pages, 12, 'the comic has 12 pages');
    t.ok(info.fixed, 'a comic’s pages keep their size');
    t.eq(info.title, 'Twelve Panels', 'the comic’s title from ComicInfo.xml');
    let inOrder = true;
    for (let i = 0; i < 12; i++) {
      const [w, h] = E.pageSize(doc, i);
      const img = E.drawPage(m, doc, i, 120 / w, '#ffffff');
      const at = ((img.h >> 2) * img.w + 8) * 4, c = [img.rgba[at], img.rgba[at + 1], img.rgba[at + 2]], want = truth.pages[i];
      if (!c.every((v, k) => Math.abs(v - want[k]) <= 12)) inOrder = false;
      if (i === 0) t.near(w / h, truth.size[0] / truth.size[1], 0.01, 'a comic page has its picture’s shape');
    }
    t.ok(inOrder, `pages p1 … p12 in order, though stored ${truth.storedOrder.join(', ')}`);
    E.layOut(doc, 'cbz', { ...LOOK, size: 30 }, 200, 200);
    t.eq(doc.countPages(), 12, 'a comic is not laid out again');
  }

  // ------------------------------------------------------------------------------------------ a long book
  {
    const t0 = performance.now();
    const { info } = open('long.epub');
    const ms = performance.now() - t0;
    t.ok(info.pages > 500 && info.contents.length === 36, `the long book: ${info.pages} pages, 36 chapters`);
    t.ok(ms < 8000, `a book of ${TRUTH['long.epub'].totalWords.toLocaleString('en')} words laid out in ${ms.toFixed(0)} ms`);
  }
  m.installLoadFontFunction(null);
};
