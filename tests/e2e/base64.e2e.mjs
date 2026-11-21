// Base64 (#/base64, PC only): text and files both ways on our Rust engine (devcore-enc). Encoding equals Node and
// Python; decoding takes Base64 as it turns up (URL-safe, no padding, MIME line breaks, percent-encoded, data: URLs,
// zero-width characters); a binary result is recognised (PNG…), shown as hex and saved under the right name; a file →
// data: URL → the same bytes back; long output is cut on screen but Copy and Download give all of it; wrong input says
// which character is wrong.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { pcOnlyOnPhone } from './_pconly.mjs';
import { REF, setValue, notes, until, hookClipboard, copied } from './_devdata.mjs';
const IMG = fileURLToPath(new URL('../fixtures/images/exif_gps.jpg', import.meta.url));
export default async (ctx) => {
  const { base, page: newPage, ok, download } = ctx;
  const page = await newPage(); await page.goto(`${base}#/base64`);
  const inp = page.getByLabel('Input'), out = page.getByLabel('Output');
  const sw = (t) => page.locator('label.switch').filter({ hasText: t });
  const outIs = (want) => until(page, (w) => document.querySelector('textarea[aria-label="Output"]').value === w, want);
  const noteHas = (re) => until(page, (s) => [...document.querySelectorAll('.note')].some((n) => new RegExp(s).test(n.textContent)), re.source);
  await inp.waitFor();
  const T = 'Hello, नमस्ते 👋';
  ok(await outIs(Buffer.from(T).toString('base64')) && /30 bytes → 40 characters of Base64/.test(await notes(page)), 'default text → Base64 (UTF-8), with the sizes');
  ok(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /devcore-enc-[\w-]+\.wasm/.test(r.name))), 'the engine is devcore-enc.wasm');
  const T2 = 'subjects?_d=1&x=>>>~~~';
  await sw('URL-safe').click(); await setValue(inp, T2); ok(await outIs(Buffer.from(T2).toString('base64url')), 'URL-safe alphabet, no padding');
  await sw('data: URL').click(); ok(await outIs(`data:text/plain;charset=utf-8;base64,${Buffer.from(T2).toString('base64')}`) && /a data: URL always uses the standard alphabet/.test(await notes(page)), 'text as a data: URL (standard alphabet, said so)');
  await sw('data: URL').click(); await sw('URL-safe').click();
  await setValue(inp, 'a\ud800b'); ok(await outIs(Buffer.from('a\ud800b').toString('base64')), 'half a surrogate pair is encoded as U+FFFD, like every UTF-8 encoder');
  await setValue(inp, ''); ok(await outIs('') && await page.locator('.note-warn').count() === 0, 'empty input: empty output, no error');
  let encOk = 0; const texts = REF.b64.filter((r, i) => i % 3 === 0 && r.hex);
  for (const r of texts) { await setValue(inp, Buffer.from(r.hex, 'hex').toString()); if (await outIs(r.std)) encOk++; }
  ok(encOk === texts.length, `${texts.length} texts encode to what Python's base64 gives (${encOk})`);
  // decoding
  await page.getByRole('radio', { name: 'Decode', exact: true }).click();
  ok(/Reads standard and URL-safe Base64, with or without padding, line breaks, and data: URLs/.test(await page.locator('.card').first().textContent()), 'Decode says what it accepts');
  for (const [b64, txt] of [[Buffer.from(T).toString('base64'), T], [Buffer.from(T2).toString('base64url'), T2], ['SGk', 'Hi'], ['  SGVs\nbG8=  ', 'Hello'], ['data:text/plain;base64,SGVsbG8=', 'Hello'], ['SGVsbG8==', 'Hello'], ['SGVsbG8%3D', 'Hello'], ['SGVsbG8=SGVsbG8=', 'HelloHello'], ['SGk=\u200b', 'Hi'], ['4pyT', '✓'], ['SGVsbG9=', 'Hello']]) {
    await setValue(inp, b64); ok(await outIs(txt) && /shown as UTF-8 text/.test(await notes(page)), `decode ${JSON.stringify(b64.slice(0, 34))} → ${JSON.stringify(txt)}`);
  }
  let decOk = 0, tried = 0;
  for (const [i, r] of REF.b64.entries()) {
    if (i % 2 || !r.hex) continue;
    const bytes = Buffer.from(r.hex, 'hex'), form = r.messy[i % r.messy.length];
    let isText = true; try { isText = !/[\u0000-\u0008\u000e-\u001f]/.test(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { isText = false; }
    tried++; await setValue(inp, form);
    if (await outIs(isText ? bytes.toString() : [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' '))) decOk++; else if (decOk === tried - 1) ok(false, `messy form ${JSON.stringify(form.slice(0, 60))} of ${r.hex.slice(0, 40)}: got ${JSON.stringify((await out.inputValue()).slice(0, 80))}`);
  }
  ok(decOk === tried, `${tried} byte strings in messy forms (MIME line breaks, URL-safe, percent-encoded, no padding, data: URL, spaced) decode to Python's bytes — text as text, binary as hex (${decOk})`);
  await setValue(inp, 'not base64!!'); ok(await noteHas(/Cannot decode: ' ' is not a character of this encoding|Cannot decode: '!' is not a character of this encoding/) && await out.inputValue() === '', 'invalid Base64: the wrong character is named, no stale output');
  await setValue(inp, 'S'); ok(await noteHas(/Cannot decode: 1 character cannot be whole bytes \(one is missing or extra\)/), 'a single character cannot be bytes');
  await setValue(inp, 'data:text/plain,hello'); ok(await noteHas(/this data: URL is not Base64/), 'a data: URL without ;base64 is explained');
  await setValue(inp, Buffer.from([0xff, 0xfe, 0x00, 0x80]).toString('base64')); ok(await outIs('ff fe 00 80') && /4 bytes of binary data\. Shown as hex; Download saves the file\./.test(await notes(page)), 'a binary (non-UTF-8) result is shown as hex and explained');
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await setValue(inp, PNG); ok(await noteHas(/70 bytes of binary data — it looks like a PNG image/), 'a decoded PNG is recognised');
  let f = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/decoded\.png$/.test(f) && readFileSync(f).equals(Buffer.from(PNG, 'base64')), 'Download saves it as decoded.png with the right bytes');
  await setValue(inp, 'SGVsbG8='); await outIs('Hello'); f = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/decoded\.txt$/.test(f) && readFileSync(f, 'utf8') === 'Hello', 'decoded text is saved as decoded.txt');
  await setValue(inp, ''); await outIs(''); await page.getByRole('button', { name: 'Download' }).click();
  ok(await until(page, () => /Nothing to save yet/.test(document.querySelector('.toasts')?.textContent || '')), 'Download with nothing decoded: a message');
  // files
  await page.getByRole('radio', { name: 'Encode', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(IMG);
  const bytes = readFileSync(IMG);
  ok(await outIs(`data:image/jpeg;base64,${bytes.toString('base64')}`) && await inp.inputValue() === `(file: exif_gps.jpg, ${bytes.length.toLocaleString('en-IN')} bytes)`, `a file becomes a data: URL of its bytes (${bytes.length} bytes)`);
  f = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/exif_gps\.jpg\.base64\.txt$/.test(f) && readFileSync(f, 'utf8') === `data:image/jpeg;base64,${bytes.toString('base64')}`, 'Download saves the text as <name>.base64.txt');
  await sw('data: URL').click(); ok(await outIs(bytes.toString('base64')), 'the data: URL form can be switched off for a file');
  await page.getByRole('radio', { name: 'Decode', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(f);
  ok(await noteHas(/it looks like a JPEG image/), 'the saved text file is read back in Decode');
  const back = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(/exif_gps\.jpg$/.test(back) && readFileSync(back).equals(bytes), 'and Download gives the original file back, under its own name');
  await page.locator('input[type=file]').setInputFiles(IMG);
  ok(await noteHas(/exif_gps\.jpg is not a text file — to turn it into Base64, switch to Encode/), 'a binary file in Decode: told to switch to Encode');
  await page.getByRole('radio', { name: 'Encode', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'a.bin', mimeType: '', buffer: Buffer.from([0, 1, 2, 255]) });
  ok(await outIs('data:application/octet-stream;base64,AAEC/w=='), 'a file without a type is application/octet-stream');
  await setValue(inp, 'typed again'); ok(await outIs(Buffer.from('typed again').toString('base64')) && await page.locator('.note-warn').count() === 0, 'typing ends the file — and the data: URL form it had switched on; no stale message');
  // a long result is cut on screen only
  await hookClipboard(page);
  const big = Buffer.alloc(3 * 1024 * 1024, 7);
  await page.locator('input[type=file]').setInputFiles({ name: 'big.bin', mimeType: 'application/octet-stream', buffer: big });
  ok(await noteHas(/Showing the first 2,00,000 of 41,94,341 characters — Copy and Download give all of it/) && (await out.inputValue()).length === 200000, 'a 3 MB file: the box shows the first 200,000 characters');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  ok(await until(page, () => window.__copied.length === 1) && (await copied(page))[0] === `data:application/octet-stream;base64,${big.toString('base64')}`, 'Copy gives the whole text');
  f = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(readFileSync(f, 'utf8').length === 4194341, 'Download gives the whole text');
  ok(!page.errors.filter((e) => !/Nothing to save/.test(e)).length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__superutilsLive().resources.length === 0), 'the engine is released when the tab is left');
  await pcOnlyOnPhone(ctx, 'base64');
};
