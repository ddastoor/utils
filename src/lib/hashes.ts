// The algorithms of the Hash / Checksum tab. Engine: hash-wasm 4.13 (MIT) — an existing, widely used WebAssembly module
// (STANDING RULE #1, step 1; docs/WASM-AUDIT.md, tab 103): hand-tuned C compiled to WebAssembly, one small binary per
// algorithm embedded in the package (nothing is fetched at run time), streaming. It replaced crypto.wasm's hashes in
// Nov 2026. Runs in src/workers/hash.worker.ts; the unit suite runs it in Node against independent implementations.
import {
  createMD5, createSHA1, createSHA224, createSHA256, createSHA384, createSHA512, createSHA3, createKeccak,
  createBLAKE2b, createBLAKE2s, createBLAKE3, createRIPEMD160, createCRC32, createCRC64, createAdler32,
  createXXHash64, createXXHash3, createXXHash128,
} from 'hash-wasm';

type Hasher = Awaited<ReturnType<typeof createSHA256>>;

export type HashGroup = 'main' | 'more';
export interface HashAlgo {
  id: string;
  /** Length of the digest in bytes. */
  bytes: number;
  /** Shown without opening "More algorithms" (the tab's original nine). */
  group: HashGroup;
  /** Not for security: collisions can be made on purpose (MD5, SHA-1) or are easy (checksums, fast hashes). */
  weak?: boolean;
  /** One line under the chip. */
  about: string;
  /** Name of the checksum list the command-line tool writes (sha256sum → SHA256SUMS). */
  sums: string;
  make: () => Promise<Hasher>;
}

export const HASHES: HashAlgo[] = [
  { id: 'MD5', bytes: 16, group: 'main', weak: true, about: 'Old downloads (md5sum); broken for security', sums: 'MD5SUMS', make: createMD5 },
  { id: 'SHA-1', bytes: 20, group: 'main', weak: true, about: 'Git objects, old downloads (sha1sum); broken for security', sums: 'SHA1SUMS', make: createSHA1 },
  { id: 'SHA-256', bytes: 32, group: 'main', about: 'The usual checksum of downloads (sha256sum)', sums: 'SHA256SUMS', make: createSHA256 },
  { id: 'SHA-512', bytes: 64, group: 'main', about: 'sha512sum', sums: 'SHA512SUMS', make: createSHA512 },
  { id: 'SHA3-256', bytes: 32, group: 'main', about: 'SHA-3 (FIPS 202)', sums: 'SHA3-256SUMS', make: () => createSHA3(256) },
  { id: 'SHA3-512', bytes: 64, group: 'main', about: 'SHA-3 (FIPS 202)', sums: 'SHA3-512SUMS', make: () => createSHA3(512) },
  { id: 'BLAKE2b-256', bytes: 32, group: 'main', about: 'b2sum -l 256', sums: 'B2SUMS-256', make: () => createBLAKE2b(256) },
  { id: 'BLAKE2b-512', bytes: 64, group: 'main', about: 'b2sum (the default of coreutils)', sums: 'B2SUMS', make: () => createBLAKE2b(512) },
  { id: 'CRC-32', bytes: 4, group: 'main', weak: true, about: 'ZIP, PNG, gzip, .sfv files; not for security', sums: 'checksums.sfv', make: () => createCRC32() },
  { id: 'SHA-224', bytes: 28, group: 'more', about: 'sha224sum', sums: 'SHA224SUMS', make: createSHA224 },
  { id: 'SHA-384', bytes: 48, group: 'more', about: 'sha384sum; web page integrity (sha384-…)', sums: 'SHA384SUMS', make: createSHA384 },
  { id: 'SHA3-224', bytes: 28, group: 'more', about: 'SHA-3 (FIPS 202)', sums: 'SHA3-224SUMS', make: () => createSHA3(224) },
  { id: 'SHA3-384', bytes: 48, group: 'more', about: 'SHA-3 (FIPS 202)', sums: 'SHA3-384SUMS', make: () => createSHA3(384) },
  { id: 'Keccak-256', bytes: 32, group: 'more', about: 'Ethereum (the original Keccak, not SHA3-256)', sums: 'KECCAK256SUMS', make: () => createKeccak(256) },
  { id: 'BLAKE2s-256', bytes: 32, group: 'more', about: 'BLAKE2s', sums: 'B2SSUMS', make: () => createBLAKE2s(256) },
  { id: 'BLAKE3', bytes: 32, group: 'more', about: 'b3sum; the fastest secure hash here', sums: 'B3SUMS', make: () => createBLAKE3(256) },
  { id: 'RIPEMD-160', bytes: 20, group: 'more', about: 'Bitcoin addresses, OpenPGP v3', sums: 'RMD160SUMS', make: createRIPEMD160 },
  { id: 'CRC-32C', bytes: 4, group: 'more', weak: true, about: 'Castagnoli: iSCSI, ext4, Google Cloud Storage; not for security', sums: 'CRC32CSUMS', make: () => createCRC32(0x82f63b78) },
  { id: 'CRC-64', bytes: 8, group: 'more', weak: true, about: 'CRC-64/XZ (ECMA-182): xz files; not for security', sums: 'CRC64SUMS', make: () => createCRC64() },
  { id: 'Adler-32', bytes: 4, group: 'more', weak: true, about: 'zlib streams; not for security', sums: 'ADLER32SUMS', make: createAdler32 },
  { id: 'xxHash64', bytes: 8, group: 'more', weak: true, about: 'xxhsum (XXH64); fast, not for security', sums: 'XXH64SUMS', make: () => createXXHash64() },
  { id: 'XXH3-64', bytes: 8, group: 'more', weak: true, about: 'xxhsum -H3; fast, not for security', sums: 'XXH3SUMS', make: () => createXXHash3() },
  { id: 'XXH128', bytes: 16, group: 'more', weak: true, about: 'xxhsum -H2; fast, not for security', sums: 'XXH128SUMS', make: () => createXXHash128() },
];
export const HASH_IDS = HASHES.map((a) => a.id);
export const algo = (id: string) => HASHES.find((a) => a.id === id);

/** The hash used to tell whether two files are the same when only weak algorithms were chosen (fast and secure). */
export const COMPARE_ALG = 'BLAKE3';

/** Streaming hashers for several algorithms at once: `update` with every piece, `digest` once at the end. */
export async function hashers(ids: string[]) {
  const hs = await Promise.all(ids.map(async (id) => {
    const a = algo(id);
    if (!a) throw new Error(`unknown algorithm "${id}"`);
    const h = await a.make();
    h.init();
    return [id, h] as const;
  }));
  return {
    update(b: Uint8Array) { if (b.length) for (const [, h] of hs) h.update(b); },
    digest(): Record<string, Uint8Array> { return Object.fromEntries(hs.map(([id, h]) => [id, h.digest('binary')])); },
  };
}
