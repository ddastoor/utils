// The Settings (to-do #39; owner, 27 – 28 Nov 2026: "the storage for all the settings in the settings page should be in the browser. Each
// app should have, if necessary, … a section of that app in the settings page … when I change something in the settings page, it should
// be reflected in the browser storage, and then … in that part of the app that requires it. And the other way around … whenever something
// is changed in the overall consolidated settings, a new settings file should be immediately downloaded to the local device").
// One store: this browser's localStorage. Each section is what one app keeps — Favorites, the folded list of apps, and the apps the owner
// chose on 28 Nov 2026 (the speech apps' voice and speed, the EPUB Reader's look, the Spell Checker's language and words, the World
// Clock's cities) and World Radio's favourite stations (owner, 28 Nov 2026). A change in an app, on the Settings page or by an import changes the store and every view of it (other open tabs of
// the site too: the storage event); a change made in this tab — not one heard from another — writes a settings file a moment after the
// last of a burst (src/lib/settingsfile.ts, fetched then). Nothing leaves the device. Small on purpose: it is part of the start page.
import { favs, setFavs, onFavChange } from './favorites';
import { appListFolded, setAppListFolded, onAppListChange } from './applist';
import { TOOL_BY_ID } from './registry';

export interface SettingsSection {
  /** the key in the file ('favorites') */ id: string;
  /** the section's heading ('Favorites') */ title: string;
  /** the value as the file holds it */ get(): unknown;
  /** a value read from a file put in its place; returns what was left out, in words */ put(v: unknown): string[];
  /** told of every change: `local` when it was made in this tab */ on(f: (local: boolean) => void): void;
}
const sections: SettingsSection[] = [];
const subs = new Set<(id: string, local: boolean) => void>();
/** a change kept in the browser without a settings file of its own (the EPUB Reader's place as the pages turn: it goes into the next
 *  file and into Export) */
let quiet = false;
export const settingsSections = (): readonly SettingsSection[] => sections;
/** every change of any section: its id, and whether it was made in this tab */
export function onSettings(f: (id: string, local: boolean) => void) { subs.add(f); return () => { subs.delete(f); }; }
window.addEventListener('storage', (e) => { if (e.key === DEVICE) subs.forEach((f) => f('device', false)); });
function add(s: SettingsSection) {
  sections.push(s);
  s.on((local) => { subs.forEach((f) => f(s.id, local)); if (local && !quiet) changed(); });
}

// ------------------------------------------------------------------ the file after every change
export const SETTINGS_FORMAT = 1;
export interface SettingsFile { app: 'SuperUtils'; kind: 'settings'; format: number; saved: string; settings: Record<string, unknown> }
export function snapshot(now = new Date()): SettingsFile {
  return { app: 'SuperUtils', kind: 'settings', format: SETTINGS_FORMAT, saved: localIso(now), settings: Object.fromEntries(sections.map((s) => [s.id, s.get()])) };
}
/** "2026-11-28T10:42:07+05:30": the time as the device shows it, with its offset */
export function localIso(d: Date): string {
  const p = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0'), o = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${o < 0 ? '-' : '+'}${p(Math.trunc(o / 60))}:${p(o % 60)}`;
}
/** this device's own: whether a file is written after every change (not in the file — it is how this device keeps them) */
const DEVICE = 'superutils.settings.v1';
let autoMem: boolean | null = null; // where the browser refuses to store it (private mode): for this visit
export function autoSave(): boolean {
  if (autoMem !== null) return autoMem;
  try { return (JSON.parse(localStorage.getItem(DEVICE) || '{}') as { autoSave?: boolean }).autoSave !== false; } catch { return true; }
}
export function setAutoSave(on: boolean) {
  try { localStorage.setItem(DEVICE, JSON.stringify({ autoSave: on })); autoMem = null; } catch { autoMem = on; }
  if (!on) clearTimeout(timer);
  subs.forEach((f) => f('device', true));
}
/** how the last file went (the Settings page shows it) */
export let lastFile: { name: string; where: 'folder' | 'download'; at: number; error?: string } | null = null;
const fileSubs = new Set<() => void>();
export function onFileSaved(f: () => void) { fileSubs.add(f); return () => { fileSubs.delete(f); }; }
let timer = 0;
/** milliseconds after the last of a burst of changes (a slider dragged) before the file is written */
export const SETTLE_MS = 1500;
function changed() {
  if (!autoSave()) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => { void saveNow(); }, SETTLE_MS);
}
/** write the settings file now (the folder chosen, else a download) */
export async function saveNow(): Promise<void> {
  clearTimeout(timer);
  try {
    const m = await import('./lib/settingsfile');
    const r = await m.writeSettingsFile(snapshot());
    lastFile = { ...r, at: Date.now() };
  } catch (e) {
    lastFile = { name: '', where: 'download', at: Date.now(), error: e instanceof Error ? e.message : String(e) };
  }
  fileSubs.forEach((f) => f());
}

// ------------------------------------------------------------------ an app's section: one JSON object under its own key
export interface AppSettings<T extends object> {
  get(): T;
  /** change some fields (made in this tab: a file follows) */ set(patch: Partial<T>): void;
  /** change some fields without a settings file of their own (they go into the next file) */ setQuietly(patch: Partial<T>): void;
  on(f: (local: boolean) => void): () => void;
}
/** `check` turns whatever was stored or read from a file into a valid value (unknown fields dropped, defaults filled in) and names what it
 *  left out */
function appSection<T extends object>(id: string, title: string, check: (v: unknown, notes: string[]) => T): AppSettings<T> {
  const key = `superutils.app.${id}.v1`;
  const ls = new Set<(local: boolean) => void>();
  let cache: T | null = null;
  const read = (): T => {
    if (cache) return cache;
    let raw: unknown = null;
    try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch { raw = null; }
    return (cache = check(raw, []));
  };
  const write = (v: T, local: boolean) => {
    cache = v;
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode or full: kept for this visit */ }
    ls.forEach((f) => f(local));
  };
  window.addEventListener('storage', (e) => { if (e.key === key || e.key === null) { cache = null; ls.forEach((f) => f(false)); } });
  add({ id, title, get: () => read(), put: (v) => { const notes: string[] = []; write(check(v, notes), true); return notes; }, on: (f) => { ls.add(f); } });
  return {
    get: () => ({ ...read() }),
    set: (patch) => write(check({ ...read(), ...patch }, []), true),
    setQuietly: (patch) => { quiet = true; try { write(check({ ...read(), ...patch }, []), true); } finally { quiet = false; } },
    on: (f) => { ls.add(f); return () => { ls.delete(f); }; },
  };
}

// ------------------------------------------------------------------ checks
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d: string, max = 200) => (typeof v === 'string' && v.length <= max ? v : d);
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <K extends string | number>(v: unknown, d: K, all: readonly K[]) => (all.includes(v as K) ? (v as K) : d);
const strs = (v: unknown, max: number, each = 100) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= each))].slice(0, max) : [];

// ------------------------------------------------------------------ the sections
// Favorites and the folded list of apps keep their own keys (they were stored before the Settings existed)
add({
  id: 'favorites', title: 'Favorites',
  get: () => favs(),
  put: (v) => {
    if (!Array.isArray(v)) return ['Favorites: not a list — left as they were'];
    const ids = strs(v, 500), left = ids.filter((id) => !TOOL_BY_ID.has(id));
    setFavs(ids.filter((id) => TOOL_BY_ID.has(id)));
    return left.length ? [`Favorites: ${left.length} app${left.length === 1 ? '' : 's'} this site does not have left out (${left.slice(0, 5).join(', ')}${left.length > 5 ? ' …' : ''})`] : [];
  },
  on: (f) => { onFavChange(f); },
});
add({
  id: 'applist', title: 'The list of apps',
  get: () => ({ folded: appListFolded() }),
  put: (v) => { setAppListFolded(isObj(v) && v.folded === true); return []; },
  on: (f) => { onAppListChange(f); },
});

/** the speech apps' voices: ids of the Kokoro and Piper voices, or "sys:<n>" for one of the device's own (looked up by the app) */
const voiceId = (v: unknown, d: string) => (typeof v === 'string' && v.length > 0 && v.length <= 120 && !/[\u0000-\u001f]/.test(v) ? v : d);
export const ttsSettings = appSection('tts', 'Text-to-Speech', (v) => {
  const o = isObj(v) ? v : {};
  return { voice: voiceId(o.voice, 'af_heart'), speed: num(o.speed, 1, 0.5, 2) };
});
/** the Camera Reader's text sizes, px */
export const CAMREADER_SIZES = [18, 20, 24, 28, 34, 40] as const;
export const camreaderSettings = appSection('camreader', 'Camera Reader', (v) => {
  const o = isObj(v) ? v : {};
  return { voice: voiceId(o.voice, 'af_heart'), speed: oneOf(o.speed, '1', ['0.8', '1', '1.2'] as const), size: oneOf(o.size, 24, CAMREADER_SIZES), auto: bool(o.auto, true) };
});
export const audiobookSettings = appSection('audiobook', 'PDF / EPUB → Audiobook', (v) => {
  const o = isObj(v) ? v : {};
  return { voice: voiceId(o.voice, 'af_heart'), speed: num(o.speed, 1, 0.5, 2), kbps: oneOf(o.kbps, 64, [48, 64, 96] as const) };
});
export const EBOOK_FONTS = ['literata', 'serif', 'sans', 'book'] as const;
export const EBOOK_THEMES = ['light', 'sepia', 'dark', 'black'] as const;
/** A book the EPUB Reader remembers (to-do #40): its file's hash (XXH128, 32 hex digits), its title and author, and its place — the first
 *  words of the page and their share of the book, which are found again in any layout, with the page as it was laid out then — and when
 *  it was last read (ms). */
export interface RememberedBook { hash: string; title: string; author: string; anchor: string; share: number; page: number; pages: number; at: number }
/** every book the reader is asked to remember stays until it is forgotten; this many at most (each is a few hundred bytes) */
export const EBOOK_BOOKS_MAX = 1000;
const int = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '');
function booksOf(v: unknown, notes: string[]): RememberedBook[] {
  if (!Array.isArray(v)) return [];
  const byHash = new Map<string, RememberedBook>();
  let bad = 0;
  for (const b of v) {
    if (!isObj(b) || typeof b.hash !== 'string' || !/^[0-9a-f]{32}$/.test(b.hash)) { bad++; continue; }
    const pages = int(b.pages, 1, 1, 1e6);
    const book: RememberedBook = {
      hash: b.hash, title: text(b.title, 300) || 'A book', author: text(b.author, 200), anchor: text(b.anchor, 400),
      share: num(b.share, 0, 0, 1), page: Math.min(pages - 1, int(b.page, 0, 0, 1e6)), pages, at: num(b.at, 0, 0, 1e14),
    };
    const had = byHash.get(book.hash);
    if (!had || book.at >= had.at) byHash.set(book.hash, book);
  }
  if (bad) notes.push(`EPUB Reader: ${bad} remembered book${bad === 1 ? '' : 's'} that could not be read left out`);
  return [...byHash.values()].sort((a, b) => b.at - a.at).slice(0, EBOOK_BOOKS_MAX);
}
export const EBOOK_SPEEDS = ['0.8', '1', '1.2'] as const;
export const ebookSettings = appSection('ebook', 'EPUB Reader', (v, notes) => {
  const o = isObj(v) ? v : {};
  // null: not chosen yet — the reader's own default for the device (phone or PC, the system's light or dark)
  const n = <K>(x: unknown, f: (x: unknown) => K) => (x === null || x === undefined ? null : f(x));
  return {
    font: oneOf(o.font, 'literata', EBOOK_FONTS),
    size: n(o.size, (x) => num(x, 20, 12, 42)),
    line: num(o.line, 1.5, 0, 2),
    justify: n(o.justify, (x) => bool(x, true)),
    theme: n(o.theme, (x) => oneOf(x, 'light', EBOOK_THEMES)),
    publisher: bool(o.publisher, true),
    margin: oneOf(o.margin, 'normal', ['narrow', 'normal', 'wide'] as const),
    spread: oneOf(o.spread, 'auto', ['auto', 'one', 'two'] as const),
    // the books it remembers, and the voice its ▷ reads with (null: not chosen yet — asked the first time)
    books: booksOf(o.books, notes),
    voice: n(o.voice, (x) => voiceId(x, 'af_heart')),
    speed: oneOf(o.speed, '1', EBOOK_SPEEDS),
  };
});
export const SPELL_LANGS = ['en-US', 'en-GB', 'en-IN'] as const;
export const spellSettings = appSection('spell', 'Spell Checker', (v, notes) => {
  const o = isObj(v) ? v : {};
  const added = strs(o.added, 5000, 60).filter((w) => /^[\p{L}\p{M}'’.-]+$/u.test(w));
  if (Array.isArray(o.added) && added.length < o.added.length) notes.push(`Spell Checker: ${o.added.length - added.length} added word${o.added.length - added.length === 1 ? '' : 's'} that are no words left out`);
  return { lang: n2(o.lang, (x) => oneOf(x, 'en-US', SPELL_LANGS)), added };
});
export const worldclockSettings = appSection('worldclock', 'World Clock', (v) => {
  const o = isObj(v) ? v : {};
  return { cities: o.cities === null || o.cities === undefined ? null : strs(o.cities, 100, 80), h24: o.h24 === null || o.h24 === undefined ? null : bool(o.h24, false) };
});
function n2<K>(x: unknown, f: (x: unknown) => K): K | null { return x === null || x === undefined ? null : f(x); }
/** a favourite station of World Radio (potentials #116; owner, 28 Nov 2026: "You should remember my favorite stations … the settings
 *  page will have the world radio section in it"): what plays and shows it without the directory */
export interface RadioFav { id: string; name: string; url: string; cc: string; country: string; lang: string; codec: string; bitrate: number; hls: boolean; homepage: string; tags: string }
export const RADIO_FAVS_MAX = 500;
const RADIO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function radioFavsOf(v: unknown, notes: string[]): RadioFav[] {
  if (!Array.isArray(v)) return [];
  const out: RadioFav[] = [], seen = new Set<string>();
  let bad = 0;
  for (const s of v) {
    const url = isObj(s) ? text(s.url, 2000) : '';
    if (!isObj(s) || typeof s.id !== 'string' || !RADIO_ID.test(s.id) || !/^https?:\/\/\S+$/i.test(url) || !text(s.name, 200).trim()) { bad++; continue; }
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({
      id: s.id, name: text(s.name, 200).trim(), url, cc: typeof s.cc === 'string' && /^[A-Z]{2}$/.test(s.cc) ? s.cc : '', country: text(s.country, 100), lang: text(s.lang, 160),
      codec: text(s.codec, 24) || 'UNKNOWN', bitrate: int(s.bitrate, 0, 0, 100000), hls: s.hls === true, homepage: /^https?:\/\/\S+$/i.test(text(s.homepage, 2000)) ? text(s.homepage, 2000) : '', tags: text(s.tags, 300),
    });
  }
  if (bad) notes.push(`World Radio: ${bad} favourite station${bad === 1 ? '' : 's'} that could not be read left out`);
  return out.slice(0, RADIO_FAVS_MAX);
}
export const worldradioSettings = appSection('worldradio', 'World Radio', (v, notes) => {
  const o = isObj(v) ? v : {};
  // keep: the station plays on while another app of the site is open (a small player in the shell)
  return { favourites: radioFavsOf(o.favourites, notes), keep: bool(o.keep, false), volume: num(o.volume, 0.8, 0, 1) };
});

/** a file's settings put in place: the sections it holds replace what is stored; returns what was done and left out, in words */
export function importSettings(file: unknown): { done: string[]; notes: string[] } {
  if (!isObj(file) || file.app !== 'SuperUtils' || file.kind !== 'settings' || !isObj(file.settings)) throw new Error('This is not a SuperUtils settings file.');
  if (typeof file.format === 'number' && file.format > SETTINGS_FORMAT) throw new Error('This settings file was made by a newer version of SuperUtils — reload the page and import it again.');
  const done: string[] = [], notes: string[] = [];
  for (const s of sections) if (s.id in file.settings) { notes.push(...s.put(file.settings[s.id])); done.push(s.title); }
  for (const id of Object.keys(file.settings)) if (!sections.some((s) => s.id === id)) notes.push(`“${id}”: not a section of this version — left out`);
  return { done, notes };
}
