// Paper Deadlines → Calendar (potentials #77; group 4 of the suggested order): the dates of a bill, a school circular, a notice or
// an insurance letter — written as numbers (15/12/2026, day first as in India; month first on request), in words ("Saturday, 6th
// December 2026", "Dec 6", "31 January 2027"), with or without a year — each with the words that say what it is ("Due date", "renew it
// by", "will be held on"), a time ("at 10:00 am") and an amount (₹ 2,032.71) beside it; deadlines counted from another date ("within 15
// days of the date of this circular", "30 days after expiry"); and the calendar file made of the ones chosen (iCalendar, RFC 5545:
// all-day or timed events with a reminder). String glue around the readers' output (CLAUDE.md §3a). No DOM: the unit suite runs it in
// Node.

export type Kind = 'deadline' | 'event' | 'issued' | 'date';
export interface Found {
  /** yyyy-mm-dd */
  date: string;
  /** hh:mm (24 hours) or null: all day */
  time: string | null;
  /** the date as written ("15/12/2026"), or how it was counted ("7 days after 28/11/2026") */
  printed: string;
  /** the words that say what the date is ("Due date", "renew it by") */
  label: string;
  /** the sentence it stands in */
  sentence: string;
  kind: Kind;
  /** an amount in the sentence ("₹2,032.71") */
  amount: string | null;
  /** a deadline counted from another date: how */
  counted?: { n: number; unit: 'day' | 'week' | 'month'; from: string; of: string };
  /** the year was not written: worked out (from the paper's date, else today) */
  guessedYear?: boolean;
}
export interface Paper { heading: string; issued: string | null; found: Found[]; amounts: Array<{ text: string; value: number; sentence: string }> }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])';
const WEEKDAY = '(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\\.?,?\\s+(?:the\\s+)?)?';
const monthOf = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3))) + 1;
const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const valid = (y: number, m: number, d: number) => y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);
const fullYear = (y: string) => (y.length === 2 ? 2000 + +y : +y);
/** yyyy-mm-dd + n days / weeks / months (a month's day held at its end: 31 Jan + 1 month = 28 Feb). */
export function addTo(isoDate: string, n: number, unit: 'day' | 'week' | 'month'): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (unit === 'month') { const t = new Date(Date.UTC(y, m - 1 + n, 1)); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(d, daysIn(t.getUTCFullYear(), t.getUTCMonth() + 1))); }
  const t = new Date(Date.UTC(y, m - 1, d + n * (unit === 'week' ? 7 : 1)));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

interface DateHit { s: number; e: number; y: number | null; m: number; d: number; text: string }
/** Every date written in `text`, where it stands. `monthFirst`: numbers like 06/12/2026 are 12 June (else 6 December). */
export function datesIn(text: string, monthFirst = false): DateHit[] {
  const out: DateHit[] = [];
  const taken = (s: number, e: number) => out.some((h) => s < h.e && e > h.s);
  const add = (s: number, e: number, y: number | null, m: number, d: number) => {
    if (taken(s, e) || !valid(y ?? 2000, m, d)) return;
    out.push({ s, e, y, m, d, text: text.slice(s, e) });
  };
  let r: RegExpExecArray | null;
  // 2026-12-15
  const ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((r = ISO.exec(text))) add(r.index, r.index + r[0].length, +r[1], +r[2], +r[3]);
  // 15/12/2026, 15-12-26, 15.12.2026 (not part of a longer run of numbers: 42/2026-27, 1.25 %)
  const NUM = /(?<![\d/.-])(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})(?![\d/-]|\.\d)/g;
  while ((r = NUM.exec(text))) {
    let a = +r[1], b = +r[3];
    if (monthFirst ? a > 12 && b <= 12 : false) [a, b] = [b, a]; // month first, but the first cannot be a month
    let [d, m] = monthFirst ? [b, a] : [a, b];
    if (m > 12 && d <= 12) [d, m] = [m, d]; // day first, but the second cannot be a month (12/25/2026)
    add(r.index, r.index + r[0].length, fullYear(r[4]), m, d);
  }
  // Saturday, 6th December 2026 · 6 Dec · 06-Nov-2026 · 1st of March, 2027
  const DMY = new RegExp(`\\b${WEEKDAY}(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?[\\s-]+${MON}\\.?(?:,?[\\s-]+(\\d{4}|'\\d{2})\\b)?`, 'gi');
  while ((r = DMY.exec(text))) add(r.index, r.index + r[0].length, r[3] ? fullYear(r[3].replace("'", '')) : null, monthOf(r[2]), +r[1]);
  // December 6, 2026 · Dec. 6th · Saturday, December 6
  const MDY = new RegExp(`\\b${WEEKDAY}${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, 'gi');
  while ((r = MDY.exec(text))) { if (/^\s*(?:\d|%)/.test(text.slice(r.index + r[0].length))) continue; add(r.index, r.index + r[0].length, r[3] ? +r[3] : null, monthOf(r[1]), +r[2]); }
  return out.sort((a, b) => a.s - b.s);
}
/** One date as written → yyyy-mm-dd, or null (no year: `year`, when given). */
export function parseDate(s: string, o: { monthFirst?: boolean; year?: number } = {}): string | null {
  const h = datesIn(s.trim(), o.monthFirst);
  if (h.length !== 1 || h[0].s !== 0 || h[0].e !== s.trim().length) return null;
  const y = h[0].y ?? o.year;
  return y ? iso(y, h[0].m, h[0].d) : null;
}

/** A time written after (or before) a date: "at 10:00 am", "4 p.m.", "16:30 hrs". */
const TIME = /\b(?:at\s+|from\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|hrs|hours|noon)(?![a-z])|\b(?:at\s+|from\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/gi;
function timeIn(s: string): string | null {
  TIME.lastIndex = 0;
  const r = TIME.exec(s);
  if (!r) return null;
  if (r[4] !== undefined) return `${pad(+r[4])}:${r[5]}`;
  let hh = +r[1]; const mm = r[2] ? +r[2] : 0, ap = (r[3] || '').toLowerCase().replace(/[.\s]/g, '');
  if (mm > 59) return null;
  if (ap === 'pm' && hh < 12) hh += 12; else if (ap === 'am' && hh === 12) hh = 0; else if (ap === 'noon') hh = 12;
  return hh <= 23 ? `${pad(hh)}:${pad(mm)}` : null;
}

/** Amounts: ₹ 2,032.71 · Rs. 14,250.00 · INR 1,20,000 · Rs 500/- · $ 25 (Tesseract reads ₹ as ¥: on these papers it is a rupee). */
const AMOUNT = /(?:₹|¥|\bRs\.?|\bINR|\$|US\$|€|£)\s?(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?:\s*\/-)?/gi;
function amountsIn(s: string): Array<{ text: string; value: number; s: number; e: number }> {
  const out: Array<{ text: string; value: number; s: number; e: number }> = [];
  AMOUNT.lastIndex = 0;
  let r: RegExpExecArray | null;
  while ((r = AMOUNT.exec(s))) {
    const sym = r[0].replace(/[\d,.\s/-]+$/, '').trim(), cur = /^(?:¥|₹|rs\.?|inr)$/i.test(sym) ? '₹' : sym === 'US$' ? '$' : sym;
    out.push({ text: `${cur}${r[1]}`, value: +r[1].replace(/,/g, ''), s: r.index, e: r.index + r[0].length });
  }
  return out;
}

const DEADLINE = /\b(?:due|by|before|last\s+date|latest|not\s+later\s+than|on\s+or\s+before|expir\w*|renew\w*|pay(?:able|ment)?|submit\w*|return\w*|disconnect\w*|deadline|closes?|valid\s+(?:till|until|up\s*to)|till|until|lapse\w*|overdue|reply)\b/i;
const EVENT = /\b(?:held|meeting|exam(?:ination)?s?|interview|appointment|function|ceremony|celebrat\w*|visit|webinar|session|camp|holiday|closed|re-?open\w*|report\w*|start\w*|commenc\w*|begin\w*|programme|program|event|trip|picnic|sports?\s+day|annual\s+day|party|hearing|seminar|workshop|class(?:es)?)\b/i;
/** The paper's own date: a label that ends with "Date", "Bill date", "Dated" … — not a due, expiry or last date. */
const ISSUED = /(?:^|\s)((?:bill|invoice|issue|statement|letter)\s+date|date\s+of\s+(?:issue|bill|invoice)|dated?|dt\.?)$/i;
const NOT_ISSUED = /\b(?:due|expiry|expiration|expires?|last|renewal|closing|target|delivery|return|payment|valid(?:ity)?|start|end|joining|maturity|exam|meeting)\s+date$/i;
const issuedOf = (label: string) => { const l = label.replace(/[.:]$/, '').trim(); const m = l.match(ISSUED); return m && !NOT_ISSUED.test(l) ? m[1] : null; };

/** What a date is, from the words before it in its sentence: "Due date", "renew it by", "parent-teacher meeting will be held on". */
function labelOf(before: string): string {
  const t = before.replace(/\(\s*\)/g, '').replace(/[:\-–—,]+\s*$/, '').replace(/\s+/g, ' ').trim();
  const ws = t.split(' ').filter(Boolean);
  let w = ws.slice(-8);
  // from the sentence's own subject where it is short ("The parent-teacher meeting …" → "parent-teacher meeting …")
  while (w.length > 2 && /^(?:the|a|an|please|kindly|your|our|this|that|and|or|also|note|if|which|will|shall|is|are|you|we|it)$/i.test(w[0])) w = w.slice(1);
  return w.join(' ').replace(/^[^\p{L}\p{N}(]+/u, '');
}

/** The words of a phrase that counts from another date: "within 15 days of the date of this circular", "30 days after expiry". */
const COUNTED = /\b(?:within|in)?\s*(\d{1,3}|one|two|three|four|five|six|seven|ten|fifteen|thirty|sixty|ninety)\s+(day|week|month)s?\s+(?:of|from|after)\s+(?:the\s+)?(date\s+of\s+(?:this\s+)?(?:circular|letter|notice|bill|invoice|issue|receipt|order|statement)|(?:bill|invoice|issue|statement|receipt)\s+date|receipt(?:\s+of\s+this\s+\w+)?|expiry(?:\s+date)?|the\s+due\s+date|due\s+date|today|this\s+(?:circular|letter|notice))/gi;
const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fifteen: 15, thirty: 30, sixty: 60, ninety: 90 };

/** A full stop after these is no sentence's end. */
const ABBR = /\b(?:mr|mrs|ms|dr|no|nos|rs|st|co|ltd|pvt|prof|sr|jr|vs|etc|approx|govt|dept|ref|sec|fig|vol|ph|tel|mob|inc|corp|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|e\.g|i\.e|a\.m|p\.m)$/i;
/** A line that goes on into the next one: it ends with a word a sentence cannot end with. */
const GOES_ON = /\b(?:on|by|of|at|the|to|for|in|from|before|after|until|till|and|or|is|are|was|will|be|within|a|an|than|from|between|as|with|your|our|their|its|this|that|which|who|not|no|may|must|shall|should|can|could|would)$/i;
/** The page's lines (parts set apart by a tab) → its sentences: a label and its value ("Due date: 15/12/2026"), a heading, a
 *  greeting stand alone; other lines run on — over the blank lines Tesseract puts inside a paragraph, when a line ends with a word a
 *  sentence cannot end with ("… will be held on" / "Saturday, 6th December …") — and are cut at full stops (not after "Rs.", "Mr."). */
export function sentencesOf(lines: string[]): string[] {
  const out: string[] = [];
  let cur = '';
  const flush = () => { if (cur.trim()) out.push(...cut(cur.trim())); cur = ''; };
  const cut = (t: string) => {
    const res: string[] = [];
    let start = 0;
    const re = /[.!?](?=\s+[\p{Lu}\d(])/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const word = t.slice(start, m.index).split(/\s+/).pop() ?? '';
      if (ABBR.test(word) || /^\p{Lu}$/u.test(word)) continue; // "Rs. 14,250", "Mr. Kulkarni", an initial
      res.push(t.slice(start, m.index + 1).trim()); start = m.index + 1;
    }
    res.push(t.slice(start).trim());
    return res.filter(Boolean);
  };
  let blank = false;
  for (const raw of lines) {
    for (const t0 of raw.split('\t')) {
      const t = t0.replace(/\s+/g, ' ').trim();
      if (!t) { blank = true; continue; }
      const label = /^[^:]{0,39}[\p{L})]\s*:(?!\d)\s*\S/u.test(t) && !/^\S+:\/\//.test(t);
      const heading = t.split(' ').length <= 6 && !/[.,;:!?]$/.test(t) && /^[\p{Lu}\d]/u.test(t) && !GOES_ON.test(t) && !/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t);
      const greeting = /^(?:dear|respected|to,?$|sir|madam)\b/i.test(t);
      if (label || heading || greeting) { flush(); out.push(...cut(t)); blank = false; continue; }
      // a new sentence after a blank line when the last one could end there and this one starts as a sentence does
      if (cur && blank && !GOES_ON.test(cur) && /^[\p{Lu}(]/u.test(t) && /[.!?:,]$|\p{L}$/u.test(cur) && /[.!?]$/.test(cur)) flush();
      cur = cur ? `${cur} ${t}` : t;
      blank = false;
    }
  }
  flush();
  return out;
}

/** A page's lines (or its text) → its dates and amounts. `today`: yyyy-mm-dd, for a year not written. */
export function readPaper(text: string | string[], o: { monthFirst?: boolean; today: string }): Paper {
  const lines = Array.isArray(text) ? text : text.replace(/\r/g, '').split('\n');
  const heading = (lines.find((l) => /\p{L}{3}/u.test(l)) ?? '').replace(/\t+/g, ' ').trim();
  const sentences = sentencesOf(lines);
  const found: Found[] = [];
  const amounts: Paper['amounts'] = [];
  // the year of a date written without one: the next such date on or after the paper's earliest full date (its own date, as a
  // rule), else on or after today
  const hits = sentences.map((s) => datesIn(s, o.monthFirst));
  const full = hits.flat().filter((h) => h.y).map((h) => iso(h.y!, h.m, h.d)).sort();
  const ref = full[0] ?? o.today;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const am = amountsIn(s);
    for (const a of am) amounts.push({ text: a.text, value: a.value, sentence: s });
    let prev = 0;
    for (const h of hits[i]) {
      let y = h.y, guessed = false;
      if (y === null) {
        guessed = true;
        y = +ref.slice(0, 4);
        if (iso(y, h.m, h.d) < ref) y++;
      }
      const date = iso(y, h.m, h.d);
      const before = s.slice(prev, h.s).replace(AMOUNT, ' ');
      let label = labelOf(before);
      const after = s.slice(h.e, h.e + 40);
      const time = timeIn(after) ?? timeIn(s.slice(Math.max(prev, h.s - 30), h.s).replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g, ''));
      const own = issuedOf(label);
      const kind: Kind = own ? 'issued' : DEADLINE.test(label) || DEADLINE.test(after.slice(0, 12)) ? 'deadline' : EVENT.test(s) || time ? 'event' : 'date';
      if (own) label = own[0].toUpperCase() + own.slice(1); // "Circular No. 42/2026-27 Date" → "Date"
      const near = am.length ? am.reduce((b, a) => (Math.abs(a.s - h.s) < Math.abs(b.s - h.s) ? a : b)) : null;
      found.push({ date, time: kind === 'event' || time ? time : null, printed: h.text.trim(), label, sentence: s, kind, amount: near?.text ?? null, ...(guessed ? { guessedYear: true } : {}) });
      prev = h.e;
    }
  }
  const issued = found.find((f) => f.kind === 'issued' && /^date/i.test(f.label))?.date ?? found.find((f) => f.kind === 'issued')?.date ?? null;
  // the paper's main amount (the one payable) beside a payment's deadline that names none of its own
  const PAYS = /\b(?:payable|amount|total|premium|fees?|balance|outstanding|dues?|due\s+amount)\b/i;
  const main = amounts.filter((a) => PAYS.test(a.sentence));
  const mainAmount = main.length === 1 || (main.length > 1 && main.every((a) => a.value === main[0].value)) ? main[0].text : null;
  const paying = (f: Found) => /\b(?:pay\w*|due|renew\w*|premium|fees?|bill)\b/i.test(f.label);
  for (const f of found) if (!f.amount && mainAmount && f.kind === 'deadline' && paying(f)) f.amount = mainAmount;
  // deadlines counted from another date of the paper
  for (const s of sentences) {
    COUNTED.lastIndex = 0;
    let r: RegExpExecArray | null;
    while ((r = COUNTED.exec(s))) {
      const n = /^\d+$/.test(r[1]) ? +r[1] : WORDNUM[r[1].toLowerCase()], unit = r[2].toLowerCase() as 'day' | 'week' | 'month', of = r[3].toLowerCase();
      let from: Found | undefined;
      if (/expir/.test(of)) from = found.find((f) => /expir/i.test(f.label));
      else if (/due/.test(of)) from = found.find((f) => /\bdue\b/i.test(f.label));
      else if (/^(?:bill|invoice|issue|statement|receipt)\s+date$/.test(of)) from = found.find((f) => new RegExp(of.split(/\s+/)[0], 'i').test(f.label)) ?? found.find((f) => f.kind === 'issued');
      else if (/today/.test(of)) from = undefined;
      else from = found.find((f) => f.date === issued && f.kind === 'issued');
      const base = /today/.test(of) ? o.today : from?.date;
      if (!base || !n) continue;
      const date = addTo(base, n, unit);
      const before = s.slice(0, r.index).replace(AMOUNT, ' ');
      const label = labelOf(before) || `${r[0].trim()}`;
      const am = amountsIn(s);
      const shownFrom = from ? from.printed : 'today';
      const f: Found = { date, time: null, printed: `${n} ${unit}${n > 1 ? 's' : ''} after ${shownFrom}`, label, sentence: s, kind: 'deadline', amount: am[0]?.text ?? null,
        counted: { n, unit, from: base, of: r[3] } };
      if (!f.amount && mainAmount && paying(f)) f.amount = mainAmount;
      found.push(f);
    }
  }
  return { heading, issued, found, amounts };
}

// ------------------------------------------------------------------------------------------------------------ iCalendar
export type Remind = 'none' | 'day' | '1d' | '3d' | '1w';
export const REMIND: Array<[Remind, string]> = [['day', 'On the day, 9 am'], ['1d', '1 day before'], ['3d', '3 days before'], ['1w', '1 week before'], ['none', 'No reminder']];
/** The reminder's trigger before the event's start: an all-day event starts at midnight, so "1 day before" at 9 am is 15 hours
 *  before it (as Apple's and Google's calendars write it); a timed event's are counted from its time. */
export function trigger(r: Remind, allDay: boolean): string | null {
  if (r === 'none') return null;
  if (allDay) return { day: 'PT9H', '1d': '-PT15H', '3d': '-P2DT15H', '1w': '-P6DT15H' }[r];
  return { day: '-PT2H', '1d': '-P1D', '3d': '-P3D', '1w': '-P7D' }[r];
}
export interface Ev { title: string; date: string; time: string | null; minutes?: number; remind: Remind; note: string }
const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/([;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '', n = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; } cur += ch; n += b; }
  out.push(cur);
  return out.join('\r\n ');
}
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** The events as one iCalendar file: all-day events (DTSTART;VALUE=DATE) or timed ones in the calendar's own time zone (floating
 *  local times — the paper's 10:00 am is the reader's 10:00 am), each with its reminder (VALARM). */
export function icsOf(evs: Ev[], o: { now: Date; uid: (i: number) => string }): string {
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SuperUtils//Paper Deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  evs.forEach((e, i) => {
    const d = e.date.replace(/-/g, '');
    L.push('BEGIN:VEVENT', `UID:${o.uid(i)}`, `DTSTAMP:${stamp(o.now)}`);
    if (e.time) {
      const [hh, mm] = e.time.split(':').map(Number), end = hh * 60 + mm + (e.minutes ?? 60);
      const endDate = end >= 1440 ? addTo(e.date, 1, 'day').replace(/-/g, '') : d, em = end % 1440;
      L.push(`DTSTART:${d}T${pad(hh)}${pad(mm)}00`, `DTEND:${endDate}T${pad(Math.floor(em / 60))}${pad(em % 60)}00`);
    } else L.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addTo(e.date, 1, 'day').replace(/-/g, '')}`);
    L.push(`SUMMARY:${icsEsc(e.title.trim() || 'Reminder')}`);
    if (e.note.trim()) L.push(`DESCRIPTION:${icsEsc(e.note.trim())}`);
    L.push('TRANSP:TRANSPARENT');
    const t = trigger(e.remind, !e.time);
    if (t) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title.trim() || 'Reminder')}`, `TRIGGER:${t}`, 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

/** A title for a found date: what it is (capitalised), the paper's name, the amount. */
export function titleOf(f: Found, heading: string): string {
  const what = f.label ? f.label[0].toUpperCase() + f.label.slice(1) : f.kind === 'deadline' ? 'Deadline' : 'Date';
  const short = what.replace(/\s+(?:on|by|is|are|at|of|before|after|till|until)$/i, '').replace(/\s+(?:will|shall|is|are|to)\s+be\s+(?:held|scheduled|organi[sz]ed|conducted|celebrated)$/i, '');
  return [short, heading].filter(Boolean).join(' — ') + (f.amount ? ` (${f.amount})` : '');
}
/** The reminder a kind starts with. */
export const remindFor = (k: Kind): Remind => (k === 'deadline' ? '3d' : k === 'event' ? '1d' : 'none');
/** yyyy-mm-dd → "Tuesday, 15 December 2026" (en-GB, written in UTC so no zone moves it). */
export const longDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
