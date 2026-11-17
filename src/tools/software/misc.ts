// Software › misc tabs. Parsers and matchers run in our Rust devcore.wasm (cron, semver, glob, patch, hex dump, search);
// string escaping, Unicode inspection (browser-native Intl / RegExp Unicode properties), log filtering (native RegExp)
// and the SLA / transfer arithmetic are plain TypeScript glue.
import { h, card, field, input, textarea, select, segmented, toggle, slider, clear, note, copy, button, outputBox, filePicker, readBytes, fmtBytes, downloadBlob, toast, type Mount } from '../../ui';
import { devcore, setZone, type Devcore } from '../../wasm/devcore';
import { kvRows, show, table, debounce } from './devui';
import { localZone } from '../../lib/tz';

const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const chips = (items: Array<[string, string]>, pick: (v: string) => void) => h('div', { class: 'chips' }, items.map(([v, l]) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => pick(v) }, l)));

// ------------------------------------------------------------------ Cron explainer
const ZONES = ['UTC', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney'];
export const cron: Mount = async (root) => {
  const dc = await devcore('cron');
  const local = localZone();
  const expr = input({ value: '*/15 9-17 * * 1-5', attrs: { class: 'input mono big-input', spellcheck: 'false', 'aria-label': 'Cron expression' } });
  const zones = [...new Set([local, ...ZONES])];
  const tz = select(zones.map((z) => [z, z === local ? `${z} (this device)` : z] as [string, string]), local);
  const count = select([['5', '5'], ['10', '10'], ['25', '25']], '10');
  const out = h('div');
  const FIELDS5 = ['Minute', 'Hour', 'Day of month', 'Month', 'Day of week'], RANGE5 = ['0–59', '0–23', '1–31 (L, W)', '1–12 or JAN–DEC', '0–7 or SUN–SAT (0 and 7 = Sunday; L, #)'];
  const run = () => show(out, () => {
    const e = expr.value.trim(); if (!e) return note('Enter a cron expression.', 'info');
    setZone(tz.value);
    const r = dc.json('cron', { expr: e, from: Date.now(), count: +count.value });
    const parts = e.startsWith('@') ? [] : e.split(/\s+/);
    const names = parts.length === 6 ? ['Second', ...FIELDS5] : parts.length === 7 ? ['Second', ...FIELDS5, 'Year'] : FIELDS5;
    const ranges = parts.length >= 6 ? ['0–59', ...RANGE5, '…'] : RANGE5;
    const fmt = (ms: number, zone: string) => new Date(ms).toLocaleString('en-IN', { timeZone: zone, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: parts.length >= 6 ? '2-digit' : undefined, hour12: false });
    const rel = (ms: number) => { const m = Math.round((ms - Date.now()) / 60000); return m < 60 ? `in ${m} min` : m < 1440 * 2 ? `in ${Math.round(m / 60)} h` : `in ${Math.round(m / 1440)} days`; };
    return [card('Meaning', h('p', { class: 'cron-desc' }, r.description), parts.length ? table(['Field', 'Value', 'Allowed'], parts.map((p, i) => [names[i] || '?', p, ranges[i] || ''])) : ''),
      r.next.length ? card(`Next ${r.next.length} run${r.next.length === 1 ? '' : 's'} (${tz.value})`, table(['When', 'ISO 8601 (UTC)', ''], r.next.map((n: any) => [fmt(n.ms, tz.value), new Date(n.ms).toISOString().replace('.000Z', 'Z'), rel(n.ms)]), 'tbl cron-next'),
        r.next.length < +count.value ? note(`Only ${r.next.length} run${r.next.length === 1 ? '' : 's'} left — the schedule ends after that.`, 'info') : '')
        : card('Next runs', note('This schedule never runs: no such date or time comes up (for example 30 February or 31 April, or a year that has passed).', 'warn'))];
  });
  expr.addEventListener('input', debounce(run, 150)); tz.addEventListener('change', run); count.addEventListener('change', run);
  root.append(card(null, field('Cron expression (5 fields, or 6 with seconds first)', expr), h('div', { class: 'grid2' }, field('Time zone', tz), field('How many runs', count)),
    chips([['* * * * *', 'every minute'], ['*/5 * * * *', 'every 5 min'], ['0 * * * *', 'hourly'], ['0 9 * * 1-5', '9 am weekdays'], ['30 18 * * 5', 'Fri 6:30 pm'], ['0 0 1 * *', 'monthly'], ['0 0 L * *', 'last day of month'], ['0 10 * * 1#1', 'first Monday'], ['@daily', '@daily'], ['*/30 * * * * *', 'every 30 s (6 fields)']], (v) => { expr.value = v; run(); })),
  out, note('Standard Vixie/POSIX cron: if both day-of-month and day-of-week are set, a day matching EITHER runs the job. Times are computed for the chosen time zone, including daylight-saving changes.', 'info'));
  run();
};

// ------------------------------------------------------------------ Semver
export const semver: Mount = async (root) => {
  const dc = await devcore('semver');
  const range = input({ value: '^1.2.0', attrs: { class: 'input mono', 'aria-label': 'Range' } });
  const vers = textarea({ rows: 8, mono: true, value: '1.1.9\n1.2.0\n1.2.3\n1.10.0\n2.0.0\n1.3.0-beta.1\nnot-a-version' });
  let pre = false;
  const preid = input({ value: 'beta', attrs: { class: 'input mono', 'aria-label': 'Pre-release id' } });
  const out = h('div');
  const run = () => show(out, () => {
    const r = dc.json('semver', { range: range.value, versions: lines(vers.value), prerelease: pre, preid: preid.value.trim() });
    const res: Node[] = [];
    if (range.value.trim()) res.push(card('Range', kvRows([['Means', r.range.normalized], ['Lowest possible', r.range.min || '—'], ['Highest listed match', r.max || 'none'], ['Lowest listed match', r.min || 'none']])));
    res.push(card('Versions', table(range.value.trim() ? ['Version', 'Valid', `Matches ${range.value.trim()}`] : ['Version', 'Valid'], r.rows.map((x: any) => {
      const row: Array<string | Node> = [x.input, x.valid ? (x.prerelease ? 'yes (pre-release)' : 'yes') : 'no — not SemVer'];
      if (range.value.trim()) row.push(x.valid ? h('span', { class: x.satisfies ? 'ok-text' : 'muted' }, x.satisfies ? '✓ yes' : '✗ no') : '—');
      return row;
    }))), card('Sorted (oldest → newest)', h('pre', { class: 'mono out-pre semver-sorted' }, r.sorted.join('\n') || '—')));
    if (r.bumps) res.push(card(`Next versions after ${r.rows.find((x: any) => x.valid)?.version}`, kvRows(Object.entries(r.bumps).map(([k, v]) => [k, (v as string) || '—']))));
    return res;
  });
  [range, vers, preid].forEach((x) => x.addEventListener('input', debounce(run, 120)));
  root.append(card(null, field('Range (npm syntax: ^ ~ x * >= < || and a - b)', range), field('Versions (one per line)', vers), h('div', { class: 'row' }, toggle('Include pre-releases', false, (v) => { pre = v; run(); }), field('Pre-release id for bumps', preid)),
    chips([['^1.2.0', '^1.2.0'], ['~1.2.0', '~1.2.0'], ['>=1.2.0 <2', '>=1.2.0 <2'], ['1.x || 2.x', '1.x || 2.x'], ['1.2.0 - 1.10.0', 'hyphen range'], ['*', 'any']], (v) => { range.value = v; run(); })), out);
  run();
};

// ------------------------------------------------------------------ Glob tester
export const glob: Mount = async (root) => {
  const dc = await devcore('glob');
  const pats = textarea({ rows: 5, mono: true, value: 'src/**/*.ts\n!src/**/*.test.ts\n*.{json,md}' });
  const paths = textarea({ rows: 10, mono: true, value: 'package.json\nREADME.md\nsrc/main.ts\nsrc/ui.ts\nsrc/tools/text.ts\nsrc/tools/text.test.ts\ntests/e2e.mjs\n.env\ndocs/notes.md' });
  let ci = false, dot = true;
  const out = h('div');
  const run = () => show(out, () => {
    const r = dc.json('glob', { patterns: pats.value.split(/\r?\n/), paths: paths.value.split(/\r?\n/), caseInsensitive: ci, dot });
    const n = r.rows.filter((x: any) => x.match).length;
    return [...r.errors.map((e: any) => note(`Pattern "${e.pattern}": ${e.error}`, 'warn')),
      card(`${n} of ${r.rows.length} paths match`, h('div', { class: 'glob-list' }, r.rows.map((x: any) => h('div', { class: `glob-row ${x.match ? 'm' : 'n'}` }, h('span', { class: 'glob-mark' }, x.match ? '✓' : '✗'), h('span', { class: 'mono' }, x.path), x.by ? h('span', { class: 'muted mono' }, x.by) : null))))];
  });
  [pats, paths].forEach((x) => x.addEventListener('input', debounce(run, 120)));
  root.append(h('div', { class: 'grid2' }, card(null, field('Patterns (one per line; ! excludes; # comment)', pats), h('div', { class: 'row' }, toggle('Case-insensitive', false, (v) => { ci = v; run(); }), toggle('Match dot files', true, (v) => { dot = v; run(); }))), card(null, field('Paths to test (one per line)', paths))), out,
    note('* and ? stay inside one folder, ** crosses folders, {a,b} = either, [abc] / [!abc] = character sets. Like .gitignore, the last pattern that matches decides.', 'info'));
  run();
};

// ------------------------------------------------------------------ Patch applier
export const patch: Mount = async (root) => {
  const dc = await devcore('patch');
  const orig = textarea({ rows: 10, mono: true, placeholder: 'Original text' }), diff = textarea({ rows: 10, mono: true, placeholder: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n …' });
  const res = outputBox({ rows: 10, mono: true }); let reverse = false; let name = 'patched.txt';
  const status = h('div');
  const run = () => show(status, () => {
    res.value = ''; // never leave an old result on screen when this patch fails
    if (!diff.value.trim()) { return note('Paste a unified diff (from git diff or diff -u).', 'info'); }
    const r = dc.json('patch', { original: orig.value, patch: diff.value, reverse });
    res.value = r.result;
    return note(`Applied ${r.hunks} hunk${r.hunks === 1 ? '' : 's'}: +${r.added} −${r.removed} lines${r.files > 1 ? ' (only the first file of this multi-file diff is used)' : ''}.`, 'ok');
  });
  [orig, diff].forEach((x) => x.addEventListener('input', debounce(run, 150)));
  const loader = (ta: HTMLTextAreaElement, label: string, setName = false) => filePicker({ label, onFiles: async ([f]) => { ta.value = await f.text(); if (setName) name = f.name; run(); } });
  root.append(h('div', { class: 'grid2' }, card('Original', orig, loader(orig, 'Open original file', true)), card('Patch (unified diff)', diff, loader(diff, 'Open .diff / .patch'))),
    card(null, toggle('Reverse (undo the patch)', false, (v) => { reverse = v; run(); }), status), card('Result', res, h('div', { class: 'row' }, button('Copy', () => copy(res.value), { small: true, icon: 'Copy' }), button('Download', () => { if (!res.value) throw new Error('Nothing to save yet'); downloadBlob(new Blob([res.value], { type: 'text/plain' }), name); }, { small: true, icon: 'Download' }))));
  run();
};

// ------------------------------------------------------------------ Hex viewer
const MAGIC: Array<[number, number[] | string, string]> = [
  [0, [0x89, 0x50, 0x4e, 0x47], 'PNG image'], [0, [0xff, 0xd8, 0xff], 'JPEG image'], [0, 'GIF8', 'GIF image'], [8, 'WEBP', 'WebP image'], [4, 'ftypheic', 'HEIC image'], [4, 'ftypavif', 'AVIF image'],
  [4, 'ftyp', 'MP4 / MOV / M4A (ISO media)'], [0, '%PDF', 'PDF document'], [0, [0x50, 0x4b, 0x03, 0x04], 'ZIP archive (also .docx/.xlsx/.jar/.apk/.epub)'], [0, [0x1f, 0x8b], 'gzip'],
  [0, 'BZh', 'bzip2'], [0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], 'XZ'], [0, [0x28, 0xb5, 0x2f, 0xfd], 'Zstandard'], [0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], '7-Zip archive'], [0, 'Rar!', 'RAR archive'],
  [257, 'ustar', 'tar archive'], [0, [0x7f, 0x45, 0x4c, 0x46], 'ELF executable (Linux)'], [0, 'MZ', 'Windows executable (PE/DOS)'], [0, [0xcf, 0xfa, 0xed, 0xfe], 'Mach-O executable (macOS)'],
  [0, [0x00, 0x61, 0x73, 0x6d], 'WebAssembly module'], [0, 'SQLite format 3', 'SQLite database'], [0, 'RIFF', 'RIFF (WAV / AVI / WebP)'], [0, 'ID3', 'MP3 audio (ID3 tag)'], [0, [0xff, 0xfb], 'MP3 audio'],
  [0, 'fLaC', 'FLAC audio'], [0, 'OggS', 'Ogg (Vorbis / Opus)'], [0, [0x1a, 0x45, 0xdf, 0xa3], 'Matroska / WebM'], [0, [0xd0, 0xcf, 0x11, 0xe0], 'MS Office 97–2003 (OLE)'], [0, '{\\rtf', 'RTF document'],
  [0, [0x49, 0x49, 0x2a, 0x00], 'TIFF (little-endian)'], [0, [0x4d, 0x4d, 0x00, 0x2a], 'TIFF (big-endian)'], [0, 'BM', 'BMP image'], [0, [0x00, 0x00, 0x01, 0x00], 'ICO icon'], [0, 'wOF2', 'WOFF2 font'], [0, 'wOFF', 'WOFF font'],
  [0, [0x00, 0x01, 0x00, 0x00], 'TrueType font'], [0, 'OTTO', 'OpenType font'], [0, '-----BEGIN', 'PEM (certificate / key)'], [0, [0xef, 0xbb, 0xbf], 'UTF-8 text with BOM'], [0, [0xff, 0xfe], 'UTF-16 LE text (BOM)'], [0, [0xfe, 0xff], 'UTF-16 BE text (BOM)'],
  [0, '<?xml', 'XML'], [0, '<svg', 'SVG image'], [0, '#!', 'Script (shebang)'], [0, [0xca, 0xfe, 0xba, 0xbe], 'Java class / Mach-O fat binary'], [0, 'USODIUM1', 'Sodium Encrypt file (SuperTools)'],
];
export function sniff(b: Uint8Array): string {
  for (const [off, sig, name] of MAGIC) {
    const bytes = typeof sig === 'string' ? [...sig].map((c) => c.charCodeAt(0)) : sig;
    if (b.length >= off + bytes.length && bytes.every((x, i) => b[off + i] === x)) {
      // two-letter signatures also start ordinary text ("BMW …", "MZ…"): ask for the header fields that follow them
      if (name === 'BMP image' && !(b.length >= 14 && b[6] === 0 && b[7] === 0 && b[8] === 0 && b[9] === 0)) continue;
      if (name === 'Windows executable (PE/DOS)' && b.length < 64) continue;
      return name;
    }
  }
  const sample = b.subarray(0, 4096); let bin = 0; for (const x of sample) if (x === 0 || (x < 9) || (x > 13 && x < 32)) bin++;
  return !sample.length ? 'Empty file' : bin === 0 ? 'Text (no binary bytes in the first 4 KB)' : 'Unknown binary data';
}
export const hexview: Mount = async (root) => {
  let data: Uint8Array = new Uint8Array(0), name = '', page = 0, width = 16, dc: Devcore | null = null;
  const PAGE = 4096;
  const pre = h('pre', { class: 'hexdump mono' }), info = h('div'), nav = h('div', { class: 'row' });
  const gotoI = input({ placeholder: '0x1A0 or 416', attrs: { class: 'input mono', 'aria-label': 'Go to offset' } });
  const q = input({ placeholder: 'text, or hex like 50 4B 03 04', attrs: { class: 'input mono', 'aria-label': 'Find' } });
  let hexMode = false; const hits = h('div', { class: 'muted' });
  const pages = () => Math.max(1, Math.ceil(data.length / PAGE));
  const render = () => {
    if (!dc) return;
    const start = page * PAGE;
    pre.textContent = data.length ? dc.hexdump(data.subarray(start, start + PAGE), start, width) : '';
    clear(nav).append(button('◀ Prev', () => { page = Math.max(0, page - 1); render(); }, { small: true, disabled: page === 0 }), h('span', { class: 'muted' }, `Page ${page + 1} of ${pages()} · bytes ${start.toLocaleString('en-IN')}–${Math.min(data.length, start + PAGE).toLocaleString('en-IN')}`),
      button('Next ▶', () => { page = Math.min(pages() - 1, page + 1); render(); }, { small: true, disabled: page >= pages() - 1 }));
  };
  const open = async (bytes: Uint8Array, n: string) => {
    dc ||= await devcore('hex'); data = bytes; name = n; page = 0;
    clear(info).append(kvRows([['File', name], ['Size', `${fmtBytes(data.length)} (${data.length.toLocaleString('en-IN')} bytes)`], ['Detected type', sniff(data)], ['First bytes', [...data.subarray(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join(' ')]]));
    render();
  };
  const go = () => { if (!data.length) throw new Error('Open a file first'); const v = gotoI.value.trim().replace(/[,_\s]/g, ''); const n = /^0x[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : /^[0-9a-f]+h$/i.test(v) ? parseInt(v, 16) : /^\d+$/.test(v) ? parseInt(v, 10) : NaN; if (!Number.isFinite(n) || n < 0 || n >= data.length) throw new Error(`Offset must be a number from 0 to ${(data.length - 1).toLocaleString('en-IN')} (0x${(data.length - 1).toString(16)}), e.g. 416 or 0x1A0`); page = Math.floor(n / PAGE); render(); hits.textContent = `Offset ${n} (0x${n.toString(16)}) is on page ${page + 1}`; };
  const find = () => {
    if (!dc || !data.length) throw new Error('Open a file first');
    let needle: Uint8Array;
    if (hexMode) { const hx = q.value.replace(/[\s,]|0x/gi, ''); if (!/^([0-9a-f]{2})+$/i.test(hx)) throw new Error('Hex search needs pairs of hex digits, e.g. 50 4B 03 04'); needle = Uint8Array.from(hx.match(/../g)!.map((x) => parseInt(x, 16))); }
    else needle = new TextEncoder().encode(q.value);
    if (!needle.length) throw new Error('Type something to find');
    const r = dc.find(data, needle, 0, 1000);
    if (!r.hits.length) { hits.textContent = 'Not found'; return; }
    page = Math.floor(r.hits[0] / PAGE); render();
    hits.textContent = `${r.hits.length}${r.more ? '+' : ''} match${r.hits.length === 1 ? '' : 'es'} at ${r.hits.slice(0, 20).map((x) => `0x${x.toString(16)}`).join(', ')}${r.hits.length > 20 ? ', …' : ''}`;
  };
  root.append(card(null, filePicker({ label: 'Open any file', onFiles: async ([f]) => open(await readBytes(f), f.name) }), info),
    card(null, h('div', { class: 'grid2' }, field('Go to offset', h('div', { class: 'row' }, gotoI, button('Go', go, { small: true }))), field('Find', h('div', { class: 'row' }, q, button('Find', find, { small: true, icon: 'Search' })))),
      h('div', { class: 'row' }, segmented([['text', 'Text'], ['hex', 'Hex bytes']], 'text', (v) => (hexMode = v === 'hex')), segmented([['16', '16 bytes/line'], ['8', '8'], ['32', '32']], '16', (v) => { width = +v; render(); })), hits),
    card(null, nav, h('div', { class: 'scroll-x' }, pre)), note('The file is read on this device only.', 'info'));
};

// ------------------------------------------------------------------ String escape
type Esc = [string, string, (s: string) => string, (s: string) => string];
const cEsc = (s: string, uni: boolean) => [...s].map((c, i, all) => { const m: Record<string, string> = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f', '\0': '\\0' };
  if (c === '\0' && /[0-9]/.test(all[i + 1] || '')) return uni ? '\\u0000' : '\\000'; // "\0" + "1" would read as the octal escape \01
  if (m[c]) return m[c]; const cp = c.codePointAt(0)!; if (cp < 32 || cp === 127) return `\\u${cp.toString(16).padStart(4, '0')}`; if (uni && cp > 126) return cp > 0xffff ? String.fromCodePoint(cp).split('').map((u) => `\\u${u.charCodeAt(0).toString(16).padStart(4, '0')}`).join('') : `\\u${cp.toString(16).padStart(4, '0')}`; return c; }).join('');
const cUnesc = (s: string) => s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|[0-7]{1,3}|.)/gs, (_, e: string) => {
  if (e[0] === 'U' && e.length === 9) return String.fromCodePoint(parseInt(e.slice(1), 16)); // C / Python \U0001F44D
  if (e[0] === 'u' && e.length > 1) return e[1] === '{' ? String.fromCodePoint(parseInt(e.slice(2, -1), 16)) : String.fromCharCode(parseInt(e.slice(1), 16));
  if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
  if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
  return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07', e: '\x1b' } as Record<string, string>)[e] ?? e;
});
const HTML_ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', pound: '£', rupee: '₹', deg: '°', times: '×', divide: '÷' };
/** JSON string contents → text. A whole quoted JSON string ("…") is read as such; otherwise the escapes are decoded and
 *  everything else is kept as typed (bare quotes, real line breaks and tabs too — JSON.parse would refuse those). */
function jsonUnesc(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) { try { const v = JSON.parse(t); if (typeof v === 'string') return v; } catch { /* not one whole string: decode leniently */ } }
  const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  let o = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') { o += s[i]; continue; }
    const c = s[++i];
    if (c === undefined) throw new Error('a backslash at the very end has nothing to escape');
    if (c === 'u') { const hx = s.slice(i + 1, i + 5); if (!/^[0-9a-fA-F]{4}$/.test(hx)) throw new Error(`\\u needs four hex digits (found "\\u${hx}")`); o += String.fromCharCode(parseInt(hx, 16)); i += 4; }
    else if (c in map) o += map[c];
    else throw new Error(`"\\${c}" is not a JSON escape (allowed: \\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX)`);
  }
  return o;
}
/** One shell word → its text: '…' is literal, "…" keeps everything but \$ \` \" \\ (and a backslash-newline), a bare
 *  backslash escapes the next character. */
function shellUnesc(s: string): string {
  let o = '', i = 0; const t = s.trim();
  while (i < t.length) {
    const c = t[i];
    if (c === "'") { const j = t.indexOf("'", i + 1); if (j < 0) throw new Error('Unclosed single quote'); o += t.slice(i + 1, j); i = j + 1; }
    else if (c === '"') {
      let j = i + 1;
      for (; j < t.length && t[j] !== '"'; j++) { if (t[j] === '\\' && j + 1 < t.length && '$`"\\\n'.includes(t[j + 1])) { j++; if (t[j] !== '\n') o += t[j]; } else o += t[j]; }
      if (j >= t.length) throw new Error('Unclosed double quote');
      i = j + 1;
    } else if (c === '\\') { o += t[i + 1] ?? ''; i += 2; }
    else { o += c; i++; }
  }
  return o;
}
/** Every named HTML entity, decoded by the browser's own parser in an inert document (nothing is rendered or run);
 *  the short table is the fallback where there is no DOM (unit tests). */
const entCache = new Map<string, string>();
function htmlEntity(m: string, name: string): string {
  if (name[0] === '#') { const cp = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10); if (!(cp >= 0 && cp <= 0x10ffff) || (cp >= 0xd800 && cp <= 0xdfff)) throw new Error(`${m} is not a character (code points end at U+10FFFF)`); return String.fromCodePoint(cp); }
  if (typeof DOMParser === 'undefined') return HTML_ENT[name] ?? HTML_ENT[name.toLowerCase()] ?? m;
  let v = entCache.get(name);
  if (v === undefined) { v = new DOMParser().parseFromString(`<!doctype html><body>&${name};`, 'text/html').body.textContent ?? m; entCache.set(name, v); }
  return v;
}
const ESCAPES: Esc[] = [
  ['json', 'JSON string', (s) => JSON.stringify(s).slice(1, -1), jsonUnesc],
  ['js', 'JavaScript / Java / C (\\uXXXX for non-ASCII)', (s) => cEsc(s, true), cUnesc],
  ['c', 'C / Python (keep Unicode)', (s) => cEsc(s, false), cUnesc],
  ['sql', 'SQL string literal (\'\' doubling)', (s) => `'${s.replace(/'/g, "''")}'`, (s) => s.replace(/^'|'$/g, '').replace(/''/g, "'")],
  ['shell', 'Shell (POSIX single quotes)', (s) => `'${s.replace(/'/g, `'\\''`)}'`, shellUnesc],
  ['html', 'HTML / XML entities', (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'), (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, htmlEntity)],
  ['regex', 'Regular expression (literal match)', (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), (s) => s.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1')],
  ['csv', 'CSV field (RFC 4180)', (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s), (s) => (/^".*"$/s.test(s) ? s.slice(1, -1).replace(/""/g, '"') : s)],
  ['url', 'URL component (percent-encoding)', encodeURIComponent, decodeURIComponent],
];
export const ESCAPE_FNS = Object.fromEntries(ESCAPES.map(([k, , e, u]) => [k, { e, u }]));
export const escape: Mount = (root) => {
  let kind = 'json', dir = 'esc';
  const src = textarea({ rows: 8, mono: true, value: 'He said "Namaste" — it\'s 5\\6 at 9:00\n\tnext line' }), out = outputBox({ rows: 8, mono: true });
  const status = h('div');
  const run = () => { const e = ESCAPES.find((x) => x[0] === kind)!; clear(status); try { out.value = dir === 'esc' ? e[2](src.value) : e[3](src.value); } catch (err: any) { out.value = ''; status.append(note(`Cannot unescape: ${err.message}`, 'warn')); } };
  const kindSel = select(ESCAPES.map(([k, l]) => [k, l] as [string, string]), kind, (v) => { kind = v; run(); });
  src.addEventListener('input', run);
  root.append(card(null, field('Format', kindSel), segmented([['esc', 'Escape'], ['unesc', 'Unescape']], 'esc', (v) => { dir = v; run(); })), card('Input', src), card('Output', out, status),
    h('div', { class: 'actions' }, button('Swap', () => { src.value = out.value; dir = dir === 'esc' ? 'unesc' : 'esc'; root.querySelectorAll<HTMLButtonElement>('.seg-btn')[dir === 'esc' ? 0 : 1].click(); }, { icon: 'ArrowUpDown' })));
  run();
};

// ------------------------------------------------------------------ Unicode inspector
const INVISIBLE: Record<number, string> = { 0x00ad: 'SOFT HYPHEN', 0x034f: 'COMBINING GRAPHEME JOINER', 0x061c: 'ARABIC LETTER MARK', 0x115f: 'HANGUL CHOSEONG FILLER', 0x1160: 'HANGUL JUNGSEONG FILLER', 0x180e: 'MONGOLIAN VOWEL SEPARATOR', 0x200b: 'ZERO WIDTH SPACE', 0x200c: 'ZERO WIDTH NON-JOINER', 0x200d: 'ZERO WIDTH JOINER', 0x200e: 'LEFT-TO-RIGHT MARK', 0x200f: 'RIGHT-TO-LEFT MARK',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING', 0x202b: 'RIGHT-TO-LEFT EMBEDDING', 0x202c: 'POP DIRECTIONAL FORMATTING', 0x202d: 'LEFT-TO-RIGHT OVERRIDE', 0x202e: 'RIGHT-TO-LEFT OVERRIDE', 0x2060: 'WORD JOINER', 0x2061: 'FUNCTION APPLICATION', 0x2062: 'INVISIBLE TIMES', 0x2063: 'INVISIBLE SEPARATOR', 0x2064: 'INVISIBLE PLUS',
  0x2066: 'LEFT-TO-RIGHT ISOLATE', 0x2067: 'RIGHT-TO-LEFT ISOLATE', 0x2068: 'FIRST STRONG ISOLATE', 0x2069: 'POP DIRECTIONAL ISOLATE', 0x3164: 'HANGUL FILLER', 0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)', 0xffa0: 'HALFWIDTH HANGUL FILLER' };
const SPACES: Record<number, string> = { 0x09: 'TAB', 0x0a: 'LINE FEED', 0x0d: 'CARRIAGE RETURN', 0x20: 'SPACE', 0xa0: 'NO-BREAK SPACE', 0x1680: 'OGHAM SPACE MARK', 0x2000: 'EN QUAD', 0x2001: 'EM QUAD', 0x2002: 'EN SPACE', 0x2003: 'EM SPACE', 0x2004: 'THREE-PER-EM SPACE', 0x2005: 'FOUR-PER-EM SPACE', 0x2006: 'SIX-PER-EM SPACE', 0x2007: 'FIGURE SPACE', 0x2008: 'PUNCTUATION SPACE', 0x2009: 'THIN SPACE', 0x200a: 'HAIR SPACE', 0x2028: 'LINE SEPARATOR', 0x2029: 'PARAGRAPH SEPARATOR', 0x202f: 'NARROW NO-BREAK SPACE', 0x205f: 'MEDIUM MATHEMATICAL SPACE', 0x3000: 'IDEOGRAPHIC SPACE' };
const SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Devanagari', 'Bengali', 'Tamil', 'Telugu', 'Gujarati', 'Gurmukhi', 'Kannada', 'Malayalam', 'Oriya', 'Arabic', 'Hebrew', 'Han', 'Hiragana', 'Katakana', 'Hangul', 'Thai', 'Armenian', 'Georgian', 'Cherokee'];
const SCRIPT_RE = SCRIPTS.map((s) => [s, new RegExp(`^\\p{Script=${s}}$`, 'u')] as const);
const CATS: Array<[RegExp, string]> = [[/^\p{Lu}$/u, 'Letter, uppercase'], [/^\p{Ll}$/u, 'Letter, lowercase'], [/^\p{Lt}$/u, 'Letter, titlecase'], [/^\p{Lm}$/u, 'Letter, modifier'], [/^\p{Lo}$/u, 'Letter, other'], [/^\p{Mn}$/u, 'Mark, nonspacing (combining)'], [/^\p{Mc}$/u, 'Mark, spacing'], [/^\p{Me}$/u, 'Mark, enclosing'],
  [/^\p{Nd}$/u, 'Number, digit'], [/^\p{Nl}$/u, 'Number, letter'], [/^\p{No}$/u, 'Number, other'], [/^\p{Pc}$/u, 'Punctuation, connector'], [/^\p{Pd}$/u, 'Punctuation, dash'], [/^\p{Ps}$/u, 'Punctuation, open'], [/^\p{Pe}$/u, 'Punctuation, close'], [/^\p{Pi}$/u, 'Punctuation, initial quote'], [/^\p{Pf}$/u, 'Punctuation, final quote'], [/^\p{Po}$/u, 'Punctuation, other'],
  [/^\p{Sm}$/u, 'Symbol, math'], [/^\p{Sc}$/u, 'Symbol, currency'], [/^\p{Sk}$/u, 'Symbol, modifier'], [/^\p{So}$/u, 'Symbol, other'], [/^\p{Zs}$/u, 'Separator, space'], [/^\p{Zl}$/u, 'Separator, line'], [/^\p{Zp}$/u, 'Separator, paragraph'], [/^\p{Cc}$/u, 'Control'], [/^\p{Cf}$/u, 'Format (invisible)'], [/^\p{Co}$/u, 'Private use'], [/^\p{Cn}$/u, 'Unassigned']];
/** Latin look-alikes from other scripts (Unicode confusables subset that matters for spoofing). */
const LOOKALIKE: Record<string, string> = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'һ': 'h', 'ԛ': 'q', 'ԝ': 'w', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y', 'І': 'I', 'Ѕ': 'S', 'Ј': 'J',
  'ο': 'o', 'α': 'a', 'ν': 'v', 'ρ': 'p', 'ι': 'i', 'κ': 'k', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', '０': '0', '１': '1', 'ℓ': 'l', 'ⅼ': 'l' };
/** Typographic punctuation: ordinary in prose (not suspicious), but it breaks code, CSV and command lines. */
const TYPO: Record<string, string> = { '‐': '-', '‑': '-', '‒': '-', '−': '-', '–': '-', '—': '-', '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"', '…': '...', '′': "'", '″': '"' };
export function charInfo(ch: string) {
  const cp = ch.codePointAt(0)!;
  const utf8 = [...new TextEncoder().encode(ch)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const utf16 = [...ch].length ? Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')).join(' ') : '';
  const cat = CATS.find(([re]) => re.test(ch))?.[1] || '';
  const script = SCRIPT_RE.find(([, re]) => re.test(ch))?.[0] || (/^\p{Script=Common}$/u.test(ch) ? 'Common' : /^\p{Script=Inherited}$/u.test(ch) ? 'Inherited' : '');
  const name = INVISIBLE[cp] || SPACES[cp] || '';
  const flag = INVISIBLE[cp] ? 'invisible' : SPACES[cp] && cp > 0x20 ? 'unusual space' : LOOKALIKE[ch] ? `looks like “${LOOKALIKE[ch]}”` : cp >= 0xe000 && cp <= 0xf8ff ? 'private use' : /^\p{Cc}$/u.test(ch) && !SPACES[cp] ? 'control character' : '';
  const typo = TYPO[ch] ? `typographic (plain: ${TYPO[ch]})` : '';
  return { cp: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, dec: cp, utf8, utf16, cat, script, name, flag, typo };
}
export const unicode: Mount = (root) => {
  const ta = textarea({ rows: 5, value: 'pаypal.com\u200b — café ₹500 👍🏽 नमस्ते' });
  const sum = h('div'), tbody = h('tbody'), out = h('div');
  const run = () => {
    const s = ta.value, cps = [...s], graphemes = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length;
    const infos = cps.map((c) => ({ c, ...charInfo(c) }));
    const scripts = [...new Set(infos.map((i) => i.script).filter((x) => x && x !== 'Common' && x !== 'Inherited'))];
    const flagged = infos.filter((i) => i.flag);
    clear(sum).append(kvRows([['Characters (code points)', String(cps.length)], ['Graphemes (what you see)', String(graphemes)], ['UTF-16 units (JS .length)', String(s.length)], ['UTF-8 bytes', String(new TextEncoder().encode(s).length)],
      ['Scripts', scripts.join(', ') || '—'], ['NFC = NFD?', s.normalize('NFC') === s.normalize('NFD') ? 'yes' : `no (NFC ${[...s.normalize('NFC')].length}, NFD ${[...s.normalize('NFD')].length} code points)`]]),
      flagged.length ? note(`${flagged.length} suspicious character${flagged.length === 1 ? '' : 's'}: ${[...new Set(flagged.map((f) => `${f.cp} ${f.name || f.c} (${f.flag})`))].slice(0, 8).join('; ')}`, 'warn') : note('No invisible or look-alike characters found.', 'ok'),
      scripts.length > 1 && scripts.includes('Latin') && flagged.some((f) => f.flag.startsWith('looks like')) ? note('Mixed scripts with look-alike letters — a common trick in fake web addresses (homograph attack).', 'err') : '',
      infos.some((i) => i.typo) ? note(`${infos.filter((i) => i.typo).length} typographic quote / dash / ellipsis character${infos.filter((i) => i.typo).length === 1 ? '' : 's'} (fine in prose; “Plain quotes & dashes” turns them into ' " - for code or CSV).`, 'info') : '');
    clear(tbody).append(...infos.slice(0, 2000).map((i) => h('tr', { class: i.flag ? 'flag' : null }, h('td', { class: 'uchar' }, i.flag === 'invisible' || /^\p{C}|\p{Z}$/u.test(i.c) ? '·' : i.c), h('td', { class: 'mono' }, i.cp), h('td', { class: 'mono' }, i.utf8), h('td', { class: 'mono' }, i.utf16), h('td', null, i.cat), h('td', null, i.script), h('td', null, [i.name, i.flag, i.typo].filter(Boolean).join(' · ')))));
    clear(out); if (infos.length > 2000) out.append(note(`The table lists the first 2,000 of ${infos.length.toLocaleString('en-IN')} characters; the summary and the buttons cover all of them.`, 'info'));
  };
  const clean = (f: (s: string) => string) => () => { ta.value = f(ta.value); run(); };
  ta.addEventListener('input', run);
  root.append(card(null, field('Text', ta), h('div', { class: 'row' },
    button('Remove invisible', clean((s) => [...s].filter((c) => !INVISIBLE[c.codePointAt(0)!]).join('')), { small: true }),
    button('Replace look-alikes', clean((s) => [...s].map((c) => LOOKALIKE[c] ?? c).join('')), { small: true }),
    button('Plain quotes & dashes', clean((s) => [...s].map((c) => TYPO[c] ?? c).join('')), { small: true }),
    button('Normalise spaces', clean((s) => s.replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ')), { small: true }),
    button('NFC', clean((s) => s.normalize('NFC')), { small: true }), button('NFKC', clean((s) => s.normalize('NFKC')), { small: true }), button('Copy', () => copy(ta.value), { small: true, icon: 'Copy' }))),
  card('Summary', sum), card('Characters', h('div', { class: 'scroll-x' }, h('table', { class: 'tbl utbl' }, h('thead', null, h('tr', null, ['Char', 'Code point', 'UTF-8', 'UTF-16', 'Category', 'Script', 'Name / note'].map((x) => h('th', null, x)))), tbody))), out);
  run();
};

// ------------------------------------------------------------------ Log viewer
const LEVELS = ['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'] as const;
const LV_WORDS = 'FATAL|CRITICAL|CRIT|EMERG|ALERT|ERROR|ERR|SEVERE|WARNING|WARN|NOTICE|INFO|INFORMATION|DEBUG|DBG|TRACE|VERBOSE';
const LV_UPPER = new RegExp(`\\b(${LV_WORDS})\\b`);                                                      // an upper-case level word: "2026-11-17 ERROR …", "[WARN]"
const LV_MARKED = new RegExp(`(?:^|[\\s\\[<(|])(?:level|lvl|severity)\\s*[=:]\\s*"?(${LV_WORDS})\\b|[\\[<(](${LV_WORDS})[\\]>)]|(?:^|\\s)(${LV_WORDS}):(?=\\s|$)|^\\s*(${LV_WORDS})\\s*[|\\]-]`, 'i'); // level=warn, [info], "error: …", "… notice: …"
const norm = (m: string) => { const u = m.toUpperCase(); return /FATAL|CRIT|EMERG|ALERT/.test(u) ? 'FATAL' : /ERR|SEVERE/.test(u) ? 'ERROR' : /WARN/.test(u) ? 'WARN' : /INFO|NOTICE/.test(u) ? 'INFO' : /DEBUG|DBG/.test(u) ? 'DEBUG' : /TRACE|VERBOSE/.test(u) ? 'TRACE' : ''; };
/** The level of one log line. A level word counts when it is written as a level — in capitals near the start, or marked
 *  (level=warn, [info], "error: …") — not when the word merely appears in the message ("user info updated", "GET /errors"). */
export function levelOf(line: string): string {
  if (line.trimStart().startsWith('{')) {
    try {
      const j = JSON.parse(line); let m = String(j.level ?? j.lvl ?? j.severity ?? j.loglevel ?? j['log.level'] ?? j.levelname ?? '');
      // numbers: pino / bunyan use 10–60; syslog severities are 0–7 (0 emergency … 3 error, 4 warning, 6 info, 7 debug)
      if (/^\d+$/.test(m)) m = +m >= 60 ? 'FATAL' : +m >= 50 ? 'ERROR' : +m >= 40 ? 'WARN' : +m >= 30 ? 'INFO' : +m >= 20 ? 'DEBUG' : +m >= 10 ? 'TRACE' : +m <= 2 ? 'FATAL' : +m === 3 ? 'ERROR' : +m === 4 ? 'WARN' : +m <= 6 ? 'INFO' : 'DEBUG';
      if (m) return norm(m);
    } catch { /* not JSON */ }
  }
  const head = line.slice(0, 160), mk = LV_MARKED.exec(head);
  const m = LV_UPPER.exec(head)?.[1] || (mk ? mk[1] || mk[2] || mk[3] || mk[4] : '') || (/^[EWIDV]\/\w/.test(line) ? ({ E: 'ERROR', W: 'WARN', I: 'INFO', D: 'DEBUG', V: 'TRACE' } as Record<string, string>)[line[0]] : '');
  return norm(m || '');
}
/** Levels for a whole file: a line without a level that continues the entry before it (a stack trace, an indented
 *  detail line) takes that entry's level, so "ERROR only" keeps the traces and "hide DEBUG" hides all of a debug dump. */
export function levelsOf(all: string[]): string[] {
  const out: string[] = []; let prev = '';
  for (const line of all) {
    let l = levelOf(line);
    if (!l && prev && /^(\s+\S|Caused by:|Traceback \(most recent call last\)|\.\.\. \d+ more|[\w.$]+(Error|Exception)\b)/.test(line)) l = prev;
    else if (line.trim()) prev = l;
    out.push(l);
  }
  return out;
}
export const logview: Mount = (root) => {
  let all: string[] = [], lv: string[] = [], show = new Set<string>([...LEVELS, '']), useRe = false, invert = false, pretty = true, limit = 2000;
  const q = input({ type: 'search', placeholder: 'Filter text (or a regular expression)', attrs: { 'aria-label': 'Filter', class: 'input mono' } });
  const ta = textarea({ rows: 6, mono: true, placeholder: 'Paste log lines here, or open a .log file' });
  const counts = h('div', { class: 'chips' }), list = h('div', { class: 'logview mono' }), status = h('div', { class: 'muted' }), more = h('div');
  const load = (text: string) => { all = text.split(/\r?\n/); if (all[all.length - 1] === '') all.pop(); lv = levelsOf(all); limit = 2000; render(); };
  const fmtJson = (line: string) => { try { const j = JSON.parse(line); const t = j.time ?? j.timestamp ?? j.ts ?? j['@timestamp'] ?? ''; const m = j.msg ?? j.message ?? j.event ?? ''; const rest = Object.entries(j).filter(([k]) => !['time', 'timestamp', 'ts', '@timestamp', 'msg', 'message', 'event', 'level', 'lvl', 'severity'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' '); return `${typeof t === 'number' ? new Date(t > 1e12 ? t : t * 1000).toISOString() : t} ${m} ${rest}`.trim(); } catch { return line; } };
  const render = () => {
    let re: RegExp | null = null; clear(status);
    if (q.value) { try { re = useRe ? new RegExp(q.value, 'i') : new RegExp(q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); q.classList.remove('bad'); } catch { q.classList.add('bad'); status.textContent = 'Invalid regular expression'; return; } }
    const idx: number[] = [];
    for (let i = 0; i < all.length; i++) { if (!show.has(lv[i])) continue; const hit = !re || re.test(all[i]); if (hit !== invert) idx.push(i); }
    const c: Record<string, number> = {}; lv.forEach((l) => (c[l || 'OTHER'] = (c[l || 'OTHER'] || 0) + 1));
    clear(counts).append(...[...LEVELS, ''].map((l) => { const k = l || 'OTHER'; const on = show.has(l); return h('button', { type: 'button', class: `chip chip-btn lv-${k.toLowerCase()} ${on ? 'on' : 'off'}`, 'aria-pressed': String(on), onclick: () => { on ? show.delete(l) : show.add(l); render(); } }, `${k} ${c[k] || 0}`); }));
    status.textContent = `${idx.length.toLocaleString('en-IN')} of ${all.length.toLocaleString('en-IN')} lines`;
    clear(list).append(...idx.slice(0, limit).map((i) => {
      const text = pretty && all[i].trimStart().startsWith('{') ? fmtJson(all[i]) : all[i];
      const row = h('div', { class: `logline lv-${(lv[i] || 'other').toLowerCase()}` }, h('span', { class: 'ln' }, String(i + 1)));
      if (re && !invert) { const g = new RegExp(re.source, 'gi'); let last = 0, m: RegExpExecArray | null; const span = h('span'); while ((m = g.exec(text)) && m[0]) { span.append(text.slice(last, m.index), h('mark', null, m[0])); last = m.index + m[0].length; } span.append(text.slice(last)); row.append(span); }
      else row.append(h('span', null, text));
      return row;
    }));
    clear(more); if (idx.length > limit) more.append(button(`Show ${Math.min(2000, idx.length - limit)} more`, () => { limit += 2000; render(); }, { small: true }));
  };
  q.addEventListener('input', debounce(render, 120)); ta.addEventListener('input', debounce(() => load(ta.value), 200));
  root.append(card(null, filePicker({ accept: '.log,.txt,.json,.jsonl,.ndjson,text/*', label: 'Open a log file', onFiles: async ([f]) => { ta.value = ''; load(await f.text()); } }), field('…or paste', ta)),
    card(null, q, h('div', { class: 'row' }, toggle('Regular expression', false, (v) => { useRe = v; render(); }), toggle('Hide matches', false, (v) => { invert = v; render(); }), toggle('Readable JSON lines', true, (v) => { pretty = v; render(); })), counts, status),
    card(null, list, more));
  load('');
};

// ------------------------------------------------------------------ SLA / uptime
const PERIODS: Array<[string, number]> = [['Per day', 86400], ['Per week', 604800], ['Per month (30.44 days)', 2629746], ['Per quarter', 7889238], ['Per year (365.24 days)', 31556952]];
export function fmtDur(sec: number) {
  if (sec <= 0) return '0 s';
  const d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [d && `${d} d`, hh && `${hh} h`, m && `${m} min`, (s || (!d && !hh && !m)) && `${+s.toFixed(s < 10 && !d && !hh && !m ? 2 : 1)} s`].filter(Boolean).join(' ');
}
export const sla: Mount = (root) => {
  const pct = input({ value: '99.9', type: 'number', step: 'any', attrs: { 'aria-label': 'Availability %' } });
  const out = h('div'), out2 = h('div'), out3 = h('div');
  const down = input({ value: '30', type: 'number', step: 'any', attrs: { 'aria-label': 'Downtime' } });
  const per = select(PERIODS.map(([l, s]) => [String(s), l] as [string, string]), '2629746');
  const unit = select([['60', 'minutes'], ['1', 'seconds'], ['3600', 'hours']], '60');
  const comps = input({ value: '99.9, 99.95, 99.99', attrs: { 'aria-label': 'Components' } });
  const run = () => {
    const p = +pct.value;
    if (!(p >= 0 && p <= 100) || pct.value === '') { clear(out).append(note('Availability must be between 0 and 100 %.', 'warn')); }
    else clear(out).append(kvRows([...PERIODS.map(([l, s]) => [l, fmtDur(s * (1 - p / 100))] as [string, string]), ['Nines', p >= 100 ? '∞' : (-Math.log10(1 - p / 100)).toFixed(2)]]));
    const sec = +down.value * +unit.value, span = +per.value;
    // enough decimals to tell the value from 100 %: one second a year is 99.999997 %, not "100 %"
    const avail = (x: number) => { const a = Math.max(0, 100 * (1 - x)); let d = 4; while (d < 12 && x > 0 && +a.toFixed(d) >= 100) d++; return `${a.toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')} %`; };
    clear(out2).append(...(sec >= 0 && down.value !== '' ? [kvRows([['Availability', avail(sec / span)]]), sec > span ? note('The downtime is longer than the period.', 'warn') : ''] : [note('Enter the downtime.', 'warn')]));
    const cs = comps.value.split(/[,;\s]+/).filter(Boolean).map((x) => Number(x.replace(/%$/, '')));
    if (!cs.length || cs.some((x) => !(x >= 0 && x <= 100))) { clear(out3).append(note('List the components’ availabilities, e.g. 99.9, 99.95', 'warn')); return; }
    const series = cs.reduce((a, x) => a * (x / 100), 1) * 100, parallel = (1 - cs.reduce((a, x) => a * (1 - x / 100), 1)) * 100;
    const f = (x: number) => `${x.toFixed(6).replace(/\.?0+$/, '')} %`;
    clear(out3).append(kvRows([['All needed (in series)', f(series)], ['Any one is enough (redundant, in parallel)', f(parallel)], ['Series downtime per year', fmtDur(31556952 * (1 - series / 100))], ['Parallel downtime per year', fmtDur(31556952 * (1 - parallel / 100))]]));
  };
  [pct, down, comps].forEach((x) => x.addEventListener('input', run)); [per, unit].forEach((x) => x.addEventListener('change', run));
  root.append(card('Allowed downtime', field('Availability target (%)', pct), chips([['99', '99 %'], ['99.5', '99.5 %'], ['99.9', 'three nines'], ['99.95', '99.95 %'], ['99.99', 'four nines'], ['99.999', 'five nines']], (v) => { pct.value = v; run(); }), out),
    card('Downtime → availability', h('div', { class: 'grid2' }, field('Downtime', down), field('Unit', unit)), field('Over', per), out2),
    card('Combined services', field('Component availabilities (%)', comps), out3));
  run();
};

// ------------------------------------------------------------------ Data transfer
const SIZE_U: Array<[string, number]> = [['B', 1], ['KB', 1e3], ['MB', 1e6], ['GB', 1e9], ['TB', 1e12], ['KiB', 1024], ['MiB', 1024 ** 2], ['GiB', 1024 ** 3], ['TiB', 1024 ** 4]];
const RATE_U: Array<[string, number]> = [['bit/s', 1], ['kbit/s', 1e3], ['Mbit/s', 1e6], ['Gbit/s', 1e9], ['MB/s', 8e6], ['GB/s', 8e9], ['MiB/s', 8 * 1024 ** 2]];
export const transfer: Mount = (root) => {
  const size = input({ value: '4.7', type: 'number', step: 'any', attrs: { 'aria-label': 'Size' } }), su = select(SIZE_U.map(([u]) => [u, u] as [string, string]), 'GB');
  const rate = input({ value: '100', type: 'number', step: 'any', attrs: { 'aria-label': 'Speed' } }), ru = select(RATE_U.map(([u]) => [u, u] as [string, string]), 'Mbit/s');
  const time = input({ value: '10', type: 'number', step: 'any', attrs: { 'aria-label': 'Time' } }), tu = select([['1', 'seconds'], ['60', 'minutes'], ['3600', 'hours']], '60');
  let overhead = 0;
  const out = h('div'), out2 = h('div');
  const run = () => {
    const bits = +size.value * SIZE_U.find((u) => u[0] === su.value)![1] * 8, bps = +rate.value * RATE_U.find((u) => u[0] === ru.value)![1] * (1 - overhead / 100);
    clear(out).append(bits >= 0 && bps > 0 ? kvRows([['Transfer time', fmtDur(bits / bps)], ['Seconds', (bits / bps).toLocaleString('en-IN', { maximumFractionDigits: 2 })], ['Effective speed', `${(bps / 8e6).toLocaleString('en-IN', { maximumFractionDigits: 3 })} MB/s`], ['Per day at this speed', `${(bps * 86400 / 8e9).toLocaleString('en-IN', { maximumFractionDigits: 2 })} GB`]]) : note('Enter a size and a speed above zero.', 'warn'));
    const secs = +time.value * +tu.value;
    clear(out2).append(bits >= 0 && secs > 0 ? kvRows([['Speed needed', `${(bits / secs / (1 - overhead / 100) / 1e6).toLocaleString('en-IN', { maximumFractionDigits: 3 })} Mbit/s`], ['= MB/s', `${(bits / secs / (1 - overhead / 100) / 8e6).toLocaleString('en-IN', { maximumFractionDigits: 3 })} MB/s`]]) : note('Enter a time above zero.', 'warn'));
  };
  [size, rate, time].forEach((x) => x.addEventListener('input', run)); [su, ru, tu].forEach((x) => x.addEventListener('change', run));
  root.append(card('Size', h('div', { class: 'grid2' }, field('Amount', size), field('Unit', su)), chips([['4.7 GB', 'DVD 4.7 GB'], ['25 GB', 'Blu-ray 25 GB'], ['700 MB', 'CD 700 MB'], ['1 TB', '1 TB disk']], (v) => { const [n, u] = v.split(' '); size.value = n; su.value = u; run(); })),
    card('Time at a speed', h('div', { class: 'grid2' }, field('Speed', rate), field('Unit', ru)), slider({ label: 'Protocol overhead', min: 0, max: 30, value: 0, unit: ' %', onInput: (v) => { overhead = v; run(); } }), out),
    card('Speed for a deadline', h('div', { class: 'grid2' }, field('Time', time), field('Unit', tu)), out2),
    note('1 MB = 1,000,000 bytes, 1 MiB = 1,048,576 bytes; network speeds are in bits per second (8 bits = 1 byte). Real transfers lose ~5–10 % to TCP/IP overhead.', 'info'));
  run();
};

// ------------------------------------------------------------------ Mermaid diagrams (Mermaid is JavaScript-only — §3a)
const MERMAID_SAMPLES: Record<string, string> = {
  Flowchart: 'flowchart TD\n  A[Order placed] --> B{Paid?}\n  B -- Yes --> C[Pack]\n  B -- No --> D[Send reminder]\n  C --> E[Ship]\n  D --> B',
  Sequence: 'sequenceDiagram\n  participant U as User\n  participant A as App\n  participant S as Server\n  U->>A: Tap "Pay"\n  A->>S: POST /pay\n  S-->>A: 200 OK\n  A-->>U: Payment done',
  'ER diagram': 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  PRODUCT ||--o{ LINE_ITEM : "ordered in"',
  Gantt: 'gantt\n  title Release plan\n  dateFormat YYYY-MM-DD\n  section Build\n  Design :a1, 2026-11-01, 7d\n  Code   :a2, after a1, 14d\n  section Ship\n  Test   :after a2, 5d',
  Class: 'classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog\n  Animal <|-- Cat',
  State: 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review\n  Review --> Published\n  Review --> Draft\n  Published --> [*]',
  Pie: 'pie title Time spent\n  "Coding" : 55\n  "Meetings" : 25\n  "Email" : 20',
};
export const mermaid: Mount = (root) => {
  const ta = textarea({ rows: 14, mono: true, value: MERMAID_SAMPLES.Flowchart });
  const view = h('div', { class: 'mermaid-view' }), status = h('div');
  let theme = 'default', n = 0, svgText = '';
  let lib: Promise<any> | null = null;
  const get = () => (lib ||= import('mermaid').then((m) => m.default));
  const render = async () => {
    const id = `mmd-${++n}`, my = n;
    const m = await get();
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'system-ui, sans-serif' });
    try {
      await m.parse(ta.value);
      const { svg } = await m.render(id, ta.value);
      if (my !== n) return;
      svgText = svg; view.innerHTML = svg; clear(status); // strict security level: Mermaid sanitises labels (DOMPurify)
    } catch (e: any) { if (my !== n) return; document.getElementById(`d${id}`)?.remove(); clear(status).append(note(String(e?.message || e).split('\n').slice(0, 4).join('\n'), 'warn')); }
  };
  const png = async () => {
    if (!svgText) throw new Error('Nothing to save yet');
    const svgEl = view.querySelector('svg')!; const r = svgEl.getBoundingClientRect(), scale = 2;
    const img = new Image(); img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`; await img.decode();
    const c = h('canvas'); c.width = Math.ceil(r.width * scale); c.height = Math.ceil(r.height * scale);
    const g = c.getContext('2d')!; g.fillStyle = theme === 'dark' ? '#1f2020' : '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => b && downloadBlob(b, 'diagram.png'), 'image/png');
  };
  ta.addEventListener('input', debounce(render, 300));
  root.append(h('div', { class: 'grid2' }, card(null, chips(Object.keys(MERMAID_SAMPLES).map((k) => [k, k]), (k) => { ta.value = MERMAID_SAMPLES[k]; render(); }), field('Mermaid code', ta),
    field('Theme', segmented([['default', 'Default'], ['neutral', 'Neutral'], ['forest', 'Forest'], ['dark', 'Dark']], 'default', (v) => { theme = v; render(); }))),
  card('Diagram', status, view, h('div', { class: 'row' }, button('Download SVG', () => { if (!svgText) throw new Error('Nothing to save yet'); downloadBlob(new Blob([svgText], { type: 'image/svg+xml' }), 'diagram.svg'); }, { small: true, icon: 'Download' }), button('Download PNG', png, { small: true, icon: 'Image' }), button('Copy SVG', () => copy(svgText), { small: true, icon: 'Copy' })))));
  render().catch((e) => toast(String(e), 'err'));
};
