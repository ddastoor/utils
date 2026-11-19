// Find & Replace (src/lib/findreplace.ts + the browser's RegExp as the worker runs it) against Python's `re` module
// on 226 searches (tests/fixtures/replace/reference.json, python3 scripts/make-replace-reference.py) and against
// answers worked out by hand, with what the tab did before where it was wrong.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, root }) => {
  const F = await load('/src/lib/findreplace.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/replace/reference.json'), 'utf8'));
  // what the worker does with a plan (src/workers/regex.worker.ts): count with matchAll, replace with String.replace
  const apply = (text, find, rep, o = {}) => { const p = F.plan(find, rep, { regex: false, cs: false, word: false, ...o }); return { result: text.replace(new RegExp(p.pattern, p.flags), p.replacement), count: [...text.matchAll(new RegExp(p.pattern, p.flags))].length, loose: p.loose }; };
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };

  // ---- Python's answers
  let bad = [];
  for (const c of ref) { const r = apply(c.text, c.find, c.rep, c); if (r.result !== c.result || r.count !== c.count) bad.push(`${JSON.stringify(c.find)} → ${JSON.stringify(c.rep)} in ${JSON.stringify(c.text.slice(0, 50))} (${c.regex ? 'regex' : 'plain'}${c.cs ? ', case' : ''}${c.word ? ', words' : ''}): ${JSON.stringify(r.result.slice(0, 60))} ×${r.count}, Python ${JSON.stringify(c.result.slice(0, 60))} ×${c.count}`); }
  t.ok(ref.length === 226 && !bad.length, `${ref.length} searches give the text and the count Python's re.subn gives: plain text with every special character, case on and off, whole words in Latin, Cyrillic and Greek, 31 regular expressions (groups, named groups, look-around, anchors per line, empty matches) ${bad.slice(0, 3).join(' | ')}`);

  // ---- plain text: every character stands for itself
  for (const [text, find, rep, want, what] of [
    ['Price: $5.00 (approx.) + tax*', '$5.00 (approx.)', '₹420 $1', 'Price: ₹420 $1 + tax*', 'special characters in "Find", "$1" in the replacement'],
    ['a.b axb', 'a.b', 'Q', 'Q axb', 'a full stop is a full stop'], ['x\\n y', '\\n', '!', 'x! y', 'a backslash and an n are two characters'],
    ['one', 'one', '$&$&', '$&$&', '"$&" is text'], ['one', 'one', '\\n', '\\n', '… and so is "\\n"'], ['Colour colour COLOUR', 'colour', 'color', 'color color color', 'capitals are ignored'],
    ['😀 smile 😀', '😀', ':)', ':) smile :)', 'an emoji'], ['नमस्ते दुनिया', 'दुनिया', 'world', 'नमस्ते world', 'Hindi'],
  ]) t.eq(apply(text, find, rep).result, want, `plain: ${what}`);
  t.eq(apply('Cat cat CAT', 'cat', 'dog', { cs: true }).result, 'Cat dog CAT', 'case sensitive');

  // ---- whole words in every script
  for (const [text, find, want, n, what] of [
    ['cat category concat cat.', 'cat', 'X category concat X.', 2, 'English'],
    ['दुनिया और दुनियादारी', 'दुनिया', 'X और दुनियादारी', 1, 'Hindi: दुनिया but not दुनियादारी (the tab found no Hindi word at all: its word boundary knew ASCII letters only)'],
    ['राम रामा राम', 'राम', 'X रामा X', 2, 'Hindi: राम but not रामा — a vowel sign continues the word'],
    ['café cafés Café', 'café', 'X cafés X', 2, 'café but not cafés (the tab replaced inside "cafés": after é it saw a boundary)'],
    ['naïve naïveté', 'naïve', 'X naïveté', 1, 'naïve'], ['мир мирный', 'мир', 'X мирный', 1, 'Russian'],
    ['x1 x x_ x-1 (x)', 'x', 'x1 X x_ X-1 (X)', 3, 'digits and the underscore belong to a word; a hyphen and a bracket do not'],
    ['cafe\u0301 cafe', 'cafe', 'cafe\u0301 X', 1, 'an accent written as a mark continues the word'],
  ]) { const r = apply(text, find, 'X', { word: true }); t.ok(r.result === want && r.count === n, `whole words: ${what} (${r.result}, ${r.count})`); }
  t.eq(apply('C++ and C+', 'C+', 'X', { word: true }).result, 'X+ and X', 'whole words look at letters, digits and marks only: "C+" is found before another +');

  // ---- regular expressions
  for (const [text, find, rep, want, what] of [
    ['line1\nline2', '^', '> ', '> line1\n> line2', '^ matches at every line, as in an editor (the tab matched the first line only)'],
    ['a\nb', '$', ';', 'a;\nb;', '… and $ at every line end'],
    ['one, two, three', ', ', '\\n', 'one\ntwo\nthree', '\\n in "Replace with" is a line break (the tab wrote a backslash and an n; there was no way to replace with a line break)'],
    ['a b', ' ', '\\t', 'a\tb', '\\t is a tab'], ['a b', ' ', '\\\\n', 'a\\nb', '\\\\ is a backslash'], ['a b', ' ', '\\x', 'a\\xb', 'another backslash pair stays as typed'],
    ['price 100', '\\d+', '[$0]', 'price [100]', '$0 is the whole match, as $& is (the tab wrote "$0")'], ['price 100', '\\d+', '$$$&', 'price $100', '$$ is a dollar sign'], ['price 100', '(\\d)(\\d)', '$2$1$9', 'price 01$90', 'a group that does not exist stays as typed'],
    ['2026-11-16', '(?<y>\\d{4})-(?<m>\\d{2})', '$<m>/$<y>', '11/2026-16', 'named groups'], ['a10 a100', '(a)1', '$10', 'a10 a100'.replace(/(a)1/g, '$10'), '$10 as JavaScript reads it'],
    ['😀😀', '.', 'x', 'xx', 'an emoji is one character to "."'], ['école École', '\\p{Lu}', 'X', 'école Xcole', '\\p{…} classes'],
  ]) t.eq(apply(text, find, rep, { regex: true, cs: what.startsWith('\\p') }).result, want, `regex: ${what}`);
  { const r = apply('a-b a#b', 'a\\-b|a\\#b', 'X', { regex: true }); t.ok(r.result === 'X X' && r.loose, 'a pattern with escapes JavaScript\'s Unicode mode refuses (\\- \\#) is run in the older mode rather than turned away (the tab said "Invalid escape")'); }
  { const r = apply('x{ y', 'x{', 'X', { regex: true }); t.ok(r.result === 'X y' && r.loose, '… a lone brace too'); }
  { const r = apply('naïve a{', 'a{', 'X', { regex: true, word: true }); t.ok(r.loose && r.result === 'naïve X', '… and whole words still look beyond ASCII there'); }
  t.ok(!apply('a b', 'a', 'X', { regex: true }).loose, 'an ordinary pattern runs in Unicode mode');

  // ---- patterns that cannot be used
  for (const [find, want] of [['(', 'This is not a valid regular expression: unterminated group.'], ['[a-', 'This is not a valid regular expression: unterminated character class.'], ['a**', 'This is not a valid regular expression: nothing to repeat.'], ['(?<n>a)(?<n>b)', 'This is not a valid regular expression: duplicate capture group name.'], ['\\', 'This is not a valid regular expression: \\ at end of pattern.']])
    t.eq(why(() => F.plan(find, 'x', { regex: true, cs: false, word: false })), want, `${JSON.stringify(find)} is refused with its reason`);
  t.eq(why(() => F.plan('(', 'x', { regex: false, cs: false, word: false })), '', '… and is plain text without the switch');
  t.eq(F.patternError('Invalid regular expression: /a)/gimu: Unmatched \')\''), "This is not a valid regular expression: unmatched ')'.", 'the engine\'s message without its prefix');

  // ---- the replacement text
  for (const [rep, regex, want] of [['a$b', false, 'a$$b'], ['$1', false, '$$1'], ['\\n', false, '\\n'], ['\\n', true, '\n'], ['\\t\\r\\\\', true, '\t\r\\'], ['$0', true, '$&'], ['$01', true, '$01'], ['$$0', true, '$$0'], ['x$0y$0', true, 'x$&y$&'], ['\\', true, '\\'], ['$', true, '$'], ['', true, '']])
    t.eq(F.replacementFor(rep, regex), want, `replacement ${JSON.stringify(rep)}${regex ? ' with' : ' without'} a regular expression → ${JSON.stringify(want)}`);

  // ---- the line under the result
  for (const [n, want] of [[0, 'No match — nothing was replaced.'], [1, '1 replacement'], [2, '2 replacements'], [123456, '1,23,456 replacements'], [1000000, '10,00,000+ replacements']]) t.eq(F.countText(n), want, `count: ${want}`);

  // ---- a long text
  { const text = 'The quick brown fox jumps over the lazy dog. '.repeat(40000), t0 = performance.now(), r = apply(text, 'the', 'a', { word: true });
    t.ok(r.count === 80000 && r.result.length === text.length - 80000 * 2 && performance.now() - t0 < 4000, `1.8 MB: 80,000 whole words replaced in ${Math.round(performance.now() - t0)} ms`); }
};
