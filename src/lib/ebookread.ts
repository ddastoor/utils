// The EPUB Reader's ▷ (to-do #40; owner, 27 Nov 2026: "in the little play icon for text to speech for that particular page number, only
// that particular page should be read, and the site should not jump to the text to speech app at all"): the page shown — both pages of a
// spread — read in the reader, sentence by sentence, the sentence being heard marked on the page. A page's text (MuPDF's, a line a line,
// its blocks apart by a blank line) → paragraphs → sentences (the Camera Reader's `sentencesOf`), each with what the voice says (the
// Audiobook's `speechText`) and its pause; the last sentence of the pages, cut off by the page's end, is read to its end from the next
// page. No DOM: the unit suite runs it.
import { sentencesOf } from './readertext';
import { speechText } from './speechtext';

export interface ReadPiece {
  /** what the voice says */ say: string;
  /** seconds of silence after it */ pause: number;
  /** the page it stands on */ page: number;
  /** its words as they stand on the page (MuPDF finds and marks them); '' for the part read from the next page */ mark: string;
}
export const READ_PAUSE = { sentence: 0.3, para: 0.8 } as const;

const hasWord = (s: string) => /[\p{L}\p{N}]/u.test(s);
/** A page's text → its paragraphs: the lines of a block joined (a soft hyphen at a line's end joins the halves of its word). */
export function paragraphsOf(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/­[ \t]*\n[ \t]*/g, '').replace(/[ \t]*\n[ \t]*/g, ' ').replace(/[ \t ]+/g, ' ').trim())
    .filter(hasWord);
}
/** a sentence that ends (its closing quotes or brackets after it) */
const ENDS = /[.!?…]["”’')\]]*$/u;
/** a sentence cut off by the page's end: no closing mark, and not a heading (a few words of their own, set apart) */
const cutOff = (s: string) => !ENDS.test(s) && (/[,;:\-–—(]$/u.test(s) || s.split(/\s+/).length >= 6);

/**
 * The pieces of the pages shown (in order: a spread's left page, then its right), and of the next page the end of a sentence the
 * last page cuts off (its first sentence, when the next page begins inside it: with a small letter, a digit or a mark — or the cut-off
 * sentence plainly goes on: it ends with a comma, a dash or an opening bracket).
 */
export function pagePieces(pages: Array<{ page: number; text: string }>, next = ''): ReadPiece[] {
  const out: ReadPiece[] = [];
  for (const { page, text } of pages) {
    for (const para of paragraphsOf(text)) {
      const ss = sentencesOf(para).filter(hasWord);
      ss.forEach((s, k) => {
        const say = speechText(s);
        if (hasWord(say)) out.push({ say, pause: k === ss.length - 1 ? READ_PAUSE.para : READ_PAUSE.sentence, page, mark: s });
      });
    }
  }
  const last = out[out.length - 1];
  if (last && next && cutOff(last.mark)) {
    const first = paragraphsOf(next)[0] ?? '';
    const goesOn = /^[\p{Ll}\p{N},;:)\]’”—–-]/u.test(first) || /[,;:\-–—(]$/u.test(last.mark);
    const tail = goesOn ? sentencesOf(first)[0] ?? '' : '';
    if (tail && hasWord(tail)) {
      last.say = speechText(`${last.mark} ${tail}`);
      // the words on this page are still the ones marked; the rest stands on the next page
    }
  }
  return out;
}

/** "Reading page 12 aloud" / "Reading pages 12–13 aloud" / "Reading the selection aloud" */
export function readingWhat(pages: number[], selection = false): string {
  if (selection) return 'Reading the selection aloud';
  return pages.length > 1 ? `Reading pages ${pages[0] + 1}–${pages[pages.length - 1] + 1} aloud` : `Reading page ${pages[0] + 1} aloud`;
}
