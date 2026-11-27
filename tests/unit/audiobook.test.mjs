// PDF / EPUB → Audiobook: the book's text in tracks (src/lib/audiobook.ts) on MuPDF in Node — every word a listener
// should hear, in order, held to the books' own word lists (tests/fixtures/ebooks: scripts/make-ebooks.py;
// tests/fixtures/audiobook: scripts/make-audiobook-books.py); what must not be heard (footnote marks and notes, a PDF's
// running heads, page numbers, a figure's labels, a contents page) left out; the tracks where the contents begin them.
import { readFileSync } from 'node:fs';

export default async (t, { load, wasm }) => {
  const A = await load('/src/lib/audiobook.ts');
  const { openFile } = await load('/src/lib/ebook.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const m = await import('mupdf');
  m.setLog?.({ warning: () => {}, error: () => {} });
  const engines = { m, tc: bindTextcore(await wasm('textcore')), ip: bindImgproc(await wasm('imgproc')), jpeg: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) };
  /** words as the fixtures' scripts count them: letters and digits, lower case (Python's isalnum) */
  const words = (s) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const said = (tr) => tr.blocks.flatMap((b) => words(A.speechText(b.text)));
  /** the differences of two word lists, as runs missing from `got` and runs `got` has beyond `want` */
  const align = (want, got) => {
    const miss = [], extra = []; let i = 0, j = 0;
    while (i < want.length || j < got.length) {
      if (i < want.length && j < got.length && want[i] === got[j]) { i++; j++; continue; }
      let best = null;
      for (let d = 1; d < 80 && !best; d++) for (let a = 0; a <= d && !best; a++) { const b = d - a; if (i + a < want.length && j + b < got.length && want.slice(i + a, i + a + 3).join() === got.slice(j + b, j + b + 3).join()) best = [a, b]; }
      if (!best) best = [want.length - i, got.length - j];
      if (best[0]) miss.push(want.slice(i, i + best[0]).join(' ')); if (best[1]) extra.push(got.slice(j, j + best[1]).join(' '));
      i += best[0]; j += best[1];
    }
    return { miss, extra };
  };
  const book = (dir, f, o) => A.readReflowable(m, openFile(new Uint8Array(readFileSync(`tests/fixtures/${dir}/${f}`)), f), f, o);
  const ebooks = JSON.parse(readFileSync('tests/fixtures/ebooks/index.json', 'utf8'));
  const truth = JSON.parse(readFileSync('tests/fixtures/audiobook/index.json', 'utf8'));
  const titles = (b) => b.tracks.map((x) => x.title);

  // ---- text for speech
  t.eq(A.speechText('See https://www.example.com/almanac/tides.html?x=1. Then go.'), 'See example.com. Then go.', 'a web address is read as its site');
  t.eq(A.speechText('www.gutenberg.org/ebooks/1342, a novel'), 'gutenberg.org, a novel', 'www. addresses too');
  t.eq(A.speechText('the sea[12] and the[*] shore [†]'), 'the sea and the shore', 'bracketed note marks go');
  t.eq(A.speechText('soft­ly, zero​width  and\n spaces'), 'softly, zerowidth and spaces', 'soft hyphens and zero-width characters go; white space single');
  t.eq(A.countWords("Don't stop — 12 o'clock, x2."), 5, 'words: letters and digits; a word with an apostrophe is one');

  // ---- footnote marks in (X)HTML
  {
    const html = '<p>A<a epub:type="noteref" href="#n1" id="r1">1</a> B<sup><a href="n.xhtml#n2">2</a></sup> C<a href="#n3"><sup>3</sup></a> D<a class="pginternal" href="#fn4">[4]</a> E<a href="#n5">†</a> <a href="#ch2">Chapter 2</a> <a href="https://x.org/#top">site</a> <a role="doc-noteref" href="#n6">6</a></p><aside epub:type="footnote" id="n1"><p>The note.</p></aside><aside epub:type="sidebar"><p>A box.</p></aside>';
    const r = A.stripNotes(html);
    t.eq(r.html, '<p>A B C D E <a href="#ch2">Chapter 2</a> <a href="https://x.org/#top">site</a> </p><aside epub:type="sidebar"><p>A box.</p></aside>', 'every kind of note mark goes (noteref, a raised link, a link round a raised mark, [4], †, ARIA); a link with words stays; a sidebar stays');
    t.eq([r.refs, r.bodies], [6, 1], 'six marks, one note');
    t.ok(A.stripNotes(html, true).html.includes('The note.') && A.stripNotes(html, true).refs === 6, 'with the notes asked for: the notes stay, the marks still go');
  }

  // ---- the EPUB's package
  {
    const { unzipSync } = await import('fflate');
    const files = unzipSync(new Uint8Array(readFileSync('tests/fixtures/ebooks/novel.epub')));
    const c = A.epubCover(files);
    t.ok(c && c.mime === 'image/png' && c.bytes.length > 1000, `novel.epub's cover found through its manifest (${c?.mime}, ${c?.bytes.length} bytes)`);
    t.eq(A.epubMeta(files), { language: 'en', title: 'The Lighthouse Almanac', author: 'Ines Farrow' }, 'its language, title and author from the package');
  }

  // ---- the e-book fixtures: every word in order, in the tracks the contents make
  {
    const b = book('ebooks', 'novel.epub');
    t.eq(titles(b), ['Part One: The Rock — Chapter 1. The Keeper', 'Chapter 2. Fog', 'Part Two: The Ledger — Chapter 3. Inventory', 'Chapter 4. Zephyrine', 'Chapter 5. Charts and Verses'],
      'novel.epub: a track per chapter; a part\'s page and the title page go with the chapter after them; the notes\' page, empty without its notes, is no track');
    t.eq([b.title, b.author, b.language, b.how, b.refs, b.notes], ['The Lighthouse Almanac', 'Ines Farrow', 'en', 'contents', 1, 1], 'its title, author, language; the footnote mark and the note left out');
    const d = align(ebooks['novel.epub'].words, b.tracks.flatMap(said));
    t.eq(d, { miss: ['1', 'notes 1 the note says only fair weather one sail to the west'], extra: [] }, 'every word of the book in order (Greek and Cyrillic too), but the footnote mark, the notes\' heading and the note');
    t.ok(b.tracks.every((x) => !x.skip), 'every track ticked');
    const n = book('ebooks', 'novel.epub', { notes: true });
    t.ok(n.tracks.some((x) => said(x).join(' ').includes('the note says only fair weather')) && n.notes === 0 && n.refs === 1, 'notes asked for: the note is read (its mark is still not)');
  }
  {
    const b = book('ebooks', 'old.epub');
    t.eq(titles(b), ['Preface', 'The Watches — The First Watch', 'The Second Watch'], 'old.epub (NCX): two entries on one page are one track');
    t.eq(align(ebooks['old.epub'].words, b.tracks.flatMap(said)), { miss: [], extra: [] }, 'old.epub: every word in order');
  }
  {
    const b = book('ebooks', 'book.mobi');
    t.eq(titles(b), ['Chapter One. Arrivals', 'Chapter Two. Departures'], 'book.mobi: its headings\' contents; the title page goes with the first chapter');
    t.eq(align(ebooks['book.mobi'].words, b.tracks.flatMap(said)), { miss: [], extra: [] }, 'book.mobi: every word in order');
    t.ok(b.tracks[0].blocks.filter((x) => x.kind === 'text').length >= 8, `book.mobi: its paragraphs apart (MOBI sets them without space: ${b.tracks[0].blocks.length} blocks)`);
  }
  {
    const b = book('ebooks', 'plain.txt');
    t.eq(titles(b), ['CHAPTER I.', 'CHAPTER II.'], 'plain.txt: its chapter lines');
    t.eq(align(ebooks['plain.txt'].words, b.tracks.flatMap(said)), { miss: [], extra: [] }, 'plain.txt: every word in order');
  }
  {
    const b = book('ebooks', 'tale.fb2'), all = b.tracks.flatMap(said).join(' ');
    t.eq(titles(b), ['Part One. Low Water', 'Part Two. High Water'], 'tale.fb2: its sections');
    t.ok(all.includes('mara found a bottle on the shingle low water') && !b.tracks.some((x) => x.blocks.some((y) => /\[1\]/.test(y.text))), 'tale.fb2: its note mark [1] is not read');
  }
  {
    const b = book('ebooks', 'long.epub'), want = ebooks['long.epub'].chapters;
    t.eq(b.tracks.length, 36, 'long.epub: 36 tracks');
    t.eq(b.tracks.map((x) => x.words), want.map((x) => x.words), 'long.epub: each chapter\'s words counted as its own word list counts them');
    t.eq(b.words, ebooks['long.epub'].totalWords, `long.epub: ${b.words.toLocaleString()} words in all`);
  }

  // ---- a book laid out as Project Gutenberg's are: chapters at #ids inside one file
  {
    const b = book('audiobook', 'gutenberg.epub'), T = truth['gutenberg.epub'];
    t.eq(titles(b), T.tracks.map((x) => x.title), 'gutenberg.epub: a track per #id the contents point at, inside one file');
    t.eq([b.refs, b.notes, b.language], [4, 4, 'en'], 'its four note marks (noteref, a raised link, [3], noteref) and its four notes left out');
    b.tracks.forEach((x, k) => t.eq(align(k ? T.tracks[k].words : [...T.front, ...T.tracks[0].words], said(x)), { miss: [], extra: [] }, `“${x.title}”: every word in order — the drop cap joined to its word, the web address read as its site`));
    t.ok(b.tracks[1].blocks.some((x) => x.kind === 'break') && b.tracks.every((x) => x.blocks[x.blocks[0].kind === 'heading' ? 0 : 2].kind === 'heading'), 'the scene break is a break; each chapter begins with its heading');
    const n = book('audiobook', 'gutenberg.epub', { notes: true });
    t.ok(T.notes.every((w) => n.tracks.flatMap(said).join(' ').includes(w.join(' '))), 'notes asked for: all four are read');
  }

  // ---- a text without a heading: parts by length
  {
    const b = book('audiobook', 'noheads.txt');
    t.eq([b.how, titles(b)], ['length', ['Part 1', 'Part 2', 'Part 3', 'Part 4']], 'noheads.txt: no contents, no headings → four parts');
    t.eq(align(truth['noheads.txt'].words, b.tracks.flatMap(said)), { miss: [], extra: [] }, 'every word in order');
    t.ok(b.tracks.every((x) => x.words > 1800 && x.words < 2800), `parts of about 2,500 words (${b.tracks.map((x) => x.words).join(', ')})`);
  }

  // ---- a PDF book: bookmarks, running heads, a footnote, a figure, two columns, a chapter that begins mid-page
  {
    const doc = m.Document.openDocument(readFileSync('tests/fixtures/audiobook/book.pdf'), 'application/pdf');
    const b = await A.readPdf(doc, engines, {}), T = truth['book.pdf'];
    t.eq(titles(b), ['Part One: The Rock — Chapter 1. The Keeper', 'Chapter 2. Fog', 'Part Two: The Ledger — Chapter 3. Inventory', 'Chapter 4. Zephyrine', 'Index'], 'book.pdf: a track per chapter from its bookmarks');
    t.eq([b.title, b.author, b.language, b.how], ['The Book of Tides', 'Mara Lindqvist', 'en', 'contents'], 'its title, author and language');
    t.eq(b.tracks.map((x) => x.skip), [false, false, false, false, true], 'the index is not ticked');
    const want = [[...T.front.words, ...T.tracks[0].words, ...T.tracks[1].words], T.tracks[2].words, [...T.tracks[3].words, ...T.tracks[4].words], T.tracks[5].words, T.tracks[6].words];
    b.tracks.forEach((x, k) => t.eq(align(want[k], said(x)), { miss: [], extra: [] }, `“${x.title}”: every word in order — no running head, page number, figure label, footnote or contents line; a word broken over a line or a page joined; two columns read down each`));
    const all = b.tracks.map((x) => x.blocks.map((y) => y.text).join(' ')).join(' ');
    const times = (s) => all.toUpperCase().split(s.toUpperCase()).length - 1;
    t.eq([...new Set(T.never)].map((s) => [s, times(s)]), [...new Set(T.never)].map((s) => [s, /^(THE BOOK OF TIDES|CHAPTER \d)/i.test(s) ? 1 : 0]), `nothing that must not be heard: each running head's words only once — as the title page or the chapter's own heading —, the figure's labels and the note not at all`);
    t.ok(b.heads >= 8 && b.notes === 1, `running heads left out (${b.heads}), the footnote left out (${b.notes})`);
    t.ok(b.tracks[1].blocks[0].kind === 'heading' && /^Chapter 2/.test(b.tracks[1].blocks[0].text), 'Chapter 2 begins at its heading in the middle of a page (not at the top of that page)');
    const n = await A.readPdf(m.Document.openDocument(readFileSync('tests/fixtures/audiobook/book.pdf'), 'application/pdf'), engines, { notes: true });
    t.ok(n.tracks[0].blocks.some((x) => words(x.text).join(' ').includes(T.note.join(' '))), 'notes asked for: the footnote is read');
  }

  // ---- the rules, on made-up blocks
  {
    const B = (text, kind = 'text', page = 0, y = 0) => ({ kind, text, page, y });
    const para = (n, w = 'word') => Array(n).fill(w).join(' ') + '.';
    // depth: subsections of a few words are no tracks
    const blocks = [B('Intro', 'heading'), B(para(400)), B('Methods', 'heading'), B('Setup', 'heading'), B(para(40)), B('Data', 'heading'), B(para(40)), B('Results', 'heading'), B(para(400))];
    const entries = [{ title: 'Intro', depth: 0, at: 0 }, { title: 'Methods', depth: 0, at: 2 }, { title: 'Setup', depth: 1, at: 3 }, { title: 'Data', depth: 1, at: 5 }, { title: 'Results', depth: 0, at: 7 }];
    t.eq(A.buildTracks(blocks, entries, 'Paper').tracks.map((x) => x.title), ['Intro', 'Methods', 'Results'], 'subsections of 40 words are read inside their section (the deepest level whose tracks are 250 words and more at the median)');
    const big = [B('A', 'heading'), B(para(300)), B('A1', 'heading'), B(para(300)), B('A2', 'heading'), B(para(300))];
    t.eq(A.buildTracks(big, [{ title: 'A', depth: 0, at: 0 }, { title: 'A1', depth: 1, at: 2 }, { title: 'A2', depth: 1, at: 4 }], 'B').tracks.map((x) => x.title), ['A', 'A1', 'A2'], 'subsections of 300 words are tracks');
    // a tiny track goes with the next; skipped titles stay apart; the front matter goes with the first track
    const r = A.buildTracks([B('Cover text'), B('Contents', 'heading'), B(para(10)), B('Part I', 'heading'), B('Chapter 1', 'heading'), B(para(300)), B('Index', 'heading'), B(para(20))],
      [{ title: 'Contents', depth: 0, at: 1 }, { title: 'Part I', depth: 0, at: 3 }, { title: 'Chapter 1', depth: 1, at: 4 }, { title: 'Index', depth: 0, at: 6 }], 'Book');
    t.eq(r.tracks.map((x) => [x.title, x.skip]), [['Book', true], ['Contents', true], ['Part I — Chapter 1', false], ['Index', true]], 'a few words before the contents stay a track of their own (not ticked) when the next is not read; contents and index are not ticked; a part\'s title page goes with its chapter');
    // headings when there are no contents
    const h = A.buildTracks([B('One', 'heading'), B(para(100)), B('Two', 'heading'), B(para(100))], [], 'B');
    t.eq([h.how, h.tracks.map((x) => x.title)], ['headings', ['One', 'Two']], 'no contents: the headings begin the tracks');
    // pages joined
    t.eq(A.joinPages([B('beyond the break-', 'text', 1), B('water. It', 'text', 2), B('and so it went', 'text', 2), B('on and on.', 'text', 3), B('Next.', 'text', 4)]).map((x) => x.text), ['beyond the breakwater. It', 'and so it went on and on.', 'Next.'], 'a paragraph that goes on over a page is one; a word broken there is joined');
    // a contents page
    const ts = ['Chapter 1. The Keeper', 'Chapter 2. Fog', 'Chapter 3. Inventory'];
    t.eq(A.dropContents([B('Contents', 'heading'), B('Chapter 1. The Keeper Chapter 2. Fog Chapter 3. Inventory'), B('Chapter 1. The Keeper', 'heading'), B(para(5))], ts).map((x) => x.text), ['Chapter 1. The Keeper', para(5)], 'a paragraph holding three titles (a PDF\'s contents page) and its heading go; the chapter\'s own heading stays');
    t.eq(A.dropContents([B('Contents', 'heading'), B(ts[0]), B(ts[1]), B(ts[2]), B(ts[0], 'heading'), B(para(5))], ts).length, 2, 'three titles in a row (an EPUB\'s contents page) go');
    // running heads
    const pages = [[B('The Book', 'heading', 0)], [B('THE BOOK', 'text', 1), B('Chapter One', 'heading', 1), B(para(20), 'text', 1)], [B('CHAPTER ONE', 'text', 2), B(para(20), 'text', 2)], [B('12 THE BOOK', 'text', 3), B(para(20), 'text', 3)],
      [B('Journal of Tides', 'text', 4), B(para(20), 'text', 4)], [B('Journal of Tides', 'text', 5), B(para(20), 'text', 5)], [B(para(20), 'text', 6), B('Journal of Tides', 'text', 6)]].flat();
    const heads = A.dropRunningHeads(pages, ['The Book', 'Chapter One']);
    t.eq(pages.filter((x) => heads.has(x)).map((x) => x.text), ['THE BOOK', 'CHAPTER ONE', '12 THE BOOK', 'Journal of Tides', 'Journal of Tides', 'Journal of Tides'], 'running heads: the book\'s title and the chapter\'s after their first showing, with a page number too, and a line at the edge of three pages; the title page and the chapter\'s heading stay');
    // a PDF page's XHTML
    const x = `<section class="page"><p class="pgno">Page 3</p><h4 class="part">Page 3, part 1</h4><h2>Chapter 1</h2><p>The <i>ledger</i><sup>1</sup>that she kept &amp; the <b>lamp</b>.</p><p>Time (s)</p><div class="fig"><img src="i.jpg"/></div><p>Figure 1. The tide.</p><div class="fig tbl"><img src="t.jpg"/></div><p class="eqno">(3)</p><p>Lighthouse Road<br/>The Rock</p><p>* * *</p><hr class="fn"/><p>1 The note.</p><p class="margin">A margin note</p></section>`;
    const pb = A.pdfPageBlocks(x, 2, false);
    t.eq(pb.blocks.map((y) => [y.kind, y.text]), [['heading', 'Chapter 1'], ['text', 'The ledger that she kept & the lamp.'], ['text', 'Figure 1. The tide.'], ['text', 'Lighthouse Road, The Rock'], ['break', '']],
      'a PDF page: the label, parts, pictures, a figure\'s label and an equation\'s number go; a caption stays; a note mark goes with a space; a line break is a pause');
    t.eq(pb.notes, 2, 'the footnote and the margin note left out');
    t.ok(A.pdfPageBlocks(x, 2, true).blocks.some((y) => y.text === '1 The note.'), 'notes asked for: the footnote is read');
  }
};
