// Sodium Encrypt (#/sodium): text and file round trips (multi-chunk), the USODIUM1 header fields per strength, the
// independent PyNaCl reference decryptor (tools/sodium_decrypt.py) opening our files, wrong password, tampering and
// truncation detected, password checks.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
const ROOT = new URL('../../', import.meta.url).pathname;
export default async ({ base, page: newPage, ok, info, download, tmp, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/sodium`);
  const pw = page.locator('input[aria-label="Password"]'), pw2 = page.locator('input[aria-label="Confirm password"]');
  const seg = (n) => page.getByRole('radio', { name: n, exact: true }).click();
  const run = () => page.locator('.actions').getByRole('button').first().click();
  const toastText = async () => (await page.locator('.toast').last().textContent({ timeout: 30000 })).trim();
  const fv = (pg, l) => pg.locator('.field').filter({ has: pg.locator('.field-label', { hasText: new RegExp(`^${l.replace(/[()]/g, '\\$&')}$`) }) }).locator('textarea').first();
  await pw.waitFor();
  // text
  await seg('Text'); await seg('Fast (64 MiB)');
  const MSG = 'Meet at Churchgate 6 pm — नमस्ते 👋';
  await fv(page, 'Text to encrypt').fill(MSG); await pw.fill('correct horse 123'); await pw2.fill('correct horse 123');
  await run();
  const ct = await fv(page, 'Encrypted text — share this').inputValue({ timeout: 60000 });
  const blob = Buffer.from(ct, 'base64');
  ok(blob.subarray(0, 8).toString() === 'USODIUM1' && blob[8] === 2 && blob.readUInt32LE(9) === 2 && blob.readUInt32LE(13) === 65536 && blob.readUInt32LE(17) === 65536, 'header: magic, Argon2id, ops 2, 64 MiB, 64 KiB chunks');
  ok(blob.length === 61 + Buffer.byteLength(MSG) + 17, `size = 61-byte header + text + 17 bytes (${blob.length})`);
  ok(!ct.includes(Buffer.from(MSG).toString('base64').slice(0, 10)), 'ciphertext does not contain the text');
  const py = spawnSync('python3', [join(ROOT, 'tools/sodium_decrypt.py'), '--text', ct], { input: 'correct horse 123\n', encoding: 'utf8' });
  if (py.error || /No module named 'nacl'/.test(py.stderr)) info('PyNaCl not installed — reference decryptor check skipped');
  else ok(py.stdout.trim() === MSG, `reference PyNaCl decryptor reads our text (${py.stdout.trim().slice(0, 20)}…)${py.status ? ` — it ended with ${py.status}: ${py.stderr.trim().split('\n').pop()}` : ''}`);
  const ac = [await pw.getAttribute('autocomplete')];
  await seg('Decrypt'); ac.push(await pw.getAttribute('autocomplete'));
  ok(ac.join() === 'new-password,off', `the password box: a new password when encrypting, not one the browser offers to make up when decrypting (it was new-password in both): ${ac}`);
  await fv(page, 'Encrypted text (Base64)').fill(ct); await pw.fill('correct horse 123'); await run();
  ok(await fv(page, 'Decrypted text').inputValue({ timeout: 60000 }) === MSG, 'decrypt text round trip');
  await fv(page, 'Encrypted text (Base64)').fill(ct); await pw.fill('wrong password'); await run();
  ok(/password|corrupt|tamper/i.test(await toastText()), `wrong password reported (${await toastText()})`);
  // files: 300 KiB random (5 chunks), Strong preset
  await seg('Encrypt'); await seg('File'); await seg('Strong (256 MiB)');
  const data = randomBytes(300 * 1024 + 123), src = join(tmp, 'data.bin'); writeFileSync(src, data);
  await page.locator('input[type=file]').setInputFiles(src);
  await pw.fill('another secret 456'); await pw2.fill('another secret 456');
  const enc = await download(page, run);
  const e = readFileSync(enc);
  ok(/data\.bin\.usodium$/.test(enc) && e.readUInt32LE(9) === 3 && e.readUInt32LE(13) === 262144 && e.length === 61 + data.length + 5 * 17, `file encrypted: ops 3, 256 MiB, 5 chunks (${e.length} bytes)`);
  const out = join(tmp, 'py.bin');
  const py2 = spawnSync('python3', [join(ROOT, 'tools/sodium_decrypt.py'), enc, out], { input: 'another secret 456\n', encoding: 'utf8' });
  // (on a machine short of memory Argon2's 256 MiB may not be had: the decryptor's own message is shown, not a crash)
  if (!py2.error && !/No module named/.test(py2.stderr)) ok(existsSync(out) && readFileSync(out).equals(data), `reference PyNaCl decryptor restores the exact file${py2.status ? ` — it ended with ${py2.status}: ${py2.stderr.trim().split('\n').pop()}` : ''}`);
  await seg('Decrypt');
  await page.locator('input[type=file]').setInputFiles(enc); await pw.fill('another secret 456');
  const dec = await download(page, run);
  ok(readFileSync(dec).equals(data) && /data\.bin$/.test(dec), 'decrypt file round trip, name without .usodium');
  const bad = Buffer.from(e); bad[61 + 70000] ^= 1; const badF = join(tmp, 'tampered.bin.usodium'); writeFileSync(badF, bad);
  await page.locator('input[type=file]').setInputFiles(badF); await run();
  ok(/password|corrupt|tamper|damaged/i.test(await toastText()), `one flipped bit detected (${await toastText()})`);
  const cut = e.subarray(0, 61 + 4 * (65536 + 17)), cutF = join(tmp, 'cut.bin.usodium'); writeFileSync(cutF, cut);
  await page.locator('input[type=file]').setInputFiles(cutF); await run();
  ok(/truncat|incomplete|corrupt|damaged/i.test(await toastText()), `truncated file detected (${await toastText()})`);
  await seg('Encrypt'); await seg('Text');
  await fv(page, 'Text to encrypt').fill('x'); await pw.fill('abcdefgh1'); await pw2.fill('abcdefgh2'); await run();
  ok(/do not match/.test(await toastText()), 'password mismatch refused');
  await pw.fill(''); await run(); ok(/Enter a password/.test(await toastText()), 'empty password refused');
  const unexpected = page.errors.filter((e) => !/password|corrupt|tamper|damaged|truncat|incomplete|do not match|Enter a password|Base64/i.test(e)); // the button helper also logs the expected messages
  ok(!unexpected.length, `no unexpected page errors ${unexpected.join(' | ')}`);
  // ---- Nov 2026 bug hunt: the engine is libsodium.js; encrypted text as people paste it; a .txt file of it; Maximum
  ok(/libsodium 1\.0\.22\)/.test(await page.locator('.note').last().textContent()), `the note names the engine's libsodium after a run (${(await page.locator('.note').last().textContent()).slice(0, 80)})`);
  await seg('Decrypt'); await seg('Text');
  const urlSafe = ct.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  for (const [label, v] of [['broken over lines', ct.replace(/(.{40})/g, '$1\n')], ['in quotation marks', `"${ct}"`], ['a whole share link', `https://ddastoor.github.io/utils/#/sharelink?d=${urlSafe}`]]) {
    await fv(page, 'Decrypted text').evaluate((e) => { e.value = ''; }).catch(() => {});
    await fv(page, 'Encrypted text (Base64)').fill(v); await pw.fill('correct horse 123'); await run();
    ok(await fv(page, 'Decrypted text').inputValue({ timeout: 60000 }) === MSG, `encrypted text ${label} is read (it gave the browser's "Failed to execute 'atob'")`);
  }
  await fv(page, 'Encrypted text (Base64)').fill('hello there!'); await pw.fill('x'); await run();
  ok(/it holds characters Base64 does not use \(!\)/.test(await toastText()), `text that is not Base64: said in words (${await toastText()})`);
  await fv(page, 'Encrypted text (Base64)').fill('SGVsbG8gd29ybGQ='); await run();
  ok(/That is Base64, but not text encrypted by Sodium Encrypt/.test(await toastText()), 'Base64 of something else: said');
  await seg('File'); const txt = join(tmp, 'mail.txt'); writeFileSync(txt, `\ufeff${ct.replace(/(.{76})/g, '$1\r\n')}\r\n`);
  await page.locator('input[type=file]').setInputFiles(txt); await pw.fill('correct horse 123');
  const fromTxt = await download(page, run);
  ok(readFileSync(fromTxt, 'utf8') === MSG, 'a .txt file holding the encrypted text decrypts (it was "Not a Sodium Encrypt file")');
  // the same text saved by Notepad as "Unicode" (UTF-16 LE with its mark, CR LF) — to-do #13
  const txt16 = join(tmp, 'mail-unicode.txt'); writeFileSync(txt16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${ct.replace(/(.{76})/g, '$1\r\n')}\r\n`, 'utf16le')]));
  await page.locator('input[type=file]').setInputFiles(txt16); await pw.fill('correct horse 123');
  const from16 = await download(page, run);
  ok(readFileSync(from16, 'utf8') === MSG, 'the encrypted text in a UTF-16 file (Notepad\'s "Unicode") decrypts too');
  // Maximum (1 GiB) on a desktop: there and back
  await seg('Encrypt'); await seg('Text'); await seg('Maximum (1 GiB)');
  await fv(page, 'Text to encrypt').fill('the most careful setting'); await pw.fill('max setting 789'); await pw2.fill('max setting 789'); await run();
  const big = await fv(page, 'Encrypted text — share this').inputValue({ timeout: 120000 });
  const bb = Buffer.from(big, 'base64');
  ok(bb.readUInt32LE(9) === 4 && bb.readUInt32LE(13) === 1048576, 'Maximum: ops 4 and 1 GiB in the header');
  await seg('Decrypt'); await fv(page, 'Encrypted text (Base64)').fill(big); await pw.fill('max setting 789'); await run();
  ok(await fv(page, 'Decrypted text').inputValue({ timeout: 120000 }) === 'the most careful setting', '… and it decrypts (1 GiB of Argon2id in the browser\'s worker)');
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/sodium`); await ph.locator('input[aria-label="Password"]').waitFor();
  ok(!(await ph.getByRole('radio', { name: 'Maximum (1 GiB)' }).count()) && await ph.getByRole('radio', { name: 'Fast (64 MiB)' }).isChecked(), 'phone: 1 GiB preset hidden, Fast by default');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
