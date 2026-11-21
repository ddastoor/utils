// OpenPGP tab, the "Latest standard" mode (owner, 21 Nov 2026: "keep the existing functionality exactly the same and add
// another, new mode which uses the latest OpenPGP standard"): src/lib/pgpstd.ts with OpenPGP.js 6 —
// - the GnuPG-compatible settings are exactly what they were;
// - RFC 9580 keys (v6 Ed25519 + X25519 and Ed448 + X448, Argon2 + AES-256/OCB-locked, asking for SEIPDv2 AES-256/OCB),
//   messages to them (SEIPDv2, v6 session keys), passwords (SKESKv6 + Argon2), and to GnuPG keys (SEIPDv1, said why);
// - the words for each format, also on the RFC 9580 Appendix A vectors;
// - INDEPENDENT REFERENCES, both directions: rPGP (rsop) and Sequoia PGP (sqop) — keys, encryption, the locked secret
//   key, signatures detached and clear-signed, passwords. Found by $RSOP / $SQOP or on the PATH (a SOP tool that offers
//   an "rfc9580" profile); skipped with a note where missing. Build them with `cargo install --locked rsop` and
//   `cargo install --locked sequoia-sop --no-default-features --features cli,crypto-openssl` (needs libssl-dev).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as openpgp from 'openpgp';

export default async (t, { load, root }) => {
  const S = await load('/src/lib/pgpstd.ts');
  const V = (n) => readFileSync(join(root, 'tests/fixtures/pgp/rfc9580', n), 'utf8');
  const cfg = S.rfc9580Config(openpgp), gcfg = S.gpgConfig(openpgp);
  const bin = (s) => new TextEncoder().encode(s), str = (b) => new TextDecoder().decode(b);

  // ---- the GnuPG-compatible mode keeps its settings exactly (the owner's condition)
  t.eq(gcfg, { v6Keys: false, aeadProtect: false, preferredSymmetricAlgorithm: 9, preferredHashAlgorithm: 10, s2kType: 3, s2kIterationCountByte: 255 }, 'GnuPG-compatible: v4 keys, no AEAD, AES-256, SHA-512, iterated S2K at count byte 255 — as before');
  t.eq(S.modernConfig(openpgp), { v6Keys: true, aeadProtect: true, s2kType: 4, preferredSymmetricAlgorithm: 9 }, 'its own "RFC 9580 v6" key format under Generate — as before');
  t.eq(cfg, { v6Keys: true, aeadProtect: true, preferredSymmetricAlgorithm: 9, preferredAEADAlgorithm: 2, preferredHashAlgorithm: 10, s2kType: 4, s2kArgon2Params: { passes: 3, parallelism: 4, memoryExponent: 16 } },
    'latest standard: v6 keys, AEAD, AES-256 with OCB (the mode every RFC 9580 implementation has), SHA-512, Argon2 3 / 4 / 2^16 KiB (RFC 9580 §3.7.1.4, second setting)');

  // ---- keys
  const keys = {};
  for (const [type, sign, enc] of [['curve25519', 'Ed25519', 'X25519'], ['curve448', 'Ed448', 'X448']]) {
    const k = await openpgp.generateKey({ type, userIDs: [{ name: 'Tab', email: 'tab@example.com' }], passphrase: 'correct horse', format: 'armored', config: cfg });
    const pub = await openpgp.readKey({ armoredKey: k.publicKey }), priv = await openpgp.readPrivateKey({ armoredKey: k.privateKey });
    keys[type] = { armored: k, pub, priv, open: await openpgp.decryptKey({ privateKey: priv, passphrase: 'correct horse' }) };
    t.eq(S.keyWords(pub), `${sign} (sign) + ${enc} (encrypt) · v6 (RFC 9580)`, `${type}: a v6 key, ${sign} + ${enc}`);
    t.eq([pub.keyPacket.version, pub.subkeys[0].keyPacket.version], [6, 6], `${type}: primary key and subkey are v6`);
    t.eq(S.protectionWords(priv), 'Argon2 (3 passes, 4 lanes, 64 MiB), then AES-256 in OCB mode (AEAD)', `${type}: the secret parts locked with Argon2 and AES-256/OCB`);
    t.eq(pub.getFingerprint().length, 64, `${type}: a v6 fingerprint (SHA-256, 64 hex digits)`);
    const self = await pub.getPrimarySelfSignature();
    t.ok((self.features[0] & openpgp.enums.features.seipdv2) !== 0, `${type}: the key asks for SEIPDv2`);
    t.eq(self.preferredCipherSuites[0], [9, 2], `${type}: its first cipher suite is AES-256 with OCB`);
  }

  // ---- messages
  const v6 = keys.curve25519;
  const toV6 = await openpgp.encrypt({ message: await openpgp.createMessage({ binary: bin('to a v6 key') }), encryptionKeys: v6.pub, format: 'object', config: cfg });
  const f1 = S.messageFormat(toV6);
  t.eq(f1, { seipd: 2, cipher: 'AES-256', aead: 'OCB', pkesk: [6], skesk: [] }, 'to a v6 key: SEIPDv2, AES-256 in OCB mode, a v6 session key');
  t.eq(S.formatWords(f1), 'SEIPDv2 — AES-256 in OCB mode (AEAD, RFC 9580) · v6 session key for 1 key', '… in words');
  const armoredOut = await S.readOut(toV6.armor(cfg));
  t.ok(typeof armoredOut === 'string' && armoredOut.startsWith('-----BEGIN PGP MESSAGE-----'), 'readOut: armor() of an encrypted message is a stream of chunks — joined into the text (the tab showed an object)');
  const back = await openpgp.decrypt({ message: await openpgp.readMessage({ armoredMessage: armoredOut }), decryptionKeys: v6.open, format: 'binary' });
  t.eq(str(back.data), 'to a v6 key', '… and the text decrypts');
  const binOut = await S.readOut((await openpgp.encrypt({ message: await openpgp.createMessage({ binary: bin('binary') }), encryptionKeys: v6.pub, format: 'object', config: cfg })).write());
  t.ok(binOut instanceof Uint8Array && str((await openpgp.decrypt({ message: await openpgp.readMessage({ binaryMessage: binOut }), decryptionKeys: v6.open, format: 'binary' })).data) === 'binary', 'readOut: write() joined into bytes that decrypt');
  const pw = await openpgp.encrypt({ message: await openpgp.createMessage({ binary: bin('with a password') }), passwords: ['open sesame'], format: 'object', config: cfg });
  t.eq(S.formatWords(S.messageFormat(pw)), 'SEIPDv2 — AES-256 in OCB mode (AEAD, RFC 9580) · password (v6 session key, Argon2 (3 passes, 4 lanes, 64 MiB))', 'with a password: SKESKv6 through Argon2, SEIPDv2');

  // a GnuPG (v4) recipient in the latest-standard mode: SEIPDv1, as RFC 9580 requires, and the tab can say which key
  const g = await openpgp.generateKey({ type: 'ecc', curve: 'curve25519Legacy', userIDs: [{ name: 'Gnu', email: 'gnu@example.com' }], format: 'armored', config: gcfg });
  const gpub = await openpgp.readKey({ armoredKey: g.publicKey });
  const toV4 = await openpgp.encrypt({ message: await openpgp.createMessage({ binary: bin('to gnupg') }), encryptionKeys: gpub, format: 'object', config: cfg });
  t.eq(S.messageFormat(toV4), { seipd: 1, pkesk: [3], skesk: [] }, 'to a GnuPG-style v4 key: SEIPDv1 with a v3 session key — what that key can read');
  t.eq((await S.withoutSeipdv2(openpgp, [gpub, v6.pub])).map((k) => k.getFingerprint()), [gpub.getFingerprint()], 'withoutSeipdv2 names the v4 key, not the v6 one');
  const both = await openpgp.encrypt({ message: await openpgp.createMessage({ binary: bin('to both') }), encryptionKeys: [v6.pub, gpub], format: 'object', config: cfg });
  t.eq(S.messageFormat(both), { seipd: 1, pkesk: [3, 3], skesk: [] }, 'to a v6 and a v4 key together: SEIPDv1, so both can read it — with v3 session keys for both (RFC 9580 §5.1: a v6 session key goes only with SEIPDv2)');
  t.eq(S.keyWords(gpub), 'Ed25519 (legacy EdDSA) (sign) + ECDH Curve25519 (encrypt) · v4 (RFC 4880)', 'a GnuPG-compatible key in words');

  // signatures
  const ds = await openpgp.sign({ message: await openpgp.createMessage({ binary: bin('signed') }), signingKeys: v6.open, detached: true, config: cfg });
  t.eq(S.signatureWords(await openpgp.readSignature({ armoredSignature: ds })), 'v6 signature (RFC 9580) · Ed25519 · SHA-512', 'a v6 detached signature in words');
  const ds448 = await openpgp.sign({ message: await openpgp.createMessage({ binary: bin('signed') }), signingKeys: keys.curve448.open, detached: true, config: cfg });
  t.eq(S.signatureWords(await openpgp.readSignature({ armoredSignature: ds448 })), 'v6 signature (RFC 9580) · Ed448 · SHA-512', '… with Ed448 (SHA-512, the least Ed448 takes)');

  // ---- the RFC 9580 Appendix A vectors in words
  const vf = async (n) => S.formatWords(S.messageFormat(await openpgp.readMessage({ armoredMessage: V(n) })));
  t.eq(await vf('aead-ocb.msg'), 'SEIPDv2 — AES-128 in OCB mode (AEAD, RFC 9580) · password (v6 session key, iterated and salted S2K)', 'Appendix A.?: the OCB sample');
  t.eq(await vf('aead-eax.msg'), 'SEIPDv2 — AES-128 in EAX mode (AEAD, RFC 9580) · password (v6 session key, iterated and salted S2K)', 'the EAX sample');
  t.eq(await vf('aead-gcm.msg'), 'SEIPDv2 — AES-128 in GCM mode (AEAD, RFC 9580) · password (v6 session key, iterated and salted S2K)', 'the GCM sample');
  t.ok(/^SEIPDv1 .* · password \(v4 session key, Argon2 \(1 pass, 4 lanes, 2048 MiB\)\)$/.test(await vf('argon2-aes256.msg')), `the Argon2 sample: 1 pass, 4 lanes, 2 GiB (${await vf('argon2-aes256.msg')})`);
  t.eq(await vf('v6-seipdv2.asc'), 'SEIPDv2 — AES-256 in OCB mode (AEAD, RFC 9580) · v6 session key for 1 key', 'the v6 key\'s SEIPDv2 sample (Appendix A.8: AES-256, OCB)');
  t.eq(await vf('v6-seipdv1.asc'), 'SEIPDv1 — CFB with a modification detection code (RFC 4880, as GnuPG writes) · v3 session key for 1 key', 'the v6 key\'s SEIPDv1 sample');
  t.eq(S.signatureWords((await openpgp.readCleartextMessage({ cleartextMessage: V('v6-clearsigned.asc') })).signature), 'v6 signature (RFC 9580) · Ed25519 · SHA-512', 'the clear-signed sample: a v6 Ed25519 signature');

  // ---- independent references: rPGP (rsop) and Sequoia PGP (sqop)
  const find = (name, env) => {
    for (const p of [process.env[env], (() => { try { return execFileSync('sh', ['-c', `command -v ${name}`]).toString().trim(); } catch { return ''; } })()].filter(Boolean)) {
      try { if (/rfc9580/.test(execFileSync(p, ['list-profiles', 'generate-key']).toString())) return p; } catch { /* not this one */ }
    }
    return null;
  };
  const T = mkdtempSync(join(tmpdir(), 'pgp9580-'));
  writeFileSync(join(T, 'pw'), 'correct horse');
  for (const [tool, env] of [['rsop', 'RSOP'], ['sqop', 'SQOP']]) {
    const exe = find(tool, env);
    if (!exe) { t.ok(true, `${tool} (an RFC 9580 SOP tool) not found — set ${env} or put it on the PATH; its interop checks are skipped`); continue; }
    const sop = (args, input) => execFileSync(exe, args, { input, cwd: T, maxBuffer: 1 << 26 });
    const what = execFileSync(exe, ['version', '--extended']).toString().split('\n').filter((l) => /rpgp|Sequoia/.test(l)).join(', ');
    for (const type of ['curve25519', 'curve448']) {
      const k = keys[type], tag = `${tool} (${what}), ${type}`;
      writeFileSync(join(T, `${type}.cert`), k.armored.publicKey); writeFileSync(join(T, `${type}.key`), k.armored.privateKey);
      const c = sop(['encrypt', '--profile', 'rfc9580', `${type}.cert`], 'from the tool\n').toString();
      const cm = await openpgp.readMessage({ armoredMessage: c });
      const d = await openpgp.decrypt({ message: cm, decryptionKeys: k.open, format: 'binary' });
      t.eq([str(d.data), S.messageFormat(cm).seipd], ['from the tool\n', 2], `${tag}: the tool encrypts to the tab's key (SEIPDv2), the tab decrypts`);
      const e = await S.readOut((await openpgp.encrypt({ message: await openpgp.createMessage({ binary: bin('from the tab\n') }), encryptionKeys: k.pub, format: 'object', config: cfg })).armor(cfg));
      t.eq(sop(['decrypt', '--with-key-password', 'pw', `${type}.key`], e).toString(), 'from the tab\n', `${tag}: the tool decrypts with the tab's secret key (its Argon2 + OCB lock read)`);
      writeFileSync(join(T, 'd.sig'), await openpgp.sign({ message: await openpgp.createMessage({ binary: bin('signed data\n') }), signingKeys: k.open, detached: true, config: cfg }));
      let verified = true; try { sop(['verify', 'd.sig', `${type}.cert`], 'signed data\n'); } catch { verified = false; }
      t.ok(verified, `${tag}: the tool verifies the tab's v6 detached signature`);
      let changed = true; try { sop(['verify', 'd.sig', `${type}.cert`], 'signed dato\n'); } catch { changed = false; }
      t.ok(!changed, `${tag}: … and not for changed data`);
      const cs = await openpgp.sign({ message: await openpgp.createCleartextMessage({ text: 'clear text' }), signingKeys: k.open, config: cfg });
      t.eq(sop(['inline-verify', `${type}.cert`], cs).toString().replace(/\r?\n$/, ''), 'clear text', `${tag}: the tool verifies the tab's clear-signed text`);
    }
    const key = sop(['generate-key', '--profile', 'rfc9580', 'Tool <tool@example.com>']).toString();
    writeFileSync(join(T, `${tool}.key`), key);
    const cert = sop(['extract-cert'], key).toString();
    const tpub = await openpgp.readKey({ armoredKey: cert });
    t.eq(tpub.keyPacket.version, 6, `${tool}: its rfc9580 key is a v6 key (${S.keyWords(tpub)})`);
    const enc = await openpgp.encrypt({ message: await openpgp.createMessage({ binary: bin('to the tool\n') }), encryptionKeys: tpub, format: 'object', config: cfg });
    const ef = S.messageFormat(enc);
    t.eq(sop(['decrypt', `${tool}.key`], await S.readOut(enc.armor(cfg))).toString(), 'to the tool\n', `${tool}: the tab encrypts to the tool's key (${S.formatWords(ef)}), the tool decrypts`);
    t.eq(ef.seipd, 2, `${tool}: … as SEIPDv2 (the tool's key asks for it)`);
    const sig = sop(['sign', `${tool}.key`], 'tool signed\n').toString();
    const v = await openpgp.verify({ message: await openpgp.createMessage({ binary: bin('tool signed\n') }), signature: await openpgp.readSignature({ armoredSignature: sig }), verificationKeys: tpub });
    t.ok(await v.signatures[0].verified.then(() => true, () => false), `${tool}: the tab verifies the tool's detached signature (${S.signatureWords(await v.signatures[0].signature)})`);
    const ics = sop(['inline-sign', '--as', 'clearsigned', `${tool}.key`], 'tool clear\n').toString();
    const v2 = await openpgp.verify({ message: await openpgp.readCleartextMessage({ cleartextMessage: ics }), verificationKeys: tpub });
    t.ok(await v2.signatures[0].verified.then(() => true, () => false), `${tool}: the tab verifies the tool's clear-signed text`);
    const pe = await S.readOut((await openpgp.encrypt({ message: await openpgp.createMessage({ binary: bin('pw msg\n') }), passwords: ['correct horse'], format: 'object', config: cfg })).armor(cfg));
    t.eq(sop(['decrypt', '--with-password', 'pw'], pe).toString(), 'pw msg\n', `${tool}: the tool decrypts the tab's password message (SKESKv6, Argon2, SEIPDv2)`);
    const te = sop(['encrypt', '--profile', 'rfc9580', '--with-password', 'pw'], 'tool pw\n').toString();
    const tm = await openpgp.readMessage({ armoredMessage: te });
    t.eq(str((await openpgp.decrypt({ message: tm, passwords: ['correct horse'], format: 'binary' })).data), 'tool pw\n', `${tool}: the tab decrypts the tool's password message (${S.formatWords(S.messageFormat(tm))})`);
  }
};
