// Software › bits & bytes: bitwise calculator, IEEE-754 inspector (browser-native DataView, BigInt glue), binary-to-text
// encodings and schema-less binary decoders (our Rust devcore-enc / devcore-bin wasm).
import { h, card, field, input, textarea, select, segmented, toggle, clear, note, copy, button, outputBox, filePicker, readBytes, downloadBlob, type Mount } from '../../ui';
import { devcore, type Devcore } from '../../wasm/devcore';
import { kvRows, debounce } from './devui';

// ------------------------------------------------------------------ Bitwise calculator
/** Parse 0x / 0b / 0o / decimal (optionally negative, underscores allowed) into a BigInt. */
export function parseInt2(s: string): bigint | null {
  const t = s.trim().replace(/_/g, '').toLowerCase(); if (!t) return null;
  const neg = t.startsWith('-'), b = neg ? t.slice(1) : t;
  if (!/^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+)$/.test(b)) return null;
  const v = BigInt(b); return neg ? -v : v;
}
const wrap = (v: bigint, w: number, signed: boolean) => { const m = (1n << BigInt(w)) - 1n; let x = v & m; if (signed && x >> BigInt(w - 1)) x -= 1n << BigInt(w); return x; };
const group = (s: string, n: number, sep = ' ') => s.replace(new RegExp(`\\B(?=(.{${n}})+$)`, 'g'), sep);
export function formats(v: bigint, w: number) {
  const u = v & ((1n << BigInt(w)) - 1n);
  return { unsigned: u.toString(), signed: wrap(v, w, true).toString(), hex: `0x${group(u.toString(16).toUpperCase().padStart(w / 4, '0'), 4, '_')}`, oct: `0o${u.toString(8)}`, bin: group(u.toString(2).padStart(w, '0'), 4) };
}
export const bitwise: Mount = (root) => {
  let w = 32, signed = true, op = 'AND', shift = 1;
  const a = input({ value: '0b1100_1010', attrs: { class: 'input mono', 'aria-label': 'A' } }), b = input({ value: '0xF0', attrs: { class: 'input mono', 'aria-label': 'B' } });
  const sh = input({ value: '1', type: 'number', min: 0, max: 63, attrs: { 'aria-label': 'Shift' } });
  const out = h('div'), bitsA = h('div', { class: 'bitgrid' });
  const OPS: Array<[string, string]> = [['AND', 'A & B'], ['OR', 'A | B'], ['XOR', 'A ^ B'], ['NOT', '~A'], ['NAND', '~(A & B)'], ['NOR', '~(A | B)'], ['SHL', 'A << n'], ['SHR', 'A >> n (arithmetic)'], ['USHR', 'A >>> n (logical)'], ['ROL', 'rotate left'], ['ROR', 'rotate right']];
  const run = () => {
    const A = parseInt2(a.value), B = parseInt2(b.value); shift = Math.max(0, Math.min(w, +sh.value || 0));
    a.classList.toggle('bad', A === null); b.classList.toggle('bad', B === null);
    if (A === null || B === null) { clear(out).append(note('Numbers can be decimal, 0x hex, 0b binary or 0o octal (underscores allowed).', 'warn')); return; }
    const W = BigInt(w), M = (1n << W) - 1n, ua = A & M, ub = B & M, n = BigInt(shift);
    const r = op === 'AND' ? ua & ub : op === 'OR' ? ua | ub : op === 'XOR' ? ua ^ ub : op === 'NOT' ? ~ua : op === 'NAND' ? ~(ua & ub) : op === 'NOR' ? ~(ua | ub) : op === 'SHL' ? ua << n
      : op === 'SHR' ? wrap(ua, w, true) >> n : op === 'USHR' ? ua >> n : op === 'ROL' ? (ua << (n % W)) | (ua >> ((W - (n % W)) % W)) : (ua >> (n % W)) | (ua << ((W - (n % W)) % W));
    const row = (label: string, v: bigint) => { const f = formats(v, w); return [h('span', null, label), h('span', { class: 'mono' }, `${signed ? f.signed : f.unsigned}  ·  ${f.hex}  ·  ${f.bin}`)]; };
    const fr = formats(r, w);
    clear(out).append(h('div', { class: 'kv' }, ...row('A', A), ...(op !== 'NOT' && !op.match(/SH|RO/) ? row('B', B) : []), ...row(OPS.find((o) => o[0] === op)![1], r)),
      kvRows([['Result (decimal)', signed ? fr.signed : fr.unsigned], ['Unsigned', fr.unsigned], ['Signed (two’s complement)', fr.signed], ['Hex', fr.hex], ['Octal', fr.oct], ['Binary', fr.bin], ['Bits set', String([...fr.bin].filter((c) => c === '1').length)]]),
      A > M || A < -(1n << (W - 1n)) ? note(`A does not fit in ${w} bits — only the low ${w} bits are used.`, 'warn') : '');
    clear(bitsA).append(...Array.from({ length: w }, (_, i) => { const bit = w - 1 - i, on = (ua >> BigInt(bit)) & 1n; return h('button', { type: 'button', class: `bit ${on ? 'on' : ''}`, title: `bit ${bit}`, 'aria-label': `A bit ${bit}`, onclick: () => { a.value = `0x${(ua ^ (1n << BigInt(bit))).toString(16).toUpperCase()}`; run(); } }, on ? '1' : '0'); }));
  };
  [a, b, sh].forEach((x) => x.addEventListener('input', debounce(run, 80)));
  root.append(card(null, h('div', { class: 'grid2' }, field('A', a), field('B', b)), field('Operation', select(OPS.map(([k, l]) => [k, `${k} — ${l}`] as [string, string]), op, (v) => { op = v; run(); })), field('Shift / rotate by', sh),
    h('div', { class: 'row' }, segmented([['8', '8-bit'], ['16', '16-bit'], ['32', '32-bit'], ['64', '64-bit']], '32', (v) => { w = +v; run(); }), toggle('Signed', true, (v) => { signed = v; run(); }))),
  card('Result', out), card('A bit by bit (click to flip)', h('div', { class: 'scroll-x' }, bitsA)));
  run();
};

// ------------------------------------------------------------------ IEEE-754 inspector
/** Exact decimal value of a finite double (every binary fraction has a finite decimal expansion). */
export function exactDecimal(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
  const bits = dv.getBigUint64(0), neg = bits >> 63n, e = Number((bits >> 52n) & 0x7ffn), f = bits & ((1n << 52n) - 1n);
  const mant = e ? f | (1n << 52n) : f, exp = (e ? e : 1) - 1075; // value = mant · 2^exp
  let s: string;
  if (exp >= 0) s = (mant << BigInt(exp)).toString();
  else { const digits = (mant * 5n ** BigInt(-exp)).toString().padStart(-exp + 1, '0'); s = `${digits.slice(0, digits.length + exp)}.${digits.slice(digits.length + exp)}`.replace(/\.?0+$/, ''); }
  return (neg ? '-' : '') + s;
}
/** Decimal string → [BigInt digits, scale] (value = digits / 10^scale); null if not a plain decimal. */
function decParse(t: string): [bigint, number] | null {
  const m = /^([-+]?)(\d*)(?:\.(\d*))?(?:e([-+]?\d+))?$/i.exec(t.trim()); if (!m || !(m[2] || m[3])) return null;
  const frac = m[3] || '', e = +(m[4] || 0); let digits = BigInt((m[2] || '0') + frac), scale = frac.length - e;
  if (scale < 0) { digits *= 10n ** BigInt(-scale); scale = 0; }
  return [m[1] === '-' ? -digits : digits, scale];
}
/** Exact difference stored − typed, as a decimal string ("0" when the typed decimal is stored exactly). */
export function decDiff(typed: string, exact: string): string | null {
  const a = decParse(exact), b = decParse(typed); if (!a || !b) return null;
  const sc = Math.max(a[1], b[1]), d = a[0] * 10n ** BigInt(sc - a[1]) - b[0] * 10n ** BigInt(sc - b[1]);
  if (d === 0n) return '0';
  const neg = d < 0n, s = (neg ? -d : d).toString().padStart(sc + 1, '0');
  const r = sc ? `${s.slice(0, s.length - sc)}.${s.slice(s.length - sc)}`.replace(/\.?0+$/, '') : s;
  return (neg ? '-' : '') + r;
}
export function inspect(x: number, wide: boolean) {
  const n = wide ? 8 : 4, dv = new DataView(new ArrayBuffer(8));
  wide ? dv.setFloat64(0, x) : dv.setFloat32(0, x);
  const stored = wide ? dv.getFloat64(0) : dv.getFloat32(0);
  const bits = wide ? dv.getBigUint64(0) : BigInt(dv.getUint32(0));
  const EB = wide ? 11 : 8, MB = wide ? 52 : 23, bias = wide ? 1023 : 127;
  const sign = Number(bits >> BigInt(EB + MB)), e = Number((bits >> BigInt(MB)) & ((1n << BigInt(EB)) - 1n)), m = bits & ((1n << BigInt(MB)) - 1n);
  const kind = e === (1 << EB) - 1 ? (m ? 'NaN' : 'Infinity') : e === 0 ? (m ? 'Subnormal' : 'Zero') : 'Normal';
  const hex = [...Array(n)].map((_, i) => dv.getUint8(i).toString(16).padStart(2, '0')).join('').toUpperCase();
  const bin = bits.toString(2).padStart(EB + MB + 1, '0');
  const step = (dir: 1 | -1) => { const d2 = new DataView(new ArrayBuffer(8)); if (wide) { d2.setFloat64(0, stored); let b = d2.getBigUint64(0); b = stored === 0 ? (dir > 0 ? 1n : (1n << 63n) | 1n) : (stored > 0) === (dir > 0) ? b + 1n : b - 1n; d2.setBigUint64(0, b); return d2.getFloat64(0); } d2.setFloat32(0, stored); let b = d2.getUint32(0); b = stored === 0 ? (dir > 0 ? 1 : 0x80000001) : (stored > 0) === (dir > 0) ? b + 1 : b - 1; d2.setUint32(0, b >>> 0); return d2.getFloat32(0); };
  return { stored, hex, bin, sign, e, m, kind, exponent: kind === 'Normal' ? e - bias : kind === 'Subnormal' ? 1 - bias : null, mantBits: bin.slice(1 + EB), expBits: bin.slice(1, 1 + EB), next: step(1), prev: step(-1), exact: exactDecimal(stored) };
}
export const ieee754: Mount = (root) => {
  let wide = true;
  const val = input({ value: '0.1', attrs: { class: 'input mono', 'aria-label': 'Number' } }), hexI = input({ attrs: { class: 'input mono', 'aria-label': 'Hex bits' } });
  const out = h('div'), bitsBox = h('div', { class: 'ieee-bits mono' });
  const render = (x: number, from?: HTMLInputElement) => {
    const r = inspect(x, wide);
    if (from !== hexI) hexI.value = r.hex;
    clear(bitsBox).append(h('span', { class: 'b-sign', title: 'sign' }, String(r.sign)), h('span', { class: 'b-exp', title: 'exponent' }, r.expBits), h('span', { class: 'b-man', title: 'mantissa (fraction)' }, r.mantBits));
    const fmt = (v: number) => (Object.is(v, -0) ? '-0' : String(v));
    const err = from === hexI || !Number.isFinite(r.stored) ? null : decDiff(val.value, r.exact); // exact decimal arithmetic (BigInt)
    clear(out).append(kvRows([['Stored value', fmt(r.stored)], ['Exact decimal', r.exact], ['Stored − typed', err === null ? '—' : err === '0' ? '0 (stored exactly)' : err], ['Kind', r.kind], ['Sign', r.sign ? '1 (negative)' : '0 (positive)'],
      ['Exponent', r.exponent === null ? `${r.expBits} (all ${r.kind === 'Zero' || r.kind === 'Subnormal' ? '0s' : '1s'})` : `${r.expBits} = ${r.e} − ${wide ? 1023 : 127} = ${r.exponent}`], ['Mantissa', `${r.kind === 'Normal' ? '1.' : '0.'}${r.mantBits}`],
      ['Hex', `0x${r.hex}`], ['Next larger', fmt(r.next)], ['Next smaller', fmt(r.prev)]]),
    err !== null && err !== '0' ? note(`${val.value.trim()} cannot be stored exactly in ${wide ? '64' : '32'}-bit binary floating point; the nearest value is shown.`, 'info') : '');
  };
  const fromVal = () => { const t = val.value.trim().toLowerCase(); const x = t === 'nan' ? NaN : /^[-+]?(inf|infinity)$/.test(t) ? (t.startsWith('-') ? -Infinity : Infinity) : Number(t); const ok = t !== '' && (!Number.isNaN(x) || t === 'nan'); val.classList.toggle('bad', !ok); if (ok) render(x, val); };
  const fromHex = () => { const t = hexI.value.trim().replace(/^0x/i, '').replace(/[\s_]/g, ''); const len = wide ? 16 : 8; const ok = new RegExp(`^[0-9a-f]{${len}}$`, 'i').test(t); hexI.classList.toggle('bad', !ok); if (!ok) return; const dv = new DataView(new ArrayBuffer(8)); if (wide) dv.setBigUint64(0, BigInt(`0x${t}`)); else dv.setUint32(0, parseInt(t, 16)); const x = wide ? dv.getFloat64(0) : dv.getFloat32(0); val.value = Object.is(x, -0) ? '-0' : String(x); render(x, hexI); };
  val.addEventListener('input', fromVal); hexI.addEventListener('input', fromHex);
  root.append(card(null, segmented([['64', 'double (64-bit)'], ['32', 'float (32-bit)']], '64', (v) => { wide = v === '64'; fromVal(); }), h('div', { class: 'grid2' }, field('Decimal number', val), field('Hex bits', hexI)),
    h('div', { class: 'chips' }, ['0.1', '0.2', '1', '-0', '1e-310', '3.4028235e38', '16777217', '9007199254740993', 'Infinity', 'NaN', '0.30000000000000004'].map((v) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => { val.value = v; fromVal(); } }, v)))),
  card('Bits: sign · exponent · mantissa', bitsBox), card('Breakdown', out));
  fromVal();
};

// ------------------------------------------------------------------ Base32 / Base58 / Ascii85 …
const ALGS: Array<[string, string]> = [['base32', 'Base32 (RFC 4648)'], ['base32hex', 'Base32hex'], ['crockford', 'Crockford Base32'], ['base58', 'Base58 (Bitcoin)'], ['base58check', 'Base58Check'], ['ascii85', 'Ascii85'], ['z85', 'Z85 (ZeroMQ)'], ['base64', 'Base64'], ['base64url', 'Base64url'], ['base16', 'Base16 (hex)']];
const isText = (b: Uint8Array) => { try { const t = new TextDecoder('utf-8', { fatal: true }).decode(b); return !/[\u0000-\u0008\u000e-\u001f]/.test(t); } catch { return false; } };
export const baseenc: Mount = (root) => {
  let alg = 'base32', dir = 'enc', file: Uint8Array | null = null, fileName = '', decoded: Uint8Array | null = null, dc: Devcore | null = null;
  const src = textarea({ rows: 6, mono: true, value: 'Hello, SuperTools!' }), out = outputBox({ rows: 6, mono: true }), info = h('div');
  const run = async () => {
    dc ||= await devcore('enc'); clear(info); decoded = null;
    try {
      if (dir === 'enc') { const b = file || new TextEncoder().encode(src.value); out.value = dc.encode(alg, b); info.append(note(`${b.length} bytes → ${out.value.length} characters`, 'info')); }
      else { const b = dc.decode(alg, src.value); decoded = b; out.value = isText(b) ? new TextDecoder().decode(b) : [...b].map((x) => x.toString(16).padStart(2, '0')).join(' '); info.append(note(`${b.length} bytes${isText(b) ? ' (shown as UTF-8 text)' : ' (binary — shown as hex; Download saves the bytes)'}`, 'info')); }
    } catch (e: any) { out.value = ''; info.append(note(`Cannot ${dir === 'enc' ? 'encode' : 'decode'}: ${e.message}`, 'warn')); }
  };
  const runD = debounce(run, 120);
  src.addEventListener('input', () => { file = null; runD(); });
  root.append(card(null, field('Encoding', select(ALGS, alg, (v) => { alg = v; run(); })), segmented([['enc', 'Encode'], ['dec', 'Decode']], 'enc', (v) => { dir = v; run(); })),
    card('Input', src, filePicker({ label: 'Encode a file', onFiles: async ([f]) => { file = await readBytes(f); fileName = f.name; src.value = `(file: ${f.name}, ${file.length} bytes)`; if (dir !== 'enc') root.querySelectorAll<HTMLButtonElement>('.seg-btn')[0].click(); else run(); } })),
    card('Output', out, info, h('div', { class: 'row' }, button('Copy', () => copy(out.value), { small: true, icon: 'Copy' }), button('Download', () => { if (!out.value) throw new Error('Nothing to save yet'); downloadBlob(decoded ? new Blob([decoded as BlobPart]) : new Blob([out.value], { type: 'text/plain' }), decoded ? 'decoded.bin' : `${fileName || 'encoded'}.${alg}.txt`); }, { small: true, icon: 'Download' }))));
  run();
};

// ------------------------------------------------------------------ Protobuf / MessagePack / CBOR decoder
export function parseBytes(s: string, how: string): Uint8Array {
  const t = s.trim();
  if (how === 'hex') { const hx = t.replace(/0x/gi, '').replace(/[\s,:]/g, ''); if (!/^([0-9a-f]{2})*$/i.test(hx)) throw new Error('Hex input needs pairs of hex digits'); return Uint8Array.from(hx.match(/../g) || [], (x) => parseInt(x, 16)); }
  const b64 = t.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/'); if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error('Not valid Base64');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')); return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export const bindecode: Mount = (root) => {
  let fmt = 'protobuf', how = 'hex', file: Uint8Array | null = null, dc: Devcore | null = null;
  const src = textarea({ rows: 5, mono: true, value: '08 96 01 12 07 74 65 73 74 69 6e 67 1a 03 08 96 01' }), out = h('pre', { class: 'mono out-pre bin-out' }), info = h('div');
  const run = async () => {
    dc ||= await devcore('bin'); clear(info);
    try { const b = file || parseBytes(src.value, how); const r = dc.bytesJson(`bin:${fmt}`, b); out.textContent = r.text; info.append(note(`${b.length} bytes · ${r.count} ${fmt === 'protobuf' ? 'top-level field' : 'value'}${r.count === 1 ? '' : 's'}`, 'ok')); }
    catch (e: any) { out.textContent = ''; info.append(note(e.message, 'warn')); }
  };
  src.addEventListener('input', debounce(() => { file = null; run(); }, 150));
  root.append(card(null, field('Format', segmented([['protobuf', 'Protobuf'], ['msgpack', 'MessagePack'], ['cbor', 'CBOR']], fmt, (v) => { fmt = v; run(); })), field('Input is', segmented([['hex', 'Hex'], ['base64', 'Base64']], how, (v) => { how = v; file = null; run(); }))),
    card('Bytes', src, filePicker({ label: 'Open a binary file', onFiles: async ([f]) => { file = await readBytes(f); src.value = `(file: ${f.name}, ${file.length} bytes)`; run(); } })), card('Decoded', info, out),
    note('No schema needed: protobuf shows field numbers and wire types (like protoc --decode_raw); CBOR uses the RFC 8949 diagnostic notation.', 'info'));
  run();
};
