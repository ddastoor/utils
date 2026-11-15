// Wrapper for textcore.wasm (own C): Myers diff over token ids.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/textcore.wasm?url';

export type DiffOp = { kind: 'eq' | 'del' | 'ins'; a: number; b: number };

export function bindTextcore(e: any) {
  return {
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
