// Word Counter: what the tab shows, from the engine's counts (textkit.wasm). No DOM here.
import type { TextCounts, Textkit } from '../wasm/textkit';

export interface TextStats extends TextCounts { /** characters per word, 0 for no words */ avgWord: number }
export const EMPTY: TextStats = { words: 0, chars: 0, noSpace: 0, sentences: 0, paragraphs: 0, lines: 0, wordChars: 0, bytes: 0, top: [], avgWord: 0 };

// Thai, Lao, Myanmar and Khmer are written without spaces between words: only a dictionary finds the words. The
// engine has none and leaves these letters out of its word count (the same ranges in wasm/textkit/src/lib.rs); the
// browser's own segmenter has the dictionaries, so the words of such stretches are counted here and added.
const SEA = /[฀-໿က-႟ក-៿᧠-᧿ꧠ-꧿ꩠ-ꩿ]+/g;
function dictionaryWords(text: string): { words: number; chars: number } {
  let words = 0, chars = 0;
  const runs = text.match(SEA);
  if (!runs || typeof Intl === 'undefined' || !('Segmenter' in Intl)) return { words, chars };
  const word = new Intl.Segmenter(undefined, { granularity: 'word' }), cluster = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const run of runs) for (const s of word.segment(run)) if (s.isWordLike) { words++; for (const _ of cluster.segment(s.segment)) chars++; }
  return { words, chars };
}

/** The counts of a text. */
export function textStats(text: string, kit: Textkit): TextStats {
  if (!text) return EMPTY;
  const c = kit.stats(text), extra = dictionaryWords(text);
  const words = c.words + extra.words, wordChars = c.wordChars + extra.chars;
  return { ...c, words, wordChars, avgWord: words ? wordChars / words : 0 };
}

export const READING_WPM = 238; // silent reading of English prose (Brysbaert 2019, a review of 190 studies)
export const SPEAKING_WPM = 150; // an unhurried talk
/** "45 sec", "3 min", "1 hr 5 min" — the time `words` take at `wpm`; "—" for no words */
export function timeText(words: number, wpm: number): string {
  if (!(words > 0)) return '—';
  const seconds = (words / wpm) * 60;
  if (seconds < 59.5) return `${Math.max(1, Math.round(seconds))} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}
