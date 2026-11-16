// keys.wasm (Rust, RustCrypto, built by us): RFC test vectors — HMAC (RFC 2104/2202/4231), HOTP (RFC 4226 Appendix D),
// TOTP (RFC 6238 Appendix B for SHA-1/256/512), PBKDF2 (RFC 6070), bcrypt (OpenBSD/Openwall vector), Argon2/scrypt/PBKDF2
// PHC round trips, OpenSSH Ed25519 keys (round trip, passphrase), API key formats.
export default async (t, { load, wasm }) => {
  const { bindKeys } = await load('/src/wasm/keys.ts');
  const k = bindKeys(await wasm('keys'));
  const B = (s) => Buffer.from(s).toString('base64');
  const err = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  const hm = (alg, key, msg) => k.call('hmac', { alg, key: B(key), msg: B(msg) }).hex;
  t.eq(hm('md5', 'Jefe', 'what do ya want for nothing?'), '750c783e6ab0b503eaa86e310a5db738', 'HMAC-MD5 (RFC 2104)');
  t.eq(hm('sha1', 'Jefe', 'what do ya want for nothing?'), 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79', 'HMAC-SHA1 (RFC 2202 case 2)');
  t.eq(hm('sha256', 'Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', 'HMAC-SHA256 (RFC 4231 case 2)');
  t.eq(hm('sha512', 'Jefe', 'what do ya want for nothing?'), '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737', 'HMAC-SHA512 (RFC 4231 case 2)');
  const big = Buffer.alloc(131, 0xaa).toString('binary');
  t.eq(k.call('hmac', { alg: 'sha256', key: Buffer.alloc(131, 0xaa).toString('base64'), msg: B('Test Using Larger Than Block-Size Key - Hash Key First') }).hex, '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54', 'HMAC-SHA256 with a key longer than the block (RFC 4231 case 6)');
  void big;
  const sec = (s) => Buffer.from(s).toString('base64'); // not used: TOTP takes Base32
  void sec;
  const b32 = (s) => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '', o = ''; for (const c of Buffer.from(s)) bits += c.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) o += a[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return o; };
  const S1 = b32('12345678901234567890'), S256 = b32('12345678901234567890123456789012'), S512 = b32('1234567890123456789012345678901234567890123456789012345678901234');
  t.eq([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => k.call('totp', { secret: S1, counter: c }).code), ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'], 'HOTP RFC 4226 Appendix D');
  const T = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
  t.eq(T.map((x) => k.call('totp', { secret: S1, t: x, digits: 8 }).code), ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'], 'TOTP SHA-1 (RFC 6238 Appendix B)');
  t.eq(T.map((x) => k.call('totp', { secret: S256, t: x, digits: 8, alg: 'sha256' }).code), ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'], 'TOTP SHA-256');
  t.eq(T.map((x) => k.call('totp', { secret: S512, t: x, digits: 8, alg: 'sha512' }).code), ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826'], 'TOTP SHA-512');
  const r = k.call('totp', { secret: S1.toLowerCase().replace(/(.{4})/g, '$1 '), t: 1234567890 });
  t.eq([r.code, r.counter, r.remaining], ['005924', 41152263, 30 - (1234567890 % 30)], 'lower case + spaces accepted; counter and seconds left');
  t.ok(/not valid Base32/.test(err(() => k.call('totp', { secret: 'abc1!', t: 0 }))), 'bad Base32 refused');
  t.eq(k.call('pbkdf2', { password: 'password', salt: 'salt', iterations: 1, len: 20, alg: 'sha1' }).hex, '0c60c80f961f0e71f3a9b524af6012062fe037a6', 'PBKDF2-SHA1 1 iteration (RFC 6070)');
  t.eq(k.call('pbkdf2', { password: 'password', salt: 'salt', iterations: 4096, len: 20, alg: 'sha1' }).hex, '4b007901b765489abead49d926f721d065a429c1', 'PBKDF2-SHA1 4096 iterations (RFC 6070)');
  t.eq(k.call('verify', { password: 'U*U', hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW' }), { ok: true, scheme: 'bcrypt' }, 'bcrypt Openwall vector "U*U"');
  t.eq(k.call('verify', { password: 'U*V', hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW' }).ok, false, 'bcrypt wrong password');
  for (const [alg, extra, re] of [['argon2id', { m: 8192, t: 2, p: 1 }, /^\$argon2id\$v=19\$m=8192,t=2,p=1\$/], ['argon2i', { m: 4096, t: 3, p: 1 }, /^\$argon2i\$v=19\$m=4096,t=3,p=1\$/], ['bcrypt', { cost: 5 }, /^\$2b\$05\$.{53}$/], ['pbkdf2-sha256', { iterations: 1000 }, /^\$pbkdf2-sha256\$i=1000,l=32\$/], ['pbkdf2-sha512', { iterations: 1000 }, /^\$pbkdf2-sha512\$i=1000,l=32\$/], ['scrypt', { logn: 10, r: 8, p: 1 }, /^\$scrypt\$ln=10,r=8,p=1\$/]]) {
    const h = k.call('hash', { alg, password: 'नमस्ते pass', ...extra }).hash;
    t.ok(re.test(h), `${alg}: PHC string ${h.slice(0, 40)}…`);
    t.eq([k.call('verify', { password: 'नमस्ते pass', hash: h }).ok, k.call('verify', { password: 'नमस्ते pasS', hash: h }).ok], [true, false], `${alg}: verifies right password, rejects wrong one`);
    t.ok(k.call('hash', { alg, password: 'x', ...extra }).hash !== k.call('hash', { alg, password: 'x', ...extra }).hash, `${alg}: random salt each time`);
  }
  t.ok(/72 bytes/.test(err(() => k.call('hash', { alg: 'bcrypt', password: 'x'.repeat(73), cost: 4 }))), 'bcrypt > 72 bytes refused');
  t.ok(/Not a recognised hash/.test(err(() => k.call('verify', { password: 'a', hash: 'nope' }))), 'garbage hash refused');
  // OpenSSH
  const s = k.call('sshkey', { comment: 'asha@laptop' });
  t.ok(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43} asha@laptop$/.test(s.public), `public key line: ${s.public}`);
  t.ok(s.private.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----\n') && s.private.trim().endsWith('-----END OPENSSH PRIVATE KEY-----') && /^SHA256:[A-Za-z0-9+/]{43}$/.test(s.fingerprint), 'private key PEM + SHA256 fingerprint');
  t.ok(s.randomart.startsWith('+--[ED25519 256]--+') && s.randomart.split('\n').length === 11, 'randomart box');
  let i = k.call('sshinfo', { key: s.private }); t.eq([i.public, i.fingerprint, i.encrypted], [s.public, s.fingerprint, false], 'private key reads back: same public key and fingerprint');
  t.eq(k.call('sshinfo', { key: s.public }).fingerprint, s.fingerprint, 'public key fingerprint');
  const e = k.call('sshkey', { comment: 'x', passphrase: 'correct horse' }); t.ok(e.encrypted && /aes256-ctr|bcrypt/.test(Buffer.from(e.private.split('\n').slice(1, -2).join(''), 'base64').toString('latin1')), 'passphrase: aes256-ctr + bcrypt KDF');
  t.eq(k.call('sshinfo', { key: e.private }).needPassphrase, true, 'encrypted key asks for the passphrase');
  t.eq(k.call('sshinfo', { key: e.private, passphrase: 'correct horse' }).public, e.public, 'right passphrase decrypts');
  t.ok(/Wrong passphrase/.test(err(() => k.call('sshinfo', { key: e.private, passphrase: 'wrong' }))), 'wrong passphrase refused');
  // API keys
  const ak = (o) => k.call('apikey', o);
  let a = ak({ format: 'hex', bytes: 32, count: 5 }); t.ok(a.keys.length === 5 && a.keys.every((x) => /^[0-9a-f]{64}$/.test(x)) && new Set(a.keys).size === 5 && a.bits === 256, 'hex 32 bytes × 5, all different, 256 bits');
  a = ak({ format: 'base64url', bytes: 24, prefix: 'sk_live_' }); t.ok(/^sk_live_[A-Za-z0-9_-]{32}$/.test(a.keys[0]), `prefix + base64url (${a.keys[0]})`);
  a = ak({ format: 'alnum', bytes: 32 }); t.ok(/^[A-Za-z0-9]{43}$/.test(a.keys[0]) && a.bits >= 256, `alphanumeric 43 chars ≥ 256 bits (${a.bits})`);
  a = ak({ format: 'github', prefix: 'ghp_', count: 20 }); t.ok(a.keys.every((x) => /^ghp_[A-Za-z0-9]{36}$/.test(x) && k.call('crc', { body: x.slice(4) }).ok), 'GitHub-style token: 30 random + 6-char CRC32 checksum that validates');
  t.eq(k.call('crc', { body: a.keys[0].slice(4, -1) + (a.keys[0].endsWith('A') ? 'B' : 'A') }).ok, false, 'a changed checksum fails');
  const chars = ak({ format: 'alnum', bytes: 128, count: 100 }).keys.join(''); const cnt = {}; for (const c of chars) cnt[c] = (cnt[c] || 0) + 1;
  const E = chars.length / 62, chi = Object.values(cnt).reduce((s2, o) => s2 + (o - E) ** 2 / E, 0); t.ok(Object.keys(cnt).length === 62 && chi < 61 + 4 * Math.sqrt(122), `alphanumeric characters uniform (χ² ${chi.toFixed(1)} over ${chars.length})`);
};
