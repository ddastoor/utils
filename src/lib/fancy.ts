// Fancy Text: the styles. Tables of Unicode characters. Where a style works character by character (a mark under
// every character, the text turned upside down) the text is taken apart into the characters a reader sees — an emoji
// with its skin tone, a letter with its vowel sign — by textkit.wasm (Unicode's rules, the ones the Word Counter
// counts with); a text of Latin letters needs no engine for that (plainClusters).
const A = 65, a = 97, ZERO = 48;
/** Cuts a text into the characters a reader sees as one each. */
export type Split = (s: string) => string[];
/** Can `plainClusters` cut this text? Yes while it holds nothing beyond Latin letters with their combining accents
 *  (U+0000 – U+036F, Latin Extended Additional), everyday punctuation (dashes, curly quotes, the ellipsis, bullets:
 *  U+2010 – U+2027, U+2030 – U+205E) and currency signs (U+20A0 – U+20CF): no emoji, no other script, no joiner. */
export const needsEngine = (s: string) => /[^\u0000-\u036f\u1e00-\u1eff\u2010-\u2027\u2030-\u205e\u20a0-\u20cf]/.test(s);
/** The characters of such a text, exactly as Unicode's rules (UAX #29) cut it: a letter with the accents that follow
 *  it; a control character alone; CR LF together. (The unit suite holds this to the engine.) */
export const plainClusters: Split = (s) => s.match(/\r\n|[^\u0000-\u001f\u007f-\u009f\u00ad][\u0300-\u036f]*|[^]/g) ?? [];
/** é → e + its accent, so that the letter can take the style and keep the accent (Latin letters only). */
const open = (s: string) => s.replace(/[\u00c0-\u024f\u1e00-\u1eff]/g, (c) => { const d = c.normalize('NFD'); return /^[A-Za-z]/.test(d) ? d : c; });
/** A style that maps A–Z, a–z and (where Unicode has them) 0–9 to a run of code points each; `holes`: the letters
 *  Unicode keeps elsewhere (the Letterlike Symbols block) because they were encoded before the run was. */
const runs = (upper: number, lower: number, digit: number | ((d: number) => number) | null, holes: Record<string, string> = {}) => (s: string) => Array.from(open(s), (c) => {
  if (holes[c]) return holes[c];
  const k = c.codePointAt(0)!;
  if (k >= A && k < A + 26) return String.fromCodePoint(upper + k - A);
  if (k >= a && k < a + 26) return String.fromCodePoint(lower + k - a);
  if (digit !== null && k >= ZERO && k < ZERO + 10) return String.fromCodePoint(typeof digit === 'number' ? digit + k - ZERO : digit(k - ZERO));
  return c;
}).join('');
const table = (from: string, to: string) => { const m = new Map(Array.from(from).map((c, i) => [c, Array.from(to)[i]])); return (c: string) => m.get(c) ?? c; };

const SMALL_CAPS = table('abcdefghijklmnopqrstuvwxyz', 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ');
// every sign as it looks turned by half a circle; brackets change places, 6 and 9 too
const FLIP = table('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?\'"()[]{}<>&_;',
  'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz∀ꓭƆꓷƎℲ⅁HIſꓘ⅂WNOԀꝹꓤSꓕՈɅMX⅄Z0ƖᄅƐㄣϛ9ㄥ86˙\'¡¿,„)(][}{><⅋‾؛');
/** A combining mark after every character a reader sees (not inside an emoji sequence or after each part of a letter). */
const marked = (mark: string) => (s: string, split: Split) => split(s).map((c) => (/^\s+$/.test(c) && c !== ' ' ? c : c + mark)).join('');

/** The styles. `split` is asked only by the styles that work character by character (`BY_CHARACTER`). */
export const FANCY: Array<[string, (s: string, split: Split) => string]> = [
  ['Bold', runs(0x1d400, 0x1d41a, 0x1d7ce)],
  ['Italic', runs(0x1d434, 0x1d44e, null, { h: 'ℎ' })],
  ['Bold italic', runs(0x1d468, 0x1d482, null)],
  ['Script', runs(0x1d49c, 0x1d4b6, null, { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' })],
  ['Bold script', runs(0x1d4d0, 0x1d4ea, null)],
  ['Fraktur', runs(0x1d504, 0x1d51e, null, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' })],
  ['Double-struck', runs(0x1d538, 0x1d552, 0x1d7d8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' })],
  ['Sans-serif', runs(0x1d5a0, 0x1d5ba, 0x1d7e2)],
  ['Sans bold', runs(0x1d5d4, 0x1d5ee, 0x1d7ec)],
  ['Sans italic', runs(0x1d608, 0x1d622, null)],
  ['Monospace', runs(0x1d670, 0x1d68a, 0x1d7f6)],
  // ⓪ stands apart from ① … ⑨
  ['Circled', runs(0x24b6, 0x24d0, (d) => (d === 0 ? 0x24ea : 0x2460 + d - 1))],
  ['Fullwidth', (s) => Array.from(s, (c) => { const k = c.codePointAt(0)!; return k >= 33 && k <= 126 ? String.fromCodePoint(k + 0xfee0) : c === ' ' ? '\u3000' : c; }).join('')],
  ['Small caps', (s) => Array.from(open(s), SMALL_CAPS).join('')],
  // read from the other side: the characters in reverse order, each turned over (so the last line comes first)
  ['Upside down', (s, split) => split(open(s)).reverse().map((c) => Array.from(c, FLIP).join('')).join('')],
  ['Strikethrough', marked('\u0336')],
  ['Underline', marked('\u0332')],
  ['Squared', runs(0x1f130, 0x1f130, null)],
];

/** The styles that need the text cut into characters. */
export const BY_CHARACTER = new Set(['Upside down', 'Strikethrough', 'Underline']);

/** A row shows the style of this many characters of a long text; Copy styles all of it. (Eighteen rows of a long
 *  text in styled characters take the browser seconds to lay out — 1.5 s at 20,000 characters, minutes at 200,000.) */
export const FANCY_SHOWN = 2000;
/** The part of a long text that a row styles: its first FANCY_SHOWN characters (UTF-16 units), ending between two
 *  characters a reader sees — or its last ones (`fromEnd`: the text turned upside down begins with its end).
 *  `null`: the text is short enough to be shown whole. */
export function shownPart(text: string, split: Split, fromEnd = false): string | null {
  if (text.length <= FANCY_SHOWN) return null;
  const SLACK = 256; // more than a character takes; what is cut through at the far end of the slice is left out anyway
  let out = '';
  if (!fromEnd) { for (const c of split(text.slice(0, FANCY_SHOWN + SLACK))) { if (out.length + c.length > FANCY_SHOWN) break; out += c; } return out; }
  const tail = split(text.slice(-(FANCY_SHOWN + SLACK)));
  for (let i = tail.length - 1; i >= 0; i--) { if (out.length + tail[i].length > FANCY_SHOWN) break; out = tail[i] + out; }
  return out;
}
/** What a row shows: the style of the whole text, or of its shown part with an ellipsis. */
export function fancyRow(name: string, f: (s: string, split: Split) => string, text: string, split: Split): string {
  const part = shownPart(text, split, name === 'Upside down');
  return part === null ? f(text, split) : f(part, split) + '…';
}
