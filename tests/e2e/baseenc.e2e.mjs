// Base32 / Base58 / Ascii85 (#/baseenc, PC only): RFC 4648 vectors, Node's base64/base64url/hex, Python's base64
// (b32encode, b32hexencode, a85encode, b85?) for random bytes, Bitcoin Base58 vector, Base58Check checksum, Z85 spec
// vector, decode round trips, binary output as hex + download, file encoding, errors, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download } = ctx;
  const page = await newPage(); await page.goto(`${base}#/baseenc`);
  const src = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1); await src.waitFor();
  const enc = async (alg, s) => { await page.locator('select').selectOption(alg); await page.getByRole('radio', { name: 'Encode' }).click(); await src.fill(s); await page.waitForTimeout(250); return out.inputValue(); };
  const dec = async (alg, s) => { await page.locator('select').selectOption(alg); await page.getByRole('radio', { name: 'Decode' }).click(); await src.fill(s); await page.waitForTimeout(250); return out.inputValue(); };
  ok(await enc('base32', 'foobar') === 'MZXW6YTBOI======' && await enc('base32hex', 'foobar') === 'CPNMUOJ1E8======', 'RFC 4648 Base32 / Base32hex');
  ok(await enc('base58', 'Hello World!') === '2NEpo7TZRRrLZSi2U', 'Base58 (Bitcoin alphabet)');
  const py = (code, input) => execFileSync('python3', ['-c', code], { input }).toString();
  const txt = 'Namaste ₹ 😀 — ' + randomBytes(12).toString('hex');
  ok(await enc('base32', txt) === py('import base64,sys; sys.stdout.write(base64.b32encode(sys.stdin.buffer.read()).decode())', txt), 'Base32 = Python base64.b32encode');
  ok(await enc('base32hex', txt) === py('import base64,sys; sys.stdout.write(base64.b32hexencode(sys.stdin.buffer.read()).decode())', txt), 'Base32hex = Python b32hexencode');
  ok(await enc('ascii85', txt) === py('import base64,sys; sys.stdout.write(base64.a85encode(sys.stdin.buffer.read()).decode())', txt), 'Ascii85 = Python base64.a85encode');
  ok(await enc('base64', txt) === Buffer.from(txt).toString('base64') && await enc('base64url', txt) === Buffer.from(txt).toString('base64url') && await enc('base16', txt) === Buffer.from(txt).toString('hex').toUpperCase(), 'Base64 / Base64url / Base16 = Node Buffer');
  for (const alg of ['base32', 'base32hex', 'crockford', 'base58', 'base58check', 'ascii85', 'base64', 'base64url', 'base16']) { const e = await enc(alg, txt); ok(await dec(alg, e) === txt, `${alg}: decode(encode(text)) = text`); }
  ok(await dec('base32', 'mzxw6ytboi======') === 'foobar', 'Base32 decode ignores case');
  await dec('base58check', '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt'); ok(/checksum/.test(await page.locator('.note-warn').textContent()), 'Base58Check: bad checksum reported');
  await dec('base58', '0OIl'); ok(/Cannot decode/.test(await page.locator('.note-warn').textContent()), 'Base58 rejects 0 O I l');
  await dec('z85', 'HelloWorld'); ok(await out.inputValue() === '86 4f d2 6f b5 59 f7 5b' && /binary/.test(await page.locator('.note-info').first().textContent()), 'Z85 spec vector decodes to 86 4F D2 6F B5 59 F7 5B (binary shown as hex)');
  const bin = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(readFileSync(bin).toString('hex') === '864fd26fb559f75b', 'Download saves the decoded bytes');
  await enc('z85', 'abc'); ok(/multiple of 4/.test(await page.locator('.note-warn').textContent()), 'Z85 length rule');
  const f = join(tmp, 'rand.bin'), bytes = randomBytes(1000); writeFileSync(f, bytes);
  await page.locator('select').selectOption('base58'); await page.getByRole('radio', { name: 'Encode' }).click();
  await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(300);
  const e58 = await out.inputValue(); await page.getByRole('radio', { name: 'Decode' }).click(); await src.fill(e58); await page.waitForTimeout(300);
  ok((await out.inputValue()).replace(/ /g, '') === bytes.toString('hex'), '1,000 random bytes from a file → Base58 → back');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'baseenc');
};
