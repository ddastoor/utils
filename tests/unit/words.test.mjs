// Number to Words: mathcore's m_words and the sentence builder (src/lib/words.ts) against
// tests/fixtures/words/reference.json — the words of 1,598 whole numbers by num2words (lang 'en' and 'en_IN';
// scripts/make-words-reference.py). The sentences around them are written out here as they stand on a cheque.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const W = await load('/src/lib/words.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/words/reference.json'), 'utf8'));
  const why = (f) => { try { f(); return ''; } catch (e) { return e.message; } };

  // ---- every number of the reference, in both systems
  let bad = [];
  for (const [n, indian, intl] of ref.numbers) {
    if (m.words(BigInt(n), true) !== indian) bad.push(`${n} (Indian): "${m.words(BigInt(n), true)}" ≠ "${indian}"`);
    if (m.words(BigInt(n), false) !== intl) bad.push(`${n} (international): "${m.words(BigInt(n), false)}" ≠ "${intl}"`);
  }
  t.ok(ref.numbers.length === 1598 && !bad.length, `${ref.numbers.length} whole numbers up to 10¹⁹ are worded as num2words words them, with lakh and crore and with million and billion (the engine without "and" before a last part below a hundred differed on 323 and 269 of them) ${bad.slice(0, 3).join(' | ')}`);

  // ---- "and" stands before the last part below a hundred, and inside a group of hundreds — nowhere else
  for (const [n, indian, intl] of [
    [1001, 'one thousand and one', 'one thousand and one'], [1050, 'one thousand and fifty', 'one thousand and fifty'], [1100, 'one thousand one hundred', 'one thousand one hundred'],
    [100001, 'one lakh and one', 'one hundred thousand and one'], [100100, 'one lakh one hundred', 'one hundred thousand one hundred'], [10000001, 'one crore and one', 'ten million and one'],
    [2000019, 'twenty lakh and nineteen', 'two million and nineteen'], [1234567, 'twelve lakh thirty-four thousand five hundred and sixty-seven', 'one million two hundred and thirty-four thousand five hundred and sixty-seven'],
    [99, 'ninety-nine', 'ninety-nine'], [100, 'one hundred', 'one hundred'], [101, 'one hundred and one', 'one hundred and one'], [0, 'zero', 'zero'],
    [1000000000000, 'one lakh crore', 'one trillion'], [10010000000, 'one thousand and one crore', 'ten billion ten million'], [100000000000000, 'one crore crore', 'one hundred trillion'],
  ]) { t.eq(m.words(BigInt(n), true), indian, `${n} in lakh and crore`); t.eq(m.words(BigInt(n), false), intl, `${n} in millions`); }
  t.eq(m.words(18446744073709551615n, false), 'eighteen quintillion four hundred and forty-six quadrillion seven hundred and forty-four trillion seventy-three billion seven hundred and nine million five hundred and fifty-one thousand six hundred and fifteen', 'the largest 64-bit number');

  // ---- sentences
  const say = (typed, cur = 'inr', indian = true) => W.inWords(m, typed, indian, cur);
  const S = (typed, cur, indian) => say(typed, cur, indian).text;
  for (const [typed, want] of [
    ['1234567.50', 'Rupees Twelve Lakh Thirty-Four Thousand Five Hundred and Sixty-Seven and Fifty Paise Only'], ['1', 'Rupees One Only'], ['100000', 'Rupees One Lakh Only'], ['10000000', 'Rupees One Crore Only'],
    ['250000000', 'Rupees Twenty-Five Crore Only'], ['100001', 'Rupees One Lakh and One Only'], ['0', 'Rupees Zero Only'], ['0.00', 'Rupees Zero Only'],
    ['0.05', 'Five Paise Only'], ['0.5', 'Fifty Paise Only'], ['0.01', 'One Paisa Only'], ['1.01', 'Rupees One and One Paisa Only'], ['21.01', 'Rupees Twenty-One and One Paisa Only'], ['2.50', 'Rupees Two and Fifty Paise Only'],
    ['12.5', 'Rupees Twelve and Fifty Paise Only'], ['12.', 'Rupees Twelve Only'], ['.5', 'Fifty Paise Only'], ['007', 'Rupees Seven Only'], ['35800', 'Rupees Thirty-Five Thousand Eight Hundred Only'],
    ['9999999999999999999', 'Rupees Ninety-Nine Thousand Nine Hundred and Ninety-Nine Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred and Ninety-Nine Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred and Ninety-Nine Only'],
  ]) t.eq(S(typed), want, `₹ ${typed}`);
  for (const [typed, want] of [['19.99', 'Nineteen Dollars and Ninety-Nine Cents Only'], ['1', 'One Dollar Only'], ['1.01', 'One Dollar and One Cent Only'], ['2.01', 'Two Dollars and One Cent Only'], ['0.01', 'One Cent Only'], ['0.99', 'Ninety-Nine Cents Only'], ['0', 'Zero Dollars Only'], ['1000001', 'One Million and One Dollars Only']])
    t.eq(S(typed, 'usd', false), want, `$ ${typed}`);
  t.eq(S('100000', 'usd', true), 'One Lakh Dollars Only', 'dollars counted in lakh');
  t.eq(S('1234567', 'inr', false), 'Rupees One Million Two Hundred and Thirty-Four Thousand Five Hundred and Sixty-Seven Only', 'rupees counted in millions');
  // num2words' own currency sentences have the same singular and plural of the small units
  for (const [x, cur, sentence] of ref.money) {
    const ours = S(x, cur === 'INR' ? 'inr' : 'usd', cur === 'INR').toLowerCase(), unit = /(\w+)$/.exec(sentence)[1], units = /\b(paisa|paise|cent|cents)\b/.exec(ours);
    t.ok(+x.split('.')[1] === 0 ? !units : units && units[1] === unit, `${cur} ${x}: num2words ends in "${unit}" — ours: "${ours}"`);
    if (cur === 'USD') t.ok(ours.includes(/^(\S+ (?:dollar|dollars))/.exec(sentence)[1]), `… and begins "${/^(\S+ \S+)/.exec(sentence)[1]}"`);
  }
  for (const [typed, want] of [['3.05', 'Three point zero five'], ['1000000000', 'One Billion'], ['3.14159', 'Three point one four one five nine'], ['0.5', 'Zero point five'], ['.25', 'Zero point two five'], ['12.', 'Twelve'], ['-12', 'Minus Twelve'], ['−3.5', 'Minus Three point five'], ['-0', 'Zero'], ['-0.00', 'Zero point zero zero'], ['+7', 'Seven'], ['1001', 'One Thousand and One']])
    t.eq(S(typed, 'none', false), want, `the number ${typed}`);
  t.eq(S('100001', 'none', true), 'One Lakh and One', 'a plain number in lakh');

  // ---- the digits, with their commas — every digit of a 19-digit number (a Number has 16)
  for (const [typed, cur, indian, want] of [['1234567.50', 'inr', true, '12,34,567.50'], ['1234567', 'inr', false, '1,234,567'], ['1234567.5', 'inr', true, '12,34,567.50'], ['9999999999999999999', 'inr', true, '99,99,99,99,99,99,99,99,999'],
    ['9007199254740993', 'none', false, '9,007,199,254,740,993'], ['1234567890123456789', 'usd', false, '1,234,567,890,123,456,789'], ['3.14159', 'none', false, '3.14159'], ['-12345.5', 'none', true, '−12,345.5'], ['007', 'inr', true, '7'], ['.5', 'usd', false, '0.50']])
    t.eq(say(typed, cur, indian).digits, want, `digits of ${typed}`);

  // ---- what people type around an amount
  for (const typed of ['₹ 1,00,001', 'Rs. 1,00,001', 'Rs 100001', 'rs.100001/-', 'INR 1,00,001', '1,00,001/-', '100001 ₹', ' 1 00 001 ', '100,001', '+100001', '1,00,001.00', '₹1,00,001/-', "1'00'001", '100_001'])
    t.eq(S(typed).replace(' Only', ''), 'Rupees One Lakh and One', `"${typed}" is one lakh and one`);
  t.eq(S('$19.99', 'usd', false), 'Nineteen Dollars and Ninety-Nine Cents Only', '$19.99'); t.eq(S('USD 5', 'usd', false), 'Five Dollars Only', 'USD 5');
  t.eq(S('-₹500', 'none', true), 'Minus Five Hundred', '-₹500 as a plain number');

  // ---- refused, with the reason
  for (const [typed, cur, reason] of [
    ['', 'inr', 'Enter a number, for example 125000 or 1,25,000.50.'], ['   ', 'inr', 'Enter a number, for example 125000 or 1,25,000.50.'], ['₹', 'inr', 'Enter a number, for example 125000 or 1,25,000.50.'],
    ['abc', 'inr', 'This is not a number: use digits, with a point before the decimals (commas between digits are fine).'], ['12abc', 'inr', 'This is not a number: use digits, with a point before the decimals (commas between digits are fine).'],
    ['1.2.3', 'inr', 'This is not a number: use digits, with a point before the decimals (commas between digits are fine).'], ['.', 'inr', 'This is not a number: use digits, with a point before the decimals (commas between digits are fine).'],
    ['1e5', 'inr', 'Write the number out in digits — 1e5 is 100000.'], ['12.345', 'inr', 'Paise have two digits — round the amount to two decimals.'], ['12.345', 'usd', 'Cents have two digits — round the amount to two decimals.'],
    ['-5', 'inr', 'An amount of money is written without a minus sign.'], ['−5.50', 'usd', 'An amount of money is written without a minus sign.'],
    ['12345678901234567890', 'inr', 'Too large — at most 19 digits before the decimal point.'], ['12345678901234567890', 'none', 'Too large — at most 19 digits before the decimal point.'],
    [`0.${'1'.repeat(31)}`, 'none', 'Too many decimals — at most 30.'],
  ]) t.eq(why(() => say(typed, cur)), reason, `"${typed}" as ${cur}`);
  t.ok(S(`0.${'1'.repeat(30)}`, 'none').split(' ').length === 32, 'thirty decimals are read out one by one');
  t.eq(S('0000000000000000000000012', 'inr'), 'Rupees Twelve Only', 'leading zeros do not count as digits');

  // ---- the rupee sentence of the invoice and the rent receipt: a number, rounded to paise
  for (const [x, want] of [[35800, 'Rupees Thirty-Five Thousand Eight Hundred Only'], [25000, 'Rupees Twenty-Five Thousand Only'], [100001, 'Rupees One Lakh and One Only'], [1180.5, 'Rupees One Thousand One Hundred and Eighty and Fifty Paise Only'],
    [0.01, 'One Paisa Only'], [1.005, 'Rupees One and One Paisa Only'], [2.675, 'Rupees Two and Sixty-Eight Paise Only'], [999.999, 'Rupees One Thousand Only'], [0, 'Rupees Zero Only'], [1e-7, 'Rupees Zero Only'], [-250, 'Rupees Two Hundred and Fifty Only'], [12345678.9, 'Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred and Seventy-Eight and Ninety Paise Only']])
    t.eq(W.rupeesInWords(m, x), want, `rupeesInWords(${x})`);
  t.eq(why(() => W.rupeesInWords(m, 1e20)), 'The amount is too large to write in words.', 'an amount beyond the paise a double can count');
};
