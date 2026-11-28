// The Spell Checker's text (potentials #10): its words and the ones left alone, the sentence round a word, changes to the text and
// where earlier positions go after a change. No DOM. Whether a word is spelt right is Hunspell's (src/wasm/hunspell.ts, in
// src/workers/spell.worker.ts).

export interface SpellOpts {
  /** leave words in CAPITALS alone (NASA, GST) */ caps: boolean;
  /** leave words with digits alone (2nd, B2B, COVID19) */ digits: boolean;
  /** leave capitalised words in mid-sentence alone (names: Ramesh, Infosys) */ names: boolean;
}
export const DEFAULT_OPTS: SpellOpts = { caps: true, digits: true, names: true };
export interface Tok { start: number; end: number; word: string; skip: '' | 'caps' | 'digits' | 'name' }

// web and e-mail addresses (and file names with a known ending): left alone whole
const ADDRESS = /\b(?:(?:https?|ftp):\/\/|www\.)[^\s<>"'()]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|org|net|in|io|gov|edu|co|uk|info|dev|app|pdf|docx?|xlsx?|txt|jpe?g|png|html?)\b(?:\/[^\s<>"'()]*)?/giu;
// a word: letters, marks and digits, with apostrophes inside (don't, India's, o’clock)
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

// a full stop after these ends no sentence: titles (Dr. Rao) and initials (A. P. J. Abdul Kalam)
const TITLE = /(?:^|[^\p{L}])(?:Mr|Mrs|Ms|Mx|Dr|Prof|St|Sr|Jr|Smt|Shri|Sri|Kum|Mt|Capt|Col|Gen|Lt|Sgt|Rev|Hon|Er|Adv|Fr|Sir|\p{Lu})$/u;

/** Is the position at a sentence's start: nothing before it in the text but spaces, quotes, brackets and list marks back to the
 *  start of the text, a line's start, or a sentence's end (. ! ? …) — not the full stop of a title or an initial? */
export function sentenceStart(text: string, pos: number): boolean {
  let i = pos - 1;
  while (i >= 0 && /[\s"'“”‘’([{«»*•\-–—]/u.test(text[i]) && text[i] !== '\n') i--;
  if (i < 0 || text[i] === '\n') return true;
  if (text[i] === '.' && TITLE.test(text.slice(Math.max(0, i - 6), i))) return false;
  if (/[.!?…]/.test(text[i])) return true;
  // "1." or "a)" at a line's start: a list item
  return /^\s*(?:\d+|[a-z])[.)]$/i.test(text.slice(text.lastIndexOf('\n', i) + 1, i + 1));
}

/** The words of a text, each with what leaves it alone ('' = to be checked). */
export function tokens(text: string, o: SpellOpts = DEFAULT_OPTS): Tok[] {
  const masked = text.replace(ADDRESS, (m) => ' '.repeat(m.length));
  const out: Tok[] = [];
  for (const m of masked.matchAll(WORD)) {
    const word = m[0], start = m.index!, end = start + word.length;
    let skip: Tok['skip'] = '';
    if (o.digits && /\p{N}/u.test(word)) skip = 'digits';
    else if (o.caps && word.length > 1 && /\p{Lu}/u.test(word) && !/\p{Ll}/u.test(word)) skip = 'caps';
    else if (o.names && /^\p{Lu}/u.test(word) && /\p{Ll}/u.test(word.slice(1)) && !sentenceStart(text, start)) skip = 'name';
    out.push({ start, end, word, skip });
  }
  return out;
}

/** The sentence round [start, end): what stands before the word, the word, what follows — at most `room` characters a side, cut at
 *  a word's edge with "…". */
export function around(text: string, start: number, end: number, room = 70): { before: string; word: string; after: string } {
  let a = start;
  while (a > 0 && start - a < room && !/[.!?\n]/.test(text[a - 1])) a--;
  let b = end;
  while (b < text.length && b - end < room && !/[\n]/.test(text[b])) { b++; if (/[.!?]/.test(text[b - 1]) && (b >= text.length || /\s/.test(text[b]))) break; }
  let before = text.slice(a, start), after = text.slice(end, b);
  if (a > 0 && !/[.!?\n]/.test(text[a - 1])) before = `…${before.replace(/^\S*\s/, '')}`;
  if (b < text.length && !/[.!?\n]/.test(text[b - 1])) after = `${after.replace(/\s\S*$/, '')}…`;
  return { before: before.replace(/^\s+/, ''), word: text.slice(start, end), after: after.replace(/\s+$/, '') };
}

/** a word typed in place of another takes its capitals: "Recieve" → "Receive", "RECIEVE" → "RECEIVE" (Hunspell's suggestions have
 *  them already; this is for a word typed by hand) */
export function matchCase(model: string, repl: string): string {
  if (!repl || repl !== repl.toLowerCase()) return repl;
  if (model.length > 1 && model === model.toUpperCase() && model !== model.toLowerCase()) return repl.toUpperCase();
  if (/^\p{Lu}/u.test(model)) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
}

export interface Edit { start: number; end: number; text: string }
/** The text with the edits made (the edits do not overlap; any order). */
export function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const e of [...edits].sort((x, y) => y.start - x.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
/** Where a position goes when [start, end) of the text becomes `len` characters long: before it, the same; after it, moved by the
 *  difference; inside it, null (the word was changed). */
export function moved(pos: number, start: number, end: number, len: number): number | null {
  if (pos < start) return pos;
  if (pos >= end) return pos + len - (end - start);
  return null;
}
/** The one edit that turns `a` into `b` (what a person typed or pasted): the common start and end left out. */
export function diffSpan(a: string, b: string): { start: number; endA: number; endB: number } {
  let s = 0;
  const n = Math.min(a.length, b.length);
  while (s < n && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return { start: s, endA: ea, endB: eb };
}
