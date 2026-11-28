// The World Clock (potentials #73): its cities and time zones, the sun's times, a zone's next clock change, and the words a card
// shows. No DOM. The cities are GeoNames' (src/lib/worldcities.json, scripts/make-worldclock-cities.py); the zone database is the
// browser's Intl through src/lib/tz.ts (the Time Zone Converter's code); tzdata's abbreviations come from src/lib/tzabbr.json
// (shared with the Python tab); sunrise and sunset are mathcore's m_sun (NOAA's equations, as astral 3.2 has them).
import data from './worldcities.json';
import abbrs from './tzabbr.json';
import { modernZone, offsetLabel, utcMs, zoneKnown, zoneLabel, zoneOffset, zoneReading } from './tz';
import { zoneInfo } from './tzinfo';

export interface Place {
  /** "new-york-us"; "utc"; "tz:Europe/Lisbon" */
  id: string;
  kind: 'city' | 'zone';
  name: string;
  /** "California, United States"; "Time zone Europe/Lisbon" */
  where: string;
  zone: string;
  lat: number | null;
  lon: number | null;
  cc: string;
  aliases: string[];
}

const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const SOURCE = data.source;
// letters NFKD does not take apart (the same table is in scripts/make-worldclock-cities.py)
const TRANSLIT: Record<string, string> = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i', 'ħ': 'h', 'ŧ': 't', 'ŋ': 'ng' };
/** "Tromsø" → "tromso" (a city's id is its slug, "-" and its country) */
export const slug = (s: string) => Array.from(s.toLowerCase(), (c) => TRANSLIT[c] ?? c).join('').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const states = data.states as Record<string, string>, countries = data.countries as Record<string, string>;
let cities: Place[] | null = null, byId: Map<string, Place> | null = null;
/** Every city, largest first. */
export function allCities(): Place[] {
  if (!cities) {
    cities = data.cities.map((line) => {
      const [id, name, cc, zi, lat, lon, st, al] = line.split('|');
      return {
        id: id || `${slug(name)}-${cc.toLowerCase()}`, kind: 'city', name, cc, zone: modernZone(data.zones[+zi]), lat: +lat, lon: +lon,
        where: [states[st], countries[cc]].filter(Boolean).join(', '), aliases: al ? al.split(',') : [],
      } satisfies Place;
    });
    byId = new Map(cities.map((c) => [c.id, c]));
  }
  return cities;
}
/** A zone of its own (no city): "utc", "tz:Europe/Lisbon" */
export function zonePlace(zone: string): Place {
  if (zone === 'UTC') return { id: 'utc', kind: 'zone', name: 'UTC', where: 'Coordinated Universal Time', zone: 'UTC', lat: null, lon: null, cc: '', aliases: [] };
  const z = modernZone(zone);
  return { id: `tz:${z}`, kind: 'zone', name: zoneLabel(z.split('/').pop()!), where: `Time zone ${zoneLabel(z)}`, zone: z, lat: null, lon: null, cc: '', aliases: [] };
}
/** The place of an id, or null (a city not in the list, a zone this browser does not know) */
export function placeOf(id: string): Place | null {
  allCities();
  const c = byId!.get(id);
  if (c) return c;
  if (id === 'utc') return zonePlace('UTC');
  if (id.startsWith('tz:') && zoneKnown(id.slice(3))) return zonePlace(id.slice(3));
  return null;
}

// ---------------------------------------------------------------- sets
export const SETS: Array<{ id: string; name: string; ids: string[] }> = [
  { id: 'popular', name: 'Popular', ids: ['new-york-us', 'san-francisco-us', 'london-gb', 'mumbai-in', 'sydney-au', 'hong-kong-hk', 'singapore-sg'] },
  { id: 'world', name: 'Around the world', ids: ['honolulu-us', 'los-angeles-us', 'new-york-us', 'sao-paulo-br', 'london-gb', 'paris-fr', 'dubai-ae', 'mumbai-in', 'singapore-sg', 'tokyo-jp', 'sydney-au', 'auckland-nz'] },
  { id: 'markets', name: 'Stock markets', ids: ['new-york-us', 'toronto-ca', 'sao-paulo-br', 'london-gb', 'frankfurt-am-main-de', 'johannesburg-za', 'mumbai-in', 'shanghai-cn', 'hong-kong-hk', 'tokyo-jp', 'sydney-au'] },
  { id: 'india', name: 'India & the world', ids: ['mumbai-in', 'delhi-in', 'bengaluru-in', 'dubai-ae', 'singapore-sg', 'london-gb', 'new-york-us', 'san-francisco-us', 'toronto-ca', 'sydney-au'] },
  { id: 'asia', name: 'Asia & Pacific', ids: ['dubai-ae', 'karachi-pk', 'mumbai-in', 'dhaka-bd', 'bangkok-th', 'singapore-sg', 'hong-kong-hk', 'shanghai-cn', 'seoul-kr', 'tokyo-jp', 'sydney-au', 'auckland-nz'] },
  { id: 'europe', name: 'Europe & Africa', ids: ['london-gb', 'paris-fr', 'berlin-de', 'madrid-es', 'rome-it', 'istanbul-tr', 'moscow-ru', 'cairo-eg', 'lagos-ng', 'nairobi-ke', 'johannesburg-za'] },
  { id: 'americas', name: 'Americas', ids: ['anchorage-us', 'los-angeles-us', 'denver-us', 'chicago-us', 'new-york-us', 'toronto-ca', 'mexico-city-mx', 'bogota-co', 'lima-pe', 'sao-paulo-br', 'buenos-aires-ar'] },
];
export const DEFAULT_SET = 'popular';

// ---------------------------------------------------------------- the list in the address (#/worldclock?c=…&h=24)
/** "new-york-us,london-gb,tz%3AEurope%2FLisbon" */
export const encodeList = (ids: string[]) => ids.map(encodeURIComponent).join(',');
/** The ids of an address's "c=" (null: none given); ids not known are dropped, repeats too. */
export function listFromHash(hash: string): string[] | null {
  const q = hash.split('?')[1];
  if (q === undefined) return null;
  const c = q.split('&').find((p) => p.startsWith('c='));
  if (c === undefined) return null;
  const out: string[] = [];
  for (const part of c.slice(2).split(',')) {
    let id = part; try { id = decodeURIComponent(part); } catch { /* as written */ }
    if (id && placeOf(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
/** "h=24" / "h=12" of the address (null: not given) */
export function hourFromHash(hash: string): 12 | 24 | null {
  const m = /[?&]h=(12|24)(&|$)/.exec(hash);
  return m ? (+m[1] as 12 | 24) : null;
}

// ---------------------------------------------------------------- search records (textcore.wasm ranks them)
/** text as the search engine reads it (src/search.ts's rule, with ø as o …, and "5:30" as "530": an offset is one word) */
export const fold = (s: string) => Array.from(s.toLowerCase().replace(/(\d):(?=\d)/g, '$1'), (c) => TRANSLIT[c] ?? c).join('').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9+#.%/ -]+/g, ' ').replace(/\s+/g, ' ').trim();
const countryAlias = data.countryAlias as Record<string, string>;
/** "+5:30", "+05:30", "utc+5:30", "gmt+05:30", "+9", "utc+09:00" …: the ways an offset is typed */
function offsetWords(sec: number): string[] {
  const a = Math.abs(sec), h = Math.floor(a / 3600), m = Math.floor(a / 60) % 60, s = sec < 0 ? '-' : '+', hh = String(h).padStart(2, '0'), mm = String(m).padStart(2, '0');
  const forms = m ? [`${s}${h}:${mm}`, `${s}${hh}:${mm}`] : [`${s}${h}`, `${s}${hh}`, `${s}${hh}:00`];
  return forms.flatMap((f) => [f, `utc${f}`, `gmt${f}`]).map(fold);
}
const longName = (zone: string, t: number, style: 'long' | 'longGeneric' | 'short') => {
  try {
    const n = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: style }).formatToParts(new Date(t)).find((p) => p.type === 'timeZoneName')?.value || '';
    return /^(GMT|UTC)([+−-]|$)/.test(n) && zone !== 'UTC' ? '' : n;
  } catch { return ''; }
};
/** Every zone the browser knows, by its current name (and UTC) */
export function allZones(): string[] {
  const list: string[] = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') : data.zones;
  return [...new Set(['UTC', ...list.map(modernZone)])].filter(zoneKnown);
}
/**
 * The records of the search ([n, name, keywords, description] — already folded) and the places they stand for: the cities,
 * largest first, then every zone. A zone is found by its name, its abbreviations (PST, IST), its English names (Pacific
 * Time, India Standard Time) and its offset (UTC+5:30); a city by its name, other names (Bombay), its country and state.
 */
export function searchRecords(now: number): { recs: Array<[string, string, string[], string]>; places: Place[] } {
  const places: Place[] = [], recs: Array<[string, string, string[], string]> = [];
  for (const c of allCities()) {
    if (!zoneKnown(c.zone)) continue;
    const kw = [...c.aliases, countries[c.cc] ?? '', ...(countryAlias[c.cc]?.split(',') ?? []), ...(c.where.split(', ').slice(0, -1))];
    recs.push([String(places.length), fold(c.name), [...new Set(kw.map(fold).filter(Boolean))], '']);
    places.push(c);
  }
  const jan = utcMs(new Date(now).getUTCFullYear(), 1, 15), jul = utcMs(new Date(now).getUTCFullYear(), 7, 15);
  // the zones of the largest cities first (ties of the search go to the record that comes first: "Eastern Time" is New York's)
  const rank = new Map<string, number>();
  places.forEach((c, i) => { if (!rank.has(c.zone)) rank.set(c.zone, i); });
  const zones = allZones().sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || (a < b ? -1 : 1)));
  for (const z of zones) {
    const p = zonePlace(z), kw = new Set<string>();
    for (const t of [jan, jul]) {
      const a = abbrAt(z, t); if (a) kw.add(fold(a));
      for (const st of ['long', 'longGeneric'] as const) { const n = longName(z, t, st); if (n) kw.add(fold(n)); }
      for (const w of offsetWords(zoneOffset(z, t))) kw.add(w);
    }
    if (z === 'UTC') ['gmt', 'zulu', 'utc+0', 'greenwich mean time', 'coordinated universal time'].forEach((w) => kw.add(w));
    recs.push([String(places.length), fold(zoneLabel(z)), [...kw], fold(p.name)]);
    places.push(p);
  }
  return { recs, places };
}

// ---------------------------------------------------------------- abbreviations and names
const infos = new Map<string, ReturnType<typeof zoneInfo>>();
/** tzdata's abbreviation of the zone at t when it is one of letters (EST, BST, IST, AEDT); tzdata writes "+04" where none is
 *  in use, and that is left out (the offset is shown anyway) */
export function abbrAt(zone: string, t: number): string {
  let f = infos.get(zone);
  if (!f) { f = zoneInfo(zone, (abbrs as Record<string, string>)[zone] ?? ''); infos.set(zone, f); }
  const n = f(Math.floor(t / SEC)).name;
  return /^[A-Z]{2,5}$/.test(n) ? n : '';
}
/** "UTC−05:00 · EST · Eastern Standard Time" */
export function zoneLine(zone: string, t: number): string {
  const a = abbrAt(zone, t), n = longName(zone, t, 'long');
  return [offsetLabel(zoneOffset(zone, t)), a, n && n !== a ? n : ''].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- the clock's words
export interface Reading { y: number; mo: number; d: number; h: number; mi: number; s: number; weekday: string }
export const readingAt = (zone: string, t: number): Reading => zoneReading(zone, t);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');
/** "9:41 pm", "9:41:05 pm", "21:41", "21:41:05" */
export function clockText(r: { h: number; mi: number; s: number }, h24: boolean, secs = false): string {
  const tail = secs ? `:${two(r.s)}` : '';
  return h24 ? `${two(r.h)}:${two(r.mi)}${tail}` : `${r.h % 12 || 12}:${two(r.mi)}${tail} ${r.h < 12 ? 'am' : 'pm'}`;
}
/** "Sat, 28 Nov 2026" */
export const dateText = (r: Reading) => `${r.weekday}, ${r.d} ${MONTHS[r.mo - 1]} ${r.y}`;
/** the day of a reading, as a number of days (to compare two zones' dates) */
export const dayNumber = (r: { y: number; mo: number; d: number }) => Math.round(utcMs(r.y, r.mo, r.d) / DAY);
/** "Today", "Tomorrow", "Yesterday" — the zone's date against yours */
export function dayWord(theirs: Reading, yours: Reading): string {
  const d = dayNumber(theirs) - dayNumber(yours);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : d > 0 ? `${d} days ahead` : `${-d} days behind`;
}
const amount = (sec: number, short: boolean) => {
  const a = Math.abs(sec), h = Math.floor(a / 3600), m = Math.floor(a / 60) % 60;
  if (short) return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 h';
  return [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m ? `${m} minute${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
};
/** How far a zone is from yours: { short: "+5 h 30 min", words: "5 hours 30 minutes ahead of you" } */
export function gapText(sec: number): { short: string; words: string } {
  if (!sec) return { short: 'Same time', words: 'the same time as yours' };
  return { short: `${sec > 0 ? '+' : '−'}${amount(sec, true)}`, words: `${amount(sec, false)} ${sec > 0 ? 'ahead of' : 'behind'} you` };
}

// ---------------------------------------------------------------- clock changes
export interface Change { at: number; before: number; after: number }
/** The zone's next change of UTC offset after `from` (ms) within `days` days — to the second — or null. */
export function nextChange(zone: string, from: number, days = 400): Change | null {
  const start = Math.floor(from / SEC) * SEC, o = zoneOffset(zone, start);
  let prev = start;
  for (let k = 1; k <= days; k++) {
    const t = start + k * DAY;
    if (zoneOffset(zone, t) === o) { prev = t; continue; }
    let lo = prev, hi = t;                                  // zoneOffset(lo) = o, zoneOffset(hi) ≠ o
    while (hi - lo > SEC) { const mid = lo + Math.floor((hi - lo) / 2 / SEC) * SEC; if (zoneOffset(zone, mid) === o) lo = mid; else hi = mid; }
    return { at: hi, before: o, after: zoneOffset(zone, hi) };
  }
  return null;
}
/** "Clocks go forward 1 hour on Sun, 14 Mar 2027 at 2:00 am (to 3:00 am)" */
export function changeText(c: Change, h24: boolean): string {
  const d = c.after - c.before, before = zoneReading('UTC', c.at + c.before * SEC), after = zoneReading('UTC', c.at + c.after * SEC);
  return `Clocks go ${d > 0 ? 'forward' : 'back'} ${amount(d, false)} on ${dateText(before)} at ${clockText(before, h24)} (to ${clockText(after, h24)})`;
}

// ---------------------------------------------------------------- the sun
export interface SunEngine { sun(y: number, mo: number, d: number, lat: number, lon: number): { rise: number | null; set: number | null; noon: number; polar: -1 | 0 | 1 } }
/** a sunrise or sunset: its instant (ms); 'up' — the sun stays up all day; 'down' — it stays down; null — none on this date
 *  (the day it moves across midnight, near the polar days and nights) */
export type SunEvent = number | 'up' | 'down' | null;
/**
 * The sunrise (or sunset) on the zone's calendar date y-mo-d, as astral 3.2's sunrise() and sunset() find it: the event of the
 * UTC date of that number; if it falls on another local date, that of the day before or after; if that is not on the date
 * either, there is none. The sun staying up or down is said by m_sun (the hour angle has no value).
 */
export function sunEvent(m: SunEngine, rising: boolean, lat: number, lon: number, zone: string, y: number, mo: number, d: number): SunEvent {
  const at = (date: number): SunEvent => {
    const r = new Date(date), s = m.sun(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate(), lat, lon), t = rising ? s.rise : s.set;
    return t === null ? (s.polar === 1 ? 'up' : 'down') : date + t * MIN;
  };
  const want = utcMs(y, mo, d), localDay = (t: number) => { const r = zoneReading(zone, t); return utcMs(r.y, r.mo, r.d); };
  let e = at(want);
  if (typeof e !== 'number') return e;
  const got = localDay(e);
  if (got === want) return e;
  e = at(want + (got < want ? DAY : -DAY));
  if (typeof e !== 'number') return e;
  return localDay(e) === want ? e : null;
}
export interface SunDay { rise: SunEvent; set: SunEvent }
export const sunDay = (m: SunEngine, p: Place, r: { y: number; mo: number; d: number }): SunDay | null =>
  p.lat === null || p.lon === null ? null : { rise: sunEvent(m, true, p.lat, p.lon, p.zone, r.y, r.mo, r.d), set: sunEvent(m, false, p.lat, p.lon, p.zone, r.y, r.mo, r.d) };
/** Is the sun up at t? By the last sunrise or sunset before t (yesterday's, today's, tomorrow's), else today's polar day or night. */
export function sunUp(m: SunEngine, p: Place, t: number): boolean | null {
  if (p.lat === null || p.lon === null) return null;
  const r = zoneReading(p.zone, t), today = utcMs(r.y, r.mo, r.d);
  let last: { t: number; up: boolean } | null = null, polar: boolean | null = null;
  for (const k of [-1, 0, 1]) {
    const dd = new Date(today + k * DAY), [y, mo, d] = [dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate()];
    for (const rising of [true, false]) {
      const e = sunEvent(m, rising, p.lat, p.lon, p.zone, y, mo, d);
      if (typeof e === 'number') { if (e <= t && (!last || e > last.t)) last = { t: e, up: rising }; }
      else if (k === 0 && e !== null) polar = e === 'up';
    }
  }
  return polar ?? (last ? last.up : false);
}
/** a sunrise or sunset as sun tables give it: to the nearest minute ("6:58 am" for 6:57:52) */
export const sunClock = (zone: string, t: number, h24: boolean) => clockText(zoneReading(zone, t + 30 * SEC), h24);
/** "11 h 11 min of daylight" */
export const daylightText = (rise: number, set: number) => `${amount(Math.round((set - rise) / MIN) * 60, true)} of daylight`;
