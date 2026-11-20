// OpenPGP tab: the text helpers (src/lib/pgptext.ts) and the library's support of RFC 9580, checked on the test vectors
// of RFC 9580 Appendix A (tests/fixtures/pgp/rfc9580/ — copied from rPGP's test data): the v6 key of Annex A.4 with
// its messages, AEAD-encrypted messages (EAX, OCB, GCM) and Argon2-protected messages, all with known plaintexts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as openpgp from 'openpgp';

export default async (t, { load, root }) => {
  const { armored, armoredBytes, wrongKind, pgpError, isEmail, decryptedName, groupHex } = await load('/src/lib/pgptext.ts');
  const F = (n) => readFileSync(join(root, 'tests/fixtures/pgp/rfc9580', n), 'utf8');

  // ---- RFC 9580 vectors through the library the tab uses
  for (const [file, what] of [['argon2-aes256.msg', 'Argon2 with the RFC\'s parameters — 2 GiB of memory, so one of the three is enough here'], ['aead-ocb.msg', 'AEAD OCB'], ['aead-eax.msg', 'AEAD EAX'], ['aead-gcm.msg', 'AEAD GCM']]) {
    const message = await openpgp.readMessage({ armoredMessage: F(file) });
    const r = await openpgp.decrypt({ message, passwords: ['password'], format: 'binary' });
    t.eq(new TextDecoder().decode(r.data), 'Hello, world!', `RFC 9580 Appendix A: a message protected with a password (${what}) decrypts to "Hello, world!"`);
  }
  { const key = await openpgp.readPrivateKey({ armoredKey: F('v6-key.asc') });
    t.eq([key.keyPacket.version, key.getAlgorithmInfo().algorithm], [6, 'ed25519'], 'the v6 key of Annex A.4 is read: version 6, Ed25519');
    for (const f of ['v6-seipdv2.asc', 'v6-seipdv1.asc']) {
      const r = await openpgp.decrypt({ message: await openpgp.readMessage({ armoredMessage: F(f) }), decryptionKeys: key, format: 'binary' });
      t.eq(new TextDecoder().decode(r.data), 'hello world\n', `… and decrypts a message to it (${f.includes('v2') ? 'SEIPD v2, AEAD' : 'SEIPD v1'})`);
    }
    const v = await openpgp.verify({ message: await openpgp.readCleartextMessage({ cleartextMessage: F('v6-clearsigned.asc') }), verificationKeys: key.toPublic() });
    t.ok(await v.signatures[0].verified, 'a clear-signed text made with it verifies');
    const changed = F('v6-clearsigned.asc').replace('hello world', 'hello World');
    const v2 = await openpgp.verify({ message: await openpgp.readCleartextMessage({ cleartextMessage: changed }), verificationKeys: key.toPublic() });
    let bad = false; try { await v2.signatures[0].verified; } catch { bad = true; }
    t.ok(bad, '… and the same text changed by one letter does not');
    let wrong = ''; try { await openpgp.decrypt({ message: await openpgp.readMessage({ armoredMessage: F('argon2-aes256.msg') }), passwords: ['Password'], format: 'binary' }); } catch (e) { wrong = e.message; }
    t.ok(/decrypt|session key/i.test(wrong), `the wrong password is refused (${wrong.slice(0, 60)})`); }

  // ---- finding the armored block in what was pasted
  const msg = F('v6-seipdv2.asc'), key = F('v6-key.asc');
  t.eq(armored(msg)?.kind, 'MESSAGE', 'a message');
  t.eq(armored(`Hi Bob,\n\nhere it is, as promised:\n\n${msg}\nCheers, Alice\n-- \nsent from my phone`)?.text, msg.trim(), 'inside an e-mail: the block alone, without the words around it (the tab took text before it for binary data)');
  t.eq(armored(msg.replace(/\n/g, '\r\n'))?.text, msg.trim(), 'Windows line ends made plain');
  t.eq(armored(`${key}\n\nand the second one:\n${key}`)?.blocks, [key.trim(), key.trim()], 'two keys pasted one after another: both, each a block of its own');
  { const two = await openpgp.readKeys({ armoredKeys: `${F('v6-key.asc')}\n${F('v6-key.asc')}` }).then((k) => k.length, () => -1); t.eq(two, 1, 'why each block on its own: OpenPGP.js, given two armored keys in one text, reads only the first (a second recipient was dropped without a word)'); }
  t.eq(armored(`${msg}\n${msg}`)?.text, msg.trim(), 'two messages: the first');
  { const cs = F('v6-clearsigned.asc'); t.eq(armored(`Please check:\n${cs}`), { kind: 'SIGNED MESSAGE', text: cs.trim(), blocks: [cs.trim()] }, 'a clear-signed text runs to the end of its signature'); }
  t.eq(armored('-----BEGIN PGP MESSAGE-----\n\nwcBMA'), { kind: 'MESSAGE', text: '-----BEGIN PGP MESSAGE-----\n\nwcBMA', blocks: ['-----BEGIN PGP MESSAGE-----\n\nwcBMA'] }, 'a block without its END line is handed on (the library then says what is missing)');
  t.eq([armored(''), armored('just words'), armored('-----BEGIN PGP SOMETHING-----')], [null, null, null], 'no block: null');
  t.eq(armoredBytes(new TextEncoder().encode(`From: a\n\n${msg}`))?.kind, 'MESSAGE', 'bytes of a file that holds armor');
  t.eq(armoredBytes(new Uint8Array([0xc1, 0x0c, 0x06, 0x00, 0x2d, 0x2d, 0x2d])), null, 'binary packets are not armor');

  // ---- the wrong thing in a box, said in words
  t.eq(wrongKind('PUBLIC KEY BLOCK', ['PRIVATE KEY BLOCK'], 'Your private key'), 'Your private key: that is a public key — your private key is needed here (it begins with "-----BEGIN PGP PRIVATE KEY BLOCK-----").', 'a public key where the private one belongs');
  t.eq(wrongKind('MESSAGE', ['PUBLIC KEY BLOCK', 'PRIVATE KEY BLOCK'], 'Recipient public key(s)'), 'Recipient public key(s): that is an encrypted or signed message, not a public key or a private key.', 'a message where a key belongs');
  t.eq(wrongKind('PRIVATE KEY BLOCK', ['PUBLIC KEY BLOCK', 'PRIVATE KEY BLOCK'], 'x'), null, 'a private key in a public-key box is fine (it holds the public parts)');
  t.eq(pgpError(new Error('Error generating keypair: Invalid user ID format')), 'The name or e-mail address cannot be used in a key.', 'library errors in words: user ID');
  t.eq(pgpError(new Error('Armored text not of type private key'), 'key'), 'That is a public key — your private key is needed here.', '… a public key');
  t.eq(pgpError(new Error('Error during parsing. This message / key probably does not conform to a valid OpenPGP format.'), 'message'), 'That is not an OpenPGP message, or it is incomplete (paste the whole block from "-----BEGIN PGP MESSAGE-----" to the END line).', '… not a message');
  t.ok(/revoked by its owner/.test(pgpError(new Error('Error encrypting message: Could not find valid encryption key packet in key 1234: Primary key is revoked'), 'encrypt')), '… a revoked recipient key');
  t.ok(/expired/.test(pgpError(new Error('Primary key is expired'), 'encrypt')), '… an expired one');
  t.eq(pgpError(new Error('Error decrypting message: Something new')), 'Something new', 'an unknown message keeps its words, without the library\'s prefix');

  // ---- e-mail addresses, file names, fingerprints
  t.eq(['a@b.co', 'alice@example.com', 'a.b+c@mail.example.in'].map(isEmail), [true, true, true], 'e-mail addresses');
  t.eq(['not an email', 'a@b', 'a b@c.com', '@x.com', 'a@b.c', 'Alice <a@b.com>'].map(isEmail), [false, false, false, false, false, false], 'not e-mail addresses (the library refused them with "Invalid user ID format")');
  t.eq(decryptedName('photo.bin', 'odd-name.gpg'), 'photo.bin', 'the name stored in the message (it was the encrypted file\'s name: "odd-name")');
  t.eq([decryptedName('', 'report.pdf.gpg'), decryptedName(undefined, 'a.asc'), decryptedName('_CONSOLE', 'b.pgp'), decryptedName('../../etc/passwd', 'x.gpg'), decryptedName('C:\\Users\\x\\note.txt', 'x.gpg'), decryptedName('..', 'y.gpg'), decryptedName('', '.gpg')], ['report.pdf', 'a', 'b', 'passwd', 'note.txt', 'y', 'decrypted'], 'no usable stored name: the encrypted file\'s name without .gpg / .asc; folders and "_CONSOLE" are never used');
  t.eq(groupHex('0123456789abcdef0123456789abcdef01234567'), '0123 4567 89AB CDEF 0123 4567 89AB CDEF 0123 4567', 'a fingerprint in groups of four');
};
