// One-time codes (src/lib/totp.ts): the HMAC is hash-wasm's (existing WebAssembly module), the Base32 secret, the
// counters and the truncation are our supplement (keys.wasm). References: RFC 4226 Appendix D (HOTP, with the full
// 31-bit decimals for 9 and 10 digits), RFC 6238 Appendix B (TOTP with SHA-1, SHA-256, SHA-512), and an independent
// implementation written here on Node's crypto for 600 random secrets × moments × settings.
import { createHmac, randomBytes } from 'node:crypto';
export default async (t, { load, wasm }) => {
  const { bindKeys } = await load('/src/wasm/keys.ts'), { totp } = await load('/src/lib/totp.ts');
  const k = bindKeys(await wasm('keys'));
  const T = (o) => totp(k, o), code = async (o) => (await T(o)).code;
  const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
  const all = (list, f) => Promise.all(list.map(f));
  const b32 = (s) => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '', o = ''; for (const c of Buffer.from(s)) bits += c.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) o += a[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return o; };
  const S1 = b32('12345678901234567890'), S256 = b32('12345678901234567890123456789012'), S512 = b32('1234567890123456789012345678901234567890123456789012345678901234');

  // ---- published vectors
  t.eq(await all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], (c) => code({ secret: S1, counter: c })), ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'], 'HOTP RFC 4226 Appendix D');
  const MOMENTS = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
  t.eq(await all(MOMENTS, (x) => code({ secret: S1, t: x, digits: 8 })), ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'], 'TOTP SHA-1 (RFC 6238 Appendix B)');
  t.eq(await all(MOMENTS, (x) => code({ secret: S256, t: x, digits: 8, alg: 'sha256' })), ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'], 'TOTP SHA-256');
  t.eq(await all(MOMENTS, (x) => code({ secret: S512, t: x, digits: 8, alg: 'sha512' })), ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826'], 'TOTP SHA-512');
  t.eq(await all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], (c) => code({ secret: S1, counter: c, digits: 10 })), ['1284755224', '1094287082', '0137359152', '1726969429', '1640338314', '0868254676', '1918287922', '0082162583', '0673399871', '0645520489'], 'HOTP with 10 digits = RFC 4226 Appendix D decimals (used to wrap at 2^32)');
  t.eq(await all([0, 3, 7], (c) => code({ secret: S1, counter: c, digits: 9 })), ['284755224', '726969429', '082162583'], '9 digits');
  t.eq(await all([0, 3, 7], (c) => code({ secret: S1, counter: c, digits: 7 })), ['4755224', '6969429', '2162583'], '7 digits');

  // ---- what the answer carries
  const r = await T({ secret: S1.toLowerCase().replace(/(.{4})/g, '$1 '), t: 1234567890 });
  t.eq([r.code, r.counter, r.remaining], ['005924', 41152263, 30 - (1234567890 % 30)], 'lower case + spaces accepted; counter and seconds left');
  t.eq([r.prev, r.next], [await code({ secret: S1, t: 1234567890 - 30 }), await code({ secret: S1, t: 1234567890 + 30 })], 'previous and next = the codes 30 seconds earlier and later');
  t.eq(Object.keys(await T({ secret: S1, counter: 5 })).sort(), ['code', 'counter'], 'a counter-based code has no seconds left and no neighbours');
  for (const [period, at] of [[15, 1700000007], [60, 1700000041], [90, 1700000000], [1, 12345], [30, 29], [30, 30]]) {
    const x = await T({ secret: S1, t: at, period });
    t.eq([x.counter, x.remaining, x.code], [Math.floor(at / period), period - (at % period), await code({ secret: S1, counter: Math.floor(at / period) })], `period ${period} s at ${at}: counter, seconds left, the code of that counter`);
  }
  t.eq((await T({ secret: S1, t: 0 })).prev, (await T({ secret: S1, t: 0 })).code, 'at the first period there is no earlier counter (the same code is given)');
  t.eq(await code({ secret: S1, counter: 2 ** 40 + 7 }), await code({ secret: S1, t: (2 ** 40 + 7) * 30 }), 'a counter beyond 32 bits');

  // ---- secrets as authenticator apps accept them
  {
    const c8 = (secret) => code({ secret, t: 59, digits: 8 }), ref = await c8('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    t.eq(ref, '94287082', 'RFC 6238 vector (20-byte key)');
    for (const [v, why] of [['gezdgnbvgy3tqojqgezdgnbvgy3tqojq', 'lower case'], ['GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ', 'groups of four'], ['GEZDGNBV-GY3TQOJQ-GEZDGNBV-GY3TQOJQ', 'dashes'], ['GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ====', 'padding'], ['GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ​', 'zero-width space'], ['﻿GEZDGNBVGY3TQOJQ GEZDGNBVGY3TQOJQ\n', 'BOM, no-break space, newline']]) t.eq(await c8(v), ref, `secret with ${why}`);
    t.eq((await T({ secret: 'JBSWY3DPEHPK3PX', t: 0 })).keyBytes, 9, '15 characters → 9 bytes (left-over bits dropped, as Google Authenticator does)');
    t.eq((await T({ secret: 'JBSWY3DPEHPK3PXPJBSW', t: 0 })).keyBytes, 12, '20 characters → 12 bytes');
    t.eq((await T({ secret: 'MFRGGZDFMZTWQ2LK', t: 0 })).keyBytes, 10, '16 characters → 10 bytes ("abcdefghij")');
    t.ok(/"0" is not allowed.*O, I, L or B/.test(await err(() => c8('0EZDGNBVGY3TQOJQ'))) && /"8" is not allowed/.test(await err(() => c8('GEZDGNBVGY3TQOJ8'))), 'digits 0, 1, 8, 9 → message with a hint');
    t.ok(/"\*" is not allowed/.test(await err(() => c8('GEZD*NBV'))) && !/O, I, L or B/.test(await err(() => c8('GEZD*NBV'))), 'another character → message without the hint');
    t.ok(/too short/.test(await err(() => c8('A'))) && /Enter the secret/.test(await err(() => c8(' - = '))), 'one character / nothing but separators');
    t.ok(/not valid Base32/.test(await err(() => T({ secret: 'abc1!', t: 0 }))), 'bad Base32 refused');
  }
  t.ok(/6 to 10/.test(await err(() => T({ secret: S1, t: 0, digits: 11 }))) && /6 to 10/.test(await err(() => T({ secret: S1, t: 0, digits: 5 }))), 'digits outside 6–10 refused');
  t.ok(/unknown algorithm "md5"/.test(await err(() => T({ secret: S1, t: 0, alg: 'md5' }))), 'an algorithm authenticator apps do not use is refused by name');

  // ---- an independent implementation (RFC 4226 §5.3 written out here, HMAC by OpenSSL)
  {
    const ref = (key, counter, alg, digits) => {
      const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
      const h = createHmac(alg, key).update(msg).digest(), o = h[h.length - 1] & 15;
      return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
    };
    const bad = []; let n = 0, s = 12345;
    const rnd = (m) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % m; };
    for (let i = 0; i < 600; i++) {
      const key = randomBytes(1 + rnd(70)), alg = ['sha1', 'sha256', 'sha512'][rnd(3)], digits = 6 + rnd(5), period = [15, 30, 60, 90][rnd(4)], at = rnd(2 ** 31) * 3 + rnd(1000);
      const got = await T({ secret: b32(key), alg, digits, period, t: at }), c = Math.floor(at / period);
      n++;
      if (got.code !== ref(key, c, alg, digits) || got.next !== ref(key, c + 1, alg, digits) || (c > 0 && got.prev !== ref(key, c - 1, alg, digits)) || got.keyBytes !== key.length) bad.push(`${alg}/${digits}/${period}/${at}/${key.length} bytes`);
    }
    t.ok(!bad.length, `${n} random secrets (1–70 bytes) × algorithms × digits × periods × moments = RFC 4226 §5.3 on Node's HMAC ${bad.slice(0, 4).join('; ')}`);
    const keys = Array.from({ length: 12 }, () => randomBytes(20));
    t.eq(await Promise.all(keys.map((key, i) => code({ secret: b32(key), t: 1700000000 + i, alg: i % 2 ? 'sha256' : 'sha1' }))), keys.map((key, i) => ref(key, Math.floor((1700000000 + i) / 30), i % 2 ? 'sha256' : 'sha1', 6)), 'twelve codes asked for at once: each from its own key');
  }
};
