// TOTP / 2FA (#/totp, PC only): with the clock fixed, codes equal an RFC 6238 implementation written here with Node's
// HMAC (SHA-1/256/512, 6/8 digits, 30/60 s), otpauth:// links (Google Authenticator format) fill the settings, the code
// rolls over at the period boundary, seconds-left bar, previous/next codes, counter-based (HOTP) links against RFC 4226
// appendix D, 7/9/10 digits, links with unusual periods, RFC 6238 appendix B vectors, bad links and secrets, timer stopped
// on leave, phone note.
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
  // the code is computed off the clock (hash-wasm is loaded with the first code): wait, in real time, until the tab says it has answered
  const settled = async (p = page) => { for (let i = 0; i < 400 && await p.locator('.otp-code').getAttribute('aria-busy') !== 'false'; i++) await new Promise((r) => setTimeout(r, 15)); };
  const code = async () => { await settled(); return (await page.locator('.otp-code').textContent()).replace(/\s/g, ''); };
  const S = 'JBSWY3DPEHPK3PXP'; // "Hello!\xde\xad\xbe\xef"
  await sec.fill(S); await page.clock.runFor(1000); await settled(); const t = Math.floor((T0 + 2000) / 1000);
  ok(await code() === otp(S, t), `SHA-1 6 digits = RFC 6238 here (${await code()})`);
  const side = await page.locator('.otp-code ~ .muted').first().textContent();
  ok((side.startsWith(`${30 - (t % 30)} s left`) || side.startsWith(`${31 - (t % 30)} s left`)) && side.includes(`previous ${otp(S, t - 30)}`) && side.includes(`next ${otp(S, t + 30)}`), `seconds left + previous/next (${side})`);
  await page.clock.runFor((31 - (t % 30)) * 1000); await settled(); ok(await code() === otp(S, t + 30 - (t % 30)) && await code() !== otp(S, t), 'code rolls over at the 30-second boundary');
  for (const [alg, d, p] of [['sha256', 8, 30], ['sha512', 6, 60], ['sha1', 8, 60]]) {
    await page.locator('select').nth(0).selectOption(alg); await page.locator('select').nth(1).selectOption(String(d)); await page.locator('select').nth(2).selectOption(String(p)); await page.clock.runFor(1000); await settled();
    const now = Math.floor(await page.evaluate(() => Date.now()) / 1000); ok(await code() === otp(S, now, alg, d, p), `${alg.toUpperCase()}, ${d} digits, ${p} s`);
  }
  await uri.fill('otpauth://totp/ACME%20Co:asha@example.in?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=30');
  await page.clock.runFor(1000); await settled();
  ok(await sec.inputValue() === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' && await page.locator('select').nth(0).inputValue() === 'sha256' && await page.locator('select').nth(1).inputValue() === '8' && /ACME Co/.test(await page.locator('.note-ok').textContent()), 'otpauth:// link fills secret, algorithm, digits, issuer');
  const now = Math.floor(await page.evaluate(() => Date.now()) / 1000); ok(await code() === otp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', now, 'sha256', 8), 'code for the link');
  await uri.fill('https://example.com'); ok(await page.locator('.note-warn', { hasText: 'Not an otpauth' }).count() === 1, 'non-otpauth link refused');
  await sec.fill('jbsw y3dp ehpk 3pxp'); await page.locator('select').nth(0).selectOption('sha1'); await page.locator('select').nth(1).selectOption('6'); await page.locator('select').nth(2).selectOption('30'); await page.clock.runFor(1000); await settled();
  ok(await code() === otp(S, Math.floor(await page.evaluate(() => Date.now()) / 1000)), 'lower case with spaces accepted');
  await sec.fill('NOT*BASE32'); await page.clock.runFor(1000); await settled(); ok(await page.locator('.note-warn', { hasText: 'not valid Base32' }).count() === 1 && await page.locator('.otp-code').textContent() === '— — —', 'invalid secret → message');
  await sec.fill(S); await page.clock.runFor(1000); await settled(); await page.getByRole('button', { name: 'Copy code' }).click(); ok(await page.evaluate(() => navigator.clipboard.readText()) === await code(), 'Copy code');
  // ---- bug hunt, Nov 2026: counter-based (HOTP) links, 9/10 digits, links with unusual settings, bad links
  const hotp = (secret, c, digits = 6, alg = 'sha1') => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(c)); const hm = createHmac(alg, b32dec(secret)).update(b).digest(); const o = hm[hm.length - 1] & 15; return String((hm.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0'); };
  const R = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', RFC = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']; // RFC 4226 appendix D ("12345678901234567890")
  ok(RFC.every((c, i) => hotp(R, i) === c), 'the HOTP reference written in this test reproduces RFC 4226 appendix D');
  await uri.fill(`otpauth://hotp/ACME:asha?secret=${R}&counter=0`); await page.clock.runFor(1000); await settled();
  const side2 = () => page.locator('.otp-code ~ .muted').first().textContent(), next = page.getByRole('button', { name: 'Next code (counter + 1)' });
  ok(await code() === RFC[0] && /Counter-based \(HOTP\) code for counter 0/.test(await side2()) && await next.isVisible() && await page.locator('.meter').isHidden() && /counter-based/.test(await page.locator('.note-ok').textContent()), `otpauth://hotp link → RFC 4226 code for counter 0 (${await code()}), no countdown bar`);
  const seq = [await code()]; for (let i = 1; i < 10; i++) { await next.click(); await page.waitForFunction((i) => document.querySelector('.otp-code ~ .muted').textContent.includes(`counter ${i} `), i); seq.push(await code()); }
  ok(JSON.stringify(seq) === JSON.stringify(RFC), `"Next code" walks through all ten RFC 4226 codes (${seq.slice(0, 4)}…)`);
  await page.clock.runFor(95000); await settled(); ok(await code() === RFC[9], 'an HOTP code does not change with the clock');
  await uri.fill(`otpauth://hotp/x?secret=${R}&counter=1234567&digits=8`); await page.clock.runFor(1000); await settled(); ok(await code() === hotp(R, 1234567, 8) && await page.locator('select').nth(1).inputValue() === '8', 'HOTP link with counter=1234567 and 8 digits');
  await uri.fill(''); await page.clock.runFor(1000); await settled(); let nowS = Math.floor(await page.evaluate(() => Date.now()) / 1000);
  ok(await next.isHidden() && await page.locator('.meter').isVisible() && await code() === otp(R, nowS, 'sha1', 8, 30), 'clearing the link goes back to time-based codes');
  for (const d of [7, 9, 10]) { // 10 digits used to overflow 32-bit arithmetic
    await page.locator('select').nth(1).selectOption(String(d)); await page.clock.runFor(1000); await settled(); nowS = Math.floor(await page.evaluate(() => Date.now()) / 1000);
    const want = hotp(R, Math.floor(nowS / 30), d); ok(await code() === want && want.length === d, `${d} digits: ${await code()}`);
  }
  await uri.fill(`otpauth://totp/Bank:me?secret=${S}&period=45&digits=7&algorithm=SHA512`); await page.clock.runFor(1000); await settled(); nowS = Math.floor(await page.evaluate(() => Date.now()) / 1000);
  ok(await page.locator('select').nth(2).inputValue() === '45' && await page.locator('select').nth(1).inputValue() === '7' && await code() === hotp(S, Math.floor(nowS / 45), 7, 'sha512') && new RegExp(`^(${45 - (nowS % 45)}|${46 - (nowS % 45)}|${44 - (nowS % 45)}) s left`).test(await side2()), `a link with a 45-second period and 7 digits is honoured (${await side2()})`);
  await uri.fill(`otpauth://totp/Caf%C3%A9%20%E0%A4%9A%E0%A4%BE%E0%A4%AF:me%40example.in?secret=${S}`); await page.clock.runFor(1000); await settled();
  ok(/Café चाय · Café चाय:me@example.in/.test(await page.locator('.note-ok').textContent()) && await page.locator('select').nth(1).inputValue() === '6' && await page.locator('select').nth(2).inputValue() === '30', 'label decoded (UTF-8, %40), defaults 6 digits / 30 s when the link has none');
  const badLinks = [[`otpauth://foo/x?secret=${S}`, /Unknown otpauth type "foo"/], ['otpauth://totp/x?issuer=A', /no secret=/], [`otpauth://totp/x?secret=${S}&algorithm=MD5`, /Unknown algorithm "md5"/], ['otpauth:', /otpauth/i], ['not a link', /Not an otpauth/]];
  const wrongMsg = []; for (const [l, re] of badLinks) { await uri.fill(l); await page.waitForTimeout(50); const m = await page.locator('.note-warn').first().textContent().catch(() => ''); if (!re.test(m)) wrongMsg.push(`${l} → "${m}"`); }
  ok(!wrongMsg.length, `${badLinks.length} bad links each get their own message ${wrongMsg.join(' | ')}`);
  await uri.fill(`otpauth://totp/x%ZZ?secret=${S}`); await page.clock.runFor(1000); await settled(); ok(await sec.inputValue() === S && /x%ZZ/.test(await page.locator('.note-ok').textContent()), 'a label with a broken %-escape is shown as written (used to throw)');
  await uri.fill(`otpauth://totp/x?secret=${S}&digits=12`); await page.clock.runFor(1000); await settled(); ok(/digits=12 — expected a whole number from 6 to 10/.test(await page.locator('.note-warn').first().textContent()) && await page.locator('.otp-code').textContent() === '— — —', 'digits=12 in a link → message, no code');
  await uri.fill(''); await page.locator('select').nth(0).selectOption('sha1'); await page.locator('select').nth(1).selectOption('6'); await page.locator('select').nth(2).selectOption('30');
  for (const [secret, why] of [['JBSWY3DPEHPK3PXP====', 'padding'], ['jbsw-y3dp-ehpk-3pxp', 'dashes'], ['JBSWY3DP EHPK3PXP', 'spaces']]) { await sec.fill(secret); await page.clock.runFor(1000); await settled(); ok(await code() === otp(S, Math.floor(await page.evaluate(() => Date.now()) / 1000)), `secret with ${why} accepted`); }
  await sec.fill(''); await page.clock.runFor(1000); await settled(); ok(await page.locator('.otp-code').textContent() === '— — —' && /Enter a secret/.test(await side2()), 'empty secret → prompt, no code');
  // links with settings that cannot be right are refused with the reason, and never show a code from the link before
  await uri.fill(`otpauth://totp/Good:me?secret=${S}`); await page.clock.runFor(1000); await settled(); const goodCode = await code();
  const refused = [];
  for (const [l, re] of [[`otpauth://totp/x?secret=${S}&period=0`, /period=0 — expected a whole number from 1 to 86,400/], [`otpauth://totp/x?secret=${S}&digits=abc`, /digits=abc — expected a whole number from 6 to 10/], [`otpauth://totp/x?secret=${S}&period=xyz`, /period=xyz/], [`otpauth://totp/x?secret=${S}&digits=5`, /digits=5/],
    [`otpauth://totp/x?secret=${S}&period=1.5`, /period=1\.5/], [`otpauth://hotp/x?secret=${S}&counter=-1`, /counter=-1/], [`otpauth://totp/x?secret=${S}&algorithm=SHA384`, /Unknown algorithm "sha384"/], ['otpauth-migration://offline?data=CjEKCkhlbGxvId6tvu8SGEV4YW1wbGU6YWxpY2VAZ29vZ2xlLmNvbRoHRXhhbXBsZTAC', /Google Authenticator export link/]]) {
    await uri.fill(l); await page.clock.runFor(1000); await settled();
    const m = await page.locator('.note-warn').first().textContent().catch(() => ''), shown = await page.locator('.otp-code').textContent();
    if (!re.test(m) || shown !== '— — —' || /NaN/.test(await page.locator('.tool-body').innerText())) refused.push(`${l.slice(0, 44)} → "${m.slice(0, 50)}" code ${shown}`);
  }
  ok(!refused.length && /^\d{6}$/.test(goodCode), `8 links with impossible settings (period=0, digits=abc, counter=-1, SHA384, an export link…) are refused with the reason and show no code (they used to show "NaN digits" and keep the previous link's code) ${refused.join(' | ')}`);
  await sec.fill(S); await page.clock.runFor(1000); await settled(); ok(/^\d+$/.test(await code()), 'typing a secret after a bad link works again');
  await uri.fill(''); await page.clock.runFor(500); await settled();
  for (const [l, why] of [[`OTPAUTH://TOTP/Upper:me?SECRET=${S}&ISSUER=Upper&DIGITS=8`, 'upper-case scheme, type and parameter names'], [`otpauth://totp/x?secret=${S.toLowerCase()}&algorithm=HMAC-SHA256`, '"HMAC-SHA256" as the algorithm name'], [`otpauth://totp/x?secret=JBSW%20Y3DP%20EHPK%203PXP`, 'a secret with %20 spaces'], [`  otpauth://totp/x?secret=${S}  `, 'spaces around the link']]) {
    await uri.fill(l); await page.clock.runFor(1000); await settled(); const nowT = Math.floor(await page.evaluate(() => Date.now()) / 1000), a2 = await page.locator('select').nth(0).inputValue(), d2 = +(await page.locator('select').nth(1).inputValue());
    ok(await page.locator('.card .note-warn').count() === 0 && await code() === hotp(S, Math.floor(nowT / 30), d2, a2), `link accepted: ${why}`);
  }
  await uri.fill(''); await page.locator('select').nth(0).selectOption('sha1'); await page.locator('select').nth(1).selectOption('6'); await page.locator('select').nth(2).selectOption('30');
  // secrets as authenticator apps accept them: any length (left-over bits dropped), invisible characters ignored
  const lenient = (str) => { const al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of str.toUpperCase()) bits += al.indexOf(ch).toString(2).padStart(5, '0'); return Buffer.from((bits.match(/.{8}/g) || []).map((x) => parseInt(x, 2))); };
  const otpKey = (keyBuf, t2) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(t2 / 30))); const hm = createHmac('sha1', keyBuf).update(b).digest(); const o2 = hm[hm.length - 1] & 15; return String((hm.readUInt32BE(o2) & 0x7fffffff) % 1e6).padStart(6, '0'); };
  for (const [secret, clean, why] of [['JBSWY3DPEHPK3PX', 'JBSWY3DPEHPK3PX', '15 characters (not a multiple of 8)'], ['JBSWY3DPEHPK3PXPJBSW', 'JBSWY3DPEHPK3PXPJBSW', '20 characters'], ['GEZDGNBVGY3TQOJQGEZDGNBVGY', 'GEZDGNBVGY3TQOJQGEZDGNBVGY', '26 characters'], ['JBSWY3DPEHPK3PXP​', 'JBSWY3DPEHPK3PXP', 'a zero-width space at the end (copy-paste)'], ['﻿JBSW Y3DP EHPK 3PXP', 'JBSWY3DPEHPK3PXP', 'a BOM and a no-break space']]) {
    await sec.fill(secret); await page.clock.runFor(1000); await settled(); const nowT = Math.floor(await page.evaluate(() => Date.now()) / 1000);
    ok(await code() === otpKey(lenient(clean), nowT), `secret accepted as authenticator apps do: ${why} (used to be "not valid Base32")`);
  }
  for (const [secret, re] of [['0BSWY3DPEHPK3PXP', /"0" is not allowed.*perhaps the letter O, I, L or B was meant/], ['JBSWY3DP!', /"!" is not allowed/], ['A', /too short/], ['JBSWY3DPEHPK3PX1', /"1" is not allowed/]]) { await sec.fill(secret); await page.clock.runFor(1000); await settled(); const m = await page.locator('.note-warn').first().textContent().catch(() => ''); ok(re.test(m) && await page.locator('.otp-code').textContent() === '— — —', `bad secret "${secret}" → ${m.slice(0, 70)}`); }
  await sec.fill(''); await page.clock.runFor(1000); await settled(); await page.getByRole('button', { name: 'Copy code' }).click(); await page.waitForTimeout(100);
  ok(/no code to copy/.test(await page.locator('.toast-err').last().textContent()) && !/^—+$/.test(await page.evaluate(() => navigator.clipboard.readText())), '"Copy code" with no code says so (it used to copy "———")');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/no code to copy/.test(e)));
  // RFC 6238 appendix B: SHA-1 / SHA-256 / SHA-512 with their 20 / 32 / 64-byte keys at T = 59 and T = 1111111109 (8 digits)
  const b32 = (buf) => { const al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const x of buf) bits += x.toString(2).padStart(8, '0'); return bits.match(/.{1,5}/g).map((x) => al[parseInt(x.padEnd(5, '0'), 2)]).join(''); };
  const seed = (n) => b32(Buffer.from('12345678901234567890'.repeat(4).slice(0, n)));
  const rfc = [[59, 'sha1', 20, '94287082'], [59, 'sha256', 32, '46119246'], [59, 'sha512', 64, '90693936'], [1111111109, 'sha1', 20, '07081804'], [1111111109, 'sha256', 32, '68084774'], [1111111109, 'sha512', 64, '25091201']];
  const rfcBad = [];
  await page.locator('select').nth(1).selectOption('8');
  for (const [T, alg, n, want] of rfc) { await page.clock.setFixedTime(T * 1000); await page.locator('select').nth(0).selectOption(alg); await sec.fill(seed(n)); await page.waitForFunction((w) => document.querySelector('.otp-code').textContent.replace(/\s/g, '') === w, want, { timeout: 3000 }).catch(() => {}); if (await code() !== want) rfcBad.push(`T=${T} ${alg}: ${await code()} ≠ ${want}`); }
  ok(!rfcBad.length, `RFC 6238 appendix B test vectors (SHA-1, SHA-256, SHA-512 at T = 59 and 1111111109) ${rfcBad.join(' | ')}`);
  await page.goto(`${base}#/ascii`); await page.clock.runFor(5000);
  ok(!page.errors.length, `no page errors (timer stopped on leave) ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'totp');
};
