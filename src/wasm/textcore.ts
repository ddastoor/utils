// Wrapper for textcore.wasm (own C): the tool search, rare-word ranking (Photo Dictionary) and reading order (XY-cut).
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textcore.wasm?url';
import { lazyEngine } from '../lifecycle';

/** w: word as written (lower case), b: base form when w is unknown, z: Zipf×10 (−1 unknown), n: count, c: 1 = looks like a name */
export type RareWord = { w: string; b: string; z: number; n: number; c: 0 | 1 };

export function bindTextcore(e: any) {
  const enc = new TextEncoder();
  const putStr = (str: string) => { const b = enc.encode(str); const p = e.t_malloc(b.length + 1); new Uint8Array(e.memory.buffer, p, b.length).set(b); return [p, b.length] as const; };
  return {
    /** Build a search index from records [id, title, keywords[], description] (already normalised, ASCII). */
    searchBuild(recs: Array<[string, string, string[], string]>): number {
      const clean = (x: string) => x.replace(/[\t\n|]/g, ' ');
      const [p, n] = putStr(recs.map(([id, t, k, d]) => [clean(id), clean(t), k.map(clean).join('|'), clean(d)].join('\t')).join('\n'));
      try { return e.t_search_build(p, n); } finally { e.t_free(p); }
    },
    /** Ranked record numbers for a normalised query. */
    searchQuery(index: number, q: string, max = 64): number[] {
      const [p, n] = putStr(q), o = e.t_malloc(max * 4);
      try { const k = e.t_search_query(index, p, n, o, max); return Array.from(new Int32Array(e.memory.buffer, o, k)); } finally { e.t_free(p); e.t_free(o); }
    },
    searchFree: (index: number) => e.t_search_free(index),
    /** Load the English frequency table (public/data/dict/freq.txt). Returns the number of words. */
    freqLoad(text: string): number { const [p, n] = putStr(text); try { return e.t_freq_load(p, n); } finally { e.t_free(p); } },
    /** Zipf × 10 of a lower-case word (−1 = not in the table). */
    freqGet(word: string): number { const [p, n] = putStr(word); try { return e.t_freq_get(p, n); } finally { e.t_free(p); } },
    /** Candidate hard words in OCR text, rarest first (see wasm/textcore/rare.c). maxZ = Zipf × 10 cut-off. */
    rare(text: string, maxZ = 45): RareWord[] {
      const [p, n] = putStr(text);
      let cap = n * 6 + 1024, o = e.t_malloc(cap);
      try {
        let k = e.t_rare(p, n, maxZ, o, cap);
        if (k >= cap) { e.t_free(o); cap = k + 1; o = e.t_malloc(cap); k = e.t_rare(p, n, maxZ, o, cap); }
        return JSON.parse(new TextDecoder().decode(new Uint8Array(e.memory.buffer, o, k)));
      } finally { e.t_free(p); e.t_free(o); }
    },
    /** XY-cut reading order of boxes [x0, y0, x1, y1] (y down). Returns { order, col } (col 0 = full width). */
    xycut(boxes: number[][], gx = 8, gy = 3): { order: number[]; col: number[] } {
      const n = boxes.length; if (!n) return { order: [], col: [] };
      const bp = e.t_malloc(n * 16), op = e.t_malloc(n * 4), cp = e.t_malloc(n * 4);
      try {
        new Float32Array(e.memory.buffer, bp, n * 4).set(boxes.flat());
        const k = e.t_xycut(bp, n, gx, gy, op, cp);
        return { order: Array.from(new Int32Array(e.memory.buffer, op, k)), col: Array.from(new Int32Array(e.memory.buffer, cp, k)) };
      } finally { e.t_free(bp); e.t_free(op); e.t_free(cp); }
    },
  };
}
/** A separate instance (the search box keeps its own, so tools can release theirs). */
export const newTextcore = () => instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports));
export const textcore = lazyEngine('textcore', () => instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports)));
