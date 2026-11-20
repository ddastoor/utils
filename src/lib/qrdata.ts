// What the QR Generator puts into a code (Wi-Fi, UPI, contact card, e-mail, SMS, phone, calendar event) and the checks
// on what was typed. The code itself is drawn by zxing-wasm (zxing-cpp + zint, C++ compiled to WebAssembly); this is
// string glue (§3a).

export interface Checked { text: string; errors: string[]; warnings: string[] }

/** MECARD-style escaping of the Wi-Fi string (ZXing's "Barcode Contents"): \ ; , : " get a backslash. */
const wifiEsc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
/** vCard 3.0 text values (RFC 2426 §4): \ ; , and line breaks. */
const vEsc = (s: string) => s.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
/** iCalendar TEXT values (RFC 5545 §3.3.11): \ ; , and line breaks. */
const icsEsc = (s: string) => s.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
/** A phone number for tel: and SMSTO: — the digits, with a leading +. */
export const phoneDigits = (s: string) => { const t = s.trim(); return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, ''); };
const utf8Len = (s: string) => new TextEncoder().encode(s).length;

export function wifi(o: { ssid: string; pass: string; sec: string; hidden: boolean }): Checked {
  const errors: string[] = [], warnings: string[] = [];
  if (!o.ssid) return { text: '', errors, warnings };
  if (utf8Len(o.ssid) > 32) warnings.push(`A network name has at most 32 bytes; this one has ${utf8Len(o.ssid)} — check it.`);
  const n = [...o.pass].length;
  if (o.sec === 'WPA') {
    if (!o.pass) warnings.push('WPA networks have a password — without it the phone cannot join.');
    else if (/^[0-9a-f]{64}$/i.test(o.pass)) { /* a 64-digit hex key is a valid WPA key */ }
    else if (n < 8 || n > 63) warnings.push(`A WPA password has 8 – 63 characters; this one has ${n}, so phones will refuse it.`);
  }
  if (o.sec === 'WEP' && o.pass && ![5, 13, 16].includes(n) && !(/^[0-9a-f]+$/i.test(o.pass) && [10, 26, 32].includes(n)))
    warnings.push('A WEP key has 5, 13 or 16 characters (or 10, 26 or 32 hex digits).');
  const text = `WIFI:T:${o.sec === 'none' ? 'nopass' : o.sec};S:${wifiEsc(o.ssid)};${o.sec === 'none' ? '' : `P:${wifiEsc(o.pass)};`}${o.hidden ? 'H:true;' : ''};`;
  return { text, errors, warnings };
}

/** An amount as people type it: ₹ / Rs / INR, digit commas (Indian or international), up to two decimals. */
export function readAmount(s: string): { value: number } | { error: string } | null {
  const t = s.trim().replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/\s*(₹|rs\.?|inr|\/-)$/i, '');
  if (!t) return null;
  // digit commas as in India (1,00,000) or elsewhere (100,000); a comma before two digits at the end is no decimal point
  if (!/^(\d{1,3}(,\d{3})+|\d{1,2}(,\d{2})*,\d{3}|\d+)(\.\d+)?$|^\.\d+$/.test(t)) return { error: `The amount "${s.trim()}" is not a number of rupees (write 49.50, 1,000 or 1,00,000).` };
  const v = Number(t.replace(/,/g, ''));
  if (!/\.\d{0,2}$|^[^.]*$/.test(t)) return { error: 'An amount has at most two decimals (paise).' };
  if (!(v > 0)) return { error: 'The amount must be more than ₹0 — or leave it empty to let the payer type it.' };
  return { value: v };
}

export function upi(o: { vpa: string; name: string; amount: string; note: string }): Checked {
  const errors: string[] = [], warnings: string[] = [];
  const vpa = o.vpa.trim();
  if (!vpa) return { text: '', errors, warnings };
  if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(vpa)) warnings.push('That does not look like a UPI ID (name@bank, e.g. 9820012345@ybl) — check it.');
  const a = readAmount(o.amount);
  if (a && 'error' in a) errors.push(a.error);
  else if (a && a.value > 100000) warnings.push('Most banks refuse a single UPI payment above ₹1,00,000 (some allow more for particular payments).');
  if ([...o.note].length > 50) warnings.push('Some UPI apps cut a note after 50 characters.');
  // the parameters as NPCI's linking specification writes them: values percent-encoded, the @ of the UPI ID as it is
  const enc = (s: string) => encodeURIComponent(s);
  const parts = [`pa=${enc(vpa).replace(/%40/g, '@')}`, `pn=${enc(o.name.trim())}`];
  if (a && 'value' in a) parts.push(`am=${a.value.toFixed(2)}`, 'cu=INR');
  if (o.note.trim()) parts.push(`tn=${enc(o.note.trim())}`);
  return { text: errors.length ? '' : `upi://pay?${parts.join('&')}`, errors, warnings };
}

export function vcard(o: { first: string; last: string; phone: string; email: string; org: string; url: string }): Checked {
  if (!o.first.trim() && !o.last.trim()) return { text: '', errors: [], warnings: [] };
  const warnings: string[] = [];
  if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email.trim())) warnings.push('The e-mail address does not look complete.');
  const text = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(o.last.trim())};${vEsc(o.first.trim())};;;`, `FN:${vEsc(`${o.first.trim()} ${o.last.trim()}`.trim())}`,
    o.org && `ORG:${vEsc(o.org)}`, o.phone && `TEL;TYPE=CELL:${o.phone.trim()}`, o.email && `EMAIL:${o.email.trim()}`, o.url && `URL:${o.url.trim()}`, 'END:VCARD'].filter(Boolean).join('\n');
  return { text, errors: [], warnings };
}

export function email(o: { to: string; subject: string; body: string }): Checked {
  const to = o.to.trim();
  if (!to) return { text: '', errors: [], warnings: [] };
  const warnings = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ? [] : ['The address does not look complete.'];
  const q = [o.subject && `subject=${encodeURIComponent(o.subject)}`, o.body && `body=${encodeURIComponent(o.body)}`].filter(Boolean);
  return { text: `mailto:${to}${q.length ? `?${q.join('&')}` : ''}`, errors: [], warnings };
}

export function sms(o: { phone: string; msg: string }): Checked {
  const p = phoneDigits(o.phone);
  if (!p.replace('+', '')) return { text: '', errors: [], warnings: [] };
  return { text: `SMSTO:${p}:${o.msg}`, errors: [], warnings: [] };
}

export function tel(o: { phone: string }): Checked {
  const p = phoneDigits(o.phone);
  return { text: p.replace('+', '') ? `tel:${p}` : '', errors: [], warnings: [] };
}

/** A calendar event as ZXing's readers take it (a VEVENT); local times written in UTC. */
export function event(o: { title: string; start: string; end: string; place: string }): Checked {
  if (!o.title.trim()) return { text: '', errors: [], warnings: [] };
  const errors: string[] = [];
  const t = (s: string) => (s ? new Date(s) : null);
  const st = t(o.start), en = t(o.end);
  if (st && isNaN(+st)) errors.push('The start is not a date and time.');
  if (en && isNaN(+en)) errors.push('The end is not a date and time.');
  if (st && en && +en <= +st) errors.push('The event ends before it starts.');
  const d = (x: Date) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = ['BEGIN:VEVENT', `SUMMARY:${icsEsc(o.title.trim())}`, st && `DTSTART:${d(st)}`, en && `DTEND:${d(en)}`, o.place && `LOCATION:${icsEsc(o.place.trim())}`, 'END:VEVENT'].filter(Boolean).join('\n');
  return { text: errors.length ? '' : text, errors, warnings: [] };
}

/** Relative luminance (WCAG) of #rrggbb. */
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** A warning when a code in these colours is hard for phone cameras: a light code on a dark ground (many readers look
 *  for dark modules only) or too little contrast. */
export function colourWarning(fg: string, bg: string): string | null {
  const a = lum(fg), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (a > b) return 'A light code on a dark background: many phone cameras cannot read it. Use a dark colour on a light background.';
  if (ratio < 3) return `Too little contrast between the colours (${ratio.toFixed(1)} : 1) — cameras may not read it. Aim for 4 : 1 or more.`;
  return null;
}
