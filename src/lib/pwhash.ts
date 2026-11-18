// Password hashes for the Password Hash Tool. Engine: hash-wasm 4.13 (MIT) — an existing, widely used WebAssembly
// module (STANDING RULE #1, step 1) — computes Argon2 (id / i / d), bcrypt, scrypt and PBKDF2. What it has no part
// for is supplied by our own module (keys.wasm, step 1a of the rule): checked parameters with worded refusals,
// random salts, PHC strings for scrypt and PBKDF2 (hash-wasm returns their bare digests), reading a pasted hash, and
// Argon2 hashes hash-wasm does not read (version 1.0, keyid / data). Only byte plumbing happens here.
import { argon2d, argon2i, argon2id, argon2Verify, bcrypt, bcryptVerify, pbkdf2, scrypt, createSHA1, createSHA256, createSHA512 } from 'hash-wasm';
import type { Keys } from '../wasm/keys';

const enc = new TextEncoder();
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const SHA = { sha1: createSHA1, sha256: createSHA256, sha512: createSHA512 } as const;
const ARGON = { argon2id, argon2i, argon2d } as const;
const same = (a: Uint8Array, b: Uint8Array) => { let d = a.length ^ b.length; for (let i = 0; i < a.length && i < b.length; i++) d |= a[i] ^ b[i]; return d === 0; };

/** `{ alg, password, …parameters }` → the hash as a PHC string (bcrypt: `$2b$…`). A fresh random salt every time. */
export async function hashPassword(k: Keys, o: { alg: string; password: string; [param: string]: unknown }): Promise<string> {
  const { password: text, ...params } = o, password = enc.encode(text);
  const plan = k.call('hash_plan', { ...params, password_len: password.length }), salt = unb64(plan.salt);
  if (plan.kind === 'argon2') return ARGON[plan.variant as keyof typeof ARGON]({ password, salt, memorySize: plan.m, iterations: plan.t, parallelism: plan.p, hashLength: plan.len, outputType: 'encoded' });
  // hash-wasm labels its bcrypt hashes "$2a$"; for passwords of at most 72 bytes (longer ones are refused above)
  // that is the same hash as "$2b$", the label current libraries write
  if (plan.kind === 'bcrypt') return (await bcrypt({ password, salt, costFactor: plan.cost, outputType: 'encoded' })).replace(/^\$2a\$/, '$2b$');
  const raw = plan.kind === 'pbkdf2'
    ? await pbkdf2({ password, salt, iterations: plan.iterations, hashLength: plan.len, hashFunction: SHA[plan.hash as keyof typeof SHA](), outputType: 'binary' })
    : await scrypt({ password, salt, costFactor: plan.n, blockSize: plan.r, parallelism: plan.p, hashLength: plan.len, outputType: 'binary' });
  return k.call('hash_format', { plan, raw: b64(raw) }).hash;
}

/** Does `password` give `hash`? "No" (`ok: false`) and "this hash cannot be checked" (an Error) are different answers. */
export async function verifyPassword(k: Keys, text: string, hash: string): Promise<{ ok: boolean; scheme: string }> {
  const plan = k.call('verify_plan', { hash }), password = enc.encode(text);
  const cannot = (e: any): never => { throw new Error(`This hash cannot be checked: ${String(e?.message || e).replace(/\.$/, '')}`); };
  let ok: boolean;
  if (plan.engine === 'own' || (plan.engine === 'argon2' && !password.length)) return k.call('verify_own', { password: text, hash: plan.hash });   // hash-wasm takes no empty password
  if (plan.engine === 'bcrypt') {
    if (!password.length) throw new Error('Enter the password to check');
    // bcrypt reads the first 72 bytes of a password and ignores the rest; hash-wasm refuses longer ones
    ok = await bcryptVerify({ password: password.subarray(0, 72), hash: plan.hash }).catch((e) => { throw new Error(`Not a valid bcrypt hash: ${e?.message || e}`); });
  } else if (plan.engine === 'argon2') ok = await argon2Verify({ password, hash: plan.hash }).catch(cannot);
  else {
    const salt = unb64(plan.salt), want = unb64(plan.want);
    const got = plan.engine === 'pbkdf2'
      ? await pbkdf2({ password, salt, iterations: plan.iterations, hashLength: want.length, hashFunction: SHA[plan.hashFn as keyof typeof SHA](), outputType: 'binary' }).catch(cannot)
      : await scrypt({ password, salt, costFactor: plan.n, blockSize: plan.r, parallelism: plan.p, hashLength: want.length, outputType: 'binary' }).catch(cannot);
    ok = same(got, want);
  }
  return { ok, scheme: plan.scheme };
}
