// Wrapper for textcore.wasm (own C): the tool search, rare-word ranking (Photo Dictionary) and reading order (XY-cut).
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textcore.wasm?url';
import { lazyEngine } from '../lifecycle';

/** w: word as written (lower case), b: base form when w is unknown, z: Zipf×10 (−1 unknown), n: count, c: 1 = looks like a name */
export type RareWord = { w: string; b: string; z: number; n: number; c: 0 | 1 };

/** a picture found: p its number, m of n tokens matched, s the score, w the indices of the words that matched */
export interface FindHit { p: number; m: number; n: number; s: number; w: number[] }
/** A word or a query as the Finder compares them: lower case, accents off, the signs at its ends left out. */
export const findNorm = (s: string) => s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
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
    /** The Screenshot Finder's index (wasm/textcore/find.c): a new one, a picture's words (normalised: lower case, accents
     *  off — `findNorm`), a query → the pictures that match, best first, with the indices of the words that matched. */
    findNew: (): number => e.t_find_new(),
    findAdd(h: number, pic: number, words: string[]) { const [p, n] = putStr(words.join('\n')); try { e.t_find_add(h, pic, p, n); } finally { e.t_free(p); } },
    findQuery(h: number, q: string): FindHit[] {
      const [p, n] = putStr(q);
      let cap = 1 << 16, o = e.t_malloc(cap);
      try {
        let k = e.t_find_query(h, p, n, o, cap);
        if (k >= cap) { e.t_free(o); cap = k + 1; o = e.t_malloc(cap); k = e.t_find_query(h, p, n, o, cap); }
        return JSON.parse(new TextDecoder().decode(new Uint8Array(e.memory.buffer, o, k)));
      } finally { e.t_free(p); e.t_free(o); }
    },
    findFree: (h: number) => e.t_find_free(h),
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
    /** The OCR text with the words broken over two lines put together (see t_dehyphen in wasm/textcore/rare.c): joined
     *  ("extra-" + "ordinary" → "extraordinary"), kept as a compound ("well-known"), or a dash left as it was. Uses the
     *  frequency table: load it first (without it only soft hyphens are joined). */
    dehyphen(text: string): string {
      const [p, n] = putStr(text), o = e.t_malloc(n + 1);
      try { const k = e.t_dehyphen(p, n, o, n + 1); return new TextDecoder().decode(new Uint8Array(e.memory.buffer, o, k)); } finally { e.t_free(p); e.t_free(o); }
    },
    /** XY-cut reading order of boxes [x0, y0, x1, y1] (y down): vertical gutters of at least `gx`, horizontal gaps of at
     *  least `gy`; a part of a split counts as a column when it holds three boxes and is `minh` high (0: every part).
     *  `heavy[i]` marks a figure or a table: a side of a split that holds one is a part of its own (see xycut.c).
     *  `hd` > 0: a head set above the start of the other columns (an epigraph) is read before the columns (see xycut.c).
     *  Returns { order, col, part } per position in reading order (col 0 = outside the columns, part 0 = outside the
     *  parts: the page's full-width flow). */
    xycut(boxes: number[][], gx = 8, gy = 3, minh = 0, heavy?: boolean[], hd = 0): { order: number[]; col: number[]; part: number[] } {
      const n = boxes.length; if (!n) return { order: [], col: [], part: [] };
      const bp = e.t_malloc(n * 16), hp = e.t_malloc(n * 4), op = e.t_malloc(n * 4), cp = e.t_malloc(n * 4), pp = e.t_malloc(n * 4);
      try {
        new Float32Array(e.memory.buffer, bp, n * 4).set(boxes.flat());
        new Int32Array(e.memory.buffer, hp, n).set(Array.from({ length: n }, (_, i) => (heavy?.[i] ? 1 : 0)));
        const k = e.t_xycut(bp, hp, n, gx, gy, minh, hd, op, cp, pp);
        const at = (p: number) => Array.from(new Int32Array(e.memory.buffer, p, k));
        return { order: at(op), col: at(cp), part: at(pp) };
      } finally { e.t_free(bp); e.t_free(hp); e.t_free(op); e.t_free(cp); e.t_free(pp); }
    },
    /** The tables of a page (table.c — PDF Tables → Excel): words [x0, y0, x1, y1] (points, y down) with `num[i]` when the word
     *  is a number, an amount or a date, and the page's ruled lines as segments [x0, y0, x1, y1]. Returns the tables — `kind`
     *  1 stream (columns where no word stands), 2 ruled (the grid of the rules); their box, column edges (columns + 1), row
     *  edges (rows + 1) and header rows at the top — and each word's [table (−1: none), row, column]. `force`: the words given
     *  are one table (the reader drew its box). */
    tables(words: number[][], num: boolean[], rules: number[][], force = false): { tables: TableFound[]; word: Int32Array } {
      const n = words.length, m = rules.length, maxT = 64, cap = 8 * n + 64 * 8 + 256;
      const wp = e.t_malloc(n * 16 + 4), fp = e.t_malloc(n * 4 + 4), rp = e.t_malloc(m * 16 + 4), op = e.t_malloc(n * 12 + 4), tp = e.t_malloc(maxT * 32), ep = e.t_malloc(cap * 4);
      try {
        new Float32Array(e.memory.buffer, wp, n * 4).set(words.flat());
        new Int32Array(e.memory.buffer, fp, n).set(num.map((x) => (x ? 1 : 0)));
        new Float32Array(e.memory.buffer, rp, m * 4).set(rules.flat());
        const k = e.t_tables(wp, fp, n, rp, m, force ? 1 : 0, op, tp, maxT, ep, cap);
        if (k < 0) throw new Error('The page has too many tables to read.');
        const tab = new Float32Array(e.memory.buffer, tp, maxT * 8), edges = new Float32Array(e.memory.buffer, ep, cap);
        const tables: TableFound[] = [];
        for (let t = 0, pos = 0; t < k; t++) {
          const [kind, x0, y0, x1, y1, nc, nr, nhead] = Array.from(tab.subarray(8 * t, 8 * t + 8));
          tables.push({ kind: kind === 2 ? 'ruled' : 'stream', box: [x0, y0, x1, y1], cols: Array.from(edges.subarray(pos, pos + nc + 1)), rows: Array.from(edges.subarray(pos + nc + 1, pos + nc + nr + 2)), head: nhead });
          pos += nc + nr + 2;
        }
        return { tables, word: new Int32Array(e.memory.buffer.slice(op, op + n * 12)) };
      } finally { e.t_free(wp); e.t_free(fp); e.t_free(rp); e.t_free(op); e.t_free(tp); e.t_free(ep); }
    },
  };
}
/** a table table.c found on a page: its kind, box, column and row edges (points) and its header rows */
export interface TableFound { kind: 'stream' | 'ruled'; box: [number, number, number, number]; cols: number[]; rows: number[]; head: number }
/** A separate instance (the search box keeps its own, so tools can release theirs). */
export const newTextcore = () => instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports));
export const textcore = lazyEngine('textcore', () => instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports)));
