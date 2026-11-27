// Text Diff: textkit-diff.wasm (wasm/textkit, feature "diff" — the `similar` crate) and src/lib/textdiff.ts, held to
//   · GNU diff's minimal diff (`diff -d`) on 160 pairs of texts (tests/fixtures/diff/reference.json,
//     python3 scripts/make-diff-reference.py): the same counts of removed and added lines;
//   · GNU patch: the unified diff the engine writes, applied to the original, gives the changed text;
//   · the longest common subsequence, worked out here, for words and characters;
//   · side by side (mode 3, to-do #35): GNU diff's change commands (the same groups wherever the engine removed and added
//     the same lines as GNU diff; GNU patch takes each group as a hunk of its own), and the pairing of removed and added
//     lines held to an optimum worked out here — likeness by a longest common subsequence of our own, every order-keeping
//     pairing weighed by dynamic programming;
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
  // ---- side by side (mode 3): the same diff in two columns; its changes are GNU diff's groups; the lines paired best
  {
    const txtOf = (p) => p.map((x) => x[1]).join(''), right = (r) => (r[0] === 3 ? r[4] : r[3]);
    /** the side-by-side rows must give both texts back, number both sides, and agree with the line view */
    const sideSound = (a, b, d, d0) => {
      const problems = [];
      if (d.added !== d0.added || d.removed !== d0.removed || d.same !== d0.same || d.unified !== d0.unified || d.endA !== d0.endA || d.endB !== d0.endB || d.approx !== d0.approx) problems.push('the counts, the patch or the line ends are not the line view\'s');
      const L = d.rows.filter((r) => r[0] !== 2), R = d.rows.filter((r) => r[0] !== 1);
      if (L.map((r) => txtOf(r[3])).join('\n') !== linesOf(a).join('\n')) problems.push('the left column is not the original');
      if (R.map((r) => txtOf(right(r))).join('\n') !== linesOf(b).join('\n')) problems.push('the right column is not the changed text');
      if (L.some((r, i) => r[1] !== i + 1) || R.some((r, i) => r[2] !== i + 1)) problems.push('the line numbers do not count up on each side');
      if (d.rows.some((r) => (r[0] === 1 && r[2]) || (r[0] === 2 && r[1]) || (r[0] === 0 && txtOf(r[3]) === undefined))) problems.push('a row of one side carries a number of the other');
      return problems;
    };
    // likeness, worked out here: the longest common subsequence by dynamic programming (the engine runs Myers' search),
    // of the characters — or, for two lines longer than 400 characters together, of their words and signs
    const ALNUM = /[\p{Alphabetic}\p{N}]/u, WS = /\p{White_Space}/u;
    const wordsOf = (s) => { const out = []; let w = ''; for (const c of s) { if (ALNUM.test(c)) { w += c; continue; } if (w) { out.push(w); w = ''; } if (!WS.test(c)) out.push(c); } if (w) out.push(w); return out; };
    const lcsLen = (x, y) => { const d = new Array(y.length + 1).fill(0); for (let i = 1; i <= x.length; i++) { let prev = 0; for (let j = 1; j <= y.length; j++) { const tmp = d[j]; d[j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(d[j], d[j - 1]); prev = tmp; } } return d[y.length]; };
    const blank = (s) => /^\p{White_Space}*$/u.test(s);
    /** a pair's weight in millionths (0: not to be paired — less than 0.6 alike, or a line of spaces) */
    const weight = (a, b) => {
      if (blank(a) || blank(b)) return 0;
      const ca = [...a], cb = [...b], [p, q] = ca.length + cb.length <= 400 ? [ca, cb] : [wordsOf(a), wordsOf(b)], tot = p.length + q.length;
      if (!tot) return 0;
      const indels = tot - 2 * lcsLen(p, q);
      return indels * 10 <= tot * 4 ? Math.floor(1e6 * (tot - indels) / tot) : 0;
    };
    /** the greatest total weight of a pairing that keeps the order on both sides */
    const bestPairing = (A, B) => { const s = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0)); for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) { const w = weight(A[i - 1], B[j - 1]); s[i][j] = Math.max(s[i - 1][j], s[i][j - 1], w ? s[i - 1][j - 1] + w : 0); } return s[A.length][B.length]; };
    /** every run of changes: paired best; between two pairs, the lines side by side in order and then one side's alone;
     *  a row's unmarked parts the same on both sides */
    const pairingProblems = (d, stats) => {
      const problems = [];
      for (const hk of D.hunks(d.rows)) {
        const run = d.rows.slice(hk.first, hk.last + 1), A = run.filter((r) => r[0] !== 2).map((r) => txtOf(r[3])), B = run.filter((r) => r[0] !== 1).map((r) => txtOf(right(r)));
        let got = 0; const layout = [];
        for (const r of run) {
          if (r[0] !== 3) { layout.push(r[0] === 1 ? 'a' : 'b'); continue; }
          const w = weight(txtOf(r[3]), txtOf(r[4])); got += w; layout.push(w ? 'P' : 'L'); if (stats) stats[w ? 'alike' : 'inOrder']++;
          if ((r[3].some((x) => x[0]) || r[4].some((x) => x[0])) && r[3].filter((x) => !x[0]).map((x) => x[1]).join('') !== r[4].filter((x) => !x[0]).map((x) => x[1]).join('')) problems.push(`the unmarked parts of ${JSON.stringify(txtOf(r[3]).slice(0, 30))} and its pair differ`);
        }
        if (A.length * B.length <= 10000) { const want = bestPairing(A, B); if (got !== want) problems.push(`a run of ${A.length} × ${B.length} lines paired ${got / 1e6} alike in all, the best pairing ${want / 1e6}`); }
        for (const gap of layout.join('').split('P')) if (!/^L*(a*|b*)$/.test(gap)) problems.push(`between two pairs: ${gap} (L side by side, a / b alone)`);
      }
      return problems;
    };
    // GNU diff's commands: "3,4c3", "7a8,9", "12d11" → the lines removed and added, and the groups
    const gnuGroups = (cmds) => cmds.map((c) => { const m = /^(\d+)(?:,(\d+))?([acd])(\d+)(?:,(\d+))?$/.exec(c), a1 = +m[1], a2 = m[2] ? +m[2] : a1, b1 = +m[4], b2 = m[5] ? +m[5] : b1;
      return m[3] === 'a' ? { a: [a1 + 1, a1], b: [b1, b2] } : m[3] === 'd' ? { a: [a1, a2], b: [b1 + 1, b1] } : { a: [a1, a2], b: [b1, b2] }; });
    const lineSets = (groups) => JSON.stringify([groups.flatMap((g) => Array.from({ length: g.a[1] - g.a[0] + 1 }, (_, i) => g.a[0] + i)), groups.flatMap((g) => Array.from({ length: g.b[1] - g.b[0] + 1 }, (_, i) => g.b[0] + i))]);
    /** a patch without context, a hunk per change as the side-by-side view groups them — for GNU patch to apply */
    const zeroPatch = (d) => '--- original\n+++ changed\n' + D.hunks(d.rows).map((hk) => {
      const run = d.rows.slice(hk.first, hk.last + 1), ca = hk.a[1] - hk.a[0] + 1, cb = hk.b[1] - hk.b[0] + 1;
      return `@@ -${ca ? hk.a[0] : hk.at[0]},${ca} +${cb ? hk.b[0] : hk.at[1]},${cb} @@\n` + run.filter((r) => r[0] !== 2).map((r) => `-${txtOf(r[3])}\n`).join('') + run.filter((r) => r[0] !== 1).map((r) => `+${txtOf(right(r))}\n`).join('');
    }).join('');
    bad = []; let sameAsGnu = 0, patchedN = 0; const stats = { alike: 0, inOrder: 0 };
    for (const [n, c] of ref.entries()) {
      const d = kit.diff(c.a, c.b, 3), d0 = kit.diff(c.a, c.b, 0);
      bad.push(...sideSound(c.a, c.b, d, d0).map((x) => `pair ${n}: ${x}`), ...pairingProblems(d, stats).map((x) => `pair ${n}: ${x}`));
      const ours = D.hunks(d.rows), gnu = gnuGroups(c.gnu);
      if (JSON.stringify(D.hunks(d0.rows).map((h) => [h.a, h.b])) !== JSON.stringify(ours.map((h) => [h.a, h.b]))) bad.push(`pair ${n}: the line view and the side-by-side view group the changes differently`);
      if (lineSets(ours) === lineSets(gnu)) { sameAsGnu++; if (JSON.stringify(ours.map((h) => [h.a, h.b])) !== JSON.stringify(gnu.map((g) => [g.a, g.b]))) bad.push(`pair ${n}: the same lines removed and added as GNU diff, other groups: ${ours.map((h) => `${h.a}/${h.b}`).join(' ')} — GNU ${c.gnu.join(' ')}`); }
      if (hasPatch && ours.length) { patchedN++; const got = patched(c.a, zeroPatch(d)); if (got !== c.b) bad.push(`pair ${n}: GNU patch, a hunk per change: ${JSON.stringify(got.slice(0, 50))}`); }
    }
    t.ok(!bad.length, `side by side, the 160 pairs: the two columns are the two texts with their line numbers, the counts and the patch the line view's; the lines of every change paired as alike as an exhaustive search finds (${stats.alike} pairs alike, ${stats.inOrder} side by side in order) ${bad.slice(0, 3).join(' | ')}`);
    t.ok(sameAsGnu >= 140, `… where the engine removed and added the same lines as GNU diff (${sameAsGnu} pairs — in the others both diffs are as short and match other lines), its changes are GNU diff's commands, one for one`);
    t.ok(!hasPatch || patchedN >= 90, hasPatch ? `… and a patch of a hunk per change, as Previous / Next go through them, turns the original into the changed text in GNU patch (${patchedN} pairs)` : '(GNU patch is not installed)');

    // edits as people make them: code (a line changed and lines put in beside it), prose of long lines, Windows line ends
    let seed2 = 20261127; const r2 = () => ((seed2 = (Math.imul(seed2, 1664525) + 1013904223) >>> 0) / 2 ** 32), p2 = (a) => a[Math.floor(r2() * a.length)];
    const CODE = 'const let return if else for while function value index count total name list item key data error result true false null'.split(' ');
    const codeLine = () => `${'  '.repeat(Math.floor(r2() * 3))}${Array.from({ length: 2 + Math.floor(r2() * 6) }, () => p2(CODE)).join(p2([' ', ' = ', '.', '(', ', ']))}${p2([';', ' {', '', ')'])}`;
    const prose = () => Array.from({ length: 60 + Math.floor(r2() * 80) }, () => p2(['the', 'a', 'river', 'city', 'night', 'walked', 'slowly', 'over', 'bridge', 'and', 'light', 'of', 'old', 'stone', 'नदी', 'हिंदी', '👍🏽', 'café'])).join(' ') + '.';
    const nudge = (l) => { const c = [...l]; for (let k = 1 + Math.floor(r2() * 3); k > 0; k--) { const i = Math.floor(r2() * (c.length + 1)), op = r2(); if (op < 0.4 && c.length) c.splice(Math.min(i, c.length - 1), 1); else if (op < 0.8) c.splice(i, 0, p2(['x', 'y', ' ', '_', '1'])); else if (c.length) c[Math.min(i, c.length - 1)] = 'Z'; } return c.join(''); };
    const reword = (l) => { const w = l.split(' '); for (let k = 1 + Math.floor(r2() * 6); k > 0; k--) w[Math.floor(r2() * w.length)] = p2(['changed', 'new', 'word']); return w.join(' '); };
    bad = []; const st2 = { alike: 0, inOrder: 0 }; let slowest = 0;
    for (let caseNo = 0; caseNo < 300; caseNo++) {
      const long = caseNo % 5 === 4, A = Array.from({ length: 3 + Math.floor(r2() * 25) }, () => (long ? prose() : r2() < 0.1 ? '' : codeLine())), B = [];
      for (const l of A) { const x = r2(); if (x < 0.15) continue; B.push(x < 0.45 ? (long ? reword(l) : nudge(l)) : l); if (r2() < 0.2) B.push(long ? prose() : r2() < 0.2 ? '' : codeLine()); }
      if (r2() < 0.2 && B.length > 2) { const i = Math.floor(r2() * B.length); B.splice(Math.floor(r2() * B.length), 0, B.splice(i, 1)[0]); }
      const a = A.join('\n'), b = B.join(r2() < 0.1 ? '\r\n' : '\n'), t0 = performance.now(), d = kit.diff(a, b, 3); slowest = Math.max(slowest, performance.now() - t0);
      bad.push(...sideSound(a, b, d, kit.diff(a, b, 0)).map((x) => `edit ${caseNo}: ${x}`), ...pairingProblems(d, st2).map((x) => `edit ${caseNo}: ${x}`));
    }
    t.ok(!bad.length && st2.alike > 1000, `300 edited texts (code, paragraphs, Windows line ends, Hindi and emoji): both columns right, every run of changes paired as alike as an exhaustive search finds — ${st2.alike} pairs alike, ${st2.inOrder} in order; the slowest ${slowest.toFixed(1)} ms ${bad.slice(0, 3).join(' | ')}`);

    // known answers
    const lay = (a, b) => kit.diff(a, b, 3).rows.map((r) => (r[0] === 0 ? `=${txtOf(r[3])}` : r[0] === 1 ? `${txtOf(r[3])}|` : r[0] === 2 ? `|${txtOf(r[3])}` : `${txtOf(r[3])}|${txtOf(r[4])}`));
    t.eq(lay('apple\nbanana\ncherry\ndate', 'apple\nblueberry\ncherry\ndate\nelderberry'), ['=apple', 'banana|blueberry', '=cherry', '=date', '|elderberry'], 'the tab\'s sample: banana beside blueberry, elderberry alone on the right');
    t.eq(lay('a\nb\nc', 'a\nNEW\nb2\nc'), ['=a', '|NEW', 'b|b2', '=c'], 'a line put in above a changed one stands alone: the changed line stays beside what it became (row by row, "b" would stand beside "NEW")');
    { const d = kit.diff('function foo(a) {\n  return a + 1;\n}', 'function foo(a, b) {\n  // add b\n  return a + b;\n}', 3);
      t.eq(d.rows.map((r) => r[0]), [3, 2, 3, 0], 'a function changed: its first line beside its first line, the comment alone, the return beside the return');
      t.eq([d.rows[0][4].filter((x) => x[0]).map((x) => x[1]), d.rows[2][3].filter((x) => x[0]).map((x) => x[1]), d.rows[2][4].filter((x) => x[0]).map((x) => x[1])], [[', b'], ['1'], ['b']], '… and in each row the part that differs from the line beside it is marked'); }
    { const d = kit.diff('The quick brown fox jumps\nover the lazy dog', 'The quick red fox jumped\nover the lazy dog', 3);
      t.eq([d.rows[0][3].filter((x) => x[0]).map((x) => x[1]), d.rows[0][4].filter((x) => x[0]).map((x) => x[1])], [['brown', 'jumps'], ['red', 'jumped']], 'one line changed: beside itself, the words that differ marked on both sides'); }
    t.eq(lay('x = 1', 'x = 2\nx = 3'), ['x = 1|x = 2', '|x = 3'], 'two lines as alike: the first one is paired (the pairs as early as they can be)');
    t.eq(lay('a\n\nb', 'a\nnew\n\n\nb'), ['=a', '|new', '|', '=', '=b'], 'empty lines are lines (as GNU diff: 1a2,3)');
    t.eq(lay('top\n    \nfoo\nend', 'top\nbar\n  \nend'), ['=top', '    |bar', 'foo|  ', '=end'], 'lines of nothing but spaces are paired with no line for their likeness ("    " and "  " are 67 % alike): the lines stand in order');
    t.eq(lay('top\n   \nold line here\nend', 'top\nold line here!\n\t\nend'), ['=top', '   |', 'old line here|old line here!', '|\t', '=end'], '… and a changed line beside what it became, the lines of spaces alone');
    t.eq(lay('k\nsame line\nz', 'k\nx\nsame line\ny\nz'), ['=k', '|x', '=same line', '|y', '=z'], 'an unchanged line splits two changes');
    { const A = Array.from({ length: 101 }, (_, i) => `old line number ${i} of a run`), B = ['new first', ...A.slice(0, 99).map((l) => `${l}!`)], d = kit.diff(`s\n${A.join('\n')}\ne`, `s\n${B.join('\n')}\ne`, 3);
      t.ok(d.rows[1][0] === 3 && txtOf(d.rows[1][3]) === A[0] && txtOf(d.rows[1][4]) === 'new first' && d.rows.filter((r) => r[0] === 1).length === 1, 'a run of more than 100 × 100 lines is paired in order (the first removed line beside "new first", where pairing by likeness would have set it beside its own changed line)'); }
    // long lines: words, not letters — the same words in another order share most of their letters in order
    { const V = 'the river ran under the old stone bridge while the city lights came on one by one across the water'.split(' ');
      let sd = 3; const r3 = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 2 ** 32); let pair = null;
      for (let i = 0; i < 2000 && !pair; i++) { const x = Array.from({ length: 45 }, () => V[Math.floor(r3() * V.length)]).join(' '), y = Array.from({ length: 45 }, () => V[Math.floor(r3() * V.length)]).join(' '), cx = [...x], cy = [...y];
        if (2 * lcsLen(cx, cy) / (cx.length + cy.length) >= 0.62 && 2 * lcsLen(wordsOf(x), wordsOf(y)) / (wordsOf(x).length + wordsOf(y).length) < 0.5) pair = [x, y]; }
      t.ok(!!pair && pair[0].length + pair[1].length > 400, 'two paragraphs of the same words in another order: 62 % alike by letters, under 50 % by words');
      t.eq(lay(`top\n${pair[0]}\nend`, `top\nshort new line\n${pair[1]}\nend`).map((x) => x.length > 30 ? x.replace(/^(.{12}).*(\|.{0,15}).*$/, '$1…$2') : x).length, 4, 'four rows');
      const d = kit.diff(`top\n${pair[0]}\nend`, `top\nshort new line\n${pair[1]}\nend`, 3);
      t.ok(d.rows[1][0] === 3 && txtOf(d.rows[1][4]) === 'short new line' && d.rows[2][0] === 2, '… are not paired for their likeness: long lines are weighed by their words (they stand in order: the first beside the short new line)');
      const P1 = 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair.';
      const E = P1.replace('best', 'finest').replace('wisdom', 'knowledge').replace('Light', 'light');
      t.eq(kit.diff(`top\n${P1}\nend`, `top\nshort new line\n${E}\nend`, 3).rows.map((r) => r[0]), [0, 2, 3, 0], 'a paragraph with three words changed and a line put in above it: the paragraph beside its new wording'); }
    { // speed: every pair of a run of 100 × 100 alike lines weighed; long lines; nothing is "approximate" because of the pairing
      const W = 'the quick brown fox jumps over lazy dog and runs far away from here to there with some other words const let return'.split(' ');
      let sd = 7; const r4 = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 2 ** 32), ln = (k) => Array.from({ length: 1 + Math.floor(r4() * k) }, () => W[Math.floor(r4() * W.length)]).join(' ');
      const A = Array.from({ length: 100 }, () => ln(12)), t0 = performance.now(), d = kit.diff(`s\n${A.join('\n')}\ne`, `s\n${A.map((l) => l.replace(/o/g, '0')).join('\n')}\ne`, 3), ms = performance.now() - t0;
      t.ok(ms < 500 && !d.approx, `a run of 100 × 100 alike lines: weighed and paired in ${Math.round(ms)} ms`);
      const E = Array.from({ length: 50 }, () => ln(500).slice(0, 2000)), t1 = performance.now(), e = kit.diff(`x\n${E.join('\n')}\ny`, `x\n${E.map((l) => l.replace(/e/g, 'E')).join('\n')}\ny`, 3), ms1 = performance.now() - t1;
      t.ok(ms1 < 1000 && !e.approx, `a run of 50 × 50 lines of up to 2,000 characters: ${Math.round(ms1)} ms (by letters it took the whole 2 s and said the diff was approximate)`); }
    // the words of Previous / Next
    const hs = D.hunks(kit.diff('a\nb\nc\nd\ne\nf\ng', 'a\nB\nc\nd\nnew\ne\ng', 3).rows);
    t.eq(hs.map((x) => [x.a, x.b, x.at]), [[[2, 2], [2, 2], [1, 1]], [[5, 4], [5, 5], [4, 4]], [[6, 6], [7, 6], [5, 6]]], 'the changes: the lines each holds on each side, and the unchanged lines before it');
    t.eq(hs.map(D.hunkWhere), ['original line 2, changed line 2', '1 line added: changed line 5', '1 line removed: original line 6'], 'where each change stands, in words');
    t.eq(D.hunkWhere({ a: [3, 5], b: [3, 4] }), 'original lines 3–5, changed lines 3–4', '… several lines');
    t.eq(D.hunkWhere({ a: [10, 9], b: [10, 12] }), '3 lines added: changed lines 10–12', '… lines added');
    t.eq([D.hunkCounter(0, -1), D.hunkCounter(3, -1), D.hunkCounter(3, 1, hs[1]), D.hunkCounter(1, -1)], ['No changes to go through.', '3 changes — Next goes to the first.', 'Change 2 of 3 — 1 line added: changed line 5', '1 change — Next goes to the first.'], 'the words beside Previous and Next');
    t.eq(D.hunks(kit.diff('same', 'same', 3).rows), [], 'identical texts: no change to go to');
    t.eq(D.hunks(kit.diff('a\n', 'a', 3).rows), [], 'only the final line break differs: no line changed, no change to go to');
    t.eq(D.hunks(kit.diff('', 'x\ny', 3).rows).map((x) => [x.a, x.b]), [[[1, 0], [1, 2]]], 'everything added: one change');
  }

  rmSync(dir, { recursive: true, force: true });
};
