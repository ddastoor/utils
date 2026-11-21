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

  // ---- Nov 2026 bug hunt: letters beyond ASCII, titles and initials, overlong tokens
  { // every letter of U+00C0–U+024F lowered as the JavaScript engine lowers it (V8 / ICU: another implementation)
    const bad = [];
    for (let c = 0xc0; c < 0x250; c++) {
      if (c === 0xd7 || c === 0xf7) continue;
      const ch = String.fromCodePoint(c), tok = `qq${ch}qq`, want = c === 0x130 ? 'qqiqq' : tok.toLowerCase();
      const got = rare(`${tok}.`, 999).map((r) => r.w);
      if (got.join() !== want) bad.push(`${ch}: ${got.join()} / ${want}`);
    }
    t.eq(bad, [], 'all 398 letters of Latin-1, Latin Extended-A and B are lowered as Unicode says (ł was lowered to ń, ń to ņ, ź to ż; Latin Extended-B not at all)');
  }
  t.eq(words('Gdańsk, Wrocław, Łódź and Dvořák.', 999).sort(), ['dvořák', 'gdańsk', 'wrocław', 'łódź'], 'Polish and Czech names keep their letters (they came out as "gdaŅsk", "wrocŃaw", "ŁódŻ")');
  { const r = rare('Last week Łódź was cold. We liked Łódź.', 999).find((x) => x.w === 'łódź'); t.eq(r?.c, 1, 'a name that begins with Ł is a name (Ł was not taken for a capital)'); }
  { const darcy = rare('Yesterday Mr. Darcy left. Mr. Darcy returned.', 999).find((x) => x.w === 'darcy');
    t.eq(darcy?.c, 1, '"Mr. Darcy": the full stop of a title ends no sentence, so Darcy stands in mid-sentence — a name (it was looked up as a word)'); }
  { const r = rare('The novels of J. R. R. Tolkien sold well. Tolkien wrote more.', 999).find((x) => x.w === 'tolkien');
    t.eq(r?.c, 1, '"J. R. R. Tolkien": initials end no sentence either'); }
  { const r = rare('Then I. Hope came.', 999).find((x) => x.w === 'hope'); t.eq(r?.c ?? 0, 0, '"I." is no initial: what follows starts a sentence'); }
  t.eq(words('Dr. Quixotic. Prof. Perspicacious and Capt. Serendipity.', 999).sort(), ['perspicacious', 'quixotic', 'serendipity'], 'a title with its full stop is never a candidate ("prof" was offered as a hard word)');
  t.ok(words('The prof said the capt was here.', 999).includes('prof'), '… the same word without a full stop is an ordinary word');
  { const long = 'word ' + 'a' + "'a".repeat(400) + ' perspicacious ' + 'b' + '-b'.repeat(400) + ' quixotic';
    t.eq(words(long, 999).sort(), ['perspicacious', 'quixotic', 'word'], 'a token of 800 apostrophes or hyphens between letters is too long for a word and is dropped — written within its 256-byte buffer (the apostrophes and hyphens were written past it)'); }

  // ---- words broken over two lines (owner, 21 Nov 2026: "If words have a hyphen or a dash between them because they
  // have to go to the next line … treat them as one word"): t_dehyphen, with the real table
  const dh = (x) => tc.dehyphen(x);
  t.eq(dh('an extra-\nordinary day'), 'an extraordinary\nday', 'a hyphen at a line end: one word, the rest of the line starts the next');
  t.eq(dh('a well-\nknown fact'), 'a well-known\nfact', 'a compound of two words keeps its hyphen');
  t.eq(dh('quite magnani\u00ad\nmous of him'), 'quite magnanimous\nof him', 'the soft hyphen always joins');
  t.eq(dh('an extra\u2013\nordinary day'), 'an extraordinary\nday', 'an en dash OCR read for a hyphen: joined');
  t.eq(dh('an extra\u2014\nordinary day'), 'an extraordinary\nday', 'an em dash OCR read for a hyphen: joined');
  t.eq(dh('He waited\u2014\nthen he left.'), 'He waited\u2014\nthen he left.', 'a real dash at a line end is left as it was');
  t.eq(dh('the inter\u00ac\nnational desk'), 'the international\ndesk', 'the not sign (Fraktur / OCR hyphen): joined');
  t.eq(dh('co\u2010\noperate now'), 'cooperate\nnow', 'the Unicode hyphen U+2010: joined');
  t.eq(dh('an extra-\nordinary, said he'), 'an extraordinary,\nsaid he', 'punctuation right after the word stays with it');
  t.eq(dh('an extra-\nordinary\nNext line'), 'an extraordinary\nNext line', 'a second half alone on its line: no empty line');
  t.eq(dh('a lugu- :\n. brious tale'), 'a lugubrious\ntale', 'stray marks of the page edge around the break are dropped');
  t.eq(dh('from 1990-\n2000 on'), 'from 1990-\n2000 on', 'numbers are not words: left alone');
  t.eq(dh('my mother-in-\nlaw came'), 'my mother-in-law\ncame', 'a compound of three: the hyphens stay');
  t.eq(dh('an extra-\r\nordinary day'), 'an extraordinary\nday', 'CR LF line ends');
  t.eq(dh('Ex-\nample text'), 'Example\ntext', 'a capital is kept as written');
  t.eq(dh('a well- \n known fact'), 'a well-known\nfact', 'spaces around the line break');
  t.eq(dh('a word -\nthen more'), 'a word -\nthen more', 'a mark after a space is not a broken word');
  t.eq(dh('end of line-\n\nNew paragraph'), 'end of line-\n\nNew paragraph', 'a blank line after the mark: not a broken word');
  t.eq(dh('naïve-\ntés'), dh('naïve-\ntés'), 'letters with accents are read (stable)');
  const plain = 'A long text without broken words. Line two — with a dash, mid-line hyphens (well-known) and “quotes”.\nLine three.';
  t.eq(dh(plain), plain, 'a text without broken words comes back unchanged, byte for byte');
  t.eq(tc.rare(dh('the extra-\nordinary quixotic-\nness')).map((x) => x.w).includes('extraordinary'), true, 'the ranking sees the joined word');
  // the same rule as the ranking's own (which joins a plain hyphen): every case agrees
  for (const [a, b] of [['magnani', 'mous'], ['re', 'turn'], ['well', 'known'], ['self', 'evident'], ['sur', 'veillance'], ['high', 'way']]) {
    const joined = !dh(`${a}-\n${b}`).includes('-'), ranked = tc.rare(`${a}-\n${b}`, 99).some((x) => x.w === a + b);
    t.eq(joined, ranked, `${a}-${b}: the shown text and the ranking decide alike (${joined ? 'joined' : 'kept'})`);
  }
};
