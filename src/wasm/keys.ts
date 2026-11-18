// Wrapper for keys.wasm (Rust, built by us — wasm/keys): HMAC, TOTP/HOTP, password hashes, OpenSSH keys, API keys.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/keys.wasm?url';
import { onLeave } from '../lifecycle';

const enc = new TextEncoder(), dec = new TextDecoder();
export const toB64 = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
export function bindKeys(e: any) {
  return {
    call<T = any>(op: string, arg: unknown): T {
      const o = enc.encode(op), i = enc.encode(JSON.stringify(arg)), po = e.k_alloc(o.length), pi = e.k_alloc(i.length);
      new Uint8Array(e.memory.buffer, po, o.length).set(o); new Uint8Array(e.memory.buffer, pi, i.length).set(i);
      try {
        const r = e.k_call(po, o.length, pi, i.length), out = JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.k_out_ptr(), e.k_out_len())));
        if (r !== 0) throw new Error(out.error);
        return out;
      } finally { e.k_free(po, o.length); e.k_free(pi, i.length); }
    },
  };
}
export type Keys = ReturnType<typeof bindKeys>;
let inst: Promise<Keys> | null = null;
export const keys = () => { if (!inst) { inst = instantiateWasi(wasmUrl).then((x) => bindKeys(x.exports)); onLeave('keys', () => (inst = null)); } return inst; };
