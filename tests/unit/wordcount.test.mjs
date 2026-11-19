// Word Counter: textkit.wasm (wasm/textkit — the unicode-segmentation crate + our counting rules) and
// src/lib/wordcount.ts, held to
//   · tests/fixtures/wordcount/reference.json (python3 scripts/make-wordcount-reference.py): for 34 texts in 16
//     languages the words `wc -w` / Microsoft Word count, the grapheme clusters of Python's `regex` module, pySBD's
//     sentences, and Snowball's English stop words;
//   · ICU (Node's Intl.Segmenter, the same Unicode version as the crate) on thousands of random strings;
//   · counts made by hand, with what the tab showed before where it was wrong.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindTextkit } = await load('/src/wasm/textkit.ts');
  const W = await load('/src/lib/wordcount.ts');
  const kit = bindTextkit(await wasm('textkit'));
  const stats = (s) => W.textStats(s, kit);
  const corpus = JSON.parse(readFileSync(join(root, 'tests/fixtures/wordcount/corpus.json'), 'utf8'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/wordcount/reference.json'), 'utf8'));
  let seed = 20261119; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32), pick = (a) => a[Math.floor(rnd() * a.length)];

  // ---- the corpus against the other programs
  // pySBD is wrong on two texts (read them: three sentences each) — it ends a sentence inside a web address
  // ("…/apply?" | "year=2026…") and inside ".NET" ("The ." | "NET client…")
  const PYSBD_WRONG = { 'en-web': 3, 'en-tech': 3 };
  let bad = [];
  for (const c of corpus) {
    const s = stats(c.text), r = { ...ref.texts[c.id] };
    if (c.id in PYSBD_WRONG) { if (r.sentences === PYSBD_WRONG[c.id]) bad.push(`${c.id}: pySBD is right now — take it off the list`); r.sentences = PYSBD_WRONG[c.id]; }
    for (const k of Object.keys(r)) if (s[k] !== r[k]) bad.push(`${c.id}: ${k} ${s[k]}, reference ${r[k]}`);
  }
  t.ok(corpus.length === 34 && Object.keys(ref.texts).length === 34 && !bad.length, `${corpus.length} texts in 16 languages: words as wc -w and Word count them, characters and characters without spaces as Python's regex module sees them, lines and paragraphs, and for the 17 English ones the sentences of pySBD ${bad.slice(0, 5).join(' | ')}`);

  // ---- characters against ICU: the corpus and 4,000 random strings of the code points the rules are about
  const cluster = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const SPACE = /^[\t-\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/; // Unicode's White_Space
  const icuChars = (s) => { let n = 0, ns = 0; for (const g of cluster.segment(s)) { n++; if (!SPACE.test(g.segment)) ns++; } return [n, ns]; };
  const sameUnicode = process.versions.unicode === '17.0';
  const POOL = ['a', 'b', 'Z', '1', ' ', ' ', '\r', '\n', '\t', '.', '-', '\u00a0', 'é', '\u0301', '\u0308', '\u200d', '\u200c', '\ufe0f', '\u20e3', '👍', '🏽', '👨', '👩', '👧', '❤', '🏳', '🌈', '🇮', '🇳', '🇺', 'ᄀ', '\u1161', 'ᆨ', '한', 'क', 'ष', 'न', '्', 'ि', '़', 'ি', 'க', '்', '\u0600', 'ب', '\u064e', 'ก', 'ำ', 'ั', '中', 'あ', 'ー', '\u{e0061}', '\u{e007f}', '\u2028', '\u3000', '\u00ad', '\u034f'];
  bad = [];
  const texts = corpus.map((c) => c.text);
  for (let i = 0; i < 4000; i++) texts.push(Array.from({ length: 1 + Math.floor(rnd() * 24) }, () => pick(POOL)).join(''));
  for (const s of texts) { const [n, ns] = icuChars(s), o = kit.stats(s); if (o.chars !== n || o.noSpace !== ns) bad.push(`${JSON.stringify(s)}: ${o.chars} / ${o.noSpace}, ICU ${n} / ${ns}`); }
  t.ok(!sameUnicode || !bad.length, sameUnicode ? `characters and characters without spaces equal ICU's grapheme clusters for ${texts.length} texts — emoji sequences, flags, keycaps, Hangul jamo, Indic conjuncts, CR LF, a number sign before a digit, tag characters ${bad.slice(0, 3).join(' | ')}` : `(skipped: this Node has Unicode ${process.versions.unicode}, the engine 17.0)`);
  for (const [s, n, what] of [['👍🏽', 1, 'an emoji with a skin tone'], ['👨\u200d👩\u200d👧\u200d👦', 1, 'a family joined by zero-width joiners'], ['🇮🇳', 1, 'a flag'], ['🇮🇳🇺🇸', 2, 'two flags'], ['नमस्ते', 3, 'न म स्ते (the conjunct स्ते is one)'], ['क्ष', 1, 'the conjunct क्ष'], ['e\u0301', 1, 'e with a combining accent'], ['\r\n', 1, 'CR LF'], ['\n\r', 2, 'LF CR'], ['한국', 2, 'two Hangul syllables'], ['ᄒ\u1161\u11ab', 1, 'one syllable written as three jamo'], ['1\ufe0f\u20e3', 1, 'a keycap'], ['a\u200db', 2, 'a joiner between letters'], ['', 0, 'nothing']])
    t.eq(stats(s).chars, n, `characters: ${what} — ${n}`);

  // ---- sentences against ICU and against the count they were built with (no abbreviation among the words)
  const VOCAB = 'river mountain yellow quickly garden window between morning silver travel market number simple people animal school letter coffee planet stream'.split(' ');
  const sent = new Intl.Segmenter('en', { granularity: 'sentence' });
  bad = [];
  for (let i = 0; i < 1500; i++) {
    const n = 1 + Math.floor(rnd() * 6);
    const text = Array.from({ length: n }, () => { const w = Array.from({ length: 2 + Math.floor(rnd() * 7) }, () => pick(VOCAB)); return w[0][0].toUpperCase() + w[0].slice(1) + ' ' + w.slice(1).join(pick([' ', ', ', ' – ', '; '])) + pick(['. ', '. ', '? ', '! ', '.\n', '.\n\n', '."\n', '!) '])}).join('');
    const icu = [...sent.segment(text)].filter((x) => /[\p{L}\p{N}]/u.test(x.segment)).length, ours = kit.stats(text).sentences;
    if (ours !== n || icu !== n) bad.push(`${JSON.stringify(text.slice(0, 80))}: ${ours}, ICU ${icu}, built with ${n}`);
  }
  t.ok(!bad.length, `1,500 generated texts of 1 – 6 sentences: the count they were built with, ICU's and ours agree ${bad.slice(0, 3).join(' | ')}`);

  // ---- counted by hand: [text, words, sentences, what — and what the tab showed before]
  for (const [s, words, sentences, what] of [
    ['The U.S.A. is big, e.g. Texas.', 6, 1, 'abbreviations with full stops are one word each (in Chrome the tab counted U, S, A, e, g: 9 words)'],
    ['See https://example.com/path?x=1 now', 3, 1, 'a web address is one word (was 6) and ends no sentence at its "?"'],
    ['mail me at a.b@example.co.in now', 5, 1, 'an e-mail address is one word (was 5 words of its own)'],
    ['on 10/11/2026 at 9:30 or 16:9, 1/2', 7, 1, 'a date, a time, a ratio and a fraction are one word each (was 12)'],
    ['well\u2011known co\u2010op e-mail', 3, 1, 'the three hyphens (-, \u2010, the non-breaking \u2011) join; the non-breaking one did not'],
    ['state-of-the-art', 1, 1, 'a compound of several parts'],
    ["rock'n'roll don’t o’clock", 3, 1, 'apostrophes, straight and curly'],
    ['and/or km/h TCP/IP', 3, 1, 'a slash inside a word, as Word counts'],
    ['AT&T R&D Tom & Jerry', 4, 1, 'an ampersand inside a name; a free-standing one is no word'],
    ['C++ and C# and .NET', 5, 1, 'signs around a word; ".NET" does not end a sentence'],
    ['#tag @user $5.99 50%', 4, 1, 'signs in front and behind'],
    ['3,000 1.5e3 1,00,000 −5', 4, 1, 'numbers are words'],
    ["don't stop—it's 3.5 km, e-mail me", 7, 1, 'an em dash separates two words'],
    ['stop—go wait...what x--y Mumbai–Pune', 8, 1, 'a dash or an ellipsis between two words separates them'],
    ['pages 10–12, 2019–2026', 3, 1, 'a range of numbers stays one word'],
    ['yes,no what?now', 4, 2, 'a missing space after a comma or a question mark'],
    ['word(s) f(x)', 2, 1, 'brackets inside a word'],
    ['5 – 7 * 3 = …', 3, 1, 'free-standing signs are no words'],
    ['👍🏽 नमस्ते दुनिया café', 3, 1, 'Hindi and accents; an emoji is no word'],
    ['है।यह ठीक है॥', 4, 2, 'a danda separates, with or without a space'],
    ['中华人民共和国是一个国家', 12, 1, 'every Chinese character is a word, as in Word'],
    ['これは日本語の文章です。東京2026年', 15, 2, 'kana and kanji a word each, the number one word'],
    ['한국어 문장 입니다', 3, 1, 'Korean is written with spaces'],
    ['', 0, 0, 'nothing'], ['   \n\t ', 0, 0, 'white space only'], ['… — *** !!!', 0, 0, 'marks only'],
    ['Dr. Smith went to Washington. He arrived at 3 p.m. yesterday.', 11, 2, 'no sentence ends after "Dr." (the tab said 3)'],
    ['Mr. Rao met Mrs. Iyer. They spoke.', 7, 2, 'two titles (the tab said 4)'],
    ['Smt. Lakshmi and Shri. Ram came. They sat.', 8, 2, 'Indian titles'],
    ['It costs Rs. 500. Cheap!', 5, 2, '"Rs." before a number (the tab said 3)'],
    ['No. 5 is alive. Fig. 3 shows it.', 8, 2, '"No." and "Fig." before a number'],
    ['The answer is No. That is final.', 7, 2, '… but "No." before a word ends the sentence'],
    ['A. P. J. Abdul Kalam was here. M. S. Dhoni played.', 11, 2, 'initials (the tab counted each as a sentence)'],
    ['So do I. Then we left.', 6, 2, '"I." is no initial'],
    ['e.g. this, i.e. that, etc. And more.', 7, 2, 'e.g. and i.e.'],
    ['India vs. Australia. Who won?', 5, 2, 'vs.'],
    ['She lives in the U.S. Her brother lives in the U.K. They meet often.', 14, 3, 'an abbreviation that may end a sentence does, before a capital'],
    ['Wait... what? Yes!', 3, 2, 'an ellipsis inside a sentence'],
    ['He said "Stop." Then left.', 5, 2, 'a full stop inside quotes'],
    ['"Why now?" he asked. "Stop!" she cried. (Really?) Yes.', 9, 4, 'a quoted question goes on in lower case'],
    ['Really? yes. What! No.', 4, 4, 'short sentences'],
    ['Hello.\n\n***\n\nWorld.', 2, 2, 'a row of asterisks is no sentence (the tab said 3)'],
    ['Title\nBody text here.', 4, 2, 'a heading without a full stop is a sentence of its own'],
    ['- one\n- two\n- three', 3, 3, 'a list: a line each'],
    ['नमस्ते। आप कैसे हैं? ठीक।', 5, 3, 'Hindi sentences'],
    ['你好。再见！好吗？', 6, 3, 'Chinese sentences need no space'],
  ]) { const r = stats(s); t.ok(r.words === words && r.sentences === sentences, `${JSON.stringify(s)}: ${words} words, ${sentences} sentences — ${what} (${r.words}, ${r.sentences})`); }

  // ---- lines and paragraphs: [text, lines, paragraphs, what]
  for (const [s, lines, paragraphs, what] of [
    ['', 0, 0, 'nothing'], ['one', 1, 1, 'one line'], ['a\nb', 2, 2, 'two lines'], ['a\nb\n', 2, 2, 'a line break at the end starts no third line (the tab said 3)'],
    ['a\n\nb', 3, 2, 'a blank line between'], ['a\n\n\n\nb\n\n', 6, 2, 'several blank lines'], ['\n\na', 3, 1, 'blank lines first'],
    ['Para one.\nPara two.\nPara three.', 3, 3, 'no blank line anywhere: a paragraph a line (the tab said 1 paragraph)'],
    ['Line one\nline two\n\nSecond block\nmore', 5, 2, 'with a blank line, blocks are the paragraphs'],
    ['a\n \t \nb', 3, 2, 'a line of spaces is blank'], ['a\n***\nb', 3, 2, 'a row of asterisks separates like a blank line'], ['a\n---\nb\nc', 4, 2, '… and so does a row of dashes'],
    ['😀\n\n😀', 3, 2, 'an emoji makes a paragraph'], ['x\r\ny\r\n\r\nz', 4, 2, 'Windows line ends'], ['x\ry\rz', 3, 3, 'old Mac line ends'], ['a\u2028b\u2029c', 3, 3, 'Unicode line and paragraph separators'],
    ['   ', 1, 0, 'spaces: a line, no paragraph'], ['\n', 1, 0, 'one empty line'], ['\n\n', 2, 0, 'two empty lines'],
  ]) { const r = stats(s); t.ok(r.lines === lines && r.paragraphs === paragraphs, `${JSON.stringify(s)}: ${lines} lines, ${paragraphs} paragraphs — ${what} (${r.lines}, ${r.paragraphs})`); }

  // ---- Thai, Lao, Khmer, Myanmar: the browser's dictionary counts the words (here: Node's ICU)
  const wordSeg = new Intl.Segmenter('en', { granularity: 'word' });
  for (const [s, extra, what] of [['สวัสดีครับผมชื่อสมชาย', 0, 'Thai'], ['ຂ້ອຍມັກກິນເຂົ້າ', 0, 'Lao'], ['ខ្ញុំចូលចិត្តញ៉ាំបាយ', 0, 'Khmer'], ['ကျွန်တော်ထမင်းစားတယ်', 0, 'Myanmar'], ['ราคา100บาท abcไทย', 2, 'Thai with a number and Latin letters inside']]) {
    const dict = [...wordSeg.segment(s.replace(/[a-z0-9 ]+/g, ' '))].filter((x) => x.isWordLike).length, r = stats(s);
    t.ok(dict >= 2 && r.words === dict + extra && kit.stats(s).words === extra, `${what}: ${dict + extra} words — the dictionary's ${dict}${extra ? ` and ${extra} others` : ''} (${r.words}; the engine alone ${kit.stats(s).words})`);
  }
  { const r = stats('สวัสดี ครับ'); t.eq(r.avgWord, r.wordChars / r.words, 'their characters count towards the average word length'); t.ok(r.wordChars === icuChars('สวัสดีครับ')[0], `… as clusters (${r.wordChars})`); }

  // ---- average word length, in characters as the tab counts them
  t.eq(stats('Mumbai trains run').avgWord, 15 / 3, 'average word length');
  t.eq(stats('नमस्ते दुनिया').avgWord, 6 / 2, 'in characters, not code points (नमस्ते is 3, दुनिया is 3)');
  t.eq(stats('"Stop." (now)').avgWord, 7 / 2, 'without the marks around a word');
  t.eq(stats('').avgWord, 0, 'no words: 0');

  // ---- keywords
  const top = (s) => stats(s).top.map(([w, n]) => `${w} ${n}`).join(', ');
  t.eq(top('Mumbai trains. Mumbai rains and Mumbai food. The trains are crowded; the food is great, great food.'), 'mumbai 3, food 3, trains 2, great 2', 'the most used first; equal counts in the order of first use');
  t.eq(top('The cat sat. The cat ran! A dog ran 2026 2026 2026 times; dog dog. Ox ox ox.'), 'dog 3, cat 2, ran 2', 'no numbers, no words of one or two letters, no words used once');
  t.eq(top("India’s food, India's trains, INDIA."), 'india 3', "capitals, a possessive 's and a curly apostrophe count with the plain word");
  t.eq(top("It's it's it’s don't don't very very very"), '', 'contractions and "very" say nothing about a text (the tab listed "it\'s" and "very")');
  t.eq(top('नमस्ते दुनिया नमस्ते है है'), 'नमस्ते 2, है 2', 'Hindi: short words stay (the rule of three letters is for alphabets)');
  t.eq(top('中国 中国 中国 的 的'), '', 'single Chinese characters are no keywords');
  t.eq(top('e-mail E-mail km/h km/h U.S.A. U.S.A. 3.5 3.5'), 'e-mail 2, km/h 2, u.s.a 2', 'compound words whole; a number is none');
  t.eq(top('see https://example.com https://example.com https://example.com see see'), 'see 3', 'a web address is no keyword');
  t.eq(stats(Array.from({ length: 30 }, (_, i) => `word${String.fromCharCode(97 + i % 26)}${i} word${String.fromCharCode(97 + i % 26)}${i}`).join(' ')).top.length, 10, 'ten at most');
  t.eq(top(ref.stop.map((w) => `${w} ${w} ${w}`).join('. ')), '', `none of Snowball's ${ref.stop.length} English stop words is ever a keyword`);
  t.ok(ref.stop.length === 174, 'the stop-word reference has 174 words');

  // ---- reading and speaking time
  for (const [words, wpm, text] of [[0, 238, '—'], [1, 238, '1 sec'], [2, 238, '1 sec'], [100, 238, '25 sec'], [235, 238, '59 sec'], [237, 238, '1 min'], [238, 238, '1 min'], [357, 238, '2 min'], [476, 238, '2 min'], [476, 150, '3 min'], [14042, 238, '59 min'],
    [14200, 238, '1 hr 0 min'], [100000, 238, '7 hr 0 min'], [100000, 150, '11 hr 7 min'], [NaN, 238, '—']]) t.eq(W.timeText(words, wpm), text, `${words} words at ${wpm} a minute: ${text}`);
  t.ok(W.READING_WPM === 238 && W.SPEAKING_WPM === 150, 'reading 238 words a minute, speaking 150');

  // ---- nothing breaks it
  bad = [];
  for (const s of ['\ud83d', 'a\udc00b', '\u0000\u0000', 'a\u0000b c', '\ufeffHello', '.'.repeat(5000), '-'.repeat(5000), 'a.'.repeat(5000), '?!'.repeat(3000) + 'x', '('.repeat(3000) + 'x', 'x' + '\u0301'.repeat(4000), '👨\u200d'.repeat(2000), 'a\n'.repeat(20000), 'https://' + 'a'.repeat(50000), '@'.repeat(100) + '.', 'mailto:', 'www.', '://', 'a@b', '@.', 'x@y.z']) {
    try { const r = stats(s); for (const k of ['words', 'chars', 'noSpace', 'sentences', 'paragraphs', 'lines', 'wordChars', 'bytes']) if (!Number.isInteger(r[k]) || r[k] < 0) bad.push(`${JSON.stringify(s.slice(0, 20))}: ${k} ${r[k]}`); if (r.noSpace > r.chars || r.words > r.chars) bad.push(`${JSON.stringify(s.slice(0, 20))}: more words or non-spaces than characters`); }
    catch (e) { bad.push(`${JSON.stringify(s.slice(0, 20))}: ${e.message}`); }
  }
  for (let i = 0; i < 1500; i++) { const s = Array.from({ length: Math.floor(rnd() * 40) }, () => String.fromCharCode(Math.floor(rnd() * (i % 3 ? 0x250 : 0xffff)))).join(''); try { const r = stats(s); if (r.noSpace > r.chars || r.lines < 0) bad.push(JSON.stringify(s)); } catch (e) { bad.push(`${JSON.stringify(s)}: ${e.message}`); } }
  t.ok(!bad.length, `lone surrogates, NUL, thousands of marks, a 50,000-letter address, 1,500 strings of random code units: always whole, sensible numbers ${bad.slice(0, 3).join(' | ')}`);
  t.eq(stats('\ud83d').chars, 1, 'half an emoji is one (replacement) character');
  t.ok(stats('') === W.EMPTY && W.EMPTY.words === 0 && W.EMPTY.top.length === 0, 'an empty text needs no engine');

  // ---- a book: the same counts, in reasonable time
  { const para = corpus.find((c) => c.id === 'en-plain').text, one = stats(para), n = 5000, t0 = performance.now(), r = stats(Array(n).fill(para).join('\n\n')), ms = performance.now() - t0;
    t.ok(r.words === one.words * n && r.sentences === one.sentences * n && r.paragraphs === n && r.lines === 2 * n - 1 && r.chars === one.chars * n + 2 * (n - 1), `a text of ${r.words.toLocaleString('en-IN')} words (1.2 MB) is counted exactly`);
    t.ok(ms < 3000, `… in ${Math.round(ms)} ms`); }
};
