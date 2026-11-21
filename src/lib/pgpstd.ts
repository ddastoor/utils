// The two standards the OpenPGP tab works to. Owner, 21 Nov 2026: "keep the existing functionality exactly the same and
// add another, new mode which uses the latest OpenPGP standard, which may or may not be compatible with GPG."
// - GnuPG-compatible: the tab as it always was — what GnuPG 2.4 reads: v4 keys (EdDSA + ECDH on Curve25519, the legacy
//   encodings), SEIPDv1 (CFB with a modification detection code), iterated and salted S2K.
// - Latest standard: RFC 9580 (July 2024) — v6 keys (Ed25519 + X25519, or Ed448 + X448), messages in SEIPDv2 (AEAD;
//   OCB, the mode every RFC 9580 implementation must have, preferred; AES-256), passphrases and passwords through
//   Argon2 (RFC 9580's second recommended setting: 3 passes, 4 lanes, 64 MiB — the first wants 2 GiB), v6 signatures.
//   GnuPG 2.4 reads none of it (it follows LibrePGP); Sequoia PGP, rPGP, GopenPGP and OpenPGP.js do. As RFC 9580
//   itself requires, a message to a key that does not offer SEIPDv2 (any GnuPG key) is made as SEIPDv1 — its
//   recipient could not read the newer form.
// The engine is OpenPGP.js in both (docs/WASM-AUDIT.md, tab 100); this file holds the settings and the words for the
// formats — no DOM, so the unit suite runs it.
import type * as OpenPGP from 'openpgp';

type PGP = typeof OpenPGP;
export type Standard = 'gpg' | 'rfc9580';

/** GnuPG-compatible (as it always was): v4 keys, AES-256, SHA-512, SEIPDv1, iterated S2K at its largest count. */
export const gpgConfig = (o: PGP) => ({
  v6Keys: false,
  aeadProtect: false,
  preferredSymmetricAlgorithm: o.enums.symmetric.aes256,
  preferredHashAlgorithm: o.enums.hash.sha512,
  s2kType: o.enums.s2k.iterated,
  s2kIterationCountByte: 255,
});
/** The GnuPG mode's own "RFC 9580 v6" choice under Generate → Key format (as it always was). */
export const modernConfig = (o: PGP) => ({ v6Keys: true, aeadProtect: true, s2kType: o.enums.s2k.argon2, preferredSymmetricAlgorithm: o.enums.symmetric.aes256 });
/** RFC 9580 §3.7.1.4, the second recommended setting (the first takes 2 GiB of memory — too much for a phone). */
export const ARGON2 = { passes: 3, parallelism: 4, memoryExponent: 16 } as const;
/** Latest standard: RFC 9580. */
export const rfc9580Config = (o: PGP) => ({
  v6Keys: true,
  aeadProtect: true,
  preferredSymmetricAlgorithm: o.enums.symmetric.aes256,
  preferredAEADAlgorithm: o.enums.aead.ocb,
  preferredHashAlgorithm: o.enums.hash.sha512,
  s2kType: o.enums.s2k.argon2,
  s2kArgon2Params: { ...ARGON2 },
});

// The algorithm numbers of RFC 9580 §9 (the IANA registries).
const SYM: Record<number, string> = { 1: 'IDEA', 2: 'TripleDES', 3: 'CAST5', 4: 'Blowfish', 7: 'AES-128', 8: 'AES-192', 9: 'AES-256', 10: 'Twofish', 11: 'Camellia-128', 12: 'Camellia-192', 13: 'Camellia-256' };
const AEAD: Record<number, string> = { 1: 'EAX', 2: 'OCB', 3: 'GCM' };
const PK: Record<number, string> = { 1: 'RSA', 2: 'RSA', 3: 'RSA', 16: 'ElGamal', 17: 'DSA', 18: 'ECDH', 19: 'ECDSA', 22: 'EdDSA', 25: 'X25519', 26: 'X448', 27: 'Ed25519', 28: 'Ed448' };
const HASH: Record<number, string> = { 1: 'MD5', 2: 'SHA-1', 3: 'RIPEMD-160', 8: 'SHA-256', 9: 'SHA-384', 10: 'SHA-512', 11: 'SHA-224', 12: 'SHA3-256', 14: 'SHA3-512' };
const name = (table: Record<number, string>, n: unknown) => table[n as number] ?? `algorithm ${String(n)}`;

/** How a password or passphrase is turned into a key. */
export function s2kWords(s: any): string {
  if (!s) return 'no key derivation';
  if (s.type === 'argon2') return `Argon2 (${s.t} pass${s.t === 1 ? '' : 'es'}, ${s.p} lanes, ${2 ** (s.encodedM - 10)} MiB)`;
  if (s.type === 'iterated') return 'iterated and salted S2K';
  return `${s.type} S2K`;
}

export interface MessageFormat {
  /** 2: SEIPDv2 (AEAD, RFC 9580); 1: SEIPDv1 (CFB + MDC, RFC 4880); 0: no encrypted data (a signed-only message) */
  seipd: 0 | 1 | 2;
  /** SEIPDv2 only: the cipher and the AEAD mode, from the packet's header */
  cipher?: string;
  aead?: string;
  /** the version of every public-key session key packet: 3 (RFC 4880) or 6 (RFC 9580) */
  pkesk: number[];
  /** every password session key packet: its version (4, or 6 for RFC 9580) and how the password is stretched */
  skesk: Array<{ version: number; s2k: string }>;
}

/** What an encrypted message is made of — read from its packets (the message object of OpenPGP.js; nothing decrypted). */
export function messageFormat(message: { packets: Iterable<any> }): MessageFormat {
  let seipd: 0 | 1 | 2 = 0, cipher: string | undefined, aead: string | undefined;
  const pkesk: number[] = [], skesk: MessageFormat['skesk'] = [];
  for (const p of message.packets) {
    const tag = p?.constructor?.tag;
    if (tag === 1) pkesk.push(p.version);
    else if (tag === 3) skesk.push({ version: p.version, s2k: s2kWords(p.s2k) });
    else if (tag === 18) {
      seipd = p.version === 2 ? 2 : 1;
      if (p.version === 2) { cipher = name(SYM, p.cipherAlgorithm); aead = name(AEAD, p.aeadAlgorithm); }
    }
  }
  return seipd === 2 ? { seipd, cipher, aead, pkesk, skesk } : { seipd, pkesk, skesk };
}

/** The format in a line: "SEIPDv2 — AES-256 in OCB mode (RFC 9580) · v6 session key for 1 key". */
export function formatWords(f: MessageFormat): string {
  const parts: string[] = [];
  if (f.seipd === 2) parts.push(`SEIPDv2 — ${f.cipher} in ${f.aead} mode (AEAD, RFC 9580)`);
  else if (f.seipd === 1) parts.push('SEIPDv1 — CFB with a modification detection code (RFC 4880, as GnuPG writes)');
  if (f.pkesk.length) {
    const v = [...new Set(f.pkesk)].map((x) => `v${x}`).join(' and ');
    parts.push(`${v} session key${f.pkesk.length === 1 ? '' : 's'} for ${f.pkesk.length} key${f.pkesk.length === 1 ? '' : 's'}`);
  }
  for (const s of f.skesk) parts.push(`password (v${s.version} session key, ${s.s2k})`);
  return parts.join(' · ');
}

/** A key's algorithms and version: "Ed25519 (sign) + X25519 (encrypt) · v6 (RFC 9580)". */
export function keyWords(k: OpenPGP.Key): string {
  const algo = (p: any) => {
    const info = p.getAlgorithmInfo?.() ?? {};
    if (info.algorithm === 'eddsaLegacy') return 'Ed25519 (legacy EdDSA)';
    if (info.algorithm === 'ecdh' || info.algorithm === 'ecdsa') return `${info.algorithm.toUpperCase()} ${info.curve === 'curve25519Legacy' ? 'Curve25519' : info.curve ?? ''}`.trim();
    if (/^rsa/.test(info.algorithm ?? '')) return `RSA-${info.bits ?? ''}`;
    return name(PK, p.algorithm);
  };
  const primary = algo(k.keyPacket), subs = k.subkeys.map((s) => algo(s.keyPacket));
  const v = k.keyPacket.version;
  return `${[`${primary} (sign)`, ...subs.map((s) => `${s} (encrypt)`)].join(' + ')} · v${v}${v === 6 ? ' (RFC 9580)' : v === 4 ? ' (RFC 4880)' : ''}`;
}

/** How a private key's secret parts are locked: "Argon2 (3 passes, 4 lanes, 64 MiB), then AES-256 in OCB mode". */
export function protectionWords(k: OpenPGP.PrivateKey): string {
  const p: any = k.keyPacket;
  if (!p.s2k || !p.s2kUsage) return 'not protected by a passphrase';
  const how = s2kWords(p.s2k);
  return p.s2kUsage === 253 ? `${how}, then ${name(SYM, p.symmetric)} in ${name(AEAD, p.aead)} mode (AEAD)` : `${how}, then ${name(SYM, p.symmetric)} (CFB)`;
}

/** A signature's version and algorithms: "v6 signature · Ed25519 · SHA-512". */
export function signatureWords(sig: any): string {
  const p = sig?.packets?.[0] ?? sig;
  if (!p?.version) return '';
  return `v${p.version} signature${p.version === 6 ? ' (RFC 9580)' : ''} · ${name(PK, p.publicKeyAlgorithm)} · ${name(HASH, p.hashAlgorithm)}`;
}

/** The whole output of `message.armor()` / `message.write()`. A message that OpenPGP.js encrypted (format 'object')
 *  keeps its encrypted data as a stream of chunks, so both give a stream, not the text or the bytes — joined here (the
 *  tab showed "[object Object]" for a message it had just encrypted, found by the interop probe, 21 Nov 2026). */
export async function readOut(x: any): Promise<string | Uint8Array> {
  if (typeof x === 'string' || x instanceof Uint8Array) return x;
  const reader = x.getReader(), parts: any[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); }
  if (parts.every((p) => typeof p === 'string')) return parts.join('');
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** The keys among `keys` that do not offer SEIPDv2: RFC 9580 has a message to them made as SEIPDv1, which they can read. */
export async function withoutSeipdv2(o: PGP, keys: OpenPGP.Key[]): Promise<OpenPGP.Key[]> {
  const out: OpenPGP.Key[] = [];
  for (const k of keys) {
    // (both are in OpenPGP.js 6 but not in its type declarations)
    const sig: any = await (k as any).getPrimarySelfSignature().catch(() => null);
    if (!sig?.features || !(sig.features[0] & (o.enums as any).features.seipdv2)) out.push(k);
  }
  return out;
}
