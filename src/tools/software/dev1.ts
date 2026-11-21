// Software › small developer tabs: Base64, URL encoder / decoder, Epoch converter, UUID generator, Color converter,
// JWT decoder. Engines: devcore-enc (Base64, our Rust build of data-encoding), crypto.wasm (UUIDs from libsodium's
// random bytes), mathcore.wasm (colour maths), devcore-json (lossless pretty-printing of JWT claims), and the browser's
// own URL parser, TextDecoder and Date. Reading what a person typed (a timestamp, a colour, a token with "Bearer " in
// front) is string glue and lives here as exported functions with unit tests.
import { h, card, field, input, textarea, button, segmented, toggle, slider, select, clear, stack, note, copy, outputBox, downloadBlob, filePicker, readBytes, fmtBytes, type Mount } from '../../ui';
import { sodium } from '../../wasm/crypto';
import { mathcore } from '../../wasm/mathcore';
import { devcore, type Devcore } from '../../wasm/devcore';
import { parseColor, formatColor, rgbToHex, hexToRgb, over } from '../../lib/color';
import { debounce, kvRows } from './devui';

const N = (n: number) => n.toLocaleString('en-IN');
const plural = (n: number, w: string) => `${N(n)} ${w}${n === 1 ? '' : 's'}`;
const utf8 = new TextEncoder();
/** Bytes that are readable text: valid UTF-8 without control characters (tab, line breaks and form feed allowed). */
export const isText = (b: Uint8Array) => { try { const t = new TextDecoder('utf-8', { fatal: true }).decode(b); return !/[\u0000-\u0008\u000e-\u001f]/.test(t); } catch { return false; } };

// ================================================================== Base64
const B64_SHOW = 200_000, B64_FILE_MAX = 64 * 1024 * 1024;
/** What a file is, from its first bytes (for naming a decoded download). */
export function sniffBytes(b: Uint8Array): { ext: string; what: string } | null {
  const at = (s: string, o = 0) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
  const sig: Array<[boolean, string, string]> = [
    [at('\x89PNG\r\n\x1a\n'), 'png', 'a PNG image'], [b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'jpg', 'a JPEG image'], [at('GIF87a') || at('GIF89a'), 'gif', 'a GIF image'],
    [at('RIFF') && at('WEBP', 8), 'webp', 'a WebP image'], [at('RIFF') && at('WAVE', 8), 'wav', 'a WAV sound'], [at('%PDF-'), 'pdf', 'a PDF'], [at('PK\x03\x04'), 'zip', 'a ZIP archive (or docx / xlsx / jar)'],
    [b[0] === 0x1f && b[1] === 0x8b, 'gz', 'a gzip file'], [at('7z\xbc\xaf\x27\x1c'), '7z', 'a 7z archive'], [at('ftyp', 4), 'mp4', 'an MP4 / MOV / HEIC file'], [at('ID3') || (b[0] === 0xff && (b[1] & 0xe6) === 0xe2 && b.length > 3 && b[2] >> 4 !== 0 && b[2] >> 4 !== 15 && (b[2] & 0x0c) !== 0x0c), 'mp3', 'an MP3 sound'] /* a Layer III frame header — not FF FE, the UTF-16 byte-order mark */,
    [at('OggS'), 'ogg', 'an Ogg file'], [at('\0asm'), 'wasm', 'a WebAssembly module'], [at('SQLite format 3\0'), 'sqlite', 'an SQLite database'], [at('\x7fELF'), 'elf', 'a Linux program (ELF)'], [at('MZ'), 'exe', 'a Windows program'],
    [at('wOF2'), 'woff2', 'a WOFF2 font'], [at('wOFF'), 'woff', 'a WOFF font'], [at('\x1a\x45\xdf\xa3'), 'webm', 'a WebM / Matroska video'], [at('BM') && b.length > 14 && b[6] === 0 && b[7] === 0, 'bmp', 'a BMP image'],
  ];
  const hit = sig.find((x) => x[0]);
  return hit ? { ext: hit[1], what: hit[2] } : null;
}
/** Base64 as it turns up in the wild: zero-width characters and a byte-order mark removed, %3D %2B %2F (a value copied
 *  out of a URL) turned back into = + /. White space, missing or extra padding, the URL-safe alphabet and a data: URL
 *  header are handled by the engine. */
export const cleanB64 = (s: string) => s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/%(3d|2b|2f|0a|0d|20)/gi, (m) => decodeURIComponent(m));
const hexPreview = (b: Uint8Array) => { const o = new Array<string>(b.length); for (let i = 0; i < b.length; i++) o[i] = b[i].toString(16).padStart(2, '0'); return o.join(' '); };
export const base64: Mount = (root) => {
  let mode: 'enc' | 'dec' = 'enc', url = false, asData = false, autoData = false, dc: Devcore | null = null, seq = 0;
  let file: { name: string; type: string; bytes: Uint8Array } | null = null, full = '', decoded: Uint8Array | null = null, mime = '';
  const inp = textarea({ rows: 6, value: 'Hello, नमस्ते 👋', placeholder: 'Text, or Base64 to decode' });
  // a plain read-only box: Copy gives the whole text even when the box shows only its beginning
  const out = textarea({ rows: 6, mono: true, readonly: true }); out.setAttribute('aria-label', 'Output');
  const status = h('div'), opts = h('div', { class: 'row' });
  const show = (t: string) => { full = t; out.value = t.length > B64_SHOW ? t.slice(0, B64_SHOW) : t; if (t.length > B64_SHOW) status.append(note(`Showing the first ${N(B64_SHOW)} of ${N(t.length)} characters — Copy and Download give all of it.`, 'info')); };
  const run = async () => {
    const id = ++seq; dc ||= await devcore('enc'); if (id !== seq) return;
    clear(status); decoded = null; full = ''; mime = '';
    try {
      if (mode === 'enc') {
        const b = file ? file.bytes : utf8.encode(inp.value);
        if (!b.length) { out.value = ''; return; }
        const t = dc.encode(url && !asData ? 'base64url' : 'base64', b);
        status.append(note(`${plural(b.length, 'byte')} → ${plural(t.length, 'character')} of Base64${asData && url ? ' (a data: URL always uses the standard alphabet)' : ''}`, 'info'));
        show(asData ? `data:${file ? file.type || 'application/octet-stream' : 'text/plain;charset=utf-8'};base64,${t}` : t);
      } else {
        if (file && !isText(file.bytes)) throw new Error(`${file.name} is not a text file — to turn it into Base64, switch to Encode`);
        const text = cleanB64(file ? new TextDecoder().decode(file.bytes) : inp.value);
        if (!text.trim()) { out.value = ''; return; }
        mime = /^\s*data:([^;,]*)/i.exec(text)?.[1] || '';
        const b = dc.decode('base64', text); decoded = b;
        if (isText(b)) { status.append(note(`${plural(b.length, 'byte')} — shown as UTF-8 text`, 'ok')); show(new TextDecoder('utf-8', { ignoreBOM: true }).decode(b)); }
        else {
          const kind = sniffBytes(b), cut = b.length > B64_SHOW / 4;
          status.append(note(`${plural(b.length, 'byte')} of binary data${kind ? ` — it looks like ${kind.what}` : ''}. Shown as hex${cut ? ` (the first ${N(B64_SHOW / 4)} bytes)` : ''}; Download saves the file.`, 'info'));
          full = out.value = hexPreview(cut ? b.subarray(0, B64_SHOW / 4) : b);
        }
      }
    } catch (e: any) { out.value = ''; full = ''; decoded = null; status.append(note(`Cannot ${mode === 'enc' ? 'encode' : 'decode'}: ${e.message}`, 'warn')); }
  };
  const runD = debounce(() => { void run(); }, 100);
  const drawOpts = () => clear(opts).append(...(mode === 'enc' ? [toggle('URL-safe alphabet (-_ no padding)', url, (v) => { url = v; void run(); }), toggle('As a data: URL', asData, (v) => { asData = v; autoData = false; void run(); })] : [h('span', { class: 'muted' }, 'Reads standard and URL-safe Base64, with or without padding, line breaks, and data: URLs.')]));
  inp.addEventListener('input', () => { file = null; if (autoData) { asData = autoData = false; drawOpts(); } runD(); }); // typing ends the file, and the data: URL form it switched on
  const pick = filePicker({ compact: true, label: 'Use a file', hint: 'Encode: any file. Decode: a text file that holds Base64', onFiles: async ([f]) => {
    if (f.size > B64_FILE_MAX) throw new Error(`${f.name} is ${fmtBytes(f.size)} — this tab takes files up to ${fmtBytes(B64_FILE_MAX)} (the text form would not fit in the page)`);
    file = { name: f.name, type: f.type, bytes: await readBytes(f) }; inp.value = `(file: ${f.name}, ${plural(file.bytes.length, 'byte')})`;
    if (mode === 'enc' && !asData) { asData = autoData = true; drawOpts(); } // a file is usually wanted as a data: URL
    await run();
  } });
  root.append(card(null, stack(segmented([['enc', 'Encode'], ['dec', 'Decode']], mode, (v) => { mode = v; drawOpts(); void run(); }), opts, field('Input', inp), pick)), status,
    card('Output', out, h('div', { class: 'row' }, button('Copy', () => { if (!full) throw new Error('Nothing to copy yet'); return copy(full); }, { small: true, icon: 'Copy' }),
      button('Download', () => {
        if (mode === 'enc' ? !full : !decoded) throw new Error('Nothing to save yet');
        if (mode === 'enc') { downloadBlob(new Blob([full], { type: 'text/plain' }), `${file ? file.name : 'encoded'}.base64.txt`); return; }
        const own = /^(.+)\.base64\.txt$/i.exec(file?.name || ''), kind = sniffBytes(decoded!); // a file this tab made: photo.png.base64.txt → photo.png
        downloadBlob(new Blob([decoded as BlobPart], { type: mime || 'application/octet-stream' }), own ? own[1] : `decoded.${isText(decoded!) ? 'txt' : kind ? kind.ext : 'bin'}`);
      }, { small: true, icon: 'Download' }))));
  drawOpts(); void run();
};

// ================================================================== URL encoder / decoder
const wellFormed = (s: string) => ((s as any).toWellFormed ? (s as any).toWellFormed() as string : s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD'));
const CP1252 = () => new TextDecoder('windows-1252');
/** Percent-decoding that never gives up: runs of %XX are read as UTF-8; bytes that are not UTF-8 (%E9 from an old
 *  Latin-1 page) are read as Windows-1252; a % that is not followed by two hex digits stays as it is. */
export function decodeLenient(s: string): { text: string; legacy: number; stray: number } {
  let legacy = 0;
  const strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const text = s.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    const b = Uint8Array.from(run.match(/%../g)!, (x) => parseInt(x.slice(1), 16));
    try { return strict.decode(b); } catch { /* mixed or legacy bytes: go through them one sequence at a time */ }
    let o = '', i = 0;
    while (i < b.length) {
      const len = b[i] < 0x80 ? 1 : b[i] >= 0xf0 ? 4 : b[i] >= 0xe0 ? 3 : b[i] >= 0xc0 ? 2 : 0;
      let ok = false;
      if (len && i + len <= b.length) { try { o += strict.decode(b.subarray(i, i + len)); i += len; ok = true; } catch { /* not a sequence */ } }
      if (!ok) { o += CP1252().decode(b.subarray(i, i + 1)); i++; legacy++; }
    }
    return o;
  });
  return { text, legacy, stray: (s.match(/%(?![0-9a-f]{2})/gi) || []).length };
}
/** "+" stands for a space only in form data: the query of a URL (between ? and #), or text that is itself a query
 *  string (key=value&key=value). In a path, a mailto: address or a phone number it is a plus. */
export function plusToSpace(s: string): string {
  const q = s.indexOf('?');
  if (q >= 0) { const hsh = s.indexOf('#', q), end = hsh < 0 ? s.length : hsh; return s.slice(0, q) + s.slice(q, end).replace(/\+/g, ' ') + s.slice(end); }
  return /^[^=&\s:/]+=[^\s]*$/.test(s.trim()) && !/^[a-z][a-z0-9+.-]*:/i.test(s.trim()) ? s.replace(/\+/g, ' ') : s;
}
/** A whole URL made valid without spoiling it: escapes that are already there stay (%20 does not become %2520), an
 *  IPv6 host keeps its brackets and a non-Latin host name is written in Punycode — the browser's URL parser does this.
 *  Text that is not an absolute URL (a path, a query) gets every character escaped that cannot appear in a URL. */
export function encodeUrl(text: string): { out: string; how: 'url' | 'text' } {
  const s = wellFormed(text.trim());
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) { try { return { out: new URL(s).href, how: 'url' }; } catch { /* not parseable: escape it as text */ } }
  return { out: s.split(/(%[0-9a-f]{2})/i).map((part, i) => (i % 2 ? part : encodeURI(part))).join(''), how: 'text' };
}
const DEFAULT_PORT: Record<string, string> = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443', 'ftp:': '21' };
export const urlenc: Mount = (root) => {
  const inp = textarea({ rows: 4, value: 'https://example.com/search?q=chai & samosa&city=मुंबई#top' });
  const out = outputBox({ rows: 4, mono: true });
  const parts = h('div'), status = h('div'), opts = h('div', { class: 'row' });
  let mode = 'component', form = false, plus = true;
  const run = () => {
    clear(status); clear(parts);
    const src = inp.value;
    if (mode === 'component') {
      const s = wellFormed(src); if (s !== src) status.append(note('The text holds half of a surrogate pair (a broken character); it is encoded as U+FFFD.', 'warn'));
      const e = encodeURIComponent(s); out.value = form ? e.replace(/%20/g, '+') : e;
    } else if (mode === 'uri') {
      const r = encodeUrl(src); out.value = r.out;
      if (src.trim()) status.append(note(r.how === 'url' ? 'Read as a URL: escapes that were already there are kept, the host is normalised (lower case, Punycode for non-Latin names).' : 'Not an absolute URL (no scheme such as https:) — every character that cannot appear in a URL is escaped; existing %XX escapes are kept.', 'info'));
    } else {
      const r = decodeLenient(plus ? plusToSpace(src) : src); out.value = r.text;
      if (r.legacy) status.append(note(`${plural(r.legacy, 'byte')} ${r.legacy === 1 ? 'is' : 'are'} not UTF-8 — read as Windows-1252 (Latin-1), the usual older encoding.`, 'warn'));
      if (r.stray) status.append(note(`${plural(r.stray, '% sign')} ${r.stray === 1 ? 'is' : 'are'} not followed by two hex digits — left as written.`, 'warn'));
      if (/%[0-9a-f]{2}/i.test(r.text)) status.append(note(h('span', null, 'The result still holds %XX escapes — the text was encoded more than once. ', h('button', { type: 'button', class: 'link-btn', onclick: () => { inp.value = out.value; run(); } }, 'Decode again')), 'info'));
    }
    // the parts come from the URL itself (the encoded form), so an escaped & or = inside a value stays inside it
    let u: URL | null = null;
    for (const cand of mode === 'uri' ? [out.value] : [src.trim()]) { try { if (/^[a-z][a-z0-9+.-]*:/i.test(cand)) u = new URL(cand); } catch { /* not a URL */ } }
    if (!u) return;
    const dec = (x: string) => decodeLenient(x).text, both = (x: string) => (dec(x) !== x ? `${x}  →  ${dec(x)}` : x);
    const rows: Array<[string, string]> = [['Protocol', u.protocol], ['User', u.username ? dec(u.username) + (u.password ? ` (password: ${dec(u.password)})` : '') : ''], ['Host', u.hostname],
      ['Port', u.port || (DEFAULT_PORT[u.protocol] ? `${DEFAULT_PORT[u.protocol]} (default for ${u.protocol.slice(0, -1)})` : '')], ['Path', both(u.pathname)], ['Query', u.search], ['Hash', both(u.hash)]];
    const params = [...u.searchParams];
    parts.append(card('URL parts', h('div', { class: 'kv' }, ...rows.filter(([, v]) => v).flatMap(([k, v]) => [h('span', null, k), h('span', { class: 'mono' }, v)])),
      params.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Param'), h('th', null, 'Value'))), h('tbody', null, params.map(([k, v]) => h('tr', null, h('td', { class: 'mono' }, k), h('td', { class: 'mono' }, v)))))) : null));
  };
  const drawOpts = () => clear(opts).append(...(mode === 'component' ? [toggle('Form style: + for spaces', form, (v) => { form = v; run(); })] : mode === 'decode' ? [toggle('Read + as a space in query strings', plus, (v) => { plus = v; run(); })] : []));
  inp.addEventListener('input', run);
  root.append(card(null, stack(segmented([['component', 'Encode component'], ['uri', 'Encode full URL'], ['decode', 'Decode']], mode, (v) => { mode = v; drawOpts(); run(); }), opts, field('Input', inp))), status, card('Output', out), parts);
  drawOpts(); run();
};

// ================================================================== Epoch converter
export type StampUnit = 'auto' | 's' | 'ms' | 'us' | 'ns';
export interface Stamp { ms: number; unit: 's' | 'ms' | 'us' | 'ns' | 'date'; /** sub-millisecond digits the Date cannot hold, e.g. "123456" ns */ rest?: string; how?: string }
const UNIT_NAME = { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds', date: 'a date' } as const;
/** A timestamp as people paste it. Digits (with , _ or spaces as group separators, a sign, a decimal fraction): the
 *  unit is taken from the size — below 10^11 seconds, below 10^14 milliseconds, below 10^17 microseconds, else
 *  nanoseconds — unless `unit` says otherwise. Anything else is read as a date: ISO 8601, dd/mm/yyyy [hh:mm[:ss]]
 *  (day first, as in India), or whatever the browser's Date understands ("14 Nov 2023 22:13 UTC"). */
export function parseStamp(text: string, unit: StampUnit = 'auto'): Stamp | { error: string } {
  const t = text.trim(); if (!t) return { error: '' };
  const digits = t.replace(/(?<=\d)[,_ \u00a0\u202f](?=\d)/g, '');
  // 1.7e9 as a calculator or a spreadsheet writes it
  const sci = /^[+-]?\d+(?:\.\d+)?e\+?\d{1,2}$/i.test(digits) && Math.abs(Number(digits)) < 1e21 ? Number(digits).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 9 }) : digits;
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(sci);
  if (m) {
    const whole = m[2].replace(/^0+(?=\d)/, ''), frac = m[3] || '';
    const u = unit !== 'auto' ? unit : whole.length <= 11 ? 's' : whole.length <= 14 ? 'ms' : whole.length <= 17 ? 'us' : 'ns'; // by the number of digits: a 17-digit value is not a round double
    const shift = { s: 3, ms: 0, us: -3, ns: -6 }[u]; // decimal places between the unit and milliseconds
    // exact decimal arithmetic on the digit string: no rounding of 19-digit nanosecond values
    let all = whole + frac, point = whole.length + shift;
    if (point <= 0) { all = '0'.repeat(1 - point) + all; point = 1; }
    if (point > all.length) all = all.padEnd(point, '0');
    const msDigits = all.slice(0, point).replace(/^0+(?=\d)/, ''), rest = all.slice(point).replace(/0+$/, '');
    if (msDigits.length > 16) return { error: 'That is outside the range of dates (about ±275,000 years from 1970).' };
    const ms = (m[1] === '-' ? -1 : 1) * +msDigits;
    if (Math.abs(ms) > 8.64e15) return { error: 'That is outside the range of dates (about ±275,000 years from 1970).' };
    return { ms, unit: u, rest: rest || undefined };
  }
  if (/^[+-]?[\d.,_ ]+$/.test(t)) return { error: 'Not a number: check the separators (use digits, with an optional decimal point).' };
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy, optional time (local)
  const d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(am|pm)?)?$/i.exec(t);
  if (d) {
    const [day, mon, yr] = [+d[1], +d[2], +d[3]]; let hh = +(d[4] || 0);
    if (d[8]) { if (hh < 1 || hh > 12) return { error: 'With am / pm the hour is 1–12.' }; hh = (hh % 12) + (/pm/i.test(d[8]) ? 12 : 0); }
    const dt = new Date(yr, mon - 1, day, hh, +(d[5] || 0), +(d[6] || 0), +(d[7] || '0').padEnd(3, '0'));
    if (dt.getFullYear() !== yr || dt.getMonth() !== mon - 1 || dt.getDate() !== day || hh > 23 || +(d[5] || 0) > 59 || +(d[6] || 0) > 59) return { error: `${t} is not a real date (read as day/month/year).` };
    return { ms: dt.getTime(), unit: 'date', how: 'day/month/year, your local time' };
  }
  const ms = Date.parse(t);
  if (isNaN(ms)) return { error: 'Not a timestamp or a date this tab can read. Try 1700000000, 2023-11-14T22:13:20Z or 14/11/2023 22:13.' };
  const zoned = /(z|[+-]\d{2}:?\d{2}|\b(?:utc|gmt)\b)\s*$/i.test(t), dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(t);
  return { ms, unit: 'date', how: zoned ? 'with the time zone it names' : dateOnly ? 'a date alone is midnight UTC' : 'your local time' };
}
const pad2 = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');
/** 2023-11-15T03:43:20+05:30 — ISO 8601 in the local zone, with its offset. */
export function isoLocal(ms: number): string {
  const d = new Date(ms), off = -d.getTimezoneOffset();
  return `${d.getFullYear() < 0 ? '-' : ''}${pad2(d.getFullYear(), 4)}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${d.getMilliseconds() ? `.${pad2(d.getMilliseconds(), 3)}` : ''}${off >= 0 ? '+' : '-'}${pad2(Math.floor(Math.abs(off) / 60))}:${pad2(Math.abs(off) % 60)}`;
}
export function relTime(ms: number, now = Date.now()): string {
  const d = (ms - now) / 1000, a = Math.abs(d);
  const u: Array<[number, Intl.RelativeTimeFormatUnit]> = [[31556952, 'year'], [2629746, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
  let i = u.findIndex(([x]) => a >= x); if (i < 0) i = 5;
  if (i > 0 && Math.round(a / u[i][0]) * u[i][0] >= u[i - 1][0]) i--; // 59.99 minutes is "1 hour", not "60 minutes"
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(d / u[i][0]), u[i][1]);
}
export const epoch: Mount = (root) => {
  const now = h('div', { class: 'big-value mono', 'aria-label': 'Current Unix time in seconds' });
  const upd = () => { now.textContent = String(Math.floor(Date.now() / 1000)); };
  upd(); const tick = setInterval(upd, 250);
  const ts = input({ value: String(Math.floor(Date.now() / 1000)), attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': 'Timestamp or date' } });
  const dt = input({ type: 'datetime-local', attrs: { step: '1', 'aria-label': 'Date and time picker' } });
  const out = h('div'); let unit: StampUnit = 'auto';
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const show = (fromPicker = false) => {
    const r = parseStamp(ts.value, unit);
    ts.classList.toggle('bad', 'error' in r && !!r.error);
    if ('error' in r) { clear(out); if (r.error) out.append(note(r.error, 'warn')); return; }
    const d = new Date(r.ms), sec = Math.floor(r.ms / 1000);
    if (!fromPicker) { const l = isoLocal(r.ms); dt.value = d.getFullYear() >= 1 && d.getFullYear() <= 9999 ? l.slice(0, 19) : ''; }
    clear(out).append(note(r.unit === 'date' ? `Read as a date (${r.how}).` : `Read as ${UNIT_NAME[r.unit]}${unit === 'auto' ? ' (from the number of digits — choose the unit above if that is wrong)' : ''}.`, 'info'),
      kvRows([['Seconds', String(sec)], ['Milliseconds', String(r.ms)], r.rest ? ['Beyond milliseconds', `0.${r.rest} ms more (a date holds whole milliseconds)`] : ['', ''],
        ['ISO 8601 (UTC)', d.toISOString()], [`ISO 8601 (${zone})`, isoLocal(r.ms)], ['UTC', d.toUTCString()], ['Local', d.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'long' })], ['Relative', relTime(r.ms)]]));
  };
  ts.addEventListener('input', () => show());
  dt.addEventListener('input', () => { if (!dt.value) return; const ms = new Date(dt.value).getTime(); if (isNaN(ms)) return; ts.value = String(Math.floor(ms / 1000)); unit = 'auto'; unitSel.value = 'auto'; show(true); });
  const unitSel = select<StampUnit>([['auto', 'Auto-detect'], ['s', 'Seconds'], ['ms', 'Milliseconds'], ['us', 'Microseconds'], ['ns', 'Nanoseconds']], unit, (v) => { unit = v; show(); });
  root.append(card('Current Unix time', h('div', { class: 'row' }, now, button('Use now', () => { ts.value = String(Math.floor(Date.now() / 1000)); show(); }, { small: true, icon: 'Clock' }))),
    card(null, h('div', { class: 'grid2' }, field('Timestamp or date', ts, 'e.g. 1700000000, 1700000000000, 2023-11-14T22:13:20Z, 14/11/2023 22:13'), field('…or pick a date & time (local)', dt)), field('Unit of a number', unitSel)), card('Converted', out));
  show();
  return () => clearInterval(tick);
};

// ================================================================== UUID
const UUID_VERSIONS: Record<number, string> = { 1: 'time-based (Gregorian time + node)', 2: 'DCE security', 3: 'name-based (MD5)', 4: 'random', 5: 'name-based (SHA-1)', 6: 'time-ordered (Gregorian time, sortable)', 7: 'time-ordered (Unix time + random)', 8: 'custom' };
export interface UuidInfo { canonical: string; kind: 'nil' | 'max' | 'uuid'; variant: string; version: number | null; versionName: string; time?: string; clockSeq?: number; node?: string }
/** What a UUID says about itself. Accepts upper or lower case, with or without hyphens, {braces}, urn:uuid: and quotes. */
export function inspectUuid(text: string): UuidInfo | null {
  const t = text.trim().replace(/^["']|["']$/g, '').replace(/^urn:uuid:/i, '').replace(/^\{(.*)\}$/, '$1');
  const m = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i.exec(t);
  if (!m) return null;
  const p = m.slice(1).map((x) => x.toLowerCase()), canonical = p.join('-'), hex = p.join('');
  if (/^0+$/.test(hex)) return { canonical, kind: 'nil', variant: '—', version: null, versionName: 'Nil UUID (all zeros)' };
  if (/^f+$/.test(hex)) return { canonical, kind: 'max', variant: '—', version: null, versionName: 'Max UUID (all ones)' };
  const vb = parseInt(p[3][0], 16);
  const variant = vb < 8 ? 'NCS (reserved, 0xxx)' : vb < 12 ? 'RFC 9562 / RFC 4122 (10xx)' : vb < 14 ? 'Microsoft (110x)' : 'reserved (111x)';
  if (vb < 8 || vb >= 12) return { canonical, kind: 'uuid', variant, version: null, versionName: 'not defined for this variant' };
  const version = parseInt(p[2][0], 16), out: UuidInfo = { canonical, kind: 'uuid', variant, version, versionName: UUID_VERSIONS[version] || 'unknown' };
  const greg = (ticks: bigint) => { const ms = Number((ticks - 0x01b21dd213814000n) / 10000n); return Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : undefined; };
  if (version === 7) out.time = new Date(parseInt(p[0] + p[1], 16)).toISOString();
  if (version === 1) out.time = greg(BigInt(`0x${p[2].slice(1)}${p[1]}${p[0]}`));
  if (version === 6) out.time = greg(BigInt(`0x${p[0]}${p[1]}${p[2].slice(1)}`));
  if (version === 1 || version === 6) { out.clockSeq = parseInt(p[3], 16) & 0x3fff; out.node = `${p[4].match(/../g)!.join(':')}${parseInt(p[4].slice(0, 2), 16) & 1 ? ' (random — not a network card address)' : ''}`; }
  return out;
}
export const uuid: Mount = async (root) => {
  const na = await sodium();
  let ver = 'v4', n = 5, upper = false, hyph = true, raw: string[] = [];
  const out = outputBox({ rows: 8, mono: true, label: 'UUIDs' });
  const check = input({ placeholder: 'Paste a UUID to inspect', attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': 'UUID to inspect' } });
  const info = h('div');
  // the switches change how the same UUIDs are written; only Generate (or the version / count) makes new ones
  const render = () => { out.value = raw.map((u) => { const x = hyph ? u : u.replace(/-/g, ''); return upper ? x.toUpperCase() : x; }).join('\n'); };
  const gen = () => { raw = Array.from({ length: n }, () => na.uuid(ver === 'v7' ? 7 : 4)); render(); };
  check.addEventListener('input', () => {
    clear(info);
    if (!check.value.trim()) return;
    const u = inspectUuid(check.value);
    if (!u) { info.append(note('Not a UUID: it needs 32 hex digits (hyphens, {braces} and urn:uuid: are fine).', 'warn')); return; }
    info.append(kvRows([['Canonical form', u.canonical], ['Version', u.version === null ? u.versionName : `${u.version} — ${u.versionName}`], ['Variant', u.variant], ['Time inside it', u.time ? `${u.time} (${relTime(Date.parse(u.time))})` : ''],
      ['Clock sequence', u.clockSeq === undefined ? '' : String(u.clockSeq)], ['Node', u.node || '']]));
  });
  root.append(card(null, stack(segmented([['v4', 'v4 (random)'], ['v7', 'v7 (time-ordered)']], ver, (v) => { ver = v; gen(); }), slider({ label: 'How many', min: 1, max: 100, value: n, onInput: (v) => { n = v; gen(); } }),
    h('div', { class: 'row' }, toggle('Uppercase', false, (v) => { upper = v; render(); }), toggle('Hyphens', true, (v) => { hyph = v; render(); })))), card(null, out), card('Inspect', check, info),
    h('div', { class: 'actions' }, button('Generate', gen, { variant: 'primary', icon: 'RefreshCw' }), button('Copy all', () => copy(out.value), { icon: 'Copy' })));
  gen();
};

// ================================================================== Color converter
export const color: Mount = async (root) => {
  const mc = await mathcore();
  let rgb: number[] = [79, 70, 229], alpha = 1;
  const picker = h('input', { type: 'color', class: 'color-picker', 'aria-label': 'Pick a colour' });
  const mk = (label: string) => input({ attrs: { class: 'input mono', spellcheck: 'false', 'aria-label': label } });
  const hex = mk('HEX'), rgbI = mk('RGB'), hsl = mk('HSL'), ok = mk('OKLCH');
  const swatch = h('div', { class: 'swatch' }), info = h('div', { class: 'kv' }), status = h('div');
  const alphaS = slider({ label: 'Opacity', min: 0, max: 100, value: 100, unit: '%', onInput: (v) => { alpha = v / 100; sync(); } });
  const sync = (except?: HTMLInputElement) => {
    const f = formatColor(rgb, alpha, mc), solid = rgbToHex(rgb[0], rgb[1], rgb[2]);
    if (except !== hex) hex.value = f.hex;
    if (except !== rgbI) rgbI.value = f.rgb;
    if (except !== hsl) hsl.value = f.hsl;
    if (except !== ok) ok.value = f.oklch;
    [hex, rgbI, hsl, ok].forEach((x) => { if (x !== except) x.classList.remove('bad'); });
    picker.value = solid;
    // a see-through colour is shown over a checkerboard
    swatch.style.background = alpha < 1 ? `linear-gradient(${f.rgb}, ${f.rgb}), repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 0 0 / 20px 20px` : solid;
    const onW = over([rgb[0], rgb[1], rgb[2], alpha], [255, 255, 255]), onB = over([rgb[0], rgb[1], rgb[2], alpha], [0, 0, 0]);
    clear(info).append(h('span', null, 'Contrast vs white'), h('span', null, `${mc.contrast(onW, [255, 255, 255]).toFixed(2)} : 1`), h('span', null, 'Contrast vs black'), h('span', null, `${mc.contrast(onB, [0, 0, 0]).toFixed(2)} : 1`));
  };
  const bind = (el: HTMLInputElement, hint: 'hex' | 'rgb' | 'hsl' | 'oklch') => el.addEventListener('input', () => {
    clear(status);
    const c = parseColor(el.value, mc, hint);
    el.classList.toggle('bad', !c && !!el.value.trim());
    if (!c) { if (el.value.trim()) status.append(note('Not a colour yet. Each box takes any CSS colour: #4f46e5, rgb(79 70 229), hsl(243 75% 59%), oklch(51% 0.23 277), or a name such as teal.', 'warn')); return; }
    rgb = c.rgb; alpha = c.alpha; alphaS.value = Math.round(alpha * 100);
    if (c.note) status.append(note(c.note, 'info'));
    sync(el);
  });
  picker.addEventListener('input', () => { clear(status); rgb = hexToRgb(picker.value)!; sync(); });
  bind(hex, 'hex'); bind(rgbI, 'rgb'); bind(hsl, 'hsl'); bind(ok, 'oklch');
  root.append(card(null, h('div', { class: 'color-top' }, swatch, picker), alphaS), card(null, h('div', { class: 'grid2' }, field('HEX', hex), field('RGB', rgbI), field('HSL', hsl), field('OKLCH', ok)), status), card('Accessibility', info),
    note('Each box takes any CSS colour — paste #hex (3, 4, 6 or 8 digits), rgb(), hsl(), hwb(), oklch(), oklab() or a colour name; the others follow.', 'info'));
  sync();
};

// ================================================================== JWT decoder
export interface JwtPart { text: string; json: unknown; isJson: boolean; utf8: boolean }
export interface Jwt { kind: 'jws' | 'jwe'; header: JwtPart; payload: JwtPart | null; signatureBytes: number; notes: string[] }
const b64url = (s: string): Uint8Array | null => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(t) || t.length % 4 === 1) return null;
  try { return Uint8Array.from(atob(t.padEnd(Math.ceil(t.length / 4) * 4, '=')), (c) => c.charCodeAt(0)); } catch { return null; }
};
const jwtPart = (b: Uint8Array): JwtPart => {
  let text: string, ok = true;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { text = new TextDecoder().decode(b); ok = false; }
  try { return { text, json: JSON.parse(text), isJson: true, utf8: ok }; } catch { return { text, json: undefined, isJson: false, utf8: ok }; }
};
/** The token inside whatever was pasted: "Authorization: Bearer <token>", quotes, line breaks inside the token. */
export const cleanJwt = (s: string) => s.trim().replace(/^authorization\s*:\s*/i, '').replace(/^bearer\s+/i, '').replace(/^["'`]+|["'`,;]+$/g, '').replace(/\s+/g, '');
/** Split and decode a JWT. Throws an Error that says which part is wrong. */
export function parseJwt(input: string): Jwt {
  const t = cleanJwt(input), parts = t.split('.');
  if (!t) throw new Error('Paste a token.');
  if (parts.length !== 3 && parts.length !== 5) throw new Error(parts.length === 2 ? 'This has two parts — a JWT has three (header.payload.signature). An unsigned token still ends with a dot.' : `A JWT has three parts separated by dots (header.payload.signature); this has ${parts.length}.`);
  const hb = b64url(parts[0]); if (!hb || !hb.length) throw new Error('The first part (the header) is not Base64URL.');
  const header = jwtPart(hb);
  if (!header.isJson || header.json === null || typeof header.json !== 'object' || Array.isArray(header.json)) throw new Error('The header does not decode to a JSON object — this is not a JWT.');
  const notes: string[] = [], hd = header.json as Record<string, unknown>;
  if (parts.length === 5) {
    notes.push(`This is an encrypted token (JWE${typeof hd.alg === 'string' ? `, key management ${hd.alg}` : ''}${typeof hd.enc === 'string' ? `, content encryption ${hd.enc}` : ''}). Only the header can be read without the key — the claims are inside the encrypted part.`);
    return { kind: 'jwe', header, payload: null, signatureBytes: 0, notes };
  }
  const pb = b64url(parts[1]); if (!pb) throw new Error('The second part (the payload) is not Base64URL.');
  const payload = jwtPart(pb), sb = b64url(parts[2]);
  if (!sb) notes.push('The third part (the signature) is not valid Base64URL — the token was cut or changed.');
  if (!payload.utf8) notes.push('The payload is not valid UTF-8 — broken characters are shown as �.');
  if (!payload.isJson) notes.push('The payload is not JSON (a signed token may carry any bytes) — it is shown as text.');
  if (typeof hd.alg === 'string' && hd.alg.toLowerCase() === 'none') notes.push('alg is "none": this token is NOT signed — anyone can change its contents. A server must never accept it.');
  else if (sb && !sb.length) notes.push('The signature part is empty although the header names an algorithm.');
  return { kind: 'jws', header, payload, signatureBytes: sb ? sb.length : 0, notes };
}
/** A time claim (exp, nbf, iat…) as milliseconds, with what is odd about it. JWT times are whole seconds (NumericDate). */
export function jwtTime(v: unknown): { ms: number; odd?: string } | null {
  let n: number, odd: string | undefined;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) { n = +v; odd = 'is written as a string (the standard asks for a number)'; }
  else return null;
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) >= 1e11) { odd = [odd, 'looks like milliseconds (JWT times are in seconds)'].filter(Boolean).join(' and '); n /= 1000; }
  const ms = n * 1000;
  return Math.abs(ms) > 8.64e15 ? null : { ms, odd };
}
const TIME_CLAIMS: Array<[string, string]> = [['iat', 'Issued at'], ['nbf', 'Not valid before'], ['exp', 'Expires'], ['auth_time', 'Signed in at'], ['updated_at', 'Profile updated']];
export const jwt: Mount = (root) => {
  const sample = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlN1cGVyVXRpbHMiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTgwMDAwMDAwMH0.UdoTphDd2UORY8tjT07pGVCYpdtk3fWdUQbq1H0EjTY'; // HS256, secret "supertools"
  const ta = textarea({ rows: 5, mono: true, value: sample });
  const out = h('div', { class: 'stack' });
  let dc: Devcore | null = null, seq = 0;
  const run = async () => {
    const id = ++seq; dc ||= await devcore('json'); if (id !== seq) return;
    clear(out);
    if (!ta.value.trim()) return;
    let t: Jwt;
    try { t = parseJwt(ta.value); } catch (e: any) { out.append(note(e.message, 'err')); return; }
    // pretty-printed by the lossless formatter: a 20-digit id is not rounded and the key order is kept
    const pretty = (p: JwtPart) => { if (!p.isJson) return p.text; try { return dc!.bytesJson<{ out: string }>('jsonfmt:2:0', utf8.encode(p.text)).out; } catch { return p.text; } };
    const box = (label: string, p: JwtPart, rows: number) => { const b = outputBox({ rows, mono: true, label }); b.value = pretty(p); return b; };
    out.append(card('Header', box('Header', t.header, 5)));
    if (t.payload) {
      const pl = t.payload.json, claims = pl !== null && typeof pl === 'object' && !Array.isArray(pl) ? (pl as Record<string, unknown>) : null;
      const now = Date.now(), times: Array<[string, string]> = [], odd: string[] = [];
      for (const [k, label] of TIME_CLAIMS) {
        if (!claims || !(k in claims)) continue;
        const x = jwtTime(claims[k]);
        if (!x) { odd.push(`"${k}" is not a time this tab can read (${JSON.stringify(claims[k])?.slice(0, 40)}).`); continue; }
        times.push([`${label} (${k})`, `${new Date(x.ms).toISOString().replace('.000Z', 'Z')} · ${new Date(x.ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'long' })} · ${relTime(x.ms, now)}`]);
        if (x.odd) odd.push(`"${k}" ${x.odd}.`);
      }
      out.append(card('Payload', box('Payload', t.payload, 10), times.length ? kvRows(times) : null));
      const exp = claims ? jwtTime(claims.exp) : null, nbf = claims ? jwtTime(claims.nbf) : null;
      if (exp) out.append(note(exp.ms <= now ? `This token has EXPIRED (${relTime(exp.ms, now)}).` : `Token is not expired — it expires ${relTime(exp.ms, now)}.`, exp.ms <= now ? 'err' : 'ok'));
      else if (claims && !('exp' in claims)) out.append(note('No "exp" claim: this token never expires by itself.', 'info'));
      if (nbf && nbf.ms > now) out.append(note(`This token is NOT VALID YET (its "nbf" time is ${relTime(nbf.ms, now)}).`, 'warn'));
      odd.forEach((x) => out.append(note(x, 'warn')));
      out.append(kvRows([['Signature', `${plural(t.signatureBytes, 'byte')}${typeof (t.header.json as any).alg === 'string' ? ` · algorithm ${(t.header.json as any).alg}` : ''}`]]));
    }
    t.notes.forEach((x) => out.append(note(x, 'warn')));
    out.append(note('Decoded only — the signature is NOT verified (that needs the secret or public key). Nothing leaves this page.', 'warn'));
  };
  ta.addEventListener('input', () => { void run(); });
  root.append(card(null, field('JWT', ta)), out);
  void run();
};
