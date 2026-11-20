// OpenPGP (OpenPGP.js 6). Default profile is GnuPG-compatible: v4 keys, Ed25519 + Curve25519 (legacy encodings),
// AES-256, SEIPDv1 + MDC, iterated+salted S2K. Decryption/verification also accept RFC 9580 (v6, AEAD, Argon2) input.
import type * as OpenPGP from 'openpgp';
import { lazyEngine } from '../lifecycle';
import {
  h, card, field, input, textarea, button, segmented, toggle, filePicker, note, actions, outputBox, downloadBlob,
  stack, row, clear, fmtBytes, readBytes, type Mount,
} from '../ui';
import { armored, armoredBytes, wrongKind, pgpError, isEmail, decryptedName, groupHex, type ArmorKind } from '../lib/pgptext';

// OpenPGP.js is fetched with the first action, not as the tab opens (it is 0.4 MB): every handler awaits ready() first.
const engine = lazyEngine('openpgp', () => import('openpgp'));
let openpgp: typeof OpenPGP;
let GPG_CONFIG: Record<string, unknown>, MODERN_CONFIG: Record<string, unknown>;
async function ready() {
  openpgp = await engine();
  GPG_CONFIG = {
    v6Keys: false,
    aeadProtect: false,
    preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256,
    preferredHashAlgorithm: openpgp.enums.hash.sha512,
    s2kType: openpgp.enums.s2k.iterated,
    s2kIterationCountByte: 255,
  };
  MODERN_CONFIG = { v6Keys: true, aeadProtect: true, s2kType: openpgp.enums.s2k.argon2, preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256 };
}

type Profile = 'gpg' | 'modern';

/** A key source: paste armored text or load .asc / .gpg files. The armored blocks are found inside whatever was
 *  pasted (an e-mail with the key in it) and each is read on its own — OpenPGP.js reads only the first block of a text,
 *  so a second recipient's key was dropped without a word; the wrong kind of key or no key at all is said in words. */
function keyInput(label: string, kind: 'public' | 'private', multiple = false) {
  let bins: Uint8Array[] = []; // binary key files (armored ones go into the text box)
  const ta = textarea({ rows: 4, mono: true, placeholder: `Paste ${kind} key (-----BEGIN PGP ${kind.toUpperCase()} KEY BLOCK-----) or load a file` });
  ta.setAttribute('aria-label', label);
  const info = h('span', { class: 'muted small' });
  const pick = filePicker({ compact: true, label: `Load ${kind} key file${multiple ? 's' : ''}`, hint: '.asc, .gpg, .pgp, .key', multiple, onFiles: async (fs) => {
    const parts = await Promise.all(fs.map(readBytes));
    const texts = parts.map(armoredBytes);
    ta.value = texts.filter(Boolean).map((t) => t!.text).join('\n');
    bins = parts.filter((_, i) => !texts[i]);
    info.textContent = fs.map((f) => f.name).join(', ');
  } });
  ta.addEventListener('input', () => { bins = []; info.textContent = ''; });
  const el = field(label, stack(pick, info, ta));
  const wanted: ArmorKind[] = kind === 'private' ? ['PRIVATE KEY BLOCK'] : ['PUBLIC KEY BLOCK', 'PRIVATE KEY BLOCK'];
  const read = (o: { armoredKeys: string } | { binaryKeys: Uint8Array }): Promise<OpenPGP.Key[]> => (kind === 'private' ? openpgp.readPrivateKeys(o as any) : openpgp.readKeys(o as any));
  return {
    el,
    async keys(): Promise<OpenPGP.Key[]> {
      try {
        const out: OpenPGP.Key[] = [];
        for (const b of bins) out.push(...(await read({ binaryKeys: b })));
        if (ta.value.trim()) {
          // every block of every kind in the box: a public and a private key pasted together are both read
          const blocks: Array<{ kind: ArmorKind; text: string }> = [];
          let rest = ta.value.replace(/\r\n?/g, '\n');
          for (let a = armored(rest); a; a = armored(rest)) {
            for (const b of a.blocks) blocks.push({ kind: a.kind, text: b });
            const last = a.blocks[a.blocks.length - 1];
            rest = rest.slice(rest.indexOf(last) + last.length);
          }
          if (!blocks.length) throw new Error(`${label}: that is not an OpenPGP key (paste the whole block from "-----BEGIN PGP ${kind.toUpperCase()} KEY BLOCK-----" to its END line, or load the .asc / .gpg file).`);
          for (const b of blocks) { const wrong = wrongKind(b.kind, wanted, label); if (wrong) throw new Error(wrong); }
          for (const b of blocks) out.push(...(await read({ armoredKeys: b.text })));
        }
        return out;
      } catch (e) { throw new Error(e instanceof Error && e.message.startsWith(label) ? e.message : `${label}: ${pgpError(e, 'key')}`); }
    },
  };
}

/** Data source: a file or typed text. */
function dataInput(textLabel = 'Message') {
  let kind: 'file' | 'text' = 'file';
  let file: File | null = null;
  const info = h('div', { class: 'muted small' });
  const pick = filePicker({ label: 'Choose a file', onFiles: ([f]) => { file = f; info.textContent = `${f.name} · ${fmtBytes(f.size)}`; } });
  const ta = textarea({ rows: 5, placeholder: 'Type or paste…' });
  const area = h('div');
  const render = () => clear(area).append(kind === 'file' ? stack(pick, info) : field(textLabel, ta));
  const seg = segmented([['file', 'File'], ['text', 'Text']], kind, (v) => { kind = v; render(); });
  render();
  return {
    el: stack(seg, area),
    get kind() { return kind; },
    get name() { return kind === 'file' ? file?.name || 'data' : 'message.txt'; },
    async bytes(): Promise<Uint8Array> {
      if (kind === 'text') return new TextEncoder().encode(ta.value);
      if (!file) throw new Error('Choose a file first.');
      return readBytes(file);
    },
    get text() { return ta.value; },
  };
}

async function unlock(keys: OpenPGP.Key[], pass: string): Promise<OpenPGP.PrivateKey[]> {
  return Promise.all(keys.map(async (k) => {
    const pk = k as OpenPGP.PrivateKey;
    if (!pk.isPrivate()) throw new Error('That is a public key; a private key is needed here.');
    if (pk.isDecrypted()) return pk;
    try { return await openpgp.decryptKey({ privateKey: pk, passphrase: pass }); }
    catch { throw new Error('Wrong passphrase for the private key.'); }
  }));
}

const fpr = (k: OpenPGP.Key) => k.getFingerprint().toUpperCase().replace(/(.{4})/g, '$1 ').trim();
const uid = (k: OpenPGP.Key) => k.getUserIDs()[0] || '(no user ID)';

function result(area: HTMLElement, items: Array<Node | string | null>) { clear(area).append(...items.filter(Boolean) as Node[]); }

const when = (d: Date | null | undefined) => (d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
async function sigReport(sigs: any[], keys: OpenPGP.Key[]) {
  if (!sigs.length) return note('The data was not signed.', 'info');
  const lines: Node[] = [];
  for (const s of sigs) {
    const signer = keys.find((k) => k.getKeys(s.keyID).length);
    const made = await Promise.resolve(s.signature).then((sig: any) => sig?.packets?.[0]?.created as Date | undefined, () => undefined);
    try {
      await s.verified;
      const key = signer!.getKeys(s.keyID)[0];
      lines.push(note(h('span', null, `Good signature from ${uid(signer!)}`, h('br'), h('span', { class: 'small' }, `Key ${groupHex(key.getFingerprint())}${made ? ` · signed ${when(made)}` : ''}`)), 'ok'));
    } catch (e: any) {
      lines.push(note(signer ? `BAD signature — the data or the signature was changed after signing (${pgpError(e, 'signature')}).` : `Signed by key ${s.keyID.toHex().toUpperCase()} — add that public key to verify it.`, signer ? 'err' : 'warn'));
    }
  }
  return h('div', { class: 'stack' }, lines);
}
/** A message from what was pasted or chosen: the armored block inside it, or binary packets. */
async function readMsg(bytes: Uint8Array) {
  const a = armoredBytes(bytes);
  try {
    if (a) {
      if (a.kind !== 'MESSAGE') throw new Error(a.kind === 'SIGNED MESSAGE' ? 'That is a clear-signed message, not an encrypted one — check it under Verify.' : `That is ${a.kind === 'SIGNATURE' ? 'a signature' : 'a key'}, not an encrypted message.`);
      return await openpgp.readMessage({ armoredMessage: a.text });
    }
    return await openpgp.readMessage({ binaryMessage: bytes });
  } catch (e) { throw new Error(e instanceof Error && /^That is/.test(e.message) ? e.message : pgpError(e, 'message')); }
}

export const mount: Mount = (root) => {
  let op: 'gen' | 'enc' | 'dec' | 'sign' | 'verify' = 'enc';
  const body = h('div', { class: 'stack' });
  const opSeg = segmented([['gen', 'Generate keys'], ['enc', 'Encrypt'], ['dec', 'Decrypt'], ['sign', 'Sign'], ['verify', 'Verify']], op, (v) => { op = v; render(); });

  const render = () => {
    clear(body);
    const out = h('div', { class: 'stack' });
    if (op === 'gen') {
      const name = input({ placeholder: 'Your name' }), email = input({ type: 'email', placeholder: 'you@example.com' });
      const p1 = input({ type: 'password', attrs: { autocomplete: 'new-password' } }), p2 = input({ type: 'password', attrs: { autocomplete: 'new-password' } });
      let profile: Profile = 'gpg';
      body.append(card(null, stack(
        h('div', { class: 'grid2' }, field('Name', name), field('Email', email)),
        h('div', { class: 'grid2' }, field('Passphrase', p1), field('Repeat passphrase', p2)),
        field('Key format', segmented([['gpg', 'GnuPG-compatible (v4, Ed25519/Cv25519)'], ['modern', 'RFC 9580 v6 (not readable by GnuPG yet)']], profile, (v) => (profile = v))),
      )), out, actions(button('Generate key pair', async () => {
        await ready();
        if (!name.value.trim() && !email.value.trim()) throw new Error('Enter a name or an e-mail address.');
        if (email.value.trim() && !isEmail(email.value.trim())) throw new Error(`"${email.value.trim()}" is not an e-mail address.`);
        if (!p1.value) throw new Error('Choose a passphrase to protect the private key.');
        if (p1.value !== p2.value) throw new Error('Passphrases do not match.');
        const cfg = profile === 'gpg' ? GPG_CONFIG : MODERN_CONFIG;
        const userIDs = [{ name: name.value.trim() || undefined, email: email.value.trim() || undefined }];
        const k = await (openpgp.generateKey as any)({ type: profile === 'gpg' ? 'ecc' : 'curve25519', curve: profile === 'gpg' ? 'curve25519Legacy' : undefined, userIDs, passphrase: p1.value, format: 'armored', config: cfg }).catch((e: unknown) => { throw new Error(pgpError(e, 'generate')); });
        const pub = await openpgp.readKey({ armoredKey: k.publicKey });
        const base = (email.value || name.value || 'key').replace(/[^\w.@-]+/g, '_');
        const pubBox = outputBox({ rows: 6, mono: true }); pubBox.value = k.publicKey;
        result(out, [card('Your new key pair',
          h('div', { class: 'kv' }, h('span', null, 'User ID'), h('span', null, uid(pub)), h('span', null, 'Fingerprint'), h('code', null, fpr(pub)), h('span', null, 'Algorithm'), h('span', null, profile === 'gpg' ? 'Ed25519 (sign) + Curve25519 (encrypt), v4' : 'Ed25519 + X25519, v6')),
          field('Public key — share this', pubBox),
          row(button('Public key (.asc)', () => downloadBlob(new Blob([k.publicKey]), `${base}.pub.asc`), { variant: 'primary', icon: 'Download' }),
            button('Private key (.asc)', () => downloadBlob(new Blob([k.privateKey]), `${base}.secret.asc`), { icon: 'KeyRound' }),
            button('Revocation cert', () => downloadBlob(new Blob([k.revocationCertificate]), `${base}.rev.asc`), { icon: 'Ban' })),
          note('Keep the private key file and passphrase safe — nothing is stored by this site. Import into GnuPG with: gpg --import file.asc', 'warn'))]);
      }, { variant: 'primary', icon: 'KeyRound' })));
      return;
    }

    if (op === 'enc') {
      const data = dataInput();
      let mode: 'key' | 'pass' = 'key';
      const pubs = keyInput('Recipient public key(s)', 'public', true);
      const pass = input({ type: 'password', placeholder: 'Password', attrs: { autocomplete: 'new-password' } });
      const signer = keyInput('Your private key (optional, to sign)', 'private');
      const signPass = input({ type: 'password', placeholder: 'Private key passphrase' });
      const armor = toggle('ASCII-armored output (.asc)', false);
      const modeArea = h('div', { class: 'stack' });
      const renderMode = () => clear(modeArea).append(...(mode === 'key' ? [pubs.el, signer.el, field('Signing key passphrase', signPass)] : [field('Password', pass)]));
      renderMode();
      body.append(card(null, stack(data.el, field('Encrypt with', segmented([['key', 'Public key'], ['pass', 'Password (symmetric)']], mode, (v) => { mode = v; renderMode(); })), modeArea, armor)), out,
        actions(button('Encrypt', async () => {
        await ready();
          const bytes = await data.bytes();
          const message = data.kind === "text" ? await openpgp.createMessage({ text: data.text }) : await openpgp.createMessage({ binary: bytes, filename: data.name });
          const asText = armor.checked || data.kind === 'text';
          const opts: any = { message, format: asText ? 'armored' : 'binary', config: GPG_CONFIG };
          if (mode === 'key') {
            const keys = await pubs.keys();
            if (!keys.length) throw new Error('Add at least one recipient public key.');
            opts.encryptionKeys = keys;
            const sk = await signer.keys();
            if (sk.length) opts.signingKeys = await unlock(sk, signPass.value);
          } else {
            if (!pass.value) throw new Error('Enter a password.');
            opts.passwords = [pass.value];
          }
          const res = await openpgp.encrypt(opts).catch((e: unknown) => { throw new Error(pgpError(e, 'encrypt')); });
          const name = `${data.name}.${asText ? 'asc' : 'gpg'}`;
          if (asText) { const box = outputBox({ rows: 8, mono: true }); box.value = res as string; result(out, [card('Encrypted', box, row(button('Download', () => downloadBlob(new Blob([res as string]), name), { variant: 'primary', icon: 'Download' })))]); }
          else { downloadBlob(new Blob([res as Uint8Array<ArrayBuffer>]), name); result(out, [note(`Encrypted → ${name}`, 'ok')]); }
        }, { variant: 'primary', icon: 'Lock' })));
      return;
    }

    if (op === 'dec') {
      const data = dataInput('Encrypted message (armored)');
      const priv = keyInput('Your private key (leave empty for password-encrypted data)', 'private');
      const kpass = input({ type: 'password', placeholder: 'Private key passphrase or message password' });
      const verify = keyInput('Sender public key (optional, to verify signature)', 'public', true);
      body.append(card(null, stack(data.el, priv.el, field('Passphrase / password', kpass), verify.el)), out,
        actions(button('Decrypt', async () => {
        await ready();
          const bytes = await data.bytes();
          const message = await readMsg(bytes);
          const sk = await priv.keys();
          const vk = await verify.keys();
          const opts: any = { message, format: 'binary', verificationKeys: vk.length ? vk : undefined };
          if (sk.length) opts.decryptionKeys = await unlock(sk, kpass.value); else opts.passwords = [kpass.value];
          let res;
          try { res = await openpgp.decrypt(opts); }
          catch (e: any) {
            // say which keys the message is for when the given key is not one of them
            const forIds = message.getEncryptionKeyIDs().map((id) => id.toHex().toUpperCase());
            const mine = sk.flatMap((k) => k.getKeys().map((x) => x.getKeyID().toHex().toUpperCase()));
            if (sk.length && forIds.length && !forIds.some((id) => mine.includes(id) || /^0+$/.test(id))) throw new Error(`This message is not for your key: it was encrypted to key ID ${forIds.join(', ')}; yours is ${mine.join(', ')}.`);
            if (!sk.length && forIds.length) throw new Error(`This message was encrypted to a key (ID ${forIds.join(', ')}), not with a password — load your private key.`);
            throw new Error(/Session key|password|decrypt/i.test(e.message) ? (sk.length ? 'Could not decrypt with this key.' : 'Wrong password.') : pgpError(e, 'decrypt'));
          }
          const outBytes = res.data as Uint8Array;
          const fname = decryptedName((res as any).filename, data.name);
          let text: string | null = null;
          if (outBytes.length < 2_000_000 && !outBytes.some((b) => b === 0)) { try { text = new TextDecoder('utf-8', { fatal: true }).decode(outBytes); } catch { /* not text */ } }
          const items: Array<Node> = [await sigReport(res.signatures, vk)];
          if (text !== null) { const box = outputBox({ rows: 8, label: 'Decrypted text' }); box.value = text; items.push(card('Decrypted text', box)); }
          items.push(row(button(`Download ${fname}`, () => downloadBlob(new Blob([outBytes as Uint8Array<ArrayBuffer>]), fname), { variant: 'primary', icon: 'Download' })));
          result(out, items);
        }, { variant: 'primary', icon: 'LockOpen' })));
      return;
    }

    if (op === 'sign') {
      const data = dataInput('Text to sign');
      const priv = keyInput('Your private key', 'private');
      const kpass = input({ type: 'password', placeholder: 'Private key passphrase' });
      let style: 'detached' | 'clear' = 'detached';
      const armor = toggle('ASCII-armored signature (.asc)', true);
      body.append(card(null, stack(data.el, priv.el, field('Passphrase', kpass),
        field('Signature type', segmented([['detached', 'Detached (.sig/.asc)'], ['clear', 'Clear-signed text']], style, (v) => (style = v))), armor)), out,
        actions(button('Sign', async () => {
        await ready();
          const keys = await unlock(await priv.keys(), kpass.value);
          if (!keys.length) throw new Error('Load your private key.');
          if (style === 'clear') {
            if (data.kind !== 'text') throw new Error('Clear-signing works on typed text; use Detached for files.');
            const signed = await openpgp.sign({ message: await openpgp.createCleartextMessage({ text: data.text }), signingKeys: keys, config: GPG_CONFIG });
            const box = outputBox({ rows: 8, mono: true }); box.value = signed;
            result(out, [card('Clear-signed message', box)]);
            return;
          }
          const bytes = await data.bytes();
          const sig = await openpgp.sign({ message: await openpgp.createMessage({ binary: bytes }), signingKeys: keys, detached: true, format: armor.checked ? 'armored' : 'binary', config: GPG_CONFIG } as any);
          const name = `${data.name}.${armor.checked ? 'asc' : 'sig'}`;
          downloadBlob(new Blob([sig as any]), name);
          result(out, [note(`Detached signature saved as ${name}. Verify with: gpg --verify ${name} ${data.name}`, 'ok')]);
        }, { variant: 'primary', icon: 'Signature' })));
      return;
    }

    // verify
    let style: 'detached' | 'clear' = 'detached';
    const data = dataInput('Clear-signed text');
    let sigFile: File | null = null;
    const sigInfo = h('span', { class: 'muted small' });
    const sigPick = filePicker({ compact: true, label: 'Signature file (.sig / .asc)', onFiles: ([f]) => { sigFile = f; sigInfo.textContent = f.name; } });
    const pubs = keyInput('Signer public key(s)', 'public', true);
    const sigArea = h('div');
    const renderSig = () => clear(sigArea).append(style === 'detached' ? stack(sigPick, sigInfo) : note('Paste the whole clear-signed block (including the BEGIN PGP SIGNED MESSAGE line) into the text box above.'));
    renderSig();
    body.append(card(null, stack(field('Signature type', segmented([['detached', 'Detached signature'], ['clear', 'Clear-signed text']], style, (v) => { style = v; renderSig(); })), data.el, sigArea, pubs.el)), out,
      actions(button('Verify', async () => {
        await ready();
        const keys = await pubs.keys();
        if (!keys.length) throw new Error('Add the signer\'s public key.');
        let sigs;
        if (style === 'clear') {
          const a = armored(data.text);
          if (!a || a.kind !== 'SIGNED MESSAGE') throw new Error(a ? `That is ${a.kind === 'MESSAGE' ? 'an encrypted or signed message (check it under Decrypt)' : a.kind === 'SIGNATURE' ? 'a detached signature (choose "Detached signature")' : 'a key'}, not a clear-signed text.` : 'Paste the whole clear-signed text, from "-----BEGIN PGP SIGNED MESSAGE-----" to "-----END PGP SIGNATURE-----".');
          const msg = await openpgp.readCleartextMessage({ cleartextMessage: a.text }).catch((e: unknown) => { throw new Error(pgpError(e, 'signature')); });
          sigs = (await openpgp.verify({ message: msg, verificationKeys: keys })).signatures;
        } else {
          if (!sigFile) throw new Error('Choose the signature file.');
          const sb = await readBytes(sigFile);
          const sa = armoredBytes(sb);
          if (sa && sa.kind !== 'SIGNATURE') throw new Error(`The signature file holds ${sa.kind === 'MESSAGE' ? 'a message' : sa.kind === 'SIGNED MESSAGE' ? 'a clear-signed text (choose "Clear-signed text")' : 'a key'}, not a detached signature.`);
          const signature = await (sa ? openpgp.readSignature({ armoredSignature: sa.text }) : openpgp.readSignature({ binarySignature: sb })).catch((e: unknown) => { throw new Error(pgpError(e, 'signature')); });
          const message = await openpgp.createMessage({ binary: await data.bytes() });
          sigs = (await openpgp.verify({ message, signature, verificationKeys: keys })).signatures;
        }
        result(out, [await sigReport(sigs, keys)]);
      }, { variant: 'primary', icon: 'BadgeCheck' })));
  };

  root.append(card(null, opSeg), body,
    note('GnuPG-compatible by default (tested against gpg 2.4 in both directions). Keys are never stored — load them each time. Decryption also accepts the newer RFC 9580 (v6) format. On import gpg may print a harmless note about SHA-3 preferences; it still uses SHA-512.'));
  render();
};
