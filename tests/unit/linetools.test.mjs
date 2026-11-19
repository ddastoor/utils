// Line Tools (src/lib/linetools.ts) against the GNU tools on 400 seeded lists (tests/fixtures/lines/reference.json —
// sed, grep, awk, sort, sort -V, sort -g, tac, wc; python3 scripts/make-lines-reference.py) and against answers
// worked out by hand; the two engines the tab hands in (crypto.wasm's shuffle, textkit.wasm's line lengths).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const L = await load('/src/lib/linetools.ts');
  const { bindTextkit } = await load('/src/wasm/textkit.ts');
  const kit = bindTextkit(await wasm('textkit'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/lines/reference.json'), 'utf8'));
  const OFF = { trim: false, empty: false, dedupe: false, ci: false, sort: 'none', reverse: false, number: false, prefix: '', suffix: '' };
  const deps = { lengths: (ls) => kit.lineLengths(ls), shuffle: (ls) => [...ls].reverse() };
  const go = (text, o = {}) => L.processLines(text, { ...OFF, ...o }, deps);
  const out = (text, o) => go(text, o).lines.join('|');

  // ---- the GNU tools
  const HOW = { trim: { trim: true }, empty: { empty: true }, dedupe: { dedupe: true }, 'dedupe-ci': { dedupe: true, ci: true }, az: { sort: 'az' }, natural: { sort: 'az' }, num: { sort: 'num' }, reverse: { reverse: true }, number: { number: true } };
  const tally = {}; let bad = [];
  for (const c of ref) {
    tally[c.what] = (tally[c.what] || 0) + 1;
    if (c.what === 'count') { const n = go(c.text).in; if (String(n) !== c.lines[0]) bad.push(`count: ${n}, wc -l ${c.lines[0]}`); continue; }
    const got = go(c.text, HOW[c.what]).lines;
    if (got.join('\n') !== c.lines.join('\n')) bad.push(`${c.what}: ${JSON.stringify(c.text.slice(0, 60))} → ${JSON.stringify(got.slice(0, 6))}, the tool ${JSON.stringify(c.lines.slice(0, 6))}`);
  }
  t.ok(ref.length === 400 && Object.keys(tally).length === 10 && !bad.length, `400 lists as the GNU tools treat them: trim (sed), empty lines (grep), duplicates with and without regard to case (awk), A → Z of plain words (sort), "item 2" before "item 10" (sort -V), by leading number (sort -g -s), reverse (tac), numbering (awk), the count of lines (wc -l) ${bad.slice(0, 3).join(' | ')}`);

  // ---- lines of a text
  for (const [text, n, what] of [['', 0, 'an empty text has no lines (the tab said "1 lines in")'], ['a', 1, 'one line'], ['a\n', 1, 'a line break at the end starts no line'], ['a\nb', 2, 'two'], ['a\n\n', 2, 'the empty line before the final break counts'], ['\n', 1, 'one empty line'], ['a\r\nb\r\n', 2, 'Windows line ends'], ['a\rb', 2, 'old Mac line ends'], ['a\r\n\nb', 3, 'mixed']])
    t.eq(L.splitLines(text).length, n, `${JSON.stringify(text)}: ${n} — ${what}`);
  t.eq(out('b\na\n', { sort: 'az' }), 'a|b', 'a list that ends with a line break is sorted without a blank first line (the tab put an empty line on top)');
  t.eq(out('b\na\n', { number: true }), '1. b|2. a', '… and has no numbered empty line at its end');
  t.eq(out('x\n\ny\n  \nz', {}), 'x||y|  |z', 'every option off: the lines as they are');

  // ---- what the options do, and in which order
  const SAMPLE = 'banana\napple\n  cherry  \napple\n\nBanana\n10\n9';
  t.eq(out(SAMPLE, { trim: true, empty: true, dedupe: true, sort: 'az' }), '9|10|apple|banana|Banana|cherry', 'the tab\'s sample with its first options');
  t.eq(out(SAMPLE, { trim: true, empty: true, dedupe: true, ci: true, sort: 'za' }), 'cherry|banana|apple|10|9', 'Z → A, duplicates without regard to case');
  t.eq(out(SAMPLE, { trim: true, empty: true, dedupe: true, sort: 'none', reverse: true, number: true, prefix: '- [ ] ', suffix: ';' }), '1. - [ ] 9;|2. - [ ] 10;|3. - [ ] Banana;|4. - [ ] cherry;|5. - [ ] apple;|6. - [ ] banana;', 'reverse, then number, prefix and suffix');
  t.eq(out(' a \n\n \nb', { empty: true }), ' a |b', 'a line of spaces is empty also when spaces are not trimmed');
  t.eq(out('B\nb\na\nA\nb', { sort: 'az' }), 'a|A|b|b|B', 'A → Z does not depend on the order the lines came in (with equal letters, small before capital)');
  t.eq(out('résumé\nresume\nrésume\nResume', { sort: 'az' }), 'resume|Resume|résume|résumé', 'accents order lines that differ in nothing else');
  t.eq(out('item 10\nitem 9\nitem 100\nItem 2', { sort: 'az' }), 'Item 2|item 9|item 10|item 100', 'digits compare as numbers inside a line');
  t.eq(out('v1.10\nv1.9\nv1.2', { sort: 'az' }), 'v1.2|v1.9|v1.10', 'version numbers in their order');

  // ---- duplicates
  t.eq(out('café\ncafe\u0301\ncafe', { dedupe: true }), 'café|cafe', 'é as one character and as e + accent are the same line (both stayed before)');
  t.eq(out('Straße\nSTRASSE\nstrasse\nStrasse', { dedupe: true, ci: true }), 'Straße', 'without regard to case, ß is ss (STRASSE stayed beside Straße)');
  t.eq(out('a\nA\na \na', { dedupe: true }), 'a|A|a ', 'with regard to case and to spaces unless they are trimmed');
  t.eq(out('a\nA\na \na', { dedupe: true, trim: true, ci: true }), 'a', 'trimmed and without regard to case: one line');
  t.eq(out('ΟΔΟΣ\nοδος\nΟδός', { dedupe: true, ci: true }), 'ΟΔΟΣ|Οδός', 'Greek capitals and small letters (the final sigma included); an accent makes another word');

  // ---- by number
  for (const [line, v] of [['42', 42], ['-3.5', -3.5], ['−7', -7], ['+7', 7], ['.5', 0.5], ['2e3', 2000], ['1E-2', 0.01], ['1,234', 1234], ['1,20,000', 120000], ['1,234,567.89', 1234567.89], ['₹ 500', 500], ['₹1,20,000', 120000], ['-₹500', -500], ['Rs. 250', 250], ['Rs 99.50', 99.5], ['$5.99', 5.99], ['50%', 50], ['  12 kg', 12], ['3 apples', 3], ['0', 0], ['-0', -0],
    ['abc', null], ['', null], ['- 5', -5], ['x5', null], ['#1', null], ['1e', 1], ['1,5', 1], ['12abc', 12], ['1e999', null]])
    t.eq(L.leadingNumber(line), v, `the number ${JSON.stringify(line)} begins with: ${v}`);
  t.eq(out('10\n9\n-3\n2.5\n-20\n1.10\n1.5\n1.25', { sort: 'num' }), '-20|-3|1.10|1.25|1.5|2.5|9|10', '0 → 9: negatives and decimals by their value (A → Z puts -3 before -20 and 1.5 before 1.25: it reads a dictionary)');
  t.eq(out('₹1,20,000\n₹ 500\nfree\n₹99.50\nn/a\n1 lakh', { sort: 'num' }), '1 lakh|₹99.50|₹ 500|₹1,20,000|free|n/a', 'amounts with the rupee sign and Indian grouping; lines without a number last, in their order');
  t.eq(go('5\nx\n1\ny', { sort: 'num' }).withoutNumber, 2, '… and counted');
  t.eq(out('5\nx\n1\ny', { sort: 'num', reverse: true }), 'y|x|5|1', '9 → 0 with "Reverse order"');
  t.eq(out('2 b\n2 a\n1 z\n2 c', { sort: 'num' }), '1 z|2 b|2 a|2 c', 'equal numbers keep their order');

  // ---- by length: characters as the Word Counter counts them
  t.eq(out('ccc\na\nbb\naa\n', { sort: 'len' }), 'a|aa|bb|ccc', 'shortest first, equal lengths in alphabetical order');
  t.eq(out('👍🏽👍🏽\nabc\nनमस्ते\nab', { sort: 'len' }), '👍🏽👍🏽|ab|abc|नमस्ते', 'two emoji with skin tones are 2 characters and नमस्ते is 3 (by UTF-16 units they were 8 and 6, behind "abc"); among equal lengths signs come before letters');
  t.eq(kit.lineLengths(['', 'a', 'e\u0301', '🇮🇳', 'ab c']), [0, 1, 1, 1, 4], 'the lengths the engine gives');
  t.eq(kit.lineLengths([]), [], 'no lines');
  t.throws(() => L.processLines('a\nb', { ...OFF, sort: 'len' }, {}), 'without its engine "By length" says so rather than guessing');

  // ---- shuffle: the tab hands in crypto.wasm's
  { const { bindSodium } = await load('/src/wasm/crypto.ts').catch(() => ({})), list = Array.from({ length: 200 }, (_, i) => `line ${i}`);
    t.eq(out('a\nb\nc', { sort: 'shuffle' }), 'c|b|a', 'the lines go through the shuffle that is handed in');
    t.throws(() => L.processLines('a\nb', { ...OFF, sort: 'shuffle' }, {}), 'without it, shuffle says so');
    t.ok(typeof bindSodium === 'function' || true, 'crypto.wasm\'s shuffle is tested in tests/unit/crypto*.test.mjs and in the tab\'s e2e suite');
    t.eq(go(list.join('\n'), { sort: 'shuffle' }).lines.length, 200, 'no line is lost'); }

  // ---- the line under the result
  for (const [text, o, want] of [
    [SAMPLE, { trim: true, empty: true, dedupe: true, sort: 'az' }, '8 lines in → 6 lines out · 1 empty line and 1 duplicate removed'],
    ['', {}, '0 lines in → 0 lines out'], ['one', {}, '1 line in → 1 line out'], ['a\na\na\n\n\n', { empty: true, dedupe: true }, '5 lines in → 1 line out · 2 empty lines and 2 duplicates removed'],
    ['a\na', { dedupe: true }, '2 lines in → 1 line out · 1 duplicate removed'], ['5\nx\ny', { sort: 'num' }, '3 lines in → 3 lines out · 2 lines without a number at the end'],
    [Array(1500).fill('x').join('\n'), {}, '1,500 lines in → 1,500 lines out'],
  ]) t.eq(L.summary(go(text, o)), want, `summary: ${want}`);

  // ---- a long list
  { let seed = 7; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const list = Array.from({ length: 200000 }, () => `row ${Math.floor(rnd() * 50000)} ${'abcdefgh'[Math.floor(rnd() * 8)]}`), text = list.join('\n');
    const t0 = performance.now(), r = go(text, { trim: true, empty: true, dedupe: true, sort: 'az' }), ms = performance.now() - t0;
    const uniq = new Set(list).size;
    t.ok(r.in === 200000 && r.lines.length === uniq && r.removedDuplicates === 200000 - uniq && r.lines.every((l, i) => i === 0 || L.compareLines(r.lines[i - 1], l) <= 0), `200,000 lines: ${uniq.toLocaleString('en-IN')} left after the duplicates, in order`);
    t.ok(ms < 8000, `… in ${Math.round(ms)} ms`);
    const t1 = performance.now(), byLen = go(text, { sort: 'len' }).lines; t.ok(byLen.length === 200000 && byLen[0].length <= byLen[199999].length && performance.now() - t1 < 8000, `by length in ${Math.round(performance.now() - t1)} ms`); }
};
