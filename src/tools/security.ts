import {
  h, card, field, input, textarea, button, segmented, toggle, slider, filePicker, progress, note, actions, outputBox,
  downloadBlob, copy, toast, fmtBytes, stack, row, clear, ic, select, errMsg, type Mount,
} from '../ui';
import { encryptBlob, decryptBlob, STRENGTH, sodiumVersion } from '../lib/crypto-client';
import { textOf } from '../lib/textfile';
import { hashData, stopHashing, Stopped } from '../lib/hash-client';
import { HASHES, HASH_IDS, COMPARE_ALG, algo, type HashAlgo } from '../lib/hashes';
import { parseExpected, isChecksumListName, neededAlgs, verify, unmatchedEntries, fmtDigest, sumsText, sumsName, type DigestFormat, type Expected, type ExpectedList } from '../lib/checksums';
import { readEncryptedText, readShareLink, encryptedTextFile } from '../lib/sodium-format';
import { toB64 } from '../wasm/crypto';
import { libsodium } from '../wasm/libsodium';
import { readWordList, makePassphrase, phraseBits, MIN_WORDS, MAX_WORDS, type PhraseOptions } from '../lib/passphrases';
import { SETS as PW_SETS, MIN_LEN, MAX_LEN, alphabets, cleanSymbols, requiresEach, makePassword, entropyBits, strengthLabel as pwStrength, type PwOptions } from '../lib/passwords';
import { isMobile } from '../platform';
import './security.css';

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
interface HashItem { name: string | null; title: string; size: number; digests: Record<string, string> }
export const hash: Mount = (root) => {
  const chosen = new Set<string>(['SHA-256', 'SHA-512', 'MD5', 'SHA-1']);
  let kind: 'file' | 'text' = 'file';
  let files: File[] = [], lists: Array<{ name: string; list: ExpectedList }> = [];
  let fmt: DigestFormat = 'hex';
  let items: HashItem[] = [], shownAlgs: string[] = [], added: string[] = [], compareBy = '';
  let typed = false, timer = 0, run = 0;
  const prog = progress();
  const chip = (a: HashAlgo) => {
    const t = toggle(a.id, chosen.has(a.id), (v) => { (v ? chosen.add(a.id) : chosen.delete(a.id)); if (kind === 'text' && typed) later(); });
    t.title = a.about;
    return t;
  };
  const more = HASHES.filter((a) => a.group === 'more');
  const algRow = h('div', null,
    h('div', { class: 'chips-select' }, HASHES.filter((a) => a.group === 'main').map(chip)),
    h('details', { class: 'more-algs' }, h('summary', null, `More algorithms (${more.length})`), h('div', { class: 'chips-select' }, more.map(chip))));
  const expected = textarea({ rows: 2, placeholder: 'Expected checksum (optional) — one, or a whole list: SHA256SUMS, .md5, .sfv, sha256sum output…' });
  expected.spellcheck = false; expected.setAttribute('aria-label', 'Expected checksum');
  const expNote = h('div');
  const text = textarea({ rows: 4, placeholder: 'Text to hash (UTF-8)…' });
  text.setAttribute('aria-label', 'Text to hash');
  const list = h('div', { class: 'muted small' });
  const picker = filePicker({ multiple: true, label: 'Choose files', hint: 'Large files are fine — read in pieces. A checksum list (SHA256SUMS, .sha256, .md5, .sfv) chosen with them is used to check them.', onFiles: async (fs) => {
    const ls: typeof lists = [], hs: File[] = [];
    for (const f of fs) {
      if (isChecksumListName(f.name) && f.size < 1 << 20) {
        // as Windows programs save it too: PowerShell 5.1's `> SHA256SUMS` writes UTF-16 (to-do #13)
        const l = parseExpected(textOf(new Uint8Array(await f.arrayBuffer()))?.text ?? '', f.name);
        if (l.entries.length) { ls.push({ name: f.name, list: l }); continue; }
      }
      hs.push(f);
    }
    files = hs; lists = ls; items = []; renderResults();
    clear(list).append(...hs.map((f) => h('div', null, `${f.name} (${fmtBytes(f.size)})`)),
      ...ls.map((l) => h('div', null, `${l.name} — read as the checksum list (${l.list.entries.length} checksum${l.list.entries.length === 1 ? '' : 's'}), not hashed`)));
    checkExpected();
  } });
  const inputArea = h('div');
  const results = h('div', { class: 'stack' });
  const stopBtn = button('Stop', () => stopHashing(), { icon: 'Square' });
  stopBtn.hidden = true;
  const render = () => clear(inputArea).append(kind === 'file' ? stack(picker, list) : text);

  /** Every expected checksum: the box and the checksum lists chosen with the files. */
  const expectedList = (): ExpectedList => {
    const box = parseExpected(expected.value);
    return { entries: [...box.entries, ...lists.flatMap((l) => l.list.entries)], unread: box.unread };
  };
  const checkExpected = () => {
    const v = expected.value.trim(), l = parseExpected(expected.value);
    clear(expNote);
    if (v && !l.entries.length) expNote.append(note('No checksum found in what was pasted — paste it as the download page shows it (hex digits, Base64, or a line of a checksum list).', 'err'));
    else if (l.unread.length) expNote.append(note(`${l.unread.length === 1 ? 'Line' : 'Lines'} ${l.unread.slice(0, 8).join(', ')}${l.unread.length > 8 ? ' …' : ''} could not be read as a checksum and ${l.unread.length === 1 ? 'is' : 'are'} left aside.`, 'warn'));
    if (items.length) renderResults();
  };
  expected.addEventListener('input', checkExpected);

  const verdictNote = (it: HashItem, l: ExpectedList) => {
    const v = verify(it.name, it.digests, l);
    if (!v) return null;
    const where = (e: Expected) => (lists.length || l.entries.length > 1 ? ` (line ${e.line}${e.name ? ` of the list, "${e.name}"` : ''})` : '');
    switch (v.kind) {
      case 'match': return note(`✓ Matches the expected ${v.alg} checksum${where(v.entry)}.`, 'ok');
      case 'unlisted': return note('This file is not in the checksum list.', 'warn');
      case 'nolength': return note(`The expected checksum has ${v.entry.hex.length} hex digits — no algorithm here gives a checksum of that length.`, 'err');
      case 'missing': return note(`The expected checksum is a ${v.alg} checksum${where(v.entry)} — press Compute to work it out.`, 'warn');
      case 'mismatch': return note(h('span', null,
        `✗ Does not match: the expected checksum${where(v.entry)} is not this ${it.name === null ? 'text' : 'file'}'s ${v.tried.join(' or ')}.`,
        v.others.length ? h('span', null, ` A checksum of ${v.entry.hex.length} hex digits can also be ${v.others.join(', ').replace(/, ([^,]*)$/, ' or $1')}. `,
          button(`Try ${v.others.length === 1 ? v.others[0] : 'those'} too`, () => { for (const a of v.others) chosen.add(a); syncChips(); return compute(); }, { small: true })) : null), 'err');
    }
  };
  const syncChips = () => { for (const t of algRow.querySelectorAll<HTMLLabelElement>('label.switch')) { const cb = t.querySelector('input')!; cb.checked = chosen.has(t.textContent!.trim()); } };

  function renderResults() {
    clear(results);
    if (!items.length) return;
    const l = expectedList();
    if (added.length) results.append(note(`${added.join(', ')} ${added.length === 1 ? 'was' : 'were'} worked out as well, for the expected checksum.`));
    // a checksum list: how the chosen files fare, and what it lists that was not chosen
    if (kind === 'file' && l.entries.some((e) => e.name !== undefined)) {
      const vs = items.map((it) => verify(it.name, it.digests, l));
      const ok = vs.filter((v) => v?.kind === 'match').length, bad = items.filter((_, k) => vs[k]?.kind === 'mismatch').map((it) => it.name);
      const missing = unmatchedEntries(items.map((it) => it.name!), l).map((e) => e.name!.replace(/^.*[\\/]/, ''));
      results.append(note([`Checksum list: ${ok} of ${items.length} file${items.length === 1 ? '' : 's'} match${items.length === 1 ? 'es' : ''}`,
        bad.length ? `${bad.length} ${bad.length === 1 ? 'does' : 'do'} not (${bad.join(', ')})` : '',
        missing.length ? `${missing.length} listed file${missing.length === 1 ? ' was' : 's were'} not chosen (${[...new Set(missing)].slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''})` : ''].filter(Boolean).join('; ') + '.',
        bad.length ? 'err' : ok === items.length ? 'ok' : 'warn'));
    }
    // two or more files: which are the same
    if (items.length >= 2) {
      const groups = new Map<string, HashItem[]>();
      for (const it of items) { const k = `${it.size}:${it.digests[compareBy]}`; groups.set(k, [...(groups.get(k) ?? []), it]); }
      const same = [...groups.values()].filter((g) => g.length > 1);
      const by = ` (compared by size and ${compareBy})`;
      results.append(items.length === 2
        ? note(same.length ? `The two files are identical${by}.` : `The two files differ${by}.`, same.length ? 'ok' : 'warn')
        : same.length === 1 && same[0].length === items.length ? note(`All ${items.length} files are identical${by}.`, 'ok')
          : note(same.length ? `Identical${by}: ${same.map((g) => g.map((it) => it.name).join(' = ')).join('; ')}. The others differ.` : `No two of the files are the same${by}.`, same.length ? 'ok' : 'warn'));
    }
    for (const it of items) {
      const v = verify(it.name, it.digests, l), hit = v?.kind === 'match' ? v.alg : '';
      const rows = shownAlgs.filter((a) => a in it.digests).map((a) => {
        const val = fmtDigest(it.digests[a], fmt);
        return h('tr', { class: a === hit ? 'match' : '' }, h('th', { title: algo(a)!.about }, a), h('td', { class: 'mono hashval' }, val),
          h('td', null, button('', () => copy(val), { icon: 'Copy', small: true, variant: 'ghost', title: `Copy ${a}` })));
      });
      results.append(card(it.title, verdictNote(it, l), h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('tbody', null, rows)))));
    }
    // a checksum list of the files, as sha256sum (b2sum, b3sum, xxhsum) writes it
    if (kind === 'file') {
      let alg = shownAlgs.includes('SHA-256') ? 'SHA-256' : shownAlgs[0];
      const out = outputBox({ rows: Math.min(6, items.length + 1), mono: true });
      const name = h('span');
      const fill = () => { out.value = sumsText(alg, items.map((it) => ({ name: it.name!, hex: it.digests[alg] }))); name.textContent = sumsName(alg); };
      fill();
      results.append(card('Checksum list',
        field('Algorithm', select(shownAlgs.map((a) => [a, a] as [string, string]), alg, (v) => { alg = v; fill(); })),
        out,
        row(button('Download', () => downloadBlob(new Blob([out.value], { type: 'application/octet-stream' }), sumsName(alg)) /* text/plain would make Chrome add .txt */, { icon: 'Download' }), h('span', { class: 'muted small' }, name, alg === 'CRC-32' ? '' : ' — sha256sum -c (b2sum, b3sum, xxhsum -c) checks the files against it'))));
    }
  }

  async function compute() {
    const want = HASH_IDS.filter((a) => chosen.has(a));
    if (!want.length) throw new Error('Pick at least one algorithm.');
    const its: Array<{ name: string | null; title: string; data: Blob }> = kind === 'text'
      ? [{ name: null, title: 'Text', data: new Blob([text.value]) }]
      : files.map((f) => ({ name: f.name, title: `${f.name} · ${fmtBytes(f.size)}`, data: f as Blob }));
    if (!its.length) throw new Error(lists.length ? 'Choose the files to check as well — the checksum list alone holds nothing to hash.' : 'Choose a file first.');
    const l = expectedList();
    const need = neededAlgs(want, its.map((it) => it.name), l);
    const algs = [...want, ...need];
    // two files are compared by a secure hash even when only weak ones were chosen
    const secure = algs.find((a) => !algo(a)!.weak);
    const cmp = its.length >= 2 && !secure ? COMPARE_ALG : '';
    const me = ++run, total = its.reduce((n, it) => n + it.data.size, 0);
    const out: HashItem[] = [];
    let before = 0;
    stopBtn.hidden = kind === 'text';
    try {
      for (const [k, it] of its.entries()) {
        const digests = await hashData(it.data, cmp ? [...algs, cmp] : algs, (done, ms) => {
          if (me !== run) return;
          const rate = ms > 300 ? ` · ${fmtBytes(done / (ms / 1000))}/s` : '';
          prog.set(total ? (before + done) / total : 1, `${its.length > 1 ? `File ${k + 1} of ${its.length}: ` : ''}${it.name ?? 'text'} — ${fmtBytes(done)} of ${fmtBytes(it.data.size)}${rate}`);
        });
        before += it.data.size;
        out.push({ name: it.name, title: kind === 'text' ? `Text · ${fmtBytes(it.data.size)}` : it.title, size: it.data.size, digests });
      }
    } catch (e) {
      if (e instanceof Stopped) { toast('Stopped.'); return; }
      throw e;
    } finally { if (me === run) { prog.done(); stopBtn.hidden = true; } }
    if (me !== run) return;
    items = out; shownAlgs = algs; added = need; compareBy = cmp || secure || algs[0];
    renderResults();
  }
  const later = () => { clearTimeout(timer); timer = window.setTimeout(() => compute().catch((e) => toast(errMsg(e), 'err')), 250); };
  text.addEventListener('input', () => { typed = true; later(); });

  root.append(
    card(null, stack(segmented([['file', 'Files'], ['text', 'Text']], kind, (v) => { kind = v; items = []; run++; prog.done(); renderResults(); render(); }), inputArea,
      field('Algorithms', algRow), field('Expected checksum', stack(expected, expNote)),
      field('Show as', segmented([['hex', 'hex'], ['HEX', 'HEX'], ['base64', 'Base64']], fmt, (v) => { fmt = v as DigestFormat; renderResults(); })), prog)),
    actions(button('Compute', compute, { variant: 'primary', icon: 'Fingerprint' }), stopBtn),
    results,
    note('MD5 and SHA-1 are broken for security purposes, and CRC, Adler and xxHash are checksums, not secure hashes — use them only to check published checksums or to find accidental damage.', 'warn'),
  );
  render();
};

// ------------------------------------------------------------------ Password generator
export const password: Mount = async (root) => {
  const na = await libsodium();
  const o: PwOptions = { len: 20, upper: true, lower: true, digits: true, symbols: true, symbolSet: PW_SETS.symbols, avoidLookalikes: false };
  const count = 5;
  const list = h('div', { class: 'stack' });
  const meter = h('div');
  const symNote = h('div', { class: 'muted small' });
  const gen = () => {
    const sets = alphabets(o);
    if (!sets.length) {
      clear(meter); clear(list).append(note(o.symbols && !cleanSymbols(o.symbolSet).set && !o.upper && !o.lower && !o.digits ? 'The symbols box holds no symbol — type some, or pick another set.' : 'Pick at least one character set.', 'warn'));
      return;
    }
    const bits = entropyBits(o);
    const [lab, kind] = pwStrength(bits);
    const size = sets.reduce((n, s) => n + s.length, 0);
    clear(meter).append(h('div', { class: `pill pill-${kind}` }, `${lab} · ~${Math.round(bits)} bits of entropy`),
      h('div', { class: 'muted small' }, `${size} characters to choose from${requiresEach(o, sets) ? `, at least one of each of the ${sets.length} sets` : ''}.`));
    clear(list).append(...Array.from({ length: count }, (_, k) => {
      const pw = makePassword(o, na.uniform);
      return h('div', { class: 'pwrow' }, h('code', { class: 'pw' }, pw), button('', () => copy(pw), { icon: 'Copy', small: true, title: `Copy password ${k + 1}` }));
    }));
  };
  const lenSlider = slider({ label: 'Length', min: MIN_LEN, max: MAX_LEN, value: o.len, onInput: (v) => { o.len = v; lenBox.value = String(v); gen(); } });
  const lenBox = input({ type: 'number', value: String(o.len), attrs: { min: String(MIN_LEN), max: String(MAX_LEN), inputmode: 'numeric', 'aria-label': 'Length (characters)' } });
  lenBox.classList.add('pw-len'); lenBox.inputMode = 'numeric';
  lenBox.addEventListener('input', () => {
    const v = Math.round(Number(lenBox.value));
    if (!Number.isFinite(v) || v < MIN_LEN || v > MAX_LEN) return; // finished on change
    o.len = v; lenSlider.value = v; gen();
  });
  lenBox.addEventListener('change', () => {
    const v = Math.min(MAX_LEN, Math.max(MIN_LEN, Math.round(Number(lenBox.value)) || o.len));
    lenBox.value = String(v); o.len = v; lenSlider.value = v; gen();
  });
  const symBox = input({ value: o.symbolSet, attrs: { 'aria-label': 'Symbols to use', spellcheck: 'false', autocomplete: 'off' } });
  symBox.addEventListener('input', () => {
    o.symbolSet = symBox.value;
    const { dropped } = cleanSymbols(symBox.value);
    symNote.textContent = dropped ? `Left out (not a symbol): ${[...dropped].map((c) => (c === ' ' ? 'space' : c)).join(' ')}` : '';
    gen();
  });
  const symField = field('Symbols to use (some sites allow only some)', stack(row(symBox, button('Reset', () => { symBox.value = PW_SETS.symbols; symBox.dispatchEvent(new Event('input')); }, { small: true })), symNote));
  symField.hidden = !o.symbols;
  root.append(
    card(null, stack(
      h('div', { class: 'pw-length' }, lenSlider, lenBox),
      h('div', { class: 'grid2' },
        toggle('Uppercase A–Z', o.upper, (v) => { o.upper = v; gen(); }),
        toggle('Lowercase a–z', o.lower, (v) => { o.lower = v; gen(); }),
        toggle('Digits 0–9', o.digits, (v) => { o.digits = v; gen(); }),
        toggle('Symbols !@#…', o.symbols, (v) => { o.symbols = v; symField.hidden = !v; gen(); }),
        toggle('Avoid look-alikes (I l 1 | O 0 o)', o.avoidLookalikes, (v) => { o.avoidLookalikes = v; gen(); })),
      symField,
      meter)),
    card('Passwords', list),
    actions(button('Generate again', gen, { variant: 'primary', icon: 'RefreshCw' })),
    note(h('span', null, 'Made on this device from the browser\'s cryptographic random generator (libsodium ', ic('Lock'), ' randombytes_uniform); nothing is sent or kept. Entropy = log2 of the number of passwords these settings allow, each equally likely.')),
  );
  gen();
};

// ------------------------------------------------------------------ Passphrase generator
export const passphrase: Mount = async (root) => {
  const [na, words] = await Promise.all([
    libsodium(),
    fetch(`${import.meta.env.BASE_URL}data/eff_large_wordlist.txt`).then((r) => {
      if (!r.ok) throw new Error(`The word list could not be loaded (${r.status}). Reload the page and try again.`);
      return r.text();
    }).then(readWordList),
  ]);
  const o: PhraseOptions = { words: 6, sep: '-', capitalise: false, digit: false };
  const count = 5;
  const list = h('div', { class: 'stack' });
  const meter = h('div');
  const gen = () => {
    const bits = phraseBits(o);
    const [lab, kind] = pwStrength(bits);
    clear(meter).append(h('div', { class: `pill pill-${kind}` }, `${lab} · ~${Math.round(bits)} bits of entropy`));
    clear(list).append(...Array.from({ length: count }, (_, k) => {
      const p = makePassphrase(words, o, na.uniform);
      return h('div', { class: 'pwrow' }, h('code', { class: 'pw' }, p), button('', () => copy(p), { icon: 'Copy', small: true, title: `Copy passphrase ${k + 1}` }));
    }));
  };
  root.append(
    card(null, stack(
      slider({ label: 'Words', min: MIN_WORDS, max: MAX_WORDS, value: o.words, onInput: (v) => { o.words = v; gen(); } }),
      field('Separator', segmented([['-', 'hyphen -'], [' ', 'space'], ['.', 'dot .'], ['_', 'underscore _'], ['', 'none']], o.sep, (v) => { o.sep = v; gen(); })),
      h('div', { class: 'grid2' },
        toggle('Capitalise words', o.capitalise, (v) => { o.capitalise = v; gen(); }),
        toggle('Add a digit', o.digit, (v) => { o.digit = v; gen(); })),
      meter)),
    card('Passphrases', list),
    actions(button('Generate again', gen, { variant: 'primary', icon: 'RefreshCw' })),
    note(h('span', null, 'Words from the EFF Large Wordlist (7,776 words, CC BY 3.0) — each adds ~12.9 bits; a digit after a random word adds log2(10 × words). Made on this device with libsodium ', ic('Lock'), ' randombytes_uniform; nothing is sent or kept.')),
  );
  gen();
};
