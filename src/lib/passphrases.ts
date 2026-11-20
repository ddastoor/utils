// Passphrase Generator: the EFF large word list (7,776 words, CC BY 3.0), one passphrase, and its entropy. The random
// numbers come from libsodium's randombytes_uniform (libsodium.js, src/wasm/libsodium.ts); this file only picks words.
export const LIST_SIZE = 7776;
export const MIN_WORDS = 3, MAX_WORDS = 12;

/** The word list as served: exactly 7,776 different words of a – z and hyphens, one a line. Anything else (an error
 *  page, a cut download) is refused — passphrases made from it would be weak. */
export function readWordList(text: string): string[] {
  const words = text.split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
  if (words.length !== LIST_SIZE || new Set(words).size !== LIST_SIZE || !words.every((w) => /^[a-z]+(-[a-z]+)*$/.test(w)))
    throw new Error(`The word list did not arrive whole (${words.length.toLocaleString('en-IN')} lines instead of 7,776 words). Reload the page and try again.`);
  return words;
}

export interface PhraseOptions { words: number; sep: string; capitalise: boolean; digit: boolean }

/** One passphrase: `words` words drawn uniformly (repeats allowed); with `digit`, a random digit after one random word.
 *  `uniform(n)` = an unbiased integer 0 … n − 1. */
export function makePassphrase(list: string[], o: PhraseOptions, uniform: (n: number) => number): string {
  const ws = Array.from({ length: o.words }, () => list[uniform(list.length)]).map((w) => (o.capitalise ? w[0].toUpperCase() + w.slice(1) : w));
  if (o.digit) { const i = uniform(ws.length); ws[i] += String(uniform(10)); }
  return ws.join(o.sep);
}

/** Bits of entropy: words × log2(7,776); the digit adds log2(10 × words) — which digit, and after which word. */
export const phraseBits = (o: PhraseOptions, size = LIST_SIZE) => o.words * Math.log2(size) + (o.digit ? Math.log2(10 * o.words) : 0);
