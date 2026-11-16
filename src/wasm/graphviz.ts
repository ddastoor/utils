// Wrapper for graphviz.wasm (Graphviz 14.1.2 C/C++ + Expat, built by us — wasm/graphviz). Used inside
// src/workers/graphviz.worker.ts (a layout can take long or abort; the worker can be terminated).
export interface GvResult { output: string; messages: string; code: number }
const enc = new TextEncoder(), dec = new TextDecoder();
export const ENGINES = ['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork'] as const;
export function bindGraphviz(e: any) {
  const str = (s: string) => { const b = enc.encode(s); const p = e.gv_alloc(b.length + 1); const m = new Uint8Array(e.memory.buffer, p, b.length + 1); m.set(b); m[b.length] = 0; return p; };
  return {
    /** code: 0 ok, 1 syntax error, 2 layout failed, 3 render failed. */
    render(src: string, engine = 'dot', format = 'svg'): GvResult {
      const ps = str(src), pe = str(engine), pf = str(format);
      try {
        const code = e.gv_render(ps, pe, pf);
        return { code, output: dec.decode(new Uint8Array(e.memory.buffer, e.gv_out(), e.gv_out_len())), messages: dec.decode(new Uint8Array(e.memory.buffer, e.gv_err(), e.gv_err_len())).trim() };
      } finally { e.gv_free(ps); e.gv_free(pe); e.gv_free(pf); }
    },
  };
}
