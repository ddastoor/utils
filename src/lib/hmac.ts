// HMAC for the HMAC Generator tab. Engine: hash-wasm 4.13 (MIT) — an existing, widely used WebAssembly module
// (STANDING RULE #1, step 1): hand-tuned C compiled to wasm, one small binary per hash, embedded in the package
// (nothing is fetched at run time, no eval), streaming, with HMAC built on top of any of its hashes. It replaced
// our own Rust glue in keys.wasm (k_mac_*) in Nov 2026; the tab's suites (tests/unit/hmac.test.mjs against the
// RFC vectors and Node's crypto, tests/e2e/hmac.e2e.mjs) pass unchanged in what they ask for.
// Only the hashes named here are bundled (named imports; the package is side-effect free).
import { createHMAC, createMD5, createSHA1, createSHA224, createSHA256, createSHA384, createSHA512, createSHA3 } from 'hash-wasm';

type Hasher = Awaited<ReturnType<typeof createSHA256>>;
const HASH: Record<string, () => Promise<Hasher>> = {
  md5: createMD5, sha1: createSHA1, sha224: createSHA224, sha256: createSHA256, sha384: createSHA384, sha512: createSHA512,
  'sha3-256': () => createSHA3(256), 'sha3-512': () => createSHA3(512),
};
export const HMAC_ALGS = Object.keys(HASH);

export interface MacResult { hex: string; base64: string; base64url: string; bytes: number }
export interface Mac { update(b: Uint8Array): void; end(): MacResult }

/** A streaming HMAC: `const m = await mac('sha256', key); m.update(part)…; m.end()`. Every call has its own state. */
export async function mac(alg: string, key: Uint8Array): Promise<Mac> {
  const make = HASH[alg];
  if (!make) throw new Error(`unknown algorithm "${alg}"`);
  const h = await createHMAC(make(), key);
  h.init();
  let open = true;
  return {
    update(b) { if (!open) throw new Error('no HMAC in progress'); if (b.length) h.update(b); },
    end() {
      if (!open) throw new Error('no HMAC in progress');
      open = false;
      const d = h.digest('binary');
      let s = ''; for (const x of d) s += String.fromCharCode(x);
      const base64 = btoa(s);
      return { hex: [...d].map((x) => x.toString(16).padStart(2, '0')).join(''), base64, base64url: base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), bytes: d.length };
    },
  };
}
