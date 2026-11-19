// Case Converter: the conversions of textkit.wasm (wasm/textkit/src/case.rs), held to
//   · the Python package `titlecase` 2.4.1 (John Gruber's rules) on 203 titles — its own 72 test titles and 131 more
//     (tests/fixtures/caseconv/reference.json, python3 scripts/make-case-reference.py);
//   · npm's `change-case` 5.4.4 for the code cases on 3,000 generated names;
//   · ICU (Node) for upper and lower case;
//   · answers worked out by hand, with what the tab showed before where it was wrong.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as CC from 'change-case';

export default async (t, { load, wasm, root }) => {
  const { bindTextkit } = await load('/src/wasm/textkit.ts');
  const { CASE_NAMES, CASE_HINTS, SHOWN, shownPart } = await load('/src/lib/caseconv.ts');
  const kit = bindTextkit(await wasm('textkit'));
  const conv = (s) => Object.fromEntries(kit.cases(s).map((v, i) => [CASE_NAMES[i], v]));
  const one = (name) => (s) => kit.cases(s)[CASE_NAMES.indexOf(name)];
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/caseconv/reference.json'), 'utf8'));
  let seed = 20261120; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32), pick = (a) => a[Math.floor(rnd() * a.length)];
  t.eq(CASE_NAMES.length, 13, 'thirteen conversions'); t.eq(kit.cases('x').length, 13, '… and the engine returns thirteen');
  t.ok(CASE_NAMES.every((n) => CASE_HINTS[n]?.length > 10), 'each has its explanation');

  // ------------------------------------------------------------------ Title Case
  const title = one('Title Case');
  // Where the engine differs from the Python package on purpose: title → [ours, why]
  const DIFFERENT = {
    'Words with all consonants like cnn are acronyms': ['Words With All Consonants Like Cnn Are Acronyms', 'no guessing that a word without vowels is an acronym …'],
    'Mr mr Mrs Ms Mss Dr dr , Mr. and Mrs. Person': ['Mr Mr Mrs Ms Mss Dr Dr , Mr. And Mrs. Person', '… ("Mss" became "MSS") …'],
    'gst invoice for the upi payment': ['Gst Invoice for the Upi Payment', '… (the package writes "GST" but "Upi": a guess by vowels) …'],
    'tcp/ip and http/2': ['Tcp/Ip and Http/2', '… (the package writes "TCP/Ip")'],
    'mccay-mcbut-mcdo mcdonalds/mcby': ['McCay-McBut-Mcdo McDonalds/Mcby', '"Mc" is completed only with three letters behind it (else "mcqs" becomes "McQs")'],
    'mcfoo-bar, MCFOO-BAR, McFoo-bar, McFoo-Bar, mcfoo-mcbar, foo-mcbar': ['McFoo-Bar, MCFOO-BAR, McFoo-Bar, McFoo-Bar, McFoo-McBar, Foo-McBar', 'capitals the writer typed in a line that is not all capitals stay (MCQs, MCLR, MCOCA would become McQs …)'],
  };
  let bad = [], stale = [];
  for (const [text, want] of ref.titles) {
    const got = title(text), d = DIFFERENT[text];
    if (d) { if (got !== d[0]) bad.push(`${JSON.stringify(text)}: ${JSON.stringify(got)}, expected our ${JSON.stringify(d[0])}`); if (want === d[0]) stale.push(text); }
    else if (got !== want) bad.push(`${JSON.stringify(text)}: ${JSON.stringify(got)}, the package ${JSON.stringify(want)}`);
  }
  t.ok(ref.titles.length === 203 && ref.package === 72 && !bad.length, `Title Case equals the Python package titlecase on ${ref.titles.length - Object.keys(DIFFERENT).length} of ${ref.titles.length} titles (its own 72 tests among them); the ${Object.keys(DIFFERENT).length} others are the listed differences ${bad.slice(0, 3).join(' | ')}`);
  t.ok(!stale.length && Object.keys(DIFFERENT).every((k) => ref.titles.some(([x]) => x === k)), `every listed difference is one still (${stale.join(' | ')})`);
  for (const [text, want, what] of [
    ['don’t stop me now', 'Don’t Stop Me Now', 'a typographic apostrophe is inside the word (the tab wrote "Don’T")'],
    ['the NASA iPhone app', 'The NASA iPhone App', 'capitals inside a word are the writer\'s (the tab wrote "The Nasa Iphone App")'],
    ['war and peace\nof mice and men', 'War and Peace\nOf Mice and Men', 'every line is a title: "Of" opens the second (the tab wrote "of Mice and Men")'],
    ['what is it for? a tale of two', 'What Is It For? A Tale of Two', 'after a question mark a new part begins (the tab wrote "for? a Tale")'],
    ['read more at example.com today', 'Read More at example.com Today', 'an address stays as typed (the tab wrote "Example.Com")'],
    ['THE LORD OF THE RINGS', 'The Lord of the Rings', 'a line in capitals is taken as shouting, not as acronyms'],
    ['tata motors pvt ltd', 'Tata Motors Pvt Ltd', 'no acronym guessing (the Python package writes "PVT LTD")'],
    ['learn html and css in 24 hrs', 'Learn Html and Css in 24 Hrs', '… a capital the writer did not type is not invented beyond the first letter'],
    ['MCQs for class 10', 'MCQs for Class 10', 'an acronym that begins with MC (the package writes "McQs")'],
    ['mcqs and mclr rates', 'Mcqs and Mclr Rates', '… also typed small'],
    ['mcdonald, mccoy and MacDonald', 'McDonald, McCoy and MacDonald', 'Mc names'],
    ['see example.at', 'See example.at', 'an address at the end is not "example.At" (the package)'],
    ['visit: about.me today', 'Visit: about.me Today', '… nor ": About.me" after a colon'],
    ['javascript: toString explained', 'Javascript: toString Explained', 'a name typed with a capital inside stays whole (the package: "ToString")'],
    ['  a tale of', '  A Tale Of', 'the first word of a line that begins with spaces'],
    ['a tale\tof\ttwo', 'A Tale\tof\tTwo', 'tabs stay tabs'],
    ['o’neil and d’artagnan', 'O’Neil and d’Artagnan', 'O’ and d’ names with a typographic apostrophe'],
    ['one\r\n\r\ntwo of\rthree', 'One\r\n\r\nTwo Of\rThree', 'line ends of every kind are kept as they are'],
    ['नमस्ते दुनिया', 'नमस्ते दुनिया', 'a script without capitals passes through'],
    ['', '', 'nothing'],
  ]) t.eq(title(text), want, `Title Case ${JSON.stringify(text)} — ${what}`);
  { const words = Array.from({ length: 100000 }, (_, i) => pick(['the', 'quick', 'brown', 'fox', 'of', 'and', 'jumps'])).join(' '), t0 = performance.now(), r = title(words), ms = performance.now() - t0;
    t.ok(r.split(' ').length === 100000 && r.startsWith(r[0].toUpperCase()) && ms < 4000, `a line of 100,000 words in ${Math.round(ms)} ms (the tab searched its word list once for every word: 7 s a keystroke at 80,000 words, four times that at twice the length)`); }

  // ------------------------------------------------------------------ UPPER and lower: ICU's answers
  const LETTERS = ['a', 'B', 'z', 'é', 'É', 'ß', 'ẞ', 'ŉ', 'ǆ', 'ǅ', 'Ǆ', 'σ', 'ς', 'Σ', 'ά', 'Ω', 'İ', 'ı', 'i', 'I', 'ﬁ', 'ﬀ', 'ж', 'Я', 'ა', 'Ა', 'ꮳ', 'Ꮳ', '𐐨', '𐐀', '𞤢', '𞤀', 'ⓐ', 'Ⅷ', 'ⅷ', 'ǰ', 'ΐ', 'ᾳ', 'ᾼ', 'न', 'क', '中', '1', ' ', ' ', '-', '.', "'", '\n', '\u0301', '\u0345'];
  bad = [];
  const samples = ['The quick brown fox', 'ΟΔΟΣ ΚΑΙ ΟΔΟΣ', 'Straße, weiß und groß', 'İstanbul ıssız', 'ǆungla Ǆ ǅ', 'ﬁrst ﬂight', 'ᾳδης', 'נָּ', 'नमस्ते'];
  for (let i = 0; i < 2500; i++) samples.push(Array.from({ length: 1 + Math.floor(rnd() * 16) }, () => pick(LETTERS)).join(''));
  for (const s of samples) { const c = kit.cases(s); if (c[0] !== s.toUpperCase() || c[1] !== s.toLowerCase()) bad.push(`${JSON.stringify(s)}: ${JSON.stringify([c[0], c[1]])}, ICU ${JSON.stringify([s.toUpperCase(), s.toLowerCase()])}`); }
  t.ok(!bad.length, `UPPER CASE and lower case equal ICU's for ${samples.length} texts — ß → SS, the final sigma, ﬁ → FI, İ, ǆ, Georgian, Cherokee, Deseret, Adlam, iota subscripts ${bad.slice(0, 3).join(' | ')}`);
  t.eq([kit.cases('TITLE')[1], kit.cases('i')[0]], ['title', 'I'], 'the reader\'s language plays no part: TITLE → title, i → I (a Turkish browser gave "tıtle" and "İ")');

  // ------------------------------------------------------------------ code cases: change-case's answers
  const PIECES = ['foo', 'bar', 'Baz', 'XML', 'Http', 'request', 'ID', 'v2', 'Api', '2', '42', 'x', 'Y', 'iPhone', 'JSONData', 'user', 'élan', 'Über', 'straße', 'ΑΒΓ', 'δ', 'жук', 'A', 'b'], SEPS = [' ', ' ', '_', '-', '.', '', '', '/', ', ', '  ', '__', ' - ', ':', '(', ')', '!'];
  const opt = { mergeAmbiguousCharacters: true };
  const theirs = (s) => [CC.camelCase(s, opt), CC.pascalCase(s, opt), CC.snakeCase(s), CC.kebabCase(s), CC.constantCase(s), CC.dotCase(s)];
  bad = [];
  const names = ['XMLHttpRequest parseJSONData user_id v2Api', 'the quickBrown fox-of the_year', 'Hello, world! How are you?', 'iPhone11Pro HTML5Parser', 'fooBARBaz', 'ABC', 'aB', 'Ab', 'a1B2c3', 'TEST_VALUE', 'some-mixed_string With spaces_underscores-and-hyphens', '  leading and trailing  ', 'version 1.2.10', 'I/O ports', '__proto__', 'getHTTPSUrl2Go'];
  for (let i = 0; i < 3000; i++) names.push(Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => pick(PIECES) + pick(SEPS)).join(''));
  for (const s of names) { const c = kit.cases(s), ours = [c[5], c[6], c[7], c[8], c[9], c[10]], want = theirs(s); if (ours.join('\u0001') !== want.join('\u0001')) bad.push(`${JSON.stringify(s)}: ${JSON.stringify(ours)}, change-case ${JSON.stringify(want)}`); }
  t.ok(!bad.length, `camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE and dot.case equal npm's change-case for ${names.length} names — humps, acronyms, digits, every separator, accents, Greek, Cyrillic ${bad.slice(0, 3).join(' | ')}`);
  for (const [text, want, what] of [
    ["don't stop", 'dont_stop', 'an apostrophe is dropped, not a divider (the tab wrote "don_t_stop", change-case does too)'],
    ['it’s the dog’s', 'its_the_dogs', '… a typographic one as well'],
    ["'quoted' words", 'quoted_words', 'quotation marks around a word are dividers'],
    ['नमस्ते दुनिया', 'नमस्ते_दुनिया', 'Hindi words stay whole (the tab cut them at every vowel sign: "नमस_त_द_निया")'],
    ['cafe\u0301 e\u0301le\u0300ve', 'cafe\u0301_e\u0301le\u0300ve', 'an accent written as a combining mark stays with its letter (the tab dropped it and cut the word)'],
    ['தமிழ் மொழி', 'தமிழ்_மொழி', 'Tamil'], ['한국어 문장', '한국어_문장', 'Korean'], ['中文 字符', '中文_字符', 'Chinese'],
    ['first name\nlast name\n\n  date of birth  ', 'first_name\nlast_name\n\ndate_of_birth', 'one name per line: a list of column names stays a list (the tab joined all lines into one name)'],
    ['a\r\nb c\r\n', 'a\r\nb_c\r\n', 'Windows line ends are kept'],
    ['😀 smile 😀', 'smile', 'an emoji is no part of a name'], ['१२३ संख्या', '१२३_संख्या', 'digits of any script'],
    ['', '', 'nothing'], ['!!! ???', '', 'marks only'],
  ]) t.eq(one('snake_case')(text), want, `snake_case ${JSON.stringify(text)} — ${what}`);
  { const c = conv("o'neil's state-of-the-art e-mail");
    t.eq([c.camelCase, c.PascalCase, c['kebab-case'], c.CONSTANT_CASE, c['dot.case']], ['oneilsStateOfTheArtEMail', 'OneilsStateOfTheArtEMail', 'oneils-state-of-the-art-e-mail', 'ONEILS_STATE_OF_THE_ART_E_MAIL', 'oneils.state.of.the.art.e.mail'], 'the other code cases on the same words'); }

  // ------------------------------------------------------------------ Sentence case
  const sentence = one('Sentence case');
  for (const [text, want, what] of [
    ['HELLO THERE. HOW ARE YOU?', 'Hello there. How are you?', 'capitals'],
    ["HELLO. i think i'm right, i.e. it works! is it? yes", "Hello. I think I'm right, i.e. it works! Is it? Yes", '"I", "I\'m"; not after "i.e."'],
    ['i’ll go. i’ve been. i’d say i am', 'I’ll go. I’ve been. I’d say I am', 'the pronoun with typographic apostrophes'],
    ['hello\nworld\n\nnew paragraph', 'Hello\nWorld\n\nNew paragraph', 'every line begins with a capital (the tab capitalised only the first line)'],
    ['he said. "then we left." (really?) yes', 'He said. "Then we left." (Really?) Yes', 'a sentence may open with a quotation mark or a bracket (the tab left "then" and "really" small)'],
    ['"hello there." she said', '"Hello there." She said', '… also the very first'],
    ["j'ai obéi. il a réussi", "J'ai obéi. Il a réussi", 'French: the i of "obéi" is no pronoun (the tab wrote "obéI")'],
    ['at 5 p.m. we left. at 6 a.m. we came', 'At 5 p.m. we left. At 6 a.m. we came', 'no capital after "p.m." — a single letter before the full stop'],
    ['dr. rao met mr. iyer and prof. das', 'Dr. rao met mr. iyer and prof. das', 'no capital after a title (names cannot be known)'],
    ['a. p. j. abdul kalam spoke. all listened', 'A. p. j. abdul kalam spoke. All listened', 'initials end no sentence'],
    ['so do i. then we left', 'So do I. Then we left', '… but "I." does'],
    ['see fig. 3 for more. no. that is wrong', 'See fig. 3 for more. No. That is wrong', 'a number after "fig."; "No." as an answer'],
    ['wait... what? no way!! really', 'Wait... What? No way!! Really', 'after an ellipsis and after several marks'],
    ['version 2.0 is out. get it', 'Version 2.0 is out. Get it', 'a full stop inside a number'],
    ['visit example.com. it is free', 'Visit example.com. It is free', 'a full stop inside an address'],
    ['ΟΔΟΣ ΑΘΗΝΑΣ. ΤΕΛΟΣ', 'Οδος αθηνας. Τελος', 'Greek: the final sigma'],
    ['नमस्ते। आप कैसे हैं?', 'नमस्ते। आप कैसे हैं?', 'Hindi passes through'],
    ['', '', 'nothing'], ['   hello', '   Hello', 'spaces first'], ['123 go. 456 stop', '123 go. 456 stop', 'a sentence that opens with a number gets no capital further in'],
  ]) t.eq(sentence(text), want, `Sentence case ${JSON.stringify(text)} — ${what}`);

  // ------------------------------------------------------------------ Capitalized Case
  for (const [text, want, what] of [
    ['the quick brown fox of the year', 'The Quick Brown Fox Of The Year', 'every word, the small ones too'],
    ["don't STOP me now", "Don't Stop Me Now", 'the rest small; an apostrophe is inside the word'],
    ['state-of-the-art e-mail', 'State-Of-The-Art E-Mail', 'after a hyphen'], ['and/or (maybe) "quoted"', 'And/Or (Maybe) "Quoted"', 'after a slash, a bracket, a quotation mark'],
    ['2nd 3d x2', '2nd 3d X2', 'a word that begins with a digit has no first letter to raise'], ['ΟΔΟΣ ΑΘΗΝΑΣ', 'Οδος Αθηνας', 'Greek with its final sigma'],
    ['line one\nline two', 'Line One\nLine Two', 'lines'], ['', '', 'nothing'],
  ]) t.eq(one('Capitalized Case')(text), want, `Capitalized Case ${JSON.stringify(text)} — ${what}`);

  // ------------------------------------------------------------------ alternating and inverse: as they always were
  bad = [];
  for (const s of samples.slice(0, 800)) {
    const c = kit.cases(s), alt = [...s].map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join(''), inv = [...s].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
    if (c[11] !== alt || c[12] !== inv) bad.push(JSON.stringify(s));
  }
  t.ok(!bad.length, `aLtErNaTiNg (by position) and iNVERSE are letter for letter what the tab made before, on 800 texts ${bad.slice(0, 3).join(' | ')}`);
  t.eq([one('aLtErNaTiNg')('hello world'), one('iNVERSE')('Hello World 42')], ['hElLo wOrLd', 'hELLO wORLD 42'], 'the two in a known case');

  // ------------------------------------------------------------------ whatever the text
  bad = [];
  const breaks = (s) => (s.match(/\r\n|[\n\r\u2028\u2029]/g) || []).join('');
  const wild = ['\ud83d', 'a\udc00b', '\u0000x\u0000', 'x'.repeat(50000), ('ab '.repeat(3000) + '\n').repeat(5), '\n\n\n', ' \t ', "'''", '----', '////', 'a-/-b', "d'", "o'", 'mc', 'Mc', 'mcx', 'vs.', 'v.', '.', 'i', "i'm"];
  for (let i = 0; i < 1500; i++) wild.push(Array.from({ length: Math.floor(rnd() * 30) }, () => (rnd() < 0.2 ? pick(['\n', '\r\n', ' ', '\t', "'", '-', '/', '.', ':', '"']) : String.fromCharCode(Math.floor(rnd() * (i % 3 ? 0x250 : 0xffff))))).join(''));
  for (const s of wild) {
    try {
      const c = kit.cases(s), clean = new TextDecoder().decode(new TextEncoder().encode(s));
      if (c.length !== 13 || c.some((v) => typeof v !== 'string')) bad.push(`${JSON.stringify(s.slice(0, 30))}: not thirteen texts`);
      else if (c.some((v) => breaks(v) !== breaks(clean))) bad.push(`${JSON.stringify(s.slice(0, 30))}: line breaks changed in ${CASE_NAMES[c.findIndex((v) => breaks(v) !== breaks(clean))]}`);
      else if (kit.cases(c[0])[0] !== c[0] || kit.cases(c[1])[1] !== c[1] || kit.cases(c[7])[7] !== c[7]) bad.push(`${JSON.stringify(s.slice(0, 30))}: converting twice changes the result`);
    } catch (e) { bad.push(`${JSON.stringify(s.slice(0, 30))}: ${e.message}`); }
  }
  t.ok(!bad.length, `${wild.length} wild texts (lone surrogates, NUL, 50,000 letters, random code units): thirteen results, every line break kept in each, UPPER / lower / snake_case stable when applied twice ${bad.slice(0, 3).join(' | ')}`);
  bad = ref.titles.map(([x]) => title(x)).filter((v) => title(v) !== v);
  t.ok(bad.length <= 3, `a title put through Title Case again stays as it is (${ref.titles.length - bad.length} of ${ref.titles.length}; the others: ${bad.map((x) => JSON.stringify(x)).join(', ')})`);

  // ------------------------------------------------------------------ what is put on screen
  t.eq(shownPart('abc'), 'abc', 'a short result is shown whole');
  { const long = 'x'.repeat(SHOWN + 5); t.ok(shownPart(long).length === SHOWN + 1 && shownPart(long).endsWith('…'), `a long one up to ${SHOWN} characters and "…"`); }
  { const s = 'x'.repeat(SHOWN - 1) + '😀yy', p = shownPart(s); t.ok(p === 'x'.repeat(SHOWN - 1) + '…', 'never half an emoji at the cut'); }
};
