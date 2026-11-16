// Wrapper for devcore.wasm (Rust, built by us — see wasm/devcore): one call, `op` + input bytes → output bytes.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/devcore.wasm?url';
import { onLeave } from '../lifecycle';

const enc = new TextEncoder(), dec = new TextDecoder();
export function bindDevcore(e: any) {
  const raw = (op: string, input: Uint8Array): Uint8Array => {
    const o = enc.encode(op), po = e.dc_alloc(o.length), pi = e.dc_alloc(input.length);
    new Uint8Array(e.memory.buffer, po, o.length).set(o); new Uint8Array(e.memory.buffer, pi, input.length).set(input);
    try {
      const r = e.dc_call(po, o.length, pi, input.length);
      const out = new Uint8Array(e.memory.buffer, e.dc_out_ptr(), e.dc_out_len()).slice();
      if (r !== 0) throw new Error(dec.decode(out));
      return out;
    } finally { e.dc_free(po, o.length); e.dc_free(pi, input.length); }
  };
  return {
    raw,
    /** JSON in, JSON out */
    json: <T = any>(op: string, arg: unknown): T => JSON.parse(dec.decode(raw(op, enc.encode(JSON.stringify(arg))))),
    /** JSON in, text out */
    text: (op: string, arg: unknown): string => dec.decode(raw(op, enc.encode(JSON.stringify(arg)))),
    /** bytes in, JSON out */
    bytesJson: <T = any>(op: string, b: Uint8Array): T => JSON.parse(dec.decode(raw(op, b))),
    encode: (alg: string, b: Uint8Array): string => dec.decode(raw(`enc:${alg}`, b)),
    decode: (alg: string, text: string): Uint8Array => raw(`dec:${alg}`, enc.encode(text)),
    hexdump(b: Uint8Array, offset = 0, width = 16): string {
      const h = new Uint8Array(12 + b.length), v = new DataView(h.buffer);
      v.setUint32(0, offset, true); v.setUint32(4, width, true); h.set(b, 12);
      return dec.decode(raw('hexdump', h));
    },
  };
}
export type Devcore = ReturnType<typeof bindDevcore>;
let inst: Promise<Devcore> | null = null;
/** Loaded on first use, dropped when the tab is left. */
export const devcore = () => { if (!inst) { inst = instantiateWasi(wasmUrl).then((x) => bindDevcore(x.exports)); onLeave('devcore', () => (inst = null)); } return inst; };
