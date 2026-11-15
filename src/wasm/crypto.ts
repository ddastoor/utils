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
  /** Uniformly random permutation of 0..n-1 (Fisher–Yates in C with randombytes_uniform). */
  permutation(n: number): Uint32Array;
  /** Shuffled copy of an array. */
  shuffle<T>(arr: readonly T[]): T[];
  /** count values in [0, span) — unique = no repeats. */
  sample(span: number, count: number, unique?: boolean): number[];
  /** RFC 9562 UUID string, version 4 or 7. */
  uuid(version: 4 | 7, unixMs?: number): string;
  /** USODIUM1 container header (61 bytes) — written and parsed in C. */
  sodiumHeader: { len: number; write(h: SodiumHeader): Uint8Array; parse(b: Uint8Array): SodiumHeader };
  raw: WasiInstance;
}
export interface SodiumHeader { ops: number; memKiB: number; chunk: number; salt: Uint8Array; header: Uint8Array }

async function load(): Promise<Sodium> {
  return bindSodium(await instantiateWasi(wasmUrl));
}
/** Environment-neutral binding (browser + Node unit tests). */
export function bindSodium(x: WasiInstance): Sodium {
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
    permutation(n) {
      const p = io.alloc(Math.max(1, n) * 4);
      try { e.u_shuffle_idx(p, n); return new Uint32Array(x.memory.buffer.slice(p, p + n * 4)); } finally { io.free(p); }
    },
    shuffle(arr) { return Array.from(this.permutation(arr.length), (i) => arr[i]); },
    sample(span, count, unique = false) {
      const p = io.alloc(Math.max(1, count) * 4);
      try {
        if (e.u_sample(span >>> 0, count, unique ? 1 : 0, p) !== 0) throw new Error(`Only ${span} unique numbers exist in that range`);
        return Array.from(new Uint32Array(x.memory.buffer, p, count));
      } finally { io.free(p); }
    },
    uuid(version, unixMs = Date.now()) {
      const p = io.alloc(16);
      try { e.u_uuid(version, unixMs, p); const h = toHex(io.get(p, 16)); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; } finally { io.free(p); }
    },
    sodiumHeader: {
      len: e.u_sh_len(),
      write(h) {
        const o = io.alloc(61);
        try { withBytes([h.salt, h.header], (sp, hp) => e.u_sh_write(h.ops, h.memKiB, h.chunk, sp, hp, o)); return io.get(o, 61); } finally { io.free(o); }
      },
      parse(b) {
        const prm = io.alloc(12), sa = io.alloc(16), hd = io.alloc(24);
        try {
          const rc = withBytes([b], (bp) => e.u_sh_parse(bp, b.length, prm, sa, hd));
          if (rc === -1) throw new Error('Not a Sodium Encrypt file (missing USODIUM1 header).');
          if (rc === -2) throw new Error('Unsupported key-derivation algorithm.');
          if (rc === -3) throw new Error('Header parameters are out of range — the file is damaged.');
          const v = new Uint32Array(x.memory.buffer, prm, 3);
          return { ops: v[0], memKiB: v[1], chunk: v[2], salt: io.get(sa, 16), header: io.get(hd, 24) };
        } finally { io.free(prm); io.free(sa); io.free(hd); }
      },
    },
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
