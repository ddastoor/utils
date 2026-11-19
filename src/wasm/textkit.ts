// Wrapper for textkit.wasm (Rust, built by us — wasm/textkit): counts of a text on Unicode's segmentation rules
// (UAX #29, the unicode-segmentation crate) with the Word Counter's own rules on top, and the Case Converter's
// conversions.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textkit.wasm?url';
import { lazyEngine } from '../lifecycle';

/** What the engine counts. `wordChars` = characters inside words (for the average word length); `top` = the words
 *  used at least twice, most used first (stop words, numbers and short words left out). */
export interface TextCounts { words: number; chars: number; noSpace: number; sentences: number; paragraphs: number; lines: number; wordChars: number; bytes: number; top: Array<[string, number]> }

const enc = new TextEncoder(), dec = new TextDecoder();
export function bindTextkit(e: any) {
  const call = (fn: 'tk_stats' | 'tk_case' | 'tk_line_lengths', text: string) => {
    const b = enc.encode(text), p = e.tk_alloc(b.length);
    new Uint8Array(e.memory.buffer, p, b.length).set(b);
    try { e[fn](p, b.length); return JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.tk_out_ptr(), e.tk_out_len()))); } finally { e.tk_free(p, b.length); }
  };
  return {
    stats: (text: string): TextCounts => call('tk_stats', text),
    /** The Case Converter's conversions of a text, in the order of CASE_NAMES (src/lib/caseconv.ts). */
    cases: (text: string): string[] => call('tk_case', text),
    /** The number of characters (as the Word Counter counts them) of each of `lines` (none may hold a line break). */
    lineLengths: (lines: string[]): number[] => (lines.length ? call('tk_line_lengths', lines.join('\n')) : []),
  };
}
export type Textkit = ReturnType<typeof bindTextkit>;
/** The engine, fetched on first use (a download that fails is not remembered: the next call tries again). */
export const textkit = lazyEngine('textkit', () => instantiateWasi(wasmUrl).then((x) => bindTextkit(x.exports)));
