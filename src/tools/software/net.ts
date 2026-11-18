// Software › network & security tabs. Parsing and maths run in our Rust devcore.wasm (CIDR, X.509) — see wasm/devcore.
import { h, card, field, input, textarea, select, segmented, slider, outputBox, downloadBlob, clear, note, filePicker, readBytes, toggle, copy, button, type Mount } from '../../ui';
import { keys, toB64, type Keys } from '../../wasm/keys';
import { zxcvbn } from '../../wasm/zxcvbn';
import { devcore } from '../../wasm/devcore';
import { kvRows, show, table, debounce } from './devui';


// ------------------------------------------------------------------ Subnet / CIDR
export const cidr: Mount = async (root) => {
  const dc = await devcore('cidr');
  const inp = input({ value: '192.168.1.10/24', attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': 'Address' } });
  const split = select<string>([['', 'Don’t split']], '');
  const out = h('div');
  const run = () => show(out, () => {
    const v = inp.value.trim(); if (!v) return note('Enter an address, a CIDR block or a range.', 'info');
    let r = dc.json('cidr', { input: v });
    // keep the chosen split only while it still fits the new block (a /24 split makes no sense for an IPv6 /64)
    if (!r.range && split.value && +split.value > r.prefix && +split.value <= Math.min(r.version === 4 ? 32 : 128, r.prefix + 16)) r = dc.json('cidr', { input: v, split: +split.value });
    split.disabled = !!r.range; // a range is a list of blocks: there is nothing to split
    if (r.range) { split.replaceChildren(h('option', { value: '' }, 'Don’t split')); return [card(`Range ${r.start} – ${r.end}`, kvRows([['Addresses', BigInt(r.total).toLocaleString('en-IN')], ['CIDR blocks', String(r.blocks.length)]]), h('pre', { class: 'mono out-pre cidr-blocks' }, r.blocks.join('\n')))]; }
    const max = r.version === 4 ? 32 : 128, cur = split.value;
    const opts: Array<[string, string]> = [['', 'Don’t split']];
    for (let p = r.prefix + 1; p <= Math.min(max, r.prefix + 16); p++) opts.push([String(p), `/${p} (${(2n ** BigInt(p - r.prefix)).toLocaleString('en-IN')} subnets)`]);
    split.replaceChildren(...opts.map(([v2, l]) => h('option', { value: v2 }, l))); split.value = opts.some((o) => o[0] === cur) ? cur : '';
    const n = (s: string) => BigInt(s).toLocaleString('en-IN');
    const rows: Array<[string, string | null]> = r.version === 4 ? [
      ['Network', r.cidr], ['Netmask', `${r.netmask}  (/${r.prefix})`], ['Wildcard', r.wildcard], ['Broadcast', r.broadcast ?? '— (/31 and /32 have none)'],
      ['First usable', r.first], ['Last usable', r.last], ['Addresses', n(r.total)], ['Usable hosts', n(r.usable)], ['Type', r.kind], ['Class', r.class],
      ['Binary', r.binary], ['Mask (binary)', r.maskBinary], ['Hex', r.hex], ['Integer', r.integer], ['Reverse DNS', r.reverse], ['IPv4-mapped IPv6', r.mapped6]]
      : [['Network', r.cidr], ['Prefix', `/${r.prefix}`], ['First address', r.first], ['Last address', r.last], ['Addresses', n(r.total)], ['Type', r.kind], ['Expanded', r.expanded], ['Compressed', r.address], ['Embedded IPv4', r.v4], ['Reverse DNS', r.reverse]];
    const res: Node[] = [card(`${r.address}${r.isNetwork ? '' : ` is in ${r.cidr}`}`, kvRows(rows))];
    if (r.subnets) res.push(card(`${n(r.subnets.count)} subnets of /${split.value}${r.subnets.shown < +r.subnets.count ? ` (first ${r.subnets.shown} shown)` : ''}`,
      table(r.version === 4 ? ['Subnet', 'First host', 'Last host', 'Broadcast', 'Hosts'] : ['Subnet', 'First', 'Last'], r.subnets.list.map((s: any) => r.version === 4 ? [s.cidr, s.first, s.last, s.broadcast ?? '—', n(s.hosts)] : [s.cidr, s.first, s.last]))));
    return res;
  });
  inp.addEventListener('input', debounce(run, 120)); split.addEventListener('change', run);
  root.append(card(null, field('IP address, CIDR, address + netmask (or wildcard mask), or a range (a - b)', inp), field('Split into subnets', split),
    h('div', { class: 'chips' }, ['10.0.0.0/8', '172.16.5.4 255.255.240.0', '192.168.0.0/24', '100.64.0.0/10', '2001:db8::/32', 'fe80::1ff:fe23:4567:890a/64', '192.168.1.10 - 192.168.1.20'].map((x) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => { inp.value = x; split.value = ''; run(); } }, x)))), out);
  run();
};

// ------------------------------------------------------------------ chmod
const CLASSES = [['u', 'Owner'], ['g', 'Group'], ['o', 'Others']] as const;
export function modeToSymbolic(m: number, type = '-') {
  const t = (bits: number, sp: boolean, ch: string) => `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${sp ? (bits & 1 ? ch : ch.toUpperCase()) : bits & 1 ? 'x' : '-'}`;
  return type + t((m >> 6) & 7, !!(m & 0o4000), 's') + t((m >> 3) & 7, !!(m & 0o2000), 's') + t(m & 7, !!(m & 0o1000), 't');
}
export function symbolicToMode(s: string): number | null {
  const x = s.trim(); const m = /^[-dlcbps]?([r-][w-][xsS-])([r-][w-][xsS-])([r-][w-][xtT-])$/.exec(x); if (!m) return null;
  let v = 0;
  [m[1], m[2], m[3]].forEach((g, i) => { const sh = 6 - 3 * i; if (g[0] === 'r') v |= 4 << sh; if (g[1] === 'w') v |= 2 << sh; if (/[xst]/.test(g[2])) v |= 1 << sh; if (/[sStT]/.test(g[2])) v |= [0o4000, 0o2000, 0o1000][i]; });
  return v;
}
/** Apply a chmod symbolic expression to a mode, as GNU chmod does: comma-separated clauses of who (u g o a; none = all —
 *  the real chmod then also applies the umask) followed by one or more operator + permissions pairs (u+x, go-w, a=r, u=rwx,go=rx,
 *  g=u copies another class, X = execute only for a directory or a file that already has an execute bit, s and t the special bits;
 *  "=" keeps a directory's setuid/setgid unless s is named). */
export function applySymbolic(mode: number, expr: string, isDir = false): number | null {
  let v = mode;
  if (!expr.trim()) return null;
  for (const part of expr.split(',')) {
    const m = /^([ugoa]*)((?:[-+=](?:[ugo]|[rwxXst]*))+)$/.exec(part.trim()); if (!m) return null;
    const who = m[1] ? [...new Set(m[1].replace(/a/g, 'ugo'))] : ['u', 'g', 'o'];
    for (const [, op, perms] of m[2].matchAll(/([-+=])([ugo]|[rwxXst]*)/g)) {
      const copy = /^[ugo]$/.test(perms) ? (v >> (perms === 'u' ? 6 : perms === 'g' ? 3 : 0)) & 7 : -1; // g=u: the other class's bits before this step
      const anyX = isDir || !!(v & 0o111);
      let next = v;
      for (const c of who) {
        const sh = c === 'u' ? 6 : c === 'g' ? 3 : 0, sp = c === 'u' ? 0o4000 : c === 'g' ? 0o2000 : 0o1000;
        let bits = 0, special = 0;
        if (copy >= 0) bits = copy;
        else for (const p of perms) { if (p === 'r') bits |= 4; if (p === 'w') bits |= 2; if (p === 'x' || (p === 'X' && anyX)) bits |= 1; if ((p === 's' && c !== 'o') || (p === 't' && c === 'o')) special |= sp; }
        if (op === '+') next |= (bits << sh) | special;
        else if (op === '-') next &= ~((bits << sh) | special);
        else { const keep = isDir && c !== 'o' && !perms.includes('s') ? sp : 0; next = (next & ~((7 << sh) | (sp & ~keep))) | (bits << sh) | special; }
      }
      v = next;
    }
  }
  return v & 0o7777;
}
export const chmod: Mount = (root) => {
  let mode = 0o755, dir = false; // dir: a folder — first letter d in ls -l, X and "=" behave differently (switch, or type d… in the Symbolic box)
  const boxes: HTMLInputElement[] = [];
  const grid = h('table', { class: 'tbl chmod-grid' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Read'), h('th', null, 'Write'), h('th', null, 'Execute'))),
    h('tbody', null, CLASSES.map(([c, label], i) => h('tr', null, h('th', null, label), [4, 2, 1].map((b) => { const cb = h('input', { type: 'checkbox', 'aria-label': `${label} ${b === 4 ? 'read' : b === 2 ? 'write' : 'execute'}`, onchange: () => { mode ^= b << (6 - 3 * i); sync(); } }); boxes.push(cb); return h('td', null, cb); })))));
  const specials = [[0o4000, 'setuid'], [0o2000, 'setgid'], [0o1000, 'sticky']].map(([bit, label]) => { const t = toggle(label as string, false, (on) => { mode = on ? mode | (bit as number) : mode & ~(bit as number); sync(); }); return [bit as number, t] as const; });
  const dirT = toggle('folder', false, (on) => { dir = on; sync(); });
  const oct = input({ attrs: { class: 'input mono', 'aria-label': 'Octal', inputmode: 'numeric' } }), sym = input({ attrs: { class: 'input mono', 'aria-label': 'Symbolic' } });
  const expr = input({ placeholder: 'e.g. u+x,go-w', attrs: { class: 'input mono', 'aria-label': 'Change' } });
  const out = h('div'), warn = h('div');
  const sync = (except?: HTMLElement) => {
    boxes.forEach((b, k) => { const i = Math.floor(k / 3), bit = [4, 2, 1][k % 3]; b.checked = !!(mode & (bit << (6 - 3 * i))); });
    specials.forEach(([bit, t]) => (t.checked = !!(mode & bit))); dirT.checked = dir;
    const type = dir ? 'd' : '-', name = dir ? 'folder' : 'file';
    const o = (mode & 0o7000 ? (mode >> 9).toString(8) : '') + (mode & 0o777).toString(8).padStart(3, '0');
    if (except !== oct) oct.value = o;
    if (except !== sym) sym.value = modeToSymbolic(mode, type);
    clear(out).append(kvRows([['Octal', o], ['Symbolic', modeToSymbolic(mode, type)], ['Command', `chmod ${o} ${name}`], ['Symbolic command', `chmod ${CLASSES.map(([c], i) => `${c}=${['', 'x', 'w', 'wx', 'r', 'rx', 'rw', 'rwx'][(mode >> (6 - 3 * i)) & 7]}${mode & [0o4000, 0o2000, 0o1000][i] ? 'st'[i >> 1] : ''}`).join(',')} ${name}`], // u=rwxs / g=rxs / o=rwxt: without them chmod would clear setuid, setgid, sticky
      ['Owner can', ['read', 'write', 'execute'].filter((_, k) => mode & ([4, 2, 1][k] << 6)).join(', ') || 'nothing'], ['Group can', ['read', 'write', 'execute'].filter((_, k) => mode & ([4, 2, 1][k] << 3)).join(', ') || 'nothing'], ['Others can', ['read', 'write', 'execute'].filter((_, k) => mode & [4, 2, 1][k]).join(', ') || 'nothing']]));
    clear(warn); if (mode & 0o002) warn.append(note('Everyone can write to this file (world-writable) — usually a security risk.', 'warn')); if (mode & 0o4000) warn.append(note('setuid: the program runs with the owner’s rights.', 'info'));
    if (dir && (mode & 0o6000) !== 0o6000) warn.append(note(`Folders: GNU chmod (Linux) keeps a folder’s setuid / setgid bits unless they are cleared on purpose — use chmod ${['u-s', 'g-s'].filter((_, i) => !(mode & [0o4000, 0o2000][i])).join(',')} folder, or a five-digit mode: chmod 0${o.padStart(4, '0')} folder.`, 'info'));
  };
  oct.addEventListener('input', () => { const v = oct.value.trim(); const ok = /^[0-7]{1,4}$/.test(v); oct.classList.toggle('bad', !ok); if (ok) { mode = parseInt(v, 8); sync(oct); } });
  sym.addEventListener('input', () => { const v = symbolicToMode(sym.value); sym.classList.toggle('bad', v === null); if (v !== null) { mode = v; const t = sym.value.trim(); if (t.length === 10) dir = t[0] === 'd'; sync(sym); } });
  const exprNote = h('div');
  const applyBtn = button('Apply', () => {
    const v = applySymbolic(mode, expr.value, dir); expr.classList.toggle('bad', v === null); clear(exprNote);
    if (v === null) throw new Error('Use who (u g o a) + operator (+ - =) + permissions (r w x X s t), e.g. u+x,go-w');
    mode = v; sync();
    if (expr.value.split(',').some((p) => /^\s*[-+=]/.test(p))) exprNote.append(note('No u, g, o or a before the operator: the real chmod then leaves out the bits of your umask (with the usual 022, “+w” gives write to the owner only). Shown here as if for all three.', 'info'));
  }, { small: true });
  expr.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyBtn.click(); });
  root.append(card(null, grid, h('div', { class: 'row' }, ...specials.map(([, t]) => t), dirT)), card(null, h('div', { class: 'grid2' }, field('Octal', oct), field('Symbolic (ls -l)', sym)), field('Change with chmod syntax', h('div', { class: 'row' }, expr, applyBtn)), exprNote),
    card('Result', out, warn), h('div', { class: 'chips' }, [['644', 'file', 0], ['755', 'program / folder', -1], ['600', 'private key', 0], ['700', 'private folder', 1], ['775', 'shared folder', 1], ['1777', '/tmp', 1], ['4755', 'setuid program', 0]].map(([m, l, d]) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => { mode = parseInt(m as string, 8); if (d !== -1) dir = !!d; sync(); } }, `${m} · ${l}`))));
  sync();
};

// ------------------------------------------------------------------ X.509 certificate decoder
export const x509: Mount = async (root) => {
  const ta = textarea({ rows: 8, mono: true, placeholder: '-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----' });
  const out = h('div');
  let dcP: ReturnType<typeof devcore> | null = null;
  const fmt = (s: number) => new Date(s * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
  const plural = (n: number, w: string) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;
  // minutes under an hour, hours under two days, days under two years, then years (was always whole days: "expires in 0 days")
  const span = (sec: number) => sec < 3600 ? plural(Math.max(1, Math.round(sec / 60)), 'minute') : sec < 172800 ? plural(Math.floor(sec / 3600), 'hour') : sec < 730 * 86400 ? plural(Math.floor(sec / 86400), 'day') : `${plural(Math.floor(sec / (365.2425 * 86400)), 'year')} (${plural(Math.floor(sec / 86400), 'day')})`;
  // a certificate file as text: UTF-8 (BOM dropped) or UTF-16 as Windows tools write it; '' when it is binary (DER)
  const fileText = (b: Uint8Array) => {
    const t = b[0] === 0xff && b[1] === 0xfe ? new TextDecoder('utf-16le').decode(b) : b[0] === 0xfe && b[1] === 0xff ? new TextDecoder('utf-16be').decode(b) : b.length > 20 && b[1] === 0 && b[3] === 0 ? new TextDecoder('utf-16le').decode(b) : new TextDecoder().decode(b);
    return t.includes('-----BEGIN') ? t : '';
  };
  const render = async (bytes: Uint8Array) => {
    if (!bytes.length) { clear(out).append(note('Paste a PEM certificate (or a chain, or a CSR) or choose a .pem / .crt / .cer / .der / .csr / .p7b file.', 'info')); return; } // engine loads with the first certificate
    const dc = await (dcP ||= devcore('x509'));
    show(out, () => {
      if (!bytes.length) return note('Paste a PEM certificate (or a chain, or a CSR) or choose a .pem / .crt / .cer / .der / .csr / .p7b file.', 'info');
      const r = dc.bytesJson('x509', bytes);
      return r.items.map((c: any, i: number) => {
        if (c.kind === 'other') return card(`Block ${i + 1}: ${c.label}`, c.private ? note('This is a private key. It is not decoded or shown here — keep it secret (nothing left this device).', 'warn') : note(`Not a certificate (${c.label}, ${c.size} bytes).`, 'info'));
        const k = `${c.key.type}${c.key.bits ? ` ${c.key.bits}-bit` : ''}${c.key.curve ? ` (${c.key.curve})` : ''}${c.key.exponent ? `, e = ${c.key.exponent}` : ''}`;
        if (c.kind === 'pubkey') return card(`${r.items.length > 1 ? `${i + 1}. ` : ''}Public key`, kvRows([['Public key', k], ['SHA-256 of the key (SPKI)', c.sha256], ['Pin (Base64, as in HPKP / pinning tools)', c.pin]]));
        if (c.kind === 'csr') return card(`Certificate request: ${c.cn || c.subject}`, kvRows([['Subject', c.subject], ['Public key', k], ['Signature', c.sigAlg], ['Requested names', c.sans.join(', ')], ['SHA-256', c.sha256]]));
        const now = Date.now() / 1000, left = c.notAfter - now;
        const status = now < c.notBefore ? note(`Not valid yet — starts ${fmt(c.notBefore)} (in ${span(c.notBefore - now)}).`, 'warn') : left < 0 ? note(`EXPIRED ${span(-left)} ago.`, 'err')
          : c.notAfter >= 253402300799 ? note('Valid — no expiry date (the certificate says 31 Dec 9999, which means “never”).', 'ok') : note(`Valid — expires in ${span(left)}.`, left < 30 * 86400 ? 'warn' : 'ok');
        return card(`${r.items.length > 1 ? `${i + 1}. ` : ''}${c.cn || c.subject}`, status, kvRows([
          ['Subject', c.subject], ['Issuer', c.selfSigned ? `${c.issuer} (self-signed)` : c.issuer], ['Valid from', fmt(c.notBefore)], ['Valid until', fmt(c.notAfter)],
          ['Names (SAN)', c.sans.join(', ')], ['Public key', k], ['Signature', c.sigAlg], ['Serial', c.serial], ['Version', `v${c.version}`], ['CA certificate', c.isCA ? 'yes' : 'no'],
          ['SHA-256 fingerprint', c.sha256], ['SHA-1 fingerprint', c.sha1]]),
          h('details', null, h('summary', null, `Extensions (${Object.keys(c.extensions).length})`), kvRows(Object.entries(c.extensions) as any)));
      });
    });
  };
  const fromText = () => render(new TextEncoder().encode(ta.value.trim()));
  const typed = debounce(fromText, 150);
  ta.addEventListener('input', typed);
  root.append(card(null, field('Certificate (PEM)', ta), filePicker({ accept: '.pem,.crt,.cer,.der,.csr,.p7b,.p7c,.pub,.txt', label: 'Choose a certificate file', onFiles: async ([f]) => { typed.cancel(); const b = await readBytes(f); ta.value = fileText(b); if (!b.length) { clear(out).append(note(`${f.name} is empty.`, 'warn')); return; } await render(b); } })), out,
    note('Decoded on this device; nothing is checked online (no revocation or chain-of-trust check).', 'info'));
  fromText();
};

// ------------------------------------------------------------------ shared: password box with show/hide
function secretInput(label: string, value = '', autocomplete = 'off', onToggle?: (shown: boolean) => void) {
  const inp = input({ type: 'password', value, attrs: { class: 'input mono', 'aria-label': label, autocomplete, spellcheck: 'false' } });
  const eye = button('', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; eye.setLabel(inp.type === 'password' ? 'Show' : 'Hide'); onToggle?.(inp.type !== 'password'); }, { small: true, icon: 'Eye', title: 'Show' });
  eye.setAttribute('aria-label', 'Show');
  return Object.assign(h('div', { class: 'row pw-row' }, inp, eye), { input: inp });
}
const toBytes = (s: string, how: string): Uint8Array => {
  if (how === 'hex') { const t = s.replace(/[\s:]/g, '').replace(/^0x/i, ''); if (!/^([0-9a-f]{2})*$/i.test(t)) throw new Error('Hex key needs pairs of hex digits (0–9, a–f)'); return Uint8Array.from(t.match(/../g) || [], (x) => parseInt(x, 16)); }
  if (how === 'base64') {
    const t = s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (!/^[A-Za-z0-9+/]*$/.test(t) || t.length % 4 === 1) throw new Error('Not valid Base64');
    return Uint8Array.from(atob(t.padEnd(Math.ceil(t.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  }
  return new TextEncoder().encode(s);
};

// ------------------------------------------------------------------ HMAC
/** Does a pasted signature equal this HMAC? Reads what webhook senders put in their headers: plain hex (any case, with
 *  colons, spaces or 0x), Base64 / Base64url with or without padding, a "sha256=" / "v1=" / "hmac-sha256=" label, quotes,
 *  and Stripe's "t=…,v1=…,v0=…" list (any of its values may match). */
export function sigMatches(pasted: string, r: { hex: string; base64: string; base64url: string }): boolean {
  const strip = (x: string) => x.replace(/=+$/, '');
  return pasted.split(/[,;\s]+/).some((part) => {
    const e = part.trim().replace(/^["']+|["']+$/g, '').replace(/^[a-z][a-z0-9_-]{0,15}=(?=[^=])/i, '').replace(/^["']+|["']+$/g, '');
    if (!e) return false;
    const hx = e.replace(/^0x/i, '').replace(/:/g, '').toLowerCase();
    return hx === r.hex || strip(e) === strip(r.base64) || strip(e) === r.base64url;
  }) || pasted.replace(/[\s:]/g, '').replace(/^0x/i, '').toLowerCase() === r.hex; // hex typed in groups: "ab cd ef …"
}
export const hmac: Mount = (root) => {
  let alg = 'sha256', keyFmt = 'text', lib: Promise<typeof import('../../lib/hmac')> | null = null, runId = 0;
  const key = secretInput('Secret key', 'my-webhook-secret'), msg = textarea({ rows: 6, mono: true, value: '{"event":"payment.captured","amount":49900}' });
  const out = h('div'), expect = input({ placeholder: 'Paste a signature to compare (hex or Base64; "sha256=" prefix allowed)', attrs: { class: 'input mono', 'aria-label': 'Expected signature' } });
  let file: File | null = null;
  const CHUNK = 4 << 20;
  const run = async () => {
    const id = ++runId;
    let r: { hex: string; base64: string; base64url: string; bytes: number };
    try {
      const m = await (await (lib ||= import('../../lib/hmac'))).mac(alg, toBytes(key.input.value, keyFmt)); // hash-wasm, loaded with the tab's first signature
      if (id !== runId) return;
      if (file) { // streamed in 4 MB pieces: a large file neither freezes the page nor has to fit in memory twice
        const f = file;
        for (let o = 0; o < f.size; o += CHUNK) {
          const part = new Uint8Array(await f.slice(o, o + CHUNK).arrayBuffer());
          if (id !== runId) return; // a newer run (other key, other file) has taken over
          m.update(part);
          if (f.size > 8 * CHUNK) clear(out).append(note(`Signing ${f.name}… ${Math.round((100 * Math.min(o + CHUNK, f.size)) / f.size)} %`, 'info'));
        }
      } else m.update(new TextEncoder().encode(msg.value));
      r = m.end();
    } catch (e: any) { if (id === runId) clear(out).append(note(e?.name === 'NotReadableError' || e?.name === 'NotFoundError' ? 'The file can no longer be read (moved or changed?) — choose it again.' : e?.message || String(e), 'warn')); return; }
    show(out, () => {
      const match = expect.value.trim() ? sigMatches(expect.value, r) : null;
      return [kvRows([['Hex', r.hex], ['Base64', r.base64], ['Base64url', r.base64url], ['Length', `${r.bytes} bytes`]]), match === null ? '' : note(match ? 'Signature matches ✓' : 'Signature does NOT match', match ? 'ok' : 'err')];
    });
  };
  const runD = debounce(run, 120);
  [key.input, expect].forEach((x) => x.addEventListener('input', runD)); msg.addEventListener('input', () => { file = null; runD(); });
  root.append(card(null, field('Algorithm', select([['sha256', 'HMAC-SHA256'], ['sha512', 'HMAC-SHA512'], ['sha384', 'HMAC-SHA384'], ['sha224', 'HMAC-SHA224'], ['sha1', 'HMAC-SHA1 (legacy)'], ['md5', 'HMAC-MD5 (legacy)'], ['sha3-256', 'HMAC-SHA3-256'], ['sha3-512', 'HMAC-SHA3-512']], alg, (v) => { alg = v; run(); })),
    field('Secret key', key), segmented([['text', 'Key is text'], ['hex', 'Hex'], ['base64', 'Base64']], keyFmt, (v) => { keyFmt = v; run(); })),
    card('Message', msg, filePicker({ label: 'Sign a file instead', onFiles: ([f]) => { file = f; msg.value = `(file: ${f.name}, ${f.size.toLocaleString('en-IN')} bytes)`; return run(); } })),
    card('Signature', out, field('Compare with', expect)), note('Webhook senders (Stripe, GitHub, Razorpay …) sign the exact raw body: copy it byte for byte, without reformatting the JSON. Text typed or pasted here always has Unix line ends (LF); for a body with Windows line ends (CRLF) save it to a file and sign the file.', 'info'));
  run();
  return () => { runId++; };
};

// ------------------------------------------------------------------ TOTP / 2FA
export function parseOtpauth(uri: string) {
  const text = uri.trim();
  if (/^otpauth-migration:/i.test(text)) throw new Error('This is a Google Authenticator export link (otpauth-migration://): it packs several accounts together and is not read here. In the app, show the QR code of one account instead.');
  let u: URL; try { u = new URL(text); } catch { throw new Error('Not an otpauth:// link'); }
  if (u.protocol !== 'otpauth:') throw new Error('Not an otpauth:// link');
  const type = u.host.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') throw new Error(`Unknown otpauth type "${u.host}" (expected otpauth://totp/… or otpauth://hotp/…)`);
  const q = new Map([...u.searchParams].map(([k, v]) => [k.toLowerCase(), v] as const)); // SECRET= / Secret= are accepted too
  let label = u.pathname.replace(/^\/+/, ''); try { label = decodeURIComponent(label); } catch { /* keep as written */ }
  if (!q.get('secret')) throw new Error('The link has no secret= part');
  const whole = (name: string, def: number, min: number, max: number) => {
    const raw = q.get(name); if (raw == null || raw === '') return def;
    const n = Number(raw); if (!/^\d+$/.test(raw.trim()) || n < min || n > max) throw new Error(`The link has ${name}=${raw} — expected a whole number from ${min} to ${max.toLocaleString('en-IN')}`);
    return n;
  };
  return { type, label, secret: q.get('secret') || '', issuer: q.get('issuer') || label.split(':')[0], alg: (q.get('algorithm') || 'SHA1').toLowerCase().replace(/^hmac-?/, '').replace(/^sha-/, 'sha'),
    digits: whole('digits', 6, 6, 10), period: whole('period', 30, 1, 86400), counter: whole('counter', 0, 0, Number.MAX_SAFE_INTEGER) };
}
export const totp: Mount = (root) => {
  let kp: Promise<Keys> | null = null, otp: Promise<typeof import('../../lib/totp')> | null = null, ticks = 0, alg = 'sha1', digits = 6, period = 30, timer: any = 0, counter: number | null = null, linkBad = false; // counter: set by an otpauth://hotp link; linkBad: the link box holds a link that could not be read
  const sec = secretInput('Secret (Base32)', ''), uri = input({ placeholder: 'otpauth://totp/Example:me@example.com?secret=…&issuer=Example', attrs: { class: 'input mono', 'aria-label': 'otpauth link' } });
  const code = h('div', { class: 'otp-code mono' }, '— — —'), bar = h('div', { class: 'meter' }, h('span')), side = h('div', { class: 'muted center' }), info = h('div'), linkInfo = h('div');
  const algSel = select([['sha1', 'SHA-1 (most apps)'], ['sha256', 'SHA-256'], ['sha512', 'SHA-512']], alg, (v) => { alg = v; tick(); });
  const digSel = select([['6', '6 digits'], ['7', '7 digits'], ['8', '8 digits'], ['9', '9 digits'], ['10', '10 digits']], '6', (v) => { digits = +v; tick(); });
  const perSel = select([['15', '15 seconds'], ['30', '30 seconds'], ['60', '60 seconds'], ['90', '90 seconds']], '30', (v) => { period = +v; tick(); });
  const setSel = (sel: HTMLSelectElement, v: string, label: string) => { if (![...sel.options].some((o) => o.value === v)) sel.append(h('option', { value: v }, label)); sel.value = v; }; // a link may carry a value the list does not have
  const nextBtn = button('Next code (counter + 1)', () => { if (counter !== null) { counter++; tick(); } }, { small: true });
  nextBtn.hidden = true;
  const tick = async () => {
    const id = ++ticks;
    code.setAttribute('aria-busy', 'true');   // the code on screen may be the previous one until this tick has answered
    try {
      const k = await (kp ||= keys());
      if (id !== ticks) return;
      clear(info);
      if (linkBad) { code.textContent = '— — —'; side.textContent = ''; nextBtn.hidden = true; return; } // never a code from the previous link under a link that failed
      if (!sec.input.value.trim()) { code.textContent = '— — —'; side.textContent = 'Enter a secret or paste an otpauth:// link'; return; }
      try {
        nextBtn.hidden = counter === null; bar.hidden = counter !== null;
        const lib = await (otp ||= import('../../lib/totp'));   // hash-wasm's HMAC + our Base32 / truncation
        if (counter !== null) { // counter-based (HOTP, RFC 4226): the code belongs to a counter, not to the clock
          const r = await lib.totp(k, { secret: sec.input.value, alg, digits, counter });
          if (id !== ticks) return;
          code.textContent = r.code.replace(/(\d{3})(?=\d)/g, '$1 ');
          side.textContent = `Counter-based (HOTP) code for counter ${counter} — it does not change with time`;
          return;
        }
        if (!(period >= 1) || !Number.isInteger(period)) throw new Error('The period must be a whole number of seconds');
        const r = await lib.totp(k, { secret: sec.input.value, alg, digits, period, t: Math.floor(Date.now() / 1000) });
        if (id !== ticks) return; // a newer tick (another secret, another setting) has answered meanwhile
        code.textContent = r.code.replace(/(\d{3})(?=\d)/g, '$1 ');
        (bar.firstChild as HTMLElement).style.width = `${(100 * r.remaining!) / period}%`;
        side.textContent = `${r.remaining} s left · previous ${r.prev} · next ${r.next}`;
      } catch (e: any) { if (id !== ticks) return; code.textContent = '— — —'; side.textContent = ''; info.append(note(e.message, 'warn')); }
    } finally { if (id === ticks) code.setAttribute('aria-busy', 'false'); }
  };
  uri.addEventListener('input', () => {
    clear(linkInfo); const wasBad = linkBad; linkBad = false;
    if (!uri.value.trim()) { if (counter !== null || wasBad) { counter = null; tick(); } return; } // (the per-second tick clears `info`, so the link's account name has its own box)
    try {
      const o = parseOtpauth(uri.value);
      if (!['sha1', 'sha256', 'sha512'].includes(o.alg)) throw new Error(`Unknown algorithm "${o.alg}" in the link (SHA1, SHA256 or SHA512)`);
      sec.input.value = o.secret; alg = o.alg; digits = o.digits; period = o.period; counter = o.type === 'hotp' ? o.counter : null;
      algSel.value = alg; setSel(digSel, String(digits), `${digits} digits`); setSel(perSel, String(period), `${period} seconds`);
      linkInfo.append(note(`${o.issuer ? `${o.issuer} · ` : ''}${o.label}${o.type === 'hotp' ? ' · counter-based (HOTP)' : ''}`, 'ok')); tick();
    } catch (e: any) { linkBad = true; linkInfo.append(note(e.message, 'warn')); tick(); }
  });
  sec.input.addEventListener('input', () => { linkBad = false; tick(); });
  root.append(card(null, field('otpauth:// link (from the QR code; use the Scanner tab to read it)', uri), linkInfo, field('…or the secret key', sec), h('div', { class: 'grid2' }, field('Algorithm', algSel), field('Digits', digSel)), field('Period', perSel)),
    card('Current code', code, bar, side, info, nextBtn, button('Copy code', () => { const c = code.textContent!.replace(/\s/g, ''); if (!/^\d+$/.test(c)) throw new Error('There is no code to copy yet'); return copy(c); }, { small: true, icon: 'Copy' })),
    note('Codes are computed on this device (RFC 6238). Use this to test or recover your own 2FA setup — anyone with the secret can make your codes, so keep it private.', 'warn'));
  timer = setInterval(tick, 1000); tick();
  return () => { clearInterval(timer); ticks++; };
};

// ------------------------------------------------------------------ Password hash tool
export const pwhash: Mount = (root) => {
  let alg = 'argon2id', kp: Promise<Keys> | null = null, lib: Promise<typeof import('../../lib/pwhash')> | null = null;   // hash-wasm + our supplement, loaded with the first hash
  const pw = secretInput('Password', '', 'new-password');
  const params = h('div');
  const P: Record<string, Record<string, number>> = { argon2id: { m: 19456, t: 2, p: 1 }, argon2i: { m: 19456, t: 2, p: 1 }, bcrypt: { cost: 12 }, 'pbkdf2-sha256': { iterations: 600000 }, 'pbkdf2-sha512': { iterations: 210000 }, scrypt: { logn: 17, r: 8, p: 1 } };
  const LBL: Record<string, string> = { m: 'Memory (KiB)', t: 'Iterations (time cost)', p: 'Parallelism', cost: 'Cost (2^n rounds)', iterations: 'Iterations', logn: 'log2(N)', r: 'Block size r' };
  const vals: Record<string, number> = {};
  const drawParams = () => { Object.keys(vals).forEach((k) => delete vals[k]); Object.assign(vals, P[alg]); clear(params).append(h('div', { class: 'grid2' }, ...Object.entries(P[alg]).map(([k, v]) => field(LBL[k], input({ type: 'number', value: v, min: 1, attrs: { 'aria-label': LBL[k] }, onInput: (x) => (vals[k] = +x) }))))); };
  const out = outputBox({ rows: 2, mono: true }), took = h('div', { class: 'muted' });
  const hashIn = input({ placeholder: '$argon2id$v=19$… / $2b$12$… / $pbkdf2-sha256$… / $scrypt$…', attrs: { class: 'input mono', 'aria-label': 'Hash to check' } });
  const vpw = secretInput('Password to check'), vres = h('div');
  root.append(card('Create a hash', field('Algorithm', select([['argon2id', 'Argon2id (recommended)'], ['argon2i', 'Argon2i'], ['bcrypt', 'bcrypt'], ['scrypt', 'scrypt'], ['pbkdf2-sha256', 'PBKDF2-SHA256'], ['pbkdf2-sha512', 'PBKDF2-SHA512']], alg, (v) => { alg = v; drawParams(); })),
    params, field('Password', pw), button('Hash', async () => { if (!pw.input.value) throw new Error('Enter a password'); const k = await (kp ||= keys()), L = await (lib ||= import('../../lib/pwhash')); const t0 = performance.now(); out.value = await L.hashPassword(k, { alg, password: pw.input.value, ...vals }); took.textContent = `Took ${Math.round(performance.now() - t0)} ms on this device (a random salt is used each time).`; }, { variant: 'primary', icon: 'Lock' }), out, took),
  card('Check a password against a hash', field('Hash', hashIn), field('Password', vpw), button('Check', async () => { const k = await (kp ||= keys()), L = await (lib ||= import('../../lib/pwhash')); let r: { ok: boolean; scheme: string } | null = null, bad: any = null; try { r = await L.verifyPassword(k, vpw.input.value, hashIn.value); } catch (e) { bad = e; } show(vres, () => { if (bad) throw bad; return note(r!.ok ? `Match ✓ (${r!.scheme})` : `No match (${r!.scheme})`, r!.ok ? 'ok' : 'err'); }); }, { icon: 'ShieldCheck' }), vres),
  note('Defaults follow OWASP’s 2023+ guidance: Argon2id 19 MiB × 2 iterations, bcrypt cost 12, PBKDF2-SHA256 600,000 iterations, scrypt N = 2^17. Output uses the standard PHC string format (bcrypt: $2b$).', 'info'));
  drawParams();
};

// ------------------------------------------------------------------ SSH key generator
export const sshkey: Mount = (root) => {
  let kp: Promise<Keys> | null = null, last: any = null;
  const comment = input({ value: 'me@laptop', attrs: { class: 'input mono', 'aria-label': 'Comment' } }), pass = secretInput('Passphrase', '', 'new-password'), pass2 = secretInput('Repeat passphrase', '', 'new-password');
  const pub = outputBox({ rows: 2, mono: true }), priv = outputBox({ rows: 8, mono: true }), info = h('div'), art = h('pre', { class: 'mono randomart' });
  const gen = async () => {
    if (pass.input.value !== pass2.input.value) throw new Error('The passphrases do not match');
    const k = await (kp ||= keys()); last = k.call('sshkey', { comment: comment.value.trim(), passphrase: pass.input.value });
    pub.value = last.public; priv.value = last.private; art.textContent = last.randomart;
    clear(info).append(kvRows([['Type', 'Ed25519 (OpenSSH format)'], ['Fingerprint', last.fingerprint], ['Private key', last.encrypted ? 'protected with the passphrase (bcrypt KDF + AES-256-CTR)' : 'NOT protected — anyone with the file can use it']]));
  };
  const save = (text: string, name: string) => { if (!text) throw new Error('Generate a key first'); downloadBlob(new Blob([text.endsWith('\n') ? text : `${text}\n`], { type: 'text/plain' }), name); };
  const chk = textarea({ rows: 4, mono: true, placeholder: 'Paste a public key (ssh-ed25519 AAAA…) or an OpenSSH private key to see its fingerprint' }), chkPass = secretInput('Passphrase (if encrypted)'), chkOut = h('div');
  const check = async () => {
    const k = await (kp ||= keys());
    show(chkOut, () => {
      if (!chk.value.trim()) return null;
      const r = k.call('sshinfo', { key: chk.value, passphrase: chkPass.input.value }); // { keys: [...] }: one private key, or one public key per line
      return r.keys.map((x: any, i: number) => h('div', { class: 'ssh-key-info' }, r.keys.length > 1 ? h('strong', null, `Key ${i + 1}`) : null,
        x.needPassphrase ? note(`Encrypted private key (${x.algorithm}, ${x.fingerprint}) — enter its passphrase to read the comment.`, 'info')
          : kvRows([['Kind', x.kind === 'private' ? `private key${x.encrypted ? ' (encrypted, opened)' : ' (not protected by a passphrase)'}` : 'public key'], ['Algorithm', `${x.algorithm}${x.bits ? ` · ${x.bits} bits` : ''}`],
            ['Comment', x.comment || '—'], ['Options / hosts', x.before], ['Fingerprint', x.fingerprint], ['MD5 fingerprint (legacy)', x.md5], ['Public key', x.public]])));
    });
  };
  [chk, chkPass.input].forEach((x) => x.addEventListener('input', debounce(check, 200)));
  root.append(card(null, field('Comment (usually you@computer)', comment), h('div', { class: 'grid2' }, field('Passphrase (recommended)', pass), field('Repeat passphrase', pass2)),
    button('Generate key pair', gen, { variant: 'primary', icon: 'KeyRound' })),
  card('Public key — add to ~/.ssh/authorized_keys or GitHub', pub, h('div', { class: 'row' }, button('Copy', () => copy(pub.value), { small: true, icon: 'Copy' }), button('Download id_ed25519.pub', () => save(pub.value, 'id_ed25519.pub'), { small: true, icon: 'Download' }))),
  card('Private key — keep secret', priv, h('div', { class: 'row' }, button('Download id_ed25519', () => save(priv.value, 'id_ed25519'), { small: true, icon: 'Download' })), info, art),
  card('Inspect a key', chk, field('Passphrase', chkPass), chkOut),
  note('Made on this device with OS randomness; nothing is sent anywhere. After downloading on Linux/macOS: chmod 600 ~/.ssh/id_ed25519', 'info'));
};

// ------------------------------------------------------------------ API key generator
export const apikey: Mount = async (root) => {
  const k = await keys();
  let format = 'base64url', bytes = 32, count = 5, bodies: string[] = [], bits = 0;
  const prefix = input({ value: '', placeholder: 'e.g. sk_live_', attrs: { class: 'input mono', 'aria-label': 'Prefix', maxlength: '64' } });
  const out = outputBox({ rows: 6, mono: true }), info = h('div', { class: 'muted' }), warn = h('div');
  // the random part is made once; typing a prefix only re-labels the keys already shown (they used to be thrown away at every keystroke)
  const draw = () => {
    out.value = bodies.map((b) => prefix.value + b).join('\n');
    info.textContent = `${bits} bits of randomness per key${format === 'github' ? ' + a 6-character CRC32 checksum (catches typos before a lookup); this format always has 30 random characters' : ''}.`;
    clear(warn); if (/[^A-Za-z0-9_-]/.test(prefix.value)) warn.append(note('The prefix has characters other than letters, digits, _ and - (a space, a quote, a symbol…): such keys are awkward in URLs, HTTP headers and shell commands.', 'warn'));
  };
  const gen = () => { const r = k.call('apikey', { format, bytes, count, prefix: '' }); bodies = r.keys; bits = r.bits; draw(); };
  prefix.addEventListener('input', draw);
  const bytesS = slider({ label: 'Random bytes', min: 16, max: 64, value: bytes, onInput: (v) => { bytes = v; gen(); } });
  const lock = () => { const fixed = format === 'github'; bytesS.querySelector('input')!.disabled = fixed; bytesS.classList.toggle('disabled', fixed); };
  root.append(card(null, field('Format', select([['base64url', 'Base64url (URL-safe)'], ['hex', 'Hex'], ['alnum', 'Letters + digits'], ['base32', 'Base32 (lower case)'], ['github', 'GitHub-style with checksum']], format, (v) => { format = v; lock(); gen(); })),
    bytesS, slider({ label: 'How many', min: 1, max: 20, value: count, onInput: (v) => { count = v; gen(); } }), field('Prefix', prefix), warn),
  card('Keys', out, info, h('div', { class: 'row' }, button('Generate again', gen, { small: true, icon: 'RefreshCw' }), button('Copy all', () => copy(out.value), { small: true, icon: 'Copy' }))),
  note('Generated with the operating system’s cryptographic random source. Store only a hash of an API key on the server (e.g. SHA-256), never the key itself.', 'info'));
  gen();
};

// ------------------------------------------------------------------ cURL converter
import { parseCurl, curlTo } from '../../lib/curl';
export { shellWords, parseCurl, curlTo } from '../../lib/curl';
export const curl: Mount = (root) => {
  let lang = 'fetch';
  const ta = textarea({ rows: 6, mono: true, value: `curl -X POST 'https://api.example.com/v1/orders?ref=web' \\\n  -H 'Authorization: Bearer TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"item":"chai","qty":2,"gift":false}'` });
  const out = outputBox({ rows: 16, mono: true }), info = h('div');
  const run = () => {
    clear(info);
    try { const r = parseCurl(ta.value); out.value = curlTo(lang, r); for (const n of r.notes) info.append(note(n, 'info')); }
    catch (e: any) { out.value = ''; info.append(note(e.message, 'warn')); }
  };
  ta.addEventListener('input', debounce(run, 120));
  root.append(card(null, field('curl command (Chrome/Firefox: Network tab → Copy as cURL — the bash and the Windows cmd variants both work)', ta)), card(null, segmented([['fetch', 'JavaScript fetch'], ['node', 'Node.js'], ['python', 'Python requests'], ['go', 'Go net/http'], ['http', 'Raw HTTP']], lang, (v) => { lang = v; run(); })),
    card('Code', out, info, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' })), note('Converted on this device — the command (and any tokens in it) is never sent anywhere.', 'info'));
  run();
};

// ------------------------------------------------------------------ Password strength (zxcvbn)
export const pwstrength: Mount = (root) => {
  let zp: ReturnType<typeof zxcvbn> | null = null;
  const pw = secretInput('Password', '', 'off', () => run()), inputs = input({ placeholder: 'Your name, email, birthday… (checked as easy-to-guess words)', attrs: { class: 'input', 'aria-label': 'Personal words' } });
  const meter = h('div', { class: 'strength-meter' }, ...[0, 1, 2, 3].map(() => h('span'))), label = h('div', { class: 'strength-label' }), out = h('div');
  const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const run = async () => {
    const v = pw.input.value;
    if (!v) { clear(out); label.textContent = ''; meter.className = 'strength-meter'; return; }
    const z = await (zp ||= zxcvbn()); const r = z.check(v, inputs.value.split(/[\s,;@.]+/).filter((x) => x.length > 2));
    if (pw.input.value !== v) return;
    meter.className = `strength-meter s${r.score}`; label.textContent = `${LABELS[r.score]} (score ${r.score} of 4)`;
    const hidden = pw.input.type === 'password';
    clear(out).append(r.warning ? note(r.warning, r.score < 3 ? 'err' : 'warn') : '', ...r.suggestions.map((s) => note(s, 'info')),
      // the estimator counts guesses in 64 bits: at its ceiling (1.8 × 10^19) the real number is larger and the times would understate it
      kvRows(r.guesses >= 1.8e19 ? [['Guesses needed', 'more than 10^19 (beyond what the estimator counts)'], ['Online attack, throttled (100/hour)', 'centuries'], ['Online attack (10/second)', 'centuries'], ['Offline, slow hash (10k/second)', 'centuries'], ['Offline, fast hash (10 billion/second)', 'more than 58 years (likely far longer)']]
        : [['Guesses needed', r.guesses >= 1e15 ? `10^${r.log10.toFixed(1)}` : Math.round(r.guesses).toLocaleString('en-IN')], ['Online attack, throttled (100/hour)', r.times.online_throttled.text], ['Online attack (10/second)', r.times.online.text], ['Offline, slow hash (10k/second)', r.times.offline_slow.text], ['Offline, fast hash (10 billion/second)', r.times.offline_fast.text]]),
      // while the password box is hidden its pieces are hidden here too (dots of the same length; no date, no repeated text)
      card('How it would be guessed', h('div', { class: 'zx-seq' }, r.sequence.map((m) => {
        const detail = hidden && m.kind === 'date' ? '' : hidden && m.kind === 'repeat' ? (m.detail || '').replace(/^".*" /, '') : m.detail;
        return h('span', { class: `zx-part zx-${m.kind}`, title: `${m.kind}${detail ? `: ${detail}` : ''}` }, h('b', { class: 'mono' }, hidden ? '•'.repeat([...m.token].length) : m.token), h('small', null, m.kind === 'bruteforce' ? 'random' : `${m.kind}${detail ? ` · ${detail}` : ''}`));
      })), hidden ? h('div', { class: 'muted' }, 'The pieces are shown as dots while the password is hidden — press Show (the eye) to see them.') : null));
  };
  pw.input.addEventListener('input', debounce(run, 80)); inputs.addEventListener('input', debounce(run, 150));
  root.append(card(null, field('Password', pw), field('Words about you (optional)', inputs), meter, label), out,
    note('Checked on this device with zxcvbn (Dropbox’s estimator, compiled to WebAssembly): it looks for dictionary words, names, keyboard patterns, dates, repeats and l33t substitutions — not just length. Nothing is sent anywhere.', 'info'));
};

