// OpenPGP (#/pgp): interop with GnuPG 2.4 in both directions — keys, encryption to one or several recipients,
// signatures detached and clear-signed, symmetric, the revocation certificate — the RFC 9580 (v6, AEAD) vectors of the
// RFC's Appendix A (tests/fixtures/pgp/rfc9580/), the file name stored in a message, armor inside an e-mail, and every
// refusal in words. Skips the gpg parts gracefully if gpg is not installed.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const V = (n) => readFileSync(new URL(`../fixtures/pgp/rfc9580/${n}`, import.meta.url), 'utf8');
export default async ({ base, page: newPage, ok, tmp: tmpRoot, download, devices }) => {
  try { execFileSync('gpg', ['--version']); } catch { ok(true, 'gpg not installed — interop skipped'); return; }
  const tmp = mkdtempSync(tmpRoot + '/pgp-');
  const GNUPGHOME = mkdtempSync(tmpRoot + '/gnupg-');
  const gpg = (...a) => execFileSync('gpg', ['--batch', '--yes', '--pinentry-mode', 'loopback', ...a], { env: { ...process.env, GNUPGHOME }, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const page = await newPage();
  const save = (btn) => download(page, () => btn.click());
// 1. generate key pair in browser
  await page.goto(base + '#/pgp');
  await page.getByRole('radio', { name: 'Generate keys' }).click();
  await page.getByPlaceholder('Your name').fill('Alice Test');
  await page.getByPlaceholder('you@example.com').fill('alice@example.com');
  const pw = page.locator('input[type=password]');
  await pw.nth(0).fill('alicepass'); await pw.nth(1).fill('alicepass');
  await page.getByRole('button', { name: 'Generate key pair' }).click();
  await page.waitForSelector('text=Your new key pair', { timeout: 30000 });
  const pubPath = await save(page.getByRole('button', { name: 'Public key (.asc)' }));
  const secPath = await save(page.getByRole('button', { name: 'Private key (.asc)' }));
  gpg('--passphrase', 'alicepass', '--import', secPath);
  const listing = gpg('--list-secret-keys', '--with-colons');
  ok(/alice@example.com/.test(listing) && /:ed25519:/.test(listing + gpg('--list-keys', '--with-colons')) || /alice@example.com/.test(listing), 'gpg imports browser-generated private key');
  
  // 2. browser encrypts + signs a file to Alice → gpg decrypts and verifies
  writeFileSync(`${tmp}/report.txt`, 'quarterly numbers 42\n');
  await page.getByRole('radio', { name: 'Encrypt' }).click();
  await page.locator('input[type=file]').nth(0).setInputFiles(`${tmp}/report.txt`);
  await page.locator('input[type=file]').nth(1).setInputFiles(pubPath);
  await page.locator('input[type=file]').nth(2).setInputFiles(secPath);
  await page.getByPlaceholder('Private key passphrase').fill('alicepass');
  const encPath = await save(page.getByRole('button', { name: 'Encrypt' }).last());
  const dec = execFileSync('gpg', ['--batch', '--pinentry-mode', 'loopback', '--passphrase', 'alicepass', '--decrypt', encPath], { env: { ...process.env, GNUPGHOME }, stdio: ['ignore', 'pipe', 'ignore'] });
  ok(dec.toString() === 'quarterly numbers 42\n', 'gpg decrypts browser-encrypted file');
  const status = execFileSync('sh', ['-c', `GNUPGHOME=${GNUPGHOME} gpg --batch --pinentry-mode loopback --passphrase alicepass --status-fd 1 --decrypt ${encPath} 2>/dev/null`]).toString();
  ok(/GOODSIG/.test(status), 'gpg verifies the browser signature');
  
  // 3. gpg encrypts to Alice (armored) → browser decrypts
  writeFileSync(`${tmp}/from-gpg.txt`, 'hello from gnupg\n');
  gpg('--trust-model', 'always', '--armor', '-r', 'alice@example.com', '--sign', '--passphrase', 'alicepass', '-o', `${tmp}/from-gpg.asc`, '--encrypt', `${tmp}/from-gpg.txt`);
  await page.getByRole('radio', { name: 'Decrypt' }).click();
  await page.getByRole('radio', { name: 'Text' }).click();
  await page.locator('textarea').first().fill(readFileSync(`${tmp}/from-gpg.asc`, 'utf8'));
  await page.locator('input[type=file]').nth(0).setInputFiles(secPath);
  await page.getByPlaceholder('Private key passphrase or message password').fill('alicepass');
  await page.locator('input[type=file]').nth(1).setInputFiles(pubPath);
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  await page.waitForSelector('text=Decrypted text', { timeout: 30000 });
  ok((await page.locator('.outbox textarea').last().inputValue()) === 'hello from gnupg\n', 'browser decrypts gpg-encrypted message');
  ok(await page.locator('text=Good signature from').count() > 0, 'browser verifies gpg signature');
  
  // 4. symmetric: gpg -c → browser
  gpg('--symmetric', '--armor', '--passphrase', 'sympw', '-o', `${tmp}/sym.asc`, `${tmp}/from-gpg.txt`);
  await page.goto(base + '#/c/all'); await page.goto(base + '#/pgp');
  await page.getByRole('radio', { name: 'Decrypt' }).click();
  await page.getByRole('radio', { name: 'Text' }).click();
  await page.locator('textarea').first().fill(readFileSync(`${tmp}/sym.asc`, 'utf8'));
  await page.getByPlaceholder('Private key passphrase or message password').fill('sympw');
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  await page.waitForSelector('text=Decrypted text', { timeout: 30000 });
  ok((await page.locator('.outbox textarea').last().inputValue()) === 'hello from gnupg\n', 'browser decrypts gpg symmetric message');
  
  

  // ---- Nov 2026 bug hunt
  const gpgs = (...a) => spawnSync('gpg', ['--batch', '--yes', '--pinentry-mode', 'loopback', '--status-fd', '2', ...a], { env: { ...process.env, GNUPGHOME } });
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
  const lastToast = async (re) => page.waitForFunction((r) => [...document.querySelectorAll('.toast')].some((t) => new RegExp(r).test(t.textContent)), re.source, { timeout: 15000 }).then(() => true, () => false);
  const go = async (op) => { await page.goto(base + '#/c/all'); await page.goto(base + '#/pgp'); await page.getByRole('radio', { name: op }).click(); };
  const notesText = () => page.evaluate(() => [...document.querySelectorAll('.note')].map((n) => n.textContent).join(' | '));
  // a second key, made by gpg: Bob
  gpg('--passphrase', 'bobpass', '--quick-gen-key', 'Bob <bob@example.com>', 'ed25519', 'sign', '0');
  const bobFpr = gpg('--list-keys', '--with-colons', 'bob@example.com').split('\n').find((l) => l.startsWith('fpr')).split(':')[9];
  gpg('--passphrase', 'bobpass', '--quick-add-key', bobFpr, 'cv25519', 'encr', '0');
  gpg('--armor', '-o', `${tmp}/bob.pub.asc`, '--export', 'bob@example.com');
  gpg('--passphrase', 'bobpass', '--armor', '-o', `${tmp}/bob.sec.asc`, '--export-secret-keys', 'bob@example.com');

  // 5. a binary file decrypted under the name stored in the message (it took the encrypted file's name)
  writeFileSync(`${tmp}/photo.bin`, Buffer.from([0, 1, 2, 3, 255, 0, 7]));
  gpg('--trust-model', 'always', '-r', 'bob@example.com', '-o', `${tmp}/odd-name.gpg`, '--encrypt', `${tmp}/photo.bin`);
  await go('Decrypt');
  await page.locator('input[type=file]').nth(0).setInputFiles(`${tmp}/odd-name.gpg`);
  await page.locator('input[type=file]').nth(1).setInputFiles(`${tmp}/bob.sec.asc`);
  await page.getByPlaceholder('Private key passphrase or message password').fill('bobpass');
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  const photo = await save(page.getByRole('button', { name: /^Download / }));
  ok(photo.endsWith('photo.bin') && readFileSync(photo).equals(Buffer.from([0, 1, 2, 3, 255, 0, 7])), `the file is saved under the name stored inside it: ${photo.split('/').pop()} (it was "odd-name")`);
  ok(await page.getByText('Decrypted text').count() === 0, 'binary data is not shown as text');

  // 6. an armored message inside an e-mail's words (it failed: "Error during parsing")
  writeFileSync(`${tmp}/note.txt`, 'line one\nline two\n');
  gpg('--trust-model', 'always', '--armor', '-r', 'bob@example.com', '-o', `${tmp}/msg.asc`, '--encrypt', `${tmp}/note.txt`);
  await go('Decrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('textarea').first().fill(`Hi Bob,\n\nhere is the note I promised you yesterday, encrypted as usual.\n\n${readFileSync(`${tmp}/msg.asc`, 'utf8')}\nCheers,\nAlice`);
  await page.locator('input[type=file]').nth(0).setInputFiles(`${tmp}/bob.sec.asc`);
  await page.getByPlaceholder('Private key passphrase or message password').fill('bobpass');
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  await page.waitForSelector('text=Decrypted text', { timeout: 30000 });
  ok(await page.getByRole('textbox', { name: 'Decrypted text' }).inputValue() === 'line one\nline two\n', 'an armored message with words before and after it is decrypted');
  // the same message with Alice's key: it is not for her
  await page.locator('input[type=file]').nth(0).setInputFiles(secPath); await page.getByPlaceholder('Private key passphrase or message password').fill('alicepass');
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  ok(await lastToast(/This message is not for your key: it was encrypted to key ID [0-9A-F]{16}; yours is [0-9A-F]{16}/), `a message for another key says so, with the key IDs (it said "wrong key or password") — ${(await toasts()).slice(-140)}`);
  // and no key at all
  await go('Decrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('textarea').first().fill(readFileSync(`${tmp}/msg.asc`, 'utf8')); await page.getByPlaceholder('Private key passphrase or message password').fill('x');
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  ok(await lastToast(/encrypted to a key \(ID [0-9A-F]{16}\), not with a password — load your private key/), 'a message for a key, decrypted with a password: it says a key is needed');

  // 7. refusals in words
  await go('Decrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('textarea').first().fill(readFileSync(`${tmp}/msg.asc`, 'utf8'));
  await page.locator('input[type=file]').nth(0).setInputFiles(`${tmp}/bob.pub.asc`);
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  ok(await lastToast(/that is a public key — your private key is needed here/), 'a public key in the private-key box (it said "Armored text not of type private key")');
  await page.locator('textarea').first().fill('Hi, this is just a note.');
  await page.locator('textarea').nth(1).fill(readFileSync(`${tmp}/bob.sec.asc`, 'utf8'));
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  ok(await lastToast(/That is not an OpenPGP message, or it is incomplete/), 'text that is no message (it said "Error during parsing. This message / key probably does not conform…")');
  await page.locator('textarea').first().fill(readFileSync(`${tmp}/msg.asc`, 'utf8').split('\n').slice(0, 4).join('\n'));
  await page.getByRole('button', { name: 'Decrypt' }).last().click();
  ok(await lastToast(/not an OpenPGP message, or it is incomplete|check sum/), 'a message cut short');
  await go('Generate keys'); await page.getByPlaceholder('you@example.com').fill('not an email');
  await page.locator('input[type=password]').nth(0).fill('x'); await page.locator('input[type=password]').nth(1).fill('x');
  await page.getByRole('button', { name: 'Generate key pair' }).click();
  ok(await lastToast(/"not an email" is not an e-mail address/), 'a wrong e-mail address is named (it said "Error generating keypair: Invalid user ID format")');

  // 8. signatures from gpg verified in the browser — with the signing key's fingerprint and the date
  gpg('--passphrase', 'bobpass', '--local-user', 'bob@example.com', '--clearsign', '-o', `${tmp}/note.txt.asc`, `${tmp}/note.txt`);
  gpg('--passphrase', 'bobpass', '--local-user', 'bob@example.com', '--detach-sign', '--armor', '-o', `${tmp}/note.sig.asc`, `${tmp}/note.txt`);
  await go('Verify'); await page.getByRole('radio', { name: 'Clear-signed text' }).click(); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('textarea').first().fill(`Forwarded:\n\n${readFileSync(`${tmp}/note.txt.asc`, 'utf8')}`);
  await page.locator('input[type=file]').last().setInputFiles(`${tmp}/bob.pub.asc`);
  await page.getByRole('button', { name: 'Verify' }).last().click();
  await page.waitForSelector('text=Good signature from', { timeout: 15000 });
  const good = await notesText(); const fp4 = bobFpr.replace(/(.{4})(?!$)/g, '$1 ');
  ok(good.includes('Good signature from Bob <bob@example.com>') && good.includes('signed '), `gpg's clear-signed text verifies, with the date (${good.slice(0, 120)})`);
  ok(/Key [0-9A-F]{4}( [0-9A-F]{4}){9}/.test(good), 'and the fingerprint of the signing key, in groups of four');
  await go('Verify');
  await page.locator('input[type=file]').nth(0).setInputFiles(`${tmp}/note.txt`);
  await page.locator('input[type=file]').nth(1).setInputFiles(`${tmp}/note.sig.asc`);
  await page.locator('input[type=file]').nth(2).setInputFiles(`${tmp}/bob.pub.asc`);
  await page.getByRole('button', { name: 'Verify' }).last().click(); await page.waitForSelector('text=Good signature from', { timeout: 15000 });
  ok((await notesText()).includes('Good signature from Bob'), "gpg's detached signature verifies");
  writeFileSync(`${tmp}/note2.txt`, 'line one\nline TWO\n');
  await page.locator('input[type=file]').nth(0).setInputFiles(`${tmp}/note2.txt`);
  await page.getByRole('button', { name: 'Verify' }).last().click(); await page.waitForSelector('text=BAD signature', { timeout: 15000 });
  ok(/BAD signature — the data or the signature was changed after signing/.test(await notesText()), 'a changed file: BAD signature, said in words');
  await page.locator('input[type=file]').nth(1).setInputFiles(`${tmp}/msg.asc`);
  await page.getByRole('button', { name: 'Verify' }).last().click();
  ok(await lastToast(/The signature file holds a message, not a detached signature/), 'a message chosen as the signature file is named');

  // 9. browser → gpg: clear-signed and detached signatures, several recipients, password, the revocation certificate
  await go('Sign'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('textarea').first().fill('pay 100 rupees\nto Bob');
  await page.locator('input[type=file]').nth(0).setInputFiles(secPath); await page.getByPlaceholder('Private key passphrase').fill('alicepass');
  await page.getByRole('radio', { name: 'Clear-signed text' }).click();
  await page.getByRole('button', { name: 'Sign' }).last().click(); await page.waitForSelector('text=Clear-signed message', { timeout: 15000 });
  writeFileSync(`${tmp}/c.asc`, await page.locator('.outbox textarea').last().inputValue());
  ok(/GOODSIG/.test(gpgs('--verify', `${tmp}/c.asc`).stderr), 'gpg verifies a clear-signed text made in the browser');
  await page.getByRole('radio', { name: 'Detached (.sig/.asc)' }).click();
  const det = await save(page.getByRole('button', { name: 'Sign' }).last());
  writeFileSync(`${tmp}/typed.txt`, 'pay 100 rupees\nto Bob');
  ok(/GOODSIG/.test(gpgs('--verify', det, `${tmp}/typed.txt`).stderr), 'gpg verifies a detached signature of typed text against the same text in a file');
  await go('Encrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('textarea').first().fill('for both of you — नमस्ते');
  await page.locator('input[type=file]').nth(0).setInputFiles([pubPath, `${tmp}/bob.pub.asc`]);
  await page.getByRole('button', { name: 'Encrypt' }).last().click(); await page.waitForSelector('text=Encrypted', { timeout: 15000 });
  writeFileSync(`${tmp}/both.asc`, await page.locator('.outbox textarea').last().inputValue());
  const forA = gpgs('--passphrase', 'alicepass', '--decrypt', `${tmp}/both.asc`);
  ok(forA.stdout.toString() === 'for both of you — नमस्ते' && (forA.stderr.toString().match(/ENC_TO/g) || []).length === 2, `two recipients: the message is for both keys, and gpg decrypts it (Hindi and dashes kept) — ${JSON.stringify(forA.stdout.toString())} ${(forA.stderr.toString().match(/ENC_TO \S+/g) || []).join(' ')}`);
  await page.getByRole('radio', { name: 'Password (symmetric)' }).click(); await page.getByPlaceholder('Password').fill('');
  await page.getByRole('button', { name: 'Encrypt' }).last().click();
  ok(await lastToast(/Enter a password/), 'an empty password is refused');
  await page.getByPlaceholder('Password').fill('sympw'); await page.getByRole('button', { name: 'Encrypt' }).last().click(); await page.waitForTimeout(1500);
  writeFileSync(`${tmp}/s.asc`, await page.locator('.outbox textarea').last().inputValue());
  ok(gpgs('--passphrase', 'sympw', '--decrypt', `${tmp}/s.asc`).stdout.toString() === 'for both of you — नमस्ते', 'gpg decrypts a message the browser encrypted with a password');
  const revPath = await (async () => { await go('Generate keys'); await page.getByPlaceholder('Your name').fill('Rex'); await page.locator('input[type=password]').nth(0).fill('r'); await page.locator('input[type=password]').nth(1).fill('r'); await page.getByRole('button', { name: 'Generate key pair' }).click(); await page.waitForSelector('text=Your new key pair', { timeout: 30000 }); const pub = await save(page.getByRole('button', { name: 'Public key (.asc)' })); gpg('--import', pub); return save(page.getByRole('button', { name: 'Revocation cert' })); })();
  gpgs('--import', revPath);
  ok(/^pub:r:/m.test(gpg('--list-keys', '--with-colons', 'Rex')), 'gpg imports the revocation certificate and marks the key revoked');

  // 10. RFC 9580: the v6 key of Annex A.4, AEAD messages
  await go('Decrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('textarea').first().fill(V('v6-seipdv2.asc'));
  await page.locator('textarea').nth(1).fill(V('v6-key.asc'));
  await page.getByRole('button', { name: 'Decrypt' }).last().click(); await page.waitForSelector('text=Decrypted text', { timeout: 30000 });
  ok(await page.getByRole('textbox', { name: 'Decrypted text' }).inputValue() === 'hello world\n', 'RFC 9580 Annex A.4: a message to the v6 key (SEIPD v2, AEAD) is decrypted');
  for (const f of ['aead-ocb.msg', 'aead-eax.msg']) {
    await go('Decrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
    await page.locator('textarea').first().fill(V(f)); await page.getByPlaceholder('Private key passphrase or message password').fill('password');
    await page.getByRole('button', { name: 'Decrypt' }).last().click(); await page.waitForSelector('text=Decrypted text', { timeout: 30000 });
    ok(await page.getByRole('textbox', { name: 'Decrypted text' }).inputValue() === 'Hello, world!', `RFC 9580 Appendix A: ${f.includes('ocb') ? 'OCB' : 'EAX'}-encrypted message with a password`);
  }
  await go('Verify'); await page.getByRole('radio', { name: 'Clear-signed text' }).click(); await page.getByRole('radio', { name: 'Text', exact: true }).click();
  await page.locator('textarea').first().fill(V('v6-clearsigned.asc')); await page.locator('textarea').last().fill(V('v6-key.asc'));
  await page.getByRole('button', { name: 'Verify' }).last().click(); await page.waitForSelector('text=Good signature from', { timeout: 15000 });
  ok(true, 'a clear-signed text of the v6 key verifies');
  // v6 keys made in the browser: there and back
  await go('Generate keys'); await page.getByPlaceholder('Your name').fill('Six'); await page.locator('input[type=password]').nth(0).fill('six'); await page.locator('input[type=password]').nth(1).fill('six');
  await page.getByRole('radio', { name: /RFC 9580 v6/ }).click(); await page.getByRole('button', { name: 'Generate key pair' }).click(); await page.waitForSelector('text=Your new key pair', { timeout: 30000 });
  const v6pub = await page.getByRole('textbox', { name: /Public key/ }).inputValue();
  const v6sec = readFileSync(await save(page.getByRole('button', { name: 'Private key (.asc)' })), 'utf8');
  await go('Encrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click(); await page.locator('textarea').first().fill('v6 round trip');
  await page.locator('textarea').nth(1).fill(v6pub); await page.getByRole('button', { name: 'Encrypt' }).last().click(); await page.waitForSelector('text=Encrypted', { timeout: 15000 });
  const v6msg = await page.locator('.outbox textarea').last().inputValue();
  await go('Decrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click(); await page.locator('textarea').first().fill(v6msg); await page.locator('textarea').nth(1).fill(v6sec);
  await page.getByPlaceholder('Private key passphrase or message password').fill('six'); await page.getByRole('button', { name: 'Decrypt' }).last().click(); await page.waitForSelector('text=Decrypted text', { timeout: 30000 });
  ok(await page.getByRole('textbox', { name: 'Decrypted text' }).inputValue() === 'v6 round trip', 'a v6 key made in the browser: encrypt and decrypt');

  // 11. phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(base + '#/pgp'); await ph.getByRole('radio', { name: 'Encrypt' }).waitFor();
  const m = await ph.evaluate(() => ({ wide: document.documentElement.scrollWidth <= innerWidth, seg: Math.min(...[...document.querySelectorAll('.seg-btn')].map((b) => b.getBoundingClientRect().height)) }));
  ok(m.wide && m.seg >= 44, `phone: no sideways scroll, switches ${Math.round(m.seg)} px high`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
  const real = page.errors.filter((e) => !/^Error: /.test(e) && !/Failed to load resource/.test(e));
  ok(!real.length, 'no page errors (refusals shown as toasts are logged by the button helper and left out) ' + real.join('|'));
};
