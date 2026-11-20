// Lorem Ipsum (textkit-lorem.wasm on the lipsum crate; src/lib/lorem.ts): the text against the crate's own two texts
// read on their own by Python (tests/fixtures/lorem/reference.json, python3 scripts/make-lorem-reference.py) — every
// two neighbouring words must follow each other in Cicero or the classic passage — and the counts against the Word
// Counter's engine (textkit.wasm) and against plain splitting.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindLorem } = await load('/src/wasm/lorem.ts');
  const { LIMITS, readCount, asText, summary } = await load('/src/lib/lorem.ts');
  const { bindTextkit } = await load('/src/wasm/textkit.ts');
  const eng = bindLorem(await wasm('textkit-lorem')), kit = bindTextkit(await wasm('textkit'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/lorem/reference.json'), 'utf8'));
  const PAIRS = new Set(ref.pairs), WORDS = new Set(ref.words), STARTS = new Set(ref.starts);
  const seed = (k) => { const s = new Uint8Array(32); let x = k * 2654435761 >>> 0; for (let i = 0; i < 32; i++) { x = (x * 1103515245 + 12345) >>> 0; s[i] = x >>> 24; } return s; };
  const gen = (unit, n, classic, k = 1) => eng.generate(unit, n, classic, seed(k));
  const bare = (w) => w.toLowerCase().replace(/[^a-z]/g, '');
  const sentencesOf = (p) => p.split(/(?<=[.?!])\s+/).filter(Boolean);

  // ---- the text: Cicero's words in Cicero's order
  { let badPair = '', badWord = '', checked = 0, sentences = 0, badStart = '', badShape = '', longest = 0;
    for (let k = 1; k <= 60; k++) {
      const r = gen(['p', 's', 'w'][k % 3], [6, 40, 600][k % 3], k % 2 === 0, k);
      for (const para of r.paragraphs) {
        const w = para.split(' ');
        for (let i = 0; i < w.length; i++) {
          if (!WORDS.has(bare(w[i]))) badWord ||= `${w[i]} (seed ${k})`;
          if (i && !PAIRS.has(`${bare(w[i - 1])} ${bare(w[i])}`)) badPair ||= `"${w[i - 1]} ${w[i]}" (seed ${k})`;
          checked++;
        }
        for (const s of sentencesOf(para)) {
          sentences++; const sw = s.split(' '); longest = Math.max(longest, sw.length);
          if (!/^[A-Z][a-zA-Z]*[.,;:?!]?( [a-zA-Z]+[.,;:?!]?)*$/.test(s) || !/[.?!]$/.test(s) || sw.length > 40) badShape ||= s;
        }
        if (k % 2 === 1 && !STARTS.has(bare(w[0])) && para === r.paragraphs[0]) badStart ||= w[0];
      }
    }
    t.ok(checked > 20000 && !badWord, `every word of ${checked.toLocaleString()} is a word of the crate's texts ${badWord}`);
    t.ok(!badPair, `every two neighbouring words follow each other in Cicero or the classic passage (a Markov chain of words, nothing invented) ${badPair}`);
    t.ok(!badStart, `a text without the classic opening begins with a word that begins one of Cicero's sentences ${badStart}`);
    t.ok(sentences > 1500 && !badShape, `${sentences} sentences: a capital first, a full stop, question or exclamation mark last, only letters and . , ; : ? ! (no stray quotation marks, dashes or footnote stars of the source) ${badShape}`);
    t.ok(longest <= 40, `no sentence is longer than 40 words (${longest}; Cicero's run to 103)`); }
  { const r = gen('p', 50, false, 3), all = r.paragraphs.join(' ').split(' ');
    let doubled = 0; for (let i = 1; i < all.length; i++) if (bare(all[i]) === bare(all[i - 1])) doubled++;
    const vocab = new Set(all.map(bare)).size;
    t.ok(doubled === 0 && vocab > 1200, `${all.length.toLocaleString()} words: none doubled ("ut ut" came 15 times in 1,000), ${vocab} different words (the tab had 63)`);
    t.ok((r.paragraphs.join(' ').match(/,/g) ?? []).length > all.length / 15, 'commas inside the sentences, as in real text (the tab had none)'); }

  // ---- "Lorem ipsum…"
  for (const unit of ['p', 's']) t.ok(gen(unit, 3, true, 9).paragraphs[0].startsWith(ref.classic + ' '), `${unit === 'p' ? 'Paragraphs' : 'Sentences'}: the classic first sentence word for word, as the passage has it`);
  t.eq(gen('s', 1, true).paragraphs, [ref.classic], 'one sentence: exactly it');
  t.eq(gen('w', 5, true).paragraphs, ['Lorem ipsum dolor sit amet.'], 'five words'); t.eq(gen('w', 1, true).paragraphs, ['Lorem.'], 'one word');
  t.eq(gen('w', 19, true).paragraphs, [ref.classic], 'nineteen words: the whole sentence');
  t.ok(gen('w', 8, false, 4).paragraphs[0] !== gen('w', 8, true, 4).paragraphs[0] && !gen('p', 3, false, 5).paragraphs[0].startsWith('Lorem'), 'without it the text begins elsewhere');

  // ---- exact counts — by plain splitting and by the Word Counter's engine
  const counted = (r) => { const s = kit.stats(r.paragraphs.join('\n\n')); return [s.paragraphs, s.sentences, s.words]; };
  for (const [unit, n] of [['p', 1], ['p', 3], ['p', 37], ['p', 200], ['s', 1], ['s', 5], ['s', 333], ['s', 2000], ['w', 1], ['w', 2], ['w', 50], ['w', 299], ['w', 5000], ['w', 20000]]) {
    for (const classic of [true, false]) {
      const r = gen(unit, n, classic, n + (classic ? 1 : 2));
      const words = r.paragraphs.join(' ').split(' ').length, sents = r.paragraphs.reduce((a, p) => a + sentencesOf(p).length, 0);
      const want = { p: r.paragraphs.length, s: sents, w: words }[unit];
      t.ok(want === n && r.words === words && r.sentences === sents, `${n} ${LIMITS[unit].many}${classic ? ' (classic)' : ''}: ${r.paragraphs.length} paragraphs, ${sents} sentences, ${words} words — as the engine reports`);
      const [cp, cs, cw] = counted(r);
      t.ok(cw === words && cs === sents && cp === r.paragraphs.length, `… and as the Word Counter counts them (${cp} / ${cs} / ${cw})`);
    }
  }
  { const sizes = new Map(); for (let k = 0; k < 40; k++) for (const p of gen('p', 50, false, 100 + k).paragraphs) { const n = sentencesOf(p).length; sizes.set(n, (sizes.get(n) ?? 0) + 1); }
    t.eq([...sizes.keys()].sort(), [4, 5, 6, 7, 8], 'a paragraph has 4 to 8 sentences');
    const expected = 2000 / 5, chi = [...sizes.values()].reduce((a, v) => a + (v - expected) ** 2 / expected, 0);
    t.ok(chi < 18.5, `… each about as often as the others (χ² ${chi.toFixed(1)} on 4 degrees of freedom, below the 0.1 % bound 18.5)`); }
  t.eq([gen('p', 0, true).paragraphs, gen('w', 0, true).paragraphs, gen('s', 0, false).paragraphs], [[], [], []], 'none asked: nothing (no sentences gave one empty paragraph)');
  { // the end of a text: the crate's chain had no word after its last two, dropped the last word ("laborum.") and
    // jumped to a random place in the middle of a sentence; read as a circle, the passage's end leads to its beginning
    let ends = 0, wrong = '';
    for (let k = 0; k < 400; k++) { const p = gen('w', 400, true, 500 + k).paragraphs[0]; let i = -1; while ((i = p.indexOf(' est laborum.', i + 1)) >= 0) { ends++; const after = p.slice(i + 13, i + 25); if (after && !after.startsWith(' Lorem ipsum')) wrong ||= p.slice(i, i + 40); } }
    t.ok(ends > 5 && !wrong, `"… est laborum." — the last words of the classic passage — come out now (${ends} times in 400 texts; the crate's chain never wrote "laborum."), followed by its first words ${wrong}`); }

  // ---- the seed: the same text for the same seed; more of the same text for a larger number
  t.eq(gen('p', 4, false, 7), gen('p', 4, false, 7), 'the same seed, the same text');
  t.ok(gen('p', 4, false, 7).paragraphs[0] !== gen('p', 4, false, 8).paragraphs[0], 'another seed, another text');
  { const a = gen('p', 3, true, 11).paragraphs, b = gen('p', 5, true, 11).paragraphs; t.eq(b.slice(0, 3), a, 'five paragraphs begin with the three of the same seed (a new number keeps the text)'); }
  { const a = gen('s', 10, false, 12).paragraphs[0], b = gen('s', 20, false, 12).paragraphs[0]; t.ok(b.startsWith(a + ' '), 'twenty sentences begin with the ten'); }
  { const a = gen('w', 100, false, 13).paragraphs[0].split(' '), b = gen('w', 300, false, 13).paragraphs[0].split(' ');
    t.eq(b.slice(0, 99), a.slice(0, 99), '300 words begin with the 100 (the last word differs only by the full stop put after it)'); }
  t.throws(() => eng.generate('p', 3, true, new Uint8Array(8)), 'a seed of the wrong length is refused');
  { const t0 = Date.now(); const r = gen('w', 20000, false, 21); t.ok(r.words === 20000 && Date.now() - t0 < 2000, `20,000 words in ${Date.now() - t0} ms`); }

  // ---- reading "How many"
  t.eq([readCount('3', 'p'), readCount(' 1,000 ', 'w'), readCount('10 000', 'w'), readCount('200', 'p'), readCount('20000', 'w')], [{ n: 3 }, { n: 1000 }, { n: 10000 }, { n: 200 }, { n: 20000 }], 'whole numbers, with digit commas or spaces');
  t.eq(readCount('', 'p'), { error: 'Type how many paragraphs you want.' }, 'empty');
  t.eq(readCount('0', 's'), { error: 'The number of sentences cannot be below 1.' }, 'zero'); t.eq(readCount('-4', 'w'), { error: 'The number of words cannot be below 1.' }, 'negative');
  t.eq(readCount('2.5', 'p'), { error: 'Type a whole number of paragraphs.' }, 'a fraction'); t.eq(readCount('ten', 'w'), { error: '"ten" is not a number.' }, 'a word');
  t.eq(readCount('201', 'p'), { error: 'At most 200 paragraphs at a time.' }, 'above the limit');
  t.eq(readCount('20001', 'w'), { error: 'At most 20,000 words at a time.' }, 'above the limit of words (the tab stopped at 50 of anything)');
  t.eq([LIMITS.p.start, LIMITS.s.start, LIMITS.w.start], [3, 5, 50], 'each starts at its own usual number');

  // ---- the result as copied
  t.eq(asText(['A b.', 'C d.'], false), 'A b.\n\nC d.', 'plain: a blank line between paragraphs');
  t.eq(asText(['A b.', 'C <d> & e.'], true), '<p>A b.</p>\n<p>C &lt;d&gt; &amp; e.</p>', 'HTML: a <p> element each, escaped');
  t.eq(summary(['Ab cd.', 'Ef.'], 2, 3), '2 paragraphs · 2 sentences · 3 words · 11 characters', 'the line under the text (the blank line between paragraphs counts as two characters)');
  t.eq(summary(['Ab.'], 1, 1), '1 paragraph · 1 sentence · 1 word · 3 characters', 'one of each');
  t.eq(summary(Array(1).fill('a '.repeat(60000).trim()), 1, 60000), '1 paragraph · 1 sentence · 60,000 words · 1,19,999 characters', 'Indian digit grouping');
};
