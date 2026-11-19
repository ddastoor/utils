// Number Base Converter and Roman Numerals: reading what was typed and saying what is wrong with it. The conversions
// are mathcore's (m_base_convert: any length; m_to_roman / m_from_roman).
import type { Mathcore } from '../wasm/mathcore';

export const MAX_DIGITS = 10000; // a conversion of this length takes a few milliseconds; six of them run per keystroke
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** "0–7", "0–9 and A–F", "0–9 and A" */
export const digitsOf = (base: number) => (base <= 10 ? `0–${base - 1}` : base === 11 ? '0–9 and A' : `0–9 and A–${DIGITS[base - 1]}`);
const NAMES: Record<number, string> = { 2: 'binary', 8: 'octal', 10: 'decimal', 16: 'hexadecimal' };

/** The typed number as the engine takes it (a typographic minus is a minus), or why it is not one. `empty`: nothing typed. */
export function readNumber(typed: string, base: number): { text: string } | { empty: true } | { error: string } {
  const text = typed.trim().replace(/^[−–]/, '-');
  if (!text) return { empty: true };
  if (!Number.isInteger(base) || base < 2 || base > 36) return { error: 'The base must be a whole number from 2 to 36.' };
  let body = text.replace(/^[-+]/, '');
  const prefix = { 16: /^0x/i, 8: /^0o/i, 2: /^0b/i }[base];
  if (prefix) body = body.replace(prefix, '');
  const digits = body.replace(/[\s_,]/g, '');
  if (!digits) return { error: 'There are no digits here.' };
  if (digits.length > MAX_DIGITS) return { error: `Too long — at most ${MAX_DIGITS.toLocaleString('en-IN')} digits.` };
  for (const ch of digits) {
    const d = DIGITS.indexOf(ch.toUpperCase());
    if (d >= 0 && d < base) continue;
    if (ch === '.') return { error: 'Only whole numbers can be converted — there is a point in this one.' };
    if (ch === '-' || ch === '+' || ch === '−') return { error: 'A sign belongs in front of the number.' };
    return { error: `“${ch}” is not ${base === 8 ? 'an' : 'a'} ${NAMES[base] ?? `base-${base}`} digit (${digitsOf(base)}).` };
  }
  return { text };
}

// ------------------------------------------------------------------ Roman numerals
const TOKENS: Array<[string, number]> = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
/** "M (1000) + CM (900) + XC (90) + IV (4)" — the standard numeral taken apart (numbers without commas: they are mostly years) */
export function romanParts(numeral: string): string {
  const out: string[] = []; let i = 0;
  while (i < numeral.length) {
    const t = TOKENS.find(([s]) => numeral.startsWith(s, i)); if (!t) return '';
    let n = 1; while (t[0].length === 1 && numeral.startsWith(t[0], i + n)) n++; // MMM and XX as one part
    out.push(`${t[0].repeat(n)} (${t[1] * n})`); i += t[0].length * n;
  }
  return out.join(' + ');
}
export type RomanAnswer = { kind: 'roman'; number: number; roman: string; parts: string } | { kind: 'number'; number: number; roman: string; parts: string; note: string };
/** A whole number 1 – 3,999 → its numeral; a numeral → its number. Throws with the reason for anything else. */
export function romanAnswer(m: Mathcore, typed: string): RomanAnswer {
  const s = typed.normalize('NFKC').replace(/[\s_]/g, '').toUpperCase(); // Ⅳ and ⅻ are IV and XII
  if (!s) throw new Error('Type a number from 1 to 3,999 or a Roman numeral such as MMXXVI.');
  if (/^[-+−]?[\d,.]+$/.test(s)) {
    const t = s.replace(/,/g, '');
    if (!/^\d+$/.test(t)) throw new Error('Roman numerals are for whole numbers from 1 to 3,999 — no minus sign, no decimals.');
    const n = t.length > 9 ? Infinity : +t;
    if (n === 0) throw new Error('There is no Roman numeral for 0 — the Romans had no sign for it.');
    if (n > 3999) throw new Error('Standard Roman numerals stop at 3,999 (MMMCMXCIX); larger numbers were written with a line above the letters.');
    const roman = m.toRoman(n)!;
    return { kind: 'roman', number: n, roman, parts: romanParts(roman) };
  }
  const odd = [...s].find((ch) => !'IVXLCDM'.includes(ch));
  if (odd) throw new Error(`“${odd}” is not a Roman numeral letter — they are I, V, X, L, C, D and M.`);
  const strict = m.fromRoman(s), value = strict ?? m.fromRomanLoose(s);
  if (!value) throw new Error('These letters do not make a Roman numeral: the larger ones come first, and only I, X and C are put before a larger letter to subtract (IV, IX, XL, XC, CD, CM).');
  const standard = value <= 3999 ? m.toRoman(value)! : '';
  return { kind: 'number', number: value, roman: standard, parts: romanParts(standard),
    note: strict ? '' : standard ? `The standard way to write ${value} is ${standard}; ${s} is the older, additive form (as on clock faces).` : 'Above 3,999 the standard notation puts a line above the letters; MMMM is the additive way of writing it.' };
}
