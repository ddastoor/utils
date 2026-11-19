// Find & Replace: what is searched for and what it is replaced with. No DOM here.
// The engine is the browser's own RegExp — the same one the Regex Tester tab shows, so a pattern tried there does
// the same here; the page runs it in a worker with a time limit (src/workers/regex.worker.ts).
export interface FindOptions { /** the text in "Find" is a regular expression */ regex: boolean; /** capitals and small letters differ */ cs: boolean; /** only whole words */ word: boolean }
export interface Plan { pattern: string; flags: string; replacement: string; /** the pattern is valid only without the Unicode flag (an escape like \- or a lone brace): it is run that way */ loose: boolean }

const SPECIAL = /[.*+?^${}()|[\]\\]/g;
// a letter, a digit, a mark that belongs to a letter (a Hindi vowel sign, a combining accent) or an underscore
const WORD = '[\\p{L}\\p{N}\\p{M}_]', WORD_LOOSE = '[\\w\\u00aa-\\uffff]';

/** Why a pattern is refused, in a sentence: "Invalid regular expression: /(/gimu: Unterminated group" → "… unterminated group". */
export function patternError(message: string): string {
  const why = message.replace(/^Invalid regular expression: /, '').replace(/^\/.*\/[a-z]*: /s, '').replace(/\.$/, '');
  return `This is not a valid regular expression: ${why.charAt(0).toLowerCase()}${why.slice(1)}.`;
}

/** The replacement as the engine wants it. Plain text: every character stands for itself. With a regular expression:
 *  $1 … $9, $<name> and $& as in JavaScript, $0 for the whole match as well, and \n \t \r \\ for a line break, a tab,
 *  a carriage return and a backslash (the box has one line: there is no other way to type them). */
export function replacementFor(rep: string, regex: boolean): string {
  if (!regex) return rep.replace(/\$/g, '$$$$');
  let out = '';
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i], n = rep[i + 1];
    if (c === '\\' && n !== undefined && 'ntr\\'.includes(n)) { out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : '\\'; i++; }
    else if (c === '$' && n === '$') { out += '$$'; i++; }
    else if (c === '$' && n === '0' && !/\d/.test(rep[i + 2] ?? '')) { out += '$&'; i++; }
    else out += c;
  }
  return out;
}

/** The search to run. Throws an Error with a sentence for the reader when the pattern cannot be used. */
export function plan(find: string, rep: string, o: FindOptions): Plan {
  const source = o.regex ? find : find.replace(SPECIAL, '\\$&');
  // g: every match; m: ^ and $ at every line, as in an editor; u: Unicode (a letter beyond the basic plane is one letter)
  const flags = `g${o.cs ? '' : 'i'}mu`;
  const wrap = (word: string) => (o.word ? `(?<!${word})(?:${source})(?!${word})` : source);
  try { new RegExp(wrap(WORD), flags); return { pattern: wrap(WORD), flags, replacement: replacementFor(rep, o.regex), loose: false }; }
  catch (strict: any) {
    // JavaScript's Unicode mode refuses escapes other dialects allow (\- \# \@, a lone { or ]): take the pattern as
    // the older mode takes it rather than turn away something pasted from elsewhere
    const loose = flags.replace('u', '');
    try { if (!o.regex) throw strict; new RegExp(wrap(WORD_LOOSE), loose); return { pattern: wrap(WORD_LOOSE), flags: loose, replacement: replacementFor(rep, true), loose: true }; }
    catch { throw new Error(patternError(String(strict?.message || strict))); }
  }
}

/** The line under the result. `total` stops counting at `limit`. */
export function countText(total: number, limit = 1_000_000): string {
  if (!total) return 'No match — nothing was replaced.';
  return `${total.toLocaleString('en-IN')}${total >= limit ? '+' : ''} replacement${total === 1 ? '' : 's'}`;
}
