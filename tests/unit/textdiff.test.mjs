// Text Diff: textkit-diff.wasm (wasm/textkit, feature "diff" — the `similar` crate) and src/lib/textdiff.ts, held to
//   · GNU diff's minimal diff (`diff -d`) on 160 pairs of texts (tests/fixtures/diff/reference.json,
//     python3 scripts/make-diff-reference.py): the same counts of removed and added lines;
//   · GNU patch: the unified diff the engine writes, applied to the original, gives the changed text;
//   · the longest common subsequence, worked out here, for words and characters;
// and what the engine before it did on long texts.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

export default async (t, { load, wasm, root }) => {
  const { bindTextdiff } = await load('/src/wasm/textdiff.ts');
  const D = await load('/src/lib/textdiff.ts');
  const engine = await wasm('textkit-diff'), kit = bindTextdiff(engine);
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/diff/reference.json'), 'utf8'));
  let seed = 20261119; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32), pick = (a) => a[Math.floor(rnd() * a.length)];
  const text = (row) => row[3].map((p) => p[1]).join('');
  const linesOf = (s) => { const l = s.split(/\r\n|\n|\r/); if (l[l.length - 1] === '') l.pop(); return l; };
  /** every property a line diff must have, whatever the texts */
  const sound = (a, b, d) => {
    const A = linesOf(a), B = linesOf(b), problems = [];
    if (d.rows.filter((r) => r[0] !== 2).map(text).join('\n') !== A.join('\n')) problems.push('the unchanged and removed rows are not the original');
    if (d.rows.filter((r) => r[0] !== 1).map(text).join('\n') !== B.join('\n')) problems.push('the unchanged and added rows are not the changed text');
    let na = 0, nb = 0;
    for (const [k, x, y] of d.rows) { if (k !== 2 && x !== ++na) problems.push(`original line number ${x}, expected ${na}`); if (k !== 1 && y !== ++nb) problems.push(`changed line number ${y}, expected ${nb}`); if ((k === 2 && x !== 0) || (k === 1 && y !== 0)) problems.push('a number where there is no line'); }
    if (d.added !== d.rows.filter((r) => r[0] === 2).length || d.removed !== d.rows.filter((r) => r[0] === 1).length || d.same !== d.rows.filter((r) => r[0] === 0).length) problems.push('the counts are not those of the rows');
    return problems;
  };

  // ---- GNU diff: the same counts; GNU patch: our unified diff turns the original into the changed text
  const dir = mkdtempSync(join(tmpdir(), 'supertools-diff-')), hasPatch = spawnSync('patch', ['--version']).status === 0;
  const patched = (a, unified) => { writeFileSync(join(dir, 'a.txt'), a); writeFileSync(join(dir, 'p.diff'), unified); const r = spawnSync('patch', ['-s', '-o', join(dir, 'out.txt'), join(dir, 'a.txt'), join(dir, 'p.diff')], { encoding: 'utf8' }); return r.status === 0 ? readFileSync(join(dir, 'out.txt'), 'utf8') : `patch failed: ${r.stdout}${r.stderr}`; };
  let bad = [], applied = 0;
  for (const c of ref) {
    const d = kit.diff(c.a, c.b, 0);
    if (d.removed !== c.removed || d.added !== c.added) bad.push(`−${d.removed} +${d.added}, GNU diff −${c.removed} +${c.added} for ${JSON.stringify(c.a.slice(0, 40))}`);
    bad.push(...sound(c.a, c.b, d));
    if ((c.a === c.b) !== (d.unified === '')) bad.push('a patch for equal texts, or none for different ones');
    if (hasPatch && d.unified) { applied++; const got = patched(c.a, d.unified); if (got !== c.b) bad.push(`GNU patch: ${JSON.stringify(got.slice(0, 60))}, expected ${JSON.stringify(c.b.slice(0, 60))}`); }
  }
  t.ok(ref.length === 160 && !bad.length, `160 pairs of texts: as many lines removed and added as GNU diff's minimal diff counts; the rows rebuild both texts with the right line numbers ${bad.slice(0, 3).join(' | ')}`);
  t.ok(!hasPatch || applied >= 90, hasPatch ? `… and GNU patch turns the original into the changed text with the engine's unified diff, ${applied} times` : '(GNU patch is not installed: the unified diffs were not applied)');

  // ---- texts that end with or without a line break
  for (const [a, b, removed, added, same, what] of [
    ['apple\nbanana\ncherry\ndate', 'apple\nblueberry\ncherry\ndate\nelderberry', 1, 2, 3, 'the tab\'s sample: banana → blueberry, elderberry added'],
    ['a\nb', 'a\nb\nc', 0, 1, 2, 'a last line is the same line whether or not a line break follows it'],
    ['a\nb\n', 'a\nb', 0, 0, 2, 'texts that differ only in the final line break have no changed line'],
    ['', '', 0, 0, 0, 'two empty texts'], ['x', '', 1, 0, 0, 'everything removed'], ['', 'x\ny', 0, 2, 0, 'everything added'], ['same\ntext', 'same\ntext', 0, 0, 2, 'identical'],
    ['a\r\nb\r\n', 'a\r\nc\r\n', 1, 1, 1, 'Windows line ends'], ['a\n\n\nb', 'a\n\nb', 1, 0, 3, 'empty lines are lines'],
  ]) { const d = kit.diff(a, b, 0); t.ok(d.removed === removed && d.added === added && d.same === same && !sound(a, b, d).length, `${JSON.stringify(a)} → ${JSON.stringify(b)}: −${removed} +${added}, ${same} unchanged — ${what} (−${d.removed} +${d.added} =${d.same} ${sound(a, b, d).join('; ')})`); }
  if (hasPatch) for (const [a, b] of [['a\nb', 'a\nb\nc'], ['a\nb\n', 'a\nb'], ['a\nb', 'a\nb\n'], ['x', 'y'], ['x\n', 'y'], ['', 'new\n'], ['old\n', ''], ['one\ntwo\nthree', 'one\n2\nthree\nfour']])
    t.eq(patched(a, kit.diff(a, b, 0).unified), b, `the unified diff of ${JSON.stringify(a)} → ${JSON.stringify(b)} is exact about the final line break (GNU patch)`);
  t.ok(/^--- original\n\+\+\+ changed\n@@ -1,4 \+1,5 @@\n apple\n-banana\n\+blueberry\n cherry\n/.test(kit.diff('apple\nbanana\ncherry\ndate', 'apple\nblueberry\ncherry\ndate\nelderberry', 0).unified), 'the patch is a unified diff with three lines of context');

  // ---- the summary line
  const sum = (a, b) => D.lineSummary(kit.diff(a, b, 0));
  t.eq(sum('apple\nbanana\ncherry\ndate', 'apple\nblueberry\ncherry\ndate\nelderberry'), '2 lines added, 1 removed, 3 unchanged', 'summary of the sample');
  t.eq(sum('a', 'a\nb'), '1 line added, 0 removed, 1 unchanged', 'one line');
  t.eq(sum('same', 'same'), 'The texts are identical.', 'identical');
  t.eq(sum('', ''), 'Both boxes are empty.', 'empty');
  t.eq(sum('a\n', 'a'), 'The texts differ only in the line break at the end: only the original ends with one.', 'only the final line break differs');
  t.eq(sum('a', 'a\n'), 'The texts differ only in the line break at the end: only the changed text ends with one.', '… the other way round');

  // ---- the changed part of a changed line
  { const d = kit.diff('The quick brown fox jumps\nover the lazy dog', 'The quick red fox jumped\nover the lazy dog', 0), [del, ins, eq] = d.rows;
    t.ok(del[0] === 1 && ins[0] === 2 && eq[0] === 0 && d.rows.length === 3, 'one line changed: the old line, the new line, the unchanged one');
    t.eq([del[3].filter((p) => p[0]).map((p) => p[1]), ins[3].filter((p) => p[0]).map((p) => p[1])], [['brown', 'jumps'], ['red', 'jumped']], 'in a changed line the words that differ are marked, on both sides');
    t.eq([text(del), text(ins)], ['The quick brown fox jumps', 'The quick red fox jumped'], 'the pieces of a row are the whole line'); }
  { const d = kit.diff('alpha\nbeta', 'gamma\nbeta', 0); t.ok(d.rows[0][3].length === 1 && d.rows[1][3].length === 1, 'two lines with nothing in common are not cut into pieces'); }

  // ---- words and characters: as few changes as the longest common subsequence allows
  const lcs = (a, b) => { const d = Array(b.length + 1).fill(0); for (const x of a) { let prev = 0; for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = x === b[j - 1] ? prev + 1 : Math.max(d[j], d[j - 1]); prev = tmp; } } return d[b.length]; };
  const clusters = (s) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  bad = [];
  for (let i = 0; i < 400; i++) {
    const a = Array.from({ length: Math.floor(rnd() * 14) }, () => pick(['a', 'b', 'c', 'é', 'न', 'ते', ' ', 'x'])).join(''), b = Array.from({ length: Math.floor(rnd() * 14) }, () => pick(['a', 'b', 'c', 'é', 'न', 'ते', ' ', 'y'])).join('');
    const d = kit.diff(a, b, 2), A = clusters(a), B = clusters(b), L = lcs(A, B);
    if (d.removed !== A.length - L || d.added !== B.length - L || d.same !== L) bad.push(`${JSON.stringify(a)} → ${JSON.stringify(b)}: −${d.removed} +${d.added} =${d.same}, least possible −${A.length - L} +${B.length - L}`);
    if (d.spans.filter((s) => s[0] !== 2).map((s) => s[1]).join('') !== a || d.spans.filter((s) => s[0] !== 1).map((s) => s[1]).join('') !== b) bad.push(`${JSON.stringify(a)} → ${JSON.stringify(b)}: the spans do not rebuild the texts`);
  }
  t.ok(!bad.length, `characters: 400 random pairs with the fewest changes possible (longest common subsequence), spans that rebuild both texts ${bad.slice(0, 3).join(' | ')}`);
  bad = [];
  const WORDS = ['the', 'cat', 'sat', 'on', 'a', 'mat', 'dog', 'ran'];
  for (let i = 0; i < 300; i++) {
    const A = Array.from({ length: Math.floor(rnd() * 12) }, () => pick(WORDS)), B = Array.from({ length: Math.floor(rnd() * 12) }, () => pick(WORDS)), a = A.join(' '), b = B.join(' ');
    const d = kit.diff(a, b, 1), L = lcs(A, B);
    // words are compared with the spaces between them as pieces of their own: never fewer changes than the words alone need, and the texts rebuilt
    if (d.removed < A.length - L || d.added < B.length - L || d.removed + d.same !== A.length || d.added + d.same !== B.length) bad.push(`${JSON.stringify(a)} → ${JSON.stringify(b)}: −${d.removed} +${d.added} =${d.same}`);
    if (d.spans.filter((s) => s[0] !== 2).map((s) => s[1]).join('') !== a || d.spans.filter((s) => s[0] !== 1).map((s) => s[1]).join('') !== b) bad.push(`${JSON.stringify(a)} → ${JSON.stringify(b)}: the spans do not rebuild the texts`);
  }
  t.ok(!bad.length, `words: 300 random pairs — the counts are of words (not of the spaces between), they add up, and the spans rebuild both texts ${bad.slice(0, 3).join(' | ')}`);
  { const d = kit.diff('the cat sat on the mat.', 'the dog sat on a mat', 1);
    t.eq(d.spans, [[0, 'the '], [1, 'cat'], [2, 'dog'], [0, ' sat on '], [1, 'the'], [2, 'a'], [0, ' mat'], [1, '.']], 'words: a full stop is a piece of its own ("mat" is unchanged, "." removed — the tab took "mat." for another word)');
    t.eq([d.added, d.removed, d.same, D.spanSummary(d)], [2, 2, 4, '2 words added, 2 removed, 4 unchanged'], '… and is not counted as a word'); }
  { const d = kit.diff('a  b', 'a b', 1); t.eq(D.spanSummary(d), 'The same words; only spaces or signs between them differ.', 'words: only the spacing differs'); }
  { const d = kit.diff('👍🏽 ok', '👍🏿 ok', 2); t.ok(d.removed === 1 && d.added === 1 && d.spans[0][1] === '👍🏽', 'characters: an emoji with its skin tone is one character (the tab showed half an emoji as changed)'); }
  { const d = kit.diff('नमस्ते', 'नमस्ते दुनिया', 1); t.eq([d.added, d.removed, d.same], [1, 0, 1], 'words in Hindi'); }
  t.eq(D.spanSummary(kit.diff('abc', 'abc', 2)), 'The texts are identical.', 'identical, by characters'); t.eq(D.spanSummary(kit.diff('', '', 1)), 'Both boxes are empty.', 'empty, by words');
  { const d = kit.diff('abcabba', 'cbabac', 2); t.eq([d.removed, d.added], [3, 2], 'the example of Myers\' paper: 5 changes'); }

  // ---- long texts: what the engine before could not do
  for (const n of [8000, 100000]) {
    const a = Array.from({ length: n }, (_, i) => `row ${i}`), b = a.map((l, i) => (i === 5 || i === n - 5 ? `${l} changed` : l)), t0 = performance.now(), d = kit.diff(a.join('\n'), b.join('\n'), 0), ms = performance.now() - t0;
    t.ok(d.added === 2 && d.removed === 2 && d.same === n - 2 && !d.approx && ms < 5000, `${n.toLocaleString('en-IN')} lines with two changed, one near each end: found in ${Math.round(ms)} ms (the engine before said "Texts are too different to diff" from 8,000 lines on)`);
  }
  t.ok(engine.memory.buffer.byteLength < 200 * 1048576, `… within ${Math.round(engine.memory.buffer.byteLength / 1048576)} MB of memory (3,000 lines took 528 MB before)`);
  { const a = Array.from({ length: 30000 }, (_, i) => `left ${(i * 7919) % 30000}`).join('\n'), b = Array.from({ length: 30000 }, (_, i) => `right ${(i * 104729) % 30000}`).join('\n'), d = kit.diff(a, b, 0);
    t.ok(d.removed === 30000 && d.added === 30000 && !sound(a, b, d).length, 'two texts of 30,000 lines with nothing in common: everything removed, everything added'); }
  { // a time limit of 1 ms on texts that take longer: still a diff that rebuilds both texts, and it says so
    const a = Array.from({ length: 6000 }, () => pick(WORDS)).join('\n'), b = Array.from({ length: 6000 }, () => pick(WORDS)).join('\n'), d = kit.diff(a, b, 0, 1);
    t.ok(!sound(a, b, d).length && d.approx === true, 'when the time limit ends the search, what is shown still turns the original into the changed text, and "approx" says it may not be the shortest');
    if (hasPatch) t.eq(patched(a, d.unified), b, '… its patch applies too'); }

  // ---- folding long unchanged runs
  const row = (k, i) => [k, k === 2 ? 0 : i, k === 1 ? 0 : i, [[0, `l${i}`]]];
  { const rows = [...Array.from({ length: 20 }, (_, i) => row(0, i + 1)), row(1, 21), row(2, 21), ...Array.from({ length: 30 }, (_, i) => row(0, i + 22)), row(2, 52), ...Array.from({ length: 5 }, (_, i) => row(0, i + 53))];
    const blocks = D.foldRows(rows);
    t.eq(blocks.map((b) => `${b.fold ? 'fold' : 'show'} ${b.rows.length}`), ['fold 17', 'show 8', 'fold 24', 'show 9'], 'three unchanged lines stay beside every change; the long runs between are folded; a short run at the end is shown');
    t.eq(blocks.flatMap((b) => b.rows), rows, 'no row is lost and none comes twice');
    t.eq(D.foldRows(Array.from({ length: 8 }, (_, i) => row(0, i + 1)).concat([row(1, 9)])).map((b) => b.fold), [false], 'a run is not folded for a handful of lines');
    t.eq(D.foldRows([]), [], 'nothing to fold'); t.eq(D.foldRows(Array.from({ length: 50 }, (_, i) => row(0, i + 1))).map((b) => `${b.fold} ${b.rows.length}`), ['true 50'], 'identical texts: one folded run'); }
  rmSync(dir, { recursive: true, force: true });
};
