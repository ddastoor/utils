// Fancy Text (src/lib/fancy.ts): every styled alphabet against the Unicode Character Database, where the characters
// were looked up by their names (tests/fixtures/fancy/reference.json, python3 scripts/make-fancy-reference.py), and
// against ICU's compatibility normalisation; the styles that work character by character on real text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { FANCY, BY_CHARACTER, needsEngine, plainClusters, shownPart, fancyRow, FANCY_SHOWN } = await load('/src/lib/fancy.ts');
  const { bindTextkit } = await load('/src/wasm/textkit.ts');
  const kit = bindTextkit(await wasm('textkit')), clusters = kit.clusters;
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/fancy/reference.json'), 'utf8'));
  /** a style as the tab applies it: the engine's splitter where the text needs it */
  const style = (name) => { const f = FANCY.find(([n]) => n === name)[1]; return (s) => f(s, needsEngine(s) ? clusters : plainClusters); };
  const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LOW = 'abcdefghijklmnopqrstuvwxyz', DIG = '0123456789';
  t.eq(FANCY.map(([n]) => n), ['Bold', 'Italic', 'Bold italic', 'Script', 'Bold script', 'Fraktur', 'Double-struck', 'Sans-serif', 'Sans bold', 'Sans italic', 'Monospace', 'Circled', 'Fullwidth', 'Small caps', 'Upside down', 'Strikethrough', 'Underline', 'Squared'], 'eighteen styles');

  // ---- the alphabets, character for character as Unicode names them
  for (const [name, [caps, small, digits]] of Object.entries(ref).filter(([k]) => !k.startsWith('_'))) {
    const f = style(name);
    t.eq([f(UP), f(LOW), f(DIG)], [caps, small, digits ?? DIG], `${name}: A–Z, a–z${digits ? ' and 0–9' : ''} are the characters Unicode names for this style${digits ? '' : '; digits stay as they are'}`);
  }
  t.eq(style('Circled')('Room 12, floor 0'), 'Ⓡⓞⓞⓜ ①②, ⓕⓛⓞⓞⓡ ⓪', 'circled digits too (the tab left digits plain: "Ⓡⓞⓞⓜ 12")');
  // ---- back again: ICU's compatibility normalisation gives the plain letters
  for (const name of ['Bold', 'Italic', 'Bold italic', 'Script', 'Bold script', 'Fraktur', 'Double-struck', 'Sans-serif', 'Sans bold', 'Sans italic', 'Monospace', 'Circled', 'Fullwidth', 'Squared']) {
    const src = name === 'Squared' ? UP : UP + LOW + DIG + ' The quick brown fox, 2026!';
    t.eq(style(name)(src).normalize('NFKC'), src, `${name}: normalising the styled text (NFKC) gives the plain text back`);
  }
  t.ok(FANCY.every(([n]) => !/\p{Cn}/u.test(style(n)(UP + LOW + DIG))), 'no style produces a code point that is not assigned');
  t.ok(['Bold', 'Double-struck', 'Fraktur', 'Circled'].every((n) => [...style(n)(UP + LOW)].length === 52), 'one character out for one character in');
  // ---- small capitals
  { const got = style('Small caps')(LOW), want = [...LOW].map((c) => (c === 'q' ? 'ǫ' : ref._smallcaps[c] ?? c)).join('');
    t.eq(got, want, 'small capitals are the "LATIN LETTER SMALL CAPITAL" characters of Unicode; x has none and stays; q is ǫ (the real small capital Q is missing from most fonts)');
    t.eq(style('Small caps')('SuperTools 2026'), 'SᴜᴘᴇʀTᴏᴏʟꜱ 2026', 'capitals and digits stay'); }

  // ---- upside down
  const flip = style('Upside down');
  t.eq(flip('Hello!'), '¡ollǝH', 'the letters in reverse, each turned over');
  t.eq(flip('Room 69'), '69 ɯooᴚ'.replace('ᴚ', 'ꓤ'), '6 and 9 change into each other: "69" still reads 69 (the tab wrote "96")');
  t.eq(flip('1234567890'), '068ㄥ9ϛㄣƐᄅƖ', 'every digit turned over');
  t.eq(flip('(hi) [ok] {x} <y>'), '<ʎ> {x} [ʞo] (ᴉɥ)', 'brackets change places, so that they still open and close (the tab wrote ")ᴉɥ(")');
  t.eq(flip('Wait, what? "No."'), '„˙oN„ ¿ʇɐɥʍ \'ʇᴉɐM', 'comma, full stop, question and quotation marks');
  t.eq(flip('👍🏽 ok 🇮🇳'), '🇮🇳 ʞo 👍🏽', 'an emoji with its skin tone and a flag stay whole (the tab turned 🇮🇳 into 🇳🇮 and tore the skin tone off)');
  t.eq(flip('café'), 'ǝ\u0301ɟɐɔ', 'an accented letter is turned over with its accent');
  t.eq(flip('one\ntwo'), 'oʍʇ\nǝuo', 'several lines: the last line comes first');
  t.eq(flip(flip('pod')), 'pod', 'p, o, d turned twice are themselves'); t.eq(flip(''), '', 'nothing');
  t.eq(clusters(flip('नमस्ते')).join('|'), 'स्ते|म|न', 'Hindi is reversed by whole characters, vowel signs kept on their letters');

  // ---- a mark through or under every character
  const strike = style('Strikethrough'), under = style('Underline');
  t.eq([strike('Hello!'), under('Hello!')], ['H\u0336e\u0336l\u0336l\u0336o\u0336!\u0336', 'H\u0332e\u0332l\u0332l\u0332o\u0332!\u0332'], 'one combining mark after each character');
  t.eq(strike('👍🏽'), '👍🏽\u0336', 'an emoji with its skin tone gets one mark, after the whole of it (the tab put one between the hand and its colour)');
  t.eq(strike('👨\u200d👩\u200d👧'), '👨\u200d👩\u200d👧\u0336', '… and a family is not broken up at its joiners');
  t.eq([...strike('नमस्ते')].filter((c) => c === '\u0336').length, 3, 'नमस्ते: three characters, three marks (not six)');
  t.eq(strike('a b\nc'), 'a\u0336 \u0336b\u0336\nc\u0336', 'a space is struck, a line break is left alone');
  t.eq(strike(''), '', 'nothing');

  // ---- accents, other scripts, emoji
  t.eq(style('Bold')('café naïve'), '𝐜𝐚𝐟𝐞\u0301 𝐧𝐚𝐢\u0308𝐯𝐞', 'an accented letter takes the style and keeps its accent (the tab left "é" plain in the middle of bold letters)');
  t.eq(style('Bold')('नमस्ते 🙏 ß ø 한'), 'नमस्ते 🙏 ß ø 한', 'what has no styled form stays as it is: Hindi, emoji, ß, ø, Korean');
  t.eq(style('Fullwidth')('Hi! 2+2=4'), 'Ｈｉ！\u3000２＋２＝４', 'fullwidth takes the signs too, and a wide space');
  t.eq(style('Monospace')('a\nb'), '𝚊\n𝚋', 'line breaks stay');
  t.eq(clusters('👍🏽नि a').length, 4, 'clusters: an emoji with skin tone, a letter with its sign, a space, a letter');
  // ---- telling characters apart: the engine (textkit.wasm, Unicode's rules) and the short cut for Latin text
  t.eq(clusters('\ud83d\udc4d\ud83c\udffd\u0928\u093f a'), ['\ud83d\udc4d\ud83c\udffd', '\u0928\u093f', ' ', 'a'], 'the engine: an emoji with its skin tone, a letter with its vowel sign, a space, a letter');
  t.eq(clusters('\ud83c\uddee\ud83c\uddf3\ud83c\uddfa\ud83c\uddf8'), ['\ud83c\uddee\ud83c\uddf3', '\ud83c\uddfa\ud83c\uddf8'], 'two flags are two characters');
  t.eq(clusters('1\ufe0f\u20e3\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67').length, 2, 'a keycap and a family');
  t.eq(clusters('\u0915\u094d\u0937\u093f'), ['\u0915\u094d\u0937\u093f'], 'a Hindi conjunct with its vowel sign is one character (Unicode 15.1 and later)');
  t.eq(clusters('a\r\nb'), ['a', '\r\n', 'b'], 'CR LF is one'); t.eq(clusters(''), [], 'nothing');
  t.eq(clusters('x\ud800y'), ['x', '\ud800', 'y'], 'half a surrogate pair does not shift what follows it');
  { // against ICU (Node's Intl.Segmenter), where it knows the same Unicode version as the crate
    const texts = ['Go \ud83d\udc4d\ud83c\udffd India \ud83c\uddee\ud83c\uddf3!', '\u0928\u092e\u0938\u094d\u0924\u0947 \u0926\u0941\u0928\u093f\u092f\u093e', '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35', '\ud55c\uad6d\uc5b4 \u1112\u1161\u11ab', 'e\u0301\u0336\u0332 z\u0351\u0358a\u030alg\u0303o', '\u0ba8\u0bbf \u0c15\u0c4d\u0c37 \u0d15\u0d4d\u200d', '\ud83e\uddd1\ud83c\udffb\u200d\ud83d\udcbb \ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc65\udb40\udc6e\udb40\udc67\udb40\udc7f', '\u0627\u0644\u0633\u0651\u0644\u0627\u0645 \u05e9\u05b8\u05c1\u05dc\u05d5\u05b9\u05dd', 'a\u200db \u00ad \u2028 \ufeff'];
    const icu = (s) => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment);
    if (process.versions.unicode?.startsWith('17.')) t.eq(texts.map((x) => clusters(x)), texts.map(icu), `${texts.length} texts in ten scripts are cut as ICU cuts them (Unicode ${process.versions.unicode})`);
    else t.ok(true, `skipped: this Node knows Unicode ${process.versions.unicode}, the engine 17.0`);
  }
  { // the short cut must agree with the engine on every text it is used for
    let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const pool = ['a', 'Z', '0', ' ', '\n', '\r', '\r\n', '\t', '\u0301', '\u0336', '\u0332', '\u035c', '\u00e9', '\u00ad', '\u007f', '\u0085', '\u00a0', '\u1ebf', '\u1e9e', '\u02b0', '\u0000', '\u001b', '.', '\u00a9', '\u036f', '\u0300', '\u2014', '\u2019', '\u201c', '\u2026', '\u2022', '\u203c', '\u2049', '\u20b9', '\u20ac', '\u2030', '\u2011', '\u205e', '\u2010', '\u2027', '\u20a0', '\u20cf'];
    let bad = 0, n = 0, first = '';
    for (let k = 0; k < 3000; k++) { const s = Array.from({ length: 1 + rnd(12) }, () => pool[rnd(pool.length)]).join(''); if (needsEngine(s)) continue; n++; if (JSON.stringify(plainClusters(s)) !== JSON.stringify(clusters(s))) { bad++; first ||= JSON.stringify(s) + ' ' + JSON.stringify(plainClusters(s)) + ' / ' + JSON.stringify(clusters(s)); } }
    t.ok(n > 2500 && bad === 0, `Latin text is cut without the engine exactly as the engine cuts it (${n} random texts with accents, controls and line breaks) ${first}`);
    t.eq(['Hello, caf\u00e9 \u1ebf!\n', 'e\u0301', 'don\u2019t \u2014 \u201cso\u201d\u2026 \u20b9500 \u2022 \u20ac5'].map(needsEngine), [false, false, false], 'no engine for Latin text with accents, curly quotes, dashes, the ellipsis and currency signs');
    t.eq(['\ud83d\ude00', '\u0928', 'a\u200db', '\u03b1', '\u2028', '\u200b', '\u20e3', '\u2122', '\u202e', '\u2060'].map(needsEngine), Array(10).fill(true), 'the engine is asked for whatever goes beyond that: an emoji, another script, a joiner, a line separator, a keycap mark');
  }
  t.eq([...BY_CHARACTER], ['Upside down', 'Strikethrough', 'Underline'], 'three styles work character by character');
  t.ok(FANCY.filter(([n]) => !BY_CHARACTER.has(n)).every(([, f]) => f('Hi \ud83d\udc4d\ud83c\udffd', () => { throw new Error('asked'); }).length > 0), 'the other fifteen never ask how a text is cut');

  // ---- what a row shows of a long text
  t.eq(FANCY_SHOWN, 2000, 'two thousand characters');
  t.eq([shownPart('abc', plainClusters), shownPart('a'.repeat(2000), plainClusters)], [null, null], 'up to 2,000 characters: the whole text');
  t.eq(shownPart('a'.repeat(2001), plainClusters), 'a'.repeat(2000), 'one more: the first 2,000');
  t.eq(shownPart('a'.repeat(1998) + '\ud83d\udc4d\ud83c\udffd!', clusters), 'a'.repeat(1998), 'an emoji with its skin tone that would be cut in two is left out');
  t.eq(shownPart('a'.repeat(1999) + 'e\u0301\u0336' + 'b'.repeat(50), plainClusters), 'a'.repeat(1999), 'a letter is not shown without its marks');
  t.eq(shownPart('x'.repeat(50) + '\ud83d\udc4d\ud83c\udffd' + 'a'.repeat(1998), clusters, true), 'a'.repeat(1998), 'from the end (for the text turned upside down): the same care');
  t.eq(shownPart('\u0928\u093f'.repeat(1200), clusters), '\u0928\u093f'.repeat(1000), 'Hindi: whole characters');
  { const long = 'The quick brown fox jumps over the lazy dog 123. '.repeat(4000);
    const rows = Object.fromEntries(FANCY.map(([n, f]) => [n, fancyRow(n, f, long, plainClusters)]));
    t.ok(Object.values(rows).every((v) => v.endsWith('…')), 'a long text: every row ends with an ellipsis');
    t.eq(rows.Bold, style('Bold')(long.slice(0, 2000)) + '…', 'a row is the style of the first 2,000 characters');
    t.eq(rows['Upside down'], style('Upside down')(long).slice(0, 2000) + '…', 'turned upside down, the row begins as the whole result begins: with the end of the text');
    const t0 = Date.now(); const out = FANCY.map(([n]) => style(n)(long));
    t.ok(out.every((v) => v.length >= long.length) && Date.now() - t0 < 5000, `Copy: 200,000 characters in all eighteen styles take ${Date.now() - t0} ms`);
    const hindi = '\u0928\u092e\u0938\u094d\u0924\u0947 \ud83d\ude4f '.repeat(20000); const t1 = Date.now(); const u = style('Underline')(hindi);
    t.ok(u.length > hindi.length && Date.now() - t1 < 5000, `… and 180,000 characters of Hindi and emoji underlined through the engine take ${Date.now() - t1} ms`); }
};
