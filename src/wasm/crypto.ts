// Typed wrapper around public/wasm/crypto.wasm (our libsodium build + own hashes).
import { instantiateWasi, memIO, type WasiInstance } from './wasi';
import wasmUrl from './bin/crypto.wasm?url';

let inst: Promise<Sodium> | null = null;
export const sodium = () => (inst ||= load());

export const HASH_ALGS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'SHA3-256', 'SHA3-512', 'BLAKE2b-256', 'BLAKE2b-512', 'CRC-32'] as const;
export type HashAlg = (typeof HASH_ALGS)[number];

export interface Sodium {
  version: string;
  random(n: number): Uint8Array;
  uniform(upper: number): number;
  pwhash(password: Uint8Array, salt: Uint8Array, ops: number, memKiB: number, outLen?: number): Uint8Array;
  hasher(alg: HashAlg): { update(b: Uint8Array): void; final(): Uint8Array };
  pushStream(key: Uint8Array): { header: Uint8Array; push(m: Uint8Array, final: boolean): Uint8Array; dispose(): void };
  pullStream(key: Uint8Array, header: Uint8Array): { pull(c: Uint8Array): { m: Uint8Array; final: boolean } | null; dispose(): void };
  bcrypt?: never;
  raw: WasiInstance;
}

async function load(): Promise<Sodium> {
  const x = await instantiateWasi(wasmUrl);
  const e = x.exports, io = memIO(x);
  if (e.u_init() < 0) throw new Error('libsodium failed to initialise');
  const SB = e.u_ss_statebytes(), AB = e.u_ss_abytes(), TAG_FINAL = e.u_ss_tag_final();

  const withBytes = <T>(arr: Uint8Array[], fn: (...ptrs: number[]) => T): T => {
    const ptrs = arr.map((a) => io.put(a));
    try { return fn(...ptrs); } finally { ptrs.forEach((p, i) => { e.u_memzero(p, arr[i].length); io.free(p); }); }
  };

  return {
    version: io.cstr(e.u_version()),
    raw: x,
    random(n) { const p = io.alloc(n); e.u_random(p, n); const r = io.get(p, n); io.free(p); return r; },
    uniform: (upper) => e.u_uniform(upper) >>> 0,
    pwhash(pw, salt, ops, memKiB, outLen = 32) {
      const out = io.alloc(outLen);
      try {
        const rc = withBytes([pw, salt], (pp, sp) => e.u_pwhash(out, outLen, pp, pw.length, sp, ops, memKiB));
        if (rc !== 0) throw new Error('Argon2id failed — not enough memory for this strength setting on this device.');
        return io.get(out, outLen);
      } finally { e.u_memzero(out, outLen); io.free(out); }
    },
    hasher(alg) {
      const a = HASH_ALGS.indexOf(alg);
      const ctx = e.u_hash_new(a);
      const CH = 1 << 20;
      const buf = io.alloc(CH);
      return {
        update(b) {
          for (let i = 0; i < b.length; i += CH) {
            const part = b.subarray(i, i + CH);
            io.view(buf, part.length).set(part);
            e.u_hash_update(ctx, buf, part.length);
          }
        },
        final() {
          const n = e.u_hash_len(a), out = io.alloc(n);
          e.u_hash_final(ctx, out);
          const r = io.get(out, n);
          io.free(out); io.free(buf);
          return r;
        },
      };
    },
    pushStream(key) {
      const st = io.alloc(SB), hdr = io.alloc(24);
      withBytes([key], (kp) => e.u_ss_init_push(st, hdr, kp));
      const header = io.get(hdr, 24);
      io.free(hdr);
      return {
        header,
        push(m, final) {
          const mp = io.put(m), cp = io.alloc(m.length + AB);
          try {
            const n = e.u_ss_push(st, cp, mp, m.length, final ? TAG_FINAL : 0);
            if (n < 0) throw new Error('Encryption failed');
            return io.get(cp, n);
          } finally { e.u_memzero(mp, m.length); io.free(mp); io.free(cp); }
        },
        dispose() { e.u_memzero(st, SB); io.free(st); },
      };
    },
    pullStream(key, header) {
      const st = io.alloc(SB);
      const ok = withBytes([key, header], (kp, hp) => e.u_ss_init_pull(st, hp, kp));
      if (ok !== 0) throw new Error('Invalid header');
      return {
        pull(c) {
          const cp = io.put(c), mp = io.alloc(Math.max(1, c.length)), tp = io.alloc(1);
          try {
            const n = e.u_ss_pull(st, mp, tp, cp, c.length);
            if (n < 0) return null;
            return { m: io.get(mp, n), final: io.view(tp, 1)[0] === TAG_FINAL };
          } finally { e.u_memzero(mp, Math.max(1, c.length)); io.free(cp); io.free(mp); io.free(tp); }
        },
        dispose() { e.u_memzero(st, SB); io.free(st); },
      };
    },
  };
}

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export function fromHex(s: string) { const c = s.replace(/[^0-9a-f]/gi, ''); return Uint8Array.from(c.match(/../g) || [], (x) => parseInt(x, 16)); }
export function toB64(b: Uint8Array, url = false) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  const r = btoa(s);
  return url ? r.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : r;
}
export function fromB64(s: string) {
  const t = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
