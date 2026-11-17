// Base32 / Base58 / Ascii85 (#/baseenc, PC only): RFC 4648 vectors, Node's base64/base64url/hex, Python's base64
// (b32encode, b32hexencode, a85encode, b85?) for random bytes, Bitcoin Base58 vector, Base58Check checksum, Z85 spec
// vector, decode round trips, binary output as hex + download, file encoding, errors; binary files from the reference
// fixture (tests/fixtures/enc/reference.json) in every encoding; text as people paste it (no padding, spaces, lower
// case, 0x / colons, data: URLs); a 9 MB file (it used to trap the engine at 8 MiB) with a cut display and a complete
// download; decoding a saved file back to the original name and bytes; Base58 kept to short values; phone note.
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
  // ---- binary files in every encoding = the reference (Python base64 + spec implementations)
  const ref = JSON.parse(readFileSync(new URL('../fixtures/enc/reference.json', import.meta.url), 'utf8')).rows;
  const note = () => page.locator('.tool-body .card .note').allTextContents();
  const pick = async (f) => { await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(250); };
  await page.getByRole('radio', { name: 'Encode' }).click();
  const ALG = ['base16', 'base32', 'base32hex', 'crockford', 'base58', 'base58check', 'ascii85', 'z85', 'base64', 'base64url'], wrong = [];
  for (const row of [ref[5], ref[37], ref[44], ref[130]]) { const fb = join(tmp, `ref-${row.hex.length}.bin`); writeFileSync(fb, Buffer.from(row.hex, 'hex')); await pick(fb);
    for (const alg of ALG) { await page.locator('select').selectOption(alg); await page.waitForTimeout(80); const got = await out.inputValue(); if (row[alg] === null ? !/multiple of 4/.test((await note()).join(' ')) : got !== row[alg]) wrong.push(`${alg} of ${row.hex.length / 2} bytes`); } }
  ok(!wrong.length, `4 binary files × 10 encodings = the reference text (Z85 refuses lengths that are not a multiple of 4) ${wrong.slice(0, 3).join(', ')}`);
  // ---- text as people paste it
  const hexOut = async () => (await out.inputValue()).replace(/ /g, '');
  for (const [alg, text, want] of [['base32', 'MZXW6', 'foo'], ['base32', 'mzxw6ytboi', 'foobar'], ['base32', 'MZ XW 6Y TB OI ==', 'foobar'], ['base32', 'JBSW Y3DP EHPK 3PXP', null], ['base32hex', 'cpnmu', 'foo'], ['base64', 'Zm9vYg', 'foob'], ['base64', 'Zm9v\nYmFy', 'foobar'],
    ['base64', 'data:text/plain;base64,Zm9v', 'foo'], ['base64', '-_8', null], ['base64url', '+/8=', null], ['base16', '66:6f:6f', 'foo'], ['base16', '0x66, 0x6f, 0x6f', 'foo'], ['base16', '\\x66\\x6f\\x6f', 'foo'], ['base16', '666F 6f', 'foo'], ['crockford', 'csqp-yrk1-e8', 'foobar'], ['crockford', 'CSQPYRKLE8', 'foobar'], ['ascii85', '<~87cURD]i,"Ebo80~>', 'Hello World!']]) {
    const got = await dec(alg, text); ok(want === null ? !(await page.locator('.note-warn').count()) && (await hexOut()).length > 0 : got === want, `${alg} decode of ${JSON.stringify(text)} → ${want ?? 'bytes'} (${got.slice(0, 30)}${(await page.locator('.note-warn').count()) ? ` — ${await page.locator('.note-warn').textContent()}` : ''})`); }
  ok(await dec('base32', 'JBSWY3DPEHPK3PXP') === '48 65 6c 6c 6f 21 de ad be ef', 'a TOTP-style secret (no padding) decodes; binary shown as hex');
  // ---- errors name the problem
  for (const [alg, text, re] of [['base32', '0ZXW6===', /'0' is not a character of this encoding/], ['base32', 'M', /cannot be whole bytes/], ['base64', 'Zm9!', /'!' is not a character/], ['base64', 'Zm9vY', /cannot be whole bytes/], ['base16', '6', /two digits per byte/], ['base16', '6g', /'g' is not/],
    ['base64', 'data:text/plain,hello', /not Base64/], ['z85', 'Hélo!', /'é'/], ['ascii85', 's8W-"', /overflows/], ['crockford', 'CSQPYRKUE8', /'U' is not/], ['base58check', '11', /too short/]]) { await dec(alg, text); const w = await page.locator('.note-warn').textContent().catch(() => ''); ok(re.test(w) && await out.inputValue() === '', `${alg} "${text}": ${w.replace('Cannot decode: ', '')}`); }
  ok(await dec('base64', '') === '' && /^0 bytes$/.test((await note()).join('')) && !(await page.locator('.note-warn').count()), 'nothing in → 0 bytes, no error');
  // ---- a 9 MB file: no trap at 8 MiB, display cut, download complete
  const big = Buffer.alloc((9 << 20) + 3); for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) >>> 24; const fbig = join(tmp, 'big.bin'); writeFileSync(fbig, big);
  await page.getByRole('radio', { name: 'Encode' }).click(); await page.locator('select').selectOption('base64');
  let t0 = Date.now(); await page.locator('.drop input[type=file]').setInputFiles(fbig); await page.waitForFunction(() => /94,37,187 bytes →/.test(document.querySelector('.tool-body .card .note')?.textContent || '') || document.querySelector('.note-warn'), null, { timeout: 60000 });
  const n9 = await note(); ok(/94,37,187 bytes → 1,25,82,916 characters/.test(n9[0]) && /Showing the first 2,00,000 of 1,25,82,916 characters/.test(n9[1]) && (await out.inputValue()).length === 200000, `9 MB file → Base64 in ${Date.now() - t0} ms; the box shows the first 2,00,000 characters (${n9[0]}) — 8 MiB and more used to fail with "unreachable"`);
  const d64 = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/big\.bin\.base64\.txt$/.test(d64) && readFileSync(d64, 'utf8') === big.toString('base64'), 'Download gives all 12.6 million characters, equal to Node’s Base64');
  for (const alg of ['base16', 'base32', 'ascii85']) { const before = (await note())[0]; await page.locator('select').selectOption(alg); await page.waitForFunction((b) => { const t = document.querySelector('.tool-body .card .note')?.textContent || ''; return (/→/.test(t) && t !== b) || document.querySelector('.note-warn'); }, before, { timeout: 60000 }); ok(!(await page.locator('.note-warn').count()) && (await out.inputValue()).length === 200000, `9 MB file → ${alg} (${(await note())[0]})`); }
  // decode the saved file again: original name, original bytes
  await page.locator('select').selectOption('base64'); await page.getByRole('radio', { name: 'Decode' }).click();
  await page.locator('.drop input[type=file]').setInputFiles({ name: 'big.bin.base64.txt', mimeType: 'text/plain', buffer: readFileSync(d64) }); await page.waitForFunction(() => /94,37,187 bytes \(binary/.test(document.querySelector('.tool-body .card .note')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
  ok(/94,37,187 bytes \(binary/.test((await note())[0]) && /Showing the first 50,000 of 94,37,187 bytes as hex/.test((await note())[1]), `the saved text file decodes (${(await note())[0]})`);
  const back = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(readFileSync(back).equals(big), 'decoded download = the original 9 MB, byte for byte');
  const own = join(tmp, 'photo.png.base32.txt'); writeFileSync(own, 'RFIE4RYNBINAU==='); await page.locator('select').selectOption('base32'); await pick(own);
  const b2 = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(/photo\.png$/.test(b2) && readFileSync(b2).toString('hex') === '89504e470d0a1a0a', 'a file this tab made (photo.png.base32.txt) decodes back to photo.png');
  await pick(fbig); ok(/big\.bin is not a text file — to turn it into Base32 \(RFC 4648\), switch to Encode/.test(await page.locator('.note-warn').textContent()), 'a binary file chosen in Decode says what to do (it used to switch modes by itself)');
  // ---- Base58 is for short values
  await page.getByRole('radio', { name: 'Encode' }).click(); await page.locator('select').selectOption('base58'); await page.waitForTimeout(200);
  ok(/Base58 is meant for short values such as keys and addresses \(up to 10,000 bytes\); this is 94,37,187 bytes/.test(await page.locator('.note-warn').textContent()), 'Base58 of a 9 MB file is refused at once (it would freeze the page for hours)');
  const f10 = join(tmp, 'tenk.bin'); writeFileSync(f10, randomBytes(10000)); t0 = Date.now(); await pick(f10); await page.waitForFunction(() => /→/.test(document.querySelector('.tool-body .card .note')?.textContent || ''), null, { timeout: 30000 });
  ok(Date.now() - t0 < 8000 && (await out.inputValue()).length > 13000, `10,000 bytes (the limit) → Base58 in ${Date.now() - t0} ms`);
  await src.fill('hello'); await page.waitForTimeout(250); const dname = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(/encoded\.base58\.txt$/.test(dname) && readFileSync(dname, 'utf8') === 'Cn8eVZg', 'typing after a file forgets the file (download: encoded.base58.txt)');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {}); await page.getByRole('button', { name: 'Copy', exact: true }).click(); const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null); if (clip !== null) ok(clip === 'Cn8eVZg', 'Copy');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'baseenc');
};
