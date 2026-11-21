// JWT Decoder (#/jwt, PC only): 41 tokens made by PyJWT (HS256 / HS384 / HS512 / none, Unicode, 20-digit numbers) read
// back; "Bearer …", quotes and wrapped tokens; time claims in UTC, local time and words on a fixed clock; expired / not
// valid yet / no expiry; exp as a string or in milliseconds; alg none; encrypted tokens (JWE); payloads that are null,
// a list, plain text or not UTF-8; what is wrong with a broken token.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { REF, setValue, notes, until } from './_devdata.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const NOW = 1794900000; // the generator's "now": 17 Nov 2026 06:40 UTC
  const page = await newPage({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' }); await page.clock.install({ time: new Date(NOW * 1000) }); await page.goto(`${base}#/jwt`);
  const ta = page.getByLabel('JWT'), hdr = page.getByLabel('Header'), pl = page.getByLabel('Payload');
  await ta.waitFor(); await hdr.waitFor(); await page.clock.pauseAt(new Date(NOW * 1000 + 1000));
  const set = async (s) => { await setValue(ta, s); await page.waitForFunction(() => true); };
  const kv = async () => { const t = await page.locator('.kv span').allTextContents(); const o = {}; for (let i = 0; i < t.length; i += 2) o[t[i]] = t[i + 1]; return o; };
  const b = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url'), tok = (h, p, s = 'c2ln') => `${b(h)}.${b(p)}.${s}`;
  ok(await hdr.inputValue() === '{\n  "alg": "HS256",\n  "typ": "JWT"\n}' && await pl.inputValue() === '{\n  "sub": "1234567890",\n  "name": "SuperUtils",\n  "iat": 1700000000,\n  "exp": 1800000000\n}', 'the sample token is decoded: header and payload');
  let k = await kv();
  ok(k['Issued at (iat)'] === '2023-11-14T22:13:20Z · 15 Nov 2023, 3:43:20 am IST · 3 years ago' && k['Expires (exp)'] === '2027-01-15T08:00:00Z · 15 Jan 2027, 1:30:00 pm IST · in 2 months' && k.Signature === '32 bytes · algorithm HS256', `time claims in UTC, local time and words; signature size (${JSON.stringify(k)})`);
  ok(/Token is not expired — it expires in 2 months\./.test(await notes(page)) && /signature is NOT verified/.test(await notes(page)) && await page.locator('.note-ok').count() === 1, 'verdict + the reminder that the signature is not checked');
  ok((await page.evaluate(() => globalThis.__superutilsLive())).resources.includes('devcore-json'), 'the claims are printed by devcore-json (lossless)');
  // PyJWT's tokens
  let good = 0;
  for (const [i, r] of REF.jwt.entries()) {
    await set(i % 3 === 0 ? `Bearer ${r.token}` : i % 3 === 1 ? r.token : `"${r.token}"`);
    const h = JSON.parse(await hdr.inputValue()), text = await pl.inputValue(), big = 'big' in r.payload, n = await notes(page);
    const exp = r.payload.exp, verdict = exp === undefined ? /No "exp" claim: this token never expires by itself/.test(n) : exp <= NOW + 1 ? /This token has EXPIRED \(/.test(n) : /Token is not expired — it expires /.test(n);
    const nbf = r.payload.nbf, early = nbf !== undefined && nbf > NOW + 1 ? /NOT VALID YET/.test(n) : !/NOT VALID YET/.test(n);
    const body = big ? text.includes(`"big": ${12345678901234567890n + BigInt(i)}`) : JSON.stringify(JSON.parse(text)) === JSON.stringify(r.payload);
    if (JSON.stringify(h) === JSON.stringify(r.header) && body && verdict && early && (await kv()).Signature === `${r.sigBytes} bytes · algorithm ${r.alg}` && (r.alg === 'none') === /NOT signed/.test(n)) good++;
    else ok(false, `token ${i}: header ${JSON.stringify(h)}, payload ${text.replace(/\s+/g, ' ').slice(0, 200)}, notes ${n.slice(0, 200)}`);
  }
  ok(good === REF.jwt.length, `${REF.jwt.length} PyJWT tokens: header, claims (20-digit numbers not rounded), signature size, expired / not expired / never expires, not valid yet (${good})`);
  const T = tok({ alg: 'HS256' }, { sub: 'a', exp: NOW + 3600 });
  for (const form of [`Authorization: Bearer ${T}`, `bearer ${T}`, `'${T}',`, T.replace(/(.{25})/g, '$1\n   '), `  ${T}  `]) { await set(form); ok(/Token is not expired — it expires in 1 hour\./.test(await notes(page)) && JSON.parse(await pl.inputValue()).sub === 'a', `pasted as ${JSON.stringify(form.slice(0, 28))}…: read`); }
  await set(tok({ alg: 'HS256' }, { exp: NOW - 59 })); ok(/This token has EXPIRED \(1 minute ago\)\./.test(await notes(page)) && await page.locator('.note-err').count() === 1, 'expired a minute ago');
  await set(tok({ alg: 'HS256' }, { nbf: NOW + 86400 * 3, exp: NOW + 86400 * 30 })); ok(/NOT VALID YET \(its "nbf" time is in 3 days\)/.test(await notes(page)) && /expires next month|expires in 30 days/.test(await notes(page)), 'not valid yet');
  await set(tok({ alg: 'HS256' }, { exp: String(NOW + 100) })); ok(/"exp" is written as a string \(the standard asks for a number\)\./.test(await notes(page)) && /Token is not expired/.test(await notes(page)), 'exp as a string: read, and pointed out');
  await set(tok({ alg: 'HS256' }, { exp: (NOW + 7200) * 1000, iat: NOW * 1000 })); ok(/"exp" looks like milliseconds \(JWT times are in seconds\)\./.test(await notes(page)) && /"iat" looks like milliseconds/.test(await notes(page)) && /expires in 2 hours/.test(await notes(page)), 'times in milliseconds by mistake: read as such, and pointed out');
  await set(tok({ alg: 'HS256' }, { exp: 'tomorrow' })); ok(/"exp" is not a time this tab can read \("tomorrow"\)/.test(await notes(page)) && await page.locator('.note-ok, .note-err').count() === 0, 'an exp that is not a time: said so, no verdict');
  await set(tok({ alg: 'HS256' }, { exp: 1e300 })); ok(/"exp" is not a time this tab can read/.test(await notes(page)) && !page.errors.length, 'a huge exp does not break the tab');
  await set(tok({ alg: 'HS256' }, { auth_time: NOW - 600, updated_at: NOW - 86400 })); k = await kv(); ok(/10 minutes ago$/.test(k['Signed in at (auth_time)']) && /yesterday$/.test(k['Profile updated (updated_at)']), 'auth_time and updated_at are shown as times too');
  await set(`${b({ alg: 'none' })}.${b({ sub: 'x' })}.`); ok(/alg is "none": this token is NOT signed/.test(await notes(page)) && (await kv()).Signature === '0 bytes · algorithm none', 'alg none: warned');
  await set(`${b({ alg: 'HS256' })}.${b({ sub: 'x' })}.`); ok(/signature part is empty although the header names an algorithm/.test(await notes(page)), 'an empty signature is pointed out');
  await set(`${b({ alg: 'HS256' })}.${b({ sub: 'x' })}.signature`); ok(/signature\) is not valid Base64URL — the token was cut or changed/.test(await notes(page)) && JSON.parse(await pl.inputValue()).sub === 'x', 'a damaged signature: the claims are still shown');
  await set(`${b({ alg: 'RSA-OAEP', enc: 'A256GCM' })}.a2V5.aXY.Y2lwaGVy.dGFn`); ok(/encrypted token \(JWE, key management RSA-OAEP, content encryption A256GCM\)/.test(await notes(page)) && JSON.parse(await hdr.inputValue()).enc === 'A256GCM' && await pl.count() === 0, 'five parts: an encrypted token — header shown, the rest explained');
  await set(tok({ alg: 'HS256' }, 'null')); ok(await pl.inputValue() === 'null' && !page.errors.length, 'a null payload (it used to crash the decoder)');
  await set(tok({ alg: 'HS256' }, '[1,2]')); ok(await pl.inputValue() === '[\n  1,\n  2\n]', 'a list payload');
  await set(tok({ alg: 'HS256' }, 'hello world')); ok(await pl.inputValue() === 'hello world' && /payload is not JSON/.test(await notes(page)), 'a payload that is plain text');
  await set(`${b({ alg: 'HS256' })}.${Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]).toString('base64url')}.c2ln`); ok(/payload is not valid UTF-8/.test(await notes(page)), 'a payload that is not UTF-8');
  await set(tok({ alg: 'HS256' }, '{"id":12345678901234567890,"b":1.0,"z":1,"a":2}')); ok(await pl.inputValue() === '{\n  "id": 12345678901234567890,\n  "b": 1.0,\n  "z": 1,\n  "a": 2\n}', 'claims are printed as they are in the token: big numbers, 1.0, key order');
  for (const [s, re] of [['a.b', /two parts — a JWT has three/], ['a.b.c.d', /this has 4/], ['!!!.e30.sig', /first part \(the header\) is not Base64URL/], [`${b('[1]')}.e30.sig`, /header does not decode to a JSON object/], [`${b({ alg: 'x' })}.@@.sig`, /second part \(the payload\) is not Base64URL/], ['hello', /this has 1/]]) {
    await set(s); ok(re.test(await notes(page, '.note-err')) && await hdr.count() === 0, `${s.slice(0, 24)}: ${(await notes(page, '.note-err')).slice(0, 70)}`);
  }
  await set(''); ok(await page.locator('.note, .outbox').count() === 0, 'an empty box shows nothing');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); ok(await until(page, () => globalThis.__superutilsLive().resources.length === 0), 'the engine is released when the tab is left');
  await pcOnlyOnPhone(ctx, 'jwt');
};
