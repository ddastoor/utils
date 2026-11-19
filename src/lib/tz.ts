// Time zones for the Time Zone Converter (and the tabs that name the device's zone). The zone database is the
// browser's (Intl, compiled ICU): this file asks it — the offset of a zone at an instant, the instant a wall-clock
// reading stands for (also where a reading exists twice or not at all), and writes the answers.

// Chromium's ICU lists some zones under names tzdata has since renamed (India as "Asia/Calcutta"); show the current
// IANA name. Only renamed places are here — "Europe/Bratislava" and the like are links in tzdata too, but they are
// places people look for, not old spellings.
const ZONE_RENAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'Asia/Dacca': 'Asia/Dhaka', 'Asia/Thimbu': 'Asia/Thimphu',
  'Africa/Asmera': 'Africa/Asmara', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'America/Catamarca': 'America/Argentina/Catamarca', 'America/Cordoba': 'America/Argentina/Cordoba', 'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Mendoza': 'America/Argentina/Mendoza', 'America/Coral_Harbour': 'America/Atikokan', 'America/Godthab': 'America/Nuuk', 'America/Indianapolis': 'America/Indiana/Indianapolis', 'America/Louisville': 'America/Kentucky/Louisville',
  'Atlantic/Faeroe': 'Atlantic/Faroe', 'Pacific/Enderbury': 'Pacific/Kanton', 'Pacific/Ponape': 'Pacific/Pohnpei', 'Pacific/Truk': 'Pacific/Chuuk',
};
const known = new Map<string, boolean>();
/** does this browser's Intl know the zone? */
export function zoneKnown(zone: string): boolean {
  let k = known.get(zone);
  if (k === undefined) { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); k = true; } catch { k = false; } known.set(zone, k); }
  return k;
}
/** the zone's current IANA name (where this browser knows it under that name) */
export const modernZone = (z: string) => { const m = ZONE_RENAMES[z]; return m && zoneKnown(m) ? m : z; };
/** This device's time zone, by its current IANA name. */
export const localZone = () => modernZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
/** "America/New_York" → "America/New York" */
export const zoneLabel = (z: string) => z.replace(/_/g, ' ');

const SEC = 1000, HOUR = 3600 * SEC;
/** milliseconds since 1970 of a UTC calendar reading, for any year (Date.UTC reads the years 0 – 99 as 1900 – 1999) */
export function utcMs(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  const t = new Date(0); t.setUTCFullYear(y, mo - 1, d); t.setUTCHours(h, mi, s, 0); return t.getTime();
}
const parts = new Map<string, Intl.DateTimeFormat>();
function reading(zone: string, t: number) {
  let f = parts.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', era: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }); parts.set(zone, f); }
  const p: Record<string, string> = {}; for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: p.era === 'BC' ? 1 - +p.year : +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, weekday: p.weekday };
}
/** Seconds the zone is ahead of UTC at the instant t (ms). Whole seconds: before standard time a place kept its own
 *  mean time — Kolkata 5 h 53 min 28 s. */
export function zoneOffset(zone: string, t: number): number {
  const r = reading(zone, t);
  return Math.round((utcMs(r.y, r.mo, r.d, r.h, r.mi, r.s) - Math.floor(t / SEC) * SEC) / SEC);
}
/** The instant a wall-clock reading in a zone stands for. `wall` is the reading as if it were UTC (utcMs).
 *  'twice': clocks went back over it — the first of the two instants is given (as java.time and Python do);
 *  'skipped': clocks went forward over it — it is read with the offset from before the change, which lands as far
 *  after the gap as the reading was into it (02:30 → 03:30). */
export function wallToInstant(zone: string, wall: number): { at: number; kind: 'ok' | 'twice' | 'skipped' } {
  const offs = [...new Set([zoneOffset(zone, wall - 14 * HOUR), zoneOffset(zone, wall), zoneOffset(zone, wall + 14 * HOUR)])];
  const cands = offs.map((o) => wall - o * SEC), valid = [...new Set(cands.filter((t) => t + zoneOffset(zone, t) * SEC === wall))].sort((a, b) => a - b);
  return { at: valid[0] ?? cands[0], kind: valid.length > 1 ? 'twice' : valid.length ? 'ok' : 'skipped' };
}
/** "UTC+05:30", "UTC−03:30", "UTC+00:00", and "UTC+05:53:28" where the offset has seconds */
export function offsetLabel(sec: number): string {
  const a = Math.abs(sec), two = (n: number) => String(n).padStart(2, '0');
  return `UTC${sec < 0 ? '−' : '+'}${two(Math.floor(a / 3600))}:${two(Math.floor(a / 60) % 60)}${a % 60 ? `:${two(a % 60)}` : ''}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Mon, 16 Nov 2026, 9:30 am" — the instant as the zone's clocks and calendar show it (the year always, with four digits) */
export function fmtInstant(t: number, zone: string): string {
  const r = reading(zone, t), h12 = r.h % 12 || 12;
  return `${r.weekday}, ${r.d} ${MONTHS[r.mo - 1]} ${r.y > 0 ? String(r.y).padStart(4, '0') : `${1 - r.y} BC`}, ${h12}:${String(r.mi).padStart(2, '0')} ${r.h < 12 ? 'am' : 'pm'}`;
}
/** "9:30 am" in the zone */
export function fmtClock(t: number, zone: string): string { return fmtInstant(t, zone).split(', ').pop()!; }
/** How far `to` is from `from` at the instant: "10 hours 30 minutes behind", "5 hours 30 minutes ahead", "the same time" */
export function zoneGap(from: string, to: string, t: number): string {
  const d = zoneOffset(to, t) - zoneOffset(from, t), a = Math.abs(d), h = Math.floor(a / 3600), m = Math.floor(a / 60) % 60, s = a % 60;
  if (!d) return 'the same time';
  const part = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? '' : 's'}` : '');
  return `${[part(h, 'hour'), part(m, 'minute'), part(s, 'second')].filter(Boolean).join(' ')} ${d > 0 ? 'ahead' : 'behind'}`;
}
