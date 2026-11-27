// A book's text as it should be spoken (the Audiobook tab): small helpers shared by the reading side (src/lib/audiobook.ts)
// and the speech worker (src/workers/audiobook.worker.ts), kept apart so the worker does not load the PDF engine.
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
/** Words as a listener counts them (letters and digits). */
export const countWords = (s: string) => (s.match(WORD) || []).length;

/** A paragraph's text as it should be spoken: soft hyphens and zero-width characters out; a web address as its site
 *  ("example.com"); bracketed note marks ([12], [*]) out; white space single. Kokoro's own normaliser reads the rest
 *  (numbers, money, times, titles). */
export function speechText(t: string): string {
  return t.normalize('NFC')
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\bhttps?:\/\/(?:www\.)?([^\s/?#]+)[^\s]*?(?=[.,;:!?)\]]*(?:\s|$))/gi, '$1')
    .replace(/\bwww\.([^\s/?#]+\.[a-z]{2,})[^\s]*?(?=[.,;:!?)\]]*(?:\s|$))/gi, '$1')
    .replace(/\s*\[(?:\d{1,3}|[*†‡§¶]{1,3})\]/g, '')
    .replace(/\s+/g, ' ').trim();
}

