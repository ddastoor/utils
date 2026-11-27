// Software › bits & bytes: bitwise calculator, IEEE-754 inspector (browser-native DataView, BigInt glue), binary-to-text
// encodings and schema-less binary decoders (our Rust devcore-enc / devcore-bin wasm).
import { h, card, field, input, textarea, select, segmented, toggle, clear, note, copy, button, filePicker, readBytes, downloadBlob, fmtBytes, type Mount } from '../../ui';
import { devcore, type Devcore } from '../../wasm/devcore';
import { kvRows, debounce } from './devui';
import './bits.css';

// ------------------------------------------------------------------ Bitwise calculator
/** Parse 0x / 0b / 0o / decimal (optionally negative, underscores allowed) into a BigInt. */
export function parseInt2(s: string): bigint | null {
  const t = s.trim().replace(/[_\s]/g, '').toLowerCase(); if (!t) return null; // "0b1100 1010" and "0xFFFF_0000" as the result rows print them
  const neg = t.startsWith('-'), b = neg || t.startsWith('+') ? t.slice(1) : t;
  if (!/^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+)$/.test(b)) return null;
  const v = BigInt(b); return neg ? -v : v;
}
const wrap = (v: bigint, w: number, signed: boolean) => { const m = (1n << BigInt(w)) - 1n; let x = v & m; if (signed && x >> BigInt(w - 1)) x -= 1n << BigInt(w); return x; };
const group = (s: string, n: number, sep = ' ') => s.replace(new RegExp(`\\B(?=(.{${n}})+$)`, 'g'), sep);
export function formats(v: bigint, w: number) {
  const u = v & ((1n << BigInt(w)) - 1n);
  return { unsigned: u.toString(), signed: wrap(v, w, true).toString(), hex: `0x${group(u.toString(16).toUpperCase().padStart(w / 4, '0'), 4, '_')}`, oct: `0o${u.toString(8)}`, bin: `0b${group(u.toString(2).padStart(w, '0'), 4, '_')}` }; // every form can be pasted back in
}
export const bitwise: Mount = (root) => {
  let w = 32, signed = true, op = 'AND', shift = 1;
  const a = input({ value: '0b1100_1010', attrs: { class: 'input mono', 'aria-label': 'A' } }), b = input({ value: '0xF0', attrs: { class: 'input mono', 'aria-label': 'B' } });
  const sh = input({ value: '1', type: 'number', min: 0, max: 63, attrs: { 'aria-label': 'Shift' } });
  const out = h('div'), bitsA = h('div', { class: 'bitgrid' });
  const OPS: Array<[string, string]> = [['AND', 'A & B'], ['OR', 'A | B'], ['XOR', 'A ^ B'], ['NOT', '~A'], ['NAND', '~(A & B)'], ['NOR', '~(A | B)'], ['SHL', 'A << n'], ['SHR', 'A >> n (arithmetic)'], ['USHR', 'A >>> n (logical)'], ['ROL', 'rotate left'], ['ROR', 'rotate right']];
  const run = () => {
    const two = !/NOT|SH|RO/.test(op), rot = /RO/.test(op), byN = /SH|RO/.test(op); // B is used only by the two-operand operations
    const A = parseInt2(a.value), B = two ? parseInt2(b.value) : 0n, raw = Math.floor(+sh.value);
    const shOk = !byN || (sh.value.trim() !== '' && Number.isFinite(raw) && raw >= 0);
    // whole bits only (1.5 used to throw: BigInt(1.5)); a rotation wraps around (9 in 8 bits = 1), a shift by the width or more empties the word
    shift = !shOk ? 0 : rot ? raw % w : Math.min(w, raw);
    a.classList.toggle('bad', A === null); b.classList.toggle('bad', B === null); sh.classList.toggle('bad', !shOk);
    b.disabled = !two; sh.disabled = !byN;
    if (A === null || B === null) { clear(out).append(note('Numbers can be decimal, 0x hex, 0b binary or 0o octal (underscores or spaces between digits are fine).', 'warn')); clear(bitsA); return; }
    if (!shOk) { clear(out).append(note('Shift / rotate by a whole number of bits, 0 or more.', 'warn')); return; }
    const W = BigInt(w), M = (1n << W) - 1n, ua = A & M, ub = B & M, n = BigInt(shift);
    const r = op === 'AND' ? ua & ub : op === 'OR' ? ua | ub : op === 'XOR' ? ua ^ ub : op === 'NOT' ? ~ua : op === 'NAND' ? ~(ua & ub) : op === 'NOR' ? ~(ua | ub) : op === 'SHL' ? ua << n
      : op === 'SHR' ? wrap(ua, w, true) >> n : op === 'USHR' ? ua >> n : op === 'ROL' ? (ua << (n % W)) | (ua >> ((W - (n % W)) % W)) : (ua >> (n % W)) | (ua << ((W - (n % W)) % W));
    const row = (label: string, v: bigint) => { const f = formats(v, w); return [h('span', null, label), h('span', { class: 'mono' }, `${signed ? f.signed : f.unsigned}  ·  ${f.hex}  ·  ${f.bin}`)]; };
    const fr = formats(r, w);
    clear(out).append(h('div', { class: 'kv' }, ...row('A', A), ...(two ? row('B', B) : []), ...row(OPS.find((o) => o[0] === op)![1], r)),
      kvRows([['Result (decimal)', signed ? fr.signed : fr.unsigned], ['Unsigned', fr.unsigned], ['Signed (two’s complement)', fr.signed], ['Hex', fr.hex], ['Octal', fr.oct], ['Binary', fr.bin], ['Bits set', String([...fr.bin.slice(2)].filter((c) => c === '1').length)]]),
      rot && raw >= w ? note(`Rotating ${w} bits by ${raw} is the same as by ${shift}.`, 'info') : !rot && byN && raw >= w ? note(`Shifting by ${raw} moves every bit out of a ${w}-bit value.`, 'info') : '',
      ...([['A', A], ['B', B]] as Array<[string, bigint]>).filter(([k, v]) => (k === 'A' || two) && (v > M || v < -(1n << (W - 1n)))).map(([k]) => note(`${k} does not fit in ${w} bits — only the low ${w} bits are used.`, 'warn')));
    clear(bitsA).append(...Array.from({ length: w }, (_, i) => { const bit = w - 1 - i, on = (ua >> BigInt(bit)) & 1n; return h('button', { type: 'button', class: `bit ${on ? 'on' : ''}`, title: `bit ${bit}`, 'aria-label': `A bit ${bit}: ${on ? '1' : '0'}`, onclick: () => { a.value = `0x${(ua ^ (1n << BigInt(bit))).toString(16).toUpperCase()}`; run(); } }, on ? '1' : '0'); }));
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
  const frac = m[3] || '', e = +(m[4] || 0);
  if (Math.abs(e) > 5000 || (m[2] || '').length + frac.length > 5000) return null; // 1e-1000000 would mean a million-digit BigInt (the page froze)
  let digits = BigInt((m[2] || '0') + frac), scale = frac.length - e;
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
/** The float32 nearest to a typed decimal. Number() rounds to a double first, and rounding that again to 32 bits can
 *  land on the wrong neighbour when the double is exactly half-way (1.0000000596046447753906251 → 0x3F800001, not
 *  0x3F800000): the three candidates around the guess are compared with the typed value exactly (BigInt). */
export function toFloat32(typed: string): number {
  const guess = Math.fround(Number(typed)), want = decParse(typed);
  if (!want || Number.isNaN(guess)) return guess;
  const neg = want[0] < 0n || (want[0] === 0n && /^\s*-/.test(typed)), dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, Math.abs(guess)); const bits = Number.isFinite(guess) ? dv.getUint32(0) : 0x7f800000;
  let best = guess, bestD: [bigint, number] | null = null;
  for (const b of [bits - 1, bits, bits + 1]) { // magnitudes: the guess and its two neighbours
    if (b < 0 || b > 0x7f800000) continue;
    dv.setUint32(0, b); const v = dv.getFloat32(0);
    // beyond the largest float lies 2^128 as far as rounding is concerned; landing there means Infinity
    const c = decParse(b === 0x7f800000 ? '340282366920938463463374607431768211456' : exactDecimal(v))!, sc = Math.max(c[1], want[1]);
    let d = c[0] * 10n ** BigInt(sc - c[1]) - (want[0] < 0n ? -want[0] : want[0]) * 10n ** BigInt(sc - want[1]); if (d < 0n) d = -d;
    // d / 10^sc against the best so far, cross-multiplied to one scale
    const mine = bestD ? d * 10n ** BigInt(bestD[1]) : 0n, theirs = bestD ? bestD[0] * 10n ** BigInt(sc) : 0n;
    if (!bestD || mine < theirs || (mine === theirs && (b & 1) === 0)) { best = neg ? -v : v; bestD = [d, sc]; } // ties go to the even mantissa
  }
  return best;
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
  return { stored, hex, bin, sign, e, m, kind, exponent: kind === 'Normal' ? e - bias : kind === 'Subnormal' ? 1 - bias : null, mantBits: bin.slice(1 + EB), expBits: bin.slice(1, 1 + EB), next: Number.isNaN(stored) || stored === Infinity ? NaN : step(1), prev: Number.isNaN(stored) || stored === -Infinity ? NaN : step(-1), exact: exactDecimal(stored) }; // nothing lies beyond ±Infinity or next to NaN
}
export const ieee754: Mount = (root) => {
  let wide = true;
  const val = input({ value: '0.1', attrs: { class: 'input mono', 'aria-label': 'Number' } }), hexI = input({ attrs: { class: 'input mono', 'aria-label': 'Hex bits' } });
  const out = h('div'), bitsBox = h('div', { class: 'ieee-bits mono' });
  const render = (x: number, from?: HTMLInputElement) => {
    const r = inspect(x, wide);
    if (from !== hexI) hexI.value = r.hex;
    clear(bitsBox).append(h('span', { class: 'b-sign', title: 'sign' }, String(r.sign)), h('span', { class: 'b-exp', title: 'exponent' }, r.expBits), h('span', { class: 'b-man', title: 'mantissa (fraction)' }, r.mantBits));
    const fmt = (v: number) => (Object.is(v, -0) ? '-0' : String(v)), nb = (v: number) => (Number.isNaN(v) ? '—' : fmt(v));
    const err = from === hexI || !Number.isFinite(r.stored) ? null : decDiff(val.value, r.exact); // exact decimal arithmetic (BigInt)
    clear(out).append(kvRows([['Stored value', fmt(r.stored)], ['Exact decimal', r.exact], ['Stored − typed', err === null ? '—' : err === '0' ? '0 (stored exactly)' : err], ['Kind', r.kind], ['Sign', r.sign ? '1 (negative)' : '0 (positive)'],
      ['Exponent', r.exponent === null ? `${r.expBits} (all ${r.kind === 'Zero' || r.kind === 'Subnormal' ? '0s' : '1s'})` : `${r.expBits} = ${r.e} − ${wide ? 1023 : 127} = ${r.exponent}`], ['Mantissa', `${r.kind === 'Normal' ? '1.' : '0.'}${r.mantBits}`],
      ['Hex', `0x${r.hex}`], ['Next larger', nb(r.next)], ['Next smaller', nb(r.prev)]]),
    err !== null && err !== '0' && r.stored !== 0 ? note(`${val.value.trim()} cannot be stored exactly in ${wide ? '64' : '32'}-bit binary floating point; the nearest value is shown.`, 'info') : '');
  };
  const fromVal = () => {
    const t = val.value.trim().toLowerCase(); const special = t === 'nan' || /^[-+]?(inf|infinity)$/.test(t);
    const x = t === 'nan' ? NaN : special ? (t.startsWith('-') ? -Infinity : Infinity) : wide ? Number(t) : toFloat32(t);
    const ok = t !== '' && (!Number.isNaN(x) || t === 'nan'); val.classList.toggle('bad', !ok); hexI.classList.remove('bad');
    if (!ok) { clear(out).append(note(t === '' ? 'Type a number, for example 0.1, -2.5e-3, Infinity or NaN.' : `“${val.value.trim().slice(0, 40)}” is not a number. Examples: 0.1, -2.5e-3, 1e308, Infinity, NaN.`, 'warn')); clear(bitsBox); hexI.value = ''; return; }
    render(x, val);
    if (!special && !Number.isFinite(wide ? x : Math.fround(x))) out.append(note(`Too large for a ${wide ? '64' : '32'}-bit float (the largest is about ${wide ? '1.8e308' : '3.4e38'}): it is stored as ${x < 0 ? '-' : ''}Infinity.`, 'info'));
    else if (!special && x === 0 && /[1-9]/.test(t.replace(/e.*$/, ''))) out.append(note(`Too small for a ${wide ? '64' : '32'}-bit float (the smallest is about ${wide ? '4.9e-324' : '1.4e-45'}): it is stored as ${Object.is(x, -0) ? '-0' : '0'}.`, 'info'));
  };
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
/** Base58 is long division over the whole input (time grows with the square of the size): fine for keys and addresses, not for files. */
const B58_MAX = 10_000, SHOW_MAX = 200_000, FILE_MAX = 64 * 1024 * 1024;
export const baseenc: Mount = (root) => {
  let alg = 'base32', dir = 'enc', file: Uint8Array | null = null, fileName = '', decoded: Uint8Array | null = null, full = '', dc: Devcore | null = null;
  // a plain read-only box: the Copy button below gives the whole text even when the box shows only its beginning
  const src = textarea({ rows: 6, mono: true, value: 'Hello, SuperUtils!' }), out = textarea({ rows: 6, mono: true, readonly: true }), info = h('div');
  out.setAttribute('aria-label', 'Output');
  const show = (t: string) => { full = t; out.value = t.length > SHOW_MAX ? t.slice(0, SHOW_MAX) : t; if (t.length > SHOW_MAX) info.append(note(`Showing the first ${SHOW_MAX.toLocaleString('en-IN')} of ${t.length.toLocaleString('en-IN')} characters — Copy and Download give all of it.`, 'info')); };
  const run = async () => {
    dc ||= await devcore('enc'); clear(info); decoded = null; full = '';
    try {
      if (dir === 'enc') {
        const b = file || new TextEncoder().encode(src.value);
        if (alg.startsWith('base58') && b.length > B58_MAX) throw new Error(`Base58 is meant for short values such as keys and addresses (up to ${B58_MAX.toLocaleString('en-IN')} bytes); this is ${b.length.toLocaleString('en-IN')} bytes. Use Base64 or Base32 for files.`);
        const t = dc.encode(alg, b); info.append(note(`${b.length.toLocaleString('en-IN')} byte${b.length === 1 ? '' : 's'} → ${t.length.toLocaleString('en-IN')} character${t.length === 1 ? '' : 's'}`, 'info')); show(t);
      } else {
        if (file && !isText(file)) throw new Error(`${fileName} is not a text file — to turn it into ${ALGS.find((x) => x[0] === alg)![1]}, switch to Encode`);
        const text = file ? new TextDecoder().decode(file) : src.value; // a chosen file holds the encoded text
        if (alg.startsWith('base58') && text.length > B58_MAX * 1.4) throw new Error(`Base58 is meant for short values such as keys and addresses; this is ${text.length.toLocaleString('en-IN')} characters.`);
        const b = dc.decode(alg, text), txt = isText(b); decoded = b;
        info.append(note(`${b.length.toLocaleString('en-IN')} byte${b.length === 1 ? '' : 's'}${!b.length ? '' : txt ? ' (shown as UTF-8 text)' : ' (binary — shown as hex; Download saves the bytes)'}`, 'info'));
        if (txt) show(new TextDecoder().decode(b));
        else { const cut = b.length > SHOW_MAX / 4; full = out.value = hexDump(cut ? b.subarray(0, SHOW_MAX / 4) : b); if (cut) info.append(note(`Showing the first ${(SHOW_MAX / 4).toLocaleString('en-IN')} of ${b.length.toLocaleString('en-IN')} bytes as hex — Download saves all of them.`, 'info')); }
      }
    } catch (e: any) { out.value = ''; full = ''; info.append(note(`Cannot ${dir === 'enc' ? 'encode' : 'decode'}: ${e.message}`, 'warn')); }
  };
  const hexDump = (b: Uint8Array) => { const o = new Array<string>(b.length); for (let i = 0; i < b.length; i++) o[i] = b[i].toString(16).padStart(2, '0'); return o.join(' '); };
  const runD = debounce(run, 120);
  src.addEventListener('input', () => { file = null; fileName = ''; runD(); });
  root.append(card(null, field('Encoding', select(ALGS, alg, (v) => { alg = v; run(); })), segmented([['enc', 'Encode'], ['dec', 'Decode']], 'enc', (v) => { dir = v; run(); })),
    card('Input', src, filePicker({ label: 'Use a file', hint: 'Encode: any file. Decode: a text file holding the encoded data', onFiles: async ([f]) => { if (f.size > FILE_MAX) throw new Error(`${f.name} is ${fmtBytes(f.size)} — this tab takes files up to ${fmtBytes(FILE_MAX)} (the text form would not fit in the page)`); file = await readBytes(f); fileName = f.name; src.value = `(file: ${f.name}, ${file.length.toLocaleString('en-IN')} bytes)`; await run(); } })),
    card('Output', out, info, h('div', { class: 'row' }, button('Copy', () => { if (!full) throw new Error('Nothing to copy yet'); return copy(decoded && !isText(decoded) ? out.value : full); }, { small: true, icon: 'Copy' }),
      button('Download', () => {
        if (dir === 'enc' ? !full : !decoded) throw new Error('Nothing to save yet');
        const own = /^(.+)\.(?:base32|base32hex|crockford|base58|base58check|ascii85|z85|base64|base64url|base16)\.txt$/i.exec(fileName); // a file this tab made: photo.png.base64.txt → photo.png
        if (decoded) downloadBlob(new Blob([decoded as BlobPart]), own ? own[1] : isText(decoded) ? 'decoded.txt' : 'decoded.bin');
        else downloadBlob(new Blob([full], { type: 'text/plain' }), `${fileName || 'encoded'}.${alg}.txt`);
      }, { small: true, icon: 'Download' }))));
  run();
};

// ------------------------------------------------------------------ Protobuf / MessagePack / CBOR decoder
/** Bytes as people paste them. Hex: "08 96 01", "0896 01", "0x08, 0x96", "{0x8, 0x96, 0x1}", "\x08\x96", "08:96:01",
 *  single digits between separators ("8 96 1"). Base64: standard or URL-safe, padding optional, data: URLs. */
export function parseBytes(s: string, how: string): Uint8Array {
  const t = s.trim();
  if (how === 'hex') {
    const out: number[] = [];
    for (const tok of t.replace(/[{}()[\]"']/g, ' ').split(/(?:\\x|0x|[\s,:;-])+/i)) {
      if (!tok) continue;
      if (!/^[0-9a-f]+$/i.test(tok)) throw new Error(`“${tok.slice(0, 12)}” is not hex — use digits 0–9 and a–f`);
      if (tok.length % 2 && tok.length > 1) throw new Error(`Hex input needs pairs of hex digits (“${tok.slice(0, 12)}${tok.length > 12 ? '…' : ''}” has ${tok.length})`);
      const p = tok.length === 1 ? `0${tok}` : tok;
      for (let i = 0; i < p.length; i += 2) out.push(parseInt(p.slice(i, i + 2), 16));
    }
    return Uint8Array.from(out);
  }
  let b64 = t.replace(/\s/g, '');
  if (/^data:/i.test(b64)) { const i = b64.indexOf(';base64,'); if (i < 0) throw new Error('This data: URL is not Base64'); b64 = b64.slice(i + 8); }
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(b64)) throw new Error('Not valid Base64 (letters, digits, + / or - _ only)');
  if (b64.length % 4 === 1) throw new Error('Not valid Base64: one character is missing or extra');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')); return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export const bindecode: Mount = (root) => {
  let fmt = 'protobuf', how = 'hex', sint = false, file: Uint8Array | null = null, dc: Devcore | null = null;
  const src = textarea({ rows: 5, mono: true, value: '08 96 01 12 07 74 65 73 74 69 6e 67 1a 03 08 96 01' }), out = h('pre', { class: 'mono out-pre bin-out' }), info = h('div');
  const sintT = toggle('Show zigzag (sint32 / sint64) readings', false, (v) => { sint = v; run(); });
  const run = async () => {
    dc ||= await devcore('bin'); clear(info); sintT.hidden = fmt !== 'protobuf';
    try {
      const b = file || parseBytes(src.value, how);
      const r = dc.bytesJson<{ text: string; count: number; error: string | null }>(`bin:${fmt}${fmt === 'protobuf' && sint ? '+sint' : ''}`, b); out.textContent = r.text;
      const what = `${b.length.toLocaleString('en-IN')} byte${b.length === 1 ? '' : 's'} · ${r.count} ${fmt === 'protobuf' ? 'top-level field' : 'value'}${r.count === 1 ? '' : 's'}`;
      if (r.error) info.append(note(`${r.error}. Shown below: the ${r.count} ${fmt === 'protobuf' ? 'field' : 'value'}${r.count === 1 ? '' : 's'} before that point.`, 'warn')); else info.append(note(what, 'ok'));
    } catch (e: any) { out.textContent = ''; info.append(note(e.message, 'warn')); }
  };
  src.addEventListener('input', debounce(() => { file = null; run(); }, 150));
  root.append(card(null, field('Format', segmented([['protobuf', 'Protobuf'], ['msgpack', 'MessagePack'], ['cbor', 'CBOR']], fmt, (v) => { fmt = v; run(); })), field('Typed input is', segmented([['hex', 'Hex'], ['base64', 'Base64']], how, (v) => { how = v; run(); })), sintT),
    card('Bytes', src, filePicker({ label: 'Open a binary file', onFiles: async ([f]) => { file = await readBytes(f); src.value = `(file: ${f.name}, ${file.length.toLocaleString('en-IN')} bytes)`; await run(); } })), card('Decoded', info, out, button('Copy', () => { if (!out.textContent) throw new Error('Nothing to copy yet'); return copy(out.textContent); }, { small: true, icon: 'Copy' })),
    note('No schema needed: protobuf shows field numbers and wire types (like protoc --decode_raw) — a field that is both readable text and a well-formed message is marked; CBOR uses the RFC 8949 diagnostic notation.', 'info'));
  run();
};
