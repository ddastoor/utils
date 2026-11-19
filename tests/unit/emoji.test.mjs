// Emoji & Symbols: the data (src/lib/emoji-data.json, made by scripts/make-emoji-data.py) against two independent
// sources — the npm package unicode-emoji-json (another author's reading of Unicode's emoji-test.txt) and Perl's
// character names (tests/fixtures/emoji/reference.json) — and the search: what the ranking engine (textcore.wasm)
// finds for the words people type.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

export default async (t, { load, wasm, root }) => {
  const lib = await load('/src/lib/emoji.ts');
  const { EMOJI, SYMBOLS, ALL, EMOJI_GROUPS, SYMBOL_GROUPS, TONES, withTone, describe, codePoints, byCharacter, records, norm, SOURCE } = lib;
  const { SINGLE, JOINED } = await load('/src/lib/emoji-support.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const tc = bindTextcore(await wasm('textcore'));
  const require = createRequire(join(root, 'package.json'));
  const other = require('unicode-emoji-json/data-by-group.json');
  const perl = JSON.parse(readFileSync(join(root, 'tests/fixtures/emoji/reference.json'), 'utf8'));
  const byCh = new Map(EMOJI.map((e) => [e.ch, e]));
  const plain = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

  // ---- the emoji list against unicode-emoji-json
  const ref = other.flatMap((g) => g.emojis.map((e) => ({ ...e, group: g.name })));
  t.eq(SOURCE, `emojibase-data ${require('emojibase-data/package.json').version}`, 'the data file was made from the installed emojibase-data (python3 scripts/make-emoji-data.py after an update)');
  t.eq(EMOJI_GROUPS, other.map((g) => g.name), 'nine groups, in Unicode\'s order, named as the other package names them');
  t.eq(new Set(EMOJI.map((e) => e.ch)).size, EMOJI.length, 'no emoji twice');
  t.eq(ref.filter((e) => !byCh.has(e.emoji)).map((e) => e.emoji), [], `every one of the other package's ${ref.length} emoji (Emoji 17) is here, spelled the same`);
  { const extra = EMOJI.filter((e) => !ref.some((r) => r.emoji === e.ch));
    t.ok(extra.every((e) => e.version > 17), `what is here beyond that list is newer than Emoji 17 (${extra.length}: ${extra.map((e) => e.ch).join(' ')})`); }
  t.eq(ref.filter((e) => byCh.get(e.emoji).group !== e.group).length, 0, 'every emoji is in the group the other package puts it in');
  t.eq(ref.filter((e) => !!byCh.get(e.emoji).skins !== e.skin_tone_support).map((e) => e.emoji), [], 'skin tones for exactly the emoji the other package says have them');
  t.eq(ref.filter((e) => byCh.get(e.emoji).version !== parseFloat(e.emoji_version)).length, 0, 'the Emoji version of each');
  { const differ = ref.filter((e) => plain(byCh.get(e.emoji).name) !== plain(e.name)).map((e) => e.emoji);
    t.ok(differ.length <= 5 && differ.every((c) => byCh.get(c).group === 'Flags'), `the names agree but for ${differ.length} territories that CLDR calls by a longer name (${differ.join(' ')})`); }
  t.eq(EMOJI.map((e) => e.group).filter((g, i, a) => g !== a[i - 1]), EMOJI_GROUPS, 'in Unicode\'s order: group after group');
  t.ok(EMOJI.every((e) => e.name && e.name === e.name.trim() && e.kw.every((k) => k && k === k.trim())), 'every emoji has a name, and no keyword is empty');
  t.ok(EMOJI.filter((e) => e.kw.length >= 3).length > EMOJI.length * 0.9, 'nine in ten have three keywords or more');

  // ---- skin tones
  { const withSkins = EMOJI.filter((e) => e.skins);
    const mods = ['\u{1f3fb}', '\u{1f3fc}', '\u{1f3fd}', '\u{1f3fe}', '\u{1f3ff}'], strip = (s) => s.replace(/[\ufe0f]|\ud83c[\udffb-\udfff]/g, '');
    t.eq(withSkins.length, 332, '332 emoji have skin tones');
    t.ok(withSkins.every((e) => e.skins.length === 5 && e.skins.every((s, i) => s.includes(mods[i]) && mods.every((m, j) => j === i || !s.includes(m)))), 'five variants each, the n-th with the n-th skin-tone modifier and no other');
    t.ok(withSkins.every((e) => e.skins.every((s) => strip(s) === strip(e.ch))), 'a variant is the emoji itself with the modifier put in');
    const hands = byCh.get('\u{1f9d1}\u200d\u{1f91d}\u200d\u{1f9d1}');
    t.eq(hands.skins[2], '\u{1f9d1}\u{1f3fd}\u200d\u{1f91d}\u200d\u{1f9d1}\u{1f3fd}', 'two people holding hands: both take the tone, the handshake between them does not');
    const pray = byCh.get('\u{1f64f}');
    t.eq([withTone(pray, 0), withTone(pray, 3), withTone(byCh.get('\u{1f600}'), 3)], ['\u{1f64f}', '\u{1f64f}\u{1f3fd}', '\u{1f600}'], 'withTone: the plain one, medium, and a face that has no tones');
    t.eq(TONES.length, 6, 'six choices'); t.eq([describe(pray), describe(pray, 5)], ['folded hands', 'folded hands: dark skin tone'], 'what a cell says'); }
  // ---- the emoji that are drawn to see what a device can show
  t.ok(SINGLE.every(([v, ch]) => byCh.get(ch)?.version === v && [...ch].length === 1), `one new character of each Emoji version ${SINGLE.map(([v]) => v).join(', ')}`);
  t.ok(JOINED.every(([v, ch]) => byCh.get(ch)?.version === v && ch.includes('\u200d')), `one sequence of each version that added only sequences (${JOINED.map(([v]) => v).join(', ')})`);
  t.eq([...new Set(EMOJI.map((e) => e.version))].filter((v) => v >= 12).sort((a, b) => a - b), [...SINGLE, ...JOINED].map(([v]) => v).sort((a, b) => a - b), 'every Emoji version from 12 on is tested');

  // ---- symbols
  t.eq(SYMBOL_GROUPS, ['Arrows', 'Math', 'Greek', 'Superscripts & subscripts', 'Currency', 'Punctuation', 'Check & stars', 'Misc'], 'eight groups of symbols');
  t.ok(SYMBOLS.length === 237 && new Set(SYMBOLS.map((s) => s.ch)).size === 237 && SYMBOLS.every((s) => [...s.ch].length === 1), '237 symbols, each one character, none twice');
  t.eq(SYMBOLS.filter((s) => s.name.toUpperCase() !== perl.names[s.ch]).map((s) => `${s.ch} ${s.name} / ${perl.names[s.ch]}`), [], `every symbol is called what ${perl._source} calls it`);
  t.eq(describe(SYMBOLS.find((s) => s.ch === '₹')), 'Indian rupee sign · U+20B9', 'what a symbol says: its name and its code point');
  t.eq([codePoints('A'), codePoints('\u{1f1ee}\u{1f1f3}'), codePoints('₹')], ['U+0041', 'U+1F1EE U+1F1F3', 'U+20B9'], 'code points');
  t.eq(ALL.length, EMOJI.length + SYMBOLS.length, 'emoji first, then symbols');

  // ---- what the search engine is given
  const recs = records();
  t.ok(recs.length === ALL.length && recs.every(([id], i) => id === String(i)), 'one record for each, numbered in order');
  t.ok(recs.every(([, name, kw, desc]) => [name, ...kw, desc].every((s) => /^[a-z0-9+#.%/ -]*$/.test(s))), 'names and keywords are handed over in plain small letters (accents removed: Côte d’Ivoire, São Tomé)');
  t.ok(recs.every(([, name]) => name.length > 0), 'no record without a name');

  // ---- the search
  const index = tc.searchBuild(recs);
  const find = (q, max = 300) => tc.searchQuery(index, norm(q), max).map((i) => ALL[i]);
  const chars = (q, n = 300) => find(q).slice(0, n).map((x) => x.ch);
  const top = (q) => chars(q, 1)[0];
  /** the first symbol found (the tab lists emoji and symbols in cards of their own) */
  const sym = (q) => find(q).find((x) => x.kind === 'symbol')?.ch;
  // words that are no part of the name (the tab looked for the typed letters inside the name and nowhere else)
  t.eq(top('namaste'), '\u{1f64f}', 'namaste → 🙏');
  t.eq(top('thanks'), '\u{1f64f}', 'thanks → 🙏 (the name is "folded hands")');
  t.eq(top('thumbsup'), '\u{1f44d}', 'thumbsup, as GitHub and Slack write it → 👍'); t.eq(top('+1'), '\u{1f44d}', '+1 → 👍');
  t.ok(chars('happy', 8).includes('\u{1f600}') && find('happy').length >= 10, `happy finds the smiling faces (${chars('happy', 8).join(' ')}) — the tab found nothing`);
  t.ok(chars('laugh', 8).includes('\u{1f602}') && chars('lol', 8).includes('\u{1f602}'), 'laugh and lol find 😂 ("face with tears of joy"; "lol" found only a lollipop)');
  t.eq(top('birthday'), '\u{1f382}', 'birthday → 🎂'); t.eq(top('party'), '\u{1f389}', 'party → 🎉'); t.eq(top('fire'), '\u{1f525}', 'fire → 🔥'); t.eq(top('100'), '\u{1f4af}', '100 → 💯');
  t.eq(top('india'), '\u{1f1ee}\u{1f1f3}', 'india → 🇮🇳'); t.eq(top('flag india'), '\u{1f1ee}\u{1f1f3}', 'flag india'); t.eq(top('India FLAG'), '\u{1f1ee}\u{1f1f3}', 'any case, any order');
  t.eq(top('bharat'), '\u{1f1ee}\u{1f1f3}', 'bharat'); t.eq(top('diwali').length > 0 && chars('diwali').includes('\u{1fa94}'), true, 'diwali finds the diya lamp'); t.ok(chars('chai', 2).includes('☕'), 'chai → ☕');
  t.eq(top('cricket game'), '\u{1f3cf}', 'cricket game → 🏏'); t.ok(chars('cricket').includes('\u{1f3cf}'), 'cricket finds the bat (and the insect)');
  t.ok(chars('ok', 3).includes('\u{1f44c}') && !chars('ok').includes('\u{1f4d6}'), '"ok" finds 👌 and not every name with the letters o-k inside (book, broken, smoking)');
  t.ok(chars('red heart', 2).includes('❤\ufe0f'), 'red heart → ❤\ufe0f'); t.ok(find('heart').length > 40, 'heart: the many hearts');
  // symbols by what they are called
  t.eq(top('rupee'), '₹', 'rupee → ₹'); t.eq(top('euro sign'), '€', 'euro sign → €'); t.ok(chars('euro', 3).includes('€'), 'euro'); t.eq(top('pi'), 'π', 'pi → π'); t.eq(top('half'), '½', 'half → ½');
  t.eq(top('degree'), '°', 'degree → °'); t.ok(chars('copyright', 2).includes('©'), 'copyright'); t.ok(chars('tick', 5).includes('✓'), 'tick → ✓'); t.eq([sym('infinity'), top('infinity')], ['∞', '♾\ufe0f'], 'infinity: the sign ∞ among the symbols, ♾\ufe0f among the emoji');
  t.ok(chars('left arrow', 12).includes('←'), 'left arrow → ←'); t.eq(top('sqrt'), '√', 'sqrt → √'); t.eq(top('not equal'), '≠', 'not equal → ≠'); t.eq(top('em dash'), '—', 'em dash');
  t.eq(top('alpha'), 'α', 'alpha'); t.eq(top('squared'), '²', 'squared → ²'); t.eq(top('bullet'), '•', 'bullet'); t.eq(sym('trademark'), '™', 'trademark → ™'); t.eq(top('command'), '⌘', 'command → ⌘');
  t.eq(top('20b9'), '₹', 'a code point: 20b9 → ₹'); t.ok(find('arrows').filter((x) => x.kind === 'symbol').length >= 28 && find('currency').filter((x) => x.kind === 'symbol').length === 18, 'a group\'s name finds its symbols (arrows, currency)');
  // slips of the keyboard
  t.ok(chars('hapy', 8).includes('\u{1f600}'), 'hapy → the happy faces'); t.eq(top('brithday'), '\u{1f382}', 'brithday → 🎂'); t.eq(top('ruppee'), '₹', 'ruppee → ₹');
  t.eq([find('zzzzqqq').length, find('').length, find('?!').length], [0, 0, 0], 'nothing for nonsense, for nothing, for signs alone');
  { // everything can be found by its own name, and by each of its keywords
    let missName = [], missKw = [], asked = 0;
    ALL.forEach((it, i) => { if (!tc.searchQuery(index, norm(it.name), 300).includes(i)) missName.push(it.ch); });
    ALL.forEach((it, i) => { if (i % 7) return; for (const k of it.kw) { if (!norm(k)) continue; asked++; if (!tc.searchQuery(index, norm(k), 400).includes(i)) missKw.push(`${it.ch}:${k}`); } });
    t.eq(missName, [], `each of the ${ALL.length} emoji and symbols is found by its own name`);
    t.ok(missKw.length <= asked * 0.02, `… and by its keywords (${asked} asked on every seventh; ${missKw.length} beyond the first 400 results: ${missKw.slice(0, 8).join(', ')})`);
    const t0 = Date.now(); for (let k = 0; k < 200; k++) tc.searchQuery(index, norm(ALL[k * 9].name), 300);
    t.ok(Date.now() - t0 < 4000, `200 searches take ${Date.now() - t0} ms`); }
  tc.searchFree(index);

  // ---- a character typed or pasted into the box
  t.eq(byCharacter('\u{1f64f}').map((x) => x.name), ['folded hands'], 'pasting 🙏 finds it (to learn its name)');
  t.eq(byCharacter(' \u{1f64f}\u{1f3fd} ').map((x) => x.name), ['folded hands'], '… in any skin tone, with spaces around');
  t.eq(byCharacter('❤').map((x) => `${x.kind} ${x.name}`), ['emoji red heart', 'symbol Heavy black heart'], '❤ is an emoji and a symbol: both');
  t.eq(byCharacter('₹').map((x) => x.name), ['Indian rupee sign'], '₹'); t.eq([byCharacter('heart').length, byCharacter('').length, byCharacter('  ').length], [0, 0, 0], 'a word is no character');
};
