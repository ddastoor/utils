// A typed amount → the sentence in words (Number to Words tab; the invoice and rent receipt use the rupee form).
// The words of a whole number are mathcore's (m_words: Indian lakh / crore or international million / billion, with
// "and" as British and Indian English place it). This file reads what was typed and builds the sentence.
import type { Mathcore } from '../wasm/mathcore';

export type Currency = 'inr' | 'usd' | 'none';
export interface InWords { text: string; digits: string }

const MAX_DIGITS = 19; // below 10^19: the engine counts in 64 bits
const cap = (x: string) => x.replace(/[a-z]+/g, (w) => (w === 'and' ? w : w[0].toUpperCase() + w.slice(1)));
const DIGIT = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** What people type around an amount is taken off: spaces, digit commas, ₹ $, Rs / Rs. / INR / USD, a leading +, and
 *  the "/-" Indian bills end with. Returns the sign and the digits before and after the point. */
export function readAmount(typed: string): { negative: boolean; int: string; frac: string } {
  let s = String(typed).replace(/[\s,_']/g, '').replace(/^(?:₹|\$|rs\.?|inr|usd)/i, '').replace(/\/[-–−]?$/, '').replace(/(?:₹|\$|rs\.?|inr|usd)$/i, '');
  if (s === '') throw new Error('Enter a number, for example 125000 or 1,25,000.50.');
  let negative = false;
  if (/^[-−–]/.test(s)) { negative = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
  s = s.replace(/^(?:₹|\$|rs\.?|inr|usd)/i, ''); // "-₹500"
  if (/^\d+(\.\d*)?[eE][-+]?\d+$/.test(s)) throw new Error('Write the number out in digits — 1e5 is 100000.');
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === '' && !m[2])) throw new Error('This is not a number: use digits, with a point before the decimals (commas between digits are fine).');
  const int = m[1].replace(/^0+(?=\d)/, '') || '0';
  if (int.length > MAX_DIGITS) throw new Error(`Too large — at most ${MAX_DIGITS} digits before the decimal point.`);
  return { negative, int, frac: m[2] ?? '' };
}

function group(int: string, indian: boolean) { return BigInt(int).toLocaleString(indian ? 'en-IN' : 'en-US'); } // BigInt: a Number would lose the digits beyond 2^53

/** The sentence and the digits with their commas. Throws with the reason when the text is not an amount. */
export function inWords(m: Mathcore, typed: string, indian: boolean, currency: Currency): InWords {
  const { negative, int, frac } = readAmount(typed);
  const whole = BigInt(int), W = cap(m.words(whole, indian));
  if (currency === 'none') {
    if (frac.length > 30) throw new Error('Too many decimals — at most 30.');
    const zero = whole === 0n && !/[1-9]/.test(frac); // −0 is 0
    const text = `${negative && !zero ? 'Minus ' : ''}${W}${frac ? ` point ${[...frac].map((d) => DIGIT[+d].toLowerCase()).join(' ')}` : ''}`;
    return { text, digits: `${negative && !zero ? '−' : ''}${group(int, indian)}${frac ? `.${frac}` : ''}` };
  }
  if (negative) throw new Error('An amount of money is written without a minus sign.');
  if (frac.length > 2) throw new Error(currency === 'inr' ? 'Paise have two digits — round the amount to two decimals.' : 'Cents have two digits — round the amount to two decimals.');
  const minor = parseInt((frac + '00').slice(0, 2), 10), M = cap(m.words(BigInt(minor), indian));
  const digits = `${group(int, indian)}${frac ? `.${(frac + '00').slice(0, 2)}` : ''}`;
  if (currency === 'inr') {
    const paise = `${M} ${minor === 1 ? 'Paisa' : 'Paise'}`;
    return { text: whole === 0n && minor ? `${paise} Only` : `Rupees ${W}${minor ? ` and ${paise}` : ''} Only`, digits };
  }
  const dollars = `${W} ${whole === 1n ? 'Dollar' : 'Dollars'}`, cents = `${M} ${minor === 1 ? 'Cent' : 'Cents'}`;
  return { text: whole === 0n && minor ? `${cents} Only` : `${dollars}${minor ? ` and ${cents}` : ''} Only`, digits };
}

/** A rupee amount (a number, rounded to paise) as on a cheque or an invoice: "Rupees One Lakh and One Only". */
export function rupeesInWords(m: Mathcore, amount: number): string {
  const [mant, exp = '0'] = String(Math.abs(amount)).split('e'), paise = Math.round(Number(`${mant}e${Number(exp) + 2}`)); // the amount as it is written, × 100: 1.005 is 101 paise
  if (!Number.isSafeInteger(paise)) throw new Error('The amount is too large to write in words.');
  return inWords(m, `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`, true, 'inr').text;
}
