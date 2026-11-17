// SSH Key Generator (#/sshkey, PC only): generated Ed25519 keys are loaded by Python's cryptography package (OpenSSH
// private-key parser, incl. passphrase-protected bcrypt/aes256-ctr keys) and must give the same public key; the SHA256
// fingerprint equals SHA-256 of the key blob computed here; downloads; mismatched passphrases; inspecting public and
// encrypted private keys; keys made by other tools (Ed25519, RSA, ECDSA P-256/P-521, encrypted ones, UTF-8 passphrases:
// tests/fixtures/ssh/keys.json), several keys in one paste, authorized_keys / known_hosts lines, any line wrapping,
// MD5 fingerprints, clear messages for damaged input; every key different; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export default async (ctx) => {
  const { base, page: newPage, ok, download, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/sshkey`);
  const comment = page.locator('input[aria-label=Comment]'); await comment.waitFor();
  const gen = async (c, p = '') => { await comment.fill(c); await page.locator('input[aria-label=Passphrase]').fill(p); await page.locator('input[aria-label="Repeat passphrase"]').fill(p); await page.evaluate(() => document.querySelectorAll('textarea').forEach((t, i) => { if (i < 2) t.value = ''; })); await page.getByRole('button', { name: 'Generate key pair' }).click(); await page.waitForFunction(() => document.querySelectorAll('textarea')[1].value.includes('END OPENSSH'), null, { timeout: 15000 }); return { pub: await page.locator('textarea').nth(0).inputValue(), priv: await page.locator('textarea').nth(1).inputValue() }; };
  const fp = (pub) => 'SHA256:' + createHash('sha256').update(Buffer.from(pub.split(' ')[1], 'base64')).digest('base64').replace(/=+$/, '');
  const rows = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  let k = await gen('asha@thinkpad');
  ok(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI\S{43} asha@thinkpad$/.test(k.pub), `public key line (${k.pub.slice(0, 40)}…)`);
  ok((await rows()).Fingerprint === fp(k.pub), 'fingerprint = SHA-256 of the key blob (as ssh-keygen -l)');
  ok(/NOT protected/.test((await rows())['Private key']) && (await page.locator('.randomart').textContent()).startsWith('+--[ED25519 256]--+'), 'unprotected warning + randomart');
  const py = (priv, pass) => execFileSync('python3', ['-c', `import sys
from cryptography.hazmat.primitives.serialization import load_ssh_private_key, Encoding, PublicFormat
k = load_ssh_private_key(sys.stdin.buffer.read(), password=(sys.argv[1].encode() if sys.argv[1] else None))
print(k.public_key().public_bytes(Encoding.OpenSSH, PublicFormat.OpenSSH).decode())`, pass], { input: priv, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  let pyOk = true; try { py(k.priv, ''); } catch (e) { pyOk = false; info(`python cryptography unavailable: ${e.message.split('\n')[0]}`); }
  if (pyOk) ok(py(k.priv, '') === k.pub.split(' ').slice(0, 2).join(' '), 'Python cryptography reads the private key → same public key');
  const k2 = await gen('work', 'correct horse battery staple');
  ok(k2.pub !== k.pub && /protected with the passphrase/.test((await rows())['Private key']), 'new key each time; passphrase protection noted');
  if (pyOk) {
    ok(py(k2.priv, 'correct horse battery staple') === k2.pub.split(' ').slice(0, 2).join(' '), 'encrypted key opens in Python with the passphrase (bcrypt KDF + aes256-ctr)');
    let refused = false; try { py(k2.priv, 'wrong'); } catch { refused = true; } ok(refused, 'Python refuses the wrong passphrase');
  }
  const f1 = await download(page, () => page.getByRole('button', { name: 'Download id_ed25519.pub' }).click()); ok(readFileSync(f1, 'utf8') === `${k2.pub}\n` && /id_ed25519\.pub$/.test(f1), 'download id_ed25519.pub');
  const f2 = await download(page, () => page.getByRole('button', { name: 'Download id_ed25519', exact: true }).click()); ok(readFileSync(f2, 'utf8').trim() === k2.priv.trim(), 'download id_ed25519');
  await page.locator('input[aria-label=Passphrase]').first().fill('a'); await page.locator('input[aria-label="Repeat passphrase"]').fill('b'); await page.getByRole('button', { name: 'Generate key pair' }).click(); await page.waitForTimeout(200);
  ok(/do not match/.test(await page.locator('.toast').last().textContent()), 'mismatched passphrases refused');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/do not match/.test(e)));
  const insp = page.locator('.card', { hasText: 'Inspect a key' });
  await insp.locator('textarea').fill(k.pub); await page.waitForTimeout(400); let r = await insp.evaluate((c) => [...c.querySelectorAll('.kv span')].map((e) => e.textContent));
  ok(r.includes('public key') && r.includes(fp(k.pub)) && r.includes('asha@thinkpad'), 'inspect a public key: fingerprint + comment');
  await insp.locator('textarea').fill(k2.priv); await page.waitForTimeout(400); ok(/enter its passphrase/.test(await insp.locator('.note').textContent()), 'encrypted private key asks for the passphrase');
  await insp.locator('input[aria-label="Passphrase (if encrypted)"]').fill('correct horse battery staple'); await page.waitForTimeout(400);
  r = await insp.evaluate((c) => [...c.querySelectorAll('.kv span')].map((e) => e.textContent)); ok(r.includes(k2.pub) && r.some((x) => /encrypted, opened/.test(x)), 'with the passphrase: shows its public key');
  await insp.locator('input[aria-label="Passphrase (if encrypted)"]').fill('nope'); await page.waitForTimeout(400); ok(/Wrong passphrase/.test(await insp.locator('.note-warn').textContent()), 'wrong passphrase → message');
  await insp.locator('textarea').fill('ssh-rsa notbase64!!'); await page.waitForTimeout(400); ok(/not valid Base64/.test(await insp.locator('.note-warn').textContent()), 'damaged key data → message');
  // ---- bug hunt, Nov 2026: keys made by other tools (fixtures made with Python cryptography: Ed25519, RSA, ECDSA; some encrypted)
  const FX = JSON.parse(readFileSync(new URL('../fixtures/ssh/keys.json', import.meta.url), 'utf8'));
  const passIn = insp.locator('input[aria-label="Passphrase (if encrypted)"]');
  const inspect = async (text, pass = '') => {
    await insp.locator('textarea').fill(''); await passIn.fill(pass); await insp.locator('textarea').fill(text); await page.waitForTimeout(450);
    return insp.evaluate((c) => ({ keys: [...c.querySelectorAll('.ssh-key-info')].map((k) => { const s = [...k.querySelectorAll('.kv span')].map((e) => e.textContent), o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; }), note: [...c.querySelectorAll('.note')].map((n) => n.textContent).join(' | ') }));
  };
  const md5fp = (pub) => 'MD5:' + createHash('md5').update(Buffer.from(pub.split(' ')[1], 'base64')).digest('hex').match(/../g).join(':');
  const want = { ed: ['ssh-ed25519', 256], rsa: ['ssh-rsa', 2048], ecdsa256: ['ecdsa-sha2-nistp256', 256], ecdsa521: ['ecdsa-sha2-nistp521', 521] };
  const bad = [];
  for (const [name, [alg, bits]] of Object.entries(want)) {
    const f = FX[name]; let r = await inspect(f.pub), k = r.keys[0] || {};
    if (!(k.Kind === 'public key' && k.Comment === f.pub.split(' ')[2] && k.Algorithm === `${alg} · ${bits} bits` && k.Fingerprint === f.fp && k.Fingerprint === fp(f.pub) && k['MD5 fingerprint (legacy)'] === md5fp(f.pub))) bad.push(`${name} public: ${JSON.stringify(k)}`);
    r = await inspect(f.priv); k = r.keys[0] || {};
    if (!(/^private key \(not protected/.test(k.Kind || '') && k.Algorithm === `${alg} · ${bits} bits` && k.Fingerprint === f.fp && (k['Public key'] || '').split(' ').slice(0, 2).join(' ') === f.pub.split(' ').slice(0, 2).join(' '))) bad.push(`${name} private: ${JSON.stringify(k)} ${r.note}`);
  }
  ok(!bad.length, `Ed25519, RSA 2048, ECDSA P-256 and P-521 keys from another tool: type, size, SHA256 + MD5 fingerprints and the public key from the private key ${bad.join(' | ')}`);
  for (const name of ['edenc', 'rsaenc', 'edutf8']) {
    const f = FX[name]; let r = await inspect(f.priv);
    const asked = /enter its passphrase/.test(r.note) && r.note.includes(f.fp);
    r = await inspect(f.priv, 'not it'); const refusedPw = /Wrong passphrase/.test(r.note);
    r = await inspect(f.priv, f.pw); const k = r.keys[0] || {};
    ok(asked && refusedPw && /encrypted, opened/.test(k.Kind || '') && k.Fingerprint === f.fp, `${name}: fingerprint shown before the passphrase, wrong passphrase refused, "${f.pw}" opens it (${k.Algorithm})`);
  }
  // several public keys at once (authorized_keys / known_hosts), comments, options, host names
  const bare = (k) => k.pub.split(' ').slice(0, 2).join(' ');
  let multi = await inspect(`# my keys\n${bare(FX.ed)} asha@laptop\n\ncommand="/usr/bin/backup",no-pty ${bare(FX.rsa)} backup key\ngithub.com,140.82.112.3 ${bare(FX.ecdsa256)}\n`);
  ok(multi.keys.length === 3 && multi.keys[0].Comment === 'asha@laptop' && multi.keys[2].Comment === '—' && multi.keys[1]['Options / hosts'] === 'command="/usr/bin/backup",no-pty' && multi.keys[1].Comment === 'backup key' && multi.keys[2]['Options / hosts'] === 'github.com,140.82.112.3' && multi.keys.every((k, i) => k.Fingerprint === [FX.ed, FX.rsa, FX.ecdsa256][i].fp),
    `three keys in one paste (authorized_keys options, known_hosts host names, comment lines skipped): ${multi.keys.map((k) => k.Algorithm).join(', ')}`);
  multi = await inspect(`${FX.ed.pub}\nssh-ed25519 AAAAC3Nza!!\n`); ok(/Line 2: .*Base64/.test(multi.note), `a bad line among several is named (${multi.note.slice(0, 60)})`);
  // a private key wrapped at 64 columns or with Windows line ends (as other tools write it) and with blank lines pasted around it
  const body = FX.ed.priv.split('\n').filter((l) => l && !l.startsWith('-----')).join('');
  const rewrap = (n, nl) => ['-----BEGIN OPENSSH PRIVATE KEY-----', ...body.match(new RegExp(`.{1,${n}}`, 'g')), '-----END OPENSSH PRIVATE KEY-----', ''].join(nl);
  const shapes = [rewrap(64, '\n'), rewrap(70, '\r\n'), rewrap(76, '\n'), `\n\n  ${rewrap(70, '\n  ')}\n`];
  const shapeOk = []; for (const t of shapes) shapeOk.push(((await inspect(t)).keys[0] || {}).Fingerprint === FX.ed.fp);
  ok(shapeOk.every(Boolean), `private key read whatever the line width / line ends / indentation (${shapeOk})`);
  ok(/Only OpenSSH keys/.test((await inspect('-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----')).note), 'a PEM (non-OpenSSH) private key gets a pointer to ssh-keygen -p');
  ok(/Not an OpenSSH public key/.test((await inspect('hello world')).note), 'plain text → "Not an OpenSSH public key"');
  ok(/says ssh-rsa but the key data is ssh-ed25519/.test((await inspect(`ssh-rsa ${FX.ed.pub.split(' ')[1]}`)).note), 'a line whose type does not match its data is refused');
  const cut = await inspect(FX.rsa.pub.slice(0, 200)); ok(/cut off|Base64|ends too early|truncated/i.test(cut.note) && !cut.keys.length, `a public key cut in half → message (${cut.note.slice(0, 70)})`);
  ok((await inspect('   \n ')).keys.length === 0 && !(await inspect('')).note, 'empty box shows nothing');
  // generated keys: comment handling and a UTF-8 passphrase
  const k3 = await gen('  टीम server #1  ', 'पासवर्ड ₹ päss');
  ok(k3.pub.endsWith(' टीम server #1') && (!pyOk || py(k3.priv, 'पासवर्ड ₹ päss') === k3.pub.split(' ').slice(0, 2).join(' ')), 'comment trimmed and kept in UTF-8; a non-ASCII passphrase opens the key in Python');
  const r3 = await inspect(k3.priv, 'पासवर्ड ₹ päss'); ok(r3.keys[0]?.Comment === 'टीम server #1' && r3.keys[0]?.Fingerprint === fp(k3.pub), 'inspecting our own encrypted key shows its comment');
  const k4 = await gen('', ''); ok(/^ssh-ed25519 \S+$/.test(k4.pub.trim()) && (await inspect(k4.pub)).keys[0]?.Comment === '—', 'empty comment → key line without one');
  const many = new Set(); for (let i = 0; i < 5; i++) many.add((await gen('x')).pub); ok(many.size === 5, 'five generated keys are all different');
  const priv4 = (await gen('perm')).priv; ok(priv4.endsWith('-----END OPENSSH PRIVATE KEY-----\n') && priv4.split('\n').slice(1, -2).every((l, i, a) => l.length === 70 || i === a.length - 1), 'private key file: 70-column lines and a final newline (as ssh-keygen writes it)');

  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'sshkey');
};
