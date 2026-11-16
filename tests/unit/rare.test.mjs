// textcore.wasm rare-word ranking (Photo Dictionary): frequency table, tokeniser, lemmatiser, names, ordering.
import { readFileSync } from 'node:fs';
export default async (t, { load, wasm }) => {
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const tc = bindTextcore(await wasm('textcore'));

  // ---- a small synthetic table: known answers
  t.eq(tc.freqLoad('70 the and of\n45 house walk\n30 goose geese study\n20 serendipity run\n12 quixotic\n'), 11, 'synthetic table: 11 words');
  t.eq(tc.freqGet('the'), 70, 'freqGet the'); t.eq(tc.freqGet('quixotic'), 12, 'freqGet quixotic'); t.eq(tc.freqGet('nope'), -1, 'unknown word = -1');
  t.eq(tc.freqLoad('50 a\n40 a b\n'), 2, 'duplicate words are stored once');
  t.eq(tc.freqGet('a'), 50, 'the first (most frequent) entry of a duplicate wins');

  // ---- the real wordfreq table shipped with the tool
  const freq = readFileSync(new URL('../../public/data/dict/freq.txt', import.meta.url), 'utf8');
  const n = tc.freqLoad(freq);
  t.ok(n > 250000, `real table loads (${n} words)`);
  const z = (w) => tc.freqGet(w);
  t.ok(z('the') >= 75, `"the" is the most common (${z('the')})`);
  t.ok(z('house') > z('serendipity') && z('serendipity') > 0, 'house is more common than serendipity');
  t.ok(z('geese') > 0 && z('quixotic') > 0 && z('perspicacious') > 0, 'irregular forms and rare words are in the table');
  t.eq(z('xqzv'), -1, 'nonsense is not');

  const rare = (s, max = 45) => tc.rare(s, max);
  const words = (s, max) => rare(s, max).map((r) => r.w);

  // stop words and common words never appear; rarest first
  const r1 = rare('The quixotic knight and the perspicacious squire rode to the house of the serendipity.');
  t.ok(!r1.some((r) => ['the', 'and', 'to', 'of', 'house'].includes(r.w)), `common words dropped (${r1.map((r) => r.w).join(' ')})`);
  t.ok(['quixotic', 'perspicacious', 'serendipity', 'squire'].every((w) => r1.some((r) => r.w === w)), 'rare words kept');
  t.ok(r1.every((r, i) => i === 0 || r1[i - 1].z <= r.z), 'sorted rarest first');
  t.eq(r1.find((r) => r.w === 'quixotic').z, z('quixotic'), 'Zipf reported for each word');

  // counts break ties; first appearance breaks the rest
  const r2 = rare('zephyr zephyr zephyr. Zephyr!', 99);
  t.eq(r2.length, 1, 'repeated word counted once'); t.eq(r2[0].n, 4, 'four occurrences (case folded)');

  // possessives, curly apostrophes, contractions
  t.eq(words("The curmudgeon's hat; the curmudgeons’ hats", 99).filter((w) => w.startsWith('curmudgeon')).sort(), ['curmudgeon', 'curmudgeons'], 'possessives stripped (’ and \')');
  t.ok(!words("don't won’t it's", 99).some((w) => w.includes("'s")), 'contractions are not split into junk');

  // line-break hyphenation and compounds
  t.ok(words('a magnani-\nmous gesture', 99).includes('magnanimous'), 'word split across lines is joined');
  t.ok(words('catalogued the lugu- :\n. brious letters', 99).includes('lugubrious'), 'join survives OCR noise around the line break');
  t.ok(!words('the lugu- 7\nbrious', 99).includes('lugubrious') && !words('the lugu-\n\nbrious', 99).includes('lugubrious'), 'no join across digits or a blank line (paragraph)');
  t.ok(!words('oo FE PF ox', 99).length, 'tokens shorter than 3 letters are never candidates');
  t.ok(!words('they re-\nturned to the cha-  \n  teau', 99).some((w) => w.startsWith('re-') || w === 'cha'), 'joined across a line break with spaces (return, chateau)');
  t.ok(!words('a well-\nknown fact', 99).includes('wellknown'), 'real compound is not glued together (wordfreq splits it: well + known)');
  t.ok(words('self-aggrandizing nonsense', 99).includes('aggrandizing'), 'unknown hyphenated word adds its parts');

  // digits, single letters, OCR junk
  t.ok(!words('2nd 3rd x1 B12 a b c', 99).length, 'digit-mixed tokens and single letters dropped');
  const junk = rare('the frobnicated qwzxy', 99);
  t.ok(junk.some((r) => r.w === 'qwzxy' && r.z === -1), 'unknown token kept with z = -1 (rarest, for online lookup)');
  t.ok(junk[0].z === -1, 'unknown words sort first');

  // lemmatiser: regular inflections of words the table lacks fall back to a base form
  const lem = tc.rare('He was absquatulating; they absquatulated.', 99);
  t.ok(lem.every((r) => r.w.startsWith('absquatulat')), 'inflections tokenised');
  tc.freqLoad('20 absquatulate glimmer happy stop study box quick hope\n');
  const base = (w) => tc.rare(w, 99)[0]?.b;
  const cases = { absquatulating: 'absquatulate', absquatulated: 'absquatulate', glimmering: 'glimmer', happier: 'happy', happiest: 'happy',
    happily: 'happy', stopped: 'stop', stopping: 'stop', studies: 'study', studied: 'study', boxes: 'box', quickly: 'quick', hoped: 'hope', hoping: 'hope' };
  for (const [w, b] of Object.entries(cases)) t.eq(base(w), b, `lemma ${w} → ${b}`);
  t.eq(base('glimmer'), '', 'known word needs no base form');
  t.eq(tc.rare('glimmerings', 99)[0].z, 20, 'unknown form takes the Zipf of its base');

  // names: capitalised mid-sentence every time → c = 1; sentence-initial or lower-case use → c = 0
  tc.freqLoad(freq);
  const nm = rare('Yesterday Hermione met Quentin. Quentin smiled. Obstreperous children shouted; the obstreperous ones left.', 99);
  t.eq(nm.find((r) => r.w === 'hermione')?.c, 1, 'Hermione looks like a name');
  t.eq(nm.find((r) => r.w === 'quentin')?.c, 1, 'Quentin (mid-sentence once) looks like a name');
  t.eq(nm.find((r) => r.w === 'obstreperous')?.c, 0, 'a word also written in lower case is not a name');
  t.eq(rare('Yesterday was fine.', 99).find((r) => r.w === 'yesterday')?.c ?? 0, 0, 'sentence-initial capital alone is not a name');

  // accents, Unicode, robustness
  t.ok(words('Café naïve résumé façade', 99).some((w) => w === 'naïve' || w === 'café'), 'Latin accented letters kept and lower-cased');
  t.ok(words('ÉCLAT', 99).includes('éclat'), 'accented capitals lower-cased');
  t.eq(rare('').length, 0, 'empty text'); t.eq(rare('!!! ... ,,, 123').length, 0, 'only punctuation and numbers');
  const huge = Array.from({ length: 20000 }, (_, i) => `word${i % 7 ? '' : 'x'} sesquipedalian`).join(' ');
  t.ok(rare(huge).some((r) => r.w === 'sesquipedalian' && r.n === 20000), 'long text (40k tokens) handled');
  let crashed = false; try { for (let i = 0; i < 200; i++) rare(String.fromCharCode(...Array.from({ length: 300 }, (_, k) => (k * 7919 + i * 104729) % 0xffff))); } catch { crashed = true; }
  t.ok(!crashed, 'random UTF-16 garbage never traps');
};
