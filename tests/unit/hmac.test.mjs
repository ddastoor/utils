// HMAC Generator engine (src/lib/hmac.ts → hash-wasm, an existing WebAssembly module; STANDING RULE #1 step 1).
// References: the published vectors of RFC 2104 / 2202 (MD5, SHA-1) and RFC 4231 (SHA-224/256/384/512), and Node's
// crypto (OpenSSL) for everything else — every algorithm × key lengths around the block sizes × message lengths
// around the block sizes × chunkings of a 1 MB message.
import { createHmac, randomBytes } from 'node:crypto';
export default async (t, { load }) => {
  const { mac, HMAC_ALGS } = await load('/src/lib/hmac.ts');
  const run = async (alg, key, ...parts) => { const m = await mac(alg, key); for (const p of parts) m.update(p); return m.end(); };
  const hex = async (alg, key, msg) => (await run(alg, Buffer.from(key), Buffer.from(msg))).hex;
  const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
  t.eq(HMAC_ALGS.slice().sort(), ['md5', 'sha1', 'sha224', 'sha256', 'sha3-256', 'sha3-512', 'sha384', 'sha512'], 'the eight algorithms of the tab');

  // ---- published vectors
  const aa = (n) => Buffer.alloc(n, 0xaa), k4 = Buffer.from('0102030405060708090a0b0c0d0e0f10111213141516171819', 'hex');
  const long6 = 'Test Using Larger Than Block-Size Key - Hash Key First';
  const long7 = 'This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.';
  const V = [
    ['md5', Buffer.alloc(16, 0x0b), 'Hi There', '9294727a3638bb1c13f48ef8158bfc9d', 'RFC 2104 / 2202 MD5 case 1'],
    ['md5', 'Jefe', 'what do ya want for nothing?', '750c783e6ab0b503eaa86e310a5db738', 'RFC 2104 / 2202 MD5 case 2'],
    ['md5', aa(16), Buffer.alloc(50, 0xdd), '56be34521d144c88dbb8c733f0e8b3f6', 'RFC 2104 / 2202 MD5 case 3'],
    ['md5', aa(80), long6, '6b1ab7fe4bd7bf8f0b62e6ce61b9d0cd', 'RFC 2202 MD5 case 6 (80-byte key)'],
    ['sha1', Buffer.alloc(20, 0x0b), 'Hi There', 'b617318655057264e28bc0b6fb378c8ef146be00', 'RFC 2202 SHA-1 case 1'],
    ['sha1', 'Jefe', 'what do ya want for nothing?', 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79', 'RFC 2202 SHA-1 case 2'],
    ['sha1', aa(20), Buffer.alloc(50, 0xdd), '125d7342b9ac11cd91a39af48aa17b4f63f175d3', 'RFC 2202 SHA-1 case 3'],
    ['sha1', aa(80), long6, 'aa4ae5e15272d00e95705637ce8a3b55ed402112', 'RFC 2202 SHA-1 case 6'],
    ['sha1', aa(80), 'Test Using Larger Than Block-Size Key and Larger Than One Block-Size Data', 'e8e99d0f45237d786d6bbaa7965c7808bbff1a91', 'RFC 2202 SHA-1 case 7'],
    ['sha224', Buffer.alloc(20, 0x0b), 'Hi There', '896fb1128abbdf196832107cd49df33f47b4b1169912ba4f53684b22', 'RFC 4231 case 1 SHA-224'],
    ['sha256', Buffer.alloc(20, 0x0b), 'Hi There', 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7', 'RFC 4231 case 1 SHA-256'],
    ['sha384', Buffer.alloc(20, 0x0b), 'Hi There', 'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6', 'RFC 4231 case 1 SHA-384'],
    ['sha512', Buffer.alloc(20, 0x0b), 'Hi There', '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854', 'RFC 4231 case 1 SHA-512'],
    ['sha224', 'Jefe', 'what do ya want for nothing?', 'a30e01098bc6dbbf45690f3a7e9e6d0f8bbea2a39e6148008fd05e44', 'RFC 4231 case 2 SHA-224'],
    ['sha256', 'Jefe', 'what do ya want for nothing?', '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', 'RFC 4231 case 2 SHA-256'],
    ['sha384', 'Jefe', 'what do ya want for nothing?', 'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649', 'RFC 4231 case 2 SHA-384'],
    ['sha512', 'Jefe', 'what do ya want for nothing?', '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737', 'RFC 4231 case 2 SHA-512'],
    ['sha224', aa(20), Buffer.alloc(50, 0xdd), '7fb3cb3588c6c1f6ffa9694d7d6ad2649365b0c1f65d69d1ec8333ea', 'RFC 4231 case 3 SHA-224'],
    ['sha256', aa(20), Buffer.alloc(50, 0xdd), '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe', 'RFC 4231 case 3 SHA-256'],
    ['sha384', aa(20), Buffer.alloc(50, 0xdd), '88062608d3e6ad8a0aa2ace014c8a86f0aa635d947ac9febe83ef4e55966144b2a5ab39dc13814b94e3ab6e101a34f27', 'RFC 4231 case 3 SHA-384'],
    ['sha512', aa(20), Buffer.alloc(50, 0xdd), 'fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb', 'RFC 4231 case 3 SHA-512'],
    ['sha224', k4, Buffer.alloc(50, 0xcd), '6c11506874013cac6a2abc1bb382627cec6a90d86efc012de7afec5a', 'RFC 4231 case 4 SHA-224'],
    ['sha256', k4, Buffer.alloc(50, 0xcd), '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b', 'RFC 4231 case 4 SHA-256'],
    ['sha384', k4, Buffer.alloc(50, 0xcd), '3e8a69b7783c25851933ab6290af6ca77a9981480850009cc5577c6e1f573b4e6801dd23c4a7d679ccf8a386c674cffb', 'RFC 4231 case 4 SHA-384'],
    ['sha512', k4, Buffer.alloc(50, 0xcd), 'b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3dba91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd', 'RFC 4231 case 4 SHA-512'],
    ['sha224', aa(131), long6, '95e9a0db962095adaebe9b2d6f0dbce2d499f112f2d2b7273fa6870e', 'RFC 4231 case 6 SHA-224 (key longer than the block)'],
    ['sha256', aa(131), long6, '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54', 'RFC 4231 case 6 SHA-256'],
    ['sha384', aa(131), long6, '4ece084485813e9088d2c63a041bc5b44f9ef1012a2b588f3cd11f05033ac4c60c2ef6ab4030fe8296248df163f44952', 'RFC 4231 case 6 SHA-384'],
    ['sha512', aa(131), long6, '80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598', 'RFC 4231 case 6 SHA-512'],
    ['sha224', aa(131), long7, '3a854166ac5d9f023f54d517d0b39dbd946770db9c2b95c9f6f565d1', 'RFC 4231 case 7 SHA-224 (long key and long data)'],
    ['sha256', aa(131), long7, '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2', 'RFC 4231 case 7 SHA-256'],
    ['sha384', aa(131), long7, '6617178e941f020d351e2f254e8fd32c602420feb0b8fb9adccebb82461e99c5a678cc31e799176d3860e6110c46523e', 'RFC 4231 case 7 SHA-384'],
    ['sha512', aa(131), long7, 'e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58', 'RFC 4231 case 7 SHA-512'],
  ];
  for (const [alg, key, msg, want, name] of V) t.eq(await hex(alg, key, msg), want, name);
  t.eq((await hex('sha256', Buffer.alloc(20, 0x0c), 'Test With Truncation')).slice(0, 32), 'a3b6167473100ee06e0c796c2955552b', 'RFC 4231 case 5 (first 128 bits)');

  // ---- every algorithm against OpenSSL: key and message lengths around every block size (64, 128; SHA-3 rates 136, 72)
  {
    const lens = [0, 1, 31, 32, 55, 56, 63, 64, 65, 71, 72, 73, 111, 112, 119, 127, 128, 129, 135, 136, 137, 143, 144, 145, 255, 256, 257, 1000], pool = randomBytes(2048), bad = [];
    let n = 0;
    for (const alg of HMAC_ALGS) for (const kl of lens) for (const ml of lens) {
      const key = pool.subarray(7, 7 + kl), msg = pool.subarray(900, 900 + ml), r = await run(alg, key, msg), want = createHmac(alg, key).update(msg).digest();
      n++;
      if (r.hex !== want.toString('hex') || r.base64 !== want.toString('base64') || r.base64url !== want.toString('base64url') || r.bytes !== want.length) bad.push(`${alg} key ${kl} msg ${ml}`);
    }
    t.ok(!bad.length, `${n} combinations of algorithm × key length × message length = Node crypto (hex, Base64, Base64url, length) ${bad.slice(0, 5).join('; ')}`);
    t.eq(n, 8 * 28 * 28, 'all combinations were run');
  }
  // ---- streaming: a file is fed in pieces
  {
    const data = randomBytes(1_000_003), key = randomBytes(77), bad = [];
    for (const alg of HMAC_ALGS) {
      const want = createHmac(alg, key).update(data).digest('hex');
      for (const chunk of [1_000_003, 65536, 16384, 16383, 4099, 137, 64, 63, 1]) {
        if (chunk < 64 && alg !== 'sha256' && alg !== 'sha3-512') continue; // one byte at a time is slow: two algorithms are enough
        const m = await mac(alg, key), end = chunk === 1 ? 50_000 : data.length;
        for (let o = 0; o < end; o += chunk) m.update(data.subarray(o, o + chunk));
        const ref = end === data.length ? want : createHmac(alg, key).update(data.subarray(0, Math.ceil(end / chunk) * chunk)).digest('hex');
        if (m.end().hex !== ref) bad.push(`${alg}/${chunk}`);
      }
    }
    t.ok(!bad.length, `8 algorithms, 1 MB of random data in pieces of 1 MB … 1 byte = Node crypto ${bad.join(' ')}`);
    const irregular = await mac('sha512', key); let o = 0, i = 0, total = 0;
    while (o < data.length) { const n = [1, 2, 3, 127, 128, 129, 16384, 5, 70000][i++ % 9]; irregular.update(data.subarray(o, o + n)); o += n; total++; }
    t.eq(irregular.end().hex, createHmac('sha512', key).update(data).digest('hex'), `pieces of mixed sizes (${total} updates)`);
  }
  // ---- edges
  t.eq((await run('sha256', new Uint8Array(0))).hex, createHmac('sha256', '').update('').digest('hex'), 'empty key + empty message');
  t.eq((await run('md5', new Uint8Array(0))).hex, '74e6f7298a9c2d168935f58c001bad88', 'HMAC-MD5 of nothing with an empty key (well-known value)');
  { const key = randomBytes(40); t.eq((await run('sha256', key, new Uint8Array(0), Buffer.from('a'), new Uint8Array(0))).hex, createHmac('sha256', key).update('a').digest('hex'), 'empty pieces are harmless'); }
  t.ok(/unknown algorithm "sha999"/.test(await err(() => mac('sha999', new Uint8Array(4)))), 'unknown algorithm refused with its name');
  { const m = await mac('sha256', Buffer.from('k')); m.end(); t.ok(/no HMAC in progress/.test(await err(() => m.end())) && /no HMAC in progress/.test(await err(() => m.update(Buffer.from('x')))), 'ending twice or adding after the end is an error, not a wrong answer'); }
  {
    const a = await mac('sha256', Buffer.from('one')); a.update(Buffer.from('par'));
    const b = await mac('sha512', Buffer.from('two')); b.update(Buffer.from('msg'));
    const c = await mac('sha256', Buffer.from('three')); c.update(Buffer.from('zzz'));
    a.update(Buffer.from('tial'));
    t.eq([b.end().hex, a.end().hex, c.end().hex], [createHmac('sha512', 'two').update('msg').digest('hex'), createHmac('sha256', 'one').update('partial').digest('hex'), createHmac('sha256', 'three').update('zzz').digest('hex')], 'several signatures in progress do not disturb each other (same and different hashes)');
  }
  { const r = await run('sha3-256', Buffer.from('key'), Buffer.from('The quick brown fox jumps over the lazy dog')); t.eq([r.bytes, r.hex.length, r.base64.length, /[+/=]/.test(r.base64url)], [32, 64, 44, false], 'result shape: length, hex, padded Base64, URL-safe Base64 without padding'); }
  { const big = Buffer.alloc(3 << 20, 7), key = Buffer.from('k'); t.eq((await run('sha1', key, big)).hex, createHmac('sha1', key).update(big).digest('hex'), '3 MB in one piece'); }
  { const key = Buffer.from('k'), s = 'नमस्ते 🌏 ₹'; t.eq((await run('sha256', key, new TextEncoder().encode(s))).hex, createHmac('sha256', key).update(s, 'utf8').digest('hex'), 'UTF-8 text'); }
};
