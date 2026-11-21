// The Regex Tester's engines (to-do #8, owner, 21 Nov 2026: "a choice of regex flavours the user can select — Python
// (re, and the regex module), Perl / PCRE, and the other standard ones"). Every flavour is the engine its language
// runs, in WebAssembly where it is not the browser's own; each adapter in this folder turns a request into the same
// answer. No DOM here: the adapters run in the regex worker and, in the unit suite, under Node.

export interface EngineReq {
  pattern: string;
  /** The flavour's own flag letters, checked by flagsError. */
  flags: string;
  text: string;
  /** null: no replacement asked for. */
  replacement: string | null;
  /** Replace every match (else the first only). JavaScript ignores it: its g flag decides, as String.replace does. */
  all: boolean;
}
export interface RegexMatch { index: number; text: string; groups: Array<string | null> }
export interface EngineOut {
  total: number;
  /** The first SHOWN matches, with UTF-16 indexes into the text. */
  matches: RegexMatch[];
  /** The name of each capture group by its number (index 0 = group 1); '' for an unnamed group. */
  names: string[];
  replaced: string | null;
  /** Why the replacement could not be made (the pattern itself was fine). */
  repError?: string;
  /** The engine's version, for the line under the result. */
  version?: string;
}
/** Matches listed (the rest only counted), and matches counted before the count stops. */
export const SHOWN = 1000, COUNTED = 1_000_000;

/** The pattern does not compile: the engine's message, shown under the pattern. */
export class PatternError extends Error {}

/** UTF-16 index of each UTF-8 byte offset at which a character starts, and of the end — for a text as TextEncoder
 *  encodes it (a lone surrogate becomes U+FFFD, three bytes). Other offsets hold −1. */
export function utf8Index(text: string): Int32Array {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  const map = new Int32Array(n + 1).fill(-1);
  let b = 0;
  for (let i = 0; i < text.length; ) {
    const c = text.charCodeAt(i);
    map[b] = i;
    if (c < 0x80) { b += 1; i += 1; }
    else if (c < 0x800) { b += 2; i += 1; }
    else if (c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { b += 4; i += 2; }
    else { b += 3; i += 1; }
  }
  map[n] = text.length;
  return map;
}

/** UTF-16 index of every code point of the text (a pair of surrogates is one code point, a lone one too), and of the
 *  end — Python counts in code points. */
export function codePointIndex(text: string): Int32Array {
  const out = new Int32Array(text.length + 1);
  let k = 0;
  for (let i = 0; i < text.length; ) {
    out[k++] = i;
    const c = text.charCodeAt(i);
    i += c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1;
  }
  out[k++] = text.length;
  return out.subarray(0, k);
}

/** A match from flat offsets [start, end, start1, end1, …] (−1 for a group that took no part), mapped to UTF-16. */
export function fromOffsets(text: string, o: ArrayLike<number>, map?: Int32Array): RegexMatch {
  const at = (x: number) => (map ? map[x] : x);
  const s = at(o[0]), e = at(o[1]), groups: Array<string | null> = [];
  for (let i = 2; i + 1 < o.length; i += 2) groups.push(o[i] < 0 ? null : text.slice(at(o[i]), at(o[i + 1])));
  return { index: s, text: text.slice(s, e), groups };
}

/** The width in UTF-16 units of the character at i (2 for a surrogate pair). */
export const charWidth = (text: string, i: number) => {
  const c = text.charCodeAt(i);
  return c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1;
};
