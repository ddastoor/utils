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
    if (r.range) return [card(`Range ${r.start} – ${r.end}`, kvRows([['Addresses', BigInt(r.total).toLocaleString('en-IN')], ['CIDR blocks', String(r.blocks.length)]]), h('pre', { class: 'mono out-pre cidr-blocks' }, r.blocks.join('\n')))];
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
  root.append(card(null, field('IP address, CIDR, address + netmask, or a range (a - b)', inp), field('Split into subnets', split),
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
/** Apply a chmod symbolic expression (u+x,go-w,a=r, +X ignored) to a mode. */
export function applySymbolic(mode: number, expr: string): number | null {
  let v = mode;
  for (const part of expr.split(',')) {
    const m = /^([ugoa]*)([-+=])([rwxst]*)$/.exec(part.trim()); if (!m) return null;
    const who = (m[1] || 'a').replace('a', 'ugo');
    for (const c of new Set(who)) {
      const sh = c === 'u' ? 6 : c === 'g' ? 3 : 0;
      let bits = 0, special = 0;
      for (const p of m[3]) { if (p === 'r') bits |= 4; if (p === 'w') bits |= 2; if (p === 'x') bits |= 1; if (p === 's' && c !== 'o') special |= c === 'u' ? 0o4000 : 0o2000; if (p === 't' && c === 'o') special |= 0o1000; }
      const mask = (7 << sh) | (c === 'u' ? 0o4000 : c === 'g' ? 0o2000 : 0o1000);
      if (m[2] === '+') v |= (bits << sh) | special; else if (m[2] === '-') v &= ~((bits << sh) | special); else v = (v & ~mask) | (bits << sh) | special;
    }
  }
  return v & 0o7777;
}
export const chmod: Mount = (root) => {
  let mode = 0o755;
  const boxes: HTMLInputElement[] = [];
  const grid = h('table', { class: 'tbl chmod-grid' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Read'), h('th', null, 'Write'), h('th', null, 'Execute'))),
    h('tbody', null, CLASSES.map(([c, label], i) => h('tr', null, h('th', null, label), [4, 2, 1].map((b) => { const cb = h('input', { type: 'checkbox', 'aria-label': `${label} ${b === 4 ? 'read' : b === 2 ? 'write' : 'execute'}`, onchange: () => { mode ^= b << (6 - 3 * i); sync(); } }); boxes.push(cb); return h('td', null, cb); })))));
  const specials = [[0o4000, 'setuid'], [0o2000, 'setgid'], [0o1000, 'sticky']].map(([bit, label]) => { const t = toggle(label as string, false, (on) => { mode = on ? mode | (bit as number) : mode & ~(bit as number); sync(); }); return [bit as number, t] as const; });
  const oct = input({ attrs: { class: 'input mono', 'aria-label': 'Octal', inputmode: 'numeric' } }), sym = input({ attrs: { class: 'input mono', 'aria-label': 'Symbolic' } });
  const expr = input({ placeholder: 'e.g. u+x,go-w', attrs: { class: 'input mono', 'aria-label': 'Change' } });
  const out = h('div'), warn = h('div');
  const sync = (except?: HTMLElement) => {
    boxes.forEach((b, k) => { const i = Math.floor(k / 3), bit = [4, 2, 1][k % 3]; b.checked = !!(mode & (bit << (6 - 3 * i))); });
    specials.forEach(([bit, t]) => (t.checked = !!(mode & bit)));
    const o = (mode & 0o7000 ? (mode >> 9).toString(8) : '') + (mode & 0o777).toString(8).padStart(3, '0');
    if (except !== oct) oct.value = o;
    if (except !== sym) sym.value = modeToSymbolic(mode);
    clear(out).append(kvRows([['Octal', o], ['Symbolic', modeToSymbolic(mode)], ['Command', `chmod ${o} file`], ['Symbolic command', `chmod ${CLASSES.map(([c], i) => `${c}=${['', 'x', 'w', 'wx', 'r', 'rx', 'rw', 'rwx'][(mode >> (6 - 3 * i)) & 7]}`).join(',')} file`],
      ['Owner can', ['read', 'write', 'execute'].filter((_, k) => mode & ([4, 2, 1][k] << 6)).join(', ') || 'nothing'], ['Group can', ['read', 'write', 'execute'].filter((_, k) => mode & ([4, 2, 1][k] << 3)).join(', ') || 'nothing'], ['Others can', ['read', 'write', 'execute'].filter((_, k) => mode & [4, 2, 1][k]).join(', ') || 'nothing']]));
    clear(warn); if (mode & 0o002) warn.append(note('Everyone can write to this file (world-writable) — usually a security risk.', 'warn')); if (mode & 0o4000) warn.append(note('setuid: the program runs with the owner’s rights.', 'info'));
  };
  oct.addEventListener('input', () => { const v = oct.value.trim(); const ok = /^[0-7]{1,4}$/.test(v); oct.classList.toggle('bad', !ok); if (ok) { mode = parseInt(v, 8); sync(oct); } });
  sym.addEventListener('input', () => { const v = symbolicToMode(sym.value); sym.classList.toggle('bad', v === null); if (v !== null) { mode = v; sync(sym); } });
  const applyBtn = button('Apply', () => { const v = applySymbolic(mode, expr.value); expr.classList.toggle('bad', v === null); if (v === null) throw new Error('Use who (u g o a) + operator (+ - =) + permissions (r w x s t), e.g. u+x,go-w'); mode = v; sync(); }, { small: true });
  root.append(card(null, grid, h('div', { class: 'row' }, ...specials.map(([, t]) => t))), card(null, h('div', { class: 'grid2' }, field('Octal', oct), field('Symbolic (ls -l)', sym)), field('Change with chmod syntax', h('div', { class: 'row' }, expr, applyBtn))),
    card('Result', out, warn), h('div', { class: 'chips' }, [['644', 'file'], ['755', 'program / folder'], ['600', 'private key'], ['700', 'private folder'], ['775', 'shared folder'], ['1777', '/tmp'], ['4755', 'setuid program']].map(([m, l]) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => { mode = parseInt(m, 8); sync(); } }, `${m} · ${l}`))));
  sync();
};

// ------------------------------------------------------------------ X.509 certificate decoder
export const x509: Mount = async (root) => {
  const ta = textarea({ rows: 8, mono: true, placeholder: '-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----' });
  const out = h('div');
  let dcP: ReturnType<typeof devcore> | null = null;
  const fmt = (s: number) => new Date(s * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
  const render = async (bytes: Uint8Array) => {
    if (!bytes.length) { clear(out).append(note('Paste a PEM certificate (or a chain, or a CSR) or choose a .pem / .crt / .cer / .der / .csr file.', 'info')); return; } // engine loads with the first certificate
    const dc = await (dcP ||= devcore('x509'));
    show(out, () => {
      if (!bytes.length) return note('Paste a PEM certificate (or a chain, or a CSR) or choose a .pem / .crt / .cer / .der / .csr file.', 'info');
      const r = dc.bytesJson('x509', bytes);
      return r.items.map((c: any, i: number) => {
        if (c.kind === 'other') return card(`Block ${i + 1}: ${c.label}`, note(`Not a certificate (${c.size} bytes) — keys are not shown here.`, 'info'));
        const k = `${c.key.type}${c.key.bits ? ` ${c.key.bits}-bit` : ''}${c.key.curve ? ` (${c.key.curve})` : ''}${c.key.exponent ? `, e = ${c.key.exponent}` : ''}`;
        if (c.kind === 'csr') return card(`Certificate request: ${c.cn || c.subject}`, kvRows([['Subject', c.subject], ['Public key', k], ['Signature', c.sigAlg], ['Requested names', c.sans.join(', ')], ['SHA-256', c.sha256]]));
        const now = Date.now() / 1000, days = Math.floor((c.notAfter - now) / 86400);
        const status = now < c.notBefore ? note(`Not valid yet — starts ${fmt(c.notBefore)}.`, 'warn') : now > c.notAfter ? note(`EXPIRED ${-days} day${-days === 1 ? '' : 's'} ago.`, 'err') : note(`Valid — expires in ${days} day${days === 1 ? '' : 's'}.`, days < 30 ? 'warn' : 'ok');
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
  root.append(card(null, field('Certificate (PEM)', ta), filePicker({ accept: '.pem,.crt,.cer,.der,.csr,.p7b,.txt', label: 'Choose a certificate file', onFiles: async ([f]) => { typed.cancel(); const b = await readBytes(f); const t = new TextDecoder().decode(b); if (t.includes('-----BEGIN')) { ta.value = t; } else ta.value = ''; render(b); } })), out,
    note('Decoded on this device; nothing is checked online (no revocation or chain-of-trust check).', 'info'));
  fromText();
};

// ------------------------------------------------------------------ shared: password box with show/hide
function secretInput(label: string, value = '', autocomplete = 'off') {
  const inp = input({ type: 'password', value, attrs: { class: 'input mono', 'aria-label': label, autocomplete, spellcheck: 'false' } });
  const eye = button('', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; eye.setLabel(inp.type === 'password' ? 'Show' : 'Hide'); }, { small: true, icon: 'Eye', title: 'Show' });
  eye.setAttribute('aria-label', 'Show');
  return Object.assign(h('div', { class: 'row pw-row' }, inp, eye), { input: inp });
}
const toBytes = (s: string, how: string): Uint8Array => {
  if (how === 'hex') { const t = s.replace(/\s/g, ''); if (!/^([0-9a-f]{2})*$/i.test(t)) throw new Error('Hex key needs pairs of hex digits'); return Uint8Array.from(t.match(/../g) || [], (x) => parseInt(x, 16)); }
  if (how === 'base64') { const t = s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/'); if (!/^[A-Za-z0-9+/]*=*$/.test(t)) throw new Error('Not valid Base64'); return Uint8Array.from(atob(t.padEnd(Math.ceil(t.length / 4) * 4, '=')), (c) => c.charCodeAt(0)); }
  return new TextEncoder().encode(s);
};

// ------------------------------------------------------------------ HMAC
export const hmac: Mount = (root) => {
  let alg = 'sha256', keyFmt = 'text', kp: Promise<Keys> | null = null;
  const key = secretInput('Secret key', 'my-webhook-secret'), msg = textarea({ rows: 6, mono: true, value: '{"event":"payment.captured","amount":49900}' });
  const out = h('div'), expect = input({ placeholder: 'Paste a signature to compare (hex or Base64; "sha256=" prefix allowed)', attrs: { class: 'input mono', 'aria-label': 'Expected signature' } });
  let file: Uint8Array | null = null;
  const run = async () => {
    const k = await (kp ||= keys());
    show(out, () => {
      const r = k.call('hmac', { alg, key: toB64(toBytes(key.input.value, keyFmt)), msg: toB64(file || new TextEncoder().encode(msg.value)) });
      const e = expect.value.trim().replace(/^(sha\d+|sha3-\d+|md5|sha1)=/i, '');
      const match = e ? e.toLowerCase() === r.hex || e.replace(/=+$/, '') === r.base64.replace(/=+$/, '') || e === r.base64url : null; // hex is case-insensitive, Base64 is not
      return [kvRows([['Hex', r.hex], ['Base64', r.base64], ['Base64url', r.base64url], ['Length', `${r.bytes} bytes`]]), match === null ? '' : note(match ? 'Signature matches ✓' : 'Signature does NOT match', match ? 'ok' : 'err')];
    });
  };
  const runD = debounce(run, 120);
  [key.input, expect].forEach((x) => x.addEventListener('input', runD)); msg.addEventListener('input', () => { file = null; runD(); });
  root.append(card(null, field('Algorithm', select([['sha256', 'HMAC-SHA256'], ['sha512', 'HMAC-SHA512'], ['sha384', 'HMAC-SHA384'], ['sha224', 'HMAC-SHA224'], ['sha1', 'HMAC-SHA1 (legacy)'], ['md5', 'HMAC-MD5 (legacy)'], ['sha3-256', 'HMAC-SHA3-256'], ['sha3-512', 'HMAC-SHA3-512']], alg, (v) => { alg = v; run(); })),
    field('Secret key', key), segmented([['text', 'Key is text'], ['hex', 'Hex'], ['base64', 'Base64']], keyFmt, (v) => { keyFmt = v; run(); })),
    card('Message', msg, filePicker({ label: 'Sign a file instead', onFiles: async ([f]) => { file = await readBytes(f); msg.value = `(file: ${f.name}, ${file.length} bytes)`; run(); } })),
    card('Signature', out, field('Compare with', expect)), note('Webhook senders (Stripe, GitHub, Razorpay …) sign the exact raw body: copy it byte for byte, without reformatting the JSON.', 'info'));
  run();
};

// ------------------------------------------------------------------ TOTP / 2FA
export function parseOtpauth(uri: string) {
  const u = new URL(uri.trim()); if (u.protocol !== 'otpauth:') throw new Error('Not an otpauth:// link');
  const q = u.searchParams; const label = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  return { type: u.host, label, secret: q.get('secret') || '', issuer: q.get('issuer') || label.split(':')[0], alg: (q.get('algorithm') || 'SHA1').toLowerCase(), digits: +(q.get('digits') || 6), period: +(q.get('period') || 30), counter: +(q.get('counter') || 0) };
}
export const totp: Mount = (root) => {
  let kp: Promise<Keys> | null = null, alg = 'sha1', digits = 6, period = 30, timer: any = 0;
  const sec = secretInput('Secret (Base32)', ''), uri = input({ placeholder: 'otpauth://totp/Example:me@example.com?secret=…&issuer=Example', attrs: { class: 'input mono', 'aria-label': 'otpauth link' } });
  const code = h('div', { class: 'otp-code mono' }, '— — —'), bar = h('div', { class: 'meter' }, h('span')), side = h('div', { class: 'muted center' }), info = h('div'), linkInfo = h('div');
  const algSel = select([['sha1', 'SHA-1 (most apps)'], ['sha256', 'SHA-256'], ['sha512', 'SHA-512']], alg, (v) => { alg = v; tick(); });
  const digSel = select([['6', '6 digits'], ['8', '8 digits']], '6', (v) => { digits = +v; tick(); });
  const perSel = select([['30', '30 seconds'], ['60', '60 seconds']], '30', (v) => { period = +v; tick(); });
  const tick = async () => {
    const k = await (kp ||= keys()); clear(info);
    if (!sec.input.value.trim()) { code.textContent = '— — —'; side.textContent = 'Enter a secret or paste an otpauth:// link'; return; }
    try {
      const r = k.call('totp', { secret: sec.input.value, alg, digits, period, t: Math.floor(Date.now() / 1000) });
      code.textContent = r.code.replace(/(\d{3})(?=\d)/g, '$1 ');
      (bar.firstChild as HTMLElement).style.width = `${(100 * r.remaining) / period}%`;
      side.textContent = `${r.remaining} s left · previous ${r.prev} · next ${r.next}`;
    } catch (e: any) { code.textContent = '— — —'; side.textContent = ''; info.append(note(e.message, 'warn')); }
  };
  uri.addEventListener('input', () => {
    clear(linkInfo); if (!uri.value.trim()) return; // (the per-second tick clears `info`, so the link's account name has its own box)
    try { const o = parseOtpauth(uri.value); sec.input.value = o.secret; alg = o.alg; digits = o.digits; period = o.period; algSel.value = alg; digSel.value = String(digits); perSel.value = String(period); linkInfo.append(note(`${o.issuer ? `${o.issuer} · ` : ''}${o.label}`, 'ok')); tick(); }
    catch (e: any) { linkInfo.append(note(e.message, 'warn')); }
  });
  sec.input.addEventListener('input', tick);
  root.append(card(null, field('otpauth:// link (from the QR code; use the Scanner tab to read it)', uri), linkInfo, field('…or the secret key', sec), h('div', { class: 'grid2' }, field('Algorithm', algSel), field('Digits', digSel)), field('Period', perSel)),
    card('Current code', code, bar, side, info, button('Copy code', () => copy(code.textContent!.replace(/\s/g, '')), { small: true, icon: 'Copy' })),
    note('Codes are computed on this device (RFC 6238). Use this to test or recover your own 2FA setup — anyone with the secret can make your codes, so keep it private.', 'warn'));
  timer = setInterval(tick, 1000); tick();
  return () => clearInterval(timer);
};

// ------------------------------------------------------------------ Password hash tool
export const pwhash: Mount = (root) => {
  let alg = 'argon2id', kp: Promise<Keys> | null = null;
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
    params, field('Password', pw), button('Hash', async () => { if (!pw.input.value) throw new Error('Enter a password'); const k = await (kp ||= keys()); const t0 = performance.now(); out.value = k.call('hash', { alg, password: pw.input.value, ...vals }).hash; took.textContent = `Took ${Math.round(performance.now() - t0)} ms on this device (a random salt is used each time).`; }, { variant: 'primary', icon: 'Lock' }), out, took),
  card('Check a password against a hash', field('Hash', hashIn), field('Password', vpw), button('Check', async () => { const k = await (kp ||= keys()); show(vres, () => { const r = k.call('verify', { password: vpw.input.value, hash: hashIn.value }); return note(r.ok ? `Match ✓ (${r.scheme})` : `No match (${r.scheme})`, r.ok ? 'ok' : 'err'); }); }, { icon: 'ShieldCheck' }), vres),
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
  const check = async () => { const k = await (kp ||= keys()); show(chkOut, () => { if (!chk.value.trim()) return null; const r = k.call('sshinfo', { key: chk.value, passphrase: chkPass.input.value }); return r.needPassphrase ? note(`Encrypted private key (${r.fingerprint}) — enter its passphrase to read it.`, 'info') : kvRows([['Kind', r.kind === 'private' ? `private key${r.encrypted ? ' (encrypted, opened)' : ''}` : 'public key'], ['Algorithm', r.algorithm], ['Comment', r.comment || '—'], ['Fingerprint', r.fingerprint], ['Public key', r.public]]); }); };
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
  let format = 'base64url', bytes = 32, count = 5;
  const prefix = input({ value: '', placeholder: 'e.g. sk_live_', attrs: { class: 'input mono', 'aria-label': 'Prefix' } });
  const out = outputBox({ rows: 6, mono: true }), info = h('div', { class: 'muted' });
  const gen = () => { const r = k.call('apikey', { format, bytes, count, prefix: prefix.value }); out.value = r.keys.join('\n'); info.textContent = `${r.bits} bits of randomness per key${format === 'github' ? ' + a 6-character CRC32 checksum (catches typos before a lookup)' : ''}.`; };
  prefix.addEventListener('input', gen);
  root.append(card(null, field('Format', select([['base64url', 'Base64url (URL-safe)'], ['hex', 'Hex'], ['alnum', 'Letters + digits'], ['base32', 'Base32 (lower case)'], ['github', 'GitHub-style with checksum']], format, (v) => { format = v; gen(); })),
    slider({ label: 'Random bytes', min: 16, max: 64, value: bytes, onInput: (v) => { bytes = v; gen(); } }), slider({ label: 'How many', min: 1, max: 20, value: count, onInput: (v) => { count = v; gen(); } }), field('Prefix', prefix)),
  card('Keys', out, info, h('div', { class: 'row' }, button('Generate again', gen, { small: true, icon: 'RefreshCw' }), button('Copy all', () => copy(out.value), { small: true, icon: 'Copy' }))),
  note('Generated with the operating system’s cryptographic random source. Store only a hash of an API key on the server (e.g. SHA-256), never the key itself.', 'info'));
  gen();
};

// ------------------------------------------------------------------ cURL converter
/** POSIX-shell-like word splitting with quotes, escapes and line continuations. */
export function shellWords(s: string): string[] {
  const out: string[] = []; let cur = '', has = false, i = 0;
  const t = s.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  while (i < t.length) {
    const c = t[i];
    if (/\s/.test(c)) { if (has) { out.push(cur); cur = ''; has = false; } i++; continue; }
    has = true;
    if (c === "'") { const j = t.indexOf("'", i + 1); if (j < 0) throw new Error('Unclosed single quote'); cur += t.slice(i + 1, j); i = j + 1; }
    else if (c === '"') { let j = i + 1; while (j < t.length && t[j] !== '"') { if (t[j] === '\\' && /["\\$`\n]/.test(t[j + 1] || '')) { cur += t[j + 1]; j += 2; } else cur += t[j++]; } if (j >= t.length) throw new Error('Unclosed double quote'); i = j + 1; }
    else if (c === '$' && t[i + 1] === "'") { let j = i + 2; while (j < t.length && t[j] !== "'") { if (t[j] === '\\') { const m: Record<string, string> = { n: '\n', t: '\t', r: '\r', "'": "'", '\\': '\\', '"': '"' }; cur += m[t[j + 1]] ?? t[j + 1]; j += 2; } else cur += t[j++]; } i = j + 1; }
    else if (c === '\\') { cur += t[i + 1] ?? ''; i += 2; }
    else { cur += c; i++; }
  }
  if (has) out.push(cur);
  return out;
}
export interface CurlReq { method: string; url: string; headers: Array<[string, string]>; body: string | null; form: Array<[string, string]>; user: string | null; insecure: boolean; compressed: boolean; follow: boolean }
export function parseCurl(cmd: string): CurlReq {
  const w = shellWords(cmd.trim()); if (w[0] !== 'curl') throw new Error('The command must start with curl');
  const r: CurlReq = { method: '', url: '', headers: [], body: null, form: [], user: null, insecure: false, compressed: false, follow: false };
  let get = false; const data: string[] = [];
  for (let i = 1; i < w.length; i++) {
    let a = w[i]; let v: string | undefined;
    const eq = a.startsWith('--') ? a.indexOf('=') : -1; if (eq > 0) { v = a.slice(eq + 1); a = a.slice(0, eq); }
    const next = () => { if (v !== undefined) return v; if (i + 1 >= w.length) throw new Error(`${a} needs a value`); return w[++i]; };
    if (/^-[A-Za-z]{2,}$/.test(a) && !['-sS'].includes(a) && a.length > 2 && !/^-[XHdFuAeb]/.test(a)) { for (const f of a.slice(1)) { if (f === 'k') r.insecure = true; if (f === 'L') r.follow = true; } continue; }
    switch (a) {
      case '-X': case '--request': r.method = next().toUpperCase(); break;
      case '-H': case '--header': { const hv = next(), k = hv.indexOf(':'); if (k > 0) r.headers.push([hv.slice(0, k).trim(), hv.slice(k + 1).trim()]); break; }
      case '-d': case '--data': case '--data-ascii': case '--data-raw': case '--data-binary': data.push(next()); break;
      case '--data-urlencode': { const dv = next(), k = dv.indexOf('='); const enc = (x: string) => encodeURIComponent(x).replace(/%20/g, '+'); data.push(k >= 0 ? `${dv.slice(0, k)}=${enc(dv.slice(k + 1))}` : enc(dv)); break; } // spaces as + like curl
      case '--json': data.push(next()); r.headers.push(['Content-Type', 'application/json'], ['Accept', 'application/json']); break;
      case '-F': case '--form': { const fv = next(), k = fv.indexOf('='); r.form.push([fv.slice(0, k), fv.slice(k + 1)]); break; }
      case '-u': case '--user': r.user = next(); break;
      case '-A': case '--user-agent': r.headers.push(['User-Agent', next()]); break;
      case '-e': case '--referer': r.headers.push(['Referer', next()]); break;
      case '-b': case '--cookie': r.headers.push(['Cookie', next()]); break;
      case '-G': case '--get': get = true; break;
      case '-k': case '--insecure': r.insecure = true; break;
      case '-L': case '--location': r.follow = true; break;
      case '--compressed': r.compressed = true; break;
      case '--url': r.url = next(); break;
      case '-s': case '-S': case '-sS': case '--silent': case '-v': case '--verbose': case '-i': case '--include': break;
      case '-o': case '--output': case '-m': case '--max-time': case '--connect-timeout': next(); break;
      default: if (a.startsWith('-')) break; r.url = a;
    }
  }
  if (!r.url) throw new Error('No URL found');
  if (data.length) { if (get) { r.url += (r.url.includes('?') ? '&' : '?') + data.join('&'); } else { r.body = data.join('&'); if (!r.headers.some(([k]) => /^content-type$/i.test(k))) r.headers.push(['Content-Type', 'application/x-www-form-urlencoded']); } }
  r.method ||= r.body !== null || r.form.length ? 'POST' : 'GET';
  if (r.user) r.headers.push(['Authorization', `Basic ${btoa(r.user.includes(':') ? r.user : `${r.user}:`)}`]);
  return r;
}
const q = (s: string) => JSON.stringify(s);
const pyq = (s: string) => (s.includes('\n') ? `"""${s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}"""` : JSON.stringify(s));
export function curlTo(lang: string, r: CurlReq): string {
  const hs = r.headers.filter(([k]) => !(r.form.length && /^content-type$/i.test(k)));
  const isJson = r.body !== null && hs.some(([k, v]) => /^content-type$/i.test(k) && /json/i.test(v)) && (() => { try { JSON.parse(r.body!); return true; } catch { return false; } })();
  if (lang === 'fetch' || lang === 'node') {
    const o: string[] = [`  method: ${q(r.method)}`];
    if (hs.length) o.push(`  headers: {\n${hs.map(([k, v]) => `    ${q(k)}: ${q(v)},`).join('\n')}\n  }`);
    if (r.form.length) o.push('  body: form');
    else if (r.body !== null) o.push(`  body: ${isJson ? `JSON.stringify(${JSON.stringify(JSON.parse(r.body), null, 2).replace(/\n/g, '\n  ')})` : q(r.body)}`);
    const form = r.form.length ? `const form = new FormData();\n${r.form.map(([k, v]) => (v.startsWith('@') ? `form.append(${q(k)}, ${lang === 'node' ? `new Blob([await fs.readFile(${q(v.slice(1))})])` : `fileInput.files[0]`}, ${q(v.slice(1).split('/').pop()!)});` : `form.append(${q(k)}, ${q(v)});`)).join('\n')}\n\n` : '';
    return `${lang === 'node' && r.form.some(([, v]) => v.startsWith('@')) ? "import fs from 'node:fs/promises';\n\n" : ''}${form}const res = await fetch(${q(r.url)}, {\n${o.join(',\n')},${r.follow ? '' : `\n  redirect: ${q('manual')},`}\n});\nconst text = await res.text();\nconsole.log(res.status, text);`;
  }
  if (lang === 'python') {
    const L = ['import requests', ''];
    if (hs.length) L.push(`headers = {\n${hs.map(([k, v]) => `    ${pyq(k)}: ${pyq(v)},`).join('\n')}\n}`);
    if (r.body !== null) L.push(`data = ${pyq(r.body)}`); // the exact bytes curl sends (json= would re-serialise and break signatures)
    if (r.form.length) L.push(`files = {\n${r.form.map(([k, v]) => `    ${pyq(k)}: ${v.startsWith('@') ? `open(${pyq(v.slice(1))}, "rb")` : `(None, ${pyq(v)})`},`).join('\n')}\n}`);
    const args = [pyq(r.url), hs.length && 'headers=headers', r.body !== null && 'data=data.encode()', r.form.length && 'files=files', r.insecure && 'verify=False', !r.follow && r.method !== 'GET' ? null : null].filter(Boolean);
    L.push('', `response = requests.request(${pyq(r.method)}, ${args.join(', ')}${r.follow ? '' : ', allow_redirects=False'})`, 'print(response.status_code, response.text)');
    return L.join('\n');
  }
  if (lang === 'go') {
    const body = r.body !== null ? `strings.NewReader(${'`'}${r.body.replace(/`/g, '` + "`" + `')}${'`'})` : 'nil';
    return `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"${r.body !== null ? '\n\t"strings"' : ''}\n)\n\nfunc main() {\n\treq, err := http.NewRequest(${q(r.method)}, ${q(r.url)}, ${body})\n\tif err != nil {\n\t\tpanic(err)\n\t}\n${hs.map(([k, v]) => `\treq.Header.Set(${q(k)}, ${q(v)})`).join('\n')}${hs.length ? '\n' : ''}\tres, err := http.DefaultClient.Do(req)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer res.Body.Close()\n\tb, _ := io.ReadAll(res.Body)\n\tfmt.Println(res.StatusCode, string(b))\n}`;
  }
  // HTTP message
  const u = new URL(r.url);
  return `${r.method} ${u.pathname}${u.search} HTTP/1.1\nHost: ${u.host}\n${hs.map(([k, v]) => `${k}: ${v}`).join('\n')}${hs.length ? '\n' : ''}${r.body !== null ? `Content-Length: ${new TextEncoder().encode(r.body).length}\n\n${r.body}` : ''}`;
}
export const curl: Mount = (root) => {
  let lang = 'fetch';
  const ta = textarea({ rows: 6, mono: true, value: `curl -X POST 'https://api.example.com/v1/orders?ref=web' \\\n  -H 'Authorization: Bearer TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"item":"chai","qty":2,"gift":false}'` });
  const out = outputBox({ rows: 16, mono: true }), info = h('div');
  const run = () => { clear(info); try { out.value = curlTo(lang, parseCurl(ta.value)); } catch (e: any) { out.value = ''; info.append(note(e.message, 'warn')); } };
  ta.addEventListener('input', debounce(run, 120));
  root.append(card(null, field('curl command (Chrome/Firefox: Network tab → Copy as cURL)', ta)), card(null, segmented([['fetch', 'JavaScript fetch'], ['node', 'Node.js'], ['python', 'Python requests'], ['go', 'Go net/http'], ['http', 'Raw HTTP']], lang, (v) => { lang = v; run(); })),
    card('Code', out, info, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' })), note('Converted on this device — the command (and any tokens in it) is never sent anywhere.', 'info'));
  run();
};

// ------------------------------------------------------------------ Password strength (zxcvbn)
export const pwstrength: Mount = (root) => {
  let zp: ReturnType<typeof zxcvbn> | null = null;
  const pw = secretInput('Password', '', 'off'), inputs = input({ placeholder: 'Your name, email, birthday… (checked as easy-to-guess words)', attrs: { class: 'input', 'aria-label': 'Personal words' } });
  const meter = h('div', { class: 'strength-meter' }, ...[0, 1, 2, 3].map(() => h('span'))), label = h('div', { class: 'strength-label' }), out = h('div');
  const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const run = async () => {
    const v = pw.input.value;
    if (!v) { clear(out); label.textContent = ''; meter.className = 'strength-meter'; return; }
    const z = await (zp ||= zxcvbn()); const r = z.check(v, inputs.value.split(/[\s,;@.]+/).filter((x) => x.length > 2));
    if (pw.input.value !== v) return;
    meter.className = `strength-meter s${r.score}`; label.textContent = `${LABELS[r.score]} (score ${r.score} of 4)`;
    clear(out).append(r.warning ? note(r.warning, r.score < 3 ? 'err' : 'warn') : '', ...r.suggestions.map((s) => note(s, 'info')),
      kvRows([['Guesses needed', r.guesses >= 1e15 ? `10^${r.log10.toFixed(1)}` : Math.round(r.guesses).toLocaleString('en-IN')], ['Online attack, throttled (100/hour)', r.times.online_throttled.text], ['Online attack (10/second)', r.times.online.text], ['Offline, slow hash (10k/second)', r.times.offline_slow.text], ['Offline, fast hash (10 billion/second)', r.times.offline_fast.text]]),
      card('How it would be guessed', h('div', { class: 'zx-seq' }, r.sequence.map((m) => h('span', { class: `zx-part zx-${m.kind}`, title: `${m.kind}${m.detail ? `: ${m.detail}` : ''}` }, h('b', { class: 'mono' }, m.token), h('small', null, m.kind === 'bruteforce' ? 'random' : `${m.kind}${m.detail ? ` · ${m.detail}` : ''}`))))));
  };
  pw.input.addEventListener('input', debounce(run, 80)); inputs.addEventListener('input', debounce(run, 150));
  root.append(card(null, field('Password', pw), field('Words about you (optional)', inputs), meter, label), out,
    note('Checked on this device with zxcvbn (Dropbox’s estimator, compiled to WebAssembly): it looks for dictionary words, names, keyboard patterns, dates, repeats and l33t substitutions — not just length. Nothing is sent anywhere.', 'info'));
};

