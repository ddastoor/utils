// Hash / Checksum: the 23 algorithms (src/lib/hashes.ts on hash-wasm) against implementations independent of it
// (tests/fixtures/hash/reference.json from scripts/make-hash-reference.py: hashlib/OpenSSL, zlib, pycryptodomex, blake3,
// xxhash, crc32c, liblzma), whole and in odd pieces; the reader of expected checksums (src/lib/checksums.ts) on the
// output of the real tools — sha*sum, b2sum (also --tag), cksum, openssl dgst, xxhsum, rhash (.sfv); the checksum list
// the tab writes is checked by sha256sum -c / b2sum -c / xxhsum -c.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const gen = (n, seed) => { const out = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff; out[i] = (x >>> 16) & 0xff; } return out; };
const hex = (b) => Buffer.from(b).toString('hex');
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;

export default async (t, { load, root }) => {
  const { HASHES, HASH_IDS, hashers, algo } = await load('/src/lib/hashes.ts');
  const C = await load('/src/lib/checksums.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/hash/reference.json'), 'utf8'));

  // ---- the algorithms
  t.eq(HASH_IDS.length, 23, '23 algorithms');
  t.eq(HASHES.filter((a) => a.group === 'main').map((a) => a.id), ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'SHA3-256', 'SHA3-512', 'BLAKE2b-256', 'BLAKE2b-512', 'CRC-32'], 'the nine the tab always had are shown first');
  t.eq(Object.keys(ref.cases[0].digests).sort(), [...HASH_IDS].sort(), 'the reference covers every algorithm');
  const dataOf = (c) => (c.text !== undefined ? new TextEncoder().encode(c.text) : c.gen ? gen(...c.gen) : new TextEncoder().encode(c.repeat[0].repeat(c.repeat[1])));
  const bad = [];
  for (const c of ref.cases) {
    const d = dataOf(c), whole = await hashers(HASH_IDS);
    whole.update(d);
    const w = whole.digest();
    for (const a of HASH_IDS) if (hex(w[a]) !== c.digests[a]) bad.push(`${a} of ${JSON.stringify(c.text ?? c.gen ?? c.repeat).slice(0, 30)}`);
    for (const a of HASH_IDS) if (w[a].length !== algo(a).bytes) bad.push(`${a}: ${w[a].length} bytes`);
  }
  t.eq(bad, [], `${ref.cases.length} inputs × 23 algorithms = the independent implementations (empty input, the classic vectors, 1,000,000 × "a", block edges 55 – 2,049 bytes, 64 KiB ± 1, 3 MiB + 7)`);
  { // streaming: odd pieces, empty pieces, one byte at a time across block edges
    const big = ref.cases.find((c) => c.gen?.[0] === 3 * 1048576 + 7), d = dataOf(big), hs = await hashers(HASH_IDS);
    let off = 0, k = 0; const sizes = [0, 1, 7, 63, 64, 65, 1000, 4096, 65537, 1 << 20];
    while (off < d.length) { const n = sizes[k++ % sizes.length]; hs.update(d.subarray(off, off + n)); off += n; }
    const r = hs.digest(), wrong = HASH_IDS.filter((a) => hex(r[a]) !== big.digests[a]);
    t.eq(wrong, [], '3 MiB + 7 in pieces of 0, 1, 7, 63, 64, 65, 1,000, 4,096, 65,537 and 1 MiB bytes: the same digests');
    const small = ref.cases.find((c) => c.gen?.[0] === 1025), ds = dataOf(small), hb = await hashers(HASH_IDS);
    for (const x of ds) hb.update(Uint8Array.of(x));
    const r1 = hb.digest();
    t.eq(HASH_IDS.filter((a) => hex(r1[a]) !== small.digests[a]), [], '1,025 bytes one at a time');
  }
  { const a = await hashers(['SHA-256']), b = await hashers(['SHA-256']); a.update(new TextEncoder().encode('one')); b.update(new TextEncoder().encode('two'));
    t.ok(hex(a.digest()['SHA-256']) !== hex(b.digest()['SHA-256']), 'two hashers of one algorithm keep their own state'); }
  t.eq(await hashers(['SHA-999']).then(() => 'made', (e) => e.message), 'unknown algorithm "SHA-999"', 'an unknown algorithm is refused');

  // ---- reading expected checksums
  const one = (s, name) => C.parseExpected(s, name).entries.map((e) => [e.hex, e.name ?? null, e.alg ?? null]);
  const SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
  t.eq(one(SHA), [[SHA, null, null]], 'a bare checksum');
  t.eq(one(`  ${SHA.toUpperCase()}  `), [[SHA, null, null]], 'upper case, spaces around');
  t.eq(one(`0x${SHA}`), [[SHA, null, null]], '0x in front');
  t.eq(one(SHA.match(/../g).join(' ')), [[SHA, null, null]], 'bytes apart by spaces (old certutil)');
  t.eq(one(SHA.match(/../g).join(':')), [[SHA, null, null]], 'bytes apart by colons (openssl -c)');
  t.eq(one(SHA.match(/.{8}/g).join(' ')), [[SHA, null, null]], 'groups of eight digits apart by spaces (it was read as a CRC-32 of a file named after the rest)');
  t.eq(one(`${SHA}  0123abcd`), [[SHA, '0123abcd', null]], '… but a file whose name is hex digits stays a file');
  t.eq(one('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='), [[SHA, null, null]], 'Base64 (sha256sum --base64)');
  t.eq(one('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU'), [[SHA, null, null]], 'URL-safe Base64 without padding');
  t.eq(one(`SHA-256: ${SHA}`), [[SHA, null, 'SHA-256']], 'a download page: "SHA-256: …" names the algorithm');
  t.eq(one(`MD5 checksum = ${MD5}.`), [[MD5, null, 'MD5']], '"MD5 checksum = ….", full stop and all');
  t.eq(one(`sha256  ${SHA}  ubuntu.iso`), [[SHA, 'ubuntu.iso', 'SHA-256']], 'a table row: algorithm, checksum, file');
  t.eq(one(`${SHA}  ubuntu-24.04.iso`), [[SHA, 'ubuntu-24.04.iso', null]], 'sha256sum: checksum, two spaces, name');
  t.eq(one(`${SHA} *ubuntu 24.04.iso`), [[SHA, 'ubuntu 24.04.iso', null]], 'binary mode (*), a space in the name');
  t.eq(one(`\\${SHA}  new\\nline\\\\x`), [[SHA, 'new\nline\\x', null]], 'an escaped name (a line break and a backslash)');
  t.eq(one(`SHA256 (ubuntu.iso) = ${SHA}`), [[SHA, 'ubuntu.iso', 'SHA-256']], 'BSD style (sha256sum --tag)');
  t.eq(one(`SHA2-256(ubuntu.iso)= ${SHA}`), [[SHA, 'ubuntu.iso', 'SHA-256']], 'openssl dgst');
  t.eq(one(`BLAKE2b-256 (a.bin) = ${'0'.repeat(64)}`), [['0'.repeat(64), 'a.bin', 'BLAKE2b-256']], 'b2sum -l 256 --tag');
  t.eq(one(`XXH64 (a.bin) = ${'ef46db3751d8e999'}`), [['ef46db3751d8e999', 'a.bin', 'xxHash64']], 'xxhsum --tag');
  t.eq(one('photos.zip 1A2B3C4D'), [['1a2b3c4d', 'photos.zip', 'CRC-32']], '.sfv: name and CRC-32');
  t.eq(one('; made by rhash\nphotos.zip 1A2B3C4D\n'), [['1a2b3c4d', 'photos.zip', 'CRC-32']], '.sfv with a comment');
  t.eq(one('<script src="x.js" integrity="sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb"></script>'),
    [['38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b', null, 'SHA-384']], 'web-page integrity (sha384-…)');
  t.eq(one(`SHA256 hash of C:\\Users\\me\\x.iso:\n${SHA.match(/../g).join(' ')}\nCertUtil: -hashfile command completed successfully.`), [[SHA, 'C:\\Users\\me\\x.iso', 'SHA-256']], 'certutil -hashfile');
  t.eq(one(`\nAlgorithm : SHA256\nHash      : ${SHA.toUpperCase()}\nPath      : C:\\Users\\me\\x.iso\n`), [[SHA, 'C:\\Users\\me\\x.iso', 'SHA-256']], 'PowerShell Get-FileHash | Format-List');
  t.eq(one(`Algorithm       Hash                                                                   Path\n---------       ----                                                                   ----\nSHA256          ${SHA.toUpperCase()}       C:\\x.iso`), [[SHA, 'C:\\x.iso', 'SHA-256']], 'PowerShell Get-FileHash (table)');
  t.eq(one(`${SHA}  a.iso`, 'SHA256SUMS'), [[SHA, 'a.iso', 'SHA-256']], 'the list\'s file name names the algorithm (SHA256SUMS)');
  t.eq(one(`${MD5}  a.iso`, 'a.iso.md5'), [[MD5, 'a.iso', 'MD5']], '… (a.iso.md5)');
  t.eq(C.parseExpected('hello world').entries, [], 'words: nothing');
  t.eq(C.parseExpected(`${SHA}\nnot a checksum 12345678abc\n${MD5}`).unread, [2], 'a line that looks like a checksum but is none is counted');
  t.eq(C.parseExpected(`${SHA.slice(0, 63)}`).unread, [1], '63 digits: no algorithm has that length');
  t.eq(C.parseExpected('12345678').entries.map((e) => e.hex), ['12345678'], 'eight digits alone: a CRC');
  t.eq(C.parseExpected('Call 12345678 or deadbeef').entries, [], '… but not eight digits in a sentence that names no checksum');
  t.eq(C.parseExpected(`CRC-32: 1a2b3c4d`).entries.map((e) => [e.hex, e.alg]), [['1a2b3c4d', 'CRC-32']], '… unless it names one');
  t.eq(C.parseExpected(`BLAKE3 ${SHA}`).entries.map((e) => [e.hex, e.alg]), [[SHA, 'BLAKE3']], 'the name of an algorithm is not read as a short Base64 checksum ("BLAKE3" is valid Base64 of 4 bytes)');
  t.eq(C.parseExpected('My Holiday Photos.zip 1A2B3C4D').entries.map((e) => e.name), ['My Holiday Photos.zip'], '.sfv: spaces in a name with an extension');
  t.eq(['SHA256SUMS', 'x.iso.sha256', 'B2SUMS', 'files.sfv', 'x.md5', 'SHA512SUMS.txt', 'CHECKSUMS', 'x.DIGESTS', 'notes.txt', 'photo.jpg'].map(C.isChecksumListName),
    [true, true, true, true, true, true, true, true, false, false], 'checksum lists by name');

  // ---- what the real tools write is read back
  if (has('sha256sum')) {
    const dir = mkdtempSync(join(tmpdir(), 'hash-')); try {
      const files = { 'a.bin': gen(1000, 1), 'with space.txt': new TextEncoder().encode('hello\n'), 'नमस्ते.txt': gen(77, 2) };
      for (const [n, b] of Object.entries(files)) writeFileSync(join(dir, n), b);
      const names = Object.keys(files);
      const run = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' }).stdout;
      const truth = Object.fromEntries(await Promise.all(names.map(async (n) => { const h = await hashers(HASH_IDS); h.update(files[n]); return [n, Object.fromEntries(Object.entries(h.digest()).map(([k, v]) => [k, hex(v)]))]; })));
      const check = (label, text, alg, listName) => {
        const l = C.parseExpected(text, listName), vs = names.map((n) => C.verify(n, truth[n], l));
        t.ok(vs.every((v) => v?.kind === 'match' && v.alg === alg) && !l.unread.length, `${label}: every file found and matched by ${alg} (${vs.map((v) => v?.kind).join(', ')})`);
      };
      for (const [cmd, alg] of [['md5sum', 'MD5'], ['sha1sum', 'SHA-1'], ['sha224sum', 'SHA-224'], ['sha256sum', 'SHA-256'], ['sha384sum', 'SHA-384'], ['sha512sum', 'SHA-512'], ['b2sum', 'BLAKE2b-512']]) {
        check(`${cmd}`, run(cmd, names), alg, `${alg.replace('-', '')}SUMS`);
        check(`${cmd} --tag`, run(cmd, ['--tag', ...names]), alg);
      }
      check('b2sum -l 256 --tag', run('b2sum', ['-l', '256', '--tag', ...names]), 'BLAKE2b-256');
      check('sha256sum --base64 (in a .sha256 list)', run('cksum', ['-a', 'sha256', '--untagged', '--base64', ...names]), 'SHA-256', 'x.sha256');
      check('cksum -a sha512 (tagged, the default)', run('cksum', ['-a', 'sha512', ...names]), 'SHA-512');
      if (has('openssl')) check('openssl dgst -sha3-256', run('openssl', ['dgst', '-sha3-256', ...names]), 'SHA3-256');
      if (has('xxhsum')) {
        check('xxhsum -H1 (XXH64)', run('xxhsum', ['-H1', ...names]), 'xxHash64', 'XXH64SUMS');
        check('xxhsum -H3 --tag', run('xxhsum', ['-H3', '--tag', ...names]), 'XXH3-64');
        check('xxhsum -H2 --tag', run('xxhsum', ['-H2', '--tag', ...names]), 'XXH128');
      } else t.ok(true, 'xxhsum not installed — its cases skipped');
      if (has('rhash')) {
        check('rhash --sfv (CRC-32)', run('rhash', ['--sfv', ...names]), 'CRC-32');
        check('rhash --bsd --ripemd160', run('rhash', ['--bsd', '--ripemd160', ...names]), 'RIPEMD-160');
        check('rhash --bsd --sha3-512', run('rhash', ['--bsd', '--sha3-512', ...names]), 'SHA3-512');
      } else t.ok(true, 'rhash not installed — its cases skipped');
      // the list the tab writes, checked by the tools themselves
      const rows = (a) => names.map((n) => ({ name: n, hex: truth[n][a] }));
      const verifyWith = (cmd, args, alg, file) => { writeFileSync(join(dir, file), C.sumsText(alg, rows(alg))); const r = spawnSync(cmd, [...args, file], { cwd: dir, encoding: 'utf8' }); return r.status === 0 ? 'OK' : r.stdout + r.stderr; };
      t.eq(verifyWith('sha256sum', ['-c'], 'SHA-256', 'SHA256SUMS'), 'OK', 'sha256sum -c checks the list the tab writes');
      t.eq(verifyWith('md5sum', ['-c'], 'MD5', 'MD5SUMS'), 'OK', 'md5sum -c');
      t.eq(verifyWith('b2sum', ['-c'], 'BLAKE2b-512', 'B2SUMS'), 'OK', 'b2sum -c');
      if (has('xxhsum')) t.eq(verifyWith('xxhsum', ['-c'], 'xxHash64', 'XXH64SUMS'), 'OK', 'xxhsum -c (XXH64)');
      if (has('rhash')) t.eq(verifyWith('rhash', ['--check'], 'CRC-32', 'checksums.sfv'), 'OK', 'rhash --check reads the .sfv the tab writes');
      // an awkward name: the escape coreutils uses
      writeFileSync(join(dir, 'back\\slash.txt'), 'x');
      const awk = await hashers(['SHA-256']); awk.update(new TextEncoder().encode('x'));
      writeFileSync(join(dir, 'AWK'), C.sumsText('SHA-256', [{ name: 'back\\slash.txt', hex: hex(awk.digest()['SHA-256']) }]));
      t.eq(spawnSync('sha256sum', ['-c', 'AWK'], { cwd: dir }).status, 0, 'a backslash in a name is escaped as sha256sum expects');
      const back = C.parseExpected(run('sha256sum', ['back\\slash.txt'])).entries[0];
      t.eq(back?.name, 'back\\slash.txt', '… and read back from sha256sum\'s own escaped line');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  } else t.ok(true, 'coreutils not found — the tool cases are skipped');

  // ---- matching
  const L = (s, n) => C.parseExpected(s, n);
  const D = { 'SHA-256': SHA, MD5 };
  t.eq(C.verify('x', D, L('')), null, 'nothing expected: no verdict');
  t.eq(C.verify('x', D, L(SHA)).kind, 'match', 'a bare checksum checks any file');
  t.eq(C.verify(null, D, L(SHA)).kind, 'match', '… and the text');
  t.eq(C.verify('x', D, L(SHA)).alg, 'SHA-256', 'the matching algorithm is named');
  { const v = C.verify('x', D, L(SHA.replace(/.$/, '0'))); t.eq([v.kind, v.tried, v.others], ['mismatch', ['SHA-256'], ['SHA3-256', 'BLAKE2b-256', 'Keccak-256', 'BLAKE2s-256', 'BLAKE3']], 'a mismatch says what was tried and what else has that length'); }
  t.eq(C.verify('x', D, L(`SHA3-256: ${SHA}`)), { kind: 'missing', alg: 'SHA3-256', entry: C.parseExpected(`SHA3-256: ${SHA}`).entries[0] }, 'a named algorithm that was not worked out: missing (the box changed after Compute)');
  t.eq(C.verify('x', { MD5 }, L(SHA)).kind, 'missing', 'a length none of the worked-out algorithms has: missing');
  t.eq(C.verify('x', { MD5 }, L(SHA)).alg, 'SHA-256', '… the usual one of that length is suggested');
  t.eq(C.verify('b.iso', D, L(`${SHA}  a.iso`)).kind, 'unlisted', 'a list that does not name the file');
  t.eq(C.verify('a.iso', D, L(`${MD5}  b.iso\n${SHA}  ./dist/a.iso`)).kind, 'match', 'found by the last part of a path');
  t.eq(C.verify('A.ISO', D, L(`${SHA}  a.iso`)).kind, 'match', '… without regard to case');
  t.eq(C.verify('a.iso', D, L(`${SHA}  C:\\Users\\me\\a.iso`)).kind, 'match', '… a Windows path');
  t.eq(C.unmatchedEntries(['a.iso'], L(`${SHA}  a.iso\n${MD5}  b.iso`)).map((e) => e.name), ['b.iso'], 'listed but not chosen');
  t.eq(C.neededAlgs(['MD5'], ['x'], L(SHA)), ['SHA-256'], 'a 64-digit checksum when only MD5 was chosen: SHA-256 is worked out too');
  t.eq(C.neededAlgs(['SHA3-256'], ['x'], L(SHA)), [], '… not when a chosen one has that length');
  t.eq(C.neededAlgs(['SHA-256'], ['x'], L(`BLAKE3: ${SHA}`)), ['BLAKE3'], 'a named algorithm is worked out');
  t.eq(C.neededAlgs(['SHA-256'], ['x'], L(`${SHA}  y`)), [], 'a list entry of another file needs nothing');
  t.eq([16, 32, 40, 56, 64, 96, 128, 8].map(C.likeliest), ['xxHash64', 'MD5', 'SHA-1', 'SHA-224', 'SHA-256', 'SHA-384', 'SHA-512', 'CRC-32'], 'the usual algorithm of each length');

  // ---- writing
  t.eq(C.fmtDigest('00ff10', 'hex'), '00ff10', 'hex');
  t.eq(C.fmtDigest('00ff10', 'HEX'), '00FF10', 'HEX');
  t.eq(C.fmtDigest(SHA, 'base64'), '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=', 'Base64 (as sha256sum --base64 and integrity attributes write it)');
  t.eq(C.sumsText('SHA-256', [{ name: 'a.iso', hex: SHA }]), `${SHA}  a.iso\n`, 'the line of sha256sum');
  t.eq(C.sumsText('CRC-32', [{ name: 'a.zip', hex: '1a2b3c4d' }]), 'a.zip 1A2B3C4D\n', 'CRC-32: an .sfv line');
  t.eq(['SHA-256', 'MD5', 'BLAKE2b-512', 'BLAKE3', 'CRC-32'].map(C.sumsName), ['SHA256SUMS', 'MD5SUMS', 'B2SUMS', 'B3SUMS', 'checksums.sfv'], 'list names as the tools use them');
};
