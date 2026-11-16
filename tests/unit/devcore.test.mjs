// devcore.wasm (Rust, built by us): known answers for every op — CIDR maths (RFC 4632/4291 examples), range → blocks,
// cron next runs (independent minute-by-minute search), node-semver ranges (npm docs examples), globs, RFC 4648 test
// vectors + Bitcoin Base58 + Ascii85/Z85 spec vectors, protobuf/MessagePack/CBOR (RFC 8949 Appendix A), unified-diff
// patching, SQL formatting, hex dump.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default async (t, { load, wasm }) => {
  const { bindDevcore } = await load('/src/wasm/devcore.ts');
  const d = bindDevcore(await wasm('devcore'));
  const err = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  // ---- CIDR
  let c = d.json('cidr', { input: '192.168.1.130/26' });
  t.eq([c.network, c.broadcast, c.netmask, c.wildcard, c.first, c.last, c.total, c.usable, c.prefix], ['192.168.1.128', '192.168.1.191', '255.255.255.192', '0.0.0.63', '192.168.1.129', '192.168.1.190', '64', '62', 26], '/26');
  t.eq([c.kind, c.class, c.reverse, c.binary, c.hex, c.integer], ['Private (RFC 1918)', 'C', '130.1.168.192.in-addr.arpa', '11000000.10101000.00000001.10000010', '0xC0A80182', '3232235906'], 'kind, class, reverse, binary, hex, integer');
  t.eq(d.json('cidr', { input: '10.20.30.40 255.255.0.0' }).cidr, '10.20.0.0/16', 'dotted netmask');
  t.eq(d.json('cidr', { input: '10.20.30.40/255.255.255.0' }).cidr, '10.20.30.0/24', 'netmask after /');
  t.ok(/not a valid netmask/.test(err(() => d.json('cidr', { input: '10.0.0.1 255.0.255.0' }))), 'non-contiguous mask refused');
  c = d.json('cidr', { input: '10.0.0.5/31' }); t.eq([c.first, c.last, c.usable, c.broadcast], ['10.0.0.4', '10.0.0.5', '2', null], '/31 point-to-point: 2 usable (RFC 3021), no broadcast');
  c = d.json('cidr', { input: '8.8.8.8' }); t.eq([c.cidr, c.usable, c.kind, c.class], ['8.8.8.8/32', '1', 'Public', 'A'], 'bare address = /32');
  t.eq(d.json('cidr', { input: '0.0.0.0/0' }).total, '4294967296', '/0 = 2^32');
  t.eq(['100.64.1.1', '169.254.3.4', '127.0.0.1', '224.0.0.251', '192.0.2.10', '172.31.255.255', '172.32.0.1'].map((a) => d.json('cidr', { input: a }).kind.split(' ')[0]), ['Carrier-grade', 'Link-local', 'Loopback', 'Multicast', 'Documentation', 'Private', 'Public'], 'special ranges');
  c = d.json('cidr', { input: '192.168.0.0/24', split: 26 }); t.eq([c.subnets.count, c.subnets.list.map((x) => x.cidr), c.subnets.list[1].first, c.subnets.list[1].hosts], ['4', ['192.168.0.0/26', '192.168.0.64/26', '192.168.0.128/26', '192.168.0.192/26'], '192.168.0.65', '62'], 'split /24 into four /26');
  c = d.json('cidr', { input: '10.0.0.0/8', split: 24 }); t.eq([c.subnets.count, c.subnets.shown], ['65536', 1024], '65,536 subnets, first 1024 listed');
  t.ok(/between/.test(err(() => d.json('cidr', { input: '10.0.0.0/24', split: 20 }))), 'split shorter than the prefix refused');
  c = d.json('cidr', { input: '2001:db8:abcd:12::1/48' });
  t.eq([c.network, c.last, c.total, c.kind, c.expanded], ['2001:db8:abcd::', '2001:db8:abcd:ffff:ffff:ffff:ffff:ffff', String(2n ** 80n), 'Documentation (2001:db8::/32)', '2001:0db8:abcd:0012:0000:0000:0000:0001'], 'IPv6 /48');
  t.eq(d.json('cidr', { input: '::1' }).reverse, '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.ip6.arpa', 'ip6.arpa reverse');
  t.eq(d.json('cidr', { input: '::/0' }).total, String(2n ** 128n), '/0 IPv6 = 2^128');
  t.eq(['fe80::1', 'fd00::1', 'ff02::1', '2606:4700::1111', '::ffff:1.2.3.4'].map((a) => d.json('cidr', { input: a }).kind.split(' ')[0]), ['Link-local', 'Unique', 'Multicast', 'Global', 'IPv4-mapped'], 'IPv6 kinds');
  t.eq(d.json('cidr', { input: '2001:db8::/32', split: 34 }).subnets.list.map((x) => x.cidr), ['2001:db8::/34', '2001:db8:4000::/34', '2001:db8:8000::/34', '2001:db8:c000::/34'], 'IPv6 split');
  c = d.json('cidr', { input: '192.168.1.10 - 192.168.1.20' });
  t.eq([c.blocks, c.total], [['192.168.1.10/31', '192.168.1.12/30', '192.168.1.16/30', '192.168.1.20/32'], '11'], 'range → minimal CIDR blocks');
  t.eq(d.json('cidr', { input: '10.0.0.0-10.0.255.255' }).blocks, ['10.0.0.0/16'], 'aligned range = one block');
  t.ok(/before its start/.test(err(() => d.json('cidr', { input: '10.0.0.9 - 10.0.0.1' }))), 'reversed range refused');
  t.ok(/not an IPv4 or IPv6/.test(err(() => d.json('cidr', { input: '300.1.1.1/24' }))), '300.1.1.1 refused');
  t.ok(/too long/.test(err(() => d.json('cidr', { input: '1.2.3.4/33' }))), '/33 refused');
  // ---- cron: compare with a brute-force minute search in UTC
  const brute = (min, hr, dom, mon, dow, from, n) => {
    const out = []; let tm = Math.floor(from / 60000) * 60000 + 60000;
    while (out.length < n) { const x = new Date(tm); const ok = min(x.getUTCMinutes()) && hr(x.getUTCHours()) && mon(x.getUTCMonth() + 1) && (dom === null ? dow(x.getUTCDay()) : dow === null ? dom(x.getUTCDate()) : dom(x.getUTCDate()) || dow(x.getUTCDay())); if (ok) out.push(tm); tm += 60000; }
    return out;
  };
  const from = Date.UTC(2026, 10, 16, 10, 7, 30);
  const runs = (expr, n = 6, tz = 'UTC', f = from) => d.json('cron', { expr, tz, from: f, count: n }).next.map((x) => x.ms);
  t.eq(runs('*/15 * * * *'), brute((m) => m % 15 === 0, () => true, null, () => true, () => true, from, 6), '*/15 * * * *');
  t.eq(runs('30 9 * * 1-5'), brute((m) => m === 30, (h) => h === 9, null, () => true, (w) => w >= 1 && w <= 5, from, 6), '30 9 * * 1-5 (weekdays)');
  t.eq(runs('0 0 1,15 * *', 4), brute((m) => m === 0, (h) => h === 0, (d) => d === 1 || d === 15, () => true, null, from, 4), 'twice a month');
  t.eq(runs('0 12 13 * 5', 6), brute((m) => m === 0, (h) => h === 12, (d) => d === 13, () => true, (w) => w === 5, from, 6), 'day-of-month OR day-of-week (Vixie rule)');
  t.eq(runs('0 0 29 2 *', 2, 'UTC', Date.UTC(2026, 0, 1)), [Date.UTC(2028, 1, 29), Date.UTC(2032, 1, 29)], '29 February → leap years only');
  t.eq(runs('0 9 * * *', 2, 'Asia/Kolkata'), [Date.UTC(2026, 10, 17, 3, 30), Date.UTC(2026, 10, 18, 3, 30)], '09:00 IST = 03:30 UTC');
  const ny = runs('30 2 * * *', 3, 'America/New_York', Date.UTC(2027, 2, 13, 12)).map((x) => new Date(x).toISOString());
  t.ok(ny.length === 3 && ny[1] === '2027-03-15T06:30:00.000Z' && ny[2] === '2027-03-16T06:30:00.000Z', `02:30 New York across the spring DST gap (14 Mar 2027 has no 02:30): ${ny}`);
  t.eq(runs('@hourly', 2), [Date.UTC(2026, 10, 16, 11), Date.UTC(2026, 10, 16, 12)], '@hourly alias');
  t.eq(runs('15 10 * * * *', 2), [Date.UTC(2026, 10, 16, 10, 10, 15), Date.UTC(2026, 10, 16, 11, 10, 15)], 'six fields = second minute hour …');
  t.eq(runs('0 0 L * *', 2), [Date.UTC(2026, 10, 30), Date.UTC(2026, 11, 31)], 'L = last day of the month');
  t.ok(d.json('cron', { expr: '*/5 * * * *', tz: 'UTC', from, count: 1 }).description.length > 5, 'description given');
  t.ok(err(() => d.json('cron', { expr: '61 * * * *', tz: 'UTC', from, count: 1 })), 'minute 61 refused');
  t.ok(err(() => d.json('cron', { expr: '* * *', tz: 'UTC', from, count: 1 })), 'three fields refused');
  // ---- semver (node-semver semantics; npm docs examples)
  const sv = (range, versions, extra = {}) => d.json('semver', { range, versions, ...extra });
  const sat = (range, vs) => sv(range, vs).rows.map((r) => r.satisfies);
  t.eq(sat('^1.2.3', ['1.2.3', '1.9.9', '2.0.0', '1.2.2']), [true, true, false, false], '^1.2.3 := >=1.2.3 <2.0.0');
  t.eq(sat('^0.2.3', ['0.2.3', '0.2.9', '0.3.0']), [true, true, false], '^0.2.3 := >=0.2.3 <0.3.0');
  t.eq(sat('^0.0.3', ['0.0.3', '0.0.4']), [true, false], '^0.0.3 := =0.0.3');
  t.eq(sat('~1.2.3', ['1.2.9', '1.3.0']), [true, false], '~1.2.3');
  t.eq(sat('1.x || >=2.5.0 || 5.0.0 - 7.2.3', ['1.2.3', '2.4.0', '2.5.0', '6.0.0', '7.2.4', '8.0.0']), [true, false, true, true, true, true], 'OR / hyphen ranges');
  t.eq(sat('>1.2.3-alpha.3', ['1.2.3-alpha.7', '3.4.5-alpha.9', '3.4.5']), [true, false, true], 'prereleases only match on the same tuple');
  t.eq(sv('^1.0.0', ['1.0.0', '1.5.0', '1.10.0', '2.0.0', 'banana']).max, '1.10.0', 'max satisfying (numeric, not string order)');
  let r = sv('', ['1.10.0', '1.2.0', '1.2.0-rc.1', '1.2.0-beta.11', '1.2.0-beta.2', '0.9.0', 'v2.0.0']);
  t.eq(r.sorted, ['0.9.0', '1.2.0-beta.2', '1.2.0-beta.11', '1.2.0-rc.1', '1.2.0', '1.10.0', '2.0.0'], 'semver sort (prerelease identifiers numeric, "v" prefix allowed)');
  r = sv('', ['1.2.3']); t.eq([r.bumps.major, r.bumps.minor, r.bumps.patch, r.bumps.prerelease, r.bumps.premajor], ['2.0.0', '1.3.0', '1.2.4', '1.2.4-0', '2.0.0-0'], 'bumps');
  t.eq(sv('', ['1.2.4-beta.1'], { preid: 'beta' }).bumps.prerelease, '1.2.4-beta.2', 'prerelease bump');
  t.eq(sv('', ['1.2', 'a.b.c', '1.2.3.4', '01.2.3', '1.2.3-', '1.2.3abc', '1.2.3-01', 'v1.2.3', '1.2.3-rc.1+build.5']).rows.map((x) => x.valid), [false, false, false, false, false, false, false, true, true], 'strict SemVer validity (same as node-semver valid())');
  t.ok(/not a valid range/.test(err(() => sv('>>1', ['1.0.0']))), 'bad range refused');
  // ---- glob
  const gl = (patterns, paths, o = {}) => d.json('glob', { patterns, paths, ...o }).rows.map((x) => x.match);
  t.eq(gl(['*.js'], ['a.js', 'src/a.js', 'a.ts']), [true, false, false], '* does not cross /');
  t.eq(gl(['**/*.js'], ['a.js', 'src/a.js', 'src/x/y/a.js', 'a.jsx']), [true, true, true, false], '** crosses directories');
  t.eq(gl(['src/**', '!src/**/*.test.ts'], ['src/a.ts', 'src/a.test.ts', 'lib/a.ts']), [true, false, false], 'negation: last match wins');
  t.eq(gl(['*.{png,jpg}', 'file?.txt', '[abc]*.md', '[!x]y'], ['a.png', 'b.jpg', 'c.gif', 'file1.txt', 'file10.txt', 'b.md', 'd.md', 'zy', 'xy']), [true, true, false, true, false, true, false, true, false], 'braces, ?, classes, negated class');
  t.eq(gl(['*.JPG'], ['a.jpg'], { caseInsensitive: true }), [true], 'case-insensitive option');
  t.eq(gl(['**/*'], ['.env', 'a/.git/config', 'a/b'], { dot: false }), [false, false, true], 'dot files hidden when dot = false');
  t.eq(d.json('glob', { patterns: ['[a-'], paths: ['x'] }).errors.length, 1, 'bad pattern reported');
  // ---- encodings: RFC 4648 §10 vectors
  const E = new TextEncoder(), D = new TextDecoder();
  const V = ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'];
  t.eq(V.map((v) => d.encode('base32', E.encode(v))), ['', 'MY======', 'MZXQ====', 'MZXW6===', 'MZXW6YQ=', 'MZXW6YTB', 'MZXW6YTBOI======'], 'Base32 (RFC 4648)');
  t.eq(V.map((v) => d.encode('base32hex', E.encode(v))), ['', 'CO======', 'CPNG====', 'CPNMU===', 'CPNMUOG=', 'CPNMUOJ1', 'CPNMUOJ1E8======'], 'Base32hex (RFC 4648)');
  t.eq(V.map((v) => d.encode('base64', E.encode(v))), ['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==', 'Zm9vYmE=', 'Zm9vYmFy'], 'Base64 (RFC 4648)');
  t.eq(V.map((v) => d.encode('base16', E.encode(v))), ['', '66', '666F', '666F6F', '666F6F62', '666F6F6261', '666F6F626172'], 'Base16');
  t.eq(V.map((v) => D.decode(d.decode('base32', d.encode('base32', E.encode(v))))), V, 'Base32 round trip');
  t.eq(D.decode(d.decode('base32', 'mzxw6ytboi======')), 'foobar', 'Base32 decode is case-insensitive');
  t.eq(d.encode('base58', E.encode('Hello World!')), '2NEpo7TZRRrLZSi2U', 'Base58 (Bitcoin alphabet)');
  t.eq(d.encode('base58', new Uint8Array([0, 0, 1])), '112', 'Base58 leading zero bytes → 1s');
  t.eq(d.encode('base58check', Uint8Array.from(Buffer.from('00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31', 'hex'))), '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs', 'Base58Check: the classic Bitcoin address');
  t.ok(/checksum/.test(err(() => d.decode('base58check', '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt'))), 'Base58Check: wrong checksum detected');
  t.eq(d.encode('ascii85', E.encode('Man is distinguished')), '9jqo^BlbD-BleB1DJ+*+F(f,q', 'Ascii85 (Wikipedia example)');
  t.eq(d.encode('ascii85', new Uint8Array(8)), 'zz', 'Ascii85 zero groups → z');
  t.eq(D.decode(d.decode('ascii85', '<~9jqo^BlbD-BleB1DJ+*+F(f,q~>')), 'Man is distinguished', 'Ascii85 decode with <~ ~>');
  t.eq(d.encode('z85', Uint8Array.from([0x86, 0x4F, 0xD2, 0x6F, 0xB5, 0x59, 0xF7, 0x5B])), 'HelloWorld', 'Z85 spec vector');
  t.ok(/multiple of 4/.test(err(() => d.encode('z85', E.encode('abc')))), 'Z85 length rule');
  t.eq(d.encode('crockford', E.encode('foobar')), 'CSQPYRK1E8', 'Crockford Base32');
  t.eq(D.decode(d.decode('crockford', 'csqpyrk1e8')), 'foobar', 'Crockford decode (lower case)');
  t.eq(d.encode('base64url', Uint8Array.from([0xfb, 0xff])), '-_8', 'Base64url without padding');
  t.ok(err(() => d.decode('base58', '0OIl')), 'Base58 rejects 0 O I l');
  // ---- binary decoders
  const pb = d.bytesJson('bin:protobuf', Uint8Array.from([0x08, 0x96, 0x01, 0x12, 0x07, 0x74, 0x65, 0x73, 0x74, 0x69, 0x6e, 0x67, 0x1a, 0x03, 0x08, 0x96, 0x01]));
  t.eq(pb.text, '1: 150\n2: "testing"\n3 {\n  1: 150\n}\n', 'protobuf: varint 150, string, nested message (protobuf docs)');
  t.ok(/fixed32 1, float/.test(d.bytesJson('bin:protobuf', Uint8Array.from([0x0d, 1, 0, 0, 0])).text), 'protobuf fixed32');
  t.ok(/Not a valid protobuf/.test(err(() => d.bytesJson('bin:protobuf', Uint8Array.from([0x0a, 0x05, 0x61])))), 'truncated protobuf refused');
  const mp = d.bytesJson('bin:msgpack', Uint8Array.from([0x82, 0xa7, 0x63, 0x6f, 0x6d, 0x70, 0x61, 0x63, 0x74, 0xc3, 0xa6, 0x73, 0x63, 0x68, 0x65, 0x6d, 0x61, 0x00]));
  t.eq(mp.text, '{\n  "compact": true,\n  "schema": 0\n}\n', 'MessagePack (msgpack.org example)');
  const cbor = (hex) => d.bytesJson('bin:cbor', Uint8Array.from(Buffer.from(hex, 'hex'))).text.trim();
  t.eq(['00', '1a000f4240', '3903e7', 'f93c00', 'fb3ff199999999999a', 'f4', 'f6', '4401020304', '6449455446', 'c074323031332d30332d32315432303a30343a30305a'].map(cbor),
    ['0', '1000000', '-1000', '1.0', '1.1', 'false', 'null', "h'01020304'", '"IETF"', '0("2013-03-21T20:04:00Z")'], 'CBOR RFC 8949 Appendix A examples');
  t.eq(cbor('a26161016162820203').replace(/\s+/g, ' '), '{ "a": 1, "b": [ 2, 3 ] }', 'CBOR map with array');
  // ---- patch (compared with GNU patch when available)
  const orig = 'one\ntwo\nthree\nfour\nfive\n';
  const diff = '--- a.txt\n+++ b.txt\n@@ -1,5 +1,5 @@\n one\n-two\n+TWO\n three\n four\n-five\n+5\n';
  const pr = d.json('patch', { original: orig, patch: diff });
  t.eq([pr.result, pr.hunks, pr.added, pr.removed], ['one\nTWO\nthree\nfour\n5\n', 1, 2, 2], 'patch applies');
  t.eq(d.json('patch', { original: pr.result, patch: diff, reverse: true }).result, orig, 'reverse patch restores the original');
  t.ok(/does not apply/.test(err(() => d.json('patch', { original: 'x\ny\n', patch: diff }))), 'mismatching context refused');
  t.eq(d.json('patch', { original: orig, patch: 'diff --git a/a.txt b/a.txt\nindex 1..2 100644\n' + diff }).result, pr.result, 'git diff headers accepted');
  try { const dir = mkdtempSync(join(tmpdir(), 'pt-')); writeFileSync(join(dir, 'a.txt'), orig); writeFileSync(join(dir, 'p.diff'), diff); execFileSync('patch', ['-s', join(dir, 'a.txt'), join(dir, 'p.diff')]); t.eq(readFileSync(join(dir, 'a.txt'), 'utf8'), pr.result, 'same result as GNU patch'); } catch { /* patch not installed */ }
  // ---- SQL format
  const sql = d.text('sqlfmt', { sql: 'select a, b from t where x = 1 and y > 2 order by a', uppercase: true });
  t.eq(sql, 'SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y > 2\nORDER BY\n  a', 'SQL formatted with upper-case keywords');
  t.ok(/\t/.test(d.text('sqlfmt', { sql: 'select a from t', indent: 0 })), 'tab indent');
  // ---- hex dump
  t.eq(d.hexdump(E.encode('Hello, World!\n\x00\x01ABC'), 0, 16), '00000000  48 65 6c 6c 6f 2c 20 57  6f 72 6c 64 21 0a 00 01  |Hello, World!...|\n00000010  41 42 43                                          |ABC|\n', 'hex dump like hexdump -C');
  t.eq(d.hexdump(E.encode('AB'), 4096, 8).slice(0, 8), '00001000', 'hex dump offset');
};
