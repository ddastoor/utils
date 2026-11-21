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
    /** XY-cut reading order of boxes [x0, y0, x1, y1] (y down): vertical gutters of at least `gx`, horizontal gaps of at
     *  least `gy`; a part of a split counts as a column when it holds three boxes and is `minh` high (0: every part).
     *  `heavy[i]` marks a figure or a table: a side of a split that holds one is a part of its own (see xycut.c).
     *  Returns { order, col, part } per position in reading order (col 0 = outside the columns, part 0 = outside the
     *  parts: the page's full-width flow). */
    xycut(boxes: number[][], gx = 8, gy = 3, minh = 0, heavy?: boolean[]): { order: number[]; col: number[]; part: number[] } {
      const n = boxes.length; if (!n) return { order: [], col: [], part: [] };
      const bp = e.t_malloc(n * 16), hp = e.t_malloc(n * 4), op = e.t_malloc(n * 4), cp = e.t_malloc(n * 4), pp = e.t_malloc(n * 4);
      try {
        new Float32Array(e.memory.buffer, bp, n * 4).set(boxes.flat());
        new Int32Array(e.memory.buffer, hp, n).set(Array.from({ length: n }, (_, i) => (heavy?.[i] ? 1 : 0)));
        const k = e.t_xycut(bp, hp, n, gx, gy, minh, op, cp, pp);
        const at = (p: number) => Array.from(new Int32Array(e.memory.buffer, p, k));
        return { order: at(op), col: at(cp), part: at(pp) };
      } finally { e.t_free(bp); e.t_free(hp); e.t_free(op); e.t_free(cp); e.t_free(pp); }
    },
  };
}
/** A separate instance (the search box keeps its own, so tools can release theirs). */
export const newTextcore = () => instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports));
export const textcore = lazyEngine('textcore', () => instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports)));
