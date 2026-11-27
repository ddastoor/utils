// Wrapper for textkit-tokens.wasm (Rust, built by us — wasm/textkit with the "tokens" feature): two documents' tokens
// compared for PDF Compare (wasm/textkit/src/tokens.rs) — the `similar` crate's patience algorithm, then our clean-up, the
// sliding of runs that are only added or removed, and the moves.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textkit-tokens.wasm?url';
import { lazyEngine } from '../lifecycle';

/** The changes as [start in a, tokens of a, start in b, tokens of b] — a short equal run between two changes taken into
 *  them, a run that is only added or removed put where it reads best —, and the moves as [the change that removed the
 *  words, the change that put them back, 1 when the words are the same]. `approx`: the time limit ended the search (the
 *  answer is right, but may not be the shortest). */
export interface TokenDiff { same: number; removed: number; added: number; approx: boolean; changes: Array<[number, number, number, number]>; moves: Array<[number, number, 0 | 1]>; ms: number }

const enc = new TextEncoder(), dec = new TextDecoder();
export function bindTexttokens(e: any) {
  const put = (text: string) => { const b = enc.encode(text), p = e.tk_alloc(b.length); new Uint8Array(e.memory.buffer, p, b.length).set(b); return [p, b.length] as const; };
  /** Two lists of tokens (none holds a line break) compared; after `limitMs` the search settles for a longer answer. */
  function tokens(a: string[], b: string[], limitMs = 5000): TokenDiff {
    const [pa, na] = put(a.join('\n')), [pb, nb] = put(b.join('\n'));
    try { e.tk_tokens(pa, na, pb, nb, limitMs); return JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.tk_out_ptr(), e.tk_out_len()))); } finally { e.tk_free(pa, na); e.tk_free(pb, nb); }
  }
  return { tokens };
}
export type Texttokens = ReturnType<typeof bindTexttokens>;
export const texttokens = lazyEngine('texttokens', () => instantiateWasi(wasmUrl).then((x) => bindTexttokens(x.exports)));
