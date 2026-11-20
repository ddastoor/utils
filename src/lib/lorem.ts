// Lorem Ipsum: what the tab asks for and how it shows the result. The text itself is textkit-lorem.wasm's. No DOM.
import type { LoremUnit } from '../wasm/lorem';

/** At most this many of each (and the box starts with the second number). */
export const LIMITS: Record<LoremUnit, { max: number; start: number; one: string; many: string }> = {
  p: { max: 200, start: 3, one: 'paragraph', many: 'paragraphs' },
  s: { max: 2000, start: 5, one: 'sentence', many: 'sentences' },
  w: { max: 20000, start: 50, one: 'word', many: 'words' },
};

/** The number typed into "How many": a whole number from 1 to the limit, or the reason it is not. Digit commas and
 *  spaces are allowed ("1,000", "10 000"). */
export function readCount(text: string, unit: LoremUnit): { n: number } | { error: string } {
  const t = text.trim().replace(/[,\s_]/g, '');
  const L = LIMITS[unit];
  if (!t) return { error: `Type how many ${L.many} you want.` };
  if (!/^\d+$/.test(t)) return { error: /^-/.test(t) ? `The number of ${L.many} cannot be below 1.` : /^\d*\.\d+$/.test(t) ? `Type a whole number of ${L.many}.` : `"${text.trim()}" is not a number.` };
  const n = Number(t);
  if (n < 1) return { error: `The number of ${L.many} cannot be below 1.` };
  if (n > L.max) return { error: `At most ${L.max.toLocaleString('en-IN')} ${L.many} at a time.` };
  return { n };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The text as it is copied: paragraphs apart by a blank line, or each in a <p> element. */
export const asText = (paragraphs: string[], html: boolean): string => (html ? paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n') : paragraphs.join('\n\n'));

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
/** "3 paragraphs · 21 sentences · 286 words · 1,903 characters" (the characters of the plain text). */
export const summary = (paragraphs: string[], sentences: number, words: number): string =>
  [plural(paragraphs.length, 'paragraph', 'paragraphs'), plural(sentences, 'sentence', 'sentences'), plural(words, 'word', 'words'), plural([...asText(paragraphs, false)].length, 'character', 'characters')].join(' · ');

/** 32 random bytes from the browser's generator: a new text. */
export const newSeed = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));
