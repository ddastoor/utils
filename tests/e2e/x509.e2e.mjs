// Certificate Decoder (#/x509, PC only): certificates made here with OpenSSL (RSA 2048 + SANs, EC P-256 CA, an expired
// one, a CSR) are decoded and every field compared with OpenSSL's own reading: subject, issuer, serial, validity dates,
// key type/size/curve (RSA 1024–4096, RSA-PSS, DSA, P-256/384/521, secp256k1, Ed25519, Ed448), SANs, SHA-256/SHA-1
// fingerprints, CA flag, chain of two, DER file; validity wording (minutes … years, never); files with a BOM, UTF-16,
// indentation, JSON \n; PKCS #7 bundles; lone public keys; private-key warning; garbage input; phone note.
// Fixtures: tests/fixtures/x509 (scripts/make-x509-fixtures.py).
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, info } = ctx;
  const dir = mkdtempSync(join(tmp, 'x509-')), o = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  try { o('version'); } catch { info('openssl missing — x509 suite skipped'); return; }
  o('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'k1.pem', '-out', 'c1.pem', '-days', '400', '-subj', '/C=IN/ST=Maharashtra/O=SuperTools Test/CN=www.example.in', '-addext', 'subjectAltName=DNS:www.example.in,DNS:example.in,IP:10.0.0.1', '-set_serial', '0x1234ABCD');
  o('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', 'k2.pem', '-out', 'c2.pem', '-days', '3650', '-subj', '/CN=Test Root CA', '-addext', 'basicConstraints=critical,CA:TRUE');
  // an expired certificate (OpenSSL 3.0 has no -not_before): made with Python's cryptography package
  execFileSync('python3', ['-c', `
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
import datetime
k = ec.generate_private_key(ec.SECP256R1()); n = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'old.example')])
c = x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(7).not_valid_before(datetime.datetime(2020,1,1)).not_valid_after(datetime.datetime(2021,1,1)).sign(k, hashes.SHA256())
open('c3.pem','wb').write(c.public_bytes(serialization.Encoding.PEM))`], { cwd: dir });
  o('req', '-new', '-key', 'k1.pem', '-out', 'r.csr', '-subj', '/CN=api.example.in', '-addext', 'subjectAltName=DNS:api.example.in');
  o('x509', '-in', 'c1.pem', '-outform', 'DER', '-out', 'c1.der');
  const fp = (f, alg) => o('x509', '-in', f, '-noout', '-fingerprint', `-${alg}`).trim().split('=')[1];
  const dates = (f) => o('x509', '-in', f, '-noout', '-dates').trim().split('\n').map((l) => new Date(l.split('=')[1]).getTime() / 1000);
  const page = await newPage(); await page.goto(`${base}#/x509`);
  const ta = page.locator('textarea'); await ta.waitFor();
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.tool-body .card')].filter((c) => c.querySelector('.kv')).map((c) => { const s = [...c.querySelector('.kv').children].map((e) => e.textContent); const r = { title: c.querySelector('.card-title')?.textContent }; for (let i = 0; i + 1 < s.length; i += 2) r[s[i]] = s[i + 1]; r.status = c.querySelector('.note')?.textContent; return r; }));
  const paste = async (s) => { await ta.fill(s); await page.waitForTimeout(300); return rows(); };
  let [c] = await paste(readFileSync(join(dir, 'c1.pem'), 'utf8'));
  ok(c.title === 'www.example.in' && /CN=www\.example\.in/.test(c.Subject) && /O=SuperTools Test/.test(c.Subject) && /self-signed/.test(c.Issuer), `RSA cert: CN title, subject, self-signed (${c.Subject})`);
  ok(c['Names (SAN)'] === 'DNS:www.example.in, DNS:example.in, IP:10.0.0.1', `SANs (${c['Names (SAN)']})`);
  ok(c['Public key'] === 'RSA 2048-bit, e = 65537' && /sha256WithRSAEncryption/i.test(c.Signature) && c.Serial === '12:34:AB:CD', `key, signature, serial (${c['Public key']}, ${c.Signature}, ${c.Serial})`);
  ok(c['SHA-256 fingerprint'] === fp('c1.pem', 'sha256') && c['SHA-1 fingerprint'] === fp('c1.pem', 'sha1'), 'fingerprints equal OpenSSL’s');
  const [nb, na] = dates('c1.pem'), fmt = (s) => new Date(s * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
  ok(c['Valid from'] === fmt(nb) && c['Valid until'] === fmt(na), `validity dates equal OpenSSL’s (${c['Valid until']})`);
  const days = Math.floor((na - Date.now() / 1000) / 86400); ok(new RegExp(`expires in (${days}|${days - 1}) days`).test(c.status), `status: expires in ~${days} days (${c.status})`);
  [c] = await paste(readFileSync(join(dir, 'c2.pem'), 'utf8'));
  ok(c['Public key'] === 'EC 256-bit (P-256)' && c['CA certificate'] === 'yes' && /ecdsa-with-SHA256/i.test(c.Signature), `EC P-256 CA (${c['Public key']}, ${c.Signature})`);
  ok(await page.locator('details summary').first().textContent().then((t) => /Extensions \(\d+\)/.test(t)) && /CA: yes/.test(await page.locator('details').first().textContent()) && /critical/.test(await page.locator('details').first().textContent()), 'extensions: Basic Constraints (critical) CA: yes');
  [c] = await paste(readFileSync(join(dir, 'c3.pem'), 'utf8')); ok(/EXPIRED/.test(c.status), `expired certificate flagged (${c.status})`);
  const chain = await paste(readFileSync(join(dir, 'c1.pem'), 'utf8') + readFileSync(join(dir, 'c2.pem'), 'utf8'));
  ok(chain.length === 2 && chain[0].title === '1. www.example.in' && chain[1].title === '2. Test Root CA', 'a pasted chain shows each certificate');
  [c] = await paste(readFileSync(join(dir, 'r.csr'), 'utf8')); ok(/Certificate request: api\.example\.in/.test(c.title) && c['Requested names'] === 'DNS:api.example.in' && /RSA 2048/.test(c['Public key']), 'CSR decoded with requested names');
  const mixed = await paste(readFileSync(join(dir, 'k2.pem'), 'utf8') + readFileSync(join(dir, 'c2.pem'), 'utf8'));
  ok(mixed.length === 1 && /PRIVATE KEY/.test(await page.locator('.card-title', { hasText: 'Block 1' }).textContent()) && /This is a private key/.test(await page.locator('.tool-body .note-warn').first().textContent()), 'a private key block is not decoded, the certificate after it is');
  await ta.fill(''); await page.locator('.drop input[type=file]').setInputFiles(join(dir, 'c1.der')); await page.waitForTimeout(300);
  [c] = await rows(); ok(c && c['SHA-256 fingerprint'] === fp('c1.pem', 'sha256'), 'binary DER file decoded');
  // ---- bug hunt, Nov 2026: key type and size for every kind of key = what OpenSSL itself reports ("Public-Key: (N bit)")
  const gen = [
    ['rsa1024', ['-newkey', 'rsa:1024'], 'RSA 1024-bit, e = 65537'], ['rsa3072', ['-newkey', 'rsa:3072'], 'RSA 3072-bit, e = 65537'], ['rsa4096', ['-newkey', 'rsa:4096'], 'RSA 4096-bit, e = 65537'],
    ['p384', ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-384'], 'EC 384-bit (P-384)'], ['p521', ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-521'], 'EC 521-bit (P-521)'],
    ['k256', ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:secp256k1'], 'EC 256-bit (secp256k1)'],
    ['ed25519', ['-newkey', 'ed25519'], 'Ed25519 256-bit'], ['ed448', ['-newkey', 'ed448'], 'Ed448 456-bit'],
    ['pss', ['-newkey', 'rsa-pss', '-pkeyopt', 'rsa_keygen_bits:2048'], 'RSA-PSS 2048-bit'],
  ];
  let sized = 0; const wrong = [];
  for (const [name, args, want] of gen) {
    try { o('req', '-x509', ...args, '-nodes', '-keyout', `${name}.key`, '-out', `${name}.pem`, '-days', '30', '-subj', `/CN=${name}.example`); } catch { info(`openssl could not make a ${name} certificate — skipped`); continue; }
    const bits = +(/Public-Key: \((\d+) bit/.exec(o('x509', '-in', `${name}.pem`, '-noout', '-text')) || [])[1];
    [c] = await paste(readFileSync(join(dir, `${name}.pem`), 'utf8'));
    const shown = +(/(\d+)-bit/.exec(c?.['Public key'] || '') || [])[1];
    if (c && c['Public key'] === want && (shown === bits || name.startsWith('ed')) && c['SHA-256 fingerprint'] === fp(`${name}.pem`, 'sha256')) sized++; else wrong.push(`${name}: "${c?.['Public key']}" (openssl: ${bits} bit)`);
  }
  ok(sized >= 7 && !wrong.length, `key type and size match OpenSSL for ${sized} kinds of key (RSA 1024–4096, RSA-PSS, P-384, P-521, secp256k1, Ed25519, Ed448) ${wrong.join(' | ')}`);
  try { // DSA: the size is that of the prime p (used to show the length of the encoded key: 2088)
    o('dsaparam', '-out', 'dsap.pem', '2048'); o('req', '-x509', '-newkey', 'dsa:dsap.pem', '-nodes', '-keyout', 'dsa.key', '-out', 'dsa.pem', '-days', '30', '-subj', '/CN=dsa.example');
    [c] = await paste(readFileSync(join(dir, 'dsa.pem'), 'utf8'));
    ok(c['Public key'] === 'DSA 2048-bit' && /dsa-with-SHA256/i.test(c.Signature), `DSA certificate: ${c['Public key']}, signature named (${c.Signature})`);
  } catch (e) { info(`openssl could not make a DSA certificate — skipped (${String(e.message).slice(0, 60)})`); }
  [c] = await paste(readFileSync(join(dir, 'pss.pem'), 'utf8')); ok(/RSASSA-PSS/i.test(c.Signature), `RSA-PSS signature named (${c.Signature})`);
  // ---- validity wording: minutes / hours / days / years, "no expiry" for 31 Dec 9999 (used to say "expires in 0 days" five hours before expiry)
  const mk = (name, nb, na) => execFileSync('python3', ['-c', `
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
import datetime, sys
now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None, microsecond=0)
k = ec.generate_private_key(ec.SECP256R1()); n = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, sys.argv[1])])
t = lambda v: datetime.datetime(9999, 12, 31, 23, 59, 59) if v == 'never' else now + datetime.timedelta(seconds=int(v))
c = x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(7).not_valid_before(t(sys.argv[2])).not_valid_after(t(sys.argv[3])).sign(k, hashes.SHA256())
open(sys.argv[1] + '.pem', 'wb').write(c.public_bytes(serialization.Encoding.PEM))`, name, String(nb), String(na)], { cwd: dir });
  const H = 3600, D = 86400, spans = [];
  for (const [name, nb, na, re] of [['in5h', -D, 5 * H + 120, /^Valid — expires in 5 hours\.$/], ['in40m', -D, 40 * 60 + 20, /^Valid — expires in (40|41) minutes\.$/], ['in47h', -D, 47 * H + 120, /^Valid — expires in 47 hours\.$/], ['in3d', -D, 3 * D + 120, /^Valid — expires in 3 days\.$/],
    ['in400d', -D, 400 * D + 120, /^Valid — expires in 400 days\.$/], ['in10y', -D, 3653 * D + 120, /^Valid — expires in 10 years \(3,653 days\)\.$/], ['never', -D, 'never', /^Valid — no expiry date/],
    ['ago2h', -10 * D, -2 * H - 60, /^EXPIRED 2 hours ago\.$/], ['ago36h', -10 * D, -36 * H - 60, /^EXPIRED 36 hours ago\.$/], ['ago9d', -30 * D, -9 * D - 60, /^EXPIRED 9 days ago\.$/], ['ago5y', -3000 * D, -1830 * D, /^EXPIRED 5 years \(1,830 days\) ago\.$/],
    ['soon3d', 3 * D + 120, 30 * D, /^Not valid yet — starts .* UTC \(in 3 days\)\.$/], ['soon2h', 2 * H + 120, 30 * D, /^Not valid yet — starts .* \(in 2 hours\)\.$/]]) {
    mk(name, nb, na); [c] = await paste(readFileSync(join(dir, `${name}.pem`), 'utf8')); if (!re.test(c.status)) spans.push(`${name}: "${c.status}"`);
  }
  ok(!spans.length, `13 validity states read naturally: minutes, hours, days, years, never, expired … ago, starts in … ${spans.join(' | ')}`);
  ok(await page.locator('.tool-body .note-warn', { hasText: 'Not valid yet' }).count() === 1, 'a certificate that is not valid yet is a warning');
  [c] = await paste(readFileSync(join(dir, 'in3d.pem'), 'utf8')); ok(await page.locator('.tool-body .note-warn', { hasText: 'expires in 3 days' }).count() === 1, 'under 30 days left: shown as a warning, not as fine');
  [c] = await paste(readFileSync(join(dir, 'in400d.pem'), 'utf8')); ok(await page.locator('.tool-body .note-ok', { hasText: 'expires in 400 days' }).count() === 1, '400 days left: fine');
  // ---- files as people have them (fixtures: tests/fixtures/x509, made with OpenSSL)
  const FX = (f) => readFileSync(new URL(`../fixtures/x509/${f}`, import.meta.url)), EXP = JSON.parse(FX('expected.json').toString()), leafPem = FX('leaf.pem').toString(), want = EXP['leaf.pem'].sha256;
  const drop = async (name, buffer) => { await ta.fill(''); await page.locator('.drop input[type=file]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(buffer) }); await page.waitForTimeout(350); return rows(); };
  const files = { 'UTF-8 BOM': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(leafPem)]), 'UTF-16LE (PowerShell >)': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(leafPem, 'utf16le')]), 'CRLF': leafPem.replace(/\n/g, '\r\n'), 'indented': leafPem.replace(/^/gm, '      '),
    'Latin-1 text before the PEM': Buffer.concat([Buffer.from('Soci\xe9t\xe9\n', 'latin1'), Buffer.from(leafPem)]), 'literal \\n (JSON value)': JSON.stringify({ cert: leafPem }), 'DER': FX('leaf.der') };
  const fileBad = []; for (const [name, b] of Object.entries(files)) { const r2 = await drop('cert.pem', b); if (r2[0]?.['SHA-256 fingerprint'] !== want) fileBad.push(`${name}: ${r2[0]?.title} ${await page.locator('.tool-body .note-warn').allTextContents()}`); }
  ok(!fileBad.length, `the same certificate as 7 kinds of file (BOM, UTF-16, CRLF, indented, Latin-1 preamble, JSON with \\n, DER) → same fingerprint ${fileBad.join(' | ')}`);
  await drop('cert.pem', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(leafPem, 'utf16le')])); ok((await ta.inputValue()).startsWith('-----BEGIN CERTIFICATE-----'), 'a UTF-16 file is shown as readable text in the box');
  let pasted = await paste(leafPem.replace(/^/gm, '    ')); ok(pasted[0]?.['SHA-256 fingerprint'] === want, 'pasting an indented PEM (from YAML) works (used to say "incomplete PEM")');
  pasted = await paste(leafPem.replace(/^/gm, '> ')); ok(pasted[0]?.['SHA-256 fingerprint'] === want, 'pasting a quoted e-mail ("> ") works');
  for (const f of ['chain.p7b', 'chain.der.p7b']) { const r2 = await drop(f, FX(f)); ok(r2.length === 2 && r2[0].title === '1. example.in' && r2[1].title === '2. SuperTools Test Root' && r2[0]['SHA-256 fingerprint'] === want && r2[1]['SHA-256 fingerprint'] === EXP['ca.pem'].sha256, `${f}: both certificates of a PKCS #7 bundle are shown (used to be "Not a certificate")`); }
  let r3 = await drop('leaf.pub.pem', FX('leaf.pub.pem')); ok(r3[0]?.title === 'Public key' && r3[0]['Public key'] === 'EC 256-bit (P-256)' && r3[0]['SHA-256 of the key (SPKI)'].replace(/:/g, '').toLowerCase() === EXP['leaf.pem'].spkiSha256 && r3[0]['Pin (Base64, as in HPKP / pinning tools)'] === EXP['leaf.pem'].pin, 'a lone public key: type, size, SHA-256 and pin = openssl pkey | sha256');
  r3 = await drop('leaf.pem', FX('leaf.pem')); const e2 = r3[0];
  ok(e2['Names (SAN)'] === 'DNS:example.in, DNS:*.example.in, IP:192.0.2.7, IP:2001:db8::7, email:admin@example.in, URI:https://example.in/id' && e2.Serial === '00:FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11' && e2['CA certificate'] === 'no' && e2.Version === 'v3' && /sha384WithRSAEncryption/i.test(e2.Signature), `CA-signed leaf: every kind of SAN, a 16-byte serial, SHA-384 signature (${e2.Serial})`);
  ok(/C=IN.*O=SuperTools Test CA.*CN=SuperTools Test Root/.test(e2.Issuer) && !/self-signed/.test(e2.Issuer), 'issuer shown, not marked self-signed');
  await page.locator('details summary').first().click(); const extText = await page.locator('details').first().innerText();
  ok(/Extensions \(9\)/.test(extText) && /TLS Web Server Authentication, TLS Web Client Authentication/.test(extText) && /OCSP – URI:http:\/\/ocsp\.example\.in/.test(extText) && /URI:http:\/\/crl\.example\.in\/ca\.crl/.test(extText) && /Domain Validated/.test(extText) && /Digital Signature/.test(extText), 'extensions: key usage, EKU, OCSP + CA issuers, CRL, policy');
  r3 = await drop('utf8.pem', FX('utf8.pem')); ok(r3[0].title === 'Zoë’s café' && /O=उदाहरण प्रा\. लि\./.test(r3[0].Subject), `UTF-8 names (${r3[0].Subject})`);
  r3 = await drop('request.csr', FX('request.csr')); ok(/Certificate request: csr\.example\.in/.test(r3[0].title) && r3[0]['Requested names'] === 'DNS:csr.example.in, DNS:www.csr.example.in', 'CSR file');
  await drop('empty.pem', Buffer.alloc(0)); ok(/empty\.pem is empty/.test(await page.locator('.tool-body .note-warn').textContent()), 'an empty file says so');
  await drop('key.pem', '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4f\n-----END PRIVATE KEY-----\n');
  ok(/This is a private key\. It is not decoded or shown here/.test(await page.locator('.tool-body .note-warn').textContent()) && !/MC4CAQAw|AAECAwQF/.test(await page.locator('.tool-body .card').last().innerText()), 'a private key file gets a clear warning and is not decoded');
  await drop('crl.pem', '-----BEGIN X509 CRL-----\nMAA=\n-----END X509 CRL-----\n'); ok(/Not a certificate \(X509 CRL, 2 bytes\)/.test(await page.locator('.tool-body .note-info').first().textContent()), 'another kind of block is named');
  await paste(leafPem.split('\n').slice(0, 8).join('\n')); ok(/has no -----END line/.test(await page.locator('.tool-body .note-warn').textContent()), 'a cut-off paste → "has no -----END line (was it cut off?)"');
  await paste(leafPem.replace('END CERTIFICATE', 'END X509 CRL')); ok(/closed by -----END/.test(await page.locator('.tool-body .note-warn').textContent()), 'mismatched BEGIN / END');
  // two files in a row quickly: the last one wins; typing after a DER file replaces it
  await page.locator('.drop input[type=file]').setInputFiles({ name: 'a.pem', mimeType: 'text/plain', buffer: FX('ca.pem') }); await page.locator('.drop input[type=file]').setInputFiles({ name: 'b.pem', mimeType: 'text/plain', buffer: FX('ed25519.pem') }); await page.waitForTimeout(400);
  ok((await rows())[0].title === 'ed25519.example.in', 'two files chosen quickly: the second is shown');
  await drop('leaf.der', FX('leaf.der')); ok(await ta.inputValue() === '', 'a DER file leaves the text box empty'); pasted = await paste(FX('ca.pem').toString()); ok(pasted[0].title === 'SuperTools Test Root', 'pasting afterwards replaces the DER result');
  await ta.fill(''); await page.waitForTimeout(300); ok(/Paste a PEM certificate/.test(await page.locator('.tool-body .note-info').first().textContent()) && await page.locator('.tool-body .kv').count() === 0, 'clearing the box clears the result');
  await paste('-----BEGIN CERTIFICATE-----\nMIIBhello\n-----END CERTIFICATE-----'); ok(/Bad PEM|Not an X\.509/.test(await page.locator('.note-warn').textContent()), 'broken certificate → message');
  await paste('hello world'); ok(/Not a certificate/.test(await page.locator('.note-warn').textContent()), 'plain text → message');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'x509');
};
