// Wrapper for svgo.wasm (Rust, built by us: OXVG — see wasm/svgo). Loaded on first use, dropped when the tab is left.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/svgo.wasm?url';
import { onLeave } from '../lifecycle';

const enc = new TextEncoder(), dec = new TextDecoder();
export function bindSvgo(e: any) {
  return {
    /** safe = only changes that cannot alter the picture; pretty = indented output */
    optimise(svg: string, o: { safe?: boolean; pretty?: boolean } = {}): string {
      const b = enc.encode(svg), p = e.sv_alloc(b.length);
      new Uint8Array(e.memory.buffer, p, b.length).set(b);
      try {
        const r = e.sv_run(p, b.length, (o.safe ? 1 : 0) | (o.pretty ? 2 : 0));
        const out = dec.decode(new Uint8Array(e.memory.buffer, e.sv_out_ptr(), e.sv_out_len()));
        if (r !== 0) throw new Error(out);
        return out;
      } finally { try { e.sv_free(p, b.length); } catch { /* the instance trapped: it is replaced by svgo() */ } }
    },
    /** Two RGBA rasters of the same size → how different they look: mean (0–255) and the share of clearly changed
     *  pixels; edge anti-aliasing and sub-pixel shifts count as nothing (3 × 3 neighbourhood match, both ways). */
    diff(a: Uint8ClampedArray | Uint8Array, b: Uint8ClampedArray | Uint8Array, w: number, h: number): { mean: number; big: number } {
      const n = w * h * 4; if (a.length < n || b.length < n) throw new Error('raster size');
      const pa = e.sv_alloc(n), pb = e.sv_alloc(n);
      try { new Uint8Array(e.memory.buffer, pa, n).set(a.subarray(0, n)); new Uint8Array(e.memory.buffer, pb, n).set(b.subarray(0, n)); return { mean: e.sv_diff(pa, pb, w, h), big: e.sv_diff_big() }; }
      finally { e.sv_free(pa, n); e.sv_free(pb, n); }
    },
  };
}
export type Svgo = ReturnType<typeof bindSvgo>;
let inst: Promise<Svgo> | null = null;
export const svgo = () => { if (!inst) { inst = instantiateWasi(wasmUrl).then((x) => bindSvgo(x.exports)); onLeave('svgo', () => (inst = null)); } return inst; };
/** After a WebAssembly trap (stack overflow, out of memory) the instance cannot be trusted: the next svgo() makes a new one. */
export const resetSvgo = () => { inst = null; };
