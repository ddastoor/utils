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

// ------------------------------------------------------------------ reading what a scanned code holds
export interface CodeField { label: string; value: string; secret?: boolean }
export interface Described {
  kind: 'wifi' | 'upi' | 'contact' | 'event' | 'email' | 'sms' | 'tel' | 'geo' | 'link' | 'text';
  title: string;
  fields: CodeField[];
  /** A link to open (http(s), mailto:, tel:, sms:, upi:, geo:) — never javascript: or data:. */
  open?: { href: string; label: string };
  /** A file to save (a contact as .vcf, an event as .ics). */
  save?: { name: string; type: string; text: string; label: string };
}

/** Splits "K:v;K:v;" of a MECARD-style string (WIFI:, MECARD:) on unescaped semicolons; \x stands for x. */
function mecard(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key = '', val = '', inKey = true;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) { (inKey ? (key += body[++i]) : (val += body[++i])); continue; }
    if (inKey && c === ':') { inKey = false; continue; }
    if (!inKey && c === ';') { if (key) out[key.toUpperCase()] = val; key = ''; val = ''; inKey = true; continue; }
    if (inKey) key += c; else val += c;
  }
  if (key && !inKey) out[key.toUpperCase()] = val;
  return out;
}

const icsUnesc = (s: string) => s.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
/** The lines of a vCard / iCalendar text, folded lines joined (RFC 5545 §3.1), as [name with parameters, value]. */
function contentLines(text: string): Array<[string, string]> {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).map((l) => { const i = l.indexOf(':'); return i < 0 ? null : [l.slice(0, i), l.slice(i + 1)] as [string, string]; }).filter(Boolean) as Array<[string, string]>;
}
const icsDate = (v: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return v;
  if (!m[4]) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export function describeCode(text: string): Described {
  const t = text.trim();
  if (/^WIFI:/i.test(t)) {
    const f = mecard(t.slice(5)), sec = (f.T || '').toUpperCase();
    return { kind: 'wifi', title: 'Wi-Fi network', fields: [
      { label: 'Network', value: f.S ?? '' },
      ...(f.P ? [{ label: 'Password', value: f.P, secret: true }] : []),
      { label: 'Security', value: !sec || sec === 'NOPASS' ? 'Open (no password)' : sec === 'WPA' ? 'WPA / WPA2 / WPA3' : sec },
      ...(/^true$/i.test(f.H ?? '') ? [{ label: 'Hidden', value: 'yes' }] : []),
    ] };
  }
  if (/^upi:\/\/pay\?/i.test(t)) {
    const p = new URLSearchParams(t.slice(t.indexOf('?') + 1));
    const am = p.get('am');
    return { kind: 'upi', title: 'UPI payment', fields: [
      { label: 'Pay to', value: p.get('pn') || '(no name)' }, { label: 'UPI ID', value: p.get('pa') ?? '' },
      ...(am ? [{ label: 'Amount', value: `₹${Number(am).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }] : [{ label: 'Amount', value: 'typed by the payer' }]),
      ...(p.get('tn') ? [{ label: 'Note', value: p.get('tn')! }] : []),
    ], open: { href: t, label: 'Pay with a UPI app' } };
  }
  if (/^BEGIN:VCARD/i.test(t)) {
    const ls = contentLines(t);
    const unesc = (v: string) => v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
    const raw = (n: string) => ls.filter(([k]) => k.split(';')[0].toUpperCase() === n).map(([, v]) => v);
    const get = (n: string) => raw(n).map(unesc);
    const name = get('FN')[0] || (raw('N')[0] ?? '').split(/(?<!\\);/).slice(0, 2).map(unesc).reverse().join(' ').trim();
    return { kind: 'contact', title: 'Contact', fields: [
      { label: 'Name', value: name }, ...raw('ORG').map((v) => ({ label: 'Company', value: v.split(/(?<!\\);/).map(unesc).filter(Boolean).join(', ') })), // company;department
      ...get('TEL').map((v) => ({ label: 'Phone', value: v })), ...get('EMAIL').map((v) => ({ label: 'E-mail', value: v })), ...get('URL').map((v) => ({ label: 'Website', value: v })),
    ], save: { name: `${(name || 'contact').replace(/[\\/:*?"<>|]+/g, '').trim() || 'contact'}.vcf`, type: 'text/vcard', text: t.replace(/\r?\n/g, '\r\n') + '\r\n', label: 'Save contact (.vcf)' } };
  }
  if (/^MECARD:/i.test(t)) {
    const f = mecard(t.slice(7));
    return { kind: 'contact', title: 'Contact', fields: [{ label: 'Name', value: (f.N ?? '').replace(/,/g, ' ') }, ...(f.TEL ? [{ label: 'Phone', value: f.TEL }] : []), ...(f.EMAIL ? [{ label: 'E-mail', value: f.EMAIL }] : [])] };
  }
  if (/^BEGIN:(VEVENT|VCALENDAR)/i.test(t)) {
    const ls = contentLines(t), get = (n: string) => ls.find(([k]) => k.split(';')[0].toUpperCase() === n)?.[1];
    const title = icsUnesc(get('SUMMARY') ?? '');
    const ics = /^BEGIN:VCALENDAR/i.test(t) ? t : ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SuperUtils//QR scanner//EN', t, 'END:VCALENDAR'].join('\n');
    return { kind: 'event', title: 'Calendar event', fields: [
      { label: 'Event', value: title }, ...(get('DTSTART') ? [{ label: 'Starts', value: icsDate(get('DTSTART')!) }] : []), ...(get('DTEND') ? [{ label: 'Ends', value: icsDate(get('DTEND')!) }] : []),
      ...(get('LOCATION') ? [{ label: 'Place', value: icsUnesc(get('LOCATION')!) }] : []),
    ], save: { name: `${(title || 'event').replace(/[\\/:*?"<>|]+/g, '').trim() || 'event'}.ics`, type: 'text/calendar', text: ics.replace(/\r?\n/g, '\r\n') + '\r\n', label: 'Add to calendar (.ics)' } };
  }
  const mail = /^mailto:([^?]*)(\?.*)?$/i.exec(t);
  if (mail) {
    const q = new URLSearchParams(mail[2]?.slice(1) ?? ''), dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
    return { kind: 'email', title: 'E-mail', fields: [{ label: 'To', value: dec(mail[1]) }, ...(q.get('subject') ? [{ label: 'Subject', value: q.get('subject')! }] : []), ...(q.get('body') ? [{ label: 'Message', value: q.get('body')! }] : [])], open: { href: t, label: 'Write the e-mail' } };
  }
  const sms = /^SMSTO:([^:]*):?([\s\S]*)$/i.exec(t) ?? /^sms:([^?]*)(?:\?body=([\s\S]*))?$/i.exec(t);
  if (sms) {
    const num = sms[1], body = /^sms:/i.test(t) ? decodeURIComponent(sms[2] ?? '') : sms[2];
    return { kind: 'sms', title: 'Text message', fields: [{ label: 'To', value: num }, ...(body ? [{ label: 'Message', value: body }] : [])], open: { href: `sms:${phoneDigits(num)}${body ? `?body=${encodeURIComponent(body)}` : ''}`, label: 'Send the message' } };
  }
  if (/^tel:/i.test(t)) return { kind: 'tel', title: 'Phone number', fields: [{ label: 'Number', value: t.slice(4) }], open: { href: `tel:${phoneDigits(t.slice(4))}`, label: 'Call' } };
  const geo = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(t);
  if (geo) return { kind: 'geo', title: 'Place', fields: [{ label: 'Latitude', value: geo[1] }, { label: 'Longitude', value: geo[2] }], open: { href: `geo:${geo[1]},${geo[2]}`, label: 'Open in a map app' } };
  if (/^https?:\/\/\S+$/i.test(t)) {
    let host = ''; try { host = new URL(t).host; } catch { /* not a URL after all */ }
    if (host) return { kind: 'link', title: 'Link', fields: [{ label: 'Site', value: host }], open: { href: t, label: 'Open link' } };
  }
  return { kind: 'text', title: 'Text', fields: [] };
}
