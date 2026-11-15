// Self-test for public/wasm/crypto.wasm: hashes vs Node's crypto, secretstream round trip, Argon2id.
//   node wasm/crypto/test.mjs
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const wasmPath = fileURLToPath(new URL('../../public/wasm/crypto.wasm', import.meta.url));
const mod = new WebAssembly.Module(readFileSync(wasmPath));
let mem;
const wasi = {};
for (const imp of WebAssembly.Module.imports(mod)) {
  if (imp.module !== 'wasi_snapshot_preview1') throw new Error('unexpected import ' + imp.module);
  wasi[imp.name] = () => 52;
}
wasi.random_get = (ptr, len) => { crypto.getRandomValues(new Uint8Array(mem.buffer, ptr, len)); return 0; };
wasi.proc_exit = (c) => { throw new Error('exit ' + c); };
const inst = new WebAssembly.Instance(mod, { wasi_snapshot_preview1: wasi });
const x = inst.exports;
mem = x.memory;
x._initialize?.();
if (x.u_init() < 0) throw new Error('sodium_init failed');

const put = (bytes) => { const p = x.u_malloc(bytes.length); new Uint8Array(mem.buffer, p, bytes.length).set(bytes); return p; };
const get = (p, n) => new Uint8Array(mem.buffer, p, n).slice();
const hex = (b) => Buffer.from(b).toString('hex');

function wasmHash(alg, data, chunk = 777) {
  const ctx = x.u_hash_new(alg);
  for (let i = 0; i < data.length; i += chunk) {
    const part = data.subarray(i, i + chunk);
    const p = put(part); x.u_hash_update(ctx, p, part.length); x.u_free(p);
  }
  const n = x.u_hash_len(alg); const out = x.u_malloc(n);
  x.u_hash_final(ctx, out); const r = get(out, n); x.u_free(out); return hex(r);
}
const ref = {
  0: (d) => crypto.createHash('md5').update(d).digest('hex'),
  1: (d) => crypto.createHash('sha1').update(d).digest('hex'),
  2: (d) => crypto.createHash('sha256').update(d).digest('hex'),
  3: (d) => crypto.createHash('sha512').update(d).digest('hex'),
  4: (d) => crypto.createHash('sha3-256').update(d).digest('hex'),
  5: (d) => crypto.createHash('sha3-512').update(d).digest('hex'),
  6: (d) => crypto.createHash('blake2b512').update(d).digest('hex') && null, // BLAKE2b-256 checked by vector below
  7: (d) => crypto.createHash('blake2b512').update(d).digest('hex'),
  8: (d) => zlib.crc32(d).toString(16).padStart(8, '0'),
};
let fails = 0;
for (const len of [0, 1, 55, 56, 63, 64, 65, 135, 136, 137, 1000, 100000]) {
  const data = crypto.randomBytes(len);
  for (const alg of [0, 1, 2, 3, 4, 5, 7, 8]) {
    const a = wasmHash(alg, data), b = ref[alg](data);
    if (a !== b) { fails++; console.log('FAIL alg', alg, 'len', len, a, b); }
  }
}
// BLAKE2b-256("abc") known answer
const b2 = wasmHash(6, Buffer.from('abc'));
if (b2 !== 'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319') { fails++; console.log('FAIL blake2b-256', b2); }

// secretstream round trip + tamper detection
const key = crypto.randomBytes(32);
const st = x.u_malloc(x.u_ss_statebytes()), hdr = x.u_malloc(24), kp = put(key);
x.u_ss_init_push(st, hdr, kp);
const header = get(hdr, 24);
const msgs = [crypto.randomBytes(1000), crypto.randomBytes(65536), crypto.randomBytes(3)];
const cts = msgs.map((m, i) => {
  const mp = put(m), cp = x.u_malloc(m.length + 17);
  const n = x.u_ss_push(st, cp, mp, m.length, i === msgs.length - 1 ? x.u_ss_tag_final() : 0);
  const c = get(cp, n); x.u_free(mp); x.u_free(cp); return c;
});
function pull(ctsIn) {
  const s2 = x.u_malloc(x.u_ss_statebytes()); const hp = put(header);
  x.u_ss_init_pull(s2, hp, kp);
  const out = [];
  for (const c of ctsIn) {
    const cp = put(c), mp = x.u_malloc(c.length), tp = x.u_malloc(1);
    const n = x.u_ss_pull(s2, mp, tp, cp, c.length);
    if (n < 0) return null;
    out.push(get(mp, n));
  }
  return out;
}
const back = pull(cts);
if (!back || back.some((m, i) => !Buffer.from(m).equals(msgs[i]))) { fails++; console.log('FAIL secretstream round trip'); }
const bad = cts.map((c) => c.slice()); bad[1][10] ^= 1;
if (pull(bad) !== null) { fails++; console.log('FAIL tamper not detected'); }
if (pull([cts[0], cts[2], cts[1]]) !== null) { fails++; console.log('FAIL reorder not detected'); }

// Argon2id known answer (libsodium test vector style): compare with Node's argon2 if available
const salt = Buffer.alloc(16, 2);
const pw = Buffer.from('password');
const op = x.u_malloc(32), pwp = put(pw), sp = put(salt);
const t0 = Date.now();
const rc = x.u_pwhash(op, 32, pwp, pw.length, sp, 3, 65536);
const ms = Date.now() - t0;
const k1 = hex(get(op, 32));
if (rc !== 0) { fails++; console.log('FAIL pwhash rc', rc); }
if (crypto.argon2Sync) {
  const k2 = crypto.argon2Sync('argon2id', { message: pw, nonce: salt, parallelism: 1, tagLength: 32, memory: 65536, passes: 3 }).toString('hex');
  if (k1 !== k2) { fails++; console.log('FAIL argon2id', k1, k2); } else console.log('argon2id matches Node');
} else console.log('argon2id', k1, `(${ms} ms, no Node reference available)`);

console.log('libsodium', new TextDecoder().decode(get(x.u_version(), 8)).replace(/\0.*/, ''));
console.log(fails ? `${fails} FAILURES` : 'all crypto.wasm tests passed');
process.exit(fails ? 1 : 0);
