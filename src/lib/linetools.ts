// Line Tools: what is done to the lines. No DOM here.
// The comparing of two lines is the browser's own collator (Intl.Collator: ICU, in the reader's language, digits
// compared as numbers); the shuffle is crypto.wasm's and the length of a line is textkit.wasm's count of characters
// — both are handed in, so that neither engine is fetched before its option is chosen.
export type SortMode = 'none' | 'az' | 'za' | 'num' | 'len' | 'shuffle';
export interface LineOptions { trim: boolean; empty: boolean; dedupe: boolean; ci: boolean; sort: SortMode; reverse: boolean; number: boolean; prefix: string; suffix: string }
export interface LineDeps { /** a fair shuffle (needed for sort 'shuffle') */ shuffle?: (lines: string[]) => string[]; /** characters of each line (needed for sort 'len') */ lengths?: (lines: string[]) => number[] }
export interface LineResult { lines: string[]; /** lines of the input */ in: number; removedEmpty: number; removedDuplicates: number; /** 'num' only: lines that do not begin with a number (they stand last) */ withoutNumber: number }

/** The lines of a text. A line break at the very end starts no further line; an empty text has no lines. */
export function splitLines(text: string): string[] {
  if (!text) return [];
  const ls = text.split(/\r\n|\n|\r/);
  if (ls[ls.length - 1] === '') ls.pop();
  return ls;
}

/** What two lines are compared by when duplicates are looked for: the same letters written in two ways (é as one
 *  character or as e + accent) are the same line; `ci` also takes capitals and small letters as one (ß = SS). */
export const dedupeKey = (line: string, ci: boolean): string => { const n = line.normalize('NFC'); return ci ? n.toUpperCase().toLowerCase().normalize('NFC') : n; };

const NUMBER = /^\s*([+\-−]?)\s*(?:[₹$€£¥]|Rs\.?|INR|USD)?\s*([+\-−]?)\s*((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE]([+-]?\d+))?/;
/** The number a line begins with — "42", "-3.5", "1,20,000", "₹ 500", "−7", "2e3", "50%" — or null. */
export function leadingNumber(line: string): number | null {
  const m = NUMBER.exec(line);
  if (!m) return null;
  const v = Number(m[3].replace(/,/g, '') + (m[4] !== undefined ? `e${m[4]}` : ''));
  if (!Number.isFinite(v)) return null;
  return (m[1] || m[2]) && (m[1] || m[2]) !== '+' ? -v : v;
}

let collator: Intl.Collator | null = null;
/** Lines in the reader's alphabet, a run of digits compared as a number ("item 2" before "item 10"). */
export const compareLines = (a: string, b: string): number => (collator ||= new Intl.Collator(undefined, { numeric: true })).compare(a, b);

export function processLines(text: string, o: LineOptions, deps: LineDeps = {}): LineResult {
  let ls = splitLines(text);
  const r: LineResult = { lines: [], in: ls.length, removedEmpty: 0, removedDuplicates: 0, withoutNumber: 0 };
  if (o.trim) ls = ls.map((l) => l.trim());
  if (o.empty) { const n = ls.length; ls = ls.filter((l) => l.trim()); r.removedEmpty = n - ls.length; }
  if (o.dedupe) { const n = ls.length, seen = new Set<string>(); ls = ls.filter((l) => { const k = dedupeKey(l, o.ci); if (seen.has(k)) return false; seen.add(k); return true; }); r.removedDuplicates = n - ls.length; }
  if (o.sort === 'az') ls.sort(compareLines);
  else if (o.sort === 'za') ls.sort((a, b) => compareLines(b, a));
  else if (o.sort === 'num') {
    const keyed = ls.map((l) => ({ l, v: leadingNumber(l) }));
    r.withoutNumber = keyed.filter((k) => k.v === null).length;
    keyed.sort((a, b) => (a.v === null ? (b.v === null ? 0 : 1) : b.v === null ? -1 : a.v - b.v)); // the sort is stable: equal numbers, and lines without one, keep their order
    ls = keyed.map((k) => k.l);
  } else if (o.sort === 'len') {
    if (!deps.lengths) throw new Error('no length counter');
    const n = deps.lengths(ls), idx = ls.map((_, i) => i);
    idx.sort((a, b) => n[a] - n[b] || compareLines(ls[a], ls[b]));
    ls = idx.map((i) => ls[i]);
  } else if (o.sort === 'shuffle') {
    if (!deps.shuffle) throw new Error('no shuffle');
    ls = deps.shuffle(ls);
  }
  if (o.reverse) ls.reverse();
  r.lines = o.number || o.prefix || o.suffix ? ls.map((l, i) => `${o.number ? `${i + 1}. ` : ''}${o.prefix}${l}${o.suffix}`) : ls;
  return r;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
/** "8 lines in → 6 lines out · 1 empty line and 1 duplicate removed" */
export function summary(r: LineResult): string {
  const gone = [r.removedEmpty ? plural(r.removedEmpty, 'empty line') : '', r.removedDuplicates ? plural(r.removedDuplicates, 'duplicate') : ''].filter(Boolean);
  return `${plural(r.in, 'line')} in → ${plural(r.lines.length, 'line')} out${gone.length ? ` · ${gone.join(' and ')} removed` : ''}${r.withoutNumber ? ` · ${plural(r.withoutNumber, 'line')} without a number at the end` : ''}`;
}
