// Software › network & security tabs. Parsing and maths run in our Rust devcore.wasm (CIDR, X.509) — see wasm/devcore.
import { h, card, field, input, textarea, select, clear, note, filePicker, readBytes, toggle, copy, button, type Mount } from '../../ui';
import { devcore } from '../../wasm/devcore';
import { kvRows, show, table, debounce } from './devui';

const stub = () => note('This tool is being built.', 'info');

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

export const sshkey: Mount = (root) => { root.append(stub()); };
export const hmac: Mount = (root) => { root.append(stub()); };
export const pwhash: Mount = (root) => { root.append(stub()); };
export const apikey: Mount = (root) => { root.append(stub()); };
export const curl: Mount = (root) => { root.append(stub()); };
export const totp: Mount = (root) => { root.append(stub()); };
export const pwstrength: Mount = (root) => { root.append(stub()); };
void copy;
