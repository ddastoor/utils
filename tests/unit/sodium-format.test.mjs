// USODIUM1 header, written/parsed in crypto.wasm (C), incl. corruption cases.
export default async (t, { load, wasm }) => {
  const { bindSodium } = await load('/src/wasm/crypto.ts');
  const exports = await wasm('crypto');
  const na = bindSodium({ exports, memory: exports.memory });
  const H = na.sodiumHeader;
  const h = { ops: 3, memKiB: 262144, chunk: 65536, salt: new Uint8Array(16).fill(7), header: new Uint8Array(24).fill(9) };
  const b = H.write(h);
  t.eq([H.len, b.length], [61, 61], 'header length'); t.eq(new TextDecoder().decode(b.subarray(0, 8)), 'USODIUM1', 'magic');
  t.eq([b[8], new DataView(b.buffer).getUint32(9, true), new DataView(b.buffer).getUint32(13, true)], [2, 3, 262144], 'little-endian layout (matches docs/sodium-format.md)');
  const p = H.parse(b);
  t.eq([p.ops, p.memKiB, p.chunk, p.salt[0], p.header[23]], [3, 262144, 65536, 7, 9], 'round trip');
  t.throws(() => H.parse(new Uint8Array(61)), 'rejects non-USODIUM data');
  t.throws(() => H.parse(b.subarray(0, 60)), 'rejects short header');
  const bad = b.slice(); new DataView(bad.buffer).setUint32(9, 999, true); t.throws(() => H.parse(bad), 'rejects absurd ops');
  const kdf = b.slice(); kdf[8] = 1; t.throws(() => H.parse(kdf), 'rejects unknown KDF');
  const mem = b.slice(); new DataView(mem.buffer).setUint32(13, 4, true); t.throws(() => H.parse(mem), 'rejects tiny memory');
};
