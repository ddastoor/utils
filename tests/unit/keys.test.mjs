// keys.wasm (Rust, RustCrypto, built by us): RFC test vectors — HOTP (RFC 4226 Appendix D),
// TOTP (RFC 6238 Appendix B for SHA-1/256/512), PBKDF2 (RFC 6070), bcrypt (OpenBSD/Openwall vector), Argon2/scrypt/PBKDF2
// PHC round trips, OpenSSH Ed25519 keys (round trip, passphrase), API key formats,
// pasted-signature matching (GitHub, Stripe, Shopify header forms).
import { readFileSync } from 'node:fs';
import { createHash, pbkdf2Sync, scryptSync } from 'node:crypto';
export default async (t, { load, wasm }) => {
  const { bindKeys } = await load('/src/wasm/keys.ts');
  const k = bindKeys(await wasm('keys'));
  const B = (s) => Buffer.from(s).toString('base64');
  const err = (f) => { try { f(); return null; } catch (e) { return e.message; } };
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
  const info = (o) => { const r = k.call('sshinfo', o); t.ok(r.keys.length === 1, 'one key in the answer'); return r.keys[0]; };
  let i = info({ key: s.private }); t.eq([i.public, i.fingerprint, i.encrypted, i.comment, i.algorithm, i.bits], [s.public, s.fingerprint, false, 'asha@laptop', 'ssh-ed25519', 256], 'private key reads back: same public key, fingerprint, comment');
  t.eq(info({ key: s.public }).fingerprint, s.fingerprint, 'public key fingerprint');
  const e = k.call('sshkey', { comment: 'x', passphrase: 'correct horse' }); t.ok(e.encrypted && /aes256-ctr|bcrypt/.test(Buffer.from(e.private.split('\n').slice(1, -2).join(''), 'base64').toString('latin1')), 'passphrase: aes256-ctr + bcrypt KDF');
  i = info({ key: e.private }); t.eq([i.needPassphrase, i.fingerprint, i.algorithm], [true, e.fingerprint, 'ssh-ed25519'], 'encrypted key asks for the passphrase — fingerprint and type are shown without it');
  t.eq(info({ key: e.private, passphrase: 'correct horse' }).public, e.public, 'right passphrase decrypts');
  t.ok(/Wrong passphrase/.test(err(() => k.call('sshinfo', { key: e.private, passphrase: 'wrong' }))), 'wrong passphrase refused');
  // ---- bug hunt, Nov 2026: keys made by other tools (Python cryptography: 64-column PEM), every key type, every layout
  const fx = JSON.parse(readFileSync('tests/fixtures/ssh/keys.json', 'utf8')), sha256fp = (line) => 'SHA256:' + createHash('sha256').update(Buffer.from(line.trim().split(/\s+/)[1], 'base64')).digest('base64').replace(/=+$/, '');
  for (const [name, x] of Object.entries(fx)) {
    const want = [x.pub.split(' ')[0], { 'ssh-ed25519': 256, 'ssh-rsa': 2048, 'ecdsa-sha2-nistp256': 256, 'ecdsa-sha2-nistp521': 521 }[x.pub.split(' ')[0]], sha256fp(x.pub)];
    t.ok(x.fp === want[2], `${name}: fixture fingerprint = SHA-256 of the key blob`);
    i = info({ key: x.pub }); t.eq([i.algorithm, i.bits, i.fingerprint, i.kind], [...want, 'public'], `${name}: public key → type, size, fingerprint`);
    i = info({ key: x.priv, passphrase: x.pw || '' }); t.eq([i.algorithm, i.bits, i.fingerprint, i.encrypted, i.public.split(' ')[1]], [...want, !!x.pw, x.pub.split(' ')[1]], `${name}: private key${x.pw ? ' (encrypted, passphrase ' + JSON.stringify(x.pw) + ')' : ''} written by another tool is read`);
    if (x.pw) { t.eq(info({ key: x.priv }).needPassphrase, true, `${name}: asks for the passphrase`); t.ok(/Wrong passphrase/.test(err(() => k.call('sshinfo', { key: x.priv, passphrase: x.pw + 'x' }))), `${name}: wrong passphrase refused`); }
  }
  const body = fx.ed.priv.split('\n').filter((l) => !l.startsWith('-----')).join('');
  for (const w of [48, 64, 70, 76, 200]) { const pem = '-----BEGIN OPENSSH PRIVATE KEY-----\r\n' + body.match(new RegExp(`.{1,${w}}`, 'g')).map((l) => l + '  ').join('\r\n\r\n') + '\r\n-----END OPENSSH PRIVATE KEY-----\r\n'; t.eq(info({ key: pem }).fingerprint, fx.ed.fp, `private key wrapped at ${w} columns, CRLF, trailing spaces, blank lines`); }
  const three = k.call('sshinfo', { key: `# my keys\n${fx.ed.pub}\n\n${fx.rsa.pub}\n${fx.ecdsa256.pub}\n` }).keys;
  t.eq(three.map((x) => [x.algorithm, x.comment, x.fingerprint]), [['ssh-ed25519', 'plain@host', fx.ed.fp], ['ssh-rsa', 'rsa@host', fx.rsa.fp], ['ecdsa-sha2-nistp256', 'ecdsa@host', fx.ecdsa256.fp]], 'three public keys on three lines → three results (comments and blank lines skipped)');
  i = info({ key: `command="/bin/backup --all",no-pty\t${fx.ed.pub.split(' ').slice(0, 2).join('\t')}  my key comment` }); t.eq([i.before, i.fingerprint, i.comment], ['command="/bin/backup --all",no-pty', fx.ed.fp, 'my key comment'], 'authorized_keys line with options, tabs and a comment with spaces');
  i = info({ key: `github.com,140.82.112.3 ${fx.rsa.pub.split(' ').slice(0, 2).join(' ')}` }); t.eq([i.before, i.fingerprint], ['github.com,140.82.112.3', fx.rsa.fp], 'known_hosts line');
  t.ok(/^MD5:([0-9a-f]{2}:){15}[0-9a-f]{2}$/.test(i.md5) && i.md5 === 'MD5:' + createHash('md5').update(Buffer.from(fx.rsa.pub.split(' ')[1], 'base64')).digest('hex').match(/../g).join(':'), 'legacy MD5 fingerprint');
  t.ok(/Line 2: /.test(err(() => k.call('sshinfo', { key: `${fx.ed.pub}\nssh-rsa not-base64!!` }))) && /says ssh-rsa but the key data is ssh-ed25519/.test(err(() => k.call('sshinfo', { key: `ssh-rsa ${fx.ed.pub.split(' ')[1]}` }))), 'a bad line is named; a type that does not match its data is refused');
  t.ok(/Only OpenSSH keys/.test(err(() => k.call('sshinfo', { key: '-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----' }))) && /Not an OpenSSH public key/.test(err(() => k.call('sshinfo', { key: 'hello world' }))), 'PEM keys of other kinds and plain text get a clear message');
  // ---- 10-digit codes (RFC 4226 Appendix D gives the full 31-bit decimals)
  t.eq([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => k.call('totp', { secret: S1, counter: c, digits: 10 }).code), ['1284755224', '1094287082', '0137359152', '1726969429', '1640338314', '0868254676', '1918287922', '0082162583', '0673399871', '0645520489'], 'HOTP with 10 digits = RFC 4226 Appendix D decimals (used to wrap at 2^32)');
  t.eq([0, 3, 7].map((c) => k.call('totp', { secret: S1, counter: c, digits: 9 }).code), ['284755224', '726969429', '082162583'], '9 digits');
  t.ok(/6 to 10/.test(err(() => k.call('totp', { secret: S1, t: 0, digits: 11 }))) && /6 to 10/.test(err(() => k.call('totp', { secret: S1, t: 0, digits: 5 }))), 'digits outside 6–10 refused');
  // ---- hashing parameters are checked, never silently replaced
  const bad = (o, re, what) => t.ok(re.test(err(() => k.call('hash', { password: 'x', ...o }))), `${what} → ${err(() => k.call('hash', { password: 'x', ...o }))}`);
  bad({ alg: 'scrypt', logn: 16384, r: 8, p: 1 }, /log2\(N\) must be a whole number from 1 to 24/, 'scrypt: N typed instead of log2(N)');
  bad({ alg: 'scrypt', logn: 22, r: 8, p: 1 }, /needs 4096 MiB/, 'scrypt: more memory than a tab has');
  bad({ alg: 'scrypt', logn: 0 }, /log2\(N\)/, 'scrypt: log2(N) 0');
  bad({ alg: 'pbkdf2-sha256', iterations: 0 }, /Iterations must be a whole number from 1/, 'PBKDF2: 0 iterations');
  bad({ alg: 'pbkdf2-sha256', iterations: -5 }, /Iterations must be/, 'PBKDF2: negative iterations');
  bad({ alg: 'bcrypt', cost: 10.5 }, /Cost must be a whole number from 4 to 18/, 'bcrypt: decimal cost');
  bad({ alg: 'bcrypt', cost: null }, /Cost must be/, 'bcrypt: empty cost (NaN)');
  bad({ alg: 'bcrypt', cost: 19 }, /Cost must be/, 'bcrypt: cost that would freeze the page');
  bad({ alg: 'argon2id', m: 4, t: 2, p: 1 }, /Memory \(KiB\) must be a whole number from 8/, 'Argon2: too little memory');
  bad({ alg: 'argon2id', m: 16, t: 2, p: 4 }, /at least 8 KiB per lane \(32 KiB/, 'Argon2: memory below 8 × parallelism');
  bad({ alg: 'argon2id', m: 2097152, t: 1, p: 1 }, /Memory \(KiB\) must be/, 'Argon2: 2 GiB');
  bad({ alg: 'argon2id', m: 19456, t: 0, p: 1 }, /Iterations must be/, 'Argon2: 0 iterations');
  t.eq(k.call('hash', { alg: 'scrypt', password: 'x', logn: 10, r: 8, p: 1 }).hash.slice(0, 22), '$scrypt$ln=10,r=8,p=1$', 'valid scrypt parameters still work');
  // ---- "wrong password" and "cannot check this hash" are different answers
  const b64np = (b) => b.toString('base64').replace(/=+$/, ''), salt = Buffer.from('0123456789abcdef'), pw1 = 'Mumbai@2026 नमस्ते';
  const sha1phc = `$pbkdf2-sha1$i=1000,l=20$${b64np(salt)}$${b64np(pbkdf2Sync(pw1, salt, 1000, 20, 'sha1'))}`;
  t.eq([k.call('verify', { password: pw1, hash: sha1phc }), k.call('verify', { password: pw1 + '!', hash: sha1phc }).ok], [{ ok: true, scheme: 'pbkdf2' }, false], 'PBKDF2-SHA1 hash made with Node crypto verifies (used to say "No match" for the right password)');
  const sha256phc = `$pbkdf2-sha256$i=2000,l=32$${b64np(salt)}$${b64np(pbkdf2Sync(pw1, salt, 2000, 32, 'sha256'))}`;
  t.eq([k.call('verify', { password: pw1, hash: sha256phc }).ok, k.call('verify', { password: 'x', hash: sha256phc }).ok], [true, false], 'PBKDF2-SHA256 hash made with Node crypto verifies');
  const sc = scryptSync(pw1, salt, 32, { N: 1024, r: 8, p: 1 }); const scphc = `$scrypt$ln=10,r=8,p=1$${b64np(salt)}$${b64np(sc)}`;
  t.eq([k.call('verify', { password: pw1, hash: scphc }).ok, k.call('verify', { password: 'x', hash: scphc }).ok], [true, false], 'scrypt hash made with Node crypto verifies');
  t.ok(/cannot be checked/.test(err(() => k.call('verify', { password: 'x', hash: `$argon2id$v=19$m=8,t=1,p=4$${b64np(salt)}$${b64np(Buffer.alloc(32, 7))}` }))), 'Argon2 hash with impossible parameters → "cannot be checked", not "No match"');
  t.ok(/more memory than a browser tab/.test(err(() => k.call('verify', { password: 'x', hash: `$scrypt$ln=24,r=8,p=1$${b64np(salt)}$${b64np(Buffer.alloc(32, 7))}` }))) && /MiB of memory/.test(err(() => k.call('verify', { password: 'x', hash: `$argon2id$v=19$m=4194304,t=1,p=1$${b64np(salt)}$${b64np(Buffer.alloc(32, 7))}` }))), 'hashes that need gigabytes are refused with the reason');
  t.ok(/cost 20/.test(err(() => k.call('verify', { password: 'x', hash: '$2b$20$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW' }))) && /Paste the hash/.test(err(() => k.call('verify', { password: 'x', hash: '  ' }))) && /Unsupported hash scheme/.test(err(() => k.call('verify', { password: 'x', hash: '$foo$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA' }))), 'bcrypt cost 20, empty hash, unknown scheme: clear messages');
  // API keys
  const ak = (o) => k.call('apikey', o);
  let a = ak({ format: 'hex', bytes: 32, count: 5 }); t.ok(a.keys.length === 5 && a.keys.every((x) => /^[0-9a-f]{64}$/.test(x)) && new Set(a.keys).size === 5 && a.bits === 256, 'hex 32 bytes × 5, all different, 256 bits');
  a = ak({ format: 'base64url', bytes: 24, prefix: 'sk_live_' }); t.ok(/^sk_live_[A-Za-z0-9_-]{32}$/.test(a.keys[0]), `prefix + base64url (${a.keys[0]})`);
  a = ak({ format: 'alnum', bytes: 32 }); t.ok(/^[A-Za-z0-9]{43}$/.test(a.keys[0]) && a.bits >= 256, `alphanumeric 43 chars ≥ 256 bits (${a.bits})`);
  a = ak({ format: 'github', prefix: 'ghp_', count: 20 }); t.ok(a.keys.every((x) => /^ghp_[A-Za-z0-9]{36}$/.test(x) && k.call('crc', { body: x.slice(4) }).ok), 'GitHub-style token: 30 random + 6-char CRC32 checksum that validates');
  t.eq(k.call('crc', { body: a.keys[0].slice(4, -1) + (a.keys[0].endsWith('A') ? 'B' : 'A') }).ok, false, 'a changed checksum fails');
  const chars = ak({ format: 'alnum', bytes: 128, count: 100 }).keys.join(''); const cnt = {}; for (const c of chars) cnt[c] = (cnt[c] || 0) + 1;
  const E = chars.length / 62, chi = Object.values(cnt).reduce((s2, o) => s2 + (o - E) ** 2 / E, 0); t.ok(Object.keys(cnt).length === 62 && chi < 61 + 4 * Math.sqrt(122), `alphanumeric characters uniform (χ² ${chi.toFixed(1)} over ${chars.length})`);
  // ---- TOTP secrets as authenticator apps accept them
  {
    const code = (secret) => k.call('totp', { secret, t: 59, digits: 8 }).code, ref = code('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    t.eq(ref, '94287082', 'RFC 6238 vector (20-byte key)');
    for (const [v, why] of [['gezdgnbvgy3tqojqgezdgnbvgy3tqojq', 'lower case'], ['GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ', 'groups of four'], ['GEZDGNBV-GY3TQOJQ-GEZDGNBV-GY3TQOJQ', 'dashes'], ['GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ====', 'padding'], ['GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ​', 'zero-width space'], ['﻿GEZDGNBVGY3TQOJQ GEZDGNBVGY3TQOJQ\n', 'BOM, no-break space, newline']]) t.eq(code(v), ref, `secret with ${why}`);
    t.eq(k.call('totp', { secret: 'JBSWY3DPEHPK3PX', t: 0 }).keyBytes, 9, '15 characters → 9 bytes (left-over bits dropped, as Google Authenticator does)');
    t.eq(k.call('totp', { secret: 'JBSWY3DPEHPK3PXPJBSW', t: 0 }).keyBytes, 12, '20 characters → 12 bytes');
    t.eq(k.call('totp', { secret: 'MFRGGZDFMZTWQ2LK', t: 0 }).keyBytes, 10, '16 characters → 10 bytes ("abcdefghij")');
    t.ok(/"0" is not allowed.*O, I, L or B/.test(err(() => code('0EZDGNBVGY3TQOJQ'))) && /"8" is not allowed/.test(err(() => code('GEZDGNBVGY3TQOJ8'))), 'digits 0, 1, 8, 9 → message with a hint');
    t.ok(/"\*" is not allowed/.test(err(() => code('GEZD*NBV'))) && !/O, I, L or B/.test(err(() => code('GEZD*NBV'))), 'another character → message without the hint');
    t.ok(/too short/.test(err(() => code('A'))) && /Enter the secret/.test(err(() => code(' - = '))), 'one character / nothing but separators');
  }
  t.ok(/unknown operation|unknown op/i.test(err(() => k.call('hmac', { alg: 'sha256', key: '', msg: '' }))) && !('mac' in k), 'HMAC is no longer part of this module (the HMAC tab uses hash-wasm: tests/unit/hmac.test.mjs)');
  // ---- pasted signatures (sigMatches): what webhook senders put in their headers
  {
    const { sigMatches } = await load('/src/tools/software/net.ts');
    const { createHmac } = await import('node:crypto');
    const d = createHmac('sha256', 'k').update('body').digest(), r = { hex: d.toString('hex'), base64: d.toString('base64'), base64url: d.toString('base64url') };
    const yes = { hex: r.hex, 'upper-case hex': r.hex.toUpperCase(), 'sha256=hex (GitHub)': `sha256=${r.hex}`, 'SHA256=HEX': `SHA256=${r.hex.toUpperCase()}`, Base64: r.base64, 'Base64 without padding': r.base64.replace(/=+$/, ''), Base64url: r.base64url, 'Base64url with padding': `${r.base64url}=`,
      'hex with colons': r.hex.match(/../g).join(':'), '0x hex': `0x${r.hex}`, 'hex in groups': r.hex.match(/.{8}/g).join(' '), 'Stripe t=…,v1=…': `t=1492774577,v1=${r.hex},v0=${'0'.repeat(64)}`, 'v1=hex': `v1=${r.hex}`, 'hmac-sha256=hex': `hmac-sha256=${r.hex}`, 'quoted hex': `"${r.hex}"`, 'quoted with a label': `sha256="${r.hex}"`,
      'spaces around': `  ${r.hex}\n`, 'sha256=Base64 (Shopify style with a label)': `sha256=${r.base64}`, 'two candidates, second right': `${'a'.repeat(64)}, ${r.hex}` };
    for (const [name, v] of Object.entries(yes)) t.ok(sigMatches(v, r), `matches: ${name}`);
    const no = { 'another signature': createHmac('sha256', 'k').update('body ').digest('hex'), 'the first 16 hex digits only': r.hex.slice(0, 16), 'hex with one digit changed': r.hex.slice(0, -1) + (r.hex.endsWith('0') ? '1' : '0'), 'Base64 in the wrong case': r.base64.toLowerCase() === r.base64 ? 'x' : r.base64.toLowerCase(),
      'just a label': 'sha256=', 'only padding': '==', 'Stripe list without the right value': `t=1492774577,v1=${'1'.repeat(64)}`, empty: '   ' };
    for (const [name, v] of Object.entries(no)) t.ok(!sigMatches(v, r), `does not match: ${name}`);
  }
};
