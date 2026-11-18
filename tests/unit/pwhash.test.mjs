// Password hashes (src/lib/pwhash.ts): Argon2, bcrypt, scrypt and PBKDF2 are computed by hash-wasm (existing
// WebAssembly module); parameters, salts, PHC strings, reading a pasted hash and Argon2 version 1.0 are our supplement
// (keys.wasm). References: the Argon2 reference implementation's own test vectors (also re-made with argon2-cffi),
// the Openwall bcrypt vectors (checked with the Python bcrypt package), RFC 6070 (PBKDF2), RFC 7914 (scrypt), and
// Node's crypto (OpenSSL) for hashes made here and hashes made there.
import { pbkdf2Sync, scryptSync, randomBytes } from 'node:crypto';
export default async (t, { load, wasm }) => {
  const { bindKeys } = await load('/src/wasm/keys.ts'), { hashPassword, verifyPassword } = await load('/src/lib/pwhash.ts');
  const k = bindKeys(await wasm('keys'));
  const hash = (o) => hashPassword(k, o), verify = (password, h) => verifyPassword(k, password, h);
  const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
  const b64np = (b) => Buffer.from(b).toString('base64').replace(/=+$/, ''), un = (s) => Buffer.from(s, 'base64');
  const D = '$', phc = (...parts) => D + parts.join(D);

  // ---- every algorithm: the PHC string, the right and a wrong password, a new salt every time
  for (const [alg, extra, re] of [['argon2id', { m: 8192, t: 2, p: 1 }, /^\$argon2id\$v=19\$m=8192,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/], ['argon2i', { m: 4096, t: 3, p: 1 }, /^\$argon2i\$v=19\$m=4096,t=3,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/], ['argon2d', { m: 1024, t: 1, p: 2 }, /^\$argon2d\$v=19\$m=1024,t=1,p=2\$/],
    ['bcrypt', { cost: 5 }, /^\$2b\$05\$[./A-Za-z0-9]{53}$/], ['pbkdf2-sha256', { iterations: 1000 }, /^\$pbkdf2-sha256\$i=1000,l=32\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/], ['pbkdf2-sha512', { iterations: 1000 }, /^\$pbkdf2-sha512\$i=1000,l=32\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/], ['scrypt', { logn: 10, r: 8, p: 1 }, /^\$scrypt\$ln=10,r=8,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/]]) {
    const h = await hash({ alg, password: 'नमस्ते pass', ...extra });
    t.ok(re.test(h), `${alg}: PHC string ${h.slice(0, 44)}…`);
    t.eq([await verify('नमस्ते pass', h), (await verify('नमस्ते pasS', h)).ok], [{ ok: true, scheme: alg.startsWith('argon2') ? 'argon2' : alg.split('-')[0] }, false], `${alg}: verifies the right password (with its scheme), rejects a wrong one`);
    t.ok((await hash({ alg, password: 'x', ...extra })) !== (await hash({ alg, password: 'x', ...extra })), `${alg}: random salt each time`);
  }
  // ---- our hashes checked by OpenSSL from the PHC fields
  {
    const pw = 'Mumbai@2026 नमस्ते';
    for (const [alg, fn] of [['pbkdf2-sha256', 'sha256'], ['pbkdf2-sha512', 'sha512']]) {
      const [, , par, s, h] = (await hash({ alg, password: pw, iterations: 3210 })).split(D);
      t.eq([par, b64np(pbkdf2Sync(pw, un(s), 3210, 32, fn))], ['i=3210,l=32', h], `${alg}: Node's pbkdf2Sync gives the same digest for the salt in the string`);
      t.eq(un(s).length, 16, `${alg}: 16 random salt bytes`);
    }
    for (const [logn, r, p] of [[10, 8, 1], [12, 8, 2], [4, 16, 3], [1, 1, 1]]) {
      const [, , par, s, h] = (await hash({ alg: 'scrypt', password: pw, logn, r, p })).split(D);
      t.eq([par, b64np(scryptSync(pw, un(s), 32, { N: 2 ** logn, r, p, maxmem: 1 << 28 }))], [`ln=${logn},r=${r},p=${p}`, h], `scrypt ln=${logn}, r=${r}, p=${p}: Node's scryptSync gives the same digest`);
    }
  }
  // ---- published vectors
  t.eq(await verify('password', phc('argon2i', 'v=19', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', 'wWKIMhR9lyDFvRz9YTZweHKfbftvj+qf+YFY4NeBbtA')), { ok: true, scheme: 'argon2' }, 'Argon2i 1.3 vector of the reference implementation (password / somesalt)');
  t.eq(await verify('password', phc('argon2id', 'v=19', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', 'CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc')), { ok: true, scheme: 'argon2' }, 'Argon2id 1.3 vector of the reference implementation');
  t.eq(await verify('password', phc('argon2d', 'v=19', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', 'lV5dWxY6G2C7o1/DbQSWR0+6T2tZrVNihmbwf7L5Pq8')), { ok: true, scheme: 'argon2' }, 'Argon2d (made with argon2-cffi)');
  t.eq(await verify('differentpassword', phc('argon2id', 'v=19', 'm=256,t=2,p=2', 'c29tZXNhbHQ', 'UwH55F74dt7gQaFQW+7XJi34wwjaoDPD')), { ok: true, scheme: 'argon2' }, 'Argon2id with two lanes and a 24-byte hash (argon2-cffi)');
  t.eq((await verify('Password', phc('argon2id', 'v=19', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', 'CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc'))).ok, false, 'Argon2id vector, wrong password');
  // Argon2 version 1.0: hash-wasm does not read it — our supplement does
  t.eq(await verify('password', phc('argon2i', 'v=16', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', '9sTbSlTio3Biev89thdrlKKiCaYsjjYVJxGAL3swxpQ')), { ok: true, scheme: 'argon2' }, 'Argon2i version 1.0 (v=16) vector of the reference implementation');
  t.eq(await verify('password', phc('argon2i', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', '9sTbSlTio3Biev89thdrlKKiCaYsjjYVJxGAL3swxpQ')), { ok: true, scheme: 'argon2' }, 'the same hash as old libraries wrote it, without "v=" (= version 1.0)');
  t.eq(await verify('password', phc('argon2id', 'v=16', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', 'mA69JKTmZ/FjRvnUp4sXVyh4NhPgzG+xfC7IhLFkNd8')), { ok: true, scheme: 'argon2' }, 'Argon2id version 1.0 (argon2-cffi)');
  t.eq((await verify('passw0rd', phc('argon2i', 'v=16', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', '9sTbSlTio3Biev89thdrlKKiCaYsjjYVJxGAL3swxpQ'))).ok, false, 'version 1.0, wrong password');
  t.eq((await verify('', phc('argon2id', 'v=19', 'm=65536,t=2,p=1', 'c29tZXNhbHQ', 'CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc'))).ok, false, 'an empty password against an Argon2 hash: "no match", not an error');
  // bcrypt (Openwall crypt_blowfish test vectors)
  const OW = [['U*U', '2a', '05', 'CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW'], ['U*U*', '2a', '05', 'CCCCCCCCCCCCCCCCCCCCC.VGOzA784oUp/Z0DY336zx7pLYAy0lwK'], ['U*U*U', '2a', '05', 'XXXXXXXXXXXXXXXXXXXXXOAcXxm9kjPGEMsLznoKqmqw7tc8WCx4a'],
    ['0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789chars after 72 are ignored', '2a', '05', 'abcdefghijklmnopqrstuu5s2v8.iXieOjg/.AySBTTZIIVFJeBui']];
  for (const [pw, v, cost, rest] of OW) t.eq(await verify(pw, phc(v, cost, rest)), { ok: true, scheme: 'bcrypt' }, `bcrypt Openwall vector ${JSON.stringify(pw.slice(0, 14))}${pw.length > 14 ? '…' : ''}`);
  t.eq((await verify('U*V', phc('2a', '05', OW[0][3]))).ok, false, 'bcrypt wrong password');
  for (const v of ['2b', '2y', '2x']) t.eq((await verify('U*U', phc(v, '05', OW[0][3]))).ok, true, `bcrypt hash labelled $${v}$ (PHP, older libraries)`);
  t.ok(/Enter the password to check/.test(await err(() => verify('', phc('2a', '05', 'CCCCCCCCCCCCCCCCCCCCC.7uG0VCzI2bS7j6ymqJi9CdcdxiRTWNy')))), 'an empty password against a bcrypt hash asks for the password');
  // PBKDF2 (RFC 6070) and scrypt (RFC 7914 §12) as PHC strings
  t.eq(await verify('password', phc('pbkdf2-sha1', 'i=1,l=20', b64np('salt'), b64np(Buffer.from('0c60c80f961f0e71f3a9b524af6012062fe037a6', 'hex')))), { ok: true, scheme: 'pbkdf2' }, 'PBKDF2-SHA1 1 iteration (RFC 6070)');
  t.eq((await verify('password', phc('pbkdf2-sha1', 'i=2,l=20', b64np('salt'), b64np(Buffer.from('ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957', 'hex'))))).ok, true, 'PBKDF2-SHA1 2 iterations (RFC 6070)');
  t.eq((await verify('password', phc('pbkdf2-sha1', 'i=4096,l=20', b64np('salt'), b64np(Buffer.from('4b007901b765489abead49d926f721d065a429c1', 'hex'))))).ok, true, 'PBKDF2-SHA1 4096 iterations (RFC 6070)');
  t.eq((await verify('passwordPASSWORDpassword', phc('pbkdf2', 'i=4096,l=25', b64np('saltSALTsaltSALTsaltSALTsaltSALTsalt'), b64np(Buffer.from('3d2eec4fe41c849b80c8d83662c0e44a8b291a964cf2f07038', 'hex'))))).ok, true, 'PBKDF2-SHA1 with a 25-byte output, written $pbkdf2$ (RFC 6070)');
  t.eq((await verify('pleaseletmein', phc('scrypt', 'ln=14,r=8,p=1', b64np('SodiumChloride'), b64np(Buffer.from('7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887', 'hex'))))).ok, true, 'scrypt N=16384, r=8, p=1 with a 64-byte output (RFC 7914)');
  t.eq((await verify('password', phc('scrypt', 'ln=10,r=8,p=16', b64np('NaCl'), b64np(Buffer.from('fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640', 'hex'))))).ok, true, 'scrypt N=1024, r=8, p=16 (RFC 7914)');
  // ---- hashes made by OpenSSL, checked here
  const salt = Buffer.from('0123456789abcdef'), pw1 = 'Mumbai@2026 नमस्ते';
  const sha1phc = phc('pbkdf2-sha1', 'i=1000,l=20', b64np(salt), b64np(pbkdf2Sync(pw1, salt, 1000, 20, 'sha1')));
  t.eq([await verify(pw1, sha1phc), (await verify(pw1 + '!', sha1phc)).ok], [{ ok: true, scheme: 'pbkdf2' }, false], 'PBKDF2-SHA1 hash made with Node crypto verifies (used to say "No match" for the right password)');
  const sha256phc = phc('pbkdf2-sha256', 'i=2000,l=32', b64np(salt), b64np(pbkdf2Sync(pw1, salt, 2000, 32, 'sha256')));
  t.eq([(await verify(pw1, sha256phc)).ok, (await verify('x', sha256phc)).ok], [true, false], 'PBKDF2-SHA256 hash made with Node crypto verifies');
  const sha512phc = phc('pbkdf2-sha512', 'i=1500,l=64', b64np(salt), b64np(pbkdf2Sync(pw1, salt, 1500, 64, 'sha512')));
  t.eq([(await verify(pw1, sha512phc)).ok, (await verify(pw1.slice(1), sha512phc)).ok], [true, false], 'PBKDF2-SHA512 with a 64-byte output');
  const scphc = phc('scrypt', 'ln=10,r=8,p=1', b64np(salt), b64np(scryptSync(pw1, salt, 32, { N: 1024, r: 8, p: 1 })));
  t.eq([(await verify(pw1, scphc)).ok, (await verify('x', scphc)).ok], [true, false], 'scrypt hash made with Node crypto verifies');
  {
    const bad = [];
    for (let i = 0; i < 24; i++) {
      const s = randomBytes(8 + (i % 20)), pw = randomBytes(1 + i).toString('base64'), len = [16, 20, 32, 48, 64][i % 5], it = 1 + i * 37, fn = ['sha1', 'sha256', 'sha512'][i % 3];
      const h = phc(`pbkdf2-${fn}`, `i=${it},l=${len}`, b64np(s), b64np(pbkdf2Sync(pw, s, it, len, fn)));
      if (!(await verify(pw, h)).ok || (await verify(pw + ' ', h)).ok) bad.push(h);
      const ln = 1 + (i % 9), r = 1 + (i % 9), p = 1 + (i % 3), h2 = phc('scrypt', `ln=${ln},r=${r},p=${p}`, b64np(s), b64np(scryptSync(pw, s, len, { N: 2 ** ln, r, p })));
      if (!(await verify(pw, h2)).ok || (await verify(pw + ' ', h2)).ok) bad.push(h2);
    }
    t.ok(!bad.length, `48 PBKDF2 and scrypt hashes made by OpenSSL (salts of 8–27 bytes, outputs of 16–64 bytes, mixed parameters) verify, a changed password does not ${bad.slice(0, 2).join(' ')}`);
  }
  // ---- "wrong password" and "cannot check this hash" are different answers
  t.ok(/cannot be checked/.test(await err(() => verify('x', phc('argon2id', 'v=19', 'm=8,t=1,p=4', b64np(salt), b64np(Buffer.alloc(32, 7)))))), 'Argon2 hash with impossible parameters → "cannot be checked", not "No match"');
  t.ok(/cannot be checked/.test(await err(() => verify('x', phc('argon2id', 'v=16', 'm=8,t=1,p=4', b64np(salt), b64np(Buffer.alloc(32, 7)))))), 'the same for a version 1.0 hash');
  t.ok(/cannot be checked/.test(await err(() => verify('x', phc('scrypt', 'r=8,p=1', b64np(salt), b64np(Buffer.alloc(32, 7)))))), 'scrypt hash without its N → "cannot be checked"');
  t.ok(/more memory than a browser tab/.test(await err(() => verify('x', phc('scrypt', 'ln=24,r=8,p=1', b64np(salt), b64np(Buffer.alloc(32, 7)))))) && /MiB of memory/.test(await err(() => verify('x', phc('argon2id', 'v=19', 'm=4194304,t=1,p=1', b64np(salt), b64np(Buffer.alloc(32, 7)))))), 'hashes that need gigabytes are refused with the reason');
  t.ok(/cost 20/.test(await err(() => verify('x', phc('2b', '20', OW[0][3])))) && /Paste the hash/.test(await err(() => verify('x', '  '))) && /Unsupported hash scheme/.test(await err(() => verify('x', phc('foo', 'c2FsdHNhbHQ', 'aGFzaGhhc2hoYXNoaGFzaA')))), 'bcrypt cost 20, empty hash, unknown scheme: clear messages');
  t.ok(/Not a recognised hash/.test(await err(() => verify('a', 'nope'))), 'garbage hash refused');
  t.ok(/Not a valid bcrypt hash: it has 12 characters/.test(await err(() => verify('a', phc('2b', '12', 'short')))) && /Not a valid bcrypt hash/.test(await err(() => verify('a', phc('2b', '05', OW[0][3].slice(0, -2) + '!!')))) && /Not a valid bcrypt hash/.test(await err(() => verify('a', phc('2b', '0x', OW[0][3])))), 'bcrypt strings of the wrong length, with other characters or without a cost are named');
  t.ok(/iteration count is out of range/.test(await err(() => verify('x', phc('pbkdf2-sha256', 'i=4000000000,l=32', b64np(salt), b64np(Buffer.alloc(32, 7)))))) && /iteration count is out of range/.test(await err(() => verify('x', phc('pbkdf2-sha1', 'i=0,l=20', b64np(salt), b64np(Buffer.alloc(20, 7)))))), 'PBKDF2 hashes with 0 or billions of iterations are refused (the page would freeze)');
  t.ok(/has no salt|Not a recognised hash/.test(await err(() => verify('x', phc('pbkdf2-sha256', 'i=10,l=32')))), 'a PHC string without salt and hash');
  t.eq((await verify('  U*U  '.trim(), `  ${phc('2a', '05', OW[0][3])}\n`)).ok, true, 'spaces and a line end around a pasted hash are ignored');

  // ---- hashing parameters are checked, never silently replaced
  const bad = async (o, re, what) => { const m = await err(() => hash({ password: 'x', ...o })); t.ok(re.test(m), `${what} → ${m}`); };
  await bad({ alg: 'scrypt', logn: 16384, r: 8, p: 1 }, /log2\(N\) must be a whole number from 1 to 24/, 'scrypt: N typed instead of log2(N)');
  await bad({ alg: 'scrypt', logn: 22, r: 8, p: 1 }, /needs 4096 MiB/, 'scrypt: more memory than a tab has');
  await bad({ alg: 'scrypt', logn: 0 }, /log2\(N\)/, 'scrypt: log2(N) 0');
  await bad({ alg: 'scrypt', logn: 10, r: 65 }, /Block size r must be/, 'scrypt: r too large');
  await bad({ alg: 'scrypt', logn: 10, r: 8, p: 17 }, /Parallelism must be/, 'scrypt: p too large');
  await bad({ alg: 'pbkdf2-sha256', iterations: 0 }, /Iterations must be a whole number from 1/, 'PBKDF2: 0 iterations');
  await bad({ alg: 'pbkdf2-sha256', iterations: -5 }, /Iterations must be/, 'PBKDF2: negative iterations');
  await bad({ alg: 'pbkdf2-sha512', iterations: 50000001 }, /Iterations must be/, 'PBKDF2: more iterations than a tab should run');
  await bad({ alg: 'bcrypt', cost: 10.5 }, /Cost must be a whole number from 4 to 18/, 'bcrypt: decimal cost');
  await bad({ alg: 'bcrypt', cost: null }, /Cost must be/, 'bcrypt: empty cost (NaN)');
  await bad({ alg: 'bcrypt', cost: 19 }, /Cost must be/, 'bcrypt: cost that would freeze the page');
  await bad({ alg: 'bcrypt', cost: 3 }, /Cost must be/, 'bcrypt: cost below 4');
  await bad({ alg: 'argon2id', m: 4, t: 2, p: 1 }, /Memory \(KiB\) must be a whole number from 8/, 'Argon2: too little memory');
  await bad({ alg: 'argon2id', m: 16, t: 2, p: 4 }, /at least 8 KiB per lane \(32 KiB/, 'Argon2: memory below 8 × parallelism');
  await bad({ alg: 'argon2id', m: 2097152, t: 1, p: 1 }, /Memory \(KiB\) must be/, 'Argon2: 2 GiB');
  await bad({ alg: 'argon2id', m: 19456, t: 0, p: 1 }, /Iterations must be/, 'Argon2: 0 iterations');
  await bad({ alg: 'argon2i', m: 19456, t: 1, p: 65 }, /Parallelism must be/, 'Argon2: 65 lanes');
  await bad({ alg: 'md5crypt' }, /unknown algorithm md5crypt/, 'an algorithm the tab does not have');
  t.ok(/72 bytes/.test(await err(() => hash({ alg: 'bcrypt', password: 'x'.repeat(73), cost: 4 }))) && /72 bytes/.test(await err(() => hash({ alg: 'bcrypt', password: 'न'.repeat(25), cost: 4 }))), 'bcrypt: a password of more than 72 bytes is refused (25 Devanagari letters are 75 bytes)');
  t.ok(/^\$2b\$04\$/.test(await hash({ alg: 'bcrypt', password: 'x'.repeat(72), cost: 4 })) && /^\$2b\$04\$/.test(await hash({ alg: 'bcrypt', password: 'न'.repeat(24), cost: 4 })), 'bcrypt: exactly 72 bytes is hashed');
  t.eq((await hash({ alg: 'scrypt', password: 'x', logn: 10, r: 8, p: 1 })).slice(0, 22), '$scrypt$ln=10,r=8,p=1$', 'valid scrypt parameters still work');
  t.ok(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/.test(await hash({ alg: 'argon2id', password: 'x' })) && /^\$2b\$12\$/.test(await hash({ alg: 'bcrypt', password: 'x' })) && /^\$scrypt\$ln=17,r=8,p=1\$/.test(await hash({ alg: 'scrypt', password: 'x' })), 'defaults (OWASP): Argon2id 19 MiB × 2, bcrypt cost 12, scrypt N = 2^17');
  // ---- several at once (hash-wasm gives every call its own instance)
  {
    const pws = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'];
    const hs = await Promise.all(pws.map((p, i) => hash({ alg: ['argon2id', 'bcrypt', 'scrypt', 'pbkdf2-sha256', 'argon2i', 'pbkdf2-sha512'][i], password: p, m: 256, t: 1, p: 1, cost: 4, logn: 8, r: 8, iterations: 200 })));
    const oks = await Promise.all(hs.flatMap((h, i) => [verify(pws[i], h), verify(pws[(i + 1) % 6], h)]));
    t.eq(oks.map((x) => x.ok), pws.flatMap(() => [true, false]), 'six hashes and twelve checks running at once: every answer belongs to its own password');
  }
};
