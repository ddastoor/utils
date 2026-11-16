// Wrapper for jq.wasm (jq 1.8.2 C source + oniguruma, built by us — wasm/jq). One call runs a program over the input
// like the jq command line. Loaded on first use, dropped when the tab is left.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/jq.wasm?url';
import { onLeave } from '../lifecycle';

export interface JqOpts { raw?: boolean; compact?: boolean; slurp?: boolean; nullInput?: boolean; sortKeys?: boolean; tab?: boolean; join?: boolean; ascii?: boolean; rawInput?: boolean; exitStatus?: boolean; args?: Record<string, unknown> }
export interface JqResult { output: string; error: string; code: number }
const enc = new TextEncoder(), dec = new TextDecoder();
export function bindJq(e: any) {
  const put = (b: Uint8Array, nul: boolean) => { const p = e.jq_alloc(b.length + (nul ? 1 : 0)); const m = new Uint8Array(e.memory.buffer, p, b.length + (nul ? 1 : 0)); m.set(b); if (nul) m[b.length] = 0; return p; };
  return {
    run(filter: string, input: string, o: JqOpts = {}): JqResult {
      const flags = (o.raw || o.join ? 1 : 0) | (o.compact ? 2 : 0) | (o.slurp ? 4 : 0) | (o.nullInput ? 8 : 0) | (o.sortKeys ? 16 : 0) | (o.tab ? 32 : 0) | (o.join ? 64 : 0) | (o.ascii ? 128 : 0) | (o.rawInput ? 256 : 0) | (o.exitStatus ? 512 : 0);
      const ib = enc.encode(input), pf = put(enc.encode(filter), true), pi = put(ib, false), pa = put(enc.encode(JSON.stringify(o.args || {})), true);
      try {
        const code = e.jq_run(pf, pi, ib.length, flags, pa);
        const output = dec.decode(new Uint8Array(e.memory.buffer, e.jq_out(), e.jq_out_len()));
        const error = dec.decode(new Uint8Array(e.memory.buffer, e.jq_err(), e.jq_err_len())).trim();
        return { output, error, code };
      } finally { e.jq_dealloc(pf); e.jq_dealloc(pi); e.jq_dealloc(pa); }
    },
  };
}
let inst: Promise<ReturnType<typeof bindJq>> | null = null;
export const jq = () => { if (!inst) { inst = instantiateWasi(wasmUrl).then((x) => bindJq(x.exports)); onLeave('jq', () => (inst = null)); } return inst; };
