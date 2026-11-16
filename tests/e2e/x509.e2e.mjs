// Certificate Decoder (#/x509, PC only): certificates made here with OpenSSL (RSA 2048 + SANs, EC P-256 CA, an expired
// one, a CSR) are decoded and every field compared with OpenSSL's own reading: subject, issuer, serial, validity dates,
// key type/size/curve, SANs, SHA-256/SHA-1 fingerprints, CA flag, chain of two, DER file, garbage input; phone note.
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
  ok(mixed.length === 1 && /PRIVATE KEY/.test(await page.locator('.card-title', { hasText: 'Block 1' }).textContent()), 'a private key block is not decoded, the certificate after it is');
  await ta.fill(''); await page.locator('.drop input[type=file]').setInputFiles(join(dir, 'c1.der')); await page.waitForTimeout(300);
  [c] = await rows(); ok(c && c['SHA-256 fingerprint'] === fp('c1.pem', 'sha256'), 'binary DER file decoded');
  await paste('-----BEGIN CERTIFICATE-----\nMIIBhello\n-----END CERTIFICATE-----'); ok(/Bad PEM|Not an X\.509/.test(await page.locator('.note-warn').textContent()), 'broken certificate → message');
  await paste('hello world'); ok(/Not a certificate/.test(await page.locator('.note-warn').textContent()), 'plain text → message');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'x509');
};
