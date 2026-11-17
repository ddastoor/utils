// devcore.wasm (Rust, built by us): known answers for every op — CIDR maths (RFC 4632/4291 examples), range → blocks,
// cron next runs (independent minute-by-minute search), node-semver ranges (npm docs examples), globs, RFC 4648 test
// vectors + Bitcoin Base58 + Ascii85/Z85 spec vectors, protobuf/MessagePack/CBOR (RFC 8949 Appendix A), unified-diff
// patching, SQL formatting, hex dump.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default async (t, { load, wasm }) => {
  const { bindDevcore, tzImports } = await load('/src/wasm/devcore.ts');
  // one module per tab: route each op to its own build (devcore-<feature>.wasm)
  let zone = 'UTC';
  const mods = {};
  for (const g of ['cidr', 'cron', 'semver', 'glob', 'patch', 'sqlfmt', 'x509', 'enc', 'bin', 'hex', 'jsondiff']) mods[g] = bindDevcore(await wasm(`devcore-${g}`, g === 'cron' ? tzImports(() => zone) : {}));
  const grp = (op) => (op.startsWith('enc:') || op.startsWith('dec:') ? 'enc' : op.startsWith('bin:') ? 'bin' : op === 'hexdump' || op === 'find' ? 'hex' : op === 'jsonpatch' ? 'jsondiff' : op);
  const d = {
    json: (op, a) => { if (op === 'cron') zone = a.tz || 'UTC'; return mods[grp(op)].json(op, a); }, text: (op, a) => mods[grp(op)].text(op, a), bytesJson: (op, b) => mods[grp(op)].bytesJson(op, b),
    encode: (alg, b) => mods.enc.encode(alg, b), decode: (alg, t) => mods.enc.decode(alg, t), hexdump: (...a) => mods.hex.hexdump(...a), find: (...a) => mods.hex.find(...a),
  };
  t.ok(/unknown op/.test((() => { try { mods.cidr.json('cron', {}); } catch (e) { return e.message; } })()), 'each module only has its own ops');
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
  // ---- bug hunt, Nov 2026: 300+ networks, ranges and splits against Python's ipaddress module (tests/fixtures/cidr/reference.json)
  {
    const ref = JSON.parse(readFileSync(new URL('../fixtures/cidr/reference.json', import.meta.url), 'utf8')), bad = [];
    for (const w of ref.v4) { const r = d.json('cidr', { input: w.in }); for (const k of ['cidr', 'netmask', 'wildcard', 'broadcast', 'first', 'last', 'total', 'usable', 'integer', 'reverse', 'isNetwork']) if (r[k] !== w[k]) bad.push(`${w.in} ${k}: ${r[k]} ≠ ${w[k]}`); }
    t.ok(ref.v4.length >= 140 && !bad.length, `${ref.v4.length} IPv4 networks (every prefix length, all special blocks): network, masks, broadcast, hosts, integer, PTR name = Python ipaddress ${bad.slice(0, 4).join(' | ')}`);
    bad.length = 0;
    for (const w of ref.v6) { const r = d.json('cidr', { input: w.in }); for (const k of ['address', 'expanded', 'cidr', 'first', 'last', 'total', 'reverse', 'isNetwork']) if (r[k] !== w[k] && !(k === 'expanded' && w[k].includes('.'))) bad.push(`${w.in} ${k}: ${r[k]} ≠ ${w[k]}`); }
    t.ok(ref.v6.length >= 95 && !bad.length, `${ref.v6.length} IPv6 networks: RFC 5952 short form, expanded form, first/last, 2^n counts, ip6.arpa name = Python ipaddress ${bad.slice(0, 4).join(' | ')}`);
    bad.length = 0;
    for (const w of ref.ranges) { const r = d.json('cidr', { input: `${w.a} - ${w.b}` }); if (r.total !== w.total || JSON.stringify(r.blocks) !== JSON.stringify(w.blocks)) bad.push(`${w.a} - ${w.b}: ${r.blocks.length} blocks, total ${r.total} (want ${w.blocks.length}, ${w.total})`); }
    t.ok(ref.ranges.length >= 70 && !bad.length, `${ref.ranges.length} ranges (IPv4 + IPv6, incl. the whole address space) → the same CIDR blocks as ipaddress.summarize_address_range ${bad.slice(0, 3).join(' | ')}`);
    bad.length = 0;
    for (const w of ref.splits) {
      const r = d.json('cidr', { input: w.in, split: w.split }).subnets;
      if (r.count !== w.count || JSON.stringify(r.list.map((x) => x.cidr)) !== JSON.stringify(w.list.slice(0, 1024))) bad.push(`${w.in} → /${w.split}`);
      if (w.firstLast && (JSON.stringify(r.list.map((x) => [x.first, x.last])) !== JSON.stringify(w.firstLast) || r.list.some((x) => x.hosts !== w.hosts))) bad.push(`${w.in} → /${w.split} hosts`);
    }
    t.ok(ref.splits.length >= 12 && !bad.length, `${ref.splits.length} subnet splits (to /31, /32, IPv6 /128): same subnets, first/last host and host counts ${bad.join(' | ')}`);
  }
  // ---- X.509 (devcore-x509.wasm): fixtures made with OpenSSL, compared with what OpenSSL reports (tests/fixtures/x509/expected.json)
  {
    const x = mods.x509, fx = (f) => readFileSync(new URL(`../fixtures/x509/${f}`, import.meta.url)), exp = JSON.parse(fx('expected.json').toString());
    const dec = (b) => x.bytesJson('x509', b instanceof Uint8Array ? b : Buffer.from(b)), rfc2253 = (subj) => subj.split(', ').reverse().join(',');
    const KEY = { 'ca.pem': ['RSA', 2048], 'leaf.pem': ['EC', 256], 'ed25519.pem': ['Ed25519', 256], 'p521.pem': ['EC', 521], 'pss.pem': ['RSA-PSS', 2048], 'forever.pem': ['EC', 256], 'expired.pem': ['EC', 256], 'utf8.pem': ['RSA', 2048] };
    const SIG = { sha256WithRSAEncryption: /sha256WithRSAEncryption/i, sha384WithRSAEncryption: /sha384WithRSAEncryption/i, ED25519: /ed25519/i, 'ecdsa-with-SHA256': /ecdsa-with-SHA256/i, rsassaPss: /RSASSA-PSS/i };
    const bad = [];
    for (const [f, w] of Object.entries(exp).filter(([f]) => f.endsWith('.pem'))) {
      const c = dec(fx(f)).items[0];
      const got = { sha256: c.sha256, sha1: c.sha1, serial: c.serial.replace(/:/g, '').replace(/^00(?=.)/, ''), notBefore: c.notBefore, notAfter: c.notAfter, subject: rfc2253(c.subject), issuer: rfc2253(c.issuer), ca: c.isCA, size: c.size };
      for (const k of Object.keys(got)) if (String(got[k]) !== String(k === 'serial' ? w[k].replace(/^0+(?=.)/, '') : w[k]) && !(k === 'serial' && got[k].replace(/^0+/, '') === w[k].replace(/^0+/, ''))) bad.push(`${f} ${k}: ${got[k]} ≠ ${w[k]}`);
      if (c.key.type !== KEY[f][0] || c.key.bits !== KEY[f][1] || (w.bits && c.key.bits !== w.bits)) bad.push(`${f} key: ${c.key.type} ${c.key.bits}`);
      if (!SIG[w.sigAlg]?.test(c.sigAlg)) bad.push(`${f} signature: ${c.sigAlg} (openssl: ${w.sigAlg})`);
      if (c.kind !== 'certificate' || c.selfSigned !== (w.subject === w.issuer)) bad.push(`${f} kind/selfSigned`);
    }
    t.ok(Object.keys(exp).length >= 9 && !bad.length, `8 certificates (RSA, RSA-PSS, P-256, P-521, Ed25519, UTF-8 names, year 9999, expired in 2002): fingerprints, serial, dates, names, key type and size, signature, CA flag = OpenSSL ${bad.slice(0, 5).join(' | ')}`);
    const leaf = dec(fx('leaf.pem')).items[0];
    t.eq(leaf.sans, ['DNS:example.in', 'DNS:*.example.in', 'IP:192.0.2.7', 'IP:2001:db8::7', 'email:admin@example.in', 'URI:https://example.in/id'], 'subject alternative names: DNS, wildcard, IPv4, IPv6, e-mail, URI');
    t.eq([leaf.cn, leaf.version, leaf.isCA, leaf.selfSigned, leaf.key.curve], ['example.in', 3, false, false, 'P-256'], 'leaf: common name, v3, not a CA, not self-signed, curve');
    const e = leaf.extensions, names = Object.keys(e);
    t.ok(e['Basic Constraints (critical)'] === 'CA: no' && /Digital Signature/.test(e['Key Usage (critical)']) && /Key Encipherment/.test(e['Key Usage (critical)']) && e['Extended Key Usage'] === 'TLS Web Server Authentication, TLS Web Client Authentication', `key usage + extended key usage (${e['Key Usage (critical)']})`);
    t.ok(/OCSP – URI:http:\/\/ocsp\.example\.in/.test(e['Authority Information Access']) && /CA Issuers – URI:http:\/\/example\.in\/ca\.crt/.test(e['Authority Information Access']) && e['CRL Distribution Points'] === 'URI:http://crl.example.in/ca.crl' && /Domain Validated/.test(e['Certificate Policies']), 'AIA (OCSP + CA issuers), CRL distribution point, DV policy');
    t.ok(names.includes('Subject Key Identifier') && names.includes('Authority Key Identifier') && /^([0-9A-F]{2}:){19}[0-9A-F]{2}$/.test(e['Subject Key Identifier']), 'key identifiers');
    const ca = dec(fx('ca.pem')).items[0]; t.ok(ca.isCA && ca.selfSigned && /CA: yes, path length ≤ 1/.test(ca.extensions['Basic Constraints (critical)']) && e['Authority Key Identifier'] === ca.extensions['Subject Key Identifier'], 'CA: path length, and the leaf\'s authority key id = the CA\'s subject key id');
    t.eq(dec(fx('utf8.pem')).items[0].cn, 'Zoë’s café', 'UTF-8 common name');
    // other containers
    t.eq(dec(fx('leaf.der')).items[0].sha256, exp['leaf.pem'].sha256, 'DER file');
    const chain = dec(fx('chain.pem')).items; t.eq(chain.map((c) => c.cn), ['example.in', 'SuperTools Test Root'], 'PEM chain: both certificates, in order');
    for (const f of ['chain.p7b', 'chain.der.p7b']) { const it = dec(fx(f)).items; t.eq(it.map((c) => [c.kind, c.sha256]), [['certificate', exp['leaf.pem'].sha256], ['certificate', exp['ca.pem'].sha256]], `${f}: the certificates inside a PKCS #7 bundle (used to be "not a certificate")`); }
    const csr = dec(fx('request.csr')).items[0]; t.eq([csr.kind, csr.cn, csr.key.type, csr.key.bits, csr.sans, rfc2253(csr.subject)], ['csr', 'csr.example.in', 'RSA', 2048, ['DNS:csr.example.in', 'DNS:www.csr.example.in'], exp['request.csr'].subject], 'certificate request: subject, key, requested names');
    const pk = dec(fx('leaf.pub.pem')).items[0]; t.eq([pk.kind, pk.key.type, pk.key.bits, pk.sha256.replace(/:/g, '').toLowerCase(), pk.pin], ['pubkey', 'EC', 256, exp['leaf.pem'].spkiSha256, exp['leaf.pem'].pin], 'a lone public key: type, size, SHA-256 of the SPKI and its Base64 pin = openssl pkey | sha256');
    // PEM as people have it
    const pem = fx('leaf.pem').toString(), want = exp['leaf.pem'].sha256, forms = {
      'UTF-8 BOM': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(pem)]), 'UTF-16LE with BOM (PowerShell >)': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(pem, 'utf16le')]), 'UTF-16BE with BOM': Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(pem, 'utf16le').swap16()]),
      'UTF-16LE without BOM': Buffer.from(pem, 'utf16le'), 'CRLF line ends': pem.replace(/\n/g, '\r\n'), 'indented (YAML / Kubernetes secret)': pem.replace(/^/gm, '    '), 'quoted e-mail ("> ")': pem.replace(/^/gm, '> '), 'tabs and trailing spaces': pem.replace(/^/gm, '\t').replace(/$/gm, '  '),
      'literal \\n (JSON / .env value)': JSON.stringify(pem), 'inside a JSON object': JSON.stringify({ cert: pem, note: 'x' }), 'JSON value without a final newline': JSON.stringify({ cert: pem.trimEnd() }), 'all on one line': pem.replace(/\n/g, ' ').trim(), 'no final newline': pem.trimEnd(), 'one long Base64 line': pem.replace(/\n(?!-----)/g, '').replace('-----BEGIN CERTIFICATE-----', '-----BEGIN CERTIFICATE-----\n'),
      'text before and after (openssl s_client output)': `depth=0 CN = example.in\nverify return:1\n---\nCertificate chain\n 0 s:CN = example.in\n${pem}---\nServer certificate\n`, 'Latin-1 text before': Buffer.concat([Buffer.from('Soci\xe9t\xe9 G\xe9n\xe9rale\n', 'latin1'), Buffer.from(pem)]),
      'blank lines inside': pem.replace(/\n/g, '\n\n'), 'TRUSTED CERTIFICATE label': null };
    for (const [name, v] of Object.entries(forms)) if (v) t.eq((() => { try { return dec(v).items[0].sha256; } catch (er) { return er.message; } })(), want, `PEM read: ${name}`);
    // messages
    t.ok(/has no -----END line/.test(err(() => dec(pem.split('\n').slice(0, 10).join('\n')))), 'cut-off PEM → "has no -----END line"');
    t.ok(/not valid Base64/.test(err(() => dec('-----BEGIN CERTIFICATE-----\n!!!!\n-----END CERTIFICATE-----'))), 'PEM with a damaged body → "not valid Base64"');
    t.ok(/Not an X\.509 certificate/.test(err(() => dec('-----BEGIN CERTIFICATE-----\nMIIBhello\n-----END CERTIFICATE-----'))), 'valid Base64 that is not a certificate');
    t.ok(/closed by -----END/.test(err(() => dec(pem.replace('END CERTIFICATE', 'END X509 CRL')))), 'BEGIN / END labels that do not match');
    t.ok(/Not a certificate or certificate request/.test(err(() => dec(Buffer.from([1, 2, 3, 4, 5])))) && /Paste a certificate/.test(err(() => dec(Buffer.alloc(0)))), 'random bytes / nothing');
    const pk8 = dec('-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4f\n-----END PRIVATE KEY-----').items[0]; t.eq([pk8.kind, pk8.label, pk8.private], ['other', 'PRIVATE KEY', true], 'a private key is recognised and not decoded');
    t.eq(dec('-----BEGIN X509 CRL-----\nMAA=\n-----END X509 CRL-----').items[0].private, false, 'other block types are named, not flagged as private');
    const mixed = dec(`${pem}\n-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4f\n-----END PRIVATE KEY-----\n${fx('ca.pem')}`).items; t.eq(mixed.map((m) => m.kind), ['certificate', 'other', 'certificate'], 'certificate + key + CA in one file (a typical fullchain bundle)');
    // robustness: every truncation and many bit flips of a DER certificate give an answer or a message — never a crash
    const der = fx('leaf.der'); let traps = 0;
    for (let n = 0; n < der.length; n += 7) { try { dec(der.subarray(0, n)); } catch (er) { if (!/Not a certificate|Paste a certificate|PKCS/.test(er.message)) traps++; } }
    for (let i = 0; i < 400; i++) { const b = Buffer.from(der); b[(i * 131) % b.length] ^= 1 << (i % 8); try { dec(b); } catch (er) { if (/unreachable|RuntimeError|memory/.test(er.message)) traps++; } }
    for (const f of ['chain.der.p7b']) { const p7 = fx(f); for (let n = 0; n < p7.length; n += 13) { try { dec(p7.subarray(0, n)); } catch (er) { if (/unreachable|RuntimeError|memory/.test(er.message)) traps++; } } }
    t.eq(traps, 0, 'truncated and bit-flipped certificates / bundles never crash the engine');
  }
  // forms people paste
  t.eq(d.json('cidr', { input: '10.1.2.3 0.0.0.255' }).cidr, '10.1.2.0/24', 'wildcard (inverse) mask 0.0.0.255 = /24');
  t.eq(d.json('cidr', { input: '172.16.5.4/0.0.15.255' }).cidr, '172.16.0.0/20', 'wildcard mask after a slash');
  t.eq([d.json('cidr', { input: '10.1.2.3 255.255.255.255' }).prefix, d.json('cidr', { input: '10.1.2.3 0.0.0.0' }).prefix], [32, 0], '255.255.255.255 and 0.0.0.0 are read as netmasks (/32, /0)');
  t.ok(/not a valid netmask/.test(err(() => d.json('cidr', { input: '10.0.0.1 0.255.0.255' }))), 'a mask with holes is still refused');
  t.eq(d.json('cidr', { input: '[2001:db8::1]/64' }).cidr, '2001:db8::/64', 'bracketed IPv6');
  t.eq(d.json('cidr', { input: 'fe80::a00:27ff:fe4e:66a1%eth0/64' }).cidr, 'fe80::/64', 'IPv6 zone (%eth0) dropped');
  t.eq(d.json('cidr', { input: 'fe80::1%12' }).address, 'fe80::1', 'numeric zone dropped');
  t.eq(d.json('cidr', { input: '192.168.1.10 – 192.168.1.20' }).blocks, d.json('cidr', { input: '192.168.1.10 - 192.168.1.20' }).blocks, 'en dash in a range (as the result title prints it)');
  t.eq(d.json('cidr', { input: '192.168.1.10—192.168.1.20' }).total, '11', 'em dash without spaces');
  t.eq(d.json('cidr', { input: '10.0.0.1 to 10.0.0.4' }).blocks, ['10.0.0.1/32', '10.0.0.2/31', '10.0.0.4/32'], '"a to b" range');
  t.eq(d.json('cidr', { input: '2001:db8::1 - 2001:db8::4' }).blocks, ['2001:db8::1/128', '2001:db8::2/127', '2001:db8::4/128'], 'IPv6 range');
  t.eq(d.json('cidr', { input: '  10.0.0.0/8  ' }).cidr, '10.0.0.0/8', 'spaces around the input');
  t.eq(d.json('cidr', { input: '10.0.0.0 / 8' }).cidr, '10.0.0.0/8', 'spaces around the slash');
  t.eq(d.json('cidr', { input: '2001:DB8::ABCD/64' }).address, '2001:db8::abcd', 'upper-case IPv6 → lower case (RFC 5952)');
  t.eq(d.json('cidr', { input: '::ffff:192.0.2.128' }).v4, '192.0.2.128', 'IPv4-mapped address shows its IPv4 part');
  t.eq(d.json('cidr', { input: '10.0.0.1' }).mapped6, '::ffff:10.0.0.1', 'IPv4 → mapped IPv6 form');
  // messages
  for (const [inp, re] of [['', /Enter an address/], ['/24', /address before the \/ is missing/], ['10.0.0.1/', /prefix length after the \/ is missing/], ['10.0.0.1/abc', /not a prefix length/], ['10.0.0.1/-1', /not a prefix length/], ['10.0.0/24', /not an IPv4 or IPv6/], ['10.0.0.256', /not an IPv4/],
    ['2001:db8::/129', /too long for IPv6 \(max \/128\)/], ['2001:db8::1 255.255.0.0', /only works with IPv4/], ['example.com', /not an IPv4 or IPv6/], ['10.0.0.1 - ', /two addresses/], ['10.0.0.1 - 2001:db8::1', /same IP version/], ['10.0.0.1 - banana', /"banana" is not an address/],
    ['192.168.001.010/24', /not an IPv4/], ['1.2.3.4.5', /not an IPv4/], ['::1::2', /not an IPv4 or IPv6/], ['10.0.0.0/24/25', /not a prefix length/]]) t.ok(re.test(err(() => d.json('cidr', { input: inp }))), `"${inp}" → ${re.source.replace(/\\/g, '')}`);
  // special blocks
  t.eq(['192.0.0.8', '192.88.99.1', '198.19.255.255', '0.1.2.3', '255.255.255.255', '240.0.0.1', '239.255.255.250', '172.15.255.255', '192.167.1.1', '100.63.255.255', '100.128.0.0', '169.253.1.1'].map((a) => d.json('cidr', { input: a }).kind.split(' (')[0]),
    ['IETF protocol assignments', '6to4 relay anycast, deprecated', 'Benchmarking', '"This network"', 'Limited broadcast', 'Reserved', 'Multicast', 'Public', 'Public', 'Public', 'Public', 'Public'], 'IPv4 special blocks and their neighbours just outside');
  t.eq(['2001::1', '3fff::1', '100::1', '2002:c000:204::1', '64:ff9b::1', '::', '::1', 'fec0::1', 'fc00::1', 'fdff::1', 'fe00::1', 'febf::1', 'ff00::1', '2000::1', '3fff:1000::1', '4000::1'].map((a) => d.json('cidr', { input: a }).kind.split(' (')[0]),
    ['Teredo tunnelling', 'Documentation', 'Discard-only', '6to4', 'NAT64', 'Unspecified', 'Loopback', 'Reserved', 'Unique local', 'Unique local', 'Reserved', 'Link-local', 'Multicast', 'Global unicast', 'Global unicast', 'Reserved'], 'IPv6 special blocks and their edges');
  t.eq(['0.0.0.0', '127.255.255.255', '128.0.0.0', '191.255.255.255', '192.0.0.0', '223.255.255.255', '224.0.0.0', '239.255.255.255', '240.0.0.0'].map((a) => d.json('cidr', { input: a }).class[0]).join(''), 'AABBCCDDE', 'class boundaries');
  c = d.json('cidr', { input: '192.168.1.10/24' }); t.eq([c.binary, c.maskBinary, c.hex], ['11000000.10101000.00000001.00001010', '11111111.11111111.11111111.00000000', '0xC0A8010A'], 'binary, mask in binary, hex');
  t.ok(/between \/24 and \/32/.test(err(() => d.json('cidr', { input: '10.0.0.0/24', split: 33 }))) && /between \/64 and \/128/.test(err(() => d.json('cidr', { input: '2001:db8::/64', split: 200 }))), 'split beyond /32 or /128 refused');
  t.eq(d.json('cidr', { input: '10.0.0.0/24', split: 24 }).subnets.count, '1', 'split to the same prefix = 1 subnet');

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

  // ---- bug hunt, Nov 2026: our port of npm's semver against the package itself (node_modules/semver, the reference)
  {
    const { createRequire } = await import('node:module'); const npm = createRequire(import.meta.url)('semver');
    const V = ['0.0.0', '0.0.0-0', '0.0.1', '0.0.2', '0.0.3', '0.1.0', '0.1.2', '0.2.0', '0.2.3', '0.2.5', '0.3.0', '1.0.0', '1.0.0-0', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.1', '1.1.0', '1.2.0', '1.2.3-alpha.3', '1.2.3-alpha.7', '1.2.3-beta.1',
      '1.2.3-rc.1+build', '1.2.3', '1.2.3+build.5', 'v1.2.3', '1.2.4-0', '1.2.4', '1.2.9', '1.3.0-beta.1', '1.3.0', '1.9.9', '1.10.0', '2.0.0-0', '2.0.0-rc.1', '2.0.0', '2.1.0', '2.4.0', '2.5.0', '2.9.9', '3.0.0-alpha', '3.0.0', '3.4.5-alpha.9', '3.4.5', '5.0.0', '6.0.0', '7.2.3', '7.2.4', '8.0.0', '10.0.0', '1.0.0-0A', '1.0.0-x.7.z.92',
      '1.0.0-beta+exp.sha.5114f85', '1.2.3-alpha-beta', '1.2.3--1', '99999.99999.99999', '0.0.0-alpha', '4.5.6-pre.2', '4.5.6'];
    const R = ['', '*', 'x', 'X', '1', '1.x', '1.X', '1.*', '1.2', '1.2.x', '1.2.3', '=1.2.3', 'v1.2.3', '=v1.2.3', '^1.2.3', '^1.2', '^1', '^1.x', '^0.2.3', '^0.2', '^0.0.3', '^0.0', '^0', '^0.0.x', '^1.2.3-beta.1', '^0.0.3-beta', '^0.2.3-rc.1', '~1.2.3', '~1.2', '~1', '~0.2.3', '~0.2', '~0', '~1.2.3-beta.2', '~>1.2.3', '~> 1.2', '~ 1.2.3', '^ 1.2.3',
      '>1', '>1.2', '>1.2.3', '>=1', '>=1.2', '>=1.2.3', '<1', '<1.2', '<1.2.3', '<=1', '<=1.2', '<=1.2.3', '>1.x', '>=1.x', '<2.x', '<=2.x', '>1.2.x', '<=1.2.x', '>=1.2.0 <2', '>=1.2.3 <2.0.0', '> 1.2.3 < 2', '>= 1.2.3 <= 1.2.9', '>1.2.3 <1.2.3', '>=1.2.3 <=1.2.3', '>=1.2.3 <=1.2.3-beta', '1.2.3 1.2.4', '1.2.3 1.2.3', '1.2.3 >=1',
      '1.2.3 - 2.3.4', '1.2 - 2.3.4', '1.2.3 - 2.3', '1.2.3 - 2', '1 - 2', '1.0.0 - 1.0.0', '1.2.3-alpha.3 - 1.2.3', '1.2.3 - 1.2.4-beta', 'x - 2', '1 - x', '1.x - 2.x', '5.0.0 - 7.2.3', '1.x || 2.x', '1.x || >=2.5.0 || 5.0.0 - 7.2.3', '^1.2.3 || ^2', '>=1 <2 || 3', '1 ||', '|| 1', '||', '1 || *', '<0.0.0-0 || 1', '<1 || >3',
      '>1.2.3-alpha.3', '>=1.2.3-alpha.3 <1.2.3', '>=1.0.0-0', '>=0.0.0', '>=0.0.0-0', '<0.0.0', '<0.0.0-0', '>=1.2.3-0 <1.2.4', '*-0', '1.2.3-beta.1', '1.2.3+build', '^1.2.3+build.9', '>=1.2.3+abc <2+def', '1.2.x+build', '~1.2.3-0', '^0.0.0', '~0.0.0', '^0.0.0-0', '^1.0.0-0', '>= 1', '<   2', '>=1.2.3   <2', '\t>=1.2.3\n<2 ',
      '>=1.2.3 , <2', '1.2.3 - ', ' - 1.2.3', '^01.2.3', '>01.02.03', 'x.2.3', '1.x.3', '*.2', '>>1', '=>1', '1.2.3.4', 'banana', '^', '~', '>', '<', '>=', '=', '!1.2.3', '1.2.3 ||| 1.2.4', '1.2.3-', '^1.2.3-', '1.2.3 -2', '1.2.3- 2', '>= ^1.2.3', '^~1.2.3', '~^1.2.3', '>1.2.3 <', '1.2.3 >', '^1.2.3 ~1.2.5', '~1.2.3 ^1.2', '>=1.2 <1.3 >=1.2.5',
      '^9007199254740991.0.0', '9007199254740992.0.0', '>=9007199254740991.0.0', '1.2.3 - 9007199254740991', 'x.x.x', '1.x.x', '*.*.*', '1.*.*', '>*', '<*', '>=*', '<=*', '=*', '=1', '=1.2', '==1.2.3', 'V1.2.3', '>v1', '> v1.2', '>=v1.2.3 <v2', '1.2.3 || banana', 'latest', '1.2.3-alpha.01', '^1.2.3-alpha.x', '1.2.3-x', '>1.2.3-x'];
    const diffs = { satisfies: [], valid: [], norm: [], minv: [], maxs: [] }; let pairs = 0;
    for (const incl of [false, true]) for (const range of R) {
      const want = npm.validRange(range, { includePrerelease: incl }); let got;
      try { got = d.json('semver', { range, versions: V, prerelease: incl }); } catch { got = null; }
      if (range.trim() === '') { // the tab treats an empty box as "no range" — compare "*" semantics through an explicit star below
        continue;
      }
      if ((want === null) !== (got === null)) { diffs.valid.push(`${JSON.stringify(range)} incl=${incl}: npm ${want === null ? 'invalid' : 'valid'}, ours ${got === null ? 'invalid' : 'valid'}`); continue; }
      if (want === null) continue;
      if (got.range.normalized !== want) diffs.norm.push(`${JSON.stringify(range)} incl=${incl}: npm ${JSON.stringify(want)}, ours ${JSON.stringify(got.range.normalized)}`);
      const mv = npm.minVersion(range, { includePrerelease: incl }); if ((mv ? mv.version : null) !== got.range.min) diffs.minv.push(`${JSON.stringify(range)} incl=${incl}: npm ${mv && mv.version}, ours ${got.range.min}`);
      V.forEach((v, i) => { pairs++; const w = npm.satisfies(v, range, { includePrerelease: incl }); if (got.rows[i].satisfies !== w) diffs.satisfies.push(`${v} in ${JSON.stringify(range)} incl=${incl}: npm ${w}, ours ${got.rows[i].satisfies}`); });
      const mx = npm.maxSatisfying(V, range, { includePrerelease: incl }), mn = npm.minSatisfying(V, range, { includePrerelease: incl }), cl = (x) => (x === null ? null : npm.clean(x));
      if (cl(mx) !== got.max || cl(mn) !== got.min) diffs.maxs.push(`${JSON.stringify(range)} incl=${incl}: npm max ${mx} min ${mn}, ours max ${got.max} min ${got.min}`);
    }
    if (process.env.SEMVER_DEBUG) (await import('node:fs')).writeFileSync(process.env.SEMVER_DEBUG, JSON.stringify(diffs, null, 1));
    t.ok(pairs > 16000 && !diffs.satisfies.length, `satisfies(): ${pairs.toLocaleString('en-IN')} version × range pairs (${R.length} ranges, with and without "include pre-releases") = npm semver ${diffs.satisfies.length ? `— ${diffs.satisfies.length} differ: ${diffs.satisfies.slice(0, 4).join(' | ')}` : ''}`);
    t.ok(!diffs.valid.length, `the same ranges are valid / invalid as in npm semver ${diffs.valid.slice(0, 5).join(' | ')}`);
    t.ok(!diffs.norm.length, `"Means" (the normalised range) = npm validRange() ${diffs.norm.slice(0, 4).join(' | ')}`);
    t.ok(!diffs.minv.length, `"Lowest possible" = npm minVersion() ${diffs.minv.slice(0, 4).join(' | ')}`);
    t.ok(!diffs.maxs.length, `highest / lowest listed match = npm maxSatisfying() / minSatisfying() ${diffs.maxs.slice(0, 4).join(' | ')}`);
    // the cases the old engine got wrong
    t.eq(sat('>1.2.3 <1.2.3', ['1.0.0', '1.2.3', '2.0.0']), [false, false, false], 'a range nothing can satisfy matches nothing (it used to match everything)');
    t.eq(sat('1.2.3 1.2.4', ['1.2.3', '1.2.4']), [false, false], 'two different exact versions in one set match nothing (used to match both)');
    t.ok(/not a valid range/.test(err(() => sv('^01.2.3', ['1.2.3']))) && /not a valid range/.test(err(() => sv('x.2.3', ['1.2.3']))) && /not a valid range/.test(err(() => sv('1.2.3 - ', ['1.2.3']))), 'ranges npm refuses are refused (^01.2.3, x.2.3, "1.2.3 - ")');
    t.eq(sv('1.x', ['1.0.0-alpha', '1.5.0-rc.1', '2.0.0-0'], { prerelease: true }).rows.map((x) => x.satisfies), [true, true, false], '"include pre-releases": 1.x takes 1.0.0-alpha and 1.5.0-rc.1, not 2.0.0-0');
    // versions: validity, cleaned form, order
    const VV = [...V, '1.2', 'a.b.c', '1.2.3.4', '01.2.3', '1.02.3', '1.2.03', '1.2.3-', '1.2.3abc', '1.2.3-01', '1.2.3-0', '1.2.3-a.01', '1.2.3-a..b', '1.2.3+', '1.2.3+a..b', '1.2.3-+', '=1.2.3', ' 1.2.3 ', 'V1.2.3', 'vv1.2.3', '1.2.3-é', '9007199254740991.0.0', '9007199254740992.0.0', '0.0.9007199254740991', '1.2.3-9007199254740993', '1.2.3-00', '-1.2.3', '1.-2.3', '1,2,3', '1.2.3-a_b', '1.2.3+a_b', `1.2.3-${'a'.repeat(250)}`, `1.2.3-${'a'.repeat(260)}`, '1.2.3-rc.1+build.5', '1.2.3-0123', '1.2.3-0123a', '1.2.3--', '1.2.3----RC-SNAPSHOT.12.9.1--.12+788', '1.0.0+0.build.1-rc.10000aaa-kk-0.1'];
    const vr = sv('', VV).rows, vbad = VV.filter((v, i) => { const w = npm.valid(v.trim()); const row = vr.find((x) => x.input === v.trim()); return v.trim() ? (w === null) !== !row.valid || (w !== null && row.version !== w) : false; });
    t.ok(!vbad.length, `${VV.length} version strings: valid / not valid and the cleaned form = npm valid() ${vbad.slice(0, 6).map((x) => JSON.stringify(x)).join(' ')}`);
    const okV = VV.map((v) => v.trim()).filter((v) => npm.valid(v)), ours = sv('', okV).sorted.map((x) => x.replace(/\+.*$/, '')), theirs = npm.sort([...okV]).map((v) => npm.clean(v) ?? new npm.SemVer(v).version);
    t.eq(ours, theirs, `${okV.length} versions sorted = npm sort() (pre-release identifiers: numbers before words, numbers by value)`);
    // bumps: every release type × pre-release id × many starting versions
    const bbad = [];
    for (const v of ['1.2.3', '1.2.3-0', '1.2.3-beta', '1.2.3-beta.1', '1.2.3-beta.1.2', '1.2.3-rc.9', '1.2.3-alpha.beta', '0.0.0', '0.0.0-0', '1.0.0-0', '1.1.0-0', '1.0.1-0', '2.0.0-rc.1', '1.2.3+build.1', '1.2.3-beta.5+build', '1.2.0-beta', '1.0.0-x.7.z.92', '1.2.3-1.2.3', '1.2.3-a.b.c', '9.9.9-rc', '1.2.3-beta.x'])
      for (const preid of ['', 'beta', 'rc', 'alpha', 'beta.1', 'x', '0', '01', 'a b', 'é', 'next-major']) {
        const got = (() => { try { return sv('', [v], { preid }).bumps; } catch (e) { return { error: e.message }; } })();
        for (const k of ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease']) { const w = npm.inc(v, k, {}, preid || undefined); if ((got[k] ?? null) !== w) bbad.push(`${v} ${k} preid=${JSON.stringify(preid)}: npm ${w}, ours ${got[k]}`); }
      }
    t.ok(!bbad.length, `next versions: 21 versions × 7 kinds of bump × 11 pre-release ids = npm inc() ${bbad.slice(0, 5).join(' | ')} ${bbad.length > 5 ? `(+${bbad.length - 5})` : ''}`);
  }
  // ---- glob
  const gl = (patterns, paths, o = {}) => d.json('glob', { patterns, paths, ...o }).rows.map((x) => x.match);
  t.eq(gl(['*.js'], ['a.js', 'src/a.js', 'a.ts']), [true, false, false], '* does not cross /');
  t.eq(gl(['**/*.js'], ['a.js', 'src/a.js', 'src/x/y/a.js', 'a.jsx']), [true, true, true, false], '** crosses directories');
  t.eq(gl(['src/**', '!src/**/*.test.ts'], ['src/a.ts', 'src/a.test.ts', 'lib/a.ts']), [true, false, false], 'negation: last match wins');
  // ---- bug hunt, Nov 2026: our own Unicode-aware matcher (replaced the globset crate, which matched bytes) against Python's glob.translate
  {
    const ref = JSON.parse(readFileSync(new URL('../fixtures/glob/reference.json', import.meta.url), 'utf8')), bad = [];
    for (const [pat, bits] of ref.patterns) {
      let got; try { const r = d.json('glob', { patterns: [pat], paths: ref.paths }); got = r.errors.length ? `ERR ${r.errors[0].error}` : r.rows.map((x) => (x.match ? '1' : '0')).join(''); } catch (e) { got = `THROW ${e.message}`; }
      if (got !== bits) bad.push(`${JSON.stringify(pat)}: ${got.startsWith('ERR') || got.startsWith('THROW') ? got : ref.paths.filter((_, i) => got[i] !== bits[i]).map((x) => `${x}${bits[ref.paths.indexOf(x)] === '1' ? ' (should match)' : ' (should not)'}`).slice(0, 4).join(', ')}`);
    }
    t.ok(ref.patterns.length >= 400 && !bad.length, `${ref.patterns.length} patterns × ${ref.paths.length} paths (ASCII, accents, Devanagari, emoji; * ? [...] ranges, negation, **) = ${ref.source} ${bad.length ? `— ${bad.length} differ: ${bad.slice(0, 5).join(' | ')}` : ''}`);
  }
  t.eq(gl(['?.txt'], ['a.txt', 'é.txt', 'न.txt', '😀.txt', 'ab.txt', '.txt']), [true, true, true, true, false, false], '? is one character, whatever its size in bytes (é, न and 😀 used to need ??, ??? and ????)');
  t.eq(gl(['[éन😀].txt', 'file[!x].txt'], ['é.txt', 'न.txt', '😀.txt', 'e.txt', 'fileé.txt', 'filex.txt']), [true, true, true, false, true, false], 'non-ASCII characters inside […] and against [!…]');
  t.eq(gl(['[а-я]*', '[अ-ह]*'], ['привет', 'नमस्ते', 'hello']), [true, true, false], 'ranges of non-Latin letters');
  t.eq(gl(['É*', 'straße.*', '*.TXT', 'नमस्ते*', '[A-C]*'], ['école.txt', 'École.txt', 'STRASSE.txt', 'Straße.txt', 'a.txt', 'É.TXT', 'नमस्ते.md', 'banana', 'dog'], { caseInsensitive: true }), [true, true, true, true, true, true, true, true, false], 'case-insensitive matching knows non-ASCII letters (É = é, Devanagari unaffected)');
  t.eq(gl(['straße*'], ['STRASSE.txt', 'Straße.txt', 'STRAßE'], { caseInsensitive: true }), [false, true, true], 'ß is not SS');
  t.eq(gl(['É*'], ['école.txt', 'École.txt']), [false, true], 'case-sensitive by default');
  // braces
  t.eq(gl(['*.{json,md}'], ['a.json', 'b.md', 'c.txt', 'd/e.md']), [true, true, false, false], '{a,b}');
  t.eq(gl(['{a,b{c,d}}'], ['a', 'bc', 'bd', 'b', 'abc']), [true, true, true, false, false], 'nested braces');
  t.eq(gl(['x{,.tar}.gz'], ['x.gz', 'x.tar.gz', 'x.zip.gz']), [true, true, false], 'an empty alternative');
  t.eq(gl(['{src,docs}/**/*.{ts,md}'], ['src/a.ts', 'src/x/y/b.md', 'docs/n.md', 'lib/a.ts', 'src/a.js']), [true, true, true, false, false], 'braces with ** and extensions');
  t.eq(gl(['{a}', '{}', '{,}'], ['a', '{a}', '{}', '']), [true, false, false], 'a single alternative is that text; {} and {,} match nothing visible');
  t.eq(gl(['[{,}]', 'a[,]b'], ['{', ',', '}', 'a,b']), [true, true, true, true], 'braces and commas inside […] are literal');
  t.eq(gl(['\\{a,b\\}', 'a\\*b', 'a\\?b', '\\!x', '\\#y', 'c\\[1\\]'], ['{a,b}', 'a*b', 'a?b', '!x', '#y', 'c[1]', 'axb', 'a']), [true, true, true, true, true, true, false, false], 'backslash makes { } * ? ! # [ ] literal');
  // ** rules
  t.eq(gl(['a/**'], ['a', 'a/', 'a/b', 'a/b/c', 'ab/c']), [false, true, true, true, false], 'a/** = everything inside a (not a itself)');
  t.eq(gl(['**/b'], ['b', 'a/b', 'x/y/b', 'ab', 'b/c']), [true, true, true, false, false], '**/b at any depth, including the top');
  t.eq(gl(['a/**/b'], ['a/b', 'a/x/b', 'a/x/y/b', 'a/xb', 'ab']), [true, true, true, false, false], 'a/**/b: zero or more folders between');
  t.eq(gl(['**'], ['a', 'a/b/c', '.x']), [true, true, true], '** alone matches everything');
  t.eq(gl(['a**b', '**.ts'], ['ab', 'axxb', 'a/b', 'x.ts', 'd/x.ts']), [true, true, false, true, false], '** that is not a whole component behaves like * (stays inside one folder)');
  // errors and cost
  const ge = (p) => d.json('glob', { patterns: [p], paths: ['a'] }).errors.map((e) => e.error).join();
  t.ok(/unclosed character class/.test(ge('[')) && /unclosed character class/.test(ge('[!]')) && /unclosed alternate group/.test(ge('{a,b')) && /unopened alternate group/.test(ge('a}')) && /invalid range; 'z' > 'a'/.test(ge('[z-a]')) && /dangling/.test(ge('a\\')), 'six kinds of broken pattern are named');
  t.ok(/too many/.test(ge('{a,b}'.repeat(13))), 'a pattern that would expand to more than 4,096 alternatives is refused');
  { const t0 = Date.now(); const r = gl(['*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a*a', `a${'*'.repeat(50)}b`, `${'[a-z]*'.repeat(40)}!`], ['a'.repeat(400), `a${'x'.repeat(400)}`, 'a'.repeat(300)]); t.ok(Date.now() - t0 < 1500 && r.join() === 'true,false,true', `patterns that make naive matchers explode finish at once (${Date.now() - t0} ms)`); }
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
  // ---- encodings against Python's base64 module and spec implementations of Base58 / Crockford (scripts/make-enc-reference.py)
  {
    const ref = JSON.parse(readFileSync(new URL('../fixtures/enc/reference.json', import.meta.url), 'utf8')).rows;
    const hx = (b) => Buffer.from(b).toString('hex');
    const ALG = ['base16', 'base32', 'base32hex', 'crockford', 'base58', 'base58check', 'ascii85', 'z85', 'base64', 'base64url'];
    for (const alg of ALG) {
      const rows = ref.filter((r) => r[alg] !== null);
      const encBad = rows.filter((r) => d.encode(alg, Buffer.from(r.hex, 'hex')) !== r[alg]);
      t.eq(encBad.slice(0, 3).map((r) => r.hex), [], `${alg}: ${rows.length} random values encode as the reference does`);
      const decBad = rows.filter((r) => { try { return hx(d.decode(alg, r[alg])) !== r.hex; } catch { return true; } });
      t.eq(decBad.slice(0, 3).map((r) => r[alg]), [], `${alg}: the reference text decodes back to the bytes`);
    }
    // text as people paste it: no padding, lower case, wrapped lines, spaces
    const messy = (s, i) => s.replace(/=+$/, '').replace(/(.{7})/g, i % 2 ? '$1\n' : '$1 ');
    for (const alg of ['base32', 'base32hex', 'base64', 'base64url']) {
      const bad = ref.filter((r, i) => { try { return hx(d.decode(alg, messy(alg.startsWith('base32') && i % 3 === 0 ? r[alg].toLowerCase() : r[alg], i))) !== r.hex; } catch { return true; } });
      t.eq(bad.length, 0, `${alg}: unpadded, wrapped${alg.startsWith('base32') ? ', lower-case' : ''} text decodes (${ref.length} values)`);
    }
    t.eq(ref.filter((r) => hx(d.decode('base64', r.base64url)) !== r.hex || hx(d.decode('base64url', r.base64)) !== r.hex).length, 0, 'Base64 and Base64url read each other’s alphabet');
    t.eq(ref.filter((r) => hx(d.decode('base16', r.hex.replace(/(..)/g, '$1:').slice(0, -1))) !== r.hex || hx(d.decode('base16', r.hex.replace(/(..)/g, '0x$1, '))) !== r.hex || hx(d.decode('base16', r.hex.replace(/(..)/g, '\\x$1'))) !== r.hex).length, 0, 'hex with colons, 0x.., and \\x.. decodes');
    t.eq(ref.filter((r) => hx(d.decode('crockford', r.crockford.toLowerCase().replace(/(.{4})/g, '$1-'))) !== r.hex).length, 0, 'Crockford: lower case with hyphens decodes');
    t.eq(ref.filter((r) => hx(d.decode('ascii85', `<~${r.ascii85.replace(/(.{20})/g, '$1\n')}~>`)) !== r.hex).length, 0, 'Ascii85: <~ ~> frame and line breaks');
  }
  { // 9 MiB + 3 bytes: data-encoding refuses 8 MiB and more on a 32-bit target, so long inputs go through in pieces
    const n = (9 << 20) + 3, big = new Uint8Array(n); for (let i = 0; i < n; i++) big[i] = (i * 2654435761) >>> 24;
    const node = { base64: Buffer.from(big).toString('base64'), base64url: Buffer.from(big).toString('base64url'), base16: Buffer.from(big).toString('hex').toUpperCase() };
    for (const alg of ['base64', 'base64url', 'base16', 'base32', 'base32hex', 'crockford', 'ascii85']) {
      const s2 = d.encode(alg, big), back = d.decode(alg, s2);
      t.ok(back.length === n && Buffer.compare(Buffer.from(back), Buffer.from(big)) === 0 && (!node[alg] || node[alg] === s2), `${alg}: a 9 MiB file encodes${node[alg] ? ' exactly as Node does' : ''} and decodes back`);
    }
  }
  const dh = (alg, s) => Buffer.from(d.decode(alg, s)).toString('hex');
  t.eq([dh('base32', 'MZXW6'), dh('base32', 'mzxw6ytboi'), dh('base32', 'MZXW6YQ'), dh('base32', 'MZ XW 6Y TB OI =='), dh('base32', 'MZXW6===MZXW6===')], ['666f6f', '666f6f626172', '666f6f62', '666f6f626172', '666f6f666f6f'], 'Base32: padding is optional (TOTP secrets, spaced groups, joined blocks)');
  t.eq(dh('base32hex', 'CPNMU'), '666f6f', 'Base32hex without padding');
  t.eq([dh('base32', 'MR======'), dh('base32', 'MZXW7==='), dh('base64', 'Zh==')], ['64', '666f6f', '66'], 'non-zero spare bits are accepted (as Python and most tools do)');
  t.ok(/missing or extra/.test(err(() => d.decode('base32', 'M'))) && /missing or extra/.test(err(() => d.decode('base32', 'MZX'))) && /missing or extra/.test(err(() => d.decode('base64', 'Zm9vY'))), 'impossible lengths are explained');
  t.ok(/'0' is not a character/.test(err(() => d.decode('base32', '0ZXW6==='))) && /'!' is not/.test(err(() => d.decode('base64', 'Zm9!'))) && /'é' is not/.test(err(() => d.decode('base32', 'MZé'))), 'the wrong character is named');
  t.eq([dh('base64', 'Zg==Zg=='), dh('base64', 'Zm9v\r\nYmFy'), dh('base64', '===='), dh('base64url', '+/8=')], ['6666', '666f6f626172', '', 'fbff'], 'Base64: joined blocks, CRLF, only padding, mixed alphabet');
  t.eq(dh('base64', 'data:text/plain;base64,Zm9v'), '666f6f', 'Base64: the header of a data: URL is skipped');
  t.ok(/not Base64/.test(err(() => d.decode('base64', 'data:text/plain,hello'))), 'a data: URL without ;base64 is refused with the reason');
  t.eq([dh('base16', '0x66'), dh('base16', '66:6f'), dh('base16', '0x6, 0xf'), dh('base16', '550e8400-e29b-41d4-a716-446655440000'), dh('base16', '0X666F6F'), dh('base16', 'DE AD\tBE\nEF')], ['66', '666f', '060f', '550e8400e29b41d4a716446655440000', '666f6f', 'deadbeef'], 'hex: 0x, colons, single prefixed digits, a UUID, tabs and newlines');
  t.ok(/two digits per byte/.test(err(() => d.decode('base16', '6'))) && /'g' is not/.test(err(() => d.decode('base16', '6g'))), 'hex errors in plain words');
  t.eq(dh('crockford', 'CSQPYRK1E8='), '666f6f626172', 'Crockford: stray padding ignored');
  t.ok(/'U' is not/.test(err(() => d.decode('crockford', 'CSQPYRKUE8'))), 'Crockford has no U');
  t.ok(/'é'/.test(err(() => d.decode('z85', 'Hélo'))), 'Z85 names a non-ASCII character as typed');
  t.eq([dh('ascii85', '<~~>'), dh('ascii85', 'z'), dh('ascii85', '!!'), dh('ascii85', 's8W-!')], ['', '00000000', '00', 'ffffffff'], 'Ascii85 edge cases');
  t.ok(/overflows/.test(err(() => d.decode('ascii85', 's8W-"'))) && /inside a group/.test(err(() => d.decode('ascii85', '!!z'))) && /at least 2/.test(err(() => d.decode('ascii85', '!'))), 'Ascii85 errors');
  t.eq(['base16', 'base32', 'base32hex', 'crockford', 'base58', 'ascii85', 'z85', 'base64', 'base64url'].map((a) => d.encode(a, new Uint8Array(0))), Array(9).fill(''), 'nothing in → nothing out (every encoding)');
  t.eq([d.encode('base58check', new Uint8Array(0)), dh('base58check', '3QJmnh'), dh('base58', '111')], ['3QJmnh', '', '000000'], 'Base58Check of nothing; Base58 of only 1s');
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
  // ---- binary decoders against cbor2, msgpack and google.protobuf (scripts/make-bin-reference.py)
  {
    const ref = JSON.parse(readFileSync(new URL('../fixtures/bin/reference.json', import.meta.url), 'utf8'));
    for (const fmt of ['cbor', 'msgpack', 'protobuf']) {
      const bad = ref[fmt].filter((r) => { try { const o = d.bytesJson(`bin:${fmt}`, Buffer.from(r.hex, 'hex')); return o.text !== r.text || o.count !== r.count || o.error !== null; } catch { return true; } });
      t.eq(bad.slice(0, 2).map((r) => r.hex.slice(0, 80)), [], `${fmt}: ${ref[fmt].length} random messages decode to the reference text`);
      // cutting a message anywhere must give an error or a shorter dump — never a trap, never invented data
      let trapped = 0, n = 0;
      for (const r of ref[fmt].slice(0, 40)) { const b = Buffer.from(r.hex, 'hex'); for (let k = 1; k < Math.min(b.length, 60); k += 3) { n++; try { d.bytesJson(`bin:${fmt}`, b.subarray(0, k)); } catch (e) { if (/unreachable|out of bounds|RuntimeError/.test(String(e))) trapped++; } } }
      t.eq(trapped, 0, `${fmt}: ${n} truncated messages never trap the engine`);
    }
  }
  const bin = (fmt, hex) => { try { const o = d.bytesJson(`bin:${fmt}`, Uint8Array.from(Buffer.from(hex.replace(/\s/g, ''), 'hex'))); return o.error ? `${o.text}!! ${o.error}` : o.text; } catch (e) { return `ERR ${e.message}`; } };
  // RFC 8949 Appendix A, the whole table (our layout puts array / map members on their own lines)
  const flat = (s) => s.trim().replace(/\n\s*/g, ' ').replace(/([[{]) /g, '$1').replace(/(?<=[^_]) (?=[\]}])/g, '');
  const A = [['00', '0'], ['01', '1'], ['0a', '10'], ['17', '23'], ['1818', '24'], ['1819', '25'], ['1864', '100'], ['1903e8', '1000'], ['1a000f4240', '1000000'], ['1b000000e8d4a51000', '1000000000000'],
    ['1bffffffffffffffff', '18446744073709551615'], ['c249010000000000000000', '18446744073709551616'], ['3bffffffffffffffff', '-18446744073709551616'], ['c349010000000000000000', '-18446744073709551617'],
    ['20', '-1'], ['29', '-10'], ['3863', '-100'], ['3903e7', '-1000'], ['f90000', '0.0'], ['f98000', '-0.0'], ['f93c00', '1.0'], ['fb3ff199999999999a', '1.1'], ['f93e00', '1.5'], ['f97bff', '65504.0'],
    ['fa47c35000', '100000.0'], ['fa7f7fffff', '3.4028234663852886e+38'], ['fb7e37e43c8800759c', '1.0e+300'], ['f90001', '5.960464477539063e-8'], ['f90400', '0.00006103515625'], ['f9c400', '-4.0'],
    ['fbc010666666666666', '-4.1'], ['f97c00', 'Infinity'], ['f97e00', 'NaN'], ['f9fc00', '-Infinity'], ['fa7f800000', 'Infinity'], ['fa7fc00000', 'NaN'], ['faff800000', '-Infinity'],
    ['fb7ff0000000000000', 'Infinity'], ['fb7ff8000000000000', 'NaN'], ['fbfff0000000000000', '-Infinity'], ['f4', 'false'], ['f5', 'true'], ['f6', 'null'], ['f7', 'undefined'], ['f0', 'simple(16)'], ['f8ff', 'simple(255)'],
    ['c074323031332d30332d32315432303a30343a30305a', '0("2013-03-21T20:04:00Z")'], ['c11a514b67b0', '1(1363896240) / 2013-03-21T20:04:00Z /'], ['c1fb41d452d9ec200000', '1(1363896240.5) / 2013-03-21T20:04:00.500Z /'],
    ['d74401020304', "23(h'01020304')"], ['d818456449455446', "24(h'6449455446')"], ['d82076687474703a2f2f7777772e6578616d706c652e636f6d', '32("http://www.example.com")'],
    ['40', "h''"], ['4401020304', "h'01020304'"], ['60', '""'], ['6161', '"a"'], ['6449455446', '"IETF"'], ['62225c', '"\\"\\\\"'], ['62c3bc', '"ü"'], ['63e6b0b4', '"水"'], ['64f0908591', '"𐅑"'],
    ['80', '[]'], ['83010203', '[1, 2, 3]'], ['8301820203820405', '[1, [2, 3], [4, 5]]'], ['98190102030405060708090a0b0c0d0e0f101112131415161718181819', `[${Array.from({ length: 25 }, (_, i) => i + 1).join(', ')}]`],
    ['a0', '{}'], ['a201020304', '{1: 2, 3: 4}'], ['a26161016162820203', '{"a": 1, "b": [2, 3]}'], ['826161a161626163', '["a", {"b": "c"}]'], ['a56161614161626142616361436164614461656145', '{"a": "A", "b": "B", "c": "C", "d": "D", "e": "E"}'],
    ['5f42010243030405ff', "(_ h'0102', h'030405')"], ['7f657374726561646d696e67ff', '(_ "strea", "ming")'], ['9fff', '[_ ]'], ['9f018202039f0405ffff', '[_ 1, [2, 3], [_ 4, 5]]'], ['9f01820203820405ff', '[_ 1, [2, 3], [4, 5]]'],
    ['83018202039f0405ff', '[1, [2, 3], [_ 4, 5]]'], ['83019f0203ff820405', '[1, [_ 2, 3], [4, 5]]'], ['9f0102030405060708090a0b0c0d0e0f101112131415161718181819ff', `[_ ${Array.from({ length: 25 }, (_, i) => i + 1).join(', ')}]`],
    ['bf61610161629f0203ffff', '{_ "a": 1, "b": [_ 2, 3]}'], ['826161bf61626163ff', '["a", {_ "b": "c"}]'], ['bf6346756ef563416d7421ff', '{_ "Fun": true, "Amt": -2}']];
  t.eq(A.filter(([h, w]) => flat(bin('cbor', h)) !== w).map(([h, w]) => `${h} → ${flat(bin('cbor', h))} ≠ ${w}`), [], `CBOR: all ${A.length} examples of RFC 8949 Appendix A`);
  t.eq(bin('cbor', '83 01 82 02 03 a1 61 61 f5'), '[\n  1,\n  [\n    2,\n    3\n  ],\n  {\n    "a": true\n  }\n]\n', 'CBOR layout: one member per line, two spaces per level');
  t.eq([bin('cbor', 'c2581900112233445566778899aabbccddeeff001122334455667788').trim(), bin('cbor', 'c24105').trim(), bin('cbor', 'c340').trim(), bin('cbor', 'c26161').trim()],
    ['420114521374899418442343030677428126341162808803827545992', '5', '-1', '2("a")'], 'CBOR bignums of any length are shown as numbers (a tag 2 around text stays a tag)');
  t.eq([bin('cbor', 'f6f7'), bin('cbor', 'a1f701').replace(/\s+/g, ' '), bin('cbor', '5fff'), bin('cbor', 'bfff'), bin('cbor', 'd9d9f7a0')], ['null\n\nundefined\n', '{ undefined: 1 } ', '(_ )\n', '{_ }\n', '55799({})\n'], 'CBOR: undefined is not null; empty indefinite items; self-described tag');
  t.eq(['18', '1c', '62c328', '817f', 'f818', 'ff', '5f6161ff', 'c2', '3f', '9f01'].map((h) => bin('cbor', h)), [
    'ERR Not valid CBOR: the data ends in the middle of the value that starts at byte 0', 'ERR Not valid CBOR: byte 0x1c at 0 is not valid CBOR (a reserved length code)', 'ERR Not valid CBOR: the text string at byte 0 is not valid UTF-8',
    'ERR Not valid CBOR: the data ends in the middle of the value that starts at byte 1', 'ERR Not valid CBOR: simple value 24 at byte 0 must be written in one byte', 'ERR Not valid CBOR: unexpected break (0xff) at byte 0',
    'ERR Not valid CBOR: the chunk at byte 1 of the indefinite-length string at byte 0 is not a byte string', 'ERR Not valid CBOR: the data ends at byte 1, where another value should start', 'ERR Not valid CBOR: byte 0x3f at 0 is not valid CBOR (a reserved length code)',
    'ERR Not valid CBOR: the data ends in the middle of the value that starts at byte 0'], 'CBOR errors say what is wrong and where, in plain words');
  t.eq(bin('cbor', '01 02 ff'), '1\n\n2\n!! Not valid CBOR: unexpected break (0xff) at byte 2', 'CBOR: the values before a bad one are still shown');
  t.ok(/deeper than 100/.test(bin('cbor', '81'.repeat(300) + '01')) && /deeper than 100/.test(bin('msgpack', '91'.repeat(3000) + '01')) && bin('cbor', '81'.repeat(90) + '01').length > 4000, 'deep nesting is refused at 100 levels (90 levels decode)');
  t.eq(bin('cbor', '5b ffffffffffffffff'), 'ERR Not valid CBOR: the byte string at byte 0 says 18446744073709551615 bytes but only 0 remain', 'CBOR: an impossible length is refused without allocating');
  t.ok(/h'(00){256}…' \/ 300 bytes, first 256 shown \//.test(bin('cbor', '59012c' + '00'.repeat(300))), 'long byte strings are cut in the dump, with their length');
  // MessagePack: every format byte family (spec), by hand
  const M = [['00', '0'], ['7f', '127'], ['ff', '-1'], ['e0', '-32'], ['cc80', '128'], ['cdffff', '65535'], ['ce00010000', '65536'], ['cfffffffffffffffff', '18446744073709551615'], ['d080', '-128'], ['d18000', '-32768'],
    ['d280000000', '-2147483648'], ['d38000000000000000', '-9223372036854775808'], ['c0', 'null'], ['c2', 'false'], ['c3', 'true'], ['ca3fc00000', '1.5'], ['ca3dcccccd', '0.1'], ['cb3ff0000000000000', '1.0'],
    ['cb7e37e43c8800759c', '1.0e+300'], ['cb7ff8000000000000', 'NaN'], ['cb7ff0000000000000', 'Infinity'], ['cbfff0000000000000', '-Infinity'], ['cb8000000000000000', '-0.0'], ['a0', '""'], ['a161', '"a"'],
    ['d90161', '"a"'], ['da000161', '"a"'], ['db0000000161', '"a"'], ['a3610a22', '"a\\n\\""'], ['a17f', '"\\u007f"'], ['a2c328', '<invalid UTF-8, 2 bytes: c328>'], ['c400', '<bin 0 bytes>'], ['c4030102ff', '<bin 3 bytes: 0102ff>'],
    ['c50001aa', '<bin 1 byte: aa>'], ['c600000001aa', '<bin 1 byte: aa>'], ['d40105', '<ext type 1, 1 byte: 05>'], ['d5020102', '<ext type 2, 2 bytes: 0102>'], ['c7000a', '<ext type 10, 0 bytes>'], ['c703f6010203', '<ext type -10, 3 bytes: 010203>'],
    ['d6ff5a4af700', '<timestamp 2018-01-02T03:05:36Z>'], ['d6ff00000000', '<timestamp 1970-01-01T00:00:00Z>'], ['d6ffffffffff', '<timestamp 2106-02-07T06:28:15Z>'], ['d7ff0ee6b28000000001', '<timestamp 1970-01-01T00:00:01.062500Z>'],
    ['c70cff3b9ac9ffffffffffffffffff', '<timestamp 1969-12-31T23:59:59.999999999Z>'], ['c70cffffffffff0000000000000000', '<timestamp invalid: 4294967295 nanoseconds>'], ['c70cff000000007fffffffffffffff', '<timestamp 9223372036854775807 s (outside the calendar range)>'],
    ['90', '[]'], ['80', '{}'], ['dc0000', '[]'], ['dd00000000', '[]'], ['de0000', '{}'], ['df00000000', '{}'], ['920102', '[1, 2]'], ['8101a161', '{1: "a"}'], ['81c0c0', '{null: null}'], ['81920102a161', '{[1, 2]: "a"}'], ['dc00020102', '[1, 2]']];
  t.eq(M.filter(([h, w]) => flat(bin('msgpack', h)) !== w).map(([h, w]) => `${h} → ${flat(bin('msgpack', h))} ≠ ${w}`), [], `MessagePack: ${M.length} values covering every format byte`);
  t.eq(['c1', '92c1c1', '93', 'd9ff', 'c6ffffffff', 'dd7fffffff', ''].map((h) => bin('msgpack', h)), ['ERR Not valid MessagePack: byte 0xc1 at 0 is never used in MessagePack', 'ERR Not valid MessagePack: byte 0xc1 at 1 is never used in MessagePack',
    'ERR Not valid MessagePack: the data ends at byte 1, where another value should start', 'ERR Not valid MessagePack: the string at byte 0 says 255 bytes but only 0 remain', 'ERR Not valid MessagePack: the bin at byte 0 says 4294967295 bytes but only 0 remain',
    'ERR Not valid MessagePack: the data ends at byte 5, where another value should start', '(nothing to decode)'], 'MessagePack errors (0xc1 is not nil), impossible lengths, nothing in');
  t.eq(bin('msgpack', '01 a161 c1'), '1\n\n"a"\n!! Not valid MessagePack: byte 0xc1 at 3 is never used in MessagePack', 'MessagePack: the values before a bad one are still shown');
  // protobuf: readings that used to be wrong
  const pbx = (hex, op = 'bin:protobuf') => { try { const o = d.bytesJson(op, Uint8Array.from(Buffer.from(hex.replace(/\s/g, ''), 'hex'))); return o.error ? `${o.text}!! ${o.error}` : o.text; } catch (e) { return `ERR ${e.message}`; } };
  const lenp = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n >>>= 7; } o.push(n); return Buffer.from(o).toString('hex'); }, hx = (s) => Buffer.from(s).toString('hex');
  const fox = '0a' + lenp(43) + hx('The quick brown fox jumps over the lazy dog');
  t.eq(pbx('1a' + lenp(fox.length / 2) + fox), '3 {  # or the text "\\n+The quick brown fox jumps over the laz…"\n  1: "The quick brown fox jumps over the lazy dog"\n}\n', 'protobuf: a message whose bytes are also text with a control character is shown as the message (the other reading noted)');
  t.eq(pbx('0a2a2228' + hx('0123456789012345678901234567890123456789')), '1 {  # or the text "\\"(01234567890123456789012345678901234567…"\n  4: "0123456789012345678901234567890123456789"\n}\n', 'protobuf: text that is also a message holding a string → message, with the other reading noted');
  t.eq([pbx('0a024869'), pbx('0a023830'), pbx('0a03666f6f')], ['1: "Hi"  # could also be a nested message\n', '1: "80"  # could also be a nested message\n', '1: "foo"\n'], 'protobuf: short text that happens to parse (Hi, 80) stays text, and says so');
  t.eq([pbx('0801'), pbx('0801', 'bin:protobuf+sint'), pbx('08ffffffffffffffffff01'), pbx('08ffffffffffffffffff01', 'bin:protobuf+sint')], ['1: 1\n', '1: 1  # sint -1\n', '1: 18446744073709551615  # int64 -1\n', '1: 18446744073709551615  # int64 -1, sint -9223372036854775808\n'], 'protobuf: zigzag readings only on request');
  t.eq([pbx('09000000000000f03f'), pbx('090100000000000000'), pbx('09ffffffffffffef7f'), pbx('0d0000803f'), pbx('0dffff7f7f'), pbx('0d01000000')], ['1: 0x3ff0000000000000  # fixed64 4607182418800017408, double 1.0\n', '1: 0x0000000000000001  # fixed64 1, double 5.0e-324\n',
    '1: 0x7fefffffffffffff  # fixed64 9218868437227405311, double 1.7976931348623157e+308\n', '1: 0x3f800000  # fixed32 1065353216, float 1.0\n', '1: 0x7f7fffff  # fixed32 2139095039, float 3.4028235e+38\n', '1: 0x00000001  # fixed32 1, float 1.0e-45\n'], 'protobuf: doubles and floats in the shortest exact digits');
  t.eq([pbx('3206038e029ea705'), pbx('0a03010203'), pbx('0a0208c8')], ['6: 0x038e029ea705  # 6 bytes; as packed varints: 3, 270, 86942\n', '1: 0x010203  # 3 bytes; as packed varints: 1, 2, 3\n', '1: 0x08c8  # 2 bytes\n'], 'protobuf: bytes that are a run of varints are also read as a packed field');
  t.eq([pbx('0b08011a036162630c'), pbx('0a00'), pbx('0a020a00'), pbx('f8ffffff0f01'), pbx('')], ['1 {  # group\n  1: 1\n  3: "abc"\n}\n', '1: ""\n', '1 {\n  1: ""\n}\n', '536870911: 1\n', '(empty message)'], 'protobuf: groups, empty fields, the largest field number, nothing in');
  t.eq(['088080808080808080808001', '0b0801', '0c', '0e', '00', 'f8ffffffff0101', '1205', '12ffffffffffffffffff01', '0d0102'].map((h) => pbx(h)), ['ERR Not a valid protobuf message: the varint at byte 1 is longer than 10 bytes', 'ERR Not a valid protobuf message: group 1 is not closed',
    'ERR Not a valid protobuf message: unexpected end-group 1 at byte 0', 'ERR Not a valid protobuf message: invalid wire type 6 at byte 0', 'ERR Not a valid protobuf message: field number 0 at byte 0', 'ERR Not a valid protobuf message: field number 8589934591 at byte 0 is above the limit 536870911',
    'ERR Not a valid protobuf message: field 2 at byte 0 says 5 bytes but only 0 remain', 'ERR Not a valid protobuf message: field 2 at byte 0 says 18446744073709551615 bytes but only 0 remain', 'ERR Not a valid protobuf message: the data ends inside the fixed32 of field 1 at byte 0'], 'protobuf errors');
  t.eq(pbx('089601 12'), '1: 150\n!! Not a valid protobuf message: the data ends inside the varint that starts at byte 4', 'protobuf: the fields before a bad one are still shown');
  for (const n of [500, 5000, 60000]) { // deep nesting used to overflow the stack and leave the engine unusable
    let b = Buffer.from('0801', 'hex'); for (let i = 0; i < n; i++) b = Buffer.concat([Buffer.from('0a' + lenp(b.length), 'hex'), b]);
    const o = d.bytesJson('bin:protobuf', b), g = pbx('23'.repeat(n));
    t.ok(o.count === 1 && o.text.length < 40000 && /deeper than 100 levels/.test(g) && pbx('0801') === '1: 1\n', `protobuf: ${n} nested messages / ${n} open groups are handled (output ${o.text.length} chars) and the engine keeps working`);
  }
  // ---- patch (compared with GNU patch when available)
  const orig = 'one\ntwo\nthree\nfour\nfive\n';
  const diff = '--- a.txt\n+++ b.txt\n@@ -1,5 +1,5 @@\n one\n-two\n+TWO\n three\n four\n-five\n+5\n';
  const pr = d.json('patch', { original: orig, patch: diff });
  t.eq([pr.result, pr.hunks, pr.added, pr.removed], ['one\nTWO\nthree\nfour\n5\n', 1, 2, 2], 'patch applies');
  t.eq(d.json('patch', { original: pr.result, patch: diff, reverse: true }).result, orig, 'reverse patch restores the original');
  t.ok(/does not apply/.test(err(() => d.json('patch', { original: 'x\ny\n', patch: diff }))), 'mismatching context refused');
  t.eq(d.json('patch', { original: orig, patch: 'diff --git a/a.txt b/a.txt\nindex 1..2 100644\n' + diff }).result, pr.result, 'git diff headers accepted');
  try { const dir = mkdtempSync(join(tmpdir(), 'pt-')); writeFileSync(join(dir, 'a.txt'), orig); writeFileSync(join(dir, 'p.diff'), diff); execFileSync('patch', ['-s', join(dir, 'a.txt'), join(dir, 'p.diff')]); t.eq(readFileSync(join(dir, 'a.txt'), 'utf8'), pr.result, 'same result as GNU patch'); } catch { /* patch not installed */ }
  // ---- bug hunt, Nov 2026: our own patch reader / applier (replaced the diffy crate) — patches as people really have them
  {
    const P = (original, patch, reverse = false) => { try { return d.json('patch', { original, patch, reverse }); } catch (e) { return { error: e.message }; } };
    const want = 'one\nTWO\nthree\nfour\n5\n', hunk = '@@ -1,5 +1,5 @@\n one\n-two\n+TWO\n three\n four\n-five\n+5\n';
    const forms = {
      'git show (commit header, message with "--- " in it)': `commit 3f2a\nAuthor: A <a@example.in>\nDate:   Mon Nov 16 2026\n\n    Fix numbers\n    --- see ticket 12 ---\n\ndiff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n${hunk}`,
      'git format-patch (mail headers, diffstat, signature)': `From 3f2a Mon Sep 17 00:00:00 2001\nFrom: A <a@example.in>\nSubject: [PATCH] Fix numbers\n\n---\n a.txt | 4 ++--\n 1 file changed, 2 insertions(+), 2 deletions(-)\n\ndiff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n${hunk}-- \n2.43.0\n\n`,
      'git diff --stat -p': ` a.txt | 4 ++--\n 1 file changed, 2 insertions(+), 2 deletions(-)\n\ndiff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n${hunk}`,
      'svn "Index:" + ==== header': `Index: a.txt\n===================================================================\n--- a.txt\t(revision 7)\n+++ a.txt\t(working copy)\n${hunk}`,
      'a hunk alone, no file header': hunk, 'blank lines before the hunk': `\n\n${hunk}`, 'a ```diff fence (from a chat or a README)': `Here is the fix:\n\n\`\`\`diff\n--- a.txt\n+++ b.txt\n${hunk}\`\`\`\nThanks!\n`,
      'CRLF patch for an LF file': `--- a.txt\n+++ b.txt\n${hunk}`.replace(/\n/g, '\r\n'), 'trailing spaces trimmed from every patch line': `--- a.txt\n+++ b.txt\n${hunk}`.replace(/ +\n/g, '\n'),
      'diff -u with timestamps': `--- a.txt\t2026-11-16 10:00:00.000000000 +0530\n+++ b.txt\t2026-11-17 10:00:00.000000000 +0530\n${hunk}`, 'git rename + edit': `diff --git a/old.txt b/new.txt\nsimilarity index 80%\nrename from old.txt\nrename to new.txt\nindex 1..2 100644\n--- a/old.txt\n+++ b/new.txt\n${hunk}`,
      'git mode change + edit': `diff --git a/a.txt b/a.txt\nold mode 100644\nnew mode 100755\nindex 1..2\n--- a/a.txt\n+++ b/a.txt\n${hunk}`, 'no newline at the end of the patch': `--- a.txt\n+++ b.txt\n${hunk}`.trimEnd(),
    };
    for (const [name, patch] of Object.entries(forms)) t.eq(P(orig, patch).result ?? P(orig, patch).error, want, `patch read: ${name}`);
    // lines that look like headers but are content (SQL / Lua comments, e-mail signature) — told apart by the hunk's line counts
    t.eq(P('-- header\nselect 1;\n-- old\nselect 3;\n', '--- a.sql\n+++ b.sql\n@@ -1,4 +1,3 @@\n -- header\n select 1;\n--- old\n select 3;\n').result, '-- header\nselect 1;\nselect 3;\n', 'removing a line that starts with "-- " (shown as "--- old" in the diff) is not taken for a file header');
    t.eq(P('a\n++ b\nc\n', '@@ -1,3 +1,3 @@\n a\n-++ b\n+++ B\n c\n').result, 'a\n++ B\nc\n', 'adding a line that starts with "++ "');
    // the file moved, or is not quite the same
    const big = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n') + '\n', bigDiff = '@@ -20,3 +20,3 @@\n line 20\n-line 21\n+LINE 21\n line 22\n';
    let r = P(`x\ny\nz\n${big}`, bigDiff); t.ok(r.result === `x\ny\nz\n${big.replace('line 21\n', 'LINE 21\n')}` && /3 lines lower/.test(r.notes.join()), `hunk found 3 lines lower than its header says (${r.notes})`);
    r = P(big.split('\n').slice(5).join('\n'), bigDiff); t.ok(r.result?.includes('LINE 21') && /5 lines higher/.test(r.notes.join()), 'hunk found 5 lines higher');
    r = P('one  \ntwo\t\nthree\nfour \nfive\n', hunk); t.ok(r.result === 'one  \nTWO\nthree\nfour \n5\n' && /ignoring spaces/.test(r.notes.join()), 'file with trailing spaces: applies, context lines keep the file\'s own spacing');
    r = P('ONE\ntwo\nthree\nfour\nfive\n', hunk); t.ok(r.result === 'ONE\nTWO\nthree\nfour\n5\n' && /fuzz 1/.test(r.notes.join()), 'first context line differs: applied with fuzz 1, as GNU patch does');
    t.ok(/does not match this text/.test(P('ONE\nTWO!\nthree\n', hunk).error), 'a changed line that is not there → does not apply');
    // line ends and the final newline
    t.eq(P(orig.replace(/\n/g, '\r\n'), hunk).result, want.replace(/\n/g, '\r\n'), 'CRLF file + LF patch → CRLF result');
    t.eq(P(orig.replace(/\n/g, '\r\n'), hunk.replace(/\n/g, '\r\n')).result, want.replace(/\n/g, '\r\n'), 'CRLF file + CRLF patch');
    t.eq(P('a\nb\nc', '@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n').result, 'a\nB\nc', 'text pasted without its final newline stays without one');
    t.eq(P('a\nb', '@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n').result, 'a\nb\n', '"\\ No newline at end of file" on the old side only → the result ends with a newline');
    t.eq(P('a\nb\n', '@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n').result, 'a\nb', '… on the new side only → the result has none');
    t.eq(P('a\nb', '@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+B\n\\ No newline at end of file\n').result, 'a\nB', '… on both sides');
    // whole-file cases
    t.eq(P('', '--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+hello\n+world\n').result, 'hello\nworld\n', 'new file from /dev/null');
    t.eq(P('hello\nworld\n', '--- a/x\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-hello\n-world\n').result, '', 'delete everything');
    t.eq(P('only\n', '@@ -1 +1 @@\n-only\n+ONLY\n').result, 'ONLY\n', '"@@ -1 +1 @@" (counts left out = 1)');
    t.eq(P('a\nb\nc\n', '@@ -2 +2,0 @@\n-b\n').result, 'a\nc\n', 'diff -U0 removal');
    t.eq(P('a\nc\n', '@@ -1,0 +2 @@\n+b\n').error ?? P('a\nc\n', '@@ -1,0 +2 @@\n+b\n').result, 'a\nb\nc\n', 'diff -U0 insertion after line 1');
    // several hunks, several files, reverse
    const three = '@@ -1,3 +1,3 @@\n-line 1\n+LINE 1\n line 2\n line 3\n@@ -19,3 +19,4 @@\n line 19\n line 20\n+inserted\n line 21\n@@ -38,3 +39,2 @@\n line 38\n-line 39\n line 40\n';
    r = P(big, three); t.eq([r.hunks, r.added, r.removed, r.result.split('\n').length - 1], [3, 2, 2, 40], 'three hunks: 2 added, 2 removed, still 40 lines'); t.eq(P(r.result, three, true).result, big, '… and reversing restores the original exactly');
    const two = `diff --git a/first.txt b/first.txt\n--- a/first.txt\n+++ b/first.txt\n${hunk}diff --git a/second.txt b/second.txt\n--- a/second.txt\n+++ b/second.txt\n@@ -1,2 +1,2 @@\n x\n-y\n+Y\n`;
    r = P(orig, two); t.ok(r.result === want && r.files === 2 && /used the part for first\.txt/.test(r.notes.join()), 'two-file diff, text of the first file'); r = P('x\ny\n', two); t.ok(r.result === 'x\nY\n' && r.file === 'second.txt', 'two-file diff, text of the SECOND file: its part is used (was "does not apply")');
    t.ok(/already applied/.test(P(want, hunk).error) && /has not been applied/.test(P(orig, hunk, true).error), 'already applied / reverse of something not applied → said so');
    r = P(orig, '@@ -1,9 +1,9 @@\n one\n-two\n+TWO\n three\n four\n-five\n+5\n'); t.ok(r.result === want && /counted again/.test(r.notes.join()), 'wrong line counts in the @@ header (hand-edited patch): lines counted again, with a note');
    for (const junk of ['', 'hello', 'see @@ in the text', 'Binary files a/x.png and b/x.png differ', 'diff --git a/x b/x\nindex 1..2\nGIT binary patch\nliteral 12\n']) t.ok(/No hunks found/.test(P(orig, junk).error), `no hunks: ${JSON.stringify(junk.slice(0, 24))}`);
    t.eq(P('नमस्ते\nदुनिया\n😀\n', '@@ -1,3 +1,3 @@\n नमस्ते\n-दुनिया\n+विश्व\n 😀\n').result, 'नमस्ते\nविश्व\n😀\n', 'Unicode lines');
    // against GNU diff + patch: random edits of a 300-line file, plain / shifted / with trailing-space noise
    try {
      execFileSync('patch', ['--version']); execFileSync('diff', ['--version']);
      let seed = 20261117; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
      const dir = mkdtempSync(join(tmpdir(), 'pt-')), bad = []; let cases = 0;
      for (let c = 0; c < 60; c++) {
        const A = Array.from({ length: 300 }, (_, i) => `row ${i} ${'abcdefg'[rnd(7)]}${rnd(3) ? '' : ' -- note'}`), B = [...A];
        for (let e = 0; e < 1 + rnd(8); e++) { const at = rnd(B.length); const k = rnd(3); if (k === 0) B.splice(at, 1 + rnd(3)); else if (k === 1) B.splice(at, 0, `new ${c}.${e}`, ...(rnd(2) ? [`-- added ${e}`] : [])); else B[at] = `${B[at]} changed`; }
        const fa = join(dir, 'a.txt'), fb = join(dir, 'b.txt'), ta = A.join('\n') + (c % 7 === 3 ? '' : '\n'), tb = B.join('\n') + (c % 5 === 2 ? '' : '\n'); writeFileSync(fa, ta); writeFileSync(fb, tb);
        let diffText = ''; try { execFileSync('diff', [`-U${[3, 3, 1, 0, 5][c % 5]}`, fa, fb]); } catch (e) { diffText = e.stdout.toString(); }
        if (!diffText) continue;
        const variants = [['plain', ta], ['shifted down 7 lines', `${'pad\n'.repeat(7)}${ta}`], ['shifted up', ta.split('\n').slice(c % 5 === 3 ? 0 : 2).join('\n')]];
        for (const [name, text] of variants) {
          if (name !== 'plain' && c % 5 === 3) continue; // -U0 hunks have no context to be found by
          const ft = join(dir, 't.txt'); writeFileSync(ft, text); let gnu; try { execFileSync('patch', ['-s', '--no-backup-if-mismatch', ft, '-i', '-'], { input: diffText, stdio: ['pipe', 'pipe', 'pipe'] }); gnu = readFileSync(ft, 'utf8'); } catch { gnu = null; }
          const ours = P(text, diffText); cases++;
          if (gnu === null) { cases--; continue; } // (GNU patch insists that a hunk from the top of the file stays at the top; we find it anyway)
          if (ours.result !== gnu) bad.push(`case ${c} ${name}: ${ours.error ? ours.error.slice(0, 60) : 'different text'}`);
          if (gnu !== null && name === 'plain' && P(ours.result ?? '', diffText, true).result !== text) bad.push(`case ${c}: reverse does not restore`);
        }
      }
      t.ok(cases >= 120 && !bad.length, `${cases} random patches made by GNU diff (context 0–5, files with / without a final newline, moved up or down) give the same text as GNU patch, and reverse restores the original ${bad.slice(0, 4).join(' | ')} ${bad.length > 4 ? `(+${bad.length - 4})` : ''}`);
    } catch (e) { if (!/ENOENT/.test(String(e))) throw e; }
  }
  // ---- SQL format
  const sql = d.text('sqlfmt', { sql: 'select a, b from t where x = 1 and y > 2 order by a', uppercase: true });
  t.eq(sql, 'SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y > 2\nORDER BY\n  a', 'SQL formatted with upper-case keywords');
  t.ok(/\t/.test(d.text('sqlfmt', { sql: 'select a from t', indent: 0 })), 'tab indent');
  // ---- hex dump
  t.eq(d.hexdump(E.encode('Hello, World!\n\x00\x01ABC'), 0, 16), '00000000  48 65 6c 6c 6f 2c 20 57  6f 72 6c 64 21 0a 00 01  |Hello, World!...|\n00000010  41 42 43                                          |ABC|\n', 'hex dump like hexdump -C');
  t.eq(d.hexdump(E.encode('AB'), 4096, 8).slice(0, 8), '00001000', 'hex dump offset');
  t.eq(d.find(E.encode('abcabcab'), E.encode('ab')), { hits: [0, 3, 6], more: false }, 'find all');
  t.eq(d.find(E.encode('abcabcab'), E.encode('ab'), 1, 1), { hits: [3], more: true }, 'find from offset, capped');
  t.eq(d.find(E.encode('aaa'), E.encode('aa')).hits, [0, 1], 'overlapping hits');
  // find: case-insensitive option (ASCII letters), overlapping hits, the cap, bytes ≥ 0x80
  {
    const hx = mods.hex, enc8 = (x) => new TextEncoder().encode(x), hay = enc8('Needle needle NEEDLE nEeDlE need É é aaaa');
    t.eq(hx.find(hay, enc8('needle')).hits, [7], 'find is case-sensitive by default');
    t.eq(hx.find(hay, enc8('needle'), 0, 1000, true).hits, [0, 7, 14, 21], '"ignore case" finds every spelling');
    t.eq(hx.find(hay, enc8('é'), 0, 1000, true).hits, [36], 'ignore case folds ASCII letters only (É is other bytes)');
    t.eq(hx.find(hay, enc8('aa')).hits, [39, 40, 41], 'overlapping matches are all reported');
    t.eq([hx.find(hay, enc8('e'), 0, 3).hits.length, hx.find(hay, enc8('e'), 0, 3).more, hx.find(hay, enc8('e'), 0, 3, true).more], [3, true, true], 'the cap on matches is honoured with and without ignore case');
    t.eq(hx.find(Uint8Array.from([0xff, 0x00, 0x41, 0xff, 0x00, 0x61]), Uint8Array.from([0xff, 0x00, 0x41]), 0, 10, true).hits, [0, 3], 'binary needles: only the letter bytes fold');
    t.eq(hx.find(hay, enc8('needle'), 8, 1000, true).hits, [14, 21], 'search from an offset');
  }
  // ---- JSON diff (RFC 6902): applying the diff to the left document must give the right one
  const L = { name: 'Asha', age: 30, tags: ['a', 'b'], addr: { city: 'Pune', pin: '411001' }, x: null };
  const Rt = { name: 'Asha K', tags: ['a', 'b', 'c'], addr: { city: 'Mumbai', pin: '411001' }, x: null, new: true };
  const df = d.json('jsondiff', { a: JSON.stringify(L), b: JSON.stringify(Rt) });
  t.ok(!df.equal && df.count >= 4 && df.patch.some((o) => o.op === 'remove' && o.path === '/age') && df.patch.some((o) => o.op === 'replace' && o.path === '/addr/city' && o.value === 'Mumbai'), `diff: ${JSON.stringify(df.patch)}`);
  const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  t.eq(canon(d.json('jsonpatch', { doc: JSON.stringify(L), patch: JSON.stringify(df.patch) }).result), canon(Rt), 'apply(diff(a, b), a) = b (key order aside)');
  t.eq(d.json('jsondiff', { a: '{"a":1,"b":2}', b: '{"b":2,"a":1}' }).equal, true, 'key order does not matter');
  t.ok(/line 2, column/.test(err(() => d.json('jsondiff', { a: '{\n "a": }', b: '{}' }))), 'parse error with line and column');
  t.eq(d.json('jsonpatch', { doc: '{"a":[1,2]}', patch: '[{"op":"add","path":"/a/-","value":3},{"op":"test","path":"/a/0","value":1}]' }).result, { a: [1, 2, 3] }, 'RFC 6902 add to array end + test');
  t.ok(/does not apply/.test(err(() => d.json('jsonpatch', { doc: '{"a":1}', patch: '[{"op":"test","path":"/a","value":2}]' }))), 'failing test op refused');
};
