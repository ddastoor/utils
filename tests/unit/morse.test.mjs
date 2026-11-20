// Morse Code (src/lib/morse.ts): the alphabet and the lengths of dots, dashes and gaps against unixcw — the Morse
// program of Linux radio amateurs (tests/fixtures/morse/reference.json, python3 scripts/make-morse-reference.py) —
// text into code and back with known answers, what the tab did wrongly before, and round trips of random messages.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, root }) => {
  const { MORSE, PROSIGNS, encode, decode, tidy, isMorse, schedule, lengthText } = await load('/src/lib/morse.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/morse/reference.json'), 'utf8'));
  const enc = (s) => encode(s).code, dec = (s) => decode(s).text;

  // ---- the alphabet against unixcw
  { const stand = { '<': '<SK>', '>': '<BK>', '^': '<KA>', '!': '<SN>' }; // unixcw's keys for procedural signals
    const same = [], differ = [], signals = [], left = [];
    for (const [c, code] of Object.entries(ref.table)) {
      if (stand[c]) (dec(code) === stand[c] ? signals : differ).push(`${c} ${code}`);
      else if (c === 'ª') (dec(code) === 'CH' ? signals : differ).push(`CH ${code}`);
      else if (c === '®' || c === '~') left.push(c);
      else (MORSE[c] === code ? same : differ).push(`${c} ${code} / ${MORSE[c]}`);
    }
    t.eq(differ, [], `no code differs from ${ref._source}`);
    t.eq([same.length, signals.length, left.length], [61, 5, 2], '61 letters, digits, signs and accented letters are coded as unixcw codes them; its five procedural signals are read (<SK> <BK> <KA> <SN>, CH); two of its own keys are not taken over');
    t.eq(Object.keys(MORSE).filter((c) => ref.table[c] !== MORSE[c]), ['!'], 'every character of ours is in unixcw\'s table with the same code — but one: the exclamation mark');
    t.eq(MORSE['!'], '-.-.--', '! is -.-.-- (KW), the code in general use; it is not in the ITU recommendation, and unixcw gives the key another meaning');
    t.eq(new Set(Object.values(MORSE)).size, Object.keys(MORSE).length, 'no two characters share a code');
    t.ok(Object.values(MORSE).every((m) => /^[.-]{1,7}$/.test(m)) && Object.keys(PROSIGNS).every((m) => !Object.values(MORSE).includes(m)), 'codes are dots and dashes; no procedural signal is also a character'); }

  // ---- text → Morse
  t.eq(enc('SOS Help'), '... --- ... / .... . .-.. .--.', 'SOS Help');
  t.eq(enc('Hello, World 2026!'), '.... . .-.. .-.. --- --..-- / .-- --- .-. .-.. -.. / ..--- ----- ..--- -.... -.-.--', 'letters, comma, digits, exclamation mark');
  t.eq(enc('@ = + ( ) & : ; " \' $ _ - / ?'), '.--.-. / -...- / .-.-. / -.--. / -.--.- / .-... / ---... / -.-.-. / .-..-. / .----. / ...-..- / ..--.- / -....- / -..-. / ..--..', 'the signs');
  t.eq(encode('A € B'), { code: '.- / -...', skipped: ['€'] }, 'a word of characters without a code is left out whole (the tab wrote ".- /  / -...") and the character is named');
  t.eq(encode('café'), { code: '-.-. .- ..-. ..-..', skipped: [] }, 'café: é has a code of its own (the tab dropped it without a word: "CAF")');
  t.eq(enc('cre\u0300me bru\u0302le\u0301e'), '-.-. .-. .-..- -- . / -... .-. ..- .-.. ..-.. .', 'accents typed as separate marks: è and é by their codes, û — which has none — as U');
  t.eq(enc('naïve Ångström'), '-. .- .. ...- . / .- -. --. ... - .-. ---. --', 'ï as I, Å as A, ö by its own code');
  t.eq(enc('straße'), '... - .-. .- ... ... .', 'ß as SS');
  t.eq(enc('100%'), '.---- ----- ----- ----- -..-. -----', '% the way the ITU says: 0/0 (the tab dropped it)');
  t.eq(enc('it’s “ok” — 2×3'), '.. - .----. ... / .-..-. --- -.- .-..-. / -....- / ..--- -..- ...--', 'a typographic apostrophe, quotes and dash as the plain ones; × as X');
  t.eq(enc('SOS\nHelp me'), '... --- ...\n.... . .-.. .--. / -- .', 'lines stay lines (the tab joined them into one)');
  t.eq(enc('a\n\nb'), '.-\n\n-...', 'an empty line too'); t.eq(enc('  a   b\tc  '), '.- / -... / -.-.', 'any run of spaces or tabs is one word gap');
  t.eq(encode('नमस्ते hi 🙏🏽'), { code: '.... ..', skipped: ['न', 'म', 'स', 'त', '🙏', '🏽'] }, 'Hindi and emoji have no Morse code: left out, each named once, vowel signs not listed apart (the tab wrote " / .... ..")');
  t.eq([enc('<SK>'), enc('<sos>'), enc('cq <ar> k')], ['...-.-', '...---...', '-.-. --.- / .-.-. / -.-'], 'letters in angle brackets are a procedural signal: sent as one sign');
  t.eq(encode('a < b'), { code: '.- / -...', skipped: ['<'] }, 'a lone angle bracket has no code');
  t.eq(encode(''), { code: '', skipped: [] }, 'nothing'); t.eq(encode('€€ €').skipped, ['€'], 'a character is named once');

  // ---- Morse → text
  t.eq(dec('.... . .-.. .-.. --- / .-- --- .-. .-.. -..'), 'HELLO WORLD', 'letters by spaces, words by a slash');
  t.eq(dec('... --- ...\n.... . .-.. .--.'), 'SOS\nHELP', 'a line break is a break (the tab read "SOSHELP")');
  t.eq([dec('.-   -...'), dec('.-  -...'), dec('.-\t-...'), dec('.- | -...'), dec('.-/-...'), dec('.- /-...')], Array(6).fill('A B'), 'words apart by three spaces, two spaces, a tab, a bar, a slash with or without spaces (two spaces, a tab and a bar gave "AB")');
  t.eq(dec('··· −−− ···'), 'SOS', 'the dots and dashes of a typographer: · and −');
  t.eq(dec('•— —•••  _._.'), 'AB C', '• — _ too');
  t.eq(decode('...---...'), { text: '<SOS>', unknown: [] }, 'SOS as it is sent and often written, without gaps (the tab showed nothing)');
  t.eq([dec('...-.-'), dec('-...-.-'), dec('........'), dec('----')], ['<SK>', '<BK>', '<HH>', 'CH'], 'end of contact, break, error, CH');
  t.eq(decode('.- ...... -... ......'), { text: 'A�B�', unknown: ['......'] }, 'a group that is no code is shown as a gap in the text and named once (the tab dropped it: "AB")');
  t.eq(decode('hello'), { text: '�', unknown: ['hello'] }, 'text given as Morse: one unknown group');
  t.eq(dec('..-.. .-..- .--.- .-.- ---. ..-- --.-- -.-..'), 'ÉÈÀÄÖÜÑÇ', 'the accented letters');
  t.eq([dec(''), dec('   '), dec(' / '), dec('\n')], ['', '', '', '\n'], 'nothing');
  t.eq(tidy(' ·−   −··· | -.-.\t-.. '), '.- / -... / -.-. / -..', 'tidy: plain signs, one space between letters, " / " between words');

  // ---- is it Morse?
  t.eq(['... --- ...', '.-', ' .- / -... \n-.-.', '·−', '.-|-...'].map(isMorse), Array(5).fill(true), 'dots, dashes and separators');
  t.eq(['SOS', 'a.b', '', '   ', '/', '| /', '.- x', '3.14'].map(isMorse), Array(8).fill(false), 'anything else is text — also separators without a dot or dash');

  // ---- there and back
  { let seed = 11; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const pool = Object.keys(MORSE); let bad = '';
    for (let k = 0; k < 2000 && !bad; k++) {
      const lines = Array.from({ length: 1 + rnd(3) }, () => Array.from({ length: 1 + rnd(5) }, () => Array.from({ length: 1 + rnd(7) }, () => pool[rnd(pool.length)]).join('')).join(' '));
      const text = lines.join('\n'), e = encode(text), d = decode(e.code);
      if (d.text !== text || e.skipped.length || d.unknown.length || tidy(e.code) !== e.code || encode(d.text).code !== e.code) bad = JSON.stringify([text, e, d]);
    }
    t.ok(!bad, `2,000 random messages of every character of the alphabet come back unchanged ${bad}`);
    t.eq(dec(enc('The quick brown fox jumps over the lazy dog, 1234567890 times!')), 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG, 1234567890 TIMES!', 'a sentence, in capitals'); }

  // ---- when the tones sound: against unixcw at ten speeds
  { const off = [];
    for (const [w, [dot, dash, eoe, eoc]] of Object.entries(ref.timing)) {
      const s = schedule(enc('AN I'), Number(w)), u = s.unit, us = (x) => x * 1e6; // .- -. / ..
      const got = [s.tones[0].len, s.tones[1].len, s.tones[1].at - (s.tones[0].at + s.tones[0].len), s.tones[2].at - (s.tones[1].at + s.tones[1].len)].map(us);
      const want = [dot, dash, eoe, eoe + eoc];
      if (got.some((g, i) => Math.abs(g - want[i]) > 3) || Math.abs(u - 1.2 / w) > 1e-12) off.push(`${w} wpm: ${got.map(Math.round)} / ${want}`);
      const wordGap = s.tones[4].at - (s.tones[3].at + s.tones[3].len);
      if (Math.abs(wordGap - 7 * u) > 1e-9) off.push(`${w} wpm: word gap ${wordGap / u} units`);
    }
    t.eq(off, [], `dot, dash, the gap inside a letter and the gap between letters are unixcw's at ${Object.keys(ref.timing).join(', ')} words a minute (to its whole microseconds); between words seven units, as the ITU sets it`); }
  { const s = schedule(enc('PARIS'), 20);
    t.near(s.total + 7 * s.unit, 50 * s.unit, 1e-9, 'PARIS with the gap after it is 50 units: the word that defines "words a minute"');
    t.near(schedule(enc(Array(20).fill('PARIS').join(' ')), 20).total + 7 * 0.06, 60, 1e-6, '… so twenty of them at 20 words a minute take a minute');
    const units = (code) => { const x = schedule(code, 20); return x.tones.map((tn, i) => [Math.round(tn.len / x.unit), i ? Math.round((tn.at - x.tones[i - 1].at - x.tones[i - 1].len) / x.unit) : 0]); };
    t.eq(units('.- / -'), [[1, 0], [3, 1], [3, 7]], 'A T: dot, 1, dash, 7, dash');
    t.eq(units('. .'), [[1, 0], [1, 3]], 'E E as letters: 3 units apart');
    t.eq(units('.\n.'), [[1, 0], [1, 7]], 'a line break is a word gap (the tab played the two lines as one letter)');
    t.eq(units('·− −'), [[1, 0], [3, 1], [3, 3]], 'typographic dots and dashes sound (the tab played silence for them)');
    t.eq(units('.-/-'), units('.- / -'), 'a slash without spaces is still a word gap (it was played as a letter gap)');
    t.eq(units('.-  -'), units('.- / -'), 'so are two spaces');
    t.eq([schedule('', 20).tones.length, schedule(' / ', 20).total, schedule('abc', 20).tones.length], [0, 0, 0], 'nothing to play: no tones');
    t.eq(schedule('.', 20).tones[0].at, 0, 'the first tone starts at once'); }
  t.eq([lengthText(0.2), lengthText(5.4), lengthText(59.6), lengthText(65), lengthText(120)], ['1 s', '5 s', '1 min', '1 min 5 s', '2 min'], 'the length in words');
};
