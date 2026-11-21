// OpenPGP (#/pgp), the "Latest standard (RFC 9580)" mode (owner, 21 Nov 2026) — the tab in the browser against two
// independent RFC 9580 implementations, through its own buttons and boxes: rPGP (rsop) and Sequoia PGP (sqop). A v6 key
// made in the tab is used by the tools and a tool's key by the tab; messages, the locked secret key, passwords, detached
// and clear-signed signatures go both ways; each result says its format. A GnuPG key in this mode gets SEIPDv1 (named),
// which gpg 2.4 decrypts; gpg cannot import the v6 key. The tools are found by $RSOP / $SQOP or on the PATH (see
// tests/unit/pgp9580.test.mjs for how to build them); their checks are skipped with a note where they are missing.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';

const find = (name, env) => {
  for (const p of [process.env[env], (() => { try { return execFileSync('sh', ['-c', `command -v ${name}`]).toString().trim(); } catch { return ''; } })()].filter(Boolean)) {
    try { if (/rfc9580/.test(execFileSync(p, ['list-profiles', 'generate-key']).toString())) return p; } catch { /* not this one */ }
  }
  return null;
};

export default async ({ base, page: newPage, ok, info, tmp: tmpRoot, download, devices }) => {
  const tmp = mkdtempSync(tmpRoot + '/pgp9580-');
  writeFileSync(`${tmp}/pw`, 'tab passphrase');
  const tools = [['rsop', 'RSOP'], ['sqop', 'SQOP']].map(([n, e]) => [n, find(n, e)]);
  const page = await newPage();
  const save = (btn) => download(page, () => btn.click());
  const body = () => page.locator('.tool-body').innerText();
  const LATEST = 'Latest standard (RFC 9580)';
  const go = async (op) => { await page.goto(base + '#/c/all'); await page.goto(base + '#/pgp'); await page.getByRole('radio', { name: LATEST }).click(); await page.getByRole('radio', { name: op }).click(); };
  const outbox = () => page.locator('.outbox textarea').last().inputValue();

  // the switch
  await page.goto(base + '#/pgp');
  ok(await page.getByRole('radio', { name: 'GnuPG-compatible', exact: true }).getAttribute('aria-checked') === 'true', 'GnuPG-compatible is the default — the tab as it was');
  await page.getByRole('radio', { name: LATEST }).click();
  ok(/GnuPG 2\.4 cannot/.test(await body()) && /Sequoia PGP, rPGP, GopenPGP and OpenPGP\.js/.test(await body()), 'the latest standard says who reads it, and that GnuPG 2.4 does not');

  // 1. a v6 key made in the tab
  await go('Generate keys');
  ok(/A v6 key \(RFC 9580\)/.test(await body()) && await page.getByRole('radio', { name: /RFC 9580 v6/ }).count() === 0, 'Generate in the latest standard: a v6 key, and no format choice (the GnuPG mode keeps its own)');
  await page.getByPlaceholder('Your name').fill('Tab Nine'); await page.getByPlaceholder('you@example.com').fill('tab9580@example.com');
  await page.locator('input[type=password]').nth(0).fill('tab passphrase'); await page.locator('input[type=password]').nth(1).fill('tab passphrase');
  await page.getByRole('button', { name: 'Generate key pair' }).click();
  await page.waitForSelector('text=Your new key pair', { timeout: 60000 });
  const card = await page.locator('.card', { hasText: 'Your new key pair' }).last().innerText();
  ok(/Ed25519 \(sign\) \+ X25519 \(encrypt\) · v6 \(RFC 9580\)/.test(card), 'the key: Ed25519 + X25519, v6');
  ok(/Argon2 \(3 passes, 4 lanes, 64 MiB\), then AES-256 in OCB mode \(AEAD\)/.test(card), 'its secret parts: Argon2, then AES-256 in OCB mode');
  ok(/([0-9A-F]{4} ){15}[0-9A-F]{4}/.test(card), 'a v6 fingerprint: 64 hex digits in groups of four');
  const pubPath = await save(page.getByRole('button', { name: 'Public key (.asc)' }));
  const secPath = await save(page.getByRole('button', { name: 'Private key (.asc)' }));

  // Ed448 too
  await go('Generate keys');
  await page.getByRole('radio', { name: /Ed448 \+ X448/ }).click();
  await page.getByPlaceholder('Your name').fill('Tab Four'); await page.locator('input[type=password]').nth(0).fill('p448'); await page.locator('input[type=password]').nth(1).fill('p448');
  await page.getByRole('button', { name: 'Generate key pair' }).click();
  await page.waitForSelector('text=Your new key pair', { timeout: 60000 });
  ok(/Ed448 \(sign\) \+ X448 \(encrypt\) · v6 \(RFC 9580\)/.test(await page.locator('.card', { hasText: 'Your new key pair' }).last().innerText()), 'Ed448 + X448 on request');

  // decrypt / encrypt / sign / verify through the tab's boxes
  const decryptText = async (armoredText, { key = secPath, pass = 'tab passphrase', verifyWith } = {}) => {
    await go('Decrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
    await page.locator('textarea').first().fill(armoredText);
    if (key) await page.locator('input[type=file]').nth(0).setInputFiles(key);
    await page.getByPlaceholder('Private key passphrase or message password').fill(pass);
    if (verifyWith) await page.locator('input[type=file]').nth(1).setInputFiles(verifyWith);
    await page.getByRole('button', { name: 'Decrypt' }).last().click();
    await page.waitForSelector('text=Decrypted text', { timeout: 60000 });
    return { text: await outbox(), shown: await body() };
  };
  const encryptText = async (text, { to, password, signWith, signPass } = {}) => {
    await go('Encrypt'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
    await page.locator('textarea').first().fill(text);
    if (password) { await page.getByRole('radio', { name: 'Password (symmetric)' }).click(); await page.getByPlaceholder('Password').fill(password); }
    else {
      await page.locator('textarea').nth(1).fill(readFileSync(to, 'utf8'));
      if (signWith) { await page.locator('textarea').nth(2).fill(readFileSync(signWith, 'utf8')); await page.getByPlaceholder('Private key passphrase').fill(signPass); }
    }
    await page.getByRole('button', { name: 'Encrypt' }).last().click();
    await page.waitForSelector('text=Format:', { timeout: 60000 });
    return { armored: await outbox(), shown: await body() };
  };

  for (const [tool, exe] of tools) {
    if (!exe) { ok(true, `${tool} (an RFC 9580 SOP tool) not found — set ${tool.toUpperCase()} or put it on the PATH; its checks are skipped`); continue; }
    const sop = (args, input) => execFileSync(exe, args, { input, cwd: tmp, maxBuffer: 1 << 26 });
    const version = execFileSync(exe, ['version', '--extended']).toString().split('\n').filter((l) => /rpgp|Sequoia/.test(l)).join(', ');
    info(`${tool}: ${version}`);
    // the tool's own key
    const tkey = sop(['generate-key', '--profile', 'rfc9580', `${tool} <${tool}@example.com>`]).toString();
    writeFileSync(`${tmp}/${tool}.key`, tkey); writeFileSync(`${tmp}/${tool}.cert`, sop(['extract-cert'], tkey));

    // a) the tool encrypts to the tab's key and signs → the tab decrypts and verifies
    const fromTool = sop(['encrypt', '--profile', 'rfc9580', '--sign-with', `${tool}.key`, pubPath], `hello from ${tool}\n`).toString();
    const a = await decryptText(fromTool, { verifyWith: `${tmp}/${tool}.cert` });
    ok(a.text === `hello from ${tool}\n`, `${tool} encrypts to the tab's v6 key → the tab decrypts`);
    ok(/Format: SEIPDv2 — AES-\d+ in OCB mode \(AEAD, RFC 9580\) · v6 session key/.test(a.shown), `… the tab says its format: ${(a.shown.match(/Format: [^\n]*/) || [''])[0]}`);
    ok(/Good signature from/.test(a.shown) && /v6 signature \(RFC 9580\) · Ed25519/.test(a.shown), `… and the tool's v6 signature inside it is good`);
    info(`${tool} → tab: ${(a.shown.match(/Format: [^\n]*/) || ['?'])[0]}`);

    // b) the tab encrypts (and signs) to the tool's key → the tool decrypts and verifies
    const b = await encryptText(`hello ${tool}, from the tab\n`, { to: `${tmp}/${tool}.cert`, signWith: secPath, signPass: 'tab passphrase' });
    ok(/Format: SEIPDv2 — AES-\d+ in OCB mode/.test(b.shown) && !/older SEIPDv1/.test(b.shown), `the tab encrypts to ${tool}'s v6 key: ${(b.shown.match(/Format: [^\n]*/) || [''])[0]}`);
    info(`tab → ${tool}: ${(b.shown.match(/Format: [^\n]*/) || ['?'])[0]}`);
    writeFileSync(`${tmp}/tab-signer.cert`, readFileSync(pubPath));
    const bd = sop(['decrypt', '--verify-with', 'tab-signer.cert', '--verifications-out', `${tool}-ver.txt`, `${tool}.key`], b.armored).toString();
    ok(bd.replace(/\r\n/g, '\n') === `hello ${tool}, from the tab\n`, `${tool} decrypts the tab's message`);
    ok(/\S/.test(readFileSync(`${tmp}/${tool}-ver.txt`, 'utf8')), `${tool} verifies the tab's v6 signature inside it`);

    // c) passwords both ways
    const c = await encryptText('a password message\n', { password: 'tab passphrase' });
    ok(/password \(v6 session key, Argon2 \(3 passes, 4 lanes, 64 MiB\)\)/.test(c.shown), 'a password message: a v6 session key through Argon2');
    ok(sop(['decrypt', '--with-password', 'pw'], c.armored).toString().replace(/\r\n/g, '\n') === 'a password message\n', `${tool} decrypts the tab's password message`);
    const c2 = await decryptText(sop(['encrypt', '--profile', 'rfc9580', '--with-password', 'pw'], `${tool} password\n`).toString(), { key: null });
    ok(c2.text === `${tool} password\n` && /Format: SEIPDv2/.test(c2.shown), `the tab decrypts ${tool}'s password message (${(c2.shown.match(/Format: [^\n]*/) || [''])[0]})`);
    info(`${tool} password → tab: ${(c2.shown.match(/Format: [^\n]*/) || ['?'])[0]}`);

    // d) the tab signs → the tool verifies (clear-signed and detached)
    await go('Sign'); await page.getByRole('radio', { name: 'Text', exact: true }).click();
    await page.locator('textarea').first().fill(`signed for ${tool}`);
    await page.locator('input[type=file]').nth(0).setInputFiles(secPath);
    await page.getByPlaceholder('Private key passphrase').fill('tab passphrase');
    await page.getByRole('radio', { name: 'Clear-signed text' }).click();
    await page.getByRole('button', { name: 'Sign' }).last().click();
    await page.waitForSelector('text=Made:', { timeout: 30000 });
    ok(/Made: v6 signature \(RFC 9580\) · Ed25519 · SHA-512/.test(await body()), 'clear-signed in the tab: a v6 Ed25519 signature with SHA-512');
    const cs = await outbox();
    ok(sop(['inline-verify', 'tab-signer.cert'], cs).toString().replace(/\r?\n$/, '') === `signed for ${tool}`, `${tool} verifies the tab's clear-signed text`);
    writeFileSync(`${tmp}/data.txt`, `data for ${tool}\n`);
    await go('Sign');
    await page.locator('input[type=file]').nth(0).setInputFiles(`${tmp}/data.txt`);
    await page.locator('input[type=file]').nth(1).setInputFiles(secPath);
    await page.getByPlaceholder('Private key passphrase').fill('tab passphrase');
    const sigPath = await save(page.getByRole('button', { name: 'Sign' }).last());
    ok(/v6 signature \(RFC 9580\)/.test(await body()), 'a detached signature: the tab says it is v6');
    let good = true; try { sop(['verify', sigPath, 'tab-signer.cert'], readFileSync(`${tmp}/data.txt`)); } catch { good = false; }
    ok(good, `${tool} verifies the tab's detached signature`);

    // e) the tool signs → the tab verifies
    writeFileSync(`${tmp}/tool-data.txt`, `data from ${tool}\n`);
    writeFileSync(`${tmp}/tool.sig`, sop(['sign', `${tool}.key`], readFileSync(`${tmp}/tool-data.txt`)));
    await go('Verify');
    await page.locator('input[type=file]').nth(0).setInputFiles(`${tmp}/tool-data.txt`);
    await page.locator('input[type=file]').nth(1).setInputFiles(`${tmp}/tool.sig`);
    await page.locator('input[type=file]').nth(2).setInputFiles(`${tmp}/${tool}.cert`);
    await page.getByRole('button', { name: 'Verify' }).last().click();
    await page.waitForSelector('text=Good signature from', { timeout: 30000 });
    ok(/v6 signature \(RFC 9580\) · Ed25519/.test(await body()), `the tab verifies ${tool}'s detached signature and says it is v6`);
  }

  // a GnuPG key in the latest-standard mode: SEIPDv1, said and named; gpg 2.4 reads it, but cannot import the v6 key
  let gpgOk = true; try { execFileSync('gpg', ['--version']); } catch { gpgOk = false; }
  if (gpgOk) {
    const GNUPGHOME = mkdtempSync(tmpRoot + '/gnupg9580-');
    const gpg = (...a) => execFileSync('gpg', ['--batch', '--yes', '--pinentry-mode', 'loopback', ...a], { env: { ...process.env, GNUPGHOME }, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    gpg('--passphrase', 'gnupass', '--quick-generate-key', 'Gnu User <gnu@example.com>', 'future-default', 'default', 'never');
    writeFileSync(`${tmp}/gnu.pub.asc`, gpg('--armor', '--export', 'gnu@example.com'));
    const g = await encryptText('to gnupg, from the latest-standard mode\n', { to: `${tmp}/gnu.pub.asc` });
    ok(/Format: SEIPDv1/.test(g.shown) && /Gnu User <gnu@example\.com>: this key does not offer SEIPDv2 \(v4\)/.test(g.shown), 'to a GnuPG key: SEIPDv1, and the tab names the key that does not offer SEIPDv2');
    writeFileSync(`${tmp}/to-gnu.asc`, g.armored);
    ok(execFileSync('gpg', ['--batch', '--pinentry-mode', 'loopback', '--passphrase', 'gnupass', '--decrypt', `${tmp}/to-gnu.asc`], { env: { ...process.env, GNUPGHOME }, stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/\r\n/g, '\n') === 'to gnupg, from the latest-standard mode\n', 'gpg 2.4 decrypts it');
    let imported = true; try { gpg('--import', pubPath); } catch { imported = false; }
    info(`gpg 2.4 ${imported ? 'imported' : 'refused'} the tab's v6 key (the tab says GnuPG 2.4 cannot read v6 keys)`);
    ok(!imported || !/tab9580@example\.com/.test(gpg('--list-keys')), 'gpg 2.4 does not take the v6 key — as the tab says');
  } else ok(true, 'gpg not installed — the GnuPG checks of this mode are skipped');

  ok(page.errors.length === 0, `no page errors ${page.errors.join(' | ')}`);

  // phone: the switch fits
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pgp');
  await phone.getByRole('radio', { name: LATEST }).click();
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no sideways scroll with the standard switch');
};
