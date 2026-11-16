// HMAC Generator (#/hmac, PC only): every algorithm × key format against Node's crypto.createHmac, file input, signature
// comparison (hex any case, Base64, "sha256=" prefix as GitHub sends it), a GitHub-webhook style check, bad key, phone note.
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
  await key.evaluate((e) => (e.type = 'password')); ok(await key.getAttribute('type') === 'password', 'key hidden by default');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'hmac');
};
