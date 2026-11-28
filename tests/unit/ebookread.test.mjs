// To-do #40: the EPUB Reader's ▷ — src/lib/ebookread.ts (a page's text → the pieces read aloud: paragraphs, sentences, what the voice
// says, the pauses, the page each stands on, a sentence the page cuts off read to its end from the next page) and the engine's
// findOnPage (src/lib/ebook.ts: the sentence being heard found on the laid-out page by MuPDF, to be marked) — held to known answers
// and to the books of tests/fixtures/ebooks/ laid out by MuPDF as the reader's worker does: every sentence read is found on its page.
import { readFileSync } from 'node:fs';

const F = (n) => new Uint8Array(readFileSync(new URL(`../fixtures/ebooks/${n}`, import.meta.url)));
const NM = (...p) => new Uint8Array(readFileSync(new URL(`../../node_modules/${p.join('/')}`, import.meta.url)));

export default async (t, { load }) => {
  const R = await load('/src/lib/ebookread.ts');

  // ---------------------------------------------------------------- paragraphs
  t.eq(R.paragraphsOf('The sea was calm\nthat night.\n\nShe waited.\n'), ['The sea was calm that night.', 'She waited.'], 'a block\'s lines joined, blocks apart by a blank line');
  t.eq(R.paragraphsOf('a long­\nword and  spaces\t here'), ['a longword and spaces here'], 'a soft hyphen at a line\'s end joins the halves; white space single');
  t.eq(R.paragraphsOf('One.\r\n\r\n* * *\r\n\r\nTwo.'), ['One.', 'Two.'], 'Windows line ends; a scene break without a word is no paragraph');
  t.eq(R.paragraphsOf('well-\nknown words'), ['well- known words'], 'a hard hyphen at a line\'s end stays (MuPDF does not hyphenate: it is the word\'s own)');

  // ---------------------------------------------------------------- pieces
  {
    const ps = R.pagePieces([{ page: 4, text: 'Chapter 2\n\nMr. Holmes came in. He sat down!\nThen he spoke — softly.\n\nSee https://www.example.com/a?b=1 for more [12].' }]);
    t.eq(ps.map((p) => p.mark), ['Chapter 2', 'Mr. Holmes came in.', 'He sat down!', 'Then he spoke — softly.', 'See https://www.example.com/a?b=1 for more [12].'], 'a sentence a piece (no end after "Mr."), a heading its own');
    t.eq(ps.map((p) => p.pause), [0.8, 0.3, 0.3, 0.8, 0.8], 'a short pause after a sentence, a longer one after a paragraph');
    t.ok(ps.every((p) => p.page === 4), 'each piece knows its page');
    t.eq(ps[4].say, 'See example.com for more.', 'what the voice says: a web address as its site, a note mark left out (the Audiobook\'s rules)');
  }
  {
    // a spread: the left page, then the right; the right page's last sentence goes on over the page
    const ps = R.pagePieces([{ page: 10, text: 'Left page ends here.' }, { page: 11, text: 'The right page has a sentence that goes on' }], 'over the turn of the page. Then another.');
    t.eq(ps.map((p) => p.page), [10, 11], 'a spread: the left page\'s pieces, then the right\'s');
    t.eq(ps[1].say, 'The right page has a sentence that goes on over the turn of the page.', 'a sentence the page cuts off is read to its end from the next page');
    t.eq(ps[1].mark, 'The right page has a sentence that goes on', '… only the words on this page are marked');
  }
  {
    const comma = R.pagePieces([{ page: 0, text: 'They walked on,' }], 'Holmes and I, to the station.');
    t.eq(comma[0].say, 'They walked on, Holmes and I, to the station.', 'cut off after a comma: it goes on, a capital or not');
    const heading = R.pagePieces([{ page: 0, text: 'Some text.\n\nThe Last Chapter' }], 'It was a dark night.');
    t.eq(heading[1].say, 'The Last Chapter', 'a heading at the page\'s foot (a few words, no comma) is not run on into the next page');
    const ends = R.pagePieces([{ page: 0, text: 'It ends here.' }], 'and this is another page.');
    t.eq(ends[0].say, 'It ends here.', 'a page that ends with a sentence: nothing of the next page');
    const capital = R.pagePieces([{ page: 0, text: 'He looked across the water at the old' }], 'House of the keeper stood there.');
    t.eq(capital[0].say, 'He looked across the water at the old', 'the next page begins with a capital: it may be a new sentence — not run on');
    t.eq(R.pagePieces([{ page: 0, text: '   \n\n * \n' }]), [], 'a page without words: no pieces');
  }
  t.eq([R.readingWhat([11]), R.readingWhat([10, 11]), R.readingWhat([3], true)], ['Reading page 12 aloud', 'Reading pages 11–12 aloud', 'Reading the selection aloud'], 'what the bar says');

  // ---------------------------------------------------------------- the sentence found on the laid-out page (MuPDF), to be marked
  const E = await load('/src/lib/ebook.ts');
  const m = await import('mupdf');
  m.setLog({ warning: () => {}, error: () => {} });
  const files = {
    literata: ['400Regular', '400Regular_Italic', '700Bold', '700Bold_Italic'].map((s) => NM('@expo-google-fonts', 'literata', s, `Literata_${s}.ttf`)),
    noto: [['400Regular', 'NotoSans_400Regular'], ['700Bold', 'NotoSans_700Bold'], ['400Regular_Italic', 'NotoSans_400Regular_Italic']].map(([d, f]) => NM('@expo-google-fonts', 'noto-sans', d, `${f}.ttf`)),
  };
  m.installLoadFontFunction(E.fontHook(m, files, new Set()));
  for (const [name, w, h] of [['novel.epub', 400, 640], ['novel.epub', 760, 900], ['book.mobi', 400, 640], ['plain.txt', 360, 560]]) {
    const o = E.openFile(F(name), name), doc = E.openDoc(m, o);
    E.layOut(doc, o.kind, { font: 'literata', size: 18, line: 1.5, justify: true, theme: 'light', publisher: true }, w, h);
    let pieces = 0, found = 0, multi = 0;
    const miss = [];
    for (let i = 0; i < Math.min(doc.countPages(), 12); i++) {
      const next = i + 1 < doc.countPages() ? E.pageText(doc, i + 1) : '';
      for (const p of R.pagePieces([{ page: i, text: E.pageText(doc, i) }], next)) {
        pieces++;
        const q = E.findOnPage(doc, i, p.mark);
        if (q.length) found++; else miss.push(`p${i}: ${p.mark.slice(0, 50)}`);
        if (new Set(q.map((x) => Math.round(x[1]))).size > 1) multi++;
      }
    }
    t.ok(pieces > 10 && found === pieces, `${name} at ${w} × ${h}: every sentence read is found on its page to be marked (${found} of ${pieces}${miss.length ? `; not: ${miss.slice(0, 3).join(' | ')}` : ''})`);
    t.ok(multi > 0, `${name} at ${w} × ${h}: a sentence over two lines is marked on each of them (${multi} such)`);
  }
  {
    const o = E.openFile(F('novel.epub'), 'novel.epub'), doc = E.openDoc(m, o);
    E.layOut(doc, o.kind, { font: 'literata', size: 18, line: 1.5, justify: true, theme: 'light', publisher: true }, 400, 640);
    t.eq(E.findOnPage(doc, 2, 'words that are in no book anywhere at all'), [], 'a text not on the page: nothing marked');
    t.eq(E.findOnPage(doc, 2, '   '), [], 'no text: nothing');
  }
};
