// The OCR tab's text with the page's lists (to-do #31; owner, 26 Nov 2026: "In the OCR app, the rich formatting should be
// preserved, the bullet points, etc."; plain text, the marks at the line starts, nested items indented, lists only):
// src/lib/listtext.ts on readings built here line by line — the marks put back where they stood, the levels, the lines
// an item runs on to, numbers and letters, paragraphs, columns, a page that is not quite level, PaddleOCR's reading of a
// mark — and on a real reading (tests/fixtures/ocr/memo-reading.json: Tesseract's reading of the photographed memo,
// tests/fixtures/images/doc-memo-still.jpg, with the marks the clean-up cleared) against the page's own lists
// (scripts/make-format-docs.mjs). Every result holds the reading's words, in order, and nothing else but marks and spaces.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default async (t, { load }) => {
  const { listText, isLabel, GLYPH, INDENT } = await load('/src/lib/listtext.ts');
  const { scoreLists } = await import('../lib/listscore.mjs');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  /** a reading: rows of words (12 px a letter, 8 px between words, 20 px high), and the text as Tesseract writes it */
  const R = (rows) => {
    const words = [], lines = [];
    for (const r of rows) {
      const w0 = words.length;
      let x = r.x;
      for (const s of r.words.split(' ')) { const w = 12 * s.length; words.push({ text: s, conf: 95, x0: x, y0: r.y + (r.dy || 0), x1: x + w, y1: r.y + (r.dy || 0) + 20 }); x += w + (r.gap ?? 8); }
      lines.push({ w0, w1: words.length, para: r.para ?? 0, block: r.block ?? 0 });
    }
    let text = '';
    lines.forEach((l, i) => { if (i && (l.para !== lines[i - 1].para || l.block !== lines[i - 1].block)) text += '\n'; text += words.slice(l.w0, l.w1).map((w) => w.text).join(' ') + '\n'; });
    return { text: text.trim(), words, lines };
  };
  /** a mark of `kind` with its ink at x, standing on a row at y (a 10 px mark, in the middle of the row's height) */
  const M = (x, y, kind = 1) => ({ x0: x, y0: y + 5, x1: x + 10, y1: y + 15, kind });
  const XH = 10;
  const words = (s) => (s.match(/[\p{L}\p{N}.,;:()'-]+/gu) || []).filter((w) => !/^[•◦▪◆►☐☑☒◉]$/u.test(w));
  const sameWords = (a, r) => words(a).join(' ') === words(r.text).join(' ');
  /** `dropped`: words of the reading that are a mark read as a character (they go) */
  const check = (name, r, marks, want, dropped = []) => {
    const got = listText(r, marks, XH), w = words(r.text);
    for (const d of dropped) w.splice(w.indexOf(d), 1);
    t.eq(got, want, name);
    t.ok(words(got).join(' ') === w.join(' '), `${name}: the reading's words, in order${dropped.length ? ` (without ${dropped.map((d) => `“${d}”`).join(', ')})` : ''}`);
  };

  // ---- labels
  for (const s of ['1.', '12)', '(3)', 'a.', 'B)', '(c)', 'iv.', 'XI)', 'ii.', 'xxxix.', '•', '-', '–', '—', '*', '+', '➢', '✓', '☐']) t.ok(isLabel(s), `“${s}” is a list's label`);
  for (const s of ['1.2', 'mix.', 'civil.', 'did.', '(a.', '12', 'Mr.', 'e.g.', 'ab.', 'iiii.', 'vix.', '1234.', 'o', 'e', '©', 'The']) t.ok(!isLabel(s), `“${s}” is not`);
  t.ok(GLYPH[1] === '•' && GLYPH[2] === '◦' && GLYPH[3] === '▪' && GLYPH[6] === '☐' && GLYPH[7] === '☑' && GLYPH[8] === '☒' && INDENT === 4, 'the marks written • ◦ ▪ ☐ ☑ ☒, four spaces a level');

  // ---- a page without a list: the reading's text exactly
  const plain = R([{ x: 50, y: 100, words: 'A page of plain text' }, { x: 50, y: 130, words: 'with two paragraphs' }, { x: 50, y: 190, words: 'Here is the second one', para: 1 }, { x: 80, y: 220, words: 'indented a little', para: 1 }]);
  t.eq(listText(plain, [], XH), plain.text, 'a page without a list: its text as read, blank lines and all');
  t.eq(listText({ text: 'no lines', words: [] }, [M(1, 1)], XH), 'no lines', 'a reading without lines: its text');
  t.eq(listText({ ...plain, lines: undefined }, [], XH), plain.text, 'a reading that does not give its lines: its text');

  // ---- the marks put back, levels, the lines an item runs on to
  const nest = R([
    { x: 50, y: 100, words: 'Getting started' },
    { x: 80, y: 130, words: 'Install the tools' },
    { x: 140, y: 160, words: 'Windows: winget install Git.Git' },
    { x: 140, y: 190, words: 'Linux: sudo apt install git' },
    { x: 200, y: 220, words: 'Debian and Ubuntu' },
    { x: 80, y: 250, words: 'Make an account' },
    { x: 80, y: 280, words: 'Read the contributing guide and the' },
    { x: 80, y: 310, words: 'code of conduct' },
    { x: 80, y: 340, words: 'Open your first pull request' },
    { x: 50, y: 370, words: 'That is all.' },
  ]);
  check('bullets nested three levels, check boxes, a line run on to', nest, [M(60, 130, 1), M(120, 160, 2), M(120, 190, 2), M(180, 220, 3), M(60, 250, 1), M(60, 280, 7), M(60, 340, 6)],
    'Getting started\n• Install the tools\n    ◦ Windows: winget install Git.Git\n    ◦ Linux: sudo apt install git\n        ▪ Debian and Ubuntu\n• Make an account\n☑ Read the contributing guide and the\n  code of conduct\n☐ Open your first pull request\nThat is all.');
  // the mark of each line is found by the height of the word after it, whatever order the marks come in
  check('the marks in any order', nest, [M(60, 340, 6), M(180, 220, 3), M(60, 280, 7), M(120, 190, 2), M(60, 250, 1), M(120, 160, 2), M(60, 130, 1)],
    'Getting started\n• Install the tools\n    ◦ Windows: winget install Git.Git\n    ◦ Linux: sudo apt install git\n        ▪ Debian and Ubuntu\n• Make an account\n☑ Read the contributing guide and the\n  code of conduct\n☐ Open your first pull request\nThat is all.');
  // every kind of mark
  const kinds = R([1, 2, 3, 4, 5, 6, 7, 8, 9].map((k, i) => ({ x: 80, y: 100 + 30 * i, words: `item ${k}` })));
  check('every kind of mark written as it is', kinds, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k, i) => M(60, 100 + 30 * i, k)), '• item 1\n◦ item 2\n▪ item 3\n◆ item 4\n► item 5\n☐ item 6\n☑ item 7\n☒ item 8\n◉ item 9');
  t.eq(listText(kinds, [{ ...M(60, 100), kind: 0 }, { ...M(60, 130), kind: 42 }], XH), kinds.text, 'a mark of no known kind: left out (the text as read)');

  // a sub-list closed, the parent's item runs on under it; back to the margin: the list ends
  const back = R([
    { x: 80, y: 100, words: 'Parent item' },
    { x: 140, y: 130, words: 'child item' },
    { x: 80, y: 160, words: 'more of the parent' },
    { x: 140, y: 190, words: 'another child' },
    { x: 50, y: 220, words: 'Body text again' },
    { x: 140, y: 250, words: 'a new list' },
  ]);
  check('a parent runs on under its sub-list; the margin ends the list; the next list starts at level 0', back, [M(60, 100), M(120, 130, 2), M(120, 190, 2), M(120, 250, 2)],
    '• Parent item\n    ◦ child item\n  more of the parent\n    ◦ another child\nBody text again\n◦ a new list');

  // ---- numbers and letters: read as text, indented by their place
  const num = R([
    { x: 50, y: 100, words: '1. Fork the repository and' },
    { x: 86, y: 130, words: 'clone it' },
    { x: 50, y: 160, words: '2. Make the change:' },
    { x: 110, y: 190, words: 'a. edit the file' },
    { x: 110, y: 220, words: 'b. run the tests' },
    { x: 50, y: 250, words: '10. Open a pull request' },
  ]);
  check('numbered steps, lettered sub-steps, a step run on to', num, [],
    '1. Fork the repository and\n   clone it\n2. Make the change:\n    a. edit the file\n    b. run the tests\n10. Open a pull request');
  // right-aligned numbers ("9." under "10.") are one level
  const ra = R([{ x: 62, y: 100, words: '9. nine' }, { x: 50, y: 130, words: '10. ten' }, { x: 50, y: 160, words: '11. eleven' }]);
  t.eq(listText(ra, [], XH), ra.text, 'right-aligned numbers: one level, nothing to change');
  // a dash the reader read as a character
  const dash = R([{ x: 50, y: 100, words: 'Rules' }, { x: 80, y: 130, words: '– be kind' }, { x: 120, y: 160, words: '– to everyone' }]);
  check('dashes read as characters: a list too', dash, [], 'Rules\n– be kind\n    – to everyone');

  // ---- paragraphs: the blank lines between one list's items are left out, other blank lines stay
  const paras = R([
    { x: 50, y: 100, words: 'Heading', para: 0 },
    { x: 80, y: 140, words: 'first item', para: 1 },
    { x: 80, y: 165, words: 'second item', para: 2 },
    { x: 80, y: 190, words: 'third item', para: 3 },
    { x: 50, y: 240, words: 'After the list', para: 4 },
  ]);
  check('blank lines between the items of one list left out; around the list kept', paras, [M(60, 140), M(60, 165), M(60, 190)],
    'Heading\n\n• first item\n• second item\n• third item\n\nAfter the list');
  const loose = R([{ x: 80, y: 100, words: 'first item', para: 0 }, { x: 80, y: 160, words: 'second item, far below', para: 1 }]);
  check('items far apart keep the blank line between them', loose, [M(60, 100), M(60, 160)], '• first item\n\n• second item, far below');

  // ---- columns: a list at the top of the second column starts afresh
  const cols = R([
    { x: 80, y: 100, words: 'left one' }, { x: 80, y: 130, words: 'left two' },
    { x: 560, y: 100, words: 'right one', block: 1 }, { x: 620, y: 130, words: 'right nested', block: 1 },
  ]);
  check('the second column: its own list from level 0', cols, [M(60, 100), M(60, 130), M(540, 100), M(600, 130, 2)],
    '• left one\n• left two\n\n• right one\n    ◦ right nested');

  // ---- a table right after a checklist: it starts a little left of the items' text (1.0 – 1.3 x-heights on the
  // checklist's video frames — they were set out as the last item's run-on lines); a line that runs on starts right under
  // the text
  const tbl = R([
    { x: 80, y: 100, words: 'Write tutorials for the project' },
    { x: 80, y: 130, words: 'Go through open issues and' },
    { x: 81, y: 160, words: 'suggest closing old ones' },
    { x: 69, y: 200, words: 'Phase Owner Status Notes' },
    { x: 69, y: 230, words: 'Planning Asha Done Power BI' },
  ]);
  check('a table after a checklist: no run-on lines of its last item', tbl, [M(60, 100, 6), M(60, 130, 6)],
    '☐ Write tutorials for the project\n☐ Go through open issues and\n  suggest closing old ones\nPhase Owner Status Notes\nPlanning Asha Done Power BI');

  // ---- a page not quite level: the lines drift, each mark goes to the line whose first word stands at its height
  const drift = R([{ x: 80, y: 100, words: 'one two three four five six seven eight nine ten eleven twelve', gap: 8 }, { x: 80, y: 118, words: 'second line' }]);
  for (const [k, w] of drift.words.entries()) if (k < 12) { w.y0 += k * 3; w.y1 += k * 3; } // the first line falls 33 px to its end
  check('a slanted page: the mark goes to the line its first word stands on', drift, [M(60, 118)], 'one two three four five six seven eight nine ten eleven twelve\n• second line');

  // ---- a mark that stands before no word nearby: left out; one between two words: put back there
  const far = R([{ x: 400, y: 100, words: 'far away' }]);
  t.eq(listText(far, [M(60, 100)], XH), far.text, 'a mark 33 x-heights before the next word: no list mark of this line');
  const mid = R([{ x: 50, y: 100, words: 'Left column text right item', gap: 8 }]);
  const midX = mid.words[3].x0; // "right"
  check('a mark in the middle of a line (a list beside other text): put back before its word', mid, [M(midX - 20, 100)], 'Left column text • right item');
  // two marks for one word: the nearer one
  const two = R([{ x: 80, y: 100, words: 'item' }]);
  check('two marks before one word: the nearer', two, [M(20, 100, 6), M(62, 100, 1)], '• item');

  // ---- PaddleOCR (it reads the page as it stands when one mark was cleared) read the mark as a character: left out
  const pad = R([{ x: 60, y: 100, words: 'o Install the tools' }, { x: 80, y: 130, words: 'Make an account' }]);
  pad.words[0].x0 = 61; pad.words[0].x1 = 69;
  check('the mark read as a character by the reader: that character left out', pad, [M(60, 100, 2), M(60, 130, 2)], '◦ Install the tools\n◦ Make an account', ['o']);

  // ---- a real reading: Tesseract on the photographed memo (doc-memo-still), with the marks the clean-up cleared,
  // against the page's own lists — every item with its mark or number at its level, every line it runs on to under its text
  const real = JSON.parse(readFileSync(root + 'tests/fixtures/ocr/memo-reading.json', 'utf8'));
  const gotReal = listText(real.r, real.marks, real.xh), sc = scoreLists(gotReal, real.lists);
  t.ok(sameWords(gotReal, real.r), 'the memo: the reading\'s words, in order');
  t.ok(sc.items === 14 && sc.right === sc.items, `the memo: every item with its mark or number at its level (${sc.right} of ${sc.items}) ${sc.wrong.join(' | ')}`);
  t.ok(sc.conts === 9 && sc.contRight === sc.conts, `… and every line an item runs on to under its text (${sc.contRight} of ${sc.conts})`);
};
