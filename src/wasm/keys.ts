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
    /** Streaming HMAC over raw bytes (files are fed in chunks; nothing is Base64-encoded or copied whole). */
    mac(alg: string, key: Uint8Array) {
      const put = (b: Uint8Array) => { const p = e.k_alloc(b.length); new Uint8Array(e.memory.buffer, p, b.length).set(b); return p; };
      const out = () => JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.k_out_ptr(), e.k_out_len())));
      const a = enc.encode(alg), pa = put(a), pk = put(key);
      try { if (e.k_mac_begin(pa, a.length, pk, key.length) !== 0) throw new Error(out().error); } finally { e.k_free(pa, a.length); e.k_free(pk, key.length); }
      return {
        update(b: Uint8Array) { if (!b.length) return; const p = put(b); try { if (e.k_mac_update(p, b.length) !== 0) throw new Error('no HMAC in progress'); } finally { e.k_free(p, b.length); } },
        end(): { hex: string; base64: string; base64url: string; bytes: number } { const r = e.k_mac_end(), o = out(); if (r !== 0) throw new Error(o.error); return o; },
      };
    },
  };
}
export type Keys = ReturnType<typeof bindKeys>;
let inst: Promise<Keys> | null = null;
export const keys = () => { if (!inst) { inst = instantiateWasi(wasmUrl).then((x) => bindKeys(x.exports)); onLeave('keys', () => (inst = null)); } return inst; };
