// USODIUM1 (Sodium Encrypt, Encrypted Share Link) on libsodium.js — the libsodium project's own WebAssembly build — with
// the header from crypto.wasm (ours): the same keys as our libsodium build, files of either engine opened by the other,
// and the reference decryptor tools/sodium_decrypt.py (PyNaCl, i.e. the C libsodium) opening what the new engine wrote.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const { bindLibsodium } = await load('/src/wasm/libsodium.ts');
  const { bindSodium } = await load('/src/wasm/crypto.ts');
  const { encrypt, decrypt } = await load('/src/lib/usodium.ts');
  const m = await import('libsodium-wrappers-sumo'); const s = m.default ?? m; await s.ready;
  const lib = bindLibsodium(s);
  const ex = await wasm('crypto'); const own = bindSodium({ exports: ex, memory: ex.memory });
  const codec = own.sodiumHeader;
  const enc = (x) => new TextEncoder().encode(x);
  const bytes = async (b) => new Uint8Array(await b.arrayBuffer());
  const FAST = { ops: 2, memKiB: 64 * 1024 }, TINY = { ops: 1, memKiB: 8 };

  t.eq(lib.version, '1.0.22', 'libsodium.js carries libsodium 1.0.22 (our build: 1.0.20)');
  t.eq(own.version, '1.0.20', '… and ours is 1.0.20');
  // the same Argon2id keys
  const salt = new Uint8Array(16).map((_, i) => i * 7);
  for (const [ops, mem] of [[1, 8], [2, 64 * 1024], [3, 1024]]) t.eq(Buffer.from(lib.pwhash(enc('correct horse'), salt, ops, mem)).toString('hex'), Buffer.from(own.pwhash(enc('correct horse'), salt, ops, mem)).toString('hex'), `Argon2id, ops ${ops}, ${mem} KiB: the same key from both`);
  t.eq(Buffer.from(lib.pwhash(enc('नमस्ते 🙏'), salt, 1, 8, 64)).toString('hex'), Buffer.from(own.pwhash(enc('नमस्ते 🙏'), salt, 1, 8, 64)).toString('hex'), 'a password in Hindi with an emoji, a 64-byte key');

  // files of one engine opened by the other
  const sizes = [0, 1, 65535, 65536, 65537, 200000];
  for (const n of sizes) {
    const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
    const a = await encrypt(new Blob([data]), enc('pw'), TINY, lib, codec), b = await encrypt(new Blob([data]), enc('pw'), TINY, own, codec);
    const ab = await bytes(await decrypt(a, enc('pw'), own, codec)), ba = await bytes(await decrypt(b, enc('pw'), lib, codec));
    t.ok(ab.length === n && Buffer.from(ab).equals(Buffer.from(data)) && Buffer.from(ba).equals(Buffer.from(data)), `${n.toLocaleString()} bytes: written by libsodium.js, opened by ours — and the other way round`);
    t.eq(a.size, 61 + n + 17 * Math.max(1, Math.ceil(n / 65536)), `… its size: the 61-byte header, the data, 17 bytes a chunk (${a.size})`);
  }
  // the reference decryptor (PyNaCl) opens what libsodium.js wrote
  { const dir = mkdtempSync(join(tmpdir(), 'usod-')), data = enc('quarterly numbers 42 — ₹ नमस्ते\n'.repeat(5000));
    const f = join(dir, 'x.usodium'); writeFileSync(f, await bytes(await encrypt(new Blob([data]), enc('s3cret!'), FAST, lib, codec)));
    const py = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(join(root, 'tools'))}); import sodium_decrypt as s; sys.stdout.buffer.write(s.decrypt(open(${JSON.stringify(f)}, 'rb').read(), b's3cret!'))`]);
    if (py.status !== 0 && /No module named 'nacl'/.test(py.stderr)) t.ok(true, 'PyNaCl is not installed — the reference decryptor was skipped (pip install pynacl)');
    else t.ok(py.status === 0 && Buffer.from(py.stdout).equals(Buffer.from(data)), `tools/sodium_decrypt.py (PyNaCl: the C libsodium) opens a ${data.length.toLocaleString()}-byte file written by libsodium.js ${py.stderr}`); }

  // what must be refused
  const good = await bytes(await encrypt(new Blob([new Uint8Array(150000).fill(5)]), enc('pw'), TINY, lib, codec));
  const fails = async (b, pw = 'pw') => { try { await decrypt(new Blob([b]), enc(pw), lib, codec); return 'opened'; } catch (e) { return e.message; } };
  t.eq(await fails(good, 'PW'), 'Wrong password, or the file is not a valid encrypted file.', 'a wrong password');
  { const x = good.slice(); x[61 + 70000] ^= 1; t.eq(await fails(x), 'The file is corrupted or was modified.', 'one bit changed in the second chunk'); }
  { const x = good.slice(); x[100] ^= 1; t.eq(await fails(x), 'Wrong password, or the file is not a valid encrypted file.', '… in the first chunk'); }
  t.eq(await fails(good.subarray(0, 61 + 65536 + 17)), 'The encrypted file is incomplete (truncated).', 'cut after a whole chunk: the final tag is missing');
  t.eq(await fails(good.subarray(0, good.length - 5)), 'The file is corrupted or was modified.', 'cut inside the last chunk');
  t.eq(await fails(new Uint8Array([...good, 1, 2, 3])), 'The file is corrupted or was modified.', 'bytes added after the end');
  { const x = good.slice(); new DataView(x.buffer).setUint32(9, 2, true); t.eq(await fails(x), 'Wrong password, or the file is not a valid encrypted file.', 'the stored Argon2 parameters changed: another key, refused'); }
  { let msg = ''; try { await decrypt(new Blob([enc('not a usodium file at all, just some text here!!')]), enc('pw'), lib, codec); } catch (e) { msg = e.message; } t.ok(msg.length > 0, `not a USODIUM1 file: refused (${msg})`); }
  // the random bytes and salts
  { const r = [lib.random(16), lib.random(16)]; t.ok(r[0].length === 16 && !Buffer.from(r[0]).equals(Buffer.from(r[1])), 'random salts differ'); }
};
