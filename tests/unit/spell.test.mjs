// The Spell Checker (potentials #10): our Hunspell 1.7.6 (hunspell.wasm) held to the native build of the same source —
// tests/fixtures/spell/reference.json, from scripts/make-spell-reference.py: every list of suggestions as native Hunspell gives
// it, and in the tab's order as the native build ranks it (wasm/hunspell/rank.hxx; the script works the order out a second time
// in Python and checks the two agree); how often the right word comes first; the words each dictionary must take or refuse;
// India's words; the reader's own words; and the text's rules (src/lib/spelltext.ts).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const at = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const REF = JSON.parse(readFileSync(at('tests/fixtures/spell/reference.json'), 'utf8'));
const bytes = (p) => new Uint8Array(readFileSync(at(p)));
const FILES = {
  'en-US': ['node_modules/dictionary-en/index.aff', 'node_modules/dictionary-en/index.dic'],
  'en-GB': ['node_modules/dictionary-en-gb/index.aff', 'node_modules/dictionary-en-gb/index.dic'],
  'en-IN': ['node_modules/dictionary-en-gb/index.aff', 'node_modules/dictionary-en-gb/index.dic', 'public/data/spell/en-IN.dic'],
};

export default async (t, { load, wasm }) => {
  const { bindHunspell } = await load('/src/wasm/hunspell.ts');
  const hs = bindHunspell(await wasm('hunspell'));
  t.eq(hs.version(), '1.7.6', 'the engine is Hunspell 1.7.6');
  const made = {};
  const make = (lang) => {
    if (made[lang]) return made[lang];
    const [aff, dic, extra] = FILES[lang];
    hs.file(`${lang}.aff`, bytes(aff)); hs.file(`${lang}.dic`, bytes(dic));
    const h = hs.create(`${lang}.aff`, `${lang}.dic`);
    if (extra) { hs.file('more.dic', bytes(extra)); t.ok(hs.addDic(h, 'more.dic'), `${lang}: India's words added to the British dictionary`); hs.unfile('more.dic'); }
    hs.unfile(`${lang}.aff`); hs.unfile(`${lang}.dic`);
    return (made[lang] = h);
  };
  t.throws(() => hs.create('none.aff', 'none.dic'), 'files not given: no checker');

  // ---- the words each dictionary takes or refuses
  for (const [lang, words] of Object.entries(REF.words)) {
    const h = make(lang), bad = Object.entries(words).filter(([w, ok]) => hs.spell(h, w) !== ok);
    t.ok(!bad.length, `${lang}: ${Object.keys(words).length} words taken or refused as native Hunspell does${bad.length ? ` — not: ${bad.map(([w]) => w).join(', ')}` : ''}`);
  }

  // ---- Hunspell's own suggestions: those of the native build, word for word (before the frequencies are given, suggest()
  // gives Hunspell's order whether ranked or not)
  const sets = Object.entries(REF.sets);
  let n = 0;
  for (const [lang, groups] of sets) {
    const h = make(lang), bad = [];
    for (const [name, rows] of Object.entries(groups)) for (const d of rows) {
      n++;
      if (hs.spell(h, d.typo)) { bad.push(`${d.typo} taken`); continue; }
      const s = hs.suggest(h, d.typo, name === 'codespell' && n % 2 === 0);
      if (s.join('|') !== d.s.join('|')) bad.push(`${d.typo}: ${s.slice(0, 4)} ≠ ${d.s.slice(0, 4)}`);
    }
    t.ok(!bad.length, `${lang}: ${Object.values(groups).flat().length} misspellings — the suggestions of native Hunspell 1.7.6, in its order${bad.length ? ` — ${bad.length} differ: ${bad.slice(0, 3).join(' | ')}` : ''}`);
  }

  // ---- the tab's order
  t.eq(hs.rank(make('en-US'), 'Teh', ['Te', 'The']), ['Te', 'The'], 'without the frequencies, a list keeps Hunspell’s order');
  const words = hs.freq(bytes('public/data/dict/freq.txt'));
  t.ok(words > 300_000, `the Photo Dictionary's word frequencies read: ${words.toLocaleString('en')} words`);
  for (const [lang, groups] of sets) {
    const h = make(lang), bad = [];
    for (const rows of Object.values(groups)) for (const d of rows) {
      const r = hs.rank(h, d.typo, d.s);
      if (r.join('|') !== d.r.join('|')) bad.push(`${d.typo}: ${r.slice(0, 4)} ≠ ${d.r.slice(0, 4)}`);
    }
    t.ok(!bad.length, `${lang}: every list in the order the native build and the Python reading give${bad.length ? ` — ${bad.length} differ: ${bad.slice(0, 3).join(' | ')}` : ''}`);
  }
  // the path the tab takes: Hunspell's suggestions ranked in one call
  {
    const h = make('en-US'), rows = REF.sets['en-US'].classicCapitalised, bad = rows.filter((d) => hs.suggest(h, d.typo).join('|') !== d.r.join('|'));
    t.ok(!bad.length, `suggest() ranks as rank() does (${rows.length} capitalised misspellings)${bad.length ? ` — not ${bad[0].typo}` : ''}`);
  }
  // how often the right word comes first — the whole sets, as the script measured them (fitted on the even-numbered half of
  // codespell's words, tested on the odd-numbered half), and the part kept here, measured again
  const first = (rows, key) => rows.filter((d) => d[key][0]?.toLowerCase() === d.right).length / rows.length;
  for (const [lang, m] of Object.entries(REF.measured)) {
    const line = Object.entries(m).map(([k, v]) => `${k} ${v.hunspell} → ${v.tab} %`).join(', ');
    t.ok(m.codespell.test.tab >= m.codespell.test.hunspell + 2 && m.capitalised.test.tab >= m.capitalised.test.hunspell + 5,
      `${lang}: the right word first more often (measured, words not fitted on: ${m.codespell.test.hunspell} → ${m.codespell.test.tab} %, capitalised ${m.capitalised.test.hunspell} → ${m.capitalised.test.tab} %) — ${line}`);
    t.ok(m.classic.tab >= m.classic.hunspell && m.classicCapitalised.tab >= m.classicCapitalised.hunspell + 10 && m.together.tab >= m.together.hunspell,
      `${lang}: and for the classic misspellings (${m.classic.hunspell} → ${m.classic.tab} %, capitalised ${m.classicCapitalised.hunspell} → ${m.classicCapitalised.tab} %) and words written together (${m.together.hunspell} → ${m.together.tab} %)`);
    const kept = REF.sets[lang], all = Object.values(kept).flat();
    t.ok(first(all, 'r') > first(all, 's'), `${lang}: in the ${all.length} kept here too (${(100 * first(all, 's')).toFixed(1)} → ${(100 * first(all, 'r')).toFixed(1)} %)`);
  }
  // known answers, as a person types them
  {
    const h = make('en-US'), top = (w) => hs.suggest(h, w)[0];
    const want = { Teh: 'The', teh: 'the', recieve: 'receive', Recieve: 'Receive', tommorow: 'tomorrow', alot: 'a lot', wierd: 'weird',
      definately: 'definitely', untill: 'until', occured: 'occurred', seperate: 'separate', thier: 'their', becuase: 'because',
      goverment: 'government', beleive: 'believe', freind: 'friend', jumpd: 'jumped', dont: "don't", Thier: 'Their', Alot: 'A lot' };
    const bad = Object.entries(want).filter(([w, r]) => top(w) !== r).map(([w, r]) => `${w} → ${top(w)} (not ${r})`);
    t.ok(!bad.length, `the right word first: ${Object.entries(want).map(([w, r]) => `${w} → ${r}`).join(', ')}${bad.length ? ` — ${bad.join('; ')}` : ''}`);
    t.ok(hs.suggest(h, 'wich').slice(0, 2).includes('which'), `“wich” — with or which — has “which” among the first two (${hs.suggest(h, 'wich').slice(0, 3)})`);
    const gb = make('en-GB'), inn = make('en-IN');
    t.eq(hs.suggest(gb, 'colur')[0], 'colour', 'British: colur → colour');
    t.eq(hs.suggest(make('en-US'), 'colur')[0], 'color', 'American: colur → color');
    t.eq(hs.suggest(inn, 'lakhh')[0], 'lakh', 'Indian English: lakhh → lakh');
    t.ok(hs.suggest(inn, 'Bengalru').includes('Bengaluru'), 'Indian English: Bengalru → Bengaluru among the suggestions');
  }

  // ---- the reader's own words
  {
    const h = make('en-US');
    t.ok(!hs.spell(h, 'Zorblax'), 'a made-up word is refused');
    hs.add(h, 'Zorblax');
    t.ok(hs.spell(h, 'Zorblax'), 'added: taken');
    hs.remove(h, 'Zorblax');
    t.ok(!hs.spell(h, 'Zorblax'), 'removed: refused again');
    hs.addWithAffix(h, 'Kaveri', 'London');
    t.ok(hs.spell(h, "Kaveri's"), "a word added like “London” takes its endings (Kaveri's)");
    t.ok(hs.spell(h, 'naive') && !hs.spell(h, 'naïve'), 'the American dictionary writes naive without its accent');
    t.eq([hs.suggest(h, 'naïve')[0], hs.suggest(h, 'café')[0], hs.suggest(h, 'Résumé')[0]], ['naive', 'cafe', 'Resume'], 'words with accents the dictionary writes without them (UTF-8 in and out): the plain word first');
  }

  // ---- the text's rules
  const st = await load('/src/lib/spelltext.ts');
  {
    const text = 'Teh NASA report on 2nd May: see https://example.org/a-b and mail me@x.co.in. Ramesh went to Infosys.\n"Recieve" it, said Dr. Rao';
    const toks = st.tokens(text), of = (w) => toks.find((x) => x.word === w);
    t.eq(of('Teh').skip, '', 'a capitalised word at the start of the text is checked');
    t.eq(of('NASA').skip, 'caps', 'CAPITALS left alone');
    t.eq(of('2nd').skip, 'digits', 'words with digits left alone');
    t.eq(toks.filter((x) => x.start > text.indexOf('https') && x.start < text.indexOf('Ramesh')).map((x) => x.word), ['and', 'mail'], 'web and e-mail addresses left alone, whole');
    t.eq(of('Ramesh').skip, '', 'a capitalised word after a sentence’s end is checked');
    t.eq(of('Infosys').skip, 'name', 'a capitalised word in mid-sentence is a name');
    t.eq(of('Recieve').skip, '', 'a capitalised word at a line’s start, behind a quotation mark, is checked');
    t.eq(of('Rao').skip, 'name', 'a name after a title (the full stop of “Dr.” ends no sentence)');
    t.eq(st.tokens('We met A. P. J. Abdul Kalam. Then we left.').filter((x) => x.skip === 'name').map((x) => x.word), ['Abdul', 'Kalam'], 'initials end no sentence; a full stop after a word does (Then)');
    const none = st.tokens(text, { caps: false, digits: false, names: false });
    t.ok(none.every((x) => x.skip === ''), 'every word checked when nothing is left alone');
    t.eq(st.tokens("don't India’s o’clock rock-n-roll").map((x) => x.word), ["don't", 'India’s', 'o’clock', 'rock', 'n', 'roll'], 'apostrophes inside a word, hyphens between words');
    t.ok(st.sentenceStart('1. Teh', 3) && st.sentenceStart('a) Teh', 3) && !st.sentenceStart('the Teh', 4), 'a list item’s first word starts a sentence');
  }
  {
    const text = 'First sentence. Here is a very long sentence that goes on and on with the word recieve somewhere in the middle of it, and more words after it.';
    const i = text.indexOf('recieve'), c = st.around(text, i, i + 7, 30);
    t.eq(c.word, 'recieve', 'the word in its sentence');
    t.ok(c.before.startsWith('…') && c.after.endsWith('…') && !c.before.includes('First'), `cut at words, within the sentence (“${c.before}” · “${c.after}”)`);
    t.eq(st.around('Teh end.', 0, 3), { before: '', word: 'Teh', after: ' end.' }, 'a short sentence whole');
  }
  t.eq([st.matchCase('Recieve', 'receive'), st.matchCase('RECIEVE', 'receive'), st.matchCase('recieve', 'receive'), st.matchCase('teh', 'The')], ['Receive', 'RECEIVE', 'receive', 'The'], 'a word typed by hand takes the capitals of the word it replaces');
  t.eq(st.applyEdits('a teh b teh', [{ start: 2, end: 5, text: 'the' }, { start: 8, end: 11, text: 'THE' }]), 'a the b THE', 'edits made from the end');
  t.eq([st.moved(3, 5, 8, 2), st.moved(9, 5, 8, 2), st.moved(6, 5, 8, 2), st.moved(8, 5, 8, 2)], [3, 8, null, 7], 'positions before, after and inside a change');
  t.eq(st.diffSpan('the cat sat', 'the dog sat'), { start: 4, endA: 7, endB: 7 }, 'what changed between two texts');
  t.eq(st.diffSpan('abc', 'abc'), { start: 3, endA: 3, endB: 3 }, 'nothing changed');
};
