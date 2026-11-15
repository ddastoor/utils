// Wrapper for textcore.wasm (own C): Myers diff over token ids.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textcore.wasm?url';

export type DiffOp = { kind: 'eq' | 'del' | 'ins'; a: number; b: number };

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
export const textcore = () => (inst ||= instantiateWasi(wasmUrl).then((x) => bindTextcore(x.exports)));
