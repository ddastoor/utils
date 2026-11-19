// Number to Words (#/words): Indian (lakh / crore) and international systems, rupees / paise, dollars / cents, plain
// numbers — the words against num2words (tests/fixtures/words/reference.json), the sentences as they stand on a
// cheque, what people type around an amount, what is refused and why, phone layout.
import { readFileSync } from 'node:fs';
import { calc } from '../lib/calc.mjs';
import { hookClipboard, copied } from './_devdata.mjs';

const ref = JSON.parse(readFileSync(new URL('../fixtures/words/reference.json', import.meta.url), 'utf8'));
const title = (s) => s.replace(/[a-z]+/g, (w) => (w === 'and' ? w : w[0].toUpperCase() + w.slice(1)));
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/words`); const c = calc(page);
  await page.locator('.big-value').first().waitFor();
  const say = async (n) => { await c.set('Amount', n); return (await page.locator('.big-result').count()) ? c.big('In words') : `REFUSED: ${await c.warn()}`; };

  // ---- the first view
  ok(await c.big('In words') === 'Rupees Twelve Lakh Thirty-Four Thousand Five Hundred and Sixty-Seven and Fifty Paise Only' && await c.row('Digits') === '12,34,567.50', `the example: 12,34,567.50 as on a cheque (${await c.big('In words')})`);

  // ---- rupees, as on a cheque
  for (const [n, want, was] of [
    ['1', 'Rupees One Only'], ['100000', 'Rupees One Lakh Only'], ['10000000', 'Rupees One Crore Only'], ['250000000', 'Rupees Twenty-Five Crore Only'],
    ['100001', 'Rupees One Lakh and One Only', 'it was "One Lakh One"'], ['1050', 'Rupees One Thousand and Fifty Only', 'it was "One Thousand Fifty"'], ['10000001', 'Rupees One Crore and One Only', 'it was "One Crore One"'],
    ['1100', 'Rupees One Thousand One Hundred Only'], ['0.05', 'Five Paise Only', 'it was "Rupees Zero and Five Paise Only"'], ['0.01', 'One Paisa Only', 'it was "One Paise"'],
    ['1.01', 'Rupees One and One Paisa Only', 'it was "One Paise"'], ['12.5', 'Rupees Twelve and Fifty Paise Only'], ['0', 'Rupees Zero Only'], ['1000000000000', 'Rupees One Lakh Crore Only'],
  ]) { const got = await say(n); ok(got === want, `₹ ${n} → ${want}${was ? ` (${was})` : ''} — got ${got}`); }

  // ---- the words of the reference, in lakh and crore
  const pick = ref.numbers.filter((_, i) => i % 13 === 0);
  let bad = [];
  for (const [n, indian] of pick) { const got = await say(n); if (got !== `Rupees ${title(indian)} Only`) bad.push(`${n}: "${got}" ≠ "Rupees ${title(indian)} Only"`); }
  ok(pick.length >= 120 && !bad.length, `${pick.length} numbers of the reference up to 10¹⁹, in lakh and crore, as num2words words them ${bad.slice(0, 3).join(' | ')}`);
  { const got = await say('9999999999999999999'); ok(await c.row('Digits') === '99,99,99,99,99,99,99,99,999' && /^Rupees Ninety-Nine Thousand Nine Hundred and Ninety-Nine Crore/.test(got), `19 digits: every digit kept in "Digits" (a Number rounded them to 1 followed by 19 zeros) — ${await c.row('Digits')}`); }

  // ---- what people type around an amount
  for (const typed of ['₹ 1,00,001', 'Rs. 1,00,001', 'rs 100001/-', 'INR 1,00,001', '1,00,001/-', ' 1 00 001 ', '+100001', '1,00,001.00'])
  { const got = await say(typed); ok(got === 'Rupees One Lakh and One Only', `"${typed}" is read as one lakh and one (${got})`); }
  ok(await say('.5') === 'Fifty Paise Only' && await c.row('Digits') === '0.50', '".5" is fifty paise');
  ok(await say('12.') === 'Rupees Twelve Only' && await c.row('Digits') === '12', '"12." is twelve');
  ok(await say('007') === 'Rupees Seven Only' && await c.row('Digits') === '7', 'leading zeros are dropped');

  // ---- the international system
  await c.seg('System', 'International (million)');
  ok(await say('1234567') === 'Rupees One Million Two Hundred and Thirty-Four Thousand Five Hundred and Sixty-Seven Only' && await c.row('Digits') === '1,234,567', 'international: million, digits in threes');
  bad = [];
  const pick2 = ref.numbers.filter((_, i) => i % 17 === 5);
  for (const [n, , intl] of pick2) { const got = await say(n); if (got !== `Rupees ${title(intl)} Only`) bad.push(`${n}: "${got}"`); }
  ok(pick2.length >= 90 && !bad.length, `${pick2.length} numbers of the reference in millions and billions ${bad.slice(0, 3).join(' | ')}`);

  // ---- dollars
  await c.seg('Currency', 'Dollars');
  for (const [n, want, was] of [['19.99', 'Nineteen Dollars and Ninety-Nine Cents Only'], ['1', 'One Dollar Only', 'it was "One Dollars"'], ['1.01', 'One Dollar and One Cent Only', 'it was "One Dollars and One Cents"'], ['0.01', 'One Cent Only'], ['0.99', 'Ninety-Nine Cents Only'], ['1000001', 'One Million and One Dollars Only'], ['$2,500.50', 'Two Thousand Five Hundred Dollars and Fifty Cents Only']])
  { const got = await say(n); ok(got === want, `$ ${n} → ${want}${was ? ` (${was})` : ''} — got ${got}`); }

  // ---- plain numbers
  await c.seg('Currency', 'Plain number');
  for (const [n, want, digits, was] of [['3.05', 'Three point zero five', '3.05'], ['1000000000', 'One Billion', '1,000,000,000'], ['3.14159', 'Three point one four one five nine', '3.14159', 'more than two decimals were refused'],
    ['-12', 'Minus Twelve', '−12', 'a negative number was refused'], ['−3.5', 'Minus Three point five', '−3.5'], ['-0', 'Zero', '0'], ['1001', 'One Thousand and One', '1,001'], ['0.5', 'Zero point five', '0.5']])
  { const got = await say(n); ok(got === want && await c.row('Digits') === digits, `the number ${n} → ${want}${was ? ` (${was})` : ''} — got ${got} / ${await c.row('Digits')}`); }
  await c.seg('System', 'Indian (lakh, crore)');
  ok(await say('12345678.9') === 'One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred and Seventy-Eight point nine' && await c.row('Digits') === '1,23,45,678.9', 'a plain number in lakh and crore');

  // ---- refused, with the reason
  await c.seg('Currency', 'Rupees');
  for (const [typed, reason] of [['', 'Enter a number, for example 125000 or 1,25,000.50.'], ['abc', 'This is not a number: use digits, with a point before the decimals (commas between digits are fine).'],
    ['1.2.3', 'This is not a number: use digits, with a point before the decimals (commas between digits are fine).'], ['1e5', 'Write the number out in digits — 1e5 is 100000.'],
    ['12.345', 'Paise have two digits — round the amount to two decimals.'], ['-5', 'An amount of money is written without a minus sign.'], ['12345678901234567890', 'Too large — at most 19 digits before the decimal point.']]) {
    await c.set('Amount', typed); const w = await c.warn();
    ok(w === reason && !(await page.locator('.big-result').count()), `"${typed}" → "${reason}" (${w})`);
  }
  await c.seg('Currency', 'Dollars'); await c.set('Amount', '12.345');
  ok(await c.warn() === 'Cents have two digits — round the amount to two decimals.', 'three decimals of a dollar amount');
  await c.seg('Currency', 'Rupees');
  ok(await say('500') === 'Rupees Five Hundred Only', 'after the refusals a number is worded again');
  ok(!/NaN|undefined/.test(await page.locator('.tool-body').innerText()), 'never NaN or undefined on the page');

  // ---- copy
  await hookClipboard(page); await say('100001'); await page.locator('.big-result').first().click();
  ok((await copied(page)).join() === 'Rupees One Lakh and One Only', `a click copies the sentence (${await copied(page)})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/words`); await ph.locator('.big-value').first().waitFor(); const pc = calc(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
  await pc.set('Amount', '9999999999999999999');
  ok(/Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred and Ninety-Nine Only$/.test(await pc.big('In words')) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: the longest sentence wraps inside the page');
  ok(await ph.evaluate(() => [...document.querySelectorAll('.seg-btn')].every((b) => b.getBoundingClientRect().height >= 44)), 'phone: the choices are 44 px touch targets');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
