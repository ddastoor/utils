// Number bases and Roman numerals: mathcore's m_base_convert / m_to_roman / m_from_roman(_loose) and the tabs' reading
// of what is typed (src/lib/numerals.ts) against tests/fixtures/numerals/reference.json — Python's int(), numpy's
// base_repr and the `roman` library (scripts/make-numerals-reference.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const N = await load('/src/lib/numerals.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/numerals/reference.json'), 'utf8'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };

  // ---- 464 numbers from one bit to 6,000 bits, typed in bases 2 – 36, written in others
  let bad = [], n = 0;
  for (const [text, from, answers] of ref.bases) for (const [to, want] of Object.entries(answers)) {
    n++; const got = m.baseConvert(text, from, +to);
    if (got !== want) bad.push(`${text.slice(0, 40)}${text.length > 40 ? '…' : ''} (base ${from}) in base ${to}: ${String(got).slice(0, 40)} ≠ ${want.slice(0, 40)}`);
    const r = N.readNumber(text, from); if (!('text' in r)) bad.push(`readNumber("${text.slice(0, 30)}", ${from}) refused: ${JSON.stringify(r)}`);
  }
  t.ok(ref.bases.length === 464 && n > 2000 && !bad.length, `${n} conversions of ${ref.bases.length} numbers — one bit to 6,000 bits, any case, signs, separators — agree with Python's int() and numpy's base_repr ${bad.slice(0, 3).join(' | ')}`);
  // ---- there and back: every base to every base
  bad = [];
  for (const [text, from, answers] of ref.bases.filter((_, i) => i % 7 === 0)) for (let b = 2; b <= 36; b++) {
    const there = m.baseConvert(text, from, b), back = m.baseConvert(there, b, 10);
    if (back !== answers['10'] && answers['10'] !== undefined) bad.push(`${text.slice(0, 20)} (base ${from}) → base ${b} → decimal: ${String(back).slice(0, 30)}`);
  }
  t.ok(!bad.length, `through every base from 2 to 36 and back to decimal the number is the same ${bad.slice(0, 3).join(' | ')}`);
  // ---- a prefix is read only in the base it stands for
  for (const [text, from, want, was] of [['0b1', 16, '177', 'it was 1'], ['0B1', 16, '177', 'it was 1'], ['0b', 16, '11', 'it was refused'], ['0x1f', 36, '42819', 'it was 51'], ['0o17', 36, '31147', 'it was 43'], ['0b11', 2, '3'], ['0x1f', 16, '31'], ['0X1F', 16, '31'], ['0o17', 8, '15'], ['0O17', 8, '15', 'a capital O was refused'],
    ['+5', 10, '5', 'a plus sign was refused'], ['-0', 10, '0'], ['-ff', 16, '-255'], ['1,000', 10, '1000'], ['1_000', 10, '1000'], [' 12 ', 10, '12'], ['007', 10, '7'], ['z', 36, '35']])
    t.eq(m.baseConvert(text, from, 10), want, `"${text}" in base ${from} is ${want}${was ? ` (${was})` : ''}`);
  for (const [text, from] of [['', 10], ['-', 10], ['0x', 16], ['12', 2], ['8', 8], ['g', 16], ['10.5', 10], ['--5', 10], ['z', 35], ['1e3', 10], ['१२३', 10], ['5-', 10]]) t.eq(m.baseConvert(text, from, 10), null, `"${text}" is not a number in base ${from}`);
  t.eq(m.baseConvert('255', 10, 1), null, 'base 1 does not exist'); t.eq(m.baseConvert('255', 37, 10), null, 'base 37 neither');
  // ---- long numbers quickly: digits go in and out in chunks
  { const big = '9'.repeat(60000), t0 = performance.now(), bits = m.baseConvert(big, 10, 2), ms = performance.now() - t0;
    t.ok(bits.length === 199316 && m.baseConvert(bits, 2, 10) === big && ms < 1500, `60,000 digits → 199,316 bits and back in ${ms.toFixed(0)} ms (a digit at a time took 4.4 s)`); }
  t.eq(m.baseConvert('1' + '0'.repeat(128), 2, 16), '1' + '0'.repeat(32), '2¹²⁸ from binary to hexadecimal');
  t.eq(m.baseConvert('ZZZZZZ', 36, 10), String(36 ** 6 - 1), 'the largest six-digit number in base 36 (a whole chunk)');
  t.eq(m.baseConvert('1000000', 36, 10), String(36 ** 6), '… and the one after it');
  t.eq(m.baseConvert('4294967295', 10, 16), 'FFFFFFFF', '2³² − 1'); t.eq(m.baseConvert('4294967296', 10, 16), '100000000', '2³²'); t.eq(m.baseConvert('1000000000', 10, 10), '1000000000', '10⁹ (a whole chunk of nine digits)');

  // ---- the tab's reading of what is typed
  for (const [typed, base, want] of [['255', 10, { text: '255' }], ['  0xFF ', 16, { text: '0xFF' }], ['−5', 10, { text: '-5' }], ['', 10, { empty: true }], ['   ', 2, { empty: true }],
    ['12', 2, { error: '“2” is not a binary digit (0–1).' }], ['78', 8, { error: '“8” is not an octal digit (0–7).' }], ['12g', 16, { error: '“g” is not a hexadecimal digit (0–9 and A–F).' }], ['1a', 10, { error: '“a” is not a decimal digit (0–9).' }],
    ['zz', 35, { error: '“z” is not a base-35 digit (0–9 and A–Y).' }], ['b', 11, { error: '“b” is not a base-11 digit (0–9 and A).' }], ['10.5', 10, { error: 'Only whole numbers can be converted — there is a point in this one.' }], ['5-3', 10, { error: 'A sign belongs in front of the number.' }],
    ['-', 10, { error: 'There are no digits here.' }], ['0x', 16, { error: 'There are no digits here.' }], ['255', 40, { error: 'The base must be a whole number from 2 to 36.' }], ['255', 1, { error: 'The base must be a whole number from 2 to 36.' }], ['255', 2.5, { error: 'The base must be a whole number from 2 to 36.' }], ['255', NaN, { error: 'The base must be a whole number from 2 to 36.' }],
    ['1'.repeat(10001), 10, { error: 'Too long — at most 10,000 digits.' }]]) t.eq(JSON.stringify(N.readNumber(typed, base)), JSON.stringify(want), `readNumber("${typed.slice(0, 12)}${typed.length > 12 ? '…' : ''}", ${base})`);
  t.ok('text' in N.readNumber('1'.repeat(10000), 10) && 'text' in N.readNumber('1 000,000_000', 10), 'ten thousand digits are taken; so are spaces, commas and underscores');
  for (const [b, text] of [[2, '0–1'], [8, '0–7'], [10, '0–9'], [11, '0–9 and A'], [16, '0–9 and A–F'], [36, '0–9 and A–Z']]) t.eq(N.digitsOf(b), text, `the digits of base ${b}`);

  // ---- Roman numerals: every number from 1 to 3,999, both ways
  bad = [];
  ref.roman.forEach((r, i) => { if (m.toRoman(i + 1) !== r) bad.push(`${i + 1} → ${m.toRoman(i + 1)}, not ${r}`); if (m.fromRoman(r) !== i + 1 || m.fromRoman(r.toLowerCase()) !== i + 1 || m.fromRomanLoose(r) !== i + 1) bad.push(`${r} → ${m.fromRoman(r)}, not ${i + 1}`); });
  t.ok(ref.roman.length === 3999 && !bad.length, `all 3,999 numerals as the roman library writes them, and read back (also in lower case, also by the lenient reader) ${bad.slice(0, 3).join(' | ')}`);
  // ---- 3,000 strings of Roman letters: what is a numeral in standard form, what only in the older additive form, what is none
  bad = []; let std = 0, old = 0;
  for (const [w, strict, loose] of ref.strings) {
    const a = m.fromRoman(w) ?? 0, b = m.fromRomanLoose(w) ?? 0;
    if (a !== strict || b !== loose) bad.push(`"${w}": ${a} / ${b}, not ${strict} / ${loose}`);
    if (strict) std++; else if (loose) old++;
  }
  t.ok(ref.strings.length === 3000 && !bad.length, `${ref.strings.length} strings of the letters I V X L C D M: ${std} are standard numerals, ${old} more are read in the additive form, the rest are refused — as the roman library and the grammar say ${bad.slice(0, 3).join(' | ')}`);
  for (const [n, r] of [[0, null], [-1, null], [4000, null], [3999, 'MMMCMXCIX'], [1, 'I'], [1994, 'MCMXCIV'], [2026, 'MMXXVI'], [944, 'CMXLIV']]) t.eq(m.toRoman(n), r, `toRoman(${n})`);

  // ---- the tab's answers
  const ans = (typed) => N.romanAnswer(m, typed);
  t.eq(JSON.stringify(ans('2026')), JSON.stringify({ kind: 'roman', number: 2026, roman: 'MMXXVI', parts: 'MM (2000) + XX (20) + V (5) + I (1)' }), '2026 → MMXXVI, taken apart');
  t.eq(JSON.stringify(ans('MCMXCIV')), JSON.stringify({ kind: 'number', number: 1994, roman: 'MCMXCIV', parts: 'M (1000) + CM (900) + XC (90) + IV (4)', note: '' }), 'MCMXCIV → 1994');
  for (const [typed, number] of [['mcmlxxxiv', 1984], [' MM XXVI ', 2026], ['Ⅻ', 12], ['ⅳ', 4], ['1,994', 1994], ['0044', 44], ['Ⅿ Ⅿ Ⅹ', 2010]]) t.eq(ans(typed).number, number, `"${typed}" is ${number}`);
  { const a = ans('IIII'); t.ok(a.number === 4 && a.roman === 'IV' && a.note === 'The standard way to write 4 is IV; IIII is the older, additive form (as on clock faces).', `IIII, as on a clock face, is 4 — with the standard form named (it was refused): ${a.note}`); }
  { const a = ans('MDCCCCX'); t.ok(a.number === 1910 && a.roman === 'MCMX' && /standard way to write 1910 is MCMX/.test(a.note), 'MDCCCCX on a building is 1910'); }
  { const a = ans('MMMM'); t.ok(a.number === 4000 && a.roman === '' && /Above 3,999/.test(a.note), 'MMMM is 4000, beyond the standard notation'); }
  for (const [typed, reason] of [['', 'Type a number from 1 to 3,999 or a Roman numeral such as MMXXVI.'], ['0', 'There is no Roman numeral for 0 — the Romans had no sign for it.'], ['4000', 'Standard Roman numerals stop at 3,999 (MMMCMXCIX); larger numbers were written with a line above the letters.'],
    ['99999999999999999999', 'Standard Roman numerals stop at 3,999 (MMMCMXCIX); larger numbers were written with a line above the letters.'], ['-5', 'Roman numerals are for whole numbers from 1 to 3,999 — no minus sign, no decimals.'], ['3.5', 'Roman numerals are for whole numbers from 1 to 3,999 — no minus sign, no decimals.'],
    ['ABC', '“A” is not a Roman numeral letter — they are I, V, X, L, C, D and M.'], ['MMXXVI!', '“!” is not a Roman numeral letter — they are I, V, X, L, C, D and M.'], ['12X', '“1” is not a Roman numeral letter — they are I, V, X, L, C, D and M.'],
    ['VX', 'These letters do not make a Roman numeral: the larger ones come first, and only I, X and C are put before a larger letter to subtract (IV, IX, XL, XC, CD, CM).'], ['IC', 'These letters do not make a Roman numeral: the larger ones come first, and only I, X and C are put before a larger letter to subtract (IV, IX, XL, XC, CD, CM).'],
    ['IIIII', 'These letters do not make a Roman numeral: the larger ones come first, and only I, X and C are put before a larger letter to subtract (IV, IX, XL, XC, CD, CM).']]) t.eq(why(() => ans(typed)), reason, `"${typed}" is refused with its reason`);
  for (const [r, parts] of [['I', 'I (1)'], ['III', 'III (3)'], ['XIV', 'X (10) + IV (4)'], ['MMMCMXCIX', 'MMM (3000) + CM (900) + XC (90) + IX (9)'], ['CDXLIV', 'CD (400) + XL (40) + IV (4)'], ['DCCLXXVII', 'D (500) + CC (200) + L (50) + XX (20) + V (5) + II (2)']]) t.eq(N.romanParts(r), parts, `the parts of ${r}`);
  bad = []; for (let k = 1; k <= 3999; k++) { const sum = [...N.romanParts(ref.roman[k - 1]).matchAll(/\((\d+)\)/g)].reduce((a, x) => a + +x[1], 0); if (sum !== k) bad.push(k); }
  t.ok(!bad.length, `the parts of every numeral add up to its number ${bad.slice(0, 5)}`);
};
