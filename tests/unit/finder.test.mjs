// The Screenshot Finder's search (wasm/textcore/find.c, bound in src/wasm/textcore.ts): pictures' words as the OCR gives
// them, normalised by findNorm, and queries as people type them — exact words, words with their signs ("wi-fi"), numbers
// read with spaces or typed without, the OCR's slips (9O3, passvvord), the beginning or the inside of a word, one slip of
// the keyboard; small words left out; ranking (all the words before some, words next to each other before words apart);
// the indices of the words that matched (the page marks them on the picture).
export default async (t, { load, wasm }) => {
  const { bindTextcore, findNorm } = await load('src/wasm/textcore.ts');
  const tc = bindTextcore(await wasm('textcore'));
  const words = (s) => s.split(/\s+/).map(findNorm).filter(Boolean);
  const DOCS = {
    1: 'Asha Iyer online Booked. PNR 4521 678 903, coach B2, seats 41 and 42. Train leaves Lonavala at 17:35 on Sunday.',
    2: 'Home Wi-Fi: the Wi-Fi password is kT7mq2Vr9w (5 GHz network SuperHome_5G)',
    3: 'Send the invoice to ravi@gmail.com before Friday. Thanks!',
    4: 'Your PNR 4521 678 9O3 is confirmed. Wi-Fi passvvord at the hotel: guest1234',
    5: 'Electricity bill due 15/12/2026 amount Rs. 2,032.71 consumer no 1102 3345',
    6: 'Café crème — Zürich',
  };
  const h = tc.findNew();
  for (const [p, s] of Object.entries(DOCS)) tc.findAdd(h, +p, words(s));
  const q = (s) => tc.findQuery(h, findNorm(s) ? s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase() : s);
  const pics = (s) => q(s).map((x) => x.p);

  t.eq(findNorm('Booked.'), 'booked', 'findNorm: signs at the ends left out');
  t.eq(findNorm('ravi@gmail.com,'), 'ravi@gmail.com', 'findNorm: signs inside kept');
  t.eq(findNorm('Zürich'), 'zurich', 'findNorm: accents off, lower case');

  t.eq(pics('PNR')[0], 1, 'a word: the picture that has it (the PNR in the chat first — exact)');
  t.eq(pics('PNR').sort(), [1, 4], 'both pictures with a PNR');
  const num = q('4521 678 903');
  t.eq(num.map((x) => x.p), [1, 4], 'a number read with its spaces: the exact one first, the one the OCR read "9O3" after');
  t.eq([num[0].m, num[0].n, num[1].m], [3, 3, 3], 'all three parts matched in both');
  const w1 = words(DOCS[1]);
  t.eq(num[0].w.map((i) => w1[i]), ['4521', '678', '903'], 'the words that matched, for the marks on the picture');
  t.eq(pics('4521678903'), [1, 4], 'typed without spaces: the words read in a row make it');
  t.eq(pics('wifi password')[0], 2, '"wifi password": the Wi-Fi message first (the words next to each other)');
  t.ok(pics('wifi password').includes(4), '… and the hotel note whose "password" the OCR read "passvvord"');
  t.eq(pics('wi fi')[0], 2, '"wi fi" written apart: the words together make "wifi"');
  t.eq(pics('gmail'), [3], 'inside a word: "gmail" in an e-mail address');
  t.eq(pics('pasword')[0], 2, 'one slip of the keyboard');
  t.eq(pics('passw')[0], 2, 'the beginning of a word');
  t.eq(pics('the password')[0], 2, 'small words left out ("the")');
  t.eq(pics('the').sort(), [2, 3, 4], 'a query of small words only: kept');
  t.eq(pics('xyzzy'), [], 'nothing matches: nothing');
  t.eq(pics('cafe creme'), [6], 'accents off on both sides');
  t.eq(pics('2,032.71')[0], 5, 'an amount with its signs');
  t.eq(pics('2032'), [5], 'an amount by its digits (inside the word)');
  const some = q('pnr coach seats lonavala goa');
  t.eq([some[0].p, some[0].m, some[0].n], [1, 4, 5], 'some of the words: the picture with most of them, said as 4 of 5');
  t.eq(q('pnr lonavala').map((x) => [x.p, x.m]), [[1, 2], [4, 1]], 'all the words before some of them');
  t.eq(pics('17:35'), [1], 'a time');
  t.eq(pics('guest1234'), [4], 'a password typed as read');
  t.eq(pics('guestl234'), [4], 'a password with the OCR\'s slip (l for 1) typed back');

  // replacing a picture's words
  t.eq(pics('ravi'), [3], 'the beginning of an e-mail address');
  tc.findAdd(h, 3, words('Nothing about the invoice here'));
  t.eq(pics('ravi'), [], 'a picture read again: its old words gone');
  t.eq(pics('invoice'), [3], '… its new ones there');
  t.eq(pics('gmail'), [], 'and "gmail" no more (no word within one slip of it)');
  tc.findFree(h);

  // many pictures: a query stays quick
  const h2 = tc.findNew(), vocab = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'.split(' ');
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let p = 0; p < 600; p++) tc.findAdd(h2, p, Array.from({ length: 300 }, () => vocab[Math.floor(rnd() * vocab.length)] + (rnd() < 0.2 ? Math.floor(rnd() * 100) : '')));
  tc.findAdd(h2, 9999, ['the', 'needle', 'pnr', '8812', '334', '901']);
  const t0 = performance.now(), r = tc.findQuery(h2, 'pnr 8812 334 901'), dt = performance.now() - t0;
  t.ok(r[0]?.p === 9999 && dt < 400, `600 pictures of 300 words: the one found first in ${dt.toFixed(0)} ms`);
  tc.findFree(h2);
};
