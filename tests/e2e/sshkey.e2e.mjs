// SSH Key Generator (#/sshkey, PC only): generated Ed25519 keys are loaded by Python's cryptography package (OpenSSH
// private-key parser, incl. passphrase-protected bcrypt/aes256-ctr keys) and must give the same public key; the SHA256
// fingerprint equals SHA-256 of the key blob computed here; downloads; mismatched passphrases; inspecting public and
// encrypted private keys; every key different; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export default async (ctx) => {
  const { base, page: newPage, ok, download, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/sshkey`);
  const comment = page.locator('input[aria-label=Comment]'); await comment.waitFor();
  const gen = async (c, p = '') => { await comment.fill(c); await page.locator('input[aria-label=Passphrase]').fill(p); await page.locator('input[aria-label="Repeat passphrase"]').fill(p); await page.getByRole('button', { name: 'Generate key pair' }).click(); await page.waitForFunction(() => document.querySelectorAll('textarea')[1].value.includes('END OPENSSH'), null, { timeout: 15000 }); return { pub: await page.locator('textarea').nth(0).inputValue(), priv: await page.locator('textarea').nth(1).inputValue() }; };
  const fp = (pub) => 'SHA256:' + createHash('sha256').update(Buffer.from(pub.split(' ')[1], 'base64')).digest('base64').replace(/=+$/, '');
  const rows = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  let k = await gen('asha@thinkpad');
  ok(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI\S{43} asha@thinkpad$/.test(k.pub), `public key line (${k.pub.slice(0, 40)}…)`);
  ok((await rows()).Fingerprint === fp(k.pub), 'fingerprint = SHA-256 of the key blob (as ssh-keygen -l)');
  ok(/NOT protected/.test((await rows())['Private key']) && (await page.locator('.randomart').textContent()).startsWith('+--[ED25519 256]--+'), 'unprotected warning + randomart');
  const py = (priv, pass) => execFileSync('python3', ['-c', `import sys
from cryptography.hazmat.primitives.serialization import load_ssh_private_key, Encoding, PublicFormat
k = load_ssh_private_key(sys.stdin.buffer.read(), password=(sys.argv[1].encode() if sys.argv[1] else None))
print(k.public_key().public_bytes(Encoding.OpenSSH, PublicFormat.OpenSSH).decode())`, pass], { input: priv }).toString().trim();
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
  await insp.locator('textarea').fill('ssh-rsa notbase64!!'); await page.waitForTimeout(400); ok(/Not an OpenSSH key/.test(await insp.locator('.note-warn').textContent()), 'garbage key → message');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'sshkey');
};
