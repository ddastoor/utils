// Wrapper for textkit-lorem.wasm (Rust, built by us — wasm/textkit with the "lorem" feature): Lorem ipsum from the
// Markov chain of the `lipsum` crate over the classic passage and Cicero's De finibus, with exact counts.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textkit-lorem.wasm?url';
import { lazyEngine } from '../lifecycle';

export type LoremUnit = 'p' | 's' | 'w';
export interface Lorem { paragraphs: string[]; sentences: number; words: number }
const UNIT: Record<LoremUnit, number> = { p: 0, s: 1, w: 2 };

export function bindLorem(e: any) {
  /** `n` paragraphs, sentences or words; `classic` = begin with the standard first sentence; the same 32-byte seed
   *  gives the same text (and a larger `n` the same text with more after it). */
  const generate = (unit: LoremUnit, n: number, classic: boolean, seed: Uint8Array): Lorem => {
    if (seed.length !== 32) throw new Error('the seed is 32 bytes');
    const p = e.tk_alloc(32);
    try { new Uint8Array(e.memory.buffer, p, 32).set(seed); e.tk_lorem(UNIT[unit], n, classic ? 1 : 0, p); } finally { e.tk_free(p, 32); }
    return JSON.parse(new TextDecoder().decode(new Uint8Array(e.memory.buffer, e.tk_out_ptr(), e.tk_out_len())));
  };
  return { generate };
}
export type LoremEngine = ReturnType<typeof bindLorem>;
export const loremEngine = lazyEngine('lorem', () => instantiateWasi(wasmUrl).then((x) => bindLorem(x.exports)));
