export default async (t, { load }) => {
  const f = await load('/src/lib/sodium-format.ts');
  const h = { ops: 3, memKiB: 262144, chunk: 65536, salt: new Uint8Array(16).fill(7), header: new Uint8Array(24).fill(9) };
  const b = f.writeHeader(h);
  t.eq(b.length, 61, 'header length'); t.eq(new TextDecoder().decode(b.subarray(0, 8)), 'USODIUM1', 'magic');
  const p = f.parseHeader(b);
  t.eq([p.ops, p.memKiB, p.chunk, p.salt[0], p.header[23]], [3, 262144, 65536, 7, 9], 'round trip');
  t.throws(() => f.parseHeader(new Uint8Array(61)), 'rejects non-USODIUM data');
  const bad = b.slice(); new DataView(bad.buffer).setUint32(9, 999, true); t.throws(() => f.parseHeader(bad), 'rejects absurd ops');
};
