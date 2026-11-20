// OpenPGP tab: what is read from what the person pasted or chose, and how the library's errors are said. No DOM, no
// cryptography (that is OpenPGP.js's — docs/WASM-AUDIT.md, tab 100).

export type ArmorKind = 'MESSAGE' | 'PUBLIC KEY BLOCK' | 'PRIVATE KEY BLOCK' | 'SIGNATURE' | 'SIGNED MESSAGE';
const BEGIN = /-----BEGIN PGP (MESSAGE|PUBLIC KEY BLOCK|PRIVATE KEY BLOCK|SIGNATURE|SIGNED MESSAGE)-----/;

/** The armored block in a text — also when an e-mail's words stand before or after it ("Hi Bob, here it is: -----BEGIN
 *  PGP MESSAGE----- …"). Every block of that kind when there are several (keys pasted one after another); a clear-signed
 *  message runs to the END of its signature. Line ends made plain (\r\n → \n). null: there is none. */
export function armored(text: string): { kind: ArmorKind; text: string; blocks: string[] } | null {
  const t = text.replace(/\r\n?/g, '\n');
  const m = BEGIN.exec(t);
  if (!m) return null;
  const kind = m[1] as ArmorKind;
  const endWord = kind === 'SIGNED MESSAGE' ? 'SIGNATURE' : kind;
  const blocks: string[] = [];
  let from = m.index;
  for (;;) {
    const start = t.indexOf(`-----BEGIN PGP ${kind}-----`, from);
    if (start < 0) break;
    const endTag = `-----END PGP ${endWord}-----`, end = t.indexOf(endTag, start);
    if (end < 0) { blocks.push(t.slice(start).trim()); break; } // no end: let the library say what is missing
    blocks.push(t.slice(start, end + endTag.length));
    from = end + endTag.length;
    if (kind !== 'PUBLIC KEY BLOCK' && kind !== 'PRIVATE KEY BLOCK') break; // one message / signature at a time
  }
  return { kind, text: blocks.join('\n'), blocks };
}

/** Armored text inside bytes (a .asc file, or a file of any other name that holds armor), else null (binary). */
export function armoredBytes(b: Uint8Array): { kind: ArmorKind; text: string; blocks: string[] } | null {
  const head = b.subarray(0, Math.min(b.length, 4 << 20));
  if (head.subarray(0, 4096).some((x) => x === 0)) return null; // binary packets hold zero bytes early on
  return armored(new TextDecoder().decode(head));
}

const NAMES: Record<ArmorKind, string> = { MESSAGE: 'an encrypted or signed message', 'PUBLIC KEY BLOCK': 'a public key', 'PRIVATE KEY BLOCK': 'a private key', SIGNATURE: 'a signature', 'SIGNED MESSAGE': 'a clear-signed message' };
/** "This box wants a public key, and what was pasted is a private key." — or null when the kind fits. */
export function wrongKind(found: ArmorKind, wanted: ArmorKind[], box: string): string | null {
  if (wanted.includes(found)) return null;
  if (found === 'PUBLIC KEY BLOCK' && wanted.includes('PRIVATE KEY BLOCK')) return `${box}: that is a public key — your private key is needed here (it begins with "-----BEGIN PGP PRIVATE KEY BLOCK-----").`;
  return `${box}: that is ${NAMES[found]}, not ${wanted.map((w) => NAMES[w]).join(' or ')}.`;
}

/** The library's message in words a person can act on. */
export function pgpError(e: unknown, context: 'key' | 'message' | 'signature' | 'encrypt' | 'generate' | 'decrypt' = 'message'): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/Invalid user ID format/i.test(m)) return 'The name or e-mail address cannot be used in a key.';
  if (/revoked/i.test(m)) return `${context === 'encrypt' ? 'A recipient key' : 'The key'} has been revoked by its owner — it can no longer be used. Ask for their new key.`;
  if (/expired/i.test(m)) return `${context === 'encrypt' ? 'A recipient key' : 'The key'} has expired — ask its owner for a renewed key.`;
  if (/Could not find valid (encryption )?key packet|No encryption key|no valid encryption key/i.test(m)) return 'A recipient key has no part that can encrypt (a signing-only key?).';
  if (/not of type private key/i.test(m)) return 'That is a public key — your private key is needed here.';
  if (/Misformed armored text|Unknown ASCII armor|Error during parsing|not conform to a valid OpenPGP|Unexpected end of packet|Malformed/i.test(m)) {
    return { key: 'That is not an OpenPGP key (paste the whole block from "-----BEGIN PGP …" to "-----END PGP …", or load the .asc / .gpg file).',
      message: 'That is not an OpenPGP message, or it is incomplete (paste the whole block from "-----BEGIN PGP MESSAGE-----" to the END line).',
      signature: 'That is not an OpenPGP signature, or it is incomplete.', encrypt: m, generate: m, decrypt: 'That is not an OpenPGP message, or it is incomplete.' }[context];
  }
  if (/Ascii armor integrity check failed|CRC/i.test(m)) return 'The armored text was changed or cut (its check sum does not match) — copy it again in full.';
  if (/Modification detected|authentication tag|MDC/i.test(m)) return 'The encrypted data was changed after it was encrypted — it cannot be trusted.';
  return m.replace(/^Error (decrypting|encrypting|generating keypair|reading|signing|verifying)[^:]*:\s*/i, '');
}

/** A whole e-mail address, as OpenPGP.js accepts it in a user ID. */
export const isEmail = (s: string) => /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(s);

/** The name to save decrypted data under: the one stored inside the message, if it is a usable file name; else the
 *  encrypted file's own name without .gpg / .pgp / .asc. */
export function decryptedName(stored: string | undefined, encryptedName: string): string {
  const s = (stored || '').replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
  if (s && s !== '_CONSOLE' && !/^\.+$/.test(s)) return s;
  return encryptedName.replace(/\.(gpg|pgp|asc)$/i, '') || 'decrypted';
}

/** "1234 ABCD …" — a fingerprint in groups of four. */
export const groupHex = (hex: string) => hex.toUpperCase().replace(/(.{4})(?!$)/g, '$1 ');
