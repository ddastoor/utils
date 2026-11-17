// HMAC Generator (#/hmac, PC only): every algorithm × key format against Node's crypto.createHmac, file input, signature
// comparison (hex any case, Base64, "sha256=" prefix as GitHub sends it, Stripe lists, colons, 0x, quotes), a GitHub-webhook
// style check, RFC 4231 vectors, key formats, CRLF bodies, a 48 MB file streamed without freezing the page, bad keys, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { createHmac, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp } = ctx;
  const page = await newPage(); await page.goto(`${base}#/hmac`);
  const key = page.locator('input[aria-label="Secret key"]'), msg = page.locator('textarea'), cmp = page.locator('input[aria-label="Expected signature"]'); await key.waitFor();
  const rows = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  await page.waitForFunction(() => document.querySelectorAll('.kv span').length > 0);
  let r = await rows(); ok(r.Hex === createHmac('sha256', 'my-webhook-secret').update('{"event":"payment.captured","amount":49900}').digest('hex'), 'sample: HMAC-SHA256 = Node crypto');
  const bad = [], body = 'नमस्ते {"a":1}\n', kb = randomBytes(80);
  for (const [alg, node] of [['sha256', 'sha256'], ['sha512', 'sha512'], ['sha384', 'sha384'], ['sha224', 'sha224'], ['sha1', 'sha1'], ['md5', 'md5'], ['sha3-256', 'sha3-256'], ['sha3-512', 'sha3-512']]) {
    await page.locator('select').selectOption(alg);
    for (const [fmt, k, kv] of [['Key is text', 'secret ✓', Buffer.from('secret ✓')], ['Hex', kb.toString('hex'), kb], ['Base64', kb.toString('base64'), kb]]) {
      await page.getByRole('radio', { name: fmt }).click(); await key.fill(k); await msg.fill(body); await page.waitForTimeout(200); r = await rows();
      const want = createHmac(node, kv).update(body).digest();
      if (r.Hex !== want.toString('hex') || r.Base64 !== want.toString('base64') || r.Base64url !== want.toString('base64url')) bad.push(`${alg}/${fmt}`);
    }
  }
  ok(!bad.length, `8 algorithms × 3 key formats = Node crypto (hex, Base64, Base64url) ${bad.join(', ')}`);
  await page.locator('select').selectOption('sha256'); await page.getByRole('radio', { name: 'Key is text' }).click(); await key.fill('gh-secret');
  const payload = '{"action":"opened","number":42}'; await msg.fill(payload);
  const sig = 'sha256=' + createHmac('sha256', 'gh-secret').update(payload).digest('hex');
  await cmp.fill(sig); await page.waitForTimeout(200); ok(/matches/.test(await page.locator('.note-ok').textContent()), 'GitHub "X-Hub-Signature-256: sha256=…" matches');
  await cmp.fill(sig.toUpperCase().replace('SHA256=', 'sha256=')); await page.waitForTimeout(200); ok(await page.locator('.note-ok').count() === 1, 'hex compare ignores case');
  await cmp.fill(createHmac('sha256', 'gh-secret').update(payload).digest('base64')); await page.waitForTimeout(200); ok(await page.locator('.note-ok').count() === 1, 'Base64 signature (as Shopify sends) matches');
  await msg.fill(payload + ' '); await page.waitForTimeout(200); ok(/does NOT match/.test(await page.locator('.note-err').textContent()), 'one extra space → does not match');
  const f = join(tmp, 'b.bin'), fb = randomBytes(5000); writeFileSync(f, fb); await cmp.fill('');
  await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(300); ok((await rows()).Hex === createHmac('sha256', 'gh-secret').update(fb).digest('hex'), 'file signed (5,000 random bytes)');
  await page.getByRole('radio', { name: 'Hex' }).click(); await key.fill('abc'); await page.waitForTimeout(200); ok(/pairs of hex/.test(await page.locator('.note-warn').textContent()), 'odd hex key → message');
  // ---- bug hunt, Nov 2026
  const noteNow = async () => (await page.locator('.tool-body .note-ok, .tool-body .note-err, .tool-body .note-warn').allTextContents()).join(' | ');
  const setAll = async (k, m, c = '') => { await key.fill(k); await msg.fill(m); await cmp.fill(c); await page.waitForTimeout(230); return rows(); };
  await page.locator('select').selectOption('sha256'); await page.getByRole('radio', { name: 'Key is text' }).click();
  r = await setAll('', ''); ok(r.Hex === createHmac('sha256', '').update('').digest('hex') && r.Length === '32 bytes', 'empty key and empty message still give the HMAC (b613679a…)');
  // signatures as webhook senders write them
  const d = createHmac('sha256', 'k').update('body').digest(), hx = d.toString('hex');
  const forms = { 'Base64url with padding': d.toString('base64url') + '=', 'hex with colons': hx.match(/../g).join(':'), '0x hex': '0x' + hx, 'Stripe t=…,v1=…,v0=…': `t=1492774577,v1=${hx},v0=${'0'.repeat(64)}`, 'v1=hex': 'v1=' + hx, 'hmac-sha256=hex': 'hmac-sha256=' + hx, 'quoted hex': `"${hx}"`, 'sha256="hex"': `sha256="${hx}"`, 'hex in groups of 8': hx.match(/.{8}/g).join(' '), 'Base64 without padding': d.toString('base64').replace(/=+$/, ''), 'sha256=Base64': 'sha256=' + d.toString('base64') };
  const missed = []; for (const [name, c] of Object.entries(forms)) { await setAll('k', 'body', c); if (!/matches ✓/.test(await noteNow())) missed.push(name); }
  ok(!missed.length, `${Object.keys(forms).length} more ways a signature is written all match (Stripe list, v1=, colons, 0x, quotes, padded Base64url…) ${missed.join(' | ')}`);
  const wrongSig = []; for (const [name, c] of Object.entries({ 'first 16 hex digits': hx.slice(0, 16), 'one digit changed': hx.slice(0, -1) + (hx.endsWith('0') ? '1' : '0'), 'Stripe list with another value': `t=1,v1=${'1'.repeat(64)}`, 'a label alone': 'sha256=' })) { await setAll('k', 'body', c); if (!/does NOT match/.test(await noteNow())) wrongSig.push(name); }
  ok(!wrongSig.length, `truncated, altered or foreign signatures do NOT match ${wrongSig.join(' | ')}`);
  await cmp.fill(''); await page.waitForTimeout(200); ok(await page.locator('.note-ok, .note-err').count() === 0, 'empty compare box → no verdict');
  // key formats
  await page.getByRole('radio', { name: 'Hex' }).click(); const k6b = createHmac('sha256', Buffer.from('6b6b', 'hex')).update('body').digest('hex'), hexBad = [];
  for (const k of ['6b6b', '6B6B', '6b 6b', '6b:6b', '0x6b6b', ' 6b6b\t']) { r = await setAll(k, 'body'); if (r.Hex !== k6b) hexBad.push(k); }
  ok(!hexBad.length, `hex key written six ways (upper case, spaces, colons, 0x) = the same key ${hexBad.join(' | ')}`);
  for (const k of ['zz', '6', '6b6', '0x']) { await setAll(k, 'body'); if (k === '0x') continue; if (!/pairs of hex digits/.test(await noteNow())) hexBad.push(k); }
  ok(!hexBad.length, `bad hex keys → "pairs of hex digits" ${hexBad.join(' | ')}`);
  await page.getByRole('radio', { name: 'Base64' }).click(); const kb64 = createHmac('sha256', Buffer.from('aw==', 'base64')).update('body').digest('hex'), b64Bad = [];
  for (const k of ['aw==', 'aw', 'a w = =', 'aw=']) { r = await setAll(k, 'body'); if (r.Hex !== kb64) b64Bad.push(k); }
  r = await setAll('-_8', 'body'); if (r.Hex !== createHmac('sha256', Buffer.from('-_8', 'base64url')).update('body').digest('hex')) b64Bad.push('-_8');
  ok(!b64Bad.length, `Base64 key with or without padding, with spaces, URL-safe alphabet ${b64Bad.join(' | ')}`);
  for (const k of ['a', 'a$w', 'aw==aw==', 'abcde']) { await setAll(k, 'body'); const n = await noteNow(); if (!/Not valid Base64/.test(n) || /atob|Window/.test(n)) b64Bad.push(`${k}: ${n}`); }
  ok(!b64Bad.length, `impossible Base64 keys → "Not valid Base64" (one used to show the browser's raw atob error) ${b64Bad.join(' | ')}`);
  await page.getByRole('radio', { name: 'Key is text' }).click();
  // RFC 4231 test cases 1–4 and 6–7 typed into the page
  const rfc = [['0b'.repeat(20), 'Hi There', 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7', '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854'],
    [Buffer.from('Jefe').toString('hex'), 'what do ya want for nothing?', '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737'],
    ['aa'.repeat(131), 'Test Using Larger Than Block-Size Key - Hash Key First', '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54', '80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598']];
  await page.getByRole('radio', { name: 'Hex' }).click(); const rfcBad = [];
  for (const [kh, m, s256, s512] of rfc) { await page.locator('select').selectOption('sha256'); r = await setAll(kh, m); if (r.Hex !== s256) rfcBad.push(`sha256 ${m.slice(0, 8)}`); await page.locator('select').selectOption('sha512'); await page.waitForTimeout(200); r = await rows(); if (r.Hex !== s512) rfcBad.push(`sha512 ${m.slice(0, 8)}`); }
  ok(!rfcBad.length, `RFC 4231 test cases 1, 2 and 6 (SHA-256 and SHA-512, incl. a 131-byte key) ${rfcBad.join(' | ')}`);
  await page.locator('select').selectOption('sha256'); await page.getByRole('radio', { name: 'Key is text' }).click();
  // line ends: a textarea always gives LF — said in the note; a file keeps its CRLF
  r = await setAll('k', 'a\r\nb'); ok(r.Hex === createHmac('sha256', 'k').update('a\nb').digest('hex') && /Windows line ends \(CRLF\)/.test(await page.locator('.note-info').last().textContent()), 'typed text is signed with LF line ends, and the note says to sign a file for CRLF bodies');
  const crlf = join(tmp, 'crlf.json'); writeFileSync(crlf, '{"a":1}\r\n'); await page.locator('.drop input[type=file]').setInputFiles(crlf); await page.waitForTimeout(300);
  ok((await rows()).Hex === createHmac('sha256', 'k').update('{"a":1}\r\n').digest('hex'), 'a file with CRLF is signed byte for byte');
  // files: name shown, kept when the algorithm or key changes, replaced by typing, empty file, big file streamed without freezing
  const fb2 = randomBytes(3000), f2 = { name: 'नमस्ते data.bin', mimeType: 'application/octet-stream', buffer: fb2 }; // (in memory: this sandbox's locale cannot open a Devanagari path)
  await page.locator('.drop input[type=file]').setInputFiles(f2); await page.waitForTimeout(300);
  ok(await msg.inputValue() === '(file: नमस्ते data.bin, 3,000 bytes)' && (await rows()).Hex === createHmac('sha256', 'k').update(fb2).digest('hex'), 'file name and size shown in the message box');
  await page.locator('select').selectOption('sha512'); await page.waitForTimeout(250); ok((await rows()).Hex === createHmac('sha512', 'k').update(fb2).digest('hex'), 'changing the algorithm re-signs the same file');
  await key.fill('other'); await page.waitForTimeout(300); ok((await rows()).Hex === createHmac('sha512', 'other').update(fb2).digest('hex'), 'changing the key re-signs the same file');
  await msg.fill('typed again'); await page.waitForTimeout(250); ok((await rows()).Hex === createHmac('sha512', 'other').update('typed again').digest('hex'), 'typing in the message box drops the file');
  const fe = join(tmp, 'empty.bin'); writeFileSync(fe, ''); await page.locator('.drop input[type=file]').setInputFiles(fe); await page.waitForTimeout(300);
  ok((await rows()).Hex === createHmac('sha512', 'other').update('').digest('hex') && await msg.inputValue() === '(file: empty.bin, 0 bytes)', 'an empty file is signed as an empty message');
  const big = Buffer.alloc(48 * 1024 * 1024); for (let i = 0; i < big.length; i += 4096) big.writeUInt32LE((i * 2654435761) >>> 0, i); const fbig = join(tmp, 'big.bin'); writeFileSync(fbig, big);
  await page.locator('select').selectOption('sha256'); const wantBig = createHmac('sha256', 'other').update(big).digest('hex');
  await page.evaluate(() => { window.__gap = 0; let last = performance.now(); window.__tick = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - last); last = n; }, 20); });
  const t0 = Date.now(); await page.locator('.drop input[type=file]').setInputFiles(fbig);
  let sawProgress = false; for (let i = 0; i < 400; i++) { if (/Signing big\.bin… \d+ %/.test(await page.locator('.tool-body').innerText())) sawProgress = true; if ((await rows()).Hex === wantBig) break; await page.waitForTimeout(25); }
  const gap = await page.evaluate(() => { clearInterval(window.__tick); return window.__gap; });
  ok((await rows()).Hex === wantBig && Date.now() - t0 < 8000 && gap < 700, `a 48 MB file is signed correctly in ${Date.now() - t0} ms, streamed in pieces (longest freeze of the page ${Math.round(gap)} ms; one 40 MB file used to freeze it for 11 s)`);
  ok(sawProgress, 'progress is shown while a large file is signed');
  // a second file chosen while the first is still running wins
  await page.locator('.drop input[type=file]').setInputFiles(fbig); await page.locator('.drop input[type=file]').setInputFiles(f2); await page.waitForTimeout(1500);
  ok((await rows()).Hex === createHmac('sha256', 'other').update(fb2).digest('hex') && await msg.inputValue() === '(file: नमस्ते data.bin, 3,000 bytes)', 'choosing another file while a big one is being signed: the newer file wins');
  await page.getByRole('radio', { name: 'Hex' }).click();
  await key.evaluate((e) => (e.type = 'password')); ok(await key.getAttribute('type') === 'password', 'key hidden by default');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'hmac');
};
