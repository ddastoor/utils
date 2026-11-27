// Wi-Fi QR from a Router Sticker (potentials #88): the network names and the password a router's label prints, read from the
// OCR's lines — "SSID: …", "Wireless Password/PIN: …", "Network Name (SSID) …", "WLAN Key …", a 5 GHz network beside the
// 2.4 GHz one — and the things on a label that are not the Wi-Fi password (the router's admin password, its web address, a WPS
// PIN); a QR code on the label in the WIFI: form read exactly. String glue around the OCR and zxing-cpp (CLAUDE.md §3a). No DOM.

export type Sec = 'WPA' | 'WEP' | 'nopass';
export type Band = '2.4' | '5' | '6' | '';
export interface Net {
  ssid: string; password: string; sec: Sec; hidden: boolean; band: Band;
  /** where it came from: the label's QR code (exact) or the label's text (read by the OCR — to check) */
  from: 'qr' | 'label';
  /** the lines of the reading that held the name and the password (−1: none) */
  ssidLine: number; passLine: number;
}
export interface Skipped { what: string; value: string; line: number }
export interface LabelRead { nets: Net[]; skipped: Skipped[] }

/** A WIFI: string (ZXing's "Barcode Contents": T, S, P, H in any order, \ ; , : " escaped). */
export function wifiFromQr(text: string): Net | null {
  const t = text.trim();
  if (!/^WIFI:/i.test(t)) return null;
  const f: Record<string, string> = {};
  let i = 5;
  while (i < t.length) {
    const m = /^([A-Za-z]+):/.exec(t.slice(i));
    if (!m) { i++; continue; }
    i += m[0].length;
    let v = '';
    while (i < t.length && t[i] !== ';') { if (t[i] === '\\' && i + 1 < t.length) { v += t[i + 1]; i += 2; } else v += t[i++]; }
    i++;
    f[m[1].toUpperCase()] = v;
  }
  if (!f.S) return null;
  const T = (f.T || '').toUpperCase();
  const sec: Sec = T === 'WEP' ? 'WEP' : T === 'NOPASS' || (!T && !f.P) ? 'nopass' : 'WPA';
  return { ssid: f.S, password: sec === 'nopass' ? '' : f.P || '', sec, hidden: /^true$/i.test(f.H || ''), band: '', from: 'qr', ssidLine: -1, passLine: -1 };
}

// ---- the label's text
// keys as printed on labels (lower case, one space; longest first so that "network name (ssid)" wins over "network name")
const NAME_KEYS = ['wireless network name', 'wi-fi network name', 'wifi network name', 'network name (ssid)', 'network name', 'wireless name', 'wi-fi name', 'wifi name',
  'wlan name', 'wlan ssid', 'wi-fi ssid', 'wifi ssid', 'ssid name', 'ssid'];
const PASS_KEYS = ['wireless password/pin', 'wireless password', 'wi-fi password', 'wifi password', 'wlan password', 'network key (password)', 'network key', 'wireless key',
  'wi-fi key', 'wifi key', 'wlan key', 'wpa2 pre-shared key', 'wpa pre-shared key', 'pre-shared key', 'wpa2 key', 'wpa key', 'wpa-psk key', 'wpa-psk', 'wpa2-psk', 'psk',
  'security key', 'passphrase', 'wep key', 'password', 'passwd', 'pwd', 'key'];
// keys of other things a label prints: they end a value and are never the network's name or password
const OTHER_KEYS = ['admin username', 'admin user name', 'admin password', 'admin login', 'administrator password', 'login password', 'web password', 'gui password',
  'router login', 'default access', 'default login', 'web address', 'web login', 'user name', 'username', 'user', 'login', 'wps pin', 'pin code', 'pin',
  'mac address', 'mac', 'wan mac', 'lan mac', 's/n', 'sn', 'serial number', 'serial no', 'serial', 'gpon sn', 'model no', 'model', 'p/n', 'imei', 'imsi', 'power',
  'ip address', 'ip', 'hardware version', 'hw ver', 'firmware', 'fw ver', 'made in', 'rating', 'input', 'output'];
const ADMIN = /\b(admin|administrator|login|web|gui|management|router|user\s?name|user)\b/i;
const WIFI_WORD = /wi-?fi|wlan|wireless|network|wpa|psk|pre-shared|wep|passphrase/i;
const BAND = /(?:^|[\s(\-_])(2[.,]4|5|6)\s?(?:g|ghz)\b\)?/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&').replace(/ /g, '\\s*').replace(/\\-/g, '[\\s-]?');
const KEY = new RegExp(`(?:\\b(?:2[.,]4|5|6)\\s?g(?:hz)?\\s+)?(${[...NAME_KEYS, ...PASS_KEYS, ...OTHER_KEYS].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![A-Za-z0-9])(?:\\s*[(\\[][^()\\[\\]]{1,14}[)\\]]|\\s*[-_]?\\s?(?:2[.,]4|5|6)\\s?g(?:hz)?(?![A-Za-z0-9]))*\\s*[:=：]?`, 'gi');
const kindOf = (k: string): 'name' | 'pass' | 'other' => {
  const n = k.toLowerCase().replace(/\s+/g, ' ').replace(/wi fi/g, 'wi-fi').trim();
  const same = (list: string[]) => list.some((x) => x.replace(/[\s-]/g, '') === n.replace(/[\s-]/g, ''));
  return same(NAME_KEYS) ? 'name' : same(PASS_KEYS) ? 'pass' : 'other';
};
const bandOf = (s: string): Band => { const m = BAND.exec(` ${s}`); return m ? (m[1].replace(',', '.') as Band) : ''; };

interface Field { kind: 'name' | 'pass' | 'other'; key: string; value: string; band: Band; line: number; admin: boolean; wps: boolean }
/** A line's parts (cut at wide gaps: src/lib/snaptext.ts) cut again at their keys: each key with the text up to the next key or
 *  the part's end — a key whose value stands in the next part, apart from it (a label set as a table), takes that part. */
function fieldsOf(parts: string[], li: number): Field[] {
  const out: Field[] = [];
  const keysIn = (t: string) => {
    const ok: RegExpMatchArray[] = [];
    for (const m of t.matchAll(KEY)) {
      // a key starts a field at the part's start or after a space or a separator — not inside a value ("NetLink_key") —, and
      // the word right after a key and its colon is that key's value, whatever it says ("Password: password")
      const before = t.slice(0, m.index!), prev = ok[ok.length - 1];
      if (before.trim() && !/[|•·,;]\s*$/.test(before) && !(/\s$/.test(before) && /[:=：]\s*$/.test(m[0]))) continue;
      if (prev && /[:=：]\s*$/.test(prev[0]) && !t.slice(prev.index! + prev[0].length, m.index!).trim()) continue;
      ok.push(m);
    }
    return ok;
  };
  for (let pi = 0; pi < parts.length; pi++) {
    const t = parts[pi], ms = keysIn(t);
    ms.forEach((m, i) => {
      const end = i + 1 < ms.length ? ms[i + 1].index! : t.length;
      let value = t.slice(m.index! + m[0].length, end).replace(/^[\s:=：\-–—]+/, '').replace(/[\s|•·,;]+$/, '').trim();
      if (!value && i === ms.length - 1 && pi + 1 < parts.length && !keysIn(parts[pi + 1]).some((k) => k.index === 0)) { value = parts[pi + 1].trim(); pi++; }
      const kind = kindOf(m[1]);
      out.push({ kind, key: m[0].replace(/[\s:=：]+$/, ''), value, band: bandOf(m[0]), line: li, admin: kind !== 'name' && ADMIN.test(m[0]), wps: /\bpin\b/i.test(m[0]) && !/password/i.test(m[0]) });
    });
  }
  return out;
}
/** A value as a network name or a password: quotes round it taken off. */
const cleanValue = (v: string) => v.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
/** A line given as text: its parts apart by a tab or three spaces and more. */
const partsOf = (l: string | { parts: Array<{ text: string }> }) => (typeof l === 'string' ? l.split(/\t|\s{3,}/) : l.parts.map((p) => p.text)).map((x) => x.trim()).filter(Boolean);

/** The networks of a label's lines (the OCR's reading: src/lib/snaptext.ts linesOf, or lines of text whose parts stand
 *  apart by a tab) and its QR codes' texts. */
export function readLabel(lines: Array<string | { parts: Array<{ text: string }> }>, codes: string[] = []): LabelRead {
  const nets: Net[] = [], skipped: Skipped[] = [];
  for (const c of codes) { const n = wifiFromQr(c); if (n && !nets.some((x) => x.ssid === n.ssid)) nets.push(n); }
  const fields = lines.flatMap((l, i) => fieldsOf(partsOf(l), i));
  // a plain password key on a line with a user-name key, or right under one, is the router's own login
  const userLines = new Set(fields.filter((f) => f.kind === 'other' && /user|login|admin/i.test(f.key)).map((f) => f.line));
  const names: Field[] = [], passes: Field[] = [];
  for (const f of fields) {
    if (!f.value) continue;
    if (f.kind === 'name') { names.push(f); continue; }
    if (f.kind === 'pass') {
      const plain = !WIFI_WORD.test(f.key);
      // (a login is written user name first: the line above, or the same line)
      if (f.admin || (plain && (userLines.has(f.line) || userLines.has(f.line - 1)))) { skipped.push({ what: 'the router’s own login password (for its settings page), not the Wi-Fi password', value: f.value, line: f.line }); continue; }
      passes.push(f); continue;
    }
    if (f.wps) skipped.push({ what: 'the WPS PIN, not the Wi-Fi password', value: f.value, line: f.line });
    else if (/pass|pwd|key/i.test(f.key)) skipped.push({ what: 'the router’s own login password (for its settings page), not the Wi-Fi password', value: f.value, line: f.line });
    else if (/https?:|www\.|^\d{1,3}(\.\d{1,3}){3}$/i.test(f.value)) skipped.push({ what: 'the address of the router’s settings page', value: f.value, line: f.line });
    else if (/user|login|admin/i.test(f.key)) skipped.push({ what: 'the router’s own login name (for its settings page)', value: f.value, line: f.line });
  }
  // passwords that name the Wi-Fi first; a plain "Password" / "Key" only where none does
  const strong = passes.filter((p) => WIFI_WORD.test(p.key));
  const pw = strong.length ? strong : passes;
  const sec = (p: Field | null): Sec => (!p ? 'nopass' : /wep/i.test(p.key) ? 'WEP' : 'WPA');
  const add = (n: Field | null, p: Field | null) => {
    const ssid = n ? cleanValue(n.value) : '', password = p ? cleanValue(p.value).replace(/\s+/g, '') : '';
    if (!ssid && !password) return;
    const q = nets.find((x) => x.from === 'qr' && x.ssid === ssid);
    if (q) { q.ssidLine = n?.line ?? -1; q.passLine = p?.line ?? -1; q.band = n?.band || q.band; return; }
    if (nets.some((x) => x.ssid === ssid && x.password === password)) return;
    nets.push({ ssid, password, sec: sec(p), hidden: false, band: n?.band || p?.band || '', from: 'label', ssidLine: n?.line ?? -1, passLine: p?.line ?? -1 });
  };
  if (!names.length) pw.forEach((p) => add(null, p));
  else for (const [i, n] of names.entries()) {
    // the password for this name: the one of its band, else the only one, else the one in the same place in the order
    const byBand = n.band ? pw.find((p) => p.band === n.band) : pw.find((p) => !p.band);
    add(n, byBand ?? (pw.length === 1 ? pw[0] : pw[i] ?? pw[0] ?? null));
  }
  return { nets, skipped };
}

// ---- characters the OCR may have mistaken for one another (to look at again on the label)
const LOOKALIKE: Array<[RegExp, string]> = [
  [/[0Oo]/, '0 (zero), O and o (letters)'], [/[1lI|]/, '1 (one), l (small L) and I (capital i)'], [/[5Ss]/, '5 and S'], [/[2Zz]/, '2 and Z'], [/[8B]/, '8 and B'],
  [/[6G]/, '6 and G'], [/[9gq]/, '9, g and q'], [/[uv]/, 'u and v'], [/rn|m/, 'rn and m'], [/vv|w/, 'vv and w'],
];
/** What to look at again in a password (or a name) read by the OCR: each group of characters it may have confused that the
 *  text holds. */
export function lookalikes(s: string): string[] {
  return LOOKALIKE.filter(([re]) => re.test(s)).map(([, say]) => say);
}
/** A WPA password must have 8 – 63 characters (or 64 hex digits): what is wrong with one read by the OCR, in words. */
export function passwordProblem(p: string, sec: Sec): string | null {
  if (sec !== 'WPA' || !p) return null;
  const n = [...p].length;
  if (/^[0-9a-f]{64}$/i.test(p)) return null;
  if (n < 8) return `This password has ${n} characters; a Wi-Fi (WPA) password has at least 8 — the OCR may have missed some. Compare it with the label.`;
  if (n > 63) return `This password has ${n} characters; a Wi-Fi (WPA) password has at most 63 — the OCR may have run the next text into it. Compare it with the label.`;
  return null;
}
