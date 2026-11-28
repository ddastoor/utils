// World Radio (potentials #116; owner, 21 Nov 2026: "add world radio also" — the stations' own internet streams, the ones their websites
// play; 28 Nov 2026: "listen to different radio stations all across the world, including India. You should remember my favorite stations
// … the settings page will have the world radio section in it. I should have an option to keep playing when I switch to another app. A
// station that won't play (offline, http-only, a format the browser can't play) is skipped and the reason is said, never a silent
// failure."). The stations come from Radio Browser (radio-browser.info: an open, community-run directory of 53,000 stations, no key);
// their sound from the stations' own servers (CLAUDE.md §1 rule 2: app data, not code). What is around the directory is here — its
// servers one after another, a station read and checked, the quick picks, why a station does not play — without the DOM: the unit
// suite runs it in Node on recorded answers of the directory.

/** the directory's servers (its API asks clients to use whichever answers; `all` is a DNS name over the working ones) — the CSP's
 *  connect-src lists exactly these */
export const SERVERS = ['all.api.radio-browser.info', 'de1.api.radio-browser.info', 'de2.api.radio-browser.info'] as const;

export interface Station {
  /** the directory's stationuuid */ id: string;
  name: string;
  /** where its sound comes from (the directory's url_resolved: a playlist file already followed) */ url: string;
  homepage: string;
  country: string; /** ISO 3166-1 alpha-2, upper case, or '' */ cc: string; state: string;
  /** as the directory has it: "hindi,english" */ lang: string;
  tags: string[];
  /** MP3, AAC, AAC+, OGG, FLAC, HLS … or UNKNOWN */ codec: string; bitrate: number;
  /** an HLS stream (an .m3u8 playlist of pieces) */ hls: boolean;
  /** the directory's last check reached it */ ok: boolean; checked: string;
  clicks: number; votes: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** text from the directory: control characters out, white space folded, at most `max` characters */
export const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const webUrl = (v: string) => (/^https?:\/\/[^\s/]+/i.test(v) ? v : '');

/** a station of the directory's answer, or null for one that cannot be shown (no id, no name, no address) */
export function stationOf(r: unknown): Station | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const id = typeof o.stationuuid === 'string' && UUID.test(o.stationuuid) ? o.stationuuid.toLowerCase() : '';
  const url = clean(o.url_resolved, 2000) || clean(o.url, 2000), name = clean(o.name, 200);
  if (!id || !name || !url) return null;
  return {
    id, name, url,
    homepage: webUrl(clean(o.homepage, 2000)),
    country: clean(o.country, 100), cc: /^[A-Z]{2}$/.test(String(o.countrycode ?? '')) ? String(o.countrycode) : '', state: clean(o.state, 100),
    lang: clean(o.language, 160),
    tags: [...new Set(clean(o.tags, 800).split(',').map((t) => t.trim().toLowerCase()).filter((t) => t && t.length <= 40))].slice(0, 12),
    codec: clean(o.codec, 24).toUpperCase() || 'UNKNOWN', bitrate: count(o.bitrate),
    hls: o.hls === 1 || o.hls === true || /\.m3u8(\?|$)/i.test(url),
    ok: o.lastcheckok !== 0 && o.lastcheckok !== false, checked: clean(o.lastchecktime_iso8601, 40),
    clicks: count(o.clickcount), votes: count(o.votes),
  };
}

/** the stations of an answer: read, the same stream listed twice kept once (the directory has copies), in the order given */
export function stationsOf(list: unknown): Station[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>(), out: Station[] = [];
  for (const r of list) {
    const s = stationOf(r);
    if (!s) continue;
    const key = s.url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
    if (seen.has(s.id) || seen.has(key)) continue;
    seen.add(s.id); seen.add(key); out.push(s);
  }
  return out;
}

// ------------------------------------------------------------------ asking the directory
export interface Query {
  /** a part of the station's name */ name?: string;
  /** ISO 3166-1 alpha-2 */ cc?: string;
  /** a language as the directory names it ("tamil") */ lang?: string;
  /** a tag ("news") */ tag?: string;
  order?: 'clickcount' | 'votes' | 'name' | 'random';
  offset?: number; limit?: number;
}
export const PAGE = 60;
/** the search's path: broken stations left out, the most listened first */
export function searchPath(q: Query): string {
  const p = new URLSearchParams();
  const name = clean(q.name, 100);
  if (name) p.set('name', name);
  if (q.cc && /^[A-Z]{2}$/.test(q.cc)) p.set('countrycode', q.cc);
  if (q.lang) { p.set('language', clean(q.lang, 60).toLowerCase()); p.set('languageExact', 'true'); }
  if (q.tag) { p.set('tag', clean(q.tag, 60).toLowerCase()); p.set('tagExact', 'true'); }
  const order = q.order ?? 'clickcount';
  p.set('order', order);
  if (order === 'clickcount' || order === 'votes') p.set('reverse', 'true');
  p.set('hidebroken', 'true');
  p.set('limit', String(Math.max(1, Math.min(500, q.limit ?? PAGE))));
  if (q.offset && q.offset > 0) p.set('offset', String(Math.floor(q.offset)));
  return `/json/stations/search?${p}`;
}

export class DirectoryError extends Error { constructor(msg: string, readonly retry: boolean) { super(msg); } }
export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
let good = 0; // the server that answered last is asked first
/** the directory's answer at `path`: each server in turn (one that does not answer, times out or fails inside is skipped) */
export async function directory(path: string, o: { fetch?: Fetcher; signal?: AbortSignal; timeout?: number } = {}): Promise<unknown> {
  const f: Fetcher = o.fetch ?? ((u, i) => fetch(u, { ...i, credentials: 'omit', referrerPolicy: 'no-referrer' }));
  const order = [...SERVERS.slice(good), ...SERVERS.slice(0, good)];
  for (const host of order) {
    if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), o.timeout ?? 8000);
    const stop = () => ac.abort();
    o.signal?.addEventListener('abort', stop);
    try {
      const r = await f(`https://${host}${path}`, { signal: ac.signal });
      if (r.status >= 500) continue; // that server is in trouble: the next one
      if (!r.ok) throw new DirectoryError(`the station directory answered HTTP ${r.status}`, false);
      const j = await r.json();
      good = SERVERS.indexOf(host);
      return j;
    } catch (e) {
      if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); // a newer search: this one is not wanted
      if (e instanceof DirectoryError) throw e;
      // no connection, a time-out, an answer that is no JSON: the next server
    } finally { clearTimeout(t); o.signal?.removeEventListener('abort', stop); }
  }
  throw new DirectoryError('The station directory (radio-browser.info) could not be reached — no connection, or its servers are down. Try again in a moment.', true);
}
/** stations of several searches at once, merged (the same station once), the most listened first; `more`: a search gave a whole page
 *  (the directory may have more) */
export async function searchAll(qs: Query[], o: { fetch?: Fetcher; signal?: AbortSignal } = {}): Promise<{ stations: Station[]; more: boolean }> {
  const lists = await Promise.all(qs.map((q) => directory(searchPath(q), o)));
  const all = stationsOf(lists.flat());
  const more = lists.some((l, i) => Array.isArray(l) && l.length >= Math.max(1, Math.min(500, qs[i].limit ?? PAGE)));
  return { stations: qs.length > 1 ? all.sort((a, b) => b.clicks - a.clicks || b.votes - a.votes) : all, more };
}
/** a quick pick's stations: one search a page at a time (`offset`), or several merged at once (no more pages) */
export async function pickStations(p: QuickPick, offset: number, o: { fetch?: Fetcher; signal?: AbortSignal } = {}): Promise<{ stations: Station[]; more: boolean }> {
  const many = p.queries.length > 1;
  const r = await searchAll(p.queries.map((q) => ({ ...q, limit: many ? 100 : PAGE, offset: many ? 0 : offset })), o);
  return { stations: p.match ? r.stations.filter((s) => p.match!.test(s.name)) : r.stations, more: !many && r.more };
}
/** the directory's current entries of these stations (a favourite's address may have changed since it was kept) */
export async function stationsById(ids: readonly string[], o: { fetch?: Fetcher; signal?: AbortSignal } = {}): Promise<Station[]> {
  const out: Station[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50).filter((id) => UUID.test(id));
    if (part.length) out.push(...stationsOf(await directory(`/json/stations/byuuid?uuids=${part.join(',')}`, o)));
  }
  return out;
}

export interface Country { cc: string; name: string; stations: number }
/** the countries with stations, the most stations first — India at the top (the owner lives there); names in English as the browser's
 *  Intl gives them, else the directory's */
export function countriesOf(v: unknown, names?: (cc: string) => string | undefined): Country[] {
  if (!Array.isArray(v)) return [];
  const out = new Map<string, Country>();
  for (const r of v) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>, cc = String(o.iso_3166_1 ?? '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) continue;
    const n = count(o.stationcount), had = out.get(cc);
    out.set(cc, { cc, name: names?.(cc) || clean(o.name, 100) || cc, stations: n + (had?.stations ?? 0) });
  }
  return [...out.values()].sort((a, b) => (a.cc === 'IN' ? -1 : b.cc === 'IN' ? 1 : b.stations - a.stations || a.name.localeCompare(b.name)));
}
export interface Named { value: string; name: string; stations: number }
/** languages or tags as the directory lists them (lower case) — shown with a capital */
export function namedOf(v: unknown, min = 1): Named[] {
  if (!Array.isArray(v)) return [];
  const out: Named[] = [], seen = new Set<string>();
  for (const r of v) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>, value = clean(o.name, 60).toLowerCase(), n = count(o.stationcount);
    if (!value || n < min || seen.has(value) || !/\p{L}/u.test(value)) continue;
    seen.add(value);
    out.push({ value, name: value.replace(/(^|[\s-])(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase()), stations: n });
  }
  return out;
}

// ------------------------------------------------------------------ the quick picks
export interface QuickPick { id: string; name: string; queries: Query[]; /** only the stations whose name this matches */ match?: RegExp }
/** India first (the owner's wish): its most listened, All India Radio — whose 50-odd streams are named AIR, Akashvani, Vividh Bharati
 *  … —, news, devotional, film songs, classical; then the world's most listened. Searches of one pick are merged. */
export const PICKS: QuickPick[] = [
  { id: 'india', name: 'India — most listened', queries: [{ cc: 'IN' }] },
  // the directory's name search finds the words anywhere ("AIR " in "Fair FM"): the names are checked again
  { id: 'air', name: 'All India Radio', queries: ['All India Radio', 'Akashvani', 'Aakashvani', 'Vividh Bharati', 'Vividh Bharti', 'AIR '].map((name) => ({ cc: 'IN', name })), match: /\b(all india radio|a+kashvani|vividh bhara?ti)\b|(?<!\bon\s)\bair\b/i },
  { id: 'in-news', name: 'Indian news', queries: ['news', 'news talk'].map((tag) => ({ cc: 'IN', tag })) },
  { id: 'in-devotional', name: 'Devotional', queries: ['devotional', 'spiritual', 'bhakti', 'mantra', 'religious'].map((tag) => ({ cc: 'IN', tag })) },
  { id: 'bollywood', name: 'Bollywood', queries: [{ tag: 'bollywood' }] },
  { id: 'in-classical', name: 'Indian classical', queries: ['classical', 'carnatic', 'hindustani classical'].map((tag) => ({ cc: 'IN', tag })) },
  { id: 'world', name: 'World — most listened', queries: [{}] },
];

// ------------------------------------------------------------------ playing
/** the MIME type a browser is asked about for a codec the directory names ('' = unknown: tried) */
export function codecMime(codec: string, hls: boolean): string {
  if (hls) return 'application/vnd.apple.mpegurl';
  const c = codec.toUpperCase();
  if (c === 'MP3') return 'audio/mpeg';
  if (c === 'AAC' || c === 'AAC+' || c === 'AACP' || c === 'HE-AAC') return 'audio/aac';
  if (c === 'OGG' || c === 'VORBIS') return 'audio/ogg; codecs="vorbis"';
  if (c === 'OPUS') return 'audio/ogg; codecs="opus"';
  if (c === 'FLAC') return 'audio/flac';
  if (c === 'WMA') return 'audio/x-ms-wma';
  return '';
}
/** an address this page can ask for: a secure page plays no plain-HTTP sound, so http:// is asked for as https:// (as Chrome would do
 *  itself) — `upgraded` says so, for the reason when it fails */
export function streamUrl(url: string): { src: string; upgraded: boolean } {
  const http = /^http:\/\//i.test(url);
  return { src: http ? url.replace(/^http:\/\//i, 'https://') : url, upgraded: http };
}
export const isWebStream = (url: string) => /^https?:\/\/[^\s/]/i.test(url);

/** why a station did not play — in the words the tab shows (the owner: "the reason is said, never a silent failure") */
export const REASON = {
  notWeb: 'its address is not a web stream (rtsp:, mms: …) — a browser cannot play it',
  format: (codec: string) => `this browser cannot play its kind of stream (${codec && codec !== 'UNKNOWN' ? codec : 'its format'})`,
  hls: 'its stream is HLS, which this browser cannot play',
  http: 'it streams only over plain HTTP, which a secure page such as this one cannot play — or it is off the air',
  offline: 'its server did not send the stream — it is off the air, or it refused',
  broken: (checked: string) => `it is off the air — the directory could not reach it either${checked ? ` (checked ${checked.slice(0, 10)})` : ''}`,
  stopped: 'the stream stopped and did not come back',
  blocked: 'the browser wants a tap before it plays sound — press Play',
} as const;

// ------------------------------------------------------------------ small things the list shows
/** the first letter of the name, as a reader sees it (a station's logo would come from its own server: a letter instead) */
export function letterOf(name: string): string {
  const s = name.replace(/^[^\p{L}\p{N}]+/u, '');
  const first = Array.from(s)[0] ?? '?';
  return first.toLocaleUpperCase('en');
}
/** a country's flag: two regional indicator letters (Windows shows the letters) */
export const flagOf = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
/** "MP3 · 128 kbps" */
export const formatOf = (s: Pick<Station, 'codec' | 'bitrate' | 'hls'>) => [s.hls && s.codec !== 'HLS' ? 'HLS' : '', s.codec !== 'UNKNOWN' ? s.codec : '', s.bitrate ? `${s.bitrate} kbps` : ''].filter(Boolean).join(' · ');
/** a hue for the letter's circle, the same for the same name */
export function hueOf(name: string): number { let x = 0; for (const c of name) x = (x * 31 + c.codePointAt(0)!) >>> 0; return x % 360; }
