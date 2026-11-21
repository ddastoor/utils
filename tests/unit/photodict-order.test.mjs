// The Photo Dictionary's list A → Z (to-do #12, owner, 21 Nov 2026: "don't change the list of words, just sort them in
// alphabetical order"): the same cards, nothing added or taken out, by the word shown — case and accents ignored.
export default async (t, { load }) => {
  const { alphabetical } = await load('src/lib/dictionary.ts');
  const card = (word, z = 10) => ({ word, seen: word, entries: [], source: 'local', z, count: 1 });
  const rarestFirst = [card('snollygoster', -1), card('sesquipedalian', 5), card('Zeitgeist', 12), card('éclair', 20), card('abstruse', 21),
    card('eclectic', 22), card('Lugubrious', 25), card('resume', 30), card('résumé', 30), card('Aardvark', 31), card('quixotic', 33)];
  const az = alphabetical(rarestFirst);
  t.eq(az.map((c) => c.word), ['Aardvark', 'abstruse', 'éclair', 'eclectic', 'Lugubrious', 'quixotic', 'resume', 'résumé', 'sesquipedalian', 'snollygoster', 'Zeitgeist'],
    'A → Z without regard to case (Aardvark, abstruse) or accents (éclair before eclectic)');
  t.eq(az.length === rarestFirst.length && az.every((c) => rarestFirst.includes(c)), true, 'the same cards — nothing added, nothing left out, each card itself (its meaning and rarity with it)');
  t.eq(rarestFirst[0].word, 'snollygoster', 'the list it was given is left as it was (a copy is sorted)');
  t.eq(alphabetical([card('résumé'), card('resume')]).map((c) => c.word), ['résumé', 'resume'], 'two words that differ only by an accent keep the order they had');
  t.eq(alphabetical([card('item10'), card('item9')]).map((c) => c.word), ['item9', 'item10'], 'digits as numbers');
  t.eq(alphabetical([]), [], 'an empty list stays empty');
};
