// keys.wasm (Rust, built by us): the parts of the key tabs no existing WebAssembly module covers — OpenSSH keys (Ed25519
// generation, passphrase, reading every key type and layout), API key formats — and pasted-signature matching (GitHub,
// Stripe, Shopify header forms). One-time codes and password hashes run on hash-wasm with this module as supplement:
// tests/unit/totp.test.mjs, tests/unit/pwhash.test.mjs; HMAC: tests/unit/hmac.test.mjs.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export default async (t, { load, wasm }) => {
  const { bindKeys } = await load('/src/wasm/keys.ts');
  const k = bindKeys(await wasm('keys'));
  const B = (s) => Buffer.from(s).toString('base64');
  const err = (f) => { try { f(); return null; } catch (e) { return e.message; } };
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
  // API keys
  const ak = (o) => k.call('apikey', o);
  let a = ak({ format: 'hex', bytes: 32, count: 5 }); t.ok(a.keys.length === 5 && a.keys.every((x) => /^[0-9a-f]{64}$/.test(x)) && new Set(a.keys).size === 5 && a.bits === 256, 'hex 32 bytes × 5, all different, 256 bits');
  a = ak({ format: 'base64url', bytes: 24, prefix: 'sk_live_' }); t.ok(/^sk_live_[A-Za-z0-9_-]{32}$/.test(a.keys[0]), `prefix + base64url (${a.keys[0]})`);
  a = ak({ format: 'alnum', bytes: 32 }); t.ok(/^[A-Za-z0-9]{43}$/.test(a.keys[0]) && a.bits >= 256, `alphanumeric 43 chars ≥ 256 bits (${a.bits})`);
  a = ak({ format: 'github', prefix: 'ghp_', count: 20 }); t.ok(a.keys.every((x) => /^ghp_[A-Za-z0-9]{36}$/.test(x) && k.call('crc', { body: x.slice(4) }).ok), 'GitHub-style token: 30 random + 6-char CRC32 checksum that validates');
  t.eq(k.call('crc', { body: a.keys[0].slice(4, -1) + (a.keys[0].endsWith('A') ? 'B' : 'A') }).ok, false, 'a changed checksum fails');
  const chars = ak({ format: 'alnum', bytes: 128, count: 100 }).keys.join(''); const cnt = {}; for (const c of chars) cnt[c] = (cnt[c] || 0) + 1;
  const E = chars.length / 62, chi = Object.values(cnt).reduce((s2, o) => s2 + (o - E) ** 2 / E, 0); t.ok(Object.keys(cnt).length === 62 && chi < 61 + 4 * Math.sqrt(122), `alphanumeric characters uniform (χ² ${chi.toFixed(1)} over ${chars.length})`);
  t.ok(['hmac', 'totp', 'hash', 'verify', 'pbkdf2'].every((op) => /unknown op/i.test(err(() => k.call(op, {})))) && !('mac' in k), 'HMAC, one-time codes and password hashes are no longer computed by this module (hash-wasm: hmac / totp / pwhash suites)');
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
