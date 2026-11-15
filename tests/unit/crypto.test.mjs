// crypto.wasm (libsodium + own hashes): hashes vs Node, secretstream round-trip/tamper, Argon2id known answer.
import nodeCrypto from 'node:crypto';
import zlib from 'node:zlib';
export default async (t, { wasm }) => {
  const x = await wasm('crypto');
  if (x.u_init() < 0) throw new Error('sodium_init failed');
  const put = (b) => { const p = x.u_malloc(b.length); new Uint8Array(x.memory.buffer, p, b.length).set(b); return p; };
  const get = (p, n) => new Uint8Array(x.memory.buffer, p, n).slice();
  const hex = (b) => Buffer.from(b).toString('hex');
  const H = (alg, data, chunk = 777) => { const c = x.u_hash_new(alg); for (let i = 0; i < data.length; i += chunk) { const part = data.subarray(i, i + chunk); const p = put(part); x.u_hash_update(c, p, part.length); x.u_free(p); } const n = x.u_hash_len(alg), o = x.u_malloc(n); x.u_hash_final(c, o); const r = hex(get(o, n)); x.u_free(o); return r; };
  const ref = { 0: 'md5', 1: 'sha1', 2: 'sha256', 3: 'sha512', 4: 'sha3-256', 5: 'sha3-512', 7: 'blake2b512' };
  for (const len of [0, 1, 55, 56, 63, 64, 65, 135, 136, 137, 1000, 100000]) {
    const d = nodeCrypto.randomBytes(len);
    for (const [a, name] of Object.entries(ref)) t.eq(H(+a, d), nodeCrypto.createHash(name).update(d).digest('hex'), `${name} len ${len}`);
    t.eq(H(8, d), zlib.crc32(d).toString(16).padStart(8, '0'), `crc32 len ${len}`);
  }
  t.eq(H(6, Buffer.from('abc')), 'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319', 'blake2b-256 abc');
  // secretstream
  const key = nodeCrypto.randomBytes(32), st = x.u_malloc(x.u_ss_statebytes()), hdr = x.u_malloc(24), kp = put(key);
  x.u_ss_init_push(st, hdr, kp); const header = get(hdr, 24);
  const msgs = [nodeCrypto.randomBytes(1000), nodeCrypto.randomBytes(65536), nodeCrypto.randomBytes(3)];
  const cts = msgs.map((m, i) => { const mp = put(m), cp = x.u_malloc(m.length + 17); const n = x.u_ss_push(st, cp, mp, m.length, i === 2 ? x.u_ss_tag_final() : 0); const c = get(cp, n); x.u_free(mp); x.u_free(cp); return c; });
  const pull = (list) => { const s2 = x.u_malloc(x.u_ss_statebytes()); x.u_ss_init_pull(s2, put(header), kp); const out = []; for (const c of list) { const cp = put(c), mp = x.u_malloc(c.length), tp = x.u_malloc(1); const n = x.u_ss_pull(s2, mp, tp, cp, c.length); if (n < 0) return null; out.push(get(mp, n)); } return out; };
  const back = pull(cts); t.ok(back && back.every((m, i) => Buffer.from(m).equals(msgs[i])), 'secretstream round trip');
  const bad = cts.map((c) => c.slice()); bad[1][10] ^= 1; t.eq(pull(bad), null, 'tamper detected');
  t.eq(pull([cts[0], cts[2], cts[1]]), null, 'reorder detected');
  // Argon2id known answer (verified against argon2-cffi): password "password", salt 16×0x02, t=3, m=64 MiB, p=1
  const op = x.u_malloc(32), pw = Buffer.from('password');
  t.eq(x.u_pwhash(op, 32, put(pw), pw.length, put(Buffer.alloc(16, 2)), 3, 65536), 0, 'argon2id rc');
  t.eq(hex(get(op, 32)), 'fe525ab59ed3b936920e320c0c812a4721c7e8213b4bd4b960c9f15b409c9540', 'argon2id known answer');
};
