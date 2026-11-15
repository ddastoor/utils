// OpenPGP (OpenPGP.js 6). Default profile is GnuPG-compatible: v4 keys, Ed25519 + Curve25519 (legacy encodings),
// AES-256, SEIPDv1 + MDC, iterated+salted S2K. Decryption/verification also accept RFC 9580 (v6, AEAD, Argon2) input.
import * as openpgp from 'openpgp';
import {
  h, card, field, input, textarea, button, segmented, toggle, filePicker, note, actions, outputBox, downloadBlob,
  stack, row, clear, fmtBytes, readBytes, type Mount,
} from '../ui';

const GPG_CONFIG = {
  v6Keys: false,
  aeadProtect: false,
  preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256,
  preferredHashAlgorithm: openpgp.enums.hash.sha512,
  s2kType: openpgp.enums.s2k.iterated,
  s2kIterationCountByte: 255,
} as const;
const MODERN_CONFIG = { v6Keys: true, aeadProtect: true, s2kType: openpgp.enums.s2k.argon2, preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256 } as const;

type Profile = 'gpg' | 'modern';
const isArmored = (b: Uint8Array) => new TextDecoder().decode(b.subarray(0, 64)).includes('-----BEGIN PGP');

/** A key source: paste armored text or load a .asc/.gpg file. */
function keyInput(label: string, kind: 'public' | 'private', multiple = false) {
  let bin: Uint8Array | null = null;
  const ta = textarea({ rows: 4, mono: true, placeholder: `Paste ${kind} key (-----BEGIN PGP ${kind.toUpperCase()} KEY BLOCK-----) or load a file` });
  const info = h('span', { class: 'muted small' });
  const pick = filePicker({ compact: true, label: `Load ${kind} key file${multiple ? 's' : ''}`, hint: '.asc, .gpg, .pgp, .key', multiple, onFiles: async (fs) => {
    const parts = await Promise.all(fs.map(readBytes));
    if (parts.every(isArmored)) { ta.value = parts.map((p) => new TextDecoder().decode(p)).join('\n'); bin = null; }
    else { bin = parts[0]; ta.value = ''; }
    info.textContent = fs.map((f) => f.name).join(', ');
  } });
  const el = field(label, stack(pick, info, ta));
  return {
    el,
    async keys(): Promise<openpgp.Key[]> {
      if (bin) return kind === 'private' ? openpgp.readPrivateKeys({ binaryKeys: bin }) : openpgp.readKeys({ binaryKeys: bin });
      if (!ta.value.trim()) return [];
      return kind === 'private' ? openpgp.readPrivateKeys({ armoredKeys: ta.value }) : openpgp.readKeys({ armoredKeys: ta.value });
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

async function unlock(keys: openpgp.Key[], pass: string): Promise<openpgp.PrivateKey[]> {
  return Promise.all(keys.map(async (k) => {
    const pk = k as openpgp.PrivateKey;
    if (!pk.isPrivate()) throw new Error('That is a public key; a private key is needed here.');
    if (pk.isDecrypted()) return pk;
    try { return await openpgp.decryptKey({ privateKey: pk, passphrase: pass }); }
    catch { throw new Error('Wrong passphrase for the private key.'); }
  }));
}

const fpr = (k: openpgp.Key) => k.getFingerprint().toUpperCase().replace(/(.{4})/g, '$1 ').trim();
const uid = (k: openpgp.Key) => k.getUserIDs()[0] || '(no user ID)';

function result(area: HTMLElement, items: Array<Node | string | null>) { clear(area).append(...items.filter(Boolean) as Node[]); }

async function sigReport(sigs: any[], keys: openpgp.Key[]) {
  if (!sigs.length) return note('The data was not signed.', 'info');
  const lines: Node[] = [];
  for (const s of sigs) {
    const signer = keys.find((k) => k.getKeys(s.keyID).length);
    try {
      await s.verified;
      lines.push(note(`Good signature from ${signer ? uid(signer) : 'key ' + s.keyID.toHex().toUpperCase()}`, 'ok'));
    } catch (e: any) {
      lines.push(note(signer ? `BAD signature: ${e.message}` : `Signed by key ${s.keyID.toHex().toUpperCase()} — add that public key to verify it.`, signer ? 'err' : 'warn'));
    }
  }
  return h('div', { class: 'stack' }, lines);
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
        if (!name.value && !email.value) throw new Error('Enter a name or email.');
        if (!p1.value) throw new Error('Choose a passphrase to protect the private key.');
        if (p1.value !== p2.value) throw new Error('Passphrases do not match.');
        const cfg = profile === 'gpg' ? GPG_CONFIG : MODERN_CONFIG;
        const userIDs = [{ name: name.value || undefined, email: email.value || undefined }];
        const k = await openpgp.generateKey({ type: profile === 'gpg' ? 'ecc' : 'curve25519', curve: profile === 'gpg' ? 'curve25519Legacy' : undefined, userIDs, passphrase: p1.value, format: 'armored', config: cfg } as any);
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
          const res = await openpgp.encrypt(opts);
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
          const bytes = await data.bytes();
          const message = isArmored(bytes) ? await openpgp.readMessage({ armoredMessage: new TextDecoder().decode(bytes) }) : await openpgp.readMessage({ binaryMessage: bytes });
          const sk = await priv.keys();
          const vk = await verify.keys();
          const opts: any = { message, format: 'binary', verificationKeys: vk.length ? vk : undefined };
          if (sk.length) opts.decryptionKeys = await unlock(sk, kpass.value); else opts.passwords = [kpass.value];
          let res;
          try { res = await openpgp.decrypt(opts); }
          catch (e: any) { throw new Error(/Session key|password|decrypt/i.test(e.message) ? 'Could not decrypt: wrong key or password.' : e.message); }
          const outBytes = res.data as Uint8Array;
          const fname = (message.packets.findPacket(openpgp.enums.packet.literalData) as any)?.getFileName?.() || data.name.replace(/\.(gpg|pgp|asc)$/i, '') || 'decrypted';
          const textish = !outBytes.some((b) => b === 0) && outBytes.length < 2_000_000;
          const items: Array<Node> = [await sigReport(res.signatures, vk)];
          if (textish && data.kind === 'text') { const box = outputBox({ rows: 8 }); box.value = new TextDecoder().decode(outBytes); items.push(card('Decrypted text', box)); }
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
        const keys = await pubs.keys();
        if (!keys.length) throw new Error('Add the signer\'s public key.');
        let sigs;
        if (style === 'clear') {
          const msg = await openpgp.readCleartextMessage({ cleartextMessage: data.text });
          sigs = (await openpgp.verify({ message: msg, verificationKeys: keys })).signatures;
        } else {
          if (!sigFile) throw new Error('Choose the signature file.');
          const sb = await readBytes(sigFile);
          const signature = isArmored(sb) ? await openpgp.readSignature({ armoredSignature: new TextDecoder().decode(sb) }) : await openpgp.readSignature({ binarySignature: sb });
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
