// Visiting Card → Contact (potentials #89; group 4 of the suggested order): what a business card's reading holds — the name,
// job title, company, phone numbers, e-mail addresses, websites and the address — and the contact file made of it (vCard 3.0,
// RFC 2426: what phones, Outlook and Google Contacts all import); a vCard or a MECARD in a QR code on the card read exactly.
// Phone numbers through the Number Detective's engine (devcore-ids.wasm `ids:tel`: libphonenumber's rules for India, the
// calling codes of every country) — passed in as `tel`. String glue around the readers' output (CLAUDE.md §3a). No DOM: the
// unit suite runs it on the readings of the test photos in Node.

export type PhoneKind = 'cell' | 'work' | 'home' | 'fax' | 'other';
/** `ids:tel`'s answer for one number. */
export interface Tel {
  cc: number | null; country: string | null; nn: string | null; e164: string | null; kind: string; valid: boolean | null;
  intl?: string | null; national?: string | null; place?: string | null; why?: string | null;
}
export type TelOf = (text: string) => Tel;
export interface Phone { number: string; kind: PhoneKind; e164: string | null; tel: Tel | null; printed: string; line: number }
export interface Address { street: string; city: string; region: string; postcode: string; country: string }
export interface Contact {
  prefix: string; first: string; middle: string; last: string; suffix: string;
  title: string; org: string;
  phones: Phone[]; emails: string[]; urls: string[];
  address: Address; note: string;
  /** where it came from: the card's printed text, a QR code on it, or both */
  from: 'card' | 'qr' | 'both';
}
/** A line as the tab gives it (src/lib/snaptext.ts: its parts set apart by wide gaps), or a string — parts apart by a tab. */
export type LineIn = string | { parts: Array<{ text: string; x0: number }>; h: number; text?: string };
export interface CardRead {
  contact: Contact;
  /** what else the card prints (a slogan, a second line of the company, a GSTIN …), line by line */
  others: string[];
  /** the line each value was read from (−1: none) — the tab reads an unsure one again */
  at: { name: number; title: number; org: number; emails: number[]; urls: number[]; address: number[] };
  /** the card's calling code (from its numbers, else its address): for its numbers printed without one */
  cc: number | null;
}

export const emptyAddress = (): Address => ({ street: '', city: '', region: '', postcode: '', country: '' });
export const emptyContact = (): Contact => ({ prefix: '', first: '', middle: '', last: '', suffix: '', title: '', org: '', phones: [], emails: [], urls: [], address: emptyAddress(), note: '', from: 'card' });

// ------------------------------------------------------------------------------------------------------------ words
const low = (s: string) => s.toLowerCase();
const letters = (s: string) => low(s).normalize('NFD').replace(/[^a-z]/g, '');
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,;:|•·\-–—]+|[\s,;:|•·\-–—]+$/g, '').trim();

/** Titles before a name. */
const PREFIX = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'prof', 'er', 'adv', 'ca', 'cs', 'shri', 'sri', 'smt', 'kum', 'kumari', 'capt', 'col', 'maj', 'lt', 'gen', 'brig', 'cdr', 'sir', 'dame', 'rev', 'fr', 'hon', 'justice']);
/** Degrees and the like after a name. */
const SUFFIX = /^(?:MBBS|MD|MS|DM|DNB|MCh|FRCS|MRCS|MRCP|FRCP|BDS|MDS|BAMS|BHMS|PhD|Ph\.?D\.?|MBA|PGDM|CA|CFA|CPA|ACA|FCA|ACS|FCS|CS|LLB|LLM|B\.?Tech|M\.?Tech|B\.?E|M\.?E|B\.?Sc|M\.?Sc|B\.?Com|M\.?Com|Jr|Sr|II|III|IV|Esq)\.?$/;
/** A word of a company's name that says it is one. */
const ORG_SUFFIX = /\b(?:pvt|private|ltd|limited|llp|llc|inc|incorporated|corp|corporation|gmbh|ag|plc|pty|bv|lp|co\.)(?![a-z])/i;
const ORG_WORDS = new Set(('group holdings enterprises enterprise industries technologies technology tech solutions systems services associates consultants consultancy consulting ' +
  'partners labs laboratories laboratory studio studios agency bank hospital hospitals clinic clinics foundation trust society university college institute school academy ' +
  'traders trading exports imports foods pharma pharmaceuticals motors construction constructions builders developers infra infrastructure media communications networks ' +
  'software analytics logistics packaging textiles jewellers jewelers hotels hotel restaurant cafe bakery realty estates properties insurance finance financial capital ' +
  'ventures investments securities advisors global international manufacturing engineering electricals electronics automobiles chemicals steels plastics polymers papers ' +
  'printers publications publishers designs creations events travels tours healthcare diagnostics medical dental care centre center store stores mart emporium sons brothers ' +
  'bros company firm chambers').split(' '));
const TITLE_WORDS = new Set(('ceo cto cfo coo cmo cio cxo cpo chro md founder co-founder cofounder chairman chairperson chairwoman president vice vp avp svp evp partner proprietor owner ' +
  'director manager head lead leader engineer developer programmer architect designer analyst scientist researcher consultant advisor adviser officer executive specialist ' +
  'coordinator co-ordinator associate assistant secretary representative agent broker supervisor administrator principal professor lecturer teacher doctor physician surgeon ' +
  'dentist pharmacist therapist physiotherapist nurse advocate lawyer attorney solicitor barrister accountant auditor editor writer journalist photographer artist chef trainer ' +
  'coach counsellor counselor intern treasurer controller strategist planner buyer merchandiser technician operator inspector surveyor valuer banker underwriter actuary ' +
  'superintendent registrar dean').split(' '));
const TITLE_MODS = new Set(('senior sr junior jr chief general regional area zonal branch deputy joint additional managing global national marketing sales operations business ' +
  'development product project program programme technical finance hr human resources customer relationship account accounts admin purchase procurement quality research ' +
  'strategy legal brand digital creative content growth commercial country territory key').split(' '));
// "St" and "Dr" only after a word (Harley St, Ocean Dr): at the start they are a saint and a doctor (St Mary's, Dr. Meera …)
const STREET = /\b(?:road|rd|street|lane|ln|marg|path|nagar|colony|society|sector|sec|block|blk|plot|floor|flr|tower|towers|building|bldg|complex|estate|park|phase|layout|cross|main|avenue|ave|boulevard|blvd|drive|court|ct|place|pl|square|sq|suite|ste|unit|apt|apartment|apartments|house|bhavan|bhawan|chowk|bazar|bazaar|market|circle|highway|hwy|nh|opp|opposite|near|behind|beside|post|p\.?o|box|district|dist|taluka|tehsil|village|vill|mandal|hills|gardens|enclave|vihar|puram|pet|halli|wadi|peth|industrial|midc|gidc|sez|it\s+park|tech\s+park|mall|plaza|centre|center|chambers|wing|ward|quarter|quarters|cottage|villa|residency|heights)\b|(?<=\p{L}\s)(?:st|dr)\b/iu;
const IN_STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Orissa', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'New Delhi', 'Jammu and Kashmir',
  'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry', 'Pondicherry'];
const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR'.split(' '));
/** Countries a card may end its address with, and their calling codes (for its numbers printed without one). */
const COUNTRIES: Array<[RegExp, string, number]> = [
  [/^india$/i, 'India', 91], [/^(?:united kingdom|uk|u\.k\.|great britain|england|scotland|wales)$/i, 'United Kingdom', 44],
  [/^(?:united states(?: of america)?|usa|u\.s\.a\.?|us|u\.s\.)$/i, 'United States', 1], [/^canada$/i, 'Canada', 1],
  [/^(?:united arab emirates|uae|u\.a\.e\.?)$/i, 'United Arab Emirates', 971], [/^singapore$/i, 'Singapore', 65], [/^australia$/i, 'Australia', 61],
  [/^new zealand$/i, 'New Zealand', 64], [/^germany$/i, 'Germany', 49], [/^france$/i, 'France', 33], [/^japan$/i, 'Japan', 81], [/^china$/i, 'China', 86],
  [/^hong kong$/i, 'Hong Kong', 852], [/^malaysia$/i, 'Malaysia', 60], [/^saudi arabia$/i, 'Saudi Arabia', 966], [/^qatar$/i, 'Qatar', 974], [/^oman$/i, 'Oman', 968],
  [/^kuwait$/i, 'Kuwait', 965], [/^bahrain$/i, 'Bahrain', 973], [/^nepal$/i, 'Nepal', 977], [/^sri lanka$/i, 'Sri Lanka', 94], [/^bangladesh$/i, 'Bangladesh', 880],
  [/^ireland$/i, 'Ireland', 353], [/^netherlands$/i, 'Netherlands', 31], [/^switzerland$/i, 'Switzerland', 41], [/^italy$/i, 'Italy', 39], [/^spain$/i, 'Spain', 34],
  [/^south africa$/i, 'South Africa', 27], [/^kenya$/i, 'Kenya', 254], [/^nigeria$/i, 'Nigeria', 234],
];
/** Countries whose numbers have no trunk 0 in front when written at home (the number follows the calling code as printed). */
const NO_TRUNK = new Set([1, 65, 852, 974, 968, 965, 973, 971, 966, 34, 39]);
const countryOf = (s: string) => COUNTRIES.find(([re]) => re.test(s.trim().replace(/\.$/, '')));

/** Mail services: their domain says nothing of the company. */
const FREEMAIL = /^(?:gmail|googlemail|yahoo|ymail|rocketmail|outlook|hotmail|live|msn|icloud|me|mac|aol|rediffmail|rediff|protonmail|proton|zoho|zohomail|gmx|yandex|mail|inbox|fastmail|hey|tutanota)$/;
const TLD = new Set(('com in co org net io ai app dev info biz me tech store online site xyz uk us eu de fr jp sg ae au ca nz ch nl it es za ke ng lk np bd pk my hk cn ru br mx edu gov ' +
  'ac health care law studio design agency digital media global world solutions company consulting travel shop live life news blog cloud page link website space today pro ' +
  'club group work email email tv fm ly gg to').split(' '));
const SECOND = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'firm', 'gen', 'ind', 'nic', 'res', 'ernet', 'ltd', 'plc']);

/** The label of a domain that names the company: "www.kaverisoft.in" → kaverisoft, "x.co.uk" → x. */
export function domainName(host: string): string {
  const ls = low(host).replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '').replace(/^www\d?\./, '').split('.').filter(Boolean);
  if (ls.length < 2) return ls[0] || '';
  const i = ls.length >= 3 && SECOND.has(ls[ls.length - 2]) ? ls.length - 3 : ls.length - 2;
  return ls[i];
}
/** How much of `dom` (a domain's label) the words of `text` spell from its start, each word by a beginning of it: "Kaveri
 *  Software Solutions" spells all of "kaverisoft", "St Mary's Heart Clinic" all of "stmaryheart". 0 – 1. */
export function spells(dom: string, text: string): number {
  if (dom.length < 3) return 0;
  let pos = 0, used = 0;
  for (const raw of words(text)) {
    const w = letters(raw.replace(/['’]s$/i, ''));
    if (!w) continue;
    let k = Math.min(w.length, dom.length - pos);
    while (k > 0 && dom.slice(pos, pos + k) !== w.slice(0, k)) k--;
    if (k >= Math.min(2, w.length) && k > 0) { pos += k; used++; if (pos >= dom.length) break; }
    else if (used) break;
  }
  return used ? pos / dom.length : 0;
}

// ------------------------------------------------------------------------------------------------------------ names
/** A name as written on a card → its parts: a title before it (Dr., Shri), degrees after it (", MD", "MBBS"), the first, middle
 *  and last names — the last word is the last name, or the first with `familyFirst`. A name in capitals is given its capitals
 *  only at the start of each part ("ANANYA IYER" → Ananya Iyer, "O'BRIEN" → O'Brien). */
export function splitName(text: string, familyFirst = false): Pick<Contact, 'prefix' | 'first' | 'middle' | 'last' | 'suffix'> {
  let t = tidy(text);
  let suffix = '';
  const comma = t.indexOf(',');
  if (comma > 0) { suffix = tidy(t.slice(comma + 1)); t = tidy(t.slice(0, comma)); }
  let ws = words(t);
  const pre: string[] = [];
  while (ws.length > 1 && PREFIX.has(low(ws[0]).replace(/\.$/, ''))) pre.push(ws.shift()!);
  const post: string[] = [];
  while (ws.length > 2 && SUFFIX.test(ws[ws.length - 1])) post.unshift(ws.pop()!);
  if (post.length) suffix = [post.join(' '), suffix].filter(Boolean).join(', ');
  const caps = ws.length > 0 && ws.every((w) => w === w.toUpperCase());
  if (caps) ws = ws.map(nameCase);
  const prefix = pre.map((p) => (p === p.toUpperCase() && p.length > 3 ? nameCase(p) : p)).join(' ');
  if (!ws.length) return { prefix, first: '', middle: '', last: '', suffix };
  if (ws.length === 1) return { prefix, first: ws[0], middle: '', last: '', suffix };
  if (familyFirst) return { prefix, last: ws[0], first: ws[1], middle: ws.slice(2).join(' '), suffix };
  return { prefix, first: ws[0], middle: ws.slice(1, -1).join(' '), last: ws[ws.length - 1], suffix };
}
/** "ANANYA" → Ananya, "O'BRIEN" → O'Brien, "MARY-JANE" → Mary-Jane; an initial stays ("A."). */
export const nameCase = (w: string) => w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
/** The name as a card would print it: "Dr. Meera Krishnan, MD". */
export const fullName = (c: Pick<Contact, 'prefix' | 'first' | 'middle' | 'last' | 'suffix'>) =>
  [[c.prefix, c.first, c.middle, c.last].filter(Boolean).join(' '), c.suffix].filter(Boolean).join(', ');
/** What a contact is called in a list: its name, else its company, its e-mail, its first number. */
export const displayName = (c: Contact) => fullName(c) || c.org || c.emails[0] || c.phones[0]?.number || '';

const NAME_WORD = /^(?:\p{Lu}[\p{Ll}'’\-.]*|\p{Lu}[\p{Lu}'’\-]*|(?:\p{Lu}\.){1,4}|(?:van|von|de|da|di|del|della|la|le|al|el|bin|binti|ibn|ben|du|dos|das|ter|ten)\.?)$/u;
/** How much a part looks like a person's name (0: not at all). */
function nameScore(text: string, h: number, maxH: number, locals: string[][]): number {
  const t = tidy(text);
  if (!t || /[\d@/&|:+_=#]/.test(t) || t.length > 48) return 0;
  const sp = splitName(t);
  const core = [sp.first, sp.middle, sp.last].filter(Boolean).join(' ');
  const ws = words(core);
  if (!ws.length || ws.length > 5 || !ws.every((w) => NAME_WORD.test(w)) || !ws.some((w) => letters(w).length >= 2)) return 0;
  const lw = words(t).map((w) => letters(w));
  if (ORG_SUFFIX.test(t) || lw.some((w) => ORG_WORDS.has(w))) return 0;
  if (lw.some((w) => TITLE_WORDS.has(w) || /(?:ologist|ician)$/.test(w))) return 0;
  if (STREET.test(t) || countryOf(t) || IN_STATES.some((s) => low(s) === low(t))) return 0;
  let s = 1 + (maxH ? (3 * h) / maxH : 0);
  if (ws.length >= 2 && ws.length <= 4) s += 1; else if (ws.length === 1) s -= 1;
  if (sp.prefix) s += 1.5;
  // the name agrees with an e-mail address on the card: ananya.iyer@… — the strongest sign there is
  const ns = ws.map(letters).filter(Boolean);
  for (const loc of locals) {
    const full = loc.filter((x) => x.length >= 2 && ns.includes(x)).length;
    const init = loc.filter((x) => x.length === 1 && ns.some((n) => n[0] === x)).length;
    if (full) s += 3 + (full + init === loc.length ? 2 : 0);
  }
  return s;
}
function titleScore(text: string): number {
  const t = tidy(text);
  if (!t || /[@]/.test(t) || /\d{3}/.test(t) || t.length > 70) return 0;
  const lw = words(t.replace(/[&,/]/g, ' ')).map(letters).filter(Boolean);
  let s = 0;
  for (const w of lw) { if (TITLE_WORDS.has(w) || /(?:ologist|ician)$/.test(w) || (w.length >= 7 && /ist$/.test(w))) s += 3; else if (TITLE_MODS.has(w)) s += 0.5; }
  if (/\b(?:of|&|and)\b/i.test(t) && s) s += 0.5; // Head of Marketing, Sales & Marketing
  if (ORG_SUFFIX.test(t)) s -= 5;
  return s;
}
function orgScore(text: string, doms: string[]): number {
  const t = tidy(text);
  if (!t || /@/.test(t) || t.length > 80) return 0;
  let s = 0;
  if (ORG_SUFFIX.test(t)) s += 4;
  const lw = words(t).map((w) => letters(w));
  s += 1.5 * Math.min(2, lw.filter((w) => ORG_WORDS.has(w)).length);
  if (/&/.test(t)) s += 0.5;
  for (const d of doms) if (spells(d, t) >= 0.8) { s += 4; break; }
  return s;
}

// ------------------------------------------------------------------------------------------------------------ addresses
const PIN = /\b([1-9]\d{2})\s?(\d{3})\b/;
const UK_POST = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/;
const US_ZIP = /\b([A-Z]{2})\s?(\d{5}(?:-\d{4})?)\b/;
const HOUSE = /^(?:\d+[A-Za-z]?(?:[/-]\d+)?(?:st|nd|rd|th)?\b|(?:no|plot|unit|flat|shop|door|house|h\.?\s?no)\.?\s*\d)/i;
/** How much a part looks like a line of an address. */
function addressScore(text: string): number {
  const t = tidy(text);
  if (!t || /@/.test(t)) return 0;
  let s = 0;
  if (PIN.test(t) && !/\d{7}/.test(t.replace(/\s/g, '')) || UK_POST.test(t) || (US_ZIP.test(t) && US_STATES.has(t.match(US_ZIP)![1]))) s += 3;
  if (STREET.test(t)) s += HOUSE.test(t) ? 2 : 1;
  else if (HOUSE.test(t) && /\p{L}{3}/u.test(t)) s += 1;
  const pieces = t.split(',').map((x) => x.trim()).filter(Boolean);
  if (pieces.some((p) => countryOf(p))) s += 2;
  if (pieces.some((p) => IN_STATES.some((st) => low(p).startsWith(low(st))))) s += 1;
  if (pieces.length >= 3) s += 1;
  if (ORG_SUFFIX.test(t)) s -= 3;
  // a company's name with a street word in it ("Harley Street Clinic") is no line of an address — unless it has its number
  else if (words(t).some((w) => ORG_WORDS.has(letters(w))) && !HOUSE.test(t) && s < 3) s -= 1.5;
  if (titleScore(t) >= 3) s -= 2;
  return s;
}
/** An address as one text ("4th Floor, Prestige Tower, MG Road, Bengaluru 560001") → its parts: the PIN code (India), the
 *  postcode (the United Kingdom) or the state and ZIP code (the United States), the city before it, a state named, a country at
 *  the end; the rest is the street. */
export function parseAddress(text: string): Address {
  const a = emptyAddress();
  let ps = text.split(',').map(tidy).filter(Boolean);
  if (!ps.length) return a;
  const last = ps[ps.length - 1], c = countryOf(last);
  if (c && ps.length > 1) { a.country = last; ps = ps.slice(0, -1); }
  // a state after the code ("Bengaluru - 560 034, Karnataka")
  if (ps.length > 1 && IN_STATES.some((s) => low(s) === low(ps[ps.length - 1])) && /\d/.test(ps[ps.length - 2])) { a.region = ps[ps.length - 1]; ps = ps.slice(0, -1); }
  // the piece with the code: from the end
  for (let i = ps.length - 1; i >= 0; i--) {
    let p = ps[i], m: RegExpMatchArray | null;
    if ((m = p.match(US_ZIP)) && US_STATES.has(m[1]) && (i === ps.length - 1)) { a.region = m[1]; a.postcode = m[2]; p = tidy(p.replace(m[0], '')); }
    else if ((m = p.match(UK_POST)) && !/^\d+$/.test(m[1])) { a.postcode = `${m[1]} ${m[2]}`; p = tidy(p.replace(m[0], '')); }
    else if ((m = p.match(PIN)) && !/\d{7}/.test(p.replace(/\s/g, ''))) { a.postcode = m[1] + m[2]; p = tidy(p.replace(m[0], '').replace(/\b(?:pin(?:\s*code)?|pincode)\s*[:.\-–]?\s*$/i, '')); }
    else continue;
    const st = IN_STATES.find((s) => low(s) === low(p));
    if (p && st) { a.region = p; p = ''; }
    if (p) { a.city = p; ps.splice(i, 1); }
    else ps.splice(i, 1);
    // a state named in the piece before (Ahmedabad, Gujarat 382445)
    if (!a.region && i - 1 >= 0 && IN_STATES.some((s) => low(s) === low(ps[i - 1]))) { a.region = ps[i - 1]; ps.splice(i - 1, 1); i--; }
    if (!a.city && i - 1 >= 0) { a.city = ps[i - 1]; ps.splice(i - 1, 1); }
    break;
  }
  if (!a.postcode) {
    // no code: a state or a country at the end, the city before it
    const j = ps.findIndex((p) => IN_STATES.some((s) => low(s) === low(p)));
    if (j > 0) { a.region = ps[j]; a.city = ps[j - 1]; ps.splice(j - 1, 2); }
  }
  a.street = ps.join(', ');
  return a;
}
/** The address as one text, in the order a card prints it: street, city[, region] postcode[, country] — "Bengaluru 560001",
 *  "Ahmedabad, Gujarat 382445", "London W1G 9PF", "San Jose, CA 95134". */
export function addressText(a: Address): string {
  const tail = [a.region, a.postcode].filter(Boolean).join(' ');
  const town = a.region ? [a.city, tail].filter(Boolean).join(', ') : [a.city, a.postcode].filter(Boolean).join(' ');
  return [a.street, town, a.country].filter(Boolean).join(', ');
}

// ------------------------------------------------------------------------------------------------------------ phones, e-mail, web
const EMAIL = /([A-Za-z0-9][A-Za-z0-9._%+\-]*)\s?[@©®]\s?([A-Za-z0-9\-]+(?:\s?\.\s?[A-Za-z0-9\-]+)*\s?\.\s?[A-Za-z]{2,})/g;
const WEB = /\b((?:https?:\/\/)?(?:www\d?\.)?[A-Za-z0-9][A-Za-z0-9\-]*(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,24}(?:\/[^\s,;]*)?)/gi;
const LABEL_BEFORE = /(?:^|[\s|,;/(•·])(mobile|mob|cell(?:ular)?|whatsapp|wa|handphone|h\/p|hp|tel(?:ephone)?|phone|ph|office|off|work|direct|dir|did|board|landline|res(?:idence)?|home|fax|toll[- ]?free|helpline|hotline|call|contact|m|c|t|p|o|w|d|h|r|f)\.?\s*(?:no\.?|number|#)?\s*[:.\-–]?\s*$/i;
const LABEL_AFTER = /^\s*\(\s*(m|mob|mobile|c|cell|o|off|office|0|w|work|r|res|h|home|f|fax|d|direct)\s*\)/i;
const KIND: Array<[RegExp, PhoneKind | null]> = [
  [/^(?:mobile|mob|m|cell(?:ular)?|c|whatsapp|wa|handphone|h\/p|hp)$/i, 'cell'], [/^(?:fax|f)$/i, 'fax'],
  [/^(?:res(?:idence)?|home|r|h)$/i, 'home'], [/^(?:office|off|o|0|work|w|direct|dir|d|did|board|landline|toll[- ]?free|helpline|hotline)$/i, 'work'],
  [/^(?:tel(?:ephone)?|phone|ph|p|t|call|contact)$/i, null],
];
const kindOfLabel = (l: string): PhoneKind | null | undefined => KIND.find(([re]) => re.test(l))?.[1];
/** A number's kind from what the engine says of it, where the card's label does not say. */
const kindOfTel = (t: Tel | null): PhoneKind => (t?.kind === 'mobile' || t?.kind === 'fixed_line_or_mobile' ? 'cell' : 'work');

/** One phone number as printed (and labelled) → its entry: the engine's reading, with the card's country for a number printed
 *  without a calling code; the number to save (libphonenumber's international form for an Indian number, the calling code and
 *  the number as printed for another country's, else as printed). */
export function phoneOf(printed: string, label: PhoneKind | null, tel: TelOf, cardCC: number | null, line = -1): Phone {
  let p = tidy(printed).replace(/^(\+\s?\d{1,3}|00\d{1,3})\s*\(\s*0\s*\)\s*/, '$1 ');
  let t: Tel | null = tel(p);
  let shown = p;
  // on a card from abroad a number without a calling code is that country's first ("020 7946 0959" on a London card is no
  // landline of Pune, whose STD code is 020 too)
  if (cardCC && cardCC !== 91 && !/^\s*(?:\+|00)/.test(p)) {
    const d = p.replace(/\D/g, '');
    const nn = cardCC === 1 ? (d.length === 11 && d[0] === '1' ? d.slice(1) : d) : d[0] === '0' ? d.slice(1) : NO_TRUNK.has(cardCC) ? d : '';
    if (nn) {
      const t2 = tel(`+${cardCC}${nn}`);
      if (t2.e164 && t2.valid !== false) { t = t2; shown = `+${cardCC} ${p.replace(/^\s*(?:1[\s\-.]+(?=\(?\d))?/, cardCC === 1 ? '' : '').replace(/^0\s?/, '')}`.replace(/\s+/g, ' '); }
    }
  } else if (t.cc && t.cc !== 91 && t.e164) {
    // another country's number: its calling code, then the rest as the card groups it
    const rest = p.replace(/^\+\s?/, '').replace(/^00/, '').replace(/^\s*/, '');
    const cc = String(t.cc);
    shown = `+${cc} ${rest.slice(rest.indexOf(cc) + cc.length).replace(/^[\s\-.]+/, '')}`;
  }
  if (t.cc === 91 && t.valid && t.intl) shown = t.intl;
  if (!t.e164) t = t.cc ? t : null;
  return { number: tidy(shown), kind: label ?? kindOfTel(t), e164: t?.e164 ?? null, tel: t, printed: tidy(printed), line };
}

/** The phone numbers in a part's text (with what was before and after each, to find its label). */
function findPhones(text: string): Array<{ s: number; e: number; printed: string; label: PhoneKind | null }> {
  const out: Array<{ s: number; e: number; printed: string; label: PhoneKind | null }> = [];
  const RUN = /(?:\+\s?\(?|\(|\b)\d[\d \t().\-]*\d\)?/g;
  let m: RegExpExecArray | null, prevLabel: PhoneKind | null = null, prevEnd = 0;
  while ((m = RUN.exec(text))) {
    let run = m[0], s = m.index, e = s + run.length, label: PhoneKind | null | undefined;
    // "080 4112 3456 (0)": the (O) of an office number, read as a zero
    const z = run.match(/\s*\(\s*0\s*\)\s*$/);
    if (z && run.slice(0, z.index!).replace(/\D/g, '').length >= 7) { run = run.slice(0, z.index); label = 'work'; }
    run = run.replace(/[\s(.\-]+$/, '');
    const digits = run.replace(/\D/g, '');
    if (digits.length < 7) continue;
    const before = text.slice(prevEnd, s);
    const lb = before.match(LABEL_BEFORE);
    if (label === undefined && lb) label = kindOfLabel(lb[1]);
    const la = text.slice(e).match(LABEL_AFTER);
    if (la) { label = kindOfLabel(la[1]) ?? label; e += la[0].length; }
    // "M: 99001 23456 / 99001 65432": the second takes the first's label when only a slash stands between them
    if (label === undefined && out.length && /^\s*[/|,]\s*$/.test(before)) label = prevLabel;
    out.push({ s, e, printed: run.trim(), label: label ?? null });
    prevLabel = label ?? null; prevEnd = e;
    RUN.lastIndex = e;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------ the card
interface P { text: string; line: number; x0: number; h: number; rest: string }
const partsOf = (lines: LineIn[]): P[] => lines.flatMap((l, i) => typeof l === 'string'
  ? l.split('\t').map((t, k) => ({ text: t, line: i, x0: k * 10000, h: 20, rest: t }))
  : l.parts.map((p) => ({ text: p.text, line: i, x0: p.x0, h: l.h, rest: p.text })));

/** A card's reading (its lines, and the text of any QR code found on it) → the contact. */
export function readCard(lines: LineIn[], codes: string[], tel: TelOf): CardRead {
  const c = emptyContact();
  const at: CardRead['at'] = { name: -1, title: -1, org: -1, emails: [], urls: [], address: [] };
  const ps = partsOf(lines);
  // 1. e-mail addresses and websites: unmistakable, taken out of their parts first
  for (const p of ps) {
    p.rest = p.rest.replace(EMAIL, (_, a: string, b: string) => {
      const e = `${a}@${b.replace(/\s/g, '').toLowerCase()}`.replace(/\.$/, '');
      if (!c.emails.some((x) => low(x) === low(e))) { c.emails.push(e); at.emails.push(p.line); }
      return ' ';
    }).replace(/\b(?:e-?mail|mail|e)\s*(?:id)?\s*[:.\-–]\s*$/i, '').replace(/^\s*(?:e-?mail|mail|e)\s*(?:id)?\s*[:.\-–]?\s*$/i, '');
    p.rest = p.rest.replace(WEB, (w: string) => {
      const host = w.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '');
      const ls = host.split('.');
      const ok = /^(?:https?:\/\/|www\d?\.)/i.test(w) || (w === w.toLowerCase() && TLD.has(ls[ls.length - 1]) && ls[0].length >= 3 && !/^\d+$/.test(ls[0]));
      if (!ok) return w;
      const u = w.replace(/[.,;:)]+$/, '');
      if (!c.urls.some((x) => low(x) === low(u))) { c.urls.push(u); at.urls.push(p.line); }
      return ' ';
    }).replace(/\b(?:web(?:site)?|url|site|w)\s*[:.\-–]?\s*$/i, '');
  }
  const locals = c.emails.map((e) => e.split('@')[0].toLowerCase().split(/[._\-+\d]+/).filter(Boolean));
  const doms = [...c.emails.map((e) => e.split('@')[1]), ...c.urls].map(domainName).filter((d) => d && !FREEMAIL.test(d));
  // 2. phone numbers: labelled, with a calling code, or long enough — not the codes of an address
  const found: Array<{ printed: string; label: PhoneKind | null; line: number }> = [];
  for (const p of ps) {
    const addr = addressScore(p.rest) >= 3 && !/\+|\b(?:tel|ph|phone|mob|mobile|fax|cell)\b/i.test(p.rest);
    if (addr) continue;
    const hits = findPhones(p.rest);
    if (!hits.length) continue;
    let keep = '', k = 0;
    for (const hit of hits) {
      const d = hit.printed.replace(/\D/g, '');
      if (d.length < 8 && !hit.label && !/^\+/.test(hit.printed)) continue;
      found.push({ printed: hit.printed, label: hit.label, line: p.line });
      keep += p.rest.slice(k, hit.s); k = hit.e;
    }
    keep += p.rest.slice(k);
    p.rest = keep.replace(LABEL_BEFORE, ' ').replace(/(?:^|\s)(?:mobile|mob|cell|tel|telephone|phone|ph|office|off|fax|m|t|f|o|p|w|d|h|r|c)\s*[:.\-–]?(?=\s|$)/gi, ' ');
  }
  // 3. the address: lines of an address in one column, one after another
  const text = ps.filter((p) => /[\p{L}\p{N}]/u.test(p.rest));
  const sc = new Map(text.map((p) => [p, addressScore(p.rest)]));
  const blocks: P[][] = [];
  for (const p of [...text].sort((a, b) => a.line - b.line || a.x0 - b.x0)) {
    if ((sc.get(p) ?? 0) < 1) continue;
    const b = blocks.find((bl) => { const q = bl[bl.length - 1]; return p.line - q.line === 1 && Math.abs(p.x0 - q.x0) <= 2 * Math.max(p.h, q.h); });
    if (b) b.push(p); else blocks.push([p]);
  }
  const best = blocks.map((b) => ({ b, s: b.reduce((t, p) => t + (sc.get(p) ?? 0), 0) })).filter((x) => x.s >= 3 || x.b.some((p) => (sc.get(p) ?? 0) >= 3)).sort((x, y) => y.s - x.s)[0];
  const used = new Set<P>();
  if (best) {
    const full = best.b.map((p) => tidy(p.rest)).join(', ').replace(/,\s*,/g, ',');
    c.address = parseAddress(full);
    for (const p of best.b) { used.add(p); at.address.push(p.line); }
  }
  // the card's country: from its numbers' calling codes, else its address
  const ccs = found.map((f) => tel(f.printed).cc).filter((x): x is number => !!x);
  const addrCC = c.address.country ? countryOf(c.address.country)?.[2] : c.address.postcode && /^\d{5}/.test(c.address.postcode) && US_STATES.has(c.address.region) ? 1
    : /^[A-Z]/.test(c.address.postcode) ? 44 : c.address.postcode ? 91 : null;
  const cardCC = ccs.length ? ccs.sort((a, b) => ccs.filter((x) => x === b).length - ccs.filter((x) => x === a).length)[0] : addrCC ?? null;
  for (const f of found) {
    const ph = phoneOf(f.printed, f.label, tel, cardCC, f.line);
    const key = ph.e164 ?? ph.number.replace(/\D/g, '');
    if (!c.phones.some((x) => (x.e164 ?? x.number.replace(/\D/g, '')) === key)) c.phones.push(ph);
  }
  // 4. the name, the company and the job title among the parts left
  const rest = text.filter((p) => !used.has(p));
  const maxH = Math.max(0, ...rest.map((p) => p.h));
  const pick = (score: (p: P) => number, min: number) => {
    let bestP: P | null = null, bs = min;
    for (const p of rest) { if (used.has(p)) continue; const s = score(p); if (s > bs) { bs = s; bestP = p; } }
    if (bestP) used.add(bestP);
    return bestP as P | null;
  };
  const nameP = pick((p) => nameScore(p.rest, p.h, maxH, locals), 2.6);
  if (nameP) { Object.assign(c, splitName(nameP.rest)); at.name = nameP.line; }
  const orgP = pick((p) => orgScore(p.rest, doms), 1.4);
  if (orgP) { c.org = tidy(orgP.rest); at.org = orgP.line; }
  const titleP = pick((p) => { const s = titleScore(p.rest); return s && nameP ? s + (p.line - nameP.line === 1 ? 2 : nameP.line - p.line === 1 ? 1 : 0) : s; }, 2.4);
  if (titleP) { c.title = tidy(titleP.rest); at.title = titleP.line; }
  const others = rest.filter((p) => !used.has(p)).sort((a, b) => a.line - b.line || a.x0 - b.x0).map((p) => tidy(p.rest)).filter((t) => /\p{L}{2}/u.test(t));
  // 5. a QR code on the card: its contact exact, the card's printed text filling what it leaves out
  let out = c;
  for (const code of codes) {
    const q = /^BEGIN:VCARD/i.test(code.trim()) ? parseVcards(code, tel)[0] : /^MECARD:/i.test(code.trim()) ? parseMecard(code, tel) : null;
    if (q) { out = mergeContacts(q, out); out.from = sameContact(q, out) ? 'qr' : 'both'; break; }
    if (/^https?:\/\//i.test(code.trim()) && !out.urls.some((u) => low(u) === low(code.trim()))) out.urls.push(code.trim());
  }
  return { contact: out, others, at, cc: cardCC };
}
/** Did the card print nothing the QR code did not hold? */
const sameContact = (q: Contact, m: Contact) => q.phones.length === m.phones.length && q.emails.length === m.emails.length && q.urls.length === m.urls.length && !!addressText(q.address) === !!addressText(m.address) && !!q.title === !!m.title && !!q.org === !!m.org;

/** Two readings of one person (a QR code and the printed text; the card's two sides) → one contact: `a`'s fields first, `b`
 *  filling those `a` leaves empty, the numbers, e-mail addresses and websites of both (each once). */
export function mergeContacts(a: Contact, b: Contact): Contact {
  const c: Contact = { ...a, phones: [...a.phones], emails: [...a.emails], urls: [...a.urls], address: { ...a.address } };
  if (!fullName(c) && fullName(b)) Object.assign(c, { prefix: b.prefix, first: b.first, middle: b.middle, last: b.last, suffix: b.suffix });
  else if (fullName(c) && !c.prefix && b.prefix && low(b.first) === low(c.first)) c.prefix = b.prefix;
  if (!c.title) c.title = b.title;
  if (!c.org) c.org = b.org;
  for (const p of b.phones) { const k = p.e164 ?? p.number.replace(/\D/g, ''); if (!c.phones.some((x) => (x.e164 ?? x.number.replace(/\D/g, '')) === k)) c.phones.push(p); }
  for (const e of b.emails) if (!c.emails.some((x) => low(x) === low(e))) c.emails.push(e);
  const bare = (u: string) => low(u).replace(/^https?:\/\//, '').replace(/^www\d?\./, '').replace(/\/$/, '');
  for (const u of b.urls) if (!c.urls.some((x) => bare(x) === bare(u))) c.urls.push(u);
  if (!addressText(c.address)) c.address = { ...b.address };
  if (!c.note) c.note = b.note;
  return c;
}

// ------------------------------------------------------------------------------------------------------------ vCard 3.0
const vEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/([;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
const TEL_TYPE: Record<PhoneKind, string> = { cell: 'CELL', work: 'WORK,VOICE', home: 'HOME,VOICE', fax: 'WORK,FAX', other: 'VOICE' };
/** A line folded at 75 octets (RFC 2426 §2.6), never inside a character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '', n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
export const webUrl = (u: string) => (/^[a-z][a-z0-9+.\-]*:/i.test(u) ? u : `https://${u}`);
/** One contact as a vCard 3.0 (CRLF line ends, lines folded at 75 octets). */
export function vcardOne(c: Contact): string {
  const fn = fullName(c) || c.org || c.emails[0] || c.phones[0]?.number || 'Contact';
  const a = c.address;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0',
    `N:${[c.last, c.first, c.middle, c.prefix, c.suffix].map((x) => vEsc(x.trim())).join(';')}`, `FN:${vEsc(fn)}`,
    c.org.trim() && `ORG:${vEsc(c.org.trim())}`, c.title.trim() && `TITLE:${vEsc(c.title.trim())}`,
    ...c.phones.filter((p) => p.number.trim()).map((p) => `TEL;TYPE=${TEL_TYPE[p.kind]}:${p.number.trim()}`),
    ...c.emails.filter((e) => e.trim()).map((e) => `EMAIL;TYPE=INTERNET:${e.trim()}`),
    ...c.urls.filter((u) => u.trim()).map((u) => `URL:${webUrl(u.trim())}`),
    addressText(a) && `ADR;TYPE=WORK:;;${[a.street, a.city, a.region, a.postcode, a.country].map((x) => vEsc(x.trim())).join(';')}`,
    c.note.trim() && `NOTE:${vEsc(c.note.trim())}`, 'END:VCARD'].filter(Boolean) as string[];
  return lines.map(fold).join('\r\n') + '\r\n';
}
/** Several contacts in one file (phones and Outlook take a file of many). */
export const vcardOf = (cs: Contact | Contact[]) => (Array.isArray(cs) ? cs : [cs]).map(vcardOne).join('');
/** A file name for a contact: "Ananya Iyer.vcf". */
export const fileName = (c: Contact, ext = 'vcf') => `${(displayName(c) || 'contact').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'contact'}.${ext}`;

// ------------------------------------------------------------------------------------------------------------ reading vCards
const unesc = (s: string) => s.replace(/\\([\\;,nN:])/g, (_, ch) => (ch === 'n' || ch === 'N' ? '\n' : ch));
const splitUnesc = (s: string, sep: string) => { const out: string[] = []; let cur = ''; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === '\\' && i + 1 < s.length) { cur += ch + s[++i]; continue; } if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const qp = (s: string) => { try { const b = s.replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))); return new TextDecoder().decode(Uint8Array.from(b, (ch) => ch.charCodeAt(0))); } catch { return s; } };
const kindOfTypes = (ts: string[]): PhoneKind | null => (ts.some((t) => /^(?:cell|mobile|iphone)$/i.test(t)) ? 'cell' : ts.some((t) => /^fax$/i.test(t)) ? 'fax' : ts.some((t) => /^home$/i.test(t)) ? 'home' : ts.some((t) => /^(?:work|main)$/i.test(t)) ? 'work' : null);
/** The contacts of a vCard text (2.1, 3.0 and 4.0 as phones write them): N, FN, ORG, TITLE, TEL, EMAIL, URL, ADR, NOTE. */
export function parseVcards(text: string, tel?: TelOf): Contact[] {
  const out: Contact[] = [];
  const src = text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const lines: string[] = [];
  for (let k = 0; k < src.length; k++) {
    let l = src[k];
    // vCard 2.1's quoted-printable values go on over lines that end in a soft break ("=")
    if (/^[^:]*;[^:]*encoding=quoted-printable[^:]*:/i.test(l)) while (l.endsWith('=') && k + 1 < src.length) l = l.slice(0, -1) + src[++k];
    lines.push(l);
  }
  let c: Contact | null = null, fn = '';
  for (const raw of lines) {
    const i = raw.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (i < 0) continue;
    const head = raw.slice(0, i), [name0, ...params] = splitUnesc(head, ';'), name = name0.replace(/^[^.]*\./, '').toUpperCase();
    let value = raw.slice(i + 1);
    if (name === 'BEGIN' && /^vcard$/i.test(value.trim())) { c = emptyContact(); c.from = 'qr'; fn = ''; continue; }
    if (!c) continue;
    if (name === 'END') { if (!fullName(c) && fn && fn !== c.org) Object.assign(c, splitName(fn)); out.push(c); c = null; continue; }
    const types = params.flatMap((p) => { const [k, v] = p.includes('=') ? p.split('=') : ['TYPE', p]; return /^type$/i.test(k) ? v.replace(/"/g, '').split(',') : []; });
    if (params.some((p) => /^encoding=quoted-printable$/i.test(p))) value = qp(value);
    switch (name) {
      case 'N': { const [last = '', first = '', middle = '', prefix = '', suffix = ''] = splitUnesc(value, ';').map((x) => unesc(x).trim()); Object.assign(c, { last, first, middle, prefix, suffix }); break; }
      case 'FN': fn = unesc(value).trim(); break;
      case 'ORG': c.org = splitUnesc(value, ';').map((x) => unesc(x).trim()).filter(Boolean).join(', '); break;
      case 'TITLE': c.title = unesc(value).trim(); break;
      case 'TEL': {
        const num = unesc(value).replace(/^tel:/i, '').trim();
        if (num) { const p = tel ? phoneOf(num, kindOfTypes(types), tel, null) : { number: num, kind: kindOfTypes(types) ?? 'work', e164: null, tel: null, printed: num, line: -1 }; c.phones.push(p); }
        break;
      }
      case 'EMAIL': { const e = unesc(value).replace(/^mailto:/i, '').trim(); if (e) c.emails.push(e); break; }
      case 'URL': { const u = unesc(value).trim(); if (u) c.urls.push(u); break; }
      case 'ADR': { const [, , street = '', city = '', region = '', postcode = '', country = ''] = splitUnesc(value, ';').map((x) => unesc(x).trim()); c.address = { street, city, region, postcode, country }; break; }
      case 'NOTE': c.note = unesc(value).trim(); break;
    }
  }
  return out;
}
/** A MECARD (DoCoMo's contact code: MECARD:N:Last,First;TEL:…;EMAIL:…;;). */
export function parseMecard(text: string, tel?: TelOf): Contact | null {
  const t = text.trim();
  if (!/^MECARD:/i.test(t)) return null;
  const c = emptyContact(); c.from = 'qr';
  for (const f of splitUnesc(t.slice(7), ';')) {
    const i = f.indexOf(':');
    if (i < 0) continue;
    const k = f.slice(0, i).toUpperCase(), v = f.slice(i + 1).replace(/\\([\\;,:"])/g, '$1').trim();
    if (!v) continue;
    if (k === 'N') { const [last, first = ''] = v.includes(',') ? v.split(',') : [v.split(' ').slice(-1)[0], v.split(' ').slice(0, -1).join(' ')]; c.last = last.trim(); c.first = first.trim(); }
    else if (k === 'TEL') c.phones.push(tel ? phoneOf(v, null, tel, null) : { number: v, kind: 'work', e164: null, tel: null, printed: v, line: -1 });
    else if (k === 'EMAIL') c.emails.push(v);
    else if (k === 'URL') c.urls.push(v);
    else if (k === 'ORG') c.org = v;
    else if (k === 'TITLE') c.title = v;
    else if (k === 'NOTE') c.note = v;
    else if (k === 'ADR') c.address = parseAddress(v);
  }
  return c;
}
