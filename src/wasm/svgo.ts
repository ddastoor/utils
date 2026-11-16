// Wrapper for svgo.wasm (Rust, built by us: OXVG — see wasm/svgo). Loaded on first use, dropped when the tab is left.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/svgo.wasm?url';
import { onLeave } from '../lifecycle';

const enc = new TextEncoder(), dec = new TextDecoder();
export function bindSvgo(e: any) {
  return {
    /** safe = correctness-first preset; pretty = indented output */
    optimise(svg: string, o: { safe?: boolean; pretty?: boolean } = {}): string {
      const b = enc.encode(svg), p = e.sv_alloc(b.length);
      new Uint8Array(e.memory.buffer, p, b.length).set(b);
      try {
        const r = e.sv_run(p, b.length, (o.safe ? 1 : 0) | (o.pretty ? 2 : 0));
        const out = dec.decode(new Uint8Array(e.memory.buffer, e.sv_out_ptr(), e.sv_out_len()));
        if (r !== 0) throw new Error(out);
        return out;
      } finally { e.sv_free(p, b.length); }
    },
  };
}
let inst: Promise<ReturnType<typeof bindSvgo>> | null = null;
export const svgo = () => { if (!inst) { inst = instantiateWasi(wasmUrl).then((x) => bindSvgo(x.exports)); onLeave('svgo', () => (inst = null)); } return inst; };
