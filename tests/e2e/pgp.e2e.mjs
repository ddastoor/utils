// OpenPGP interop with GnuPG (both directions). Skips gracefully if gpg is not installed.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
export default async ({ base, page: newPage, ok, tmp: tmpRoot, download }) => {
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
  
  
  ok(!page.errors.length, 'no page errors ' + page.errors.join('|'));
};
