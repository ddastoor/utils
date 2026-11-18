// One-time codes (RFC 4226 HOTP / RFC 6238 TOTP) for the TOTP tab. The HMAC is hash-wasm's (an existing WebAssembly
// module, STANDING RULE #1 step 1); what that library has no part for comes from our own module (keys.wasm): reading
// the Base32 secret the way authenticator apps do, the counters of a moment, and the code out of an HMAC value.
import { createHMAC, createSHA1, createSHA256, createSHA512 } from 'hash-wasm';
import type { Keys } from '../wasm/keys';

const SHA = { sha1: createSHA1, sha256: createSHA256, sha512: createSHA512 } as const;
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const unhex = (s: string) => Uint8Array.from(s.match(/../g) || [], (b) => parseInt(b, 16));
export interface Otp { code: string; counter: number; prev?: string; next?: string; remaining?: number; keyBytes?: number }

/**
 * `{ secret, alg?, digits?, period?, t? }` → the code of the moment `t` (seconds), the ones before and after it and
 * the seconds left; with `counter` → the counter-based (HOTP) code. The key is not kept after the call.
 */
export async function totp(k: Keys, o: { secret: string; alg?: string; digits?: number; period?: number; t?: number; counter?: number }): Promise<Otp> {
  const plan = k.call('totp_plan', o), alg = (o.alg || 'sha1') as keyof typeof SHA;
  if (!SHA[alg]) throw new Error(`unknown algorithm "${o.alg}"`);
  const h = await createHMAC(SHA[alg](), unb64(plan.key));
  const macs = (plan.msgs as string[]).map((m) => { h.init(); h.update(unhex(m)); return h.digest('hex'); });
  const codes: string[] = k.call('hotp_codes', { macs, digits: plan.digits }).codes;
  return plan.hotp ? { code: codes[0], counter: plan.counter } : { code: codes[0], prev: codes[1], next: codes[2], counter: plan.counter, remaining: plan.remaining, keyBytes: plan.keyBytes };
}
