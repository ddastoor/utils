// TOTP / 2FA (#/totp, PC only): with the clock fixed, codes equal an RFC 6238 implementation written here with Node's
// HMAC (SHA-1/256/512, 6/8 digits, 30/60 s), otpauth:// links (Google Authenticator format) fill the settings, the code
// rolls over at the period boundary, seconds-left bar, previous/next codes, bad secret, timer stopped on leave, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { createHmac } from 'node:crypto';
const b32dec = (s) => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2))); };
const otp = (secret, t, alg = 'sha1', digits = 6, period = 30) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(t / period))); const h = createHmac(alg, b32dec(secret)).update(c).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0'); };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const T0 = Date.UTC(2026, 10, 16, 10, 0, 7) ; // 7 s into a 30 s window
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.clock.install({ time: T0 }); await page.goto(`${base}#/totp`);
  const sec = page.locator('input[aria-label="Secret (Base32)"]'), uri = page.locator('input[aria-label="otpauth link"]'); await sec.waitFor();
  await page.clock.pauseAt(T0 + 1000);
  const code = async () => (await page.locator('.otp-code').textContent()).replace(/\s/g, '');
  const S = 'JBSWY3DPEHPK3PXP'; // "Hello!\xde\xad\xbe\xef"
  await sec.fill(S); await page.clock.runFor(1000); const t = Math.floor((T0 + 2000) / 1000);
  ok(await code() === otp(S, t), `SHA-1 6 digits = RFC 6238 here (${await code()})`);
  const side = await page.locator('.otp-code ~ .muted').first().textContent();
  ok((side.startsWith(`${30 - (t % 30)} s left`) || side.startsWith(`${31 - (t % 30)} s left`)) && side.includes(`previous ${otp(S, t - 30)}`) && side.includes(`next ${otp(S, t + 30)}`), `seconds left + previous/next (${side})`);
  await page.clock.runFor((31 - (t % 30)) * 1000); ok(await code() === otp(S, t + 30 - (t % 30)) && await code() !== otp(S, t), 'code rolls over at the 30-second boundary');
  for (const [alg, d, p] of [['sha256', 8, 30], ['sha512', 6, 60], ['sha1', 8, 60]]) {
    await page.locator('select').nth(0).selectOption(alg); await page.locator('select').nth(1).selectOption(String(d)); await page.locator('select').nth(2).selectOption(String(p)); await page.clock.runFor(1000);
    const now = Math.floor(await page.evaluate(() => Date.now()) / 1000); ok(await code() === otp(S, now, alg, d, p), `${alg.toUpperCase()}, ${d} digits, ${p} s`);
  }
  await uri.fill('otpauth://totp/ACME%20Co:asha@example.in?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=30');
  await page.clock.runFor(1000);
  ok(await sec.inputValue() === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' && await page.locator('select').nth(0).inputValue() === 'sha256' && await page.locator('select').nth(1).inputValue() === '8' && /ACME Co/.test(await page.locator('.note-ok').textContent()), 'otpauth:// link fills secret, algorithm, digits, issuer');
  const now = Math.floor(await page.evaluate(() => Date.now()) / 1000); ok(await code() === otp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', now, 'sha256', 8), 'code for the link');
  await uri.fill('https://example.com'); ok(await page.locator('.note-warn', { hasText: 'Not an otpauth' }).count() === 1, 'non-otpauth link refused');
  await sec.fill('jbsw y3dp ehpk 3pxp'); await page.locator('select').nth(0).selectOption('sha1'); await page.locator('select').nth(1).selectOption('6'); await page.locator('select').nth(2).selectOption('30'); await page.clock.runFor(1000);
  ok(await code() === otp(S, Math.floor(await page.evaluate(() => Date.now()) / 1000)), 'lower case with spaces accepted');
  await sec.fill('NOT*BASE32'); await page.clock.runFor(1000); ok(await page.locator('.note-warn', { hasText: 'not valid Base32' }).count() === 1 && await page.locator('.otp-code').textContent() === '— — —', 'invalid secret → message');
  await sec.fill(S); await page.clock.runFor(1000); await page.getByRole('button', { name: 'Copy code' }).click(); ok(await page.evaluate(() => navigator.clipboard.readText()) === await code(), 'Copy code');
  await page.goto(`${base}#/ascii`); await page.clock.runFor(5000);
  ok(!page.errors.length, `no page errors (timer stopped on leave) ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'totp');
};
