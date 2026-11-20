import {
  h, card, field, input, textarea, button, segmented, toggle, slider, filePicker, progress, note, actions, outputBox,
  downloadBlob, copy, toast, fmtBytes, stack, row, clear, ic, type Mount,
} from '../ui';
import { encryptBlob, decryptBlob, hashBlob, STRENGTH, sodiumVersion } from '../lib/crypto-client';
import { readEncryptedText, readShareLink, encryptedTextFile } from '../lib/sodium-format';
import { sodium, HASH_ALGS, type HashAlg, toB64, fromB64 } from '../wasm/crypto';
import { isMobile } from '../platform';

// ------------------------------------------------------------------ shared
function passwordField(label: string, placeholder = 'Password') {
  const inp = input({ type: 'password', placeholder, attrs: { autocomplete: 'new-password', 'aria-label': label } }); // the field wraps a div, so name the input itself (screen readers)
  const eye = button('', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; }, { icon: 'Eye', small: true, title: 'Show / hide' });
  return { el: field(label, h('div', { class: 'pw-wrap' }, inp, eye)), inp };
}

// ------------------------------------------------------------------ Sodium Encrypt
export const sodium_: Mount = (root) => {
  let mode: 'encrypt' | 'decrypt' = 'encrypt';
  let kind: 'file' | 'text' = 'file';
  let file: File | null = null;
  const strengths = (Object.keys(STRENGTH) as Array<keyof typeof STRENGTH>).filter((k) => !(isMobile && k === 'sensitive'));
  let strength: keyof typeof STRENGTH = isMobile ? 'interactive' : 'moderate';

  const pw1 = passwordField('Password'), pw2 = passwordField('Confirm password', 'Repeat password');
  const fileInfo = h('div', { class: 'muted small' });
  const picker = filePicker({ label: 'Choose a file', hint: 'Any file type — nothing is uploaded', onFiles: ([f]) => { file = f; fileInfo.textContent = `${f.name} · ${fmtBytes(f.size)}`; } });
  const text = textarea({ rows: 6, placeholder: 'Type or paste text…' });
  const out = outputBox({ rows: 6, mono: true });
  const prog = progress();
  const strengthSeg = segmented(strengths.map((k) => [k, STRENGTH[k].label] as [typeof k, string]), strength, (v) => (strength = v));
  const strengthField = field('Key-derivation strength (Argon2id)', strengthSeg, 'Stronger settings are slower and need more memory; decryption uses the setting stored in the file.');

  const inputArea = h('div', { class: 'stack' });
  const outputArea = h('div', { class: 'stack' });
  const render = () => {
    clear(inputArea).append(kind === 'file' ? stack(picker, fileInfo) : field(mode === 'encrypt' ? 'Text to encrypt' : 'Encrypted text (Base64)', text));
    pw2.el.hidden = mode === 'decrypt';
    pw1.inp.autocomplete = mode === 'decrypt' ? 'off' : 'new-password'; // a password to type in, not one the browser should make up
    strengthField.hidden = mode === 'decrypt';
    runBtn.setLabel(mode === 'encrypt' ? 'Encrypt' : 'Decrypt');
    clear(outputArea);
  };

  const run = async () => {
    const pw = pw1.inp.value;
    if (!pw) throw new Error('Enter a password.');
    if (mode === 'encrypt' && pw !== pw2.inp.value) throw new Error('Passwords do not match.');
    if (mode === 'encrypt' && pw.length < 8) toast('Tip: use a longer password (12+ characters).', 'info');
    let data: Blob;
    if (kind === 'file') {
      if (!file) throw new Error('Choose a file first.');
      // a file that holds the encrypted text (saved from an e-mail) instead of the encrypted bytes
      const fromText = mode === 'decrypt' ? await encryptedTextFile(file) : null;
      data = fromText ? new Blob([fromText as BlobPart]) : file;
    } else if (mode === 'encrypt') data = new Blob([text.value]);
    else { const r = readEncryptedText(text.value); if ('error' in r) throw new Error(r.error); data = new Blob([r.bytes as BlobPart]); }
    const onP = (f: number | null, t: string) => prog.set(f, t);
    clear(outputArea);
    try {
      const res = mode === 'encrypt' ? await encryptBlob(data, pw, STRENGTH[strength], onP) : await decryptBlob(data, pw, onP);
      prog.done();
      const v = root.querySelector('.ver'); if (v && sodiumVersion) v.textContent = ` ${sodiumVersion}`;
      if (kind === 'file') {
        const name = mode === 'encrypt' ? `${file!.name}.usodium` : file!.name.replace(/\.usodium$/i, '') || 'decrypted';
        outputArea.append(note(`${mode === 'encrypt' ? 'Encrypted' : 'Decrypted'}: ${name} (${fmtBytes(res.size)})`, 'ok'),
          row(button('Download', () => downloadBlob(res, name), { variant: 'primary', icon: 'Download' })));
        downloadBlob(res, name);
      } else {
        out.value = mode === 'encrypt' ? toB64(new Uint8Array(await res.arrayBuffer())) : await res.text();
        outputArea.append(field(mode === 'encrypt' ? 'Encrypted text — share this' : 'Decrypted text', out));
      }
    } catch (e) { prog.done(); throw e; }
  };
  const runBtn = button('Encrypt', run, { variant: 'primary', icon: 'Lock' });

  root.append(
    card(null, stack(
      segmented([['encrypt', 'Encrypt'], ['decrypt', 'Decrypt']], mode, (v) => { mode = v; render(); }),
      segmented([['file', 'File'], ['text', 'Text']], kind, (v) => { kind = v; render(); }),
      inputArea, pw1.el, pw2.el, strengthField, prog,
    )),
    outputArea,
    actions(runBtn),
    note(h('span', null, 'Format: Argon2id → XChaCha20-Poly1305 secretstream (libsodium', h('span', { class: 'ver' }), '). Files are processed in 64 KiB authenticated chunks; tampering or truncation is detected.')),
  );
  render();
};
export { sodium_ as sodium };

// ------------------------------------------------------------------ Encrypted Share Link
/** Beyond this many characters some apps (SMS, some chat and mail apps) cut a link. */
const LINK_WARN = 2000;
/** A failure to open a link, said for a link: a cut link and a wrong password look the same to the cipher. */
const linkError = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /Wrong password|corrupted|modified|incomplete|truncated|extra data|Not a Sodium|out of range/i.test(m)
    ? 'Could not open the message: the password is wrong, or the link was cut or changed on the way (some apps cut long links — compare its end with the one that was sent).'
    : m;
};
export const sharelink: Mount = (root) => {
  const prog = progress();
  if (/[?&]d=/.test(location.hash)) {
    const read = readShareLink(location.hash);
    const pw = passwordField('Password');
    pw.inp.autocomplete = 'off'; // the password the sender gave — the browser should not offer to make one up
    const out = outputBox({ rows: 6 });
    const result = h('div');
    let decryptBtn: HTMLButtonElement | undefined;
    pw.inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') decryptBtn?.click(); });
    root.append(
      note('Someone sent you an encrypted message. Enter the password they gave you. Decryption happens on this device.'),
      'error' in read ? note(`This link cannot be opened: ${read.error}`, 'err') : card(null, stack(pw.el, prog, result)),
      actions(...('error' in read ? [] : [decryptBtn = button('Decrypt', async () => {
        if (!pw.inp.value) throw new Error('Enter the password you were given.');
        const blob = await decryptBlob(new Blob([read.bytes as BlobPart]), pw.inp.value, (f, t) => prog.set(f, t)).catch((e) => { throw new Error(linkError(e)); }).finally(() => prog.done());
        out.value = await blob.text();
        clear(result).append(field('Message', out));
      }, { variant: 'primary', icon: 'LockOpen' })]), button('New message', () => { location.hash = '#/sharelink'; }, { icon: 'Plus' })),
    );
    return;
  }
  const msg = textarea({ rows: 6, placeholder: 'Secret message…' });
  const pw = passwordField('Password (tell it to the recipient separately)'), pw2 = passwordField('Repeat password', 'Repeat password');
  const link = outputBox({ rows: 4, mono: true });
  const result = h('div', { class: 'stack' });
  root.append(
    card(null, stack(field('Message', msg), pw.el, pw2.el, prog)),
    result,
    actions(button('Create link', async () => {
      if (!msg.value.trim()) throw new Error('Write a message first.');
      if (pw.inp.value.length < 6) throw new Error('Use a password of at least 6 characters.');
      if (pw.inp.value !== pw2.inp.value) throw new Error('The passwords do not match — the recipient could never open the message.');
      const blob = await encryptBlob(new Blob([msg.value]), pw.inp.value, STRENGTH.interactive, (f, t) => prog.set(f, t)).finally(() => prog.done());
      const url = `${location.origin}${location.pathname}#/sharelink?d=${toB64(new Uint8Array(await blob.arrayBuffer()), true)}`;
      link.value = url;
      clear(result).append(field('Share this link', link),
        ...(url.length <= LINK_WARN ? [] : [note(`This link is ${url.length.toLocaleString('en-IN')} characters long. Some apps cut links beyond about ${LINK_WARN.toLocaleString('en-IN')} characters, and a cut link cannot be opened — for a long text use Sodium Encrypt and send the file.`, 'warn')]),
        row(button('Copy link', () => copy(url), { variant: 'primary', icon: 'Copy' }),
          'share' in navigator ? button('Share', () => navigator.share({ url }).catch(() => {}), { icon: 'Share2' }) : null));
    }, { variant: 'primary', icon: 'Link' })),
    note('The encrypted message lives entirely in the link (after the #), which browsers never send to any server. Without the password it cannot be read.'),
  );
};

// ------------------------------------------------------------------ Hash
export const hash: Mount = (root) => {
  const chosen = new Set<HashAlg>(['SHA-256', 'SHA-512', 'MD5', 'SHA-1']);
  let kind: 'file' | 'text' = 'file';
  let files: File[] = [];
  const prog = progress();
  const algRow = h('div', { class: 'chips-select' }, HASH_ALGS.map((a) => {
    const t = toggle(a, chosen.has(a), (v) => (v ? chosen.add(a) : chosen.delete(a)));
    return t;
  }));
  const expected = input({ placeholder: 'Paste the expected checksum to verify (optional)', attrs: { spellcheck: 'false' } });
  const text = textarea({ rows: 4, placeholder: 'Text to hash (UTF-8)…' });
  const list = h('div', { class: 'muted small' });
  const picker = filePicker({ multiple: true, label: 'Choose files', hint: 'Large files are fine — hashed in chunks', onFiles: (fs) => { files = fs; list.textContent = fs.map((f) => `${f.name} (${fmtBytes(f.size)})`).join(', '); } });
  const inputArea = h('div');
  const results = h('div', { class: 'stack' });
  const render = () => clear(inputArea).append(kind === 'file' ? stack(picker, list) : text);

  const show = (name: string, r: Record<string, string>) => {
    const exp = expected.value.trim().toLowerCase().replace(/\s+/g, '');
    const rows = Object.entries(r).map(([a, v]) => {
      const match = exp && v === exp;
      return h('tr', { class: match ? 'match' : '' }, h('th', null, a), h('td', { class: 'mono hashval' }, v),
        h('td', null, button('', () => copy(v), { icon: 'Copy', small: true, variant: 'ghost', title: 'Copy' })));
    });
    const matched = exp && Object.values(r).includes(exp);
    results.append(card(name,
      exp ? note(matched ? 'Checksum matches ✓' : 'No algorithm matches the expected checksum ✗', matched ? 'ok' : 'err') : null,
      h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('tbody', null, rows)))));
  };

  root.append(
    card(null, stack(segmented([['file', 'Files'], ['text', 'Text']], kind, (v) => { kind = v; render(); }), inputArea,
      field('Algorithms', algRow), expected, prog)),
    results,
    actions(button('Compute', async () => {
      const algs = HASH_ALGS.filter((a) => chosen.has(a));
      if (!algs.length) throw new Error('Pick at least one algorithm.');
      clear(results);
      if (kind === 'text') show('Text', await hashBlob(new Blob([text.value]), algs));
      else {
        if (!files.length) throw new Error('Choose a file first.');
        const all: Array<Record<string, string>> = [];
        for (const f of files) { const r = await hashBlob(f, algs, (p, t) => prog.set(p, `${f.name}: ${t}`)); all.push(r); show(`${f.name} · ${fmtBytes(f.size)}`, r); }
        if (files.length === 2) { // same size and every chosen digest equal
          const same = files[0].size === files[1].size && algs.every((a) => all[0][a] === all[1][a]);
          results.prepend(note(same ? 'The two files are identical.' : 'The two files differ.', same ? 'ok' : 'warn'));
        }
      }
      prog.done();
    }, { variant: 'primary', icon: 'Fingerprint' })),
    note('MD5 and SHA-1 are broken for security purposes — use them only to check old published checksums.', 'warn'),
  );
  render();
};

// ------------------------------------------------------------------ Password generator
const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~' };
const AMBIG = /[Il1O0o|`'"]/g;

function strengthLabel(bits: number) {
  return bits < 40 ? ['Weak', 'err'] : bits < 64 ? ['Fair', 'warn'] : bits < 90 ? ['Strong', 'ok'] : ['Very strong', 'ok'];
}

export const password: Mount = async (root) => {
  const na = await sodium();
  const opts = { upper: true, lower: true, digits: true, symbols: true, ambiguous: false, len: 20, count: 5 };
  const list = h('div', { class: 'stack' });
  const meter = h('div');
  const gen = () => {
    const sets = (Object.keys(SETS) as Array<keyof typeof SETS>).filter((k) => opts[k]).map((k) => (opts.ambiguous ? SETS[k].replace(AMBIG, '') : SETS[k]));
    if (!sets.length) { clear(list).append(note('Pick at least one character set.', 'warn')); return; }
    const all = sets.join('');
    const bits = opts.len * Math.log2(all.length);
    const [lab, kind] = strengthLabel(bits);
    clear(meter).append(h('div', { class: `pill pill-${kind}` }, `${lab} · ~${Math.round(bits)} bits of entropy`));
    clear(list).append(...Array.from({ length: opts.count }, () => {
      let pw = '';
      for (;;) {
        const chars = Array.from({ length: opts.len }, () => all[na.uniform(all.length)]);
        // require at least one char from each chosen set (when long enough)
        if (opts.len < sets.length || sets.every((s) => chars.some((c) => s.includes(c)))) { pw = chars.join(''); break; }
      }
      return h('div', { class: 'pwrow' }, h('code', { class: 'pw' }, pw), button('', () => copy(pw), { icon: 'Copy', small: true, title: 'Copy' }));
    }));
  };
  root.append(
    card(null, stack(
      slider({ label: 'Length', min: 6, max: 128, value: opts.len, onInput: (v) => { opts.len = v; gen(); } }),
      h('div', { class: 'grid2' },
        toggle('Uppercase A–Z', opts.upper, (v) => { opts.upper = v; gen(); }),
        toggle('Lowercase a–z', opts.lower, (v) => { opts.lower = v; gen(); }),
        toggle('Digits 0–9', opts.digits, (v) => { opts.digits = v; gen(); }),
        toggle('Symbols !@#…', opts.symbols, (v) => { opts.symbols = v; gen(); }),
        toggle('Avoid look-alikes (I l 1 O 0)', opts.ambiguous, (v) => { opts.ambiguous = v; gen(); })),
      meter)),
    card('Passwords', list),
    actions(button('Generate again', gen, { variant: 'primary', icon: 'RefreshCw' })),
  );
  gen();
};

// ------------------------------------------------------------------ Passphrase generator
export const passphrase: Mount = async (root) => {
  const [na, words] = await Promise.all([
    sodium(),
    fetch(`${import.meta.env.BASE_URL}data/eff_large_wordlist.txt`).then((r) => r.text()).then((t) => t.split(/\s+/).filter(Boolean)),
  ]);
  const opts = { n: 6, sep: '-', cap: false, num: false, count: 5 };
  const list = h('div', { class: 'stack' });
  const meter = h('div');
  const gen = () => {
    const bits = opts.n * Math.log2(words.length) + (opts.num ? Math.log2(10) : 0);
    const [lab, kind] = strengthLabel(bits);
    clear(meter).append(h('div', { class: `pill pill-${kind}` }, `${lab} · ~${Math.round(bits)} bits of entropy`));
    clear(list).append(...Array.from({ length: opts.count }, () => {
      const ws = Array.from({ length: opts.n }, () => words[na.uniform(words.length)]).map((w) => (opts.cap ? w[0].toUpperCase() + w.slice(1) : w));
      if (opts.num) { const i = na.uniform(ws.length); ws[i] += String(na.uniform(10)); }
      const p = ws.join(opts.sep);
      return h('div', { class: 'pwrow' }, h('code', { class: 'pw' }, p), button('', () => copy(p), { icon: 'Copy', small: true, title: 'Copy' }));
    }));
  };
  root.append(
    card(null, stack(
      slider({ label: 'Words', min: 3, max: 12, value: opts.n, onInput: (v) => { opts.n = v; gen(); } }),
      field('Separator', segmented([['-', 'hyphen -'], [' ', 'space'], ['.', 'dot .'], ['_', 'underscore _'], ['', 'none']], opts.sep, (v) => { opts.sep = v; gen(); })),
      h('div', { class: 'grid2' },
        toggle('Capitalise words', opts.cap, (v) => { opts.cap = v; gen(); }),
        toggle('Add a digit', opts.num, (v) => { opts.num = v; gen(); })),
      meter)),
    card('Passphrases', list),
    actions(button('Generate again', gen, { variant: 'primary', icon: 'RefreshCw' })),
    note(h('span', null, 'Words from the EFF Large Wordlist (7,776 words, CC BY 3.0). Each word adds ~12.9 bits. Randomness: libsodium ', ic('Lock'), ' randombytes_uniform.')),
  );
  gen();
};
