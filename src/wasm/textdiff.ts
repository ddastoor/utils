// Wrapper for textkit-diff.wasm (Rust, built by us — wasm/textkit with the "diff" feature): the differences of two
// texts by the `similar` crate (Myers' algorithm with a time limit), as rows to draw — in one column, or side by side with
// the lines of a change paired (our `pair_lines`) — and as a unified diff.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textkit-diff.wasm?url';
import { lazyEngine } from '../lifecycle';

/** kind: 0 the same in both, 1 only in the original, 2 only in the changed text */
export type DiffKind = 0 | 1 | 2;
/** one line: [kind, its number in the original (0 = not there), its number in the changed text, pieces of the line as
 *  [marked, text] — marked = the part of a changed line that differs from its counterpart] */
export type DiffRow = [DiffKind, number, number, Array<[0 | 1, string]>];
export interface LineDiff { mode: 0; added: number; removed: number; same: number; approx: boolean; rows: DiffRow[]; unified: string; endA: boolean; endB: boolean; ms: number }
type Parts = Array<[0 | 1, string]>;
/** a row of the side-by-side view: an unchanged line (both numbers), a removed line alone (left), an added line alone
 *  (right), or kind 3 — a removed line on the left and an added line on the right, each with the part that differs from
 *  the other marked. Removed and added lines that correspond (the most alike, in order) share a row; the engine says
 *  which in `pair_lines` (wasm/textkit/src/diff.rs). */
export type SideRow = [0, number, number, Parts] | [1, number, 0, Parts] | [2, 0, number, Parts] | [3, number, number, Parts, Parts];
export interface SideDiff extends Omit<LineDiff, 'mode' | 'rows'> { mode: 3; rows: SideRow[] }
export interface SpanDiff { mode: 1 | 2; added: number; removed: number; same: number; approx: boolean; spans: Array<[DiffKind, string]>; ms: number }

const enc = new TextEncoder(), dec = new TextDecoder();
export function bindTextdiff(e: any) {
  const put = (text: string) => { const b = enc.encode(text), p = e.tk_alloc(b.length); new Uint8Array(e.memory.buffer, p, b.length).set(b); return [p, b.length] as const; };
  /** `limitMs`: after this time the comparing settles for a diff that is correct but not the shortest (`approx`). */
  function diff(a: string, b: string, mode: 0, limitMs?: number): LineDiff;
  function diff(a: string, b: string, mode: 3, limitMs?: number): SideDiff;
  function diff(a: string, b: string, mode: 1 | 2, limitMs?: number): SpanDiff;
  function diff(a: string, b: string, mode: 0 | 1 | 2 | 3, limitMs = 2000): LineDiff | SideDiff | SpanDiff {
    const [pa, na] = put(a), [pb, nb] = put(b);
    try { e.tk_diff(pa, na, pb, nb, mode, limitMs); return JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.tk_out_ptr(), e.tk_out_len()))); } finally { e.tk_free(pa, na); e.tk_free(pb, nb); }
  }
  return { diff };
}
export type Textdiff = ReturnType<typeof bindTextdiff>;
export const textdiff = lazyEngine('textdiff', () => instantiateWasi(wasmUrl).then((x) => bindTextdiff(x.exports)));
