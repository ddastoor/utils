// Wrapper for textcore.wasm (own C): Myers diff over token ids.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textcore.wasm?url';
import { onLeave } from '../lifecycle';

export type DiffOp = { kind: 'eq' | 'del' | 'ins'; a: number; b: number };
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
    /** Top-k [token, count] by frequency (count desc, then first appearance). Tokens should be segmented and
     *  lower-cased by the caller. Options: drop English stop words / pure numbers / words shorter than minLen. */
    wordFreq(tokens: string[], k = 10, o: { stop?: boolean; numbers?: boolean; minLen?: number } = {}): Array<[string, number]> {
      if (!tokens.length) return [];
      const [p, n] = putStr(tokens.map((x) => x.replace(/\n/g, ' ')).join('\n')), out = e.t_malloc(k * 8);
      const flags = (o.stop ? 1 : 0) | (o.numbers ? 2 : 0) | ((Math.min(255, o.minLen || 0)) << 8);
      try {
        const r = e.t_wordfreq(p, n, flags, out, k), v = new Int32Array(e.memory.buffer, out, r * 2);
        return Array.from({ length: r }, (_, i) => [tokens[v[i * 2]], v[i * 2 + 1]] as [string, number]);
      } finally { e.t_free(p); e.t_free(out); }
    },
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
    /** Diff two token sequences (strings compared exactly). */
    diff(A: string[], B: string[], maxD = 0): DiffOp[] | null {
      const ids = new Map<string, number>();
      const id = (s: string) => { let v = ids.get(s); if (v === undefined) { v = ids.size; ids.set(s, v); } return v; };
      const a = Int32Array.from(A, id), b = Int32Array.from(B, id);
      const pa = e.t_malloc(a.length * 4), pb = e.t_malloc(b.length * 4), po = e.t_malloc((a.length + b.length + 1) * 12);
      try {
        new Int32Array(e.memory.buffer, pa, a.length).set(a);
        new Int32Array(e.memory.buffer, pb, b.length).set(b);
        const n = e.t_diff(pa, a.length, pb, b.length, po, maxD);
        if (n < 0) return null;
        const o = new Int32Array(e.memory.buffer, po, n * 3);
        const K = ['eq', 'del', 'ins'] as const;
        return Array.from({ length: n }, (_, i) => ({ kind: K[o[i * 3]], a: o[i * 3 + 1], b: o[i * 3 + 2] }));
      } finally { e.t_free(pa); e.t_free(pb); e.t_free(po); }
    },
  };
}
let inst: Promise<ReturnType<typeof bindTextcore>> | null = null;
/** A separate instance (the search box keeps its own, so tools can release theirs). */
export const newTextcore = () => instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports));
export const textcore = () => { if (!inst) { inst = instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports)); onLeave('textcore', () => (inst = null)); } return inst; };
