// "USODIUM1" container format — see docs/sodium-format.md and tools/sodium_decrypt.py.
export const MAGIC = 'USODIUM1';
export const CHUNK = 65536;
export const HEADER_LEN = 8 + 1 + 4 + 4 + 4 + 16 + 24; // 61

export interface SodiumHeader { ops: number; memKiB: number; chunk: number; salt: Uint8Array; header: Uint8Array }

export function writeHeader(h: SodiumHeader): Uint8Array {
  const b = new Uint8Array(HEADER_LEN), dv = new DataView(b.buffer);
  b.set(new TextEncoder().encode(MAGIC), 0);
  b[8] = 2; // Argon2id v1.3
  dv.setUint32(9, h.ops, true);
  dv.setUint32(13, h.memKiB, true);
  dv.setUint32(17, h.chunk, true);
  b.set(h.salt, 21);
  b.set(h.header, 37);
  return b;
}

export function parseHeader(b: Uint8Array): SodiumHeader {
  if (b.length < HEADER_LEN || new TextDecoder().decode(b.subarray(0, 8)) !== MAGIC) throw new Error('Not a Sodium Encrypt file (missing USODIUM1 header).');
  if (b[8] !== 2) throw new Error('Unsupported key-derivation algorithm.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const h = { ops: dv.getUint32(9, true), memKiB: dv.getUint32(13, true), chunk: dv.getUint32(17, true), salt: b.slice(21, 37), header: b.slice(37, 61) };
  if (h.ops < 1 || h.ops > 20 || h.memKiB < 8 || h.memKiB > 4 * 1024 * 1024 || h.chunk < 1 || h.chunk > 1 << 24) throw new Error('Header parameters are out of range — the file is damaged.');
  return h;
}
