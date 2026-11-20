// libsodium.js (the "sumo" build of libsodium-wrappers, by libsodium's author): libsodium 1.0.22 compiled to
// WebAssembly, the bytes embedded in the module — nothing is fetched. Used for Argon2id and the XChaCha20-Poly1305
// secretstream of the USODIUM1 format (Sodium Encrypt, Encrypted Share Link; bound to the shape of our crypto.wasm
// wrapper, so the format code (src/lib/usodium.ts) runs on either — docs/WASM-AUDIT.md, tab 101) and for
// randombytes_uniform in the Password and Passphrase Generators (tabs 104, 105).
import { lazyEngine } from '../lifecycle';

/** What the USODIUM1 format needs of libsodium. */
export interface StreamCrypto {
  version: string;
  random(n: number): Uint8Array;
  /** randombytes_uniform: an unbiased integer 0 … upper − 1 (upper ≤ 2^32). */
  uniform(upper: number): number;
  /** Argon2id v1.3: a key of `outLen` bytes. */
  pwhash(password: Uint8Array, salt: Uint8Array, ops: number, memKiB: number, outLen?: number): Uint8Array;
  pushStream(key: Uint8Array): { header: Uint8Array; push(m: Uint8Array, final: boolean): Uint8Array; dispose(): void };
  pullStream(key: Uint8Array, header: Uint8Array): { pull(c: Uint8Array): { m: Uint8Array; final: boolean } | null; dispose(): void };
}

/** Binds a ready libsodium.js module (browser and Node tests). */
export function bindLibsodium(s: any): StreamCrypto {
  const TAG_FINAL = s.crypto_secretstream_xchacha20poly1305_TAG_FINAL, TAG_MESSAGE = s.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
  return {
    version: s.sodium_version_string(),
    random: (n) => s.randombytes_buf(n),
    uniform: (upper) => s.randombytes_uniform(upper) >>> 0,
    pwhash: (pw, salt, ops, memKiB, outLen = 32) => s.crypto_pwhash(outLen, pw, salt, ops, memKiB * 1024, s.crypto_pwhash_ALG_ARGON2ID13),
    pushStream(key) {
      const { state, header } = s.crypto_secretstream_xchacha20poly1305_init_push(key);
      return { header, push: (m, final) => s.crypto_secretstream_xchacha20poly1305_push(state, m, null, final ? TAG_FINAL : TAG_MESSAGE), dispose() {} };
    },
    pullStream(key, header) {
      let state: unknown;
      try { state = s.crypto_secretstream_xchacha20poly1305_init_pull(header, key); } catch { throw new Error('Invalid header'); }
      return {
        pull(c) {
          let r: any;
          try { r = s.crypto_secretstream_xchacha20poly1305_pull(state, c, null); } catch { return null; } // a chunk that does not authenticate
          return r ? { m: r.message, final: r.tag === TAG_FINAL } : null;
        },
        dispose() {},
      };
    },
  };
}

/** The engine, fetched on first use (by the crypto worker; and by the password tabs, which show passwords at open). */
export const libsodium = lazyEngine('libsodium', async () => {
  const m: any = await import('libsodium-wrappers-sumo');
  const s = m.default ?? m;
  await s.ready;
  return bindLibsodium(s);
});
